import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const BUILD_MARKER = /PACKET\.CZ\.REQ_TRADE_BUYING_STORE\.prototype\.build\s*=\s*function\s*\(\s*\)/;

class RecordingWriter {
  constructor(length) {
    this.length = length;
    this.calls = [];
    this.view = {
      setUint32: (...args) => this.calls.push(["view.setUint32", ...args])
    };
  }

  writeShort(value) {
    this.calls.push(["writeShort", value]);
  }

  writeULong(value) {
    this.calls.push(["writeULong", value]);
  }

  writeUShort(value) {
    this.calls.push(["writeUShort", value]);
  }
}

function readOnlineSource() {
  return readFileSync(ONLINE_PATH, "utf8");
}

function extractBuild(source, packetVersion) {
  const markerIndex = source.search(BUILD_MARKER);
  assert.notEqual(markerIndex, -1, "REQ_TRADE_BUYING_STORE build method was not found");
  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      const functionSource = source.slice(functionIndex, index + 1);
      return new Function("BinaryWriter", "PacketVerManager_default", `return (${functionSource});`)(
        RecordingWriter,
        { value: packetVersion }
      );
    }
  }
  throw new Error("REQ_TRADE_BUYING_STORE build method has unbalanced braces");
}

function buildPacket(packetVersion, item) {
  const build = extractBuild(readOnlineSource(), packetVersion);
  return build.call({
    getPacketVersion: () => [0, 0x1234, 0, 0],
    AID: 0,
    UniqueID: 0,
    itemList: [item]
  });
}

test("uses four-byte item IDs for buying-store trades from 2018-07-04", () => {
  const packet = buildPacket(20240101, {
    index: 7,
    ITID: 0x12345678,
    count: 3
  });

  assert.equal(packet.length, 20);
  assert.deepEqual(packet.calls, [
    ["writeShort", 0x1234],
    ["writeShort", 20],
    ["writeULong", 0],
    ["writeULong", 0],
    ["writeUShort", 7],
    ["writeULong", 0x12345678],
    ["writeShort", 3]
  ]);
});

test("keeps the six-byte item layout for legacy buying-store packets", () => {
  const source = readOnlineSource();
  const build = extractBuild(source, 20180703);
  const packet = build.call({
    getPacketVersion: () => [0, 0x1234, 0, 0],
    AID: 0,
    UniqueID: 0,
    itemList: [{
      index: 7,
      ITID: 0x3456,
      count: 3
    }]
  });

  assert.equal(packet.length, 18);
  assert.deepEqual(packet.calls, [
    ["writeShort", 0x1234],
    ["writeShort", 18],
    ["writeULong", 0],
    ["writeULong", 0],
    ["writeUShort", 7],
    ["writeUShort", 0x3456],
    ["writeShort", 3]
  ]);
});
