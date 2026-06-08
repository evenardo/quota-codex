import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadFrontend() {
  const appSource = readFileSync("public/app.js", "utf8");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => callback(),
    window: { innerHeight: 800 },
    location: { protocol: "http:" },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    crypto: {
      getRandomValues: (bytes) => {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 17) & 0xff;
        return bytes;
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(appSource, sandbox);
  return sandbox;
}

function fakeSuggestionContainer() {
  const classNames = new Set(["open-up"]);
  return {
    innerHTML: "<button></button>",
    dataset: { activeIndex: "3" },
    classList: {
      remove: (name) => classNames.delete(name),
      contains: (name) => classNames.has(name)
    },
    querySelectorAll: () => []
  };
}

function fakeSuggestionKeyboardContainer(count = 3, activeIndex = "0") {
  const buttons = Array.from({ length: count }, (_, index) => {
    const active = new Set();
    return {
      dataset: { index: String(index) },
      active,
      classList: {
        toggle: (name, enabled) => {
          if (enabled) active.add(name);
          else active.delete(name);
        },
        contains: (name) => active.has(name)
      },
      scrollIntoView: () => { buttonScrolls[index] += 1; }
    };
  });
  const buttonScrolls = Array(count).fill(0);
  return {
    buttons,
    buttonScrolls,
    innerHTML: "",
    dataset: { activeIndex },
    classList: { remove: () => {} },
    querySelectorAll: () => buttons
  };
}

function setFrontendState(app, source) {
  vm.runInContext(source, app);
}

function getFrontendState(app) {
  return vm.runInContext("state", app);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertParsedPriceName(actual, expected) {
  assert.equal(actual.baseName, expected.baseName);
  assert.equal(actual.unit, expected.unit);
  assert.equal(actual.separator, expected.separator);
}

test("normalizes insert positions", () => {
  const app = loadFrontend();

  assert.equal(app.normalizeInsertPosition(null, 3), 3);
  assert.equal(app.normalizeInsertPosition(undefined, 3), 3);
  assert.equal(app.normalizeInsertPosition(-5, 3), 0);
  assert.equal(app.normalizeInsertPosition(2, 3), 2);
  assert.equal(app.normalizeInsertPosition(99, 3), 3);
});

test("parses slash-based price names and rejects invalid names", () => {
  const app = loadFrontend();

  assertParsedPriceName(app.parsePriceNameUnit("wall paint/m2"), {
    baseName: "wall paint",
    unit: "m2",
    separator: "/"
  });
  assertParsedPriceName(app.parsePriceNameUnit("tile\uff0fpiece"), {
    baseName: "tile",
    unit: "piece",
    separator: "\uff0f"
  });
  assert.equal(app.parsePriceNameUnit("missing unit/"), null);
  assert.equal(app.parsePriceNameUnit("/missing name"), null);
  assert.equal(app.parsePriceNameUnit("plain name"), null);
});

test("evaluates quantity formulas defensively", () => {
  const app = loadFrontend();

  assert.equal(app.evaluateQuantityFormula("q=s+c*(h-0.25)", { s: 90, c: 40, h: 2.7 }), 188);
  assert.equal(app.evaluateQuantityFormula("q=c*h", { s: 90, c: 10, h: 2.5 }), 25);
  assert.equal(app.evaluateQuantityFormula("q=s/35", { s: 140, c: 0, h: 0 }, { roundDown: true }), 4);
  assert.equal(app.evaluateQuantityFormula("q=s; q=c*h", { s: 90, c: 10, h: 2.5 }), null);
  assert.equal(app.evaluateQuantityFormula("q=s-999", { s: 90, c: 10, h: 2.5 }), 0);
  assert.equal(app.evaluateQuantityFormula("q=window.alert(1)", { s: 90, c: 10, h: 2.5 }), null);
  assert.equal(app.evaluateQuantityFormula("", { s: 90, c: 10, h: 2.5 }), null);
});

test("generates prefixed uuidv7-style ids", () => {
  const app = loadFrontend();

  const id = app.makeId("quote");

  assert.match(id, /^quote-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("normalizes quote defaults and amount-column visibility", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.customers = [{ id: "customer-a", name: "Customer A" }];
    state.activeCustomerId = "customer-a";
    state.activeVersionId = "version-a";
  `);

  const quote = app.normalizeQuote({
    id: "quote-a",
    customerId: "customer-a",
    name: "Case A",
    showAmountColumns: 0
  });

  assert.equal(quote.projectName, "Case A");
  assert.equal(quote.clientName, "Customer A");
  assert.equal(quote.priceVersionId, "version-a");
  assert.equal(quote.managementRate, 8);
  assert.equal(quote.designRate, 6);
  assert.equal(quote.taxRate, 9);
  assert.equal(quote.showAmountColumns, false);
});

test("normalizes labor items, materials, categories, and package estimates", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [
      { id: "cat-a", name: "Cat A", sortOrder: 2 },
      { id: "cat-a-dup", name: "Cat A", sortOrder: 0 },
      { id: "cat-b", name: "Cat B", sortOrder: 1 }
    ];
  `);

  const categories = app.normalizeCategories(getFrontendState(app).categories);
  const laborItem = app.normalizeLaborItem({ name: "paint/m2", category: "Cat B", auxiliary: "2", labor: "3" }, 4);
  const genericMaterials = app.normalizeGenericMaterials([{ id: "kind-floor", name: "地砖", primaryCategory: "砖", unit: "平米", sortOrder: 0 }]);
  const material = app.normalizeMaterial({ id: "mat-x", name: "tile", materialKindId: "kind-floor", category: "Tile", unitPrice: "88", costUnitPrice: "66" }, 5);
  const estimate = app.normalizePackageEstimate({ groups: [], items: [{ sourceType: "bad", includedType: "bad" }] }, 0);

  assert.deepEqual(plain(categories.map((category) => category.name)), ["Cat B", "Cat A"]);
  assert.equal(laborItem.unit, "m2");
  assert.equal(laborItem.categoryId, "cat-b");
  assert.equal(laborItem.quantityFormula, "q=s+c*(h-0.25)");
  assert.equal(app.normalizePackageSection({ name: "Collapsed", collapsed: 1 }, 0).collapsed, true);
  assert.equal(genericMaterials.some((kind) => kind.name === "墙砖"), true);
  assert.equal(material.materialKindId, "kind-floor");
  assert.equal(material.primaryCategory, "Tile");
  assert.equal(material.quoteUnitPrice, 88);
  assert.equal(material.unitPrice, 88);
  assert.equal(material.costUnitPrice, 66);
  assert.equal(estimate.buildingArea, 143);
  assert.equal(estimate.height, 2.7);
  assert.equal(estimate.groups.length, 1);
  assert.equal(estimate.items[0].sourceType, "labor");
  assert.equal(estimate.items[0].includedType, "included");
});

test("normalizes project groups and assigns orphan lines to matching group names", () => {
  const app = loadFrontend();
  const lines = [
    { id: "line-a", area: "Kitchen", spaceId: "" },
    { id: "line-b", area: "Unknown", spaceId: "missing" }
  ];

  const groups = app.normalizeProjectGroups([
    { id: "group-living", name: "Living", sortOrder: 1, area: 20 },
    { id: "group-kitchen", name: "Kitchen", sortOrder: 0, area: 8 }
  ], lines);

  assert.deepEqual(groups.map((group) => group.name), ["Kitchen", "Living"]);
  assert.deepEqual(groups.map((group) => group.sortOrder), [0, 1]);
  assert.equal(groups[0].collapsed, false);
  assert.equal(groups[1].collapsed, true);
  assert.equal(lines[0].spaceId, "group-kitchen");
  assert.equal(lines[1].spaceId, "group-kitchen");
});

test("sorts quote lines by group, item type, category order, and library order on reload", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [
      { id: "cat-demo", name: "Demo", sortOrder: 1 },
      { id: "cat-base", name: "Base", sortOrder: 0 }
    ];
    state.versions = [{
      id: "version-a",
      items: [
        { name: "demo/m2", unit: "m2", categoryId: "cat-demo", sortOrder: 0, auxiliary: 1, labor: 1 },
        { name: "base/m2", unit: "m2", categoryId: "cat-base", sortOrder: 0, auxiliary: 2, labor: 2 }
      ]
    }];
    state.materials = [
      { id: "door-1", name: "door", primaryCategory: "门", unit: "set", quoteUnitPrice: 100, costUnitPrice: 80, sortOrder: 0 },
      { id: "tile-1", name: "tile", primaryCategory: "砖", unit: "piece", quoteUnitPrice: 10, costUnitPrice: 8, sortOrder: 1 }
    ];
    state.activeVersionId = "version-a";
  `);

  const quote = {
    id: "quote-a",
    priceVersionId: "version-a",
    spaces: [
      { id: "group-b", name: "B", sortOrder: 1 },
      { id: "group-a", name: "A", sortOrder: 0 }
    ],
    lines: [
      { id: "unknown-space", spaceId: "missing", sourceType: "labor", priceItemName: "base/m2" },
      { id: "material-door", spaceId: "group-a", sourceType: "material", materialId: "door-1" },
      { id: "labor-demo", spaceId: "group-a", sourceType: "labor", priceItemName: "demo/m2" },
      { id: "material-tile", spaceId: "group-a", sourceType: "material", materialId: "tile-1" },
      { id: "labor-base", spaceId: "group-a", sourceType: "labor", priceItemName: "base/m2" },
      { id: "group-b-line", spaceId: "group-b", sourceType: "labor", priceItemName: "base/m2" }
    ]
  };
  const sortedLines = app.sortQuoteItemsForReload(quote);

  assert.deepEqual(plain(sortedLines.map((line) => line.id)), [
    "labor-base",
    "labor-demo",
    "material-tile",
    "material-door",
    "group-b-line",
    "unknown-space"
  ]);
});

test("syncs quote items when a labor item unit changes and blocks duplicates", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.versions = [{
      id: "version-a",
      items: [
        { name: "paint/m2", unit: "m2", sortOrder: 0 },
        { name: "paint/m", unit: "m", sortOrder: 1 }
      ]
    }];
    state.activeVersionId = "version-a";
    state.quotes = [{
      id: "quote-a",
      priceVersionId: "version-a",
      lines: [{ id: "line-a", priceItemName: "paint/m2" }]
    }];
    state.activeQuoteId = "quote-a";
    state.expandedLaborItemName = "paint/m2";
    state.pendingLaborItemName = "paint/m2";
  `);
  const state = getFrontendState(app);
  const item = state.versions[0].items[0];

  assert.equal(app.setLaborItemUnit(item, "m"), false);
  assert.equal(app.setLaborItemUnit(item, "roll"), true);
  assert.equal(item.name, "paint/roll");
  assert.equal(item.unit, "roll");
  assert.equal(state.quotes[0].lines[0].priceItemName, "paint/roll");
  assert.equal(state.expandedLaborItemName, "paint/roll");
  assert.equal(state.pendingLaborItemName, "paint/roll");
});

test("syncs labor item renames across linked quote, template, and package entries", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.quotes = [{
      id: "quote-a",
      lines: [
        { id: "line-a", sourceType: "labor", priceItemName: "old/m2", engineeringName: "old/m2" },
        { id: "line-b", sourceType: "labor", priceItemName: "old/m2", engineeringName: "custom display" }
      ]
    }];
    state.templates = [{
      id: "template-a",
      items: [
        { id: "template-item-a", sourceType: "labor", itemName: "old/m2" },
        { id: "template-item-b", sourceType: "labor", itemName: "custom/m2" }
      ]
    }];
    state.packages = [{
      id: "package-a",
      sections: [{
        id: "section-a",
        items: [{ id: "section-item-a", sourceType: "labor", name: "old/m2", itemName: "old/m2" }]
      }],
      estimates: [{
        id: "estimate-a",
        items: [{ id: "estimate-item-a", sourceType: "labor", itemName: "old/m2" }]
      }]
    }];
  `);
  const state = getFrontendState(app);

  app.syncQuoteItemLaborItemName("old/m2", "new/m2");

  assert.equal(state.quotes[0].lines[0].priceItemName, "new/m2");
  assert.equal(state.quotes[0].lines[0].engineeringName, "new/m2");
  assert.equal(state.quotes[0].lines[1].priceItemName, "new/m2");
  assert.equal(state.quotes[0].lines[1].engineeringName, "custom display");
  assert.equal(state.templates[0].items[0].itemName, "new/m2");
  assert.equal(state.templates[0].items[1].itemName, "custom/m2");
  assert.equal(state.packages[0].sections[0].items[0].name, "new/m2");
  assert.equal(state.packages[0].sections[0].items[0].itemName, "new/m2");
  assert.equal(state.packages[0].estimates[0].items[0].itemName, "new/m2");
});

test("converts material unit price when conversion unit matches labor unit", () => {
  const app = loadFrontend();
  const material = {
    unit: "piece",
    quoteUnitPrice: 45,
    costUnitPrice: 42,
    conversionUnit: "m2",
    conversionQuantity: 1.56
  };
  const item = { name: "floor tile/m2" };

  assert.equal(app.materialUnitPriceForItem(material, item, "quote"), 70.2);
  assert.equal(app.materialUnitPriceForItem(material, item, "cost"), 65.52);
  assert.equal(app.materialUnitPriceForItem({ ...material, unit: "m2" }, item, "quote"), 45);
});

test("calculates quote item prices, costs, recommended quantity, and process notes", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [{ id: "cat-a", name: "Base", description: "Category note", sortOrder: 0 }];
    state.genericMaterials = [{ id: "generic-material-地砖", name: "地砖", primaryCategory: "砖", unit: "平米", quoteUnitPrice: 80, costUnitPrice: 60, sortOrder: 0 }];
    state.materials = [{ id: "material-tile-a", name: "宏陶地砖 750x1500", materialKindId: "generic-material-地砖", primaryCategory: "砖", unit: "平米", quoteUnitPrice: 90, costUnitPrice: 68, sortOrder: 0 }];
    state.versions = [{
      id: "version-a",
      items: [{
        name: "paint/m2",
        unit: "m2",
        categoryId: "cat-a",
        description: "Item note",
        auxiliary: 2,
        labor: 3,
        costAuxiliary: 1,
        costLabor: 1.5,
        quantityFormula: "q=s+c*h",
        sortOrder: 0
      }]
    }];
    state.activeVersionId = "version-a";
    state.quotes = [{
      id: "quote-a",
      priceVersionId: "version-a",
      spaces: [{ id: "group-a", area: 20, perimeter: 10, height: 2.5 }],
      lines: [{ id: "line-a", spaceId: "group-a", priceItemName: "paint/m2", quantity: 2, auxiliary: 2, labor: 3 }]
    }];
    state.activeQuoteId = "quote-a";
  `);
  const state = getFrontendState(app);
  const line = state.quotes[0].lines[0];

  assert.equal(app.calculateQuoteItemUnitPrice(line), 5);
  assert.equal(app.calculateQuoteItemCostUnitPrice(line, "version-a"), 2.5);
  assert.equal(app.isMaterialQuoteItem({ sourceType: "material", materialKindId: "generic-material-地砖" }), true);
  assert.equal(app.calculateQuoteItemUnitPrice({ sourceType: "material", materialKindId: "generic-material-地砖", quantity: 10 }), 80);
  assert.equal(app.calculateQuoteItemCostUnitPrice({ sourceType: "material", materialKindId: "generic-material-地砖", quantity: 10 }), 60);
  assert.equal(app.materialPriceDifference({ materialKindId: "generic-material-地砖", materialId: "material-tile-a" }, "quote"), 10);
  assert.equal(app.materialPriceDifference({ materialKindId: "generic-material-地砖", materialId: "material-tile-a" }, "cost"), 8);
  assert.equal(app.recommendedQuantityForQuoteItem(line, state.quotes[0]), 45);
  assert.equal(app.processNoteForQuoteItem(line, "version-a"), "Category note\uff1bItem note");
  assert.equal(app.calculateQuoteItemUnitPrice({ legacyUnitPrice: 88, auxiliary: 0, labor: 0 }), 88);
});

test("calculates quote totals with fees and taxes", () => {
  const app = loadFrontend();
  const quote = {
    managementRate: 8,
    designRate: 6,
    taxRate: 9,
    spaces: [],
    lines: [
      { sourceType: "labor", quantity: 10, auxiliary: 2, labor: 3, legacyUnitPrice: null },
      { sourceType: "material", quantity: 4, auxiliary: 0, labor: 20, legacyUnitPrice: null }
    ]
  };

  const totals = app.calculateTotals(quote);

  assert.equal(totals.laborSubtotal, 50);
  assert.equal(totals.materialSubtotal, 80);
  assert.equal(totals.subtotal, 130);
  assert.equal(totals.management, 10.4);
  assert.equal(totals.design, 7.8);
  assert.equal(totals.tax, 11.7);
  assert.equal(totals.grand, 159.9);
});

test("calculates package estimate totals and ignores reference items", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [{ id: "cat-a", name: "Base", sortOrder: 0 }];
    state.versions = [{
      id: "version-a",
      items: [{ name: "labor/m2", unit: "m2", categoryId: "cat-a", auxiliary: 6, labor: 4, costAuxiliary: 2, costLabor: 3, sortOrder: 0 }]
    }];
    state.activeVersionId = "version-a";
    state.materials = [{ id: "mat-a", name: "tile", primaryCategory: "砖", unit: "piece", quoteUnitPrice: 20, costUnitPrice: 12, sortOrder: 0 }];
  `);
  const packageEntry = { quoteUnitPrice: 300 };
  const estimate = {
    buildingArea: 100,
    quoteUnitPrice: 350,
    items: [
      { sourceType: "labor", itemName: "labor/m2", quantity: 10, includedType: "included" },
      { sourceType: "material", materialId: "mat-a", quantity: 5, includedType: "upgrade" },
      { sourceType: "material", materialId: "mat-a", quantity: 999, includedType: "reference" }
    ]
  };

  const pricing = app.packageEstimateItemPricing(estimate.items[0]);
  const totals = app.calculatePackageEstimateTotals(packageEntry, estimate);

  assert.equal(pricing.quoteUnitPrice, 10);
  assert.equal(pricing.costUnitPrice, 5);
  assert.equal(pricing.costAmount, 50);
  assert.equal(totals.quoteTotal, 35000);
  assert.equal(totals.laborCost, 50);
  assert.equal(totals.materialCost, 60);
  assert.equal(totals.totalCost, 110);
  assert.equal(totals.profit, 34890);
  assert.equal(totals.profitRate, 34890 / 35000);
});

test("finds comparable labor and material entries by useful ranking signals", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [{ id: "cat-a", name: "Base", sortOrder: 0 }];
    state.versions = [{
      id: "version-a",
      items: [
        { name: "wall paint/m2", unit: "m2", categoryId: "cat-a", category: "Base", sortOrder: 1 },
        { name: "paint/m", unit: "m", categoryId: "cat-a", category: "Base", sortOrder: 0 },
        { name: "tile/m2", unit: "m2", categoryId: "cat-a", category: "Base", sortOrder: 2 }
      ]
    }];
    state.activeVersionId = "version-a";
    state.materials = [
      { id: "mat-a", name: "Marco tile 800", primaryCategory: "tile", spec: "800", brand: "Marco", sortOrder: 1 },
      { id: "mat-b", name: "door panel", primaryCategory: "door", spec: "900", brand: "Door", sortOrder: 0 }
    ];
  `);

  const laborMatches = app.findComparableItems("paint", 2);
  const materialMatches = app.findSimilarMaterials("Marco 800");
  const categoryMatches = app.materialsForCategory("tile");

  assert.deepEqual(plain(laborMatches.map((item) => item.name)), ["paint/m", "wall paint/m2"]);
  assert.equal(materialMatches[0].id, "mat-a");
  assert.deepEqual(plain(categoryMatches.map((item) => item.id)), ["mat-a"]);
});

test("keyboard navigation moves through suggestions and enter picks active option", () => {
  const app = loadFrontend();
  const container = fakeSuggestionKeyboardContainer(3, "0");
  const picked = [];

  const downHandled = app.handleSuggestionKeyboard({
    key: "ArrowDown",
    preventDefault: () => picked.push("prevent-down")
  }, container, (button) => picked.push(button.dataset.index));
  const upHandled = app.handleSuggestionKeyboard({
    key: "ArrowUp",
    preventDefault: () => picked.push("prevent-up")
  }, container, (button) => picked.push(button.dataset.index));
  const enterHandled = app.handleSuggestionKeyboard({
    key: "Enter",
    preventDefault: () => picked.push("prevent-enter")
  }, container, (button) => picked.push(button.dataset.index));

  assert.equal(downHandled, true);
  assert.equal(upHandled, true);
  assert.equal(enterHandled, true);
  assert.deepEqual(picked, ["prevent-down", "prevent-up", "prevent-enter", "0"]);
  assert.equal(container.dataset.activeIndex, "0");
  assert.equal(container.buttons[0].classList.contains("active"), true);
});

test("renders preview table head with and without amount columns", () => {
  const app = loadFrontend();
  const table = {
    toggles: [],
    classList: {
      toggle: (name, enabled) => table.toggles.push([name, enabled])
    }
  };
  const head = {
    innerHTML: "",
    closest: () => table
  };
  app.previewHead = head;
  setFrontendState(app, "els.previewTableHead = previewHead;");

  app.renderPreviewTableHead(true);
  assert.equal(head.innerHTML.includes("\u8f85\u6599"), true);
  assert.equal(head.innerHTML.includes("\u91d1\u989d"), true);
  assert.deepEqual(table.toggles.at(-1), ["amount-hidden", false]);

  app.renderPreviewTableHead(false);
  assert.equal(head.innerHTML.includes("\u8f85\u6599"), false);
  assert.equal(head.innerHTML.includes("\u91d1\u989d"), false);
  assert.deepEqual(table.toggles.at(-1), ["amount-hidden", true]);
});

test("adds package estimate items at requested position and keeps other groups intact", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    saveState = () => {};
    renderPackages = () => {};
  `);
  const estimate = {
    items: [
      { id: "a", groupId: "group-a", sourceType: "labor", sortOrder: 0 },
      { id: "b", groupId: "group-a", sourceType: "labor", sortOrder: 1 },
      { id: "x", groupId: "group-x", sourceType: "material", sortOrder: 0 }
    ]
  };
  const group = { id: "group-a" };

  app.addPackageEstimateItem(estimate, group, "material", 1);

  const groupAItems = estimate.items.filter((item) => item.groupId === "group-a");
  assert.equal(groupAItems[0].id, "a");
  assert.match(groupAItems[1].id, /^package-item-[0-9a-f-]+$/);
  assert.equal(groupAItems[2].id, "b");
  assert.deepEqual(plain(groupAItems.map((item) => item.sortOrder)), [0, 1, 2]);
  assert.equal(groupAItems[1].sourceType, "material");
  assert.equal(groupAItems[1].includedType, "included");
  assert.equal(estimate.items.some((item) => item.id === "x" && item.groupId === "group-x"), true);
});

test("renders package section insert slots around every package section item", () => {
  const app = loadFrontend();
  const html = app.renderPackageSections({
    sections: [{
      id: "section-a",
      name: "Section A",
      sortOrder: 0,
      items: [
        { id: "item-a", name: "A", provider: "P", description: "D", sortOrder: 0 },
        { id: "item-b", name: "B", provider: "P", description: "D", sortOrder: 1 }
      ]
    }]
  });

  assert.equal((html.match(/package-section-insert-slot/g) || []).length, 3);
  assert.equal(html.includes("package-section-drag"), true);
  assert.equal(html.includes("package-section-count"), true);
  assert.equal(html.includes('data-position="0"'), true);
  assert.equal(html.includes('data-position="1"'), true);
  assert.equal(html.includes('data-position="2"'), true);
  assert.equal(html.includes("insert-package-section-item"), true);
});

test("renders collapsed package sections without item table", () => {
  const app = loadFrontend();
  const html = app.renderPackageSections({
    sections: [{
      id: "section-a",
      name: "Section A",
      collapsed: true,
      sortOrder: 0,
      items: [
        { id: "item-a", name: "A", provider: "P", description: "D", sortOrder: 0 },
        { id: "item-b", name: "B", provider: "P", description: "D", sortOrder: 1 }
      ]
    }]
  });

  assert.equal(html.includes("package-section collapsed"), true);
  assert.equal(html.includes("package-section-table"), false);
  assert.equal(html.includes(">2</span>"), true);
});

test("adds package section items at requested position", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    saveState = () => {};
    renderPackages = () => {};
  `);
  const section = {
    items: [
      { id: "item-a", name: "A", sortOrder: 0 },
      { id: "item-b", name: "B", sortOrder: 1 }
    ]
  };

  app.addPackageSectionItem(section, 1);

  assert.equal(section.items[0].id, "item-a");
  assert.match(section.items[1].id, /^package-section-item-[0-9a-f-]+$/);
  assert.equal(section.items[2].id, "item-b");
  assert.deepEqual(plain(section.items.map((item) => item.sortOrder)), [0, 1, 2]);
});

test("reorders package sections and renumbers sortOrder", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    saveState = (message) => { state.lastSaveMessage = message; };
    renderPackages = () => { state.renderedPackages = true; };
  `);
  const packageEntry = {
    sections: [
      { id: "section-a", name: "A", sortOrder: 0 },
      { id: "section-b", name: "B", sortOrder: 1 },
      { id: "section-c", name: "C", sortOrder: 2 }
    ]
  };

  app.reorderPackageSection(packageEntry, "section-c", "section-a");

  assert.deepEqual(plain(packageEntry.sections.map((section) => section.id)), ["section-c", "section-a", "section-b"]);
  assert.deepEqual(plain(packageEntry.sections.map((section) => section.sortOrder)), [0, 1, 2]);
  assert.equal(getFrontendState(app).lastSaveMessage, "\u5df2\u8c03\u6574\u5957\u9910\u5206\u7c7b\u987a\u5e8f");
  assert.equal(getFrontendState(app).renderedPackages, true);
});

test("deletes packages only after exact name confirmation", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    saveState = (message) => { state.lastSaveMessage = message; };
    renderAll = () => { state.renderedAll = true; };
    alert = (message) => { state.lastAlert = message; };
    state.packages = [
      { id: "pkg-a", name: "Package A", sortOrder: 0, estimates: [{ id: "estimate-a", active: true }] },
      { id: "pkg-b", name: "Package B", sortOrder: 1, estimates: [{ id: "estimate-b", active: true }] }
    ];
    state.activePackageId = "pkg-a";
    state.activePackageEstimateId = "estimate-a";
    state.returnToPackageId = "pkg-a";
  `);

  setFrontendState(app, "prompt = () => null;");
  app.deletePackage(getFrontendState(app).packages[0]);
  assert.deepEqual(plain(getFrontendState(app).packages.map((entry) => entry.id)), ["pkg-a", "pkg-b"]);

  setFrontendState(app, "prompt = () => 'wrong name';");
  app.deletePackage(getFrontendState(app).packages[0]);
  assert.deepEqual(plain(getFrontendState(app).packages.map((entry) => entry.id)), ["pkg-a", "pkg-b"]);
  assert.equal(getFrontendState(app).lastAlert, "\u5957\u9910\u540d\u79f0\u4e0d\u4e00\u81f4\uff0c\u5df2\u53d6\u6d88\u5220\u9664\u3002");

  setFrontendState(app, "prompt = () => 'Package A';");
  app.deletePackage(getFrontendState(app).packages[0]);
  const state = getFrontendState(app);
  assert.deepEqual(plain(state.packages.map((entry) => entry.id)), ["pkg-b"]);
  assert.equal(state.packages[0].sortOrder, 0);
  assert.equal(state.activePackageId, "pkg-b");
  assert.equal(state.activePackageEstimateId, "estimate-b");
  assert.equal(state.returnToPackageId, "");
  assert.equal(state.lastSaveMessage, "\u5df2\u5220\u9664\u5957\u9910");
  assert.equal(state.renderedAll, true);
});

test("keeps template editing order separate from library sorted order", () => {
  const app = loadFrontend();
  setFrontendState(app, `
    state.categories = [{ id: "cat-a", name: "A", sortOrder: 0 }, { id: "cat-b", name: "B", sortOrder: 1 }];
    state.versions = [{
      id: "version-test",
      items: [
        { name: "labor-a/m2", categoryId: "cat-a", sortOrder: 0 },
        { name: "labor-b/m2", categoryId: "cat-b", sortOrder: 1 }
      ]
    }];
    state.activeVersionId = "version-test";
    state.materials = [
      { id: "mat-a", name: "material-a", primaryCategory: "tile", sortOrder: 0 },
      { id: "mat-b", name: "material-b", primaryCategory: "door", sortOrder: 1 }
    ];
  `);
  const template = {
    items: [
      { id: "2", sourceType: "material", materialId: "mat-b", materialCategory: "door", sortOrder: 0 },
      { id: "1", sourceType: "labor", itemName: "labor-b/m2", sortOrder: 1 },
      { id: "0", sourceType: "labor", itemName: "labor-a/m2", sortOrder: 2 }
    ]
  };

  assert.deepEqual(app.templateItemsForEditing(template).map((item) => item.id), ["2", "1", "0"]);
  assert.deepEqual(app.sortedTemplateItems(template).map((item) => item.id), ["0", "1", "2"]);
});

test("template sync keys allow same material kind in different areas", () => {
  const app = loadFrontend();

  const existingLine = { sourceType: "material", materialKindId: "kind-tile", area: "卫生间" };
  const sameArea = { sourceType: "material", materialKindId: "kind-tile", area: "卫生间" };
  const otherArea = { sourceType: "material", materialKindId: "kind-tile", area: "厨房" };

  assert.equal(app.quoteItemTemplateKey(existingLine), app.templateItemKey(sameArea));
  assert.notEqual(app.quoteItemTemplateKey(existingLine), app.templateItemKey(otherArea));
});

test("package estimate matching allows same material kind in different areas", () => {
  const app = loadFrontend();

  const estimateItem = { sourceType: "material", materialKindId: "kind-tile", area: "卫生间" };
  const sameArea = { sourceType: "material", materialKindId: "kind-tile", area: "卫生间" };
  const otherArea = { sourceType: "material", materialKindId: "kind-tile", area: "厨房" };

  assert.equal(app.packageEstimateItemMatchesSectionItem(estimateItem, sameArea), true);
  assert.equal(app.packageEstimateItemMatchesSectionItem(estimateItem, otherArea), false);
});

test("inserts item and renumbers sortOrder without mutating original array", () => {
  const app = loadFrontend();
  const original = [{ name: "a", sortOrder: 10 }, { name: "b", sortOrder: 20 }];
  const inserted = { name: "x", sortOrder: 99 };

  const nextItems = app.insertItemAndRenumberSortOrder(original, inserted, 1);

  assert.deepEqual(nextItems.map((item) => item.name), ["a", "x", "b"]);
  assert.deepEqual(nextItems.map((item) => item.sortOrder), [0, 1, 2]);
  assert.deepEqual(original.map((item) => item.name), ["a", "b"]);
});

test("renders labor/material insert actions", () => {
  const app = loadFrontend();
  const html = app.renderLaborMaterialInsertActions("actions", "labor-btn", "material-btn");

  assert.match(html, /class="actions"/);
  assert.match(html, /class="labor-btn"/);
  assert.match(html, /class="material-btn"/);
  assert.equal(html.includes("\u5de5\u8d39"), true);
  assert.equal(html.includes("\u4e3b\u6750"), true);
});

test("closes suggestion list completely", () => {
  const app = loadFrontend();
  const container = fakeSuggestionContainer();

  app.closeSuggestionList(container);

  assert.equal(container.innerHTML, "");
  assert.equal(container.dataset.activeIndex, "-1");
  assert.equal(container.classList.contains("open-up"), false);
});

test("esc key closes suggestion list", () => {
  const app = loadFrontend();
  const container = fakeSuggestionContainer();
  const event = { key: "Escape" };

  const handled = app.handleSuggestionKeyboard(event, container, () => {
    throw new Error("enter handler should not run");
  });

  assert.equal(handled, true);
  assert.equal(container.innerHTML, "");
  assert.equal(container.dataset.activeIndex, "-1");
});

test("formats and escapes suggestion option html", () => {
  const app = loadFrontend();
  const laborHtml = app.renderLaborSuggestionOption({
    name: "\u62c6\u9664<\u5899\u4f53>/\u5e73\u7c73",
    category: "\u62c6\u9664",
    unit: "\u5e73\u7c73",
    auxiliary: 5,
    labor: 7
  });
  const materialHtml = app.renderMaterialSuggestionOption({
    id: "material-1",
    name: "\u7816<800>",
    primaryCategory: "\u7816",
    unit: "\u5757",
    quoteUnitPrice: 45,
    costUnitPrice: 42
  }, { price: "cost" });

  assert.match(laborHtml, /&lt;/);
  assert.match(laborHtml, /&gt;\/\u5e73\u7c73/);
  assert.match(laborHtml, /12\.00/);
  assert.match(materialHtml, /&lt;800&gt;/);
  assert.match(materialHtml, /42\.00/);
});
