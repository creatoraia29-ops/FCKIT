const cartBoard = document.getElementById("cartBoard");

// Валидация и автоопределение банковских карт для Узбекистана
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

  // 4. Mastercard: 16 цифр, начинается на 51-55 или 2221-2720 (включая кобейджинг)
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

  // В процессе набора первых цифр префикса
  if (["8", "86", "860", "5", "56", "54", "6", "62", "9", "98", "986", "2", "22", "222"].includes(d)) {
    return { brand: null, name: "", valid: false, needsCvv: false, error: null };
  }

  // Запрещённые платёжные системы
  if (mc4 >= 2200 && mc4 <= 2204) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "⚠️ Карты «МИР» не поддерживаются. Принимаются только карты банков Узбекистана: Uzcard, Humo, Visa и Mastercard.",
    };
  }
  if (d.startsWith("62") && !d.startsWith("6262")) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "⚠️ Карты UnionPay не поддерживаются. Доступны только карты Узбекистана: Uzcard, Humo, Visa и Mastercard.",
    };
  }
  if (d.startsWith("34") || d.startsWith("37")) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "⚠️ Карты American Express не поддерживаются. Доступны только карты Узбекистана: Uzcard, Humo, Visa и Mastercard.",
    };
  }

  if (d.length >= 4) {
    return {
      brand: null,
      name: "",
      valid: false,
      error: "⚠️ Поддерживаются исключительно банковские карты Узбекистана: Uzcard, Humo, Visa и Mastercard.",
    };
  }

  return { brand: null, name: "", valid: false, needsCvv: false, error: null };
}

function lineMarkup(row) {
  const { item, qty } = row;
  return `
    <article class="cart-item">
      ${mediaMarkup(item, "cart-item__visual")}
      <div class="cart-item__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
        <h3 class="cart-item__title">${item.title}</h3>
        <p class="card__price">${formatPrice(itemPrice(item))}</p>
      </div>
      <div class="cart-item__tools">
        <div class="qty" aria-label="Количество">
          <button type="button" class="btn" data-cart-action="dec" data-id="${item.id}" aria-label="Уменьшить количество">−</button>
          <span class="qty__value">${qty}</span>
          <button type="button" class="btn" data-cart-action="inc" data-id="${item.id}" aria-label="Увеличить количество">+</button>
        </div>
        <p class="cart-item__sum">${formatPrice(itemPrice(item) * qty)}</p>
        <button type="button" class="btn" data-cart-action="remove" data-id="${item.id}">Убрать</button>
      </div>
    </article>`;
}

function checkoutMarkup(total) {
  return `
    <form class="checkout" id="checkoutForm">
      <div class="checkout__head">
        <h3>Оформить заказ</h3>
        <p>Доставка напрямую из Китая по всему Узбекистану за 7–10 дней.</p>
      </div>
      <div class="checkout__grid">
        <label class="checkout__field">
          <span>Ваше имя</span>
          <input name="name" type="text" maxlength="80" autocomplete="name" placeholder="Имя и фамилия" required />
        </label>
        <label class="checkout__field">
          <span>Номер телефона</span>
          <input name="phone" type="tel" maxlength="40" autocomplete="tel" placeholder="+998 90 123 45 67" required />
        </label>
        <label class="checkout__field checkout__field--wide">
          <span>Город и адрес доставки</span>
          <input name="note" type="text" maxlength="240" placeholder="Ташкент, Самарканд... адрес или пункт выдачи, размер" />
        </label>
      </div>

      <!-- Выбор способа оплаты -->
      <div class="pay-methods-title">Способ оплаты (только для Узбекистана)</div>
      <div class="pay-methods-grid">
        <label class="pay-method-card is-selected" id="lblPayCard">
          <input type="radio" name="paymentMethod" value="online_card" checked />
          <div class="pay-method-info">
            <span class="pay-method-name">💳 Картой онлайн</span>
            <span class="pay-method-desc">Uzcard, Humo, Visa, Mastercard</span>
          </div>
        </label>
        <label class="pay-method-card" id="lblPayTransfer">
          <input type="radio" name="paymentMethod" value="transfer" />
          <div class="pay-method-info">
            <span class="pay-method-name">📲 Перевод на карту</span>
            <span class="pay-method-desc">Visa Uzum, Click, Payme</span>
          </div>
        </label>
      </div>

      <!-- 1. Панель ввода банковской карты -->
      <div class="card-pay-box" id="cardPayPanel">
        <div class="card-brands-header">
          <span class="card-brands-label">Банковские карты Узбекистана</span>
          <div class="card-brands-row">
            <span class="card-brand-badge" id="badgeUzcard" title="Uzcard">
              <img src="img/cards/uzcard.svg" alt="Uzcard" />
            </span>
            <span class="card-brand-badge" id="badgeHumo" title="Humo">
              <img src="img/cards/humo.svg" alt="Humo" />
            </span>
            <span class="card-brand-badge" id="badgeVisa" title="Visa">
              <img src="img/cards/visa.svg" alt="Visa" />
            </span>
            <span class="card-brand-badge" id="badgeMastercard" title="Mastercard">
              <img src="img/cards/mastercard.svg" alt="Mastercard" />
            </span>
          </div>
        </div>

        <label class="checkout__field checkout__field--wide" style="margin: 0;">
          <span>Номер карты (16 цифр)</span>
          <input type="text" id="cardNumInput" placeholder="8600 •••• •••• ••••" inputmode="numeric" autocomplete="cc-number" maxlength="19" />
        </label>
        <div class="card-error-banner" id="cardErrorBanner"></div>

        <div class="card-row-two">
          <label class="checkout__field" style="margin: 0;">
            <span>Срок действия</span>
            <input type="text" id="cardExpInput" placeholder="ММ / ГГ" inputmode="numeric" autocomplete="cc-exp" maxlength="5" />
          </label>
          <label class="checkout__field" id="cardCvvField" style="margin: 0;">
            <span>Код CVV / CVC</span>
            <input type="password" id="cardCvvInput" placeholder="•••" inputmode="numeric" autocomplete="cc-csc" maxlength="3" />
          </label>
        </div>

        <div class="card-sms-note" id="cardSmsNote">
          🔒 Оплата защищена. Списание производится в узбекских сумах (UZS).
        </div>
      </div>

      <!-- 2. Панель для перевода на карту -->
      <div class="card-pay-box" id="transferPreviewPanel" style="display: none;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--fg);">
          📲 <b>Прямой перевод на карту Visa Uzum Bank</b> через мобильные приложения <b>Uzum Bank</b>, <b>Click</b> или <b>Payme</b>.<br>
          <span style="color: var(--muted); font-size: 12px;">Реквизиты карты и форма отправки чека откроются сразу после нажатия кнопки.</span>
        </p>
      </div>

      <button type="submit" class="btn btn-primary" id="btnSubmitOrder" style="width: 100%; min-height: 48px; font-size: 16px; margin-top: 6px;">
        💳 Оплатить картой ${formatPrice(total)}
      </button>
    </form>`;
}

function renderCart() {
  const rows = cartLines();
  if (!rows.length) {
    cartBoard.innerHTML = `
      <div class="cart-empty">
        <p>В корзине пока ничего нет.</p>
        <a class="btn btn-primary" href="catalog.html">В каталог</a>
      </div>`;
    return;
  }

  const total = rows.reduce((sum, row) => sum + itemPrice(row.item) * row.qty, 0);
  cartBoard.innerHTML = `
    <div class="cart-list">
      ${rows.map(lineMarkup).join("")}
    </div>
    <div class="cart-summary">
      <p class="cart-total">Итого: <strong>${formatPrice(total)}</strong></p>
      <button type="button" class="btn" data-cart-action="clear">Очистить</button>
    </div>
    ${checkoutMarkup(total)}`;
}

function initPaymentEvents(total) {
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  const cardPanel = document.getElementById("cardPayPanel");
  const transferPanel = document.getElementById("transferPreviewPanel");
  const btnSubmit = document.getElementById("btnSubmitOrder");

  const cardNumInput = document.getElementById("cardNumInput");
  const cardExpInput = document.getElementById("cardExpInput");
  const cardCvvInput = document.getElementById("cardCvvInput");
  const cardCvvField = document.getElementById("cardCvvField");
  const cardErrorBanner = document.getElementById("cardErrorBanner");
  const cardSmsNote = document.getElementById("cardSmsNote");

  const badges = {
    uzcard: document.getElementById("badgeUzcard"),
    humo: document.getElementById("badgeHumo"),
    visa: document.getElementById("badgeVisa"),
    mastercard: document.getElementById("badgeMastercard"),
  };

  // Переключение способов оплаты
  form.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".pay-method-card").forEach((card) => card.classList.remove("is-selected"));
      radio.closest(".pay-method-card")?.classList.add("is-selected");

      const method = radio.value;
      if (method === "online_card") {
        cardPanel.style.display = "flex";
        transferPanel.style.display = "none";
        btnSubmit.innerHTML = `💳 Оплатить картой ${formatPrice(total)}`;
      } else {
        cardPanel.style.display = "none";
        transferPanel.style.display = "block";
        btnSubmit.innerHTML = `📲 Перейти к оплате переводом ${formatPrice(total)}`;
      }
    });
  });

  // Автоформатирование и валидация номера карты
  if (cardNumInput) {
    cardNumInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").slice(0, 16);
      const parts = val.match(/.{1,4}/g);
      e.target.value = parts ? parts.join(" ") : "";

      const detect = detectUzbekCard(val);

      // Ошибка недопустимой карты
      if (detect.error) {
        cardErrorBanner.textContent = detect.error;
        cardErrorBanner.style.display = "block";
      } else {
        cardErrorBanner.style.display = "none";
      }

      // Подсветка брендов
      Object.keys(badges).forEach((key) => {
        const el = badges[key];
        if (!el) return;
        el.classList.remove("is-active", "is-dimmed");
        if (detect.brand) {
          if (detect.brand === key) {
            el.classList.add("is-active");
          } else {
            el.classList.add("is-dimmed");
          }
        }
      });

      // Переключение CVV/CVC для Uzcard/Humo vs Visa/Mastercard
      if (detect.brand === "uzcard" || detect.brand === "humo") {
        cardCvvField.style.display = "none";
        cardCvvInput.removeAttribute("required");
        cardCvvInput.value = "";
        cardSmsNote.innerHTML = `🔒 <b>Для карты ${detect.name} CVV не нужен</b> — списание подтверждается кодом по SMS (OTP).`;
      } else if (detect.brand === "visa" || detect.brand === "mastercard") {
        cardCvvField.style.display = "flex";
        cardCvvInput.setAttribute("required", "required");
        cardSmsNote.innerHTML = `🔒 Карта <b>${detect.name}</b>: введите CVV/CVC с обратной стороны карты.`;
      } else {
        cardCvvField.style.display = "flex";
        cardSmsNote.innerHTML = `🔒 Оплата защищена. Списание производится в узбекских сумах (UZS).`;
      }
    });
  }

  // Срок действия MM/YY
  if (cardExpInput) {
    cardExpInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").slice(0, 4);
      if (val.length >= 2) {
        const mm = Number(val.slice(0, 2));
        if (mm > 12) val = "12" + val.slice(2);
        if (mm === 0) val = "01" + val.slice(2);
        val = val.slice(0, 2) + "/" + val.slice(2);
      }
      e.target.value = val;
    });
  }

  // CVV код
  if (cardCvvInput) {
    cardCvvInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 3);
    });
  }

  // Обработка отправки формы оформления
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const method = data.get("paymentMethod") || "online_card";

    // Клиентская валидация при оплате картой
    if (method === "online_card") {
      const rawCard = (cardNumInput?.value || "").replace(/\D/g, "");
      const detect = detectUzbekCard(rawCard);
      if (!detect.valid || !detect.brand) {
        alert(detect.error || "Пожалуйста, введите корректный 16-значный номер карты Узбекистана (Uzcard, Humo, Visa или Mastercard).");
        cardNumInput?.focus();
        return;
      }
      const exp = (cardExpInput?.value || "").trim();
      if (!/^(0[1-9]|1[0-2])\/?([2-9][0-9])$/.test(exp)) {
        alert("Пожалуйста, укажите срок действия карты в формате MM/YY.");
        cardExpInput?.focus();
        return;
      }
      if (detect.needsCvv) {
        const cvv = (cardCvvInput?.value || "").trim();
        if (cvv.length !== 3) {
          alert(`Для карты ${detect.name} необходимо указать 3 цифры CVV/CVC кода.`);
          cardCvvInput?.focus();
          return;
        }
      }
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Создание заказа...";

    const order = placeOrder({
      name: data.get("name"),
      phone: data.get("phone"),
      note: data.get("note"),
      paymentMethod: method,
      paymentStatus: "pending",
    });

    if (!order) {
      btnSubmit.disabled = false;
      return;
    }

    try {
      // Отправляем заказ на сервер
      await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
    } catch (err) {
      console.error("Ошибка сохранения заказа:", err);
    }

    // Ветвление по способам оплаты:
    if (method === "online_card") {
      btnSubmit.textContent = "Связь с банком...";
      const rawCard = (cardNumInput?.value || "").replace(/\D/g, "");
      const exp = (cardExpInput?.value || "").trim();
      const cvv = (cardCvvInput?.value || "").trim();

      try {
        const initRes = await fetch("/api/payment/card-init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            cardNumber: rawCard,
            exp,
            cvv,
          }),
        });

        const initData = await initRes.json();
        if (!initRes.ok || !initData.ok) {
          alert(initData.error || "Ошибка инициализации оплаты картой.");
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `💳 Оплатить картой ${formatPrice(total)}`;
          return;
        }

        // Открываем модальное окно ввода SMS OTP
        showOtpModal({
          order,
          txId: initData.txId,
          brand: initData.cardName,
          last4: initData.last4,
          phoneMask: initData.phoneMask,
          demoOtp: initData.demoOtp,
        });
      } catch (e) {
        alert("Не удалось связаться с платёжным сервером. Попробуйте позже.");
        btnSubmit.disabled = false;
      }
    } else {
      // Открываем экран перевода на карту Visa Uzum
      renderTransferScreen(order);
    }
  });
}

// Модальное окно SMS-подтверждения (OTP)
function showOtpModal({ order, txId, brand, last4, phoneMask, demoOtp }) {
  const overlay = document.createElement("div");
  overlay.className = "otp-overlay";
  overlay.innerHTML = `
    <div class="otp-dialog">
      <div style="font-size: 36px;">📱</div>
      <h3 style="margin: 0; font-size: 20px;">Подтверждение оплаты</h3>
      <p style="margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.45;">
        На номер <strong>${escapeHtml(phoneMask)}</strong> отправлено SMS с кодом подтверждения для списания <strong>${formatPrice(order.total)}</strong> с карты <strong>${escapeHtml(brand)}</strong> (•••• ${escapeHtml(last4)}).
      </p>
      ${demoOtp ? `<div style="padding: 6px 10px; background: rgba(0, 165, 80, 0.15); border: 1px solid rgba(0, 165, 80, 0.35); border-radius: 6px; font-size: 12px; color: #2ecc71;">Код подтверждения: <strong>${demoOtp}</strong> (или 123456)</div>` : ""}
      
      <input type="text" class="otp-input" id="otpCodeInput" maxlength="6" inputmode="numeric" placeholder="••••••" autofocus />
      <div id="otpErrorMsg" style="color: #ff6b6b; font-size: 13px; display: none;"></div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <button type="button" class="btn btn-primary" id="btnConfirmOtp" style="min-height: 46px;">
          Подтвердить списание ${formatPrice(order.total)}
        </button>
        <button type="button" class="btn" id="btnCancelOtp">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const otpInput = overlay.querySelector("#otpCodeInput");
  const btnConfirm = overlay.querySelector("#btnConfirmOtp");
  const btnCancel = overlay.querySelector("#btnCancelOtp");
  const errorMsg = overlay.querySelector("#otpErrorMsg");

  otpInput?.focus();

  btnCancel.addEventListener("click", () => {
    overlay.remove();
  });

  const submitOtp = async () => {
    const code = (otpInput?.value || "").trim();
    if (code.length < 4) {
      errorMsg.textContent = "Введите код из SMS (6 цифр)";
      errorMsg.style.display = "block";
      return;
    }
    btnConfirm.disabled = true;
    btnConfirm.textContent = "Проверка...";
    errorMsg.style.display = "none";

    try {
      const res = await fetch("/api/payment/card-confirm-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, otp: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        errorMsg.textContent = data.error || "Неверный код подтверждения.";
        errorMsg.style.display = "block";
        btnConfirm.disabled = false;
        btnConfirm.textContent = `Подтвердить списание ${formatPrice(order.total)}`;
        return;
      }

      overlay.remove();
      renderCardSuccessScreen(order, brand, last4);
    } catch (e) {
      errorMsg.textContent = "Ошибка связи с сервером.";
      errorMsg.style.display = "block";
      btnConfirm.disabled = false;
      btnConfirm.textContent = "Попробовать снова";
    }
  };

  btnConfirm.addEventListener("click", submitOtp);
  otpInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitOtp();
  });
}

// Экран успешной оплаты картой
function renderCardSuccessScreen(order, brand, last4) {
  cartBoard.innerHTML = `
    <div class="cart-empty" style="text-align: center; max-width: 480px; margin: 0 auto;">
      <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
      <h3 style="margin: 0; font-size: 22px; color: #2ecc71;">Оплата прошла успешно!</h3>
      <p style="margin: 8px 0; font-size: 15px;">
        Номер заказа: <strong>${escapeHtml(order.id)}</strong><br>
        Сумма списания: <strong>${formatPrice(order.total)}</strong><br>
        Карта: <strong>${escapeHtml(brand)}</strong> (•••• ${escapeHtml(last4)})
      </p>
      <p style="color: var(--muted); font-size: 13.5px; line-height: 1.45;">
        Электронный чек сформирован. Менеджер уже передал ваш заказ на склад для прямой доставки из Китая за 7–10 дней.
      </p>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 22px;">
        <a class="btn btn-primary" href="https://t.me/FCKIT_USERBot?start=${encodeURIComponent(order.id)}" target="_blank" rel="noopener">
          🤖 Отслеживать статус в Telegram-боте
        </a>
        <a class="btn" href="catalog.html">Вернуться в каталог</a>
      </div>
    </div>`;
}

// Экран перевода на карту Visa Uzum (с защищённой подгрузкой реквизитов из .env)
async function renderTransferScreen(order) {
  cartBoard.innerHTML = `
    <div class="cart-empty" style="text-align: center; max-width: 420px; margin: 0 auto;">
      <p>Загрузка платёжных реквизитов...</p>
    </div>`;

  try {
    const res = await fetch(`/api/payment/requisites?orderId=${encodeURIComponent(order.id)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || "Не удалось загрузить реквизиты перевода.");
      return;
    }

    cartBoard.innerHTML = `
      <div class="transfer-view">
        <div style="text-align: center;">
          <h3 style="margin: 0 0 4px; font-size: 21px;">Оплата переводом на карту</h3>
          <p style="margin: 0; font-size: 13px; color: var(--muted);">Заказ #${escapeHtml(order.id)}</p>
        </div>

        <div class="transfer-amount-card">
          <div class="transfer-amount-label">Точная сумма к переводу:</div>
          <div class="transfer-amount-value">${data.totalFormatted}</div>
        </div>

        <!-- Пластиковая карточка реквизитов -->
        <div class="transfer-card-plate">
          <div class="transfer-plate-top">
            <span class="transfer-bank-name">${escapeHtml(data.bank)}</span>
            <img src="img/cards/visa.svg" alt="Visa" style="height: 22px; width: auto;" />
          </div>
          <div class="transfer-card-digits" id="transferCardDigits">${escapeHtml(data.cardNumber)}</div>
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <span style="font-size: 12px; color: #cbd5e0; letter-spacing: 0.04em;">ПОЛУЧАТЕЛЬ: ${escapeHtml(data.recipientName)}</span>
            <button type="button" class="btn-copy-card" id="btnCopyCard">
              📋 Скопировать номер карты
            </button>
          </div>
        </div>

        <!-- Инструкция -->
        <div class="transfer-steps-list">
          <div><b>1.</b> Скопируйте номер карты Visa Uzum выше</div>
          <div><b>2.</b> Откройте приложение <b>Uzum Bank</b>, <b>Click</b> или <b>Payme</b></div>
          <div><b>3.</b> Переведите точную сумму: <b>${data.totalFormatted}</b></div>
          <div><b>4.</b> Прикрепите скриншот чека или укажите номер квитанции и нажмите «Я оплатил»</div>
        </div>

        <!-- Форма подтверждения перевода («Я оплатил») -->
        <form id="transferConfirmForm" style="display: flex; flex-direction: column; gap: 12px;">
          <label class="checkout__field">
            <span>Номер транзакции / квитанции (если есть)</span>
            <input type="text" id="transferTxInput" placeholder="напр. TX-9841284 или 12345678" />
          </label>

          <label class="checkout__field">
            <span>Скриншот чека (рекомендуется)</span>
            <div class="receipt-dropzone" id="receiptDropzone">
              <span id="receiptDropText">📁 Нажмите для выбора фото чека</span>
              <input type="file" id="receiptFileInput" accept="image/*" style="display: none;" />
              <img id="receiptPreview" class="receipt-preview-img" style="display: none;" alt="Чек" />
            </div>
          </label>

          <button type="submit" class="btn btn-primary" id="btnSubmitTransfer" style="min-height: 48px; font-size: 16px;">
            ✅ Я оплатил
          </button>
        </form>
      </div>`;

    // Копирование номера карты
    const btnCopy = document.getElementById("btnCopyCard");
    btnCopy?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.cardNumberRaw);
        btnCopy.textContent = "✅ Скопировано!";
        btnCopy.classList.add("copied");
        setTimeout(() => {
          btnCopy.textContent = "📋 Скопировать номер карты";
          btnCopy.classList.remove("copied");
        }, 2500);
      } catch (err) {
        prompt("Скопируйте номер карты:", data.cardNumberRaw);
      }
    });

    // Загрузка скриншота чека
    const dropzone = document.getElementById("receiptDropzone");
    const fileInput = document.getElementById("receiptFileInput");
    const preview = document.getElementById("receiptPreview");
    const dropText = document.getElementById("receiptDropText");
    let receiptBase64 = null;

    dropzone?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          receiptBase64 = e.target.result;
          preview.src = receiptBase64;
          preview.style.display = "block";
          dropText.textContent = `Выбран файл: ${file.name}`;
        };
        reader.readAsDataURL(file);
      }
    });

    // Отправка формы «Я оплатил»
    const confirmForm = document.getElementById("transferConfirmForm");
    confirmForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btnSubmitTransfer");
      btn.disabled = true;
      btn.textContent = "Отправка чека...";

      const txInput = document.getElementById("transferTxInput");
      const transactionId = (txInput?.value || "").trim();

      try {
        const confirmRes = await fetch("/api/payment/confirm-transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            transactionId,
            receiptImage: receiptBase64,
          }),
        });

        const confirmData = await confirmRes.json();
        if (!confirmRes.ok || !confirmData.ok) {
          alert(confirmData.error || "Не удалось отправить подтверждение.");
          btn.disabled = false;
          btn.textContent = "✅ Я оплатил";
          return;
        }

        renderTransferSuccessScreen(order);
      } catch (err) {
        alert("Ошибка связи с сервером при отправке чека.");
        btn.disabled = false;
      }
    });
  } catch (e) {
    alert("Ошибка загрузки реквизитов: " + e.message);
  }
}

// Экран успешного отправления чека перевода
function renderTransferSuccessScreen(order) {
  cartBoard.innerHTML = `
    <div class="cart-empty" style="text-align: center; max-width: 480px; margin: 0 auto;">
      <div style="font-size: 48px; margin-bottom: 8px;">📩</div>
      <h3 style="margin: 0; font-size: 22px; color: #2ecc71;">Чек получен на проверку!</h3>
      <p style="margin: 8px 0; font-size: 15px;">
        Номер заказа: <strong>${escapeHtml(order.id)}</strong><br>
        Сумма: <strong>${formatPrice(order.total)}</strong>
      </p>
      <p style="color: var(--muted); font-size: 13.5px; line-height: 1.45;">
        Менеджер FCKIT сверит перевод в течение 5–10 минут. Вы получите уведомление об успешном зачислении в Telegram-боте, и посылка будет сразу отправлена в сборку.
      </p>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 22px;">
        <a class="btn btn-primary" href="https://t.me/FCKIT_USERBot?start=${encodeURIComponent(order.id)}" target="_blank" rel="noopener">
          🤖 Отслеживать статус в Telegram-боте
        </a>
        <a class="btn" href="catalog.html">Вернуться в каталог</a>
      </div>
    </div>`;
}

function bindCheckout() {
  const rows = cartLines();
  if (!rows.length) return;
  const total = rows.reduce((sum, row) => sum + itemPrice(row.item) * row.qty, 0);
  initPaymentEvents(total);
}

cartBoard.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.cartAction;
  if (action === "inc") changeQty(id, 1);
  if (action === "dec") changeQty(id, -1);
  if (action === "remove") removeFromCart(id);
  if (action === "clear") writeCart([]);
  renderCart();
  bindCheckout();
});

renderCart();
bindCheckout();
