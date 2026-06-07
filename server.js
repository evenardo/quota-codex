import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { copyFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const sqliteFile = path.join(dataDir, "quote-data.sqlite");
const initialPricesFile = path.join(publicDir, "data", "initial-prices.json");
const port = Number(process.env.PORT || 5177);
const DEFAULT_QUANTITY_FORMULA = "q=s+c*(h-0.25)";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(sqliteFile);
initializeDatabase();
await migrateLegacyJsonIfNeeded();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/data" && req.method === "GET") {
      sendJson(res, 200, loadPortableState());
      return;
    }
    if (url.pathname === "/api/data" && req.method === "POST") {
      await handlePostData(req, res);
      return;
    }
    if (url.pathname === "/api/backup" && req.method === "POST") {
      await handleBackupDatabase(res);
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`报价系统已启动：http://127.0.0.1:${port}`);
  console.log(`SQLite 数据库：${sqliteFile}`);
  console.log("当前版本使用 SQLite 分表存储，不再把工作数据写回 quote-data.json。");
});

function initializeDatabase() {
  migrateReadableDatabaseNames();
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS labor_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS labor_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      unit TEXT,
      category TEXT,
      category_id TEXT,
      description TEXT,
      material REAL DEFAULT 0,
      auxiliary REAL DEFAULT 0,
      waste_rate REAL DEFAULT 0,
      labor REAL DEFAULT 0,
      cost_material REAL DEFAULT 0,
      cost_auxiliary REAL DEFAULT 0,
      cost_waste_rate REAL DEFAULT 0,
      cost_labor REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      cost_unit_price REAL DEFAULT 0,
      quantity_formula TEXT,
      FOREIGN KEY (version_id) REFERENCES price_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES labor_categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_labor_items_version ON labor_items(version_id);
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      category TEXT,
      primary_category TEXT,
      secondary_category TEXT,
      spec TEXT,
      unit TEXT,
      cost_unit_price REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      quote_unit_price REAL DEFAULT 0,
      conversion_unit TEXT,
      conversion_quantity REAL DEFAULT 0,
      brand TEXT,
      supplier TEXT,
      pricing_formula TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS project_group_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS project_group_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      item_type TEXT DEFAULT 'labor',
      item_name TEXT,
      material_id TEXT,
      material_category TEXT,
      area TEXT,
      quantity REAL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES project_group_templates(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_template_items_template ON project_group_template_items(template_id, sort_order);
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      address TEXT
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      project_name TEXT,
      client_name TEXT,
      client_phone TEXT,
      client_address TEXT,
      quote_date TEXT,
      price_version_id TEXT,
      management_rate REAL DEFAULT 0,
      design_rate REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      show_amount_columns INTEGER DEFAULT 1,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (price_version_id) REFERENCES price_versions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
    CREATE TABLE IF NOT EXISTS quote_project_groups (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'space',
      work_type TEXT DEFAULT 'labor',
      icon_key TEXT,
      template_id TEXT,
      area REAL DEFAULT 0,
      perimeter REAL DEFAULT 0,
      height REAL DEFAULT 0,
      building_area REAL DEFAULT 0,
      collapsed INTEGER DEFAULT 0,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_quote_project_groups_quote ON quote_project_groups(quote_id, sort_order);
    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      project_group_id TEXT,
      sort_order INTEGER NOT NULL,
      engineering_name TEXT,
      labor_item_name TEXT,
      item_type TEXT DEFAULT 'labor',
      material_id TEXT,
      material_category TEXT,
      area TEXT,
      quantity REAL DEFAULT 0,
      material REAL DEFAULT 0,
      auxiliary REAL DEFAULT 0,
      waste_rate REAL DEFAULT 0,
      labor REAL DEFAULT 0,
      legacy_unit_price REAL,
      note TEXT,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
      FOREIGN KEY (project_group_id) REFERENCES quote_project_groups(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id, sort_order);
  `);
  ensureColumn("quotes", "client_phone", "TEXT");
  ensureColumn("quotes", "client_address", "TEXT");
  ensureColumn("quotes", "design_rate", "REAL DEFAULT 0");
  ensureColumn("quotes", "show_amount_columns", "INTEGER DEFAULT 1");
  ensureColumn("quote_items", "project_group_id", "TEXT");
  ensureColumn("quote_items", "item_type", "TEXT DEFAULT 'labor'");
  ensureColumn("quote_items", "material_category", "TEXT");
  ensureColumn("quote_project_groups", "type", "TEXT DEFAULT 'space'");
  ensureColumn("quote_project_groups", "work_type", "TEXT DEFAULT 'labor'");
  ensureColumn("quote_project_groups", "icon_key", "TEXT");
  ensureColumn("quote_project_groups", "template_id", "TEXT");
  ensureColumn("quote_project_groups", "building_area", "REAL DEFAULT 0");
  ensureColumn("quote_project_groups", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("project_group_templates", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("labor_items", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("labor_items", "category_id", "TEXT");
  ensureColumn("labor_items", "quantity_formula", "TEXT");
  ensureColumn("labor_items", "uses_material", "INTEGER DEFAULT 0");
  ensureColumn("labor_items", "material_category", "TEXT");
  ensureColumn("labor_items", "material_subcategory", "TEXT");
  ensureColumn("labor_items", "default_material_id", "TEXT");
  ensureColumn("labor_categories", "description", "TEXT");
  ensureColumn("labor_categories", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("materials", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("materials", "category", "TEXT");
  ensureColumn("materials", "primary_category", "TEXT");
  ensureColumn("materials", "secondary_category", "TEXT");
  ensureColumn("materials", "spec", "TEXT");
  ensureColumn("materials", "unit", "TEXT");
  ensureColumn("materials", "cost_unit_price", "REAL DEFAULT 0");
  ensureColumn("materials", "unit_price", "REAL DEFAULT 0");
  ensureColumn("materials", "quote_unit_price", "REAL DEFAULT 0");
  ensureColumn("materials", "conversion_unit", "TEXT");
  ensureColumn("materials", "conversion_quantity", "REAL DEFAULT 0");
  ensureColumn("materials", "brand", "TEXT");
  ensureColumn("materials", "supplier", "TEXT");
  ensureColumn("materials", "pricing_formula", "TEXT");
  ensureColumn("materials", "note", "TEXT");
  ensureColumn("quote_items", "material_id", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_labor_items_category ON labor_items(category_id)");
  migratePriceCategories();
}

function migrateReadableDatabaseNames() {
  renameTableIfNeeded("price_categories", "labor_categories");
  renameTableIfNeeded("price_items", "labor_items");
  renameTableIfNeeded("space_templates", "project_group_templates");
  renameTableIfNeeded("space_template_items", "project_group_template_items");
  renameTableIfNeeded("quote_spaces", "quote_project_groups");
  renameTableIfNeeded("quote_lines", "quote_items");
  renameColumnIfNeeded("quote_items", "space_id", "project_group_id");
  renameColumnIfNeeded("quote_items", "source_type", "item_type");
  renameColumnIfNeeded("quote_items", "price_item_name", "labor_item_name");
  renameColumnIfNeeded("project_group_template_items", "source_type", "item_type");
}

function tableExists(table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function renameTableIfNeeded(oldName, newName) {
  if (tableExists(oldName) && !tableExists(newName)) {
    db.exec(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
  }
}

function renameColumnIfNeeded(table, oldName, newName) {
  if (!tableExists(table)) return;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (columns.includes(oldName) && !columns.includes(newName)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}

function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function migratePriceCategories() {
  const categoryRows = db.prepare(`
    SELECT DISTINCT TRIM(category) AS name
    FROM labor_items
    WHERE TRIM(COALESCE(category, '')) <> ''
    ORDER BY name COLLATE NOCASE
  `).all();
  const insertCategory = db.prepare("INSERT OR IGNORE INTO labor_categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)");
  const findCategory = db.prepare("SELECT id FROM labor_categories WHERE name = ?");
  const updateItems = db.prepare("UPDATE labor_items SET category_id = ? WHERE TRIM(COALESCE(category, '')) = ?");
  const updateCategoryDescription = db.prepare("UPDATE labor_categories SET description = COALESCE(NULLIF(description, ''), ?) WHERE id = ?");

  categoryRows.forEach(({ name }, index) => {
    const description = summarizeCategoryDescription(name);
    insertCategory.run(makeId("category"), name, description, index);
    const category = findCategory.get(name);
    if (category?.id) {
      updateItems.run(category.id, name);
      updateCategoryDescription.run(description, category.id);
    }
  });
}

function summarizeCategoryDescription(categoryName) {
  const rows = db.prepare(`
    SELECT description
    FROM labor_items
    WHERE TRIM(COALESCE(category, '')) = ?
      AND TRIM(COALESCE(description, '')) <> ''
  `).all(categoryName);
  const counter = new Map();
  rows.forEach(({ description }) => {
    const text = String(description || "").trim();
    if (!text) return;
    counter.set(text, (counter.get(text) || 0) + 1);
  });
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] || "";
}

async function migrateLegacyJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM price_versions").get().count;
  if (count > 0) return;

  const initial = JSON.parse(await readFile(initialPricesFile, "utf8"));
  savePortableState({
    app: "quote-tool",
    version: 4,
    exportedAt: new Date().toISOString(),
    data: {
      versions: initial.versions,
      categories: deriveCategoriesFromVersions(initial.versions),
      activeVersionId: initial.versions[0]?.id || "",
      activePage: "manager",
      customers: [],
      quotes: [],
      activeCustomerId: "",
      activeQuoteId: ""
    }
  });
}

async function handlePostData(req, res) {
  const body = await readBody(req);
  const parsed = JSON.parse(body);
  savePortableState(parsed);
  sendJson(res, 200, { ok: true, path: sqliteFile });
}

async function handleBackupDatabase(res) {
  const backupDir = path.join(dataDir, "backups");
  await mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `quote-data-${formatBackupTimestamp(new Date())}.sqlite`);
  await copyFile(sqliteFile, backupFile);
  sendJson(res, 200, { ok: true, path: backupFile });
}

function formatBackupTimestamp(date) {
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

function loadPortableState() {
  const data = {
    versions: loadPriceVersions(),
    categories: loadPriceCategories(),
    materials: loadMaterials(),
    templates: loadTemplates(),
    activeVersionId: getAppState("activeVersionId") || "",
    activePage: getAppState("activePage") || "manager",
    categoryLibraryCollapsed: getAppState("categoryLibraryCollapsed") !== "false",
    customers: db.prepare("SELECT id, name, contact, phone, address FROM customers ORDER BY rowid").all(),
    quotes: loadQuotes(),
    activeCustomerId: getAppState("activeCustomerId") || "",
    activeQuoteId: getAppState("activeQuoteId") || ""
  };

  return {
    app: "quote-tool",
    version: 4,
    exportedAt: new Date().toISOString(),
    data
  };
}

function loadPriceVersions() {
  const versions = db.prepare("SELECT id, name, created_at AS createdAt FROM price_versions ORDER BY rowid").all();
  const items = db.prepare(`
    SELECT
      labor_items.sort_order AS sortOrder,
      labor_items.name, unit, material, waste_rate AS wasteRate, auxiliary, labor,
      labor_items.category_id AS categoryId,
      COALESCE(labor_categories.name, labor_items.category, '') AS category,
      labor_items.description AS description,
      cost_material AS costMaterial, cost_waste_rate AS costWasteRate,
      cost_auxiliary AS costAuxiliary, cost_labor AS costLabor,
      unit_price AS unitPrice, cost_unit_price AS costUnitPrice,
      quantity_formula AS quantityFormula,
      uses_material AS usesMaterial,
      material_category AS materialCategory,
      material_subcategory AS materialSubcategory,
      default_material_id AS defaultMaterialId
    FROM labor_items
    LEFT JOIN labor_categories ON labor_categories.id = labor_items.category_id
    WHERE version_id = ?
    ORDER BY COALESCE(labor_items.sort_order, labor_items.id), labor_items.id
  `);
  return versions.map((version) => ({ ...version, items: items.all(version.id) }));
}

function loadPriceCategories() {
  return db.prepare("SELECT id, name, description, sort_order AS sortOrder FROM labor_categories ORDER BY sort_order, rowid").all();
}

function loadMaterials() {
  return db.prepare(`
    SELECT
      id, sort_order AS sortOrder, name, category, spec, unit,
      COALESCE(NULLIF(primary_category, ''), category, '') AS primaryCategory,
      secondary_category AS secondaryCategory,
      cost_unit_price AS costUnitPrice,
      COALESCE(NULLIF(quote_unit_price, 0), unit_price, 0) AS quoteUnitPrice,
      unit_price AS unitPrice,
      conversion_unit AS conversionUnit,
      conversion_quantity AS conversionQuantity,
      brand, supplier, pricing_formula AS pricingFormula, note
    FROM materials
    ORDER BY sort_order, rowid
  `).all();
}

function loadTemplates() {
  const templates = db.prepare(`
    SELECT id, name, icon_key AS iconKey, sort_order AS sortOrder, collapsed
    FROM project_group_templates
    ORDER BY sort_order, rowid
  `).all();
  const items = db.prepare(`
    SELECT
      id, sort_order AS sortOrder, item_type AS sourceType,
      item_name AS itemName, material_id AS materialId, material_category AS materialCategory,
      area, quantity
    FROM project_group_template_items
    WHERE template_id = ?
    ORDER BY sort_order, rowid
  `);
  return templates.map((template) => ({ ...template, items: items.all(template.id) }));
}

function loadQuotes() {
  const quotes = db.prepare(`
    SELECT
      id, customer_id AS customerId, name, project_name AS projectName,
      client_name AS clientName, client_phone AS clientPhone, client_address AS clientAddress,
      quote_date AS quoteDate,
      price_version_id AS priceVersionId,
      management_rate AS managementRate, design_rate AS designRate, tax_rate AS taxRate,
      show_amount_columns AS showAmountColumns
    FROM quotes
    ORDER BY rowid
  `).all();
  const spaces = db.prepare(`
    SELECT id, name, type, work_type AS workType, icon_key AS iconKey, template_id AS templateId, area, perimeter, height, building_area AS buildingArea, collapsed, sort_order AS sortOrder
    FROM quote_project_groups
    WHERE quote_id = ?
    ORDER BY sort_order
  `);
  const lines = db.prepare(`
    SELECT
      id, project_group_id AS spaceId, engineering_name AS engineeringName, labor_item_name AS priceItemName,
      item_type AS sourceType,
      material_id AS materialId,
      material_category AS materialCategory,
      area, quantity, material, auxiliary, waste_rate AS wasteRate, labor,
      legacy_unit_price AS legacyUnitPrice, note
    FROM quote_items
    WHERE quote_id = ?
    ORDER BY sort_order
  `);
  return quotes.map((quote) => ({ ...quote, spaces: spaces.all(quote.id), lines: lines.all(quote.id) }));
}

function savePortableState(portable) {
  const data = portable?.data || portable;
  if (!data || !Array.isArray(data.versions) || !Array.isArray(data.customers) || !Array.isArray(data.quotes)) {
    throw new Error("Invalid quote data");
  }
  const categories = Array.isArray(data.categories) ? data.categories : deriveCategoriesFromVersions(data.versions);

  db.exec("BEGIN");
  try {
    db.exec(`
      DELETE FROM quote_items;
      DELETE FROM quote_project_groups;
      DELETE FROM quotes;
      DELETE FROM customers;
      DELETE FROM project_group_template_items;
      DELETE FROM project_group_templates;
      DELETE FROM materials;
      DELETE FROM labor_items;
      DELETE FROM labor_categories;
      DELETE FROM price_versions;
      DELETE FROM app_state;
    `);
    setAppState("activeVersionId", data.activeVersionId || "");
    setAppState("activePage", data.activePage || "manager");
    setAppState("categoryLibraryCollapsed", data.categoryLibraryCollapsed ?? true);
    setAppState("activeCustomerId", data.activeCustomerId || "");
    setAppState("activeQuoteId", data.activeQuoteId || "");
    insertPriceCategories(categories);
    insertPriceVersions(data.versions, categories);
    insertMaterials(data.materials || []);
    insertTemplates(data.templates || []);
    insertCustomers(data.customers);
    insertQuotes(data.quotes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertPriceCategories(categories) {
  const insertCategory = db.prepare("INSERT INTO labor_categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)");
  categories.forEach((category, index) => {
    const name = String(category?.name || "").trim();
    if (!name) return;
    insertCategory.run(
      category.id || makeId("category"),
      name,
      String(category?.description || "").trim(),
      Number.isFinite(Number(category?.sortOrder)) ? Number(category.sortOrder) : index
    );
  });
}

function insertPriceVersions(versions, categories) {
  const insertVersion = db.prepare("INSERT INTO price_versions (id, name, created_at) VALUES (?, ?, ?)");
  const insertItem = db.prepare(`
    INSERT INTO labor_items (
      version_id, sort_order, name, unit, category, category_id, description, material, auxiliary, waste_rate, labor,
      cost_material, cost_auxiliary, cost_waste_rate, cost_labor, unit_price, cost_unit_price, quantity_formula,
      uses_material, material_category, material_subcategory, default_material_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const categoryById = new Map((categories || []).map((category) => [category.id, category.name]));
  const categoryByName = new Map((categories || []).map((category) => [String(category.name || "").trim(), category.id]));
  versions.forEach((version) => {
    insertVersion.run(version.id, version.name || "未命名价格版本", version.createdAt || "");
    (version.items || []).forEach((item, index) => {
      const categoryName = String(item.category || "").trim();
      const categoryId = item.categoryId || (categoryName ? categoryByName.get(categoryName) : "") || null;
      insertItem.run(
        version.id,
        Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        item.name || "",
        item.unit || "",
        categoryName || categoryById.get(categoryId) || "",
        categoryId,
        item.description || "",
        toNumber(item.material),
        toNumber(item.auxiliary),
        toNumber(item.wasteRate),
        toNumber(item.labor),
        toNumber(item.costMaterial),
        toNumber(item.costAuxiliary),
        toNumber(item.costWasteRate),
        toNumber(item.costLabor),
        toNumber(item.unitPrice),
        toNumber(item.costUnitPrice),
        item.quantityFormula || DEFAULT_QUANTITY_FORMULA,
        item.usesMaterial ? 1 : 0,
        String(item.materialCategory || "").trim(),
        String(item.materialSubcategory || "").trim(),
        String(item.defaultMaterialId || "").trim()
      );
    });
  });
}

function insertMaterials(materials) {
  const insertMaterial = db.prepare(`
    INSERT INTO materials (
      id, sort_order, name, category, primary_category, secondary_category, spec, unit,
      cost_unit_price, unit_price, quote_unit_price, conversion_unit, conversion_quantity,
      brand, supplier, pricing_formula, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (materials || []).forEach((material, index) => {
    const name = String(material?.name || "").trim();
    if (!name) return;
    const primaryCategory = String(material?.primaryCategory || material?.category || "").trim();
    const quoteUnitPrice = material?.quoteUnitPrice ?? material?.unitPrice;
    insertMaterial.run(
      material.id || makeId("material"),
      Number.isFinite(Number(material.sortOrder)) ? Number(material.sortOrder) : index,
      name,
      primaryCategory,
      primaryCategory,
      String(material?.secondaryCategory || "").trim(),
      String(material?.spec || "").trim(),
      String(material?.unit || "").trim(),
      toNumber(material?.costUnitPrice),
      toNumber(quoteUnitPrice),
      toNumber(quoteUnitPrice),
      String(material?.conversionUnit || "").trim(),
      toNumber(material?.conversionQuantity),
      String(material?.brand || "").trim(),
      String(material?.supplier || "").trim(),
      String(material?.pricingFormula || "").trim(),
      String(material?.note || "").trim()
    );
  });
}

function insertTemplates(templates) {
  const insertTemplate = db.prepare(`
    INSERT INTO project_group_templates (id, name, icon_key, sort_order, collapsed)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO project_group_template_items (
      id, template_id, sort_order, item_type, item_name, material_id, material_category, area, quantity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (templates || []).forEach((template, index) => {
    const name = String(template?.name || "").trim();
    if (!name) return;
    const templateId = template.id || makeId("template");
    insertTemplate.run(
      templateId,
      name,
      String(template?.iconKey || "").trim(),
      Number.isFinite(Number(template?.sortOrder)) ? Number(template.sortOrder) : index,
      template?.collapsed ? 1 : 0
    );
    (template.items || []).forEach((item, itemIndex) => {
      const sourceType = item?.sourceType === "material" ? "material" : "labor";
      insertItem.run(
        item.id || makeId("template-item"),
        templateId,
        Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : itemIndex,
        sourceType,
        String(item?.itemName || "").trim(),
        String(item?.materialId || "").trim(),
        String(item?.materialCategory || "").trim(),
        String(item?.area || "").trim(),
        toNumber(item?.quantity)
      );
    });
  });
}

function deriveCategoriesFromVersions(versions) {
  const categories = new Map();
  (versions || []).forEach((version) => {
    (version.items || []).forEach((item) => {
      const name = String(item.category || "").trim();
      if (!name || categories.has(name)) return;
      categories.set(name, { id: makeId("category"), name, description: "", sortOrder: categories.size });
    });
  });
  return [...categories.values()];
}

function insertCustomers(customers) {
  const insert = db.prepare("INSERT INTO customers (id, name, contact, phone, address) VALUES (?, ?, ?, ?, ?)");
  customers.forEach((customer) => {
    insert.run(customer.id, customer.name || "未命名客户", customer.contact || "", customer.phone || "", customer.address || "");
  });
}

function insertQuotes(quotes) {
  const insertQuote = db.prepare(`
    INSERT INTO quotes (
      id, customer_id, name, project_name, client_name, client_phone, client_address, quote_date,
      price_version_id, management_rate, design_rate, tax_rate, show_amount_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLine = db.prepare(`
    INSERT INTO quote_items (
      id, quote_id, project_group_id, sort_order, engineering_name, labor_item_name, item_type, area, quantity,
      material_id, material_category, material, auxiliary, waste_rate, labor, legacy_unit_price, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSpace = db.prepare(`
    INSERT INTO quote_project_groups (
      id, quote_id, sort_order, name, type, work_type, icon_key, template_id, area, perimeter, height, building_area, collapsed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  quotes.forEach((quote) => {
    insertQuote.run(
      quote.id,
      quote.customerId,
      quote.name || quote.projectName || "未命名报价",
      quote.projectName || "",
      quote.clientName || "",
      quote.clientPhone || "",
      quote.clientAddress || "",
      quote.quoteDate || "",
      quote.priceVersionId || "",
      toNumber(quote.managementRate),
      toNumber(quote.designRate),
      toNumber(quote.taxRate),
      quote.showAmountColumns === false ? 0 : 1
    );
    (quote.spaces || []).forEach((space, index) => {
      insertSpace.run(
        space.id,
        quote.id,
        Number.isFinite(Number(space.sortOrder)) ? Number(space.sortOrder) : index,
        space.name || "全屋",
        space.type === "overall" ? "overall" : "space",
        space.workType === "material" ? "material" : "labor",
        String(space.iconKey || "").trim(),
        String(space.templateId || "").trim(),
        toNumber(space.area),
        toNumber(space.perimeter),
        toNumber(space.height),
        toNumber(space.buildingArea),
        space.collapsed ? 1 : 0
      );
    });
    (quote.lines || []).forEach((line, index) => {
      insertLine.run(
        line.id,
        quote.id,
        line.spaceId || null,
        index,
        line.engineeringName || line.itemName || line.priceItemName || "",
        line.priceItemName || line.itemName || "",
        line.sourceType === "material" || line.materialId ? "material" : "labor",
        line.area || "",
        toNumber(line.quantity),
        line.materialId || "",
        line.materialCategory || "",
        toNumber(line.material),
        toNumber(line.auxiliary),
        toNumber(line.wasteRate),
        toNumber(line.labor),
        line.legacyUnitPrice ?? line.customPrice ?? null,
        line.note || ""
      );
    });
  });
}

function getAppState(key) {
  return db.prepare("SELECT value FROM app_state WHERE key = ?").get(key)?.value;
}

function setAppState(key, value) {
  db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
}

async function serveStatic(pathname, res) {
  const normalized = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const safePath = path.normalize(normalized).replace(/^([/\\])+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function sendText(res, status, text) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
