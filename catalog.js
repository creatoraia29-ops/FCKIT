const searchInput = document.getElementById("catalogSearch");
const searchBoard = document.getElementById("searchBoard");

function searchCard(item) {
  return `
    <a class="card" href="${item.section}.html?pick=${item.id}">
      <div class="card__frame">
        ${mediaMarkup(item, "card__visual")}
        ${dealBadge(item)}
      </div>
      <div class="card__body">
        <p class="card__cat">${DEPARTMENT_TITLES[item.department]} · ${SECTION_TITLES[item.section]}</p>
        <h4 class="card__title">${item.title}</h4>
        ${priceMarkup(item)}
      </div>
    </a>`;
}

function renderSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchBoard.hidden = true;
    searchBoard.innerHTML = "";
    return;
  }

  const list = PRODUCTS.filter((item) => {
    const hay = `${item.title} ${SECTION_TITLES[item.section]} ${DEPARTMENT_TITLES[item.department]}`.toLowerCase();
    return hay.includes(query);
  });

  searchBoard.hidden = false;
  searchBoard.innerHTML = list.length
    ? `<div class="product-grid search-grid">${list.map(searchCard).join("")}</div>`
    : `<p class="search-empty">Такой вещи нет</p>`;
}

searchInput.addEventListener("input", renderSearch);
searchInput.form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderSearch();
});
