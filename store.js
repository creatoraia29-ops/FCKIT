const CART_KEY = "fckit-cart";

const SECTION_TITLES = {
  hats: "Головные уборы",
  tops: "Верх",
  bottoms: "Низ",
  shoes: "Обувь",
};

const DEPARTMENT_TITLES = {
  men: "Мужской",
  women: "Женский",
};

const PRODUCTS = [
  { id: 1, department: "men", section: "hats", title: "Шерстяная шапка Orbit", price: 154000, shade: "#3A3A3A", text: "Плотная шерсть, спокойная посадка. На каждый день и на холодный вечер." },
  { id: 2, department: "men", section: "hats", title: "Кепка Night Peak", price: 119000, sale: 89000, shade: "#1A1A1A", text: "Хлопковая кепка с жёстким козырьком. Держит форму и не бросается в глаза." },
  { id: 3, department: "men", section: "tops", title: "Свитер Rib Knit", price: 284000, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 4, department: "men", section: "tops", title: "Зип-худи Number Grid", price: 379000, hit: true, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 5, department: "men", section: "bottoms", title: "Брюки Three Stripe", price: 320000, hit: true, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 6, department: "men", section: "bottoms", title: "Шорты Core Black", price: 213000, sale: 159000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 7, department: "men", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, hit: true, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 8, department: "men", section: "shoes", title: "Кеды Star Court", price: 426000, hit: true, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
  { id: 9, department: "women", section: "hats", title: "Берет Lilac", price: 166000, sale: 129000, shade: "#6E6E6E", text: "Мягкий берет, держит объём. Закрывает голову без давления." },
  { id: 10, department: "women", section: "hats", title: "Панама Soft Glow", price: 142000, shade: "#D8D8D8", text: "Лёгкая панама на сезон. Защищает от солнца и не мнётся в сумке." },
  { id: 11, department: "women", section: "tops", title: "Свитер Rib Knit", price: 284000, hit: true, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 12, department: "women", section: "tops", title: "Зип-худи Number Grid", price: 379000, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 13, department: "women", section: "bottoms", title: "Брюки Three Stripe", price: 320000, sale: 249000, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 14, department: "women", section: "bottoms", title: "Шорты Core Black", price: 213000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 15, department: "women", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 16, department: "women", section: "shoes", title: "Кеды Star Court", price: 426000, sale: 339000, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
];

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} сум`;
}

function itemPrice(item) {
  return item.sale ?? item.price;
}

function salePercent(item) {
  if (!item.sale) return 0;
  return Math.round((1 - item.sale / item.price) * 100);
}

function priceMarkup(item, className = "card__price") {
  if (!item.sale) return `<p class="${className}">${formatPrice(item.price)}</p>`;
  return `<p class="${className}"><span class="price-old">${formatPrice(item.price)}</span>${formatPrice(item.sale)}</p>`;
}

function dealBadge(item) {
  if (!item.sale) return "";
  return `<span class="deal-badge">−${salePercent(item)}%</span>`;
}

function visualStyle(item) {
  return `background: linear-gradient(160deg, ${item.shade}, #111111 85%)`;
}

function mediaMarkup(item, className) {
  if (item.image) {
    return `<div class="${className} has-photo"><img src="${item.image}" alt="${item.title}"></div>`;
  }
  return `<div class="${className}" style="${visualStyle(item)}">FCKIT</div>`;
}

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => ({
        id: Number(row.id),
        qty: Math.floor(Number(row.qty)),
      }))
      .filter((row) => PRODUCTS.some((item) => item.id === row.id) && row.qty > 0)
      .map((row) => ({ id: row.id, qty: Math.min(99, row.qty) }));
  } catch {
    return [];
  }
}

function cartCount() {
  return readCart().reduce((sum, row) => sum + row.qty, 0);
}

function cartLines() {
  return readCart()
    .map((row) => ({
      qty: row.qty,
      item: PRODUCTS.find((item) => item.id === row.id),
    }))
    .filter((row) => row.item);
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function addToCart(id) {
  const items = readCart();
  const found = items.find((row) => row.id === id);
  if (found) found.qty = Math.min(99, found.qty + 1);
  else items.push({ id, qty: 1 });
  writeCart(items);
}

function changeQty(id, delta) {
  const items = readCart()
    .map((row) => (row.id === id ? { ...row, qty: row.qty + delta } : row))
    .filter((row) => row.qty > 0);
  writeCart(items);
}

function removeFromCart(id) {
  writeCart(readCart().filter((row) => row.id !== id));
}

function updateCartBadge() {
  const count = cartCount();
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = String(count);
    node.hidden = count === 0;
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("fckit-theme", theme);
  const label = document.querySelector(".theme-toggle__label");
  if (label) label.textContent = theme === "light" ? "Светлая" : "Тёмная";
}

function bindTheme() {
  const themeToggle = document.getElementById("themeToggle");
  if (!themeToggle) return;
  themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
  applyTheme(localStorage.getItem("fckit-theme") || "dark");
}

function bindMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const navBar = document.querySelector(".nav-bar");
  const siteNav = document.getElementById("siteNav");
  if (!menuToggle || !navBar || !siteNav) return;

  menuToggle.addEventListener("click", () => {
    const open = navBar.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navBar.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function bindCartFab() {
  const fab = document.getElementById("cartFab");
  if (!fab) return;

  const saved = readCartPos();
  if (saved) placeCartFab(fab, saved.x, saved.y);

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const onMove = (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 4) moved = true;
    placeCartFab(fab, originX + dx, originY + dy);
  };

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finishDrag);
    const rect = fab.getBoundingClientRect();
    localStorage.setItem("fckit-cart-pos", JSON.stringify({ x: rect.left, y: rect.top }));
    if (moved) fab.dataset.dragged = "1";
  };

  fab.addEventListener("dragstart", (event) => event.preventDefault());

  fab.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    fab.classList.add("is-dragging");
    const rect = fab.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finishDrag);
    try {
      fab.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or unsupported capture still follows window events */
    }
  });

  fab.addEventListener("click", (event) => {
    if (fab.dataset.dragged !== "1") return;
    event.preventDefault();
    delete fab.dataset.dragged;
  });

  window.addEventListener("resize", () => {
    if (!fab.style.left) return;
    const rect = fab.getBoundingClientRect();
    placeCartFab(fab, rect.left, rect.top);
  });
}

function readCartPos() {
  try {
    const raw = JSON.parse(localStorage.getItem("fckit-cart-pos"));
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
    return raw;
  } catch {
    return null;
  }
}

function isHomePage() {
  const path = location.pathname.replace(/\\/g, "/");
  return path.endsWith("/") || path.endsWith("/index.html");
}

function bindPageBack() {
  if (isHomePage()) return;
  const header = document.querySelector("header.intro");
  if (!header || document.getElementById("pageBack")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn page-back";
  button.id = "pageBack";
  button.textContent = "← Назад";
  button.addEventListener("click", () => {
    if (document.referrer.startsWith(location.origin)) history.back();
    else location.href = "index.html";
  });
  header.prepend(button);
}

function flyBallToCart(origin) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const fab = document.getElementById("cartFab");
  if (!fab || !origin) return;

  const from = origin.getBoundingClientRect();
  const to = fab.getBoundingClientRect();
  const size = 54;
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const endX = to.left + to.width / 2 - size / 2;
  const endY = to.top + to.height / 2 - size / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  const controlX = dx * 0.42;
  const controlY = Math.min(0, dy) - Math.max(160, Math.abs(dx) * 0.2);

  const ball = document.createElement("img");
  ball.className = "ball-flight";
  ball.alt = "";
  ball.src = document.documentElement.dataset.theme === "light" ? "img/ball-dark.svg" : "img/ball-light.svg";
  ball.style.left = `${startX}px`;
  ball.style.top = `${startY}px`;
  document.body.appendChild(ball);

  const steps = 18;
  const frames = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = 2 * u * t * controlX + t * t * dx;
    const y = 2 * u * t * controlY + t * t * dy;
    frames.push({
      transform: `translate(${x}px, ${y}px) rotate(${t * 360}deg) scale(${1 - t * 0.62})`,
      offset: t,
    });
  }

  const anim = ball.animate(frames, {
    duration: 1200,
    easing: "cubic-bezier(0.33, 0, 0.2, 1)",
    fill: "forwards",
  });

  anim.onfinish = () => {
    ball.remove();
    fab.classList.remove("is-scored");
    void fab.offsetWidth;
    fab.classList.add("is-scored");
    window.setTimeout(() => fab.classList.remove("is-scored"), 520);
  };
}

function placeCartFab(fab, x, y) {
  const maxX = Math.max(0, window.innerWidth - fab.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - fab.offsetHeight);
  fab.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
  fab.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
  fab.style.right = "auto";
  fab.style.bottom = "auto";
}

bindTheme();
bindMenu();
bindCartFab();
bindPageBack();
updateCartBadge();
