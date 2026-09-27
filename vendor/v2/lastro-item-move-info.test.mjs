import assert from "node:assert/strict";
import test from "node:test";
import { parseItemMoveInfoColumns } from "./lastro-item-move-info.mjs";

test("defaults the omitted guild-storage flag to false", () => {
  const result = parseItemMoveInfoColumns(["31454", "1", "0", "0", "0", "0", "0", "0"]);
  assert.equal(result.key, "31454");
  assert.deepEqual(result.moveInfo, {
    Drop: true,
    Exchange: false,
    Storage: false,
    Cart: false,
    NPCSale: false,
    Mail: false,
    Auction: false,
    GuildStorage: false
  });
});

test("rejects rows with missing move flags", () => {
  assert.equal(parseItemMoveInfoColumns(["31454", "1", "0"]), null);
  assert.equal(parseItemMoveInfoColumns(["31454", "1", "0", "0", "0", "0", "0", "0", "0", "extra"]), null);
});
