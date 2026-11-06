(function bindAssistant() {
  const log = document.getElementById("assistantLog");
  const form = document.getElementById("assistantForm");
  const input = document.getElementById("assistantInput");
  const file = document.getElementById("assistantFile");
  const preview = document.getElementById("assistantPreview");
  const previewImg = document.getElementById("assistantPreviewImg");
  const clearPhoto = document.getElementById("assistantClearPhoto");
  const send = document.getElementById("assistantSend");
  if (!log || !form || !input || !file || !preview || !previewImg || !clearPhoto || !send) return;

  const history = [];
  let image = null;
  let busy = false;

  addMessage(
    "model",
    "Пришлите фото в полный рост — подберу вещи FCKIT и размер. На другие темы не отвечаю."
  );

  function addMessage(role, text, extra) {
    const row = document.createElement("article");
    row.className = `assistant-msg assistant-msg--${role}`;
    const body = document.createElement("p");
    body.textContent = text;
    row.appendChild(body);
    if (extra && extra.size) {
      const size = document.createElement("p");
      size.className = "assistant-size";
      size.textContent = `Размер: ${extra.size}`;
      row.appendChild(size);
    }
    if (extra && extra.products && extra.products.length) {
      const list = document.createElement("div");
      list.className = "assistant-picks";
      extra.products.forEach((item) => list.appendChild(productCard(item)));
      row.appendChild(list);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function productCard(item) {
    const href = `${item.section}.html?pick=${item.id}`;
    const card = document.createElement("article");
    card.className = "assistant-pick";
    card.innerHTML = `
      ${mediaMarkup(item, "assistant-pick__visual")}
      <div>
        <p class="card__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
        <a href="${href}">${escapeHtml(item.title)}</a>
        ${priceMarkup(item)}
        <button type="button" class="btn" data-add="${item.id}">В корзину</button>
      </div>`;
    return card;
  }

  function resolveProducts(ids) {
    const unique = [...new Set(ids)];
    return unique.map((id) => PRODUCTS.find((item) => item.id === id)).filter(Boolean).slice(0, 4);
  }

  function setBusy(next) {
    busy = next;
    send.disabled = next;
    input.disabled = next;
    file.disabled = next;
  }

  function compressImage(fileData) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read"));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve({
            mimeType: "image/jpeg",
            data: dataUrl.replace(/^data:image\/jpeg;base64,/, ""),
            preview: dataUrl,
          });
        };
        img.onerror = () => reject(new Error("image"));
        img.src = reader.result;
      };
      reader.readAsDataURL(fileData);
    });
  }

  file.addEventListener("change", async () => {
    const picked = file.files && file.files[0];
    file.value = "";
    if (!picked) return;
    try {
      image = await compressImage(picked);
      previewImg.src = image.preview;
      preview.hidden = false;
    } catch {
      image = null;
      preview.hidden = true;
      addMessage("model", "Это фото не открылось. Пришлите jpeg, png или webp в полный рост.");
    }
  });

  clearPhoto.addEventListener("click", () => {
    image = null;
    preview.hidden = true;
    previewImg.removeAttribute("src");
  });

  log.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    addToCart(Number(button.dataset.add));
    if (typeof flyBallToCart === "function") flyBallToCart(button);
    button.textContent = "Добавлено";
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "В корзину";
    }, 1200);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const text = input.value.trim() || (image ? "Подберите одежду и размер по этому фото в полный рост." : "");
    if (!text) {
      addMessage("model", "Напишите, что подобрать, или прикрепите фото в полный рост.");
      return;
    }

    addMessage("user", image ? `${text} (фото приложено)` : text);
    history.push({ role: "user", text });
    input.value = "";
    setBusy(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          image: image ? { mimeType: image.mimeType, data: image.data } : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        addMessage("model", data.error || "Сейчас не могу ответить.");
        return;
      }
      const products = resolveProducts(data.products || []);
      addMessage("model", data.reply, { size: data.size, products });
      history.push({ role: "model", text: data.reply });
    } catch {
      addMessage("model", "Нет связи с помощником. Откройте сайт через сервер магазина, не как файл.");
    } finally {
      setBusy(false);
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
})();
