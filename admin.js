const ADMIN_PASSWORD = "fckit2026";
const ADMIN_SESSION_KEY = "fckit-admin-session";

const lock = document.getElementById("adminLock");
const app = document.getElementById("adminApp");
const loginForm = document.getElementById("adminLogin");
const loginError = document.getElementById("adminLoginError");
const board = document.getElementById("adminBoard");
const stats = document.getElementById("adminStats");
const filters = document.querySelectorAll("[data-order-filter]");
let filter = "all";

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function isAuthed() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

function showApp() {
  lock.hidden = true;
  app.hidden = false;
  renderAdmin();
}

function showLock() {
  lock.hidden = false;
  app.hidden = true;
}

function orderItemMarkup(item) {
  return `
    <article class="cart-item admin-item">
      ${mediaMarkup(item, "cart-item__visual")}
      <div class="cart-item__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department] || ""} · ${SECTION_TITLES[item.section] || ""}</p>
        <h3 class="cart-item__title">${escapeHtml(item.title)}</h3>
        <p class="card__price">${formatPrice(item.price)} · ${item.qty} шт.</p>
      </div>
      <p class="cart-item__sum">${formatPrice(item.price * item.qty)}</p>
    </article>`;
}

function orderMarkup(order) {
  const done = order.status === "done";
  const itemsLabel = `${order.items.length} ${plural(order.items.length, "вещь", "вещи", "вещей")}`;
  return `
    <article class="order-card${done ? " is-done" : ""}">
      <header class="order-card__head">
        <div>
          <p class="eyebrow">${escapeHtml(order.id)}</p>
          <p class="order-time">
            <time datetime="${escapeHtml(order.createdAt)}">${escapeHtml(formatDateTime(order.createdAt))}</time>
          </p>
        </div>
        <span class="order-status">${done ? "Выполнен" : "Новый"}</span>
      </header>
      <p class="order-meta">
        ${escapeHtml(order.name)} · ${escapeHtml(order.phone)} · ${itemsLabel}
        ${order.note ? ` · ${escapeHtml(order.note)}` : ""}
      </p>
      <div class="cart-list">
        ${order.items.map(orderItemMarkup).join("")}
      </div>
      <footer class="order-card__foot">
        <p class="cart-total">Итого: <strong>${formatPrice(order.total)}</strong></p>
        <div class="order-card__tools">
          ${
            done
              ? `<button type="button" class="btn" data-order-action="reopen" data-id="${escapeHtml(order.id)}">Вернуть</button>`
              : `<button type="button" class="btn btn-primary" data-order-action="done" data-id="${escapeHtml(order.id)}">Выполнен</button>`
          }
          <button type="button" class="btn" data-order-action="remove" data-id="${escapeHtml(order.id)}">Удалить</button>
        </div>
      </footer>
    </article>`;
}

function renderAdmin() {
  if (!isAuthed()) return;
  const orders = readOrders();
  const visible = orders.filter((order) => {
    if (filter === "new") return order.status !== "done";
    if (filter === "done") return order.status === "done";
    return true;
  });
  const fresh = orders.filter((order) => order.status !== "done").length;

  stats.innerHTML = `
    <p><strong>${orders.length}</strong> ${plural(orders.length, "заказ", "заказа", "заказов")}</p>
    <p><strong>${fresh}</strong> ${plural(fresh, "новый", "новых", "новых")}</p>`;

  if (!visible.length) {
    board.innerHTML = `
      <div class="cart-empty">
        <p>${orders.length ? "В этом фильтре заказов нет." : "Заказов пока нет."}</p>
      </div>`;
    return;
  }

  board.innerHTML = `<div class="order-list">${visible.map(orderMarkup).join("")}</div>`;
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = String(new FormData(loginForm).get("password") || "");
  if (password !== ADMIN_PASSWORD) {
    loginError.hidden = false;
    loginForm.password.value = "";
    loginForm.password.focus();
    return;
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  loginError.hidden = true;
  loginForm.reset();
  showApp();
});

document.getElementById("adminLogout").addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLock();
  loginForm.password.focus();
});

filters.forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.orderFilter;
    filters.forEach((node) => node.classList.toggle("is-active", node === button));
    renderAdmin();
  });
});

board.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.orderAction;
  if (action === "done") setOrderStatus(id, "done");
  if (action === "reopen") setOrderStatus(id, "new");
  if (action === "remove") removeOrder(id);
  renderAdmin();
});

window.addEventListener("storage", (event) => {
  if (event.key === ORDERS_KEY && isAuthed()) renderAdmin();
});

if (isAuthed()) showApp();
else showLock();
