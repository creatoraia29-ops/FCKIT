const searchInput = document.getElementById("catalogSearch");
const searchBoard = document.getElementById("searchBoard");
const catalogGrid = document.getElementById("catalogGrid");
const deptFilter = document.getElementById("deptFilter");
const secFilter = document.getElementById("secFilter");

let activeDept = "all";
let activeSec = "all";

function catalogProductCard(item, prefix = "cat-") {
  return `
    <article class="card card--shelf" data-id="${item.id}">
      <a class="card__frame" href="${item.section}.html?pick=${item.id}" style="display: block; text-decoration: none;">
        ${mediaMarkup(item, "card__visual")}
        ${dealBadge(item)}
      </a>
      <div class="card__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department] || ""} · ${SECTION_TITLES[item.section] || ""}</p>
        <h4 class="card__title">
          <a href="${item.section}.html?pick=${item.id}" style="color: inherit; text-decoration: none;">${escapeHtml(item.title)}</a>
        </h4>
        ${priceMarkup(item)}
      </div>
      <div class="card__actions">
        ${typeof sizePickerMarkup === "function" ? sizePickerMarkup(item.id, "M", prefix) : ""}
        <button type="button" class="btn btn-primary btn-add-cart" data-add="${item.id}" data-size="M">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span>В корзину</span>
        </button>
      </div>
    </article>`;
}

function renderCatalogGrid() {
  if (!catalogGrid) return;
  const list = PRODUCTS.filter((item) => {
    if (activeDept !== "all" && item.department !== activeDept) return false;
    if (activeSec !== "all" && item.section !== activeSec) return false;
    return true;
  });

  if (!list.length) {
    catalogGrid.innerHTML = `<p class="preview__empty" style="grid-column: 1 / -1; padding: 32px 0;">В этом отделе пока нет вещей.</p>`;
    return;
  }

  catalogGrid.innerHTML = list.map((item) => catalogProductCard(item, "grid-")).join("");
}

function renderSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchBoard.hidden = true;
    searchBoard.innerHTML = "";
    return;
  }

  const list = PRODUCTS.filter((item) => {
    const hay = `${item.title} ${SECTION_TITLES[item.section]} ${DEPARTMENT_TITLES[item.department]}`.toLowerCase();
    return hay.includes(query);
  });

  searchBoard.hidden = false;
  searchBoard.innerHTML = list.length
    ? `<div class="product-grid search-grid">${list.map((item) => catalogProductCard(item, "search-")).join("")}</div>`
    : `<p class="search-empty">Такой вещи нет</p>`;
}

function handleCatalogAction(event) {
  // Выбор размера
  const sizeBtn = event.target.closest("[data-size-val]");
  if (sizeBtn) {
    event.stopPropagation();
    const card = sizeBtn.closest(".card");
    const size = sizeBtn.dataset.sizeVal;
    const picker = sizeBtn.closest(".size-picker");
    if (picker) {
      picker.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("is-active", b === sizeBtn));
    }
    const addBtn = card?.querySelector("[data-add]");
    if (addBtn) {
      addBtn.dataset.size = size;
      const labelSpan = addBtn.querySelector("span");
      if (labelSpan) labelSpan.textContent = `В корзину (${size})`;
    }
    return;
  }

  // Добавление в корзину
  const button = event.target.closest("[data-add]");
  if (!button) return;
  event.stopPropagation();
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

if (catalogGrid) catalogGrid.addEventListener("click", handleCatalogAction);
if (searchBoard) searchBoard.addEventListener("click", handleCatalogAction);

if (deptFilter) {
  deptFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dept]");
    if (!btn) return;
    activeDept = btn.dataset.dept;
    deptFilter.querySelectorAll("[data-dept]").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderCatalogGrid();
  });
}

if (secFilter) {
  secFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sec]");
    if (!btn) return;
    activeSec = btn.dataset.sec;
    secFilter.querySelectorAll("[data-sec]").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderCatalogGrid();
  });
}

let searchDebounceTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderSearch, 120);
});
searchInput.form?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchDebounceTimer);
  renderSearch();
});

renderCatalogGrid();

window.addEventListener("fckit:products-updated", () => {
  renderCatalogGrid();
  if (searchInput && searchInput.value.trim()) renderSearch();
});
