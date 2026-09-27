import assert from "node:assert/strict";
import test from "node:test";
import { isPvpEnabled, isPvpMapProperty } from "./lastro-map-state.mjs";

test("treats a flagless free-PVP map property packet as PVP", () => {
  assert.equal(isPvpMapProperty(1), true);
  assert.equal(isPvpEnabled({ type: 1, flag: 0 }), true);
});

test("treats an event-PVP map property packet as PVP", () => {
  assert.equal(isPvpMapProperty(2), true);
  assert.equal(isPvpEnabled({ type: 2, flag: 0 }), true);
});

test("preserves PVP map-flag handling", () => {
  assert.equal(isPvpEnabled({ type: 0, flag: 1 }), true);
});

test("keeps ordinary maps non-PVP without a PVP flag", () => {
  assert.equal(isPvpMapProperty(0), false);
  assert.equal(isPvpEnabled({ type: 0, flag: 0 }), false);
});
