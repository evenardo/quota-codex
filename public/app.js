const STORAGE_KEY = "quote-tool-state-v2";
const OLD_STORAGE_KEY = "quote-tool-state-v1";
const DEFAULT_MANAGEMENT_RATE = 8;
const DEFAULT_DESIGN_RATE = 6;
const DEFAULT_TAX_RATE = 9;
const DEFAULT_QUANTITY_FORMULA = "q=s+c*(h-0.25)";
const MATERIAL_PRIMARY_CATEGORIES = ["砖", "门", "柜子", "板材", "洁具", "五金", "其他"];

// 项目组合图标只影响界面识别感，不参与报价计算和数据库关系。
const PROJECT_GROUP_ICONS = [
  { key: "home", label: "整体" },
  { key: "room", label: "房间" },
  { key: "bed", label: "卧室" },
  { key: "sofa", label: "客厅" },
  { key: "bath", label: "卫浴" },
  { key: "kitchen", label: "厨房" },
  { key: "box", label: "主材" },
  { key: "tool", label: "施工" }
];

// 前端单一状态树：所有页面都从这里读取，再通过 saveState 写回 SQLite。
const state = {
  versions: [],
  categories: [],
  materials: [],
  templates: [],
  packages: [],
  activeVersionId: "",
  activePage: "manager",
  categoryLibraryCollapsed: true,
  customers: [],
  quotes: [],
  activeCustomerId: "",
  activeQuoteId: "",
  activePackageId: "",
  activePackageEstimateId: "",
  activePackageTab: "description",
  pendingLaborItemName: "",
  expandedLaborItemName: "",
  pendingMaterialId: "",
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

// DOM 节点集中缓存，后续渲染和事件绑定都从 els 取，避免重复查询。
function bindElements() {
  [
    "saveStatus", "saveAllBtn", "printBtn", "resetBtn", "addCustomerBtn", "addQuoteBtn",
    "exportDataBtn", "importDataBtn", "bindFileBtn", "saveFileBtn", "importDataFile",
    "customerName", "customerContact", "customerPhone", "customerAddress", "customerList", "quoteList",
    "projectName", "editorProjectNameTitle", "showAmountColumns", "clientName", "clientPhone", "clientAddress", "quoteDate", "priceVersion", "libraryPriceVersion",
    "cloneVersionBtn", "renameVersionBtn", "managementRate", "designRate", "taxRate",
    "laborSubtotalText", "materialSubtotalText", "managementText", "designText", "taxText", "grandTotalText", "addLineBtn", "addSpaceBtn", "addOverallSpaceBtn", "quoteLines",
    "priceSearch", "priceCount", "priceList", "addPriceItemBtn", "previewTitle", "previewMeta", "previewTotal",
    "materialSearch", "materialCount", "materialList", "addMaterialBtn",
    "templateList", "templateCount", "addTemplateBtn",
    "packageList", "packageCount", "packageDetail", "addPackageBtn",
    "categoryList", "addCategoryBtn", "toggleCategoryLibraryBtn", "categoryLibraryPanel",
    "previewTableHead", "previewRows", "previewLaborSubtotal", "previewMaterialSubtotal", "previewManagement", "previewDesign", "previewTax", "previewGrand"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

// 数据载入顺序：Node/SQLite 是唯一正式数据源；HTTP 模式下禁止回退到浏览器缓存。
async function loadState() {
  const serverState = await loadStateFromServer();
  if (serverState) {
    Object.assign(state, serverState);
    normalizeState();
    return;
  }

  if (location.protocol !== "file:") {
    state.loadBlocked = true;
    if (els.saveStatus) {
      els.saveStatus.textContent = "未载入 SQLite 数据。为避免回到旧数据，请检查 Node 服务或恢复数据库备份。";
    }
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    Object.assign(state, JSON.parse(saved));
    normalizeState();
    return;
  }

  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old) {
    migrateOldState(JSON.parse(old));
  } else {
    throw new Error("未找到本地数据。请使用 http://127.0.0.1:5177 打开，并从 SQLite 数据库读取。");
  }
}

// 兼容早期 localStorage 单报价结构，仅在 file:// 且没有服务端数据时使用。
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

// 仅保留为旧兜底流程使用；正常 Node/SQLite 模式不会再创建演示数据。
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
      makeQuoteItem("拆除墙体/平米", "墙体", 15),
      makeQuoteItem("套装门拆除/樘", "套装门", 1),
      makeQuoteItem("电路开槽/米", "水电", 50)
    ]
  });
  state.customers = [customer];
  state.quotes = [quote];
  state.activeCustomerId = customer.id;
  state.activeQuoteId = quote.id;
}

// 统一修正载入后的数据形状，所有旧字段、缺省字段都在这里补齐。
function normalizeState() {
  state.versions = state.versions?.length ? state.versions : [];
  state.categories = normalizeCategories([...(state.categories || []), ...deriveCategoriesFromVersions(state.versions)]);
  state.materials = (state.materials || []).map((material, index) => normalizeMaterial(material, index));
  state.templates = (state.templates || []).map((template, index) => normalizeTemplate(template, index));
  state.packages = (state.packages || []).map((entry, index) => normalizePackage(entry, index));
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
  state.activePackageId = state.activePackageId || state.packages[0]?.id || "";
  state.activePackageEstimateId = state.activePackageEstimateId || currentPackage()?.estimates?.[0]?.id || "";
  state.activePackageTab = state.activePackageTab === "estimate" ? "estimate" : "description";
  state.activePage = state.activePage || "manager";
  state.categoryLibraryCollapsed = state.categoryLibraryCollapsed ?? true;
  state.returnToQuoteId = state.returnToQuoteId || "";
  state.returnToLineId = state.returnToLineId || "";
  state.pendingLineId = state.pendingLineId || "";
}

function normalizeTemplate(template, index = 0) {
  const name = String(template?.name || "").trim() || `模板 ${index + 1}`;
  return {
    id: template?.id || makeId("template"),
    name,
    iconKey: validProjectGroupIconKey(template?.iconKey) || defaultTemplateIconKey(name),
    sortOrder: Number.isFinite(Number(template?.sortOrder)) ? Number(template.sortOrder) : index,
    collapsed: Boolean(template?.collapsed),
    items: (template?.items || []).map((item, itemIndex) => normalizeTemplateItem(item, itemIndex))
  };
}

function normalizeTemplateItem(item, index = 0) {
  const sourceType = item?.sourceType === "material" ? "material" : "labor";
  return {
    id: item?.id || makeId("template-item"),
    sourceType,
    itemName: String(item?.itemName || "").trim(),
    materialId: String(item?.materialId || "").trim(),
    materialCategory: String(item?.materialCategory || "").trim(),
    area: String(item?.area || "").trim(),
    quantity: toNumber(item?.quantity),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
  };
}

function normalizePackage(entry, index = 0) {
  const name = String(entry?.name || "").trim() || `清工辅料套餐 ${index + 1}`;
  const estimates = (entry?.estimates || []).map((estimate, estimateIndex) => normalizePackageEstimate(estimate, estimateIndex));
  if (!estimates.length) estimates.push(normalizePackageEstimate({ active: true }, 0));
  if (!estimates.some((estimate) => estimate.active)) estimates[0].active = true;
  return {
    id: entry?.id || makeId("package"),
    name,
    unit: String(entry?.unit || "平米").trim(),
    quoteUnitPrice: toNumber(entry?.quoteUnitPrice),
    costTargetRate: toNumber(entry?.costTargetRate),
    quantityFormula: String(entry?.quantityFormula || "q=buildingArea").trim(),
    description: String(entry?.description || "").trim(),
    exclusionNote: String(entry?.exclusionNote || "").trim(),
    sortOrder: Number.isFinite(Number(entry?.sortOrder)) ? Number(entry.sortOrder) : index,
    collapsed: Boolean(entry?.collapsed),
    sections: (entry?.sections || []).map((section, sectionIndex) => normalizePackageSection(section, sectionIndex)),
    estimates
  };
}

function normalizePackageSection(section, index = 0) {
  return {
    id: section?.id || makeId("package-section"),
    name: String(section?.name || "").trim() || `说明分类 ${index + 1}`,
    sortOrder: Number.isFinite(Number(section?.sortOrder)) ? Number(section.sortOrder) : index,
    items: (section?.items || []).map((item, itemIndex) => normalizePackageSectionItem(item, itemIndex))
  };
}

function normalizePackageSectionItem(item, index = 0) {
  return {
    id: item?.id || makeId("package-section-item"),
    name: String(item?.name || "").trim(),
    unit: String(item?.unit || "").trim(),
    provider: String(item?.provider || "").trim(),
    description: String(item?.description || "").trim(),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
  };
}

function normalizePackageEstimate(estimate, index = 0) {
  const groups = (estimate?.groups || []).map((group, groupIndex) => normalizePackageEstimateGroup(group, groupIndex));
  if (!groups.length) groups.push(normalizePackageEstimateGroup({ name: "整体", iconKey: "home" }, 0));
  return {
    id: estimate?.id || makeId("package-estimate"),
    name: String(estimate?.name || "").trim() || `143平米标准户型测算`,
    buildingArea: toNumber(estimate?.buildingArea || 143),
    area: toNumber(estimate?.area),
    perimeter: toNumber(estimate?.perimeter),
    height: toNumber(estimate?.height || 2.7),
    quoteUnitPrice: toNumber(estimate?.quoteUnitPrice),
    sortOrder: Number.isFinite(Number(estimate?.sortOrder)) ? Number(estimate.sortOrder) : index,
    active: Boolean(estimate?.active),
    groups,
    items: (estimate?.items || []).map((item, itemIndex) => normalizePackageEstimateItem(item, itemIndex))
  };
}

function normalizePackageEstimateGroup(group, index = 0) {
  return {
    id: group?.id || makeId("package-group"),
    name: String(group?.name || "").trim() || `测算组合 ${index + 1}`,
    iconKey: validProjectGroupIconKey(group?.iconKey) || "home",
    area: toNumber(group?.area),
    perimeter: toNumber(group?.perimeter),
    height: toNumber(group?.height || 2.7),
    collapsed: Boolean(group?.collapsed),
    sortOrder: Number.isFinite(Number(group?.sortOrder)) ? Number(group.sortOrder) : index
  };
}

function normalizePackageEstimateItem(item, index = 0) {
  const sourceType = item?.sourceType === "material" || item?.itemType === "material" ? "material" : "labor";
  return {
    id: item?.id || makeId("package-item"),
    groupId: String(item?.groupId || "").trim(),
    sourceType,
    itemName: String(item?.itemName || "").trim(),
    materialId: String(item?.materialId || "").trim(),
    materialCategory: String(item?.materialCategory || "").trim(),
    area: String(item?.area || "").trim(),
    quantity: toNumber(item?.quantity),
    includedType: ["included", "excluded", "upgrade", "reference"].includes(item?.includedType) ? item.includedType : "included",
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
  };
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
    items: (version.items || []).map((item, index) => normalizeLaborItem(item, index))
  };
}

function normalizeLaborItem(item, index = 0) {
  const categoryName = String(item?.category || "").trim();
  const category = state.categories.find((entry) => entry.id === item?.categoryId)
    || state.categories.find((entry) => entry.name === categoryName);
  const parsedName = parsePriceNameUnit(item?.name || "");
  const { materialSubcategory, ...rest } = item || {};
  return {
    ...rest,
    id: item?.id || makeId("labor"),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    categoryId: category?.id || "",
    category: category?.name || categoryName,
    unit: parsedName?.unit || item?.unit || "",
    costMaterial: toNumber(item?.costMaterial),
    costAuxiliary: toNumber(item?.costAuxiliary),
    costWasteRate: toNumber(item?.costWasteRate),
    costLabor: toNumber(item?.costLabor),
    costUnitPrice: toNumber(item?.costUnitPrice),
    quantityFormula: item?.quantityFormula || DEFAULT_QUANTITY_FORMULA,
    usesMaterial: false,
    materialCategory: "",
    defaultMaterialId: ""
  };
}

function normalizeMaterial(material, index = 0) {
  const quoteUnitPrice = material?.quoteUnitPrice ?? material?.unitPrice;
  const primaryCategory = String(material?.primaryCategory || material?.category || MATERIAL_PRIMARY_CATEGORIES[0]).trim();
  const { secondaryCategory, subcategory, ...rest } = material || {};
  return {
    ...rest,
    id: material?.id || makeId("material"),
    sortOrder: Number.isFinite(Number(material?.sortOrder)) ? Number(material.sortOrder) : index,
    name: String(material?.name || "").trim(),
    primaryCategory,
    category: primaryCategory,
    spec: String(material?.spec || "").trim(),
    unit: String(material?.unit || "").trim(),
    costUnitPrice: toNumber(material?.costUnitPrice),
    quoteUnitPrice: toNumber(quoteUnitPrice),
    unitPrice: toNumber(quoteUnitPrice),
    conversionUnit: String(material?.conversionUnit || "").trim(),
    conversionQuantity: toNumber(material?.conversionQuantity),
    brand: String(material?.brand || "").trim(),
    supplier: String(material?.supplier || "").trim(),
    pricingFormula: String(material?.pricingFormula || "").trim(),
    note: String(material?.note || "").trim()
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

function setLaborItemUnit(item, nextUnit) {
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
  syncQuoteItemLaborItemName(oldName, item.name);
  if (state.expandedLaborItemName === oldName) state.expandedLaborItemName = item.name;
  if (state.pendingLaborItemName === oldName) state.pendingLaborItemName = item.name;
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

// 案例报价的主结构：quote.spaces 是项目组合，quote.lines 是组合里的报价条目。
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
    clientPhone: quote.clientPhone || "",
    clientAddress: quote.clientAddress || "",
    quoteDate: quote.quoteDate || new Date().toISOString().slice(0, 10),
    priceVersionId: quote.priceVersionId || state.activeVersionId,
    managementRate,
    designRate: quote.designRate ?? DEFAULT_DESIGN_RATE,
    taxRate,
    showAmountColumns: quote.showAmountColumns !== false && quote.showAmountColumns !== 0,
    spaces: quote.spaces || [],
    lines: quote.lines || []
  };
  normalized.lines = normalized.lines.map((line) => normalizeQuoteItem(line, normalized.priceVersionId));
  normalized.spaces = normalizeProjectGroups(normalized.spaces, normalized.lines);
  normalized.lines = sortQuoteItemsForReload(normalized);
  return normalized;
}

// 页面重新载入时才按库顺序整理条目；用户新添加条目时先保留插入位置。
function sortQuoteItemsForReload(quote) {
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  const version = state.versions.find((item) => item.id === quote.priceVersionId) || state.versions[0];
  const itemIndex = new Map((version?.items || []).map((item, index) => [item.name, index]));
  const materialIndex = new Map((state.materials || []).map((material, index) => [material.id, index]));
  const materialCategoryIndex = new Map(MATERIAL_PRIMARY_CATEGORIES.map((category, index) => [category, index]));
  const spaces = (quote.spaces || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const knownSpaceIds = new Set(spaces.map((space) => space.id));
  const sortedLines = spaces.flatMap((space) => {
    return (quote.lines || [])
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.line.spaceId === space.id)
      .sort((a, b) => {
        const leftItem = version?.items?.find((item) => item.name === a.line.priceItemName);
        const rightItem = version?.items?.find((item) => item.name === b.line.priceItemName);
        const leftType = isMaterialQuoteItem(a.line) ? 1 : 0;
        const rightType = isMaterialQuoteItem(b.line) ? 1 : 0;
        if (leftType !== rightType) return leftType - rightType;
        if (leftType === 1) {
          const leftMaterial = findMaterial(a.line.materialId);
          const rightMaterial = findMaterial(b.line.materialId);
          const leftCategory = materialCategoryIndex.get(leftMaterial?.primaryCategory || a.line.materialCategory || "") ?? Number.MAX_SAFE_INTEGER;
          const rightCategory = materialCategoryIndex.get(rightMaterial?.primaryCategory || b.line.materialCategory || "") ?? Number.MAX_SAFE_INTEGER;
          if (leftCategory !== rightCategory) return leftCategory - rightCategory;
          const leftRank = materialIndex.get(a.line.materialId) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = materialIndex.get(b.line.materialId) ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return a.index - b.index;
        }
        const leftCategory = leftItem ? (categoryIndex.get(leftItem.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const rightCategory = rightItem ? (categoryIndex.get(rightItem.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (leftCategory !== rightCategory) return leftCategory - rightCategory;
        const leftItemRank = leftItem ? (itemIndex.get(leftItem.name) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const rightItemRank = rightItem ? (itemIndex.get(rightItem.name) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (leftItemRank !== rightItemRank) return leftItemRank - rightItemRank;
        return a.index - b.index;
      })
      .map((entry) => entry.line);
  });
  return sortedLines.concat((quote.lines || []).filter((line) => !knownSpaceIds.has(line.spaceId)));
}

// 项目组合仍沿用旧字段名 spaces/spaceId 做前端兼容，界面含义是“项目组合”。
function normalizeProjectGroups(spaces, lines = []) {
  const hasCollapsedState = (spaces || []).some((space) => Object.prototype.hasOwnProperty.call(space || {}, "collapsed"));
  const normalized = (spaces || []).map((space, index) => normalizeProjectGroup(space, index)).filter((space) => space.name);
  if (!normalized.length) {
    const names = [];
    lines.forEach((line) => {
      const name = String(line.area || "项目组合").trim() || "项目组合";
      if (!names.includes(name)) names.push(name);
    });
    (names.length ? names : ["项目组合"]).forEach((name, index) => {
      normalized.push(normalizeProjectGroup({ name }, index));
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

function normalizeProjectGroup(space, index = 0) {
  const wasOverall = space.type === "overall" || String(space.name || "").trim() === "整体";
  const area = toNumber(space.area) || (wasOverall ? toNumber(space.buildingArea) : 0);
  return {
    id: space.id || makeId("group"),
    name: String(space.name || "项目组合").trim() || "项目组合",
    type: "space",
    workType: space.workType === "material" ? "material" : "labor",
    iconKey: validProjectGroupIconKey(space.iconKey) || defaultProjectGroupIconKey(space),
    templateId: String(space.templateId || "").trim(),
    area,
    perimeter: toNumber(space.perimeter),
    height: toNumber(space.height),
    buildingArea: toNumber(space.buildingArea),
    collapsed: Boolean(space.collapsed),
    sortOrder: Number.isFinite(Number(space.sortOrder)) ? Number(space.sortOrder) : index
  };
}

function makeProjectGroup(name = "新项目组合", type = "space") {
  return normalizeProjectGroup({ id: makeId("group"), name, type, workType: "labor", sortOrder: currentQuote()?.spaces?.length || 0 });
}

function validProjectGroupIconKey(iconKey) {
  return PROJECT_GROUP_ICONS.some((icon) => icon.key === iconKey) ? iconKey : "";
}

function defaultProjectGroupIconKey(space = {}) {
  const name = String(space.name || "").trim();
  if (space.type === "overall" || name === "整体") return "home";
  if (/卧室|儿童|主卧|次卧/.test(name)) return "bed";
  if (/客厅|餐厅/.test(name)) return "sofa";
  if (/厨/.test(name)) return "kitchen";
  if (/卫|浴/.test(name)) return "bath";
  return "room";
}

function defaultTemplateIconKey(name = "") {
  const text = String(name || "").trim();
  if (/厨/.test(text)) return "kitchen";
  if (/卫|浴|厕/.test(text)) return "bath";
  if (/卧/.test(text)) return "bed";
  if (/客/.test(text)) return "sofa";
  if (/整/.test(text)) return "home";
  return "room";
}

function renderProjectGroupIconChoices(selectedKey = "") {
  return PROJECT_GROUP_ICONS.map((icon) => `
    <button class="space-icon-choice ${icon.key === selectedKey ? "active" : ""}" type="button" data-icon-key="${escapeHtml(icon.key)}" title="${escapeHtml(icon.label)}">
      ${renderProjectGroupIcon(icon.key)}
      <span>${escapeHtml(icon.label)}</span>
    </button>
  `).join("");
}

function renderProjectGroupIcon(iconKey = "room") {
  const key = validProjectGroupIconKey(iconKey) || "room";
  const paths = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M10 20v-5h4v5"/>',
    room: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6"/><path d="M9 13h6"/>',
    bed: '<path d="M4 18V9"/><path d="M20 18v-5a3 3 0 0 0-3-3H9v8"/><path d="M4 13h5"/><path d="M4 18h16"/>',
    sofa: '<path d="M6 12V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"/><path d="M4 13a2 2 0 0 1 4 0v3h8v-3a2 2 0 0 1 4 0v5H4z"/>',
    bath: '<path d="M5 11h14v3a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M8 11V7a3 3 0 0 1 3-3h1"/><path d="M4 21h16"/>',
    kitchen: '<path d="M6 3v18"/><path d="M10 3v18"/><path d="M6 9h4"/><path d="M15 4v7a3 3 0 0 0 3 3v7"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.5 2.5-3-3z"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[key]}</svg>`;
}

function projectGroupDisplayName(space) {
  if (!space) return "";
  return space.name || "";
}

function materialsForCategory(category = "") {
  return state.materials
    .filter((material) => !category || material.primaryCategory === category)
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), "zh-CN"));
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
  if (els.addLineBtn) els.addLineBtn.addEventListener("click", addQuoteItem);
  if (els.addSpaceBtn) els.addSpaceBtn.textContent = "添加项目组合";
  if (els.addOverallSpaceBtn) els.addOverallSpaceBtn.remove();
  if (els.addSpaceBtn) els.addSpaceBtn.addEventListener("click", addProjectGroup);
  if (els.addPriceItemBtn) els.addPriceItemBtn.addEventListener("click", addLaborItem);
  if (els.addMaterialBtn) els.addMaterialBtn.addEventListener("click", addMaterial);
  if (els.addTemplateBtn) els.addTemplateBtn.addEventListener("click", addTemplate);
  if (els.addPackageBtn) els.addPackageBtn.addEventListener("click", addPackage);
  if (els.addCategoryBtn) els.addCategoryBtn.addEventListener("click", addCategory);
  if (els.toggleCategoryLibraryBtn) {
    els.toggleCategoryLibraryBtn.addEventListener("click", toggleCategoryLibrary);
  }
  els.priceSearch.addEventListener("input", renderLaborLibrary);
  if (els.materialSearch) els.materialSearch.addEventListener("input", renderMaterials);
  els.priceVersion.addEventListener("change", () => setQuoteField("priceVersionId", els.priceVersion.value, true));
  els.libraryPriceVersion.addEventListener("change", () => {
    state.activeVersionId = els.libraryPriceVersion.value;
    const quote = currentQuote();
    if (quote) quote.priceVersionId = state.activeVersionId;
    saveState("已切换工费版本");
    renderAll();
  });

  ["projectName", "clientName", "clientPhone", "clientAddress", "quoteDate", "managementRate", "designRate", "taxRate"].forEach((id) => {
    if (!els[id]) return;
    els[id].addEventListener("input", () => {
      const value = els[id].type === "number" ? toNumber(els[id].value) : els[id].value;
      setQuoteField(id, value);
    });
  });
  if (els.showAmountColumns) {
    els.showAmountColumns.addEventListener("change", () => {
      setQuoteField("showAmountColumns", els.showAmountColumns.checked, true);
    });
  }
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

function currentPackage() {
  return state.packages.find((entry) => entry.id === state.activePackageId) || state.packages[0];
}

function currentPackageEstimate(packageEntry = currentPackage()) {
  return packageEntry?.estimates?.find((estimate) => estimate.id === state.activePackageEstimateId)
    || packageEntry?.estimates?.find((estimate) => estimate.active)
    || packageEntry?.estimates?.[0];
}

function currentCustomer() {
  return state.customers.find((customer) => customer.id === state.activeCustomerId) || state.customers[0];
}

function currentVersion() {
  const quote = currentQuote();
  const versionId = state.activePage === "prices" ? state.activeVersionId : (quote?.priceVersionId || state.activeVersionId);
  return state.versions.find((version) => version.id === versionId) || state.versions[0];
}

function currentLaborItems() {
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

function findLaborItem(name, versionId = currentVersion()?.id) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  return version?.items.find((item) => item.name === name);
}

function findMaterial(id) {
  return state.materials.find((material) => material.id === id);
}

function findMaterialByName(name, category = "") {
  const cleaned = normalizeName(name);
  return state.materials.find((material) => (
    normalizeName(material.name) === cleaned
    && (!category || material.primaryCategory === category)
  ));
}

function materialPrimaryCategoryOptions(value = "") {
  const categories = new Set(MATERIAL_PRIMARY_CATEGORIES);
  state.materials.forEach((material) => {
    if (material.primaryCategory) categories.add(material.primaryCategory);
  });
  if (value) categories.add(value);
  return [...categories].map((category) => (
    `<option value="${escapeHtml(category)}" ${category === value ? "selected" : ""}>${escapeHtml(category)}</option>`
  )).join("");
}

function materialsForItem(item) {
  if (!item?.usesMaterial) return [];
  return state.materials.filter((material) => {
    if (item.materialCategory && material.primaryCategory !== item.materialCategory) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), "zh-CN"));
}

function defaultMaterialIdForItem(item) {
  if (!item?.usesMaterial || !item.defaultMaterialId) return "";
  return materialsForItem(item).some((material) => material.id === item.defaultMaterialId) ? item.defaultMaterialId : "";
}

function materialOptionsForItem(item, selectedId = "", placeholder = "不设默认") {
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
  materialsForItem(item).forEach((material) => {
    options.push(`<option value="${escapeHtml(material.id)}" ${material.id === selectedId ? "selected" : ""}>${escapeHtml(material.name)}</option>`);
  });
  return options.join("");
}

function materialCategoryOptions(value = "", includeAny = false) {
  const options = includeAny ? [`<option value="">先选类目</option>`] : [];
  return options.concat(materialPrimaryCategoryOptions(value)).join("");
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

function processNoteForQuoteItem(line, versionId = currentQuote()?.priceVersionId || currentVersion()?.id) {
  const item = findLaborItem(line.priceItemName, versionId);
  const parts = [
    categoryDescriptionForItem(item),
    item?.description
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return [...new Set(parts)].join("；");
}

function makeQuoteItem(itemName = "", area = "", quantity = 0, spaceId = "") {
  const item = findLaborItem(itemName);
  return normalizeQuoteItem({
    id: makeId("item"),
    priceItemName: itemName,
    sourceType: item?.usesMaterial || defaultMaterialIdForItem(item) ? "material" : "labor",
    area,
    spaceId,
    materialId: defaultMaterialIdForItem(item),
    quantity,
    material: 0,
    auxiliary: item ? item.auxiliary : 0,
    wasteRate: item ? item.wasteRate : 0,
    labor: item ? item.labor : 0
  });
}

function normalizeQuoteItem(line, versionId = currentVersion()?.id) {
  const priceItemName = line.priceItemName || line.itemName || "";
  const item = findLaborItem(priceItemName, versionId);
  const hasSplitPrice = ["material", "auxiliary", "wasteRate", "labor"].some((key) => line[key] !== undefined && line[key] !== null);
  const rawEngineeringName = line.engineeringName || line.itemName || "";
  const fallbackEngineeringName = rawEngineeringName || (priceItemName ? displayEngineeringName(priceItemName) : "");
  return {
    id: line.id || makeId("item"),
    engineeringName: priceItemName && rawEngineeringName === displayEngineeringName(priceItemName)
      ? priceItemName
      : fallbackEngineeringName,
    priceItemName,
    sourceType: line.sourceType === "material" || line.materialId ? "material" : "labor",
    area: line.area || "",
    spaceId: line.spaceId || "",
    materialId: line.materialId || "",
    materialCategory: String(line.materialCategory || "").trim(),
    quantity: toNumber(line.quantity),
    material: 0,
    auxiliary: hasSplitPrice ? toNumber(line.auxiliary) : toNumber(item?.auxiliary),
    wasteRate: hasSplitPrice ? toNumber(line.wasteRate) : toNumber(item?.wasteRate),
    labor: hasSplitPrice ? toNumber(line.labor) : toNumber(item?.labor),
    legacyUnitPrice: hasSplitPrice || item ? (line.legacyUnitPrice ?? null) : (line.customPrice ?? null)
  };
}

function isMaterialQuoteItem(line) {
  return line?.sourceType === "material" || Boolean(line?.materialId);
}

// 总渲染入口：页面切换、管理列表、编辑区、各类库和预览都在这里刷新。
function renderAll() {
  if (state.loadBlocked) return;
  switchPage(state.activePage);
  renderManager();
  renderSettings();
  renderLines();
  renderLaborLibrary();
  renderMaterials();
  renderTemplates();
  renderPackages();
  renderTotalsAndPreview();
}

// 案例报价管理页：客户与案例报价目前是一体管理，删除报价需要名称核对。
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

// 左侧基础信息表单，包括工程名称、客户信息、费率和显示金额开关。
function renderSettings() {
  const quote = currentQuote();
  if (!quote) return;
  els.projectName.value = quote.projectName;
  if (els.editorProjectNameTitle) {
    els.editorProjectNameTitle.textContent = quote.projectName || quote.name || "未命名工程";
  }
  els.clientName.value = quote.clientName || currentCustomer()?.name || "";
  if (els.clientPhone) els.clientPhone.value = quote.clientPhone || "";
  if (els.clientAddress) els.clientAddress.value = quote.clientAddress || "";
  if (els.showAmountColumns) els.showAmountColumns.checked = quote.showAmountColumns !== false;
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

// 报价编辑主界面：项目组合、组合内条目、插入槽和返回高亮都在这里生成。
function renderLines() {
  const quote = currentQuote();
  if (!quote) return;
  const spaces = sortedProjectGroups(quote);
  els.quoteLines.innerHTML = `
    ${renderProjectGroupInsertSlot(0)}
    ${spaces.map((space, spaceIndex) => {
    const spaceLines = quoteItemsForProjectGroup(quote, space.id);
    return `
      <section class="space-card ${space.collapsed ? "collapsed" : ""}" data-space-id="${escapeHtml(space.id)}" draggable="true">
        <div class="space-head">
          <div class="space-title">
            <div class="space-icon-wrap">
              <button class="space-icon-btn" type="button" aria-label="选择项目组合图标" title="选择图标">${renderProjectGroupIcon(space.iconKey)}</button>
              <div class="space-icon-picker" hidden>
                ${renderProjectGroupIconChoices(space.iconKey)}
              </div>
            </div>
            <input class="space-name" type="text" aria-label="项目组合名称" title="${space.collapsed ? "点击空白处展开" : "点击空白处收起"}" value="${escapeHtml(space.name)}">
            <span class="space-count">${spaceLines.length}</span>
          </div>
          <label class="space-metric">面积（平米）<input class="space-area" type="number" min="0" step="0.01" aria-label="面积（平米）" value="${space.area}"></label>
          <label class="space-metric">周长（米）<input class="space-perimeter" type="number" min="0" step="0.01" aria-label="周长（米）" value="${space.perimeter}"></label>
          <label class="space-metric">高度（米）<input class="space-height" type="number" min="0" step="0.01" aria-label="高度（米）" value="${space.height}"></label>
          <div class="space-actions">
            <button class="add-space-labor-line small" type="button">添加工费</button>
            <button class="add-space-material-line small ghost" type="button">添加主材</button>
            <button class="sync-space-template small ghost" type="button">同步模板</button>
            <button class="delete-space danger small" type="button">删除项目组合</button>
          </div>
        </div>
        ${space.collapsed ? "" : `
        <div class="space-lines">
          ${renderInsertSlot(space.id, 0)}
          ${spaceLines.map((line, index) => `
            ${renderLaborQuoteItem(line, quote)}
            ${renderInsertSlot(space.id, index + 1)}
          `).join("")}
        </div>
        `}
      </section>
      ${renderProjectGroupInsertSlot(spaceIndex + 1)}
    `;
  }).join("")}
  `;

  els.quoteLines.querySelectorAll(".space-card").forEach((spaceNode) => {
    const space = quote.spaces.find((entry) => entry.id === spaceNode.dataset.spaceId);
    if (!space) return;
    const iconButton = spaceNode.querySelector(".space-icon-btn");
    const iconPicker = spaceNode.querySelector(".space-icon-picker");
    iconButton.addEventListener("click", (event) => {
      event.stopPropagation();
      els.quoteLines.querySelectorAll(".space-icon-picker").forEach((picker) => {
        if (picker !== iconPicker) picker.hidden = true;
      });
      iconPicker.hidden = !iconPicker.hidden;
    });
    iconPicker.querySelectorAll(".space-icon-choice").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        space.iconKey = button.dataset.iconKey;
        saveState("已更新项目组合图标");
        renderLines();
      });
    });
    const spaceNameInput = spaceNode.querySelector(".space-name");
    spaceNameInput.addEventListener("focus", (event) => {
      event.target.dataset.previousName = space.name;
    });
    bindProjectGroupEnterFeedback(spaceNameInput, spaceNode);
    spaceNameInput.addEventListener("input", (event) => {
      space.name = event.target.value;
      renderTotalsAndPreview();
    });
    spaceNameInput.addEventListener("blur", (event) => {
      const nextName = String(event.target.value || "").trim();
      const previousName = event.target.dataset.previousName || space.name;
      if (!nextName) {
        alert("项目组合名称不能为空。");
        space.name = previousName;
        event.target.value = previousName;
        return;
      }
      if (projectGroupNameExists(nextName, space.id)) {
        alert(`已经有“${nextName}”这个项目组合了。`);
        space.name = previousName;
        event.target.value = previousName;
        return;
      }
      space.name = nextName;
      saveState("已自动保存");
      renderAll();
    });
    const areaInput = spaceNode.querySelector(".space-area");
    if (areaInput) {
      bindProjectGroupEnterFeedback(areaInput, spaceNode, true);
      areaInput.addEventListener("input", (event) => {
        space.area = toNumber(event.target.value);
        saveState("已自动保存");
        refreshRecommendedQuantities(space.id);
        renderTotalsAndPreview();
      });
    }
    const perimeterInput = spaceNode.querySelector(".space-perimeter");
    if (perimeterInput) {
      bindProjectGroupEnterFeedback(perimeterInput, spaceNode, true);
      perimeterInput.addEventListener("input", (event) => {
        space.perimeter = toNumber(event.target.value);
        saveState("已自动保存");
        refreshRecommendedQuantities(space.id);
        renderTotalsAndPreview();
      });
    }
    const heightInput = spaceNode.querySelector(".space-height");
    if (heightInput) {
      bindProjectGroupEnterFeedback(heightInput, spaceNode, true);
      heightInput.addEventListener("input", (event) => {
        space.height = toNumber(event.target.value);
        saveState("已自动保存");
        refreshRecommendedQuantities(space.id);
        renderTotalsAndPreview();
      });
    }
    spaceNode.querySelector(".space-head").addEventListener("click", (event) => {
      if (event.target.closest("input, select, button")) return;
      toggleProjectGroup(space.id);
    });
    spaceNode.querySelector(".add-space-labor-line").addEventListener("click", () => addQuoteItem(space.id, "labor"));
    spaceNode.querySelector(".add-space-material-line").addEventListener("click", () => addQuoteItem(space.id, "material"));
    spaceNode.querySelector(".sync-space-template").addEventListener("click", () => openSyncProjectGroupTemplateDialog(space.id));
    spaceNode.querySelector(".delete-space").addEventListener("click", () => deleteProjectGroup(space.id));
  });

  bindProjectGroupDragAndDrop();

  els.quoteLines.querySelectorAll(".insert-project-group-slot").forEach((button) => {
    button.addEventListener("click", () => openAddProjectGroupDialog(Number(button.dataset.position || 0)));
  });

  els.quoteLines.querySelectorAll(".insert-line-slot").forEach((button) => {
    button.addEventListener("click", () => addQuoteItemAt(button.dataset.spaceId, Number(button.dataset.position || 0)));
  });

  els.quoteLines.querySelectorAll(".line-item").forEach((node) => {
    bindQuoteItem(node, quote);
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

function renderProjectGroupInsertSlot(position) {
  return `
    <button class="insert-line-slot insert-project-group-slot" type="button" data-position="${position}" aria-label="在这里添加项目组合">
      <span>+</span>
    </button>
  `;
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
    const recommendedQuantity = recommendedQuantityForQuoteItem(line, quote);
    output.textContent = recommendedQuantity === null ? "" : formatNumber(recommendedQuantity);
  });
}

function renderLaborQuoteItem(line, quote) {
    if (isMaterialQuoteItem(line)) return renderMaterialQuoteItem(line, quote);
    const item = findLaborItem(line.priceItemName, quote.priceVersionId);
    const unit = item?.unit || "";
    const unitPrice = calculateQuoteItemUnitPrice(line);
    const costUnitPrice = calculateQuoteItemCostUnitPrice(line, quote.priceVersionId);
    const engineeringDisplayName = line.priceItemName && line.engineeringName === displayEngineeringName(line.priceItemName)
      ? line.priceItemName
      : line.engineeringName;
    const amount = toNumber(line.quantity) * unitPrice;
    const recommendedQuantity = recommendedQuantityForQuoteItem(line, quote);
    const materialOptions = item?.usesMaterial
      ? materialOptionsForItem(item, line.materialId, "选主材")
      : `<option value="">无</option>`;
    const spaceOptions = sortedProjectGroups(quote).map((space) => (
      `<option value="${escapeHtml(space.id)}" ${space.id === line.spaceId ? "selected" : ""}>${escapeHtml(projectGroupDisplayName(space))}</option>`
    )).join("");
    return `
      <div class="line-item" data-line-id="${escapeHtml(line.id)}">
        <div class="line-field project-field">
          <label>工程项目名称</label>
          <div class="project-picker">
            <input class="line-name" type="text" aria-label="工程项目名称" placeholder="输入工程项目名称，选择相似工费条目" value="${escapeHtml(engineeringDisplayName)}" autocomplete="off">
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
        <div class="line-field material-field">
          <label>类型</label>
          <button class="line-unit" type="button" disabled>清工辅料</button>
        </div>
        <div class="line-field price-field">
          <label>单价合计</label>
          <button class="readonly-price jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(unitPrice)}</button>
        </div>
        <div class="line-field cost-price-field">
          <label>成本单价</label>
          <button class="readonly-price jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(costUnitPrice)}</button>
        </div>
        <div class="line-field amount-field">
          <label>金额</label>
          <button class="amount jump-price-item" type="button" ${line.priceItemName ? "" : "disabled"}>${formatMoney(amount)}</button>
        </div>
        <div class="line-field move-field">
          <label>移到组合</label>
          <select class="line-space" aria-label="移到项目组合">${spaceOptions}</select>
        </div>
        <div class="line-field action-field">
          <label class="action-label" aria-hidden="true">&nbsp;</label>
          <button class="remove-btn" type="button" aria-label="删除">×</button>
        </div>
      </div>
    `;
}

function renderMaterialQuoteItem(line, quote) {
  const material = findMaterial(line.materialId);
  const selectedCategory = line.materialCategory || material?.primaryCategory || "";
  const unitPrice = calculateQuoteItemUnitPrice(line);
  const costUnitPrice = calculateQuoteItemCostUnitPrice(line, quote.priceVersionId);
  const amount = toNumber(line.quantity) * unitPrice;
  const categoryOptions = materialCategoryOptions(selectedCategory, true);
  const spaceOptions = sortedProjectGroups(quote).map((space) => (
    `<option value="${escapeHtml(space.id)}" ${space.id === line.spaceId ? "selected" : ""}>${escapeHtml(projectGroupDisplayName(space))}</option>`
  )).join("");
  return `
    <div class="line-item material-line" data-line-id="${escapeHtml(line.id)}">
      <div class="line-field project-field">
        <label>主材项目名称</label>
        <div class="project-picker">
          <input class="line-material-main line-name" type="text" aria-label="主材项目名称" placeholder="输入主材项目名称，选择相似主材" value="${escapeHtml(line.engineeringName || material?.name || "")}" autocomplete="off">
          <div class="suggestions"></div>
        </div>
      </div>
      <div class="line-field part-field">
        <label>部位</label>
        <input class="line-part" type="text" aria-label="部位" placeholder="" value="${escapeHtml(line.area || "")}">
      </div>
      <div class="line-field recommended-field">
        <label>主材类目</label>
        <button class="line-material-category readonly-price" type="button" disabled>${escapeHtml(selectedCategory || "自动")}</button>
      </div>
      <div class="line-field qty-field">
        <label>工程量</label>
        <input class="line-qty" type="number" min="0" step="0.01" aria-label="工程量" placeholder="数量" value="${line.quantity}">
      </div>
      <div class="line-field unit-field">
        <label>单位</label>
        <button class="line-unit jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${escapeHtml(material?.unit || "")}</button>
      </div>
      <div class="line-field material-field">
        <label>类型</label>
        <button class="line-unit" type="button" disabled>装修主材</button>
      </div>
      <div class="line-field price-field">
        <label>单价合计</label>
        <button class="readonly-price jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(unitPrice)}</button>
      </div>
      <div class="line-field cost-price-field">
        <label>成本单价</label>
        <button class="readonly-price jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(costUnitPrice)}</button>
      </div>
      <div class="line-field amount-field">
        <label>金额</label>
        <button class="amount jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(amount)}</button>
      </div>
      <div class="line-field move-field">
        <label>移到组合</label>
        <select class="line-space" aria-label="移到项目组合">${spaceOptions}</select>
      </div>
      <div class="line-field action-field">
        <label class="action-label" aria-hidden="true">&nbsp;</label>
        <button class="remove-btn" type="button" aria-label="删除">×</button>
      </div>
    </div>
  `;
}

function bindQuoteItem(node, quote) {
  const line = quote.lines.find((entry) => entry.id === node.dataset.lineId);
  if (!line) return;
  if (isMaterialQuoteItem(line)) {
    bindMaterialQuoteItem(node, quote, line);
    return;
  }
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
  bindQuoteItemPartInput(node, line);
  node.querySelector(".line-space").addEventListener("change", (event) => {
    moveQuoteItemToProjectGroup(line.id, event.target.value);
  });
  const materialSelect = node.querySelector(".line-material");
  if (materialSelect) {
    materialSelect.addEventListener("change", (event) => {
      line.materialId = event.target.value;
      saveState("已选择主材");
      renderAll();
    });
  }
  const quantityInput = node.querySelector(".line-qty");
  quantityInput.addEventListener("focus", selectInputText);
  quantityInput.addEventListener("mouseup", (event) => {
    event.preventDefault();
    selectInputText(event);
  });
  quantityInput.addEventListener("click", (event) => {
    handleQuantityQuadClick(event, node, line, quote);
  });
  quantityInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
    flashQuoteItemSaved(node);
  });
  quantityInput.addEventListener("input", (event) => {
    line.quantity = toNumber(event.target.value);
    saveState("已自动保存");
    const amountNode = node.querySelector(".amount");
    const profitNode = node.querySelector(".profit");
    if (amountNode) amountNode.textContent = formatMoney(toNumber(line.quantity) * calculateQuoteItemUnitPrice(line));
    if (profitNode) profitNode.textContent = formatMoney(toNumber(line.quantity) * (calculateQuoteItemUnitPrice(line) - calculateQuoteItemCostUnitPrice(line, quote.priceVersionId)));
    renderTotalsAndPreview();
  });
  node.querySelectorAll(".jump-price-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!line.priceItemName) return;
      openLaborItemEditor(line.priceItemName, quote.priceVersionId, {
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

function bindMaterialQuoteItem(node, quote, line) {
  const materialInput = node.querySelector(".line-material-main");
  const suggestions = node.querySelector(".suggestions");
  materialInput.addEventListener("input", () => {
    line.engineeringName = materialInput.value;
    line.materialId = "";
    saveState("已自动保存");
    renderMaterialSuggestions(suggestions, line, materialInput.value);
    renderTotalsAndPreview();
  });
  materialInput.addEventListener("focus", () => renderMaterialSuggestions(suggestions, line, materialInput.value));
  materialInput.addEventListener("blur", () => setTimeout(() => { suggestions.innerHTML = ""; }, 120));
  materialInput.addEventListener("keydown", (event) => handleMaterialSuggestionKeys(event, suggestions, line));
  bindQuoteItemPartInput(node, line);
  node.querySelector(".line-space").addEventListener("change", (event) => {
    moveQuoteItemToProjectGroup(line.id, event.target.value);
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
    flashQuoteItemSaved(node);
  });
  quantityInput.addEventListener("input", (event) => {
    line.quantity = toNumber(event.target.value);
    saveState("已自动保存");
    const amountNode = node.querySelector(".amount");
    const profitNode = node.querySelector(".profit");
    if (amountNode) amountNode.textContent = formatMoney(toNumber(line.quantity) * calculateQuoteItemUnitPrice(line));
    if (profitNode) profitNode.textContent = formatMoney(toNumber(line.quantity) * (calculateQuoteItemUnitPrice(line) - calculateQuoteItemCostUnitPrice(line, quote.priceVersionId)));
    renderTotalsAndPreview();
  });
  node.querySelectorAll(".jump-material-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!line.materialId) return;
      openMaterialEditor(line.materialId, {
        quoteId: quote.id,
        lineId: line.id
      });
    });
  });
  node.querySelector(".remove-btn").addEventListener("click", () => {
    quote.lines = quote.lines.filter((entry) => entry.id !== line.id);
    saveState("已删除项目");
    renderAll();
  });
}

function bindQuoteItemPartInput(node, line) {
  const partInput = node.querySelector(".line-part");
  partInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
    flashQuoteItemSaved(node);
  });
  partInput.addEventListener("input", (event) => {
    line.area = event.target.value;
    saveState("已自动保存");
    renderTotalsAndPreview();
  });
}

function handleQuantityQuadClick(event, node, line, quote) {
  if (event.detail !== 3) return;
  event.preventDefault();
  const recommendedQuantity = recommendedQuantityForQuoteItem(line, quote);
  if (recommendedQuantity === null) return;
  line.quantity = roundQuantity(recommendedQuantity);
  const quantityInput = node.querySelector(".line-qty");
  if (quantityInput) quantityInput.value = line.quantity;
  const amountNode = node.querySelector(".amount");
  const profitNode = node.querySelector(".profit");
  if (amountNode) amountNode.textContent = formatMoney(toNumber(line.quantity) * calculateQuoteItemUnitPrice(line));
  if (profitNode) profitNode.textContent = formatMoney(toNumber(line.quantity) * (calculateQuoteItemUnitPrice(line) - calculateQuoteItemCostUnitPrice(line, quote.priceVersionId)));
  saveState("已同步推荐工程量");
  renderTotalsAndPreview();
  flashQuoteItemSaved(node);
}

function bindProjectGroupEnterFeedback(input, spaceNode, selectOnFocus = false) {
  if (selectOnFocus) {
    input.addEventListener("focus", selectInputText);
    input.addEventListener("mouseup", (event) => {
      event.preventDefault();
      selectInputText(event);
    });
  }
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
    flashQuoteItemSaved(spaceNode);
  });
}

function sortedProjectGroups(quote = currentQuote()) {
  return (quote?.spaces || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function quoteItemsForProjectGroup(quote, spaceId) {
  return (quote.lines || []).filter((line) => line.spaceId === spaceId);
}

function sortQuoteItemsInProjectGroupByLibraryOrder(spaceId) {
  const quote = currentQuote();
  if (!quote || !spaceId) return;
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  const version = state.versions.find((item) => item.id === quote.priceVersionId) || currentVersion();
  const itemIndex = new Map((version?.items || []).map((item, index) => [item.name, index]));
  const scored = quote.lines.map((line, index) => {
    if (line.spaceId !== spaceId) return { line, index, keep: true };
    const item = findLaborItem(line.priceItemName, quote.priceVersionId);
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

// 工费条目输入的相似匹配：优先选择已有库条目，只有无前缀匹配时才允许新增。
function renderSuggestions(container, line, query) {
  const cleaned = normalizeName(query);
  const exactItem = cleaned ? findLaborItem(cleaned) : null;
  const matches = findSimilarItems(cleaned).slice(0, 5);
  const comparableItems = cleaned ? findComparableItems(cleaned, 5) : [];
  const hasPrefixMatch = cleaned ? currentLaborItems().some((item) => {
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
      <b>${formatMoney(calculateLaborItemUnitPrice(item))}</b>
    </button>
  `).join("");

  const createButton = canCreate ? `
    <button class="suggestion suggestion-create" type="button" data-create-name="${escapeHtml(cleaned)}">
      <span>
        <strong>新增“${escapeHtml(cleaned)}”</strong>
        <small>把当前输入保存到工费库，并继续使用这个名称</small>
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
  const item = findLaborItem(itemName);
  if (!item) return;
  line.sourceType = "labor";
  line.engineeringName = item.name;
  line.priceItemName = item.name;
  line.materialId = "";
  line.material = 0;
  line.auxiliary = item.auxiliary;
  line.wasteRate = item.wasteRate;
  line.labor = item.labor;
  line.legacyUnitPrice = null;
  const recommendedQuantity = recommendedQuantityForQuoteItem(line);
  if (recommendedQuantity !== null) line.quantity = roundQuantity(recommendedQuantity);
  saveState("已选择工费条目");
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
    createLaborItemFromQuoteItem(line, button.dataset.createName);
  }
}

function renderMaterialSuggestions(container, line, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }

  const matches = findSimilarMaterials(cleaned).slice(0, 6);
  if (!matches.length) {
    container.innerHTML = `
      <div class="suggestion-hint">没有找到匹配主材。可以先到主材库添加，再回到报价编辑选择。</div>
    `;
    container.dataset.activeIndex = "-1";
    return;
  }

  container.innerHTML = `
    <div class="suggestion-hint">找到相似主材，先选已有条目，避免重复。</div>
    ${matches.map((material) => `
      <button class="suggestion" type="button" data-material-id="${escapeHtml(material.id)}">
        <span>
          <strong>${escapeHtml(material.name)}</strong>
          <small>${escapeHtml(material.primaryCategory || "未分类")} · ${escapeHtml(material.unit || "项")}</small>
        </span>
        <b>${formatMoney(material.quoteUnitPrice)}</b>
      </button>
    `).join("")}
  `;

  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activateMaterialSuggestion(button, line);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function handleMaterialSuggestionKeys(event, container, line) {
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
  if (event.key === "Enter") activateMaterialSuggestion(buttons[index], line);
}

function activateMaterialSuggestion(button, line) {
  if (!button?.dataset.materialId) return;
  selectSuggestedMaterial(button.dataset.materialId, line);
}

function selectSuggestedMaterial(materialId, line) {
  const material = findMaterial(materialId);
  if (!material) return;
  line.sourceType = "material";
  line.materialId = material.id;
  line.materialCategory = material.primaryCategory || material.category || "";
  line.engineeringName = material.name;
  line.priceItemName = "";
  line.material = 0;
  line.auxiliary = 0;
  line.wasteRate = 0;
  line.labor = 0;
  line.legacyUnitPrice = null;
  saveState("已选择主材");
  renderLines();
  renderTotalsAndPreview();
}

function findSimilarMaterials(query, category = "") {
  const cleaned = normalizeName(query).toLowerCase();
  const source = category ? materialsForCategory(category) : state.materials;
  return source
    .map((material) => ({ material, score: scoreMaterial(material, cleaned) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.material.name.length - b.material.name.length)
    .map((entry) => entry.material);
}

function scoreMaterial(material, query) {
  const name = String(material.name || "").toLowerCase();
  const category = String(material.primaryCategory || material.category || "").toLowerCase();
  const spec = String(material.spec || "").toLowerCase();
  const brand = String(material.brand || "").toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (name.includes(query)) return 80 - Math.min(name.length - query.length, 30);
  const tokens = query.split(/[\s/，,、]+/).filter(Boolean);
  let score = 0;
  tokens.forEach((token) => {
    if (name.includes(token)) score += 22;
    if (category.includes(token)) score += 10;
    if (spec.includes(token)) score += 8;
    if (brand.includes(token)) score += 6;
  });
  for (const char of query) {
    if (char.trim() && name.includes(char)) score += 1;
  }
  return score;
}

// 从报价编辑跳转到工费库/主材库时记录返回位置，收起编辑区后可回到原条目。
function openLaborItemEditor(itemName, versionId, returnContext = null) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  if (!version) return;
  const existing = version.items.find((entry) => entry.name === itemName);
  state.activeVersionId = version.id;
  state.pendingLaborItemName = existing ? existing.name : itemName;
  state.expandedLaborItemName = existing ? existing.name : "";
  state.returnToQuoteId = returnContext?.quoteId || "";
  state.returnToLineId = returnContext?.lineId || "";
  if (els.priceSearch) els.priceSearch.value = "";
  switchPage("prices");
  renderAll();
}

function openMaterialEditor(materialId, returnContext = null) {
  const material = findMaterial(materialId);
  if (!material) return;
  state.pendingMaterialId = material.id;
  state.returnToQuoteId = returnContext?.quoteId || "";
  state.returnToLineId = returnContext?.lineId || "";
  if (els.materialSearch) els.materialSearch.value = "";
  switchPage("materials");
  renderAll();
}

function returnContextForItem(item) {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  if (!quote || !line || line.priceItemName !== item.name) return null;
  return { quote, line };
}

function returnContextForMaterial(material) {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  if (!quote || !line || line.materialId !== material.id) return null;
  return { quote, line };
}

function returnMaterialFromContext() {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  return line?.materialId ? findMaterial(line.materialId) : null;
}

function returnToQuoteItem() {
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
  return currentLaborItems()
    .map((item) => ({ item, score: scoreItem(item, cleaned) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .map((entry) => entry.item);
}

function findComparableItems(query, limit = 5) {
  const cleaned = normalizeName(query).toLowerCase();
  if (!cleaned) return [];
  const ranked = currentLaborItems()
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

function createLaborItemFromQuoteItem(line, rawName) {
  const version = currentVersion();
  if (!version) return;
  const name = normalizeName(rawName || line.engineeringName);
  if (!name) {
    alert("请先输入工程项目名称，再新增工费条目。");
    return;
  }

  const existing = version.items.find((item) => normalizeName(item.name) === name);
  if (existing) {
    alert(`工费库里已经有“${existing.name}”了，请直接从相似项里选择。`);
    return;
  }

  const comparable = findComparableItems(name, 5);
  const template = comparable[0];
  const parsedInputName = parsePriceNameUnit(name);
  const itemUnit = parsedInputName?.unit || template?.unit || "项";
  const itemName = parsedInputName ? name : `${name}/${itemUnit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    alert(`工费库里已经有“${existingWithUnit.name}”了，请直接从相似项里选择。`);
    return;
  }
  const similarText = comparable.length ? comparable.map((item) => item.name).join("、") : "暂无相似条目";
  if (!confirm(`要把“${itemName}”新增到当前工费库吗？\n\n相似条目：${similarText}`)) return;

  const newItem = {
    id: makeId("labor"),
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
    quantityFormula: template?.quantityFormula || DEFAULT_QUANTITY_FORMULA,
    usesMaterial: Boolean(template?.usesMaterial),
    materialCategory: template?.materialCategory || "",
    defaultMaterialId: defaultMaterialIdForItem(template)
  };

  version.items.push(newItem);
  selectSuggestedItem(newItem.name, line);
  saveState("已新增工费条目");
  renderAll();
}

// 工费库页面：维护清工辅料的分类、辅料、单价、成本和推荐工程量公式。
function renderLaborLibrary() {
  renderCategoryLibrary();
  const keyword = els.priceSearch.value.trim().toLowerCase();
  const items = currentLaborItems().filter((item) => {
    return !keyword || [item.name, categoryNameForItem(item), item.description].join(" ").toLowerCase().includes(keyword);
  });
  els.priceCount.textContent = `${items.length} 条工费条目`;
  const categoryOptions = [
    `<option value="">未分类</option>`,
    ...currentCategories().map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
  ].join("");
  const rows = items.map((item) => {
    const unitPrice = calculateLaborItemUnitPrice(item);
    const costUnitPrice = calculateLaborItemCostUnitPrice(item);
    const isExpanded = state.expandedLaborItemName === item.name;
    return `
      <tr class="price-row ${state.pendingLaborItemName === item.name ? "selected" : ""}" data-item-name="${escapeHtml(item.name)}" data-category-id="${escapeHtml(item.categoryId || "")}" draggable="true">
        <td><input class="price-name-input" type="text" aria-label="工费条目名称" value="${escapeHtml(item.name)}"></td>
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
              <h3>报价构成</h3>
              <label>辅料<input class="price-auxiliary" type="number" min="0" step="0.01" aria-label="辅料" value="${item.auxiliary}"></label>
              <label>单价<input class="price-labor" type="number" min="0" step="0.01" aria-label="单价" value="${item.labor}"></label>
              <strong class="price-detail-total">单价合计 ${formatMoney(unitPrice)}</strong>
            </section>
            <section class="price-detail-section">
              <h3>成本单价</h3>
              <label>成本辅料<input class="price-cost-auxiliary" type="number" min="0" step="0.01" aria-label="成本辅料" value="${item.costAuxiliary}"></label>
              <label>成本单价<input class="price-cost-labor" type="number" min="0" step="0.01" aria-label="成本单价" value="${item.costLabor}"></label>
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
          <th>工费条目名称</th>
          <th>分类</th>
          <th>单位</th>
          <th>单价合计</th>
          <th>成本单价</th>
          <th>删除</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  els.priceList.querySelectorAll(".price-row").forEach((node) => {
    let item = findLaborItem(node.dataset.itemName);
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
          syncQuoteItemLaborItemName(oldName, item.name);
          if (state.expandedLaborItemName === oldName) state.expandedLaborItemName = item.name;
        } else {
          item[key] = event.target.value;
        }
        saveState("已更新工费库");
        renderLines();
        renderTotalsAndPreview();
      });
    };
    bindText("price-name-input", "name");
    node.querySelector(".price-name-input").addEventListener("blur", (event) => {
      if (parsePriceNameUnit(event.target.value)) return;
      alert("工费条目名称必须包含斜杠单位，例如：水电开槽/平米");
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
      saveState("已更新工费库");
      renderLaborLibrary();
    });
    node.querySelectorAll(".price-expand").forEach((button) => {
      button.addEventListener("click", () => toggleLaborItemDetails(item.name));
    });
    node.querySelector(".price-delete").addEventListener("click", () => {
      deleteLaborItem(item.name);
    });
  });

  els.priceList.querySelectorAll(".price-detail-row").forEach((node) => {
    const item = findLaborItem(node.dataset.detailFor);
    if (!item) return;
    bindLaborDetailInputs(node, item);
  });
  if (state.pendingLaborItemName) {
    const targetRow = els.priceList.querySelector(`.price-row[data-item-name="${cssEscape(state.pendingLaborItemName)}"]`);
    if (targetRow) {
      targetRow.classList.add("selected");
      targetRow.scrollIntoView({ block: "center" });
      const focusTarget = targetRow.querySelector(".price-name-input");
      if (focusTarget) focusTarget.focus();
      state.pendingLaborItemName = "";
    }
  }
  bindLaborItemDragAndDrop(items);
}

function addMaterial() {
  const name = uniqueMaterialName("新主材");
  state.materials.unshift(normalizeMaterial({ name, primaryCategory: "砖", unit: "块", sortOrder: -1 }, -1));
  state.materials.forEach((material, index) => {
    material.sortOrder = index;
  });
  saveState("已新增主材");
  renderMaterials();
  const firstName = els.materialList?.querySelector(".material-name-input");
  if (firstName) {
    firstName.focus();
    firstName.select();
  }
}

function uniqueMaterialName(baseName) {
  const names = new Set(state.materials.map((material) => normalizeName(material.name)));
  if (!names.has(normalizeName(baseName))) return baseName;
  let index = 2;
  while (names.has(normalizeName(`${baseName}${index}`))) index += 1;
  return `${baseName}${index}`;
}

// 主材库页面：主材价格独立维护，报价编辑里的主材条目只引用这里的名称和单价。
function renderMaterials() {
  if (!els.materialList) return;
  const keyword = (els.materialSearch?.value || "").trim().toLowerCase();
  const materials = state.materials
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((material) => {
      const haystack = [
        material.name,
        material.primaryCategory,
        material.spec,
        material.unit,
        material.costUnitPrice,
        material.quoteUnitPrice,
        material.brand,
        material.supplier,
        material.pricingFormula,
        material.note
      ].join(" ").toLowerCase();
      return !keyword || haystack.includes(keyword);
    });

  if (els.materialCount) els.materialCount.textContent = `${materials.length} 条主材`;
  const rows = materials.map((material) => `
    <tr class="material-row ${state.pendingMaterialId === material.id ? "selected" : ""}" data-material-id="${escapeHtml(material.id)}">
      <td><input class="material-name-input" type="text" aria-label="主材名称" value="${escapeHtml(material.name)}"></td>
      <td><select class="material-primary-input" aria-label="一级类目">${materialPrimaryCategoryOptions(material.primaryCategory)}</select></td>
      <td><input class="material-spec-input" type="text" aria-label="规格型号" value="${escapeHtml(material.spec)}"></td>
      <td><input class="material-unit-input" type="text" aria-label="单位" value="${escapeHtml(material.unit)}"></td>
      <td><input class="material-cost-input" type="number" min="0" step="0.01" aria-label="成本单价" value="${material.costUnitPrice}"></td>
      <td><input class="material-price-input" type="number" min="0" step="0.01" aria-label="单价" value="${material.quoteUnitPrice}"></td>
      <td><input class="material-brand-input" type="text" aria-label="品牌" value="${escapeHtml(material.brand)}"></td>
      <td><input class="material-formula-input" type="text" aria-label="公式预留" placeholder="后续公式" value="${escapeHtml(material.pricingFormula)}"></td>
      <td><input class="material-note-input" type="text" aria-label="备注" value="${escapeHtml(material.note)}"></td>
      <td class="price-actions-cell"><button class="material-delete danger small" type="button">删除</button></td>
    </tr>
  `).join("");

  const returnMaterial = returnMaterialFromContext();
  const canReturn = returnMaterial && returnContextForMaterial(returnMaterial);
  const returnBar = canReturn ? `
    <div class="library-return-bar">
      <span>正在编辑报价中调用的主材：${escapeHtml(returnMaterial.name)}</span>
      <button class="return-quote-line small" type="button">返回报价编辑</button>
    </div>
  ` : "";

  els.materialList.innerHTML = `
    ${returnBar}
    <table class="price-table material-table">
      <thead>
        <tr>
          <th>主材名称</th>
          <th>类目</th>
          <th>规格/型号</th>
          <th>单位</th>
          <th>成本单价</th>
          <th>单价</th>
          <th>品牌</th>
          <th>公式</th>
          <th>备注</th>
          <th>删除</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const returnButton = els.materialList.querySelector(".return-quote-line");
  if (returnButton) returnButton.addEventListener("click", returnToQuoteItem);

  els.materialList.querySelectorAll(".material-row").forEach((row) => {
    const material = state.materials.find((item) => item.id === row.dataset.materialId);
    if (!material) return;
    [
      ["material-name-input", "name"],
      ["material-spec-input", "spec"],
      ["material-unit-input", "unit"],
      ["material-brand-input", "brand"],
      ["material-formula-input", "pricingFormula"],
      ["material-note-input", "note"]
    ].forEach(([className, key]) => {
      const input = row.querySelector(`.${className}`);
      input.addEventListener("input", (event) => {
        material[key] = event.target.value;
        if (key === "name") syncQuoteItemMaterialName(material.id, material.name);
        saveState("已更新主材库");
        if (key === "unit") {
          renderLaborLibrary();
          renderLines();
          renderTotalsAndPreview();
        }
      });
    });
    row.querySelector(".material-primary-input").addEventListener("change", (event) => {
      material.primaryCategory = event.target.value;
      material.category = event.target.value;
      saveState("已更新主材库");
      renderLaborLibrary();
      renderLines();
    });
    row.querySelector(".material-cost-input").addEventListener("input", (event) => {
      material.costUnitPrice = toNumber(event.target.value);
      saveState("已更新主材库");
      renderLines();
      renderTotalsAndPreview();
    });
    row.querySelector(".material-price-input").addEventListener("input", (event) => {
      material.quoteUnitPrice = toNumber(event.target.value);
      material.unitPrice = material.quoteUnitPrice;
      saveState("已更新主材库");
      renderLines();
      renderTotalsAndPreview();
    });
    row.querySelector(".material-delete").addEventListener("click", () => deleteMaterial(material));
  });
  if (state.pendingMaterialId) {
    const targetRow = els.materialList.querySelector(`.material-row[data-material-id="${cssEscape(state.pendingMaterialId)}"]`);
    if (targetRow) {
      targetRow.classList.add("selected");
      targetRow.scrollIntoView({ block: "center" });
      const focusTarget = targetRow.querySelector(".material-name-input");
      if (focusTarget) focusTarget.focus();
      state.pendingMaterialId = "";
    }
  }
}

function deleteMaterial(material) {
  const name = String(material.name || "").trim();
  if (!name) {
    alert("请先填写主材名称，再删除。");
    return;
  }
  const typed = prompt(`删除主材需要输入完整名称：${name}`);
  if (typed !== name) {
    if (typed !== null) alert("名称不一致，已取消删除。");
    return;
  }
  state.materials = state.materials.filter((item) => item.id !== material.id);
  state.materials.forEach((item, index) => {
    item.sortOrder = index;
  });
  saveState("已删除主材");
  renderMaterials();
}

function addTemplate() {
  const nameInput = prompt("模板名称，例如：卫生间、厨房", "");
  if (nameInput === null) return;
  const name = String(nameInput || "").trim();
  if (!name) return;
  if (state.templates.some((template) => normalizeName(template.name) === normalizeName(name))) {
    alert(`已经有“${name}”这个模板了。`);
    return;
  }
  state.templates.unshift(normalizeTemplate({
    id: makeId("template"),
    name,
    iconKey: defaultTemplateIconKey(name),
    sortOrder: -1,
    items: []
  }, -1));
  state.templates.forEach((template, index) => { template.sortOrder = index; });
  saveState("已添加模板");
  renderTemplates();
}

function deleteTemplate(template) {
  const input = prompt(`删除模板需要输入完整名称：${template.name}`, "");
  if (input === null) return;
  if (String(input).trim() !== template.name) {
    alert("名称不一致，已取消删除。");
    return;
  }
  state.templates = state.templates.filter((item) => item.id !== template.id);
  state.templates.forEach((item, index) => { item.sortOrder = index; });
  saveState("已删除模板");
  renderTemplates();
}

function duplicateTemplate(template) {
  if (!template) return;
  const sortedTemplates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const sourceIndex = sortedTemplates.findIndex((entry) => entry.id === template.id);
  const nextName = uniqueTemplateCopyName(template.name);
  const copiedTemplate = normalizeTemplate({
    id: makeId("template"),
    name: nextName,
    iconKey: template.iconKey,
    collapsed: false,
    items: (template.items || []).map((item, index) => ({
      ...item,
      id: makeId("template-item"),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index
    }))
  }, sourceIndex + 1);
  state.templates.forEach((entry) => { entry.collapsed = true; });
  const insertIndex = sourceIndex < 0 ? sortedTemplates.length : sourceIndex + 1;
  sortedTemplates.splice(insertIndex, 0, copiedTemplate);
  sortedTemplates.forEach((entry, index) => { entry.sortOrder = index; });
  state.templates = sortedTemplates;
  saveState("已复制模板");
  renderTemplates();
}

function uniqueTemplateCopyName(name) {
  const baseName = `${String(name || "模板").trim() || "模板"} 副本`;
  const existing = new Set((state.templates || []).map((template) => normalizeName(template.name)));
  if (!existing.has(normalizeName(baseName))) return baseName;
  let index = 2;
  while (existing.has(normalizeName(`${baseName} ${index}`))) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

function addTemplateItem(template, sourceType = "labor") {
  const item = normalizeTemplateItem({
    id: makeId("template-item"),
    sourceType,
    sortOrder: template.items.length
  }, template.items.length);
  if (sourceType === "labor") {
    item.itemName = "";
  } else {
    item.materialCategory = MATERIAL_PRIMARY_CATEGORIES[0];
    item.materialId = "";
  }
  template.items.push(item);
  saveState(sourceType === "material" ? "已添加主材模板项" : "已添加工费模板项");
  renderTemplates();
}

function deleteTemplateItem(template, itemId) {
  template.items = template.items.filter((item) => item.id !== itemId);
  template.items.forEach((item, index) => { item.sortOrder = index; });
  saveState("已删除模板项");
  renderTemplates();
}

function templateMaterialCategoryOptions(value = "") {
  return materialCategoryOptions(value || MATERIAL_PRIMARY_CATEGORIES[0], false);
}

function templateMaterialOptions(category = "", selectedId = "") {
  const materials = materialsForCategory(category);
  const list = materials.length ? materials : state.materials;
  return [`<option value="">选择主材</option>`].concat(list.map((material) => (
    `<option value="${escapeHtml(material.id)}" ${material.id === selectedId ? "selected" : ""}>${escapeHtml(material.name)}</option>`
  ))).join("");
}

function templateLaborOptions(selectedName = "") {
  return [`<option value="">选择工费条目</option>`].concat(currentLaborItems().map((item) => (
    `<option value="${escapeHtml(item.name)}" ${item.name === selectedName ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  ))).join("");
}

// 模板项排序与报价编辑保持一致：清工辅料按分类/工费库顺序，装修主材按主材类目/主材库顺序。
function sortedTemplateItems(template) {
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  const laborIndex = new Map(currentLaborItems().map((item, index) => [item.name, index]));
  const materialIndex = new Map((state.materials || []).map((material, index) => [material.id, index]));
  const materialCategoryIndex = new Map(MATERIAL_PRIMARY_CATEGORIES.map((category, index) => [category, index]));
  return (template?.items || []).slice().sort((a, b) => {
    const leftType = a.sourceType === "material" ? 1 : 0;
    const rightType = b.sourceType === "material" ? 1 : 0;
    if (leftType !== rightType) return leftType - rightType;
    if (leftType === 1) {
      const leftMaterial = findMaterial(a.materialId);
      const rightMaterial = findMaterial(b.materialId);
      const leftCategory = materialCategoryIndex.get(leftMaterial?.primaryCategory || a.materialCategory || "") ?? Number.MAX_SAFE_INTEGER;
      const rightCategory = materialCategoryIndex.get(rightMaterial?.primaryCategory || b.materialCategory || "") ?? Number.MAX_SAFE_INTEGER;
      if (leftCategory !== rightCategory) return leftCategory - rightCategory;
      const leftRank = materialIndex.get(a.materialId) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = materialIndex.get(b.materialId) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return toNumber(a.sortOrder) - toNumber(b.sortOrder);
    }
    const leftItem = findLaborItem(a.itemName);
    const rightItem = findLaborItem(b.itemName);
    const leftCategory = leftItem ? (categoryIndex.get(leftItem.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const rightCategory = rightItem ? (categoryIndex.get(rightItem.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    if (leftCategory !== rightCategory) return leftCategory - rightCategory;
    const leftRank = leftItem ? (laborIndex.get(leftItem.name) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const rightRank = rightItem ? (laborIndex.get(rightItem.name) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return toNumber(a.sortOrder) - toNumber(b.sortOrder);
  });
}

// 模板库页面：模板本身可拖动排序，模板内条目的展示顺序由 sortedTemplateItems 决定。
function renderTemplates() {
  if (!els.templateList) return;
  const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (els.templateCount) els.templateCount.textContent = `${templates.length} 个模板`;
  els.templateList.innerHTML = templates.map((template) => `
    <section class="template-card ${template.collapsed ? "collapsed" : ""}" data-template-id="${escapeHtml(template.id)}" draggable="true">
      <div class="template-head">
        <button class="template-drag" type="button" title="拖动排序" aria-label="拖动排序">↕</button>
        <div class="space-icon-wrap">
          <button class="space-icon-btn template-icon-btn" type="button" aria-label="选择模板图标" title="选择图标">${renderProjectGroupIcon(template.iconKey)}</button>
          <div class="space-icon-picker" hidden>
            ${renderProjectGroupIconChoices(template.iconKey)}
          </div>
        </div>
        <input class="template-name-input" type="text" aria-label="模板名称" value="${escapeHtml(template.name)}">
        <span class="template-count">${template.items.length}</span>
        <button class="add-template-labor small ghost" type="button">添加工费</button>
        <button class="add-template-material small ghost" type="button">添加主材</button>
        <button class="duplicate-template small ghost" type="button">复制模板</button>
        <button class="delete-template small danger" type="button">删除模板</button>
      </div>
      ${template.collapsed ? "" : `
      <div class="template-items">
        ${template.items.length ? `
          <table class="template-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>条目</th>
                <th>类目</th>
                <th>部位</th>
                <th>默认工程量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${sortedTemplateItems(template).map((item) => `
                <tr data-template-item-id="${escapeHtml(item.id)}">
                  <td>
                    <select class="template-source">
                      <option value="labor" ${item.sourceType === "labor" ? "selected" : ""}>工费</option>
                      <option value="material" ${item.sourceType === "material" ? "selected" : ""}>主材</option>
                    </select>
                  </td>
                  <td>
                    ${item.sourceType === "material" ? `
                      <div class="template-picker">
                        <input class="template-material-input" type="text" aria-label="主材条目" placeholder="输入主材名称，选择相似主材" value="${escapeHtml(findMaterial(item.materialId)?.name || "")}" autocomplete="off">
                        <div class="suggestions"></div>
                      </div>
                    ` : `
                      <div class="template-picker">
                        <input class="template-labor-input" type="text" aria-label="工费条目" placeholder="输入工费名称，选择相似工费" value="${escapeHtml(item.itemName || "")}" autocomplete="off">
                        <div class="suggestions"></div>
                      </div>
                    `}
                  </td>
                  <td>
                    ${item.sourceType === "material" ? `
                      <select class="template-material-category">${templateMaterialCategoryOptions(item.materialCategory)}</select>
                    ` : `
                      <span class="muted-cell">${escapeHtml(findLaborItem(item.itemName)?.category || "")}</span>
                    `}
                  </td>
                  <td><input class="template-area" type="text" value="${escapeHtml(item.area)}" placeholder="可空"></td>
                  <td><input class="template-quantity" type="number" min="0" step="0.01" value="${item.quantity || ""}" placeholder="自动推荐"></td>
                  <td><button class="delete-template-item small danger" type="button">删除</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<div class="template-empty">还没有模板项，可以从工费库或主材库添加。</div>`}
      </div>
      `}
    </section>
  `).join("");

  els.templateList.querySelectorAll(".template-card").forEach((card) => {
    const template = state.templates.find((item) => item.id === card.dataset.templateId);
    if (!template) return;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", template.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      els.templateList.querySelectorAll(".template-card").forEach((node) => node.classList.remove("drag-over"));
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (draggedId && draggedId !== template.id) card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      card.classList.remove("drag-over");
      reorderTemplate(draggedId, template.id);
    });
    card.querySelector(".template-head").addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, .space-icon-picker")) return;
      const willOpen = template.collapsed;
      state.templates.forEach((entry) => { entry.collapsed = true; });
      template.collapsed = !willOpen;
      saveState(template.collapsed ? "已收起模板" : "已展开模板");
      renderTemplates();
    });
    const iconButton = card.querySelector(".template-icon-btn");
    const iconPicker = card.querySelector(".space-icon-picker");
    iconButton.addEventListener("click", (event) => {
      event.stopPropagation();
      els.templateList.querySelectorAll(".space-icon-picker").forEach((picker) => {
        if (picker !== iconPicker) picker.hidden = true;
      });
      iconPicker.hidden = !iconPicker.hidden;
    });
    iconPicker.querySelectorAll(".space-icon-choice").forEach((button) => {
      button.addEventListener("click", () => {
        template.iconKey = button.dataset.iconKey;
        saveState("已更新模板图标");
        renderTemplates();
      });
    });
    card.querySelector(".template-name-input").addEventListener("input", (event) => {
      template.name = event.target.value;
      saveState("已更新模板名称");
    });
    card.querySelector(".add-template-labor").addEventListener("click", () => {
      state.templates.forEach((entry) => { entry.collapsed = entry.id !== template.id; });
      template.collapsed = false;
      addTemplateItem(template, "labor");
    });
    card.querySelector(".add-template-material").addEventListener("click", () => {
      state.templates.forEach((entry) => { entry.collapsed = entry.id !== template.id; });
      template.collapsed = false;
      addTemplateItem(template, "material");
    });
    card.querySelector(".duplicate-template").addEventListener("click", () => duplicateTemplate(template));
    card.querySelector(".delete-template").addEventListener("click", () => deleteTemplate(template));
    card.querySelectorAll("tr[data-template-item-id]").forEach((row) => {
      const item = template.items.find((entry) => entry.id === row.dataset.templateItemId);
      if (!item) return;
      row.querySelector(".template-source").addEventListener("change", (event) => {
        item.sourceType = event.target.value === "material" ? "material" : "labor";
        if (item.sourceType === "material") {
          item.materialCategory = item.materialCategory || MATERIAL_PRIMARY_CATEGORIES[0];
          item.materialId = item.materialId || materialsForCategory(item.materialCategory)[0]?.id || "";
          item.itemName = "";
        } else {
          item.itemName = item.itemName || currentLaborItems()[0]?.name || "";
          item.materialId = "";
        }
        saveState("已切换模板项来源");
        renderTemplates();
      });
      const laborInput = row.querySelector(".template-labor-input");
      if (laborInput) {
        const suggestions = row.querySelector(".suggestions");
        laborInput.addEventListener("input", () => {
          item.itemName = laborInput.value;
          saveState("已更新模板工费项");
          renderTemplateLaborSuggestions(suggestions, item, laborInput.value);
        });
        laborInput.addEventListener("focus", () => renderTemplateLaborSuggestions(suggestions, item, laborInput.value));
        laborInput.addEventListener("blur", () => setTimeout(() => { suggestions.innerHTML = ""; }, 120));
        laborInput.addEventListener("keydown", (event) => handleTemplateLaborSuggestionKeys(event, suggestions, item));
      }
      const categorySelect = row.querySelector(".template-material-category");
      if (categorySelect) {
        categorySelect.addEventListener("change", (event) => {
          item.materialCategory = event.target.value;
          item.materialId = materialsForCategory(item.materialCategory)[0]?.id || "";
          saveState("已更新模板主材类目");
          renderTemplates();
        });
      }
      const materialInput = row.querySelector(".template-material-input");
      if (materialInput) {
        const suggestions = row.querySelector(".suggestions");
        materialInput.addEventListener("input", () => {
          item.materialId = "";
          saveState("已更新模板主材");
          renderTemplateMaterialSuggestions(suggestions, item, materialInput.value);
        });
        materialInput.addEventListener("focus", () => renderTemplateMaterialSuggestions(suggestions, item, materialInput.value));
        materialInput.addEventListener("blur", () => setTimeout(() => { suggestions.innerHTML = ""; }, 120));
        materialInput.addEventListener("keydown", (event) => handleTemplateMaterialSuggestionKeys(event, suggestions, item));
      }
      row.querySelector(".template-area").addEventListener("input", (event) => {
        item.area = event.target.value;
        saveState("已更新模板部位");
      });
      row.querySelector(".template-quantity").addEventListener("input", (event) => {
        item.quantity = toNumber(event.target.value);
        saveState("已更新模板工程量");
      });
      row.querySelector(".delete-template-item").addEventListener("click", () => deleteTemplateItem(template, item.id));
    });
  });
}

function reorderTemplate(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const draggedIndex = templates.findIndex((template) => template.id === draggedId);
  const targetIndex = templates.findIndex((template) => template.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = templates.splice(draggedIndex, 1);
  templates.splice(targetIndex, 0, dragged);
  templates.forEach((template, index) => { template.sortOrder = index; });
  state.templates = templates;
  saveState("已调整模板顺序");
  renderTemplates();
}

function renderTemplateLaborSuggestions(container, templateItem, query) {
  const cleaned = normalizeName(query);
  const comparableItems = cleaned ? findComparableItems(cleaned, 6) : [];
  const exactItem = currentLaborItems().find((item) => normalizeName(item.name) === cleaned);
  const hasPrefixMatch = cleaned ? currentLaborItems().some((item) => {
    const itemName = normalizeName(item.name).toLowerCase();
    return itemName !== cleaned.toLowerCase() && itemName.startsWith(cleaned.toLowerCase());
  }) : false;
  const canCreate = Boolean(cleaned) && !exactItem && !hasPrefixMatch;

  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }

  if (!comparableItems.length && !canCreate) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }

  const hint = exactItem
    ? `已找到匹配项：${exactItem.name}`
    : comparableItems.length
      ? "找到相似工费项，先选已有条目，避免重复。"
      : "没有找到完全匹配项，可以新增到工费库。";
  const createButton = canCreate ? `
    <button class="suggestion suggestion-create" type="button" data-create-name="${escapeHtml(cleaned)}">
      <span>
        <strong>新增“${escapeHtml(cleaned)}”</strong>
        <small>保存到当前工费库，并作为模板项</small>
      </span>
      <b>+</b>
    </button>
  ` : "";

  container.innerHTML = `
    <div class="suggestion-hint">${escapeHtml(hint)}</div>
    ${createButton}
    ${comparableItems.map((item) => `
      <button class="suggestion" type="button" data-item-name="${escapeHtml(item.name)}">
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "项")}</small>
        </span>
        <b>${formatMoney(calculateLaborItemUnitPrice(item))}</b>
      </button>
    `).join("")}
  `;
  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activateTemplateLaborSuggestion(button, templateItem);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function handleTemplateLaborSuggestionKeys(event, container, templateItem) {
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
  if (event.key === "Enter") activateTemplateLaborSuggestion(buttons[index], templateItem);
}

function activateTemplateLaborSuggestion(button, templateItem) {
  if (!button) return;
  if (button.dataset.itemName) {
    templateItem.itemName = button.dataset.itemName;
    saveState("已选择模板工费项");
    renderTemplates();
    return;
  }
  if (button.dataset.createName) createLaborItemFromTemplate(templateItem, button.dataset.createName);
}

function createLaborItemFromTemplate(templateItem, rawName) {
  const version = currentVersion();
  if (!version) return;
  const name = normalizeName(rawName || templateItem.itemName);
  if (!name) {
    alert("请先输入工费名称。");
    return;
  }
  const existing = version.items.find((item) => normalizeName(item.name) === name);
  if (existing) {
    templateItem.itemName = existing.name;
    saveState("已选择模板工费项");
    renderTemplates();
    return;
  }
  const comparable = findComparableItems(name, 5);
  const source = comparable[0];
  const parsedName = parsePriceNameUnit(name);
  const unit = parsedName?.unit || source?.unit || "项";
  const itemName = parsedName ? name : `${name}/${unit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    templateItem.itemName = existingWithUnit.name;
    saveState("已选择模板工费项");
    renderTemplates();
    return;
  }
  const similarText = comparable.length ? comparable.map((item) => item.name).join("、") : "暂无相似条目";
  if (!confirm(`要把“${itemName}”新增到当前工费库吗？\n\n相似条目：${similarText}`)) return;
  const newItem = normalizeLaborItem({
    id: makeId("labor"),
    name: itemName,
    sortOrder: nextItemSortOrder(source?.categoryId || ""),
    unit,
    categoryId: source?.categoryId || "",
    category: source?.category || "",
    description: source?.description || "",
    auxiliary: source ? toNumber(source.auxiliary) : 0,
    labor: source ? toNumber(source.labor) : 0,
    costAuxiliary: source ? toNumber(source.costAuxiliary) : 0,
    costLabor: source ? toNumber(source.costLabor) : 0,
    quantityFormula: source?.quantityFormula || DEFAULT_QUANTITY_FORMULA
  }, version.items.length);
  version.items.push(newItem);
  templateItem.itemName = newItem.name;
  saveState("已新增模板工费项");
  renderAll();
}

function renderTemplateMaterialSuggestions(container, templateItem, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }
  const matches = findSimilarMaterials(cleaned, templateItem.materialCategory).slice(0, 6);
  if (!matches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配主材。可以先到主材库添加，再回到模板库选择。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">找到相似主材，先选已有条目，避免重复。</div>
    ${matches.map((material) => `
      <button class="suggestion" type="button" data-material-id="${escapeHtml(material.id)}">
        <span>
          <strong>${escapeHtml(material.name)}</strong>
          <small>${escapeHtml(material.primaryCategory || "未分类")} · ${escapeHtml(material.unit || "项")}</small>
        </span>
        <b>${formatMoney(material.quoteUnitPrice)}</b>
      </button>
    `).join("")}
  `;
  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activateTemplateMaterialSuggestion(button, templateItem);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function handleTemplateMaterialSuggestionKeys(event, container, templateItem) {
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
  if (event.key === "Enter") activateTemplateMaterialSuggestion(buttons[index], templateItem);
}

function activateTemplateMaterialSuggestion(button, templateItem) {
  const material = findMaterial(button?.dataset.materialId);
  if (!material) return;
  templateItem.materialId = material.id;
  templateItem.materialCategory = material.primaryCategory || templateItem.materialCategory || "";
  saveState("已选择模板主材");
  renderTemplates();
}

function toggleLaborItemDetails(itemName) {
  const item = findLaborItem(itemName);
  if (state.expandedLaborItemName === itemName && item && returnContextForItem(item)) {
    returnToQuoteItem();
    return;
  }
  state.expandedLaborItemName = state.expandedLaborItemName === itemName ? "" : itemName;
  renderLaborLibrary();
}

function bindLaborDetailInputs(node, item) {
  const updateTotals = () => {
    item.unitPrice = calculateLaborItemUnitPrice(item);
    item.costUnitPrice = calculateLaborItemCostUnitPrice(item);
    const priceTotal = node.querySelector(".price-detail-total");
    const costTotal = node.querySelector(".price-detail-cost-total");
    if (priceTotal) priceTotal.textContent = `单价合计 ${formatMoney(item.unitPrice)}`;
    if (costTotal) costTotal.textContent = `成本单价 ${formatMoney(item.costUnitPrice)}`;
    const mainRow = els.priceList.querySelector(`.price-row[data-item-name="${cssEscape(item.name)}"]`);
    if (mainRow) {
      const totals = mainRow.querySelectorAll(".price-total b");
      if (totals[0]) totals[0].textContent = formatMoney(item.unitPrice);
      if (totals[1]) totals[1].textContent = formatMoney(item.costUnitPrice);
    }
  };

  [
    ["price-auxiliary", "auxiliary"],
    ["price-labor", "labor"],
    ["price-cost-auxiliary", "costAuxiliary"],
    ["price-cost-labor", "costLabor"]
  ].forEach(([className, key, mode]) => {
    const input = node.querySelector(`.${className}`);
    if (!input) return;
    input.addEventListener("input", (event) => {
      item[key] = mode === "percent" ? parsePercentInput(event.target.value) : toNumber(event.target.value);
      updateTotals();
      saveState("已更新工费库");
      syncQuoteItemLaborParts(item);
      renderLines();
      renderTotalsAndPreview();
    });
  });

  const descriptionInput = node.querySelector(".price-description");
  if (descriptionInput) {
    descriptionInput.addEventListener("input", (event) => {
      item.description = event.target.value;
      saveState("已更新工费库");
      renderTotalsAndPreview();
    });
  }

  const formulaInput = node.querySelector(".price-quantity-formula");
  if (formulaInput) {
    formulaInput.addEventListener("input", (event) => {
      item.quantityFormula = event.target.value;
      saveState("已更新工费库");
      renderLines();
      renderTotalsAndPreview();
    });
  }

  const unitInput = node.querySelector(".price-unit-detail");
  if (unitInput) {
    unitInput.addEventListener("change", (event) => {
      if (!setLaborItemUnit(item, event.target.value)) {
        alert("单位不能为空，且修改后不能和已有工费条目重名。工费条目名称需要保持“名称/单位”的格式。");
        event.target.value = item.unit || parsePriceNameUnit(item.name)?.unit || "";
        return;
      }
      saveState("已更新工费库");
      renderLaborLibrary();
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
      renderLaborLibrary();
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
      renderLaborLibrary();
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
  renderLaborLibrary();
}

function createUniqueCategoryName() {
  let index = currentCategories().length + 1;
  while (currentCategories().some((category) => category.name === `新分类 ${index}`)) {
    index += 1;
  }
  return `新分类 ${index}`;
}

function addLaborItem() {
  const version = currentVersion();
  if (!version) return;
  const name = createUniqueLaborItemName();
  const newItem = {
    id: makeId("labor"),
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
    costUnitPrice: 0,
    quantityFormula: DEFAULT_QUANTITY_FORMULA,
    usesMaterial: false,
    materialCategory: "",
    defaultMaterialId: ""
  };
  version.items.push(newItem);
  state.pendingLaborItemName = newItem.name;
  saveState("新增工费条目");
  renderLaborLibrary();
}

function createUniqueLaborItemName() {
  const version = currentVersion();
  let index = version?.items?.length ? version.items.length + 1 : 1;
  while (version?.items?.some((item) => item.name === `新工费条目 ${index}/项`)) {
    index += 1;
  }
  return `新工费条目 ${index}/项`;
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
  renderLaborLibrary();
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
  renderLaborLibrary();
}

function bindLaborItemDragAndDrop(visibleItems) {
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
      moveLaborItemBefore(draggedItemName, targetItemName, draggedCategoryId, visibleItems);
      draggedItemName = "";
      draggedCategoryId = "";
    });
  });
}

function moveLaborItemBefore(draggedItemName, targetItemName, categoryId, visibleItems) {
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

  saveState("已调整工费条目顺序");
  renderLaborLibrary();
}

// 预览和打印共用的报价单渲染。showAmountColumns 为 false 时隐藏辅料/单价/金额列。
function renderTotalsAndPreview() {
  const quote = currentQuote();
  if (!quote) return;
  const totals = calculateTotals(quote);
  const showAmountColumns = quote.showAmountColumns !== false;
  renderPreviewTableHead(showAmountColumns);
  els.laborSubtotalText.textContent = formatMoney(totals.laborSubtotal);
  els.materialSubtotalText.textContent = formatMoney(totals.materialSubtotal);
  els.managementText.textContent = formatMoney(totals.management);
  els.designText.textContent = formatMoney(totals.design);
  els.taxText.textContent = formatMoney(totals.tax);
  els.grandTotalText.textContent = formatMoney(totals.grand);
  els.previewTitle.textContent = `${quote.projectName || "工程"}工程量`;
  els.previewMeta.textContent = `客户：${quote.clientName || "未填写"}　报价日期：${quote.quoteDate || ""}　工费版本：${currentVersion()?.name || ""}`;
  els.previewTotal.textContent = formatMoney(totals.grand);
  els.previewLaborSubtotal.textContent = formatMoney(totals.laborSubtotal);
  els.previewMaterialSubtotal.textContent = formatMoney(totals.materialSubtotal);
  els.previewManagement.textContent = formatMoney(totals.management);
  els.previewDesign.textContent = formatMoney(totals.design);
  els.previewTax.textContent = formatMoney(totals.tax);
  els.previewGrand.textContent = formatMoney(totals.grand);
  let rowIndex = 0;
  els.previewRows.innerHTML = sortedProjectGroups(quote).map((space) => {
    const spaceLines = quoteItemsForProjectGroup(quote, space.id);
    if (!spaceLines.length) return "";
    const meta = [
        `面积 ${formatNumber(space.area)} 平米`,
        `周长 ${formatNumber(space.perimeter)} 米`,
        `高度 ${formatNumber(space.height)} 米`
      ].join("　");
    return `
      <tr class="preview-space-row">
        <td></td>
        <td colspan="${showAmountColumns ? 6 : 3}"><strong>${escapeHtml(projectGroupDisplayName(space))}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</td>
      </tr>
      ${spaceLines.map((line) => {
    const item = findLaborItem(line.priceItemName, quote.priceVersionId);
    const selectedMaterial = findMaterial(line.materialId);
    const unitPrice = calculateQuoteItemUnitPrice(line);
    const displaySinglePrice = selectedMaterial ? materialUnitPriceForItem(selectedMaterial, item, "quote") : line.labor;
    const displayAuxiliary = selectedMaterial ? 0 : line.auxiliary;
    const amount = toNumber(line.quantity) * unitPrice;
    const processNote = processNoteForQuoteItem(line, quote.priceVersionId);
    const lineTypeLabel = isMaterialQuoteItem(line) ? "装修主材" : "清工辅料";
    rowIndex += 1;
    return `
      <tr class="preview-main-row">
        <td>${rowIndex}</td>
        <td>
          <span class="preview-type-label">${lineTypeLabel}</span>
          <strong>${escapeHtml(line.engineeringName || findMaterial(line.materialId)?.name || "")}</strong>
          ${line.area ? `<span class="preview-part-note">${escapeHtml(line.area)}</span>` : ""}
        </td>
        <td>${formatNumber(line.quantity)}</td>
        <td>${escapeHtml(item?.unit || findMaterial(line.materialId)?.unit || "")}</td>
        ${showAmountColumns ? `
        <td>${formatMoney(displayAuxiliary)}</td>
        <td>${formatMoney(displaySinglePrice)}</td>
        <td>${formatMoney(amount)}</td>
        ` : ""}
      </tr>
      ${processNote ? `
      <tr class="preview-note-row">
        <td></td>
        <td colspan="${showAmountColumns ? 6 : 3}"><span>工艺说明</span>${escapeHtml(processNote)}</td>
      </tr>
      ` : ""}
    `;
      }).join("")}
    `;
  }).join("");
}

// 根据“显示金额”开关重建表头，同时切换表格列宽样式。
function renderPreviewTableHead(showAmountColumns = true) {
  if (!els.previewTableHead) return;
  els.previewTableHead.closest("table")?.classList.toggle("amount-hidden", !showAmountColumns);
  els.previewTableHead.innerHTML = `
    <tr>
      <th>序号</th>
      <th>工程项目</th>
      <th>工程量</th>
      <th>单位</th>
      ${showAmountColumns ? `
      <th>辅料</th>
      <th>单价</th>
      <th>金额</th>
      ` : ""}
    </tr>
  `;
}

// 计算总价：明细金额始终参与合计，即使报价单隐藏金额列也不影响小计和总价。
function calculateTotals(quote = currentQuote()) {
  const spacesById = new Map((quote?.spaces || []).map((space) => [space.id, space]));
  const subtotals = (quote?.lines || []).reduce((sum, line) => {
    const amount = toNumber(line.quantity) * calculateQuoteItemUnitPrice(line);
    if (isMaterialQuoteItem(line)) sum.materialSubtotal += amount;
    else sum.laborSubtotal += amount;
    return sum;
  }, { laborSubtotal: 0, materialSubtotal: 0 });
  const subtotal = subtotals.laborSubtotal + subtotals.materialSubtotal;
  const management = subtotal * toNumber(quote?.managementRate) / 100;
  const design = subtotal * toNumber(quote?.designRate) / 100;
  const tax = subtotal * toNumber(quote?.taxRate) / 100;
  return {
    ...subtotals,
    subtotal,
    management,
    design,
    tax,
    grand: subtotal + management + design + tax
  };
}

function calculateQuoteItemUnitPrice(line) {
  const item = findLaborItem(line.priceItemName, currentQuote()?.priceVersionId);
  const material = line.materialId ? findMaterial(line.materialId) : null;
  if (!item && material) return toNumber(material.quoteUnitPrice);
  const splitPrice = toNumber(line.auxiliary) + toNumber(line.labor);
  if (splitPrice === 0 && line.legacyUnitPrice !== null && line.legacyUnitPrice !== undefined) {
    return toNumber(line.legacyUnitPrice);
  }
  return splitPrice;
}

function calculateQuoteItemCostUnitPrice(line, versionId = currentQuote()?.priceVersionId || currentVersion()?.id) {
  const item = findLaborItem(line.priceItemName, versionId);
  const material = line.materialId ? findMaterial(line.materialId) : null;
  if (!item) return material ? toNumber(material.costUnitPrice) : 0;
  if (!material) return calculateLaborItemCostUnitPrice(item);
  return materialUnitPriceForItem(material, item, "cost") + toNumber(item.costAuxiliary) + toNumber(item.costLabor);
}

function calculateLaborItemUnitPrice(item) {
  return toNumber(item?.auxiliary) + toNumber(item?.labor);
}

function calculateLaborItemCostUnitPrice(item) {
  return toNumber(item?.costAuxiliary) + toNumber(item?.costLabor);
}

function materialUnitPriceForItem(material, item, mode = "quote") {
  if (!material) return 0;
  const basePrice = mode === "cost" ? toNumber(material.costUnitPrice) : toNumber(material.quoteUnitPrice);
  const targetUnit = String(item?.unit || parsePriceNameUnit(item?.name)?.unit || "").trim();
  const baseUnit = String(material.unit || "").trim();
  const conversionUnit = String(material.conversionUnit || "").trim();
  if (!targetUnit || !baseUnit || targetUnit === baseUnit) return basePrice;
  if (conversionUnit && targetUnit === conversionUnit) {
    const quantity = toNumber(material.conversionQuantity);
    return basePrice * (quantity || 1);
  }
  return basePrice;
}

function recommendedQuantityForQuoteItem(line, quote = currentQuote()) {
  const item = findLaborItem(line.priceItemName, quote?.priceVersionId);
  if (!item?.quantityFormula) return null;
  const space = (quote?.spaces || []).find((entry) => entry.id === line.spaceId);
  const context = {
    s: toNumber(space?.area),
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

function applicableTemplates(workType) {
  return (state.templates || [])
    .filter((template) => template.items.some((item) => item.sourceType === workType))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function chooseTemplateForSpace(workType) {
  const options = applicableTemplates(workType);
  if (!options.length) return null;
  const typeName = workType === "material" ? "主材" : "清工辅料";
  const lines = options.map((template, index) => {
    const count = template.items.filter((item) => item.sourceType === workType).length;
    return `${index + 1}. ${template.name}（${count}）`;
  }).join("\n");
  const input = prompt(`套用${typeName}模板（可空，输入序号或模板名）：\n\n${lines}`, "");
  if (input === null) return null;
  const cleaned = String(input || "").trim();
  if (!cleaned) return null;
  const byNumber = options[Number(cleaned) - 1];
  if (byNumber) return byNumber;
  return options.find((template) => normalizeName(template.name) === normalizeName(cleaned)) || null;
}

// 项目组合新增时可套用模板；后续同步模板只增量导入缺少的条目。
function applyTemplateToSpace(template, space) {
  const quote = currentQuote();
  if (!quote || !template || !space) return 0;
  const matchingItems = sortedTemplateItems(template);
  if (!matchingItems.length) return 0;
  if (template.iconKey && (!space.iconKey || space.iconKey === defaultProjectGroupIconKey(space))) {
    space.iconKey = template.iconKey;
  }
  const newLines = matchingItems.map((templateItem) => makeQuoteItemFromTemplateItem(templateItem, space, quote)).filter(Boolean);
  quote.lines.push(...newLines);
  return newLines.length;
}

// 同步模板不删除、不覆盖已有条目，避免改动用户已填写的部位和工程量。
function syncTemplateToProjectGroup(template, space) {
  const quote = currentQuote();
  if (!quote || !template || !space) return { added: 0, skipped: 0 };
  const existingKeys = new Set(
    quoteItemsForProjectGroup(quote, space.id)
      .map((line) => quoteItemTemplateKey(line))
      .filter(Boolean)
  );
  const templateItems = sortedTemplateItems(template);
  let skipped = 0;
  const newLines = [];
  templateItems.forEach((templateItem) => {
    const key = templateItemKey(templateItem, quote);
    if (!key || existingKeys.has(key)) {
      skipped += 1;
      return;
    }
    const newLine = makeQuoteItemFromTemplateItem(templateItem, space, quote);
    if (!newLine) {
      skipped += 1;
      return;
    }
    existingKeys.add(key);
    newLines.push(newLine);
  });
  if (template.iconKey && (!space.iconKey || space.iconKey === defaultProjectGroupIconKey(space))) {
    space.iconKey = template.iconKey;
  }
  space.templateId = template.id;
  quote.lines.push(...newLines);
  return { added: newLines.length, skipped };
}

function quoteItemTemplateKey(line) {
  if (isMaterialQuoteItem(line)) {
    return line.materialId ? `material:${line.materialId}` : "";
  }
  const name = normalizeName(line.priceItemName || line.itemName || line.engineeringName || "");
  return name ? `labor:${name}` : "";
}

function templateItemKey(templateItem, quote = currentQuote()) {
  if (templateItem?.sourceType === "material") {
    return templateItem.materialId ? `material:${templateItem.materialId}` : "";
  }
  const item = findLaborItem(templateItem?.itemName, quote?.priceVersionId);
  const name = normalizeName(item?.name || templateItem?.itemName || "");
  return name ? `labor:${name}` : "";
}

function makeQuoteItemFromTemplateItem(templateItem, space, quote) {
  if (templateItem.sourceType === "material") {
    const material = findMaterial(templateItem.materialId);
    if (!material) return null;
    const line = makeQuoteItem("", templateItem.area || "", toNumber(templateItem.quantity), space.id);
    line.sourceType = "material";
    line.materialId = material.id;
    line.materialCategory = material.primaryCategory || templateItem.materialCategory || "";
    line.engineeringName = material.name;
    line.priceItemName = "";
    line.material = 0;
    line.auxiliary = 0;
    line.wasteRate = 0;
    line.labor = 0;
    line.legacyUnitPrice = null;
    return line;
  }

  const item = findLaborItem(templateItem.itemName, quote.priceVersionId);
  if (!item) return null;
  const line = makeQuoteItem(item.name, templateItem.area || "", toNumber(templateItem.quantity), space.id);
  line.sourceType = "labor";
  line.engineeringName = item.name;
  line.priceItemName = item.name;
  line.materialId = "";
  line.materialCategory = "";
  line.material = 0;
  line.auxiliary = item.auxiliary;
  line.wasteRate = item.wasteRate;
  line.labor = item.labor;
  line.legacyUnitPrice = null;
  if (!templateItem.quantity) {
    const recommendedQuantity = recommendedQuantityForQuoteItem(line, quote);
    if (recommendedQuantity !== null) line.quantity = roundQuantity(recommendedQuantity);
  }
  return line;
}

function addProjectGroup() {
  openAddProjectGroupDialog();
}

function openAddProjectGroupDialog(insertPosition = null) {
  const quote = currentQuote();
  if (!quote) return;
  document.querySelector(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal add-space-modal" role="dialog" aria-modal="true" aria-labelledby="addSpaceTitle">
      <div class="modal-head">
        <div>
          <h3 id="addSpaceTitle">添加项目组合</h3>
          <p>可以直接创建空组合，也可以选择模板自动带入常用项目。</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <label>项目组合名称
          <input class="add-space-name" type="text" value="${escapeHtml(`项目组合 ${quote.spaces.length + 1}`)}" autocomplete="off">
        </label>
        <label>套用模板
          <select class="add-space-template"></select>
        </label>
        <div class="modal-error" hidden></div>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel ghost" type="button">取消</button>
        <button class="modal-confirm" type="button">添加项目组合</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector(".add-space-name");
  const templateSelect = overlay.querySelector(".add-space-template");
  const errorNode = overlay.querySelector(".modal-error");
  const close = () => overlay.remove();
  const showError = (message) => {
    errorNode.textContent = message;
    errorNode.hidden = false;
  };
  const refreshTemplateOptions = () => {
    const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    templateSelect.innerHTML = [
      `<option value="">不套用模板</option>`,
      ...templates.map((template) => {
        const laborCount = template.items.filter((item) => item.sourceType === "labor").length;
        const materialCount = template.items.filter((item) => item.sourceType === "material").length;
        const countText = [
          laborCount ? `工费${laborCount}` : "",
          materialCount ? `主材${materialCount}` : ""
        ].filter(Boolean).join(" / ") || "空模板";
        return `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}（${countText}）</option>`;
      })
    ].join("");
  };

  refreshTemplateOptions();
  nameInput.focus();
  nameInput.select();
  templateSelect.addEventListener("change", () => {
    errorNode.hidden = true;
  });
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".modal-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Enter" && !event.target.closest("select")) {
      event.preventDefault();
      overlay.querySelector(".modal-confirm").click();
    }
  });
  overlay.querySelector(".modal-confirm").addEventListener("click", () => {
    const spaceName = String(nameInput.value || "").trim();
    if (!spaceName) {
      showError("请填写项目组合名称。");
      nameInput.focus();
      return;
    }
    if (projectGroupNameExists(spaceName)) {
      showError(`已经有“${spaceName}”这个项目组合了。`);
      nameInput.focus();
      return;
    }
    createProjectGroupFromDialog(spaceName, templateSelect.value || "", insertPosition);
    close();
  });
}

function openSyncProjectGroupTemplateDialog(spaceId) {
  const quote = currentQuote();
  const space = quote?.spaces?.find((entry) => entry.id === spaceId);
  if (!quote || !space) return;
  const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (!templates.length) {
    alert("还没有模板，请先到模板库添加模板。");
    return;
  }
  document.querySelector(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal add-space-modal" role="dialog" aria-modal="true" aria-labelledby="syncTemplateTitle">
      <div class="modal-head">
        <div>
          <h3 id="syncTemplateTitle">同步模板</h3>
          <p>只导入模板里缺少的项目，已有项目不会删除，也不会覆盖。</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <label>项目组合
          <input type="text" value="${escapeHtml(space.name)}" readonly>
        </label>
        <label>选择模板
          <select class="sync-space-template-select">
            ${templates.map((template) => {
              const laborCount = template.items.filter((item) => item.sourceType === "labor").length;
              const materialCount = template.items.filter((item) => item.sourceType === "material").length;
              const countText = [
                laborCount ? `工费${laborCount}` : "",
                materialCount ? `主材${materialCount}` : ""
              ].filter(Boolean).join(" / ") || "空模板";
              return `<option value="${escapeHtml(template.id)}" ${template.id === space.templateId ? "selected" : ""}>${escapeHtml(template.name)}（${countText}）</option>`;
            }).join("")}
          </select>
        </label>
        <div class="modal-error" hidden></div>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel ghost" type="button">取消</button>
        <button class="modal-confirm" type="button">同步模板</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const templateSelect = overlay.querySelector(".sync-space-template-select");
  const errorNode = overlay.querySelector(".modal-error");
  const close = () => overlay.remove();
  const showError = (message) => {
    errorNode.textContent = message;
    errorNode.hidden = false;
  };
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".modal-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Enter" && !event.target.closest("select")) {
      event.preventDefault();
      overlay.querySelector(".modal-confirm").click();
    }
  });
  overlay.querySelector(".modal-confirm").addEventListener("click", () => {
    const template = templates.find((entry) => entry.id === templateSelect.value);
    if (!template) {
      showError("请选择要同步的模板。");
      return;
    }
    const result = syncTemplateToProjectGroup(template, space);
    saveState(result.added ? `已同步模板，新增 ${result.added} 项` : "模板已同步，没有新增项目");
    close();
    renderAll();
  });
  templateSelect.focus();
}

function createProjectGroupFromDialog(spaceName, templateId = "", insertPosition = null) {
  const quote = currentQuote();
  if (!quote) return;
  const selectedTemplate = state.templates.find((template) => template.id === templateId) || null;
  if (projectGroupNameExists(spaceName)) {
    return;
  }
  const space = makeProjectGroup(spaceName);
  space.templateId = selectedTemplate?.id || "";
  const spaces = sortedProjectGroups(quote);
  const position = Number.isFinite(Number(insertPosition))
    ? Math.max(0, Math.min(Number(insertPosition), spaces.length))
    : spaces.length;
  spaces.splice(position, 0, space);
  spaces.forEach((entry, index) => { entry.sortOrder = index; });
  quote.spaces = spaces;
  const count = applyTemplateToSpace(selectedTemplate, space);
  saveState(count ? `已添加项目组合并套用 ${count} 项模板` : "已添加项目组合");
  renderAll();
}

function addOverallSpace() {
  addProjectGroup();
}

function projectGroupNameExists(name, excludeId = "") {
  const cleaned = String(name || "").trim();
  return currentQuote()?.spaces?.some((space) => (
    space.id !== excludeId
    && space.name === cleaned
  ));
}

function addQuoteItem(spaceId = "", sourceType = "labor") {
  const quote = currentQuote();
  const targetSpaceId = spaceId || sortedProjectGroups(quote)[0]?.id || ensureDefaultProjectGroup(quote).id;
  const line = makeQuoteItem("", "", 0, targetSpaceId);
  line.sourceType = sourceType === "material" ? "material" : "labor";
  if (line.sourceType === "material") {
    line.priceItemName = "";
    line.materialId = "";
    line.materialCategory = MATERIAL_PRIMARY_CATEGORIES[0];
    line.engineeringName = "";
    line.auxiliary = 0;
    line.labor = 0;
  }
  quote.lines.push(line);
  saveState("已添加工程项目");
  renderAll();
}

function addQuoteItemAt(spaceId, position = 0, sourceType = "labor") {
  const quote = currentQuote();
  const targetSpaceId = spaceId || sortedProjectGroups(quote)[0]?.id || ensureDefaultProjectGroup(quote).id;
  const newLine = makeQuoteItem("", "", 0, targetSpaceId);
  newLine.sourceType = sourceType === "material" ? "material" : "labor";
  if (newLine.sourceType === "material") {
    newLine.priceItemName = "";
    newLine.materialId = "";
    newLine.materialCategory = MATERIAL_PRIMARY_CATEGORIES[0];
    newLine.engineeringName = "";
    newLine.auxiliary = 0;
    newLine.labor = 0;
  }
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

function ensureDefaultProjectGroup(quote = currentQuote()) {
  if (!quote.spaces?.length) quote.spaces = [makeProjectGroup("项目组合")];
  return sortedProjectGroups(quote)[0];
}

function deleteProjectGroup(spaceId) {
  const quote = currentQuote();
  const space = quote.spaces.find((entry) => entry.id === spaceId);
  if (!space) return;
  if (quoteItemsForProjectGroup(quote, space.id).length) {
    alert("这个项目组合下面还有项目。请先移动或删除这些项目，再删除项目组合。");
    return;
  }
  const input = prompt(`请输入完整项目组合名称后删除：\n\n${space.name}`, "");
  if (input === null) return;
  if (String(input).trim() !== space.name) {
    alert("输入的项目组合名称不完整或不一致，未删除该项目组合。");
    return;
  }

  quote.spaces = quote.spaces.filter((entry) => entry.id !== space.id);
  quote.spaces.forEach((entry, index) => { entry.sortOrder = index; });
  saveState("已删除项目组合");
  renderAll();
}

function bindProjectGroupDragAndDrop() {
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
      moveProjectGroupBefore(draggedSpaceId, targetId);
    });
  });
}

function moveProjectGroupBefore(draggedId, targetId) {
  const quote = currentQuote();
  const spaces = sortedProjectGroups(quote);
  const draggedIndex = spaces.findIndex((space) => space.id === draggedId);
  const targetIndex = spaces.findIndex((space) => space.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = spaces.splice(draggedIndex, 1);
  spaces.splice(targetIndex, 0, dragged);
  spaces.forEach((space, sortIndex) => { space.sortOrder = sortIndex; });
  quote.spaces = spaces;
  saveState("已调整项目组合顺序");
  renderAll();
}

function toggleProjectGroup(spaceId) {
  const quote = currentQuote();
  const space = quote.spaces.find((entry) => entry.id === spaceId);
  if (!space) return;
  if (space.collapsed) {
    quote.spaces.forEach((entry) => { entry.collapsed = entry.id !== spaceId; });
  } else {
    space.collapsed = true;
  }
  saveState(space.collapsed ? "已折叠项目组合" : "已展开项目组合");
  renderLines();
}

function moveQuoteItemToProjectGroup(lineId, targetSpaceId) {
  const quote = currentQuote();
  const lineIndex = quote.lines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0) return;
  const line = quote.lines[lineIndex];
  const targetSpace = quote.spaces.find((space) => space.id === targetSpaceId);
  if (!targetSpace) {
    renderLines();
    return;
  }
  quote.lines.splice(lineIndex, 1);
  line.spaceId = targetSpaceId;
  const recommendedQuantity = recommendedQuantityForQuoteItem(line, quote);
  if (recommendedQuantity !== null) line.quantity = roundQuantity(recommendedQuantity);
  const targetIndexes = quote.lines
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.spaceId === targetSpaceId);
  const lastTargetIndex = targetIndexes[targetIndexes.length - 1]?.index;
  quote.lines.splice(lastTargetIndex === undefined ? quote.lines.length : lastTargetIndex + 1, 0, line);
  saveState("已移动工程项目");
  renderAll();
}

function setQuoteField(key, value, rerender = false) {
  const quote = currentQuote();
  quote[key] = value;
  if (key === "projectName") {
    quote.name = value || quote.name;
    if (els.editorProjectNameTitle) {
      els.editorProjectNameTitle.textContent = value || quote.name || "未命名工程";
    }
  }
  if (key === "priceVersionId") {
    state.activeVersionId = value;
    quote.lines = quote.lines.map((line) => normalizeQuoteItem(line, value));
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

// 工费版本管理：版本只是工费库的版本，报价案例会记录当前引用的版本 id。
function cloneVersion() {
  const base = currentVersion();
  const name = prompt("新工费版本名称", `${base.name} - 调整版`);
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
  saveState("已创建工费版本");
  renderAll();
}

function renameVersion() {
  const version = currentVersion();
  const name = prompt("工费版本名称", version.name);
  if (!name) return;
  version.name = name;
  saveState("已重命名工费版本");
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

// 导出/导入使用同一份便携数据结构，字段名保持前端兼容，不等同于 SQLite 表名。
function getPortableState() {
  return {
    app: "quote-tool",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      versions: state.versions,
      categories: state.categories,
      materials: state.materials,
      templates: state.templates,
      packages: state.packages,
      activeVersionId: state.activeVersionId,
      activePage: state.activePage,
      categoryLibraryCollapsed: state.categoryLibraryCollapsed,
      customers: state.customers,
      quotes: state.quotes,
      activeCustomerId: state.activeCustomerId,
      activeQuoteId: state.activeQuoteId,
      activePackageId: state.activePackageId,
      activePackageEstimateId: state.activePackageEstimateId,
      activePackageTab: state.activePackageTab
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
  state.materials = data.materials || [];
  state.templates = data.templates || [];
  state.packages = data.packages || [];
  state.activeVersionId = data.activeVersionId || data.versions[0]?.id || "";
  state.activePage = data.activePage || "manager";
  state.categoryLibraryCollapsed = data.categoryLibraryCollapsed ?? true;
  state.customers = data.customers;
  state.quotes = data.quotes;
  state.activeCustomerId = data.activeCustomerId || data.customers[0]?.id || "";
  state.activeQuoteId = data.activeQuoteId || data.quotes[0]?.id || "";
  state.activePackageId = data.activePackageId || data.packages?.[0]?.id || "";
  state.activePackageEstimateId = data.activePackageEstimateId || "";
  state.activePackageTab = data.activePackageTab === "estimate" ? "estimate" : "description";
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

function sortedPackages() {
  return (state.packages || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function renderPackages() {
  if (!els.packageList || !els.packageDetail) return;
  const packages = sortedPackages();
  if (els.packageCount) els.packageCount.textContent = `${packages.length} 个套餐`;
  if (!packages.length) {
    els.packageList.innerHTML = "";
    els.packageDetail.innerHTML = `
      <div class="empty-panel">
        <strong>还没有清工辅料套餐</strong>
        <p class="muted">先添加一个套餐，再维护套餐说明和成本测算。</p>
      </div>
    `;
    return;
  }
  if (!currentPackage()) state.activePackageId = packages[0].id;
  const activePackage = currentPackage();
  els.packageList.innerHTML = packages.map((entry) => {
    const estimate = currentPackageEstimate(entry);
    const totals = calculatePackageEstimateTotals(entry, estimate);
    return `
      <button class="package-card ${entry.id === activePackage?.id ? "active" : ""}" type="button" data-package-id="${escapeHtml(entry.id)}">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${formatMoney(entry.quoteUnitPrice)} / ${escapeHtml(entry.unit || "平米")}</span>
        <small>测算利润 ${formatMoney(totals.profit)} · ${formatPercent(totals.profitRate)}</small>
      </button>
    `;
  }).join("");
  els.packageList.querySelectorAll(".package-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePackageId = button.dataset.packageId;
      const estimate = currentPackageEstimate(currentPackage());
      state.activePackageEstimateId = estimate?.id || "";
      saveState("已选择套餐");
      renderPackages();
    });
  });
  renderPackageDetail(activePackage);
}

function renderPackageDetail(packageEntry) {
  if (!packageEntry) return;
  const estimate = currentPackageEstimate(packageEntry);
  if (estimate) state.activePackageEstimateId = estimate.id;
  const totals = calculatePackageEstimateTotals(packageEntry, estimate);
  const activeTab = state.activePackageTab === "estimate" ? "estimate" : "description";
  els.packageDetail.innerHTML = `
    <div class="package-meta">
      <label>套餐名称<input class="package-name" type="text" value="${escapeHtml(packageEntry.name)}"></label>
      <label>单位<input class="package-unit" type="text" value="${escapeHtml(packageEntry.unit)}"></label>
      <label>套餐单价<input class="package-price" type="number" min="0" step="0.01" value="${packageEntry.quoteUnitPrice}"></label>
      <label>默认公式<input class="package-formula" type="text" value="${escapeHtml(packageEntry.quantityFormula)}"></label>
      <label class="wide">套餐说明<textarea class="package-description">${escapeHtml(packageEntry.description)}</textarea></label>
      <label class="wide">不含说明<textarea class="package-exclusion">${escapeHtml(packageEntry.exclusionNote)}</textarea></label>
    </div>
    <div class="package-tabs">
      <button class="package-tab ${activeTab === "description" ? "active" : ""}" type="button" data-package-tab="description">套餐说明</button>
      <button class="package-tab ${activeTab === "estimate" ? "active" : ""}" type="button" data-package-tab="estimate">成本测算</button>
    </div>
    <div class="package-tab-content">
      ${activeTab === "description" ? `
      <section class="package-block package-block-full">
        <div class="section-title tight-title">
          <div>
            <h3>套餐说明</h3>
            <p class="muted">给客户看的所含基础项目及说明。</p>
          </div>
          <button class="add-package-section ghost" type="button">添加分类</button>
        </div>
        <div class="package-section-list">
          ${renderPackageSections(packageEntry)}
        </div>
      </section>
      ` : `
      <section class="package-block package-block-full">
        <div class="section-title tight-title">
          <div>
            <h3>成本测算</h3>
            <p class="muted">内部模拟户型，用工费库和主材库推演成本。</p>
          </div>
          <button class="add-package-estimate ghost" type="button">添加测算</button>
        </div>
        ${renderPackageEstimateSelector(packageEntry, estimate)}
        ${renderPackageEstimateSummary(packageEntry, estimate, totals)}
        ${renderPackageEstimateEditor(packageEntry, estimate)}
      </section>
      `}
    </div>
  `;
  bindPackageDetail(packageEntry, estimate);
}

function renderPackageSections(packageEntry) {
  const sections = (packageEntry.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (!sections.length) return `<p class="muted empty-line">暂无说明分类。</p>`;
  return sections.map((section) => `
    <div class="package-section" data-section-id="${escapeHtml(section.id)}">
      <div class="package-section-head">
        <input class="package-section-name" type="text" value="${escapeHtml(section.name)}">
        <button class="add-package-section-item ghost" type="button">添加项目</button>
        <button class="delete-package-section danger" type="button">删除分类</button>
      </div>
      <div class="package-section-table">
        <div class="package-section-row header">
          <span>项目</span><span>品牌/施工</span><span>工艺说明</span><span>操作</span>
        </div>
        ${(section.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => `
          <div class="package-section-row" data-section-item-id="${escapeHtml(item.id)}">
            <input class="section-item-name" type="text" value="${escapeHtml(item.name)}">
            <input class="section-item-provider" type="text" value="${escapeHtml(item.provider)}">
            <textarea class="section-item-description">${escapeHtml(item.description)}</textarea>
            <button class="delete-section-item danger" type="button">删除</button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderPackageEstimateSelector(packageEntry, estimate) {
  const estimates = (packageEntry.estimates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return `
    <div class="package-estimate-tabs">
      ${estimates.map((entry) => `
        <button class="package-estimate-tab ${entry.id === estimate?.id ? "active" : ""}" type="button" data-estimate-id="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</button>
      `).join("")}
    </div>
  `;
}

function renderPackageEstimateSummary(packageEntry, estimate, totals) {
  if (!estimate) return "";
  return `
    <div class="package-estimate-meta">
      <label>测算名称<input class="estimate-name" type="text" value="${escapeHtml(estimate.name)}"></label>
      <label>建筑面积<input class="estimate-building-area" type="number" min="0" step="0.01" value="${estimate.buildingArea}"></label>
      <label>面积<input class="estimate-area" type="number" min="0" step="0.01" value="${estimate.area}"></label>
      <label>周长<input class="estimate-perimeter" type="number" min="0" step="0.01" value="${estimate.perimeter}"></label>
      <label>高度<input class="estimate-height" type="number" min="0" step="0.01" value="${estimate.height}"></label>
      <label>测算单价<input class="estimate-price" type="number" min="0" step="0.01" value="${estimate.quoteUnitPrice || packageEntry.quoteUnitPrice}"></label>
    </div>
    <div class="package-estimate-summary">
      <div><span>套餐报价</span><strong>${formatMoney(totals.quoteTotal)}</strong></div>
      <div><span>清工辅料成本</span><strong>${formatMoney(totals.laborCost)}</strong></div>
      <div><span>装修主材成本</span><strong>${formatMoney(totals.materialCost)}</strong></div>
      <div><span>总成本</span><strong>${formatMoney(totals.totalCost)}</strong></div>
      <div><span>利润</span><strong>${formatMoney(totals.profit)}</strong></div>
      <div><span>利润率</span><strong>${formatPercent(totals.profitRate)}</strong></div>
    </div>
  `;
}

function renderPackageEstimateEditor(packageEntry, estimate) {
  if (!estimate) return "";
  const groups = (estimate.groups || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return `
    <div class="package-estimate-actions">
      <button class="add-estimate-group ghost" type="button">添加测算组合</button>
      <button class="delete-estimate danger" type="button">删除测算</button>
    </div>
    <div class="package-estimate-groups">
      ${groups.map((group) => renderPackageEstimateGroup(estimate, group)).join("")}
    </div>
  `;
}

function renderPackageEstimateGroup(estimate, group) {
  const items = (estimate.items || []).filter((item) => item.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
  return `
    <section class="package-estimate-group" data-group-id="${escapeHtml(group.id)}">
      <div class="package-estimate-group-head">
        <input class="estimate-group-name" type="text" value="${escapeHtml(group.name)}">
        <label>面积<input class="estimate-group-area" type="number" min="0" step="0.01" value="${group.area}"></label>
        <label>周长<input class="estimate-group-perimeter" type="number" min="0" step="0.01" value="${group.perimeter}"></label>
        <label>高度<input class="estimate-group-height" type="number" min="0" step="0.01" value="${group.height}"></label>
        <button class="add-estimate-labor" type="button">添加工费</button>
        <button class="add-estimate-material ghost" type="button">添加主材</button>
        <button class="delete-estimate-group danger" type="button">删除组合</button>
      </div>
      <div class="package-estimate-table">
        <div class="package-estimate-row header">
          <span>类型</span><span>项目名称</span><span>部位</span><span>工程量</span><span>单位</span><span>报价单价</span><span>成本单价</span><span>成本金额</span><span>归类</span><span>操作</span>
        </div>
        ${items.map((item) => renderPackageEstimateItem(estimate, group, item)).join("")}
      </div>
    </section>
  `;
}

function renderPackageEstimateItem(estimate, group, item) {
  const data = packageEstimateItemPricing(item);
  return `
    <div class="package-estimate-row" data-item-id="${escapeHtml(item.id)}">
      <select class="estimate-item-type">
        <option value="labor" ${item.sourceType === "labor" ? "selected" : ""}>工费</option>
        <option value="material" ${item.sourceType === "material" ? "selected" : ""}>主材</option>
      </select>
      <label class="suggest-wrap">
        <input class="estimate-item-name" type="text" value="${escapeHtml(data.name)}" placeholder="${item.sourceType === "material" ? "输入主材名称" : "输入工费名称"}">
        <div class="suggestions"></div>
      </label>
      <input class="estimate-item-area" type="text" value="${escapeHtml(item.area)}" placeholder="可空">
      <input class="estimate-item-quantity" type="number" min="0" step="0.01" value="${item.quantity}">
      <span class="readonly-cell">${escapeHtml(data.unit)}</span>
      <span class="readonly-cell">${formatMoney(data.quoteUnitPrice)}</span>
      <span class="readonly-cell">${formatMoney(data.costUnitPrice)}</span>
      <strong class="readonly-cell">${formatMoney(data.costAmount)}</strong>
      <select class="estimate-item-included">
        <option value="included" ${item.includedType === "included" ? "selected" : ""}>套餐内</option>
        <option value="excluded" ${item.includedType === "excluded" ? "selected" : ""}>套餐外</option>
        <option value="upgrade" ${item.includedType === "upgrade" ? "selected" : ""}>升级项</option>
        <option value="reference" ${item.includedType === "reference" ? "selected" : ""}>仅参考</option>
      </select>
      <button class="delete-estimate-item danger" type="button">删除</button>
    </div>
  `;
}

function bindPackageDetail(packageEntry, estimate) {
  bindPackageMetaInputs(packageEntry);
  els.packageDetail.querySelectorAll(".package-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePackageTab = button.dataset.packageTab === "estimate" ? "estimate" : "description";
      saveState("已切换套餐页面");
      renderPackages();
    });
  });
  bindPackageSectionInputs(packageEntry);
  bindPackageEstimateInputs(packageEntry, estimate);
}

function bindPackageMetaInputs(packageEntry) {
  const setValue = (selector, key, mode = "text") => {
    const input = els.packageDetail.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", (event) => {
      packageEntry[key] = mode === "number" ? toNumber(event.target.value) : event.target.value;
      saveState("已更新套餐");
    });
    input.addEventListener("change", () => renderPackages());
  };
  setValue(".package-name", "name");
  setValue(".package-unit", "unit");
  setValue(".package-price", "quoteUnitPrice", "number");
  setValue(".package-formula", "quantityFormula");
  setValue(".package-description", "description");
  setValue(".package-exclusion", "exclusionNote");
  els.packageDetail.querySelector(".add-package-section")?.addEventListener("click", () => addPackageSection(packageEntry));
  els.packageDetail.querySelector(".add-package-estimate")?.addEventListener("click", () => addPackageEstimate(packageEntry));
}

function bindPackageSectionInputs(packageEntry) {
  els.packageDetail.querySelectorAll(".package-section").forEach((node) => {
    const section = packageEntry.sections.find((entry) => entry.id === node.dataset.sectionId);
    if (!section) return;
    node.querySelector(".package-section-name")?.addEventListener("input", (event) => {
      section.name = event.target.value;
      saveState("已更新套餐说明");
    });
    node.querySelector(".add-package-section-item")?.addEventListener("click", () => addPackageSectionItem(section));
    node.querySelector(".delete-package-section")?.addEventListener("click", () => deletePackageSection(packageEntry, section));
    node.querySelectorAll(".package-section-row[data-section-item-id]").forEach((row) => {
      const item = section.items.find((entry) => entry.id === row.dataset.sectionItemId);
      if (!item) return;
      [
        [".section-item-name", "name"],
        [".section-item-provider", "provider"],
        [".section-item-description", "description"]
      ].forEach(([selector, key]) => {
        row.querySelector(selector)?.addEventListener("input", (event) => {
          item[key] = event.target.value;
          saveState("已更新套餐说明");
        });
      });
      row.querySelector(".delete-section-item")?.addEventListener("click", () => deletePackageSectionItem(section, item));
    });
  });
}

function bindPackageEstimateInputs(packageEntry, estimate) {
  if (!estimate) return;
  els.packageDetail.querySelectorAll(".package-estimate-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePackageEstimateId = button.dataset.estimateId;
      packageEntry.estimates.forEach((entry) => { entry.active = entry.id === state.activePackageEstimateId; });
      saveState("已切换套餐测算");
      renderPackages();
    });
  });
  const setEstimateValue = (selector, key, mode = "text") => {
    const input = els.packageDetail.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", (event) => {
      estimate[key] = mode === "number" ? toNumber(event.target.value) : event.target.value;
      if (key === "quoteUnitPrice" && !estimate.quoteUnitPrice) estimate.quoteUnitPrice = 0;
      saveState("已更新测算");
    });
    input.addEventListener("keydown", blurOnEnter);
    input.addEventListener("change", () => renderPackages());
  };
  setEstimateValue(".estimate-name", "name");
  setEstimateValue(".estimate-building-area", "buildingArea", "number");
  setEstimateValue(".estimate-area", "area", "number");
  setEstimateValue(".estimate-perimeter", "perimeter", "number");
  setEstimateValue(".estimate-height", "height", "number");
  setEstimateValue(".estimate-price", "quoteUnitPrice", "number");
  els.packageDetail.querySelector(".add-estimate-group")?.addEventListener("click", () => addPackageEstimateGroup(estimate));
  els.packageDetail.querySelector(".delete-estimate")?.addEventListener("click", () => deletePackageEstimate(packageEntry, estimate));
  bindPackageEstimateGroups(packageEntry, estimate);
}

function bindPackageEstimateGroups(packageEntry, estimate) {
  els.packageDetail.querySelectorAll(".package-estimate-group").forEach((node) => {
    const group = estimate.groups.find((entry) => entry.id === node.dataset.groupId);
    if (!group) return;
    [
      [".estimate-group-name", "name", "text"],
      [".estimate-group-area", "area", "number"],
      [".estimate-group-perimeter", "perimeter", "number"],
      [".estimate-group-height", "height", "number"]
    ].forEach(([selector, key, mode]) => {
      node.querySelector(selector)?.addEventListener("input", (event) => {
        group[key] = mode === "number" ? toNumber(event.target.value) : event.target.value;
        saveState("已更新测算组合");
      });
      node.querySelector(selector)?.addEventListener("keydown", blurOnEnter);
      node.querySelector(selector)?.addEventListener("change", () => renderPackages());
    });
    node.querySelector(".add-estimate-labor")?.addEventListener("click", () => addPackageEstimateItem(estimate, group, "labor"));
    node.querySelector(".add-estimate-material")?.addEventListener("click", () => addPackageEstimateItem(estimate, group, "material"));
    node.querySelector(".delete-estimate-group")?.addEventListener("click", () => deletePackageEstimateGroup(estimate, group));
    bindPackageEstimateItemRows(packageEntry, estimate, group, node);
  });
}

function bindPackageEstimateItemRows(packageEntry, estimate, group, node) {
  node.querySelectorAll(".package-estimate-row[data-item-id]").forEach((row) => {
    const item = estimate.items.find((entry) => entry.id === row.dataset.itemId);
    if (!item) return;
    row.querySelector(".estimate-item-type")?.addEventListener("change", (event) => {
      item.sourceType = event.target.value === "material" ? "material" : "labor";
      item.itemName = "";
      item.materialId = "";
      item.materialCategory = "";
      saveState("已切换测算条目类型");
      renderPackages();
    });
    const nameInput = row.querySelector(".estimate-item-name");
    const suggestions = row.querySelector(".suggestions");
    if (nameInput && suggestions) {
      nameInput.addEventListener("input", () => {
        if (item.sourceType === "material") {
          renderPackageMaterialSuggestions(suggestions, item, nameInput.value);
        } else {
          renderPackageLaborSuggestions(suggestions, item, nameInput.value, estimate, group);
        }
      });
      nameInput.addEventListener("focus", () => {
        if (item.sourceType === "material") {
          renderPackageMaterialSuggestions(suggestions, item, nameInput.value);
        } else {
          renderPackageLaborSuggestions(suggestions, item, nameInput.value, estimate, group);
        }
      });
      nameInput.addEventListener("blur", () => setTimeout(() => { suggestions.innerHTML = ""; }, 120));
      nameInput.addEventListener("keydown", (event) => handlePackageSuggestionKeys(event, suggestions, item, estimate, group));
    }
    row.querySelector(".estimate-item-area")?.addEventListener("keydown", blurOnEnter);
    row.querySelector(".estimate-item-area")?.addEventListener("input", (event) => {
      item.area = event.target.value;
      saveState("已更新测算条目");
    });
    const quantityInput = row.querySelector(".estimate-item-quantity");
    quantityInput?.addEventListener("focus", (event) => event.target.select());
    quantityInput?.addEventListener("keydown", blurOnEnter);
    quantityInput?.addEventListener("input", (event) => {
      item.quantity = toNumber(event.target.value);
      saveState("已更新测算工程量");
    });
    quantityInput?.addEventListener("change", () => renderPackages());
    row.querySelector(".estimate-item-included")?.addEventListener("change", (event) => {
      item.includedType = event.target.value;
      saveState("已更新测算归类");
      renderPackages();
    });
    row.querySelector(".delete-estimate-item")?.addEventListener("click", () => {
      estimate.items = estimate.items.filter((entry) => entry.id !== item.id);
      saveState("已删除测算条目");
      renderPackages();
    });
  });
}

function addPackage() {
  const entry = normalizePackage({
    id: makeId("package"),
    name: createUniquePackageName(),
    unit: "平米",
    quoteUnitPrice: 400,
    description: "清工辅料基础套餐，包含基础施工、基层处理、水电基础改造、瓦工辅料、油工基础施工等。",
    exclusionNote: "不含瓷砖、木门、柜体、洁具、灯具、电器等装修主材。",
    sortOrder: sortedPackages().length
  }, sortedPackages().length);
  state.packages.push(entry);
  state.activePackageId = entry.id;
  state.activePackageEstimateId = entry.estimates[0]?.id || "";
  saveState("已添加套餐");
  renderAll();
}

function createUniquePackageName() {
  let index = state.packages.length + 1;
  while (state.packages.some((entry) => entry.name === `清工辅料套餐 ${index}`)) index += 1;
  return `清工辅料套餐 ${index}`;
}

function addPackageSection(packageEntry) {
  packageEntry.sections.push(normalizePackageSection({
    name: `说明分类 ${packageEntry.sections.length + 1}`,
    sortOrder: packageEntry.sections.length
  }, packageEntry.sections.length));
  saveState("已添加套餐说明分类");
  renderPackages();
}

function addPackageSectionItem(section) {
  section.items.push(normalizePackageSectionItem({
    name: "",
    unit: "",
    provider: "",
    description: "",
    sortOrder: section.items.length
  }, section.items.length));
  saveState("已添加套餐说明项目");
  renderPackages();
}

function deletePackageSection(packageEntry, section) {
  if (!confirm(`删除说明分类“${section.name}”？`)) return;
  packageEntry.sections = packageEntry.sections.filter((entry) => entry.id !== section.id);
  packageEntry.sections.forEach((entry, index) => { entry.sortOrder = index; });
  saveState("已删除套餐说明分类");
  renderPackages();
}

function deletePackageSectionItem(section, item) {
  section.items = section.items.filter((entry) => entry.id !== item.id);
  section.items.forEach((entry, index) => { entry.sortOrder = index; });
  saveState("已删除套餐说明项目");
  renderPackages();
}

function addPackageEstimate(packageEntry) {
  const estimate = normalizePackageEstimate({
    name: `${packageEntry.name}测算 ${packageEntry.estimates.length + 1}`,
    buildingArea: 143,
    quoteUnitPrice: packageEntry.quoteUnitPrice,
    active: true,
    sortOrder: packageEntry.estimates.length
  }, packageEntry.estimates.length);
  packageEntry.estimates.forEach((entry) => { entry.active = false; });
  packageEntry.estimates.push(estimate);
  state.activePackageEstimateId = estimate.id;
  saveState("已添加套餐测算");
  renderPackages();
}

function deletePackageEstimate(packageEntry, estimate) {
  if (packageEntry.estimates.length <= 1) {
    alert("至少保留一个测算案例。");
    return;
  }
  if (!confirm(`删除测算“${estimate.name}”？`)) return;
  packageEntry.estimates = packageEntry.estimates.filter((entry) => entry.id !== estimate.id);
  packageEntry.estimates.forEach((entry, index) => { entry.sortOrder = index; entry.active = index === 0; });
  state.activePackageEstimateId = packageEntry.estimates[0]?.id || "";
  saveState("已删除套餐测算");
  renderPackages();
}

function addPackageEstimateGroup(estimate) {
  estimate.groups.push(normalizePackageEstimateGroup({
    name: `测算组合 ${estimate.groups.length + 1}`,
    sortOrder: estimate.groups.length
  }, estimate.groups.length));
  saveState("已添加测算组合");
  renderPackages();
}

function deletePackageEstimateGroup(estimate, group) {
  if (!confirm(`删除测算组合“${group.name}”？组合内条目也会删除。`)) return;
  estimate.groups = estimate.groups.filter((entry) => entry.id !== group.id);
  estimate.items = estimate.items.filter((entry) => entry.groupId !== group.id);
  estimate.groups.forEach((entry, index) => { entry.sortOrder = index; });
  saveState("已删除测算组合");
  renderPackages();
}

function addPackageEstimateItem(estimate, group, sourceType) {
  estimate.items.push(normalizePackageEstimateItem({
    groupId: group.id,
    sourceType,
    sortOrder: estimate.items.length,
    includedType: "included"
  }, estimate.items.length));
  saveState(sourceType === "material" ? "已添加测算主材" : "已添加测算工费");
  renderPackages();
}

function packageEstimateItemPricing(item) {
  if (item.sourceType === "material") {
    const material = findMaterial(item.materialId);
    const quoteUnitPrice = toNumber(material?.quoteUnitPrice);
    const costUnitPrice = toNumber(material?.costUnitPrice);
    return {
      name: material?.name || item.itemName || "",
      unit: material?.unit || "",
      quoteUnitPrice,
      costUnitPrice,
      costAmount: toNumber(item.quantity) * costUnitPrice
    };
  }
  const laborItem = findLaborItem(item.itemName);
  const quoteUnitPrice = calculateLaborItemUnitPrice(laborItem);
  const costUnitPrice = calculateLaborItemCostUnitPrice(laborItem);
  return {
    name: item.itemName || "",
    unit: laborItem?.unit || parsePriceNameUnit(laborItem?.name || item.itemName)?.unit || "",
    quoteUnitPrice,
    costUnitPrice,
    costAmount: toNumber(item.quantity) * costUnitPrice
  };
}

function calculatePackageEstimateTotals(packageEntry, estimate) {
  if (!estimate) return { quoteTotal: 0, laborCost: 0, materialCost: 0, totalCost: 0, profit: 0, profitRate: 0 };
  const quantity = toNumber(estimate.buildingArea || estimate.area);
  const quoteUnitPrice = toNumber(estimate.quoteUnitPrice || packageEntry?.quoteUnitPrice);
  const quoteTotal = quantity * quoteUnitPrice;
  let laborCost = 0;
  let materialCost = 0;
  (estimate.items || []).forEach((item) => {
    if (item.includedType === "reference") return;
    const pricing = packageEstimateItemPricing(item);
    if (item.sourceType === "material") materialCost += pricing.costAmount;
    else laborCost += pricing.costAmount;
  });
  const totalCost = laborCost + materialCost;
  const profit = quoteTotal - totalCost;
  return {
    quoteTotal,
    laborCost,
    materialCost,
    totalCost,
    profit,
    profitRate: quoteTotal ? profit / quoteTotal : 0
  };
}

function renderPackageLaborSuggestions(container, item, query, estimate, group) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }
  const matches = findComparableItems(cleaned, 6);
  if (!matches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配工费，可以先到工费库添加。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">找到相似工费项，选择后用于测算成本。</div>
    ${matches.map((laborItem) => `
      <button class="suggestion" type="button" data-item-name="${escapeHtml(laborItem.name)}">
        <span>
          <strong>${escapeHtml(laborItem.name)}</strong>
          <small>${escapeHtml(laborItem.category || "未分类")} · ${escapeHtml(laborItem.unit || "项")}</small>
        </span>
        <b>${formatMoney(calculateLaborItemCostUnitPrice(laborItem))}</b>
      </button>
    `).join("")}
  `;
  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectPackageLaborSuggestion(item, button.dataset.itemName, estimate, group);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function renderPackageMaterialSuggestions(container, item, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    container.innerHTML = "";
    container.dataset.activeIndex = "-1";
    return;
  }
  const matches = findSimilarMaterials(cleaned).slice(0, 6);
  if (!matches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配主材，可以先到主材库添加。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">找到相似主材，选择后用于测算成本。</div>
    ${matches.map((material) => `
      <button class="suggestion" type="button" data-material-id="${escapeHtml(material.id)}">
        <span>
          <strong>${escapeHtml(material.name)}</strong>
          <small>${escapeHtml(material.primaryCategory || "未分类")} · ${escapeHtml(material.unit || "项")}</small>
        </span>
        <b>${formatMoney(material.costUnitPrice)}</b>
      </button>
    `).join("")}
  `;
  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectPackageMaterialSuggestion(item, button.dataset.materialId);
    });
  });
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
}

function handlePackageSuggestionKeys(event, container, item, estimate, group) {
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
  if (event.key !== "Enter") return;
  const button = buttons[index];
  if (item.sourceType === "material") selectPackageMaterialSuggestion(item, button.dataset.materialId);
  else selectPackageLaborSuggestion(item, button.dataset.itemName, estimate, group);
}

function selectPackageLaborSuggestion(item, itemName, estimate, group) {
  const laborItem = findLaborItem(itemName);
  if (!laborItem) return;
  item.sourceType = "labor";
  item.itemName = laborItem.name;
  item.materialId = "";
  const recommended = evaluatePackageItemQuantity(laborItem.quantityFormula, estimate, group);
  if (recommended !== null) item.quantity = roundQuantity(recommended);
  saveState("已选择测算工费");
  renderPackages();
}

function selectPackageMaterialSuggestion(item, materialId) {
  const material = findMaterial(materialId);
  if (!material) return;
  item.sourceType = "material";
  item.materialId = material.id;
  item.itemName = material.name;
  item.materialCategory = material.primaryCategory || material.category || "";
  saveState("已选择测算主材");
  renderPackages();
}

function evaluatePackageItemQuantity(formula, estimate, group) {
  return evaluateQuantityFormula(formula || DEFAULT_QUANTITY_FORMULA, {
    s: toNumber(group?.area || estimate?.area || estimate?.buildingArea),
    c: toNumber(group?.perimeter || estimate?.perimeter),
    h: toNumber(group?.height || estimate?.height)
  });
}

function blurOnEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function formatPercent(value) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

function deleteLaborItem(itemName) {
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
  unlinkLaborItemFromQuotes(item.name, version.id);
  if (state.pendingLaborItemName === item.name) state.pendingLaborItemName = "";
  if (state.expandedLaborItemName === item.name) state.expandedLaborItemName = "";
  saveState("删除工费条目");
  renderAll();
}

function unlinkLaborItemFromQuotes(itemName, versionId) {
  state.quotes.forEach((quote) => {
    if (quote.priceVersionId !== versionId) return;
    quote.lines.forEach((line) => {
      if (line.priceItemName !== itemName) return;
      line.engineeringName = line.engineeringName || itemName;
      line.priceItemName = "";
    });
  });
}

// 库条目改名或改价后，同步所有引用该工费/主材的报价条目，保持显示和计算一致。
function syncQuoteItemLaborParts(item) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName === item.name && quote.priceVersionId === currentVersion().id) {
        line.material = item.usesMaterial ? 0 : item.material;
        line.auxiliary = item.auxiliary;
        line.wasteRate = item.wasteRate;
        line.labor = item.labor;
        if (!item.usesMaterial) line.materialId = "";
        if (item.usesMaterial && line.materialId && !materialsForItem(item).some((material) => material.id === line.materialId)) {
          line.materialId = "";
        }
        line.legacyUnitPrice = null;
      }
    });
  });
}

function clearInvalidQuoteItemMaterials(item) {
  const validMaterialIds = new Set(materialsForItem(item).map((material) => material.id));
  if (item.defaultMaterialId && !validMaterialIds.has(item.defaultMaterialId)) item.defaultMaterialId = "";
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName !== item.name || !line.materialId) return;
      if (!validMaterialIds.has(line.materialId)) line.materialId = "";
    });
  });
}

function syncQuoteItemLaborItemName(oldName, newName) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName === oldName) line.priceItemName = newName;
    });
  });
}

function syncQuoteItemMaterialName(materialId, newName) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.materialId === materialId) line.engineeringName = newName;
    });
  });
}

// 保存保护：如果 SQLite 未成功载入，阻止保存，避免旧缓存覆盖数据库。
function saveState(message = "已保存") {
  if (state.loadBlocked) {
    if (els.saveStatus) els.saveStatus.textContent = "数据未载入，已阻止保存，避免覆盖 SQLite。";
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveStateToServer();
  if (els.saveStatus) {
    els.saveStatus.textContent = `${message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

// Node 服务是正式数据源；读取失败时 HTTP 模式直接报错，避免旧缓存覆盖数据库。
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

// 使用浏览器打印能力生成 PDF，文件名由工程名、客户名和时间组成。
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

// 通用工具函数区域：只放无业务副作用的小工具。
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
  return `${prefix}-${uuidV7()}`;
}

function uuidV7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const timestamp = BigInt(Date.now());
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

function flashQuoteItemSaved(node) {
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
