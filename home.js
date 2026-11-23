const hitBoard = document.getElementById("hitBoard");
const dealBoard = document.getElementById("dealBoard");
const home = document.querySelector(".home");
let addedTimer = 0;

function shelfCard(item) {
  return `
    <article class="card card--shelf">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
        ${dealBadge(item)}
      </div>
      <div class="card__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department] || ""} · ${SECTION_TITLES[item.section] || ""}</p>
        <h3 class="card__title">${escapeHtml(item.title)}</h3>
        ${priceMarkup(item)}
      </div>
      <div class="card__actions">
        ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "shelf-") : ""}
        <button type="button" class="btn btn-primary btn-add-cart" data-add="${item.id}" data-size="M">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span>В корзину</span>
        </button>
      </div>
    </article>`;
}

function featureCard(item) {
  return `
    <article class="feature-hit">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
      </div>
      <div class="feature-hit__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department] || ""} · ${SECTION_TITLES[item.section] || ""}</p>
        <h3 class="feature-hit__title">${escapeHtml(item.title)}</h3>
        <p class="feature-hit__text">${escapeHtml(item.text || "")}</p>
        ${priceMarkup(item, "preview__price")}
        <div class="preview__actions">
          ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "feat-") : ""}
          <button type="button" class="btn btn-primary btn-add-cart" data-add="${item.id}" data-size="M" style="min-height: 44px; font-size: 14.5px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <span>В корзину (M)</span>
          </button>
        </div>
      </div>
    </article>`;
}

const featured = PRODUCTS.find((item) => item.hit && item.image) || PRODUCTS.find((item) => item.hit) || PRODUCTS[0];
if (hitBoard && featured) hitBoard.innerHTML = featureCard(featured);
if (dealBoard) dealBoard.innerHTML = PRODUCTS.filter((item) => item.sale).map(shelfCard).join("");

if (home) {
  home.addEventListener("click", (event) => {
    // Выбор размера
    const sizeBtn = event.target.closest("[data-size-val]");
    if (sizeBtn) {
      event.stopPropagation();
      const container = sizeBtn.closest(".card, .feature-hit");
      const size = sizeBtn.dataset.sizeVal;
      const picker = sizeBtn.closest(".size-picker");
      if (picker) {
        picker.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("is-active", b === sizeBtn));
      }
      const addBtn = container?.querySelector("[data-add]");
      if (addBtn) {
        addBtn.dataset.size = size;
        const labelSpan = addBtn.querySelector("span");
        if (labelSpan && container?.classList.contains("feature-hit")) {
          labelSpan.textContent = `В корзину (${size})`;
        }
      }
      return;
    }

    // Добавление в корзину
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const id = Number(button.dataset.add);
    const size = button.dataset.size || "M";
    addToCart(id, size);
    if (typeof flyBallToCart === "function") flyBallToCart(button);
    const originalHtml = button.innerHTML;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Добавлено (${size})</span>`;
    window.clearTimeout(addedTimer);
    addedTimer = window.setTimeout(() => {
      if (button.isConnected) button.innerHTML = originalHtml;
    }, 1200);
  });
}
