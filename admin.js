const ADMIN_PASSWORD = "fckit2026";
const ADMIN_SESSION_KEY = "fckit-admin-session";

// Элементы экрана
const lock = document.getElementById("adminLock");
const app = document.getElementById("adminApp");
const loginForm = document.getElementById("adminLogin");
const loginError = document.getElementById("adminLoginError");
const logoutBtn = document.getElementById("adminLogout");

// Вкладки админки
const navTabs = document.querySelectorAll("[data-admin-tab]");
const sectionOrders = document.getElementById("sectionOrders");
const sectionProducts = document.getElementById("sectionProducts");
const sectionPricing = document.getElementById("sectionPricing");
const sectionPromos = document.getElementById("sectionPromos");

let currentTab = "orders";

function isAuthed() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

function showApp() {
  lock.hidden = true;
  app.hidden = false;
  switchTab(currentTab);
}

function showLock() {
  lock.hidden = false;
  app.hidden = true;
}

function switchTab(tab) {
  currentTab = tab;
  navTabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.adminTab === tab));

  sectionOrders.hidden = tab !== "orders";
  sectionProducts.hidden = tab !== "products";
  sectionPricing.hidden = tab !== "pricing";
  sectionPromos.hidden = tab !== "promos";

  if (tab === "orders") renderOrders();
  if (tab === "products") renderProductsTab();
  if (tab === "pricing") renderPricingTab();
  if (tab === "promos") renderPromosTab();
}

navTabs.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.adminTab));
});

// -----------------------------------------------------------------------------
// 1. УПРАВЛЕНИЕ ЗАКАЗАМИ
// -----------------------------------------------------------------------------
const board = document.getElementById("adminBoard");
const stats = document.getElementById("adminStats");
const orderFilters = document.querySelectorAll("[data-order-filter]");
let orderFilter = "all";

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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
        <strong>${escapeHtml(order.name)}</strong> · <a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a> · ${itemsLabel}
        ${order.note ? ` · <em>${escapeHtml(order.note)}</em>` : ""}
      </p>
      <div class="cart-list">
        ${order.items.map(orderItemMarkup).join("")}
      </div>
      <footer class="order-card__foot">
        <p class="cart-total">Итого: <strong>${formatPrice(order.total)}</strong></p>
        <div class="order-card__tools">
          ${
            done
              ? `<button type="button" class="btn" data-order-action="reopen" data-id="${escapeHtml(order.id)}">Вернуть в новые</button>`
              : `<button type="button" class="btn btn-primary" data-order-action="done" data-id="${escapeHtml(order.id)}">Выполнен</button>`
          }
          <button type="button" class="btn" data-order-action="remove" data-id="${escapeHtml(order.id)}">Удалить</button>
        </div>
      </footer>
    </article>`;
}

function renderOrders() {
  if (!isAuthed()) return;
  const orders = readOrders();
  const visible = orders.filter((order) => {
    if (orderFilter === "new") return order.status !== "done";
    if (orderFilter === "done") return order.status === "done";
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

orderFilters.forEach((button) => {
  button.addEventListener("click", () => {
    orderFilter = button.dataset.orderFilter;
    orderFilters.forEach((node) => node.classList.toggle("is-active", node === button));
    renderOrders();
  });
});

board.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.orderAction;
  if (action === "done") setOrderStatus(id, "done");
  if (action === "reopen") setOrderStatus(id, "new");
  if (action === "remove") {
    if (confirm("Точно удалить заказ?")) removeOrder(id);
  }
  renderOrders();
});

// -----------------------------------------------------------------------------
// 2. УПРАВЛЕНИЕ ТОВАРАМИ И ВИТРИНОЙ
// -----------------------------------------------------------------------------
const productsTableBody = document.getElementById("productsTableBody");
const productsCountEl = document.getElementById("productsCount");
const showcaseHitSelect = document.getElementById("showcaseHitSelect");
const btnSaveShowcase = document.getElementById("btnSaveShowcase");
const btnNewProduct = document.getElementById("btnNewProduct");

// Модальное окно
const productModal = document.getElementById("productModal");
const productEditForm = document.getElementById("productEditForm");
const modalHeading = document.getElementById("modalHeading");
const editId = document.getElementById("editId");
const editTitle = document.getElementById("editTitle");
const editDepartment = document.getElementById("editDepartment");
const editSection = document.getElementById("editSection");
const editPrice = document.getElementById("editPrice");
const editSale = document.getElementById("editSale");
const editImage = document.getElementById("editImage");
const editShade = document.getElementById("editShade");
const editText = document.getElementById("editText");
const editHit = document.getElementById("editHit");
const btnModalCancel = document.getElementById("btnModalCancel");

function renderProductsTab() {
  productsCountEl.textContent = PRODUCTS.length;

  // Селект хита продаж
  showcaseHitSelect.innerHTML = PRODUCTS.map((item) => `
    <option value="${item.id}" ${item.hit ? "selected" : ""}>
      #${item.id} · ${escapeHtml(item.title)} (${formatPrice(itemPrice(item))})
    </option>
  `).join("");

  // Таблица товаров
  productsTableBody.innerHTML = PRODUCTS.map((item) => {
    const thumbHtml = item.image
      ? `<img src="${item.image}" alt="" class="admin-table-thumb" />`
      : `<div class="admin-table-thumb-empty" style="background:${item.shade || "#222"}">FCKIT</div>`;

    const hitBadge = item.hit ? `<span class="badge-tag is-hit">HIT</span>` : `<span class="hero-copy">—</span>`;
    const saleText = item.sale ? `<strong style="color:var(--white);">${formatPrice(item.sale)}</strong>` : `<span class="hero-copy">—</span>`;

    return `
      <tr>
        <td>${thumbHtml}</td>
        <td>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="hero-copy" style="font-size:12px;">#${item.id}</div>
        </td>
        <td>${DEPARTMENT_TITLES[item.department] || item.department} · ${SECTION_TITLES[item.section] || item.section}</td>
        <td>${formatPrice(item.price)}</td>
        <td>${saleText}</td>
        <td>${hitBadge}</td>
        <td style="text-align: right;">
          <div style="display:inline-flex; gap:6px;">
            <button type="button" class="btn" data-edit-id="${item.id}">Ред.</button>
            <button type="button" class="btn" data-delete-id="${item.id}">Удалить</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

btnSaveShowcase.addEventListener("click", () => {
  const chosenHitId = Number(showcaseHitSelect.value);
  PRODUCTS.forEach((p) => {
    p.hit = p.id === chosenHitId;
  });
  saveProducts(PRODUCTS);
  renderProductsTab();
  alert("Витрина успешно сохранена! Хит продаж обновлён на главной странице.");
});

btnNewProduct.addEventListener("click", () => {
  modalHeading.textContent = "Новый товар";
  editId.value = "";
  editTitle.value = "";
  editDepartment.value = "men";
  editSection.value = "tops";
  editPrice.value = "250000";
  editSale.value = "";
  editImage.value = "";
  editShade.value = "#1A1A1A";
  editText.value = "";
  editHit.checked = false;
  productModal.showModal();
});

btnModalCancel.addEventListener("click", () => productModal.close());

productEditForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const idVal = editId.value ? Number(editId.value) : Date.now();
  const priceVal = Number(editPrice.value) || 0;
  const saleVal = editSale.value ? Number(editSale.value) : null;

  if (saleVal && saleVal >= priceVal) {
    alert("Скидочная цена должна быть ниже базовой!");
    return;
  }

  const existingIndex = PRODUCTS.findIndex((p) => p.id === idVal);
  const updatedItem = {
    id: idVal,
    title: editTitle.value.trim(),
    department: editDepartment.value,
    section: editSection.value,
    price: priceVal,
    sale: saleVal,
    image: editImage.value.trim(),
    shade: editShade.value.trim() || "#1A1A1A",
    text: editText.value.trim(),
    hit: editHit.checked,
    ...(existingIndex >= 0 ? PRODUCTS[existingIndex] : {}),
  };
  // Перезаписываем обновлённые поля
  updatedItem.title = editTitle.value.trim();
  updatedItem.department = editDepartment.value;
  updatedItem.section = editSection.value;
  updatedItem.price = priceVal;
  updatedItem.sale = saleVal;
  updatedItem.image = editImage.value.trim();
  updatedItem.shade = editShade.value.trim() || "#1A1A1A";
  updatedItem.text = editText.value.trim();
  updatedItem.hit = editHit.checked;

  if (updatedItem.hit) {
    PRODUCTS.forEach((p) => (p.hit = false));
  }

  if (existingIndex >= 0) {
    PRODUCTS[existingIndex] = updatedItem;
  } else {
    PRODUCTS.unshift(updatedItem);
  }

  saveProducts(PRODUCTS);
  productModal.close();
  renderProductsTab();
  if (currentTab === "pricing") renderPricingTab();
});

productsTableBody.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-id]");
  if (editBtn) {
    const id = Number(editBtn.dataset.editId);
    const item = PRODUCTS.find((p) => p.id === id);
    if (!item) return;

    modalHeading.textContent = `Редактирование: #${item.id} ${item.title}`;
    editId.value = item.id;
    editTitle.value = item.title;
    editDepartment.value = item.department;
    editSection.value = item.section;
    editPrice.value = item.price;
    editSale.value = item.sale || "";
    editImage.value = item.image || "";
    editShade.value = item.shade || "#1A1A1A";
    editText.value = item.text || "";
    editHit.checked = !!item.hit;
    productModal.showModal();
    return;
  }

  const delBtn = e.target.closest("[data-delete-id]");
  if (delBtn) {
    const id = Number(delBtn.dataset.deleteId);
    if (confirm("Вы уверены, что хотите удалить этот товар из магазина?")) {
      PRODUCTS = PRODUCTS.filter((p) => p.id !== id);
      saveProducts(PRODUCTS);
      renderProductsTab();
    }
  }
});

// -----------------------------------------------------------------------------
// 3. ЦЕНООБРАЗОВАНИЕ, КАСТОМИЗАЦИЯ И LIVE PREVIEW
// -----------------------------------------------------------------------------
const priceProductSelect = document.getElementById("priceProductSelect");
const priceConfigForm = document.getElementById("priceConfigForm");
const inpBasePrice = document.getElementById("inpBasePrice");
const inpOldPrice = document.getElementById("inpOldPrice");
const inpInstallmentMonths = document.getElementById("inpInstallmentMonths");
const inpWeightGram = document.getElementById("inpWeightGram");
const inpTierQty = document.getElementById("inpTierQty");
const inpTierPrice = document.getElementById("inpTierPrice");
const inpPricePrefix = document.getElementById("inpPricePrefix");
const inpBenefitText = document.getElementById("inpBenefitText");
const inpBadgeText = document.getElementById("inpBadgeText");
const inpAccentColor = document.getElementById("inpAccentColor");
const livePreviewContainer = document.getElementById("livePreviewContainer");

let selectedProductForPrice = null;

function renderPricingTab() {
  priceProductSelect.innerHTML = PRODUCTS.map((item) => `
    <option value="${item.id}" ${selectedProductForPrice && selectedProductForPrice.id === item.id ? "selected" : ""}>
      #${item.id} · ${escapeHtml(item.title)}
    </option>
  `).join("");

  const chosenId = Number(priceProductSelect.value) || (PRODUCTS[0] ? PRODUCTS[0].id : null);
  loadProductIntoPriceForm(chosenId);
}

function loadProductIntoPriceForm(id) {
  selectedProductForPrice = PRODUCTS.find((p) => p.id === id) || PRODUCTS[0];
  if (!selectedProductForPrice) return;

  const item = selectedProductForPrice;
  const tag = item.tagStyle || {};

  inpBasePrice.value = item.sale ? item.sale : item.price;
  inpOldPrice.value = item.sale ? item.price : "";
  inpInstallmentMonths.value = item.installmentMonths || 4;
  inpWeightGram.value = item.weightGram || "";

  const tier = (item.tiers && item.tiers[0]) || {};
  inpTierQty.value = tier.minQty || "";
  inpTierPrice.value = tier.price || "";

  inpPricePrefix.value = tag.prefix || "";
  inpBenefitText.value = tag.benefitText || "";
  inpBadgeText.value = tag.badgeText || "";
  inpAccentColor.value = tag.accentColor || "#ffffff";

  updateLivePreview();
}

priceProductSelect.addEventListener("change", () => {
  loadProductIntoPriceForm(Number(priceProductSelect.value));
});

function updateLivePreview() {
  if (!selectedProductForPrice) return;

  const basePrice = Number(inpBasePrice.value) || 0;
  const oldPrice = Number(inpOldPrice.value) || 0;
  const months = Number(inpInstallmentMonths.value) || 1;
  const weight = Number(inpWeightGram.value) || 0;
  const prefix = inpPricePrefix.value.trim();
  const benefit = inpBenefitText.value.trim();
  const badge = inpBadgeText.value.trim();
  const accent = inpAccentColor.value || "#ffffff";
  const tierQty = Number(inpTierQty.value) || 0;
  const tierPrice = Number(inpTierPrice.value) || 0;

  // Виртуальный макет товара
  const mockItem = {
    ...selectedProductForPrice,
    price: oldPrice > basePrice ? oldPrice : basePrice,
    sale: oldPrice > basePrice ? basePrice : null,
    installmentMonths: months,
    weightGram: weight,
    tiers: tierQty && tierPrice ? [{ minQty: tierQty, price: tierPrice }] : [],
    tagStyle: {
      prefix,
      benefitText: benefit,
      badgeText: badge,
      accentColor: accent,
    },
  };

  const cargoCost = weight > 0 ? Math.round((weight / 100) * 15000) : 0;

  livePreviewContainer.innerHTML = `
    <article class="card card--shelf" style="max-width:320px; margin:0 auto;">
      <div class="card__frame">
        ${mediaMarkup(mockItem, "card__visual")}
        ${dealBadge(mockItem)}
      </div>
      <div class="card__body">
        <p class="card__cat">${DEPARTMENT_TITLES[mockItem.department] || ""} · ${SECTION_TITLES[mockItem.section] || ""}</p>
        <h3 class="card__title">${escapeHtml(mockItem.title)}</h3>
        ${priceMarkup(mockItem)}
        ${cargoCost > 0 ? `<p class="price-tier" style="margin-top:4px;">Доставка карго: ~${formatPrice(cargoCost)}</p>` : ""}
      </div>
      <button type="button" class="btn btn-primary">В корзину</button>
    </article>
  `;
}

// Живое обновление при каждом изменении полей
["input", "change"].forEach((evt) => {
  priceConfigForm.addEventListener(evt, updateLivePreview);
});

priceConfigForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!selectedProductForPrice) return;

  const basePrice = Number(inpBasePrice.value) || 0;
  const oldPrice = Number(inpOldPrice.value) || 0;
  const months = Number(inpInstallmentMonths.value) || 1;
  const weight = Number(inpWeightGram.value) || 0;
  const prefix = inpPricePrefix.value.trim();
  const benefit = inpBenefitText.value.trim();
  const badge = inpBadgeText.value.trim();
  const accent = inpAccentColor.value || "#ffffff";
  const tierQty = Number(inpTierQty.value) || 0;
  const tierPrice = Number(inpTierPrice.value) || 0;

  if (oldPrice > 0 && oldPrice <= basePrice) {
    alert("Старая цена должна быть выше текущей базовой цены!");
    return;
  }

  // Обновляем выбранный товар
  const index = PRODUCTS.findIndex((p) => p.id === selectedProductForPrice.id);
  if (index >= 0) {
    PRODUCTS[index].price = oldPrice > basePrice ? oldPrice : basePrice;
    PRODUCTS[index].sale = oldPrice > basePrice ? basePrice : null;
    PRODUCTS[index].installmentMonths = months;
    PRODUCTS[index].weightGram = weight;
    PRODUCTS[index].tiers = tierQty && tierPrice ? [{ minQty: tierQty, price: tierPrice }] : [];
    PRODUCTS[index].tagStyle = {
      prefix,
      benefitText: benefit,
      badgeText: badge,
      accentColor: accent,
    };
    saveProducts(PRODUCTS);
    alert(`Ценник для товара #${PRODUCTS[index].id} «${PRODUCTS[index].title}» успешно обновлён!`);
  }
});

// -----------------------------------------------------------------------------
// 4. МАРКЕТИНГОВЫЕ АКЦИИ И РАСПИСАНИЕ
// -----------------------------------------------------------------------------
const promoForm = document.getElementById("promoForm");
const promoName = document.getElementById("promoName");
const promoBadge = document.getElementById("promoBadge");
const promoDiscount = document.getElementById("promoDiscount");
const promoTarget = document.getElementById("promoTarget");
const promoStart = document.getElementById("promoStart");
const promoEnd = document.getElementById("promoEnd");
const promosTableBody = document.getElementById("promosTableBody");

function renderPromosTab() {
  const now = new Date();

  promosTableBody.innerHTML = PROMOTIONS.map((promo) => {
    const sDate = new Date(promo.startDate);
    const eDate = new Date(promo.endDate);
    let statusLabel = `<span class="badge-tag" style="background:#2ecc71; color:#000;">Активна</span>`;

    if (now < sDate) {
      statusLabel = `<span class="badge-tag" style="background:#f39c12; color:#000;">Запланирована</span>`;
    } else if (now > eDate) {
      statusLabel = `<span class="badge-tag hero-copy">Истекла</span>`;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(promo.name)}</strong></td>
        <td><span class="badge-tag is-hit">${escapeHtml(promo.badgeText)}</span></td>
        <td>−${promo.discountValue}%</td>
        <td>${promo.target === "all" ? "Все товары" : SECTION_TITLES[promo.target] || promo.target}</td>
        <td>${escapeHtml(promo.startDate)} — ${escapeHtml(promo.endDate)}</td>
        <td>${statusLabel}</td>
        <td style="text-align:right;">
          <button type="button" class="btn" data-delete-promo="${promo.id}">Удалить</button>
        </td>
      </tr>
    `;
  }).join("");
}

promoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = promoStart.value;
  const eVal = promoEnd.value;

  if (new Date(s) > new Date(eVal)) {
    alert("Дата начала акции не может быть позже даты окончания!");
    return;
  }

  const newPromo = {
    id: `promo-${Date.now()}`,
    name: promoName.value.trim(),
    badgeText: promoBadge.value.trim(),
    discountType: "percent",
    discountValue: Number(promoDiscount.value) || 10,
    target: promoTarget.value,
    startDate: s,
    endDate: eVal,
    active: true,
  };

  PROMOTIONS.unshift(newPromo);
  savePromos(PROMOTIONS);
  promoForm.reset();
  renderPromosTab();
  alert("Маркетинговая акция успешно сохранена и запущена!");
});

promosTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete-promo]");
  if (btn) {
    const id = btn.dataset.deletePromo;
    if (confirm("Удалить акцию?")) {
      PROMOTIONS = PROMOTIONS.filter((p) => p.id !== id);
      savePromos(PROMOTIONS);
      renderPromosTab();
    }
  }
});

// -----------------------------------------------------------------------------
// АВТОРИЗАЦИЯ И СЕССИЯ
// -----------------------------------------------------------------------------
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

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLock();
  loginForm.password.focus();
});

window.addEventListener("storage", (event) => {
  if (event.key === ORDERS_KEY && isAuthed() && currentTab === "orders") renderOrders();
});

if (isAuthed()) showApp();
else showLock();