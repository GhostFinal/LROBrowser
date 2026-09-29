import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const FUNCTION_MARKER = "function requestNavigationMove(";

class RequestMove2 {
  constructor() {
    this.dest = [0, 0];
  }
}

class RequestMove {
  constructor() {
    this.dest = [0, 0];
  }
}

function loadHelper(packetVersion, position, sentPackets, diagnostics) {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const markerIndex = source.indexOf(FUNCTION_MARKER);
  assert.notEqual(markerIndex, -1, "Navigation move helper was not found");
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const functionSource = source.slice(functionIndex, index + 1);
      return new Function(
        "PACKET",
        "PacketVerManager_default",
        "SessionStorage_default",
        "Network",
        "globalThis",
        `return (${functionSource});`
      )(
        { CZ: { REQUEST_MOVE2: RequestMove2, REQUEST_MOVE: RequestMove } },
        { value: packetVersion },
        { Entity: { position } },
        { sendPacket: (packet) => sentPackets.push(packet) },
        { roNaviDebug: diagnostics }
      );
    }
  }
  throw new Error("Navigation move helper has unbalanced braces");
}

test("Navigation requests movement with the modern packet", () => {
  const sentPackets = [];
  const requestMove = loadHelper(20240101, [10, 20], sentPackets);

  assert.equal(requestMove(Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, y: 20 })), { x: 30, y: 20 }), true);
  assert.equal(sentPackets.length, 1);
  assert.ok(sentPackets[0] instanceof RequestMove2);
  assert.deepEqual(sentPackets[0].dest, [18, 20]);
});

test("Navigation diagnoses blocked moves and distinguishes send attempts from returned calls", () => {
  const events = [];
  const packets = [];
  const move = loadHelper(20240101, [10, 20], packets, { log: event => events.push(event) });
  move([], { x: 30, y: 20 });
  assert.deepEqual(events, ["move-blocked:missing-path-target-or-player"]);
  const path = Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, y: 20 }));
  assert.equal(move(path, path.at(-1)), true);
  assert.equal(move(path, path.at(-1)), false);
  assert.deepEqual(events.slice(1), ["move-send", "move-send-returned", "move-blocked:waiting-for-move-response"]);
  assert.equal(packets.length, 1);
});

test("Navigation requests movement with the legacy packet", () => {
  const sentPackets = [];
  const requestMove = loadHelper(20180306, [10, 20], sentPackets);

  assert.equal(requestMove(Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, y: 20 })), { x: 30, y: 20 }), true);
  assert.equal(sentPackets.length, 1);
  assert.ok(sentPackets[0] instanceof RequestMove);
  assert.deepEqual(sentPackets[0].dest, [18, 20]);
});

test("Navigation does not request movement for an empty path or reached target", () => {
  const sentPackets = [];
  const requestMove = loadHelper(20240101, [10, 20], sentPackets);

  assert.equal(requestMove([], { x: 14, y: 26 }), false);
  assert.equal(requestMove([{ x: 10, y: 20 }, { x: 14, y: 26 }], { x: 10, y: 20 }), false);
  assert.equal(sentPackets.length, 0);
});

test("Navigation only completes on the target cell", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const marker = "function isNavigationTargetReached(";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "Navigation arrival helper was not found");
  const functionIndex = source.lastIndexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const helper = new Function(`return (${source.slice(functionIndex, index + 1)});`)();
      assert.equal(helper({ x: 10, y: 20 }, { x: 11, y: 21 }), false);
      assert.equal(helper({ x: 11, y: 21 }, { x: 11, y: 21 }), true);
      assert.equal(helper({ x: 10, y: 20 }, { x: 13, y: 21 }), false);
      return;
    }
  }
  throw new Error("Navigation arrival helper has unbalanced braces");
});

function loadNavigationTeleportDecision() {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const marker = "function shouldQuickTeleportNavigation(";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "Navigation teleport decision helper was not found");
  const functionIndex = source.lastIndexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return new Function(`return (${source.slice(functionIndex, index + 1)});`)();
    }
  }
  throw new Error("Navigation teleport decision helper has unbalanced braces");
}

test("Navigation quick-teleports only to non-dungeon maps on another map", () => {
  const shouldQuickTeleport = loadNavigationTeleportDecision();
  assert.equal(shouldQuickTeleport("prontera", "geffen"), true);
  assert.equal(shouldQuickTeleport("prontera", "geffen.gat"), true);
  assert.equal(shouldQuickTeleport("prontera", "gef_dun00"), false);
  assert.equal(shouldQuickTeleport("prontera", "prontera"), false);
});

test("Quick teleport builds the exact /navi command without a private airship packet", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const marker = "function buildLastROQuickNavigationCommand(";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "Quick teleport command helper was not found");
  const functionIndex = source.lastIndexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const request = new Function(
        "normalizeMapName",
        `return (${source.slice(functionIndex, index + 1)});`
      )(
        (map) => String(map || "").replace(/\.gat$/i, "").toLowerCase(),
      );
      assert.equal(request({ outset: ["geffen.gat", 132, 66] }), "navi geffen 132 66");
      assert.equal(request({ path: [["prontera", 10, 20]] }), "navi prontera 10 20");
      return;
    }
  }
  throw new Error("Quick teleport command helper has unbalanced braces");
});

test("Activity map links send the server-provided map and coordinates", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const marker = "function requestChatMapTeleport(";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "Chat map teleport helper was not found");
  const functionIndex = source.lastIndexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      class PrivateAirshipRequest {
        constructor() { this.mapname = ""; this.x = 0; this.y = 0; this.type = 0; }
      }
      const sentPackets = [];
      const request = new Function(
        "normalizeMapName", "PACKET", "buildPrivateAirshipRequest", "Network",
        `return (${source.slice(functionIndex, index + 1)});`
      )(
        (map) => String(map || "").replace(/\.gat$/i, "").toLowerCase(),
        { CZ: { PRIVATE_AIRSHIP_REQUEST: PrivateAirshipRequest } },
        (data) => ({ ...data, itemid: 14527 }),
        { sendPacket: (packet) => sentPackets.push(packet) }
      );
      assert.equal(request({ dataset: { map: "force_map3", x: "100", y: "184" }, getAttribute: () => null }), true);
      assert.deepEqual({ ...sentPackets[0] }, { mapname: "force_map3", x: 100, y: 184, type: 0, itemid: 14527 });
      assert.equal(request({ dataset: { map: "force_map3", x: "100" }, getAttribute: () => null }), false);
      assert.equal(sentPackets.length, 1);
      return;
    }
  }
  throw new Error("Chat map teleport helper has unbalanced braces");
});

test("The /navi command uses the shared navigation target handler", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const commandIndex = source.indexOf("navi: {");
  assert.notEqual(commandIndex, -1, "/navi command was not found");
  const callbackMatch = /callback:\s*function\s*\(text\)/.exec(
    source.slice(commandIndex),
  );
  assert.ok(callbackMatch, "/navi callback was not found");
  const callbackIndex = commandIndex + callbackMatch.index;
  const functionIndex = callbackIndex + callbackMatch[0].indexOf("function");
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const calls = [];
      const callback = new Function(
        "Navigation_default", "MapRenderer", "SessionStorage_default",
        `return (${source.slice(functionIndex, index + 1)});`
      )(
        {
          append: () => calls.push(["append"]),
          setNaviInfo: (...args) => calls.push(["setNaviInfo", ...args])
        },
        { currentMap: "prontera" },
        { Entity: { position: [10, 20] } }
      );
      callback("navi geffen 132 66");
      assert.deepEqual(calls, [
        ["append"],
        ["setNaviInfo", "geffen,132,66", "geffen (132, 66)"]
      ]);
      return;
    }
  }
  throw new Error("/navi callback has unbalanced braces");
});

function workerPath(start, end, existingPath = [], blocked = []) {
  let result;
  const self = { postMessage: (message) => { result = message; } };
  vm.runInNewContext(readFileSync(join(HERE, "PathFindingWorker.js"), "utf8"), { self });
  const cellTypes = new Uint8Array(40 * 40).fill(1);
  for (const [x, y] of blocked) cellTypes[x + y * 40] = 0;
  self.onmessage({ data: { type: "findPath", startX: start.x, startY: start.y,
    endX: end.x, endY: end.y, existingPath, requestId: 17, workerId: "worker",
    mapData: { width: 40, height: 40, cellTypes, walkableType: 1, warps: [] } } });
  return JSON.parse(JSON.stringify(result));
}

test("Navigation worker returns an adjacent route including both endpoints", () => {
  const result = workerPath({ x: 10, y: 20 }, { x: 14, y: 20 }, [], [[12, 20]]);
  const path = result.path;
  assert.deepEqual([path[0].x, path[0].y], [10, 20]);
  assert.deepEqual([path.at(-1).x, path.at(-1).y], [14, 20]);
  for (let i = 1; i < path.length; i++) {
    assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1);
    assert.notDeepEqual([path[i].x, path[i].y], [12, 20]);
  }
  assert.equal(result.requestId, 17);
  assert.equal(result.workerBuild, "20260924-v2-navigation-worker-1");
});

test("Navigation loads the versioned worker and logs its route shape", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  assert.match(source, /PathFindingWorker\.js\?build=20260924-v2-navigation-worker-1/);
  assert.match(source, /workerBuild: data\.workerBuild/);
  assert.match(source, /pathPreview: data\.path\?\.slice\(0, 4\)/);
  assert.match(source, /pathTail: data\.path\?\.slice\(-4\)/);
});

test("Navigation advances a cached path without moving back toward its old start", () => {
  const path = Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, y: 20 }));
  const result = workerPath({ x: 12, y: 20 }, path.at(-1), path);
  assert.deepEqual([result.path[0].x, result.path[0].y], [12, 20]);
  const packets = [];
  const move = loadHelper(20240101, [12, 20], packets);
  assert.equal(move(path, path.at(-1)), true);
  assert.deepEqual(packets[0].dest, [20, 20]);
});

test("Navigation advances up to eight route cells across bends", () => {
  const packets = [];
  const move = loadHelper(20240101, [10, 20], packets);
  const path = [
    { x: 10, y: 20 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 12, y: 21 },
    { x: 12, y: 22 }, { x: 13, y: 22 }, { x: 13, y: 23 }, { x: 14, y: 23 },
    { x: 14, y: 24 }, { x: 15, y: 24 }, { x: 15, y: 25 }
  ];
  assert.equal(move(path, path.at(-1)), true);
  assert.deepEqual(packets[0].dest, [14, 24]);
});

test("Navigation uses the final route cell when fewer than eight remain", () => {
  const packets = [];
  const move = loadHelper(20240101, [10, 20], packets);
  const path = [{ x: 10, y: 20 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 12, y: 21 }];
  assert.equal(move(path, path.at(-1)), true);
  assert.deepEqual(packets[0].dest, [12, 21]);
});

test("Navigation recovers from a position between cached route cells", () => {
  const packets = [];
  const move = loadHelper(20240101, [10, 22], packets);
  const path = Array.from({ length: 11 }, (_, i) => ({ x: 10 + i, y: 20 }));
  assert.equal(move(path, path.at(-1)), true);
  assert.deepEqual(packets[0].dest, [18, 20]);
});

test("Navigation waits for the server movement to finish before sending another segment", () => {
  const sentPackets = [];
  const source = readFileSync(ONLINE_PATH, "utf8");
  const markerIndex = source.indexOf(FUNCTION_MARKER);
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const requestMove = new Function(
        "PACKET", "PacketVerManager_default", "SessionStorage_default", "Network",
        `return (${source.slice(functionIndex, index + 1)});`
      )(
        { CZ: { REQUEST_MOVE2: RequestMove2, REQUEST_MOVE: RequestMove } },
        { value: 20240101 },
        { Entity: { position: [10, 20], walk: { total: 2 } } },
        { sendPacket: (packet) => sentPackets.push(packet) }
      );
      const path = Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, y: 20 }));
      assert.equal(requestMove(path, { x: 30, y: 20 }), false);
      assert.equal(sentPackets.length, 0);
      return;
    }
  }
  throw new Error("Navigation move helper has unbalanced braces");
});

test("LastRO entity walking keeps grid pathfinding enabled", () => {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const start = source.indexOf("function walkTo(from_x, from_y, to_x, to_y, range, moveStartTime)");
  assert.notEqual(start, -1, "Entity walk function was not found");
  const end = source.indexOf("function walkProcess()", start);
  assert.notEqual(end, -1, "Entity walk function boundary was not found");
  const walkSource = source.slice(start, end);

  assert.match(walkSource, /PathFinding_default\.search\(/);
  assert.doesNotMatch(walkSource, /lastroProtocol/);
  assert.doesNotMatch(walkSource, /path\[2\]\s*=\s*to_x/);
});
