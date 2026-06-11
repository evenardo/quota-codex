import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

/**
 * @typedef {import("./server-types.js").PortableState} PortableState
 * @typedef {import("./server-types.js").SqliteMaterial} SqliteMaterial
 * @typedef {import("./server-types.js").SqliteMaterialKind} SqliteMaterialKind
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.QUOTE_DATA_DIR ? path.resolve(process.env.QUOTE_DATA_DIR) : path.join(__dirname, "data");
const sqliteFile = path.join(dataDir, "quote-data.sqlite");
const backupDir = path.join(dataDir, "backups");
const port = Number(process.env.PORT || 5177);
const backupIntervalMinutes = Number(process.env.BACKUP_INTERVAL_MINUTES || 10);
const DEFAULT_QUANTITY_FORMULA = "q=s+c*(h-0.25)";
const APP_STATE_FIELDS = [
  ["activeVersionId", ""],
  ["activePage", "manager"],
  ["categoryLibraryCollapsed", true, (value) => value !== "false"],
  ["genericMaterialLibraryCollapsed", true, (value) => value !== "false"],
  ["genericMaterialCategoryState", {}, parseJsonAppState, stringifyJsonAppState],
  ["supplierMaterialLibraryCollapsed", false, (value) => value === "true"],
  ["activeCustomerId", ""],
  ["activeQuoteId", ""],
  ["activePackageId", ""],
  ["activePackageEstimateId", ""],
  ["activePackageTab", "description", (value) => value || "description", (value) => value === "estimate" ? "estimate" : "description"],
  ["returnToPackageId", ""],
  ["returnToPackageEstimateId", ""],
  ["returnToPackageItemId", ""],
  ["returnToTemplateId", ""],
  ["returnToTemplateItemId", ""]
];

function parseJsonAppState(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function stringifyJsonAppState(value) {
  return JSON.stringify(value && typeof value === "object" ? value : {});
}

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

let db = null;

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/data" && req.method === "GET") {
      if (!databaseHasWorkingData()) {
        sendJson(res, 409, {
          error: "SQLite 数据库没有可用工费版本。请从 data/backups 中恢复 quote-data.sqlite 备份。"
        });
        return;
      }
      sendJson(res, 200, loadPortableState());
      return;
    }
    if (url.pathname === "/api/data" && req.method === "POST") {
      await handlePostData(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/material-kinds/") && req.method === "PATCH") {
      await handlePatchMaterialKind(req, res, decodeURIComponent(url.pathname.replace("/api/material-kinds/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/material-kinds/") && req.method === "DELETE") {
      handleDeleteMaterialKind(res, decodeURIComponent(url.pathname.replace("/api/material-kinds/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/materials/") && req.method === "PATCH") {
      await handlePatchMaterial(req, res, decodeURIComponent(url.pathname.replace("/api/materials/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/materials/") && req.method === "DELETE") {
      handleDeleteMaterial(res, decodeURIComponent(url.pathname.replace("/api/materials/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/labor-items/") && req.method === "PATCH") {
      await handlePatchLaborItem(req, res, decodeURIComponent(url.pathname.replace("/api/labor-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/labor-items/") && req.method === "DELETE") {
      handleDeleteLaborItem(res, decodeURIComponent(url.pathname.replace("/api/labor-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/labor-categories/") && req.method === "PATCH") {
      await handlePatchLaborCategory(req, res, decodeURIComponent(url.pathname.replace("/api/labor-categories/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/labor-categories/") && req.method === "DELETE") {
      handleDeleteLaborCategory(res, decodeURIComponent(url.pathname.replace("/api/labor-categories/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/price-versions/") && req.method === "PATCH") {
      await handlePatchPriceVersion(req, res, decodeURIComponent(url.pathname.replace("/api/price-versions/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/price-versions/") && req.method === "DELETE") {
      handleDeletePriceVersion(res, decodeURIComponent(url.pathname.replace("/api/price-versions/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/customers/") && req.method === "PATCH") {
      await handlePatchCustomer(req, res, decodeURIComponent(url.pathname.replace("/api/customers/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/customers/") && req.method === "DELETE") {
      handleDeleteCustomer(res, decodeURIComponent(url.pathname.replace("/api/customers/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/packages/") && req.method === "PATCH") {
      await handlePatchPackage(req, res, decodeURIComponent(url.pathname.replace("/api/packages/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/packages/") && req.method === "DELETE") {
      handleDeletePackage(res, decodeURIComponent(url.pathname.replace("/api/packages/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-sections/") && req.method === "PATCH") {
      await handlePatchPackageSection(req, res, decodeURIComponent(url.pathname.replace("/api/package-sections/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-sections/") && req.method === "DELETE") {
      handleDeletePackageSection(res, decodeURIComponent(url.pathname.replace("/api/package-sections/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-section-items/") && req.method === "PATCH") {
      await handlePatchPackageSectionItem(req, res, decodeURIComponent(url.pathname.replace("/api/package-section-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-section-items/") && req.method === "DELETE") {
      handleDeletePackageSectionItem(res, decodeURIComponent(url.pathname.replace("/api/package-section-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimates/") && req.method === "PATCH") {
      await handlePatchPackageEstimate(req, res, decodeURIComponent(url.pathname.replace("/api/package-estimates/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimates/") && req.method === "DELETE") {
      handleDeletePackageEstimate(res, decodeURIComponent(url.pathname.replace("/api/package-estimates/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimate-groups/") && req.method === "PATCH") {
      await handlePatchPackageEstimateGroup(req, res, decodeURIComponent(url.pathname.replace("/api/package-estimate-groups/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimate-groups/") && req.method === "DELETE") {
      handleDeletePackageEstimateGroup(res, decodeURIComponent(url.pathname.replace("/api/package-estimate-groups/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimate-items/") && req.method === "PATCH") {
      await handlePatchPackageEstimateItem(req, res, decodeURIComponent(url.pathname.replace("/api/package-estimate-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/package-estimate-items/") && req.method === "DELETE") {
      handleDeletePackageEstimateItem(res, decodeURIComponent(url.pathname.replace("/api/package-estimate-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/templates/") && req.method === "PATCH") {
      await handlePatchTemplate(req, res, decodeURIComponent(url.pathname.replace("/api/templates/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/templates/") && req.method === "DELETE") {
      handleDeleteTemplate(res, decodeURIComponent(url.pathname.replace("/api/templates/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/template-items/") && req.method === "PATCH") {
      await handlePatchTemplateItem(req, res, decodeURIComponent(url.pathname.replace("/api/template-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/template-items/") && req.method === "DELETE") {
      handleDeleteTemplateItem(res, decodeURIComponent(url.pathname.replace("/api/template-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/quotes/") && req.method === "PATCH") {
      await handlePatchQuote(req, res, decodeURIComponent(url.pathname.replace("/api/quotes/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/quotes/") && req.method === "DELETE") {
      handleDeleteQuote(res, decodeURIComponent(url.pathname.replace("/api/quotes/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/project-groups/") && req.method === "PATCH") {
      await handlePatchProjectGroup(req, res, decodeURIComponent(url.pathname.replace("/api/project-groups/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/project-groups/") && req.method === "DELETE") {
      handleDeleteProjectGroup(res, decodeURIComponent(url.pathname.replace("/api/project-groups/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/quote-items/") && req.method === "PATCH") {
      await handlePatchQuoteItem(req, res, decodeURIComponent(url.pathname.replace("/api/quote-items/", "")));
      return;
    }
    if (url.pathname.startsWith("/api/quote-items/") && req.method === "DELETE") {
      handleDeleteQuoteItem(res, decodeURIComponent(url.pathname.replace("/api/quote-items/", "")));
      return;
    }
    if (url.pathname === "/api/app-state" && req.method === "PATCH") {
      await handlePatchAppState(req, res);
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
}

export async function startQuoteServer() {
  await mkdir(dataDir, { recursive: true });
  db = new DatabaseSync(sqliteFile);
  initializeDatabase();
  const server = createServer(handleRequest);
  server.listen(port, "127.0.0.1", () => {
    console.log(`报价系统已启动：http://127.0.0.1:${port}`);
    console.log(`SQLite 数据库：${sqliteFile}`);
    console.log("Data source: SQLite tables. JSON seed files are not used.");
  });

  scheduleAutomaticBackups();
  return server;
}

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  await startQuoteServer();
}

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
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      unit TEXT,
      family TEXT,
      aliases TEXT,
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
      quantity_round_down INTEGER DEFAULT 0,
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
      calc_cost_area REAL DEFAULT 0,
      calc_cost_price REAL DEFAULT 0,
      calc_quote_area REAL DEFAULT 0,
      calc_quote_price REAL DEFAULT 0,
      brand TEXT,
      supplier TEXT,
      pricing_formula TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS material_kinds (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL UNIQUE,
      library_category TEXT,
      primary_category TEXT,
      unit TEXT,
      cost_unit_price REAL DEFAULT 0,
      quote_unit_price REAL DEFAULT 0,
      calc_cost_area REAL DEFAULT 0,
      calc_cost_price REAL DEFAULT 0,
      calc_quote_area REAL DEFAULT 0,
      calc_quote_price REAL DEFAULT 0,
      match_group TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS project_group_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER DEFAULT 0,
      library_order_applied INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS project_group_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      item_type TEXT DEFAULT 'labor',
      item_name TEXT,
      display_name TEXT,
      material_kind_id TEXT,
      material_id TEXT,
      material_category TEXT,
      area TEXT,
      quantity REAL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES project_group_templates(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_template_items_template ON project_group_template_items(template_id, sort_order);
    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      quote_unit_price REAL DEFAULT 0,
      cost_target_rate REAL DEFAULT 0,
      quantity_formula TEXT,
      description TEXT,
      exclusion_note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS package_sections (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER DEFAULT 0,
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS package_section_items (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source_type TEXT DEFAULT 'labor',
      name TEXT,
      item_name TEXT,
      material_id TEXT,
      material_category TEXT,
      unit TEXT,
      provider TEXT,
      area TEXT,
      description TEXT,
      FOREIGN KEY (section_id) REFERENCES package_sections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS package_estimates (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      name TEXT NOT NULL,
      building_area REAL DEFAULT 0,
      area REAL DEFAULT 0,
      perimeter REAL DEFAULT 0,
      height REAL DEFAULT 0,
      quote_unit_price REAL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER DEFAULT 0,
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS package_estimate_groups (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      package_section_id TEXT,
      name TEXT NOT NULL,
      icon_key TEXT,
      count REAL DEFAULT 1,
      area REAL DEFAULT 0,
      perimeter REAL DEFAULT 0,
      height REAL DEFAULT 0,
      collapsed INTEGER DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (estimate_id) REFERENCES package_estimates(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS package_estimate_items (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      group_id TEXT,
      package_section_item_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      item_type TEXT DEFAULT 'labor',
      labor_item_name TEXT,
      material_id TEXT,
      material_category TEXT,
      area TEXT,
      quantity REAL DEFAULT 0,
      included_type TEXT DEFAULT 'included',
      FOREIGN KEY (estimate_id) REFERENCES package_estimates(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES package_estimate_groups(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_package_sections_package ON package_sections(package_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_package_section_items_section ON package_section_items(section_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_package_estimates_package ON package_estimates(package_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_package_estimate_groups_estimate ON package_estimate_groups(estimate_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_package_estimate_items_estimate ON package_estimate_items(estimate_id, sort_order);
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
      package_id TEXT,
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
  ensureColumn("quote_project_groups", "package_id", "TEXT");
  ensureColumn("quote_project_groups", "building_area", "REAL DEFAULT 0");
  ensureColumn("quote_project_groups", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("project_group_templates", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("project_group_templates", "library_order_applied", "INTEGER DEFAULT 1");
  ensureColumn("packages", "quantity_formula", "TEXT");
  ensureColumn("packages", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("packages", "exclusion_note", "TEXT");
  ensureColumn("package_sections", "collapsed", "INTEGER DEFAULT 0");
  ensureColumn("package_section_items", "source_type", "TEXT DEFAULT 'labor'");
  ensureColumn("package_section_items", "item_name", "TEXT");
  ensureColumn("package_section_items", "material_id", "TEXT");
  ensureColumn("package_section_items", "material_category", "TEXT");
  ensureColumn("package_section_items", "area", "TEXT");
  ensureColumn("package_estimates", "active", "INTEGER DEFAULT 0");
  ensureColumn("package_estimate_groups", "package_section_id", "TEXT");
  ensureColumn("package_estimate_groups", "count", "REAL DEFAULT 1");
  ensureColumn("package_estimate_items", "package_section_item_id", "TEXT");
  ensureColumn("labor_items", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("labor_items", "family", "TEXT");
  ensureColumn("labor_items", "aliases", "TEXT");
  ensureColumn("labor_items", "category_id", "TEXT");
  ensureColumn("labor_items", "quantity_formula", "TEXT");
  ensureColumn("labor_items", "quantity_round_down", "INTEGER DEFAULT 0");
  ensureColumn("labor_items", "uses_material", "INTEGER DEFAULT 0");
  ensureColumn("labor_items", "material_category", "TEXT");
  ensureColumn("labor_items", "material_subcategory", "TEXT");
  ensureColumn("labor_items", "default_material_id", "TEXT");
  ensureColumn("labor_categories", "description", "TEXT");
  ensureColumn("labor_categories", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("materials", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("materials", "material_kind_id", "TEXT");
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
  ensureColumn("materials", "calc_cost_area", "REAL DEFAULT 0");
  ensureColumn("materials", "calc_cost_price", "REAL DEFAULT 0");
  ensureColumn("materials", "calc_quote_area", "REAL DEFAULT 0");
  ensureColumn("materials", "calc_quote_price", "REAL DEFAULT 0");
  ensureColumn("materials", "brand", "TEXT");
  ensureColumn("materials", "supplier", "TEXT");
  ensureColumn("materials", "pricing_formula", "TEXT");
  ensureColumn("materials", "note", "TEXT");
  ensureColumn("material_kinds", "cost_unit_price", "REAL DEFAULT 0");
  ensureColumn("material_kinds", "library_category", "TEXT");
  ensureColumn("material_kinds", "quote_unit_price", "REAL DEFAULT 0");
  ensureColumn("material_kinds", "calc_cost_area", "REAL DEFAULT 0");
  ensureColumn("material_kinds", "calc_cost_price", "REAL DEFAULT 0");
  ensureColumn("material_kinds", "calc_quote_area", "REAL DEFAULT 0");
  ensureColumn("material_kinds", "calc_quote_price", "REAL DEFAULT 0");
  ensureColumn("quote_items", "material_id", "TEXT");
  ensureColumn("quote_items", "material_kind_id", "TEXT");
  ensureColumn("project_group_template_items", "material_kind_id", "TEXT");
  ensureColumn("project_group_template_items", "display_name", "TEXT");
  ensureColumn("package_section_items", "material_kind_id", "TEXT");
  ensureColumn("package_estimate_items", "material_kind_id", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_labor_items_category ON labor_items(category_id)");
  migratePriceCategories();
  migrateIdsToUuidV7();
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

function migrateIdsToUuidV7() {
  if (getAppState("uuidv7IdsMigrated") === "true") return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    const versionMap = migrateTextPrimaryKey("price_versions", "version");
    updateForeignKeys("labor_items", "version_id", versionMap);
    updateForeignKeys("quotes", "price_version_id", versionMap);
    updateAppStateValue("activeVersionId", versionMap);

    const categoryMap = migrateTextPrimaryKey("labor_categories", "category");
    updateForeignKeys("labor_items", "category_id", categoryMap);

    const materialMap = migrateTextPrimaryKey("materials", "material");
    updateForeignKeys("quote_items", "material_id", materialMap);
    updateForeignKeys("project_group_template_items", "material_id", materialMap);
    updateForeignKeys("labor_items", "default_material_id", materialMap);

    const templateMap = migrateTextPrimaryKey("project_group_templates", "template");
    updateForeignKeys("project_group_template_items", "template_id", templateMap);
    updateForeignKeys("quote_project_groups", "template_id", templateMap);

    migrateTextPrimaryKey("project_group_template_items", "template-item");

    const packageMap = migrateTextPrimaryKey("packages", "package");
    updateForeignKeys("package_sections", "package_id", packageMap);
    updateForeignKeys("package_estimates", "package_id", packageMap);
    updateForeignKeys("quote_project_groups", "package_id", packageMap);
    const packageSectionMap = migrateTextPrimaryKey("package_sections", "package-section");
    updateForeignKeys("package_section_items", "section_id", packageSectionMap);
    migrateTextPrimaryKey("package_section_items", "package-section-item");
    const packageEstimateMap = migrateTextPrimaryKey("package_estimates", "package-estimate");
    updateForeignKeys("package_estimate_groups", "estimate_id", packageEstimateMap);
    updateForeignKeys("package_estimate_items", "estimate_id", packageEstimateMap);
    const packageEstimateGroupMap = migrateTextPrimaryKey("package_estimate_groups", "package-group");
    updateForeignKeys("package_estimate_items", "group_id", packageEstimateGroupMap);
    migrateTextPrimaryKey("package_estimate_items", "package-item");

    const customerMap = migrateTextPrimaryKey("customers", "customer");
    updateForeignKeys("quotes", "customer_id", customerMap);
    updateAppStateValue("activeCustomerId", customerMap);

    const quoteMap = migrateTextPrimaryKey("quotes", "quote");
    updateForeignKeys("quote_project_groups", "quote_id", quoteMap);
    updateForeignKeys("quote_items", "quote_id", quoteMap);
    updateAppStateValue("activeQuoteId", quoteMap);

    const groupMap = migrateTextPrimaryKey("quote_project_groups", "group");
    updateForeignKeys("quote_items", "project_group_id", groupMap);

    migrateTextPrimaryKey("quote_items", "item");
    migrateLaborItemsToUuidV7();

    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) {
      throw new Error(`UUIDv7 migration left ${violations.length} foreign key violation(s)`);
    }
    setAppStateReplace("uuidv7IdsMigrated", "true");
    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");
  } catch (error) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
}

function migrateTextPrimaryKey(table, prefix) {
  if (!tableExists(table)) return new Map();
  const rows = db.prepare(`SELECT id FROM ${table}`).all();
  const map = new Map();
  const update = db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`);
  rows.forEach(({ id }) => {
    const current = String(id || "");
    if (isPrefixedUuidV7(current, prefix)) return;
    const next = makeId(prefix);
    map.set(current, next);
    update.run(next, current);
  });
  return map;
}

function migrateLaborItemsToUuidV7() {
  if (!tableExists("labor_items")) return;
  const columns = db.prepare("PRAGMA table_info(labor_items)").all();
  const idColumn = columns.find((column) => column.name === "id");
  const idIsText = String(idColumn?.type || "").toUpperCase().includes("TEXT");
  const invalidRows = db.prepare("SELECT COUNT(*) AS count FROM labor_items WHERE id NOT LIKE 'labor-%'").get().count;
  if (idIsText && invalidRows === 0) return;

  db.exec(`
    CREATE TABLE labor_items_uuidv7 (
      id TEXT PRIMARY KEY,
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
      quantity_round_down INTEGER DEFAULT 0,
      uses_material INTEGER DEFAULT 0,
      material_category TEXT,
      material_subcategory TEXT,
      default_material_id TEXT,
      FOREIGN KEY (version_id) REFERENCES price_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES labor_categories(id)
    )
  `);
  const rows = db.prepare("SELECT * FROM labor_items ORDER BY rowid").all();
  const insert = db.prepare(`
    INSERT INTO labor_items_uuidv7 (
      id, version_id, sort_order, name, unit, category, category_id, description, material, auxiliary, waste_rate, labor,
      cost_material, cost_auxiliary, cost_waste_rate, cost_labor, unit_price, cost_unit_price, quantity_formula,
      quantity_round_down, uses_material, material_category, material_subcategory, default_material_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((row) => {
    const currentId = String(row.id || "");
    insert.run(
      isPrefixedUuidV7(currentId, "labor") ? currentId : makeId("labor"),
      row.version_id,
      toNumber(row.sort_order),
      row.name || "",
      row.unit || "",
      row.category || "",
      row.category_id || "",
      row.description || "",
      toNumber(row.material),
      toNumber(row.auxiliary),
      toNumber(row.waste_rate),
      toNumber(row.labor),
      toNumber(row.cost_material),
      toNumber(row.cost_auxiliary),
      toNumber(row.cost_waste_rate),
      toNumber(row.cost_labor),
      toNumber(row.unit_price),
      toNumber(row.cost_unit_price),
      row.quantity_formula || DEFAULT_QUANTITY_FORMULA,
      row.quantity_round_down ? 1 : 0,
      row.uses_material ? 1 : 0,
      row.material_category || "",
      row.material_subcategory || "",
      row.default_material_id || ""
    );
  });
  db.exec(`
    DROP TABLE labor_items;
    ALTER TABLE labor_items_uuidv7 RENAME TO labor_items;
    CREATE INDEX IF NOT EXISTS idx_labor_items_version ON labor_items(version_id);
    CREATE INDEX IF NOT EXISTS idx_labor_items_category ON labor_items(category_id);
  `);
}

function updateForeignKeys(table, column, idMap) {
  if (!idMap.size || !tableExists(table)) return;
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
  idMap.forEach((nextId, oldId) => update.run(nextId, oldId));
}

function updateAppStateValue(key, idMap) {
  const current = getAppState(key);
  if (current && idMap.has(current)) setAppStateReplace(key, idMap.get(current));
}

function setAppStateReplace(key, value) {
  db.prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
}

function isPrefixedUuidV7(value, prefix) {
  return new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i").test(String(value || ""));
}

function databaseHasWorkingData() {
  return db.prepare("SELECT COUNT(*) AS count FROM price_versions").get().count > 0;
}

async function handlePostData(req, res) {
  const body = await readBody(req);
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }
  const data = parsed?.data || parsed;
  if (!data || !Array.isArray(data.versions) || !Array.isArray(data.customers) || !Array.isArray(data.quotes)) {
    sendJson(res, 400, { error: "Invalid quote data" });
    return;
  }
  if (hasQuestionMarkEncodingDamage(parsed?.data || parsed)) {
    sendJson(res, 400, {
      error: "检测到大量中文字段疑似被编码转换成问号，已阻止写入数据库。请检查导入/保存来源的 UTF-8 编码。"
    });
    return;
  }
  savePortableState(parsed);
  sendJson(res, 200, { ok: true, path: sqliteFile });
}

async function readJsonRequest(req, res) {
  const body = await readBody(req);
  try {
    return JSON.parse(body || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return null;
  }
}

async function handlePatchMaterialKind(req, res, id) {
  const kind = await readJsonRequest(req, res);
  if (!kind) return;
  const materialKindId = normalizedText(id || kind.id);
  if (!materialKindId) {
    sendJson(res, 400, { error: "Missing material kind id" });
    return;
  }
  const name = normalizedText(kind.name);
  if (!name) {
    sendJson(res, 400, { error: "Missing material kind name" });
    return;
  }
  db.prepare(`
    INSERT INTO material_kinds (
      id, sort_order, name, library_category, primary_category, unit, cost_unit_price, quote_unit_price,
      calc_cost_area, calc_cost_price, calc_quote_area, calc_quote_price, match_group, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sort_order = excluded.sort_order,
      name = excluded.name,
      library_category = excluded.library_category,
      primary_category = excluded.primary_category,
      unit = excluded.unit,
      cost_unit_price = excluded.cost_unit_price,
      quote_unit_price = excluded.quote_unit_price,
      calc_cost_area = excluded.calc_cost_area,
      calc_cost_price = excluded.calc_cost_price,
      calc_quote_area = excluded.calc_quote_area,
      calc_quote_price = excluded.calc_quote_price,
      note = excluded.note
  `).run(
    materialKindId,
    normalizedSortOrder(kind, 0),
    name,
    normalizedText(kind.libraryCategory || kind.managementCategory || kind.library_category || kind.primaryCategory || kind.category || "未分类"),
    normalizedText(kind.primaryCategory || kind.category),
    normalizedText(kind.unit),
    toNumber(kind.costUnitPrice),
    toNumber(kind.quoteUnitPrice ?? kind.unitPrice),
    toNumber(kind.calcCostArea),
    toNumber(kind.calcCostPrice),
    toNumber(kind.calcQuoteArea),
    toNumber(kind.calcQuotePrice),
    "",
    normalizedText(kind.note)
  );
  sendJson(res, 200, { ok: true, materialKind: db.prepare("SELECT id, name, cost_unit_price AS costUnitPrice, quote_unit_price AS quoteUnitPrice FROM material_kinds WHERE id = ?").get(materialKindId) });
}

function handleDeleteMaterialKind(res, id) {
  const materialKindId = normalizedText(id);
  if (!materialKindId) {
    sendJson(res, 400, { error: "Missing material kind id" });
    return;
  }
  db.prepare("DELETE FROM material_kinds WHERE id = ?").run(materialKindId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchMaterial(req, res, id) {
  const material = await readJsonRequest(req, res);
  if (!material) return;
  const materialId = normalizedText(id || material.id);
  if (!materialId) {
    sendJson(res, 400, { error: "Missing material id" });
    return;
  }
  const name = normalizedText(material.name);
  if (!name) {
    sendJson(res, 400, { error: "Missing material name" });
    return;
  }
  const primaryCategory = normalizedText(material.primaryCategory || material.category);
  const quoteUnitPrice = material.quoteUnitPrice ?? material.unitPrice;
  db.prepare(`
    INSERT INTO materials (
      id, sort_order, name, material_kind_id, category, primary_category, secondary_category, spec, unit,
      cost_unit_price, unit_price, quote_unit_price, conversion_unit, conversion_quantity,
      calc_cost_area, calc_cost_price, calc_quote_area, calc_quote_price,
      brand, supplier, pricing_formula, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sort_order = excluded.sort_order,
      name = excluded.name,
      material_kind_id = excluded.material_kind_id,
      category = excluded.category,
      primary_category = excluded.primary_category,
      secondary_category = excluded.secondary_category,
      spec = excluded.spec,
      unit = excluded.unit,
      cost_unit_price = excluded.cost_unit_price,
      unit_price = excluded.unit_price,
      quote_unit_price = excluded.quote_unit_price,
      conversion_unit = excluded.conversion_unit,
      conversion_quantity = excluded.conversion_quantity,
      calc_cost_area = excluded.calc_cost_area,
      calc_cost_price = excluded.calc_cost_price,
      calc_quote_area = excluded.calc_quote_area,
      calc_quote_price = excluded.calc_quote_price,
      brand = excluded.brand,
      supplier = excluded.supplier,
      pricing_formula = excluded.pricing_formula,
      note = excluded.note
  `).run(
    materialId,
    normalizedSortOrder(material, 0),
    name,
    normalizedText(material.materialKindId),
    primaryCategory,
    primaryCategory,
    normalizedText(material.secondaryCategory),
    normalizedText(material.spec),
    normalizedText(material.unit),
    toNumber(material.costUnitPrice),
    toNumber(quoteUnitPrice),
    toNumber(quoteUnitPrice),
    normalizedText(material.conversionUnit),
    toNumber(material.conversionQuantity),
    toNumber(material.calcCostArea),
    toNumber(material.calcCostPrice),
    toNumber(material.calcQuoteArea),
    toNumber(material.calcQuotePrice),
    normalizedText(material.brand),
    normalizedText(material.supplier),
    normalizedText(material.pricingFormula),
    normalizedText(material.note)
  );
  sendJson(res, 200, { ok: true, material: db.prepare("SELECT id, name, cost_unit_price AS costUnitPrice, quote_unit_price AS quoteUnitPrice FROM materials WHERE id = ?").get(materialId) });
}

function handleDeleteMaterial(res, id) {
  const materialId = normalizedText(id);
  if (!materialId) {
    sendJson(res, 400, { error: "Missing material id" });
    return;
  }
  db.prepare("DELETE FROM materials WHERE id = ?").run(materialId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchLaborItem(req, res, id) {
  const item = await readJsonRequest(req, res);
  if (!item) return;
  const itemId = normalizedText(id || item.id);
  const versionId = normalizedText(item.versionId);
  const name = normalizedText(item.name);
  if (!itemId || !versionId || !name) {
    sendJson(res, 400, { error: "Missing labor item id, versionId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO labor_items (
      id, version_id, sort_order, name, unit, family, aliases, category, category_id, description, material, auxiliary, waste_rate, labor,
      cost_material, cost_auxiliary, cost_waste_rate, cost_labor, unit_price, cost_unit_price, quantity_formula,
      quantity_round_down, uses_material, material_category, material_subcategory, default_material_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version_id = excluded.version_id,
      sort_order = excluded.sort_order,
      name = excluded.name,
      unit = excluded.unit,
      family = excluded.family,
      aliases = excluded.aliases,
      category = excluded.category,
      category_id = excluded.category_id,
      description = excluded.description,
      material = excluded.material,
      auxiliary = excluded.auxiliary,
      waste_rate = excluded.waste_rate,
      labor = excluded.labor,
      cost_material = excluded.cost_material,
      cost_auxiliary = excluded.cost_auxiliary,
      cost_waste_rate = excluded.cost_waste_rate,
      cost_labor = excluded.cost_labor,
      unit_price = excluded.unit_price,
      cost_unit_price = excluded.cost_unit_price,
      quantity_formula = excluded.quantity_formula,
      quantity_round_down = excluded.quantity_round_down,
      uses_material = excluded.uses_material,
      material_category = excluded.material_category,
      material_subcategory = excluded.material_subcategory,
      default_material_id = excluded.default_material_id
  `).run(
    itemId,
    versionId,
    normalizedSortOrder(item, 0),
    name,
    normalizedText(item.unit),
    normalizedText(item.family),
    JSON.stringify(Array.isArray(item.aliases) ? item.aliases : []),
    normalizedText(item.category),
    normalizedText(item.categoryId) || null,
    normalizedText(item.description),
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
    normalizedText(item.quantityFormula || DEFAULT_QUANTITY_FORMULA),
    sqliteBoolean(item.quantityRoundDown),
    sqliteBoolean(item.usesMaterial),
    normalizedText(item.materialCategory),
    normalizedText(item.materialSubcategory),
    normalizedText(item.defaultMaterialId)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteLaborItem(res, id) {
  const itemId = normalizedText(id);
  if (!itemId) {
    sendJson(res, 400, { error: "Missing labor item id" });
    return;
  }
  db.prepare("DELETE FROM labor_items WHERE id = ?").run(itemId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchLaborCategory(req, res, id) {
  const category = await readJsonRequest(req, res);
  if (!category) return;
  const categoryId = normalizedText(id || category.id);
  const name = normalizedText(category.name);
  if (!categoryId || !name) {
    sendJson(res, 400, { error: "Missing labor category id or name" });
    return;
  }
  db.prepare(`
    INSERT INTO labor_categories (id, name, description, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order
  `).run(
    categoryId,
    name,
    normalizedText(category.description),
    normalizedSortOrder(category, 0)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteLaborCategory(res, id) {
  const categoryId = normalizedText(id);
  if (!categoryId) {
    sendJson(res, 400, { error: "Missing labor category id" });
    return;
  }
  db.prepare("DELETE FROM labor_categories WHERE id = ?").run(categoryId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPriceVersion(req, res, id) {
  const version = await readJsonRequest(req, res);
  if (!version) return;
  const versionId = normalizedText(id || version.id);
  const name = normalizedText(version.name);
  if (!versionId || !name) {
    sendJson(res, 400, { error: "Missing price version id or name" });
    return;
  }
  db.prepare(`
    INSERT INTO price_versions (id, name, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      created_at = excluded.created_at
  `).run(
    versionId,
    name,
    normalizedText(version.createdAt)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePriceVersion(res, id) {
  const versionId = normalizedText(id);
  if (!versionId) {
    sendJson(res, 400, { error: "Missing price version id" });
    return;
  }
  db.prepare("DELETE FROM price_versions WHERE id = ?").run(versionId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchCustomer(req, res, id) {
  const customer = await readJsonRequest(req, res);
  if (!customer) return;
  const customerId = normalizedText(id || customer.id);
  const name = normalizedText(customer.name);
  if (!customerId || !name) {
    sendJson(res, 400, { error: "Missing customer id or name" });
    return;
  }
  db.prepare(`
    INSERT INTO customers (id, name, contact, phone, address)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      contact = excluded.contact,
      phone = excluded.phone,
      address = excluded.address
  `).run(
    customerId,
    name,
    normalizedText(customer.contact),
    normalizedText(customer.phone),
    normalizedText(customer.address)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteCustomer(res, id) {
  const customerId = normalizedText(id);
  if (!customerId) {
    sendJson(res, 400, { error: "Missing customer id" });
    return;
  }
  db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackage(req, res, id) {
  const entry = await readJsonRequest(req, res);
  if (!entry) return;
  const packageId = normalizedText(id || entry.id);
  const name = normalizedText(entry.name);
  if (!packageId || !name) {
    sendJson(res, 400, { error: "Missing package id or name" });
    return;
  }
  db.prepare(`
    INSERT INTO packages (
      id, name, unit, quote_unit_price, cost_target_rate, quantity_formula, description, exclusion_note, sort_order, collapsed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      unit = excluded.unit,
      quote_unit_price = excluded.quote_unit_price,
      cost_target_rate = excluded.cost_target_rate,
      quantity_formula = excluded.quantity_formula,
      description = excluded.description,
      exclusion_note = excluded.exclusion_note,
      sort_order = excluded.sort_order,
      collapsed = excluded.collapsed
  `).run(
    packageId,
    name,
    normalizedText(entry.unit),
    toNumber(entry.quoteUnitPrice),
    toNumber(entry.costTargetRate),
    normalizedText(entry.quantityFormula || "q=buildingArea"),
    normalizedText(entry.description),
    normalizedText(entry.exclusionNote),
    normalizedSortOrder(entry, 0),
    sqliteBoolean(entry.collapsed)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackage(res, id) {
  const packageId = normalizedText(id);
  if (!packageId) {
    sendJson(res, 400, { error: "Missing package id" });
    return;
  }
  db.prepare("DELETE FROM packages WHERE id = ?").run(packageId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackageSection(req, res, id) {
  const section = await readJsonRequest(req, res);
  if (!section) return;
  const sectionId = normalizedText(id || section.id);
  const packageId = normalizedText(section.packageId);
  const name = normalizedText(section.name);
  if (!sectionId || !packageId || !name) {
    sendJson(res, 400, { error: "Missing package section id, packageId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO package_sections (id, package_id, name, sort_order, collapsed)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      package_id = excluded.package_id,
      name = excluded.name,
      sort_order = excluded.sort_order,
      collapsed = excluded.collapsed
  `).run(
    sectionId,
    packageId,
    name,
    normalizedSortOrder(section, 0),
    sqliteBoolean(section.collapsed)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackageSection(res, id) {
  const sectionId = normalizedText(id);
  if (!sectionId) {
    sendJson(res, 400, { error: "Missing package section id" });
    return;
  }
  db.prepare("DELETE FROM package_sections WHERE id = ?").run(sectionId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackageSectionItem(req, res, id) {
  const item = await readJsonRequest(req, res);
  if (!item) return;
  const itemId = normalizedText(id || item.id);
  const sectionId = normalizedText(item.sectionId);
  if (!itemId || !sectionId) {
    sendJson(res, 400, { error: "Missing package section item id or sectionId" });
    return;
  }
  const sourceType = item.sourceType === "material" ? "material" : "labor";
  db.prepare(`
    INSERT INTO package_section_items (
      id, section_id, sort_order, source_type, name, item_name, material_kind_id, material_id,
      material_category, unit, provider, area, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      section_id = excluded.section_id,
      sort_order = excluded.sort_order,
      source_type = excluded.source_type,
      name = excluded.name,
      item_name = excluded.item_name,
      material_kind_id = excluded.material_kind_id,
      material_id = excluded.material_id,
      material_category = excluded.material_category,
      unit = excluded.unit,
      provider = excluded.provider,
      area = excluded.area,
      description = excluded.description
  `).run(
    itemId,
    sectionId,
    normalizedSortOrder(item, 0),
    sourceType,
    normalizedText(item.name),
    normalizedText(item.itemName || item.name),
    normalizedText(item.materialKindId),
    normalizedText(item.materialId),
    normalizedText(item.materialCategory),
    normalizedText(item.unit),
    normalizedText(item.provider || item.area),
    normalizedText(item.area || item.provider),
    normalizedText(item.description)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackageSectionItem(res, id) {
  const itemId = normalizedText(id);
  if (!itemId) {
    sendJson(res, 400, { error: "Missing package section item id" });
    return;
  }
  db.prepare("DELETE FROM package_section_items WHERE id = ?").run(itemId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackageEstimate(req, res, id) {
  const estimate = await readJsonRequest(req, res);
  if (!estimate) return;
  const estimateId = normalizedText(id || estimate.id);
  const packageId = normalizedText(estimate.packageId);
  const name = normalizedText(estimate.name);
  if (!estimateId || !packageId || !name) {
    sendJson(res, 400, { error: "Missing package estimate id, packageId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO package_estimates (
      id, package_id, name, building_area, area, perimeter, height, quote_unit_price, sort_order, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      package_id = excluded.package_id,
      name = excluded.name,
      building_area = excluded.building_area,
      area = excluded.area,
      perimeter = excluded.perimeter,
      height = excluded.height,
      quote_unit_price = excluded.quote_unit_price,
      sort_order = excluded.sort_order,
      active = excluded.active
  `).run(
    estimateId,
    packageId,
    name,
    toNumber(estimate.buildingArea),
    toNumber(estimate.area),
    toNumber(estimate.perimeter),
    toNumber(estimate.height),
    toNumber(estimate.quoteUnitPrice),
    normalizedSortOrder(estimate, 0),
    sqliteBoolean(estimate.active)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackageEstimate(res, id) {
  const estimateId = normalizedText(id);
  if (!estimateId) {
    sendJson(res, 400, { error: "Missing package estimate id" });
    return;
  }
  db.prepare("DELETE FROM package_estimates WHERE id = ?").run(estimateId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackageEstimateGroup(req, res, id) {
  const group = await readJsonRequest(req, res);
  if (!group) return;
  const groupId = normalizedText(id || group.id);
  const estimateId = normalizedText(group.estimateId);
  const name = normalizedText(group.name);
  if (!groupId || !estimateId || !name) {
    sendJson(res, 400, { error: "Missing package estimate group id, estimateId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO package_estimate_groups (
      id, estimate_id, package_section_id, name, icon_key, count, area, perimeter, height, collapsed, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      estimate_id = excluded.estimate_id,
      package_section_id = excluded.package_section_id,
      name = excluded.name,
      icon_key = excluded.icon_key,
      count = excluded.count,
      area = excluded.area,
      perimeter = excluded.perimeter,
      height = excluded.height,
      collapsed = excluded.collapsed,
      sort_order = excluded.sort_order
  `).run(
    groupId,
    estimateId,
    normalizedText(group.packageSectionId),
    name,
    normalizedText(group.iconKey),
    toNumber(group.count ?? 1),
    toNumber(group.area),
    toNumber(group.perimeter),
    toNumber(group.height),
    sqliteBoolean(group.collapsed),
    normalizedSortOrder(group, 0)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackageEstimateGroup(res, id) {
  const groupId = normalizedText(id);
  if (!groupId) {
    sendJson(res, 400, { error: "Missing package estimate group id" });
    return;
  }
  db.prepare("DELETE FROM package_estimate_groups WHERE id = ?").run(groupId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchPackageEstimateItem(req, res, id) {
  const item = await readJsonRequest(req, res);
  if (!item) return;
  const itemId = normalizedText(id || item.id);
  const estimateId = normalizedText(item.estimateId);
  if (!itemId || !estimateId) {
    sendJson(res, 400, { error: "Missing package estimate item id or estimateId" });
    return;
  }
  const sourceType = item.sourceType === "material" ? "material" : "labor";
  db.prepare(`
    INSERT INTO package_estimate_items (
      id, estimate_id, group_id, package_section_item_id, sort_order, item_type, labor_item_name, material_kind_id, material_id,
      material_category, area, quantity, included_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      estimate_id = excluded.estimate_id,
      group_id = excluded.group_id,
      package_section_item_id = excluded.package_section_item_id,
      sort_order = excluded.sort_order,
      item_type = excluded.item_type,
      labor_item_name = excluded.labor_item_name,
      material_kind_id = excluded.material_kind_id,
      material_id = excluded.material_id,
      material_category = excluded.material_category,
      area = excluded.area,
      quantity = excluded.quantity,
      included_type = excluded.included_type
  `).run(
    itemId,
    estimateId,
    normalizedText(item.groupId) || null,
    normalizedText(item.packageSectionItemId),
    normalizedSortOrder(item, 0),
    sourceType,
    normalizedText(item.itemName),
    normalizedText(item.materialKindId),
    normalizedText(item.materialId),
    normalizedText(item.materialCategory),
    normalizedText(item.area),
    toNumber(item.quantity),
    normalizedText(item.includedType || "included")
  );
  sendJson(res, 200, { ok: true });
}

function handleDeletePackageEstimateItem(res, id) {
  const itemId = normalizedText(id);
  if (!itemId) {
    sendJson(res, 400, { error: "Missing package estimate item id" });
    return;
  }
  db.prepare("DELETE FROM package_estimate_items WHERE id = ?").run(itemId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchTemplate(req, res, id) {
  const template = await readJsonRequest(req, res);
  if (!template) return;
  const templateId = normalizedText(id || template.id);
  const name = normalizedText(template.name);
  if (!templateId || !name) {
    sendJson(res, 400, { error: "Missing template id or name" });
    return;
  }
  db.prepare(`
    INSERT INTO project_group_templates (id, name, icon_key, sort_order, collapsed, library_order_applied)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon_key = excluded.icon_key,
      sort_order = excluded.sort_order,
      collapsed = excluded.collapsed,
      library_order_applied = excluded.library_order_applied
  `).run(
    templateId,
    name,
    normalizedText(template.iconKey),
    normalizedSortOrder(template, 0),
    sqliteBoolean(template.collapsed),
    sqliteBoolean(template.libraryOrderApplied !== false)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteTemplate(res, id) {
  const templateId = normalizedText(id);
  if (!templateId) {
    sendJson(res, 400, { error: "Missing template id" });
    return;
  }
  db.prepare("DELETE FROM project_group_templates WHERE id = ?").run(templateId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchTemplateItem(req, res, id) {
  const item = await readJsonRequest(req, res);
  if (!item) return;
  const itemId = normalizedText(id || item.id);
  const templateId = normalizedText(item.templateId);
  if (!itemId || !templateId) {
    sendJson(res, 400, { error: "Missing template item id or templateId" });
    return;
  }
  const sourceType = item.sourceType === "material" ? "material" : "labor";
  db.prepare(`
    INSERT INTO project_group_template_items (
      id, template_id, sort_order, item_type, item_name, display_name, material_kind_id, material_id, material_category, area, quantity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      template_id = excluded.template_id,
      sort_order = excluded.sort_order,
      item_type = excluded.item_type,
      item_name = excluded.item_name,
      display_name = excluded.display_name,
      material_kind_id = excluded.material_kind_id,
      material_id = excluded.material_id,
      material_category = excluded.material_category,
      area = excluded.area,
      quantity = excluded.quantity
  `).run(
    itemId,
    templateId,
    normalizedSortOrder(item, 0),
    sourceType,
    normalizedText(item.itemName),
    normalizedText(item.displayName),
    normalizedText(item.materialKindId),
    normalizedText(item.materialId),
    normalizedText(item.materialCategory),
    normalizedText(item.area),
    toNumber(item.quantity)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteTemplateItem(res, id) {
  const itemId = normalizedText(id);
  if (!itemId) {
    sendJson(res, 400, { error: "Missing template item id" });
    return;
  }
  db.prepare("DELETE FROM project_group_template_items WHERE id = ?").run(itemId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchQuote(req, res, id) {
  const quote = await readJsonRequest(req, res);
  if (!quote) return;
  const quoteId = normalizedText(id || quote.id);
  const customerId = normalizedText(quote.customerId);
  const name = normalizedText(quote.name || quote.projectName);
  if (!quoteId || !customerId || !name) {
    sendJson(res, 400, { error: "Missing quote id, customerId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO quotes (
      id, customer_id, name, project_name, client_name, client_phone, client_address, quote_date,
      price_version_id, management_rate, design_rate, tax_rate, show_amount_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id,
      name = excluded.name,
      project_name = excluded.project_name,
      client_name = excluded.client_name,
      client_phone = excluded.client_phone,
      client_address = excluded.client_address,
      quote_date = excluded.quote_date,
      price_version_id = excluded.price_version_id,
      management_rate = excluded.management_rate,
      design_rate = excluded.design_rate,
      tax_rate = excluded.tax_rate,
      show_amount_columns = excluded.show_amount_columns
  `).run(
    quoteId,
    customerId,
    name,
    normalizedText(quote.projectName || name),
    normalizedText(quote.clientName),
    normalizedText(quote.clientPhone),
    normalizedText(quote.clientAddress),
    normalizedText(quote.quoteDate),
    normalizedText(quote.priceVersionId),
    toNumber(quote.managementRate),
    toNumber(quote.designRate),
    toNumber(quote.taxRate),
    sqliteBoolean(quote.showAmountColumns !== false)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteQuote(res, id) {
  const quoteId = normalizedText(id);
  if (!quoteId) {
    sendJson(res, 400, { error: "Missing quote id" });
    return;
  }
  db.prepare("DELETE FROM quotes WHERE id = ?").run(quoteId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchProjectGroup(req, res, id) {
  const group = await readJsonRequest(req, res);
  if (!group) return;
  const groupId = normalizedText(id || group.id);
  const quoteId = normalizedText(group.quoteId);
  const name = normalizedText(group.name);
  if (!groupId || !quoteId || !name) {
    sendJson(res, 400, { error: "Missing project group id, quoteId, or name" });
    return;
  }
  db.prepare(`
    INSERT INTO quote_project_groups (
      id, quote_id, sort_order, name, type, work_type, icon_key, template_id, package_id, area, perimeter, height, building_area, collapsed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      quote_id = excluded.quote_id,
      sort_order = excluded.sort_order,
      name = excluded.name,
      type = excluded.type,
      work_type = excluded.work_type,
      icon_key = excluded.icon_key,
      template_id = excluded.template_id,
      package_id = excluded.package_id,
      area = excluded.area,
      perimeter = excluded.perimeter,
      height = excluded.height,
      building_area = excluded.building_area,
      collapsed = excluded.collapsed
  `).run(
    groupId,
    quoteId,
    normalizedSortOrder(group, 0),
    name,
    group.type === "package" ? "package" : (group.type === "overall" ? "overall" : "space"),
    group.workType === "material" ? "material" : "labor",
    normalizedText(group.iconKey),
    normalizedText(group.templateId),
    normalizedText(group.packageId),
    toNumber(group.area),
    toNumber(group.perimeter),
    toNumber(group.height),
    toNumber(group.buildingArea),
    sqliteBoolean(group.collapsed)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteProjectGroup(res, id) {
  const groupId = normalizedText(id);
  if (!groupId) {
    sendJson(res, 400, { error: "Missing project group id" });
    return;
  }
  db.prepare("DELETE FROM quote_project_groups WHERE id = ?").run(groupId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchQuoteItem(req, res, id) {
  const line = await readJsonRequest(req, res);
  if (!line) return;
  const lineId = normalizedText(id || line.id);
  const quoteId = normalizedText(line.quoteId);
  if (!lineId || !quoteId) {
    sendJson(res, 400, { error: "Missing quote item id or quoteId" });
    return;
  }
  db.prepare(`
    INSERT INTO quote_items (
      id, quote_id, project_group_id, sort_order, engineering_name, labor_item_name, item_type, area, quantity,
      material_kind_id, material_id, material_category, material, auxiliary, waste_rate, labor, legacy_unit_price, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      quote_id = excluded.quote_id,
      project_group_id = excluded.project_group_id,
      sort_order = excluded.sort_order,
      engineering_name = excluded.engineering_name,
      labor_item_name = excluded.labor_item_name,
      item_type = excluded.item_type,
      area = excluded.area,
      quantity = excluded.quantity,
      material_kind_id = excluded.material_kind_id,
      material_id = excluded.material_id,
      material_category = excluded.material_category,
      material = excluded.material,
      auxiliary = excluded.auxiliary,
      waste_rate = excluded.waste_rate,
      labor = excluded.labor,
      legacy_unit_price = excluded.legacy_unit_price,
      note = excluded.note
  `).run(
    lineId,
    quoteId,
    normalizedText(line.spaceId) || null,
    normalizedSortOrder(line, 0),
    normalizedText(line.engineeringName || line.itemName || line.priceItemName),
    normalizedText(line.priceItemName || line.itemName),
    line.sourceType === "material" || line.materialId || line.materialKindId ? "material" : "labor",
    normalizedText(line.area),
    toNumber(line.quantity),
    normalizedText(line.materialKindId),
    normalizedText(line.materialId),
    normalizedText(line.materialCategory),
    toNumber(line.material),
    toNumber(line.auxiliary),
    toNumber(line.wasteRate),
    toNumber(line.labor),
    line.legacyUnitPrice ?? line.customPrice ?? null,
    normalizedText(line.note)
  );
  sendJson(res, 200, { ok: true });
}

function handleDeleteQuoteItem(res, id) {
  const lineId = normalizedText(id);
  if (!lineId) {
    sendJson(res, 400, { error: "Missing quote item id" });
    return;
  }
  db.prepare("DELETE FROM quote_items WHERE id = ?").run(lineId);
  sendJson(res, 200, { ok: true });
}

async function handlePatchAppState(req, res) {
  const patch = await readJsonRequest(req, res);
  if (!patch) return;
  APP_STATE_FIELDS.forEach(([key, , , saveValue]) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
    const value = saveValue ? saveValue(patch[key]) : patch[key];
    setAppState(key, value);
  });
  sendJson(res, 200, { ok: true });
}

function hasQuestionMarkEncodingDamage(data) {
  const fields = [];
  const pushText = (value) => {
    if (typeof value === "string" && value.trim()) fields.push(value.trim());
  };

  (data?.versions || []).forEach((version) => {
    pushText(version.name);
    (version.items || []).forEach((item) => {
      pushText(item.name);
      pushText(item.unit);
      pushText(item.category);
      pushText(item.description);
    });
  });
  (data?.categories || []).forEach((category) => {
    pushText(category.name);
    pushText(category.description);
  });
  (data?.materials || []).forEach((material) => {
    pushText(material.name);
    pushText(material.unit);
    pushText(material.primaryCategory || material.category);
    pushText(material.note);
  });
  (data?.templates || []).forEach((template) => {
    pushText(template.name);
    (template.items || []).forEach((item) => pushText(item.itemName));
  });
  (data?.quotes || []).forEach((quote) => {
    pushText(quote.name);
    pushText(quote.projectName);
    pushText(quote.clientName);
    (quote.spaces || []).forEach((space) => pushText(space.name));
    (quote.lines || []).forEach((line) => {
      pushText(line.engineeringName);
      pushText(line.priceItemName);
      pushText(line.area);
    });
  });

  if (fields.length < 20) return false;
  const damaged = fields.filter((value) => /\?{2,}/.test(value));
  return damaged.length >= 20 && damaged.length / fields.length > 0.2;
}

async function handleBackupDatabase(res) {
  const backupFile = await createSqliteBackup("manual");
  sendJson(res, 200, { ok: true, path: backupFile });
}

function scheduleAutomaticBackups() {
  if (!Number.isFinite(backupIntervalMinutes) || backupIntervalMinutes <= 0) return;
  const intervalMs = backupIntervalMinutes * 60 * 1000;
  setTimeout(() => runAutomaticBackup(), 5000);
  setInterval(() => runAutomaticBackup(), intervalMs);
}

async function runAutomaticBackup() {
  try {
    if (!databaseHasWorkingData()) return;
    const backupFile = await createSqliteBackup("auto");
    await cleanupAutomaticBackups();
    console.log(`Auto backup created: ${backupFile}`);
  } catch (error) {
    console.error(`Auto backup failed: ${error.message || error}`);
  }
}

async function createSqliteBackup(kind) {
  await mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `quote-data-${kind}-${formatBackupTimestamp(new Date())}.sqlite`);
  db.exec("PRAGMA wal_checkpoint(FULL)");
  db.exec(`VACUUM INTO ${quoteSqliteString(backupFile)}`);
  return backupFile;
}

async function cleanupAutomaticBackups() {
  const files = await readdir(backupDir);
  const automaticBackups = files
    .map((file) => ({ file, createdAt: parseAutomaticBackupTimestamp(file) }))
    .filter((entry) => entry.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt);
  const keep = selectAutomaticBackupsToKeep(automaticBackups, new Date());
  const expiredBackups = automaticBackups.filter((entry) => !keep.has(entry.file));
  await Promise.all(expiredBackups.map((entry) => unlink(path.join(backupDir, entry.file))));
}

export function selectAutomaticBackupsToKeep(backups, now = new Date()) {
  const keep = new Set();
  const hourlyTwo = new Map();
  const hourlyOne = new Set();
  const daily = new Set();
  const weekly = new Set();
  const monthly = new Set();
  const nowTime = now.getTime();

  backups.forEach((entry) => {
    const ageHours = (nowTime - entry.createdAt.getTime()) / (60 * 60 * 1000);
    if (ageHours <= 1) {
      keep.add(entry.file);
      return;
    }

    if (ageHours <= 12) {
      const key = hourBucket(entry.createdAt);
      const count = hourlyTwo.get(key) || 0;
      if (count < 2) {
        keep.add(entry.file);
        hourlyTwo.set(key, count + 1);
      }
      return;
    }

    if (ageHours <= 24) {
      const key = hourBucket(entry.createdAt);
      if (!hourlyOne.has(key)) {
        keep.add(entry.file);
        hourlyOne.add(key);
      }
      return;
    }

    const ageDays = ageHours / 24;
    if (ageDays <= 7) {
      const key = dayBucket(entry.createdAt);
      if (!daily.has(key)) {
        keep.add(entry.file);
        daily.add(key);
      }
      return;
    }

    if (ageDays <= 30) {
      const key = weekBucket(entry.createdAt);
      if (!weekly.has(key)) {
        keep.add(entry.file);
        weekly.add(key);
      }
      return;
    }

    const key = monthBucket(entry.createdAt);
    if (!monthly.has(key)) {
      keep.add(entry.file);
      monthly.add(key);
    }
  });

  return keep;
}

function parseAutomaticBackupTimestamp(file) {
  const match = /^quote-data-auto-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})\.sqlite$/i.exec(file);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millisecond] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function hourBucket(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
}

function dayBucket(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function weekBucket(date) {
  const weekStart = startOfLocalWeek(date);
  return dayBucket(weekStart);
}

function monthBucket(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function startOfLocalWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function quoteSqliteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatBackupTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
    + ms
  ].join("");
}

/**
 * @returns {PortableState}
 */
function loadPortableState() {
  const data = {
    versions: loadPriceVersions(),
    categories: loadPriceCategories(),
    materialKinds: loadMaterialKinds(),
    materials: loadMaterials(),
    templates: loadTemplates(),
    packages: loadPackages(),
    customers: db.prepare("SELECT id, name, contact, phone, address FROM customers ORDER BY rowid").all(),
    quotes: loadQuotes(),
    ...loadPersistedUiState()
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
      labor_items.id,
      labor_items.sort_order AS sortOrder,
      labor_items.name, unit, family, aliases, material, waste_rate AS wasteRate, auxiliary, labor,
      labor_items.category_id AS categoryId,
      COALESCE(labor_categories.name, labor_items.category, '') AS category,
      labor_items.description AS description,
      cost_material AS costMaterial, cost_waste_rate AS costWasteRate,
      cost_auxiliary AS costAuxiliary, cost_labor AS costLabor,
      unit_price AS unitPrice, cost_unit_price AS costUnitPrice,
      quantity_formula AS quantityFormula,
      quantity_round_down AS quantityRoundDown,
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

/**
 * @returns {SqliteMaterial[]}
 */
function loadMaterials() {
  return db.prepare(`
    SELECT
      id, sort_order AS sortOrder, name, material_kind_id AS materialKindId, category, spec, unit,
      COALESCE(NULLIF(primary_category, ''), category, '') AS primaryCategory,
      secondary_category AS secondaryCategory,
      cost_unit_price AS costUnitPrice,
      COALESCE(NULLIF(quote_unit_price, 0), unit_price, 0) AS quoteUnitPrice,
      unit_price AS unitPrice,
      conversion_unit AS conversionUnit,
      conversion_quantity AS conversionQuantity,
      calc_cost_area AS calcCostArea,
      calc_cost_price AS calcCostPrice,
      calc_quote_area AS calcQuoteArea,
      calc_quote_price AS calcQuotePrice,
      brand, supplier, pricing_formula AS pricingFormula, note
    FROM materials
    ORDER BY sort_order, rowid
  `).all();
}

/**
 * @returns {SqliteMaterialKind[]}
 */
function loadMaterialKinds() {
  return db.prepare(`
    SELECT
      id,
      sort_order AS sortOrder,
      name,
      library_category AS libraryCategory,
      primary_category AS primaryCategory,
      unit,
      cost_unit_price AS costUnitPrice,
      quote_unit_price AS quoteUnitPrice,
      calc_cost_area AS calcCostArea,
      calc_cost_price AS calcCostPrice,
      calc_quote_area AS calcQuoteArea,
      calc_quote_price AS calcQuotePrice,
      '' AS matchGroup,
      note
    FROM material_kinds
    ORDER BY sort_order, rowid
  `).all();
}

function loadTemplates() {
  const templates = db.prepare(`
    SELECT id, name, icon_key AS iconKey, sort_order AS sortOrder, collapsed, library_order_applied AS libraryOrderApplied
    FROM project_group_templates
    ORDER BY sort_order, rowid
  `).all();
  const items = db.prepare(`
    SELECT
      id, sort_order AS sortOrder, item_type AS sourceType,
      item_name AS itemName, display_name AS displayName, material_kind_id AS materialKindId, material_id AS materialId, material_category AS materialCategory,
      area, quantity
    FROM project_group_template_items
    WHERE template_id = ?
    ORDER BY sort_order, rowid
  `);
  return templates.map((template) => ({ ...template, items: items.all(template.id) }));
}

function loadPackages() {
  const packages = db.prepare(`
    SELECT
      id, name, unit,
      quote_unit_price AS quoteUnitPrice,
      cost_target_rate AS costTargetRate,
      quantity_formula AS quantityFormula,
      description, exclusion_note AS exclusionNote,
      sort_order AS sortOrder, collapsed
    FROM packages
    ORDER BY sort_order, rowid
  `).all();
  const sections = db.prepare(`
    SELECT id, name, sort_order AS sortOrder, collapsed
    FROM package_sections
    WHERE package_id = ?
    ORDER BY sort_order, rowid
  `);
  const sectionItems = db.prepare(`
    SELECT
      id,
      source_type AS sourceType,
      name,
      item_name AS itemName,
      material_id AS materialId,
      material_kind_id AS materialKindId,
      material_category AS materialCategory,
      unit,
      provider,
      area,
      description,
      sort_order AS sortOrder
    FROM package_section_items
    WHERE section_id = ?
    ORDER BY sort_order, rowid
  `);
  const estimates = db.prepare(`
    SELECT
      id, name, building_area AS buildingArea, area, perimeter, height,
      quote_unit_price AS quoteUnitPrice, sort_order AS sortOrder, active
    FROM package_estimates
    WHERE package_id = ?
    ORDER BY sort_order, rowid
  `);
  const groups = db.prepare(`
    SELECT
      id,
      package_section_id AS packageSectionId,
      name,
      icon_key AS iconKey,
      count,
      area,
      perimeter,
      height,
      collapsed,
      sort_order AS sortOrder
    FROM package_estimate_groups
    WHERE estimate_id = ?
    ORDER BY sort_order, rowid
  `);
  const estimateItems = db.prepare(`
    SELECT
      id, group_id AS groupId, package_section_item_id AS packageSectionItemId,
      sort_order AS sortOrder, item_type AS sourceType,
      labor_item_name AS itemName, material_id AS materialId, material_category AS materialCategory,
      material_kind_id AS materialKindId,
      area, quantity, included_type AS includedType
    FROM package_estimate_items
    WHERE estimate_id = ?
    ORDER BY sort_order, rowid
  `);

  return packages.map((entry) => {
    const packageSections = sections.all(entry.id).map((section) => ({
      ...section,
      items: sectionItems.all(section.id)
    }));
    const packageEstimates = estimates.all(entry.id).map((estimate) => ({
      ...estimate,
      groups: groups.all(estimate.id),
      items: estimateItems.all(estimate.id)
    }));
    return { ...entry, sections: packageSections, estimates: packageEstimates };
  });
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
    SELECT id, name, type, work_type AS workType, icon_key AS iconKey, template_id AS templateId, package_id AS packageId, area, perimeter, height, building_area AS buildingArea, collapsed, sort_order AS sortOrder
    FROM quote_project_groups
    WHERE quote_id = ?
    ORDER BY sort_order
  `);
  const lines = db.prepare(`
    SELECT
      id, project_group_id AS spaceId, engineering_name AS engineeringName, labor_item_name AS priceItemName,
      item_type AS sourceType,
      material_id AS materialId,
      material_kind_id AS materialKindId,
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
      DELETE FROM package_estimate_items;
      DELETE FROM package_estimate_groups;
      DELETE FROM package_estimates;
      DELETE FROM package_section_items;
      DELETE FROM package_sections;
      DELETE FROM packages;
      DELETE FROM labor_items;
      DELETE FROM labor_categories;
      DELETE FROM price_versions;
      DELETE FROM app_state;
    `);
    savePersistedUiState(data);
    insertPriceCategories(categories);
    insertPriceVersions(data.versions, categories);
    if (!hasRows("material_kinds")) insertMaterialKinds(data.materialKinds || []);
    if (!hasRows("materials")) insertMaterials(data.materials || []);
    insertTemplates(data.templates || []);
    insertPackages(data.packages || []);
    insertCustomers(data.customers);
    insertQuotes(data.quotes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hasRows(tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count > 0;
}

function insertPriceCategories(categories) {
  const insertCategory = db.prepare("INSERT OR IGNORE INTO labor_categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)");
  const seen = new Set();
  categories.forEach((category, index) => {
    const name = String(category?.name || "").trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
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
      id, version_id, sort_order, name, unit, family, aliases, category, category_id, description, material, auxiliary, waste_rate, labor,
      cost_material, cost_auxiliary, cost_waste_rate, cost_labor, unit_price, cost_unit_price, quantity_formula,
      quantity_round_down, uses_material, material_category, material_subcategory, default_material_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const uniqueCategories = [];
  const seenCategoryNames = new Set();
  (categories || []).forEach((category) => {
    const name = String(category?.name || "").trim();
    if (!name || seenCategoryNames.has(name)) return;
    seenCategoryNames.add(name);
    uniqueCategories.push(category);
  });
  const categoryById = new Map(uniqueCategories.map((category) => [category.id, category.name]));
  const categoryByName = new Map(uniqueCategories.map((category) => [String(category.name || "").trim(), category.id]));
  const validCategoryIds = new Set(uniqueCategories.map((category) => category.id));
  versions.forEach((version) => {
    insertVersion.run(version.id, version.name || "未命名价格版本", version.createdAt || "");
    (version.items || []).forEach((item, index) => {
      const categoryName = String(item.category || "").trim();
      const categoryId = validCategoryIds.has(item.categoryId)
        ? item.categoryId
        : (categoryName ? categoryByName.get(categoryName) : "") || null;
      insertItem.run(
        item.id || makeId("labor"),
        version.id,
        Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        item.name || "",
        item.unit || "",
        normalizedText(item.family),
        JSON.stringify(Array.isArray(item.aliases) ? item.aliases : []),
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
        item.quantityRoundDown ? 1 : 0,
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
      id, sort_order, name, material_kind_id, category, primary_category, secondary_category, spec, unit,
      cost_unit_price, unit_price, quote_unit_price, conversion_unit, conversion_quantity,
      calc_cost_area, calc_cost_price, calc_quote_area, calc_quote_price,
      brand, supplier, pricing_formula, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (materials || []).forEach((material, index) => {
    const name = normalizedText(material?.name);
    if (!name) return;
    const primaryCategory = normalizedText(material?.primaryCategory || material?.category);
    const quoteUnitPrice = material?.quoteUnitPrice ?? material?.unitPrice;
    insertMaterial.run(
      material.id || makeId("material"),
      normalizedSortOrder(material, index),
      name,
      normalizedText(material?.materialKindId),
      primaryCategory,
      primaryCategory,
      normalizedText(material?.secondaryCategory),
      normalizedText(material?.spec),
      normalizedText(material?.unit),
      toNumber(material?.costUnitPrice),
      toNumber(quoteUnitPrice),
      toNumber(quoteUnitPrice),
      normalizedText(material?.conversionUnit),
      toNumber(material?.conversionQuantity),
      toNumber(material?.calcCostArea),
      toNumber(material?.calcCostPrice),
      toNumber(material?.calcQuoteArea),
      toNumber(material?.calcQuotePrice),
      normalizedText(material?.brand),
      normalizedText(material?.supplier),
      normalizedText(material?.pricingFormula),
      normalizedText(material?.note)
    );
  });
}

function insertMaterialKinds(kinds) {
  const insertKind = db.prepare(`
    INSERT INTO material_kinds (
      id, sort_order, name, library_category, primary_category, unit, cost_unit_price, quote_unit_price,
      calc_cost_area, calc_cost_price, calc_quote_area, calc_quote_price, match_group, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (kinds || []).forEach((kind, index) => {
    const name = normalizedText(kind?.name);
    if (!name) return;
    insertKind.run(
      kind.id || makeId("material-kind"),
      normalizedSortOrder(kind, index),
      name,
      normalizedText(kind?.libraryCategory || kind?.managementCategory || kind?.library_category || kind?.primaryCategory || kind?.category || "未分类"),
      normalizedText(kind?.primaryCategory || kind?.category),
      normalizedText(kind?.unit),
      toNumber(kind?.costUnitPrice),
      toNumber(kind?.quoteUnitPrice ?? kind?.unitPrice),
      toNumber(kind?.calcCostArea),
      toNumber(kind?.calcCostPrice),
      toNumber(kind?.calcQuoteArea),
      toNumber(kind?.calcQuotePrice),
      "",
      normalizedText(kind?.note)
    );
  });
}

function insertTemplates(templates) {
  const insertTemplate = db.prepare(`
    INSERT INTO project_group_templates (id, name, icon_key, sort_order, collapsed, library_order_applied)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO project_group_template_items (
      id, template_id, sort_order, item_type, item_name, display_name, material_kind_id, material_id, material_category, area, quantity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (templates || []).forEach((template, index) => {
    const name = normalizedText(template?.name);
    if (!name) return;
    const templateId = template.id || makeId("template");
    insertTemplate.run(
      templateId,
      name,
      normalizedText(template?.iconKey),
      normalizedSortOrder(template, index),
      sqliteBoolean(template?.collapsed),
      sqliteBoolean(template?.libraryOrderApplied !== false)
    );
    (template.items || []).forEach((item, itemIndex) => {
      const sourceType = item?.sourceType === "material" ? "material" : "labor";
      insertItem.run(
        item.id || makeId("template-item"),
        templateId,
        normalizedSortOrder(item, itemIndex),
        sourceType,
        normalizedText(item?.itemName),
        normalizedText(item?.displayName),
        normalizedText(item?.materialKindId),
        normalizedText(item?.materialId),
        normalizedText(item?.materialCategory),
        normalizedText(item?.area),
        toNumber(item?.quantity)
      );
    });
  });
}

function insertPackages(packages) {
  const insertPackage = db.prepare(`
    INSERT INTO packages (
      id, name, unit, quote_unit_price, cost_target_rate, quantity_formula,
      description, exclusion_note, sort_order, collapsed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSection = db.prepare(`
    INSERT INTO package_sections (id, package_id, name, sort_order, collapsed)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSectionItem = db.prepare(`
    INSERT INTO package_section_items (
      id, section_id, sort_order, source_type, name, item_name, material_kind_id, material_id,
      material_category, unit, provider, area, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEstimate = db.prepare(`
    INSERT INTO package_estimates (
      id, package_id, name, building_area, area, perimeter, height, quote_unit_price, sort_order, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertGroup = db.prepare(`
    INSERT INTO package_estimate_groups (
      id, estimate_id, package_section_id, name, icon_key, count, area, perimeter, height, collapsed, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEstimateItem = db.prepare(`
    INSERT INTO package_estimate_items (
      id, estimate_id, group_id, package_section_item_id, sort_order, item_type, labor_item_name, material_kind_id, material_id,
      material_category, area, quantity, included_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  (packages || []).forEach((entry, index) => {
    const name = normalizedText(entry?.name);
    if (!name) return;
    const packageId = entry.id || makeId("package");
    insertPackage.run(
      packageId,
      name,
      String(entry?.unit || "平米").trim(),
      toNumber(entry?.quoteUnitPrice),
      toNumber(entry?.costTargetRate),
      normalizedText(entry?.quantityFormula || "q=buildingArea"),
      normalizedText(entry?.description),
      normalizedText(entry?.exclusionNote),
      normalizedSortOrder(entry, index),
      sqliteBoolean(entry?.collapsed)
    );

    (entry.sections || []).forEach((section, sectionIndex) => {
      const sectionName = normalizedText(section?.name);
      if (!sectionName) return;
      const sectionId = section.id || makeId("package-section");
      insertSection.run(
        sectionId,
        packageId,
        sectionName,
        normalizedSortOrder(section, sectionIndex),
        sqliteBoolean(section?.collapsed)
      );
      (section.items || []).forEach((item, itemIndex) => {
        insertSectionItem.run(
          item?.id || makeId("package-section-item"),
          sectionId,
          normalizedSortOrder(item, itemIndex),
          item?.sourceType === "material" ? "material" : "labor",
          normalizedText(item?.name),
          normalizedText(item?.itemName || item?.name),
          normalizedText(item?.materialKindId),
          normalizedText(item?.materialId),
          normalizedText(item?.materialCategory),
          normalizedText(item?.unit),
          normalizedText(item?.provider || item?.area),
          normalizedText(item?.area || item?.provider),
          normalizedText(item?.description)
        );
      });
    });

    (entry.estimates || []).forEach((estimate, estimateIndex) => {
      const estimateName = normalizedText(estimate?.name);
      if (!estimateName) return;
      const estimateId = estimate.id || makeId("package-estimate");
      insertEstimate.run(
        estimateId,
        packageId,
        estimateName,
        toNumber(estimate?.buildingArea),
        toNumber(estimate?.area),
        toNumber(estimate?.perimeter),
        toNumber(estimate?.height),
        toNumber(estimate?.quoteUnitPrice ?? entry?.quoteUnitPrice),
        normalizedSortOrder(estimate, estimateIndex),
        sqliteBoolean(estimate?.active)
      );
      (estimate.groups || []).forEach((group, groupIndex) => {
        insertGroup.run(
          group?.id || makeId("package-group"),
          estimateId,
          normalizedText(group?.packageSectionId),
          normalizedText(group?.name || "测算组合"),
          normalizedText(group?.iconKey),
          toNumber(group?.count ?? 1),
          toNumber(group?.area),
          toNumber(group?.perimeter),
          toNumber(group?.height),
          sqliteBoolean(group?.collapsed),
          normalizedSortOrder(group, groupIndex)
        );
      });
      (estimate.items || []).forEach((item, itemIndex) => {
        const sourceType = item?.sourceType === "material" || item?.itemType === "material" ? "material" : "labor";
        insertEstimateItem.run(
          item?.id || makeId("package-item"),
          estimateId,
          normalizedText(item?.groupId) || null,
          normalizedText(item?.packageSectionItemId),
          normalizedSortOrder(item, itemIndex),
          sourceType,
          normalizedText(item?.itemName),
          normalizedText(item?.materialKindId),
          normalizedText(item?.materialId),
          normalizedText(item?.materialCategory),
          normalizedText(item?.area),
          toNumber(item?.quantity),
          normalizedText(item?.includedType || "included")
        );
      });
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
      material_kind_id, material_id, material_category, material, auxiliary, waste_rate, labor, legacy_unit_price, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSpace = db.prepare(`
    INSERT INTO quote_project_groups (
      id, quote_id, sort_order, name, type, work_type, icon_key, template_id, package_id, area, perimeter, height, building_area, collapsed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  quotes.forEach((quote) => {
    insertQuote.run(
      quote.id,
      quote.customerId,
      quote.name || quote.projectName || "未命名报价",
      normalizedText(quote.projectName),
      normalizedText(quote.clientName),
      normalizedText(quote.clientPhone),
      normalizedText(quote.clientAddress),
      normalizedText(quote.quoteDate),
      normalizedText(quote.priceVersionId),
      toNumber(quote.managementRate),
      toNumber(quote.designRate),
      toNumber(quote.taxRate),
      sqliteBoolean(quote.showAmountColumns !== false)
    );
    (quote.spaces || []).forEach((space, index) => {
      insertSpace.run(
        space.id,
        quote.id,
        normalizedSortOrder(space, index),
        space.name || "全屋",
        space.type === "package" ? "package" : (space.type === "overall" ? "overall" : "space"),
        space.workType === "material" ? "material" : "labor",
        normalizedText(space.iconKey),
        normalizedText(space.templateId),
        normalizedText(space.packageId),
        toNumber(space.area),
        toNumber(space.perimeter),
        toNumber(space.height),
        toNumber(space.buildingArea),
        sqliteBoolean(space.collapsed)
      );
    });
    (quote.lines || []).forEach((line, index) => {
      insertLine.run(
        line.id,
        quote.id,
        normalizedText(line.spaceId) || null,
        index,
        normalizedText(line.engineeringName || line.itemName || line.priceItemName),
        normalizedText(line.priceItemName || line.itemName),
        line.sourceType === "material" || line.materialId ? "material" : "labor",
        normalizedText(line.area),
        toNumber(line.quantity),
        normalizedText(line.materialKindId),
        normalizedText(line.materialId),
        normalizedText(line.materialCategory),
        toNumber(line.material),
        toNumber(line.auxiliary),
        toNumber(line.wasteRate),
        toNumber(line.labor),
        line.legacyUnitPrice ?? line.customPrice ?? null,
        normalizedText(line.note)
      );
    });
  });
}

function loadPersistedUiState() {
  return Object.fromEntries(APP_STATE_FIELDS.map(([key, defaultValue, loadValue]) => {
    const value = getAppState(key);
    return [key, loadValue ? loadValue(value) : (value || defaultValue)];
  }));
}

function savePersistedUiState(data) {
  APP_STATE_FIELDS.forEach(([key, defaultValue, , saveValue]) => {
    const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
    setAppState(key, saveValue ? saveValue(value) : value);
  });
}

function getAppState(key) {
  return db.prepare("SELECT value FROM app_state WHERE key = ?").get(key)?.value;
}

function setAppState(key, value) {
  db.prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
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
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0"
    });
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

function normalizedText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizedSortOrder(item, index) {
  return Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index;
}

function sqliteBoolean(value) {
  return value ? 1 : 0;
}

function makeId(prefix) {
  return `${prefix}-${uuidV7()}`;
}

function uuidV7() {
  const bytes = randomBytes(16);
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
