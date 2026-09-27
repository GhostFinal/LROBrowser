import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, 'Online.js');

class StrictBinaryReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  ensureAvailable(length) {
    if (this.offset + length > this.bytes.byteLength) {
      throw new RangeError(`read past packet boundary at ${this.offset} for ${length} bytes`);
    }
  }

  readULong() {
    this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUChar() {
    this.ensureAvailable(1);
    return this.bytes[this.offset++];
  }

  readShort() {
    this.ensureAvailable(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  tell() {
    return this.offset;
  }
}

function extractFunction(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} was not found`);

  const functionIndex = source.indexOf('function', markerIndex);
  const openBrace = source.indexOf('{', functionIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === '{') ++depth;
    if (source[index] === '}' && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }
  throw new Error(`${marker} has unbalanced braces`);
}

function loadLastROItemEntry() {
  const source = readFileSync(ONLINE_PATH, 'utf8');
  const functionSource = extractFunction(source, 'PACKET.ZC.LASTRO_ITEM_ENTRY = function');
  return new Function(`return (${functionSource});`)();
}

function loadGroundItemHandler(Altitude, ItemObject) {
  const source = readFileSync(ONLINE_PATH, 'utf8');
  const functionSource = extractFunction(source, 'function onItemExistInGround(');
  return new Function('Altitude', 'ItemObject', `return (${functionSource});`)(Altitude, ItemObject);
}

test('decodes a 17-byte LastRO ground-item frame without reading its following marker bytes', () => {
  const ItemEntry = loadLastROItemEntry();
  const reader = new StrictBinaryReader(new Uint8Array([
    0x40, 0x47, 0x00, 0x00,
    0x82, 0x64, 0x00, 0x00,
    0x01,
    0xeb, 0x00,
    0xfb, 0x00,
    0x01, 0x00,
    0x09, 0x09
  ]));

  const packet = new ItemEntry(reader, 15);

  assert.equal(reader.offset, 15);
  assert.deepEqual({ ...packet }, {
    ITAID: 18240,
    ITID: 25730,
    IsIdentified: 1,
    xPos: 235,
    yPos: 251,
    count: 1,
    subX: 0,
    subY: 0
  });
});

test('places a ground item at its tile center when LastRO sub-tile coordinates are absent', () => {
  const altitudeCalls = [];
  const addedItems = [];
  const handler = loadGroundItemHandler({
    getCellHeight: (x, y) => {
      altitudeCalls.push([x, y]);
      return 17;
    }
  }, {
    add: (...item) => addedItems.push(item)
  });

  handler({
    ITAID: 18240,
    ITID: 25730,
    IsIdentified: 1,
    xPos: 235,
    yPos: 251,
    count: 1
  });

  assert.deepEqual(altitudeCalls, [[234.5, 250.5]]);
  assert.deepEqual(addedItems, [[18240, 25730, 1, 1, 234.5, 250.5, 17]]);
});
