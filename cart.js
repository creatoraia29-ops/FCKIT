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

function checkoutMarkup() {
  return `
    <form class="checkout" id="checkoutForm">
      <div class="checkout__head">
        <h3>Оформить заказ</h3>
        <p>Заказ сразу появится в админке с временем и выбранными вещами.</p>
      </div>
      <div class="checkout__grid">
        <label class="checkout__field">
          <span>Имя</span>
          <input name="name" type="text" maxlength="80" autocomplete="name" required />
        </label>
        <label class="checkout__field">
          <span>Телефон</span>
          <input name="phone" type="tel" maxlength="40" autocomplete="tel" required />
        </label>
        <label class="checkout__field checkout__field--wide">
          <span>Комментарий</span>
          <input name="note" type="text" maxlength="240" placeholder="Размер, цвет, адрес — по желанию" />
        </label>
      </div>
      <button type="submit" class="btn btn-primary">Отправить заказ</button>
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
      <p class="cart-total">Итого: <strong>${formatPrice(total)}</strong></p>
      <button type="button" class="btn" data-cart-action="clear">Очистить</button>
    </div>
    ${checkoutMarkup()}`;
}

function bindCheckout() {
  const form = document.getElementById("checkoutForm");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const order = placeOrder({
      name: data.get("name"),
      phone: data.get("phone"),
      note: data.get("note"),
    });
    if (!order) return;
    cartBoard.innerHTML = `
      <div class="cart-empty">
        <p>Заказ ${escapeHtml(order.id)} принят ${escapeHtml(formatDateTime(order.createdAt))}.</p>
        <p>Вещи сохранены. Магазин увидит их в админке.</p>
        <a class="btn btn-primary" href="catalog.html">Вернуться в каталог</a>
      </div>`;
  });
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
