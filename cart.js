const cartBoard = document.getElementById("cartBoard");

function apiEndpoint(path) {
  if (typeof getApiUrl === "function") return getApiUrl(path);
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
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
        <p>Прямая доставка из Китая по всему Узбекистану за 7–10 дней.</p>
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
      <div class="pay-methods-title">Способ оплаты (Узбекистан)</div>
      <div class="pay-methods-grid">
        <label class="pay-method-card is-selected" id="lblPayTransfer">
          <input type="radio" name="paymentMethod" value="transfer" checked />
          <div class="pay-method-info">
            <span class="pay-method-name">📲 Перевод на карту</span>
            <span class="pay-method-desc">Visa Uzum Bank / Любой банк Узбекистана</span>
          </div>
        </label>
        <label class="pay-method-card" id="lblPayApps">
          <input type="radio" name="paymentMethod" value="apps" />
          <div class="pay-method-info">
            <span class="pay-method-name">⚡ Банковские приложения</span>
            <span class="pay-method-desc">Payme, Click, Uzum Bank</span>
          </div>
        </label>
      </div>

      <!-- Подсказка выбранного способа оплаты -->
      <div class="card-pay-box" id="payMethodNotice">
        <p id="payMethodNoticeText" style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--fg);">
          📲 <b>Прямой перевод на карту Visa Uzum Bank</b> через мобильный банкинг любого банка Узбекистана.<br>
          <span style="color: var(--muted); font-size: 12px;">Реквизиты карты, сумма к переводу и форма отправки чека будут показаны сразу после подтверждения заказа.</span>
        </p>
      </div>

      <!-- Важная информация перед оплатой мелким красным шрифтом -->
      <div class="cart-important-warning" style="margin: 14px 0 8px; padding: 12px 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; font-size: 11.5px; line-height: 1.55; color: #ef4444;">
        <div style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> ВАЖНАЯ ИНФОРМАЦИЯ О ДОСТАВКЕ И ОПЛАТЕ:
        </div>
        <ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px;">
          <li><b>Доставка до вас не входит в цену товара</b> и оплачивается покупателем отдельно при вручении курьеру на руки либо через сервис <b>Yandex Go</b>.</li>
          <li>Срок экспресс-доставки из Китая в города Узбекистана составляет <b>7–10 рабочих дней</b> с предоставлением трек-номера.</li>
          <li>После оплаты обязательно прикрепите фото или скриншот чека из галереи телефона для быстрой сборки и передачи посылки в логистику.</li>
        </ul>
      </div>

      <button type="submit" class="btn btn-primary" id="btnSubmitOrder" style="width: 100%; min-height: 48px; font-size: 16px; margin-top: 6px;">
        📲 Перейти к оплате ${formatPrice(total)}
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
      <div>
        <p class="cart-total" style="margin: 0;">Итого: <strong>${formatPrice(total)}</strong></p>
        <span style="color: #ef4444; font-size: 11.5px; font-weight: 500; display: block; margin-top: 3px;">
          * Доставка не входит в итоговую цену и оплачивается отдельно при получении (курьеру / Yandex Go)
        </span>
      </div>
      <button type="button" class="btn" data-cart-action="clear">Очистить</button>
    </div>
    ${checkoutMarkup(total)}`;
}

function initPaymentEvents(total) {
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  const btnSubmit = document.getElementById("btnSubmitOrder");
  const noticeText = document.getElementById("payMethodNoticeText");

  // Переключение способов оплаты (только перевод и приложения)
  form.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".pay-method-card").forEach((card) => card.classList.remove("is-selected"));
      radio.closest(".pay-method-card")?.classList.add("is-selected");

      const method = radio.value;
      if (method === "apps") {
        if (noticeText) {
          noticeText.innerHTML = `⚡ <b>Оплата через приложения Payme, Click или Uzum Bank.</b><br><span style="color: var(--muted); font-size: 12px;">Вам будут доступны прямые кнопки перехода в Payme / Click и реквизиты с подтверждением чека.</span>`;
        }
        btnSubmit.innerHTML = `⚡ Оплатить через Payme / Click ${formatPrice(total)}`;
      } else {
        if (noticeText) {
          noticeText.innerHTML = `📲 <b>Прямой перевод на карту Visa Uzum Bank</b> через мобильный банкинг любого банка Узбекистана.<br><span style="color: var(--muted); font-size: 12px;">Реквизиты карты, сумма к переводу и форма отправки чека откроются сразу после подтверждения заказа.</span>`;
        }
        btnSubmit.innerHTML = `📲 Перейти к оплате ${formatPrice(total)}`;
      }
    });
  });

  // Обработка отправки формы оформления
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const method = data.get("paymentMethod") || "transfer";

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
      const res = await fetch(apiEndpoint("/api/order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const orderRes = await res.json().catch(() => ({}));
      if (orderRes && orderRes.total) {
        order.total = orderRes.total;
        if (orderRes.paymeUrl) order.paymeUrl = orderRes.paymeUrl;
        if (orderRes.clickUrl) order.clickUrl = orderRes.clickUrl;
      }
    } catch (err) {
      console.error("Ошибка сохранения заказа:", err);
    }

    // Переходим на экран оплаты
    renderTransferScreen(order, method);
  });
}

// Сжатие изображений на стороне клиента через Canvas
function compressImageClient(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function attachReceiptWidgetMarkup(order) {
  return `
    <div class="receipt-attach-box" style="margin-top: 18px; padding: 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 8px; text-align: left;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">📎 Чек или квитанция об оплате</div>
      <p style="margin: 0 0 10px; font-size: 12px; color: var(--muted); line-height: 1.4;">
        Если вы перевели оплату через приложение банка (Click, Payme, Uzum), прикрепите фото или скриншот чека для ускорения отправки:
      </p>
      <div id="postReceiptDropzone" style="position: relative; min-height: 48px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--line); border-radius: 6px; padding: 10px; cursor: pointer; text-align: center; transition: border-color 0.2s;">
        <input type="file" id="postReceiptInput" accept="image/*" style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 5;" />
        <span id="postReceiptStatus" style="font-size: 13px;">📁 Нажмите, чтобы прикрепить фото чека из галереи</span>
      </div>
    </div>`;
}

function bindPostReceiptWidget(order) {
  const input = document.getElementById("postReceiptInput");
  const status = document.getElementById("postReceiptStatus");
  if (!input || !status) return;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    status.textContent = "⏳ Сжатие и отправка чека...";
    try {
      const b64 = await compressImageClient(file);
      const res = await fetch(apiEndpoint("/api/payment/confirm-transfer"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          receiptImage: b64,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        status.innerHTML = "✅ <strong>Чек успешно получен и отправлен менеджеру!</strong>";
        status.style.color = "#2ecc71";
      } else {
        status.textContent = "❌ Ошибка: " + (data.error || "не удалось сохранить чек");
        status.style.color = "#ff6b6b";
      }
    } catch (err) {
      status.textContent = "❌ Ошибка отправки: " + err.message;
      status.style.color = "#ff6b6b";
    }
  });
}

// Экран перевода на карту и оплаты через приложения (с защищённой подгрузкой реквизитов из .env)
async function renderTransferScreen(order, method = "transfer") {
  cartBoard.innerHTML = `
    <div class="cart-empty" style="text-align: center; max-width: 420px; margin: 0 auto;">
      <p>Загрузка платёжных реквизитов...</p>
    </div>`;

  try {
    const res = await fetch(apiEndpoint(`/api/payment/requisites?orderId=${encodeURIComponent(order.id)}`));
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || "Не удалось загрузить реквизиты перевода.");
      return;
    }

    cartBoard.innerHTML = `
      <div class="transfer-view">
        <div style="text-align: center;">
          <h3 style="margin: 0 0 4px; font-size: 21px;">${method === "apps" ? "Оплата через банковские приложения" : "Оплата переводом на карту"}</h3>
          <p style="margin: 0; font-size: 13px; color: var(--muted);">Заказ #${escapeHtml(order.id)}</p>
        </div>

        <div class="transfer-amount-card">
          <div class="transfer-amount-label">Точная сумма к оплате:</div>
          <div class="transfer-amount-value">${data.totalFormatted}</div>
        </div>

        <!-- Важная информация красным мелким шрифтом -->
        <div class="cart-important-warning" style="margin: 4px 0 12px; padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; font-size: 11.5px; line-height: 1.45; color: #ef4444;">
          ⚠️ <b>Внимание:</b> Стоимость доставки <b>не входит</b> в эту сумму. Доставка оплачивается покупателем отдельно при получении на руки курьеру либо через сервис <b>Yandex Go</b>.
        </div>

        <!-- Быстрая оплата в местных приложениях -->
        <div class="local-apps-box" style="padding: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 8px;">
            Оплата через мобильные приложения:
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
            ${data.clickUrl ? `<a href="${data.clickUrl}" target="_blank" rel="noopener" class="btn" style="background: #0073ff; color: #fff; font-weight: 600; text-align: center; border-color: #0073ff;">🔵 Click Pay</a>` : `<a href="https://my.click.uz/" target="_blank" rel="noopener" class="btn" style="background: rgba(0, 115, 255, 0.12); color: #0073ff; border: 1px solid rgba(0, 115, 255, 0.4); font-weight: 600; text-align: center;">🔵 Открыть Click</a>`}
            ${data.paymeUrl ? `<a href="${data.paymeUrl}" target="_blank" rel="noopener" class="btn" style="background: #25c2a0; color: #fff; font-weight: 600; text-align: center; border-color: #25c2a0;">🟣 Payme Pay</a>` : `<a href="https://payme.uz/" target="_blank" rel="noopener" class="btn" style="background: rgba(37, 194, 160, 0.12); color: #25c2a0; border: 1px solid rgba(37, 194, 160, 0.4); font-weight: 600; text-align: center;">🟣 Открыть Payme</a>`}
            <a href="https://uzumbank.uz/" target="_blank" rel="noopener" class="btn" style="background: rgba(123, 44, 191, 0.12); color: #c084fc; border: 1px solid rgba(123, 44, 191, 0.4); font-weight: 600; text-align: center;">🟢 Uzum Bank</a>
          </div>
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
          <div><b>1.</b> Скопируйте номер карты выше или откройте приложение <b>Click</b>, <b>Payme</b> или <b>Uzum Bank</b></div>
          <div><b>2.</b> Переведите точную сумму: <b>${data.totalFormatted}</b></div>
          <div><b>3.</b> Прикрепите фото или скриншот чека из галереи телефона/ПК (или укажите номер транзакции)</div>
          <div><b>4.</b> Нажмите «✅ Я оплатил» для быстрой передачи заказа в сборку</div>
        </div>

        <!-- Форма подтверждения перевода («Я оплатил») -->
        <form id="transferConfirmForm" style="display: flex; flex-direction: column; gap: 12px;">
          <label class="checkout__field">
            <span>Номер транзакции / квитанции (если есть)</span>
            <input type="text" id="transferTxInput" placeholder="напр. TX-9841284 или 12345678" />
          </label>

          <div class="checkout__field">
            <span>Скриншот или фото чека (рекомендуется)</span>
            <div class="receipt-dropzone" id="receiptDropzone" style="position: relative; cursor: pointer; min-height: 85px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed var(--line); border-radius: 8px; padding: 14px; background: rgba(255,255,255,0.02); text-align: center; transition: border-color 0.2s;">
              <input type="file" id="receiptFileInput" accept="image/*" style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 5;" />
              <div id="receiptPrompt" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <span style="font-size: 26px;">📁</span>
                <span id="receiptDropText" style="font-weight: 500; font-size: 14px;">Нажмите для выбора фото чека из галереи</span>
                <span style="font-size: 11.5px; color: var(--muted);">Поддерживаются любые фото чека с телефона или ПК (или Ctrl+V)</span>
              </div>
              <div id="receiptPreviewBox" style="display: none; align-items: center; gap: 12px; width: 100%;">
                <img id="receiptPreview" class="receipt-preview-img" style="max-width: 65px; max-height: 65px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line);" alt="Чек" />
                <div style="text-align: left; flex: 1; overflow: hidden;">
                  <span id="receiptFileName" style="font-size: 13px; font-weight: 500; display: block; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">receipt.jpg</span>
                  <span style="font-size: 11.5px; color: #2ecc71;">Чек прикреплен</span>
                </div>
                <button type="button" class="btn" id="btnRemoveReceipt" style="position: relative; z-index: 10; padding: 4px 10px; font-size: 12px;">Удалить</button>
              </div>
            </div>
          </div>

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
    const fileInput = document.getElementById("receiptFileInput");
    const preview = document.getElementById("receiptPreview");
    const promptBox = document.getElementById("receiptPrompt");
    const previewBox = document.getElementById("receiptPreviewBox");
    const fileNameSpan = document.getElementById("receiptFileName");
    const btnRemoveReceipt = document.getElementById("btnRemoveReceipt");
    let receiptBase64 = null;

    const setReceiptFile = async (file) => {
      if (!file) return;
      try {
        receiptBase64 = await compressImageClient(file);
        preview.src = receiptBase64;
        fileNameSpan.textContent = file.name || "Чек оплаты.jpg";
        promptBox.style.display = "none";
        previewBox.style.display = "flex";
      } catch (err) {
        alert("Не удалось прочитать фото чека: " + err.message);
      }
    };

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) setReceiptFile(file);
    });

    btnRemoveReceipt?.addEventListener("click", (e) => {
      e.stopPropagation();
      receiptBase64 = null;
      if (fileInput) fileInput.value = "";
      preview.src = "";
      previewBox.style.display = "none";
      promptBox.style.display = "flex";
    });

    // Вставка скриншота из буфера обмена (Ctrl+V)
    window.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) setReceiptFile(file);
          break;
        }
      }
    });

    // Drag-and-drop чека
    const dropzone = document.getElementById("receiptDropzone");
    if (dropzone) {
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--fg)";
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "var(--line)";
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--line)";
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith("image/")) {
          setReceiptFile(file);
        }
      });
    }

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
        const confirmRes = await fetch(apiEndpoint("/api/payment/confirm-transfer"), {
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

      <!-- Важная информация мелким красным шрифтом -->
      <div style="margin: 10px 0 14px; padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; font-size: 11.5px; line-height: 1.45; color: #ef4444; text-align: left;">
        ⚠️ <b>Напоминание о доставке:</b> Доставка не входила в оплаченную сумму и оплачивается покупателем отдельно курьеру на руки либо через сервис <b>Yandex Go</b> при вручении посылки.
      </div>

      <p style="color: var(--muted); font-size: 13.5px; line-height: 1.45;">
        Менеджер FCKIT сверит перевод в течение 5–10 минут. Вы получите уведомление в Telegram-боте, и посылка будет сразу передана в службу отправки.
      </p>
      ${attachReceiptWidgetMarkup(order)}
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 22px;">
        <a class="btn btn-primary" href="https://t.me/FCKIT_USERBot?start=${encodeURIComponent(order.id)}" target="_blank" rel="noopener">
          🤖 Отслеживать статус в Telegram-боте
        </a>
        <a class="btn" href="catalog.html">Вернуться в каталог</a>
      </div>
    </div>`;
  bindPostReceiptWidget(order);
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
