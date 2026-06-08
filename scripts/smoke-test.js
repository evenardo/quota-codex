const baseUrl = process.env.QUOTE_TOOL_URL || "http://127.0.0.1:5177";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const response = await fetch(`${baseUrl}/api/data`);
assert(response.ok, `GET /api/data failed: ${response.status}`);

const payload = await response.json();
const data = payload.data || payload;

["versions", "categories", "materials", "templates", "packages", "customers", "quotes"].forEach((key) => {
  assert(Array.isArray(data[key]), `${key} should be an array`);
});

assert(data.versions.length > 0, "versions should not be empty");
assert(data.quotes.length > 0, "quotes should not be empty");

const quote = data.quotes[0];
assert(Array.isArray(quote.spaces), "quote.spaces should be an array");
assert(Array.isArray(quote.lines), "quote.lines should be an array");

if (data.packages.length) {
  const packageEntry = data.packages[0];
  assert(Array.isArray(packageEntry.sections), "package.sections should be an array");
  assert(Array.isArray(packageEntry.estimates), "package.estimates should be an array");
}

console.log("smoke test ok");
