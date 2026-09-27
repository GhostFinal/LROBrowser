import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const HANDLER_MARKER = "function onOpenReformUI(pkt)";

function extractHandler(source) {
  const markerIndex = source.indexOf(HANDLER_MARKER);
  assert.notEqual(markerIndex, -1, "Item reform open handler was not found");
  const functionIndex = source.lastIndexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }

  throw new Error("Item reform open handler has unbalanced braces");
}

function loadHandler({ inventoryItem = null, append, criteria, title }) {
  const state = { itemId: 0 };
  const root = {
    querySelector(selector) {
      assert.equal(selector, ".item_text");
      return { textContent: "" };
    }
  };
  const db = {
    findReformListByItemID(itemId) {
      assert.equal(itemId, 100748);
      return ["reform-3"];
    },
    getAllReformInfos(reformIds) {
      assert.deepEqual(reformIds, ["reform-3"]);
      return [{ BaseItemId: 5001 }];
    },
    getItemName(item) {
      title.item = item;
      return "C_Weapon_Reform_3";
    }
  };
  const inventory = {
    getUI() {
      return {
        getItemById(itemId) {
          assert.equal(itemId, 100748);
          return inventoryItem;
        }
      };
    }
  };
  const source = readFileSync(ONLINE_PATH, "utf8");
  const handler = new Function(
    "DB",
    "InventoryController",
    "ItemReform",
    "ReformUIState",
    "_root$5",
    "checkReformCriteria",
    "ReformInfo",
    "SelectedReformInfo",
    `return (${extractHandler(source)});`
  )(
    db,
    inventory,
    { append: () => append(state) },
    state,
    () => root,
    criteria,
    {},
    {}
  );

  return { handler, state, root };
}

test("opens item reform when the packet trigger ID is not an inventory item", () => {
  let appendCount = 0;
  let criteriaCount = 0;
  const title = {};
  const { handler, state } = loadHandler({
    append(state) {
      appendCount++;
      state.itemId = 0;
    },
    criteria() {
      criteriaCount++;
    },
    title
  });

  handler({ ITID: 100748 });

  assert.equal(appendCount, 1);
  assert.equal(criteriaCount, 1);
  assert.equal(state.itemId, 100748);
  assert.deepEqual(title.item, { ITID: 100748, IsIdentified: 1 });
});
