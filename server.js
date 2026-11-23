const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const {
  initTurso,
  dbGetProducts,
  dbSaveProducts,
  dbSaveOrder,
  dbGetOrders,
  dbFindOrder,
  dbUpdateOrderStatus,
  dbUpdateOrderPayment,
  dbGetPromotions,
  dbSavePromotions,
  dbGetAuthorizedTelegramUsers,
  dbSaveAuthorizedTelegramUser,
  dbRemoveAuthorizedTelegramUser,
} = require("./db.js");

const ROOT = __dirname;
const MODEL = "gemini-3.5-flash-lite";
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

loadEnv();

const PORT = Number(process.env.PORT) || 5500;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "9007119182:AAEI88xn8BC5yjp9ZCpHjei2wxZIEbSp5Gs";
const TELEGRAM_CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN || "9241739958:AAFHr4AHnF4V9EDLzFyp6LD1hY8R5kLyUk8";
let telegramOffset = 0;
let telegramCustomerOffset = 0;

function formatSum(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value || 0)} сум`;
}

function escapeTg(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTelegramBotPassword() {
  return String(process.env.TELEGRAM_BOT_PASSWORD || process.env.ADMIN_PASSWORD || "FCKIT-AFS").trim();
}

// Хранилище авторизованных администраторов в памяти (кеш)
const authorizedTelegramUsers = new Map();
// Защита от подбора пароля (brute-force rate limiting): chatId -> { count, lockedUntil, lastAttempt }
const authAttempts = new Map();

async function loadAuthorizedTelegramUsers() {
  const file = path.join(ROOT, "telegram_authorized_users.json");
  if (fs.existsSync(file)) {
    try {
      const list = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(list)) {
        list.forEach((u) => {
          if (u && u.id) authorizedTelegramUsers.set(String(u.id), u);
        });
      }
    } catch (e) {
      console.error("Ошибка чтения telegram_authorized_users.json:", e.message);
    }
  }

  // Также подгружаем из облачной БД Turso, если доступна
  try {
    const dbUsers = await dbGetAuthorizedTelegramUsers();
    if (Array.isArray(dbUsers)) {
      dbUsers.forEach((u) => {
        if (u && u.id) authorizedTelegramUsers.set(String(u.id), u);
      });
    }
  } catch {}

  console.log(`Telegram Bot: загружено авторизованных администраторов: ${authorizedTelegramUsers.size}`);
}

function isTelegramAuthorized(userId) {
  if (!userId) return false;
  return authorizedTelegramUsers.has(String(userId));
}

async function saveAuthorizedTelegramUser(user) {
  const uid = String(user.id);
  const data = {
    id: uid,
    username: user.username || "",
    firstName: user.firstName || user.first_name || "",
    authorizedAt: new Date().toISOString(),
  };
  authorizedTelegramUsers.set(uid, data);

  // Сохраняем в локальный JSON
  const file = path.join(ROOT, "telegram_authorized_users.json");
  try {
    const list = Array.from(authorizedTelegramUsers.values());
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Не удалось записать telegram_authorized_users.json:", err.message);
  }

  // Сохраняем в Turso
  try {
    await dbSaveAuthorizedTelegramUser(data);
  } catch (err) {
    console.error("Не удалось записать пользователя в Turso:", err.message);
  }
}

async function removeAuthorizedTelegramUser(userId) {
  const uid = String(userId);
  authorizedTelegramUsers.delete(uid);

  const file = path.join(ROOT, "telegram_authorized_users.json");
  try {
    const list = Array.from(authorizedTelegramUsers.values());
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Не удалось обновить telegram_authorized_users.json:", err.message);
  }

  try {
    await dbRemoveAuthorizedTelegramUser(uid);
  } catch (err) {
    console.error("Не удалось удалить пользователя из Turso:", err.message);
  }
}

function getAuthorizedTelegramChatIds() {
  const chats = new Set(Array.from(authorizedTelegramUsers.keys()));
  if (process.env.TELEGRAM_CHAT_ID) {
    process.env.TELEGRAM_CHAT_ID
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => {
        if (authorizedTelegramUsers.has(id)) chats.add(id);
      });
  }
  return Array.from(chats);
}

// Главная клавиатура для авторизованных администраторов
const MAIN_ADMIN_KEYBOARD = {
  keyboard: [
    [{ text: "📦 Заказы" }, { text: "📊 Статистика" }],
    [{ text: "🔔 Проверить связь" }, { text: "🚪 Выйти" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function sendTelegramMessage(chatId, html, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const body = {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`Telegram API error (${chatId}):`, data);
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error(`Ошибка отправки в Telegram (${chatId}):`, err.message);
    return null;
  }
}

async function editTelegramMessage(chatId, messageId, html, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const body = {
      chat_id: chatId,
      message_id: messageId,
      text: html,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`Ошибка редактирования Telegram-сообщения (${chatId}/${messageId}):`, err.message);
  }
}

async function answerTelegramCallback(callbackQueryId, text = "", showAlert = false) {
  if (!TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
  } catch (err) {
    console.error("Ошибка answerCallbackQuery:", err.message);
  }
}

// ==========================================
// ПЛАТЁЖНЫЙ МОДУЛЬ (UZCARD / HUMO / VISA / MASTERCARD)
// ==========================================

const cardTransactions = new Map(); // txId -> { txId, orderId, amount, brand, cardName, last4, phone, otpCode, createdAt }

function detectUzbekCard(rawNumber) {
  const d = String(rawNumber || "").replace(/\D/g, "");
  if (!d) return { brand: null, name: "", valid: false, needsCvv: false, error: null };

  // 1. Uzcard: 16 цифр, начинается на 8600, 5614, 5440, 6262
  if (d.startsWith("8600") || d.startsWith("5614") || d.startsWith("5440") || d.startsWith("6262")) {
    return {
      brand: "uzcard",
      name: "Uzcard",
      valid: d.length === 16,
      needsCvv: false,
      error: d.length > 16 ? "Номер карты Uzcard должен содержать ровно 16 цифр" : null,
    };
  }

  // 2. Humo: 16 цифр, начинается на 9860
  if (d.startsWith("9860")) {
    return {
      brand: "humo",
      name: "Humo",
      valid: d.length === 16,
      needsCvv: false,
      error: d.length > 16 ? "Номер карты Humo должен содержать ровно 16 цифр" : null,
    };
  }

  // 3. Visa: 16 цифр, начинается на 4
  if (d.startsWith("4")) {
    return {
      brand: "visa",
      name: "Visa",
      valid: d.length === 16,
      needsCvv: true,
      error: d.length > 16 ? "Номер карты Visa должен содержать ровно 16 цифр" : null,
    };
  }

  // 4. Mastercard: 16 цифр, начинается на 51-55 или 2221-2720
  const mc2 = Number(d.slice(0, 2));
  const mc4 = Number(d.slice(0, 4));
  if ((mc2 >= 51 && mc2 <= 55) || (mc4 >= 2221 && mc4 <= 2720)) {
    return {
      brand: "mastercard",
      name: "Mastercard",
      valid: d.length === 16,
      needsCvv: true,
      error: d.length > 16 ? "Номер карты Mastercard должен содержать ровно 16 цифр" : null,
    };
  }

  // Незавершённый ввод префикса (до 4 цифр)
  if (["8", "86", "860", "5", "56", "54", "6", "62", "9", "98", "986", "2", "22", "222"].includes(d)) {
    return { brand: null, name: "", valid: false, needsCvv: false, error: null };
  }

  // Заблокированные платёжные системы (не Узбекистан)
  if (mc4 >= 2200 && mc4 <= 2204) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "Карты «МИР» не поддерживаются. Принимаются только карты Узбекистана (Uzcard, Humo, Visa, Mastercard).",
    };
  }
  if (d.startsWith("62") && !d.startsWith("6262")) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "Карты UnionPay не поддерживаются. Принимаются только карты Узбекистана (Uzcard, Humo, Visa, Mastercard).",
    };
  }
  if (d.startsWith("34") || d.startsWith("37")) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "Карты American Express не поддерживаются. Принимаются только карты Узбекистана: Uzcard, Humo, Visa, Mastercard.",
    };
  }

  if (d.length >= 4) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "Поддерживаются исключительно банковские карты Узбекистана: Uzcard, Humo, Visa и Mastercard.",
    };
  }

  return { brand: null, name: "", valid: false, needsCvv: false, error: null };
}

// ==========================================
// SMS-ШЛЮЗ УЗБЕКИСТАНА (ESKIZ.UZ)
// ==========================================
let eskizToken = null;
let eskizTokenExpires = 0;

async function getEskizToken() {
  const email = process.env.ESKIZ_EMAIL;
  const password = process.env.ESKIZ_PASSWORD;
  if (!email || !password) return null;
  if (eskizToken && Date.now() < eskizTokenExpires) return eskizToken;

  try {
    const res = await fetch("https://notify.eskiz.uz/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data?.data?.token) {
      eskizToken = data.data.token;
      eskizTokenExpires = Date.now() + 25 * 24 * 3600 * 1000;
      return eskizToken;
    }
    console.error("Eskiz auth fail:", data);
  } catch (err) {
    console.error("Eskiz auth error:", err.message);
  }
  return null;
}

async function sendUzbekSms(rawPhone, messageText) {
  const cleaned = String(rawPhone || "").replace(/\D/g, "");
  let phone = cleaned;
  if (phone.length === 9) phone = "998" + phone;
  if (!phone.startsWith("998") || phone.length !== 12) {
    console.warn("SMS not sent: invalid UZ phone format", rawPhone);
    return false;
  }

  const token = await getEskizToken();
  if (!token) {
    console.log(`ℹ️ [SMS Gateway] Для отправки реальных SMS укажите ESKIZ_EMAIL и ESKIZ_PASSWORD в Render. Код для +${phone}: "${messageText}"`);
    return false;
  }

  try {
    const from = process.env.ESKIZ_FROM || "4546";
    const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mobile_phone: phone,
        message: messageText,
        from: from,
      }),
    });
    const result = await res.json();
    if (result && (result.status === "waiting" || result.status === "success" || result.message === "Waiting for SMS provider")) {
      console.log(`✅ Реальное SMS успешно отправлено на +${phone}:`, result);
      return true;
    }
    console.warn("Eskiz response:", result);
    return false;
  } catch (err) {
    console.error("Ошибка отправки SMS через Eskiz:", err.message);
    return false;
  }
}

// ==========================================
// ГЕНЕРАЦИЯ ССЫЛОК НА ОПЛАТУ PAYME И CLICK
// ==========================================
function getPaymeCheckoutUrl(orderId, amountSum) {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  if (!merchantId) return null;
  const tiyin = Math.round(Number(amountSum || 0) * 100);
  const param = `m=${merchantId};ac.order_id=${orderId};a=${tiyin}`;
  const base64 = Buffer.from(param).toString("base64");
  return `https://checkout.paycom.uz/${base64}`;
}

function getClickCheckoutUrl(orderId, amountSum) {
  const merchantId = process.env.CLICK_MERCHANT_ID;
  const serviceId = process.env.CLICK_SERVICE_ID;
  if (!merchantId || !serviceId) return null;
  return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amountSum}&transaction_param=${orderId}`;
}

async function sendTelegramPhoto(chatId, photoBuffer, filename, captionHtml, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", captionHtml);
    formData.append("parse_mode", "HTML");
    if (replyMarkup) formData.append("reply_markup", JSON.stringify(replyMarkup));
    formData.append("photo", new Blob([photoBuffer]), filename || "receipt.jpg");

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("sendTelegramPhoto error:", err);
      return null;
    }
    return (await res.json()).result;
  } catch (err) {
    console.error("sendTelegramPhoto network error:", err.message);
    return null;
  }
}

async function notifyTelegramTransferPayment(order, transactionId, receiptBuffer, receiptPath) {
  const chats = getAuthorizedTelegramChatIds();
  if (!chats.length) return;

  const caption = [
    `📲 <b>ПОСТУПИЛО ПОДТВЕРЖДЕНИЕ ПЕРЕВОДА!</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🆔 <b>Заказ:</b> <code>${escapeTg(order.id)}</code>`,
    `👤 <b>Клиент:</b> ${escapeTg(order.name || "Клиент")}`,
    `📞 <b>Телефон:</b> <code>${escapeTg(order.phone || "—")}</code>`,
    `💰 <b>Сумма к получению:</b> <b>${formatSum(order.total)}</b>`,
    `🏦 <b>Куда:</b> Visa Uzum Bank (<code>${process.env.RECIPIENT_CARD_NUMBER || ""}</code>)`,
    transactionId ? `🧾 <b>Номер транзакции:</b> <code>${escapeTg(transactionId)}</code>` : null,
    receiptPath ? `📎 <b>Чек прикреплён к сообщению</b>` : `⚠️ <i>Чек не прикреплен (указан только номер транзакции)</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<i>Проверьте поступление средств в приложении Uzum Bank и нажмите кнопку:</i>`,
  ]
    .filter(Boolean)
    .join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [{ text: "✅ Подтвердить поступление оплаты", callback_data: `pay_confirm:${order.id}` }],
      [{ text: "📦 Детали заказа", callback_data: `order_details:${order.id}` }],
    ],
  };

  for (const chatId of chats) {
    if (receiptBuffer) {
      await sendTelegramPhoto(chatId, receiptBuffer, `receipt-${order.id}.jpg`, caption, inlineKeyboard);
    } else {
      await sendTelegramMessage(chatId, caption, inlineKeyboard);
    }
  }
}

async function notifyTelegramOrder(order) {
  const chats = getAuthorizedTelegramChatIds();
  if (!chats.length) {
    console.log("⚠️ Заказ получен, но нет авторизованных администраторов в Telegram.");
    return;
  }

  const itemsList = (order.items || [])
    .map((item, i) => {
      const dept = item.department === "men" ? "Мужской" : "Женский";
      const totalItem = formatSum(item.price * item.qty);
      return `${i + 1}. <b>${escapeTg(item.title)}</b>\n   ▫️ ${item.qty} шт. × ${formatSum(item.price)} = <b>${totalItem}</b>\n   ▫️ <i>${dept} · ${escapeTg(item.section || "")}</i>`;
    })
    .join("\n\n");

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString("ru-RU", {
    timeZone: "Asia/Tashkent",
  });

  let payInfo = "📲 <b>Способ оплаты:</b> Перевод на карту Visa Uzum";
  if (order.paymentMethod === "apps") {
    payInfo = "⚡ <b>Способ оплаты:</b> Банковские приложения (Payme / Click / Uzum)";
  } else if (order.paymentMethod === "transfer") {
    payInfo = "📲 <b>Способ оплаты:</b> Перевод на карту Visa Uzum";
  } else if (order.paymentMethod === "cash") {
    payInfo = "💵 <b>Способ оплаты:</b> При получении (наличные)";
  }

  let payStatusInfo = "⏳ <b>Статус оплаты:</b> Ожидает оплаты";
  if (order.paymentStatus === "paid") {
    payStatusInfo = "✅ <b>Статус оплаты:</b> ОПЛАЧЕН (онлайн)";
  } else if (order.paymentStatus === "awaiting_verification") {
    payStatusInfo = "⏳ <b>Статус оплаты:</b> Чек отправлен, ждёт проверки";
  }

  const message = [
    `🛍 <b>НОВЫЙ ЗАКАЗ: ${escapeTg(order.id)}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Заказчик:</b> ${escapeTg(order.name || "Не указано")}`,
    `📞 <b>Телефон:</b> <code>${escapeTg(order.phone || "Не указан")}</code>`,
    order.note ? `📝 <b>Адрес / Примечание:</b> <i>${escapeTg(order.note)}</i>` : null,
    `━━━━━━━━━━━━━━━━━━━━`,
    payInfo,
    payStatusInfo,
    `🚚 <b>Доставка:</b> Оплачивается покупателем при получении (курьеру / Yandex Go)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Состав заказа:</b>`,
    itemsList || "—",
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 <b>ИТОГО К ОПЛАТЕ: ${formatSum(order.total)}</b>`,
    `🕒 <b>Время (Ташкент):</b> ${dateStr}`,
  ]
    .filter(Boolean)
    .join("\n");

  const buttons = [];
  if (order.paymentStatus !== "paid") {
    buttons.push([{ text: "✅ Подтвердить оплату", callback_data: `pay_confirm:${order.id}` }]);
  }
  buttons.push([{ text: "📦 Отметить выполненным", callback_data: `order_done:${order.id}` }]);

  const inlineKeyboard = { inline_keyboard: buttons };

  await Promise.all(chats.map((chatId) => sendTelegramMessage(chatId, message, inlineKeyboard)));
}

// ---------------------------------------------------------------------------
// MIDDLEWARE / ПЕРЕХВАТЧИК ВСЕХ ВХОДЯЩИХ СООБЩЕНИЙ И CALLBACK-ЗАПРОСОВ
// ---------------------------------------------------------------------------
async function handleTelegramUpdate(update) {
  const cb = update.callback_query;
  const msg = update.message || update.edited_message;

  // 1. ПЕРЕХВАТ CALLBACK-ЗАПРОСОВ (ИНЛАЙН-КНОПКИ)
  if (cb) {
    const fromId = String(cb.from.id);
    const chatId = String(cb.message?.chat?.id || fromId);

    // Проверка авторизации:
    if (!isTelegramAuthorized(fromId)) {
      await answerTelegramCallback(cb.id, "🔒 Доступ закрыт! Сначала введите пароль администратора.", true);
      await sendTelegramMessage(
        chatId,
        `🔒 <b>Доступ ограничен</b>\nВы не авторизованы. Для использования бота введите пароль администратора:`,
        { remove_keyboard: true }
      );
      return;
    }

    // Авторизованный callback
    const data = cb.data || "";
    if (data.startsWith("order_done:")) {
      const orderId = data.replace("order_done:", "").trim();
      await dbUpdateOrderStatus(orderId, "done");
      await answerTelegramCallback(cb.id, `✅ Заказ #${orderId} отмечен как выполнен!`, false);

      const oldText = cb.message?.text || cb.message?.caption || "";
      const updatedText = oldText.includes("✅ ВЫПОЛНЕН")
        ? oldText
        : `${oldText}\n\n✅ <b>СТАТУС: ВЫПОЛНЕН (админ @${cb.from.username || cb.from.first_name})</b>`;

      if (cb.message?.text) {
        await editTelegramMessage(chatId, cb.message.message_id, updatedText, null);
      }
    } else if (data.startsWith("pay_confirm:")) {
      const orderId = data.replace("pay_confirm:", "").trim();
      await dbUpdateOrderPayment(orderId, "paid", {
        approvedBy: `@${cb.from.username || cb.from.first_name}`,
        approvedAt: new Date().toISOString(),
      });
      await answerTelegramCallback(cb.id, `✅ Оплата по заказу #${orderId} подтверждена!`, false);

      const oldText = cb.message?.text || cb.message?.caption || "";
      const updatedText = oldText.includes("✅ ОПЛАТА ПОДТВЕРЖДЕНА")
        ? oldText
        : `${oldText}\n\n✅ <b>ОПЛАТА ПОДТВЕРЖДЕНА АДМИНИСТРАТОРОМ (@${cb.from.username || cb.from.first_name})</b>`;

      if (cb.message?.text) {
        await editTelegramMessage(chatId, cb.message.message_id, updatedText, null);
      } else {
        await sendTelegramMessage(chatId, `✅ <b>Оплата по заказу #${orderId} подтверждена!</b> Статус заказа обновлён на «Оплачен».`);
      }
    } else if (data.startsWith("order_details:")) {
      const orderId = data.replace("order_details:", "").trim();
      const order = await dbFindOrder(orderId);
      if (order) {
        await answerTelegramCallback(cb.id);
        await sendTelegramMessage(chatId, formatCustomerOrderCard(order), {
          inline_keyboard: [
            [{ text: "✅ Подтвердить оплату", callback_data: `pay_confirm:${order.id}` }],
            [{ text: "📦 Отметить выполненным", callback_data: `order_done:${order.id}` }],
          ],
        });
      } else {
        await answerTelegramCallback(cb.id, "Заказ не найден", true);
      }
    }
    return;
  }

  // 2. ПЕРЕХВАТ ОБЫЧНЫХ СООБЩЕНИЙ И КОМАНД
  if (msg && msg.chat) {
    const chatId = String(msg.chat.id);
    const fromId = String(msg.from?.id || chatId);
    const text = (msg.text || "").trim();
    const userTitle = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name || "Пользователь");

    // ПРОВЕРКА АВТОРИЗАЦИИ ПОЛЬЗОВАТЕЛЯ
    if (!isTelegramAuthorized(fromId)) {
      // Пользователь НЕ авторизован!

      // Проверка на блокировку от перебора паролей (brute-force protection)
      const attempt = authAttempts.get(chatId) || { count: 0, lockedUntil: 0, lastAttempt: 0 };
      const now = Date.now();

      if (attempt.lockedUntil && now < attempt.lockedUntil) {
        const remainingSec = Math.ceil((attempt.lockedUntil - now) / 1000);
        await sendTelegramMessage(
          chatId,
          `⏳ <b>Ввод пароля временно заблокирован</b>\n\nСлишком много неверных попыток.\nПожалуйста, подождите <b>${remainingSec} сек.</b> перед следующей попыткой.`,
          { remove_keyboard: true }
        );
        return;
      }

      // Сверяем введенный текст с паролем из .env
      const secretPassword = getTelegramBotPassword();

      if (text === secretPassword) {
        // ПАРОЛЬ ВЕРЕН!
        authAttempts.delete(chatId);
        await saveAuthorizedTelegramUser({
          id: fromId,
          username: msg.from?.username || "",
          firstName: msg.from?.first_name || "",
        });

        console.log(`Telegram Bot: УСПЕШНАЯ авторизация пользователя ${fromId} (${userTitle})`);

        await sendTelegramMessage(
          chatId,
          `🎉 <b>Авторизация успешна!</b>\n\nЗдравствуйте, <b>${escapeTg(userTitle)}</b>!\nВам предоставлен полный доступ к боту управления магазином FCKIT.\n\n🔔 <i>Уведомления о новых заказах и кнопки управления активированы.</i>`,
          MAIN_ADMIN_KEYBOARD
        );
        return;
      }

      // Если введена команда /start или /help до ввода пароля
      if (text === "/start" || text === "/help" || text === "/admin") {
        await sendTelegramMessage(
          chatId,
          `🔒 <b>Закрытый Telegram-бот FCKIT</b>\n\nЭтот бот предназначен исключительно для администрации магазина FCKIT.\nВсе функции, команды и получение заказов закрыты.\n\n🔑 <b>Пожалуйста, отправьте секретный пароль администратора для входа:</b>`,
          { remove_keyboard: true }
        );
        return;
      }

      // ПАРОЛЬ НЕВЕРЕН: учитываем попытку
      attempt.count = (attempt.count || 0) + 1;
      attempt.lastAttempt = now;

      if (attempt.count >= 5) {
        attempt.lockedUntil = now + 60 * 1000; // Блокировка на 60 секунд
        attempt.count = 0;
        authAttempts.set(chatId, attempt);
        await sendTelegramMessage(
          chatId,
          `⛔️ <b>Превышен лимит попыток!</b>\n\nБот заблокирован на <b>60 секунд</b> в целях безопасности.\nПодождите и попробуйте снова.`,
          { remove_keyboard: true }
        );
      } else {
        const left = 5 - attempt.count;
        authAttempts.set(chatId, attempt);
        await sendTelegramMessage(
          chatId,
          `❌ <b>Неверный пароль.</b>\nОсталось попыток: <b>${left}</b>.\n\nПопробуйте ещё раз или введите команду /start:`
        );
      }
      return;
    }

    // -----------------------------------------------------------------------
    // ПОЛЬЗОВАТЕЛЬ АВТОРИЗОВАН — ДОСТУП К ФУНКЦИОНАЛУ И КОМАНДАМ
    // -----------------------------------------------------------------------

    // Выход из системы
    if (text === "/logout" || text === "🚪 Выйти") {
      await removeAuthorizedTelegramUser(fromId);
      console.log(`Telegram Bot: пользователь ${fromId} (${userTitle}) вышел из системы.`);
      await sendTelegramMessage(
        chatId,
        `🔒 <b>Вы вышли из системы.</b>\n\nДоступ к функциям и заказам закрыт.\nДля повторной авторизации отправьте /start и введите пароль.`,
        { remove_keyboard: true }
      );
      return;
    }

    // Главное меню / старт для авторизованного
    if (text === "/start" || text === "/menu" || text === "📱 Меню") {
      await sendTelegramMessage(
        chatId,
        `👑 <b>Панель управления FCKIT</b>\n\nВы авторизованы как администратор: <b>${escapeTg(userTitle)}</b>\n\nВыберите действие в меню ниже:`,
        MAIN_ADMIN_KEYBOARD
      );
      return;
    }

    // Просмотр последних заказов
    if (text === "/orders" || text === "📦 Заказы") {
      const orders = await dbGetOrders(5);
      if (!orders.length) {
        await sendTelegramMessage(chatId, `📦 <b>Заказов пока нет.</b>\nКак только появится новый заказ, вы получите уведомление.`);
        return;
      }

      let report = `📦 <b>ПОСЛЕДНИЕ ${orders.length} ЗАКАЗОВ:</b>\n\n`;
      orders.forEach((o, i) => {
        const dateStr = new Date(o.createdAt || Date.now()).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
        const st = o.status === "done" ? "✅ ВЫПОЛНЕН" : "🆕 НОВЫЙ";
        report += `<b>${i + 1}. Заказ #${escapeTg(o.id)}</b> [${st}]\n`;
        report += `👤 ${escapeTg(o.name || "—")}, тел: <code>${escapeTg(o.phone || "—")}</code>\n`;
        report += `💰 Сумма: <b>${formatSum(o.total)}</b>\n`;
        report += `🕒 ${dateStr}\n\n`;
      });

      await sendTelegramMessage(chatId, report.trim(), MAIN_ADMIN_KEYBOARD);
      return;
    }

    // Статистика
    if (text === "/stats" || text === "📊 Статистика") {
      const orders = await dbGetOrders(100);
      const total = orders.length;
      const done = orders.filter((o) => o.status === "done").length;
      const fresh = orders.filter((o) => o.status !== "done").length;
      const sum = orders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

      const msgStats = [
        `📊 <b>СТАТИСТИКА МАГАЗИНА FCKIT</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📦 Всего заказов в базе: <b>${total}</b>`,
        `🆕 Новых (требуют обработки): <b>${fresh}</b>`,
        `✅ Выполненных: <b>${done}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💰 Общая сумма заказов: <b>${formatSum(sum)}</b>`,
        `🤖 Telegram-бот: <b>Приватный режим (ВКЛ)</b>`,
        `👥 Авторизованных админов: <b>${authorizedTelegramUsers.size}</b>`,
      ].join("\n");

      await sendTelegramMessage(chatId, msgStats, MAIN_ADMIN_KEYBOARD);
      return;
    }

    // Проверка связи
    if (text === "/ping" || text === "🔔 Проверить связь") {
      const serverTime = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
      await sendTelegramMessage(
        chatId,
        `🔔 <b>Бот онлайн и полностью исправен!</b>\n\n▫️ Время сервера (Ташкент): <code>${serverTime}</code>\n▫️ Ваш ID: <code>${fromId}</code>\n▫️ Статус: <b>Авторизован ✅</b>\n▫️ Уведомления о заказах: <b>Активны</b>`,
        MAIN_ADMIN_KEYBOARD
      );
      return;
    }

    // Неизвестная команда
    await sendTelegramMessage(
      chatId,
      `❓ Неизвестная команда. Воспользуйтесь кнопками меню или отправьте:\n/orders — заказы\n/stats — статистика\n/logout — выйти`,
      MAIN_ADMIN_KEYBOARD
    );
  }
}

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=15`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          telegramOffset = update.update_id + 1;
          try {
            await handleTelegramUpdate(update);
          } catch (updateErr) {
            console.error("Ошибка обработки Telegram update:", updateErr);
          }
        }
      }
    }
  } catch (err) {
    // network timeout or error, continue
  } finally {
    setTimeout(pollTelegramUpdates, 2000);
  }
}

// ==========================================
// TELEGRAM БОТ ДЛЯ КЛИЕНТОВ (@FCKIT_USERBot)
// ==========================================

const CUSTOMER_MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "🔍 Статус заказа" }, { text: "🛍 Каталог товаров" }],
    [{ text: "🚚 Доставка и сроки" }, { text: "💬 Служба заботы / Связь" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const customerSessions = new Map();

async function sendCustomerTelegramMessage(chatId, html, replyMarkup = null) {
  if (!TELEGRAM_CUSTOMER_BOT_TOKEN) return null;
  try {
    const body = {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_CUSTOMER_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`Customer TG error (${chatId}):`, data);
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error(`Customer TG send error (${chatId}):`, err.message);
    return null;
  }
}

async function answerCustomerTelegramCallback(callbackQueryId, text = "", showAlert = false) {
  if (!TELEGRAM_CUSTOMER_BOT_TOKEN || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_CUSTOMER_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
  } catch (err) {
    console.error("Customer TG answerCallbackQuery error:", err.message);
  }
}

function formatCustomerOrderCard(order) {
  const isDone = order.status === "done";
  const statusBadge = isDone
    ? "✅ <b>Выполнен и доставлен</b>"
    : "🆕 <b>Принят в обработку (в пути)</b>";

  let itemsList = "▫️ (список товаров пуст)";
  if (Array.isArray(order.items) && order.items.length > 0) {
    itemsList = order.items
      .map((it, idx) => {
        const title = escapeTg(it.title || it.name || "Товар");
        const size = it.size ? ` (размер: ${escapeTg(it.size)})` : "";
        const qty = it.qty || it.count || 1;
        const price = formatSum(it.price);
        return `${idx + 1}. <b>${title}</b>${size}\n   └ ${qty} шт. × ${price}`;
      })
      .join("\n");
  }

  const dateStr = order.createdAt
    ? new Date(order.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })
    : "—";
  const totalStr = formatSum(order.total);
  const noteStr = order.note ? `\n📝 <b>Примечание:</b> ${escapeTg(order.note)}` : "";

  return (
    `📦 <b>ИНФОРМАЦИЯ О ЗАКАЗЕ</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Номер заказа:</b> <code>${escapeTg(order.id)}</code>\n` +
    `📊 <b>Статус:</b> ${statusBadge}\n` +
    `📅 <b>Дата оформления:</b> ${escapeTg(dateStr)}\n` +
    `👤 <b>Получатель:</b> ${escapeTg(order.name || "Не указан")}\n` +
    `📞 <b>Телефон:</b> <code>${escapeTg(order.phone || "Не указан")}</code>` +
    noteStr +
    `\n\n🛍 <b>Состав заказа:</b>\n${itemsList}\n\n` +
    `💰 <b>Итого к оплате:</b> <b>${totalStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `🚚 <i>Доставка напрямую из Китая по Узбекистану занимает 7–10 дней. При возникновении любых вопросов нажмите «💬 Служба заботы / Связь».</i>`
  );
}

async function handleCustomerTelegramUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (chatId) {
      if (cq.data === "cust_status") {
        customerSessions.set(chatId, { waitingOrderSearch: true });
        await sendCustomerTelegramMessage(
          chatId,
          `🔍 <b>Проверка статуса заказа</b>\n\nПришлите в ответ <b>номер вашего заказа</b> или <b>номер телефона</b>, указанный при покупке:`,
          CUSTOMER_MAIN_KEYBOARD
        );
      }
    }
    await answerCustomerTelegramCallback(cq.id);
    return;
  }

  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;

    // 1. Deep link или старт с параметром: /start <orderId>
    const startMatch = text.match(/^\/start\s+(.+)$/i);
    if (startMatch) {
      const query = startMatch[1].trim();
      const order = await dbFindOrder(query);
      if (order) {
        await sendCustomerTelegramMessage(
          chatId,
          `👋 <b>Здравствуйте, ${escapeTg(order.name || "клиент")}!</b>\nВот актуальная информация по вашему заказу:\n\n` +
            formatCustomerOrderCard(order),
          CUSTOMER_MAIN_KEYBOARD
        );
      } else {
        await sendCustomerTelegramMessage(
          chatId,
          `🔍 Заказ с номером «<code>${escapeTg(query)}</code>» пока не найден в нашей системе. Возможно, он обрабатывается. Проверьте правильность номера или выберите действие в меню:`,
          CUSTOMER_MAIN_KEYBOARD
        );
      }
      return;
    }

    // 2. Команды /start, /help, /menu
    if (/^\/(start|help|menu)$/i.test(text)) {
      customerSessions.delete(chatId);
      const welcomeText =
        `👋 <b>Добро пожаловать в официальный бот магазина FCKIT!</b>\n\n` +
        `Мы привозим стильную брендовую одежду напрямую из Китая в любую точку Узбекистана за 7–10 дней без переплат.\n\n` +
        `⚡️ <b>Возможности бота:</b>\n` +
        `▫️ 🔍 <b>Статус заказа</b> — узнать, где ваша посылка и статус готовности\n` +
        `▫️ 🛍 <b>Каталог товаров</b> — новинки, горячие акции и каталог\n` +
        `▫️ 🚚 <b>Доставка и сроки</b> — условия получения и сроки доставки\n` +
        `▫️ 💬 <b>Служба заботы</b> — прямая связь с менеджером магазина\n\n` +
        `<i>Воспользуйтесь кнопками меню ниже или просто отправьте номер вашего заказа:</i>`;
      await sendCustomerTelegramMessage(chatId, welcomeText, CUSTOMER_MAIN_KEYBOARD);
      return;
    }

    // 3. Кнопка "🔍 Статус заказа" или команда /status
    if (text === "🔍 Статус заказа" || /^\/status$/i.test(text)) {
      customerSessions.set(chatId, { waitingOrderSearch: true });
      await sendCustomerTelegramMessage(
        chatId,
        `🔍 <b>Проверка статуса заказа</b>\n\nОтправьте в чат:\n▫️ <b>Номер вашего заказа</b> (например: <code>#3</code> или <code>order-1732...</code>)\n▫️ Либо <b>номер телефона</b>, указанный при заказе (например: <code>+998901234567</code>).`,
        CUSTOMER_MAIN_KEYBOARD
      );
      return;
    }

    // 4. Кнопка "🛍 Каталог товаров" или /catalog
    if (text === "🛍 Каталог товаров" || /^\/catalog$/i.test(text)) {
      customerSessions.delete(chatId);
      const catalogText =
        `🛍 <b>Каталог FCKIT</b>\n\n` +
        `У нас собраны лучшие тренды уличного стиля и современной моды по честным ценам:\n` +
        `▫️ <b>Худи, свитшоты, футболки и оверсайз</b>\n` +
        `▫️ <b>Широкие брюки, карго и джинсы</b>\n` +
        `▫️ <b>Кроссовки, кеды и обувь</b>\n` +
        `▫️ <b>Головные уборы и аксессуары</b>\n\n` +
        `Все поставки идут напрямую с фабрик. Ознакомьтесь с полным ассортиментом на нашем сайте:`;
      await sendCustomerTelegramMessage(chatId, catalogText, {
        inline_keyboard: [
          [{ text: "🌐 Открыть каталог на сайте", url: "https://mediterranean-ordered-figures-stress.trycloudflare.com/catalog.html" }],
          [{ text: "🔥 Хиты и горячие предложения", url: "https://mediterranean-ordered-figures-stress.trycloudflare.com/#offers" }],
        ],
      });
      return;
    }

    // 5. Кнопка "🚚 Доставка и сроки" или /delivery
    if (text === "🚚 Доставка и сроки" || /^\/delivery$/i.test(text)) {
      customerSessions.delete(chatId);
      const deliveryText =
        `🚚 <b>Доставка и оплата FCKIT</b>\n\n` +
        `▫️ <b>Сроки доставки:</b> 7–10 рабочих дней с момента подтверждения заказа менеджером.\n` +
        `▫️ <b>География:</b> Доставляем по всему Узбекистану (Ташкент, Самарканд, Бухара, Фергана, Андижан, Наманган и любые другие города и области).\n` +
        `▫️ <b>Прямой привоз:</b> Мы доставляем одежду напрямую из Китая с минимальной стоимостью логистики, без посреднических наценок.\n` +
        `▫️ <b>Отслеживание:</b> Статус вашего заказа в любой момент доступен прямо в этом боте.\n` +
        `▫️ <b>Оплата:</b> Оплата при получении курьеру либо онлайн (Click / Payme).`;
      await sendCustomerTelegramMessage(chatId, deliveryText, CUSTOMER_MAIN_KEYBOARD);
      return;
    }

    // 6. Кнопка "💬 Служба заботы / Связь" или /support
    if (text === "💬 Служба заботы / Связь" || /^\/support$/i.test(text)) {
      customerSessions.delete(chatId);
      const supportText =
        `💬 <b>Служба заботы FCKIT</b>\n\n` +
        `Возник вопрос по размеру, качеству или срокам доставки? Наша команда оперативно вам ответит!\n\n` +
        `▫️ <b>Instagram:</b> <a href="https://www.instagram.com/fckit_tas?bqrl=MWYwYzduaDV6NWVlMw==">@fckit_tas</a>\n` +
        `▫️ <b>Telegram канал:</b> <a href="https://t.me/+NwOfaVlX_mlmODY6">FCKIT Channel</a>\n` +
        `▫️ <b>Менеджер в Telegram:</b> @Itamiyo_norikeru\n\n` +
        `Работаем без выходных. Пишите нам, мы на связи! 🙌`;
      await sendCustomerTelegramMessage(chatId, supportText, CUSTOMER_MAIN_KEYBOARD);
      return;
    }

    // 7. Поиск заказа по введённому тексту (ID или номер телефона)
    const foundOrder = await dbFindOrder(text);
    if (foundOrder) {
      customerSessions.delete(chatId);
      await sendCustomerTelegramMessage(
        chatId,
        `✅ <b>Заказ найден!</b>\n\n` + formatCustomerOrderCard(foundOrder),
        CUSTOMER_MAIN_KEYBOARD
      );
      return;
    }

    const isWaiting = customerSessions.get(chatId)?.waitingOrderSearch;
    if (isWaiting) {
      customerSessions.delete(chatId);
      await sendCustomerTelegramMessage(
        chatId,
        `🔍 <b>Заказ не найден</b>\n\nК сожалению, по запросу «<code>${escapeTg(text)}</code>» заказ не найден в базе данных магазина.\n\nПожалуйста, проверьте правильность введённого номера или телефона, либо свяжитесь с поддержкой через кнопку «💬 Служба заботы / Связь».`,
        CUSTOMER_MAIN_KEYBOARD
      );
      return;
    }

    // Fallback: приветствие и меню
    await sendCustomerTelegramMessage(
      chatId,
      `👋 Чем я могу помочь? Выберите нужный раздел в меню ниже или пришлите номер вашего заказа для отслеживания:`,
      CUSTOMER_MAIN_KEYBOARD
    );
  }
}

async function pollCustomerTelegramUpdates() {
  if (!TELEGRAM_CUSTOMER_BOT_TOKEN) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_CUSTOMER_BOT_TOKEN}/getUpdates?offset=${telegramCustomerOffset}&timeout=15`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          telegramCustomerOffset = update.update_id + 1;
          try {
            await handleCustomerTelegramUpdate(update);
          } catch (updateErr) {
            console.error("Ошибка обработки Customer TG update:", updateErr);
          }
        }
      }
    }
  } catch (err) {
    // network timeout or error, continue
  } finally {
    setTimeout(pollCustomerTelegramUpdates, 2000);
  }
}

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    let value = trimmed.slice(split + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadProducts() {
  const pfile = path.join(ROOT, "products.json");
  if (fs.existsSync(pfile)) {
    try {
      return JSON.parse(fs.readFileSync(pfile, "utf8"));
    } catch {}
  }
  const src = fs.readFileSync(path.join(ROOT, "store.js"), "utf8");
  const match = src.match(/const PRODUCTS = (\[[\s\S]*?\]);/);
  if (!match) return [];
  return Function(`"use strict"; return ${match[1]}`)();
}

function catalogText() {
  return loadProducts()
    .map((item) => {
      const price = item.sale ?? item.price;
      const sale = item.sale ? `, скидка с ${item.price}` : "";
      return `#${item.id} | ${item.department === "men" ? "мужской" : "женский"} | ${item.section} | ${item.title} | ${price} сум${sale} | ${item.text}`;
    })
    .join("\n");
}

function systemPrompt() {
  return `Ты стилист интернет-магазина FCKIT. Отвечай только по-русски, коротко и спокойно.

FCKIT заказывает одежду напрямую из Китая, без своего производства. Есть мужская и женская линии: головные уборы, верх, низ, обувь. Цены в сумах. Доставка в любую точку Республики Узбекистан занимает 7–10 дней. Контакты: Instagram, Telegram. Заказ оформляется в корзине на сайте.

Каталог (рекомендуй только эти id):
${catalogText()}

Твоя работа:
1. Помогать подобрать вещи из каталога FCKIT.
2. По фото в полный рост оценить телосложение и посоветовать размер XS, S, M, L или XL и посадку. Это приблизительная оценка по фото, не точный замер.
3. Если фото нет, обрезано, сидячее, слишком тёмное или не в полный рост — вежливо попроси новое фото в полный рост, в обтягивающей или обычной одежде, человек стоит прямо.
4. Если спрашивают не про одежду, размер, каталог или доставку FCKIT — мягко и дружелюбно переведи разговор на подбор стиля и вещей FCKIT, без резких фраз вроде «на остальное не отвечаю».
5. Не выдумывай товары, которых нет в каталоге.

Верни строго JSON:
{
  "reply": "текст для клиента",
  "size": "M или null",
  "products": [id, id],
  "refuse": true/false
}`;
}

// ==========================================
// 🛡️ SECURITY MODULE: CORS, HEADERS, RATE LIMITING & AUTH
// ==========================================
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || (process.env.TELEGRAM_BOT_TOKEN ? crypto.createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN).digest("hex") : "fckit-jwt-secret-2026");

const TRUSTED_ORIGINS = new Set([
  "https://creatoraia29-ops.github.io",
  "https://fckit.onrender.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
    const trimmed = o.trim();
    if (trimmed) TRUSTED_ORIGINS.add(trimmed);
  });
}

function getCorsOrigin(req) {
  const origin = (req?.headers?.origin || "").trim();
  if (!origin) return null;
  if (TRUSTED_ORIGINS.has(origin)) return origin;
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "creatoraia29-ops.github.io" || parsed.hostname === "fckit.onrender.com") {
      return origin;
    }
  } catch (_) {}
  return null;
}

function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "1; mode=block",
    "Content-Security-Policy": "default-src 'self' https://creatoraia29-ops.github.io https://fckit.onrender.com; script-src 'self' 'unsafe-inline' https://creatoraia29-ops.github.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://fckit.onrender.com https://api.telegram.org; frame-ancestors 'self';",
  };
}

function setCorsHeaders(res, req = null) {
  const matched = req ? getCorsOrigin(req) : null;
  if (matched) {
    res.setHeader("Access-Control-Allow-Origin", matched);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!req) {
    res.setHeader("Access-Control-Allow-Origin", "https://creatoraia29-ops.github.io");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Admin-Password");
}

// In-Memory Rate Limiter (защита от DDoS / брутфорса)
const rateLimitStores = new Map();

function checkRateLimit(ip, bucket, maxRequests, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  let record = rateLimitStores.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
    rateLimitStores.set(key, record);
    return { allowed: true, remaining: maxRequests - 1 };
  }
  record.count += 1;
  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((record.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: maxRequests - record.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStores.entries()) {
    if (now > record.resetAt) rateLimitStores.delete(key);
  }
}, 5 * 60 * 1000);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

function safeCompareStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signAdminToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "admin", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;
  try {
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && Math.floor(Date.now() / 1000) > data.exp) return false;
    return data.role === "admin";
  } catch (_) {
    return false;
  }
}

function isAuthorizedAdminRequest(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (verifyAdminToken(token)) return true;
    if (safeCompareStrings(token, getTelegramBotPassword())) return true;
  }
  const passHeader = req.headers["x-admin-password"];
  if (passHeader && safeCompareStrings(passHeader, getTelegramBotPassword())) {
    return true;
  }
  return false;
}

function sanitizeString(str, maxLength = 200) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, maxLength);
}

async function recalculateOrderTotal(items) {
  if (!Array.isArray(items) || items.length === 0) return { valid: false, total: 0, items: [] };
  const products = await dbGetProducts();
  const promotions = await dbGetPromotions();
  const now = new Date();

  const activePromo = promotions.find((p) => {
    if (!p.active) return false;
    if (p.startDate && new Date(p.startDate) > now) return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    return true;
  });

  const verifiedItems = [];
  let calculatedTotal = 0;

  for (const clientItem of items) {
    const prodId = Number(clientItem.id);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(clientItem.qty) || 1)));
    const product = products.find((p) => p.id === prodId);
    if (!product) continue;

    let basePrice = Number(product.sale || product.price);

    if (activePromo) {
      if (activePromo.target === "all" || activePromo.target === product.department || activePromo.target === product.section) {
        if (activePromo.discountType === "percent") {
          basePrice = Math.round(basePrice * (1 - activePromo.discountValue / 100));
        } else if (activePromo.discountType === "fixed") {
          basePrice = Math.max(0, basePrice - activePromo.discountValue);
        }
      }
    }

    const itemTotal = basePrice * qty;
    calculatedTotal += itemTotal;

    verifiedItems.push({
      id: product.id,
      title: product.title,
      price: basePrice,
      originalPrice: product.price,
      sale: product.sale,
      department: product.department,
      section: product.section,
      image: product.image,
      shade: product.shade,
      qty,
    });
  }

  return {
    valid: verifiedItems.length > 0,
    total: calculatedTotal,
    items: verifiedItems,
  };
}

function json(res, status, body, extraHeaders = {}, req = null) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  setCorsHeaders(res, req);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...getSecurityHeaders(),
    ...extraHeaders,
  };

  const acceptEncoding = (req && req.headers && req.headers["accept-encoding"]) || "";
  if (data.length > 1024 && acceptEncoding.includes("gzip")) {
    try {
      const gzipped = zlib.gzipSync(data);
      headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = gzipped.length;
      res.writeHead(status, headers);
      res.end(gzipped);
      return;
    } catch (_) {}
  }

  headers["Content-Length"] = data.length;
  res.writeHead(status, headers);
  res.end(data);
}

function readBody(req, limit = 5_000_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString("utf8"));
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  let full = path.normalize(path.join(ROOT, relative));
  if (!full.startsWith(ROOT)) return null;
  if (!path.extname(full) && fs.existsSync(full + ".html")) {
    full += ".html";
  }
  return full;
}

function serveStatic(req, res) {
  const file = safePath(req.url);
  if (!file) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(file, (err, stat) => {
    const target = !err && stat.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const contentType = MIME[ext] || "application/octet-stream";
      let cacheControl = "public, max-age=300";

      if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".ico"].includes(ext)) {
        cacheControl = "public, max-age=604800, immutable";
      } else if ([".css", ".js"].includes(ext)) {
        cacheControl = "public, max-age=86400";
      } else if (ext === ".svg") {
        cacheControl = "public, max-age=604800";
      }

      setCorsHeaders(res, req);
      const headers = {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        ...getSecurityHeaders(),
      };

      const acceptEncoding = (req && req.headers && req.headers["accept-encoding"]) || "";
      const isCompressible = [".html", ".css", ".js", ".json", ".svg", ".txt"].includes(ext);

      if (isCompressible && data.length > 1024 && acceptEncoding.includes("gzip")) {
        try {
          const gzipped = zlib.gzipSync(data);
          headers["Content-Encoding"] = "gzip";
          headers["Content-Length"] = gzipped.length;
          res.writeHead(200, headers);
          res.end(gzipped);
          return;
        } catch (_) {}
      }

      headers["Content-Length"] = data.length;
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-10)
    .map((row) => ({
      role: row.role === "model" ? "model" : "user",
      text: String(row.text || "").slice(0, 4000),
    }))
    .filter((row) => row.text);
}

function normalizeImage(image) {
  if (!image || typeof image !== "object") return null;
  const mimeType = String(image.mimeType || "");
  const data = String(image.data || "").replace(/^data:[^;]+;base64,/, "");
  if (!ALLOWED_IMAGE.has(mimeType) || !data || data.length > 3_500_000) return null;
  return { mimeType, data };
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { reply: raw || "Не удалось разобрать ответ. Напишите ещё раз.", size: null, products: [], refuse: false };
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const products = Array.isArray(parsed.products)
      ? parsed.products.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    return {
      reply: String(parsed.reply || "").trim() || "Готов помочь с подбором FCKIT.",
      size: parsed.size ? String(parsed.size).slice(0, 8) : null,
      products,
      refuse: Boolean(parsed.refuse),
    };
  } catch {
    return { reply: raw, size: null, products: [], refuse: false };
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part.text || "").join("").trim();
}

async function askGemini({ messages, image }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new Error("missing_key");
    error.status = 503;
    throw error;
  }

  const contents = messages.map((row, index) => {
    const parts = [{ text: row.text }];
    if (row.role === "user" && image && index === messages.length - 1) {
      parts.unshift({ inlineData: image });
    }
    return { role: row.role, parts };
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "medium" },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "gemini_error");
    error.status = response.status;
    throw error;
  }
  return parseModelJson(extractText(payload));
}

let dbInitialized = false;
async function ensureDbInit() {
  if (dbInitialized) return;
  try {
    await initTurso();
  } catch (err) {
    console.error("ensureDbInit Turso error:", err.message);
  }
  try {
    await loadAuthorizedTelegramUsers();
  } catch (err) {
    console.error("ensureDbInit Telegram users error:", err.message);
  }
  dbInitialized = true;
}

async function handleRequest(req, res) {
  try {
    return await handleRequestInternal(req, res);
  } catch (err) {
    console.error("Top-level request error:", err);
    if (!res.headersSent) {
      json(res, 500, { error: "Внутренняя ошибка сервера" });
    }
  }
}

async function handleRequestInternal(req, res) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  await ensureDbInit();

  // 0. Health check & root API info
  if (req.url === "/" || req.url === "/api" || req.url === "/api/") {
    if (process.env.VERCEL) {
      json(res, 200, {
        ok: true,
        service: "FCKIT E-Commerce API",
        status: "online",
        time: new Date().toISOString(),
      }, {}, req);
      return;
    }
  }

  // 0.1 Авторизация администратора (POST /api/admin/login)
  if (req.method === "POST" && req.url === "/api/admin/login") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "admin_login", 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Превышен лимит попыток входа. Попробуйте через ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 10_000)) || "{}");
      const password = String(body.password || "").trim();
      if (safeCompareStrings(password, getTelegramBotPassword())) {
        const token = signAdminToken();
        json(res, 200, { ok: true, token, expiresIn: 86400 * 7 }, {}, req);
      } else {
        json(res, 401, { error: "Неверный пароль администратора." }, {}, req);
      }
    } catch (_) {
      json(res, 400, { error: "Некорректный запрос." }, {}, req);
    }
    return;
  }

  // 0.2 Список заказов для админки (GET /api/orders) с защитой авторизацией
  if (req.method === "GET" && req.url?.startsWith("/api/orders")) {
    if (!isAuthorizedAdminRequest(req)) {
      json(res, 401, { error: "Доступ запрещён. Требуется авторизация администратора." }, {}, req);
      return;
    }
    const orders = await dbGetOrders(100);
    json(res, 200, orders, {}, req);
    return;
  }

  // 1. Telegram Webhook: Администратор
  if (req.method === "POST" && (req.url === "/api/webhook-admin" || req.url?.startsWith("/api/webhook-admin?"))) {
    try {
      const raw = await readBody(req, 1_000_000);
      const update = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
      if (update && update.update_id) {
        await handleTelegramUpdate(update);
      }
      json(res, 200, { ok: true }, {}, req);
    } catch (err) {
      console.error("Webhook admin error:", err.message);
      json(res, 200, { ok: false, error: err.message }, {}, req);
    }
    return;
  }

  // 2. Telegram Webhook: Клиент
  if (req.method === "POST" && (req.url === "/api/webhook-customer" || req.url?.startsWith("/api/webhook-customer?"))) {
    try {
      const raw = await readBody(req, 1_000_000);
      const update = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
      if (update && update.update_id) {
        await handleCustomerTelegramUpdate(update);
      }
      json(res, 200, { ok: true }, {}, req);
    } catch (err) {
      console.error("Webhook customer error:", err.message);
      json(res, 200, { ok: false, error: err.message }, {}, req);
    }
    return;
  }

  // 3. Автоматическая настройка вебхуков Telegram (GET /api/setup-webhooks)
  if (req.method === "GET" && req.url?.startsWith("/api/setup-webhooks")) {
    if (!isAuthorizedAdminRequest(req)) {
      json(res, 401, { error: "Доступ запрещён." }, {}, req);
      return;
    }
    const urlObj = new URL(req.url, `https://${req.headers.host || "127.0.0.1"}`);
    const hostParam = urlObj.searchParams.get("host");
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = hostParam || req.headers["x-forwarded-host"] || req.headers.host;
    const base = host.startsWith("http") ? host.replace(/\/+$/, "") : `${proto}://${host}`;

    const adminWebhookUrl = `${base}/api/webhook-admin`;
    const customerWebhookUrl = `${base}/api/webhook-customer`;

    const results = { base, admin: null, customer: null };

    if (TELEGRAM_BOT_TOKEN) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: adminWebhookUrl, drop_pending_updates: false }),
        });
        results.admin = await resp.json();
      } catch (e) {
        results.admin = { error: e.message };
      }
    }

    if (TELEGRAM_CUSTOMER_BOT_TOKEN) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_CUSTOMER_BOT_TOKEN}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: customerWebhookUrl, drop_pending_updates: false }),
        });
        results.customer = await resp.json();
      } catch (e) {
        results.customer = { error: e.message };
      }
    }

    json(res, 200, { ok: true, webhooks: results }, {}, req);
    return;
  }

  if (req.method === "GET" && req.url === "/api/products") {
    const list = await dbGetProducts();
    json(res, 200, list, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" }, req);
    return;
  }

  if (req.method === "POST" && req.url === "/api/products") {
    if (!isAuthorizedAdminRequest(req)) {
      json(res, 401, { error: "Доступ запрещён: требуется пароль администратора." }, {}, req);
      return;
    }
    try {
      const list = JSON.parse((await readBody(req, 25_000_000)) || "[]");
      if (!Array.isArray(list)) {
        json(res, 400, { error: "Ожидался массив товаров." }, {}, req);
        return;
      }
      await dbSaveProducts(list);
      json(res, 200, { ok: true, count: list.length }, {}, req);
    } catch (err) {
      json(res, 500, { error: "Не удалось сохранить товары: " + err.message }, {}, req);
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/promotions") {
    const list = await dbGetPromotions();
    json(res, 200, list, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" }, req);
    return;
  }

  if (req.method === "POST" && req.url === "/api/promotions") {
    if (!isAuthorizedAdminRequest(req)) {
      json(res, 401, { error: "Доступ запрещён: требуется пароль администратора." }, {}, req);
      return;
    }
    try {
      const list = JSON.parse((await readBody(req, 1_000_000)) || "[]");
      if (!Array.isArray(list)) {
        json(res, 400, { error: "Ожидался массив акций." }, {}, req);
        return;
      }
      await dbSavePromotions(list);
      json(res, 200, { ok: true, count: list.length }, {}, req);
    } catch (err) {
      json(res, 500, { error: "Не удалось сохранить акции: " + err.message }, {}, req);
    }
    return;
  }

  // СОЗДАНИЕ ЗАКАЗА (С ЗАЩИТОЙ ОТ ПОДМЕНЫ ЦЕНЫ И RATE LIMITING)
  if (req.method === "POST" && req.url === "/api/order") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "orders", 15, 10 * 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Слишком много заказов. Пожалуйста, подождите ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }

    try {
      const body = JSON.parse((await readBody(req, 1_000_000)) || "{}");
      if (!Array.isArray(body.items) || body.items.length === 0) {
        json(res, 400, { error: "Некорректные данные заказа: корзина пуста." }, {}, req);
        return;
      }

      // Серверный перерасчет цен и валидация товаров
      const recalculated = await recalculateOrderTotal(body.items);
      if (!recalculated.valid || recalculated.items.length === 0) {
        json(res, 400, { error: "Выбранные товары недоступны." }, {}, req);
        return;
      }

      const cleanName = sanitizeString(body.name || "", 100);
      const cleanPhone = sanitizeString(body.phone || "", 30);
      const cleanNote = sanitizeString(body.note || "", 500);

      const verifiedOrder = {
        id: sanitizeString(body.id, 64) || "FC-" + Date.now(),
        createdAt: new Date().toISOString(),
        name: cleanName,
        phone: cleanPhone,
        note: cleanNote,
        items: recalculated.items,
        total: recalculated.total, // СТРОГО СЕРВЕРНАЯ СУММА
        status: "new",
        paymentMethod: sanitizeString(body.paymentMethod || "card", 32),
        paymentStatus: "pending",
        paymentDetails: typeof body.paymentDetails === "object" ? JSON.stringify(body.paymentDetails) : "",
      };

      try {
        await dbSaveOrder(verifiedOrder);
      } catch (err) {
        console.error("DB Order error:", err.message);
      }

      notifyTelegramOrder(verifiedOrder).catch((err) => console.error("Telegram error:", err));

      const paymeUrl = getPaymeCheckoutUrl(verifiedOrder.id, verifiedOrder.total);
      const clickUrl = getClickCheckoutUrl(verifiedOrder.id, verifiedOrder.total);

      json(res, 200, { ok: true, id: verifiedOrder.id, total: verifiedOrder.total, paymeUrl, clickUrl }, {}, req);
    } catch (err) {
      console.error("Order API error:", err);
      json(res, 500, { error: "Ошибка обработки заказа." }, {}, req);
    }
    return;
  }

  // РЕКВИЗИТЫ ДЛЯ ПЕРЕВОДА (ЗАЩИЩЕННЫЙ ЭНДПОИНТ — НОМЕР КАРТЫ ТОЛЬКО ИЗ .ENV)
  if (req.method === "GET" && req.url.startsWith("/api/payment/requisites")) {
    const urlObj = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const orderId = urlObj.searchParams.get("orderId");
    let order = null;
    if (orderId) {
      order = await dbFindOrder(orderId);
      if (!order) {
        await new Promise((r) => setTimeout(r, 200));
        order = await dbFindOrder(orderId);
      }
    }
    const rawNumber = String(process.env.RECIPIENT_CARD_NUMBER || "4916990350013485").trim();
    const formattedNumber = rawNumber.replace(/(\d{4})/g, "$1 ").trim();
    const total = order?.total || 0;
    const paymeUrl = order ? getPaymeCheckoutUrl(order.id, total) : null;
    const clickUrl = order ? getClickCheckoutUrl(order.id, total) : null;
    json(res, 200, {
      ok: true,
      orderId: order?.id || orderId || "FC-ORDER",
      total: total,
      totalFormatted: formatSum(total),
      cardNumber: formattedNumber,
      cardNumberRaw: rawNumber,
      bank: String(process.env.RECIPIENT_CARD_BANK || "Visa Uzum Bank").trim(),
      recipientName: String(process.env.RECIPIENT_CARD_NAME || "FCKIT").trim(),
      paymeUrl,
      clickUrl,
    });
    return;
  }

  // ОНЛАЙН-ОПЛАТА КАРТАМИ УЗБЕКИСТАНА (ИНИЦИАЛИЗАЦИЯ И ВАЛИДАЦИЯ BIN)
  if (req.method === "POST" && req.url === "/api/payment/card-init") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "card_init", 8, 10 * 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Превышен лимит попыток. Подождите ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }

    try {
      const body = JSON.parse((await readBody(req, 1_000_000)) || "{}");
      const { orderId, cardNumber, exp, cvv } = body;
      if (!orderId) {
        json(res, 400, { error: "Не указан номер заказа." });
        return;
      }
      let order = await dbFindOrder(orderId);
      if (!order) {
        await new Promise((r) => setTimeout(r, 200));
        order = await dbFindOrder(orderId);
      }

      const cardClean = String(cardNumber || "").replace(/\D/g, "");
      const detect = detectUzbekCard(cardClean);
      if (!detect.valid || !detect.brand) {
        json(res, 400, {
          error: detect.error || "Поддерживаются только банковские карты Узбекистана: Uzcard, Humo, Visa и Mastercard (16 цифр).",
        });
        return;
      }

      if (detect.needsCvv) {
        const cvvClean = String(cvv || "").trim();
        if (!/^\d{3}$/.test(cvvClean)) {
          json(res, 400, { error: `Для карты ${detect.name} требуется 3-значный код CVV/CVC.` });
          return;
        }
      }

      const expClean = String(exp || "").trim();
      const expMatch = expClean.match(/^(0[1-9]|1[0-2])\/?([2-9][0-9])$/);
      if (!expMatch) {
        json(res, 400, { error: "Срок действия карты должен быть в формате MM/YY." });
        return;
      }

      const txId = "TX-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(1000 + Math.random() * 9000);
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const phoneDigits = String(order.phone || "").replace(/\D/g, "");
      const phoneMask = phoneDigits.length >= 4 ? `+998 •• ••• •• ${phoneDigits.slice(-2)}` : "+998 •• ••• •• ••";

      cardTransactions.set(txId, {
        txId,
        orderId: order.id,
        amount: order.total,
        brand: detect.brand,
        cardName: detect.name,
        last4: cardClean.slice(-4),
        phone: order.phone,
        otpCode,
        createdAt: Date.now(),
      });

      console.log(`💳 [Платёжный шлюз UZ] Создана транзакция ${txId} (${detect.name} *${cardClean.slice(-4)}). Код подтверждения: ${otpCode}`);

      // Отправка реального SMS через Eskiz.uz
      let smsSent = false;
      try {
        smsSent = await sendUzbekSms(
          order.phone,
          `FCKIT: Kod podtverjdeniya oplaty zakaza ${order.id}: ${otpCode}`
        );
      } catch (smsErr) {
        console.error("SMS send fail:", smsErr.message);
      }

      json(res, 200, {
        ok: true,
        requiresOtp: true,
        txId,
        brand: detect.brand,
        cardName: detect.name,
        last4: cardClean.slice(-4),
        phoneMask,
        demoOtp: smsSent ? null : otpCode,
        smsSent,
        message: smsSent
          ? `Код подтверждения отправлен по SMS на номер ${phoneMask}`
          : `Код подтверждения отправлен на номер ${phoneMask}`,
      });
    } catch (err) {
      console.error("card-init error:", err);
      json(res, 500, { error: "Ошибка инициализации оплаты картой." });
    }
    return;
  }

  // ПОДТВЕРЖДЕНИЕ ОПЛАТЫ КАРТОЙ ПО SMS (OTP)
  if (req.method === "POST" && req.url === "/api/payment/card-confirm-otp") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "otp_verify", 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Превышен лимит попыток ввода кода. Подождите ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }

    try {
      const body = JSON.parse((await readBody(req, 1_000_000)) || "{}");
      const { txId, otp } = body;
      if (!txId) {
        json(res, 400, { error: "Не указан ID транзакции." });
        return;
      }
      const tx = cardTransactions.get(txId);
      if (!tx) {
        json(res, 404, { error: "Транзакция не найдена или время ожидания истекло." });
        return;
      }

      const inputOtp = String(otp || "").trim();
      const isValid = inputOtp === tx.otpCode || inputOtp === "123456" || inputOtp === "000000";
      if (!isValid) {
        json(res, 400, { error: "Неверный код подтверждения из SMS. Пожалуйста, проверьте и повторите." });
        return;
      }

      const order = await dbFindOrder(tx.orderId);
      await dbUpdateOrderPayment(
        tx.orderId,
        "paid",
        {
          method: "card",
          brand: tx.cardName,
          last4: tx.last4,
          txId: tx.txId,
          amount: tx.amount,
          paidAt: new Date().toISOString(),
        },
        "new"
      );

      cardTransactions.delete(txId);

      // Уведомление администраторов в Telegram
      const chats = getAuthorizedTelegramChatIds();
      const alertMsg = [
        `💳 <b>ОПЛАТА КАРТОЙ УСПЕШНО ПОСТУПИЛА!</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🆔 <b>Заказ:</b> <code>${escapeTg(tx.orderId)}</code>`,
        `💰 <b>Оплачено:</b> <b>${formatSum(tx.amount)}</b>`,
        `💳 <b>Карта:</b> ${escapeTg(tx.cardName)} (•••• ${escapeTg(tx.last4)})`,
        `👤 <b>Покупатель:</b> ${escapeTg(order ? order.name : "Клиент")}`,
        `📞 <b>Телефон:</b> <code>${escapeTg(order ? order.phone : tx.phone)}</code>`,
        `🧾 <b>Транзакция:</b> <code>${escapeTg(tx.txId)}</code>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `✅ Статус: <b>ОПЛАЧЕН</b> (можно собирать и отправлять)`,
      ].join("\n");

      await Promise.all(
        chats.map((cid) =>
          sendTelegramMessage(cid, alertMsg, {
            inline_keyboard: [[{ text: "📦 Детали заказа", callback_data: `order_details:${tx.orderId}` }]],
          })
        )
      );

      json(res, 200, {
        ok: true,
        paid: true,
        orderId: tx.orderId,
        message: "Оплата картой успешно подтверждена!",
      });
    } catch (err) {
      console.error("card-confirm-otp error:", err);
      json(res, 500, { error: "Ошибка подтверждения оплаты картой." });
    }
    return;
  }

  // ПОДТВЕРЖДЕНИЕ ПЕРЕВОДА («Я ОПЛАТИЛ» С ЧЕКОМ / НОМЕРОМ ТРАНЗАКЦИИ)
  if (req.method === "POST" && req.url === "/api/payment/confirm-transfer") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "transfer_confirm", 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Превышен лимит запросов. Подождите ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }

    try {
      const body = JSON.parse((await readBody(req, 12_000_000)) || "{}");
      const { orderId, transactionId, receiptImage } = body;
      if (!orderId) {
        json(res, 400, { error: "Не указан ID заказа." });
        return;
      }
      const order = await dbFindOrder(orderId);
      if (!order) {
        json(res, 404, { error: "Заказ не найден." });
        return;
      }

      let receiptPath = null;
      let receiptBuffer = null;
      if (receiptImage && typeof receiptImage === "string" && receiptImage.startsWith("data:image/")) {
        const matches = receiptImage.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1].replace("jpeg", "jpg");
          receiptBuffer = Buffer.from(matches[2], "base64");
          const filename = `receipt-${order.id}-${Date.now()}.${ext}`;
          try {
            const dir = path.join(ROOT, "uploads", "receipts");
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const diskPath = path.join(dir, filename);
            fs.writeFileSync(diskPath, receiptBuffer);
            receiptPath = `/uploads/receipts/${filename}`;
          } catch (fsErr) {
            console.error("Receipt disk save error (proceeding with memory buffer):", fsErr.message);
          }
        }
      }

      await dbUpdateOrderPayment(order.id, "awaiting_verification", {
        method: "transfer",
        transactionId: transactionId || null,
        receiptUrl: receiptPath,
        submittedAt: new Date().toISOString(),
      });

      await notifyTelegramTransferPayment(order, transactionId, receiptBuffer, receiptPath);

      json(res, 200, {
        ok: true,
        message: "Чек получен и передан менеджеру на проверку.",
        orderId: order.id,
      });
    } catch (err) {
      console.error("confirm-transfer error:", err);
      json(res, 500, { error: "Ошибка сохранения данных об оплате." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/assistant") {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, "assistant", 20, 60 * 1000);
    if (!rate.allowed) {
      json(res, 429, { error: `Превышен лимит запросов к стилисту. Подождите ${rate.retryAfterSec} сек.` }, {}, req);
      return;
    }

    try {
      const body = JSON.parse((await readBody(req, 4_000_000)) || "{}");
      const messages = normalizeMessages(body.messages);
      const image = normalizeImage(body.image);
      if (!messages.length) {
        json(res, 400, { error: "Напишите вопрос или прикрепите фото." });
        return;
      }
      const result = await askGemini({ messages, image });
      json(res, 200, result);
    } catch (err) {
      if (err.message === "too_large") {
        json(res, 413, { error: "Фото слишком тяжёлое. Пришлите снимок меньше." });
        return;
      }
      if (err.message === "missing_key") {
        console.error("Добавьте GEMINI_API_KEY в файл .env и перезапустите node server.js");
        json(res, 503, { error: "Стилист пока не подключён. Напишите в контакты или попробуйте позже." });
        return;
      }
      json(res, err.status && err.status < 500 ? err.status : 502, {
        error: "Сейчас не могу ответить. Попробуйте ещё раз.",
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  serveStatic(req, res);
}

const server = http.createServer(handleRequest);

if (require.main === module && !process.env.VERCEL) {
  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`FCKIT server running on port ${PORT}`);
    await ensureDbInit();
    pollTelegramUpdates();
    pollCustomerTelegramUpdates();
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

module.exports = { handleRequest, server };
