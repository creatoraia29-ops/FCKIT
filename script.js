const section = document.body.dataset.section;
const board = document.getElementById("productBoard");
const preview = document.getElementById("productPreview");
const departmentTitle = document.getElementById("departmentTitle");

const picked = PRODUCTS.find(
  (item) => Number(item.id) === Number(new URLSearchParams(location.search).get("pick")) && item.section === section
);
let department = picked ? picked.department : "men";
let selectedId = picked ? picked.id : 0;
let addedTimer = 0;

function cardMarkup(item) {
  const selected = Number(item.id) === selectedId ? " is-selected" : "";
  return `
    <article class="card card--shelf${selected}" data-id="${item.id}" style="cursor: pointer;">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
        ${dealBadge(item)}
      </div>
      <div class="card__body">
        <p class="card__cat">${SECTION_TITLES[item.section] || ""}</p>
        <h4 class="card__title">${escapeHtml(item.title)}</h4>
        ${priceMarkup(item)}
      </div>
      <div class="card__actions">
        ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "card-") : ""}
        <button type="button" class="btn btn-primary btn-add-cart" data-add="${item.id}" data-size="M">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span>В корзину</span>
        </button>
      </div>
    </article>`;
}

function renderPreview(item, activeSize = "M") {
  if (!item) {
    preview.innerHTML = `<p class="preview__empty">Выберите вещь в каталоге</p>`;
    return;
  }

  const curSize = activeSize || "M";
  preview.innerHTML = `
    <div class="card__frame">
      ${mediaMarkup(item, "preview__visual")}
      ${dealBadge(item)}
    </div>
    <div class="preview__body">
      <p class="preview__cat">${DEPARTMENT_TITLES[item.department] || ""} · ${SECTION_TITLES[item.section] || ""}</p>
      <h3 class="preview__title">${escapeHtml(item.title)}</h3>
      <p class="preview__text">${escapeHtml(item.text || "")}</p>
      ${priceMarkup(item, "preview__price")}
      <div class="preview__actions">
        ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, curSize, "preview-") : ""}
        <button type="button" class="btn btn-primary btn-add-cart" data-add="${item.id}" data-size="${curSize}" style="min-height: 44px; font-size: 14.5px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span>В корзину (${curSize})</span>
        </button>
      </div>
    </div>`;
}

function handleSizeClick(container, btn) {
  const size = btn.dataset.sizeVal;
  const picker = btn.closest(".size-picker");
  if (picker) {
    picker.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
  }
  const addBtn = container.querySelector("[data-add]");
  if (addBtn) {
    addBtn.dataset.size = size;
    const labelSpan = addBtn.querySelector("span");
    if (labelSpan && (addBtn.classList.contains("btn-add-cart") || container.id === "productPreview")) {
      labelSpan.textContent = `В корзину (${size})`;
    }
  }
  return size;
}

function handleAddToCart(button) {
  const id = Number(button.dataset.add);
  const size = button.dataset.size || "M";
  addToCart(id, size);
  if (typeof flyBallToCart === "function") flyBallToCart(button);
  if (!button.dataset.origHtml) {
    button.dataset.origHtml = button.innerHTML;
  }
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    <span>Добавлено (${size})</span>`;
  clearTimeout(button._addTimer);
  button._addTimer = setTimeout(() => {
    if (button.isConnected && button.dataset.origHtml) {
      button.innerHTML = button.dataset.origHtml;
      delete button.dataset.origHtml;
    }
  }, 1200);
}

function bindBoardEvents() {
  board.addEventListener("click", (event) => {
    // 1. Клик по размеру
    const sizeBtn = event.target.closest("[data-size-val]");
    if (sizeBtn) {
      event.stopPropagation();
      const card = sizeBtn.closest(".card");
      if (card) {
        const size = handleSizeClick(card, sizeBtn);
        selectedId = Number(card.dataset.id);
        board.querySelectorAll(".card").forEach((node) => {
          node.classList.toggle("is-selected", Number(node.dataset.id) === selectedId);
        });
        renderPreview(PRODUCTS.find((item) => Number(item.id) === selectedId), size);
      }
      return;
    }

    // 2. Клик по кнопке «В корзину»
    const addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      event.stopPropagation();
      const card = addBtn.closest(".card");
      if (card) {
        selectedId = Number(card.dataset.id);
        board.querySelectorAll(".card").forEach((node) => {
          node.classList.toggle("is-selected", Number(node.dataset.id) === selectedId);
        });
      }
      handleAddToCart(addBtn);
      return;
    }

    // 3. Клик по карточке для детального просмотра
    const card = event.target.closest(".card");
    if (card) {
      selectedId = Number(card.dataset.id);
      board.querySelectorAll(".card").forEach((node) => {
        node.classList.toggle("is-selected", Number(node.dataset.id) === selectedId);
      });
      const currentCardSize = card.querySelector("[data-add]")?.dataset.size || "M";
      renderPreview(PRODUCTS.find((item) => Number(item.id) === selectedId), currentCardSize);
    }
  });
}

function renderProducts() {
  departmentTitle.textContent = SECTION_TITLES[section];
  const list = PRODUCTS.filter((item) => item.department === department && item.section === section);
  if (!list.length) {
    selectedId = 0;
    board.innerHTML = `<p class="preview__empty">В этом разделе пока нет вещей.</p>`;
    renderPreview(null);
    return;
  }

  if (!list.some((item) => Number(item.id) === selectedId)) {
    selectedId = Number(list[0].id);
  }

  board.innerHTML = `<div class="product-grid">${list.map(cardMarkup).join("")}</div>`;
  renderPreview(PRODUCTS.find((item) => Number(item.id) === selectedId));
}

document.querySelectorAll("[data-department]").forEach((button) => {
  button.addEventListener("click", () => {
    department = button.dataset.department;
    document.querySelectorAll("[data-department]").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.department === department);
    });
    renderProducts();
  });
});

document.querySelectorAll("[data-department]").forEach((node) => {
  node.classList.toggle("is-active", node.dataset.department === department);
});

preview.addEventListener("click", (event) => {
  const sizeBtn = event.target.closest("[data-size-val]");
  if (sizeBtn) {
    handleSizeClick(preview, sizeBtn);
    return;
  }

  const addBtn = event.target.closest("[data-add]");
  if (addBtn) {
    handleAddToCart(addBtn);
    return;
  }
});

bindBoardEvents();
renderProducts();
