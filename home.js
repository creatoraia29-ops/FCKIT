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
      ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "shelf-") : ""}
      <button type="button" class="btn btn-primary" data-add="${item.id}" data-size="M" style="width: 100%; min-height: 38px; margin-top: 6px;">В корзину</button>
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
        ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", "feat-") : ""}
        <button type="button" class="btn btn-primary" data-add="${item.id}" data-size="M" style="width: 100%; min-height: 44px; font-size: 15px; margin-top: 8px;">В корзину</button>
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
      if (addBtn) addBtn.dataset.size = size;
      return;
    }

    // Добавление в корзину
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const id = Number(button.dataset.add);
    const size = button.dataset.size || "M";
    addToCart(id, size);
    if (typeof flyBallToCart === "function") flyBallToCart(button);
    button.textContent = `Добавлено (${size})`;
    window.clearTimeout(addedTimer);
    addedTimer = window.setTimeout(() => {
      if (button.isConnected) button.textContent = "В корзину";
    }, 1200);
  });
}
