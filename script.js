const SECTION_ORDER = ["hats", "tops", "bottoms", "shoes"];
const SECTION_TITLES = {
  hats: "Головные уборы",
  tops: "Верх",
  bottoms: "Низ",
  shoes: "Обувь",
};

const PRODUCTS = [
  { id: 1, department: "men", section: "hats", title: "Шерстяная шапка Orbit", price: 154000, shade: "#3A3A3A", text: "Плотная шерсть, спокойная посадка. На каждый день и на холодный вечер." },
  { id: 2, department: "men", section: "hats", title: "Кепка Night Peak", price: 119000, shade: "#1A1A1A", text: "Хлопковая кепка с жёстким козырьком. Держит форму и не бросается в глаза." },
  { id: 3, department: "men", section: "tops", title: "Свитер Rib Knit", price: 284000, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 4, department: "men", section: "tops", title: "Зип-худи Number Grid", price: 379000, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 5, department: "men", section: "bottoms", title: "Брюки Three Stripe", price: 320000, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 6, department: "men", section: "bottoms", title: "Шорты Core Black", price: 213000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 7, department: "men", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 8, department: "men", section: "shoes", title: "Кеды Star Court", price: 426000, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
  { id: 9, department: "women", section: "hats", title: "Берет Lilac", price: 166000, shade: "#6E6E6E", text: "Мягкий берет, держит объём. Закрывает голову без давления." },
  { id: 10, department: "women", section: "hats", title: "Панама Soft Glow", price: 142000, shade: "#D8D8D8", text: "Лёгкая панама на сезон. Защищает от солнца и не мнётся в сумке." },
  { id: 11, department: "women", section: "tops", title: "Свитер Rib Knit", price: 284000, shade: "#111111", image: "img/sweater.jpg", text: "Чёрный ребристый свитер. Плотная вязка, прямой силуэт, без лишнего декора." },
  { id: 12, department: "women", section: "tops", title: "Зип-худи Number Grid", price: 379000, shade: "#2A2A3A", image: "img/hoodie.jpg", text: "Вареный зип-худи с капюшоном и принтом. Короткий крой, удобный на каждый день." },
  { id: 13, department: "women", section: "bottoms", title: "Брюки Three Stripe", price: 320000, shade: "#C8C8C8", image: "img/pants.jpg", text: "Свободные брюки с лампасами. Мягкая посадка, городской крой." },
  { id: 14, department: "women", section: "bottoms", title: "Шорты Core Black", price: 213000, shade: "#111111", image: "img/shorts.jpg", text: "Чёрные шорты на резинке. Спокойный крой, на лето и зал." },
  { id: 15, department: "women", section: "shoes", title: "Кроссовки Mesh Runner", price: 474000, shade: "#E8E8E8", image: "img/sneakers-mesh.jpg", text: "Белые кроссовки с сеткой и воздушной подошвой. На каждый день." },
  { id: 16, department: "women", section: "shoes", title: "Кеды Star Court", price: 426000, shade: "#F2F2F2", image: "img/sneakers-star.jpg", text: "Кожаные кеды со звездой. Лёгкий винтажный вид, низкий ход." },
];

const board = document.getElementById("productBoard");
const preview = document.getElementById("productPreview");
const departmentTitle = document.getElementById("departmentTitle");
const themeToggle = document.getElementById("themeToggle");
let department = "men";
let selectedId = PRODUCTS[0].id;

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} сум`;
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

function cardMarkup(item) {
  const selected = item.id === selectedId ? " is-selected" : "";
  return `
    <button type="button" class="card${selected}" data-id="${item.id}">
      ${mediaMarkup(item, "card__visual")}
      <div class="card__body">
        <p class="card__cat">${SECTION_TITLES[item.section]}</p>
        <h4 class="card__title">${item.title}</h4>
        <p class="card__price">${formatPrice(item.price)}</p>
      </div>
    </button>`;
}

function renderPreview(item) {
  if (!item) {
    preview.innerHTML = `<p class="preview__empty">Выберите вещь в каталоге</p>`;
    return;
  }

  preview.innerHTML = `
    ${mediaMarkup(item, "preview__visual")}
    <div class="preview__body">
      <p class="preview__cat">${SECTION_TITLES[item.section]}</p>
      <h3 class="preview__title">${item.title}</h3>
      <p class="preview__text">${item.text}</p>
      <p class="preview__price">${formatPrice(item.price)}</p>
      <a class="btn btn-primary" href="#contacts">Заказать</a>
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
  departmentTitle.textContent = department === "men" ? "Мужской отдел" : "Женский отдел";
  const list = PRODUCTS.filter((item) => item.department === department);
  if (!list.some((item) => item.id === selectedId)) {
    selectedId = list[0].id;
  }

  board.innerHTML = SECTION_ORDER.map((section) => {
    const items = list.filter((item) => item.section === section);
    return `
      <section class="block" id="sec-${section}">
        <h3>${SECTION_TITLES[section]}</h3>
        <div class="product-grid">${items.map(cardMarkup).join("")}</div>
      </section>`;
  }).join("");

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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("fckit-theme", theme);
  themeToggle.querySelector(".theme-toggle__label").textContent =
    theme === "light" ? "Светлая" : "Тёмная";
}

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

const menuToggle = document.getElementById("menuToggle");
const navBar = document.querySelector(".nav-bar");
const siteNav = document.getElementById("siteNav");

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

applyTheme(localStorage.getItem("fckit-theme") || "dark");
renderProducts();
