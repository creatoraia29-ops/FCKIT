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
      ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "card-") : ""}
      <button type="button" class="btn btn-primary" data-add="${item.id}" data-size="M" style="width: 100%; min-height: 38px; margin-top: 6px;">
        В корзину
      </button>
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
      ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, curSize, "preview-") : ""}
      <button type="button" class="btn btn-primary" data-add="${item.id}" data-size="${curSize}" style="width: 100%; min-height: 44px; font-size: 15px; margin-top: 8px;">
        В корзину
      </button>
    </div>`;
}

function handleSizeClick(container, btn) {
  const size = btn.dataset.sizeVal;
  const picker = btn.closest(".size-picker");
  if (picker) {
    picker.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
  }
  const addBtn = container.querySelector("[data-add]");
  if (addBtn) addBtn.dataset.size = size;
  return size;
}

function handleAddToCart(button) {
  const id = Number(button.dataset.add);
  const size = button.dataset.size || "M";
  addToCart(id, size);
  if (typeof flyBallToCart === "function") flyBallToCart(button);
  button.textContent = `Добавлено (${size})`;
  window.clearTimeout(addedTimer);
  addedTimer = window.setTimeout(() => {
    if (button.isConnected) button.textContent = "В корзину";
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
        if (Number(card.dataset.id) === selectedId) {
          const previewSizeBtn = preview.querySelector(`[data-size-val="${size}"]`);
          if (previewSizeBtn) handleSizeClick(preview, previewSizeBtn);
        }
      }
      return;
    }

    // 2. Клик по кнопке «В корзину»
    const addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      event.stopPropagation();
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
