const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  initTurso,
  dbGetProducts,
  dbSaveProducts,
  dbSaveOrder,
  dbGetOrders,
  dbUpdateOrderStatus,
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
let telegramOffset = 0;

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

  const message = [
    `🛍 <b>НОВЫЙ ЗАКАЗ: ${escapeTg(order.id)}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Заказчик:</b> ${escapeTg(order.name || "Не указано")}`,
    `📞 <b>Телефон:</b> <code>${escapeTg(order.phone || "Не указан")}</code>`,
    order.note ? `📝 <b>Комментарий:</b> <i>${escapeTg(order.note)}</i>` : null,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Состав заказа:</b>`,
    itemsList || "—",
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 <b>ИТОГО К ОПЛАТЕ: ${formatSum(order.total)}</b>`,
    `🕒 <b>Время (Ташкент):</b> ${dateStr}`,
  ]
    .filter(Boolean)
    .join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [{ text: "✅ Отметить выполненным", callback_data: `order_done:${order.id}` }],
    ],
  };

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

      const oldText = cb.message?.text || "";
      const updatedText = oldText.includes("✅ ВЫПОЛНЕН")
        ? oldText
        : `${oldText}\n\n✅ <b>СТАТУС: ВЫПОЛНЕН (админ @${cb.from.username || cb.from.first_name})</b>`;

      await editTelegramMessage(chatId, cb.message.message_id, updatedText, null);
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

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBody(req, limit) {
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
  const full = path.normalize(path.join(ROOT, relative));
  if (!full.startsWith(ROOT)) return null;
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
      res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
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

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/products") {
    const list = await dbGetProducts();
    json(res, 200, list);
    return;
  }

  if (req.method === "POST" && req.url === "/api/products") {
    try {
      const list = JSON.parse((await readBody(req, 2_000_000)) || "[]");
      if (!Array.isArray(list)) {
        json(res, 400, { error: "Ожидался массив товаров." });
        return;
      }
      await dbSaveProducts(list);
      json(res, 200, { ok: true, count: list.length });
    } catch (err) {
      json(res, 500, { error: "Не удалось сохранить товары: " + err.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/promotions") {
    const list = await dbGetPromotions();
    json(res, 200, list);
    return;
  }

  if (req.method === "POST" && req.url === "/api/promotions") {
    try {
      const list = JSON.parse((await readBody(req, 1_000_000)) || "[]");
      if (!Array.isArray(list)) {
        json(res, 400, { error: "Ожидался массив акций." });
        return;
      }
      await dbSavePromotions(list);
      json(res, 200, { ok: true, count: list.length });
    } catch (err) {
      json(res, 500, { error: "Не удалось сохранить акции: " + err.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/order") {
    try {
      const body = JSON.parse((await readBody(req, 1_000_000)) || "{}");
      if (!body.id || !body.items) {
        json(res, 400, { error: "Некорректные данные заказа." });
        return;
      }
      dbSaveOrder(body).catch((err) => console.error("DB Order error:", err));
      notifyTelegramOrder(body).catch((err) => console.error("Telegram error:", err));
      json(res, 200, { ok: true, id: body.id });
    } catch (err) {
      console.error("Order API error:", err);
      json(res, 500, { error: "Ошибка обработки заказа." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/assistant") {
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
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`FCKIT: http://127.0.0.1:${PORT}`);
  try {
    await initTurso();
  } catch (err) {
    console.error("Init Turso error:", err.message);
  }
  try {
    await loadAuthorizedTelegramUsers();
  } catch (err) {
    console.error("Load Telegram users error:", err.message);
  }
  pollTelegramUpdates();
});
