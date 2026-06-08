import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { selectAutomaticBackupsToKeep } from "../server.js";

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

async function startTestServer() {
  const port = await getFreePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "quote-node-service-test-"));
  const output = { stdout: "", stderr: "" };
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      QUOTE_DATA_DIR: dataDir,
      BACKUP_INTERVAL_MINUTES: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  child.stderr.on("data", (chunk) => { output.stderr += chunk; });
  child.stdout.on("data", (chunk) => { output.stdout += chunk; });
  await waitForServer(baseUrl, child, output);
  return { baseUrl, dataDir, child, output };
}

async function stopTestServer(fixture) {
  if (!fixture) return;
  if (fixture.child.exitCode === null && !fixture.child.killed) {
    fixture.child.kill();
    await new Promise((resolve) => fixture.child.once("exit", resolve));
  }
  await rm(fixture.dataDir, { recursive: true, force: true });
}

async function waitForServer(baseUrl, child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with ${child.exitCode}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`);
    }
    try {
      await fetch(`${baseUrl}/api/data`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  throw new Error(`server did not start in time\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`);
}

function portableState(overrides = {}) {
  const customerId = "customer-test";
  const quoteId = "quote-test";
  const groupId = "group-test";
  return {
    app: "quote-tool",
    version: 4,
    data: {
      versions: [{
        id: "version-test",
        name: "测试工费版本",
        createdAt: "2026-06-08",
        items: [{
          id: "labor-test",
          name: "测试工费/平米",
          unit: "平米",
          category: "测试分类",
          description: "测试说明",
          auxiliary: 2,
          labor: 3,
          costAuxiliary: 1,
          costLabor: 2,
          quantityFormula: "q=s"
        }]
      }],
      categories: [{ id: "category-test", name: "测试分类", description: "分类说明", sortOrder: 0 }],
      materials: [{
        id: "material-test",
        name: "测试主材",
        primaryCategory: "砖",
        unit: "块",
        quoteUnitPrice: 45,
        costUnitPrice: 42
      }],
      templates: [],
      packages: [],
      customers: [{ id: customerId, name: "测试客户", contact: "张三", phone: "13800000000", address: "测试地址" }],
      quotes: [{
        id: quoteId,
        customerId,
        name: "测试案例",
        projectName: "测试工程",
        clientName: "测试客户",
        clientPhone: "13800000000",
        clientAddress: "测试地址",
        quoteDate: "2026-06-08",
        priceVersionId: "version-test",
        managementRate: 8,
        designRate: 6,
        taxRate: 9,
        showAmountColumns: true,
        spaces: [{ id: groupId, name: "测试组合", area: 12, perimeter: 14, height: 2.7, sortOrder: 0 }],
        lines: [{
          id: "line-test",
          spaceId: groupId,
          sourceType: "labor",
          engineeringName: "测试工费/平米",
          priceItemName: "测试工费/平米",
          area: "墙面",
          quantity: 12,
          auxiliary: 2,
          labor: 3
        }]
      }],
      activeVersionId: "version-test",
      activeCustomerId: customerId,
      activeQuoteId: quoteId,
      activePage: "manager",
      ...overrides
    }
  };
}

function damagedPortableState() {
  const state = portableState();
  state.data.versions = [{
    id: "version-damaged",
    name: "??",
    items: Array.from({ length: 25 }, (_, index) => ({
      id: `labor-damaged-${index}`,
      name: `??-${index}`,
      unit: "??",
      category: "??",
      description: "??"
    }))
  }];
  return state;
}

function addRoundtripCollections(state) {
  state.data.templates = [{
    id: "template-test",
    name: "template test",
    iconKey: "home",
    sortOrder: 0,
    collapsed: false,
    items: [
      { id: "template-item-labor", sourceType: "labor", itemName: "labor test/m2", area: "A", quantity: 10, sortOrder: 0 },
      { id: "template-item-material", sourceType: "material", materialId: "material-test", materialCategory: "tile", area: "B", quantity: 3, sortOrder: 1 }
    ]
  }];
  state.data.packages = [{
    id: "package-test",
    name: "package test",
    unit: "m2",
    quoteUnitPrice: 400,
    quantityFormula: "q=buildingArea",
    description: "package description",
    exclusionNote: "package exclusion",
    sortOrder: 0,
    sections: [{
      id: "package-section-test",
      name: "base section",
      sortOrder: 0,
      collapsed: true,
      items: [{ id: "package-section-item-test", name: "base item", provider: "brand", description: "craft", sortOrder: 0 }]
    }],
    estimates: [{
      id: "package-estimate-test",
      name: "143m2 estimate",
      buildingArea: 143,
      area: 90,
      perimeter: 40,
      height: 2.7,
      quoteUnitPrice: 400,
      active: true,
      sortOrder: 0,
      groups: [{ id: "package-group-test", name: "living room", area: 20, perimeter: 18, height: 2.7, sortOrder: 0 }],
      items: [
        { id: "package-item-labor", groupId: "package-group-test", sourceType: "labor", itemName: "labor test/m2", quantity: 20, includedType: "included", sortOrder: 0 },
        { id: "package-item-material", groupId: "package-group-test", sourceType: "material", materialId: "material-test", materialCategory: "tile", quantity: 4, includedType: "upgrade", sortOrder: 1 }
      ]
    }]
  }];
  state.data.activePage = "packages";
  state.data.activePackageId = "package-test";
  state.data.activePackageEstimateId = "package-estimate-test";
  state.data.activePackageTab = "estimate";
  state.data.categoryLibraryCollapsed = false;
  return state;
}

function backupEntry(file, createdAt) {
  return { file, createdAt: new Date(createdAt) };
}

function inspectSqliteDatabase(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, "quote-data.sqlite"));
  try {
    const tableNames = [
      "price_versions",
      "labor_categories",
      "labor_items",
      "materials",
      "project_group_templates",
      "project_group_template_items",
      "packages",
      "package_sections",
      "package_section_items",
      "package_estimates",
      "package_estimate_groups",
      "package_estimate_items",
      "customers",
      "quotes",
      "quote_project_groups",
      "quote_items"
    ];
    const counts = Object.fromEntries(tableNames.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ]));
    const appStateRows = db.prepare("SELECT key, value FROM app_state ORDER BY key").all();
    const quote = db.prepare("SELECT project_name AS projectName, show_amount_columns AS showAmountColumns FROM quotes WHERE id = ?").get("quote-test");
    const group = db.prepare("SELECT name, area, perimeter, height FROM quote_project_groups WHERE id = ?").get("group-test");
    const line = db.prepare("SELECT engineering_name AS engineeringName, item_type AS sourceType, quantity, auxiliary, labor FROM quote_items WHERE id = ?").get("line-test");
    const laborItem = db.prepare("SELECT name, unit, category_id AS categoryId, quantity_formula AS quantityFormula FROM labor_items WHERE id = ?").get("labor-test");
    const material = db.prepare("SELECT name, primary_category AS primaryCategory, quote_unit_price AS quoteUnitPrice FROM materials WHERE id = ?").get("material-test");
    const packageSection = db.prepare("SELECT name, collapsed FROM package_sections WHERE id = ?").get("package-section-test");
    return { counts, appStateRows, quote, group, line, laborItem, material, packageSection };
  } finally {
    db.close();
  }
}

test("automatic backup retention keeps the newest backup in each aging bucket", () => {
  const now = new Date(2026, 5, 8, 12, 0, 0, 0);
  const backups = [
    backupEntry("recent-10m.sqlite", new Date(2026, 5, 8, 11, 50)),
    backupEntry("recent-55m.sqlite", new Date(2026, 5, 8, 11, 5)),
    backupEntry("hourly-two-a.sqlite", new Date(2026, 5, 8, 9, 55)),
    backupEntry("hourly-two-b.sqlite", new Date(2026, 5, 8, 9, 40)),
    backupEntry("hourly-two-c.sqlite", new Date(2026, 5, 8, 9, 20)),
    backupEntry("hourly-one-a.sqlite", new Date(2026, 5, 7, 22, 50)),
    backupEntry("hourly-one-b.sqlite", new Date(2026, 5, 7, 22, 20)),
    backupEntry("daily-a.sqlite", new Date(2026, 5, 6, 18, 0)),
    backupEntry("daily-b.sqlite", new Date(2026, 5, 6, 9, 0)),
    backupEntry("weekly-a.sqlite", new Date(2026, 4, 26, 18, 0)),
    backupEntry("weekly-b.sqlite", new Date(2026, 4, 25, 9, 0)),
    backupEntry("monthly-a.sqlite", new Date(2026, 3, 20, 12, 0)),
    backupEntry("monthly-b.sqlite", new Date(2026, 3, 2, 12, 0))
  ];

  const keep = selectAutomaticBackupsToKeep(backups, now);

  assert.equal(keep.has("recent-10m.sqlite"), true);
  assert.equal(keep.has("recent-55m.sqlite"), true);
  assert.equal(keep.has("hourly-two-a.sqlite"), true);
  assert.equal(keep.has("hourly-two-b.sqlite"), true);
  assert.equal(keep.has("hourly-two-c.sqlite"), false);
  assert.equal(keep.has("hourly-one-a.sqlite"), true);
  assert.equal(keep.has("hourly-one-b.sqlite"), false);
  assert.equal(keep.has("daily-a.sqlite"), true);
  assert.equal(keep.has("daily-b.sqlite"), false);
  assert.equal(keep.has("weekly-a.sqlite"), true);
  assert.equal(keep.has("weekly-b.sqlite"), false);
  assert.equal(keep.has("monthly-a.sqlite"), true);
  assert.equal(keep.has("monthly-b.sqlite"), false);
});

test("backend API uses an isolated SQLite database", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const emptyResponse = await fetch(`${fixture.baseUrl}/api/data`);
  assert.equal(emptyResponse.status, 409);

  const savedState = addRoundtripCollections(portableState());
  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(savedState)
  });
  assert.equal(saveResponse.status, 200);
  const savePayload = await saveResponse.json();
  assert.equal(savePayload.ok, true);
  assert.match(savePayload.path, /quote-data\.sqlite$/);
  assert.equal(savePayload.path.includes(fixture.dataDir), true);

  const dataResponse = await fetch(`${fixture.baseUrl}/api/data`);
  assert.equal(dataResponse.status, 200);
  const payload = await dataResponse.json();
  assert.equal(payload.data.versions[0].name, "测试工费版本");
  assert.equal(payload.data.quotes[0].projectName, "测试工程");
  assert.equal(payload.data.quotes[0].lines[0].area, "墙面");
  assert.equal(payload.data.materials[0].quoteUnitPrice, 45);
  assert.equal(payload.data.templates[0].name, "template test");
  assert.equal(payload.data.templates[0].items[1].sourceType, "material");
  assert.equal(payload.data.packages[0].sections[0].collapsed, 1);
  assert.equal(payload.data.packages[0].sections[0].items[0].description, "craft");
  assert.equal(payload.data.packages[0].estimates[0].groups[0].name, "living room");
  assert.equal(payload.data.packages[0].estimates[0].items[1].includedType, "upgrade");
  assert.equal(payload.data.activePage, "packages");
  assert.equal(payload.data.activePackageId, "package-test");
  assert.equal(payload.data.activePackageEstimateId, "package-estimate-test");
  assert.equal(payload.data.activePackageTab, "estimate");
  assert.equal(payload.data.categoryLibraryCollapsed, false);

  const inspected = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(inspected.counts.price_versions, 1);
  assert.equal(inspected.counts.labor_categories, 1);
  assert.equal(inspected.counts.labor_items, 1);
  assert.equal(inspected.counts.materials, 1);
  assert.equal(inspected.counts.project_group_templates, 1);
  assert.equal(inspected.counts.project_group_template_items, 2);
  assert.equal(inspected.counts.packages, 1);
  assert.equal(inspected.counts.package_sections, 1);
  assert.equal(inspected.counts.package_section_items, 1);
  assert.equal(inspected.counts.package_estimates, 1);
  assert.equal(inspected.counts.package_estimate_groups, 1);
  assert.equal(inspected.counts.package_estimate_items, 2);
  assert.equal(inspected.counts.customers, 1);
  assert.equal(inspected.counts.quotes, 1);
  assert.equal(inspected.counts.quote_project_groups, 1);
  assert.equal(inspected.counts.quote_items, 1);
  assert.equal(inspected.quote.projectName, "测试工程");
  assert.equal(inspected.quote.showAmountColumns, 1);
  assert.equal(inspected.group.name, "测试组合");
  assert.equal(inspected.group.height, 2.7);
  assert.equal(inspected.line.engineeringName, "测试工费/平米");
  assert.equal(inspected.line.sourceType, "labor");
  assert.equal(inspected.line.quantity, 12);
  assert.equal(inspected.line.auxiliary, 2);
  assert.equal(inspected.line.labor, 3);
  assert.equal(inspected.laborItem.name, "测试工费/平米");
  assert.equal(inspected.laborItem.unit, "平米");
  assert.equal(inspected.laborItem.quantityFormula, "q=s");
  assert.equal(inspected.material.name, "测试主材");
  assert.equal(inspected.material.primaryCategory, "砖");
  assert.equal(inspected.material.quoteUnitPrice, 45);
  assert.equal(inspected.packageSection.name, "base section");
  assert.equal(inspected.packageSection.collapsed, 1);
  assert.equal(new Map(inspected.appStateRows.map((row) => [row.key, row.value])).get("activePage"), "packages");
  assert.equal(new Map(inspected.appStateRows.map((row) => [row.key, row.value])).get("categoryLibraryCollapsed"), "false");

  const backupResponse = await fetch(`${fixture.baseUrl}/api/backup`, { method: "POST" });
  assert.equal(backupResponse.status, 200);
  const backupPayload = await backupResponse.json();
  assert.equal(backupPayload.ok, true);
  assert.equal(backupPayload.path.includes(fixture.dataDir), true);
  assert.equal(existsSync(backupPayload.path), true);

  const damagedResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(damagedPortableState())
  });
  assert.equal(damagedResponse.status, 400);

  const afterDamageResponse = await fetch(`${fixture.baseUrl}/api/data`);
  const afterDamagePayload = await afterDamageResponse.json();
  assert.equal(afterDamagePayload.data.versions[0].name, "测试工费版本");

  const invalidJsonResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: "{"
  });
  assert.equal(invalidJsonResponse.status, 400);

  const invalidShapeResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: { versions: [], customers: [] } })
  });
  assert.equal(invalidShapeResponse.status, 400);

  const htmlResponse = await fetch(`${fixture.baseUrl}/`);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(html, /quoteLines|app\.js/);

  const missingResponse = await fetch(`${fixture.baseUrl}/missing-file.js`);
  assert.equal(missingResponse.status, 404);
});

test("backend derives labor categories and preserves amount-column visibility", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const state = portableState({
    categories: undefined,
    activePage: "editor"
  });
  state.data.versions[0].items[0].category = "派生分类";
  state.data.versions[0].items[0].categoryId = "";
  state.data.quotes[0].showAmountColumns = false;

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(state)
  });
  assert.equal(saveResponse.status, 200);

  const response = await fetch(`${fixture.baseUrl}/api/data`);
  const payload = await response.json();
  assert.equal(payload.data.categories.length, 1);
  assert.equal(payload.data.categories[0].name, "派生分类");
  assert.equal(payload.data.versions[0].items[0].category, "派生分类");
  assert.equal(payload.data.versions[0].items[0].categoryId, payload.data.categories[0].id);
  assert.equal(payload.data.quotes[0].showAmountColumns, 0);
  assert.equal(payload.data.activePage, "editor");

  const db = new DatabaseSync(path.join(fixture.dataDir, "quote-data.sqlite"));
  try {
    const category = db.prepare("SELECT name FROM labor_categories").get();
    const laborItem = db.prepare("SELECT category, category_id AS categoryId FROM labor_items WHERE id = ?").get("labor-test");
    const quote = db.prepare("SELECT show_amount_columns AS showAmountColumns FROM quotes WHERE id = ?").get("quote-test");
    assert.equal(category.name, "派生分类");
    assert.equal(laborItem.category, "派生分类");
    assert.equal(Boolean(laborItem.categoryId), true);
    assert.equal(quote.showAmountColumns, 0);
  } finally {
    db.close();
  }
});
