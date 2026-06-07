const STORAGE_KEY = "quote-tool-state-v2";
const OLD_STORAGE_KEY = "quote-tool-state-v1";
const DEFAULT_MANAGEMENT_RATE = 8;
const DEFAULT_DESIGN_RATE = 6;
const DEFAULT_TAX_RATE = 9;
const DEFAULT_QUANTITY_FORMULA = "q=s+c*(h-0.25)";

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
  pendingPriceItemName: "",
  expandedPriceItemName: "",
  returnToQuoteId: "",
  returnToLineId: "",
  pendingLineId: ""
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
    "cloneVersionBtn", "renameVersionBtn", "managementRate", "designRate", "taxRate",
    "subtotalText", "managementText", "designText", "taxText", "grandTotalText", "addLineBtn", "addSpaceBtn", "addOverallSpaceBtn", "quoteLines",
    "priceSearch", "priceCount", "priceList", "addPriceItemBtn", "previewTitle", "previewMeta", "previewTotal",
    "categoryList", "addCategoryBtn", "toggleCategoryLibraryBtn", "categoryLibraryPanel",
    "previewRows", "previewSubtotal", "previewManagement", "previewDesign", "previewTax", "previewGrand"
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
  state.returnToQuoteId = state.returnToQuoteId || "";
  state.returnToLineId = state.returnToLineId || "";
  state.pendingLineId = state.pendingLineId || "";
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
      description: String(category?.description || "").trim(),
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
      categories.push({ name, description: "", sortOrder: categories.length });
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
  const parsedName = parsePriceNameUnit(item?.name || "");
  return {
    ...item,
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    categoryId: category?.id || "",
    category: category?.name || categoryName,
    unit: parsedName?.unit || item?.unit || "",
    costMaterial: toNumber(item?.costMaterial),
    costAuxiliary: toNumber(item?.costAuxiliary),
    costWasteRate: toNumber(item?.costWasteRate),
    costLabor: toNumber(item?.costLabor),
    costUnitPrice: toNumber(item?.costUnitPrice),
    quantityFormula: item?.quantityFormula || DEFAULT_QUANTITY_FORMULA
  };
}

function parsePriceNameUnit(name) {
  const text = String(name || "").trim();
  const slashIndex = Math.max(text.lastIndexOf("/"), text.lastIndexOf("／"));
  if (slashIndex <= 0 || slashIndex >= text.length - 1) return null;
  const baseName = text.slice(0, slashIndex).trim();
  const unit = text.slice(slashIndex + 1).trim();
  if (!baseName || !unit) return null;
  return { baseName, unit, separator: text[slashIndex] };
}

function setPriceItemUnit(item, nextUnit) {
  const unit = String(nextUnit || "").trim();
  if (!unit) return false;
  const parsed = parsePriceNameUnit(item.name);
  const baseName = parsed?.baseName || String(item.name || "").trim();
  if (!baseName) return false;
  const oldName = item.name;
  const nextName = `${baseName}/${unit}`;
  const duplicate = currentVersion()?.items?.some((entry) => entry !== item && normalizeName(entry.name) === normalizeName(nextName));
  if (duplicate) return false;
  item.unit = unit;
  item.name = nextName;
  syncLinePriceItemName(oldName, item.name);
  if (state.expandedPriceItemName === oldName) state.expandedPriceItemName = item.name;
  if (state.pendingPriceItemName === oldName) state.pendingPriceItemName = item.name;
  return true;
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
  const hasDesignRate = quote.designRate !== undefined && quote.designRate !== null;
  const managementRate = hasDesignRate || toNumber(quote.managementRate) !== 3
    ? (quote.managementRate ?? DEFAULT_MANAGEMENT_RATE)
    : DEFAULT_MANAGEMENT_RATE;
  const taxRate = hasDesignRate || toNumber(quote.taxRate) !== 1
    ? (quote.taxRate ?? DEFAULT_TAX_RATE)
    : DEFAULT_TAX_RATE;
  const normalized = {
    id: quote.id || makeId("quote"),
    customerId: quote.customerId || state.activeCustomerId || "",
    name: quote.name || quote.projectName || "未命名报价",
    projectName: quote.projectName || quote.name || "未命名工程",
    clientName: quote.clientName || customer?.name || "",
    quoteDate: quote.quoteDate || new Date().toISOString().slice(0, 10),
    priceVersionId: quote.priceVersionId || state.activeVersionId,
    managementRate,
    designRate: quote.designRate ?? DEFAULT_DESIGN_RATE,
    taxRate,
    spaces: quote.spaces || [],
    lines: quote.lines || []
  };
  normalized.lines = normalized.lines.map((line) => normalizeLine(line, normalized.priceVersionId));
  normalized.spaces = normalizeSpaces(normalized.spaces, normalized.lines);
  return normalized;
}

function normalizeSpaces(spaces, lines = []) {
  const hasCollapsedState = (spaces || []).some((space) => Object.prototype.hasOwnProperty.call(space || {}, "collapsed"));
  const normalized = (spaces || []).map((space, index) => normalizeSpace(space, index)).filter((space) => space.name);
  if (!normalized.some((space) => space.type === "overall")) {
    normalized.unshift(normalizeSpace({ name: "整体", type: "overall", sortOrder: -1 }, -1));
  }
  if (!normalized.length) {
    const names = [];
    lines.forEach((line) => {
      const name = String(line.area || "全屋").trim() || "全屋";
      if (!names.includes(name)) names.push(name);
    });
    (names.length ? names : ["全屋"]).forEach((name, index) => {
      normalized.push(normalizeSpace({ name }, index));
    });
  }

  const byName = new Map(normalized.map((space) => [space.name, space]));
  const fallback = normalized[0];
  lines.forEach((line) => {
    if (normalized.some((space) => space.id === line.spaceId)) return;
    const matched = byName.get(String(line.area || "").trim());
    line.spaceId = matched?.id || fallback.id;
  });
  const sorted = normalized.sort((a, b) => a.sortOrder - b.sortOrder).map((space, index) => ({ ...space, sortOrder: index }));
  if (!hasCollapsedState && sorted.length > 1) {
    sorted.forEach((space, index) => { space.collapsed = index > 0; });
  } else {
    let hasOpenSpace = false;
    sorted.forEach((space) => {
      if (!space.collapsed && !hasOpenSpace) {
        hasOpenSpace = true;
        return;
      }
      if (!space.collapsed) space.collapsed = true;
    });
  }
  return sorted;
}

function normalizeSpace(space, index = 0) {
  return {
    id: space.id || makeId("space"),
    name: String(space.name || "全屋").trim() || "全屋",
    type: space.type === "overall" || String(space.name || "").trim() === "整体" ? "overall" : "space",
    area: toNumber(space.area),
    perimeter: toNumber(space.perimeter),
    height: toNumber(space.height),
    buildingArea: toNumber(space.buildingArea),
    collapsed: Boolean(space.collapsed),
    sortOrder: Number.isFinite(Number(space.sortOrder)) ? Number(space.sortOrder) : index
  };
}

function makeSpace(name = "新空间", type = "space") {
  return normalizeSpace({ id: makeId("space"), name, type, sortOrder: currentQuote()?.spaces?.length || 0 });
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
    setTimeout(printQuotePdf, 50);
  });
  els.resetBtn.addEventListener("click", backupDatabase);
  els.addQuoteBtn.addEventListener("click", addQuote);
  els.cloneVersionBtn.addEventListener("click", cloneVersion);
  els.renameVersionBtn.addEventListener("click", renameVersion);
  els.addLineBtn.addEventListener("click", addLine);
  if (els.addSpaceBtn) els.addSpaceBtn.addEventListener("click", addSpace);
  if (els.addOverallSpaceBtn) els.addOverallSpaceBtn.addEventListener("click", addOverallSpace);
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

  ["projectName", "clientName", "quoteDate", "managementRate", "designRate", "taxRate"].forEach((id) => {
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

function categoryDescriptionForItem(item) {
  return findCategory(item?.categoryId)?.description || "";
}

function processNoteForLine(line, versionId = currentQuote()?.priceVersionId || currentVersion()?.id) {
  const item = findItem(line.priceItemName, versionId);
  const parts = [
    categoryDescriptionForItem(item),
    item?.description
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return [...new Set(parts)].join("；");
}

function makeLine(itemName = "", area = "", quantity = 0, spaceId = "") {
  const item = findItem(itemName);
  return normalizeLine({
    id: makeId("line"),
    priceItemName: itemName,
    area,
    spaceId,
    quantity,
    material: item ? item.material : 0,
    auxiliary: item ? item.auxiliary : 0,
    wasteRate: item ? item.wasteRate : 0,
    labor: item ? item.labor : 0
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
    spaceId: line.spaceId || "",
    quantity: toNumber(line.quantity),
    material: hasSplitPrice ? toNumber(line.material) : toNumber(item?.material),
    auxiliary: hasSplitPrice ? toNumber(line.auxiliary) : toNumber(item?.auxiliary),
    wasteRate: hasSplitPrice ? toNumber(line.wasteRate) : toNumber(item?.wasteRate),
    labor: hasSplitPrice ? toNumber(line.labor) : toNumber(item?.labor),
    legacyUnitPrice: hasSplitPrice || item ? (line.legacyUnitPrice ?? null) : (line.customPrice ?? null)
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
        <div class="row-actions">
          <button type="button" class="open-quote">打开</button>
          <button type="button" class="delete-quote danger">删除</button>
        </div>
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
    card.querySelector(".delete-quote").addEventListener("click", () => deleteQuote(card.dataset.quoteId));
  });
}

function renderSettings() {
  const quote = currentQuote();
  if (!quote) return;
  els.projectName.value = quote.projectName;
  els.clientName.value = quote.clientName || currentCustomer()?.name || "";
  els.quoteDate.value = quote.quoteDate;
  els.managementRate.value = quote.managementRate;
  els.designRate.value = quote.designRate;
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
  const spaces = sortedSpaces(quote);
  els.quoteLines.innerHTML = spaces.map((space, spaceIndex) => {
    const spaceLines = linesForSpace(quote, space.id);
    const isOverall = space.type === "overall";
    return `
      <section class="space-card ${isOverall ? "overall-space" : ""} ${space.collapsed ? "collapsed" : ""}" data-space-id="${escapeHtml(space.id)}" draggable="true">
        <div class="space-head">
          <div class="space-title">
            <input class="space-name" type="text" aria-label="空间名称" title="${space.collapsed ? "点击空白处展开" : "点击空白处收起"}" value="${escapeHtml(space.name)}">
            ${space.collapsed ? `<span class="space-count">${spaceLines.length}</span>` : ""}
          </div>
          ${isOverall ? `
          <label>建筑面积（平米）<input class="space-building-area" type="number" min="0" step="0.01" aria-label="建筑面积（平米）" value="${space.buildingArea}"></label>
          ` : `
          <label>面积（平米）<input class="space-area" type="number" min="0" step="0.01" aria-label="面积（平米）" value="${space.area}"></label>
          <label>周长（米）<input class="space-perimeter" type="number" min="0" step="0.01" aria-label="周长（米）" value="${space.perimeter}"></label>
          <label>高度（米）<input class="space-height" type="number" min="0" step="0.01" aria-label="高度（米）" value="${space.height}"></label>
          `}
          <div class="space-actions">
            <button class="add-space-line small" type="button">添加项目</button>
            <button class="delete-space danger small" type="button" ${isOverall ? "disabled" : ""}>删除空间</button>
          </div>
        </div>
        ${space.collapsed ? "" : `
        <div class="space-lines">
          ${renderInsertSlot(space.id, 0)}
          ${spaceLines.map((line, index) => `
            ${renderLineItem(line, quote)}
            ${renderInsertSlot(space.id, index + 1)}
          `).join("")}
        </div>
        `}
      </section>
    `;
  }).join("");

  els.quoteLines.querySelectorAll(".space-card").forEach((spaceNode) => {
    const space = quote.spaces.find((entry) => entry.id === spaceNode.dataset.spaceId);
    if (!space) return;
    const spaceNameInput = spaceNode.querySelector(".space-name");
    spaceNameInput.addEventListener("focus", (event) => {
      event.target.dataset.previousName = space.name;
    });
    spaceNameInput.addEventListener("input", (event) => {
      space.name = event.target.value;
      if (space.name.trim() === "整体") space.type = "overall";
      renderTotalsAndPreview();
    });
    spaceNameInput.addEventListener("blur", (event) => {
      const nextName = String(event.target.value || "").trim();
      const previousName = event.target.dataset.previousName || space.name;
      if (!nextName) {
        alert("空间名称不能为空。");
        space.name = previousName;
        event.target.value = previousName;
        return;
      }
      if (spaceNameExists(nextName, space.id)) {
        alert(`已经有“${nextName}”这个空间了，空间名称不能重复。`);
        space.name = previousName;
        event.target.value = previousName;
        return;
      }
      space.name = nextName;
      if (space.name === "整体") space.type = "overall";
      saveState("已自动保存");
      renderAll();
    });
    const buildingAreaInput = spaceNode.querySelector(".space-building-area");
    if (buildingAreaInput) {
      buildingAreaInput.addEventListener("input", (event) => {
        space.buildingArea = toNumber(event.target.value);
        saveState("已自动保存");
        refreshRecommendedQuantities(space.id);
        renderTotalsAndPreview();
      });
    }
    const areaInput = spaceNode.querySelector(".space-area");
    if (areaInput) areaInput.addEventListener("input", (event) => {
      space.area = toNumber(event.target.value);
      saveState("已自动保存");
      refreshRecommendedQuantities(space.id);
      renderTotalsAndPreview();
    });
    const perimeterInput = spaceNode.querySelector(".space-perimeter");
    if (perimeterInput) perimeterInput.addEventListener("input", (event) => {
      space.perimeter = toNumber(event.target.value);
      saveState("已自动保存");
      refreshRecommendedQuantities(space.id);
      renderTotalsAndPreview();
    });
    const heightInput = spaceNode.querySelector(".space-height");
    if (heightInput) heightInput.addEventListener("input", (event) => {
      space.height = toNumber(event.target.value);
      saveState("已自动保存");
      refreshRecommendedQuantities(space.id);
      renderTotalsAndPreview();
    });
    spaceNode.querySelector(".space-head").addEventListener("click", (event) => {
      if (event.target.closest("input, select, button")) return;
      toggleSpace(space.id);
    });
    spaceNode.querySelector(".add-space-line").addEventListener("click", () => addLine(space.id));
    spaceNode.querySelector(".delete-space").addEventListener("click", () => deleteSpace(space.id));
  });

  bindSpaceDragAndDrop();

  els.quoteLines.querySelectorAll(".insert-line-slot").forEach((button) => {
    button.addEventListener("click", () => addLineAt(button.dataset.spaceId, Number(button.dataset.position || 0)));
  });

  els.quoteLines.querySelectorAll(".line-item").forEach((node) => {
    bindLineItem(node, quote);
  });

  if (state.pendingLineId) {
    const targetLine = els.quoteLines.querySelector(`.line-item[data-line-id="${cssEscape(state.pendingLineId)}"]`);
    if (targetLine) {
      targetLine.classList.add("returned");
      targetLine.scrollIntoView({ block: "center" });
      setTimeout(() => targetLine.classList.remove("returned"), 2200);
    }
    state.pendingLineId = "";
  }
}

function renderInsertSlot(spaceId, position) {
  return `
    <button class="insert-line-slot" type="button" data-space-id="${escapeHtml(spaceId)}" data-position="${position}" aria-label="在这里添加工程项目">
      <span>+</span>
    </button>
  `;
}

function refreshRecommendedQuantities(spaceId = "") {
  const quote = currentQuote();
  if (!quote) return;
  (quote.lines || []).forEach((line) => {
    if (spaceId && line.spaceId !== spaceId) return;
    const node = els.quoteLines.querySelector(`.line-item[data-line-id="${cssEscape(line.id)}"]`);
    const output = node?.querySelector(".recommended-qty");
    if (!output) return;
    const recommendedQuantity = recommendedQuantityForLine(line, quote);
    output.textContent = recommendedQuantity === null ? "" : formatNumber(recommendedQuantity);
  });
}

function renderLineItem(line, quote) {
    const item = findItem(line.priceItemName, quote.priceVersionId);
    const unit = item?.unit || "";
    const unitPrice = calculateLineUnitPrice(line);
    const costUnitPrice = calculateLineCostUnitPrice(line, quote.priceVersionId);
    const engineeringDisplayName = line.priceItemName && line.engineeringName === displayEngineeringName(line.priceItemName)
      ? line.priceItemName
      : line.engineeringName;
    const amount = toNumber(line.quantity) * unitPrice;
    const profit = toNumber(line.quantity) * (unitPrice - costUnitPrice);
    const recommendedQuantity = recommendedQuantityForLine(line, quote);
    const spaceOptions = sortedSpaces(quote).map((space) => (
      `<option value="${escapeHtml(space.id)}" ${space.id === line.spaceId ? "selected" : ""}>${escapeHtml(space.name)}</option>`
    )).join("");
    return `
      <div class="line-item" data-line-id="${escapeHtml(line.id)}">
        <div class="line-field project-field">
          <label>工程项目</label>
          <div class="project-picker">
            <input class="line-name" type="text" aria-label="工程项目" placeholder="输入工程项目，选择相似价格条目" value="${escapeHtml(engineeringDisplayName)}" autocomplete="off">
            <div class="suggestions"></div>
          </div>
        </div>
        <div class="line-field part-field">
          <label>部位</label>
          <input class="line-part" type="text" aria-label="部位" placeholder="" value="${escapeHtml(line.area || "")}">
        </div>
        <div class="line-field recommended-field">
          <label>推荐工程量</label>
          <button class="recommended-qty jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${recommendedQuantity === null ? "" : formatNumber(recommendedQuantity)}</button>
        </div>
        <div class="line-field qty-field">
          <label>工程量</label>
          <input class="line-qty" type="number" min="0" step="0.01" aria-label="工程量" placeholder="数量" value="${line.quantity}">
        </div>
        <div class="line-field unit-field">
          <label>单位</label>
          <button class="line-unit jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${escapeHtml(unit)}</button>
        </div>
        <div class="line-field price-field">
          <label>综合单价</label>
          <button class="readonly-price jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(unitPrice)}</button>
        </div>
        <div class="line-field cost-price-field">
          <label>成本单价</label>
          <button class="readonly-price jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(costUnitPrice)}</button>
        </div>
        <div class="line-field profit-field">
          <label>利润</label>
          <button class="profit jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(profit)}</button>
        </div>
        <div class="line-field amount-field">
          <label>金额</label>
          <button class="amount jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(amount)}</button>
        </div>
        <div class="line-field move-field">
          <label>移到空间</label>
          <select class="line-space" aria-label="移到空间">${spaceOptions}</select>
        </div>
        <div class="line-field action-field">
          <label class="action-label" aria-hidden="true">&nbsp;</label>
          <button class="remove-btn" type="button" aria-label="删除">×</button>
        </div>
      </div>
    `;
}

function bindLineItem(node, quote) {
  const line = quote.lines.find((entry) => entry.id === node.dataset.lineId);
  if (!line) return;
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
  node.querySelector(".line-part").addEventListener("input", (event) => {
    line.area = event.target.value;
    saveState("已自动保存");
    renderTotalsAndPreview();
  });
  node.querySelector(".line-space").addEventListener("change", (event) => {
    moveLineToSpace(line.id, event.target.value);
  });
  const quantityInput = node.querySelector(".line-qty");
  quantityInput.addEventListener("focus", selectInputText);
  quantityInput.addEventListener("mouseup", (event) => {
    event.preventDefault();
    selectInputText(event);
  });
  quantityInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
    flashLineSaved(node);
  });
  quantityInput.addEventListener("input", (event) => {
    line.quantity = toNumber(event.target.value);
    saveState("已自动保存");
    const amountNode = node.querySelector(".amount");
    const profitNode = node.querySelector(".profit");
    if (amountNode) amountNode.textContent = formatMoney(toNumber(line.quantity) * calculateLineUnitPrice(line));
    if (profitNode) profitNode.textContent = formatMoney(toNumber(line.quantity) * (calculateLineUnitPrice(line) - calculateLineCostUnitPrice(line, quote.priceVersionId)));
    renderTotalsAndPreview();
  });
  node.querySelectorAll(".jump-price-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!line.priceItemName) return;
      openPriceItemEditor(line.priceItemName, quote.priceVersionId, {
        quoteId: quote.id,
        lineId: line.id
      });
    });
  });
  node.querySelector(".remove-btn").addEventListener("click", () => {
    quote.lines = quote.lines.filter((entry) => entry.id !== line.id);
    saveState("已删除工程项目");
    renderAll();
  });
}

function sortedSpaces(quote = currentQuote()) {
  return (quote?.spaces || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function linesForSpace(quote, spaceId) {
  return (quote.lines || []).filter((line) => line.spaceId === spaceId);
}

function sortLinesInSpaceByCategory(spaceId) {
  const quote = currentQuote();
  if (!quote || !spaceId) return;
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  const version = state.versions.find((item) => item.id === quote.priceVersionId) || currentVersion();
  const itemIndex = new Map((version?.items || []).map((item, index) => [item.name, index]));
  const scored = quote.lines.map((line, index) => {
    if (line.spaceId !== spaceId) return { line, index, keep: true };
    const item = findItem(line.priceItemName, quote.priceVersionId);
    return {
      line,
      index,
      keep: false,
      categoryRank: item ? (categoryIndex.get(item.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      itemRank: item ? (itemIndex.get(item.name) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    };
  });
  const sortedSpaceLines = scored
    .filter((entry) => !entry.keep)
    .sort((a, b) => a.categoryRank - b.categoryRank || a.itemRank - b.itemRank || a.index - b.index)
    .map((entry) => entry.line);
  let cursor = 0;
  quote.lines = scored.map((entry) => entry.keep ? entry.line : sortedSpaceLines[cursor++]);
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
  const recommendedQuantity = recommendedQuantityForLine(line);
  if (recommendedQuantity !== null) line.quantity = roundQuantity(recommendedQuantity);
  sortLinesInSpaceByCategory(line.spaceId);
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

function openPriceItemEditor(itemName, versionId, returnContext = null) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  if (!version) return;
  const existing = version.items.find((entry) => entry.name === itemName);
  state.activeVersionId = version.id;
  state.pendingPriceItemName = existing ? existing.name : itemName;
  state.expandedPriceItemName = existing ? existing.name : "";
  state.returnToQuoteId = returnContext?.quoteId || "";
  state.returnToLineId = returnContext?.lineId || "";
  if (els.priceSearch) els.priceSearch.value = "";
  switchPage("prices");
  renderAll();
}

function returnContextForItem(item) {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  if (!quote || !line || line.priceItemName !== item.name) return null;
  return { quote, line };
}

function returnToQuoteLine() {
  const quoteId = state.returnToQuoteId;
  const lineId = state.returnToLineId;
  if (!quoteId || !lineId) return;
  const quote = state.quotes.find((entry) => entry.id === quoteId);
  if (!quote) return;
  state.activeQuoteId = quote.id;
  state.activeCustomerId = quote.customerId || state.activeCustomerId;
  state.pendingLineId = lineId;
  state.returnToQuoteId = "";
  state.returnToLineId = "";
  switchPage("editor");
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
  const parsedInputName = parsePriceNameUnit(name);
  const itemUnit = parsedInputName?.unit || template?.unit || "项";
  const itemName = parsedInputName ? name : `${name}/${itemUnit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    alert(`价格库里已经有“${existingWithUnit.name}”了，请直接从相似项里选择。`);
    return;
  }
  const similarText = comparable.length ? comparable.map((item) => item.name).join("、") : "暂无相似条目";
  if (!confirm(`要把“${itemName}”新增到当前价格库吗？\n\n相似条目：${similarText}`)) return;

  const newItem = {
    id: makeId("price"),
    name: itemName,
    sortOrder: nextItemSortOrder(template?.categoryId || ""),
    unit: itemUnit,
    categoryId: template?.categoryId || "",
    category: template?.category || "",
    description: template?.description || "",
    material: template ? toNumber(template.material) : 0,
    auxiliary: template ? toNumber(template.auxiliary) : 0,
    wasteRate: template ? toNumber(template.wasteRate) : 0,
    labor: template ? toNumber(template.labor) : 0,
    costMaterial: template ? toNumber(template.costMaterial) : 0,
    costAuxiliary: template ? toNumber(template.costAuxiliary) : 0,
    costWasteRate: template ? toNumber(template.costWasteRate) : 0,
    costLabor: template ? toNumber(template.costLabor) : 0,
    unitPrice: template ? toNumber(template.unitPrice) : 0,
    costUnitPrice: template ? toNumber(template.costUnitPrice) : 0,
    quantityFormula: template?.quantityFormula || DEFAULT_QUANTITY_FORMULA
  };

  version.items.push(newItem);
  selectSuggestedItem(newItem.name, line);
  sortLinesInSpaceByCategory(line.spaceId);
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
    const costUnitPrice = calculateItemCostUnitPrice(item);
    const isExpanded = state.expandedPriceItemName === item.name;
    return `
      <tr class="price-row ${state.pendingPriceItemName === item.name ? "selected" : ""}" data-item-name="${escapeHtml(item.name)}" data-category-id="${escapeHtml(item.categoryId || "")}" draggable="true">
        <td><input class="price-name-input" type="text" aria-label="价格条目名称" value="${escapeHtml(item.name)}"></td>
        <td>
          <select class="price-category-select" aria-label="分类">
            ${categoryOptions}
          </select>
        </td>
        <td>
          <button class="price-expand price-unit-toggle" type="button" aria-expanded="${isExpanded ? "true" : "false"}">
            <b>${escapeHtml(item.unit || parsePriceNameUnit(item.name)?.unit || "")}</b>
          </button>
        </td>
        <td class="price-total">
          <button class="price-expand price-unit-price-toggle" type="button" aria-expanded="${isExpanded ? "true" : "false"}">
            <b>${formatMoney(unitPrice)}</b>
          </button>
        </td>
        <td class="price-total">
          <button class="price-expand price-cost-toggle" type="button" aria-expanded="${isExpanded ? "true" : "false"}">
            <b>${formatMoney(costUnitPrice)}</b>
          </button>
        </td>
        <td class="price-actions-cell"><button class="price-delete danger small" type="button" aria-label="删除条目">删除</button></td>
      </tr>
      ${isExpanded ? `
      <tr class="price-detail-row" data-detail-for="${escapeHtml(item.name)}">
        <td colspan="6">
          <div class="price-detail-grid">
            <section class="price-detail-section">
              <h3>综合单价</h3>
              <label>主材<input class="price-material" type="number" min="0" step="0.01" aria-label="主材" value="${item.material}"></label>
              <label>辅材<input class="price-auxiliary" type="number" min="0" step="0.01" aria-label="辅材" value="${item.auxiliary}"></label>
              <label>损耗%<input class="price-waste" type="number" min="0" max="100" step="0.1" aria-label="损耗百分比" value="${formatPercentInput(item.wasteRate)}"></label>
              <label>人工<input class="price-labor" type="number" min="0" step="0.01" aria-label="人工" value="${item.labor}"></label>
              <strong class="price-detail-total">综合单价 ${formatMoney(unitPrice)}</strong>
            </section>
            <section class="price-detail-section">
              <h3>成本单价</h3>
              <label>成本主材<input class="price-cost-material" type="number" min="0" step="0.01" aria-label="成本主材" value="${item.costMaterial}"></label>
              <label>成本辅材<input class="price-cost-auxiliary" type="number" min="0" step="0.01" aria-label="成本辅材" value="${item.costAuxiliary}"></label>
              <label>成本损耗%<input class="price-cost-waste" type="number" min="0" max="100" step="0.1" aria-label="成本损耗百分比" value="${formatPercentInput(item.costWasteRate)}"></label>
              <label>成本人工<input class="price-cost-labor" type="number" min="0" step="0.01" aria-label="成本人工" value="${item.costLabor}"></label>
              <strong class="price-detail-cost-total">成本单价 ${formatMoney(costUnitPrice)}</strong>
            </section>
            <section class="price-detail-section description-section">
              <h3>说明</h3>
              <label>单位<input class="price-unit-detail" type="text" aria-label="单位" value="${escapeHtml(item.unit || parsePriceNameUnit(item.name)?.unit || "")}"></label>
              <label>推荐工程量公式<input class="price-quantity-formula" type="text" aria-label="推荐工程量公式" placeholder="${DEFAULT_QUANTITY_FORMULA}" value="${escapeHtml(item.quantityFormula || DEFAULT_QUANTITY_FORMULA)}"></label>
              <textarea class="price-description" aria-label="说明">${escapeHtml(item.description || "")}</textarea>
            </section>
          </div>
        </td>
      </tr>
      ` : ""}
    `;
  }).join("");

  els.priceList.innerHTML = `
    <table class="price-table">
      <thead>
        <tr>
          <th>价格条目名称</th>
          <th>分类</th>
          <th>单位</th>
          <th>综合单价</th>
          <th>成本单价</th>
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
          const nextName = event.target.value;
          const parsed = parsePriceNameUnit(nextName);
          item.name = nextName;
          if (parsed) {
            item.unit = parsed.unit;
            event.target.classList.remove("invalid");
            const unitNode = node.querySelector(".price-unit-toggle b");
            if (unitNode) unitNode.textContent = parsed.unit;
          } else {
            event.target.classList.add("invalid");
          }
          node.dataset.itemName = item.name;
          syncLinePriceItemName(oldName, item.name);
          if (state.expandedPriceItemName === oldName) state.expandedPriceItemName = item.name;
        } else {
          item[key] = event.target.value;
        }
        saveState("已更新价格库");
        renderLines();
        renderTotalsAndPreview();
      });
    };
    bindText("price-name-input", "name");
    node.querySelector(".price-name-input").addEventListener("blur", (event) => {
      if (parsePriceNameUnit(event.target.value)) return;
      alert("价格条目名称必须包含斜杠单位，例如：水电开槽/平米");
      event.target.classList.add("invalid");
      event.target.focus();
    });
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
    node.querySelectorAll(".price-expand").forEach((button) => {
      button.addEventListener("click", () => togglePriceItemDetails(item.name));
    });
    node.querySelector(".price-delete").addEventListener("click", () => {
      deletePriceItem(item.name);
    });
  });

  els.priceList.querySelectorAll(".price-detail-row").forEach((node) => {
    const item = findItem(node.dataset.detailFor);
    if (!item) return;
    bindPriceDetailInputs(node, item);
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

function togglePriceItemDetails(itemName) {
  const item = findItem(itemName);
  if (state.expandedPriceItemName === itemName && item && returnContextForItem(item)) {
    returnToQuoteLine();
    return;
  }
  state.expandedPriceItemName = state.expandedPriceItemName === itemName ? "" : itemName;
  renderPrices();
}

function bindPriceDetailInputs(node, item) {
  const updateTotals = () => {
    item.unitPrice = calculateItemUnitPrice(item);
    item.costUnitPrice = calculateItemCostUnitPrice(item);
    const priceTotal = node.querySelector(".price-detail-total");
    const costTotal = node.querySelector(".price-detail-cost-total");
    if (priceTotal) priceTotal.textContent = `综合单价 ${formatMoney(item.unitPrice)}`;
    if (costTotal) costTotal.textContent = `成本单价 ${formatMoney(item.costUnitPrice)}`;
    const mainRow = els.priceList.querySelector(`.price-row[data-item-name="${cssEscape(item.name)}"]`);
    if (mainRow) {
      const totals = mainRow.querySelectorAll(".price-total b");
      if (totals[0]) totals[0].textContent = formatMoney(item.unitPrice);
      if (totals[1]) totals[1].textContent = formatMoney(item.costUnitPrice);
    }
  };

  [
    ["price-material", "material"],
    ["price-auxiliary", "auxiliary"],
    ["price-waste", "wasteRate", "percent"],
    ["price-labor", "labor"],
    ["price-cost-material", "costMaterial"],
    ["price-cost-auxiliary", "costAuxiliary"],
    ["price-cost-waste", "costWasteRate", "percent"],
    ["price-cost-labor", "costLabor"]
  ].forEach(([className, key, mode]) => {
    const input = node.querySelector(`.${className}`);
    if (!input) return;
    input.addEventListener("input", (event) => {
      item[key] = mode === "percent" ? parsePercentInput(event.target.value) : toNumber(event.target.value);
      updateTotals();
      saveState("已更新价格库");
      syncLinePriceParts(item);
      renderLines();
      renderTotalsAndPreview();
    });
  });

  const descriptionInput = node.querySelector(".price-description");
  if (descriptionInput) {
    descriptionInput.addEventListener("input", (event) => {
      item.description = event.target.value;
      saveState("已更新价格库");
      renderTotalsAndPreview();
    });
  }

  const formulaInput = node.querySelector(".price-quantity-formula");
  if (formulaInput) {
    formulaInput.addEventListener("input", (event) => {
      item.quantityFormula = event.target.value;
      saveState("已更新价格库");
      renderLines();
      renderTotalsAndPreview();
    });
  }

  const unitInput = node.querySelector(".price-unit-detail");
  if (unitInput) {
    unitInput.addEventListener("change", (event) => {
      if (!setPriceItemUnit(item, event.target.value)) {
        alert("单位不能为空，且修改后不能和已有价格条目重名。价格条目名称需要保持“名称/单位”的格式。");
        event.target.value = item.unit || parsePriceNameUnit(item.name)?.unit || "";
        return;
      }
      saveState("已更新价格库");
      renderPrices();
      renderLines();
      renderTotalsAndPreview();
    });
  }
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
      <textarea class="category-description-input" aria-label="分类说明" placeholder="这一类项目的通用工艺说明">${escapeHtml(category.description || "")}</textarea>
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
    node.querySelector(".category-description-input").addEventListener("input", (event) => {
      category.description = event.target.value;
      saveState("已更新分类库");
      renderTotalsAndPreview();
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
    description: "",
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
  const name = createUniquePriceItemName();
  const newItem = {
    id: makeId("price"),
    name,
    sortOrder: nextItemSortOrder(""),
    unit: parsePriceNameUnit(name)?.unit || "项",
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
  while (version?.items?.some((item) => item.name === `新价格条目 ${index}/项`)) {
    index += 1;
  }
  return `新价格条目 ${index}/项`;
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
  els.designText.textContent = formatMoney(totals.design);
  els.taxText.textContent = formatMoney(totals.tax);
  els.grandTotalText.textContent = formatMoney(totals.grand);
  els.previewTitle.textContent = `${quote.projectName || "工程"}工程量`;
  els.previewMeta.textContent = `客户：${quote.clientName || "未填写"}　报价日期：${quote.quoteDate || ""}　价格版本：${currentVersion()?.name || ""}`;
  els.previewTotal.textContent = formatMoney(totals.grand);
  els.previewSubtotal.textContent = formatMoney(totals.subtotal);
  els.previewManagement.textContent = formatMoney(totals.management);
  els.previewDesign.textContent = formatMoney(totals.design);
  els.previewTax.textContent = formatMoney(totals.tax);
  els.previewGrand.textContent = formatMoney(totals.grand);
  let rowIndex = 0;
  els.previewRows.innerHTML = sortedSpaces(quote).map((space) => {
    const spaceLines = linesForSpace(quote, space.id);
    if (!spaceLines.length) return "";
    const meta = space.type === "overall"
      ? `建筑面积 ${formatNumber(space.buildingArea)} 平米`
      : [
        `面积 ${formatNumber(space.area)} 平米`,
        `周长 ${formatNumber(space.perimeter)} 米`,
        `高度 ${formatNumber(space.height)} 米`
      ].join("　");
    return `
      <tr class="preview-space-row">
        <td></td>
        <td colspan="9"><strong>${escapeHtml(space.name)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</td>
      </tr>
      ${spaceLines.map((line) => {
    const item = findItem(line.priceItemName, quote.priceVersionId);
    const unitPrice = calculateLineUnitPrice(line);
    const amount = toNumber(line.quantity) * unitPrice;
    const processNote = processNoteForLine(line, quote.priceVersionId);
    rowIndex += 1;
    return `
      <tr class="preview-main-row">
        <td>${rowIndex}</td>
        <td>
          <strong>${escapeHtml(line.engineeringName)}</strong>
          ${line.area ? `<small>${escapeHtml(line.area)}</small>` : ""}
        </td>
        <td>${formatNumber(line.quantity)}</td>
        <td>${escapeHtml(item?.unit || "")}</td>
        <td>${formatMoney(line.material)}</td>
        <td>${formatMoney(line.auxiliary)}</td>
        <td>${formatPercentInput(line.wasteRate)}%</td>
        <td>${formatMoney(line.labor)}</td>
        <td>${formatMoney(unitPrice)}</td>
        <td>${formatMoney(amount)}</td>
      </tr>
      ${processNote ? `
      <tr class="preview-note-row">
        <td></td>
        <td colspan="9"><span>工艺说明</span>${escapeHtml(processNote)}</td>
      </tr>
      ` : ""}
    `;
      }).join("")}
    `;
  }).join("");
}

function calculateTotals(quote = currentQuote()) {
  const subtotal = (quote?.lines || []).reduce((sum, line) => {
    return sum + toNumber(line.quantity) * calculateLineUnitPrice(line);
  }, 0);
  const management = subtotal * toNumber(quote?.managementRate) / 100;
  const design = subtotal * toNumber(quote?.designRate) / 100;
  const tax = subtotal * toNumber(quote?.taxRate) / 100;
  return { subtotal, management, design, tax, grand: subtotal + management + design + tax };
}

function calculateLineUnitPrice(line) {
  const splitPrice = (toNumber(line.material) + toNumber(line.auxiliary)) * (1 + toNumber(line.wasteRate)) + toNumber(line.labor);
  if (splitPrice === 0 && line.legacyUnitPrice !== null && line.legacyUnitPrice !== undefined) {
    return toNumber(line.legacyUnitPrice);
  }
  return splitPrice;
}

function calculateLineCostUnitPrice(line, versionId = currentQuote()?.priceVersionId || currentVersion()?.id) {
  const item = findItem(line.priceItemName, versionId);
  return item ? calculateItemCostUnitPrice(item) : 0;
}

function calculateItemUnitPrice(item) {
  return (toNumber(item.material) + toNumber(item.auxiliary)) * (1 + toNumber(item.wasteRate)) + toNumber(item.labor);
}

function calculateItemCostUnitPrice(item) {
  return (toNumber(item.costMaterial) + toNumber(item.costAuxiliary)) * (1 + toNumber(item.costWasteRate)) + toNumber(item.costLabor);
}

function recommendedQuantityForLine(line, quote = currentQuote()) {
  const item = findItem(line.priceItemName, quote?.priceVersionId);
  if (!item?.quantityFormula) return null;
  const space = (quote?.spaces || []).find((entry) => entry.id === line.spaceId);
  const context = {
    s: space?.type === "overall" ? toNumber(space.buildingArea) : toNumber(space?.area),
    c: toNumber(space?.perimeter),
    h: toNumber(space?.height)
  };
  return evaluateQuantityFormula(item.quantityFormula, context);
}

function evaluateQuantityFormula(formula, context) {
  const source = String(formula || "").trim();
  if (!source) return null;
  const expression = source
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
    ?.replace(/^q\s*=/i, "")
    .trim();
  if (!expression) return null;
  if (!/^[0-9+\-*/().\s schq=]+$/i.test(source)) return null;
  if (/[^0-9+\-*/().\s sch]/i.test(expression)) return null;
  try {
    const value = Function("s", "c", "h", `"use strict"; return (${expression});`)(
      toNumber(context.s),
      toNumber(context.c),
      toNumber(context.h)
    );
    return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
  } catch {
    return null;
  }
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
    priceVersionId: state.activeVersionId,
    managementRate: DEFAULT_MANAGEMENT_RATE,
    designRate: DEFAULT_DESIGN_RATE,
    taxRate: DEFAULT_TAX_RATE
  });
  state.quotes.push(quote);
  state.activeQuoteId = quote.id;
  saveState("已新建报价");
  renderAll();
  switchPage("editor");
}

function deleteQuote(quoteId) {
  const quote = state.quotes.find((entry) => entry.id === quoteId);
  if (!quote) return;
  const typedName = prompt(`删除案例报价需要输入完整名称：${quote.name}`, "");
  if (typedName === null) return;
  if (typedName !== quote.name) {
    alert("名称不一致，已取消删除。");
    return;
  }

  const deletedActive = quote.id === state.activeQuoteId;
  state.quotes = state.quotes.filter((entry) => entry.id !== quote.id);
  if (deletedActive) {
    const nextQuote = state.quotes.find((entry) => entry.customerId === state.activeCustomerId) || state.quotes[0];
    state.activeQuoteId = nextQuote?.id || "";
    if (nextQuote?.customerId) state.activeCustomerId = nextQuote.customerId;
  }
  if (!state.quotes.length) {
    const customer = currentCustomer() || normalizeCustomer({ id: makeId("customer"), name: "默认客户" });
    if (!state.customers.some((entry) => entry.id === customer.id)) state.customers.push(customer);
    const nextQuote = normalizeQuote({
      id: makeId("quote"),
      customerId: customer.id,
      clientName: customer.name,
      name: "新报价",
      projectName: "新工程",
      priceVersionId: state.activeVersionId,
      managementRate: DEFAULT_MANAGEMENT_RATE,
      designRate: DEFAULT_DESIGN_RATE,
      taxRate: DEFAULT_TAX_RATE
    });
    state.activeCustomerId = customer.id;
    state.activeQuoteId = nextQuote.id;
    state.quotes.push(nextQuote);
  }
  saveState("已删除案例报价");
  renderAll();
  if (!currentQuote()) switchPage("manager");
}

function addSpace() {
  const quote = currentQuote();
  const name = prompt("空间名称", `空间 ${quote.spaces.length + 1}`);
  if (name === null) return;
  const spaceName = String(name || "").trim() || `空间 ${quote.spaces.length + 1}`;
  if (spaceNameExists(spaceName)) {
    alert(`已经有“${spaceName}”这个空间了，空间名称不能重复。`);
    return;
  }
  const space = makeSpace(spaceName);
  const area = prompt("面积（可空）", "");
  if (area === null) return;
  const perimeter = prompt("周长（可空）", "");
  if (perimeter === null) return;
  const height = prompt("高度（可空）", "");
  if (height === null) return;
  space.area = toNumber(area);
  space.perimeter = toNumber(perimeter);
  space.height = toNumber(height);
  quote.spaces.push(space);
  saveState("已添加空间");
  renderAll();
}

function addOverallSpace() {
  const quote = currentQuote();
  const name = prompt("整体名称", "整体");
  if (name === null) return;
  const spaceName = String(name || "").trim() || "整体";
  if (quote.spaces.some((space) => space.type === "overall")) {
    alert("整体是必备分组，当前报价里已经有整体了。");
    return;
  }
  if (spaceNameExists(spaceName)) {
    alert(`已经有“${spaceName}”这个空间了，空间名称不能重复。`);
    return;
  }
  const space = makeSpace(spaceName, "overall");
  const buildingArea = prompt("建筑面积（平米，可空）", "");
  if (buildingArea === null) return;
  space.buildingArea = toNumber(buildingArea);
  quote.spaces.push(space);
  saveState("已添加整体");
  renderAll();
}

function spaceNameExists(name, excludeId = "") {
  const cleaned = String(name || "").trim();
  return currentQuote()?.spaces?.some((space) => space.id !== excludeId && space.name === cleaned);
}

function addLine(spaceId = "") {
  const quote = currentQuote();
  const targetSpaceId = spaceId || sortedSpaces(quote)[0]?.id || ensureDefaultSpace(quote).id;
  quote.lines.push(makeLine("", "", 0, targetSpaceId));
  saveState("已添加工程项目");
  renderAll();
}

function addLineAt(spaceId, position = 0) {
  const quote = currentQuote();
  const targetSpaceId = spaceId || sortedSpaces(quote)[0]?.id || ensureDefaultSpace(quote).id;
  const newLine = makeLine("", "", 0, targetSpaceId);
  const sameSpace = quote.lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.spaceId === targetSpaceId);
  const insertBefore = sameSpace[position]?.index;
  if (insertBefore === undefined) {
    const lastSameSpace = sameSpace[sameSpace.length - 1]?.index;
    quote.lines.splice(lastSameSpace === undefined ? quote.lines.length : lastSameSpace + 1, 0, newLine);
  } else {
    quote.lines.splice(insertBefore, 0, newLine);
  }
  saveState("已添加工程项目");
  renderAll();
}

function ensureDefaultSpace(quote = currentQuote()) {
  if (!quote.spaces?.length) quote.spaces = [makeSpace("全屋")];
  return sortedSpaces(quote)[0];
}

function deleteSpace(spaceId) {
  const quote = currentQuote();
  const space = quote.spaces.find((entry) => entry.id === spaceId);
  if (!space) return;
  if (space.type === "overall") {
    alert("整体是必备分组，不能删除。");
    return;
  }
  if (linesForSpace(quote, space.id).length) {
    alert("这个空间下面还有工程项目。请先移动或删除这些项目，再删除空间。");
    return;
  }
  const input = prompt(`请输入完整空间名称后删除：\n\n${space.name}`, "");
  if (input === null) return;
  if (String(input).trim() !== space.name) {
    alert("输入的空间名称不完整或不一致，未删除该空间。");
    return;
  }

  quote.spaces = quote.spaces.filter((entry) => entry.id !== space.id);
  quote.spaces.forEach((entry, index) => { entry.sortOrder = index; });
  saveState("已删除空间");
  renderAll();
}

function bindSpaceDragAndDrop() {
  let draggedSpaceId = "";
  const cards = [...els.quoteLines.querySelectorAll(".space-card")];
  cards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (event.target.closest("input, select, button, textarea")) {
        event.preventDefault();
        return;
      }
      draggedSpaceId = card.dataset.spaceId || "";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      cards.forEach((item) => item.classList.remove("drag-over"));
      draggedSpaceId = "";
    });
    card.addEventListener("dragover", (event) => {
      const targetId = card.dataset.spaceId || "";
      if (!draggedSpaceId || draggedSpaceId === targetId) return;
      event.preventDefault();
      cards.forEach((item) => item.classList.remove("drag-over"));
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = card.dataset.spaceId || "";
      if (!draggedSpaceId || !targetId || draggedSpaceId === targetId) return;
      moveSpaceBefore(draggedSpaceId, targetId);
    });
  });
}

function moveSpaceBefore(draggedId, targetId) {
  const quote = currentQuote();
  const spaces = sortedSpaces(quote);
  const draggedIndex = spaces.findIndex((space) => space.id === draggedId);
  const targetIndex = spaces.findIndex((space) => space.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = spaces.splice(draggedIndex, 1);
  spaces.splice(targetIndex, 0, dragged);
  spaces.forEach((space, sortIndex) => { space.sortOrder = sortIndex; });
  quote.spaces = spaces;
  saveState("已调整空间顺序");
  renderAll();
}

function toggleSpace(spaceId) {
  const quote = currentQuote();
  const space = quote.spaces.find((entry) => entry.id === spaceId);
  if (!space) return;
  if (space.collapsed) {
    quote.spaces.forEach((entry) => { entry.collapsed = entry.id !== spaceId; });
  } else {
    space.collapsed = true;
  }
  saveState(space.collapsed ? "已折叠空间" : "已展开空间");
  renderLines();
}

function moveLineToSpace(lineId, targetSpaceId) {
  const quote = currentQuote();
  const lineIndex = quote.lines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0) return;
  const [line] = quote.lines.splice(lineIndex, 1);
  line.spaceId = targetSpaceId;
  const recommendedQuantity = recommendedQuantityForLine(line, quote);
  if (recommendedQuantity !== null) line.quantity = roundQuantity(recommendedQuantity);
  const targetIndexes = quote.lines
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.spaceId === targetSpaceId);
  const lastTargetIndex = targetIndexes[targetIndexes.length - 1]?.index;
  quote.lines.splice(lastTargetIndex === undefined ? quote.lines.length : lastTargetIndex + 1, 0, line);
  sortLinesInSpaceByCategory(targetSpaceId);
  saveState("已移动工程项目");
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

async function backupDatabase() {
  try {
    const response = await fetch("/api/backup", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    saveState("已备份数据库");
    alert(`数据库已备份：\n${result.path || "备份完成"}`);
  } catch (error) {
    alert("备份数据库失败，请确认 Node 服务正在运行。");
  }
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
  if (state.expandedPriceItemName === item.name) state.expandedPriceItemName = "";
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

function printQuotePdf() {
  const previousTitle = document.title;
  document.title = buildPdfFileName();
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);
  window.print();
  setTimeout(restoreTitle, 1200);
}

function buildPdfFileName() {
  const quote = currentQuote();
  const projectName = quote?.projectName || quote?.name || "工程";
  const clientName = quote?.clientName || currentCustomer()?.name || "客户";
  return sanitizeFileName(`${projectName}-${clientName}-${formatTimestamp(new Date())}`);
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function sanitizeFileName(value) {
  return String(value || "报价单")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "报价单";
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

function roundQuantity(value) {
  return Number(toNumber(value).toFixed(2));
}

function selectInputText(event) {
  const input = event.currentTarget;
  requestAnimationFrame(() => input.select());
}

function flashLineSaved(node) {
  node.classList.remove("line-saved");
  requestAnimationFrame(() => {
    node.classList.add("line-saved");
    setTimeout(() => node.classList.remove("line-saved"), 700);
  });
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

