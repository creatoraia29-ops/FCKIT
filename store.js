const CART_KEY = "fckit-cart";
const ORDERS_KEY = "fckit-orders";

const SECTION_TITLES = {
  hats: "Головные уборы",
  tops: "Верх",
  bottoms: "Низ",
  shoes: "Обувь",
};

const DEPARTMENT_TITLES = {
  men: "Мужской",
  women: "Женский",
  unisex: "Унисекс",
};

const PRODUCTS_KEY = "fckit-products";
const PROMOS_KEY = "fckit-promos";

const INITIAL_PRODUCTS = [
  { id: 1, department: "men", section: "hats", title: "Шерстяная шапка Orbit", price: 154000, sale: 119000, shade: "#3A3A3A", text: "Плотная шерсть, спокойная посадка. На каждый день и на холодный вечер." },
  { id: 2, department: "men", section: "hats", title: "Кепка Night Peak", price: 119000, sale: 89000, shade: "#1A1A1A", text: "Хлопковая кепка с жёстким козырьком. Держит форму и не бросается в глаза." },
  { id: 3, department: "men", section: "tops", title: "Свитер Rib Knit", price: 284000, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 4, department: "men", section: "tops", title: "Зип-худи Number Grid", price: 379000, hit: true, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 5, department: "men", section: "bottoms", title: "Брюки Three Stripe", price: 320000, hit: true, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 6, department: "men", section: "bottoms", title: "Шорты Core Black", price: 213000, sale: 159000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 7, department: "men", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, sale: 389000, hit: true, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 8, department: "men", section: "shoes", title: "Кеды Star Court", price: 426000, hit: true, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
  { id: 9, department: "women", section: "hats", title: "Берет Lilac", price: 166000, sale: 129000, shade: "#6E6E6E", text: "Мягкий берет, держит объём. Закрывает голову без давления." },
  { id: 10, department: "women", section: "hats", title: "Панама Soft Glow", price: 142000, sale: 99000, shade: "#D8D8D8", text: "Лёгкая панама на сезон. Защищает от солнца и не мнётся в сумке." },
  { id: 11, department: "women", section: "tops", title: "Свитер Rib Knit", price: 284000, hit: true, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 12, department: "women", section: "tops", title: "Зип-худи Number Grid", price: 379000, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 13, department: "women", section: "bottoms", title: "Брюки Three Stripe", price: 320000, sale: 249000, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 14, department: "women", section: "bottoms", title: "Шорты Core Black", price: 213000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 15, department: "women", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 16, department: "women", section: "shoes", title: "Кеды Star Court", price: 426000, sale: 339000, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
];

function getStoredProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_PRODUCTS;
}

let PRODUCTS = getStoredProducts();

function apiEndpoint(path) {
  if (typeof getApiUrl === "function") return getApiUrl(path);
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

function getAdminAuthHeader() {
  const headers = {};
  try {
    const token = sessionStorage.getItem("fckit-admin-token") || localStorage.getItem("fckit-admin-token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const pass = sessionStorage.getItem("fckit-admin-password") || localStorage.getItem("fckit-admin-password");
    if (pass) headers["X-Admin-Password"] = pass;
  } catch {}
  return headers;
}

async function saveProducts(list) {
  PRODUCTS = list;
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
  } catch {}

  // Оповещаем активные скрипты на текущей вкладке
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fckit:products-updated", { detail: list }));
  }

  const res = await fetch(apiEndpoint("/api/products?_t=" + Date.now()), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeader(),
    },
    body: JSON.stringify(list),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData.error || `Ошибка сервера: HTTP ${res.status}`;
    console.error("Save products failed:", msg);
    throw new Error(msg);
  }

  return await res.json().catch(() => ({ ok: true }));
}

function getStoredPromos() {
  try {
    const raw = localStorage.getItem(PROMOS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

let PROMOTIONS = getStoredPromos();

async function savePromos(list) {
  PROMOTIONS = list;
  try {
    localStorage.setItem(PROMOS_KEY, JSON.stringify(list));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fckit:promotions-updated", { detail: list }));
  }

  const res = await fetch(apiEndpoint("/api/promotions?_t=" + Date.now()), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeader(),
    },
    body: JSON.stringify(list),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData.error || `Ошибка сервера: HTTP ${res.status}`;
    console.error("Save promotions failed:", msg);
    throw new Error(msg);
  }

  return await res.json().catch(() => ({ ok: true }));
}

async function syncFromServer() {
  try {
    const res = await fetch(apiEndpoint("/api/products?_t=" + Date.now()), {
      cache: "no-store",
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const prevJson = localStorage.getItem(PRODUCTS_KEY);
        const newJson = JSON.stringify(list);
        PRODUCTS = list;
        try {
          localStorage.setItem(PRODUCTS_KEY, newJson);
        } catch {}
        if (prevJson !== newJson && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fckit:products-updated", { detail: list }));
        }
      }
    }
  } catch (err) {
    console.warn("syncFromServer error:", err);
  }

  try {
    const res = await fetch(apiEndpoint("/api/promotions?_t=" + Date.now()), {
      cache: "no-store",
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        const prevJson = localStorage.getItem(PROMOS_KEY);
        const newJson = JSON.stringify(list);
        PROMOTIONS = list;
        try {
          localStorage.setItem(PROMOS_KEY, newJson);
        } catch {}
        if (prevJson !== newJson && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fckit:promotions-updated", { detail: list }));
        }
      }
    }
  } catch {}
}

if (typeof window !== "undefined") {
  syncFromServer();
  window.addEventListener("focus", () => syncFromServer());
  window.addEventListener("storage", (event) => {
    if (event.key === PRODUCTS_KEY && event.newValue) {
      try {
        PRODUCTS = JSON.parse(event.newValue);
        window.dispatchEvent(new CustomEvent("fckit:products-updated", { detail: PRODUCTS }));
      } catch {}
    }
    if (event.key === PROMOS_KEY && event.newValue) {
      try {
        PROMOTIONS = JSON.parse(event.newValue);
        window.dispatchEvent(new CustomEvent("fckit:promotions-updated", { detail: PROMOTIONS }));
      } catch {}
    }
  });
}

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
  const effectivePrice = item.sale ?? item.price;
  const tag = item.tagStyle || {};
  const prefix = tag.prefix ? `<span class="price-prefix">${escapeHtml(tag.prefix)} </span>` : "";
  const oldPriceHtml = item.sale ? `<span class="price-old">${formatPrice(item.price)}</span>` : "";
  const mainPriceHtml = `${prefix}${oldPriceHtml}<span class="price-current" style="${tag.accentColor ? `color: ${tag.accentColor};` : ""}">${formatPrice(effectivePrice)}</span>`;

  let extraHtml = "";
  if (tag.benefitText) {
    extraHtml += `<span class="price-benefit">${escapeHtml(tag.benefitText)}</span>`;
  }
  if (item.tiers && item.tiers.length) {
    const t = item.tiers[0];
    extraHtml += `<span class="price-tier">от ${t.minQty} шт: ${formatPrice(t.price)}</span>`;
  }

  return `
    <div class="price-block ${className}">
      <p class="price-main">${mainPriceHtml}</p>
      ${extraHtml ? `<div class="price-extras">${extraHtml}</div>` : ""}
    </div>`;
}

function dealBadge(item) {
  if (item.tagStyle && item.tagStyle.badgeText) {
    const bg = item.tagStyle.badgeBg || "var(--white)";
    const color = item.tagStyle.badgeColor || "var(--black)";
    return `<span class="deal-badge custom-badge" style="background:${bg}; color:${color};">${escapeHtml(item.tagStyle.badgeText)}</span>`;
  }
  if (item.sale) {
    return `<span class="deal-badge">−${salePercent(item)}%</span>`;
  }
  return "";
}

function visualStyle(item) {
  return `background: linear-gradient(160deg, ${item.shade}, #111111 85%)`;
}

function getProductImages(item) {
  if (!item) return [];
  if (Array.isArray(item.images) && item.images.length) {
    return item.images.filter((img) => img && typeof img === "string");
  }
  if (item.image) return [item.image];
  return [];
}

function mediaMarkup(item, className) {
  const images = getProductImages(item);
  const title = typeof escapeHtml === "function" ? escapeHtml(item.title || "Товар FCKIT") : (item.title || "Товар FCKIT");

  if (images.length > 1) {
    return `
      <div class="${className} has-photo product-slider" data-slider-id="${item.id}">
        <div class="product-slider__track">
          ${images
            .map(
              (src, i) =>
                `<img src="${src}" alt="${title} (${i + 1}/${images.length})" class="product-slider__img${
                  i === 0 ? " is-active" : ""
                }" data-idx="${i}" loading="lazy" decoding="async">`
            )
            .join("")}
        </div>
        <button type="button" class="product-slider__btn product-slider__prev" aria-label="Предыдущее фото" data-slide-dir="-1" title="Предыдущее фото">‹</button>
        <button type="button" class="product-slider__btn product-slider__next" aria-label="Следующее фото" data-slide-dir="1" title="Следующее фото">›</button>
        <div class="product-slider__dots">
          ${images
            .map(
              (_, i) =>
                `<span class="product-slider__dot${i === 0 ? " is-active" : ""}" data-slide-to="${i}"></span>`
            )
            .join("")}
        </div>
      </div>`;
  }
  if (images.length === 1 || item.image) {
    const src = images[0] || item.image;
    return `<div class="${className} has-photo"><img src="${src}" alt="${title}" loading="lazy" decoding="async"></div>`;
  }
  return `<div class="${className}" style="${visualStyle(item)}">FCKIT</div>`;
}

const SIZES = ["S", "M", "L", "XL", "2XL"];

function normalizeSize(size) {
  const s = String(size || "").trim().toUpperCase();
  return SIZES.includes(s) ? s : "M";
}

function sizePickerMarkup(productId, selectedSize = "M", prefix = "") {
  const cur = normalizeSize(selectedSize);
  return `
    <div class="size-picker" data-size-picker="${prefix}${productId}">
      <span class="size-picker__title">Размер:</span>
      <div class="size-picker__list">
        ${SIZES.map(
          (sz) => `
          <button type="button" class="size-btn${sz === cur ? " is-active" : ""}" data-size-val="${sz}" data-size-target="${prefix}${productId}">
            ${sz}
          </button>
        `
        ).join("")}
      </div>
    </div>`;
}

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => ({
        id: Number(row.id),
        size: normalizeSize(row.size),
        qty: Math.max(1, Math.min(99, Math.floor(Number(row.qty) || 1))),
      }))
      .filter((row) => PRODUCTS.some((item) => String(item.id) === String(row.id)));
  } catch {
    return [];
  }
}

function cartCount() {
  return readCart().reduce((sum, row) => sum + row.qty, 0);
}

function cartLines() {
  return readCart()
    .map((row) => {
      const item = PRODUCTS.find((item) => String(item.id) === String(row.id));
      if (!item) return null;
      return {
        id: row.id,
        size: row.size || "M",
        qty: row.qty,
        item,
      };
    })
    .filter(Boolean);
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function addToCart(id, size = "M") {
  const normId = Number(id);
  const normSize = normalizeSize(size);
  const items = readCart();
  const found = items.find((row) => row.id === normId && row.size === normSize);
  if (found) {
    found.qty = Math.min(99, found.qty + 1);
  } else {
    items.push({ id: normId, size: normSize, qty: 1 });
  }
  writeCart(items);
}

function changeQty(id, size, delta) {
  const normId = Number(id);
  const normSize = normalizeSize(size);
  const items = readCart()
    .map((row) => {
      if (row.id === normId && row.size === normSize) {
        return { ...row, qty: row.qty + delta };
      }
      return row;
    })
    .filter((row) => row.qty > 0);
  writeCart(items);
}

function removeFromCart(id, size) {
  const normId = Number(id);
  const normSize = normalizeSize(size);
  writeCart(readCart().filter((row) => !(row.id === normId && row.size === normSize)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter((order) => order && typeof order.id === "string" && Array.isArray(order.items) && order.createdAt);
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function snapshotCartLines() {
  return cartLines().map(({ item, qty, size }) => ({
    id: item.id,
    title: item.title,
    size: size || "M",
    qty,
    price: itemPrice(item),
    department: item.department,
    section: item.section,
    image: item.image || "",
    shade: item.shade,
    text: item.text,
  }));
}

function placeOrder({ name, phone, note }) {
  const items = snapshotCartLines();
  if (!items.length) return null;
  const order = {
    id: `FC-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    name: String(name || "").trim().slice(0, 80),
    phone: String(phone || "").trim().slice(0, 40),
    note: String(note || "").trim().slice(0, 240),
    items,
    total: items.reduce((sum, row) => sum + row.price * row.qty, 0),
    status: "new",
  };
  writeOrders([order, ...readOrders()]);
  writeCart([]);
  return order;
}

function setOrderStatus(id, status) {
  writeOrders(readOrders().map((order) => (order.id === id ? { ...order, status } : order)));
}

function removeOrder(id) {
  writeOrders(readOrders().filter((order) => order.id !== id));
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
  if (document.body.dataset.page === "admin") return;
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    });
  }
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
  if (isHomePage() || document.body.dataset.page === "admin") return;
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

// -----------------------------------------------------------------------------
// ПЕРЕКЛЮЧЕНИЕ ФОТОГРАФИЙ В СЛАЙДЕРАХ ТОВАРОВ (КЛИКИ И СВАЙПЫ)
// -----------------------------------------------------------------------------
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".product-slider__btn");
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    const slider = btn.closest(".product-slider");
    if (!slider) return;
    const dir = Number(btn.dataset.slideDir || 1);
    const imgs = slider.querySelectorAll(".product-slider__img");
    const dots = slider.querySelectorAll(".product-slider__dot");
    if (!imgs.length) return;
    let curIdx = Array.from(imgs).findIndex((img) => img.classList.contains("is-active"));
    if (curIdx < 0) curIdx = 0;
    const nextIdx = (curIdx + dir + imgs.length) % imgs.length;
    imgs.forEach((img, i) => img.classList.toggle("is-active", i === nextIdx));
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === nextIdx));
    return;
  }

  const dot = e.target.closest(".product-slider__dot");
  if (dot) {
    e.preventDefault();
    e.stopPropagation();
    const slider = dot.closest(".product-slider");
    if (!slider) return;
    const targetIdx = Number(dot.dataset.slideTo || 0);
    const imgs = slider.querySelectorAll(".product-slider__img");
    const dots = slider.querySelectorAll(".product-slider__dot");
    imgs.forEach((img, i) => img.classList.toggle("is-active", i === targetIdx));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === targetIdx));
    return;
  }
});

let touchSliderStartX = 0;
let touchSliderStartY = 0;
let activeTouchSlider = null;

document.addEventListener("touchstart", (e) => {
  const slider = e.target.closest(".product-slider");
  if (!slider) return;
  const touch = e.touches[0];
  touchSliderStartX = touch.clientX;
  touchSliderStartY = touch.clientY;
  activeTouchSlider = slider;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  if (!activeTouchSlider) return;
  const touch = e.changedTouches[0];
  const deltaX = touch.clientX - touchSliderStartX;
  const deltaY = touch.clientY - touchSliderStartY;
  const slider = activeTouchSlider;
  activeTouchSlider = null;

  if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    const dir = deltaX < 0 ? 1 : -1;
    const imgs = slider.querySelectorAll(".product-slider__img");
    const dots = slider.querySelectorAll(".product-slider__dot");
    if (!imgs.length) return;
    let curIdx = Array.from(imgs).findIndex((img) => img.classList.contains("is-active"));
    if (curIdx < 0) curIdx = 0;
    const nextIdx = (curIdx + dir + imgs.length) % imgs.length;
    imgs.forEach((img, i) => img.classList.toggle("is-active", i === nextIdx));
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === nextIdx));
  }
}, { passive: true });
