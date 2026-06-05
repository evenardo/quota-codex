import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const sqliteFile = path.join(dataDir, "quote-data.sqlite");
const initialPricesFile = path.join(publicDir, "data", "initial-prices.json");
const port = Number(process.env.PORT || 5177);

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
    CREATE TABLE IF NOT EXISTS price_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT,
      category TEXT,
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
      FOREIGN KEY (version_id) REFERENCES price_versions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_price_items_version ON price_items(version_id);
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
      tax_rate REAL DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (price_version_id) REFERENCES price_versions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
    CREATE TABLE IF NOT EXISTS quote_lines (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      engineering_name TEXT,
      price_item_name TEXT,
      area TEXT,
      quantity REAL DEFAULT 0,
      material REAL DEFAULT 0,
      auxiliary REAL DEFAULT 0,
      waste_rate REAL DEFAULT 0,
      labor REAL DEFAULT 0,
      legacy_unit_price REAL,
      note TEXT,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id, sort_order);
  `);
  ensureColumn("quotes", "client_phone", "TEXT");
  ensureColumn("quotes", "client_address", "TEXT");
}

function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
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

function loadPortableState() {
  const data = {
    versions: loadPriceVersions(),
    activeVersionId: getAppState("activeVersionId") || "",
    activePage: getAppState("activePage") || "manager",
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
      name, unit, material, waste_rate AS wasteRate, auxiliary, labor, category, description,
      cost_material AS costMaterial, cost_waste_rate AS costWasteRate,
      cost_auxiliary AS costAuxiliary, cost_labor AS costLabor,
      unit_price AS unitPrice, cost_unit_price AS costUnitPrice
    FROM price_items
    WHERE version_id = ?
    ORDER BY id
  `);
  return versions.map((version) => ({ ...version, items: items.all(version.id) }));
}

function loadQuotes() {
  const quotes = db.prepare(`
    SELECT
      id, customer_id AS customerId, name, project_name AS projectName,
      client_name AS clientName, client_phone AS clientPhone, client_address AS clientAddress,
      quote_date AS quoteDate,
      price_version_id AS priceVersionId,
      management_rate AS managementRate, tax_rate AS taxRate
    FROM quotes
    ORDER BY rowid
  `).all();
  const lines = db.prepare(`
    SELECT
      id, engineering_name AS engineeringName, price_item_name AS priceItemName,
      area, quantity, material, auxiliary, waste_rate AS wasteRate, labor,
      legacy_unit_price AS legacyUnitPrice, note
    FROM quote_lines
    WHERE quote_id = ?
    ORDER BY sort_order
  `);
  return quotes.map((quote) => ({ ...quote, lines: lines.all(quote.id) }));
}

function savePortableState(portable) {
  const data = portable?.data || portable;
  if (!data || !Array.isArray(data.versions) || !Array.isArray(data.customers) || !Array.isArray(data.quotes)) {
    throw new Error("Invalid quote data");
  }

  db.exec("BEGIN");
  try {
    db.exec(`
      DELETE FROM quote_lines;
      DELETE FROM quotes;
      DELETE FROM customers;
      DELETE FROM price_items;
      DELETE FROM price_versions;
      DELETE FROM app_state;
    `);
    setAppState("activeVersionId", data.activeVersionId || "");
    setAppState("activePage", data.activePage || "manager");
    setAppState("activeCustomerId", data.activeCustomerId || "");
    setAppState("activeQuoteId", data.activeQuoteId || "");
    insertPriceVersions(data.versions);
    insertCustomers(data.customers);
    insertQuotes(data.quotes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertPriceVersions(versions) {
  const insertVersion = db.prepare("INSERT INTO price_versions (id, name, created_at) VALUES (?, ?, ?)");
  const insertItem = db.prepare(`
    INSERT INTO price_items (
      version_id, name, unit, category, description, material, auxiliary, waste_rate, labor,
      cost_material, cost_auxiliary, cost_waste_rate, cost_labor, unit_price, cost_unit_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  versions.forEach((version) => {
    insertVersion.run(version.id, version.name || "未命名价格版本", version.createdAt || "");
    (version.items || []).forEach((item) => {
      insertItem.run(
        version.id,
        item.name || "",
        item.unit || "",
        item.category || "",
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
        toNumber(item.costUnitPrice)
      );
    });
  });
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
      price_version_id, management_rate, tax_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLine = db.prepare(`
    INSERT INTO quote_lines (
      id, quote_id, sort_order, engineering_name, price_item_name, area, quantity,
      material, auxiliary, waste_rate, labor, legacy_unit_price, note
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
      toNumber(quote.taxRate)
    );
    (quote.lines || []).forEach((line, index) => {
      insertLine.run(
        line.id,
        quote.id,
        index,
        line.engineeringName || line.itemName || line.priceItemName || "",
        line.priceItemName || line.itemName || "",
        line.area || "",
        toNumber(line.quantity),
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
