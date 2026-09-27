import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseLastROFrameHeader } from './lastro-packet-framing.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, 'Online.js');

class BinaryReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.length = buffer.byteLength;
  }

  readUShort() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  seek(offset) {
    this.offset = offset;
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

function loadReceiveHarness(decodedPackets) {
  const source = readFileSync(ONLINE_PATH, 'utf8');
  const receiveSource = extractFunction(source, 'function receive(buf)');
  const packetLength = (packetId) => ({ 0x09fd: -1, 0x09ff: -1, 0x009d: 17, 0x00f2: 6, 0x0171: 30, 0x0bad: 4 })[packetId] || false;
  const packets = {
    list: {
      0x09fd: {
        name: 'PACKET_ZC_LASTRO_NOTIFY_MOVEENTRY9',
        Struct: function Struct(fp, end) {
          decodedPackets.push({ id: 0x09fd, start: fp.tell(), end, payload: fp.view.getUint8(fp.tell()) });
        }
      },
      0x009d: {
        name: 'PACKET_ZC_LASTRO_ITEM_ENTRY',
        Struct: function Struct() {
          decodedPackets.push({ id: 0x009d });
        }
      },
      0x09ff: {
        name: 'PACKET_ZC_LASTRO_NOTIFY_NEWENTRY9',
        Struct: function Struct(fp, end) {
          decodedPackets.push({ start: fp.tell(), end, payload: fp.view.getUint8(fp.tell()) });
        }
      },
      0xaaaa: { name: 'REGISTERED_WITHOUT_LENGTH', Struct: function Struct() {} }
    }
  };
  for (const id of [0x00f2, 0x0171]) packets.list[id] = {
    name: 'UI_PACKET',
    Struct: function UIFrame() {},
    callback: () => decodedPackets.push({ id })
  };
  const buildHarness = new Function(
    'BinaryReader',
    'parseLastROFrameHeader',
    'packetLength',
    'Packets',
    `
      let _save_buffer = null;
      let _receive_yield_pending = false;
      const socket = { close() { socket.closeCount++; }, closeCount: 0 };
      const _receiveStates = new WeakMap();
      ${extractFunction(source, 'function createReceiveState()')}
      ${extractFunction(source, 'function getReceiveState(socket)')}
      ${extractFunction(source, 'function clearReceiveState(socket)')}
      const state = getReceiveState(socket);
      const errors = [];
      const console = { log() {}, warn() {}, error(message) { errors.push(message); } };
      const Configs = { get: (key) => key === 'lastroProtocol' || key === 'lastroCustomPackets' };
      const CARD_CONNECTION_PACKET_IDS = { rechargeList: 0x0ad6 };
      const getCardConnectionRechargeListFrameDisposition = () => null;
      const PacketVerManager_default = { value: 20180704 };
      const PacketLength_default = { getPacketLength: packetLength };
      const read$1 = { callback: null };
      const runObserverPacketHandler = (callback) => { callback(); return true; };
      const isObserverMode = () => false;
      const SEEK_SET = 2;
      const packetDump = false;
      ${receiveSource}
      return {
        receive: receive.bind(socket),
        getCloseCount: () => socket.closeCount,
        getErrors: () => errors,
        getSavedBytes: () => state.saveBuffer && new Uint8Array(state.saveBuffer)
      };
    `
  );
  return buildHarness(BinaryReader, parseLastROFrameHeader, packetLength, packets);
}

test('receive retains the 09ff header after an incomplete 03 03 marker collision and decodes it after continuation', () => {
  const decodedPackets = [];
  const harness = loadReceiveHarness(decodedPackets);

  harness.receive(new Uint8Array([0x03, 0x03, 0xff, 0x09]).buffer);
  assert.deepEqual([...harness.getSavedBytes()], [0xff, 0x09]);

  const continuation = new Uint8Array(112);
  continuation.set([0x72, 0x00]);
  harness.receive(continuation.buffer);

  assert.deepEqual(decodedPackets, [{ start: 4, end: 114, payload: 0 }]);
  assert.equal(harness.getSavedBytes(), null);
});

test('receive retains the 09fd header after an incomplete 03 03 marker and decodes it after continuation', () => {
  const decodedPackets = [];
  const harness = loadReceiveHarness(decodedPackets);

  harness.receive(new Uint8Array([0x03, 0x03, 0xfd, 0x09]).buffer);
  assert.deepEqual([...harness.getSavedBytes()], [0xfd, 0x09]);

  const continuation = new Uint8Array(112);
  continuation.set([0x72, 0x00]);
  harness.receive(continuation.buffer);

  assert.deepEqual(decodedPackets, [{ id: 0x09fd, start: 4, end: 114, payload: 0 }]);
  assert.equal(harness.getSavedBytes(), null);
});

for (const [id, length] of [[0x00f2, 6], [0x0171, 30]]) {
  test(`unknown packet discards the rest of its receive chunk and resumes at the next chunk (0x${id.toString(16)})`, () => {
    const decoded = [];
    const harness = loadReceiveHarness(decoded);
    const bytes = new Uint8Array(4 + length);
    bytes.set([0xfe, 0xfe, 0xab, 0xcd, id & 255, id >> 8]);
    harness.receive(bytes.buffer);
    assert.deepEqual(decoded, []);
    assert.equal(harness.getCloseCount(), 0);
    assert.equal(harness.getSavedBytes(), null);
    assert.match(harness.getErrors()[0], /Packet "0xfefe" not registered/);

    harness.receive(new Uint8Array([0xf2, 0x00, 1, 2, 3, 4]).buffer);
    assert.deepEqual(decoded, [{ id: 0x00f2 }]);
    assert.equal(harness.getCloseCount(), 0);
    assert.equal(harness.getSavedBytes(), null);
  });
}

test('unknown 0c0c after 009d discards trailing packet-like bytes without waiting or disconnecting', () => {
  const decoded = [];
  const harness = loadReceiveHarness(decoded);
  const bytes = new Uint8Array(17 + 2 + 6);
  bytes.set([0x9d, 0x00]);
  bytes.set([0x0c, 0x0c, 0xf2, 0, 0, 0, 0, 0], 17);
  harness.receive(bytes.buffer);
  assert.deepEqual(decoded, [{ id: 0x009d }]);
  assert.equal(harness.getSavedBytes(), null);
  assert.equal(harness.getCloseCount(), 0);
});

test('unregistered packet with a known packet-table length still discards the rest of its receive chunk', () => {
  const decoded = [];
  const harness = loadReceiveHarness(decoded);
  harness.receive(new Uint8Array([0xad, 0x0b, 0xaa, 0xbb, 0xf2, 0, 1, 2, 3, 4]).buffer);
  assert.deepEqual(decoded, []);
  assert.equal(harness.getSavedBytes(), null);
  assert.equal(harness.getCloseCount(), 0);
});

test('registered packet with no length definition still stops as desynchronized', () => {
  const decoded = [];
  const harness = loadReceiveHarness(decoded);
  harness.receive(new Uint8Array([0xaa, 0xaa]).buffer);
  assert.deepEqual(decoded, []);
  assert.equal(harness.getSavedBytes(), null);
  assert.equal(harness.getCloseCount(), 1);
  assert.match(harness.getErrors()[0], /Stream desynchronized at packet 0xaaaa/);
});

test('invalid variable packet length stops decoding before payload-like UI bytes', () => {
  const decoded = [];
  const harness = loadReceiveHarness(decoded);
  harness.receive(new Uint8Array([0xff, 0x09, 0x03, 0, 0xf2, 0, 0, 0, 0, 0]).buffer);
  assert.deepEqual(decoded, []);
  assert.equal(harness.getCloseCount(), 1);
});

test('valid fixed packets survive every WebSocket split position', () => {
  const bytes = new Uint8Array([0xf2, 0, 0, 0, 0, 0]);
  for (let split = 1; split < bytes.length; split++) {
    const decoded = [];
    const harness = loadReceiveHarness(decoded);
    harness.receive(bytes.slice(0, split).buffer);
    assert.deepEqual(decoded, []);
    harness.receive(bytes.slice(split).buffer);
    assert.deepEqual(decoded, [{ id: 0x00f2 }]);
    assert.equal(harness.getCloseCount(), 0);
    assert.equal(harness.getSavedBytes(), null);
  }
});
