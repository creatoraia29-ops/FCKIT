const ADMIN_SESSION_KEY = "fckit-admin-session";
const ADMIN_TOKEN_KEY = "fckit-admin-token";

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
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" && Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY));
}

async function syncOrdersFromServer() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return;
  try {
    const res = await fetch(apiEndpoint("/api/orders"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const serverOrders = await res.json();
      if (Array.isArray(serverOrders) && serverOrders.length > 0) {
        const local = readOrders();
        const map = new Map();
        local.forEach((o) => map.set(o.id, o));
        serverOrders.forEach((o) => map.set(o.id, { ...map.get(o.id), ...o }));
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        writeOrders(merged);
        if (currentTab === "orders") renderOrders();
      }
    }
  } catch (err) {
    console.warn("Could not sync orders from server:", err);
  }
}

function showApp() {
  lock.hidden = true;
  app.hidden = false;
  switchTab(currentTab);
  syncOrdersFromServer();
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
        <p class="card__price">${formatPrice(item.price)} · ${item.qty} шт.${item.size ? ` · <span class="badge-tag" style="padding: 1px 6px; font-weight: 700; background: rgba(255,255,255,0.08); border: 1px solid var(--line);">Размер: ${escapeHtml(item.size)}</span>` : ""}</p>
      </div>
      <p class="cart-item__sum">${formatPrice(item.price * item.qty)}</p>
    </article>`;
}

function orderMarkup(order) {
  const done = order.status === "done";
  const itemsLabel = `${order.items.length} ${plural(order.items.length, "вещь", "вещи", "вещей")}`;
  
  let paymentBadge = "";
  if (order.paymentStatus === "paid") {
    paymentBadge = `<span style="background: rgba(46, 204, 113, 0.15); color: #2ecc71; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">Оплачен картой</span>`;
  } else if (order.paymentStatus === "awaiting_verification") {
    paymentBadge = `<span style="background: rgba(241, 196, 15, 0.15); color: #f1c40f; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">Чек на проверке</span>`;
  } else {
    paymentBadge = `<span style="background: rgba(255, 255, 255, 0.08); color: var(--muted); padding: 2px 8px; border-radius: 4px; font-size: 11.5px;">Ожидает оплаты</span>`;
  }

  let receiptLink = "";
  const pDetails = order.paymentDetails || {};
  if (pDetails.receiptUrl) {
    const fullUrl = pDetails.receiptUrl.startsWith("http") ? pDetails.receiptUrl : (window.FCKIT_API_URL || "") + pDetails.receiptUrl;
    receiptLink = `
      <div style="margin-top: 8px; display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 6px;">
        <span style="font-size: 16px;">🧾</span>
        <a href="${fullUrl}" target="_blank" rel="noopener" style="color: #63b3ed; font-size: 13px; text-decoration: underline;">
          Посмотреть прикреплённый чек
        </a>
        ${pDetails.transactionId ? `<span style="color: var(--muted); font-size: 12px;">(TX: ${escapeHtml(pDetails.transactionId)})</span>` : ""}
      </div>
    `;
  } else if (pDetails.transactionId) {
    receiptLink = `<div style="margin-top: 6px; font-size: 12.5px; color: var(--muted);">Номер транзакции: <strong>${escapeHtml(pDetails.transactionId)}</strong></div>`;
  }

  return `
    <article class="order-card${done ? " is-done" : ""}">
      <header class="order-card__head">
        <div>
          <p class="eyebrow">${escapeHtml(order.id)}</p>
          <p class="order-time">
            <time datetime="${escapeHtml(order.createdAt)}">${escapeHtml(formatDateTime(order.createdAt))}</time>
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${paymentBadge}
          <span class="order-status">${done ? "Выполнен" : "Новый"}</span>
        </div>
      </header>
      <p class="order-meta">
        <strong>${escapeHtml(order.name)}</strong> · <a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a> · ${itemsLabel}
        ${order.note ? ` · <em>${escapeHtml(order.note)}</em>` : ""}
      </p>
      ${receiptLink}
      <div class="cart-list" style="margin-top: 10px;">
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
const adminDeptFilter = document.getElementById("adminDeptFilter");
const adminSectionFilter = document.getElementById("adminSectionFilter");
const adminProductSearch = document.getElementById("adminProductSearch");

let adminActiveDept = "all";
let adminActiveSection = "all";
let adminSearchQuery = "";

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
const editImageFile = document.getElementById("editImageFile");
const adminPhotoPrompt = document.getElementById("adminPhotoPrompt");
const adminPhotoPreviewBox = document.getElementById("adminPhotoPreviewBox");
const adminPhotoPreviewImg = document.getElementById("adminPhotoPreviewImg");
const adminPhotoPreviewName = document.getElementById("adminPhotoPreviewName");
const btnRemoveAdminPhoto = document.getElementById("btnRemoveAdminPhoto");
const editShade = document.getElementById("editShade");
const editText = document.getElementById("editText");
const editHit = document.getElementById("editHit");
const btnModalCancel = document.getElementById("btnModalCancel");

function compressProductImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 900;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateAdminPhotoPreview(src, name = "Фото товара") {
  if (src) {
    if (adminPhotoPrompt) adminPhotoPrompt.style.display = "none";
    if (adminPhotoPreviewBox) adminPhotoPreviewBox.style.display = "flex";
    if (adminPhotoPreviewImg) adminPhotoPreviewImg.src = src;
    if (adminPhotoPreviewName) adminPhotoPreviewName.textContent = name;
  } else {
    if (adminPhotoPrompt) adminPhotoPrompt.style.display = "flex";
    if (adminPhotoPreviewBox) adminPhotoPreviewBox.style.display = "none";
    if (adminPhotoPreviewImg) adminPhotoPreviewImg.src = "";
    if (editImage) editImage.value = "";
    if (editImageFile) editImageFile.value = "";
  }
}

editImageFile?.addEventListener("change", async () => {
  const file = editImageFile.files?.[0];
  if (!file) return;
  try {
    const compressed = await compressProductImage(file);
    editImage.value = compressed;
    updateAdminPhotoPreview(compressed, file.name);
  } catch (err) {
    alert("Не удалось загрузить фото: " + err.message);
  }
});

btnRemoveAdminPhoto?.addEventListener("click", (e) => {
  e.stopPropagation();
  updateAdminPhotoPreview("");
});

editImage?.addEventListener("input", () => {
  const val = editImage.value.trim();
  if (val) {
    updateAdminPhotoPreview(val, "Указанная ссылка");
  } else {
    updateAdminPhotoPreview("");
  }
});

function renderProductsTab() {
  const filteredList = PRODUCTS.filter((item) => {
    if (adminActiveDept !== "all" && item.department !== adminActiveDept) return false;
    if (adminActiveSection !== "all" && item.section !== adminActiveSection) return false;
    if (adminSearchQuery) {
      const q = adminSearchQuery.toLowerCase();
      const hay = `${item.id} ${item.title} ${DEPARTMENT_TITLES[item.department] || ""} ${SECTION_TITLES[item.section] || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  productsCountEl.textContent = (filteredList.length === PRODUCTS.length)
    ? PRODUCTS.length
    : `${filteredList.length} из ${PRODUCTS.length}`;

  // Селект хита продаж
  showcaseHitSelect.innerHTML = PRODUCTS.map((item) => `
    <option value="${item.id}" ${item.hit ? "selected" : ""}>
      #${item.id} · ${escapeHtml(item.title)} [${DEPARTMENT_TITLES[item.department] || item.department}] (${formatPrice(itemPrice(item))})
    </option>
  `).join("");

  // Таблица товаров
  if (!filteredList.length) {
    productsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 28px; color: var(--muted);">
          Товары по выбранным фильтрам не найдены
        </td>
      </tr>`;
    return;
  }

  productsTableBody.innerHTML = filteredList.map((item) => {
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

if (adminDeptFilter) {
  adminDeptFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-admin-dept]");
    if (!btn) return;
    adminActiveDept = btn.dataset.adminDept;
    adminDeptFilter.querySelectorAll("[data-admin-dept]").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderProductsTab();
  });
}

if (adminSectionFilter) {
  adminSectionFilter.addEventListener("change", () => {
    adminActiveSection = adminSectionFilter.value;
    renderProductsTab();
  });
}

if (adminProductSearch) {
  let searchTimer = null;
  adminProductSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      adminSearchQuery = adminProductSearch.value.trim();
      renderProductsTab();
    }, 120);
  });
}

btnSaveShowcase.addEventListener("click", async () => {
  const chosenHitId = Number(showcaseHitSelect.value);
  PRODUCTS.forEach((p) => {
    p.hit = p.id === chosenHitId;
  });
  try {
    await saveProducts(PRODUCTS);
    renderProductsTab();
    alert("Витрина успешно сохранена! Хит продаж обновлён на главной странице.");
  } catch (err) {
    alert("Не удалось сохранить витрину: " + err.message);
  }
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
  updateAdminPhotoPreview("");
  productModal.showModal();
});

btnModalCancel.addEventListener("click", () => productModal.close());

productEditForm.addEventListener("submit", async (e) => {
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

  productModal.close();
  try {
    await saveProducts(PRODUCTS);
    renderProductsTab();
    if (currentTab === "pricing") renderPricingTab();
  } catch (err) {
    alert("Ошибка сохранения товара на сервере: " + err.message);
  }
});

productsTableBody.addEventListener("click", async (e) => {
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
    updateAdminPhotoPreview(item.image || "", item.title);
    productModal.showModal();
    return;
  }

  const delBtn = e.target.closest("[data-delete-id]");
  if (delBtn) {
    const id = Number(delBtn.dataset.deleteId);
    if (confirm("Вы уверены, что хотите удалить этот товар из магазина?")) {
      const prevList = [...PRODUCTS];
      PRODUCTS = PRODUCTS.filter((p) => p.id !== id);
      try {
        await saveProducts(PRODUCTS);
        renderProductsTab();
        if (currentTab === "pricing") renderPricingTab();
      } catch (err) {
        PRODUCTS = prevList;
        renderProductsTab();
        alert("Ошибка удаления товара на сервере: " + err.message);
      }
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
      #${item.id} · ${escapeHtml(item.title)} [${DEPARTMENT_TITLES[item.department] || item.department}]
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

priceConfigForm.addEventListener("submit", async (e) => {
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
    try {
      await saveProducts(PRODUCTS);
      alert(`Ценник для товара #${PRODUCTS[index].id} «${PRODUCTS[index].title}» успешно обновлён!`);
    } catch (err) {
      alert("Ошибка сохранения ценника: " + err.message);
    }
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

promoForm.addEventListener("submit", async (e) => {
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
  try {
    await savePromos(PROMOTIONS);
    promoForm.reset();
    renderPromosTab();
    alert("Маркетинговая акция успешно сохранена и запущена!");
  } catch (err) {
    PROMOTIONS.shift();
    alert("Ошибка сохранения акции: " + err.message);
  }
});

promosTableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete-promo]");
  if (btn) {
    const id = btn.dataset.deletePromo;
    if (confirm("Удалить акцию?")) {
      const prev = [...PROMOTIONS];
      PROMOTIONS = PROMOTIONS.filter((p) => p.id !== id);
      try {
        await savePromos(PROMOTIONS);
        renderPromosTab();
      } catch (err) {
        PROMOTIONS = prev;
        renderPromosTab();
        alert("Ошибка удаления акции: " + err.message);
      }
    }
  }
});

// -----------------------------------------------------------------------------
// АВТОРИЗАЦИЯ И СЕССИЯ
// -----------------------------------------------------------------------------
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(new FormData(loginForm).get("password") || "").trim();
  if (!password) return;

  const submitBtn = loginForm.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(apiEndpoint("/api/admin/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      loginError.textContent = data.error || "Неверный пароль администратора";
      loginError.hidden = false;
      loginForm.password.value = "";
      loginForm.password.focus();
      return;
    }

    sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    loginError.hidden = true;
    loginForm.reset();
    showApp();
  } catch (err) {
    loginError.textContent = "Ошибка сети при авторизации";
    loginError.hidden = false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  showLock();
  loginForm.password.focus();
});

window.addEventListener("storage", (event) => {
  if (event.key === ORDERS_KEY && isAuthed() && currentTab === "orders") renderOrders();
});

if (isAuthed()) showApp();
else showLock();