/**
 * @typedef {import("./types.js").LaborItem} LaborItem
 * @typedef {import("./types.js").MaterialKind} MaterialKind
 * @typedef {import("./types.js").Material} Material
 * @typedef {import("./types.js").ProjectGroup} ProjectGroup
 * @typedef {import("./types.js").QuoteItem} QuoteItem
 * @typedef {import("./types.js").Quote} Quote
 * @typedef {import("./types.js").QuoteTotals} QuoteTotals
 */

const STORAGE_KEY = "quote-tool-state-v2";
const OLD_STORAGE_KEY = "quote-tool-state-v1";
const APP_BUILD = "20260611-0022";
const DEFAULT_MANAGEMENT_RATE = 8;
const DEFAULT_DESIGN_RATE = 6;
const DEFAULT_TAX_RATE = 9;
const DEFAULT_QUANTITY_FORMULA = "q=s+c*(h-0.25)";
const MATERIAL_PRIMARY_CATEGORIES = ["砖", "门", "柜子", "板材", "洁具", "五金", "其他"];
const DEFAULT_GENERIC_MATERIALS = [
  ["地砖", "砖", "平米"],
  ["墙砖", "砖", "平米"],
  ["岩板", "岩板石材", "平米"],
  ["石材", "岩板石材", "平米"],
  ["门", "门套踢脚", "樘"],
  ["地脚线", "门套踢脚", "米"],
  ["单边套", "门套踢脚", "米"],
  ["双边套", "门套踢脚", "米"],
  ["玻璃门", "门", "平米"],
  ["推拉门", "门", "平米"],
  ["全屋定制", "柜子", "平米"],
  ["橱柜地柜", "柜子", "米"],
  ["橱柜吊柜", "柜子", "米"],
  ["橱柜高柜", "柜子", "平米"],
  ["电视柜", "柜子", "米"],
  ["衣柜", "柜子", "平米"],
  ["写字台", "柜子", "米"],
  ["护墙板", "柜子", "平米"],
  ["坐便", "洁具", "个"],
  ["花洒", "洁具", "套"],
  ["浴室柜", "洁具", "套"]
];

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

const state = {
  versions: [],
  categories: [],
  materials: [],
  genericMaterials: [],
  templates: [],
  packages: [],
  activeVersionId: "",
  activePage: "manager",
  categoryLibraryCollapsed: true,
  genericMaterialLibraryCollapsed: true,
  genericMaterialCategoryState: {},
  supplierMaterialLibraryCollapsed: false,
  customers: [],
  quotes: [],
  activeCustomerId: "",
  activeQuoteId: "",
  activePackageId: "",
  activePackageEstimateId: "",
  activePackageTab: "description",
  returnToPackageId: "",
  returnToPackageEstimateId: "",
  returnToPackageItemId: "",
  returnToTemplateId: "",
  returnToTemplateItemId: "",
  pendingLaborItemName: "",
  expandedLaborItemName: "",
  pendingMaterialId: "",
  returnToQuoteId: "",
  returnToLineId: "",
  pendingLineId: ""
};

const els = {};
let serverSaveInFlight = false;
let pendingServerSaveBody = "";

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  await loadState();
  bindEvents();
  renderAll();
});

function bindElements() {
  [
    "saveStatus", "printBtn", "resetBtn", "addQuoteBtn", "addQuotePackageBtn",
    "customerName", "customerContact", "customerPhone", "customerAddress", "customerList", "quoteList",
    "projectName", "editorProjectNameTitle", "showAmountColumns", "clientName", "clientPhone", "clientAddress", "quoteDate", "priceVersion", "libraryPriceVersion",
    "cloneVersionBtn", "renameVersionBtn", "deleteVersionBtn", "managementRate", "designRate", "taxRate", "includeManagementFee", "includeDesignFee", "includeTax", "managementRow", "designRow", "taxRow",
    "laborSubtotalText", "materialSubtotalText", "packageSubtotalText", "packageSubtotalRow", "managementText", "designText", "taxText", "grandTotalText", "quoteLines",
    "priceSearch", "priceCount", "priceList", "addPriceItemBtn", "previewTitle", "previewMeta", "previewTotal",
    "materialSearch", "materialCount", "materialList", "addMaterialBtn",
    "templateList", "templateCount", "addTemplateBtn",
    "packageList", "packageCount", "packageDetail", "addPackageBtn",
    "categoryList", "addCategoryBtn", "toggleCategoryLibraryBtn", "categoryLibraryPanel",
    "previewTableHead", "previewRows", "previewLaborSubtotal", "previewMaterialSubtotal", "previewPackageSubtotal", "previewPackageSubtotalRow", "previewManagement", "previewDesign", "previewTax", "previewGrand", "previewManagementRow", "previewDesignRow", "previewTaxRow"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

async function loadState() {
  const serverState = await loadStateFromServer();
  if (serverState) {
    Object.assign(state, serverState);
    normalizeState();
    updateLoadedStatus();
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

function updateLoadedStatus() {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = `已载入 SQLite · build ${APP_BUILD} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
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

function normalizeState() {
  state.versions = state.versions?.length ? state.versions : [];
  state.categories = normalizeCategories([...(state.categories || []), ...deriveCategoriesFromVersions(state.versions)]);
  state.genericMaterials = normalizeGenericMaterials(
    firstNonEmptyArray(state.materialKinds, state.genericMaterials, state.genericMaterialNames)
  );
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
  state.returnToPackageId = state.returnToPackageId || "";
  state.returnToPackageEstimateId = state.returnToPackageEstimateId || "";
  state.returnToPackageItemId = state.returnToPackageItemId || "";
  state.returnToTemplateId = state.returnToTemplateId || "";
  state.returnToTemplateItemId = state.returnToTemplateItemId || "";
  state.activePage = state.activePage || "manager";
  state.categoryLibraryCollapsed = state.categoryLibraryCollapsed ?? true;
  state.genericMaterialLibraryCollapsed = state.genericMaterialLibraryCollapsed ?? true;
  state.genericMaterialCategoryState = normalizeGenericMaterialCategoryState(state.genericMaterialCategoryState);
  state.supplierMaterialLibraryCollapsed = state.supplierMaterialLibraryCollapsed ?? false;
  if (!state.genericMaterialLibraryCollapsed && !state.supplierMaterialLibraryCollapsed) {
    state.supplierMaterialLibraryCollapsed = true;
  }
  state.returnToQuoteId = state.returnToQuoteId || "";
  state.returnToLineId = state.returnToLineId || "";
  state.pendingLineId = state.pendingLineId || "";
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
}

function normalizeTemplate(template, index = 0) {
  const name = String(template?.name || "").trim() || `模板 ${index + 1}`;
  const libraryOrderApplied = !(template?.libraryOrderApplied === false || template?.libraryOrderApplied === 0 || template?.libraryOrderApplied === "0");
  const items = (template?.items || []).map((item, itemIndex) => normalizeTemplateItem(item, itemIndex));
  const normalizedTemplate = {
    id: template?.id || makeId("template"),
    name,
    iconKey: validProjectGroupIconKey(template?.iconKey) || defaultTemplateIconKey(name),
    sortOrder: Number.isFinite(Number(template?.sortOrder)) ? Number(template.sortOrder) : index,
    collapsed: Boolean(template?.collapsed),
    libraryOrderApplied,
    items
  };
  if (!libraryOrderApplied) {
    normalizedTemplate.items = sortedTemplateItems(normalizedTemplate).map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
    normalizedTemplate.libraryOrderApplied = true;
  }
  return normalizedTemplate;
}

function markTemplateManualOrder(template) {
  if (template) template.libraryOrderApplied = false;
}

function templateForItem(templateItem) {
  return state.templates.find((template) => template.items?.some((item) => item.id === templateItem?.id));
}

function templateItemsByManualOrder(template) {
  return (template?.items || []).slice().sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder));
}

function templateItemsForEditing(template) {
  return template?.libraryOrderApplied === false ? templateItemsByManualOrder(template) : sortedTemplateItems(template);
}

function sortedTemplateItems(template) {
  return (template?.items || []).slice()
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareLibraryOrderEntries(
      libraryOrderEntryForTemplateItem(a.item, a.index),
      libraryOrderEntryForTemplateItem(b.item, b.index)
    ))
    .map((entry) => entry.item);
}

function sortTemplateItemsByLibraryOrder(template) {
  return sortedTemplateItems(template).map((item, index) => ({ ...item, sortOrder: index }));
}

function normalizeTemplateItem(item, index = 0) {
  const sourceType = item?.sourceType === "material" ? "material" : "labor";
  const material = item?.materialId ? findMaterial(item.materialId) : null;
  return {
    id: item?.id || makeId("template-item"),
    sourceType,
    itemName: String(item?.itemName || "").trim(),
    displayName: String(item?.displayName || "").trim(),
    materialKindId: String(item?.materialKindId || material?.materialKindId || "").trim(),
    materialId: String(item?.materialId || "").trim(),
    materialCategory: String(item?.materialCategory || "").trim(),
    area: String(item?.area || "").trim(),
    quantity: toNumber(item?.quantity),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
  };
}

/**
 * @param {Array<Partial<MaterialKind>>} [kinds]
 * @returns {MaterialKind[]}
 */
function normalizeGenericMaterials(kinds = []) {
  const byName = new Map();
  [...DEFAULT_GENERIC_MATERIALS.map((entry, index) => ({
    id: makeGenericMaterialId(entry[0]),
    name: entry[0],
    libraryCategory: entry[1],
    primaryCategory: entry[1],
    unit: entry[2],
    sortOrder: index,
    note: ""
  })), ...kinds].forEach((kind, index) => {
    const name = String(kind?.name || "").trim();
    if (!name) return;
    const key = normalizeName(name);
    byName.set(key, normalizeGenericMaterial(kind, index));
  });
  return [...byName.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * @param {Partial<MaterialKind> & { category?: string }} kind
 * @param {number} [index]
 * @returns {MaterialKind}
 */
function normalizeGenericMaterial(kind, index = 0) {
  const name = String(kind?.name || "").trim();
  return {
    id: kind?.id || makeGenericMaterialId(name) || makeId("generic-material"),
    name,
    libraryCategory: String(kind?.libraryCategory || kind?.managementCategory || kind?.library_category || kind?.primaryCategory || kind?.category || "未分类").trim(),
    primaryCategory: String(kind?.primaryCategory || kind?.category || MATERIAL_PRIMARY_CATEGORIES[0]).trim(),
    unit: String(kind?.unit || "项").trim(),
    costUnitPrice: toNumber(kind?.costUnitPrice),
    quoteUnitPrice: toNumber(kind?.quoteUnitPrice ?? kind?.unitPrice),
    unitPrice: toNumber(kind?.quoteUnitPrice ?? kind?.unitPrice),
    calcCostArea: toNumber(kind?.calcCostArea),
    calcCostPrice: toNumber(kind?.calcCostPrice),
    calcQuoteArea: toNumber(kind?.calcQuoteArea),
    calcQuotePrice: toNumber(kind?.calcQuotePrice),
    sortOrder: Number.isFinite(Number(kind?.sortOrder)) ? Number(kind.sortOrder) : index,
    note: String(kind?.note || "").trim()
  };
}

function makeGenericMaterialId(name) {
  const cleaned = normalizeName(name);
  if (!cleaned) return "";
  return `generic-material-${cleaned}`;
}

function normalizePackage(entry, index = 0) {
  const name = String(entry?.name || "").trim() || `清工辅料套餐 ${index + 1}`;
  const sections = (entry?.sections || []).map((section, sectionIndex) => normalizePackageSection(section, sectionIndex));
  const estimates = (entry?.estimates || []).map((estimate, estimateIndex) => normalizePackageEstimate(estimate, estimateIndex));
  if (!estimates.length) estimates.push(normalizePackageEstimate({ active: true }, 0));
  if (!estimates.some((estimate) => estimate.active)) estimates[0].active = true;
  keepOnlyOneOpenPackageSection(sections);
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
    sections,
    estimates
  };
}

function keepOnlyOneOpenPackageSection(sections) {
  let hasOpenSection = false;
  sections.slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((section) => {
    if (section.collapsed) return;
    if (!hasOpenSection) {
      hasOpenSection = true;
      return;
    }
    section.collapsed = true;
  });
}

function normalizePackageSection(section, index = 0) {
  return {
    id: section?.id || makeId("package-section"),
    name: String(section?.name || "").trim() || `说明分类 ${index + 1}`,
    originalTemplateName: String(section?.originalTemplateName || "").trim(),
    sortOrder: Number.isFinite(Number(section?.sortOrder)) ? Number(section.sortOrder) : index,
    collapsed: Boolean(section?.collapsed),
    items: (section?.items || []).map((item, itemIndex) => normalizePackageSectionItem(item, itemIndex))
  };
}

function normalizePackageSectionItem(item, index = 0) {
  const sourceType = item?.sourceType === "material" ? "material" : "labor";
  const area = String(item?.area ?? item?.provider ?? "").trim();
  const material = item?.materialId ? findMaterial(item.materialId) : null;
  const kind = findGenericMaterial(item?.materialKindId) || findGenericMaterial(material?.materialKindId);
  const itemName = String(item?.itemName || item?.name || kind?.name || material?.name || "").trim();
  const laborItem = sourceType === "labor" ? findLaborItem(itemName) : null;
  return {
    id: item?.id || makeId("package-section-item"),
    sourceType,
    name: String(item?.name || itemName).trim(),
    itemName,
    materialKindId: String(item?.materialKindId || findMaterial(item?.materialId)?.materialKindId || "").trim(),
    materialId: String(item?.materialId || "").trim(),
    materialCategory: String(item?.materialCategory || kind?.primaryCategory || material?.primaryCategory || "").trim(),
    unit: String(item?.unit || laborItem?.unit || material?.unit || kind?.unit || "").trim(),
    provider: area,
    area,
    description: String(item?.description || laborItem?.description || material?.note || kind?.note || "").trim(),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
  };
}

function normalizePackageEstimate(estimate, index = 0) {
  const groups = (estimate?.groups || []).map((group, groupIndex) => normalizePackageEstimateGroup(group, groupIndex));
  if (!groups.length) groups.push(normalizePackageEstimateGroup({ name: "整体", iconKey: "home" }, 0));
  keepOnlyOneOpenPackageEstimateGroup(groups);
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

function keepOnlyOneOpenPackageEstimateGroup(groups) {
  let hasOpenGroup = false;
  groups.slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((group) => {
    if (group.collapsed) return;
    if (!hasOpenGroup) {
      hasOpenGroup = true;
      return;
    }
    group.collapsed = true;
  });
}

function normalizePackageEstimateGroup(group, index = 0) {
  return {
    id: group?.id || makeId("package-group"),
    packageSectionId: String(group?.packageSectionId || "").trim(),
    name: String(group?.name || "").trim() || `测算组合 ${index + 1}`,
    iconKey: validProjectGroupIconKey(group?.iconKey) || "home",
    count: toNumber(group?.count ?? 1),
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
    packageSectionItemId: String(item?.packageSectionItemId || "").trim(),
    materialKindId: String(item?.materialKindId || "").trim(),
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
  const { materialSubcategory, family, laborFamily, ...rest } = item || {};
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
    aliases: normalizeLaborAliases(item?.aliases),
    quantityFormula: item?.quantityFormula || DEFAULT_QUANTITY_FORMULA,
    quantityRoundDown: Boolean(item?.quantityRoundDown),
    usesMaterial: false,
    materialCategory: "",
    defaultMaterialId: ""
  };
}

function normalizeLaborAliases(aliases) {
  let parsedAliases = aliases;
  if (typeof aliases === "string" && aliases.trim().startsWith("[")) {
    try {
      parsedAliases = JSON.parse(aliases);
    } catch {
      parsedAliases = aliases;
    }
  }
  const source = Array.isArray(parsedAliases)
    ? parsedAliases
    : String(parsedAliases || "").split(/\r?\n|[；;]/);
  const seen = new Set();
  return source.reduce((list, alias) => {
    const name = normalizeName(alias);
    if (!name || seen.has(name)) return list;
    seen.add(name);
    list.push(name);
    return list;
  }, []);
}

/**
 * @param {Partial<Material> & { category?: string, secondaryCategory?: string, subcategory?: string }} material
 * @param {number} [index]
 * @returns {Material}
 */
function normalizeMaterial(material, index = 0) {
  const quoteUnitPrice = material?.quoteUnitPrice ?? material?.unitPrice;
  const primaryCategory = String(material?.primaryCategory || material?.category || MATERIAL_PRIMARY_CATEGORIES[0]).trim();
  const { secondaryCategory, subcategory, ...rest } = material || {};
  return {
    ...rest,
    id: material?.id || makeId("material"),
    sortOrder: Number.isFinite(Number(material?.sortOrder)) ? Number(material.sortOrder) : index,
    name: String(material?.name || "").trim(),
    materialKindId: String(material?.materialKindId || "").trim(),
    primaryCategory,
    category: primaryCategory,
    spec: String(material?.spec || "").trim(),
    unit: String(material?.unit || "").trim(),
    costUnitPrice: toNumber(material?.costUnitPrice),
    quoteUnitPrice: toNumber(quoteUnitPrice),
    unitPrice: toNumber(quoteUnitPrice),
    calcCostArea: toNumber(material?.calcCostArea),
    calcCostPrice: toNumber(material?.calcCostPrice),
    calcQuoteArea: toNumber(material?.calcQuoteArea),
    calcQuotePrice: toNumber(material?.calcQuotePrice),
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
  syncQuoteItemLaborItemName(oldName, item.name)
    .forEach(({ quote, line }) => saveQuoteItemToServer(line, quote, "已同步工费名称"));
  if (state.expandedLaborItemName === oldName) state.expandedLaborItemName = item.name;
  if (state.pendingLaborItemName === oldName) state.pendingLaborItemName = item.name;
  return true;
}

function updateLaborItemNameFromInput(item, nextName, inputNode, rowNode) {
  const parsed = parsePriceNameUnit(nextName);
  if (!parsed) {
    inputNode?.classList?.add("invalid");
    return false;
  }
  const oldName = item.name;
  item.name = nextName;
  item.unit = parsed.unit;
  inputNode?.classList?.remove("invalid");
  const unitNode = rowNode?.querySelector?.(".price-unit-toggle b");
  if (unitNode) unitNode.textContent = parsed.unit;
  if (rowNode?.dataset) rowNode.dataset.itemName = item.name;
  syncQuoteItemLaborItemName(oldName, item.name)
    .forEach(({ quote, line }) => saveQuoteItemToServer(line, quote, "已同步工费名称"));
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

/**
 * @param {Partial<Quote>} quote
 * @returns {Quote}
 */
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
    includeManagementFee: quote.includeManagementFee !== false && quote.includeManagementFee !== 0,
    includeDesignFee: quote.includeDesignFee !== false && quote.includeDesignFee !== 0,
    includeTax: quote.includeTax !== false && quote.includeTax !== 0,
    showAmountColumns: quote.showAmountColumns !== false && quote.showAmountColumns !== 0,
    spaces: quote.spaces || [],
    lines: quote.lines || []
  };
  normalized.lines = normalized.lines.map((line) => normalizeQuoteItem(line, normalized.priceVersionId));
  normalized.spaces = normalizeProjectGroups(normalized.spaces, normalized.lines);
  normalized.lines = sortQuoteItemsForReload(normalized);
  return normalized;
}

/**
 * @param {Quote} quote
 * @returns {QuoteItem[]}
 */
function sortQuoteItemsForReload(quote) {
  const spaces = (quote.spaces || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const knownSpaceIds = new Set(spaces.map((space) => space.id));
  const sortedLines = spaces.flatMap((space) => {
    return (quote.lines || [])
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.line.spaceId === space.id)
      .sort((a, b) => compareLibraryOrderEntries(
        libraryOrderEntryForQuoteLine(a.line, a.index, quote.priceVersionId),
        libraryOrderEntryForQuoteLine(b.line, b.index, quote.priceVersionId)
      ))
      .map((entry) => entry.line);
  });
  return sortedLines.concat((quote.lines || []).filter((line) => !knownSpaceIds.has(line.spaceId)));
}

function compareLibraryOrderEntries(left, right) {
  if (left.typeRank !== right.typeRank) return left.typeRank - right.typeRank;
  if (left.categoryRank !== right.categoryRank) return left.categoryRank - right.categoryRank;
  if (left.itemRank !== right.itemRank) return left.itemRank - right.itemRank;
  return left.index - right.index;
}

function libraryOrderEntryForQuoteLine(line, index = 0, versionId = currentVersion()?.id) {
  if (isMaterialQuoteItem(line)) {
    return { typeRank: 1, ...materialLibraryRank(line), index };
  }
  return { typeRank: 0, ...laborLibraryRank(line.priceItemName, versionId), index };
}

function libraryOrderEntryForTemplateItem(item, index = 0, versionId = currentVersion()?.id) {
  if (item.sourceType === "material") {
    return { typeRank: 1, ...materialLibraryRank(item), index };
  }
  return { typeRank: 0, ...laborLibraryRank(item.itemName, versionId), index };
}

function laborLibraryRank(itemName, versionId = currentVersion()?.id) {
  const version = state.versions.find((entry) => entry.id === versionId) || currentVersion();
  const categoryIndex = new Map(currentCategories().map((category, index) => [category.id, index]));
  const orderedItems = (version?.items || []).slice().sort((a, b) => {
    const leftCategory = categoryIndex.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER;
    const rightCategory = categoryIndex.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER;
    if (leftCategory !== rightCategory) return leftCategory - rightCategory;
    if (toNumber(a.sortOrder) !== toNumber(b.sortOrder)) return toNumber(a.sortOrder) - toNumber(b.sortOrder);
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
  });
  const item = orderedItems.find((entry) => entry.name === itemName);
  return {
    categoryRank: item ? (categoryIndex.get(item.categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
    itemRank: item ? orderedItems.findIndex((entry) => entry.name === item.name) : Number.MAX_SAFE_INTEGER
  };
}

function materialLibraryRank(item) {
  const material = findMaterial(item.materialId);
  const kind = findGenericMaterial(item.materialKindId) || findGenericMaterial(material?.materialKindId);
  const materialCategoryIndex = new Map(MATERIAL_PRIMARY_CATEGORIES.map((category, index) => [category, index]));
  const materialIndex = new Map((state.materials || []).slice()
    .sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder) || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"))
    .map((entry, index) => [entry.id, index]));
  const kindIndex = new Map(currentGenericMaterials().map((entry, index) => [entry.id, index]));
  const category = kind?.primaryCategory || material?.primaryCategory || item.materialCategory || "";
  return {
    categoryRank: materialCategoryIndex.get(category) ?? Number.MAX_SAFE_INTEGER,
    itemRank: material
      ? (materialIndex.get(material.id) ?? Number.MAX_SAFE_INTEGER)
      : (kindIndex.get(kind?.id) ?? Number.MAX_SAFE_INTEGER)
  };
}

/**
 * @param {Array<Partial<ProjectGroup>>} spaces
 * @param {QuoteItem[]} [lines]
 * @returns {ProjectGroup[]}
 */
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

  const sorted = normalized.sort((a, b) => a.sortOrder - b.sortOrder).map((space, index) => ({ ...space, sortOrder: index }));
  const byName = new Map(sorted.map((space) => [space.name, space]));
  const fallback = sorted[0];
  lines.forEach((line) => {
    if (sorted.some((space) => space.id === line.spaceId)) return;
    const matched = byName.get(String(line.area || "").trim());
    line.spaceId = matched?.id || fallback.id;
  });
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

/**
 * @param {Partial<ProjectGroup> & { type?: string }} space
 * @param {number} [index]
 * @returns {ProjectGroup}
 */
function normalizeProjectGroup(space, index = 0) {
  const wasOverall = space.type === "overall" || String(space.name || "").trim() === "整体";
  const area = toNumber(space.area) || (wasOverall ? toNumber(space.buildingArea) : 0);
  const type = space.type === "package" ? "package" : "space";
  return {
    id: space.id || makeId("group"),
    name: String(space.name || "项目组合").trim() || "项目组合",
    packageLabel: String(space.packageLabel || "套餐").trim() || "套餐",
    type,
    workType: space.workType === "material" ? "material" : "labor",
    iconKey: validProjectGroupIconKey(space.iconKey) || defaultProjectGroupIconKey(space),
    templateId: String(space.templateId || "").trim(),
    packageId: String(space.packageId || "").trim(),
    area,
    perimeter: toNumber(space.perimeter),
    height: toNumber(space.height),
    buildingArea: toNumber(space.buildingArea),
    unitPricePerSqm: toNumber(space.unitPricePerSqm),
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
  if (space.type === "package") return "box";
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

function materialsForKind(kindId = "") {
  return state.materials
    .filter((material) => !kindId || material.materialKindId === kindId)
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), "zh-CN"));
}

function materialProductOptionsForLine(line) {
  const kindId = line.materialKindId || findMaterial(line.materialId)?.materialKindId || "";
  const products = kindId ? materialsForKind(kindId) : state.materials.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return [`<option value="">按抽象主材基准价</option>`].concat(products.map((material) => (
    `<option value="${escapeHtml(material.id)}" ${material.id === line.materialId ? "selected" : ""}>${escapeHtml(material.name)}</option>`
  ))).join("");
}

function materialPriceDifference(line, type = "quote") {
  const material = findMaterial(line.materialId);
  const kind = findGenericMaterial(line.materialKindId) || findGenericMaterial(material?.materialKindId);
  if (!material || !kind) return 0;
  const materialPrice = type === "cost" ? material.costUnitPrice : material.quoteUnitPrice;
  const kindPrice = type === "cost" ? kind.costUnitPrice : kind.quoteUnitPrice;
  return toNumber(materialPrice) - toNumber(kindPrice);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });
  els.printBtn.addEventListener("click", () => {
    switchPage("editor");
    setTimeout(printQuotePdf, 50);
  });
  els.resetBtn.addEventListener("click", backupDatabase);
  els.addQuoteBtn.addEventListener("click", addQuote);
  if (els.addQuotePackageBtn) els.addQuotePackageBtn.addEventListener("click", openAddQuotePackageDialog);
  els.cloneVersionBtn.addEventListener("click", cloneVersion);
  els.renameVersionBtn.addEventListener("click", renameVersion);
  if (els.deleteVersionBtn) els.deleteVersionBtn.addEventListener("click", deleteVersion);
  if (els.addPriceItemBtn) els.addPriceItemBtn.addEventListener("click", addLaborItem);
  if (els.addMaterialBtn) els.addMaterialBtn.addEventListener("click", () => addMaterial());
  if (els.addTemplateBtn) els.addTemplateBtn.addEventListener("click", addTemplate);
  if (els.addPackageBtn) els.addPackageBtn.addEventListener("click", addPackage);
  if (els.addCategoryBtn) els.addCategoryBtn.addEventListener("click", addCategory);
  if (els.toggleCategoryLibraryBtn) {
    els.toggleCategoryLibraryBtn.addEventListener("click", toggleCategoryLibrary);
  }
  window.addEventListener("beforeunload", flushServerSaveBeforeUnload);
  els.priceSearch.addEventListener("input", renderLaborLibrary);
  if (els.materialSearch) els.materialSearch.addEventListener("input", renderMaterials);
  if (els.materialList) {
    els.materialList.addEventListener("click", handleMaterialListClick);
  }
  els.priceVersion.addEventListener("change", () => setQuoteField("priceVersionId", els.priceVersion.value, true));
  els.libraryPriceVersion.addEventListener("change", () => {
    state.activeVersionId = els.libraryPriceVersion.value;
    const quote = currentQuote();
    if (quote) quote.priceVersionId = state.activeVersionId;
    saveUiStatePatch({ activeVersionId: state.activeVersionId }, "已切换工费版本");
    if (quote) saveQuoteToServer(quote, "已切换工费版本");
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
  if (els.includeManagementFee) {
    els.includeManagementFee.addEventListener("change", () => {
      setQuoteField("includeManagementFee", els.includeManagementFee.checked, true);
    });
  }
  if (els.includeDesignFee) {
    els.includeDesignFee.addEventListener("change", () => {
      setQuoteField("includeDesignFee", els.includeDesignFee.checked, true);
    });
  }
  if (els.includeTax) {
    els.includeTax.addEventListener("change", () => {
      setQuoteField("includeTax", els.includeTax.checked, true);
    });
  }
  ["customerName", "customerContact", "customerPhone", "customerAddress"].forEach((id) => {
    if (els[id]) els[id].addEventListener("input", updateActiveCustomerFromForm);
  });
}

function switchPage(page, options = {}) {
  state.activePage = page;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `${page}Page`);
  });
  if (!options.silent) saveUiStatePatch({ activePage: state.activePage }, "已切换页面");
}

function currentQuote() {
  return state.quotes.find((quote) => quote.id === state.activeQuoteId)
    || state.quotes.find((quote) => quote.customerId === state.activeCustomerId)
    || state.quotes[0];
}

function currentPackage() {
  return state.packages.find((entry) => entry.id === state.activePackageId) || state.packages[0];
}

function findPackage(packageId) {
  return state.packages.find((entry) => entry.id === packageId);
}

function currentPackageEstimate(packageEntry = currentPackage()) {
  return packageEntry?.estimates?.find((estimate) => estimate.id === state.activePackageEstimateId)
    || packageEntry?.estimates?.find((estimate) => estimate.active)
    || packageEntry?.estimates?.[0];
}

function packageSectionForItem(sectionItem) {
  for (const packageEntry of state.packages || []) {
    const section = (packageEntry.sections || []).find((entry) => entry.items?.some((item) => item.id === sectionItem?.id));
    if (section) return section;
  }
  return null;
}

function packageEstimateForGroup(group) {
  for (const packageEntry of state.packages || []) {
    const estimate = (packageEntry.estimates || []).find((entry) => entry.groups?.some((item) => item.id === group?.id));
    if (estimate) return estimate;
  }
  return null;
}

function packageEstimateForItem(estimateItem) {
  for (const packageEntry of state.packages || []) {
    const estimate = (packageEntry.estimates || []).find((entry) => entry.items?.some((item) => item.id === estimateItem?.id));
    if (estimate) return estimate;
  }
  return null;
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

function currentGenericMaterials() {
  return (state.genericMaterials || []).slice().sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), "zh-CN"));
}

function genericMaterialCategoryName(name) {
  return String(name || "未分类").trim() || "未分类";
}

function genericMaterialCategoryNames() {
  const names = [];
  const seen = new Set();
  currentGenericMaterials().forEach((kind) => {
    const name = genericMaterialCategoryName(kind.libraryCategory);
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

function normalizeGenericMaterialCategoryState(source = {}) {
  const names = genericMaterialCategoryNames();
  const sourceState = source && typeof source === "object" ? source : {};
  const result = {};
  names.forEach((name, index) => {
    const entry = sourceState[name] || {};
    const sortOrder = Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index;
    const hasPersistedState = Object.prototype.hasOwnProperty.call(sourceState, name);
    result[name] = {
      collapsed: hasPersistedState ? Boolean(entry.collapsed) : index > 0,
      sortOrder
    };
  });
  names.sort((a, b) => result[a].sortOrder - result[b].sortOrder || a.localeCompare(b, "zh-CN"));
  const openName = names.find((name) => !result[name].collapsed) || "";
  names.forEach((name, index) => {
    result[name].collapsed = openName ? name !== openName : true;
    result[name].sortOrder = index;
  });
  return result;
}

function sortedGenericMaterialCategories() {
  state.genericMaterialCategoryState = normalizeGenericMaterialCategoryState(state.genericMaterialCategoryState);
  return genericMaterialCategoryNames().sort((a, b) => {
    const aState = state.genericMaterialCategoryState[a] || {};
    const bState = state.genericMaterialCategoryState[b] || {};
    return (aState.sortOrder ?? 0) - (bState.sortOrder ?? 0) || a.localeCompare(b, "zh-CN");
  });
}

function genericMaterialsForManagement() {
  const categoryOrder = new Map(sortedGenericMaterialCategories().map((category, index) => [category, index]));
  return currentGenericMaterials()
    .map((kind, index) => ({ kind, index }))
    .sort((a, b) => (
      (categoryOrder.get(genericMaterialCategoryName(a.kind.libraryCategory)) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(genericMaterialCategoryName(b.kind.libraryCategory)) ?? Number.MAX_SAFE_INTEGER)
      || a.kind.sortOrder - b.kind.sortOrder
      || a.index - b.index
    ))
    .map((entry) => entry.kind);
}

function supplierMaterialsForDisplay(materials = state.materials) {
  const genericOrder = new Map(genericMaterialsForManagement().map((kind, index) => [kind.id, index]));
  return (materials || [])
    .slice()
    .sort((a, b) => {
      const aKindOrder = genericOrder.get(a.materialKindId) ?? Number.MAX_SAFE_INTEGER;
      const bKindOrder = genericOrder.get(b.materialKindId) ?? Number.MAX_SAFE_INTEGER;
      return aKindOrder - bKindOrder
        || String(a.brand || "").localeCompare(String(b.brand || ""), "zh-CN")
        || a.sortOrder - b.sortOrder
        || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
}

function findLaborItem(name, versionId = currentVersion()?.id) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  return version?.items.find((item) => item.name === name);
}

function findLaborAliasMatch(name) {
  const cleaned = normalizeName(name).toLowerCase();
  if (!cleaned) return null;
  for (const item of currentLaborItems()) {
    const alias = (item.aliases || []).find((entry) => normalizeName(entry).toLowerCase() === cleaned);
    if (alias) return { item, alias };
  }
  return null;
}

function hasLaborPrefixMatch(name) {
  const cleaned = normalizeName(name).toLowerCase();
  if (!cleaned) return false;
  return currentLaborItems().some((item) => [item.name, ...(item.aliases || [])].some((entry) => {
    const itemName = normalizeName(entry).toLowerCase();
    return itemName !== cleaned && itemName.startsWith(cleaned);
  }));
}

function prioritizeExactLaborAlias(matches, exactAliasMatch) {
  if (!exactAliasMatch) return matches;
  const remaining = matches.filter((match) => (
    match.item.name !== exactAliasMatch.item.name || match.alias !== exactAliasMatch.alias
  ));
  return [exactAliasMatch, ...remaining];
}

function findMaterial(id) {
  return state.materials.find((material) => material.id === id);
}

function findGenericMaterial(idOrName) {
  const cleaned = normalizeName(idOrName);
  return state.genericMaterials.find((kind) => kind.id === idOrName || normalizeName(kind.name) === cleaned);
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

function categoryToneClass(categoryName = "") {
  const name = normalizeName(categoryName);
  if (!name) return "category-tone-empty";
  const laborIndex = currentCategories().findIndex((category) => category.name === name);
  if (laborIndex >= 0) return `category-tone-${laborIndex % 4}`;
  const materialIndex = MATERIAL_PRIMARY_CATEGORIES.findIndex((category) => category === name);
  if (materialIndex >= 0) return `category-tone-${materialIndex % 4}`;
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return `category-tone-${hash % 4}`;
}

function genericMaterialOptions(value = "", includeEmpty = true) {
  const options = includeEmpty ? [`<option value="">未关联</option>`] : [];
  return options.concat(currentGenericMaterials().map((kind) => (
    `<option value="${escapeHtml(kind.id)}" ${kind.id === value ? "selected" : ""}>${escapeHtml(kind.name)}</option>`
  ))).join("");
}

function genericMaterialInputValue(value = "") {
  return findGenericMaterial(value)?.name || "";
}

function renderGenericMaterialDatalist() {
  return `
    <datalist id="genericMaterialChoices">
      ${currentGenericMaterials().map((kind) => (
        `<option value="${escapeHtml(kind.name)}">${escapeHtml(kind.libraryCategory || kind.primaryCategory || "")}</option>`
      )).join("")}
    </datalist>
  `;
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

/**
 * @param {Partial<QuoteItem> & { itemName?: string, customPrice?: number }} line
 * @param {string} [versionId]
 * @returns {QuoteItem}
 */
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
    sourceType: line.sourceType === "material" || line.materialId || line.materialKindId ? "material" : "labor",
    area: line.area || "",
    spaceId: line.spaceId || "",
    materialKindId: String(line.materialKindId || findMaterial(line.materialId)?.materialKindId || "").trim(),
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

/**
 * @param {Partial<QuoteItem>|null|undefined} line
 * @returns {boolean}
 */
function isMaterialQuoteItem(line) {
  return line?.sourceType === "material" || Boolean(line?.materialId || line?.materialKindId);
}

function renderAll() {
  if (state.loadBlocked) return;
  switchPage(state.activePage, { silent: true });
  renderManager();
  renderSettings();
  renderLines();
  renderLaborLibrary();
  renderMaterials();
  renderTemplates();
  renderPackages();
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
        saveUiStatePatch({ activeCustomerId: state.activeCustomerId, activeQuoteId: state.activeQuoteId }, "已选择客户");
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
      const quote = state.quotes.find((entry) => entry.id === state.activeQuoteId);
      if (quote) state.activeCustomerId = quote.customerId || state.activeCustomerId;
      saveUiStatePatch({ activeCustomerId: state.activeCustomerId, activeQuoteId: state.activeQuoteId }, "已打开报价");
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
  if (els.includeManagementFee) els.includeManagementFee.checked = quote.includeManagementFee !== false;
  if (els.includeDesignFee) els.includeDesignFee.checked = quote.includeDesignFee !== false;
  if (els.includeTax) els.includeTax.checked = quote.includeTax !== false;
  const versionOptions = versionsNewestFirst().map((version) => (
    `<option value="${escapeHtml(version.id)}">${escapeHtml(version.name)}</option>`
  )).join("");
  els.priceVersion.innerHTML = versionOptions;
  els.libraryPriceVersion.innerHTML = versionOptions;
  els.priceVersion.value = quote.priceVersionId;
  els.libraryPriceVersion.value = state.activeVersionId;
}

function versionsNewestFirst() {
  return state.versions
    .map((version, index) => ({ version, index }))
    .sort((a, b) => {
      const createdCompare = String(b.version.createdAt || "").localeCompare(String(a.version.createdAt || ""));
      return createdCompare || b.index - a.index;
    })
    .map((entry) => entry.version);
}

function renderLines() {
  const quote = currentQuote();
  if (!quote) return;
  const spaces = sortedProjectGroups(quote);
  els.quoteLines.innerHTML = `
    ${renderProjectGroupInsertSlot(0)}
    ${spaces.map((space, spaceIndex) => {
    if (space.type === "package") {
      return `${renderQuotePackageGroup(space)}${renderProjectGroupInsertSlot(spaceIndex + 1)}`;
    }
    const spaceLines = quoteItemsForProjectGroup(quote, space.id);
    return `
      <section class="space-card ${space.collapsed ? "collapsed" : ""}" data-space-id="${escapeHtml(space.id)}" draggable="true">
        <div class="space-head">
          <div class="space-title">
            <button class="space-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动项目组合排序" aria-label="点击展开或收缩，拖动项目组合排序" aria-expanded="${String(!space.collapsed)}">⋮⋮</button>
            <div class="space-icon-wrap">
              <button class="space-icon-btn" type="button" aria-label="选择项目组合图标" title="选择图标">${renderProjectGroupIcon(space.iconKey)}</button>
              <div class="space-icon-picker" hidden>
                ${renderProjectGroupIconChoices(space.iconKey)}
              </div>
            </div>
            <input class="space-name" type="text" aria-label="项目组合名称" value="${escapeHtml(space.name)}">
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
        saveProjectGroupToServer(space, quote, "已更新项目组合图标");
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
      saveProjectGroupToServer(space, quote, "已自动保存");
      renderAll();
    });
    const packageLabelInput = spaceNode.querySelector(".space-package-label");
    if (packageLabelInput) {
      bindProjectGroupEnterFeedback(packageLabelInput, spaceNode);
      packageLabelInput.addEventListener("input", (event) => {
        space.packageLabel = String(event.target.value || "").trim() || "套餐";
        const badge = spaceNode.querySelector(".space-count");
        if (badge) badge.textContent = space.packageLabel;
        saveProjectGroupToServer(space, quote, "已自动保存");
        renderTotalsAndPreview();
      });
    }
    const areaInput = spaceNode.querySelector(".space-area");
    if (areaInput) {
      bindProjectGroupEnterFeedback(areaInput, spaceNode, true);
      areaInput.addEventListener("input", (event) => {
        space.area = toNumber(event.target.value);
        saveProjectGroupToServer(space, quote, "已自动保存");
        refreshRecommendedQuantities(space.id);
        quoteItemsForProjectGroup(quote, space.id).forEach((line) => saveQuoteItemToServer(line, quote, "已同步推荐工程量"));
        renderTotalsAndPreview();
      });
    }
    const perimeterInput = spaceNode.querySelector(".space-perimeter");
    if (perimeterInput) {
      bindProjectGroupEnterFeedback(perimeterInput, spaceNode, true);
      perimeterInput.addEventListener("input", (event) => {
        space.perimeter = toNumber(event.target.value);
        saveProjectGroupToServer(space, quote, "已自动保存");
        refreshRecommendedQuantities(space.id);
        quoteItemsForProjectGroup(quote, space.id).forEach((line) => saveQuoteItemToServer(line, quote, "已同步推荐工程量"));
        renderTotalsAndPreview();
      });
    }
    const heightInput = spaceNode.querySelector(".space-height");
    if (heightInput) {
      bindProjectGroupEnterFeedback(heightInput, spaceNode, true);
      heightInput.addEventListener("input", (event) => {
        space.height = toNumber(event.target.value);
        saveProjectGroupToServer(space, quote, "已自动保存");
        refreshRecommendedQuantities(space.id);
        quoteItemsForProjectGroup(quote, space.id).forEach((line) => saveQuoteItemToServer(line, quote, "已同步推荐工程量"));
        renderTotalsAndPreview();
      });
    }
    spaceNode.querySelector(".quote-package-select")?.addEventListener("change", (event) => {
      const packageEntry = findPackage(event.target.value);
      space.packageId = packageEntry?.id || "";
      if (packageEntry) space.name = packageEntry.name;
      saveProjectGroupToServer(space, quote, "已更新报价套餐");
      renderAll();
    });
    const packageBuildingAreaInput = spaceNode.querySelector(".package-building-area");
    if (packageBuildingAreaInput) {
      bindProjectGroupEnterFeedback(packageBuildingAreaInput, spaceNode, true);
      packageBuildingAreaInput.addEventListener("input", (event) => {
        space.buildingArea = toNumber(event.target.value);
        updatePackageAmountCell(spaceNode, space);
        saveProjectGroupToServer(space, quote, "已自动保存");
        renderTotalsAndPreview();
      });
    }
    const packageUnitPriceInput = spaceNode.querySelector(".package-unit-price");
    if (packageUnitPriceInput) {
      bindProjectGroupEnterFeedback(packageUnitPriceInput, spaceNode, true);
      packageUnitPriceInput.addEventListener("input", (event) => {
        space.unitPricePerSqm = toNumber(event.target.value);
        updatePackageAmountCell(spaceNode, space);
        saveProjectGroupToServer(space, quote, "已自动保存");
        renderTotalsAndPreview();
      });
    }
    spaceNode.querySelector(".add-space-labor-line")?.addEventListener("click", () => addQuoteItem(space.id, "labor"));
    spaceNode.querySelector(".add-space-material-line")?.addEventListener("click", () => addQuoteItem(space.id, "material"));
    spaceNode.querySelector(".sync-space-template")?.addEventListener("click", () => openSyncProjectGroupTemplateDialog(space.id));
    spaceNode.querySelector(".delete-space")?.addEventListener("click", () => deleteProjectGroup(space.id));
  });

  bindProjectGroupDragAndDrop();

  els.quoteLines.querySelectorAll(".insert-project-group-slot").forEach((button) => {
    button.addEventListener("click", () => openAddProjectGroupDialog(Number(button.dataset.position || 0)));
  });

  els.quoteLines.querySelectorAll(".quote-line-insert-slot").forEach((slot) => {
    const position = Number(slot.dataset.position || 0);
    slot.querySelector(".insert-quote-labor")?.addEventListener("click", () => addQuoteItemAt(slot.dataset.spaceId, position, "labor"));
    slot.querySelector(".insert-quote-material")?.addEventListener("click", () => addQuoteItemAt(slot.dataset.spaceId, position, "material"));
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

function updatePackageAmountCell(spaceNode, space) {
  const cell = spaceNode?.querySelector?.(".space-amount");
  if (cell) {
    cell.textContent = formatMoney(toNumber(space.buildingArea) * toNumber(space.unitPricePerSqm));
  }
}

function renderQuotePackageGroup(space) {
  const packageEntry = findPackage(space.packageId);
  const packageOptions = sortedPackages().map((entry) => (
    `<option value="${escapeHtml(entry.id)}" ${entry.id === space.packageId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`
  )).join("");
  return `
    <section class="space-card quote-package-card ${space.collapsed ? "collapsed" : ""}" data-space-id="${escapeHtml(space.id)}" draggable="true">
      <div class="space-head quote-package-head">
        <div class="space-title">
          <button class="space-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动套餐排序" aria-label="点击展开或收缩，拖动套餐排序" aria-expanded="${String(!space.collapsed)}">⋮⋮</button>
          <div class="space-icon-wrap">
            <button class="space-icon-btn" type="button" aria-label="选择套餐图标" title="选择图标">${renderProjectGroupIcon(space.iconKey)}</button>
            <div class="space-icon-picker" hidden>
              ${renderProjectGroupIconChoices(space.iconKey)}
            </div>
          </div>
          <label class="space-package-label-row">
            <span class="space-package-label-text">报价单视图中的"套餐"字样</span>
            <input class="space-package-label" type="text" aria-label="报价单视图中的套餐字样" value="${escapeHtml(space.packageLabel || "套餐")}" placeholder="套餐">
          </label>
        </div>
        <div class="space-sub-row">
          <input class="space-name" type="text" aria-label="套餐名称" value="${escapeHtml(space.name)}">
          <select class="quote-package-select" aria-label="选择套餐">
            ${packageOptions}
          </select>
          <div class="space-actions">
            <button class="delete-space danger small" type="button">删除套餐</button>
          </div>
          <label class="space-metric">建筑面积（平米）<input class="package-building-area" type="number" min="0" step="0.01" aria-label="建筑面积（平米）" value="${space.buildingArea}"></label>
          <label class="space-metric">单方报价（元/平米）<input class="package-unit-price" type="number" min="0" step="0.01" aria-label="单方报价（元/平米）" value="${space.unitPricePerSqm}"></label>
          <div class="space-metric space-amount-cell" aria-label="套餐报价金额">
            <span class="space-metric-label">金额</span>
            <strong class="space-amount" data-space-id="${escapeHtml(space.id)}">${formatMoney(toNumber(space.buildingArea) * toNumber(space.unitPricePerSqm))}</strong>
          </div>
        </div>
      </div>
      ${space.collapsed ? "" : `
        <div class="quote-package-note">
          ${packageEntry ? renderPackageQuoteSummary(packageEntry) : "<p class=\"muted\">这个报价套餐没有关联到套餐库。</p>"}
        </div>
      `}
    </section>
  `;
}

function packageQuoteSummary(packageEntry) {
  const sections = (packageEntry?.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const specialSections = sections
    .map((section) => ({
      section,
      items: (section.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    }))
    .filter((entry) => entry.items.length);
  return { packageEntry, sections, specialSections };
}

function packageSectionItemQuoteLabel(item) {
  const name = packageSectionItemDisplayName(item) || item.itemName || item.name || "";
  const part = normalizeName(item.area || item.provider);
  return part ? `${name}（${part}）` : name;
}

function renderPackageQuoteSummary(packageEntry) {
  const summary = packageQuoteSummary(packageEntry);
  if (!summary.specialSections.length) return `<p class="muted">这个套餐还没有项目组合。</p>`;
  return `
    <div class="package-quote-summary">
      ${summary.specialSections.map(({ section, items }) => `
        <div>
          <strong>${escapeHtml(section.name)}</strong>
          ${renderPackageQuoteItemList(items, "无特殊项目")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderPackageQuoteItemList(items, emptyText = "无项目") {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<div class="package-quote-item-list">${items.map((item) => renderPackageQuoteItemReadonlyRow(item)).join("")}</div>`;
}

function renderPackageQuoteItemReadonlyRow(item) {
  const typeLabel = item.sourceType === "material" ? "装修主材" : "清工辅料";
  const name = packageSectionItemDisplayName(item) || item.itemName || item.name || "";
  const part = item.area || item.provider || "";
  const processNote = packageSectionItemProcessNote(item);
  return `
    <div class="line-item line-item-readonly package-quote-item" data-item-id="${escapeHtml(item.id)}">
      <div class="package-quote-type">${escapeHtml(typeLabel)}</div>
      <div class="package-quote-name">${escapeHtml(name)}</div>
      <div class="package-quote-part">${escapeHtml(part)}</div>
      <div class="package-quote-process">${processNote ? escapeHtml(processNote) : ""}</div>
    </div>
  `;
}

function packageSectionItemProcessNote(item) {
  if (item.sourceType === "material") return "";
  const versionId = currentQuote()?.priceVersionId || currentVersion()?.id;
  return processNoteForQuoteItem({ priceItemName: item.itemName }, versionId);
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
    <div class="insert-line-slot quote-line-insert-slot" data-space-id="${escapeHtml(spaceId)}" data-position="${position}" aria-label="在这里添加工程项目">
      ${renderLaborMaterialInsertActions("line-insert-actions", "insert-quote-labor", "insert-quote-material")}
    </div>
  `;
}

function renderLaborMaterialInsertActions(actionsClass, laborClass, materialClass) {
  return `
    <div class="${actionsClass}">
      <button class="${laborClass}" type="button">工费</button>
      <button class="${materialClass}" type="button">主材</button>
    </div>
  `;
}

function normalizeInsertPosition(position, length) {
  if (position === null || position === undefined) return length;
  return Math.max(0, Math.min(Number(position || 0), length));
}

function insertItemAndRenumberSortOrder(items, item, position, sortKey = "sortOrder") {
  const nextItems = (items || []).slice();
  nextItems.splice(normalizeInsertPosition(position, nextItems.length), 0, item);
  if (sortKey) nextItems.forEach((entry, index) => { entry[sortKey] = index; });
  return nextItems;
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
        <div class="line-field action-field">
          <label class="action-label" aria-hidden="true">&nbsp;</label>
          <button class="remove-btn" type="button" aria-label="删除">×</button>
        </div>
      </div>
    `;
}

function renderMaterialQuoteItem(line, quote) {
  const material = findMaterial(line.materialId);
  const materialKind = findGenericMaterial(line.materialKindId) || findGenericMaterial(line.engineeringName);
  const selectedCategory = line.materialCategory || materialKind?.primaryCategory || material?.primaryCategory || "";
  const unitPrice = calculateQuoteItemUnitPrice(line);
  const costUnitPrice = calculateQuoteItemCostUnitPrice(line, quote.priceVersionId);
  const amount = toNumber(line.quantity) * unitPrice;
  const quoteDiff = materialPriceDifference(line, "quote");
  const costDiff = materialPriceDifference(line, "cost");
  return `
    <div class="line-item material-line" data-line-id="${escapeHtml(line.id)}">
      <div class="line-field project-field">
        <label>主材项目名称</label>
        <div class="project-picker">
          <input class="line-material-main line-name" type="text" aria-label="主材项目名称" placeholder="输入地砖、墙砖、门等抽象主材" value="${escapeHtml(line.engineeringName || materialKind?.name || material?.name || "")}" autocomplete="off">
          <div class="suggestions"></div>
        </div>
      </div>
      <div class="line-field part-field">
        <label>部位</label>
        <input class="line-part" type="text" aria-label="部位" placeholder="" value="${escapeHtml(line.area || "")}">
      </div>
      <div class="line-field recommended-field">
        <label>主材类目</label>
        <div class="material-product-picker">
          <button class="line-material-category readonly-price ${categoryToneClass(selectedCategory)}" type="button" disabled>${escapeHtml(selectedCategory || "自动")}</button>
          <select class="line-material-product" aria-label="具体产品">${materialProductOptionsForLine(line)}</select>
        </div>
      </div>
      <div class="line-field qty-field">
        <label>工程量</label>
        <input class="line-qty" type="number" min="0" step="0.01" aria-label="工程量" placeholder="数量" value="${line.quantity}">
      </div>
      <div class="line-field unit-field">
        <label>单位</label>
        <button class="line-unit jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${escapeHtml(material?.unit || materialKind?.unit || "")}</button>
      </div>
      <div class="line-field material-field">
        <label>类型</label>
        <button class="line-unit" type="button" disabled>装修主材</button>
      </div>
      <div class="line-field price-field">
        <label>单价合计</label>
        <button class="readonly-price jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(unitPrice)}${line.materialId ? `<small>${formatSignedMoney(quoteDiff)}</small>` : ""}</button>
      </div>
      <div class="line-field cost-price-field">
        <label>成本单价</label>
        <button class="readonly-price jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(costUnitPrice)}${line.materialId ? `<small>${formatSignedMoney(costDiff)}</small>` : ""}</button>
      </div>
      <div class="line-field amount-field">
        <label>金额</label>
        <button class="amount jump-price-item jump-material-item" type="button" ${line.materialId ? "" : "disabled"}>${formatMoney(amount)}</button>
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
  bindSuggestionSearchInput(nameInput, suggestions, {
    onInput: (value) => {
      line.engineeringName = value;
      saveQuoteItemToServer(line, quote, "已自动保存");
      renderSuggestions(suggestions, line, value);
      renderTotalsAndPreview();
    },
    onFocus: (value) => renderSuggestions(suggestions, line, value),
    onKeydown: (event) => handleSuggestionKeys(event, suggestions, line)
  });
  bindQuoteItemPartInput(node, line);
  const materialSelect = node.querySelector(".line-material");
  if (materialSelect) {
    materialSelect.addEventListener("change", (event) => {
      line.materialId = event.target.value;
      saveQuoteItemToServer(line, quote, "已选择主材");
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
    saveQuoteItemToServer(line, quote, "已自动保存");
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
    confirmSimpleDelete(line.engineeringName || "工程项目", () => {
      quote.lines = quote.lines.filter((entry) => entry.id !== line.id);
      deleteQuoteItemFromServer(line.id, "已删除工程项目");
      renderAll();
    });
  });
}

function bindMaterialQuoteItem(node, quote, line) {
  const materialInput = node.querySelector(".line-material-main");
  const suggestions = node.querySelector(".suggestions");
  bindSuggestionSearchInput(materialInput, suggestions, {
    onInput: (value) => {
      line.engineeringName = value;
      line.materialId = "";
      saveQuoteItemToServer(line, quote, "已自动保存");
      renderMaterialSuggestions(suggestions, line, value);
      renderTotalsAndPreview();
    },
    onFocus: (value) => renderMaterialSuggestions(suggestions, line, value),
    onKeydown: (event) => handleMaterialSuggestionKeys(event, suggestions, line)
  });
  bindQuoteItemPartInput(node, line);
  node.querySelector(".line-material-product")?.addEventListener("change", (event) => {
    const material = findMaterial(event.target.value);
    line.materialId = material?.id || "";
    if (material) {
      const kind = findGenericMaterial(material.materialKindId) || findGenericMaterial(line.materialKindId);
      line.materialKindId = kind?.id || line.materialKindId || "";
      line.materialCategory = kind?.primaryCategory || material.primaryCategory || material.category || "";
      line.engineeringName = kind?.name || line.engineeringName || material.name;
    }
    saveQuoteItemToServer(line, quote, material ? "已匹配具体主材" : "已改回抽象主材基准价");
    renderLines();
    renderTotalsAndPreview();
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
    saveQuoteItemToServer(line, quote, "已自动保存");
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
    confirmSimpleDelete(line.engineeringName || "主材项目", () => {
      quote.lines = quote.lines.filter((entry) => entry.id !== line.id);
      deleteQuoteItemFromServer(line.id, "已删除项目");
      renderAll();
    });
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
    saveQuoteItemToServer(line, currentQuote(), "已自动保存");
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
  saveQuoteItemToServer(line, quote, "已同步推荐工程量");
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

function renderSuggestions(container, line, query) {
  const cleaned = normalizeName(query);
  const exactItem = cleaned ? findLaborItem(cleaned) : null;
  const exactAliasMatch = cleaned ? findLaborAliasMatch(cleaned) : null;
  const matches = findSimilarItems(cleaned).slice(0, 5);
  const comparableItems = cleaned ? findComparableItems(cleaned, 5) : [];
  const hasExactMatch = Boolean(exactItem || exactAliasMatch);
  const hasPrefixMatch = hasLaborPrefixMatch(cleaned);
  const canCreate = Boolean(cleaned) && !hasExactMatch && !hasPrefixMatch;

  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }

  const visibleItems = prioritizeExactLaborAlias(matches.length ? matches : comparableItems, exactAliasMatch);
  if (!visibleItems.length && !canCreate) {
    closeSuggestionList(container);
    return;
  }

  const hint = exactItem
    ? `已找到匹配项：${exactItem.name}`
    : exactAliasMatch
      ? `已找到别名：${exactAliasMatch.alias}，实际：${exactAliasMatch.item.name}`
      : matches.length
      ? "找到相似项，先选已有条目，避免重复。"
      : "没有找到完全匹配项，下面先看相似条目，再决定是否新增。";

  const itemButtons = visibleItems.map((item) => renderLaborSuggestionOption(item)).join("");

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

  activateSuggestionList(container, (button) => activateSuggestion(button, line));
}

function handleSuggestionKeys(event, container, line) {
  handleSuggestionKeyboard(event, container, (button) => activateSuggestion(button, line));
}

function handleSuggestionKeyboard(event, container, onEnter) {
  const buttons = [...container.querySelectorAll(".suggestion")];
  if (event.key === "Escape") {
    closeSuggestionList(container);
    return true;
  }
  if (!buttons.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return false;
  event.preventDefault();
  let index = Number(container.dataset.activeIndex || 0);
  if (event.key === "ArrowDown") index = Math.min(index + 1, buttons.length - 1);
  if (event.key === "ArrowUp") index = Math.max(index - 1, 0);
  container.dataset.activeIndex = String(index);
  updateActiveSuggestion(container);
  if (event.key === "Enter") onEnter(buttons[index]);
  return true;
}

function bindSuggestionButtons(container, onPick) {
  container.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      onPick(button);
    });
  });
}

function closeSuggestionList(container) {
  container.innerHTML = "";
  container.dataset.activeIndex = "-1";
  container.classList.remove("open-up");
}

function closeSuggestionListSoon(container) {
  setTimeout(() => closeSuggestionList(container), 120);
}

function bindSuggestionSearchInput(input, container, handlers) {
  input.addEventListener("input", () => handlers.onInput?.(input.value, input));
  input.addEventListener("focus", () => handlers.onFocus?.(input.value, input));
  input.addEventListener("blur", () => closeSuggestionListSoon(container));
  input.addEventListener("keydown", (event) => handlers.onKeydown?.(event, input.value, input));
}

function activateSuggestionList(container, onPick, options = {}) {
  bindSuggestionButtons(container, onPick);
  container.dataset.activeIndex = "0";
  updateActiveSuggestion(container);
  if (options.position) positionPackageSuggestions(container);
}

function renderLaborSuggestionOption(match, options = {}) {
  const item = match?.item || match;
  const alias = match?.alias || "";
  const price = options.price === "cost" ? calculateLaborItemCostUnitPrice(item) : calculateLaborItemUnitPrice(item);
  return `
    <button class="suggestion" type="button" data-item-name="${escapeHtml(item.name)}" data-display-name="${escapeHtml(alias)}">
      <span>
        <strong>${escapeHtml(alias || item.name)}</strong>
        <small>${alias ? `别名，实际：${escapeHtml(item.name)}` : `${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "项")}`}</small>
      </span>
      <b>${formatMoney(price)}</b>
    </button>
  `;
}

function renderMaterialSuggestionOption(material, options = {}) {
  const price = options.price === "cost" ? material.costUnitPrice : material.quoteUnitPrice;
  const kind = findGenericMaterial(material.materialKindId);
  return `
    <button class="suggestion" type="button" data-material-id="${escapeHtml(material.id)}">
      <span>
        <strong>${escapeHtml(material.name)}</strong>
        <small>${escapeHtml(kind?.name || material.primaryCategory || "未分类")} · ${escapeHtml(material.unit || "项")}</small>
      </span>
      <b>${formatMoney(price)}</b>
    </button>
  `;
}

function renderGenericMaterialSuggestionOption(kind) {
  return `
    <button class="suggestion" type="button" data-generic-material-id="${escapeHtml(kind.id)}">
      <span>
        <strong>${escapeHtml(kind.name)}</strong>
        <small>${escapeHtml(kind.primaryCategory || "未分类")} · ${escapeHtml(kind.unit || "项")}</small>
      </span>
      <b>常用</b>
    </button>
  `;
}

function updateActiveSuggestion(container) {
  const activeIndex = Number(container.dataset.activeIndex || 0);
  container.querySelectorAll(".suggestion").forEach((button, index) => {
    button.classList.toggle("active", index === activeIndex);
    if (index === activeIndex) button.scrollIntoView({ block: "nearest" });
  });
}

function selectSuggestedItem(itemName, line, displayName = "") {
  const item = findLaborItem(itemName);
  if (!item) return;
  line.sourceType = "labor";
  line.engineeringName = displayName || item.name;
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
    selectSuggestedItem(button.dataset.itemName, line, button.dataset.displayName || "");
    return;
  }
  if (button.dataset.createName) {
    createLaborItemFromQuoteItem(line, button.dataset.createName);
  }
}

function renderMaterialSuggestions(container, line, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }

  const kindMatches = findSimilarGenericMaterials(cleaned).slice(0, 6);
  const matches = findSimilarMaterials(cleaned).slice(0, 4);
  if (!kindMatches.length && !matches.length) {
    container.innerHTML = `
      <div class="suggestion-hint">没有找到匹配抽象主材或具体主材。可以先到主材库维护。</div>
    `;
    container.dataset.activeIndex = "-1";
    return;
  }

  container.innerHTML = `
    <div class="suggestion-hint">先选抽象主材；需要定价时再匹配具体产品。</div>
    ${kindMatches.map((kind) => renderGenericMaterialSuggestionOption(kind)).join("")}
    ${matches.map((material) => renderMaterialSuggestionOption(material)).join("")}
  `;

  activateSuggestionList(container, (button) => activateMaterialSuggestion(button, line));
}

function handleMaterialSuggestionKeys(event, container, line) {
  handleSuggestionKeyboard(event, container, (button) => activateMaterialSuggestion(button, line));
}

function activateMaterialSuggestion(button, line) {
  if (button?.dataset.genericMaterialId) {
    selectSuggestedGenericMaterial(button.dataset.genericMaterialId, line);
    return;
  }
  if (button?.dataset.materialId) selectSuggestedMaterial(button.dataset.materialId, line);
}

function selectSuggestedGenericMaterial(kindId, line) {
  const kind = findGenericMaterial(kindId);
  if (!kind) return;
  line.sourceType = "material";
  line.materialKindId = kind.id;
  line.materialId = "";
  line.materialCategory = kind.primaryCategory || "";
  line.engineeringName = kind.name;
  line.priceItemName = "";
  line.material = 0;
  line.auxiliary = 0;
  line.wasteRate = 0;
  line.labor = 0;
  line.legacyUnitPrice = null;
  saveState("已选择抽象主材");
  renderLines();
  renderTotalsAndPreview();
}

function selectSuggestedMaterial(materialId, line) {
  const material = findMaterial(materialId);
  if (!material) return;
  line.sourceType = "material";
  line.materialKindId = material.materialKindId || line.materialKindId || "";
  line.materialId = material.id;
  line.materialCategory = findGenericMaterial(line.materialKindId)?.primaryCategory || material.primaryCategory || material.category || "";
  line.engineeringName = findGenericMaterial(line.materialKindId)?.name || material.name;
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

function findSimilarGenericMaterials(query) {
  const cleaned = normalizeName(query).toLowerCase();
  return currentGenericMaterials()
    .map((kind) => ({ kind, score: scoreGenericMaterial(kind, cleaned) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.kind.name.length - b.kind.name.length)
    .map((entry) => entry.kind);
}

function scoreGenericMaterial(kind, query) {
  const name = String(kind.name || "").toLowerCase();
  const category = String(kind.primaryCategory || "").toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (name.includes(query)) return 80 - Math.min(name.length - query.length, 30);
  let score = 0;
  query.split(/[\s/，,、]+/).filter(Boolean).forEach((token) => {
    if (name.includes(token)) score += 24;
    if (category.includes(token)) score += 10;
  });
  for (const char of query) {
    if (char.trim() && name.includes(char)) score += 1;
  }
  return score;
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
  const kindName = String(findGenericMaterial(material.materialKindId)?.name || "").toLowerCase();
  const category = String(material.primaryCategory || material.category || "").toLowerCase();
  const spec = String(material.spec || "").toLowerCase();
  const brand = String(material.brand || "").toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (kindName === query) return 92;
  if (name.includes(query)) return 80 - Math.min(name.length - query.length, 30);
  if (kindName.includes(query)) return 70 - Math.min(kindName.length - query.length, 30);
  const tokens = query.split(/[\s/，,、]+/).filter(Boolean);
  let score = 0;
  tokens.forEach((token) => {
    if (name.includes(token)) score += 22;
    if (kindName.includes(token)) score += 18;
    if (category.includes(token)) score += 10;
    if (spec.includes(token)) score += 8;
    if (brand.includes(token)) score += 6;
  });
  for (const char of query) {
    if (char.trim() && name.includes(char)) score += 1;
  }
  return score;
}

function openLaborItemEditor(itemName, versionId, returnContext = null) {
  const version = state.versions.find((item) => item.id === versionId) || currentVersion();
  if (!version) return;
  const existing = version.items.find((entry) => entry.name === itemName);
  state.activeVersionId = version.id;
  state.pendingLaborItemName = existing ? existing.name : itemName;
  state.expandedLaborItemName = existing ? existing.name : "";
  state.returnToQuoteId = returnContext?.quoteId || "";
  state.returnToLineId = returnContext?.lineId || "";
  state.returnToPackageId = returnContext?.packageId || "";
  state.returnToPackageEstimateId = returnContext?.estimateId || "";
  state.returnToPackageItemId = returnContext?.packageItemId || "";
  state.returnToTemplateId = returnContext?.templateId || "";
  state.returnToTemplateItemId = returnContext?.templateItemId || "";
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
  state.returnToPackageId = returnContext?.packageId || "";
  state.returnToPackageEstimateId = returnContext?.estimateId || "";
  state.returnToPackageItemId = returnContext?.packageItemId || "";
  state.returnToTemplateId = returnContext?.templateId || "";
  state.returnToTemplateItemId = returnContext?.templateItemId || "";
  if (els.materialSearch) els.materialSearch.value = "";
  switchPage("materials");
  renderAll();
}

function returnContextForItem(item) {
  const quoteContext = returnQuoteContextForItem(item);
  if (quoteContext) return quoteContext;
  const packageContext = returnPackageContextForItem(item);
  if (packageContext) return packageContext;
  return returnTemplateContextForItem(item);
}

function returnQuoteContextForItem(item) {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  if (!quote || !line || line.priceItemName !== item.name) return null;
  return { type: "quote", quote, line };
}

function returnPackageContextForItem(item) {
  if (!state.returnToPackageId || !state.returnToPackageEstimateId || !state.returnToPackageItemId) return null;
  const packageEntry = state.packages.find((entry) => entry.id === state.returnToPackageId);
  const estimate = packageEntry?.estimates.find((entry) => entry.id === state.returnToPackageEstimateId);
  const packageItem = estimate?.items.find((entry) => entry.id === state.returnToPackageItemId);
  if (!packageEntry || !estimate || !packageItem || packageItem.itemName !== item.name) return null;
  return { type: "package", packageEntry, estimate, packageItem };
}

function returnTemplateContextForItem(item) {
  if (!state.returnToTemplateId || !state.returnToTemplateItemId) return null;
  const template = state.templates.find((entry) => entry.id === state.returnToTemplateId);
  const templateItem = template?.items.find((entry) => entry.id === state.returnToTemplateItemId);
  if (!template || !templateItem || templateItem.sourceType !== "labor" || templateItem.itemName !== item.name) return null;
  return { type: "template", template, templateItem };
}

function returnContextForMaterial(material) {
  const quoteContext = returnQuoteContextForMaterial(material);
  if (quoteContext) return quoteContext;
  return returnTemplateContextForMaterial(material);
}

function returnQuoteContextForMaterial(material) {
  if (!state.returnToQuoteId || !state.returnToLineId) return null;
  const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
  const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
  if (!quote || !line || line.materialId !== material.id) return null;
  return { type: "quote", quote, line };
}

function returnTemplateContextForMaterial(material) {
  if (!state.returnToTemplateId || !state.returnToTemplateItemId) return null;
  const template = state.templates.find((entry) => entry.id === state.returnToTemplateId);
  const templateItem = template?.items.find((entry) => entry.id === state.returnToTemplateItemId);
  if (!template || !templateItem || templateItem.sourceType !== "material" || templateItem.materialId !== material.id) return null;
  return { type: "template", template, templateItem };
}

function returnMaterialFromContext() {
  if (state.returnToQuoteId && state.returnToLineId) {
    const quote = state.quotes.find((entry) => entry.id === state.returnToQuoteId);
    const line = quote?.lines.find((entry) => entry.id === state.returnToLineId);
    return line?.materialId ? findMaterial(line.materialId) : null;
  }
  if (state.returnToTemplateId && state.returnToTemplateItemId) {
    const template = state.templates.find((entry) => entry.id === state.returnToTemplateId);
    const templateItem = template?.items.find((entry) => entry.id === state.returnToTemplateItemId);
    return templateItem?.materialId ? findMaterial(templateItem.materialId) : null;
  }
  return null;
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

function returnToLibraryCaller() {
  if (state.returnToQuoteId && state.returnToLineId) {
    returnToQuoteItem();
    return;
  }
  if (state.returnToPackageId && state.returnToPackageEstimateId && state.returnToPackageItemId) {
    returnToPackageEstimateItem();
    return;
  }
  if (state.returnToTemplateId && state.returnToTemplateItemId) {
    returnToTemplateItem();
  }
}

function returnToTemplateItem() {
  const templateId = state.returnToTemplateId;
  const itemId = state.returnToTemplateItemId;
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) return;
  state.templates.forEach((entry) => { entry.collapsed = entry.id !== template.id; });
  template.collapsed = false;
  state.returnToTemplateId = "";
  state.returnToTemplateItemId = "";
  switchPage("templates");
  renderAll();
  requestAnimationFrame(() => {
    const target = els.templateList?.querySelector(`tr[data-template-item-id="${cssEscape(itemId)}"]`);
    if (target) {
      target.classList.add("selected");
      target.scrollIntoView({ block: "center" });
    }
  });
}

function returnToPackageEstimateItem() {
  const packageId = state.returnToPackageId;
  const estimateId = state.returnToPackageEstimateId;
  const itemId = state.returnToPackageItemId;
  const packageEntry = state.packages.find((entry) => entry.id === packageId);
  if (!packageEntry) return;
  state.activePackageId = packageId;
  state.activePackageEstimateId = estimateId;
  state.activePackageTab = "estimate";
  state.returnToPackageId = "";
  state.returnToPackageEstimateId = "";
  state.returnToPackageItemId = "";
  switchPage("packages");
  renderAll();
  requestAnimationFrame(() => {
    const target = els.packageDetail?.querySelector(`.package-estimate-row[data-item-id="${cssEscape(itemId)}"]`);
    if (target) {
      target.classList.add("selected");
      target.scrollIntoView({ block: "center" });
    }
  });
}

function displayEngineeringName(itemName) {
  return String(itemName || "").replaceAll("/", "");
}

function findSimilarItems(query) {
  const cleaned = normalizeName(query).toLowerCase();
  return currentLaborMatches(cleaned)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .map((entry) => ({ item: entry.item, alias: entry.alias }));
}

function findComparableItems(query, limit = 5) {
  const cleaned = normalizeName(query).toLowerCase();
  if (!cleaned) return [];
  const ranked = currentLaborMatches(cleaned)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
  const positive = ranked.filter((entry) => entry.score > 0);
  const source = positive.length ? positive : ranked;
  return source.slice(0, limit).map((entry) => ({ item: entry.item, alias: entry.alias }));
}

function currentLaborMatches(query) {
  return currentLaborItems().flatMap((item) => {
    const matches = [{ item, alias: "", score: scoreItem(item, query) }];
    (item.aliases || []).forEach((alias) => {
      matches.push({ item, alias, score: scoreLaborAlias(item, alias, query) });
    });
    return matches;
  });
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

function scoreLaborAlias(item, alias, query) {
  const name = String(alias || "").toLowerCase();
  if (!query || !name) return 0;
  if (name === query) return 96;
  if (name.includes(query)) return 76 - Math.min(name.length - query.length, 30);
  let score = 0;
  query.split(/[\s/，,、]+/).filter(Boolean).forEach((token) => {
    if (name.includes(token)) score += 24;
  });
  for (const char of query) {
    if (char.trim() && name.includes(char)) score += 1;
  }
  return score + Math.min(scoreItem(item, query), 12);
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
  const template = comparable[0]?.item || comparable[0];
  const parsedInputName = parsePriceNameUnit(name);
  const itemUnit = parsedInputName?.unit || template?.unit || "项";
  const itemName = parsedInputName ? name : `${name}/${itemUnit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    alert(`工费库里已经有“${existingWithUnit.name}”了，请直接从相似项里选择。`);
    return;
  }
  const similarText = comparable.length ? comparable.map((entry) => entry.alias || entry.item?.name || entry.name).join("、") : "暂无相似条目";
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
    quantityRoundDown: Boolean(template?.quantityRoundDown),
    usesMaterial: Boolean(template?.usesMaterial),
    materialCategory: template?.materialCategory || "",
    defaultMaterialId: defaultMaterialIdForItem(template)
  };

  version.items.push(newItem);
  selectSuggestedItem(newItem.name, line);
  saveLaborItemToServer(newItem, version.id, "已新增工费条目");
  saveQuoteItemToServer(line, currentQuote(), "已新增工费条目");
  renderAll();
}

function renderLaborLibrary() {
  renderCategoryLibrary();
  const keyword = els.priceSearch.value.trim().toLowerCase();
  const items = currentLaborItems().filter((item) => {
    return !keyword || [item.name, ...(item.aliases || []), categoryNameForItem(item), item.description].join(" ").toLowerCase().includes(keyword);
  });
  els.priceCount.textContent = `${items.length} 条工费条目`;
  const categoryOptions = [
    `<option value="">未分类</option>`,
    ...currentCategories().map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
  ].join("");
  let categoryToneIndex = -1;
  let previousCategoryKey = null;
  const rows = [
    renderLaborInsertRow(0, items[0]?.categoryId || "")
  ].concat(items.flatMap((item, index) => {
    const unitPrice = calculateLaborItemUnitPrice(item);
    const costUnitPrice = calculateLaborItemCostUnitPrice(item);
    const isExpanded = state.expandedLaborItemName === item.name;
    const categoryKey = item.categoryId || "";
    if (categoryKey !== previousCategoryKey) {
      categoryToneIndex += 1;
      previousCategoryKey = categoryKey;
    }
    const categoryToneClass = categoryToneIndex % 2 === 0 ? "price-category-tone-a" : "price-category-tone-b";
    const aliasRows = renderLaborAliasRows(item, unitPrice, costUnitPrice, categoryToneClass);
    return [`
      <tr class="price-row ${state.pendingLaborItemName === item.name ? "selected" : ""}" data-item-name="${escapeHtml(item.name)}" data-category-id="${escapeHtml(item.categoryId || "")}" draggable="true">
        <td class="price-drag-cell"><button class="price-drag" type="button" title="拖动排序" aria-label="拖动排序">⋮⋮</button></td>
        <td><input class="price-name-input" type="text" aria-label="工费条目名称" value="${escapeHtml(item.name)}"></td>
        <td class="price-category-cell ${categoryToneClass}">
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
        <td class="price-actions-cell">
          <button class="price-add-alias ghost small" type="button" aria-label="添加别名">别名</button>
          <button class="price-delete danger small" type="button" aria-label="删除条目">删除</button>
        </td>
      </tr>
      ${aliasRows}
      ${isExpanded ? `
      <tr class="price-detail-row" data-detail-for="${escapeHtml(item.name)}">
        <td colspan="7">
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
              <label class="price-checkbox-line"><input class="price-quantity-round-down" type="checkbox" ${item.quantityRoundDown ? "checked" : ""}>推荐量向下取整</label>
              <textarea class="price-description" aria-label="说明">${escapeHtml(item.description || "")}</textarea>
            </section>
          </div>
        </td>
      </tr>
      ` : ""}
    `, renderLaborInsertRow(index + 1, item.categoryId || "")];
  })).join("");

  els.priceList.innerHTML = `
    <table class="price-table">
      <thead>
        <tr>
          <th>排序</th>
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
          if (!updateLaborItemNameFromInput(item, event.target.value, event.target, node)) return;
        } else {
          item[key] = event.target.value;
        }
        saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
        renderLines();
        renderTotalsAndPreview();
      });
    };
    bindText("price-name-input", "name");
    node.querySelector(".price-name-input").addEventListener("keydown", blurOnEnter);
    node.querySelector(".price-name-input").addEventListener("blur", (event) => {
      if (parsePriceNameUnit(event.target.value)) {
        flashQuoteItemSaved(node);
        return;
      }
      alert("工费条目名称必须包含斜杠单位，例如：水电开槽/平米");
      event.target.classList.add("invalid");
      setTimeout(() => {
        event.target.focus();
        event.target.select();
      }, 0);
    });
    const categorySelect = node.querySelector(".price-category-select");
    categorySelect.value = item.categoryId || "";
    categorySelect.addEventListener("change", (event) => {
      const category = findCategory(event.target.value);
      item.categoryId = category?.id || "";
      item.category = category?.name || "";
      item.sortOrder = nextItemSortOrder(item.categoryId, item.name);
      saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
      renderLaborLibrary();
    });
    node.querySelectorAll(".price-expand").forEach((button) => {
      button.addEventListener("click", () => toggleLaborItemDetails(item.name));
    });
    node.querySelector(".price-add-alias").addEventListener("click", () => {
      addLaborAlias(item);
    });
    node.querySelector(".price-delete").addEventListener("click", () => {
      deleteLaborItem(item.name);
    });
  });
  els.priceList.querySelectorAll(".price-insert-row").forEach((node) => {
    node.addEventListener("click", () => {
      addLaborItemAt(Number(node.dataset.position), node.dataset.categoryId || "", items);
    });
  });
  els.priceList.querySelectorAll(".price-alias-row").forEach((node) => {
    const item = findLaborItem(node.dataset.parentItemName);
    if (!item) return;
    bindLaborAliasRow(node, item);
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

function renderLaborInsertRow(position, categoryId = "") {
  return `
    <tr class="price-insert-row" data-position="${position}" data-category-id="${escapeHtml(categoryId)}" aria-label="在这里添加工费">
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td><button class="price-insert-slot" type="button" tabindex="-1" aria-hidden="true"><span>+</span></button></td>
      <td></td>
      <td></td>
    </tr>
  `;
}

function renderLaborAliasRows(item, unitPrice = calculateLaborItemUnitPrice(item), costUnitPrice = calculateLaborItemCostUnitPrice(item), categoryToneClass = "") {
  const aliases = item.aliases || [];
  return aliases.map((alias, index) => {
    const aliasUnit = parsePriceNameUnit(alias)?.unit || item.unit || parsePriceNameUnit(item.name)?.unit || "";
    return `
      <tr class="price-alias-row" data-parent-item-name="${escapeHtml(item.name)}" data-alias-index="${index}">
        <td class="price-alias-tree" aria-label="别名"></td>
        <td class="price-alias-name-cell"><input class="price-alias-name-input" type="text" aria-label="工费别名" value="${escapeHtml(alias)}"></td>
        <td class="price-category-cell ${categoryToneClass}"><span class="price-alias-badge">别名</span></td>
        <td><span class="readonly-cell price-alias-readonly">${escapeHtml(aliasUnit)}</span></td>
        <td><span class="readonly-cell price-alias-readonly strong-cell">${formatMoney(unitPrice)}</span></td>
        <td><span class="readonly-cell price-alias-readonly strong-cell">${formatMoney(costUnitPrice)}</span></td>
        <td class="price-alias-actions">
          <button class="price-alias-move-up ghost small" type="button" title="上移别名" aria-label="上移别名" ${index === 0 ? "disabled" : ""}>上</button>
          <button class="price-alias-move-down ghost small" type="button" title="下移别名" aria-label="下移别名" ${index === aliases.length - 1 ? "disabled" : ""}>下</button>
          <button class="price-alias-delete danger small" type="button" aria-label="删除别名">删除</button>
        </td>
      </tr>
    `;
  }).join("");
}

function addLaborAlias(item) {
  const base = parsePriceNameUnit(item.name)?.baseName || item.name || "新别名";
  const unit = item.unit || parsePriceNameUnit(item.name)?.unit || "项";
  const existingAliases = item.aliases || [];
  let nextAlias = `别名${base}/${unit}`;
  let index = 2;
  while (normalizeLaborAliases([...existingAliases, nextAlias]).length <= existingAliases.length) {
    nextAlias = `别名${index}${base}/${unit}`;
    index += 1;
  }
  item.aliases = normalizeLaborAliases([...existingAliases, nextAlias]);
  saveLaborItemToServer(item, currentVersion()?.id, "已新增工费别名");
  renderLaborLibrary();
  requestAnimationFrame(() => {
    const rows = [...els.priceList.querySelectorAll(`.price-alias-row[data-parent-item-name="${cssEscape(item.name)}"]`)];
    const input = rows.at(-1)?.querySelector(".price-alias-name-input");
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function bindLaborAliasRow(node, item) {
  const input = node.querySelector(".price-alias-name-input");
  const index = Number(node.dataset.aliasIndex);
  if (!input || !Number.isInteger(index)) return;
  input.addEventListener("input", (event) => {
    item.aliases[index] = event.target.value;
    saveLaborItemToServer(item, currentVersion()?.id, "已更新工费别名");
  });
  input.addEventListener("keydown", blurOnEnter);
  input.addEventListener("blur", (event) => {
    const normalized = normalizeLaborAliases(item.aliases);
    item.aliases = normalized;
    saveLaborItemToServer(item, currentVersion()?.id, "已更新工费别名");
    if (!normalized.includes(normalizeName(event.target.value))) renderLaborLibrary();
    else flashQuoteItemSaved(node);
  });

  node.querySelector(".price-alias-delete")?.addEventListener("click", () => {
    item.aliases = (item.aliases || []).filter((_, aliasIndex) => aliasIndex !== index);
    saveLaborItemToServer(item, currentVersion()?.id, "已删除工费别名");
    renderLaborLibrary();
  });

  node.querySelector(".price-alias-move-up")?.addEventListener("click", () => {
    moveLaborAlias(item, index, index - 1);
  });

  node.querySelector(".price-alias-move-down")?.addEventListener("click", () => {
    moveLaborAlias(item, index, index + 1);
  });
}

function moveLaborAlias(item, fromIndex, toIndex) {
  const aliases = item.aliases || [];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= aliases.length || toIndex >= aliases.length) return;
  const reordered = [...aliases];
  const [alias] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, alias);
  item.aliases = reordered;
  saveLaborItemToServer(item, currentVersion()?.id, "已调整工费别名顺序");
  renderLaborLibrary();
}

function addMaterial(position = 0, visibleMaterials = null) {
  const name = uniqueMaterialName("新主材");
  const currentItems = visibleMaterials || supplierMaterialsForDisplay(state.materials);
  const insertPosition = normalizeInsertPosition(position, currentItems.length);
  const template = currentItems[Math.max(0, insertPosition - 1)] || currentItems[insertPosition];
  const material = normalizeMaterial({
    name,
    brand: template?.brand || "",
    materialKindId: template?.materialKindId || "",
    primaryCategory: template?.primaryCategory || "砖",
    category: template?.category || template?.primaryCategory || "砖",
    unit: template?.unit || "块",
    sortOrder: insertPosition
  }, insertPosition);
  state.materials = insertItemAndRenumberSortOrder(currentItems, material, insertPosition)
    .concat(state.materials.filter((item) => !currentItems.some((visible) => visible.id === item.id)));
  state.materials.forEach((item) => saveMaterialToServer(item, "已新增主材"));
  state.pendingMaterialId = material.id;
  renderMaterials();
}

function uniqueMaterialName(baseName) {
  const names = new Set(state.materials.map((material) => normalizeName(material.name)));
  if (!names.has(normalizeName(baseName))) return baseName;
  let index = 2;
  while (names.has(normalizeName(`${baseName}${index}`))) index += 1;
  return `${baseName}${index}`;
}

function renderMaterials() {
  if (!els.materialList) return;
  const keyword = (els.materialSearch?.value || "").trim().toLowerCase();
  const materials = supplierMaterialsForDisplay(state.materials)
    .filter((material) => {
      const haystack = [
        material.name,
        findGenericMaterial(material.materialKindId)?.name,
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
  const rows = [
    renderSupplierMaterialInsertRow(0)
  ].concat(materials.flatMap((material, index) => [`
    <tr class="material-row ${state.pendingMaterialId === material.id ? "selected" : ""}" data-material-id="${escapeHtml(material.id)}" draggable="true">
      <td class="price-drag-cell"><button class="material-drag price-drag" type="button" title="拖动排序" aria-label="拖动排序">⋮⋮</button></td>
      <td><input class="material-brand-input" type="text" aria-label="品牌" value="${escapeHtml(material.brand)}"></td>
      <td><input class="material-name-input" type="text" aria-label="主材名称" value="${escapeHtml(material.name)}"></td>
      <td><input class="generic-material-input" type="text" list="genericMaterialChoices" aria-label="抽象主材" placeholder="输入抽象主材" value="${escapeHtml(genericMaterialInputValue(material.materialKindId))}"></td>
      <td><input class="material-spec-input" type="text" aria-label="规格型号" value="${escapeHtml(material.spec)}"></td>
      <td><input class="material-unit-input" type="text" aria-label="单位" value="${escapeHtml(material.unit)}"></td>
      <td><input class="material-price-input" type="number" min="0" step="0.01" aria-label="单价" value="${material.quoteUnitPrice}"></td>
      <td><input class="material-cost-input" type="number" min="0" step="0.01" aria-label="成本单价" value="${material.costUnitPrice}"></td>
      <td><input class="material-formula-input" type="text" aria-label="公式预留" placeholder="后续公式" value="${escapeHtml(material.pricingFormula)}"></td>
      <td><input class="material-note-input" type="text" aria-label="备注" value="${escapeHtml(material.note)}"></td>
      <td><button class="material-calculator-toggle small ghost" type="button">换算</button></td>
      <td class="price-actions-cell"><button class="material-delete danger small" type="button">删除</button></td>
    </tr>
    <tr class="material-calculator-row" data-material-id="${escapeHtml(material.id)}" hidden>
      <td></td>
      <td colspan="11">
        ${renderMaterialCalculator(material)}
      </td>
    </tr>
  `, renderSupplierMaterialInsertRow(index + 1)])).join("");

  const returnMaterial = returnMaterialFromContext();
  const returnContext = returnMaterial ? returnContextForMaterial(returnMaterial) : null;
  const returnLabel = returnContext?.type === "template" ? "返回模板库" : "返回报价编辑";
  const returnHint = returnContext?.type === "template" ? "正在编辑模板中调用的主材" : "正在编辑报价中调用的主材";
  const canReturn = returnMaterial && returnContext;
  const returnBar = canReturn ? `
    <div class="library-return-bar">
      <span>${returnHint}：${escapeHtml(returnMaterial.name)}</span>
      <button class="return-quote-line small" type="button">${returnLabel}</button>
    </div>
  ` : "";

  els.materialList.innerHTML = `
    ${returnBar}
    ${renderGenericMaterialDatalist()}
    ${renderGenericMaterialLibrary()}
    ${renderSupplierMaterialLibrary(rows)}
  `;

  const returnButton = els.materialList.querySelector(".return-quote-line");
  if (returnButton) returnButton.addEventListener("click", returnToLibraryCaller);
  bindGenericMaterialLibrary();
  bindSupplierMaterialLibrary();

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
        saveMaterialToServer(material, "已更新主材库");
        if (key === "unit") {
          renderLaborLibrary();
          renderLines();
          renderTotalsAndPreview();
        }
      });
    });
    const genericMaterialInput = row.querySelector(".generic-material-input");
    const updateGenericMaterialLink = () => {
      const rawValue = normalizeName(genericMaterialInput.value);
      const kind = findGenericMaterial(rawValue);
      if (rawValue && !kind) {
        genericMaterialInput.classList.add("invalid");
        return;
      }
      genericMaterialInput.classList.remove("invalid");
      material.materialKindId = kind?.id || "";
      if (kind) {
        material.primaryCategory = kind.primaryCategory || material.primaryCategory;
        material.category = material.primaryCategory;
        material.unit = material.unit || kind.unit;
      }
      saveMaterialToServer(material, "已更新主材抽象项");
      renderMaterials();
      renderLines();
      renderTotalsAndPreview();
    };
    genericMaterialInput.addEventListener("change", updateGenericMaterialLink);
    genericMaterialInput.addEventListener("keydown", blurOnEnter);
    genericMaterialInput.addEventListener("blur", updateGenericMaterialLink);
    row.querySelector(".material-cost-input").addEventListener("input", (event) => {
      material.costUnitPrice = toNumber(event.target.value);
      saveMaterialToServer(material, "已更新主材库");
      renderLines();
      renderTotalsAndPreview();
    });
    row.querySelector(".material-price-input").addEventListener("input", (event) => {
      material.quoteUnitPrice = toNumber(event.target.value);
      material.unitPrice = material.quoteUnitPrice;
      saveMaterialToServer(material, "已更新主材库");
      renderLines();
      renderTotalsAndPreview();
    });
    bindMaterialCalculator(row, material);
    row.querySelector(".material-delete").addEventListener("click", () => deleteMaterial(material));
  });
  els.materialList.querySelectorAll(".supplier-material-insert-row").forEach((row) => {
    row.addEventListener("click", () => {
      addMaterial(Number(row.dataset.position || 0), materials);
    });
  });
  bindMaterialDragAndDrop(materials);
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

function renderSupplierMaterialInsertRow(position) {
  return `
    <tr class="supplier-material-insert-row" data-position="${position}" aria-label="在这里添加供货商主材">
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td><button class="supplier-material-insert-slot" type="button" tabindex="-1" aria-hidden="true"><span>+</span></button></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  `;
}

function renderGenericMaterialLibrary() {
  const materialsByCategory = new Map();
  genericMaterialsForManagement().forEach((kind) => {
    const category = genericMaterialCategoryName(kind.libraryCategory);
    if (!materialsByCategory.has(category)) materialsByCategory.set(category, []);
    materialsByCategory.get(category).push(kind);
  });
  const rows = sortedGenericMaterialCategories().map((category) => {
    const categoryState = state.genericMaterialCategoryState[category] || {};
    const collapsed = Boolean(categoryState.collapsed);
    const items = materialsByCategory.get(category) || [];
    const itemRows = collapsed ? "" : `
      ${renderGenericMaterialInsertRow(category, 0)}
      ${items.map((kind, index) => `
      <tr class="generic-material-row" data-kind-id="${escapeHtml(kind.id)}" data-category-name="${escapeHtml(category)}" draggable="true">
        <td class="price-drag-cell"><button class="generic-material-drag price-drag" type="button" title="拖动排序" aria-label="拖动排序">⋮⋮</button></td>
        <td><input class="generic-material-library-category" type="text" aria-label="管理分类" value="${escapeHtml(kind.libraryCategory)}" placeholder="未分类"></td>
        <td><input class="generic-material" type="text" aria-label="抽象主材" value="${escapeHtml(kind.name)}"></td>
        <td><input class="generic-material-unit" type="text" aria-label="单位" value="${escapeHtml(kind.unit)}"></td>
        <td><input class="generic-material-price" type="number" min="0" step="0.01" aria-label="基准单价" value="${kind.quoteUnitPrice}"></td>
        <td><input class="generic-material-cost" type="number" min="0" step="0.01" aria-label="基准成本" value="${kind.costUnitPrice}"></td>
        <td><input class="generic-material-note" type="text" aria-label="备注" value="${escapeHtml(kind.note)}"></td>
        <td><button class="generic-material-calculator-toggle small ghost" type="button">换算</button></td>
        <td><button class="generic-material-delete small danger" type="button">删除</button></td>
      </tr>
      <tr class="generic-material-calculator-row" data-kind-id="${escapeHtml(kind.id)}" hidden>
        <td></td>
        <td colspan="8">
          <div class="generic-material-calculator">
            <strong>成本换算</strong>
            <label>单个面积<input class="generic-material-calc-cost-area" type="number" min="0" step="0.01" placeholder="0.32" value="${kind.calcCostArea || ""}"></label>
            <label>单个成本<input class="generic-material-calc-cost-price" type="number" min="0" step="0.01" placeholder="18" value="${kind.calcCostPrice || ""}"></label>
            <output class="generic-material-calc-cost-result">${formatMoney(calculateGenericMaterialUnitPrice(kind.calcCostArea, kind.calcCostPrice))} / ${escapeHtml(kind.unit || "单位")}</output>
            <button class="generic-material-fill-cost small primary" type="button">填成本</button>
            <strong>报价换算</strong>
            <label>单个面积<input class="generic-material-calc-quote-area" type="number" min="0" step="0.01" placeholder="0.32" value="${kind.calcQuoteArea || ""}"></label>
            <label>单个报价<input class="generic-material-calc-quote-price" type="number" min="0" step="0.01" placeholder="22" value="${kind.calcQuotePrice || ""}"></label>
            <output class="generic-material-calc-quote-result">${formatMoney(calculateGenericMaterialUnitPrice(kind.calcQuoteArea, kind.calcQuotePrice))} / ${escapeHtml(kind.unit || "单位")}</output>
            <button class="generic-material-fill-price small primary" type="button">填单价</button>
          </div>
        </td>
      </tr>
      ${renderGenericMaterialInsertRow(category, index + 1)}`).join("")}`;
    return `
      <tr class="generic-material-group-row ${collapsed ? "collapsed" : ""}" data-category-name="${escapeHtml(category)}" draggable="true">
        <td colspan="9">
          <div class="generic-material-category-head">
            <button class="generic-material-category-drag price-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动分类排序" aria-label="点击展开或收缩，拖动分类排序" aria-expanded="${String(!collapsed)}">⋮⋮</button>
            <strong>${escapeHtml(category)}</strong>
            <span class="generic-material-category-count">${items.length} 项</span>
          </div>
        </td>
      </tr>
      ${itemRows}`;
  }).join("");
  const collapsed = state.genericMaterialLibraryCollapsed;
  return `
    <section class="generic-material-panel ${collapsed ? "collapsed" : ""}">
      <div class="generic-material-head">
        <h3>抽象主材</h3>
        <div class="generic-material-actions">
          <button class="toggle-generic-material-library small ghost" type="button" aria-expanded="${String(!collapsed)}">${collapsed ? "展开" : "收缩"}</button>
          <button class="add-generic-material small ghost" type="button">添加抽象主材</button>
        </div>
      </div>
      <table class="price-table generic-material-table">
        <thead>
          <tr>
            <th>排序</th>
            <th>管理分类</th>
            <th>名称</th>
            <th>单位</th>
            <th>基准单价</th>
            <th>基准成本</th>
            <th>备注</th>
            <th>换算</th>
            <th>删除</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function renderGenericMaterialInsertRow(category, position) {
  return `
    <tr class="generic-material-insert-row" data-category-name="${escapeHtml(category)}" data-position="${position}" aria-label="在这里添加抽象主材">
      <td colspan="9">
        <div class="generic-material-insert-slot">
          <button class="insert-generic-material small ghost" type="button">添加抽象主材</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSupplierMaterialLibrary(rows) {
  const collapsed = state.supplierMaterialLibraryCollapsed;
  return `
    <section class="supplier-material-panel ${collapsed ? "collapsed" : ""}">
      <div class="supplier-material-head">
        <h3>供货商主材</h3>
        <div class="generic-material-actions">
          <button class="toggle-supplier-material-library small ghost" type="button" aria-expanded="${String(!collapsed)}">${collapsed ? "展开" : "收缩"}</button>
          <button class="add-supplier-material small ghost" type="button">添加供货商主材</button>
        </div>
      </div>
      <table class="price-table material-table">
        <thead>
          <tr>
            <th>排序</th>
            <th>品牌</th>
            <th>主材名称</th>
            <th>抽象主材</th>
            <th>规格/型号</th>
            <th>单位</th>
            <th>单价</th>
            <th>成本单价</th>
            <th>公式</th>
            <th>备注</th>
            <th>换算</th>
            <th>删除</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function materialTargetUnit(material) {
  const kind = findGenericMaterial(material?.materialKindId);
  return kind?.unit || material?.conversionUnit || material?.unit || "单位";
}

function renderMaterialCalculator(material) {
  const targetUnit = materialTargetUnit(material);
  return `
    <div class="generic-material-calculator material-calculator">
      <strong>成本换算</strong>
      <label>单个面积<input class="material-calc-cost-area" type="number" min="0" step="0.01" placeholder="0.32" value="${material.calcCostArea || ""}"></label>
      <label>单个成本<input class="material-calc-cost-price" type="number" min="0" step="0.01" placeholder="18" value="${material.calcCostPrice || ""}"></label>
      <output class="material-calc-cost-result">${formatMoney(calculateGenericMaterialUnitPrice(material.calcCostArea, material.calcCostPrice))} / ${escapeHtml(targetUnit)}</output>
      <button class="material-fill-cost small primary" type="button">填成本</button>
      <strong>报价换算</strong>
      <label>单个面积<input class="material-calc-quote-area" type="number" min="0" step="0.01" placeholder="0.32" value="${material.calcQuoteArea || ""}"></label>
      <label>单个报价<input class="material-calc-quote-price" type="number" min="0" step="0.01" placeholder="22" value="${material.calcQuotePrice || ""}"></label>
      <output class="material-calc-quote-result">${formatMoney(calculateGenericMaterialUnitPrice(material.calcQuoteArea, material.calcQuotePrice))} / ${escapeHtml(targetUnit)}</output>
      <button class="material-fill-price small primary" type="button">填单价</button>
    </div>
  `;
}

function bindGenericMaterialLibrary() {
  els.materialList.querySelector(".generic-material-head")?.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    toggleGenericMaterialLibrary();
  });
  els.materialList.querySelector(".toggle-generic-material-library")?.addEventListener("click", toggleGenericMaterialLibrary);
  els.materialList.querySelector(".add-generic-material")?.addEventListener("click", (event) => {
    event.stopPropagation();
    addGenericMaterial();
  });
  els.materialList.querySelectorAll(".generic-material-insert-row").forEach((row) => {
    row.querySelector(".insert-generic-material")?.addEventListener("click", () => {
      addGenericMaterialAt(row.dataset.categoryName, Number(row.dataset.position || 0));
    });
  });
  els.materialList.querySelectorAll(".generic-material-row").forEach((row) => {
    const kind = findGenericMaterial(row.dataset.kindId);
    if (!kind) return;
    [
      ["generic-material-library-category", "libraryCategory"],
      ["generic-material", "name"],
      ["generic-material-unit", "unit"],
      ["generic-material-cost", "costUnitPrice", "number"],
      ["generic-material-price", "quoteUnitPrice", "number"],
      ["generic-material-note", "note"]
    ].forEach(([className, key, mode]) => {
      const input = row.querySelector(`.${className}`);
      const updateKindFromInput = (event) => {
        kind[key] = mode === "number" ? toNumber(event.target.value) : (key === "libraryCategory" ? genericMaterialCategoryName(event.target.value) : event.target.value);
        if (key === "quoteUnitPrice") kind.unitPrice = kind.quoteUnitPrice;
      };
      input?.addEventListener("input", (event) => {
        updateKindFromInput(event);
        saveMaterialKindToServer(kind, "已更新抽象主材");
        if (key !== "libraryCategory") {
          renderLines();
          renderTotalsAndPreview();
        }
      });
      input?.addEventListener("change", async (event) => {
        updateKindFromInput(event);
        await saveMaterialKindToServerNow(kind, "已更新抽象主材");
      });
    });
    row.querySelector(".generic-material-library-category")?.addEventListener("change", renderMaterials);
    bindGenericMaterialCalculator(row, kind);
    row.querySelector(".generic-material-delete")?.addEventListener("click", () => deleteGenericMaterial(kind));
  });
  bindGenericMaterialCategoryDragAndDrop();
  bindGenericMaterialDragAndDrop();
}

function bindSupplierMaterialLibrary() {
  els.materialList.querySelector(".supplier-material-head")?.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    toggleSupplierMaterialLibrary();
  });
  els.materialList.querySelector(".toggle-supplier-material-library")?.addEventListener("click", toggleSupplierMaterialLibrary);
  els.materialList.querySelector(".add-supplier-material")?.addEventListener("click", (event) => {
    event.stopPropagation();
    addMaterial();
  });
}

function handleMaterialListClick(event) {
  const genericFillButton = event.target.closest(".generic-material-fill-cost, .generic-material-fill-price");
  if (!genericFillButton) return;
  const calculatorRow = genericFillButton.closest(".generic-material-calculator-row");
  const kind = findGenericMaterial(calculatorRow?.dataset.kindId);
  const row = kind ? els.materialList.querySelector(`.generic-material-row[data-kind-id="${cssEscape(kind.id)}"]`) : null;
  if (!kind || !row) return;
  event.preventDefault();
  event.stopPropagation();
  if (genericFillButton.classList.contains("generic-material-fill-cost")) {
    fillGenericMaterialCost(row, calculatorRow, kind);
  } else {
    fillGenericMaterialPrice(row, calculatorRow, kind);
  }
}

function bindMaterialCalculator(row, material) {
  const calculatorRow = els.materialList.querySelector(`.material-calculator-row[data-material-id="${cssEscape(material.id)}"]`);
  const toggle = row.querySelector(".material-calculator-toggle");
  const costAreaInput = calculatorRow?.querySelector(".material-calc-cost-area");
  const costPriceInput = calculatorRow?.querySelector(".material-calc-cost-price");
  const quoteAreaInput = calculatorRow?.querySelector(".material-calc-quote-area");
  const quotePriceInput = calculatorRow?.querySelector(".material-calc-quote-price");
  const costResult = calculatorRow?.querySelector(".material-calc-cost-result");
  const quoteResult = calculatorRow?.querySelector(".material-calc-quote-result");
  const updateResult = (type) => {
    const areaInput = type === "cost" ? costAreaInput : quoteAreaInput;
    const priceInput = type === "cost" ? costPriceInput : quotePriceInput;
    const result = type === "cost" ? costResult : quoteResult;
    if (!result) return 0;
    const unitPrice = calculateGenericMaterialUnitPrice(numberInputValue(areaInput), numberInputValue(priceInput));
    result.textContent = `${formatMoney(unitPrice)} / ${materialTargetUnit(material)}`;
    return unitPrice;
  };
  const saveCalculatorInput = (key, input, type) => {
    input?.addEventListener("input", () => {
      material[key] = toNumber(input.value);
      updateResult(type);
      saveMaterialToServer(material, "已更新供货商主材换算依据");
    });
  };
  toggle?.addEventListener("click", () => {
    if (!calculatorRow) return;
    const willOpen = calculatorRow.hidden;
    if (willOpen) collapseOtherMaterialCalculators(calculatorRow);
    calculatorRow.hidden = !willOpen;
    toggle.textContent = calculatorRow.hidden ? "换算" : "收起";
    if (!calculatorRow.hidden) {
      updateResult("cost");
      updateResult("quote");
      costAreaInput?.focus();
      costAreaInput?.select();
    }
  });
  saveCalculatorInput("calcCostArea", costAreaInput, "cost");
  saveCalculatorInput("calcCostPrice", costPriceInput, "cost");
  saveCalculatorInput("calcQuoteArea", quoteAreaInput, "quote");
  saveCalculatorInput("calcQuotePrice", quotePriceInput, "quote");
  calculatorRow?.querySelector(".material-fill-cost")?.addEventListener("click", async () => {
    material.calcCostArea = numberInputValue(costAreaInput);
    material.calcCostPrice = numberInputValue(costPriceInput);
    const unitPrice = updateResult("cost");
    material.costUnitPrice = unitPrice;
    row.querySelector(".material-cost-input").value = unitPrice;
    await saveMaterialToServerNow(material, "已填入供货商主材成本单价");
    renderLines();
    renderTotalsAndPreview();
  });
  calculatorRow?.querySelector(".material-fill-price")?.addEventListener("click", async () => {
    material.calcQuoteArea = numberInputValue(quoteAreaInput);
    material.calcQuotePrice = numberInputValue(quotePriceInput);
    const unitPrice = updateResult("quote");
    material.quoteUnitPrice = unitPrice;
    material.unitPrice = unitPrice;
    row.querySelector(".material-price-input").value = unitPrice;
    await saveMaterialToServerNow(material, "已填入供货商主材单价");
    renderLines();
    renderTotalsAndPreview();
  });
}

function numberInputValue(input) {
  const value = String(input?.value ?? "").trim();
  return toNumber(value || input?.placeholder);
}

function collapseOtherMaterialCalculators(activeRow) {
  els.materialList?.querySelectorAll(".generic-material-calculator-row, .material-calculator-row").forEach((row) => {
    if (row === activeRow) return;
    row.hidden = true;
  });
  els.materialList?.querySelectorAll(".generic-material-calculator-toggle, .material-calculator-toggle").forEach((button) => {
    const parentRow = button.closest("tr");
    const targetRow = parentRow?.classList.contains("generic-material-row")
      ? els.materialList.querySelector(`.generic-material-calculator-row[data-kind-id="${cssEscape(parentRow.dataset.kindId)}"]`)
      : els.materialList.querySelector(`.material-calculator-row[data-material-id="${cssEscape(parentRow?.dataset.materialId)}"]`);
    button.textContent = targetRow && !targetRow.hidden ? "收起" : "换算";
  });
}

async function fillGenericMaterialCost(row, calculatorRow, kind) {
  const costAreaInput = calculatorRow?.querySelector(".generic-material-calc-cost-area");
  const costPriceInput = calculatorRow?.querySelector(".generic-material-calc-cost-price");
  const costResult = calculatorRow?.querySelector(".generic-material-calc-cost-result");
  kind.calcCostArea = numberInputValue(costAreaInput);
  kind.calcCostPrice = numberInputValue(costPriceInput);
  const unitPrice = calculateGenericMaterialUnitPrice(kind.calcCostArea, kind.calcCostPrice);
  if (costResult) costResult.textContent = `${formatMoney(unitPrice)} / ${kind.unit || "单位"}`;
  kind.costUnitPrice = unitPrice;
  const costInput = row.querySelector(".generic-material-cost");
  if (costInput) costInput.value = unitPrice;
  await saveMaterialKindToServerNow(kind, "已填入抽象主材基准成本");
  renderLines();
  renderTotalsAndPreview();
}

async function fillGenericMaterialPrice(row, calculatorRow, kind) {
  const quoteAreaInput = calculatorRow?.querySelector(".generic-material-calc-quote-area");
  const quotePriceInput = calculatorRow?.querySelector(".generic-material-calc-quote-price");
  const quoteResult = calculatorRow?.querySelector(".generic-material-calc-quote-result");
  kind.calcQuoteArea = numberInputValue(quoteAreaInput);
  kind.calcQuotePrice = numberInputValue(quotePriceInput);
  const unitPrice = calculateGenericMaterialUnitPrice(kind.calcQuoteArea, kind.calcQuotePrice);
  if (quoteResult) quoteResult.textContent = `${formatMoney(unitPrice)} / ${kind.unit || "单位"}`;
  kind.quoteUnitPrice = unitPrice;
  kind.unitPrice = unitPrice;
  const priceInput = row.querySelector(".generic-material-price");
  if (priceInput) priceInput.value = unitPrice;
  await saveMaterialKindToServerNow(kind, "已填入抽象主材基准单价");
  renderLines();
  renderTotalsAndPreview();
}

function bindGenericMaterialCalculator(row, kind) {
  const calculatorRow = els.materialList.querySelector(`.generic-material-calculator-row[data-kind-id="${cssEscape(kind.id)}"]`);
  const toggle = row.querySelector(".generic-material-calculator-toggle");
  const costAreaInput = calculatorRow?.querySelector(".generic-material-calc-cost-area");
  const costPriceInput = calculatorRow?.querySelector(".generic-material-calc-cost-price");
  const quoteAreaInput = calculatorRow?.querySelector(".generic-material-calc-quote-area");
  const quotePriceInput = calculatorRow?.querySelector(".generic-material-calc-quote-price");
  const costResult = calculatorRow?.querySelector(".generic-material-calc-cost-result");
  const quoteResult = calculatorRow?.querySelector(".generic-material-calc-quote-result");
  const updateResult = (type) => {
    const areaInput = type === "cost" ? costAreaInput : quoteAreaInput;
    const priceInput = type === "cost" ? costPriceInput : quotePriceInput;
    const result = type === "cost" ? costResult : quoteResult;
    if (!result) return 0;
    const unitPrice = calculateGenericMaterialUnitPrice(numberInputValue(areaInput), numberInputValue(priceInput));
    result.textContent = `${formatMoney(unitPrice)} / ${kind.unit || "单位"}`;
    return unitPrice;
  };
  const saveCalculatorInput = (key, input, type) => {
    input?.addEventListener("input", () => {
      kind[key] = toNumber(input.value);
      updateResult(type);
      saveMaterialKindToServer(kind, "已更新抽象主材换算依据");
    });
  };
  toggle?.addEventListener("click", () => {
    if (!calculatorRow) return;
    const willOpen = calculatorRow.hidden;
    if (willOpen) collapseOtherMaterialCalculators(calculatorRow);
    calculatorRow.hidden = !willOpen;
    toggle.textContent = calculatorRow.hidden ? "换算" : "收起";
    if (!calculatorRow.hidden) {
      updateResult("cost");
      updateResult("quote");
      costAreaInput?.focus();
      costAreaInput?.select();
    }
  });
  saveCalculatorInput("calcCostArea", costAreaInput, "cost");
  saveCalculatorInput("calcCostPrice", costPriceInput, "cost");
  saveCalculatorInput("calcQuoteArea", quoteAreaInput, "quote");
  saveCalculatorInput("calcQuotePrice", quotePriceInput, "quote");
  calculatorRow?.querySelector(".generic-material-fill-cost")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await fillGenericMaterialCost(row, calculatorRow, kind);
  });
  calculatorRow?.querySelector(".generic-material-fill-price")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await fillGenericMaterialPrice(row, calculatorRow, kind);
  });
}

function toggleGenericMaterialLibrary() {
  state.genericMaterialLibraryCollapsed = !state.genericMaterialLibraryCollapsed;
  if (!state.genericMaterialLibraryCollapsed) state.supplierMaterialLibraryCollapsed = true;
  saveUiStatePatch({
    genericMaterialLibraryCollapsed: state.genericMaterialLibraryCollapsed,
    supplierMaterialLibraryCollapsed: state.supplierMaterialLibraryCollapsed
  }, state.genericMaterialLibraryCollapsed ? "已收缩抽象主材" : "已展开抽象主材");
  renderMaterials();
}

function toggleGenericMaterialCategory(categoryName) {
  const targetName = genericMaterialCategoryName(categoryName);
  state.genericMaterialCategoryState = normalizeGenericMaterialCategoryState(state.genericMaterialCategoryState);
  const isOpen = state.genericMaterialCategoryState[targetName] && !state.genericMaterialCategoryState[targetName].collapsed;
  Object.keys(state.genericMaterialCategoryState).forEach((name) => {
    state.genericMaterialCategoryState[name].collapsed = true;
  });
  if (!isOpen && state.genericMaterialCategoryState[targetName]) {
    state.genericMaterialCategoryState[targetName].collapsed = false;
  }
  saveUiStatePatch({ genericMaterialCategoryState: state.genericMaterialCategoryState }, isOpen ? "已收缩抽象主材分类" : "已展开抽象主材分类");
  renderMaterials();
}

function toggleSupplierMaterialLibrary() {
  state.supplierMaterialLibraryCollapsed = !state.supplierMaterialLibraryCollapsed;
  if (!state.supplierMaterialLibraryCollapsed) state.genericMaterialLibraryCollapsed = true;
  saveUiStatePatch({
    genericMaterialLibraryCollapsed: state.genericMaterialLibraryCollapsed,
    supplierMaterialLibraryCollapsed: state.supplierMaterialLibraryCollapsed
  }, state.supplierMaterialLibraryCollapsed ? "已收缩供货商主材" : "已展开供货商主材");
  renderMaterials();
}

function addGenericMaterial() {
  const name = uniqueGenericMaterial("新抽象主材");
  state.genericMaterials.unshift(normalizeGenericMaterial({
    id: makeGenericMaterialId(name),
    name,
    libraryCategory: "未分类",
    primaryCategory: "其他",
    unit: "项",
    costUnitPrice: 0,
    quoteUnitPrice: 0,
    sortOrder: -1
  }, -1));
  state.genericMaterials.forEach((kind, index) => { kind.sortOrder = index; });
  state.genericMaterials.forEach((kind) => saveMaterialKindToServer(kind, "已新增抽象主材"));
  renderMaterials();
}

function addGenericMaterialAt(categoryName = "未分类", position = 0) {
  const category = genericMaterialCategoryName(categoryName);
  const categoryItems = genericMaterialsForManagement().filter((kind) => genericMaterialCategoryName(kind.libraryCategory) === category);
  const insertPosition = normalizeInsertPosition(position, categoryItems.length);
  const name = uniqueGenericMaterial("新抽象主材");
  const newKind = normalizeGenericMaterial({
    id: makeGenericMaterialId(name),
    name,
    libraryCategory: category,
    primaryCategory: "其他",
    unit: "项",
    costUnitPrice: 0,
    quoteUnitPrice: 0,
    sortOrder: insertPosition
  }, insertPosition);
  state.genericMaterials.push(newKind);
  insertItemAndRenumberSortOrder(categoryItems, newKind, insertPosition).forEach((kind, index) => {
    const target = findGenericMaterial(kind.id);
    if (target) target.sortOrder = index;
  });
  state.genericMaterialCategoryState = normalizeGenericMaterialCategoryState(state.genericMaterialCategoryState);
  if (state.genericMaterialCategoryState[category]) {
    Object.keys(state.genericMaterialCategoryState).forEach((name) => {
      state.genericMaterialCategoryState[name].collapsed = name !== category;
    });
  }
  insertItemAndRenumberSortOrder(categoryItems, newKind, insertPosition).forEach((kind) => saveMaterialKindToServer(kind, "已新增抽象主材"));
  saveUiStatePatch({ genericMaterialCategoryState: state.genericMaterialCategoryState }, "已新增抽象主材");
  renderMaterials();
}

function uniqueGenericMaterial(baseName) {
  const names = new Set((state.genericMaterials || []).map((kind) => normalizeName(kind.name)));
  if (!names.has(normalizeName(baseName))) return baseName;
  let index = 2;
  while (names.has(normalizeName(`${baseName}${index}`))) index += 1;
  return `${baseName}${index}`;
}

function deleteGenericMaterial(kind) {
  const name = String(kind.name || "").trim();
  const used = state.materials.some((material) => material.materialKindId === kind.id)
    || state.quotes.some((quote) => quote.lines?.some((line) => line.materialKindId === kind.id))
    || state.templates.some((template) => template.items?.some((item) => item.materialKindId === kind.id));
  if (used) {
    showNoticeModal("不能删除", "这个抽象主材已经被具体主材、模板或报价使用。");
    return;
  }
  confirmSimpleDelete(name || "抽象主材", () => {
    state.genericMaterials = state.genericMaterials.filter((item) => item.id !== kind.id);
    state.genericMaterials.forEach((item, index) => { item.sortOrder = index; });
    deleteMaterialKindFromServer(kind.id, "已删除抽象主材");
    state.genericMaterials.forEach((item) => saveMaterialKindToServer(item, "已删除抽象主材"));
    renderMaterials();
  });
}

function deleteMaterial(material) {
  const name = String(material.name || "").trim();
  if (!name) {
    showNoticeModal("不能删除", "请先填写主材名称，再删除。");
    return;
  }
  confirmSimpleDelete(name, () => {
    state.materials = state.materials.filter((item) => item.id !== material.id);
    state.materials.forEach((item, index) => {
      item.sortOrder = index;
    });
    deleteMaterialFromServer(material.id, "已删除主材");
    state.materials.forEach((item) => saveMaterialToServer(item, "已删除主材"));
    renderMaterials();
  });
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
  state.templates.forEach((template) => saveTemplateToServer(template, "已添加模板"));
  renderTemplates();
}

function deleteTemplate(template) {
  confirmSimpleDelete(template.name || "模板", () => {
    state.templates = state.templates.filter((item) => item.id !== template.id);
    state.templates.forEach((item, index) => { item.sortOrder = index; });
    deleteTemplateFromServer(template.id, "已删除模板");
    state.templates.forEach((item) => saveTemplateToServer(item, "已删除模板"));
    renderTemplates();
  });
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
  state.templates.forEach((entry) => saveTemplateToServer(entry, "已复制模板"));
  copiedTemplate.items.forEach((item) => saveTemplateItemToServer(item, copiedTemplate, "已复制模板"));
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

function addTemplateItem(template, sourceType = "labor", position = null) {
  const currentItems = templateItemsForEditing(template);
  const item = normalizeTemplateItem({
    id: makeId("template-item"),
    sourceType,
    sortOrder: position === null ? currentItems.length : normalizeInsertPosition(position, currentItems.length)
  }, template.items.length);
  if (sourceType === "labor") {
    item.itemName = "";
  } else {
    item.materialKindId = "";
    item.materialCategory = "";
    item.materialId = "";
  }
  template.items = insertItemAndRenumberSortOrder(currentItems, item, position);
  markTemplateManualOrder(template);
  saveTemplateToServer(template, sourceType === "material" ? "已添加主材模板项" : "已添加工费模板项");
  template.items.forEach((entry) => saveTemplateItemToServer(entry, template, sourceType === "material" ? "已添加主材模板项" : "已添加工费模板项"));
  renderTemplates();
}

function deleteTemplateItem(template, itemId) {
  const item = template.items.find((entry) => entry.id === itemId);
  confirmSimpleDelete(item?.itemName || item?.materialCategory || "模板项目", () => {
    template.items = template.items.filter((entry) => entry.id !== itemId);
    template.items.forEach((entry, index) => { entry.sortOrder = index; });
    deleteTemplateItemFromServer(itemId, "已删除模板项");
    template.items.forEach((entry) => saveTemplateItemToServer(entry, template, "已删除模板项"));
    renderTemplates();
  });
}

function confirmSimpleDelete(targetName = "这项内容", onConfirm = () => {}, options = {}) {
  if (!document?.body?.appendChild) return;
  document.querySelector?.(".delete-confirm-modal")?.closest(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="deleteConfirmTitle">
      <div class="modal-head">
        <div>
          <h3 id="deleteConfirmTitle">${escapeHtml(options.title || "确认删除")}</h3>
          <p>${escapeHtml(options.message || "删除后无法直接撤销，请确认要删除下面这项内容。")}</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <div class="delete-confirm-name">${escapeHtml(targetName)}</div>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel ghost" type="button">取消</button>
        <button class="modal-confirm danger" type="button">删除</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".modal-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Enter") {
      event.preventDefault();
      overlay.querySelector(".modal-confirm").click();
    }
  });
  overlay.querySelector(".modal-confirm").addEventListener("click", () => {
    close();
    onConfirm();
  });
  overlay.querySelector(".modal-cancel").focus();
}

function showNoticeModal(title = "提示", message = "") {
  if (!document?.body?.appendChild) return;
  document.querySelector?.(".notice-modal")?.closest(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal notice-modal" role="dialog" aria-modal="true" aria-labelledby="noticeModalTitle">
      <div class="modal-head">
        <div>
          <h3 id="noticeModalTitle">${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-actions">
        <button class="modal-confirm" type="button">知道了</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".modal-confirm").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter") close();
  });
  overlay.querySelector(".modal-confirm").focus();
}

function renderTemplateInsertRow(position) {
  return `
    <tr class="template-insert-row" data-position="${position}">
      <td colspan="6">
        <div class="template-insert-slot" aria-label="在这里添加模板项">
          ${renderLaborMaterialInsertActions("template-insert-actions", "insert-template-labor", "insert-template-material")}
        </div>
      </td>
    </tr>
  `;
}

function renderTemplates() {
  if (!els.templateList) return;
  const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (els.templateCount) els.templateCount.textContent = `${templates.length} 个模板`;
  els.templateList.innerHTML = templates.map((template) => `
    <section class="template-card ${template.collapsed ? "collapsed" : ""}" data-template-id="${escapeHtml(template.id)}" draggable="true">
      <div class="template-head">
        <button class="template-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动模板排序" aria-label="点击展开或收缩，拖动模板排序" aria-expanded="${String(!template.collapsed)}">⋮⋮</button>
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
            ${renderTemplateInsertRow(0)}
            ${templateItemsForEditing(template).map((item, index) => {
              const templateLaborItem = item.sourceType === "labor" ? findLaborItem(item.itemName) : null;
              const templateMaterial = item.sourceType === "material" ? findMaterial(item.materialId) : null;
              const templateGenericMaterial = item.sourceType === "material"
                ? findGenericMaterial(item.materialKindId) || findGenericMaterial(templateMaterial?.materialKindId)
                : null;
              const templateCategory = item.sourceType === "material"
                ? templateGenericMaterial?.primaryCategory || templateMaterial?.primaryCategory || item.materialCategory
                : templateLaborItem?.category || "";
              const materialInputValue = templateMaterial?.name || templateGenericMaterial?.name || "";
              const materialLinkLabel = templateMaterial ? `已挂：${templateMaterial.name}` : "未挂具体";
              return `
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
                        <input class="template-material-input" type="text" aria-label="主材条目" placeholder="输入抽象主材或具体主材名称" value="${escapeHtml(materialInputValue)}" autocomplete="off">
                        <div class="suggestions"></div>
                      </div>
                    ` : `
                      <div class="template-picker">
                        <input class="template-labor-input" type="text" aria-label="工费条目" placeholder="输入工费名称，选择相似工费" value="${escapeHtml(item.displayName || item.itemName || "")}" autocomplete="off">
                        <div class="suggestions"></div>
                      </div>
                    `}
                  </td>
                  <td>
                    ${item.sourceType === "material" ? `
                      <div class="template-category-action">
                        <button class="template-jump-material muted-cell ${categoryToneClass(templateCategory)}" type="button" ${item.materialId ? "" : "disabled"} title="${item.materialId ? "编辑已挂接的具体主材" : "在左侧输入框搜索并选择具体主材即可挂接"}">${escapeHtml(materialLinkLabel)}</button>
                      </div>
                    ` : `
                      <button class="template-jump-labor muted-cell ${categoryToneClass(templateCategory)}" type="button" ${templateLaborItem ? "" : "disabled"} title="编辑工费库条目">${escapeHtml(templateLaborItem?.category || "未匹配")}</button>
                    `}
                  </td>
                  <td><input class="template-area" type="text" value="${escapeHtml(item.area)}" placeholder="可空"></td>
                  <td><input class="template-quantity" type="number" min="0" step="0.01" value="${item.quantity || ""}" placeholder="自动推荐"></td>
                  <td><button class="delete-template-item small danger" type="button">删除</button></td>
                </tr>
                ${renderTemplateInsertRow(index + 1)}
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      `}
    </section>
  `).join("");

  els.templateList.querySelectorAll(".template-card").forEach((card) => {
    const template = state.templates.find((item) => item.id === card.dataset.templateId);
    if (!template) return;
    let canDragTemplate = false;
    let didDragTemplate = false;
    const templateDragButton = card.querySelector(".template-drag");
    templateDragButton?.addEventListener("pointerdown", () => {
      canDragTemplate = true;
      didDragTemplate = false;
    });
    templateDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragTemplate = false; }, 0);
    });
    templateDragButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      canDragTemplate = false;
      if (didDragTemplate) {
        didDragTemplate = false;
        return;
      }
      toggleTemplate(template);
    });
    card.addEventListener("dragstart", (event) => {
      if (!canDragTemplate && !event.target.closest(".template-drag")) {
        event.preventDefault();
        canDragTemplate = false;
        return;
      }
      didDragTemplate = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", template.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      canDragTemplate = false;
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
        saveTemplateToServer(template, "已更新模板图标");
        renderTemplates();
      });
    });
    bindEditableObjectField(card, ".template-name-input", template, "name", { message: "已更新模板名称", save: (target, message) => saveTemplateToServer(target, message) });
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
    card.querySelectorAll(".template-insert-row").forEach((slotRow) => {
      const position = Number(slotRow.dataset.position || 0);
      slotRow.querySelector(".insert-template-labor")?.addEventListener("click", () => addTemplateItem(template, "labor", position));
      slotRow.querySelector(".insert-template-material")?.addEventListener("click", () => addTemplateItem(template, "material", position));
    });
    card.querySelectorAll("tr[data-template-item-id]").forEach((row) => {
      const item = template.items.find((entry) => entry.id === row.dataset.templateItemId);
      if (!item) return;
      row.querySelector(".template-source").addEventListener("change", (event) => {
        item.sourceType = event.target.value === "material" ? "material" : "labor";
        if (item.sourceType === "material") {
          item.materialKindId = "";
          item.materialCategory = "";
          item.materialId = "";
          item.itemName = "";
        } else {
          item.itemName = item.itemName || currentLaborItems()[0]?.name || "";
          item.materialKindId = "";
          item.materialId = "";
        }
        markTemplateManualOrder(template);
        saveTemplateToServer(template, "已切换模板项来源");
        saveTemplateItemToServer(item, template, "已切换模板项来源");
        renderTemplates();
      });
      const laborInput = row.querySelector(".template-labor-input");
      if (laborInput) {
        const suggestions = row.querySelector(".suggestions");
        bindSuggestionSearchInput(laborInput, suggestions, {
          onInput: (value) => {
            item.itemName = value;
            item.displayName = value;
            markTemplateManualOrder(template);
            saveTemplateToServer(template, "已更新模板工费项");
            saveTemplateItemToServer(item, template, "已更新模板工费项");
            renderTemplateLaborSuggestions(suggestions, item, value);
          },
          onFocus: (value) => renderTemplateLaborSuggestions(suggestions, item, value),
          onKeydown: (event) => handleTemplateLaborSuggestionKeys(event, suggestions, item)
        });
      }
      row.querySelector(".template-jump-labor")?.addEventListener("click", () => {
        if (!item.itemName || !findLaborItem(item.itemName)) return;
        openLaborItemEditor(item.itemName, currentVersion()?.id, {
          templateId: template.id,
          templateItemId: item.id
        });
      });
      row.querySelector(".template-jump-material")?.addEventListener("click", () => {
        if (!item.materialId || !findMaterial(item.materialId)) return;
        openMaterialEditor(item.materialId, {
          templateId: template.id,
          templateItemId: item.id
        });
      });
      const materialInput = row.querySelector(".template-material-input");
      if (materialInput) {
        const suggestions = row.querySelector(".suggestions");
        bindSuggestionSearchInput(materialInput, suggestions, {
          onInput: (value) => {
            item.materialKindId = "";
            item.materialId = "";
            item.materialCategory = "";
            markTemplateManualOrder(template);
            saveTemplateToServer(template, "已更新模板主材");
            saveTemplateItemToServer(item, template, "已更新模板主材");
            renderTemplateMaterialSuggestions(suggestions, item, value);
          },
          onFocus: (value) => renderTemplateMaterialSuggestions(suggestions, item, value),
          onKeydown: (event) => handleTemplateMaterialSuggestionKeys(event, suggestions, item)
        });
      }
      bindEditableObjectField(row, ".template-area", item, "area", { message: "已更新模板部位", save: (target, message) => saveTemplateItemToServer(target, template, message) });
      bindEditableObjectField(row, ".template-quantity", item, "quantity", { mode: "number", message: "已更新模板工程量", save: (target, message) => saveTemplateItemToServer(target, template, message) });
      row.querySelector(".delete-template-item").addEventListener("click", () => deleteTemplateItem(template, item.id));
    });
  });
}

function toggleTemplate(template) {
  const willOpen = template.collapsed;
  state.templates.forEach((entry) => { entry.collapsed = true; });
  template.collapsed = !willOpen;
  state.templates.forEach((entry) => saveTemplateToServer(entry, template.collapsed ? "已收起模板" : "已展开模板"));
  renderTemplates();
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
  state.templates.forEach((template) => saveTemplateToServer(template, "已调整模板顺序"));
  renderTemplates();
}

function renderTemplateLaborSuggestions(container, templateItem, query) {
  const cleaned = normalizeName(query);
  const comparableItems = cleaned ? findComparableItems(cleaned, 6) : [];
  const exactItem = currentLaborItems().find((item) => normalizeName(item.name) === cleaned);
  const exactAliasMatch = cleaned ? findLaborAliasMatch(cleaned) : null;
  const visibleItems = prioritizeExactLaborAlias(comparableItems, exactAliasMatch);
  const hasExactMatch = Boolean(exactItem || exactAliasMatch);
  const hasPrefixMatch = hasLaborPrefixMatch(cleaned);
  const canCreate = Boolean(cleaned) && !hasExactMatch && !hasPrefixMatch;

  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }

  if (!visibleItems.length && !canCreate) {
    closeSuggestionList(container);
    return;
  }

  const hint = exactItem
    ? `已找到匹配项：${exactItem.name}`
    : exactAliasMatch
      ? `已找到别名：${exactAliasMatch.alias}，实际：${exactAliasMatch.item.name}`
      : visibleItems.length
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
    ${visibleItems.map((item) => renderLaborSuggestionOption(item)).join("")}
  `;
  activateSuggestionList(container, (button) => activateTemplateLaborSuggestion(button, templateItem));
}

function handleTemplateLaborSuggestionKeys(event, container, templateItem) {
  handleSuggestionKeyboard(event, container, (button) => activateTemplateLaborSuggestion(button, templateItem));
}

function activateTemplateLaborSuggestion(button, templateItem) {
  if (!button) return;
  if (button.dataset.itemName) {
    templateItem.itemName = button.dataset.itemName;
    templateItem.displayName = button.dataset.displayName || "";
    const template = templateForItem(templateItem);
    markTemplateManualOrder(template);
    saveTemplateToServer(template, "已选择模板工费项");
    saveTemplateItemToServer(templateItem, template, "已选择模板工费项");
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
    templateItem.displayName = "";
    const template = templateForItem(templateItem);
    markTemplateManualOrder(template);
    saveTemplateToServer(template, "已选择模板工费项");
    saveTemplateItemToServer(templateItem, template, "已选择模板工费项");
    renderTemplates();
    return;
  }
  const comparable = findComparableItems(name, 5);
  const source = comparable[0]?.item || comparable[0];
  const parsedName = parsePriceNameUnit(name);
  const unit = parsedName?.unit || source?.unit || "项";
  const itemName = parsedName ? name : `${name}/${unit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    templateItem.itemName = existingWithUnit.name;
    templateItem.displayName = "";
    const template = templateForItem(templateItem);
    markTemplateManualOrder(template);
    saveTemplateToServer(template, "已选择模板工费项");
    saveTemplateItemToServer(templateItem, template, "已选择模板工费项");
    renderTemplates();
    return;
  }
  const similarText = comparable.length ? comparable.map((entry) => entry.alias || entry.item?.name || entry.name).join("、") : "暂无相似条目";
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
    quantityFormula: source?.quantityFormula || DEFAULT_QUANTITY_FORMULA,
    quantityRoundDown: Boolean(source?.quantityRoundDown)
  }, version.items.length);
  version.items.push(newItem);
  templateItem.itemName = newItem.name;
  templateItem.displayName = "";
  const template = templateForItem(templateItem);
  markTemplateManualOrder(template);
  saveLaborItemToServer(newItem, version.id, "已新增模板工费项");
  saveTemplateToServer(template, "已新增模板工费项");
  saveTemplateItemToServer(templateItem, template, "已新增模板工费项");
  renderAll();
}

function renderTemplateMaterialSuggestions(container, templateItem, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }
  const kindMatches = findSimilarGenericMaterials(cleaned).slice(0, 6);
  const matches = findSimilarMaterials(cleaned, templateItem.materialCategory).slice(0, 3);
  if (!kindMatches.length && !matches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配抽象主材。可以先到主材库维护抽象主材。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">选择抽象主材用于模板占位；选择具体主材会直接挂接到这个模板项。</div>
    ${kindMatches.map((kind) => renderGenericMaterialSuggestionOption(kind)).join("")}
    ${matches.map((material) => renderMaterialSuggestionOption(material)).join("")}
  `;
  activateSuggestionList(container, (button) => activateTemplateMaterialSuggestion(button, templateItem));
}

function handleTemplateMaterialSuggestionKeys(event, container, templateItem) {
  handleSuggestionKeyboard(event, container, (button) => activateTemplateMaterialSuggestion(button, templateItem));
}

function activateTemplateMaterialSuggestion(button, templateItem) {
  if (button?.dataset.genericMaterialId) {
    const kind = findGenericMaterial(button.dataset.genericMaterialId);
    if (!kind) return;
    templateItem.materialKindId = kind.id;
    templateItem.materialId = "";
    templateItem.materialCategory = kind.primaryCategory || "";
    const template = templateForItem(templateItem);
    markTemplateManualOrder(template);
    saveTemplateToServer(template, "已选择模板抽象主材");
    saveTemplateItemToServer(templateItem, template, "已选择模板抽象主材");
    renderTemplates();
    return;
  }
  const material = findMaterial(button?.dataset.materialId);
  if (!material) return;
  const kind = findGenericMaterial(material.materialKindId);
  templateItem.materialKindId = kind?.id || templateItem.materialKindId || "";
  templateItem.materialId = material.id;
  templateItem.materialCategory = kind?.primaryCategory || material.primaryCategory || templateItem.materialCategory || "";
  const template = templateForItem(templateItem);
  markTemplateManualOrder(template);
  saveTemplateToServer(template, "已选择模板具体主材");
  saveTemplateItemToServer(templateItem, template, "已选择模板具体主材");
  renderTemplates();
}

function toggleLaborItemDetails(itemName) {
  const item = findLaborItem(itemName);
  if (state.expandedLaborItemName === itemName && item && returnContextForItem(item)) {
    returnToLibraryCaller();
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
      saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
      syncQuoteItemLaborParts(item).forEach(({ quote, line }) => saveQuoteItemToServer(line, quote, "已同步工费报价"));
      renderLines();
      renderTotalsAndPreview();
    });
  });

  const descriptionInput = node.querySelector(".price-description");
  if (descriptionInput) {
    descriptionInput.addEventListener("input", (event) => {
      item.description = event.target.value;
      saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
      renderTotalsAndPreview();
    });
  }

  const formulaInput = node.querySelector(".price-quantity-formula");
  if (formulaInput) {
    formulaInput.addEventListener("input", (event) => {
      item.quantityFormula = event.target.value;
      saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
      renderLines();
      renderTotalsAndPreview();
    });
  }

  const roundDownInput = node.querySelector(".price-quantity-round-down");
  if (roundDownInput) {
    roundDownInput.addEventListener("change", (event) => {
      item.quantityRoundDown = event.target.checked;
      saveLaborItemToServer(item, currentVersion()?.id, "已更新推荐量取整方式");
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
      saveLaborItemToServer(item, currentVersion()?.id, "已更新工费库");
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
          if (item.categoryId === category.id) {
            item.category = nextName;
            saveLaborItemToServer(item, version.id, "已更新分类库");
          }
        });
      });
      saveLaborCategoryToServer(category, "已更新分类库");
      renderLaborLibrary();
    });
    node.querySelector(".category-description-input").addEventListener("input", (event) => {
      category.description = event.target.value;
      saveLaborCategoryToServer(category, "已更新分类库");
      renderTotalsAndPreview();
    });
    node.querySelector(".category-delete").addEventListener("click", () => {
      confirmSimpleDelete(category.name || "分类", () => {
        state.categories = state.categories.filter((item) => item.id !== category.id);
        state.versions.forEach((version) => {
          (version.items || []).forEach((item) => {
            if (item.categoryId === category.id) {
              item.categoryId = "";
              item.category = "";
              saveLaborItemToServer(item, version.id, "已删除分类");
            }
          });
        });
        deleteLaborCategoryFromServer(category.id, "已删除分类");
        renderLaborLibrary();
      });
    });
  });

  bindCategoryDragAndDrop();
}

function addCategory() {
  const category = {
    id: makeId("category"),
    name: createUniqueCategoryName(),
    description: "",
    sortOrder: currentCategories().length
  };
  state.categories.push(category);
  saveLaborCategoryToServer(category, "已添加分类");
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
  addLaborItemAt();
}

function addLaborItemAt(position = null, categoryId = "", visibleItems = null) {
  const version = currentVersion();
  if (!version) return;
  const name = createUniqueLaborItemName();
  const category = findCategory(categoryId);
  const newItem = {
    id: makeId("labor"),
    name,
    sortOrder: nextItemSortOrder(category?.id || ""),
    unit: parsePriceNameUnit(name)?.unit || "项",
    categoryId: category?.id || "",
    category: category?.name || "",
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
    quantityRoundDown: false,
    usesMaterial: false,
    materialCategory: "",
    defaultMaterialId: ""
  };
  version.items.push(newItem);
  if (Array.isArray(visibleItems) && Number.isFinite(Number(position))) {
    const inserted = insertItemAndRenumberSortOrder(visibleItems, newItem, Number(position));
    inserted
      .filter((item) => (item.categoryId || "") === (newItem.categoryId || ""))
      .forEach((item, index) => {
        const actual = version.items.find((entry) => entry.name === item.name);
        if (actual) actual.sortOrder = index;
      });
  }
  state.pendingLaborItemName = newItem.name;
  version.items.forEach((item) => saveLaborItemToServer(item, version.id, "新增工费条目"));
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
  saveUiStatePatch({ categoryLibraryCollapsed: state.categoryLibraryCollapsed }, state.categoryLibraryCollapsed ? "已收起分类库" : "已展开分类库");
  renderLaborLibrary();
}

function bindCategoryDragAndDrop() {
  if (!els.categoryList) return;
  let draggedId = "";
  const rows = [...els.categoryList.querySelectorAll(".category-row")];

  rows.forEach((row) => {
    let canDragCategory = false;
    const categoryDragButton = row.querySelector(".category-drag");
    categoryDragButton?.addEventListener("pointerdown", () => { canDragCategory = true; });
    categoryDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragCategory = false; }, 0);
    });
    categoryDragButton?.addEventListener("click", () => { canDragCategory = false; });
    row.addEventListener("dragstart", (event) => {
      if (!canDragCategory && !event.target.closest(".category-drag")) {
        event.preventDefault();
        canDragCategory = false;
        return;
      }
      draggedId = row.dataset.categoryId || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      canDragCategory = false;
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
  state.categories.forEach((category) => saveLaborCategoryToServer(category, "已调整分类顺序"));
  renderLaborLibrary();
}

function bindLaborItemDragAndDrop(visibleItems) {
  if (!els.priceList) return;
  let draggedItemName = "";
  let draggedCategoryId = "";
  const rows = [...els.priceList.querySelectorAll(".price-row")];

  rows.forEach((row) => {
    let canDragLaborItem = false;
    const priceDragButton = row.querySelector(".price-drag");
    priceDragButton?.addEventListener("pointerdown", () => { canDragLaborItem = true; });
    priceDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragLaborItem = false; }, 0);
    });
    priceDragButton?.addEventListener("click", () => { canDragLaborItem = false; });
    row.addEventListener("dragstart", (event) => {
      if (!canDragLaborItem && !event.target.closest(".price-drag")) {
        event.preventDefault();
        canDragLaborItem = false;
        return;
      }
      draggedItemName = row.dataset.itemName || "";
      draggedCategoryId = row.dataset.categoryId || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      canDragLaborItem = false;
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
    if (actual) {
      actual.sortOrder = index;
      saveLaborItemToServer(actual, version.id, "已调整工费条目顺序");
    }
  });

  renderLaborLibrary();
}

function bindMaterialDragAndDrop(visibleMaterials) {
  if (!els.materialList) return;
  let draggedMaterialId = "";
  const rows = [...els.materialList.querySelectorAll(".material-row")];

  rows.forEach((row) => {
    let canDragMaterial = false;
    const materialDragButton = row.querySelector(".material-drag");
    materialDragButton?.addEventListener("pointerdown", () => { canDragMaterial = true; });
    materialDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragMaterial = false; }, 0);
    });
    materialDragButton?.addEventListener("click", () => { canDragMaterial = false; });
    row.addEventListener("dragstart", (event) => {
      if (!canDragMaterial && !event.target.closest(".material-drag")) {
        event.preventDefault();
        canDragMaterial = false;
        return;
      }
      draggedMaterialId = row.dataset.materialId || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      canDragMaterial = false;
      draggedMaterialId = "";
      row.classList.remove("dragging");
      rows.forEach((item) => item.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (event) => {
      if (!draggedMaterialId || draggedMaterialId === row.dataset.materialId) return;
      event.preventDefault();
      rows.forEach((item) => item.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetMaterialId = row.dataset.materialId || "";
      if (!draggedMaterialId || !targetMaterialId || draggedMaterialId === targetMaterialId) return;
      moveMaterialBefore(draggedMaterialId, targetMaterialId, visibleMaterials);
      draggedMaterialId = "";
    });
  });
}

function moveMaterialBefore(draggedId, targetId, visibleMaterials) {
  const visibleIds = new Set((visibleMaterials || []).map((material) => material.id));
  const hiddenMaterials = state.materials
    .filter((material) => !visibleIds.has(material.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = (visibleMaterials || []).slice();
  const draggedIndex = reordered.findIndex((material) => material.id === draggedId);
  const targetIndex = reordered.findIndex((material) => material.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, dragged);
  state.materials = [...reordered, ...hiddenMaterials].map((material, index) => ({ ...material, sortOrder: index }));
  state.materials.forEach((material) => saveMaterialToServer(material, "已调整主材顺序"));
  renderMaterials();
}

function bindGenericMaterialDragAndDrop() {
  if (!els.materialList) return;
  let draggedKindId = "";
  let draggedCategoryName = "";
  const rows = [...els.materialList.querySelectorAll(".generic-material-row")];

  rows.forEach((row) => {
    let canDragGenericMaterial = false;
    const dragButton = row.querySelector(".generic-material-drag");
    dragButton?.addEventListener("pointerdown", () => { canDragGenericMaterial = true; });
    dragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragGenericMaterial = false; }, 0);
    });
    dragButton?.addEventListener("click", () => { canDragGenericMaterial = false; });
    row.addEventListener("dragstart", (event) => {
      if (!canDragGenericMaterial && !event.target.closest(".generic-material-drag")) {
        event.preventDefault();
        canDragGenericMaterial = false;
        return;
      }
      draggedKindId = row.dataset.kindId || "";
      draggedCategoryName = row.dataset.categoryName || "";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      canDragGenericMaterial = false;
      draggedKindId = "";
      draggedCategoryName = "";
      row.classList.remove("dragging");
      rows.forEach((item) => item.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (event) => {
      if (!draggedKindId || draggedKindId === row.dataset.kindId) return;
      if (draggedCategoryName !== row.dataset.categoryName) return;
      event.preventDefault();
      rows.forEach((item) => item.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetKindId = row.dataset.kindId || "";
      if (draggedCategoryName !== row.dataset.categoryName) return;
      if (!draggedKindId || !targetKindId || draggedKindId === targetKindId) return;
      moveGenericMaterialBefore(draggedKindId, targetKindId);
      draggedKindId = "";
    });
  });
}

function moveGenericMaterialBefore(draggedId, targetId) {
  const dragged = findGenericMaterial(draggedId);
  const target = findGenericMaterial(targetId);
  if (!dragged || !target) return;
  const category = genericMaterialCategoryName(dragged.libraryCategory);
  if (category !== genericMaterialCategoryName(target.libraryCategory)) return;
  const reordered = genericMaterialsForManagement().filter((kind) => genericMaterialCategoryName(kind.libraryCategory) === category);
  const draggedIndex = reordered.findIndex((kind) => kind.id === draggedId);
  const targetIndex = reordered.findIndex((kind) => kind.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [draggedKind] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, draggedKind);
  reordered.forEach((kind, index) => {
    const original = findGenericMaterial(kind.id);
    if (original) original.sortOrder = index;
  });
  reordered.forEach((kind) => saveMaterialKindToServer(kind, "已调整抽象主材顺序"));
  renderMaterials();
}

function bindGenericMaterialCategoryDragAndDrop() {
  if (!els.materialList) return;
  let draggedCategoryName = "";
  const rows = [...els.materialList.querySelectorAll(".generic-material-group-row")];

  rows.forEach((row) => {
    let canDragCategory = false;
    let categoryWasDragged = false;
    const dragButton = row.querySelector(".generic-material-category-drag");
    dragButton?.addEventListener("pointerdown", () => { canDragCategory = true; });
    dragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragCategory = false; }, 0);
    });
    dragButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      canDragCategory = false;
      if (categoryWasDragged) return;
      toggleGenericMaterialCategory(row.dataset.categoryName);
    });
    row.addEventListener("dragstart", (event) => {
      if (!canDragCategory && !event.target.closest(".generic-material-category-drag")) {
        event.preventDefault();
        canDragCategory = false;
        return;
      }
      draggedCategoryName = row.dataset.categoryName || "";
      categoryWasDragged = true;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      canDragCategory = false;
      draggedCategoryName = "";
      row.classList.remove("dragging");
      rows.forEach((item) => item.classList.remove("drag-over"));
      setTimeout(() => { categoryWasDragged = false; }, 0);
    });
    row.addEventListener("dragover", (event) => {
      const targetCategoryName = row.dataset.categoryName || "";
      if (!draggedCategoryName || draggedCategoryName === targetCategoryName) return;
      event.preventDefault();
      rows.forEach((item) => item.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetCategoryName = row.dataset.categoryName || "";
      if (!draggedCategoryName || !targetCategoryName || draggedCategoryName === targetCategoryName) return;
      moveGenericMaterialCategoryBefore(draggedCategoryName, targetCategoryName);
      draggedCategoryName = "";
    });
  });
}

function moveGenericMaterialCategoryBefore(draggedName, targetName) {
  const categories = sortedGenericMaterialCategories();
  const draggedIndex = categories.findIndex((category) => category === draggedName);
  const targetIndex = categories.findIndex((category) => category === targetName);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = categories.splice(draggedIndex, 1);
  categories.splice(targetIndex, 0, dragged);
  categories.forEach((category, index) => {
    if (!state.genericMaterialCategoryState[category]) {
      state.genericMaterialCategoryState[category] = { collapsed: true, sortOrder: index };
    }
    state.genericMaterialCategoryState[category].sortOrder = index;
  });
  saveUiStatePatch({ genericMaterialCategoryState: state.genericMaterialCategoryState }, "已调整抽象主材分类顺序");
  renderMaterials();
}

function renderTotalsAndPreview() {
  const quote = currentQuote();
  if (!quote) return;
  const totals = calculateTotals(quote);
  const showAmountColumns = quote.showAmountColumns !== false;
  const hasPackage = (quote?.spaces || []).some((space) => space.type === "package" && findPackage(space.packageId));
  const includeManagementFee = quote.includeManagementFee !== false;
  const includeDesignFee = quote.includeDesignFee !== false;
  const includeTax = quote.includeTax !== false;
  renderPreviewTableHead(showAmountColumns);
  els.laborSubtotalText.textContent = formatMoney(totals.laborSubtotal);
  els.materialSubtotalText.textContent = formatMoney(totals.materialSubtotal);
  if (els.packageSubtotalText) els.packageSubtotalText.textContent = formatMoney(totals.packageSubtotal);
  if (els.packageSubtotalRow) els.packageSubtotalRow.hidden = !hasPackage;
  els.managementText.textContent = formatMoney(totals.management);
  els.designText.textContent = formatMoney(totals.design);
  els.taxText.textContent = formatMoney(totals.tax);
  if (els.managementRow) els.managementRow.hidden = !includeManagementFee;
  if (els.designRow) els.designRow.hidden = !includeDesignFee;
  if (els.taxRow) els.taxRow.hidden = !includeTax;
  els.grandTotalText.textContent = formatMoney(totals.grand);
  els.previewTitle.textContent = `${quote.projectName || "工程"}工程量`;
  els.previewMeta.textContent = `客户：${quote.clientName || "未填写"}　报价日期：${quote.quoteDate || ""}　工费版本：${currentVersion()?.name || ""}`;
  els.previewTotal.textContent = formatMoney(totals.grand);
  els.previewLaborSubtotal.textContent = formatMoney(totals.laborSubtotal);
  els.previewMaterialSubtotal.textContent = formatMoney(totals.materialSubtotal);
  if (els.previewPackageSubtotal) els.previewPackageSubtotal.textContent = formatMoney(totals.packageSubtotal);
  if (els.previewPackageSubtotalRow) els.previewPackageSubtotalRow.hidden = !hasPackage;
  els.previewManagement.textContent = formatMoney(totals.management);
  els.previewDesign.textContent = formatMoney(totals.design);
  els.previewTax.textContent = formatMoney(totals.tax);
  if (els.previewManagementRow) els.previewManagementRow.hidden = !includeManagementFee;
  if (els.previewDesignRow) els.previewDesignRow.hidden = !includeDesignFee;
  if (els.previewTaxRow) els.previewTaxRow.hidden = !includeTax;
  els.previewGrand.textContent = formatMoney(totals.grand);
  let rowIndex = 0;
  const allGroups = sortedProjectGroups(quote);
  const packageGroups = allGroups.filter((space) => space.type === "package");
  const regularGroups = allGroups.filter((space) => space.type !== "package");
  const packageHtml = packageGroups.map((space) => {
    const packageEntry = findPackage(space.packageId);
    if (!packageEntry) return "";
    rowIndex += 1;
    return renderPackagePreviewRows(space, packageEntry, rowIndex, showAmountColumns);
  }).join("");
  const groupsHtml = regularGroups.map((space) => {
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
        <td colspan="${showAmountColumns ? 5 : 3}"><strong>${escapeHtml(projectGroupDisplayName(space))}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</td>
      </tr>
      ${spaceLines.map((line) => {
    const item = findLaborItem(line.priceItemName, quote.priceVersionId);
    const selectedMaterial = findMaterial(line.materialId);
    const selectedKind = findGenericMaterial(line.materialKindId) || findGenericMaterial(selectedMaterial?.materialKindId);
    const unitPrice = calculateQuoteItemUnitPrice(line);
    const amount = toNumber(line.quantity) * unitPrice;
    const processNote = processNoteForQuoteItem(line, quote.priceVersionId);
    const lineTypeLabel = isMaterialQuoteItem(line) ? "装修主材" : "清工辅料";
    rowIndex += 1;
    return `
      <tr class="preview-main-row">
        <td>${rowIndex}</td>
        <td>
          <span class="preview-type-label">${lineTypeLabel}</span>
          <strong>${escapeHtml(line.engineeringName || selectedKind?.name || selectedMaterial?.name || "")}</strong>
          ${line.area ? `<span class="preview-part-note">${escapeHtml(line.area)}</span>` : ""}
        </td>
        <td>${formatNumber(line.quantity)}</td>
        <td>${escapeHtml(item?.unit || selectedMaterial?.unit || selectedKind?.unit || "")}</td>
        ${showAmountColumns ? `
        <td>${formatMoney(unitPrice)}</td>
        <td>${formatMoney(amount)}</td>
        ` : ""}
      </tr>
      ${processNote ? `
      <tr class="preview-note-row">
        <td></td>
        <td colspan="${showAmountColumns ? 5 : 3}"><span>工艺说明</span>${escapeHtml(processNote)}</td>
      </tr>
      ` : ""}
    `;
      }).join("")}
    `;
  }).join("");
  els.previewRows.innerHTML = packageHtml + groupsHtml;
}

function renderPackagePreviewRows(space, packageEntry, rowIndex, showAmountColumns) {
  const colspan = showAmountColumns ? 6 : 4;
  const summary = packageQuoteSummary(packageEntry);
  const buildingArea = toNumber(space.buildingArea);
  const unitPricePerSqm = toNumber(space.unitPricePerSqm);
  const packageTotal = buildingArea > 0 && unitPricePerSqm > 0 ? buildingArea * unitPricePerSqm : 0;
  const packageName = space.name || packageEntry.name || "套餐";
  return `
    ${summary.specialSections.length ? `
    <tr class="preview-package-items-row">
      <td colspan="${colspan}">
        <div class="preview-package-items">
          ${summary.specialSections.map(({ section, items }) => `
            <section>
              <strong>套餐模板：${escapeHtml(section.name || section.originalTemplateName)}</strong>
              ${renderPackageQuoteItemList(items, "无特殊项目")}
            </section>
          `).join("")}
        </div>
      </td>
    </tr>
    ` : ""}
    <tr class="preview-space-row preview-package-section-row">
      <td></td>
      <td colspan="${showAmountColumns ? 5 : 3}"><strong>${escapeHtml(space.packageLabel || "套餐")}</strong></td>
    </tr>
    <tr class="preview-main-row preview-package-summary-row">
      <td>${rowIndex}</td>
      <td><strong>${escapeHtml(packageName)}</strong></td>
      <td>${buildingArea > 0 ? formatNumber(buildingArea) : "—"}</td>
      <td>${buildingArea > 0 ? "平米" : ""}</td>
      ${showAmountColumns ? `
      <td>${unitPricePerSqm > 0 ? formatMoney(unitPricePerSqm) : "—"}</td>
      <td>${packageTotal > 0 ? formatMoney(packageTotal) : "—"}</td>
      ` : ""}
    </tr>
  `;
}

function renderPreviewPackageItemList(items, emptyText = "无项目") {
  if (!items.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<div class="package-quote-item-list">${items.map((item) => renderPackageQuoteItemReadonlyRow(item)).join("")}</div>`;
}

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
      <th>综合单价</th>
      <th>金额</th>
      ` : ""}
    </tr>
  `;
}

/**
 * @param {Quote|null|undefined} [quote]
 * @returns {QuoteTotals}
 */
function calculateTotals(quote = currentQuote()) {
  const spacesById = new Map((quote?.spaces || []).map((space) => [space.id, space]));
  const subtotals = (quote?.lines || []).reduce((sum, line) => {
    const amount = toNumber(line.quantity) * calculateQuoteItemUnitPrice(line);
    if (isMaterialQuoteItem(line)) sum.materialSubtotal += amount;
    else sum.laborSubtotal += amount;
    return sum;
  }, { laborSubtotal: 0, materialSubtotal: 0 });
  const packageSubtotal = (quote?.spaces || []).reduce((sum, space) => {
    const amount = toNumber(space.buildingArea) * toNumber(space.unitPricePerSqm);
    return sum + amount;
  }, 0);
  const subtotal = subtotals.laborSubtotal + subtotals.materialSubtotal + packageSubtotal;
  const management = quote?.includeManagementFee === false ? 0 : subtotal * toNumber(quote?.managementRate) / 100;
  const design = quote?.includeDesignFee === false ? 0 : subtotal * toNumber(quote?.designRate) / 100;
  const tax = quote?.includeTax === false ? 0 : subtotal * toNumber(quote?.taxRate) / 100;
  return {
    ...subtotals,
    packageSubtotal,
    subtotal,
    management,
    design,
    tax,
    grand: subtotal + management + design + tax
  };
}

/**
 * @param {QuoteItem} line
 * @returns {number}
 */
function calculateQuoteItemUnitPrice(line) {
  const item = findLaborItem(line.priceItemName, currentQuote()?.priceVersionId);
  const material = line.materialId ? findMaterial(line.materialId) : null;
  const kind = findGenericMaterial(line.materialKindId) || findGenericMaterial(material?.materialKindId);
  if (!item && material) return toNumber(material.quoteUnitPrice);
  if (!item && kind) return toNumber(kind.quoteUnitPrice);
  const splitPrice = toNumber(line.auxiliary) + toNumber(line.labor);
  if (splitPrice === 0 && line.legacyUnitPrice !== null && line.legacyUnitPrice !== undefined) {
    return toNumber(line.legacyUnitPrice);
  }
  return splitPrice;
}

/**
 * @param {QuoteItem} line
 * @param {string} [versionId]
 * @returns {number}
 */
function calculateQuoteItemCostUnitPrice(line, versionId = currentQuote()?.priceVersionId || currentVersion()?.id) {
  const item = findLaborItem(line.priceItemName, versionId);
  const material = line.materialId ? findMaterial(line.materialId) : null;
  const kind = findGenericMaterial(line.materialKindId) || findGenericMaterial(material?.materialKindId);
  if (!item && material) return toNumber(material.costUnitPrice);
  if (!item && kind) return toNumber(kind.costUnitPrice);
  if (!item) return 0;
  if (!material) return calculateLaborItemCostUnitPrice(item);
  return materialUnitPriceForItem(material, item, "cost") + toNumber(item.costAuxiliary) + toNumber(item.costLabor);
}

/**
 * @param {Partial<LaborItem>|null|undefined} item
 * @returns {number}
 */
function calculateLaborItemUnitPrice(item) {
  return toNumber(item?.auxiliary) + toNumber(item?.labor);
}

/**
 * @param {Partial<LaborItem>|null|undefined} item
 * @returns {number}
 */
function calculateLaborItemCostUnitPrice(item) {
  return toNumber(item?.costAuxiliary) + toNumber(item?.costLabor);
}

/**
 * @param {Partial<Material>|null|undefined} material
 * @param {Partial<LaborItem>|null|undefined} item
 * @param {"quote"|"cost"} [mode]
 * @returns {number}
 */
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

/**
 * @param {number|string} pieceArea
 * @param {number|string} piecePrice
 * @returns {number}
 */
function calculateGenericMaterialUnitPrice(pieceArea, piecePrice) {
  const area = toNumber(pieceArea);
  if (area <= 0) return 0;
  return roundQuantity(toNumber(piecePrice) / area);
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
  return evaluateQuantityFormula(item.quantityFormula, context, { roundDown: item.quantityRoundDown });
}

function evaluateQuantityFormula(formula, context, options = {}) {
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
    if (!Number.isFinite(Number(value))) return null;
    const normalized = Math.max(0, Number(value));
    return options.roundDown ? Math.floor(normalized) : normalized;
  } catch {
    return null;
  }
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
  confirmSimpleDelete(quote.name || "案例报价", () => {
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
  });
}

function applicableTemplates(workType) {
  return (state.templates || [])
    .filter((template) => template.items.some((item) => item.sourceType === workType))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function applyTemplateToSpace(template, space) {
  const quote = currentQuote();
  if (!quote || !template || !space) return [];
  const matchingItems = sortedTemplateItems(template);
  if (!matchingItems.length) return [];
  if (template.iconKey && (!space.iconKey || space.iconKey === defaultProjectGroupIconKey(space))) {
    space.iconKey = template.iconKey;
  }
  const newLines = matchingItems.map((templateItem) => makeQuoteItemFromTemplateItem(templateItem, space, quote)).filter(Boolean);
  quote.lines.push(...newLines);
  return newLines;
}

function syncTemplateToProjectGroup(template, space) {
  const quote = currentQuote();
  if (!quote || !template || !space) return { added: 0, skipped: 0, lines: [] };
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
  return { added: newLines.length, skipped, lines: newLines };
}

function quoteItemTemplateKey(line) {
  const areaKey = templateAreaKey(line.area);
  if (isMaterialQuoteItem(line)) {
    if (line.materialKindId) return `generic-material:${line.materialKindId}:${areaKey}`;
    return line.materialId ? `material:${line.materialId}:${areaKey}` : "";
  }
  const name = normalizeName(line.priceItemName || line.itemName || line.engineeringName || "");
  return name ? `labor:${name}:${areaKey}` : "";
}

function templateItemKey(templateItem, quote = currentQuote()) {
  const areaKey = templateAreaKey(templateItem?.area);
  if (templateItem?.sourceType === "material") {
    if (templateItem.materialKindId) return `generic-material:${templateItem.materialKindId}:${areaKey}`;
    return templateItem.materialId ? `material:${templateItem.materialId}:${areaKey}` : "";
  }
  const item = findLaborItem(templateItem?.itemName, quote?.priceVersionId);
  const name = normalizeName(item?.name || templateItem?.itemName || "");
  return name ? `labor:${name}:${areaKey}` : "";
}

function templateAreaKey(area) {
  return normalizeName(area || "默认部位");
}

function makeQuoteItemFromTemplateItem(templateItem, space, quote) {
  if (templateItem.sourceType === "material") {
    const material = findMaterial(templateItem.materialId);
    const kind = findGenericMaterial(templateItem.materialKindId) || findGenericMaterial(material?.materialKindId);
    if (!material && !kind) return null;
    const line = makeQuoteItem("", templateItem.area || "", toNumber(templateItem.quantity), space.id);
    line.sourceType = "material";
    line.materialKindId = kind?.id || "";
    line.materialId = material?.id || "";
    line.materialCategory = kind?.primaryCategory || material?.primaryCategory || templateItem.materialCategory || "";
    line.engineeringName = kind?.name || material?.name || "";
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
  line.engineeringName = templateItem.displayName || item.name;
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
    saveProjectGroupToServer(space, quote, result.added ? `已同步模板，新增 ${result.added} 项` : "模板已同步，没有新增项目");
    result.lines.forEach((line) => saveQuoteItemToServer(line, quote, "已同步模板"));
    close();
    renderAll();
  });
  templateSelect.focus();
}

function openAddQuotePackageDialog() {
  const quote = currentQuote();
  if (!quote) return;
  const packages = sortedPackages();
  if (!packages.length) {
    alert("还没有套餐，请先到套餐库维护套餐。");
    return;
  }
  document.querySelector(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal add-space-modal" role="dialog" aria-modal="true" aria-labelledby="addQuotePackageTitle">
      <div class="modal-head">
        <div>
          <h3 id="addQuotePackageTitle">添加套餐</h3>
          <p>套餐加入报价后，只在预览里展示套餐说明，不参与单价、面积和金额计算。</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <label>选择套餐
          <select class="quote-package-modal-select">
            ${packages.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel ghost" type="button">取消</button>
        <button class="modal-confirm" type="button">添加套餐</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
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
    const packageEntry = packages.find((entry) => entry.id === overlay.querySelector(".quote-package-modal-select").value);
    if (!packageEntry) return;
    addPackageToQuote(packageEntry);
    close();
  });
  overlay.querySelector(".quote-package-modal-select").focus();
}

function addPackageToQuote(packageEntry) {
  const quote = currentQuote();
  if (!quote || !packageEntry) return;
  const group = normalizeProjectGroup({
    id: makeId("group"),
    name: uniqueProjectGroupName(packageEntry.name || "套餐"),
    type: "package",
    packageId: packageEntry.id,
    iconKey: "box",
    collapsed: false,
    sortOrder: sortedProjectGroups(quote).length
  });
  quote.spaces.forEach((entry) => { entry.collapsed = true; });
  quote.spaces = [...sortedProjectGroups(quote), group].map((entry, index) => ({ ...entry, sortOrder: index }));
  quote.spaces.forEach((entry) => saveProjectGroupToServer(entry, quote, "已添加报价套餐"));
  renderAll();
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
  const newLines = applyTemplateToSpace(selectedTemplate, space);
  quote.spaces.forEach((entry) => saveProjectGroupToServer(entry, quote, newLines.length ? `已添加项目组合并套用 ${newLines.length} 项模板` : "已添加项目组合"));
  newLines.forEach((line) => saveQuoteItemToServer(line, quote, "已添加项目组合"));
  renderAll();
}

function uniqueProjectGroupName(baseName = "项目组合") {
  const cleanedBase = String(baseName || "项目组合").trim() || "项目组合";
  const names = new Set((currentQuote()?.spaces || []).map((space) => normalizeName(space.name)));
  if (!names.has(normalizeName(cleanedBase))) return cleanedBase;
  let index = 2;
  while (names.has(normalizeName(`${cleanedBase} ${index}`))) index += 1;
  return `${cleanedBase} ${index}`;
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
  saveQuoteItemToServer(line, quote, "已添加工程项目");
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
  const insertBefore = sameSpace[normalizeInsertPosition(position, sameSpace.length)]?.index;
  if (insertBefore === undefined) {
    const lastSameSpace = sameSpace[sameSpace.length - 1]?.index;
    quote.lines.splice(lastSameSpace === undefined ? quote.lines.length : lastSameSpace + 1, 0, newLine);
  } else {
    quote.lines.splice(insertBefore, 0, newLine);
  }
  quote.lines.forEach((line) => saveQuoteItemToServer(line, quote, "已添加工程项目"));
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
    showNoticeModal("不能删除", "这个项目组合下面还有项目。请先移动或删除这些项目，再删除项目组合。");
    return;
  }
  confirmSimpleDelete(space.name || "项目组合", () => {
    quote.spaces = quote.spaces.filter((entry) => entry.id !== space.id);
    quote.spaces.forEach((entry, index) => { entry.sortOrder = index; });
    deleteProjectGroupFromServer(space.id, "已删除项目组合");
    quote.spaces.forEach((entry) => saveProjectGroupToServer(entry, quote, "已删除项目组合"));
    renderAll();
  });
}

function bindProjectGroupDragAndDrop() {
  let draggedSpaceId = "";
  const cards = [...els.quoteLines.querySelectorAll(".space-card")];
  cards.forEach((card) => {
    let canDragProjectGroup = false;
    let didDragProjectGroup = false;
    const spaceDragButton = card.querySelector(".space-drag");
    spaceDragButton?.addEventListener("pointerdown", () => {
      canDragProjectGroup = true;
      didDragProjectGroup = false;
    });
    spaceDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragProjectGroup = false; }, 0);
    });
    spaceDragButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      canDragProjectGroup = false;
      if (didDragProjectGroup) {
        didDragProjectGroup = false;
        return;
      }
      toggleProjectGroup(card.dataset.spaceId || "");
    });
    card.addEventListener("dragstart", (event) => {
      if (!canDragProjectGroup && !event.target.closest(".space-drag")) {
        event.preventDefault();
        canDragProjectGroup = false;
        return;
      }
      didDragProjectGroup = true;
      draggedSpaceId = card.dataset.spaceId || "";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      canDragProjectGroup = false;
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
  quote.spaces.forEach((space) => saveProjectGroupToServer(space, quote, "已调整项目组合顺序"));
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
  quote.spaces.forEach((entry) => saveProjectGroupToServer(entry, quote, space.collapsed ? "已折叠项目组合" : "已展开项目组合"));
  renderLines();
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
    quote.lines.forEach((line) => saveQuoteItemToServer(line, quote, "已同步工费版本"));
  }
  saveQuoteToServer(quote, "已自动保存");
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
    if (quote.customerId === customer.id && !quote.clientName) {
      quote.clientName = customer.name;
      saveQuoteToServer(quote, "已更新客户");
    }
  });
  saveCustomerToServer(customer, "已更新客户");
  renderManager();
}

function cloneVersion() {
  const base = currentVersion();
  const name = prompt("新工费版本名称", `${base.name} - 调整版`);
  if (!name) return;
  const version = {
    id: makeId("version"),
    name,
    createdAt: new Date().toISOString().slice(0, 10),
    items: JSON.parse(JSON.stringify(base.items)).map((item) => ({
      ...item,
      id: makeId("labor")
    }))
  };
  state.versions.push(version);
  state.activeVersionId = version.id;
  const quote = currentQuote();
  if (quote) quote.priceVersionId = version.id;
  savePriceVersionToServer(version, "已创建工费版本");
  version.items.forEach((item) => saveLaborItemToServer(item, version.id, "已创建工费版本"));
  saveUiStatePatch({ activeVersionId: state.activeVersionId }, "已创建工费版本");
  if (quote) saveQuoteToServer(quote, "已创建工费版本");
  renderAll();
}

function renameVersion() {
  const version = currentVersion();
  const name = prompt("工费版本名称", version.name);
  if (!name) return;
  version.name = name;
  savePriceVersionToServer(version, "已重命名工费版本");
  renderAll();
}

function deleteVersion() {
  const version = currentVersion();
  if (!version) return;
  if (state.versions.length <= 1) {
    showNoticeModal("不能删除", "至少保留一个工费版本。");
    return;
  }
  const quoteCount = state.quotes.filter((quote) => quote.priceVersionId === version.id).length;
  const message = quoteCount
    ? `这个工费版本正在被 ${quoteCount} 个报价使用。删除后，这些报价会切换到另一个工费版本。`
    : "删除后不能直接恢复。";
  confirmSimpleDelete(version.name || "当前工费版本", () => {
    const deletedIndex = state.versions.findIndex((entry) => entry.id === version.id);
    state.versions = state.versions.filter((entry) => entry.id !== version.id);
    const fallback = state.versions[Math.max(0, Math.min(deletedIndex, state.versions.length - 1))] || state.versions[0];
    state.activeVersionId = fallback?.id || "";
    state.quotes.forEach((quote) => {
      if (quote.priceVersionId === version.id) {
        quote.priceVersionId = state.activeVersionId;
        quote.lines = quote.lines.map((line) => normalizeQuoteItem(line, quote.priceVersionId));
        saveQuoteToServer(quote, "已删除工费版本");
        quote.lines.forEach((line) => saveQuoteItemToServer(line, quote, "已删除工费版本"));
      }
    });
    deletePriceVersionFromServer(version.id, "已删除工费版本");
    saveUiStatePatch({ activeVersionId: state.activeVersionId }, "已删除工费版本");
    renderAll();
  }, { message });
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
      materials: state.materials,
      materialKinds: state.genericMaterials,
      genericMaterials: state.genericMaterials,
      genericMaterialNames: state.genericMaterials,
      templates: state.templates,
      packages: state.packages,
      activeVersionId: state.activeVersionId,
      activePage: state.activePage,
      categoryLibraryCollapsed: state.categoryLibraryCollapsed,
      genericMaterialLibraryCollapsed: state.genericMaterialLibraryCollapsed,
      genericMaterialCategoryState: state.genericMaterialCategoryState,
      supplierMaterialLibraryCollapsed: state.supplierMaterialLibraryCollapsed,
      customers: state.customers,
      quotes: state.quotes,
      activeCustomerId: state.activeCustomerId,
      activeQuoteId: state.activeQuoteId,
      activePackageId: state.activePackageId,
      activePackageEstimateId: state.activePackageEstimateId,
      activePackageTab: state.activePackageTab,
      returnToPackageId: state.returnToPackageId,
      returnToPackageEstimateId: state.returnToPackageEstimateId,
      returnToPackageItemId: state.returnToPackageItemId,
      returnToTemplateId: state.returnToTemplateId,
      returnToTemplateItemId: state.returnToTemplateItemId
    }
  };
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
      saveUiStatePatch({ activePackageId: state.activePackageId, activePackageEstimateId: state.activePackageEstimateId }, "已选择套餐");
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
      <div class="package-meta-delete">
        <span>删除套餐会同时删除它的套餐说明和成本测算。</span>
        <button class="delete-package danger" type="button">删除套餐</button>
      </div>
    </div>
    <div class="package-tabs">
      <button class="package-tab ${activeTab === "description" ? "active" : ""}" type="button" data-package-tab="description">项目组合</button>
      <button class="package-tab ${activeTab === "estimate" ? "active" : ""}" type="button" data-package-tab="estimate">成本测算</button>
    </div>
    <div class="package-tab-content">
      ${activeTab === "description" ? `
      <section class="package-block package-block-full">
        <div class="section-title tight-title">
          <div>
            <h3>项目组合</h3>
            <p class="muted">维护套餐包含的项目组合和项目说明，成本测算会直接套用这些内容。</p>
          </div>
          <button class="import-package-template ghost" type="button">从模板导入</button>
          <button class="add-package-section ghost" type="button">添加项目组合</button>
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
            <p class="muted">套用套餐项目组合，填写每类组合数量和面积周长高度，推演成本与定价空间。</p>
          </div>
          <button class="sync-package-estimate ghost" type="button">同步项目组合</button>
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
  if (!sections.length) return `<p class="muted empty-line">暂无项目组合。</p>`;
  const templateNames = (state.templates || []).map((t) => t.name).filter(Boolean);
  const datalistId = `package-section-template-names-${packageEntry.id}`;
  const datalistHtml = templateNames.length
    ? `<datalist id="${datalistId}">${templateNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>`
    : "";
  return sections.map((section) => `
    <div class="package-section ${section.collapsed ? "collapsed" : ""}" data-section-id="${escapeHtml(section.id)}" draggable="true">
      <div class="package-section-head">
        <button class="package-section-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动分类排序" aria-label="点击展开或收缩，拖动分类排序" aria-expanded="${String(!section.collapsed)}">⋮⋮</button>
        <input class="package-section-name" type="text" value="${escapeHtml(section.name)}" placeholder="项目组合名称">
        <label class="package-section-original-name" title="原始模板名称（可留空）">
          <span>原名</span>
          <input class="package-section-original-name-input" type="text" value="${escapeHtml(section.originalTemplateName || "")}" placeholder="原模板名（可留空）" list="${templateNames.length ? datalistId : ""}">
        </label>
        <span class="package-section-count">${(section.items || []).length}</span>
        <button class="add-package-section-item ghost" type="button">添加项目</button>
        <button class="delete-package-section danger" type="button">删除分类</button>
      </div>
      ${datalistHtml}
      ${section.collapsed ? "" : `
      <div class="package-section-table">
        <div class="package-section-row header">
          <span>来源</span><span>项目</span><span>部位</span><span>工艺说明</span><span>操作</span>
        </div>
        ${renderPackageSectionInsertSlot(0)}
        ${(section.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => `
          <div class="package-section-row" data-section-item-id="${escapeHtml(item.id)}">
            <select class="section-item-source" aria-label="来源">
              <option value="labor" ${item.sourceType === "material" ? "" : "selected"}>工费</option>
              <option value="material" ${item.sourceType === "material" ? "selected" : ""}>主材</option>
            </select>
            <label class="suggest-wrap">
              <input class="section-item-name" type="text" value="${escapeHtml(packageSectionItemDisplayName(item))}" placeholder="${item.sourceType === "material" ? "输入主材名称" : "输入工费名称"}" autocomplete="off">
              <div class="suggestions"></div>
            </label>
            <input class="section-item-provider" type="text" value="${escapeHtml(item.area || item.provider)}" placeholder="部位">
            <textarea class="section-item-description">${escapeHtml(item.description)}</textarea>
            <button class="delete-section-item danger" type="button">删除</button>
          </div>
          ${renderPackageSectionInsertSlot(index + 1)}
        `).join("")}
      </div>
      `}
    </div>
  `).join("");
}

function renderPackageSectionInsertSlot(position) {
  return `
    <div class="package-section-insert-slot" data-position="${position}" aria-label="在这里添加套餐项目">
      <button class="insert-package-section-item ghost" type="button">添加项目</button>
    </div>
  `;
}

function packageSectionItemDisplayName(item) {
  if (item.sourceType === "material") return findMaterial(item.materialId)?.name || item.name || item.itemName || "";
  return item.itemName || item.name || "";
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
  const strategy = packageEstimatePricingStrategy(estimate, totals);
  return `
    <div class="package-estimate-meta">
      <label>测算名称<input class="estimate-name" type="text" value="${escapeHtml(estimate.name)}"></label>
      <label>建筑面积<input class="estimate-building-area" type="number" min="0" step="0.01" value="${estimate.buildingArea}"></label>
      <label>测算单价<input class="estimate-price" type="number" min="0" step="0.01" value="${estimate.quoteUnitPrice || packageEntry.quoteUnitPrice}"></label>
    </div>
    <div class="package-estimate-summary">
      <div><span>套餐报价</span><strong>${formatMoney(totals.quoteTotal)}</strong></div>
      <div><span>清工辅料成本</span><strong>${formatMoney(totals.laborCost)}</strong></div>
      <div><span>装修主材成本</span><strong>${formatMoney(totals.materialCost)}</strong></div>
      <div><span>总成本</span><strong>${formatMoney(totals.totalCost)}</strong></div>
      <div><span>利润</span><strong>${formatMoney(totals.profit)}</strong></div>
      <div><span>利润率</span><strong>${formatPercent(totals.profitRate)}</strong></div>
      <div><span>保本单价</span><strong>${formatMoney(strategy.breakEvenUnitPrice)}</strong></div>
      <div><span>20%利润单价</span><strong>${formatMoney(strategy.profit20UnitPrice)}</strong></div>
      <div><span>30%利润单价</span><strong>${formatMoney(strategy.profit30UnitPrice)}</strong></div>
    </div>
  `;
}

function packageEstimatePricingStrategy(estimate, totals) {
  const quantity = Math.max(toNumber(estimate?.buildingArea || estimate?.area), 1);
  const totalCost = toNumber(totals?.totalCost);
  return {
    breakEvenUnitPrice: totalCost / quantity,
    profit20UnitPrice: totalCost / 0.8 / quantity,
    profit30UnitPrice: totalCost / 0.7 / quantity
  };
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
    <section class="package-estimate-group ${group.collapsed ? "collapsed" : ""}" data-group-id="${escapeHtml(group.id)}" draggable="true">
      <div class="package-estimate-group-head">
        <button class="package-estimate-group-drag expandable-drag-handle" type="button" title="点击展开/收缩，拖动组合排序" aria-label="点击展开或收缩，拖动组合排序" aria-expanded="${String(!group.collapsed)}">⋮⋮</button>
        <input class="estimate-group-name" type="text" value="${escapeHtml(group.name)}">
        <label>数量<input class="estimate-group-count" type="number" min="0" step="1" value="${group.count}"></label>
        <label>面积<input class="estimate-group-area" type="number" min="0" step="0.01" value="${group.area}"></label>
        <label>周长<input class="estimate-group-perimeter" type="number" min="0" step="0.01" value="${group.perimeter}"></label>
        <label>高度<input class="estimate-group-height" type="number" min="0" step="0.01" value="${group.height}"></label>
        <button class="add-estimate-labor" type="button">添加工费</button>
        <button class="add-estimate-material ghost" type="button">添加主材</button>
        <button class="delete-estimate-group danger" type="button">删除组合</button>
      </div>
      ${group.collapsed ? "" : `
      <div class="package-estimate-table">
        <div class="package-estimate-row header">
          <span>类型</span><span>项目名称</span><span>部位</span><span>推荐工程量</span><span>工程量</span><span>单位</span><span>报价单价</span><span>成本单价</span><span>成本金额</span><span>归类</span><span>操作</span>
        </div>
        ${renderPackageEstimateInsertSlot(group.id, 0)}
        ${items.map((item, index) => `
          ${renderPackageEstimateItem(estimate, group, item)}
          ${renderPackageEstimateInsertSlot(group.id, index + 1)}
        `).join("")}
      </div>
      `}
    </section>
  `;
}

function renderPackageEstimateInsertSlot(groupId, position) {
  return `
    <div class="package-estimate-insert-slot" data-group-id="${escapeHtml(groupId)}" data-position="${position}" aria-label="在这里添加测算条目">
      ${renderLaborMaterialInsertActions("package-estimate-insert-actions", "insert-estimate-labor", "insert-estimate-material")}
    </div>
  `;
}

function renderPackageEstimateItem(estimate, group, item) {
  const data = packageEstimateItemPricing(item);
  const canJump = item.sourceType === "labor" && Boolean(findLaborItem(item.itemName));
  const recommendedQuantity = packageEstimateRecommendedQuantityForItem(item, estimate, group);
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
      <button class="recommended-qty estimate-recommended-qty" type="button" ${recommendedQuantity === null ? "disabled" : ""}>${recommendedQuantity === null ? "" : formatNumber(recommendedQuantity)}</button>
      <input class="estimate-item-quantity" type="number" min="0" step="0.01" value="${item.quantity}">
      <button class="readonly-cell estimate-jump-labor" type="button" ${canJump ? "" : "disabled"}>${escapeHtml(data.unit)}</button>
      <button class="readonly-cell estimate-jump-labor" type="button" ${canJump ? "" : "disabled"}>${formatMoney(data.quoteUnitPrice)}</button>
      <button class="readonly-cell estimate-jump-labor" type="button" ${canJump ? "" : "disabled"}>${formatMoney(data.costUnitPrice)}</button>
      <button class="readonly-cell estimate-jump-labor strong-cell" type="button" ${canJump ? "" : "disabled"}>${formatMoney(data.costAmount)}</button>
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
      saveUiStatePatch({ activePackageTab: state.activePackageTab }, "已切换套餐页面");
      renderPackages();
    });
  });
  bindPackageSectionInputs(packageEntry);
  bindPackageEstimateInputs(packageEntry, estimate);
}

function bindPackageMetaInputs(packageEntry) {
  bindEditableObjectFields(els.packageDetail, packageEntry, [
    [".package-name", "name"],
    [".package-unit", "unit"],
    [".package-price", "quoteUnitPrice", "number"],
    [".package-formula", "quantityFormula"],
    [".package-description", "description"],
    [".package-exclusion", "exclusionNote"]
  ], { message: "已更新套餐", save: (target, message) => savePackageToServer(target, message), onChange: renderPackages });
  els.packageDetail.querySelector(".delete-package")?.addEventListener("click", () => deletePackage(packageEntry));
  els.packageDetail.querySelector(".add-package-section")?.addEventListener("click", () => addPackageSection(packageEntry));
  els.packageDetail.querySelector(".import-package-template")?.addEventListener("click", () => openImportPackageTemplateDialog(packageEntry));
  els.packageDetail.querySelector(".add-package-estimate")?.addEventListener("click", () => addPackageEstimate(packageEntry));
  els.packageDetail.querySelector(".sync-package-estimate")?.addEventListener("click", () => {
    const estimate = currentPackageEstimate(packageEntry);
    if (!estimate) return;
    syncPackageEstimateFromSections(packageEntry, estimate);
  });
}

function bindPackageSectionInputs(packageEntry) {
  els.packageDetail.querySelectorAll(".package-section").forEach((node) => {
    const section = packageEntry.sections.find((entry) => entry.id === node.dataset.sectionId);
    if (!section) return;
    bindEditableObjectField(node, ".package-section-name", section, "name", {
      message: "已更新套餐说明",
      save: (target, message) => savePackageSectionToServer(target, packageEntry, message)
    });
    bindEditableObjectField(node, ".package-section-original-name-input", section, "originalTemplateName", {
      message: "已更新原模板名",
      save: (target, message) => savePackageSectionToServer(target, packageEntry, message)
    });
    node.querySelector(".add-package-section-item")?.addEventListener("click", () => addPackageSectionItem(section));
    node.querySelector(".delete-package-section")?.addEventListener("click", () => deletePackageSection(packageEntry, section));
    node.querySelectorAll(".package-section-insert-slot").forEach((slot) => {
      slot.querySelector(".insert-package-section-item")?.addEventListener("click", () => {
        addPackageSectionItem(section, Number(slot.dataset.position || 0));
      });
    });
    node.querySelectorAll(".package-section-row[data-section-item-id]").forEach((row) => {
      const item = section.items.find((entry) => entry.id === row.dataset.sectionItemId);
      if (!item) return;
      row.querySelector(".section-item-source")?.addEventListener("change", (event) => {
        item.sourceType = event.target.value === "material" ? "material" : "labor";
        item.name = "";
        item.itemName = "";
        item.materialId = "";
        item.materialCategory = "";
        item.description = "";
        savePackageSectionItemToServer(item, section, "已切换套餐说明来源");
        renderPackages();
      });
      bindPackageSectionItemNameInput(row, item);
      bindEditableObjectField(row, ".section-item-provider", item, "area", {
        message: "已更新套餐说明",
        save: (target, message) => savePackageSectionItemToServer(target, section, message),
        onInput: () => { item.provider = item.area; }
      });
      bindEditableObjectField(row, ".section-item-description", item, "description", {
        message: "已更新套餐说明",
        save: (target, message) => savePackageSectionItemToServer(target, section, message)
      });
      row.querySelector(".delete-section-item")?.addEventListener("click", () => deletePackageSectionItem(section, item));
    });
  });
  bindPackageSectionDragAndDrop(packageEntry);
}

function bindPackageSectionItemNameInput(row, item) {
  const input = row.querySelector(".section-item-name");
  const suggestions = row.querySelector(".suggestions");
  if (!input || !suggestions) return;
  bindSuggestionSearchInput(input, suggestions, {
    onInput: (value) => {
      item.name = value;
      item.itemName = value;
      if (item.sourceType === "material") {
        item.materialId = "";
      }
      savePackageSectionItemToServer(item, packageSectionForItem(item), "已更新套餐说明");
      renderPackageSectionItemSuggestions(suggestions, item, value);
    },
    onFocus: (value) => renderPackageSectionItemSuggestions(suggestions, item, value),
    onKeydown: (event) => handlePackageSectionItemSuggestionKeys(event, suggestions, item)
  });
}

function renderPackageSectionItemSuggestions(container, item, query) {
  if (item.sourceType === "material") {
    renderPackageSectionMaterialSuggestions(container, item, query);
  } else {
    renderPackageSectionLaborSuggestions(container, item, query);
  }
}

function handlePackageSectionItemSuggestionKeys(event, container, item) {
  handleSuggestionKeyboard(event, container, (button) => activatePackageSectionItemSuggestion(button, item));
}

function renderPackageSectionLaborSuggestions(container, item, query) {
  const cleaned = normalizeName(query);
  const exactItem = cleaned ? findLaborItem(cleaned) : null;
  const exactAliasMatch = cleaned ? findLaborAliasMatch(cleaned) : null;
  const matches = findSimilarItems(cleaned).slice(0, 5);
  const comparableItems = cleaned ? findComparableItems(cleaned, 6) : [];
  const hasExactMatch = Boolean(exactItem || exactAliasMatch);
  const hasPrefixMatch = hasLaborPrefixMatch(cleaned);
  const canCreate = Boolean(cleaned) && !hasExactMatch && !hasPrefixMatch;

  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }

  const visibleItems = prioritizeExactLaborAlias(matches.length ? matches : comparableItems, exactAliasMatch);
  if (!visibleItems.length && !canCreate) {
    closeSuggestionList(container);
    return;
  }

  const hint = exactItem
    ? `已找到匹配项：${exactItem.name}`
    : exactAliasMatch
      ? `已找到别名：${exactAliasMatch.alias}，实际：${exactAliasMatch.item.name}`
    : visibleItems.length
      ? "找到相似工费项，先选已有条目，避免重复。"
      : "没有找到完全匹配项，可以新增到工费库。";

  const createButton = canCreate ? `
    <button class="suggestion suggestion-create" type="button" data-create-name="${escapeHtml(cleaned)}">
      <span>
        <strong>新增“${escapeHtml(cleaned)}”</strong>
        <small>保存到当前工费库，并作为套餐项目</small>
      </span>
      <b>+</b>
    </button>
  ` : "";

  container.innerHTML = `
    <div class="suggestion-hint">${escapeHtml(hint)}</div>
    ${createButton}
    ${visibleItems.map((laborItem) => renderLaborSuggestionOption(laborItem)).join("")}
  `;
  activateSuggestionList(container, (button) => activatePackageSectionItemSuggestion(button, item), { position: true });
}

function renderPackageSectionMaterialSuggestions(container, item, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }
  const matches = findSimilarMaterials(cleaned).slice(0, 6);
  const kindMatches = findSimilarGenericMaterials(cleaned).slice(0, 6);
  if (!matches.length && !kindMatches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配抽象主材或具体主材。可以先到主材库维护。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">优先选择抽象主材，具体产品可后续匹配。</div>
    ${kindMatches.map((kind) => renderGenericMaterialSuggestionOption(kind)).join("")}
    ${matches.map((material) => renderMaterialSuggestionOption(material)).join("")}
  `;
  activateSuggestionList(container, (button) => activatePackageSectionItemSuggestion(button, item), { position: true });
}

function activatePackageSectionItemSuggestion(button, item) {
  if (!button) return;
  if (button.dataset.genericMaterialId) {
    selectPackageSectionGenericMaterial(item, button.dataset.genericMaterialId);
    return;
  }
  if (button.dataset.materialId) {
    selectPackageSectionMaterial(item, button.dataset.materialId);
    return;
  }
  if (button.dataset.itemName) selectPackageSectionLabor(item, button.dataset.itemName, button.dataset.displayName || "");
  if (button.dataset.createName) createLaborItemFromPackageSectionItem(item, button.dataset.createName);
}

function selectPackageSectionGenericMaterial(item, kindId) {
  const kind = findGenericMaterial(kindId);
  if (!kind) return;
  item.sourceType = "material";
  item.name = kind.name;
  item.itemName = kind.name;
  item.materialKindId = kind.id;
  item.materialId = "";
  item.materialCategory = kind.primaryCategory || "";
  item.unit = kind.unit || "";
  item.description = kind.note || "";
  savePackageSectionItemToServer(item, packageSectionForItem(item), "已选择套餐说明抽象主材");
  renderPackages();
}

function createLaborItemFromPackageSectionItem(sectionItem, rawName) {
  const version = currentVersion();
  if (!version) return;
  const name = normalizeName(rawName || sectionItem.itemName || sectionItem.name);
  if (!name) {
    alert("请先输入工费名称。");
    return;
  }
  const existing = version.items.find((item) => normalizeName(item.name) === name);
  if (existing) {
    selectPackageSectionLabor(sectionItem, existing.name);
    return;
  }
  const comparable = findComparableItems(name, 5);
  const source = comparable[0]?.item || comparable[0];
  const parsedName = parsePriceNameUnit(name);
  const unit = parsedName?.unit || source?.unit || "项";
  const itemName = parsedName ? name : `${name}/${unit}`;
  const existingWithUnit = version.items.find((item) => normalizeName(item.name) === normalizeName(itemName));
  if (existingWithUnit) {
    selectPackageSectionLabor(sectionItem, existingWithUnit.name);
    return;
  }
  const similarText = comparable.length ? comparable.map((entry) => entry.alias || entry.item?.name || entry.name).join("、") : "暂无相似条目";
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
    quantityFormula: source?.quantityFormula || DEFAULT_QUANTITY_FORMULA,
    quantityRoundDown: Boolean(source?.quantityRoundDown)
  }, version.items.length);
  version.items.push(newItem);
  selectPackageSectionLabor(sectionItem, newItem.name);
}

function selectPackageSectionLabor(item, itemName, displayName = "") {
  const laborItem = findLaborItem(itemName);
  if (!laborItem) return;
  item.sourceType = "labor";
  item.name = displayName || laborItem.name;
  item.itemName = laborItem.name;
  item.materialId = "";
  item.materialCategory = "";
  item.unit = laborItem.unit || parsePriceNameUnit(laborItem.name)?.unit || "";
  item.description = laborItem.description || "";
  savePackageSectionItemToServer(item, packageSectionForItem(item), "已选择套餐说明工费");
  renderPackages();
}

function selectPackageSectionMaterial(item, materialId) {
  const material = findMaterial(materialId);
  if (!material) return;
  const kind = findGenericMaterial(material.materialKindId);
  item.sourceType = "material";
  item.name = kind?.name || material.name;
  item.itemName = kind?.name || material.name;
  item.materialKindId = kind?.id || item.materialKindId || "";
  item.materialId = material.id;
  item.materialCategory = kind?.primaryCategory || material.primaryCategory || "";
  item.unit = material.unit || kind?.unit || "";
  item.description = material.note || kind?.note || "";
  savePackageSectionItemToServer(item, packageSectionForItem(item), "已选择套餐说明主材");
  renderPackages();
}

function togglePackageSection(packageEntry, section) {
  const shouldOpen = section.collapsed;
  packageEntry.sections.forEach((entry) => {
    entry.collapsed = shouldOpen ? entry.id !== section.id : true;
  });
  packageEntry.sections.forEach((entry) => savePackageSectionToServer(entry, packageEntry, section.collapsed ? "已收起套餐分类" : "已展开套餐分类"));
  renderPackages();
}

function bindPackageSectionDragAndDrop(packageEntry) {
  let draggedSectionId = "";
  els.packageDetail.querySelectorAll(".package-section").forEach((node) => {
    let canDragPackageSection = false;
    let didDragPackageSection = false;
    const sectionDragButton = node.querySelector(".package-section-drag");
    const section = packageEntry.sections.find((entry) => entry.id === node.dataset.sectionId);
    sectionDragButton?.addEventListener("pointerdown", () => {
      canDragPackageSection = true;
      didDragPackageSection = false;
    });
    sectionDragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragPackageSection = false; }, 0);
    });
    sectionDragButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      canDragPackageSection = false;
      if (didDragPackageSection) {
        didDragPackageSection = false;
        return;
      }
      if (section) togglePackageSection(packageEntry, section);
    });
    node.addEventListener("dragstart", (event) => {
      if (!canDragPackageSection && !event.target.closest(".package-section-drag")) {
        event.preventDefault();
        canDragPackageSection = false;
        return;
      }
      didDragPackageSection = true;
      draggedSectionId = node.dataset.sectionId || "";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedSectionId);
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => {
      canDragPackageSection = false;
      draggedSectionId = "";
      node.classList.remove("dragging");
      els.packageDetail.querySelectorAll(".package-section").forEach((entry) => entry.classList.remove("drag-over"));
    });
    node.addEventListener("dragover", (event) => {
      const targetId = node.dataset.sectionId || "";
      if (!draggedSectionId || draggedSectionId === targetId) return;
      event.preventDefault();
      node.classList.add("drag-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = node.dataset.sectionId || "";
      node.classList.remove("drag-over");
      reorderPackageSection(packageEntry, event.dataTransfer.getData("text/plain") || draggedSectionId, targetId);
    });
  });
}

function reorderPackageSection(packageEntry, draggedId, targetId) {
  if (!packageEntry || !draggedId || !targetId || draggedId === targetId) return;
  const sections = (packageEntry.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const draggedIndex = sections.findIndex((entry) => entry.id === draggedId);
  const targetIndex = sections.findIndex((entry) => entry.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = sections.splice(draggedIndex, 1);
  sections.splice(targetIndex, 0, dragged);
  packageEntry.sections = sections.map((entry, index) => ({ ...entry, sortOrder: index }));
  packageEntry.sections.forEach((section) => savePackageSectionToServer(section, packageEntry, "已调整套餐分类顺序"));
  renderPackages();
}

function bindPackageEstimateInputs(packageEntry, estimate) {
  if (!estimate) return;
  els.packageDetail.querySelectorAll(".package-estimate-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePackageEstimateId = button.dataset.estimateId;
      packageEntry.estimates.forEach((entry) => { entry.active = entry.id === state.activePackageEstimateId; });
      packageEntry.estimates.forEach((entry) => savePackageEstimateToServer(entry, packageEntry, "已切换套餐测算"));
      saveUiStatePatch({ activePackageEstimateId: state.activePackageEstimateId }, "已切换套餐测算");
      renderPackages();
    });
  });
  bindEditableObjectFields(els.packageDetail, estimate, [
    [".estimate-name", "name"],
    [".estimate-building-area", "buildingArea", "number"],
    [".estimate-price", "quoteUnitPrice", "number"]
  ], {
    message: "已更新测算",
    save: (target, message) => savePackageEstimateToServer(target, packageEntry, message),
    blurOnEnter: true,
    onInput: (key) => {
      if (key === "quoteUnitPrice" && !estimate.quoteUnitPrice) estimate.quoteUnitPrice = 0;
    },
    onChange: renderPackages
  });
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
      [".estimate-group-count", "count", "number"],
      [".estimate-group-area", "area", "number"],
      [".estimate-group-perimeter", "perimeter", "number"],
      [".estimate-group-height", "height", "number"]
    ].forEach(([selector, key, mode]) => bindEditableObjectField(node, selector, group, key, {
      mode,
      message: "已更新测算组合",
      save: (target, message) => savePackageEstimateGroupToServer(target, estimate, message),
      blurOnEnter: true,
      onChange: renderPackages
    }));
    node.querySelector(".add-estimate-labor")?.addEventListener("click", () => {
      openOnlyPackageEstimateGroup(estimate, group.id);
      addPackageEstimateItem(estimate, group, "labor");
    });
    node.querySelector(".add-estimate-material")?.addEventListener("click", () => {
      openOnlyPackageEstimateGroup(estimate, group.id);
      addPackageEstimateItem(estimate, group, "material");
    });
    node.querySelector(".delete-estimate-group")?.addEventListener("click", () => deletePackageEstimateGroup(estimate, group));
    node.querySelectorAll(".package-estimate-insert-slot").forEach((slot) => {
      const position = Number(slot.dataset.position || 0);
      slot.querySelector(".insert-estimate-labor")?.addEventListener("click", () => addPackageEstimateItem(estimate, group, "labor", position));
      slot.querySelector(".insert-estimate-material")?.addEventListener("click", () => addPackageEstimateItem(estimate, group, "material", position));
    });
    bindPackageEstimateItemRows(packageEntry, estimate, group, node);
  });
  bindPackageEstimateGroupDragAndDrop(estimate);
}

function togglePackageEstimateGroup(estimate, group) {
  const shouldOpen = group.collapsed;
  estimate.groups.forEach((entry) => {
    entry.collapsed = shouldOpen ? entry.id !== group.id : true;
  });
  estimate.groups.forEach((entry) => savePackageEstimateGroupToServer(entry, estimate, group.collapsed ? "已收起测算组合" : "已展开测算组合"));
  renderPackages();
}

function openOnlyPackageEstimateGroup(estimate, groupId) {
  estimate.groups.forEach((entry) => { entry.collapsed = entry.id !== groupId; });
}

function bindPackageEstimateGroupDragAndDrop(estimate) {
  let draggedGroupId = "";
  els.packageDetail.querySelectorAll(".package-estimate-group").forEach((node) => {
    let canDragGroup = false;
    let didDragGroup = false;
    const group = estimate.groups.find((entry) => entry.id === node.dataset.groupId);
    const dragButton = node.querySelector(".package-estimate-group-drag");
    dragButton?.addEventListener("pointerdown", () => {
      canDragGroup = true;
      didDragGroup = false;
    });
    dragButton?.addEventListener("pointerup", () => {
      setTimeout(() => { canDragGroup = false; }, 0);
    });
    dragButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      canDragGroup = false;
      if (didDragGroup) {
        didDragGroup = false;
        return;
      }
      if (group) togglePackageEstimateGroup(estimate, group);
    });
    node.addEventListener("dragstart", (event) => {
      if (!canDragGroup && !event.target.closest(".package-estimate-group-drag")) {
        event.preventDefault();
        canDragGroup = false;
        return;
      }
      didDragGroup = true;
      draggedGroupId = node.dataset.groupId || "";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedGroupId);
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => {
      canDragGroup = false;
      draggedGroupId = "";
      node.classList.remove("dragging");
      els.packageDetail.querySelectorAll(".package-estimate-group").forEach((entry) => entry.classList.remove("drag-over"));
    });
    node.addEventListener("dragover", (event) => {
      const targetId = node.dataset.groupId || "";
      if (!draggedGroupId || draggedGroupId === targetId) return;
      event.preventDefault();
      node.classList.add("drag-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = node.dataset.groupId || "";
      node.classList.remove("drag-over");
      reorderPackageEstimateGroup(estimate, event.dataTransfer.getData("text/plain") || draggedGroupId, targetId);
    });
  });
}

function reorderPackageEstimateGroup(estimate, draggedId, targetId) {
  if (!estimate || !draggedId || !targetId || draggedId === targetId) return;
  const groups = (estimate.groups || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const draggedIndex = groups.findIndex((entry) => entry.id === draggedId);
  const targetIndex = groups.findIndex((entry) => entry.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;
  const [dragged] = groups.splice(draggedIndex, 1);
  groups.splice(targetIndex, 0, dragged);
  estimate.groups = groups.map((entry, index) => ({ ...entry, sortOrder: index }));
  estimate.groups.forEach((group) => savePackageEstimateGroupToServer(group, estimate, "已调整测算组合顺序"));
  renderPackages();
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
      savePackageEstimateItemToServer(item, estimate, "已切换测算条目类型");
      renderPackages();
    });
    const nameInput = row.querySelector(".estimate-item-name");
    const suggestions = row.querySelector(".suggestions");
    if (nameInput && suggestions) {
      bindSuggestionSearchInput(nameInput, suggestions, {
        onInput: (value) => renderPackageEstimateItemSuggestions(suggestions, item, value, estimate, group),
        onFocus: (value) => renderPackageEstimateItemSuggestions(suggestions, item, value, estimate, group),
        onKeydown: (event) => handlePackageSuggestionKeys(event, suggestions, item, estimate, group)
      });
    }
    row.querySelector(".estimate-item-area")?.addEventListener("keydown", blurOnEnter);
    row.querySelector(".estimate-item-area")?.addEventListener("input", (event) => {
      item.area = event.target.value;
      savePackageEstimateItemToServer(item, estimate, "已更新测算条目");
    });
    const quantityInput = row.querySelector(".estimate-item-quantity");
    quantityInput?.addEventListener("focus", (event) => event.target.select());
    quantityInput?.addEventListener("keydown", blurOnEnter);
    quantityInput?.addEventListener("input", (event) => {
      item.quantity = toNumber(event.target.value);
      savePackageEstimateItemToServer(item, estimate, "已更新测算工程量");
    });
    quantityInput?.addEventListener("click", (event) => handlePackageEstimateQuantityTripleClick(event, row, item, estimate, group));
    quantityInput?.addEventListener("change", () => renderPackages());
    row.querySelector(".estimate-recommended-qty")?.addEventListener("click", () => {
      syncPackageEstimateRecommendedQuantity(row, item, estimate, group);
    });
    row.querySelector(".estimate-item-included")?.addEventListener("change", (event) => {
      item.includedType = event.target.value;
      savePackageEstimateItemToServer(item, estimate, "已更新测算归类");
      renderPackages();
    });
    row.querySelectorAll(".estimate-jump-labor").forEach((button) => {
      button.addEventListener("click", () => {
        if (item.sourceType !== "labor" || !item.itemName) return;
        openLaborItemEditor(item.itemName, currentVersion()?.id, {
          packageId: packageEntry.id,
          estimateId: estimate.id,
          packageItemId: item.id
        });
      });
    });
    row.querySelector(".delete-estimate-item")?.addEventListener("click", () => {
      confirmSimpleDelete(item.itemName || "测算条目", () => {
        estimate.items = estimate.items.filter((entry) => entry.id !== item.id);
        deletePackageEstimateItemFromServer(item.id, "已删除测算条目");
        renderPackages();
      });
    });
  });
}

function syncPackageEstimateFromSections(packageEntry, estimate, options = {}) {
  if (!packageEntry || !estimate) return;
  const sections = (packageEntry.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const itemCountByGroup = new Map();
  (estimate.items || []).forEach((item) => itemCountByGroup.set(item.groupId, (itemCountByGroup.get(item.groupId) || 0) + 1));
  estimate.groups = (estimate.groups || []).filter((group) => {
    if (group.packageSectionId || itemCountByGroup.get(group.id)) return true;
    return !["整体", "测算组合 1"].includes(group.name);
  });
  sections.forEach((section, sectionIndex) => {
    let group = estimate.groups.find((entry) => entry.packageSectionId === section.id)
      || estimate.groups.find((entry) => !entry.packageSectionId && entry.name === section.name);
    if (!group) {
      group = normalizePackageEstimateGroup({
        packageSectionId: section.id,
        name: section.name,
        count: 1,
        area: estimate.area,
        perimeter: estimate.perimeter,
        height: estimate.height || 2.7,
        sortOrder: estimate.groups.length + sectionIndex
      }, estimate.groups.length);
      estimate.groups.push(group);
    } else {
      group.packageSectionId = section.id;
      if (!group.name) group.name = section.name;
    }

    const groupItems = (estimate.items || []).filter((entry) => entry.groupId === group.id);
    (section.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((sectionItem, itemIndex) => {
      if (!packageSectionItemHasLibraryReference(sectionItem)) return;
      const existing = groupItems.find((entry) => entry.packageSectionItemId === sectionItem.id)
        || groupItems.find((entry) => packageEstimateItemMatchesSectionItem(entry, sectionItem));
      if (existing) {
        existing.packageSectionItemId = sectionItem.id;
        return;
      }
      const nextItem = normalizePackageEstimateItem({
        groupId: group.id,
        packageSectionItemId: sectionItem.id,
        sourceType: sectionItem.sourceType,
        itemName: sectionItem.sourceType === "material" ? sectionItem.name : sectionItem.itemName,
        materialKindId: sectionItem.materialKindId,
        materialId: sectionItem.materialId,
        materialCategory: sectionItem.materialCategory,
        area: sectionItem.area || sectionItem.provider || "",
        includedType: "included",
        sortOrder: groupItems.length + itemIndex
      }, estimate.items.length);
      estimate.items.push(nextItem);
      groupItems.push(nextItem);
    });
    updatePackageEstimateGroupQuantities(packageEntry, estimate, group);
  });
  estimate.groups = estimate.groups
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group, index) => ({ ...group, sortOrder: index }));
  keepOnlyOneOpenPackageEstimateGroup(estimate.groups);
  if (!options.silent) {
    savePackageTreeToServer(packageEntry, "已同步套餐项目组合");
    renderPackages();
  }
}

function packageSectionItemHasLibraryReference(item) {
  if (item.sourceType === "material") return Boolean(item.materialKindId || item.materialId);
  return Boolean(item.itemName || item.name);
}

function packageEstimateItemMatchesSectionItem(item, sectionItem) {
  if (item.sourceType !== sectionItem.sourceType) return false;
  const itemAreaKey = templateAreaKey(item.area);
  const sectionAreaKey = templateAreaKey(sectionItem.area || sectionItem.provider);
  if (itemAreaKey !== sectionAreaKey) return false;
  if (sectionItem.sourceType === "material") {
    if (sectionItem.materialKindId) return item.materialKindId === sectionItem.materialKindId;
    return Boolean(sectionItem.materialId) && item.materialId === sectionItem.materialId;
  }
  return Boolean(sectionItem.itemName || sectionItem.name) && item.itemName === (sectionItem.itemName || sectionItem.name);
}

function updatePackageEstimateGroupQuantities(packageEntry, estimate, group) {
  if (!packageEntry || !estimate || !group) return;
  const section = packageEntry.sections.find((entry) => entry.id === group.packageSectionId);
  if (!section) return;
  const sectionItemById = new Map((section.items || []).map((item) => [item.id, item]));
  (estimate.items || []).filter((item) => item.groupId === group.id).forEach((item) => {
    const sectionItem = sectionItemById.get(item.packageSectionItemId);
    if (!sectionItem) return;
    item.quantity = packageEstimateQuantityFromSectionItem(sectionItem, estimate, group);
  });
}

function packageEstimateQuantityFromSectionItem(sectionItem, estimate, group) {
  const count = toNumber(group.count);
  if (!count) return 0;
  if (sectionItem.sourceType === "material") return count;
  const laborItem = findLaborItem(sectionItem.itemName || sectionItem.name);
  const quantity = evaluatePackageItemQuantity(laborItem?.quantityFormula, estimate, group, laborItem?.quantityRoundDown);
  return roundQuantity(quantity * count);
}

function packageEstimateRecommendedQuantityForItem(item, estimate, group) {
  if (!item || !estimate || !group) return null;
  const count = toNumber(group.count);
  if (!count) return 0;
  if (item.sourceType === "material") return count;
  const laborItem = findLaborItem(item.itemName);
  if (!laborItem?.quantityFormula) return null;
  const quantity = evaluatePackageItemQuantity(laborItem.quantityFormula, estimate, group, laborItem.quantityRoundDown);
  if (quantity === null) return null;
  return roundQuantity(quantity * count);
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
  if (entry.estimates[0]) syncPackageEstimateFromSections(entry, entry.estimates[0], { silent: true });
  savePackageTreeToServer(entry, "已添加套餐");
  saveUiStatePatch({ activePackageId: state.activePackageId, activePackageEstimateId: state.activePackageEstimateId }, "已添加套餐");
  renderAll();
}

function createUniquePackageName() {
  let index = state.packages.length + 1;
  while (state.packages.some((entry) => entry.name === `清工辅料套餐 ${index}`)) index += 1;
  return `清工辅料套餐 ${index}`;
}

function deletePackage(packageEntry) {
  if (!packageEntry) return;
  confirmSimpleDelete(packageEntry.name || "套餐", () => {
    const packages = sortedPackages();
    const deletedIndex = packages.findIndex((entry) => entry.id === packageEntry.id);
    state.packages = state.packages.filter((entry) => entry.id !== packageEntry.id);
    state.packages.forEach((entry, index) => { entry.sortOrder = index; });
    const nextPackages = sortedPackages();
    const nextPackage = nextPackages[Math.min(Math.max(deletedIndex, 0), nextPackages.length - 1)];
    state.activePackageId = nextPackage?.id || "";
    state.activePackageEstimateId = nextPackage ? currentPackageEstimate(nextPackage)?.id || "" : "";
    state.returnToPackageId = state.returnToPackageId === packageEntry.id ? "" : state.returnToPackageId;
    deletePackageFromServer(packageEntry.id, "已删除套餐");
    state.packages.forEach((entry) => savePackageToServer(entry, "已删除套餐"));
    saveUiStatePatch({ activePackageId: state.activePackageId, activePackageEstimateId: state.activePackageEstimateId, returnToPackageId: state.returnToPackageId }, "已删除套餐");
    renderAll();
  }, { message: "删除套餐会同时删除它的套餐说明和成本测算，请确认要删除下面这项内容。" });
}

function addPackageSection(packageEntry) {
  packageEntry.sections.forEach((section) => { section.collapsed = true; });
  const section = normalizePackageSection({
    name: `说明分类 ${packageEntry.sections.length + 1}`,
    sortOrder: packageEntry.sections.length,
    collapsed: false
  }, packageEntry.sections.length);
  packageEntry.sections.push(section);
  packageEntry.sections.forEach((entry) => savePackageSectionToServer(entry, packageEntry, "已添加套餐说明分类"));
  renderPackages();
}

function openImportPackageTemplateDialog(packageEntry) {
  const templates = (state.templates || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (!templates.length) {
    alert("还没有模板，请先到模板库添加模板。");
    return;
  }
  document.querySelector(".modal-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="app-modal add-space-modal" role="dialog" aria-modal="true" aria-labelledby="importPackageTemplateTitle">
      <div class="modal-head">
        <div>
          <h3 id="importPackageTemplateTitle">从模板导入项目组合</h3>
          <p>选择一个模板，导入为套餐里的项目组合和项目。</p>
        </div>
        <button class="modal-close ghost" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <label>模板
          <select class="import-template-select"></select>
        </label>
        <label>项目组合名称
          <input class="import-section-name" type="text" autocomplete="off">
        </label>
        <div class="modal-error" hidden></div>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel ghost" type="button">取消</button>
        <button class="modal-confirm" type="button">导入</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const templateSelect = overlay.querySelector(".import-template-select");
  const nameInput = overlay.querySelector(".import-section-name");
  const errorNode = overlay.querySelector(".modal-error");
  const close = () => overlay.remove();
  const showError = (message) => {
    errorNode.textContent = message;
    errorNode.hidden = false;
  };
  const optionHtml = templates.map((template) => {
    const laborCount = template.items.filter((item) => item.sourceType === "labor").length;
    const materialCount = template.items.filter((item) => item.sourceType === "material").length;
    const countText = [laborCount ? `工费${laborCount}` : "", materialCount ? `主材${materialCount}` : ""].filter(Boolean).join(" / ") || "空模板";
    return `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}（${countText}）</option>`;
  }).join("");
  templateSelect.innerHTML = optionHtml;
  const refreshName = () => {
    const template = state.templates.find((entry) => entry.id === templateSelect.value);
    nameInput.value = uniquePackageSectionName(packageEntry, template?.name || "项目组合");
    errorNode.hidden = true;
  };
  templateSelect.addEventListener("change", refreshName);
  refreshName();

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
    const template = state.templates.find((entry) => entry.id === templateSelect.value);
    const sectionName = String(nameInput.value || "").trim();
    if (!template) {
      showError("请选择模板。");
      return;
    }
    if (!sectionName) {
      showError("请填写项目组合名称。");
      nameInput.focus();
      return;
    }
    importPackageSectionFromTemplate(packageEntry, template, sectionName);
    close();
  });
  nameInput.focus();
  nameInput.select();
}

function importPackageSectionFromTemplate(packageEntry, template, sectionName) {
  packageEntry.sections.forEach((section) => { section.collapsed = true; });
  const section = normalizePackageSection({
    name: uniquePackageSectionName(packageEntry, sectionName),
    originalTemplateName: String(template?.name || "").trim(),
    sortOrder: packageEntry.sections.length,
    collapsed: false,
    items: sortedTemplateItems(template)
      .map((item, index) => packageSectionItemFromTemplateItem(item, index))
      .filter(Boolean)
  }, packageEntry.sections.length);
  packageEntry.sections.push(section);
  const estimate = currentPackageEstimate(packageEntry);
  if (estimate) syncPackageEstimateFromSections(packageEntry, estimate, { silent: true });
  savePackageTreeToServer(packageEntry, "已从模板导入项目组合");
  renderPackages();
}

function packageSectionItemFromTemplateItem(templateItem, index = 0) {
  if (templateItem.sourceType === "material") {
    const material = findMaterial(templateItem.materialId);
    const kind = findGenericMaterial(templateItem.materialKindId) || findGenericMaterial(material?.materialKindId);
    if (!material && !kind) return null;
    return normalizePackageSectionItem({
      sourceType: "material",
      name: kind?.name || material?.name || "",
      itemName: kind?.name || material?.name || "",
      materialKindId: kind?.id || "",
      materialId: material?.id || "",
      materialCategory: kind?.primaryCategory || material?.primaryCategory || templateItem.materialCategory || "",
      unit: material?.unit || kind?.unit || "",
      area: templateItem.area || "",
      description: material?.note || kind?.note || "",
      sortOrder: index
    }, index);
  }
  const laborItem = findLaborItem(templateItem.itemName);
  if (!laborItem && !templateItem.itemName) return null;
  return normalizePackageSectionItem({
    sourceType: "labor",
    name: templateItem.displayName || laborItem?.name || templateItem.itemName,
    itemName: laborItem?.name || templateItem.itemName,
    unit: laborItem?.unit || parsePriceNameUnit(templateItem.itemName)?.unit || "",
    area: templateItem.area || "",
    description: laborItem?.description || "",
    sortOrder: index
  }, index);
}

function uniquePackageSectionName(packageEntry, baseName) {
  const cleanedBase = String(baseName || "项目组合").trim() || "项目组合";
  const names = new Set((packageEntry.sections || []).map((section) => normalizeName(section.name)));
  if (!names.has(normalizeName(cleanedBase))) return cleanedBase;
  let index = 2;
  while (names.has(normalizeName(`${cleanedBase} ${index}`))) index += 1;
  return `${cleanedBase} ${index}`;
}

function addPackageSectionItem(section, position = null) {
  const items = (section.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const nextItem = normalizePackageSectionItem({
    sourceType: "labor",
    name: "",
    itemName: "",
    area: "",
    unit: "",
    provider: "",
    description: "",
    sortOrder: position === null ? items.length : normalizeInsertPosition(position, items.length)
  }, items.length);
  section.items = insertItemAndRenumberSortOrder(items, nextItem, position);
  section.items.forEach((item) => savePackageSectionItemToServer(item, section, "已添加套餐说明项目"));
  renderPackages();
}

function deletePackageSection(packageEntry, section) {
  confirmSimpleDelete(section.name || "套餐说明分类", () => {
    packageEntry.sections = packageEntry.sections.filter((entry) => entry.id !== section.id);
    packageEntry.sections.forEach((entry, index) => { entry.sortOrder = index; });
    deletePackageSectionFromServer(section.id, "已删除套餐说明分类");
    packageEntry.sections.forEach((entry) => savePackageSectionToServer(entry, packageEntry, "已删除套餐说明分类"));
    renderPackages();
  });
}

function deletePackageSectionItem(section, item) {
  confirmSimpleDelete(item.name || item.itemName || "套餐说明项目", () => {
    section.items = section.items.filter((entry) => entry.id !== item.id);
    section.items.forEach((entry, index) => { entry.sortOrder = index; });
    deletePackageSectionItemFromServer(item.id, "已删除套餐说明项目");
    section.items.forEach((entry) => savePackageSectionItemToServer(entry, section, "已删除套餐说明项目"));
    renderPackages();
  });
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
  syncPackageEstimateFromSections(packageEntry, estimate, { silent: true });
  savePackageTreeToServer(packageEntry, "已添加套餐测算");
  saveUiStatePatch({ activePackageEstimateId: state.activePackageEstimateId }, "已添加套餐测算");
  renderPackages();
}

function deletePackageEstimate(packageEntry, estimate) {
  if (packageEntry.estimates.length <= 1) {
    showNoticeModal("不能删除", "至少保留一个测算案例。");
    return;
  }
  confirmSimpleDelete(estimate.name || "套餐测算", () => {
    packageEntry.estimates = packageEntry.estimates.filter((entry) => entry.id !== estimate.id);
    packageEntry.estimates.forEach((entry, index) => { entry.sortOrder = index; entry.active = index === 0; });
    state.activePackageEstimateId = packageEntry.estimates[0]?.id || "";
    deletePackageEstimateFromServer(estimate.id, "已删除套餐测算");
    packageEntry.estimates.forEach((entry) => savePackageEstimateToServer(entry, packageEntry, "已删除套餐测算"));
    saveUiStatePatch({ activePackageEstimateId: state.activePackageEstimateId }, "已删除套餐测算");
    renderPackages();
  });
}

function addPackageEstimateGroup(estimate) {
  estimate.groups.forEach((group) => { group.collapsed = true; });
  const group = normalizePackageEstimateGroup({
    name: `测算组合 ${estimate.groups.length + 1}`,
    collapsed: false,
    sortOrder: estimate.groups.length
  }, estimate.groups.length);
  estimate.groups.push(group);
  estimate.groups.forEach((entry) => savePackageEstimateGroupToServer(entry, estimate, "已添加测算组合"));
  renderPackages();
}

function deletePackageEstimateGroup(estimate, group) {
  confirmSimpleDelete(group.name || "测算组合", () => {
    const deletedItemIds = estimate.items.filter((entry) => entry.groupId === group.id).map((entry) => entry.id);
    estimate.groups = estimate.groups.filter((entry) => entry.id !== group.id);
    estimate.items = estimate.items.filter((entry) => entry.groupId !== group.id);
    estimate.groups.forEach((entry, index) => { entry.sortOrder = index; });
    deletePackageEstimateGroupFromServer(group.id, "已删除测算组合");
    deletedItemIds.forEach((id) => deletePackageEstimateItemFromServer(id, "已删除测算组合"));
    estimate.groups.forEach((entry) => savePackageEstimateGroupToServer(entry, estimate, "已删除测算组合"));
    renderPackages();
  }, { message: "删除测算组合会同时删除组合内条目，请确认要删除下面这项内容。" });
}

function addPackageEstimateItem(estimate, group, sourceType, position = null) {
  const groupItems = (estimate.items || []).filter((entry) => entry.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const nextItem = normalizePackageEstimateItem({
    groupId: group.id,
    sourceType,
    sortOrder: position === null ? groupItems.length : normalizeInsertPosition(position, groupItems.length),
    includedType: "included"
  }, estimate.items.length);
  estimate.items = [
    ...(estimate.items || []).filter((entry) => entry.groupId !== group.id),
    ...insertItemAndRenumberSortOrder(groupItems, nextItem, position)
  ];
  estimate.items
    .filter((entry) => entry.groupId === group.id)
    .forEach((entry) => savePackageEstimateItemToServer(entry, estimate, sourceType === "material" ? "已添加测算主材" : "已添加测算工费"));
  renderPackages();
}

function packageEstimateItemPricing(item) {
  if (item.sourceType === "material") {
    const material = findMaterial(item.materialId);
    const kind = findGenericMaterial(item.materialKindId) || findGenericMaterial(material?.materialKindId);
    const quoteUnitPrice = toNumber(material?.quoteUnitPrice);
    const costUnitPrice = toNumber(material?.costUnitPrice);
    return {
      name: kind?.name || material?.name || item.itemName || "",
      unit: material?.unit || kind?.unit || "",
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
    closeSuggestionList(container);
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
    ${matches.map((laborItem) => renderLaborSuggestionOption(laborItem, { price: "cost" })).join("")}
  `;
  activateSuggestionList(container, (button) => selectPackageLaborSuggestion(item, button.dataset.itemName, estimate, group), { position: true });
}

function renderPackageMaterialSuggestions(container, item, query) {
  const cleaned = normalizeName(query);
  if (!cleaned) {
    closeSuggestionList(container);
    return;
  }
  const matches = findSimilarMaterials(cleaned).slice(0, 6);
  const kindMatches = findSimilarGenericMaterials(cleaned).slice(0, 6);
  if (!matches.length && !kindMatches.length) {
    container.innerHTML = `<div class="suggestion-hint">没有找到匹配主材，可以先到主材库添加。</div>`;
    container.dataset.activeIndex = "-1";
    return;
  }
  container.innerHTML = `
    <div class="suggestion-hint">找到相似主材，选择后用于测算成本。</div>
    ${kindMatches.map((kind) => renderGenericMaterialSuggestionOption(kind)).join("")}
    ${matches.map((material) => renderMaterialSuggestionOption(material, { price: "cost" })).join("")}
  `;
  activateSuggestionList(container, (button) => {
    if (button.dataset.genericMaterialId) selectPackageGenericMaterialSuggestion(item, button.dataset.genericMaterialId);
    else selectPackageMaterialSuggestion(item, button.dataset.materialId);
  }, { position: true });
}

function renderPackageEstimateItemSuggestions(container, item, query, estimate, group) {
  if (item.sourceType === "material") {
    renderPackageMaterialSuggestions(container, item, query);
  } else {
    renderPackageLaborSuggestions(container, item, query, estimate, group);
  }
}

function positionPackageSuggestions(container) {
  requestAnimationFrame(() => {
    if (!container || !container.innerHTML.trim()) return;
    container.classList.remove("open-up");
    const rect = container.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.top;
    const desiredHeight = Math.min(container.scrollHeight || 0, 280) + 12;
    if (spaceBelow < desiredHeight && rect.top > desiredHeight) {
      container.classList.add("open-up");
    }
  });
}

function handlePackageSuggestionKeys(event, container, item, estimate, group) {
  handleSuggestionKeyboard(event, container, (button) => {
    if (item.sourceType === "material" && button.dataset.genericMaterialId) selectPackageGenericMaterialSuggestion(item, button.dataset.genericMaterialId);
    else if (item.sourceType === "material") selectPackageMaterialSuggestion(item, button.dataset.materialId);
    else selectPackageLaborSuggestion(item, button.dataset.itemName, estimate, group);
  });
}

function handlePackageEstimateQuantityTripleClick(event, row, item, estimate, group) {
  if (event.detail !== 3) return;
  event.preventDefault();
  syncPackageEstimateRecommendedQuantity(row, item, estimate, group);
}

function syncPackageEstimateRecommendedQuantity(row, item, estimate, group) {
  const recommendedQuantity = packageEstimateRecommendedQuantityForItem(item, estimate, group);
  if (recommendedQuantity === null) return;
  item.quantity = recommendedQuantity;
  const quantityInput = row?.querySelector(".estimate-item-quantity");
  if (quantityInput) quantityInput.value = item.quantity;
  savePackageEstimateItemToServer(item, estimate, "已同步推荐工程量");
  renderPackages();
}

function selectPackageLaborSuggestion(item, itemName, estimate, group) {
  const laborItem = findLaborItem(itemName);
  if (!laborItem) return;
  item.sourceType = "labor";
  item.itemName = laborItem.name;
  item.materialId = "";
  const recommended = evaluatePackageItemQuantity(laborItem.quantityFormula, estimate, group, laborItem.quantityRoundDown);
  if (recommended !== null) item.quantity = roundQuantity(recommended);
  savePackageEstimateItemToServer(item, estimate, "已选择测算工费");
  renderPackages();
}

function selectPackageMaterialSuggestion(item, materialId) {
  const material = findMaterial(materialId);
  if (!material) return;
  const kind = findGenericMaterial(material.materialKindId);
  item.sourceType = "material";
  item.materialKindId = kind?.id || item.materialKindId || "";
  item.materialId = material.id;
  item.itemName = kind?.name || material.name;
  item.materialCategory = kind?.primaryCategory || material.primaryCategory || material.category || "";
  savePackageEstimateItemToServer(item, packageEstimateForItem(item), "已选择测算主材");
  renderPackages();
}

function selectPackageGenericMaterialSuggestion(item, kindId) {
  const kind = findGenericMaterial(kindId);
  if (!kind) return;
  item.sourceType = "material";
  item.materialKindId = kind.id;
  item.materialId = "";
  item.itemName = kind.name;
  item.materialCategory = kind.primaryCategory || "";
  savePackageEstimateItemToServer(item, packageEstimateForItem(item), "已选择测算抽象主材");
  renderPackages();
}

function evaluatePackageItemQuantity(formula, estimate, group, roundDown = false) {
  const contextSource = group || estimate || {};
  return evaluateQuantityFormula(formula || DEFAULT_QUANTITY_FORMULA, {
    s: toNumber(contextSource.area),
    c: toNumber(contextSource.perimeter),
    h: toNumber(contextSource.height)
  }, { roundDown });
}

function blurOnEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function bindEditableObjectFields(root, target, fields, options = {}) {
  fields.forEach(([selector, key, mode = "text"]) => {
    bindEditableObjectField(root, selector, target, key, { ...options, mode });
  });
}

function bindEditableObjectField(root, selector, target, key, options = {}) {
  const input = root?.querySelector(selector);
  if (!input) return;
  input.addEventListener("input", (event) => {
    target[key] = options.mode === "number" ? toNumber(event.target.value) : event.target.value;
    options.onInput?.(key, target, event);
    if (options.save) options.save(target, options.message || "已保存", key, event);
    else saveState(options.message || "已保存");
  });
  if (options.blurOnEnter) input.addEventListener("keydown", blurOnEnter);
  if (options.onChange) input.addEventListener("change", options.onChange);
}

function formatPercent(value) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

function deleteLaborItem(itemName) {
  const version = currentVersion();
  if (!version) return;
  const item = version.items.find((entry) => entry.name === itemName);
  if (!item) return;
  confirmSimpleDelete(item.name || "工费条目", () => {
    const affectedLines = collectQuoteLinesByLaborItemName(item.name, version.id);
    version.items = version.items.filter((entry) => entry.name !== item.name);
    unlinkLaborItemFromQuotes(item.name, version.id);
    if (state.pendingLaborItemName === item.name) state.pendingLaborItemName = "";
    if (state.expandedLaborItemName === item.name) state.expandedLaborItemName = "";
    deleteLaborItemFromServer(item.id, "删除工费条目");
    affectedLines.forEach(({ quote, line }) => saveQuoteItemToServer(line, quote, "删除工费条目"));
    renderAll();
  });
}

function collectQuoteLinesByLaborItemName(itemName, versionId = currentVersion()?.id) {
  const affected = [];
  state.quotes.forEach((quote) => {
    if (versionId && quote.priceVersionId !== versionId) return;
    quote.lines.forEach((line) => {
      if (line.priceItemName === itemName) affected.push({ quote, line });
    });
  });
  return affected;
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

function syncQuoteItemLaborParts(item) {
  const affected = [];
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
        affected.push({ quote, line });
      }
    });
  });
  return affected;
}

function syncQuoteItemLaborItemName(oldName, newName) {
  const oldDisplayName = displayEngineeringName(oldName);
  const affected = [];
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.priceItemName !== oldName) return;
      line.priceItemName = newName;
      if (!line.engineeringName || line.engineeringName === oldName || line.engineeringName === oldDisplayName) {
        line.engineeringName = newName;
      }
      affected.push({ quote, line });
    });
  });
  state.templates.forEach((template) => {
    template.items?.forEach((item) => {
      if (item.sourceType === "labor" && item.itemName === oldName) item.itemName = newName;
    });
  });
  state.packages.forEach((packageEntry) => {
    packageEntry.sections?.forEach((section) => {
      section.items?.forEach((item) => {
        if (item.sourceType !== "labor") return;
        if (item.itemName === oldName) item.itemName = newName;
        if (item.name === oldName) item.name = newName;
      });
    });
    packageEntry.estimates?.forEach((estimate) => {
      estimate.items?.forEach((item) => {
        if (item.sourceType === "labor" && item.itemName === oldName) item.itemName = newName;
      });
    });
  });
  return affected;
}

function syncQuoteItemMaterialName(materialId, newName) {
  state.quotes.forEach((quote) => {
    quote.lines.forEach((line) => {
      if (line.materialId === materialId) line.engineeringName = newName;
    });
  });
}

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

async function saveStateNow(message = "已保存") {
  if (state.loadBlocked) {
    if (els.saveStatus) els.saveStatus.textContent = "数据未载入，已阻止保存，避免覆盖 SQLite。";
    return false;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (els.saveStatus) {
    els.saveStatus.textContent = `正在保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const saved = await saveStateToServer({ immediate: true });
  if (els.saveStatus) {
    els.saveStatus.textContent = `${saved ? message : "保存失败，请确认 Node 服务正在运行"} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return saved;
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

function saveMaterialKindToServer(kind, message = "已保存") {
  return saveEntityToServer(`/api/material-kinds/${encodeURIComponent(kind.id)}`, kind, message);
}

function saveMaterialKindToServerNow(kind, message = "已保存") {
  return saveEntityToServer(`/api/material-kinds/${encodeURIComponent(kind.id)}`, kind, message, { immediate: true });
}

function saveMaterialToServer(material, message = "已保存") {
  return saveEntityToServer(`/api/materials/${encodeURIComponent(material.id)}`, material, message);
}

function saveMaterialToServerNow(material, message = "已保存") {
  return saveEntityToServer(`/api/materials/${encodeURIComponent(material.id)}`, material, message, { immediate: true });
}

function deleteMaterialKindFromServer(id, message = "已保存") {
  deleteEntityFromServer(`/api/material-kinds/${encodeURIComponent(id)}`, message);
}

function deleteMaterialFromServer(id, message = "已保存") {
  deleteEntityFromServer(`/api/materials/${encodeURIComponent(id)}`, message);
}

function saveLaborItemToServer(item, versionId = currentVersion()?.id, message = "已保存") {
  return saveEntityToServer(`/api/labor-items/${encodeURIComponent(item.id)}`, { ...item, versionId }, message);
}

function deleteLaborItemFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/labor-items/${encodeURIComponent(id)}`, message);
}

function saveLaborCategoryToServer(category, message = "已保存") {
  if (!category) return Promise.resolve(false);
  return saveEntityToServer(`/api/labor-categories/${encodeURIComponent(category.id)}`, category, message);
}

function deleteLaborCategoryFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/labor-categories/${encodeURIComponent(id)}`, message);
}

function savePriceVersionToServer(version, message = "已保存") {
  if (!version) return Promise.resolve(false);
  return saveEntityToServer(`/api/price-versions/${encodeURIComponent(version.id)}`, version, message);
}

function deletePriceVersionFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/price-versions/${encodeURIComponent(id)}`, message);
}

function saveCustomerToServer(customer, message = "已保存") {
  if (!customer) return Promise.resolve(false);
  return saveEntityToServer(`/api/customers/${encodeURIComponent(customer.id)}`, customer, message);
}

function deleteCustomerFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/customers/${encodeURIComponent(id)}`, message);
}

function savePackageToServer(packageEntry, message = "已保存") {
  if (!packageEntry) return Promise.resolve(false);
  return saveEntityToServer(`/api/packages/${encodeURIComponent(packageEntry.id)}`, packageEntry, message);
}

function deletePackageFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/packages/${encodeURIComponent(id)}`, message);
}

function savePackageSectionToServer(section, packageEntry = currentPackage(), message = "已保存") {
  if (!section || !packageEntry) return Promise.resolve(false);
  return saveEntityToServer(`/api/package-sections/${encodeURIComponent(section.id)}`, {
    ...section,
    packageId: packageEntry.id,
    sortOrder: packageEntry.sections?.findIndex((entry) => entry.id === section.id) ?? section.sortOrder ?? 0
  }, message);
}

function deletePackageSectionFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/package-sections/${encodeURIComponent(id)}`, message);
}

function savePackageSectionItemToServer(item, section = packageSectionForItem(item), message = "已保存") {
  if (!item || !section) return Promise.resolve(false);
  return saveEntityToServer(`/api/package-section-items/${encodeURIComponent(item.id)}`, {
    ...item,
    sectionId: section.id,
    sortOrder: section.items?.findIndex((entry) => entry.id === item.id) ?? item.sortOrder ?? 0
  }, message);
}

function deletePackageSectionItemFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/package-section-items/${encodeURIComponent(id)}`, message);
}

function savePackageEstimateToServer(estimate, packageEntry = currentPackage(), message = "已保存") {
  if (!estimate || !packageEntry) return Promise.resolve(false);
  return saveEntityToServer(`/api/package-estimates/${encodeURIComponent(estimate.id)}`, {
    ...estimate,
    packageId: packageEntry.id,
    sortOrder: packageEntry.estimates?.findIndex((entry) => entry.id === estimate.id) ?? estimate.sortOrder ?? 0
  }, message);
}

function deletePackageEstimateFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/package-estimates/${encodeURIComponent(id)}`, message);
}

function savePackageEstimateGroupToServer(group, estimate = packageEstimateForGroup(group), message = "已保存") {
  if (!group || !estimate) return Promise.resolve(false);
  return saveEntityToServer(`/api/package-estimate-groups/${encodeURIComponent(group.id)}`, {
    ...group,
    estimateId: estimate.id,
    sortOrder: estimate.groups?.findIndex((entry) => entry.id === group.id) ?? group.sortOrder ?? 0
  }, message);
}

function deletePackageEstimateGroupFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/package-estimate-groups/${encodeURIComponent(id)}`, message);
}

function savePackageEstimateItemToServer(item, estimate = packageEstimateForItem(item), message = "已保存") {
  if (!item || !estimate) return Promise.resolve(false);
  return saveEntityToServer(`/api/package-estimate-items/${encodeURIComponent(item.id)}`, {
    ...item,
    estimateId: estimate.id,
    sortOrder: estimate.items?.findIndex((entry) => entry.id === item.id) ?? item.sortOrder ?? 0
  }, message);
}

function deletePackageEstimateItemFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/package-estimate-items/${encodeURIComponent(id)}`, message);
}

async function savePackageTreeToServer(packageEntry, message = "已保存") {
  if (!packageEntry) return false;
  await savePackageToServer(packageEntry, message);
  for (const section of packageEntry.sections || []) {
    await savePackageSectionToServer(section, packageEntry, message);
    for (const item of section.items || []) await savePackageSectionItemToServer(item, section, message);
  }
  for (const estimate of packageEntry.estimates || []) {
    await savePackageEstimateToServer(estimate, packageEntry, message);
    for (const group of estimate.groups || []) await savePackageEstimateGroupToServer(group, estimate, message);
    for (const item of estimate.items || []) await savePackageEstimateItemToServer(item, estimate, message);
  }
  return true;
}

function saveTemplateToServer(template, message = "已保存") {
  if (!template) return Promise.resolve(false);
  return saveEntityToServer(`/api/templates/${encodeURIComponent(template.id)}`, template, message);
}

function deleteTemplateFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/templates/${encodeURIComponent(id)}`, message);
}

function saveTemplateItemToServer(item, template = templateForItem(item), message = "已保存") {
  if (!item || !template) return Promise.resolve(false);
  return saveEntityToServer(`/api/template-items/${encodeURIComponent(item.id)}`, {
    ...item,
    templateId: template.id,
    sortOrder: template.items?.findIndex((entry) => entry.id === item.id) ?? item.sortOrder ?? 0
  }, message);
}

function deleteTemplateItemFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/template-items/${encodeURIComponent(id)}`, message);
}

function saveQuoteToServer(quote = currentQuote(), message = "已保存") {
  if (!quote) return Promise.resolve(false);
  return saveEntityToServer(`/api/quotes/${encodeURIComponent(quote.id)}`, quote, message);
}

function deleteQuoteFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/quotes/${encodeURIComponent(id)}`, message);
}

function saveProjectGroupToServer(group, quote = currentQuote(), message = "已保存") {
  if (!group || !quote) return Promise.resolve(false);
  return saveEntityToServer(`/api/project-groups/${encodeURIComponent(group.id)}`, {
    ...group,
    quoteId: quote.id,
    sortOrder: quote.spaces?.findIndex((entry) => entry.id === group.id) ?? group.sortOrder ?? 0
  }, message);
}

function deleteProjectGroupFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/project-groups/${encodeURIComponent(id)}`, message);
}

function saveQuoteItemToServer(line, quote = currentQuote(), message = "已保存") {
  return saveEntityToServer(`/api/quote-items/${encodeURIComponent(line.id)}`, {
    ...line,
    quoteId: quote?.id,
    sortOrder: quote?.lines?.findIndex((entry) => entry.id === line.id) ?? line.sortOrder ?? 0
  }, message);
}

function deleteQuoteItemFromServer(id, message = "已保存") {
  return deleteEntityFromServer(`/api/quote-items/${encodeURIComponent(id)}`, message);
}

function saveUiStatePatch(patch, message = "已保存") {
  saveEntityToServer("/api/app-state", patch, message);
}

async function deleteEntityFromServer(url, message = "已保存") {
  if (state.loadBlocked) {
    if (els.saveStatus) els.saveStatus.textContent = "数据未载入，已阻止保存，避免覆盖 SQLite。";
    return false;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  try {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (els.saveStatus) {
      els.saveStatus.textContent = `${message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return true;
  } catch (error) {
    console.warn("Partial delete failed", error);
    if (els.saveStatus) {
      els.saveStatus.textContent = `删除保存失败，请确认 Node 服务正在运行 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return false;
  }
}

async function saveEntityToServer(url, data, message = "已保存", options = {}) {
  if (state.loadBlocked) {
    if (els.saveStatus) els.saveStatus.textContent = "数据未载入，已阻止保存，避免覆盖 SQLite。";
    return false;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (els.saveStatus) {
    els.saveStatus.textContent = `${options.immediate ? "正在保存" : message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (options.immediate && serverSaveInFlight) {
    while (serverSaveInFlight) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  if (pendingServerSaveBody) {
    pendingServerSaveBody = JSON.stringify(getPortableState(), null, 2);
  }
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (els.saveStatus) {
      els.saveStatus.textContent = `${message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return true;
  } catch (error) {
    console.warn("Partial save failed", error);
    if (els.saveStatus) {
      els.saveStatus.textContent = `保存失败，请确认 Node 服务正在运行 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (options.fallbackFullSave) saveState(message);
    return false;
  }
}

async function saveStateToServer(options = {}) {
  if (location.protocol === "file:") {
    if (els.saveStatus) {
      els.saveStatus.textContent = "当前是文件方式打开，不会写入 SQLite；请用 http://127.0.0.1:5177 打开";
    }
    return false;
  }
  pendingServerSaveBody = JSON.stringify(getPortableState(), null, 2);
  if (serverSaveInFlight) {
    if (!options.immediate) return false;
    while (serverSaveInFlight) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return !pendingServerSaveBody;
  }
  serverSaveInFlight = true;
  let activeServerSaveBody = "";
  let saved = false;
  try {
    while (pendingServerSaveBody) {
      const body = pendingServerSaveBody;
      activeServerSaveBody = body;
      pendingServerSaveBody = "";
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      activeServerSaveBody = "";
      saved = true;
    }
  } catch (error) {
    if (activeServerSaveBody && !pendingServerSaveBody) pendingServerSaveBody = activeServerSaveBody;
    console.warn("Server save failed", error);
    if (els.saveStatus) els.saveStatus.textContent = "保存到本地文件失败，请确认 Node 服务正在运行";
  } finally {
    serverSaveInFlight = false;
    if (pendingServerSaveBody) saveStateToServer();
  }
  return saved;
}

function flushServerSaveBeforeUnload() {
  if (location.protocol === "file:" || !navigator.sendBeacon) return;
  try {
    const body = pendingServerSaveBody || JSON.stringify(getPortableState(), null, 2);
    navigator.sendBeacon("/api/data", new Blob([body], { type: "application/json" }));
  } catch (error) {
    console.warn("Final server save failed", error);
  }
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

function formatSignedMoney(value) {
  const number = toNumber(value);
  if (!number) return "差额 ¥0.00";
  return `差额 ${number > 0 ? "+" : ""}${formatMoney(number)}`;
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
