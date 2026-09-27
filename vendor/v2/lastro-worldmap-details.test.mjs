import assert from "node:assert/strict";
import test from "node:test";
import { getWorldMapFloorOptions, resolveWorldMapDisplayName } from "./lastro-worldmap-details.mjs";

const worldData = {
  aldebaran: { name: "艾尔帕兰", branch: ["c_tower1", "c_tower2", "c_tower3", "c_tower4"] },
  c_tower1: { name: "钟塔1层", belong: "aldebaran" },
  c_tower2: { name: "钟塔2层", belong: "aldebaran" },
  c_tower3: { name: "钟塔3层", belong: "aldebaran" },
  c_tower4: { name: "钟塔4层", belong: "aldebaran" }
};

test("returns every floor when a parent dungeon map is selected", () => {
  assert.deepEqual(getWorldMapFloorOptions("aldebaran", worldData), [
    { id: "aldebaran", name: "艾尔帕兰", selected: true },
    { id: "c_tower1", name: "钟塔1层", selected: false },
    { id: "c_tower2", name: "钟塔2层", selected: false },
    { id: "c_tower3", name: "钟塔3层", selected: false },
    { id: "c_tower4", name: "钟塔4层", selected: false }
  ]);
});

test("finds the parent and preserves the selected floor for a child map", () => {
  const options = getWorldMapFloorOptions("c_tower2.rsw", worldData);
  assert.equal(options.length, 5);
  assert.equal(options.find((option) => option.selected)?.id, "c_tower2");
  assert.deepEqual(options.map((option) => option.id), [
    "aldebaran", "c_tower1", "c_tower2", "c_tower3", "c_tower4"
  ]);
});

test("returns no floor selector for an ordinary field map", () => {
  assert.deepEqual(getWorldMapFloorOptions("prt_fild08", { prt_fild08: { name: "普隆德拉平原" } }), []);
});

test("uses the local simplified map name before the client map name", () => {
  assert.equal(
    resolveWorldMapDisplayName(
      "tha_t01.rsw",
      "達納托斯塔台下層部博物館入口",
      { tha_t01: { name: "达纳托斯之塔1层" } },
      { "tha_t01.rsw": { name: "達納托斯塔台下層部博物館入口" } }
    ),
    "达纳托斯之塔1层"
  );
});

test("uses the client map name when no local simplified name exists", () => {
  assert.equal(
    resolveWorldMapDisplayName(
      "custom_map.rsw",
      "Big5 fallback",
      {},
      { "custom_map.rsw": { name: "客户端地图名称" } }
    ),
    "客户端地图名称"
  );
});
