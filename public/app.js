const STORAGE_KEY = "quote-tool-state-v2";
const OLD_STORAGE_KEY = "quote-tool-state-v1";

const state = {
  versions: [],
  categories: [],
  activeVersionId: "",
  activePage: "manager",
  categoryLibraryCollapsed: true,
  customers: [],
  quotes: [],
  activeCustomerId: "",
  activeQuoteId: "",
  pendingPriceItemName: ""
};

const els = {};
let dataFileHandle = null;
let tauriReady = false;

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  await loadState();
  bindEvents();
  renderAll();
});

function bindElements() {
  [
    "saveStatus", "saveAllBtn", "printBtn", "resetBtn", "addCustomerBtn", "addQuoteBtn",
    "exportDataBtn", "importDataBtn", "bindFileBtn", "saveFileBtn", "importDataFile",
    "customerName", "customerContact", "customerPhone", "customerAddress", "customerList", "quoteList",
    "projectName", "clientName", "quoteDate", "priceVersion", "libraryPriceVersion",
    "cloneVersionBtn", "renameVersionBtn", "managementRate", "taxRate",
    "subtotalText", "managementText", "taxText", "grandTotalText", "addLineBtn", "quoteLines",
    "priceSearch", "priceCount", "priceList", "addPriceItemBtn", "previewTitle", "previewMeta", "previewTotal",
    "categoryList", "addCategoryBtn", "toggleCategoryLibraryBtn", "categoryLibraryPanel",
    "previewRows", "previewSubtotal", "previewManagement", "previewTax", "previewGrand"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

async function loadState() {
  const serverState = await loadStateFromServer();
  if (serverState) {
    Object.assign(state, serverState);
    normalizeState();
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    Object.assign(state, JSON.parse(saved));
    normalizeState();
    return;
  }

  const initial = await loadInitialPrices();
  state.versions = initial.versions;
  state.activeVersionId = state.versions[0].id;

  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old) {
    migrateOldState(JSON.parse(old));
  } else {
    createStarterData();
  }
  saveState("已载入数据");
}

function migrateOldState(oldState) {
  state.versions = oldState.versions?.length ? oldState.versions : state.versions;
  state.activeVersionId = oldState.activeVersionId || state.activeVersionId;
  const quote = normalizeQuote({
    ...(oldState.quote || {}),
    id: makeId("quote"),
    customerId: makeId("customer"),
    priceVersionId: state.activeVersionId,
    name: oldState.quote?.projectName || "未命名报价"
  });
  const customer = normalizeCustomer({
    id: quote.customerId,
    name: quote.clientName || "默认客户"
  });
  state.customers = [customer];
  state.quotes = [quote];
  state.activeCustomerId = customer.id;
  state.activeQuoteId = quote.id;
}

function createStarterData() {
  const customer = normalizeCustomer({ id: makeId("customer"), name: "默认客户" });
  const quote = normalizeQuote({
    id: makeId("quote"),
    customerId: customer.id,
    name: "马市角办公楼三层改造",
    clientName: customer.name,
    projectName: "马市角办公楼三层改造",
    priceVersionId: state.activeVersionId,
    lines: [
      makeLine("拆除墙体/平米", "墙体", 15),
      makeLine("套装门拆除/樘", "套装门", 1),
      makeLine("电路开槽/米", "水电", 50)
    ]
  });
  state.customers = [customer];
  state.quotes = [quote];
  state.activeCustomerId = customer.id;
  state.activeQuoteId = quote.id;
}

function normalizeState() {
  state.versions = state.versions?.length ? state.versions : [];
  state.categories = normalizeCategories([...(state.categories || []), ...deriveCategoriesFromVersions(state.versions)]);
  state.versions = state.versions.map((version) => normalizeVersion(version));
  state.activeVersionId = state.activeVersionId || state.versions[0]?.id || "";
  state.customers = (state.customers || []).map(normalizeCustomer);
  state.quotes = (state.quotes || []).map(normalizeQuote);
  if (!state.customers.length) {
    const customer = normalizeCustomer({ id: makeId("customer"), name: "默认客户" });
    state.customers.push(customer);
    state.activeCustomerId = customer.id;
  }
  if (!state.quotes.length) {
    state.quotes.push(normalizeQuote({ id: makeId("quote"), customerId: state.customers[0].id, clientName: state.customers[0].name }));
  }
  state.activeCustomerId = state.activeCustomerId || state.customers[0].id;
  state.activeQuoteId = state.activeQuoteId || state.quotes[0].id;
  state.activePage = state.activePage || "manager";
  state.categoryLibraryCollapsed = state.categoryLibraryCollapsed ?? true;
}

function normalizeCategories(categories) {
  const seen = new Set();
  return (categories || []).reduce((list, category) => {
    const name = String(category?.name || "").trim();
    if (!name || seen.has(name)) return list;
    seen.add(name);
    list.push({
      id: category?.id || makeId("category"),
      name,
      sortOrder: Number.isFinite(Number(category?.sortOrder)) ? Number(category.sortOrder) : list.length
    });
    return list;
  }, []).sort((a, b) => a.sortOrder - b.sortOrder);
}

function deriveCategoriesFromVersions(versions) {
  const categories = [];
  (versions || []).forEach((version) => {
    (version.items || []).forEach((item) => {
      const name = String(item?.category || "").trim();
      if (!name) return;
      categories.push({ name, sortOrder: categories.length });
    });
  });
  return categories;
}

function normalizeVersion(version) {
  return {
    ...version,
    items: (version.items || []).map((item, index) => normalizePriceItem(item, index))
  };
}

function normalizePriceItem(item, index = 0) {
  const categoryName = String(item?.category || "").trim();
  const category = state.categories.find((entry) => entry.id === item?.categoryId)
    || state.categories.find((entry) => entry.name === categoryName);
  return {
    ...item,
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    categoryId: category?.id || "",
    category: category?.name || categoryName
  };
}

function normalizeCustomer(customer) {
  return {
    id: customer.id || makeId("customer"),
    name: customer.name || "未命名客户",
    contact: customer.contact || "",
    phone: customer.phone || "",
    address: customer.address || ""
  };
}

function normalizeQuote(quote) {
  const customer = state.customers.find((item) => item.id === quote.customerId);
  const normalized = {
    id: quote.id || makeId("quote"),
    customerId: quote.customerId || state.activeCustomerId || "",
    name: quote.name || quote.projectName || "未命名报价",
    projectName: quote.projectName || quote.name || "未命名工程",
    clientName: quote.clientName || customer?.name || "",
    quoteDate: quote.quoteDate || new Date().toISOString().slice(0, 10),
    priceVersionId: quote.priceVersionId || state.activeVersionId,
    managementRate: quote.managementRate ?? 3,
    taxRate: quote.taxRate ?? 1,
    lines: quote.lines || []
  };
  normalized.lines = normalized.lines.map((line) => normalizeLine(line, normalized.priceVersionId));
  return normalized;
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });
  els.saveAllBtn.addEventListener("click", () => saveState("已保存"));
  els.exportDataBtn.addEventListener("click", exportDataFile);
  els.importDataBtn.addEventListener("click", () => els.importDataFile.click());
  els.importDataFile.addEventListener("change", importDataFile);
  if (els.bindFileBtn) els.bindFileBtn.addEventListener("click", bindDataFile);
  if (els.saveFileBtn) els.saveFileBtn.addEventListener("click", saveToBoundFile);
  els.printBtn.addEventListener("click", () => {
    switchPage("editor");
    setTimeout(() => window.print(), 50);
  });
  els.resetBtn.addEventListener("click", resetData);
  els.addQuoteBtn.addEventListener("click", addQuote);
  els.cloneVersionBtn.addEventListener("click", cloneVersion);
  els.renameVersionBtn.addEventListener("click", renameVersion);
  els.addLineBtn.addEventListener("click", addLine);
  if (els.addPriceItemBtn) els.addPriceItemBtn.addEventListener("click", addPriceItem);
  if (els.addCategoryBtn) els.addCategoryBtn.addEventListener("click", addCategory);
  if (els.toggleCategoryLibraryBtn) {
    els.toggleCategoryLibraryBtn.addEventListener("click", toggleCategoryLibrary);
  }
  els.priceSearch.addEventListener("input", renderPrices);
  els.priceVersion.addEventListener("change", () => setQuoteField("priceVersionId", els.priceVersion.value, true));
  els.libraryPriceVersion.addEventListener("change", () => {
    state.activeVersionId = els.libraryPriceVersion.value;
    const quote = currentQuote();
    if (quote) quote.priceVersionId = state.activeVersionId;
    saveState("已切换价格版本");
    renderAll();
  });

  ["projectName", "clientName", "quoteDate", "managementRate", "taxRate"].forEach((id) => {
    els[id].addEventListener("input", () => {
      const value = els[id].type === "number" ? toNumber(els[id].value) : els[id].value;
      setQuoteField(id, value);
    });
  });
  ["customerName", "customerContact", "customerPhone", "customerAddress"].forEach((id) => {
    if (els[id]) els[id].addEventListener("input", updateActiveCustomerFromForm);
  });
}

function switchPage(page) {
  state.activePage = page;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `${page}Page`);
  });
  saveState("已切换页面");
}

function currentQuote() {
  return state.quotes.find((quote) => quote.id === state.activeQuoteId)
    || state.quotes.find((quote) => quote.customerId === state.activeCustomerId)
    || state.quotes[0];
}

function currentCustomer() {
  return state.customers.find((customer) => customer.id === state.activeCustomerId) || state.customers[0];
}

function currentVersion() {
  const quote = currentQuote();
  const versionId = state.activePage === "prices" ? state.activeVersionId : (quote?.priceVersionId || state.activeVersionId);
  return state.versions.find((version) => version.id === versionId) || state.versions[0];
}

function currentItems() {
  const items = (currentVersion()?.items || []).slice();
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  return items.sort((a, b) => {
    const leftCategory = categoryIndex.has(a.categoryId) ? categoryIndex.get(a.categoryId) : Number.MAX_SAFE_INTEGER;
    const rightCategory = categoryIndex.has(b.categoryId) ? categoryIndex.get(b.categoryId) : Number.MAX_SAFE_INTEGER;
    if (leftCategory !== rightCategory) return leftCategory - rightCategory;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
  });
}

function currentCategories() {
  return (state.categories || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function findItem(name, versionId = currentVersion()?.id) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  return version?.items.find((item) => item.name === name);
}

function findCategory(categoryId) {
  return currentCategories().find((category) => category.id === categoryId);
}

function categoryNameForItem(item) {
  return findCategory(item?.categoryId)?.name || String(item?.category || "").trim();
}

function makeLine(itemName = "", area = "", quantity = 0) {
  const item = findItem(itemName);
  return normalizeLine({
    id: makeId("line"),
    priceItemName: itemName,
    area,
    quantity,
    material: item ? item.material : 0,
    auxiliary: item ? item.auxiliary : 0,
    wasteRate: item ? item.wasteRate : 0,
    labor: item ? item.labor : 0,
    note: item ? item.description : ""
  });
}

function normalizeLine(line, versionId = currentVersion()?.id) {
  const priceItemName = line.priceItemName || line.itemName || "";
  const item = findItem(priceItemName, versionId);
  const hasSplitPrice = ["material", "auxiliary", "wasteRate", "labor"].some((key) => line[key] !== undefined && line[key] !== null);
  const rawEngineeringName = line.engineeringName || line.itemName || "";
  const fallbackEngineeringName = rawEngineeringName || (priceItemName ? displayEngineeringName(priceItemName) : "");
  return {
    id: line.id || makeId("line"),
    engineeringName: priceItemName && rawEngineeringName === displayEngineeringName(priceItemName)
      ? priceItemName
      : fallbackEngineeringName,
    priceItemName,
    area: line.area || "",
    quantity: toNumber(line.quantity),
    material: hasSplitPrice ? toNumber(line.material) : toNumber(item?.material),
    auxiliary: hasSplitPrice ? toNumber(line.auxiliary) : toNumber(item?.auxiliary),
    wasteRate: hasSplitPrice ? toNumber(line.wasteRate) : toNumber(item?.wasteRate),
    labor: hasSplitPrice ? toNumber(line.labor) : toNumber(item?.labor),
    legacyUnitPrice: hasSplitPrice || item ? (line.legacyUnitPrice ?? null) : (line.customPrice ?? null),
    note: line.note || item?.description || ""
  };
}

function renderAll() {
  switchPage(state.activePage);
  renderManager();
  renderSettings();
  renderLines();
  renderPrices();
  renderTotalsAndPreview();
}

function renderManager() {
  const activeCustomer = currentCustomer();
  if (els.customerName) els.customerName.value = activeCustomer.name;
  if (els.customerContact) els.customerContact.value = activeCustomer.contact;
  if (els.customerPhone) els.customerPhone.value = activeCustomer.phone;
  if (els.customerAddress) els.customerAddress.value = activeCustomer.address;

  if (els.customerList) {
    els.customerList.innerHTML = state.customers.map((customer) => `
      <button class="list-row ${customer.id === state.activeCustomerId ? "active" : ""}" type="button" data-customer-id="${escapeHtml(customer.id)}">
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml([customer.contact, customer.phone].filter(Boolean).join(" · ") || "未填写联系人")}</span>
      </button>
    `).join("");

    els.customerList.querySelectorAll(".list-row").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeCustomerId = button.dataset.customerId;
        const firstQuote = state.quotes.find((quote) => quote.customerId === state.activeCustomerId);
        if (firstQuote) state.activeQuoteId = firstQuote.id;
        saveState("已选择客户");
        renderAll();
      });
    });
  }

  const quotes = els.customerList
    ? state.quotes.filter((quote) => quote.customerId === state.activeCustomerId)
    : state.quotes;
  els.quoteList.innerHTML = quotes.map((quote) => {
    const totals = calculateTotals(quote);
    return `
      <div class="quote-card ${quote.id === state.activeQuoteId ? "active" : ""}" data-quote-id="${escapeHtml(quote.id)}">
        <div>
          <strong>${escapeHtml(quote.name)}</strong>
          <span>${escapeHtml(quote.quoteDate)} · ${formatMoney(totals.grand)}</span>
        </div>
        <button type="button" class="open-quote">打开</button>
      </div>
    `;
  }).join("");

  els.quoteList.querySelectorAll(".quote-card").forEach((card) => {
    card.querySelector(".open-quote").addEventListener("click", () => {
      state.activeQuoteId = card.dataset.quoteId;
      saveState("已打开报价");
      renderAll();
      switchPage("editor");
    });
  });
}

function renderSettings() {
  const quote = currentQuote();
  if (!quote) return;
  els.projectName.value = quote.projectName;
  els.clientName.value = quote.clientName || currentCustomer()?.name || "";
  els.quoteDate.value = quote.quoteDate;
  els.managementRate.value = quote.managementRate;
  els.taxRate.value = quote.taxRate;
  const versionOptions = state.versions.map((version) => (
    `<option value="${escapeHtml(version.id)}">${escapeHtml(version.name)}</option>`
  )).join("");
  els.priceVersion.innerHTML = versionOptions;
  els.libraryPriceVersion.innerHTML = versionOptions;
  els.priceVersion.value = quote.priceVersionId;
  els.libraryPriceVersion.value = state.activeVersionId;
}

function renderLines() {
  const quote = currentQuote();
  if (!quote) return;
  els.quoteLines.innerHTML = quote.lines.map((line) => {
    const item = findItem(line.priceItemName, quote.priceVersionId);
    const unit = item?.unit || "";
    const unitPrice = calculateLineUnitPrice(line);
    const engineeringDisplayName = line.priceItemName && line.engineeringName === displayEngineeringName(line.priceItemName)
      ? line.priceItemName
      : line.engineeringName;
    const amount = toNumber(line.quantity) * unitPrice;
    return `
      <div class="line-item" data-line-id="${escapeHtml(line.id)}">
        <div class="line-field project-field">
          <label>工程项目</label>
          <div class="project-picker">
            <input class="line-name" type="text" aria-label="工程项目" placeholder="输入工程项目，选择相似价格条目" value="${escapeHtml(engineeringDisplayName)}" autocomplete="off">
            <button class="edit-price-item ghost small" type="button" ${line.priceItemName ? "" : "disabled"}>编辑</button>
            <div class="suggestions"></div>
          </div>
        </div>
        <div class="line-field area-field">
          <label>区域</label>
          <input class="line-area" type="text" aria-label="区域" placeholder="位置/房间" value="${escapeHtml(line.area)}">
        </div>
        <div class="line-field qty-field">
          <label>工程量</label>
          <input class="line-qty" type="number" min="0" step="0.01" aria-label="工程量" placeholder="数量" value="${line.quantity}">
        </div>
        <div class="line-field unit-field">
          <label>单位</label>
          <div class="line-unit">${escapeHtml(unit)}</div>
        </div>
        <div class="line-field price-field">
          <label>综合单价</label>
          <div class="readonly-price">${formatMoney(unitPrice)}</div>
        </div>
        <div class="line-field amount-field">
          <label>金额</label>
          <div class="amount">${formatMoney(amount)}</div>
        </div>
        <div class="line-field action-field">
          <label class="action-label" aria-hidden="true">&nbsp;</label>
          <button class="remove-btn" type="button" aria-label="删除">×</button>
        </div>
      </div>
    `;
  }).join("");

  els.quoteLines.querySelectorAll(".line-item").forEach((node) => {
    const line = quote.lines.find((entry) => entry.id === node.dataset.lineId);
    const nameInput = node.querySelector(".line-name");
    const suggestions = node.querySelector(".suggestions");
    nameInput.addEventListener("input", () => {
      line.engineeringName = nameInput.value;
      saveState("已自动保存");
      renderSuggestions(suggestions, line, nameInput.value);
      renderTotalsAndPreview();
    });
    nameInput.addEventListener("focus", () => renderSuggestions(suggestions, line, nameInput.value));
    nameInput.addEventListener("blur", () => setTimeout(() => { suggestions.innerHTML = ""; }, 120));
    nameInput.addEventListener("keydown", (event) => handleSuggestionKeys(event, suggestions, line));
    node.querySelector(".line-area").addEventListener("input", (event) => {
      line.area = event.target.value;
      saveState("已自动保存");
      renderTotalsAndPreview();
    });
    node.querySelector(".line-qty").addEventListener("input", (event) => {
      line.quantity = toNumber(event.target.value);
      saveState("已自动保存");
      const amountNode = node.querySelector(".amount");
      if (amountNode) amountNode.textContent = formatMoney(toNumber(line.quantity) * calculateLineUnitPrice(line));
      renderTotalsAndPreview();
    });
    node.querySelector(".edit-price-item").addEventListener("click", () => {
      if (!line.priceItemName) return;
      openPriceItemEditor(line.priceItemName, quote.priceVersionId);
    });
    node.querySelector(".remove-btn").addEventListener("click", () => {
      quote.lines = quote.lines.filter((entry) => entry.id !== line.id);
      saveState("已删除工程项目");
      renderAll();
    });
  });
}

function renderSuggestions(container, line, query) {
  const cleaned = normalizeName(query);
  const exactItem = cleaned ? findItem(cleaned) : null;
  const matches = findSimilarItems(cleaned).slice(0, 5);
  const comparableItems = cleaned ? findComparableItems(cleaned, 5) : [];
  const hasPrefixMatch = cleaned ? currentItems().some((item) => {
    const itemName = normalizeName(item.name).toLowerCase();
    return itemName !== cleaned.toLowerCase() && itemName.startsWith(cleaned.toLowerCase());
  }) : false;
  const canCreate = Boolean(cleaned) && !exactItem && !hasPrefixMatch;

  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }

  const visibleItems = matches.length ? matches : comparableItems;
  if (!visibleItems.length && !canCreate) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }

  const hint = exactItem
    ? `已找到匹配项：${exactItem.name}`
    : matches.length
      ? "找到相似项，先选已有条目，避免重复。"
      : "没有找到完全匹配项，下面先看相似条目，再决定是否新增。";

  const itemButtons = visibleItems.map((item) => `
    <button class="suggestion" type="button" data-item-name="${escapeHtml(item.name)}">
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "项")}</small>
      </span>
      <b>${formatMoney(calculateItemUnitPrice(item))}</b>
    </button>
  `).join("");

  const createButton = canCreate ? `
    <button class="suggestion suggestion-create" type="button" data-create-name="${escapeHtml(cleaned)}">
      <span>
        <strong>新增“${escapeHtml(cleaned)}”</strong>
        <small>把当前输入保存到价格库，并继续使用这个名称</small>
      </span>
      <b>+</b>
    </button>
  ` : "";

  container.innerHTML = `
    <div class="suggestion-hint">${escapeHtml(hint)}</div>
    ${createButton}
    ${itemButtons}
  `;

  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activateSuggestion(button, line);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function handleSuggestionKeys(event, container, line) {
  const buttons = [...container.querySelectorAll(".suggestion")];
  if (event.key === "Escape") {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }
  if (!buttons.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
  event.preventDefault();
  let index = Number(container.dataset.activeIndex || 0);
  if (event.key === "ArrowDown") index = Math.min(index + 1, buttons.length - 1);
  if (event.key === "ArrowUp") index = Math.max(index - 1, 0);
  container.dataset.activeIndex = String(index);
  updateActiveSuggestion(container);
  if (event.key === "Enter") activateSuggestion(buttons[index], line);
}

function updateActiveSuggestion(container) {
  const activeIndex = Number(container.dataset.activeIndex || 0);
  container.querySelectorAll(".suggestion").forEach((button, index) => {
    button.classList.toggle("active", index === activeIndex);
    if (index === activeIndex) button.scrollIntoView({ block: "nearest" });
  });
}

function selectSuggestedItem(itemName, line) {
  const item = findItem(itemName);
  if (!item) return;
  line.engineeringName = item.name;
  line.priceItemName = item.name;
  line.material = item.material;
  line.auxiliary = item.auxiliary;
  line.wasteRate = item.wasteRate;
  line.labor = item.labor;
  line.legacyUnitPrice = null;
  line.note = item.description;
  saveState("已选择价格条目");
  renderLines();
  renderTotalsAndPreview();
}

function activateSuggestion(button, line) {
  if (!button) return;
  if (button.dataset.itemName) {
    selectSuggestedItem(button.dataset.itemName, line);
    return;
  }
  if (button.dataset.createName) {
    createPriceItemFromLine(line, button.dataset.createName);
  }
}

function openPriceItemEditor(itemName, versionId) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  if (!version) return;
  const existing = version.items.find((entry) => entry.name === itemName);
  state.activeVersionId = version.id;
  state.pendingPriceItemName = existing ? existing.name : itemName;
  switchPage("prices");
  renderAll();
}

function displayEngineeringName(itemName) {
  return String(itemName || "").replaceAll("/", "");
}

function findSimilarItems(query) {
  const cleaned = normalizeName(query).toLowerCase();
  return currentItems()
    .map((item) => ({ item, score: scoreItem(item, cleaned) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .map((entry) => entry.item);
}

function findComparableItems(query, limit = 5) {
  const cleaned = normalizeName(query).toLowerCase();
  if (!cleaned) return [];
  const ranked = currentItems()
    .map((item) => ({ item, score: scoreItem(item, cleaned) }))
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
  const positive = ranked.filter((entry) => entry.score > 0);
  const source = positive.length ? positive : ranked;
  return source.slice(0, limit).map((entry) => entry.item);
}

function scoreItem(item, query) {
  const name = item.name.toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const description = String(item.description || "").toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (name.includes(query)) return 80 - Math.min(name.length - query.length, 30);
  const tokens = query.split(/[\s/，,、]+/).filter(Boolean);
  let score = 0;
  tokens.forEach((token) => {
    if (name.includes(token)) score += 22;
    if (category.includes(token)) score += 10;
    if (description.includes(token)) score += 4;
  });
  for (const char of query) {
    if (char.trim() && name.includes(char)) score += 1;
  }
  return score;
}

function createPriceItemFromLine(line, rawName) {
  const version = currentVersion();
  if (!version) return;
  const name = normalizeName(rawName || line.engineeringName);
  if (!name) {
    alert("请先输入工程项目名称，再新增价格条目。");
    return;
  }

  const existing = version.items.find((item) => normalizeName(item.name) === name);
  if (existing) {
    alert(`价格库里已经有“${existing.name}”了，请直接从相似项里选择。`);
    return;
  }

  const comparable = findComparableItems(name, 5);
  const template = comparable[0];
  const similarText = comparable.length ? comparable.map((item) => item.name).join("、") : "暂无相似条目";
  if (!confirm(`要把“${name}”新增到当前价格库吗？\n\n相似条目：${similarText}`)) return;

  const newItem = {
    id: makeId("price"),
    name,
    sortOrder: nextItemSortOrder(template?.categoryId || ""),
    unit: template?.unit || "",
    categoryId: template?.categoryId || "",
    category: template?.category || "",
    description: line.note || template?.description || "",
    material: template ? toNumber(template.material) : 0,
    auxiliary: template ? toNumber(template.auxiliary) : 0,
    wasteRate: template ? toNumber(template.wasteRate) : 0,
    labor: template ? toNumber(template.labor) : 0,
    costMaterial: template ? toNumber(template.costMaterial) : 0,
    costAuxiliary: template ? toNumber(template.costAuxiliary) : 0,
    costWasteRate: template ? toNumber(template.costWasteRate) : 0,
    costLabor: template ? toNumber(template.costLabor) : 0,
    unitPrice: template ? toNumber(template.unitPrice) : 0,
    costUnitPrice: template ? toNumber(template.costUnitPrice) : 0
  };

  version.items.push(newItem);
  selectSuggestedItem(newItem.name, line);
  line.note = newItem.description;
  saveState("已新增价格条目");
  renderAll();
}

function renderPrices() {
  renderCategoryLibrary();
  const keyword = els.priceSearch.value.trim().toLowerCase();
  const items = currentItems().filter((item) => {
    return !keyword || [item.name, categoryNameForItem(item), item.description].join(" ").toLowerCase().includes(keyword);
  });
  els.priceCount.textContent = `${items.length} 条价格条目`;
  const categoryOptions = [
    `<option value="">未分类</option>`,
    ...currentCategories().map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
  ].join("");
  const rows = items.map((item) => {
    const unitPrice = calculateItemUnitPrice(item);
    return `
      <tr class="price-row ${state.pendingPriceItemName === item.name ? "selected" : ""}" data-item-name="${escapeHtml(item.name)}" data-category-id="${escapeHtml(item.categoryId || "")}" draggable="true">
        <td><input class="price-name-input" type="text" aria-label="价格条目名称" value="${escapeHtml(item.name)}"></td>
        <td>
          <select class="price-category-select" aria-label="分类">
            ${categoryOptions}
          </select>
        </td>
        <td><input class="price-unit" type="text" aria-label="单位" value="${escapeHtml(item.unit || "")}"></td>
        <td><input class="price-material" type="number" min="0" step="0.01" aria-label="主材" value="${item.material}"></td>
        <td><input class="price-auxiliary" type="number" min="0" step="0.01" aria-label="辅材" value="${item.auxiliary}"></td>
        <td><input class="price-waste" type="number" min="0" max="100" step="0.1" aria-label="损耗百分比" value="${formatPercentInput(item.wasteRate)}"></td>
        <td><input class="price-labor" type="number" min="0" step="0.01" aria-label="人工" value="${item.labor}"></td>
        <td class="price-total"><b>${formatMoney(unitPrice)}</b></td>
        <td><textarea class="price-description" aria-label="说明">${escapeHtml(item.description || "")}</textarea></td>
        <td class="price-actions-cell"><button class="price-delete danger small" type="button" aria-label="删除条目">删除</button></td>
      </tr>
    `;
  }).join("");

  els.priceList.innerHTML = `
    <table class="price-table">
      <thead>
        <tr>
          <th>价格条目名称</th>
          <th>分类</th>
          <th>单位</th>
          <th>主材</th>
          <th>辅材</th>
          <th>损耗%</th>
          <th>人工</th>
          <th>综合单价</th>
          <th>说明</th>
          <th>删除</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  els.priceList.querySelectorAll(".price-row").forEach((node) => {
    let item = findItem(node.dataset.itemName);
    const bindText = (className, key) => {
      node.querySelector(`.${className}`).addEventListener("input", (event) => {
        if (key === "name") {
          const oldName = item.name;
          item.name = event.target.value;
          node.dataset.itemName = item.name;
          syncLinePriceItemName(oldName, item.name);
        } else {
          item[key] = event.target.value;
        }
        saveState("已更新价格库");
        renderLines();
        renderTotalsAndPreview();
      });
    };
    bindText("price-name-input", "name");
    bindText("price-unit", "unit");
    bindText("price-description", "description");
    const categorySelect = node.querySelector(".price-category-select");
    categorySelect.value = item.categoryId || "";
    categorySelect.addEventListener("change", (event) => {
      const category = findCategory(event.target.value);
      item.categoryId = category?.id || "";
      item.category = category?.name || "";
      item.sortOrder = nextItemSortOrder(item.categoryId, item.name);
      saveState("已更新价格库");
      renderPrices();
    });
    [
      ["price-material", "material"],
      ["price-auxiliary", "auxiliary"],
      ["price-waste", "wasteRate", "percent"],
      ["price-labor", "labor"]
    ].forEach(([className, key, mode]) => {
      node.querySelector(`.${className}`).addEventListener("input", (event) => {
        item[key] = mode === "percent" ? parsePercentInput(event.target.value) : toNumber(event.target.value);
        item.unitPrice = calculateItemUnitPrice(item);
        saveState("已更新价格库");
        syncLinePriceParts(item);
        node.querySelector(".price-total b").textContent = formatMoney(item.unitPrice);
        renderLines();
        renderTotalsAndPreview();
      });
    });
    node.querySelector(".price-delete").addEventListener("click", () => {
      deletePriceItem(item.name);
    });
  });
  if (state.pendingPriceItemName) {
    const targetRow = els.priceList.querySelector(`.price-row[data-item-name="${cssEscape(state.pendingPriceItemName)}"]`);
    if (targetRow) {
      targetRow.classList.add("selected");
      targetRow.scrollIntoView({ block: "center" });
      const focusTarget = targetRow.querySelector(".price-name-input");
      if (focusTarget) focusTarget.focus();
      state.pendingPriceItemName = "";
    }
  }
  bindPriceItemDragAndDrop(items);
}

function renderCategoryLibrary() {
  if (!els.categoryList || !els.categoryLibraryPanel) return;
  els.categoryLibraryPanel.classList.toggle("collapsed", state.categoryLibraryCollapsed);
  if (els.toggleCategoryLibraryBtn) {
    els.toggleCategoryLibraryBtn.textContent = state.categoryLibraryCollapsed ? "展开分类库" : "收起分类库";
  }
  if (state.categoryLibraryCollapsed) {
    els.categoryList.innerHTML = "";
    return;
  }
  const usageById = new Map();
  state.versions.forEach((version) => {
    (version.items || []).forEach((item) => {
      if (!item.categoryId) return;
      usageById.set(item.categoryId, (usageById.get(item.categoryId) || 0) + 1);
    });
  });

  els.categoryList.innerHTML = currentCategories().map((category) => `
    <div class="category-row" data-category-id="${escapeHtml(category.id)}" draggable="true">
      <button class="category-drag ghost" type="button" aria-label="拖动排序">☰</button>
      <input class="category-name-input" type="text" aria-label="分类名称" value="${escapeHtml(category.name)}">
      <span class="category-usage">${usageById.get(category.id) || 0} 条</span>
      <button class="category-delete ghost" type="button">删除</button>
    </div>
  `).join("");

  els.categoryList.querySelectorAll(".category-row").forEach((node) => {
    const category = findCategory(node.dataset.categoryId);
    if (!category) return;
    node.querySelector(".category-name-input").addEventListener("change", (event) => {
      const nextName = String(event.target.value || "").trim();
      if (!nextName) return;
      const conflict = currentCategories().find((item) => item.id !== category.id && item.name === nextName);
      if (conflict) {
        event.target.value = category.name;
        return;
      }
      category.name = nextName;
      state.versions.forEach((version) => {
        (version.items || []).forEach((item) => {
          if (item.categoryId === category.id) item.category = nextName;
        });
      });
      saveState("已更新分类库");
      renderPrices();
    });
    node.querySelector(".category-delete").addEventListener("click", () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      state.versions.forEach((version) => {
        (version.items || []).forEach((item) => {
          if (item.categoryId === category.id) {
            item.categoryId = "";
            item.category = "";
          }
        });
      });
      saveState("已删除分类");
      renderPrices();
    });
  });

  bindCategoryDragAndDrop();
}

function addCategory() {
  state.categories.push({
    id: makeId("category"),
    name: createUniqueCategoryName(),
    sortOrder: currentCategories().length
  });
  saveState("已添加分类");
  renderPrices();
}

function createUniqueCategoryName() {
  let index = currentCategories().length + 1;
  while (currentCategories().some((category) => category.name === `新分类 ${index}`)) {
    index += 1;
  }
  return `新分类 ${index}`;
}

function addPriceItem() {
  const version = currentVersion();
  if (!version) return;
  const newItem = {
    id: makeId("price"),
    name: createUniquePriceItemName(),
    sortOrder: nextItemSortOrder(""),
    unit: "",
    categoryId: "",
    category: "",
    description: "",
    material: 0,
    auxiliary: 0,
    wasteRate: 0,
    labor: 0,
    costMaterial: 0,
    costAuxiliary: 0,
    costWasteRate: 0,
    costLabor: 0,
    unitPrice: 0,
    costUnitPrice: 0
  };
  version.items.push(newItem);
  state.pendingPriceItemName = newItem.name;
  saveState("新增价格条目");
  renderPrices();
}

function createUniquePriceItemName() {
  const version = currentVersion();
  let index = version?.items?.length ? version.items.length + 1 : 1;
  while (version?.items?.some((item) => item.name === `新价格条目 ${index}`)) {
    index += 1;
  }
  return `新价格条目 ${index}`;
}

function nextItemSortOrder(categoryId, excludeName = "") {
  const version = currentVersion();
  const peers = (version?.items || []).filter((item) => {
    return (item.categoryId || "") === (categoryId || "") && item.name !== excludeName;
  });
  if (!peers.length) return 0;
  return Math.max(...peers.map((item) => Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0)) + 1;
}

function toggleCategoryLibrary() {
  state.categoryLibraryCollapsed = !state.categoryLibraryCollapsed;
  saveState(state.categoryLibraryCollapsed ? "已收起分类库" : "已展开分类库");
  renderPrices();
}

function bindCategoryDragAndDrop() {
  if (!els.categoryList) return;
  let draggedId = "";
  const rows = [...els.categoryList.querySelectorAll(".category-row")];

  rows.forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedId = row.dataset.categoryId || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      rows.forEach((item) => item.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedId || draggedId === row.dataset.categoryId) return;
      rows.forEach((item) => item.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = row.dataset.categoryId || "";
      if (!draggedId || !targetId || draggedId === targetId) return;
      moveCategoryBefore(draggedId, targetId);
      draggedId = "";
    });
  });
}

function moveCategoryBefore(draggedId, targetId) {
  const categories = [...currentCategories()];
  const draggedIndex = categories.findIndex((item) => item.id === draggedId);
  const targetIndex = categories.findIndex((item) => item.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = categories.splice(draggedIndex, 1);
  categories.splice(targetIndex, 0, dragged);
  state.categories = categories.map((item, index) => ({ ...item, sortOrder: index }));
  saveState("已调整分类顺序");
  renderPrices();
}

function bindPriceItemDragAndDrop(visibleItems) {
  if (!els.priceList) return;
  let draggedItemName = "";
  let draggedCategoryId = "";
  const rows = [...els.priceList.querySelectorAll(".price-row")];

  rows.forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedItemName = row.dataset.itemName || "";
      draggedCategoryId = row.dataset.categoryId || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      rows.forEach((item) => item.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (event) => {
      const targetCategoryId = row.dataset.categoryId || "";
      if (!draggedItemName || draggedCategoryId !== targetCategoryId) return;
      event.preventDefault();
      rows.forEach((item) => item.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetItemName = row.dataset.itemName || "";
      const targetCategoryId = row.dataset.categoryId || "";
      if (!draggedItemName || !targetItemName || draggedItemName === targetItemName) return;
      if (draggedCategoryId !== targetCategoryId) return;
      movePriceItemBefore(draggedItemName, targetItemName, draggedCategoryId, visibleItems);
      draggedItemName = "";
      draggedCategoryId = "";
    });
  });
}

function movePriceItemBefore(draggedItemName, targetItemName, categoryId, visibleItems) {
  const version = currentVersion();
  if (!version) return;
  const categoryItems = visibleItems.filter((item) => (item.categoryId || "") === (categoryId || ""));
  const draggedIndex = categoryItems.findIndex((item) => item.name === draggedItemName);
  const targetIndex = categoryItems.findIndex((item) => item.name === targetItemName);
  if (draggedIndex < 0 || targetIndex < 0) return;

  const reordered = [...categoryItems];
  const [dragged] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, dragged);

  reordered.forEach((item, index) => {
    const actual = version.items.find((entry) => entry.name === item.name);
    if (actual) actual.sortOrder = index;
  });

  saveState("已调整价格条目顺序");
  renderPrices();
}

function renderTotalsAndPreview() {
  const quote = currentQuote();
  if (!quote) return;
  const totals = calculateTotals(quote);
  els.subtotalText.textContent = formatMoney(totals.subtotal);
  els.managementText.textContent = formatMoney(totals.management);
  els.taxText.textContent = formatMoney(totals.tax);
  els.grandTotalText.textContent = formatMoney(totals.grand);
  els.previewTitle.textContent = `${quote.projectName || "工程"}报价单`;
  els.previewMeta.textContent = `客户：${quote.clientName || "未填写"}　报价日期：${quote.quoteDate || ""}　价格版本：${currentVersion()?.name || ""}`;
  els.previewTotal.textContent = formatMoney(totals.grand);
  els.previewSubtotal.textContent = formatMoney(totals.subtotal);
  els.previewManagement.textContent = formatMoney(totals.management);
  els.previewTax.textContent = formatMoney(totals.tax);
  els.previewGrand.textContent = formatMoney(totals.grand);
  els.previewRows.innerHTML = quote.lines.map((line, index) => {
    const item = findItem(line.priceItemName, quote.priceVersionId);
    const unitPrice = calculateLineUnitPrice(line);
    const amount = toNumber(line.quantity) * unitPrice;
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(line.engineeringName)}</td>
        <td>${escapeHtml(line.area)}</td>
        <td>${escapeHtml(item?.unit || "")}</td>
        <td>${formatNumber(line.quantity)}</td>
        <td>${formatMoney(line.material)}</td>
        <td>${formatMoney(line.auxiliary)}</td>
        <td>${formatPercentInput(line.wasteRate)}%</td>
        <td>${formatMoney(line.labor)}</td>
        <td>${formatMoney(unitPrice)}</td>
        <td>${formatMoney(amount)}</td>
        <td>${escapeHtml(line.note)}</td>
      </tr>
    `;
  }).join("");
}

function calculateTotals(quote = currentQuote()) {
  const subtotal = (quote?.lines || []).reduce((sum, line) => {
    return sum + toNumber(line.quantity) * calculateLineUnitPrice(line);
  }, 0);
  const management = subtotal * toNumber(quote?.managementRate) / 100;
  const tax = subtotal * toNumber(quote?.taxRate) / 100;
  return { subtotal, management, tax, grand: subtotal + management + tax };
}

function calculateLineUnitPrice(line) {
  const splitPrice = (toNumber(line.material) + toNumber(line.auxiliary)) * (1 + toNumber(line.wasteRate)) + toNumber(line.labor);
  if (splitPrice === 0 && line.legacyUnitPrice !== null && line.legacyUnitPrice !== undefined) {
    return toNumber(line.legacyUnitPrice);
  }
  return splitPrice;
}

function calculateItemUnitPrice(item) {
  return (toNumber(item.material) + toNumber(item.auxiliary)) * (1 + toNumber(item.wasteRate)) + toNumber(item.labor);
}

function addCustomer() {
  const customer = normalizeCustomer({ id: makeId("customer"), name: "新客户" });
  state.customers.push(customer);
  state.activeCustomerId = customer.id;
  state.activeQuoteId = "";
  saveState("已新建客户");
  renderAll();
}

function addQuote() {
  const customer = currentCustomer();
  const quote = normalizeQuote({
    id: makeId("quote"),
    customerId: customer.id,
    clientName: customer.name,
    name: "新报价",
    projectName: "新工程",
    priceVersionId: state.activeVersionId
  });
  state.quotes.push(quote);
  state.activeQuoteId = quote.id;
  saveState("已新建报价");
  renderAll();
  switchPage("editor");
}

function addLine() {
  const quote = currentQuote();
  quote.lines.push(makeLine());
  saveState("已添加工程项目");
  renderAll();
}

function setQuoteField(key, value, rerender = false) {
  const quote = currentQuote();
  quote[key] = value;
  if (key === "projectName") quote.name = value || quote.name;
  if (key === "priceVersionId") {
    state.activeVersionId = value;
    quote.lines = quote.lines.map((line) => normalizeLine(line, value));
  }
  saveState("已自动保存");
  if (rerender) renderAll();
  else renderTotalsAndPreview();
}

function updateActiveCustomerFromForm() {
  const customer = currentCustomer();
  customer.name = els.customerName.value;
  customer.contact = els.customerContact.value;
  customer.phone = els.customerPhone.value;
  customer.address = els.customerAddress.value;
  state.quotes.forEach((quote) => {
    if (quote.customerId === customer.id && !quote.clientName) quote.clientName = customer.name;
  });
  saveState("已更新客户");
  renderManager();
}

function cloneVersion() {
  const base = currentVersion();
  const name = prompt("新价格版本名称", `${base.name} - 调整版`);
  if (!name) return;
  const version = {
    id: makeId("version"),
    name,
    createdAt: new Date().toISOString().slice(0, 10),
    items: JSON.parse(JSON.stringify(base.items))
  };
  state.versions.push(version);
  state.activeVersionId = version.id;
  const quote = currentQuote();
  if (quote) quote.priceVersionId = version.id;
  saveState("已创建价格版本");
  renderAll();
}

function renameVersion() {
  const version = currentVersion();
  const name = prompt("价格版本名称", version.name);
  if (!name) return;
  version.name = name;
  saveState("已重命名价格版本");
  renderAll();
}

async function resetData() {
  if (!confirm("恢复初始数据会清空当前浏览器中保存的客户、报价和价格版本。确定恢复吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(OLD_STORAGE_KEY);
  location.reload();
}

function getPortableState() {
  return {
    app: "quote-tool",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      versions: state.versions,
      categories: state.categories,
      activeVersionId: state.activeVersionId,
      activePage: state.activePage,
      categoryLibraryCollapsed: state.categoryLibraryCollapsed,
      customers: state.customers,
      quotes: state.quotes,
      activeCustomerId: state.activeCustomerId,
      activeQuoteId: state.activeQuoteId
    }
  };
}

function exportDataFile() {
  const content = JSON.stringify(getPortableState(), null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `报价数据-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  saveState("已导出数据");
}

async function importDataFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    applyImportedState(parsed);
    saveState("已导入数据");
    renderAll();
  } catch (error) {
    alert("导入失败：这个文件不是有效的报价数据 JSON。");
  }
}

function applyImportedState(parsed) {
  const data = parsed?.data || parsed;
  if (!data || !Array.isArray(data.versions) || !Array.isArray(data.customers) || !Array.isArray(data.quotes)) {
    throw new Error("Invalid data file");
  }
  state.versions = data.versions;
  state.categories = data.categories || [];
  state.activeVersionId = data.activeVersionId || data.versions[0]?.id || "";
  state.activePage = data.activePage || "manager";
  state.categoryLibraryCollapsed = data.categoryLibraryCollapsed ?? true;
  state.customers = data.customers;
  state.quotes = data.quotes;
  state.activeCustomerId = data.activeCustomerId || data.customers[0]?.id || "";
  state.activeQuoteId = data.activeQuoteId || data.quotes[0]?.id || "";
  normalizeState();
}

async function bindDataFile() {
  if (!window.showSaveFilePicker) {
    alert("当前浏览器不支持直接绑定本地文件。可以使用“导出数据”和“导入数据”来保存和恢复。");
    return;
  }
  try {
    dataFileHandle = await window.showSaveFilePicker({
      suggestedName: "报价数据.json",
      types: [{
        description: "报价数据 JSON",
        accept: { "application/json": [".json"] }
      }]
    });
    await writeStateToFileHandle(dataFileHandle);
    saveState("已绑定并保存到文件");
  } catch (error) {
    if (error?.name !== "AbortError") alert("绑定文件失败，请重试。");
  }
}

async function saveToBoundFile() {
  if (!dataFileHandle) {
    await bindDataFile();
    return;
  }
  try {
    await writeStateToFileHandle(dataFileHandle);
    saveState("已保存到文件");
  } catch (error) {
    dataFileHandle = null;
    alert("保存到文件失败，请重新绑定文件。");
  }
}

async function writeStateToFileHandle(handle) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(getPortableState(), null, 2));
  await writable.close();
}

function deletePriceItem(itemName) {
  const version = currentVersion();
  if (!version) return;
  const item = version.items.find((entry) => entry.name === itemName);
  if (!item) return;
  const input = prompt(`请输入完整条目名称后删除?

${item.name}`, "");
  if (input === null) return;
  if (String(input).trim() !== item.name) {
    alert("输入的名称不完整或不一致，未删除该条目。");
    return;
  }
  version.items = version.items.filter((entry) => entry.name !== item.name);
  unlinkPriceItemFromQuotes(item.name, version.id);
  if (state.pendingPriceItemName === item.name) state.pendingPriceItemName = "";
  saveState("删除价格条目");
  renderAll();
}

function unlinkPriceItemFromQuotes(itemName, versionId) {
  state.quotes.forEach((quote) => {
    if (quote.priceVersionId !== versionId) return;
    quote.lines.forEach((line) => {
      if (line.priceItemName !== itemName) return;
      line.engineeringName = line.engineeringName || itemName;
      line.priceItemName = "";
    });
  });
}

function syncLinePriceParts(item) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName === item.name && quote.priceVersionId === currentVersion().id) {
        line.material = item.material;
        line.auxiliary = item.auxiliary;
        line.wasteRate = item.wasteRate;
        line.labor = item.labor;
        line.legacyUnitPrice = null;
      }
    });
  });
}

function syncLinePriceItemName(oldName, newName) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName === oldName) line.priceItemName = newName;
    });
  });
}

function saveState(message = "已保存") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveStateToServer();
  if (els.saveStatus) {
    els.saveStatus.textContent = `${message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

async function loadStateFromServer() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json();
    return parsed?.data || parsed;
  } catch (error) {
    console.warn("Server load failed", error);
    return null;
  }
}

async function saveStateToServer() {
  if (location.protocol === "file:") {
    if (els.saveStatus) {
      els.saveStatus.textContent = "当前是文件方式打开，不会写入 SQLite；请用 http://127.0.0.1:5177 打开";
    }
    return;
  }
  try {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getPortableState(), null, 2)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn("Server save failed", error);
    if (els.saveStatus) els.saveStatus.textContent = "保存到本地文件失败，请确认 Node 服务正在运行";
  }
}

async function loadInitialPrices() {
  const response = await fetch("/data/initial-prices.json", { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取初始价格库");
  return response.json();
}

async function loadStateFromTauri() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  try {
    const text = await invoke("load_quote_data");
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed?.data || parsed;
  } catch (error) {
    console.warn("Tauri load failed", error);
    return null;
  }
}

async function saveStateToTauri() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke("save_quote_data", {
      data: JSON.stringify(getPortableState(), null, 2)
    });
    tauriReady = true;
  } catch (error) {
    console.warn("Tauri save failed", error);
  }
}

function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeName(value) {
  return String(value ?? "").trim();
}

function cssEscape(value) {
  return String(value ?? "").replaceAll('\\', '\\\\').replaceAll('"', '\"');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(toNumber(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(toNumber(value));
}

function formatPercentInput(value) {
  const percent = toNumber(value) * 100;
  return Number.isInteger(percent) ? String(percent) : String(Math.round(percent * 10) / 10);
}

function parsePercentInput(value) {
  const percent = Math.min(Math.max(toNumber(value), 0), 100);
  return percent / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

