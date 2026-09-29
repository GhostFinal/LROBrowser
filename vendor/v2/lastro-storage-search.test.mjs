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

function extractStorageFilterDeclaration(source) {
  const marker = "//#region src/UI/Components/Storage/StorageV3/StorageFilter.js";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "StorageFilter module marker not found");
  const start = [
    source.indexOf("function StorageFilter", markerIndex),
    source.indexOf("class StorageFilter", markerIndex),
  ].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  assert.notEqual(start, undefined, "StorageFilter declaration not found");
  const end = source.indexOf("\nvar init_StorageFilter", start);
  assert.notEqual(end, -1, "StorageFilter initializer not found");
  return source.slice(start, end);
}

function createStorageFilter() {
  const declaration = extractStorageFilterDeclaration(SOURCE);
  return new Function(
    "GUIComponent",
    "StorageFilter_default",
    "StorageFilter_default$1",
    "Preferences",
    `${declaration};
StorageFilter.prototype = Object.create(GUIComponent.prototype);
StorageFilter.prototype.constructor = StorageFilter;
return StorageFilter;`,
  )(
    class GUIComponent {
      constructor(prefName, cssText) {
        this.prefName = prefName;
        this.cssText = cssText;
      }
    },
    "storage-filter-css",
    "storage-filter-html",
    {
      get(name, defaults) {
        return { name, ...defaults, save() {} };
      },
    },
  );
}

function extractStorageFilterMethod(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `StorageFilter method not found: ${marker}`);
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0)
      return source.slice(functionIndex, index + 1);
  }

  throw new Error(`Unbalanced StorageFilter method: ${marker}`);
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
  const visibleItems = [];
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
    "requestFilter",
    `return (${extractAssignedFunction(SOURCE, "Component.onSearch =")});`
  )(
    { getItemName: item => item.name },
    { SEARCH: 99 },
    function StorageFilter() { return storageFilter; },
    itemNames.map((name, index) => ({ index, name })),
    {},
    items => visibleItems.splice(0, visibleItems.length, ...items),
  );

  onSearch.call(component);
  return visibleItems.map(item => item.name);
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

test("storage search ignores entries without a display name", () => {
  assert.deepEqual(createSearchHandler("草", [
    "非常软的草",
    undefined,
    null,
    "蓝色药水"
  ]), ["非常软的草"]);
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
  assert.match(
    SOURCE,
    /searchInput\.addEventListener\("keydown",\s*\(event\)\s*=>\s*\{[\s\S]*?Component\.onSearch\(\)/,
    "the search input should handle Enter directly",
  );
  assert.match(
    SOURCE,
    /const filteredItems = _list\.filter\([\s\S]*?requestFilter\(filteredItems\)/,
    "the search should refresh the visible storage list directly",
  );
});

test("storage search and category filters can construct StorageFilter", () => {
  assert.match(
    extractStorageFilterDeclaration(SOURCE),
    /^function StorageFilter\(tabId\)/,
    "StorageFilter must remain lazy-compatible with GUIComponent initialization",
  );
  const StorageFilter = createStorageFilter();
  const filter = new StorageFilter(99);

  assert.equal(filter instanceof Object.getPrototypeOf(StorageFilter.prototype).constructor, true);
  assert.equal(filter.prefName, "StorageFilter_99");
  assert.equal(filter.render(), "storage-filter-html");
  assert.deepEqual(filter._list, []);
});

test("storage filter stays inside the viewport when its measured size is unavailable", () => {
  const onAppend = new Function(
    "Renderer",
    `return (${extractStorageFilterMethod(
      SOURCE,
      "StorageFilter.prototype.onAppend =",
    )});`,
  )({ width: 467, height: 1028 });
  const host = {
    style: {},
    getBoundingClientRect() {
      return { width: 0, height: 0 };
    },
  };
  const component = {
    _host: host,
    _preferences: { x: 2280, y: 2180 },
    ui: { show() {} },
  };

  onAppend.call(component);

  assert.equal(host.style.left, "247px");
  assert.equal(host.style.top, "864px");
});
