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
        <p class="card__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
        <h3 class="card__title">${item.title}</h3>
        ${priceMarkup(item)}
      </div>
      <button type="button" class="btn btn-primary" data-add="${item.id}">В корзину</button>
    </article>`;
}

function featureCard(item) {
  return `
    <article class="feature-hit">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
      </div>
      <div class="feature-hit__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
        <h3 class="feature-hit__title">${item.title}</h3>
        <p class="feature-hit__text">${item.text}</p>
        ${priceMarkup(item, "preview__price")}
        <button type="button" class="btn btn-primary" data-add="${item.id}">В корзину</button>
      </div>
    </article>`;
}

const featured = PRODUCTS.find((item) => item.hit && item.image) || PRODUCTS.find((item) => item.hit);
hitBoard.innerHTML = featureCard(featured);
dealBoard.innerHTML = PRODUCTS.filter((item) => item.sale).map(shelfCard).join("");

home.addEventListener("click", (event) => {
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
