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
        name: "娴嬭瘯宸ヨ垂鐗堟湰",
        createdAt: "2026-06-08",
        items: [{
          id: "labor-test",
          name: "娴嬭瘯宸ヨ垂/骞崇背",
          unit: "骞崇背",
          category: "娴嬭瘯鍒嗙被",
          description: "娴嬭瘯璇存槑",
          aliases: ["娴嬭瘯鍒悕/骞崇背"],
          auxiliary: 2,
          labor: 3,
          costAuxiliary: 1,
          costLabor: 2,
          quantityFormula: "q=s"
        }]
      }],
      categories: [{ id: "category-test", name: "娴嬭瘯鍒嗙被", description: "鍒嗙被璇存槑", sortOrder: 0 }],
      materialKinds: [{
        id: "material-kind-tile",
        name: "澧欑爾",
        libraryCategory: "澧欓潰鏉愭枡",
        primaryCategory: "tile",
        unit: "m2",
        costUnitPrice: 56.25,
        quoteUnitPrice: 68.75,
        calcCostArea: 0.32,
        calcCostPrice: 18,
        calcQuoteArea: 0.32,
        calcQuotePrice: 22
      }],
      materials: [{
        id: "material-test",
        name: "娴嬭瘯涓绘潗",
        materialKindId: "material-kind-tile",
        primaryCategory: "tile",
        unit: "m2",
        quoteUnitPrice: 45,
        costUnitPrice: 42,
        calcCostArea: 0.32,
        calcCostPrice: 15,
        calcQuoteArea: 0.32,
        calcQuotePrice: 20
      }],
      templates: [],
      packages: [],
      customers: [{ id: customerId, name: "娴嬭瘯瀹㈡埛", contact: "寮犱笁", phone: "13800000000", address: "娴嬭瘯鍦板潃" }],
      quotes: [{
        id: quoteId,
        customerId,
        name: "娴嬭瘯妗堜緥",
        projectName: "娴嬭瘯宸ョ▼",
        clientName: "娴嬭瘯瀹㈡埛",
        clientPhone: "13800000000",
        clientAddress: "娴嬭瘯鍦板潃",
        quoteDate: "2026-06-08",
        priceVersionId: "version-test",
        managementRate: 8,
        designRate: 6,
        taxRate: 9,
        showAmountColumns: true,
        spaces: [{ id: groupId, name: "娴嬭瘯缁勫悎", area: 12, perimeter: 14, height: 2.7, sortOrder: 0 }],
        lines: [{
          id: "line-test",
          spaceId: groupId,
          sourceType: "labor",
          engineeringName: "娴嬭瘯宸ヨ垂/骞崇背",
          priceItemName: "娴嬭瘯宸ヨ垂/骞崇背",
          area: "澧欓潰",
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
  state.data.genericMaterialCategoryState = {
    "婢ф瑩娼伴弶鎰灐": { collapsed: false, sortOrder: 0 }
  };
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
      "material_kinds",
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
    const priceVersion = db.prepare("SELECT name, created_at AS createdAt FROM price_versions WHERE id = ?").get("version-test");
    const laborCategory = db.prepare("SELECT name, description, sort_order AS sortOrder FROM labor_categories WHERE id = ?").get("category-test");
    const customer = db.prepare("SELECT name, contact, phone, address FROM customers WHERE id = ?").get("customer-test");
    const quote = db.prepare(`
      SELECT
        project_name AS projectName,
        client_name AS clientName,
        management_rate AS managementRate,
        show_amount_columns AS showAmountColumns
      FROM quotes
      WHERE id = ?
    `).get("quote-test");
    const group = db.prepare(`
      SELECT
        name,
        icon_key AS iconKey,
        template_id AS templateId,
        area,
        perimeter,
        height,
        collapsed,
        sort_order AS sortOrder
      FROM quote_project_groups
      WHERE id = ?
    `).get("group-test");
    const line = db.prepare(`
      SELECT
        engineering_name AS engineeringName,
        labor_item_name AS priceItemName,
        item_type AS sourceType,
        area,
        quantity,
        auxiliary,
        labor
      FROM quote_items
      WHERE id = ?
    `).get("line-test");
    const laborItem = db.prepare(`
      SELECT
        name,
        unit,
        aliases,
        category_id AS categoryId,
        description,
        auxiliary,
        labor,
        cost_auxiliary AS costAuxiliary,
        cost_labor AS costLabor,
        quantity_formula AS quantityFormula
      FROM labor_items
      WHERE id = ?
    `).get("labor-test");
    const materialKind = db.prepare(`
      SELECT
        name,
        library_category AS libraryCategory,
        cost_unit_price AS costUnitPrice,
        quote_unit_price AS quoteUnitPrice,
        calc_cost_area AS calcCostArea,
        calc_cost_price AS calcCostPrice,
        calc_quote_area AS calcQuoteArea,
        calc_quote_price AS calcQuotePrice
      FROM material_kinds
      WHERE id = ?
    `).get("material-kind-tile");
    const material = db.prepare(`
      SELECT
        name,
        primary_category AS primaryCategory,
        cost_unit_price AS costUnitPrice,
        quote_unit_price AS quoteUnitPrice,
        calc_cost_area AS calcCostArea,
        calc_cost_price AS calcCostPrice,
        calc_quote_area AS calcQuoteArea,
        calc_quote_price AS calcQuotePrice
      FROM materials
      WHERE id = ?
    `).get("material-test");
    const template = db.prepare(`
      SELECT name, icon_key AS iconKey, collapsed, library_order_applied AS libraryOrderApplied
      FROM project_group_templates
      WHERE id = ?
    `).get("template-test");
    const templateItem = db.prepare(`
      SELECT item_type AS sourceType, item_name AS itemName, material_kind_id AS materialKindId, material_id AS materialId, area, quantity
      FROM project_group_template_items
      WHERE id = ?
    `).get("template-item-labor");
    const packageEntry = db.prepare("SELECT name, unit, quote_unit_price AS quoteUnitPrice, quantity_formula AS quantityFormula FROM packages WHERE id = ?").get("package-test");
    const packageSection = db.prepare("SELECT name, collapsed, sort_order AS sortOrder FROM package_sections WHERE id = ?").get("package-section-test");
    const packageSectionItem = db.prepare(`
      SELECT source_type AS sourceType, name, item_name AS itemName, area, description
      FROM package_section_items
      WHERE id = ?
    `).get("package-section-item-test");
    const packageEstimate = db.prepare(`
      SELECT name, building_area AS buildingArea, quote_unit_price AS quoteUnitPrice, active
      FROM package_estimates
      WHERE id = ?
    `).get("package-estimate-test");
    const packageEstimateGroup = db.prepare(`
      SELECT name, count, area, collapsed
      FROM package_estimate_groups
      WHERE id = ?
    `).get("package-group-test");
    const packageEstimateItem = db.prepare(`
      SELECT item_type AS sourceType, labor_item_name AS itemName, area, quantity, included_type AS includedType
      FROM package_estimate_items
      WHERE id = ?
    `).get("package-item-labor");
    return {
      counts,
      appStateRows,
      priceVersion,
      laborCategory,
      customer,
      quote,
      group,
      line,
      laborItem,
      materialKind,
      material,
      template,
      templateItem,
      packageEntry,
      packageSection,
      packageSectionItem,
      packageEstimate,
      packageEstimateGroup,
      packageEstimateItem
    };
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
  assert.equal(payload.data.versions[0].name, "娴嬭瘯宸ヨ垂鐗堟湰");
  assert.deepEqual(JSON.parse(payload.data.versions[0].items[0].aliases), ["娴嬭瘯鍒悕/骞崇背"]);
  assert.equal(payload.data.quotes[0].projectName, "娴嬭瘯宸ョ▼");
  assert.equal(payload.data.quotes[0].lines[0].area, "澧欓潰");
  assert.equal(payload.data.materialKinds[0].calcCostArea, 0.32);
  assert.equal(payload.data.materialKinds[0].libraryCategory, "澧欓潰鏉愭枡");
  assert.equal(payload.data.materialKinds[0].calcCostPrice, 18);
  assert.equal(payload.data.materialKinds[0].calcQuoteArea, 0.32);
  assert.equal(payload.data.materialKinds[0].calcQuotePrice, 22);
  assert.equal(payload.data.materials[0].quoteUnitPrice, 45);
  assert.equal(payload.data.materials[0].calcCostArea, 0.32);
  assert.equal(payload.data.materials[0].calcCostPrice, 15);
  assert.equal(payload.data.materials[0].calcQuoteArea, 0.32);
  assert.equal(payload.data.materials[0].calcQuotePrice, 20);
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
  assert.deepEqual(payload.data.genericMaterialCategoryState, {
    "婢ф瑩娼伴弶鎰灐": { collapsed: false, sortOrder: 0 }
  });

  const inspected = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(inspected.counts.price_versions, 1);
  assert.equal(inspected.counts.labor_categories, 1);
  assert.equal(inspected.counts.labor_items, 1);
  assert.equal(inspected.counts.material_kinds, 1);
  assert.equal(inspected.materialKind.libraryCategory, "澧欓潰鏉愭枡");
  assert.equal(inspected.counts.materials, 1);
  assert.equal(inspected.counts.project_group_templates, 1);
  assert.equal(inspected.counts.project_group_template_items, 2);
  assert.equal(inspected.counts.packages, 1);
  assert.equal(inspected.materialKind.name, "澧欑爾");
  assert.equal(inspected.materialKind.calcCostArea, 0.32);
  assert.equal(inspected.materialKind.calcCostPrice, 18);
  assert.equal(inspected.materialKind.calcQuoteArea, 0.32);
  assert.equal(inspected.materialKind.calcQuotePrice, 22);
  assert.equal(inspected.material.calcCostArea, 0.32);
  assert.equal(inspected.material.calcCostPrice, 15);
  assert.equal(inspected.material.calcQuoteArea, 0.32);
  assert.equal(inspected.material.calcQuotePrice, 20);
  assert.equal(inspected.counts.package_sections, 1);
  assert.equal(inspected.counts.package_section_items, 1);
  assert.equal(inspected.counts.package_estimates, 1);
  assert.equal(inspected.counts.package_estimate_groups, 1);
  assert.equal(inspected.counts.package_estimate_items, 2);
  assert.equal(inspected.counts.customers, 1);
  assert.equal(inspected.counts.quotes, 1);
  assert.equal(inspected.counts.quote_project_groups, 1);
  assert.equal(inspected.counts.quote_items, 1);
  assert.equal(inspected.quote.projectName, "娴嬭瘯宸ョ▼");
  assert.equal(inspected.quote.showAmountColumns, 1);
  assert.equal(inspected.group.name, "娴嬭瘯缁勫悎");
  assert.equal(inspected.group.height, 2.7);
  assert.equal(inspected.line.engineeringName, "娴嬭瘯宸ヨ垂/骞崇背");
  assert.equal(inspected.line.sourceType, "labor");
  assert.equal(inspected.line.quantity, 12);
  assert.equal(inspected.line.auxiliary, 2);
  assert.equal(inspected.line.labor, 3);
  assert.equal(inspected.laborItem.name, "娴嬭瘯宸ヨ垂/骞崇背");
  assert.equal(inspected.laborItem.unit, "骞崇背");
  assert.equal(inspected.laborItem.quantityFormula, "q=s");
  assert.deepEqual(JSON.parse(inspected.laborItem.aliases), ["娴嬭瘯鍒悕/骞崇背"]);
  assert.equal(inspected.material.name, "娴嬭瘯涓绘潗");
  assert.equal(inspected.material.primaryCategory, "tile");
  assert.equal(inspected.material.quoteUnitPrice, 45);
  assert.equal(inspected.packageSection.name, "base section");
  assert.equal(inspected.packageSection.collapsed, 1);
  assert.equal(new Map(inspected.appStateRows.map((row) => [row.key, row.value])).get("activePage"), "packages");
  assert.equal(new Map(inspected.appStateRows.map((row) => [row.key, row.value])).get("categoryLibraryCollapsed"), "false");
  assert.deepEqual(JSON.parse(new Map(inspected.appStateRows.map((row) => [row.key, row.value])).get("genericMaterialCategoryState")), {
    "婢ф瑩娼伴弶鎰灐": { collapsed: false, sortOrder: 0 }
  });

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
  assert.equal(afterDamagePayload.data.versions[0].name, "娴嬭瘯宸ヨ垂鐗堟湰");

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

test("backend patch APIs update materials without rewriting the whole database", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const kindPatchResponse = await fetch(`${fixture.baseUrl}/api/material-kinds/material-kind-tile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "material-kind-tile",
      name: "kind patched",
      libraryCategory: "tile library",
      primaryCategory: "tile",
      unit: "m2",
      costUnitPrice: 56.25,
      quoteUnitPrice: 68.75,
      calcCostArea: 0.32,
      calcCostPrice: 18,
      calcQuoteArea: 0.32,
      calcQuotePrice: 22,
      sortOrder: 0,
      note: "patched"
    })
  });
  assert.equal(kindPatchResponse.status, 200);

  const materialPatchResponse = await fetch(`${fixture.baseUrl}/api/materials/material-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "material-test",
      name: "material patched",
      materialKindId: "material-kind-tile",
      primaryCategory: "tile",
      unit: "m2",
      costUnitPrice: 40,
      quoteUnitPrice: 60,
      calcCostArea: 0.32,
      calcCostPrice: 12.8,
      calcQuoteArea: 0.32,
      calcQuotePrice: 19.2,
      sortOrder: 0
    })
  });
  assert.equal(materialPatchResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.quotes, before.counts.quotes);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.counts.project_group_template_items, before.counts.project_group_template_items);
  assert.equal(after.materialKind.costUnitPrice, 56.25);
  assert.equal(after.materialKind.quoteUnitPrice, 68.75);
  assert.equal(after.materialKind.calcCostArea, 0.32);
  assert.equal(after.materialKind.calcCostPrice, 18);
  assert.equal(after.material.quoteUnitPrice, 60);
  assert.equal(after.material.costUnitPrice, 40);
});

test("legacy full saves do not overwrite material library patch updates", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const originalState = addRoundtripCollections(portableState());
  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(originalState)
  });
  assert.equal(saveResponse.status, 200);

  const kindPatchResponse = await fetch(`${fixture.baseUrl}/api/material-kinds/material-kind-tile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "material-kind-tile",
      name: "kind patched",
      libraryCategory: "patched library",
      primaryCategory: "tile",
      unit: "m2",
      costUnitPrice: 99,
      quoteUnitPrice: 111,
      calcCostArea: 0.5,
      calcCostPrice: 49.5,
      calcQuoteArea: 0.5,
      calcQuotePrice: 55.5,
      sortOrder: 0
    })
  });
  assert.equal(kindPatchResponse.status, 200);

  const staleFullSaveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(originalState)
  });
  assert.equal(staleFullSaveResponse.status, 200);

  const payload = await (await fetch(`${fixture.baseUrl}/api/data`)).json();
  const materialKind = payload.data.materialKinds.find((kind) => kind.id === "material-kind-tile");
  assert.equal(materialKind.name, "kind patched");
  assert.equal(materialKind.libraryCategory, "patched library");
  assert.equal(materialKind.costUnitPrice, 99);
  assert.equal(materialKind.quoteUnitPrice, 111);
  assert.equal(materialKind.calcCostArea, 0.5);
  assert.equal(materialKind.calcQuotePrice, 55.5);
});

test("backend patch APIs update labor and quote cells without rewriting unrelated rows", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const laborPatchResponse = await fetch(`${fixture.baseUrl}/api/labor-items/labor-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "labor-test",
      versionId: "version-test",
      name: "labor patched/m2",
      unit: "m2",
      categoryId: "category-test",
      description: "labor cell patched",
      aliases: ["labor alias/m2"],
      auxiliary: 7,
      labor: 8,
      costAuxiliary: 4,
      costLabor: 5,
      quantityFormula: "q=s*2",
      sortOrder: 0
    })
  });
  assert.equal(laborPatchResponse.status, 200);

  const quotePatchResponse = await fetch(`${fixture.baseUrl}/api/quote-items/line-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "line-test",
      quoteId: "quote-test",
      spaceId: "group-test",
      sourceType: "labor",
      engineeringName: "quote cell patched",
      priceItemName: "labor patched/m2",
      area: "wall",
      quantity: 18,
      auxiliary: 7,
      labor: 8,
      sortOrder: 0
    })
  });
  assert.equal(quotePatchResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.labor_items, before.counts.labor_items);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.counts.materials, before.counts.materials);
  assert.equal(after.counts.project_group_template_items, before.counts.project_group_template_items);
  assert.equal(after.laborItem.name, "labor patched/m2");
  assert.equal(after.laborItem.description, "labor cell patched");
  assert.equal(after.laborItem.auxiliary, 7);
  assert.equal(after.laborItem.costLabor, 5);
  assert.deepEqual(JSON.parse(after.laborItem.aliases), ["labor alias/m2"]);
  assert.equal(after.line.engineeringName, "quote cell patched");
  assert.equal(after.line.priceItemName, "labor patched/m2");
  assert.equal(after.line.area, "wall");
  assert.equal(after.line.quantity, 18);
  assert.equal(after.line.labor, 8);
});

test("backend patch APIs update quote headers and project groups without rewriting line rows", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const quotePatchResponse = await fetch(`${fixture.baseUrl}/api/quotes/quote-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "quote-test",
      customerId: "customer-test",
      name: "quote patched",
      projectName: "project patched",
      clientName: "client patched",
      clientPhone: "13900000000",
      clientAddress: "address patched",
      quoteDate: "2026-06-10",
      priceVersionId: "version-test",
      managementRate: 12,
      designRate: 6,
      taxRate: 9,
      showAmountColumns: false
    })
  });
  assert.equal(quotePatchResponse.status, 200);

  const groupPatchResponse = await fetch(`${fixture.baseUrl}/api/project-groups/group-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "group-test",
      quoteId: "quote-test",
      name: "group patched",
      iconKey: "kitchen",
      templateId: "template-test",
      area: 22,
      perimeter: 18,
      height: 2.9,
      collapsed: true,
      sortOrder: 0
    })
  });
  assert.equal(groupPatchResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.quotes, before.counts.quotes);
  assert.equal(after.counts.quote_project_groups, before.counts.quote_project_groups);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.counts.labor_items, before.counts.labor_items);
  assert.equal(after.quote.projectName, "project patched");
  assert.equal(after.quote.clientName, "client patched");
  assert.equal(after.quote.managementRate, 12);
  assert.equal(after.quote.showAmountColumns, 0);
  assert.equal(after.group.name, "group patched");
  assert.equal(after.group.iconKey, "kitchen");
  assert.equal(after.group.templateId, "template-test");
  assert.equal(after.group.area, 22);
  assert.equal(after.group.height, 2.9);
  assert.equal(after.group.collapsed, 1);
  assert.equal(after.line.engineeringName, before.line.engineeringName);
  assert.equal(after.line.quantity, before.line.quantity);
});

test("backend patch APIs update templates without rewriting quote rows", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const templatePatchResponse = await fetch(`${fixture.baseUrl}/api/templates/template-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "template-test",
      name: "template patched",
      iconKey: "kitchen",
      collapsed: true,
      libraryOrderApplied: false,
      sortOrder: 0
    })
  });
  assert.equal(templatePatchResponse.status, 200);

  const templateItemPatchResponse = await fetch(`${fixture.baseUrl}/api/template-items/template-item-labor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "template-item-labor",
      templateId: "template-test",
      sourceType: "labor",
      itemName: "labor patched/m2",
      area: "ceiling",
      quantity: 8,
      sortOrder: 0
    })
  });
  assert.equal(templateItemPatchResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.project_group_templates, before.counts.project_group_templates);
  assert.equal(after.counts.project_group_template_items, before.counts.project_group_template_items);
  assert.equal(after.counts.quotes, before.counts.quotes);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.template.name, "template patched");
  assert.equal(after.template.iconKey, "kitchen");
  assert.equal(after.template.collapsed, 1);
  assert.equal(after.template.libraryOrderApplied, 0);
  assert.equal(after.templateItem.itemName, "labor patched/m2");
  assert.equal(after.templateItem.area, "ceiling");
  assert.equal(after.templateItem.quantity, 8);
  assert.equal(after.line.engineeringName, before.line.engineeringName);
});

test("backend patch APIs update customers, versions, and categories independently", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const categoryPatchResponse = await fetch(`${fixture.baseUrl}/api/labor-categories/category-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "category-test",
      name: "category patched",
      description: "category description patched",
      sortOrder: 2
    })
  });
  assert.equal(categoryPatchResponse.status, 200);

  const versionPatchResponse = await fetch(`${fixture.baseUrl}/api/price-versions/version-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "version-test",
      name: "version patched",
      createdAt: "2026-06-10"
    })
  });
  assert.equal(versionPatchResponse.status, 200);

  const customerPatchResponse = await fetch(`${fixture.baseUrl}/api/customers/customer-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "customer-test",
      name: "customer patched",
      contact: "contact patched",
      phone: "13700000000",
      address: "address patched"
    })
  });
  assert.equal(customerPatchResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.labor_categories, before.counts.labor_categories);
  assert.equal(after.counts.price_versions, before.counts.price_versions);
  assert.equal(after.counts.customers, before.counts.customers);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.laborCategory.name, "category patched");
  assert.equal(after.laborCategory.description, "category description patched");
  assert.equal(after.laborCategory.sortOrder, 2);
  assert.equal(after.priceVersion.name, "version patched");
  assert.equal(after.priceVersion.createdAt, "2026-06-10");
  assert.equal(after.customer.name, "customer patched");
  assert.equal(after.customer.contact, "contact patched");
  assert.equal(after.line.engineeringName, before.line.engineeringName);
});

test("backend patch APIs update package entities without rewriting quote rows", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const saveResponse = await fetch(`${fixture.baseUrl}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(addRoundtripCollections(portableState()))
  });
  assert.equal(saveResponse.status, 200);

  const before = inspectSqliteDatabase(fixture.dataDir);
  const packageResponse = await fetch(`${fixture.baseUrl}/api/packages/package-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-test",
      name: "package patched",
      unit: "m2",
      quoteUnitPrice: 460,
      quantityFormula: "q=buildingArea",
      description: "package patched description",
      exclusionNote: "package patched exclusion",
      sortOrder: 0
    })
  });
  assert.equal(packageResponse.status, 200);

  const sectionResponse = await fetch(`${fixture.baseUrl}/api/package-sections/package-section-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-section-test",
      packageId: "package-test",
      name: "section patched",
      collapsed: false,
      sortOrder: 3
    })
  });
  assert.equal(sectionResponse.status, 200);

  const sectionItemResponse = await fetch(`${fixture.baseUrl}/api/package-section-items/package-section-item-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-section-item-test",
      sectionId: "package-section-test",
      sourceType: "labor",
      name: "section item patched",
      itemName: "labor patched/m2",
      area: "wall",
      description: "section item patched description",
      sortOrder: 0
    })
  });
  assert.equal(sectionItemResponse.status, 200);

  const estimateResponse = await fetch(`${fixture.baseUrl}/api/package-estimates/package-estimate-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-estimate-test",
      packageId: "package-test",
      name: "estimate patched",
      buildingArea: 150,
      area: 100,
      perimeter: 50,
      height: 2.8,
      quoteUnitPrice: 460,
      active: true,
      sortOrder: 0
    })
  });
  assert.equal(estimateResponse.status, 200);

  const groupResponse = await fetch(`${fixture.baseUrl}/api/package-estimate-groups/package-group-test`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-group-test",
      estimateId: "package-estimate-test",
      packageSectionId: "package-section-test",
      name: "estimate group patched",
      count: 2,
      area: 30,
      perimeter: 20,
      height: 2.8,
      collapsed: true,
      sortOrder: 0
    })
  });
  assert.equal(groupResponse.status, 200);

  const estimateItemResponse = await fetch(`${fixture.baseUrl}/api/package-estimate-items/package-item-labor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id: "package-item-labor",
      estimateId: "package-estimate-test",
      groupId: "package-group-test",
      packageSectionItemId: "package-section-item-test",
      sourceType: "labor",
      itemName: "labor patched/m2",
      area: "wall",
      quantity: 16,
      includedType: "upgrade",
      sortOrder: 0
    })
  });
  assert.equal(estimateItemResponse.status, 200);

  const after = inspectSqliteDatabase(fixture.dataDir);
  assert.equal(after.counts.packages, before.counts.packages);
  assert.equal(after.counts.package_sections, before.counts.package_sections);
  assert.equal(after.counts.package_section_items, before.counts.package_section_items);
  assert.equal(after.counts.package_estimates, before.counts.package_estimates);
  assert.equal(after.counts.package_estimate_groups, before.counts.package_estimate_groups);
  assert.equal(after.counts.package_estimate_items, before.counts.package_estimate_items);
  assert.equal(after.counts.quote_items, before.counts.quote_items);
  assert.equal(after.packageEntry.name, "package patched");
  assert.equal(after.packageEntry.quoteUnitPrice, 460);
  assert.equal(after.packageSection.name, "section patched");
  assert.equal(after.packageSection.collapsed, 0);
  assert.equal(after.packageSection.sortOrder, 3);
  assert.equal(after.packageSectionItem.itemName, "labor patched/m2");
  assert.equal(after.packageSectionItem.area, "wall");
  assert.equal(after.packageEstimate.name, "estimate patched");
  assert.equal(after.packageEstimate.buildingArea, 150);
  assert.equal(after.packageEstimateGroup.name, "estimate group patched");
  assert.equal(after.packageEstimateGroup.count, 2);
  assert.equal(after.packageEstimateItem.itemName, "labor patched/m2");
  assert.equal(after.packageEstimateItem.quantity, 16);
  assert.equal(after.packageEstimateItem.includedType, "upgrade");
  assert.equal(after.line.engineeringName, before.line.engineeringName);
});

test("backend derives labor categories and preserves amount-column visibility", async (t) => {
  const fixture = await startTestServer();
  t.after(() => stopTestServer(fixture));

  const state = portableState({
    categories: undefined,
    activePage: "editor"
  });
  state.data.versions[0].items[0].category = "娲剧敓鍒嗙被";
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
  assert.equal(payload.data.categories[0].name, "娲剧敓鍒嗙被");
  assert.equal(payload.data.versions[0].items[0].category, "娲剧敓鍒嗙被");
  assert.equal(payload.data.versions[0].items[0].categoryId, payload.data.categories[0].id);
  assert.equal(payload.data.quotes[0].showAmountColumns, 0);
  assert.equal(payload.data.activePage, "editor");

  const db = new DatabaseSync(path.join(fixture.dataDir, "quote-data.sqlite"));
  try {
    const category = db.prepare("SELECT name FROM labor_categories").get();
    const laborItem = db.prepare("SELECT category, category_id AS categoryId FROM labor_items WHERE id = ?").get("labor-test");
    const quote = db.prepare("SELECT show_amount_columns AS showAmountColumns FROM quotes WHERE id = ?").get("quote-test");
    assert.equal(category.name, "娲剧敓鍒嗙被");
    assert.equal(laborItem.category, "娲剧敓鍒嗙被");
    assert.equal(Boolean(laborItem.categoryId), true);
    assert.equal(quote.showAmountColumns, 0);
  } finally {
    db.close();
  }
});
