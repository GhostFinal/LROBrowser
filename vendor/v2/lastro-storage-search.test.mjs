import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "Online.js"), "utf8");

function extractAssignedFunction(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Function marker not found: ${marker}`);
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }

  throw new Error(`Unbalanced function: ${marker}`);
}

function createSearchHandler(query, itemNames) {
  const results = [];
  const input = { value: query };
  const storageFilter = {
    append() {},
    setItems(_name, items) {
      results.splice(0, results.length, ...items);
    }
  };
  const component = {
    getRoot() {
      return { querySelector: () => input };
    }
  };
  const onSearch = new Function(
    "DB",
    "ItemType_default",
    "StorageFilter",
    "_list",
    "_openFilters",
    `return (${extractAssignedFunction(SOURCE, "Component.onSearch =")});`
  )(
    { getItemName: item => item.name },
    { SEARCH: 99 },
    function StorageFilter() { return storageFilter; },
    itemNames.map((name, index) => ({ index, name })),
    {}
  );

  onSearch.call(component);
  return results.map(item => item.name);
}

test("storage search trims whitespace and matches complete Chinese item names", () => {
  assert.deepEqual(createSearchHandler("  天地树叶子  ", [
    "天地树叶子",
    "天地树果实",
    "蓝色药水"
  ]), ["天地树叶子"]);
});

test("storage search matches a Chinese substring inside an item name", () => {
  assert.deepEqual(createSearchHandler("树叶", [
    "天地树叶子",
    "天地树果实",
    "蓝色药水"
  ]), ["天地树叶子"]);
});

test("storage search refreshes while typing and on Enter", () => {
  assert.ok(
    /searchInput\.addEventListener\("input",\s*\(\)\s*=>\s*Component\.onSearch\(\)\)/.test(SOURCE),
    "typing should refresh the storage search results"
  );
  assert.ok(
    /Component\.onEnterPressed\s*=\s*Component\.onSearch/.test(SOURCE),
    "Enter should run the storage search"
  );
});
