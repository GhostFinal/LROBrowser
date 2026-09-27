import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const HANDLER_MARKER = "EnchantGrade.onOpenEnchantGradeUI = function onOpenEnchantGradeUI()";

function extractHandler(source) {
  const markerIndex = source.indexOf(HANDLER_MARKER);
  assert.notEqual(markerIndex, -1, "Grade Enchant open handler was not found");
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }

  throw new Error("Grade Enchant open handler has unbalanced braces");
}

test("mounts a prepared inventory before showing Grade Enchant", () => {
  let appendCount = 0;
  let toggleCount = 0;
  const inventoryHost = {
    isConnected: false,
    offsetHeight: 194,
    style: { display: "" }
  };
  const inventoryUI = {
    _host: inventoryHost,
    append() {
      appendCount++;
      inventoryHost.isConnected = true;
      inventoryHost.style.display = "none";
    },
    toggle() {
      toggleCount++;
      inventoryHost.style.display = inventoryHost.style.display === "none" ? "" : "none";
    }
  };
  const enchantGrade = {
    _host: {
      getBoundingClientRect() {
        return { top: 100, left: 200, width: 400, height: 330 };
      }
    },
    append() {}
  };
  const source = readFileSync(ONLINE_PATH, "utf8");
  const handler = new Function(
    "EnchantGrade",
    "InventoryController",
    `return (${extractHandler(source)});`
  )(enchantGrade, { getUI: () => inventoryUI });

  handler();

  assert.equal(appendCount, 1);
  assert.equal(toggleCount, 1);
  assert.equal(inventoryHost.isConnected, true);
  assert.equal(inventoryHost.style.display, "");
});
