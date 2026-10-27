const section = document.body.dataset.section;
const board = document.getElementById("productBoard");
const preview = document.getElementById("productPreview");
const departmentTitle = document.getElementById("departmentTitle");
const picked = PRODUCTS.find(
  (item) => item.id === Number(new URLSearchParams(location.search).get("pick")) && item.section === section
);
let department = picked ? picked.department : "men";
let selectedId = picked ? picked.id : 0;
let addedTimer = 0;

function cardMarkup(item) {
  const selected = item.id === selectedId ? " is-selected" : "";
  return `
    <button type="button" class="card${selected}" data-id="${item.id}">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
        ${dealBadge(item)}
      </div>
      <div class="card__body">
        <p class="card__cat">${SECTION_TITLES[item.section]}</p>
        <h4 class="card__title">${item.title}</h4>
        ${priceMarkup(item)}
      </div>
    </button>`;
}

function renderPreview(item) {
  if (!item) {
    preview.innerHTML = `<p class="preview__empty">Выберите вещь в каталоге</p>`;
    return;
  }

  preview.innerHTML = `
    <div class="card__frame">
      ${mediaMarkup(item, "preview__visual")}
      ${dealBadge(item)}
    </div>
    <div class="preview__body">
      <p class="preview__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
      <h3 class="preview__title">${item.title}</h3>
      <p class="preview__text">${item.text}</p>
      ${priceMarkup(item, "preview__price")}
      <button type="button" class="btn btn-primary" data-add="${item.id}">В корзину</button>
    </div>`;
}

function bindCards() {
  board.querySelectorAll("[data-id]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedId = Number(card.dataset.id);
      board.querySelectorAll(".card").forEach((node) => {
        node.classList.toggle("is-selected", Number(node.dataset.id) === selectedId);
      });
      renderPreview(PRODUCTS.find((item) => item.id === selectedId));
    });
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

  if (!list.some((item) => item.id === selectedId)) {
    selectedId = list[0].id;
  }

  board.innerHTML = `<div class="product-grid">${list.map(cardMarkup).join("")}</div>`;
  bindCards();
  renderPreview(PRODUCTS.find((item) => item.id === selectedId));
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
  const button = event.target.closest("[data-add]");
  if (!button) return;
  addToCart(Number(button.dataset.add));
  flyBallToCart(button);
  button.textContent = "Добавлено";
  window.clearTimeout(addedTimer);
  addedTimer = window.setTimeout(() => {
    if (button.isConnected) button.textContent = "В корзину";
  }, 1200);
});

renderProducts();
