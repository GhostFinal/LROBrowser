import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const ONLINE_SOURCE = readFileSync(new URL("./Online.js", import.meta.url), "utf8");

class BinaryWriter {
  constructor(length) {
    this.buffer = new ArrayBuffer(length);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  writeShort(value) {
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  writeULong(value) {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeUChar(value) {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }
}

function extractEnter2Build() {
  const marker = "PACKET.CZ.ENTER2.prototype.build = function()";
  const markerIndex = ONLINE_SOURCE.indexOf(marker);
  assert.notEqual(markerIndex, -1, "CZ_ENTER2 build method was not found");
  const functionIndex = ONLINE_SOURCE.indexOf("function", markerIndex);
  const openBrace = ONLINE_SOURCE.indexOf("{", functionIndex);
  let depth = 0;
  for (let index = openBrace; index < ONLINE_SOURCE.length; ++index) {
    if (ONLINE_SOURCE[index] === "{") ++depth;
    if (ONLINE_SOURCE[index] === "}" && --depth === 0) {
      const source = ONLINE_SOURCE.slice(functionIndex, index + 1);
      return new Function("BinaryWriter", "PacketVerManager_default", "toPacketBytes", "return (" + source + ");")(
        BinaryWriter,
        { value: 20211103 },
        extractToPacketBytes()
      );
    }
  }
  throw new Error("CZ_ENTER2 build method has unbalanced braces");
}

function extractToPacketBytes() {
  const marker = "function toPacketBytes(value, defaultLength)";
  const markerIndex = ONLINE_SOURCE.indexOf(marker);
  assert.notEqual(markerIndex, -1, "toPacketBytes helper was not found");
  const openBrace = ONLINE_SOURCE.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = openBrace; index < ONLINE_SOURCE.length; ++index) {
    if (ONLINE_SOURCE[index] === "{") ++depth;
    if (ONLINE_SOURCE[index] === "}" && --depth === 0) {
      const source = ONLINE_SOURCE.slice(markerIndex, index + 1);
      return new Function("return (" + source + ");")();
    }
  }
  throw new Error("toPacketBytes helper has unbalanced braces");
}

function extractDebugByteHelpers() {
  const start = ONLINE_SOURCE.indexOf("function toPacketBytes(value, defaultLength)");
  const end = ONLINE_SOURCE.indexOf("function shouldUseLegacyMapEnter", start);
  assert.notEqual(start, -1, "debug byte helpers were not found");
  assert.notEqual(end, -1, "debug byte helper boundary was not found");
  return new Function("BinaryWriter", ONLINE_SOURCE.slice(start, end) + "; return { createDebugLegacyMapEnterPacket, getDebugMapEnterBytes, shouldUseDebugLegacyMapEnter, toPacketBytes };")(BinaryWriter);
}

function extractDebugLoginPanelMarkup() {
  const marker = "function getDebugLoginPanelMarkup()";
  const markerIndex = ONLINE_SOURCE.indexOf(marker);
  assert.notEqual(markerIndex, -1, "debug login panel markup function was not found");
  const openBrace = ONLINE_SOURCE.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = openBrace; index < ONLINE_SOURCE.length; ++index) {
    if (ONLINE_SOURCE[index] === "{") ++depth;
    if (ONLINE_SOURCE[index] === "}" && --depth === 0) {
      const source = ONLINE_SOURCE.slice(markerIndex, index + 1);
      return new Function("return (" + source + ");")();
    }
  }
  throw new Error("debug login panel markup function has unbalanced braces");
}

function buildEnter2({ unknown, Sex }) {
  const build = extractEnter2Build();
  return build.call({ unknown, Sex });
}

test("keeps debug login controls inside the login component scope", () => {
  const start = ONLINE_SOURCE.indexOf("function createWinLogin");
  const select = ONLINE_SOURCE.indexOf("function selectLoginServerProfile");

  assert.ok(start < ONLINE_SOURCE.indexOf("function syncDebugLoginFields()", start));
  assert.ok(select > ONLINE_SOURCE.indexOf("function syncDebugLoginFields()", start));
  assert.ok(select > ONLINE_SOURCE.indexOf("function applyDebugLoginFields()", start));
});

test("renders a legacy 0x0072 map entry switch in the debug login panel", () => {
  const getMarkup = extractDebugLoginPanelMarkup();
  const markup = getMarkup();

  assert.match(markup, /class="debug-enter-legacy-map-login-toggle"/);
  assert.match(markup, /type="checkbox"/);
});

test("pads a short unknown field to four bytes while extending Sex", () => {
  const packet = buildEnter2({
    unknown: Uint8Array.from([0x00, 0x00]),
    Sex: Uint8Array.from([0x00, 0x00, 0x01])
  });

  assert.equal(packet.offset, 25);
  assert.deepEqual([...new Uint8Array(packet.buffer)], [
    0x36, 0x04,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01
  ]);
});

test("normalizes a short debug unknown override to four bytes", () => {
  const { getDebugMapEnterBytes } = extractDebugByteHelpers();
  const bytes = getDebugMapEnterBytes("0x0000", Uint8Array.from([0, 0, 0, 0]));

  assert.deepEqual([...bytes], [0x00, 0x00, 0x00, 0x00]);
});

test("extends CZ_ENTER2 when sex contains more than one byte", () => {
  const packet = buildEnter2({
    unknown: Uint8Array.from([0, 0, 0, 0]),
    Sex: Uint8Array.from([0, 1, 2, 3, 4])
  });

  assert.equal(packet.offset, 27);
  assert.deepEqual([...new Uint8Array(packet.buffer).slice(18)], [
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04
  ]);
});

test("builds the fixed 19-byte 0x0072 map entry frame for debug legacy login", () => {
  const { createDebugLegacyMapEnterPacket } = extractDebugByteHelpers();
  const packet = createDebugLegacyMapEnterPacket();
  packet.AID = 0x01020304;
  packet.GID = 0x11121314;
  packet.AuthCode = 0x21222324;
  packet.clientTime = 0x31323334;
  packet.Sex = 0x45;

  const bytes = packet.build();

  assert.equal(bytes.offset, 19);
  assert.deepEqual([...new Uint8Array(bytes.buffer)], [
    0x72, 0x00,
    0x04, 0x03, 0x02, 0x01,
    0x14, 0x13, 0x12, 0x11,
    0x24, 0x23, 0x22, 0x21,
    0x34, 0x33, 0x32, 0x31,
    0x45
  ]);
});
