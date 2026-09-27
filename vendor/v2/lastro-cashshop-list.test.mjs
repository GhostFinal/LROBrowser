import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");

function extractFunction(marker) {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} was not found`);
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }

  throw new Error(`${marker} has unbalanced braces`);
}

test("opening an empty CashShop requests the category item lists", () => {
  class CashShopListRequest {}

  const calls = [];
  const cashShop = {
    cashShopListItem: [],
    readPoints: () => calls.push("points"),
    prepare: () => calls.push("prepare"),
    append: () => calls.push("append"),
  };
  const sentPackets = [];
  const onOpenCashShop = new Function(
    "CashShop_default",
    "PACKET",
    "Network",
    `return (${extractFunction("function onOpenCashShop(")});`
  )(
    cashShop,
    { CZ: { PC_CASH_POINT_ITEMLIST: CashShopListRequest } },
    { sendPacket: (packet) => sentPackets.push(packet) }
  );

  onOpenCashShop({ cashPoints: 100, kafraPoints: 20, tab: 0 });

  assert.deepEqual(calls, ["points", "prepare", "append"]);
  assert.equal(sentPackets.length, 1);
  assert.ok(sentPackets[0] instanceof CashShopListRequest);
});

test("receiving a CashShop category refreshes the visible item panel", () => {
  let refreshCount = 0;
  const cashShop = {
    cashShopListItem: [],
    ui: { is: (selector) => selector === ":visible" },
    loadComponentCashShop: () => ++refreshCount,
  };
  const readCashShopItems = new Function(
    "CashShop",
    `return (${extractFunction("CashShop.readCashShopItems = function")});`
  )(cashShop);
  const packet = {
    count: 1,
    tabNum: 0,
    items: [{ itemId: 501, price: 10 }],
  };

  readCashShopItems(packet);

  assert.deepEqual(cashShop.cashShopListItem, [packet]);
  assert.equal(refreshCount, 1);
});
