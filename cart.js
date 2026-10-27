const cartBoard = document.getElementById("cartBoard");

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
    <p class="cart-note">Чтобы оформить заказ, напишите магазину в <a href="index.html#contacts">контактах</a>.</p>`;
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
});

renderCart();
