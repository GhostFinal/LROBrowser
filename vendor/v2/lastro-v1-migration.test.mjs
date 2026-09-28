import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoBattleFieldUpdate, buildAutoBattleFieldUpdates, getAvailableInventoryItems, getVendingShopTitle } from "./lastro-v1-migration.mjs";

test("keeps every positive-count inventory item, including Yellow Potion", () => {
  const items = getAvailableInventoryItems([
    { ITID: 503, count: 7, identifiedDisplayName: "Yellow Potion" },
    { ITID: 504, amount: 2, identifiedDisplayName: "White Potion" },
    { ITID: 501, count: 0, identifiedDisplayName: "Red Potion" },
    { ITID: 0, count: 9, identifiedDisplayName: "Invalid item" }
  ]);

  assert.deepEqual(items.map((item) => [item.ITID, item.count]), [
    [503, 7],
    [504, 2]
  ]);
});

test("merges matching item IDs from an object-backed inventory", () => {
  const items = getAvailableInventoryItems({
    first: { ITID: 503, count: 2, identifiedDisplayName: "Yellow Potion" },
    second: { ITID: 503, count: 5, identifiedDisplayName: "Yellow Potion" },
    third: { ITID: 601, count: 1, identifiedDisplayName: "Fly Wing" }
  });

  assert.deepEqual(items.map((item) => [item.ITID, item.count]), [
    [503, 7],
    [601, 1]
  ]);
});

test("maps heal priority and HP threshold to scalar server updates", () => {
  assert.deepEqual([
    buildAutoBattleFieldUpdate("usealheal", true, "checkbox"),
    buildAutoBattleFieldUpdate("AutoUseItem_reHpVal", "35")
  ], [
    { id: 8, value: 1 },
    { id: 21, value: 35 }
  ]);
});

test("maps HP and SP potion selections to the v1 slot-then-item packet sequence", () => {
  assert.deepEqual(buildAutoBattleFieldUpdates("AutoUseItem_hp_1", "503"), [
    { id: 57, value: 1 },
    { id: 58, value: 503 }
  ]);
  assert.deepEqual(buildAutoBattleFieldUpdates("AutoUseItem_sp_3", "0"), [
    { id: 57, value: 6 },
    { id: 58, value: 0 }
  ]);
});

test("does not require a local shop name when restoring a vending list", () => {
  assert.equal(getVendingShopTitle(undefined), "");
});

test("maps server target updates without reversing the checked state", async () => {
  const { mapOnlyTargetState, applyOnlyTargetState } = await import("./lastro-v1-migration.mjs");
  assert.deepEqual(mapOnlyTargetState({ id: 123, value: 1 }), { mobId: 123, enabled: true });
  assert.deepEqual(mapOnlyTargetState({ id: 123, value: 0 }), { mobId: 123, enabled: false });
  assert.deepEqual(applyOnlyTargetState([123, 456], { id: 123, value: 0 }), [456]);
  assert.deepEqual(applyOnlyTargetState([456], { id: 123, value: 1 }), [456, 123]);
});

test("maps auto toggle reload packets to server-authoritative states", async () => {
  const { mapAutoToggleState } = await import("./lastro-v1-migration.mjs");
  assert.deepEqual(mapAutoToggleState({ id: 34, value: 0 }), { option: "autoAttack", enabled: false });
  assert.deepEqual(mapAutoToggleState({ id: 35, value: 7 }), { option: "autoLoot", enabled: true });
  assert.equal(mapAutoToggleState({ id: 99, value: 1 }), null);
});
