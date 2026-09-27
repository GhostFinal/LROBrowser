import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationDebug, NAVI_DEBUG_BUILD } from "./lastro-navigation-debug.mjs";

function harness(options = {}) {
  let time = 1000;
  let heartbeat;
  let cancelled = 0;
  const lines = [];
  const debug = createNavigationDebug({ now: () => time, output: line => lines.push(line),
    schedule: fn => { heartbeat = fn; return 1; }, cancel: () => cancelled++, ...options });
  return { debug, lines, advance: ms => { time += ms; }, beat: () => heartbeat(),
    get cancelled() { return cancelled; } };
}

test("navigation logs preserve snapshots and identify the deployed diagnostic build", () => {
  const position = [10, 20];
  const h = harness({ snapshot: () => ({ position }) });
  h.debug.begin("/navi");
  position[0] = 30;
  assert.match(h.debug.dump(), new RegExp(NAVI_DEBUG_BUILD));
  assert.match(h.debug.dump(), /"position":\[10,20\]/);
  h.beat();
  assert.match(h.debug.dump(), /"event":"watchdog".*"position":\[30,20\]/);
});

test("throttled navigation events skip snapshot work and buffer size stays bounded", () => {
  const h = harness({ capacity: 4 });
  let evaluated = 0;
  h.debug.begin("map-click");
  for (let i = 0; i < 100; i++) h.debug.log("render", () => { evaluated++; return { i }; }, 2000);
  assert.equal(evaluated, 1);
  h.advance(2000);
  h.debug.log("render", () => { evaluated++; return {}; }, 2000);
  assert.equal(evaluated, 2);
  for (let i = 0; i < 10; i++) h.debug.log("send", { i });
  assert.equal(h.debug.dump().split("\n").length, 5);
});

test("diagnostic errors cannot escape into gameplay", () => {
  const h = harness({ snapshot: () => { throw new Error("snapshot"); }, output: () => { throw new Error("console"); } });
  assert.doesNotThrow(() => h.debug.begin("map-click"));
  assert.doesNotThrow(() => h.debug.log("bad", () => { throw new Error("bad"); }));
  assert.doesNotThrow(() => h.beat());
});

test("manual and timed stopping silence logs and release the watchdog", () => {
  const h = harness();
  h.debug.begin("/navi");
  h.debug.stop();
  const before = h.debug.dump();
  h.debug.log("hidden");
  assert.equal(h.debug.dump(), before);
  assert.equal(h.cancelled, 1);
  h.debug.begin("map-click");
  h.advance(120000);
  h.beat();
  assert.equal(h.debug.active, false);
  assert.equal(h.cancelled, 2);
  assert.match(h.debug.dump(), /two-minute-limit/);
});
