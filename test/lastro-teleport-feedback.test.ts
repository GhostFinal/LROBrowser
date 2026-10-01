// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLastroTeleportFeedback, patchRuntimeTeleportFeedback } from '../scripts/lastro-teleport-feedback.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeTeleportFeedback(native);
const generated = readFileSync('generated/runtime/Online.js', 'utf8');

function region(source: string, name: string) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + name);
  return source.slice(start, end);
}

function functionCode(source: string, names: string[]) {
  const file = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names.map(name => {
    const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (nodes.length !== 1) throw new Error('Missing/ambiguous native function: ' + name);
    return nodes[0]!.getText(file);
  }).join('\n');
}

function packetCode(source: string, name: string) {
  const start = source.indexOf('  PACKET.ZC.' + name + ' =');
  if (start < 0) return '';
  const marker = '  PACKET.ZC.' + name + '.size = ';
  const size = source.indexOf(marker, start), end = source.indexOf(';', size);
  if (size < 0 || end < 0) throw new Error('Missing native packet size: ' + name);
  return source.slice(start, end + 1);
}

function mainCode(source: string) {
  const code = functionCode(region(source, 'src/Engine/MapEngine/Main.js'),
    source === patched ? ['showLastroTeleportNotice', 'MainEngine$11'] : ['MainEngine$11']);
  const file = ts.createSourceFile('main.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const callbacks = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'Network.hookPacket') {
      const callback = node.arguments[1];
      if (callback && ts.isIdentifier(callback) && callback.text !== 'lastroPrivateAirshipFeedback') callbacks.add(callback.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { code, callbacks: [...callbacks] };
}

const main = mainCode(patched), oldMain = mainCode(native);
const network = functionCode(region(native, 'src/Network/NetworkManager.js'),
  ['Packets', 'createReceiveState', 'getReceiveState', 'clearReceiveState', 'registerPacket', 'hookPacket', 'receive']);
const reader = region(native, 'src/Utils/BinaryReader.js');
const framing = readFileSync('vendor/v2/lastro-packet-framing.mjs', 'utf8').replace(/^export\s+/gm, '');
const announceCode = ['src/UI/Components/Announce/Announce.html?raw', 'src/UI/Components/Announce/Announce.css?raw',
  'src/UI/Components/Announce/Announce.js'].map(name => region(generated, name)).join('\n');

function registration(source: string) {
  const file = ts.createSourceFile('register.js', region(source, 'src/Network/PacketRegister.js'), ts.ScriptTarget.Latest, true);
  const entries: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && ['2634', '194'].includes(node.name.getText(file))) entries.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return entries.join(',\n');
}
const registered = registration(patched), oldRegistered = registration(native);

interface NativeAnnounce {
  _host: HTMLElement;
  canvas: HTMLCanvasElement;
  needFocus: boolean;
  mouseMode: number;
  set(message: string, color?: string, options?: { life: number }): void;
  remove(): void;
}
interface ReceiveHarness {
  receive(bytes: Uint8Array): void;
  notice(message: string): void;
  saved(): Uint8Array | null;
  count(): number;
}

function fixture(options: { old?: boolean; year?: 2018 | 2025; rejectThrows?: boolean; chatThrows?: boolean } = {}) {
  const canvasContext = { font: '', fillStyle: '', textAlign: '', textBaseline: '',
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })), fillRect: vi.fn(), fillText: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvasContext as unknown as CanvasRenderingContext2D);
  const Events = { setTimeout: vi.fn((callback: () => void, delay: number) => setTimeout(callback, delay)), clearTimeout: vi.fn(clearTimeout) };
  const chats = vi.fn<(message: string, type: number, filter: number) => void>(() => { if (options.chatThrows) throw new Error('chat failure'); });
  const rejected = vi.fn<(message: string, response: number) => void>(() => { if (options.rejectThrows) throw new Error('route hook failure'); });
  const follow = vi.fn(), errors = vi.fn(), warnings = vi.fn();
  const context = vm.createContext({ window, self: window, document, ArrayBuffer, Uint8Array, Uint16Array,
    Int32Array, Float32Array, DataView, setTimeout, clearTimeout, Events,
    console: { log() {}, warn: warnings, error: errors },
    __esmMin: (fn: () => void) => { let done = false; return () => { if (!done) { done = true; fn(); } }; },
    __exportAll: (value: unknown) => value,
    init_Struct() {}, init_CodepageManager() {}, init_Events() {}, init_Renderer() {}, init_UIManager() {}, init_GUIComponent() {},
    Renderer: { width: 800, height: 600 }, Configs: { get: (key: string) => ['lastroProtocol', 'lastroCustomPackets'].includes(key) },
    PacketVerManager_default: { value: options.year === 2018 ? 20180704 : 20250101 },
    ChatBox_default: { addText: chats, TYPE: { ERROR: 8 }, FILTER: { PUBLIC_LOG: 64 } },
    LastROTools: { _lastroTeleportRejected: rejected },
    UIManager: { addComponent: (component: NativeAnnounce) => component },
    PACKET: { ZC: {}, CZ: {} },
    CARD_CONNECTION_PACKET_IDS: { rechargeList: 0x0ad6 }, getCardConnectionRechargeListFrameDisposition: () => null,
    runObserverPacketHandler: (callback: () => void) => { callback(); return true; }, isObserverMode: () => false,
  });
  const activeMain = options.old ? oldMain : main;
  activeMain.callbacks.forEach(name => { context[name] = () => {}; });
  context.onPlayerCountAnswer = (packet: { count: number }) => follow(packet.count);
  const year = options.year ?? 2025;
  const table = region(native, `src/Network/Packets/packets${year}_len_main.js`);
  const packets = packetCode(options.old ? native : patched, 'PRIVATE_AIRSHIP_RESPONSE') + '\n' + packetCode(native, 'USER_COUNT');
  vm.runInContext(`
    class GUIComponent {
      static MouseMode = { CROSS: 0 };
      constructor() { this._host = document.createElement('div'); this.root = this._host.attachShadow({mode:'open'}); }
      getRoot() { return this.root; }
      append() {
        if (!this.loaded) { this.loaded = true; this.root.innerHTML = this.render(); this.init(); }
        document.body.append(this._host);
      }
      remove() { this.onRemove?.(); this._host.remove(); }
    }
    ${announceCode}
    ${reader}
    init_BinaryReader();
    ${framing}
    ${table}
    init_packets${year}_len_main();
    const lengths = packets${year}_len_main_default.init(PacketVerManager_default.value);
    const PacketLength_default = { getPacketLength: id => lengths[id] || false };
    ${packets}
    ${network}
    Packets.list = [];
    const registry = { ${options.old ? oldRegistered : registered} };
    Object.keys(registry).forEach(id => registerPacket(Number(id), registry[id]));
    const Network = { hookPacket: (packet, callback) => { if (packet) hookPacket(packet, callback); } };
    let _save_buffer = null, _receive_yield_pending = false;
    const _receiveStates = new WeakMap();
    const socket = {}, state = getReceiveState(socket);
    const read$1 = { callback: null }, packetDump = false, SEEK_SET = 2;
    ${activeMain.code}
    MainEngine$11();
    globalThis.harness = {
      receive: receive.bind(socket),
      notice: ${options.old ? '() => {}' : 'showLastroTeleportNotice'},
      saved: () => state.saveBuffer && new Uint8Array(state.saveBuffer),
      count: () => Object.keys(Packets.list).length,
    };
  `, context);
  const harness = context.harness as ReceiveHarness;
  const announce = () => vm.runInContext('Announce_default', context) as NativeAnnounce | undefined;
  return { harness, announce, canvasContext, Events, chats, rejected, follow, errors, warnings };
}

function frame(id: number, value: number) {
  const bytes = new Uint8Array(6), view = new DataView(bytes.buffer);
  view.setUint16(0, id, true); view.setInt32(2, value, true); return bytes;
}
function batch(...frames: Uint8Array[]) {
  const bytes = new Uint8Array(frames.reduce((count, value) => count + value.length, 0));
  let offset = 0; for (const value of frames) { bytes.set(value, offset); offset += value.length; } return bytes;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('explicit server teleport rejection feedback', () => {
  it.each([
    [2, '背包中没有 VIP 卡或传送券'], [3, '该地图不支持传送'], [4, '未知地图'],
  ])('maps response %s from a real packet into native five-second yellow notice and persistent chat', (response, text) => {
    const f = fixture(); f.harness.receive(frame(0x0a4a, response as number));
    expect(f.chats).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(text as string), 8, 64);
    expect(f.rejected).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(text as string), response);
    expect(f.canvasContext.fillText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(text as string), 10, 17);
    expect(f.canvasContext.fillStyle).toBe('#FFFF00');
    expect(f.Events.setTimeout).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 5000);
    expect(f.announce()?._host.isConnected).toBe(true); expect(f.announce()?.needFocus).toBe(false);
    expect(f.announce()?.mouseMode).toBe(0); expect(f.errors).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999); expect(f.announce()?._host.isConnected).toBe(true);
    vi.advanceTimersByTime(1); expect(f.announce()?._host.isConnected).toBe(false);
    expect(f.chats).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1, 5, -1, 2147483647])('does not invent rejection or success for an undocumented response %s', response => {
    const f = fixture(); f.harness.receive(frame(0x0a4a, response));
    expect(f.chats).not.toHaveBeenCalled(); expect(f.rejected).not.toHaveBeenCalled();
    expect(f.announce()).toBeUndefined(); expect(f.errors).not.toHaveBeenCalled();
  });

  it.each([2018, 2025] as const)('retains following packets with the native %s length table', year => {
    const f = fixture({ year });
    f.harness.receive(batch(new Uint8Array([3, 3]), frame(0x0a4a, 2), frame(194, 123)));
    expect(f.chats).toHaveBeenCalledOnce(); expect(f.follow).toHaveBeenCalledExactlyOnceWith(123);
    expect(f.harness.saved()).toBeNull(); expect(f.harness.count()).toBe(2); expect(f.errors).not.toHaveBeenCalled();
  });

  it('demonstrates the old unregistered response discarding the rest of a native receive batch', () => {
    const f = fixture({ old: true }); f.harness.receive(batch(frame(0x0a4a, 2), frame(194, 123)));
    expect(f.chats).not.toHaveBeenCalled(); expect(f.follow).not.toHaveBeenCalled();
    expect(f.errors).toHaveBeenCalledWith(expect.stringContaining('0xa4a'));
    f.harness.receive(frame(194, 321)); expect(f.follow).toHaveBeenCalledExactlyOnceWith(321);
  });

  it.each([1, 2, 3, 4, 5])('buffers a response split after byte %s and consumes its signed 32-bit field once', split => {
    const f = fixture(), bytes = batch(frame(0x0a4a, 4), frame(194, 77));
    f.harness.receive(bytes.subarray(0, split)); expect(f.chats).not.toHaveBeenCalled();
    f.harness.receive(bytes.subarray(split)); expect(f.chats).toHaveBeenCalledOnce();
    expect(f.rejected).toHaveBeenCalledWith(expect.any(String), 4); expect(f.follow).toHaveBeenCalledExactlyOnceWith(77);
    expect(f.harness.saved()).toBeNull(); expect(f.errors).not.toHaveBeenCalled();
  });

  it('renews the native notice timer and cleans it when the native component is removed', () => {
    const f = fixture(); f.harness.receive(frame(0x0a4a, 2)); vi.advanceTimersByTime(4000);
    f.harness.receive(frame(0x0a4a, 3)); expect(f.Events.clearTimeout).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000); expect(f.announce()?._host.isConnected).toBe(true);
    f.announce()?.remove(); expect(vi.getTimerCount()).toBe(0);
  });

  it('exposes the same native announcement function for other verified teleport notices', () => {
    const f = fixture(); f.harness.notice('已在目标地图。');
    expect(f.canvasContext.fillText).toHaveBeenCalledWith('已在目标地图。', 10, 17);
    expect(f.Events.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(f.chats).not.toHaveBeenCalled(); expect(f.rejected).not.toHaveBeenCalled();
  });

  it.each(['chatThrows', 'rejectThrows'] as const)('keeps native receive progress if %s fails', key => {
    const f = fixture({ [key]: true });
    expect(() => f.harness.receive(batch(frame(0x0a4a, 2), frame(194, 456)))).not.toThrow();
    expect(f.follow).toHaveBeenCalledExactlyOnceWith(456); expect(f.rejected).toHaveBeenCalledOnce();
    expect(f.announce()?._host.isConnected).toBe(true); expect(f.warnings).toHaveBeenCalledOnce();
  });

  it('isolates all display callbacks including a throwing error reporter', () => {
    const writeChat = vi.fn(), onRejected = vi.fn(), onError = vi.fn(() => { throw new Error('report failure'); });
    const handler = createLastroTeleportFeedback({ showNotice: () => { throw new Error('canvas failure'); }, writeChat, onRejected, onError });
    expect(handler({ response: 2 })).toBe(true); expect(writeChat).toHaveBeenCalledOnce(); expect(onRejected).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    for (const response of [undefined, null, '2', {}, NaN]) expect(handler({ response })).toBe(false);
    expect(handler(null)).toBe(false); expect(handler(undefined)).toBe(false); expect(onRejected).toHaveBeenCalledOnce();
  });
});

describe('narrow teleport response runtime patch', () => {
  it('does not alter request constructors, other packet registrations or unrelated native components', () => {
    expect(packetCode(patched, 'USER_COUNT')).toBe(packetCode(native, 'USER_COUNT'));
    expect(region(patched, 'src/UI/Components/NpcBox/NpcBox.js')).toBe(region(native, 'src/UI/Components/NpcBox/NpcBox.js'));
    expect(region(patched, 'src/Network/NetworkManager.js')).toBe(region(native, 'src/Network/NetworkManager.js'));
    const start = native.indexOf('  PACKET.CZ.PRIVATE_AIRSHIP_REQUEST ='), end = native.indexOf('  PACKET.CZ.CHECK_BIN =', start);
    expect(start >= 0 && end > start).toBe(true);
    const patchedStart = patched.indexOf('  PACKET.CZ.PRIVATE_AIRSHIP_REQUEST =');
    expect(patched.slice(patchedStart, patched.indexOf('  PACKET.CZ.CHECK_BIN =', patchedStart))).toBe(native.slice(start, end));
  });

  it('skips absent regions and rejects applying the same patch twice', () => {
    expect(patchRuntimeTeleportFeedback('const unrelated = 1;')).toBe('const unrelated = 1;');
    expect(() => patchRuntimeTeleportFeedback(patched)).toThrow('anchor:teleport-feedback:already-installed');
  });

  it.each([
    ['src/Network/PacketStructure.js', '  PACKET.ZC.CHECK_RECEIVE_CHARACTER_NAME2.size = 34;'],
    ['src/Network/PacketRegister.js', '    2638: PACKET.ZC.RANDOM_COMBINE_ITEM_UI_OPEN,'],
    ['src/Engine/MapEngine/Main.js', 'function MainEngine$11() {'],
  ])('rejects missing or ambiguous anchors in %s', (name, anchor) => {
    const code = region(native, name) + '\n//#endregion';
    expect(() => patchRuntimeTeleportFeedback(code.replace(anchor, ''))).toThrow('anchor:teleport-feedback');
    expect(() => patchRuntimeTeleportFeedback(code.replace(anchor, anchor + '\n' + anchor))).toThrow('anchor:teleport-feedback');
    expect(() => patchRuntimeTeleportFeedback(code + '\n' + code)).toThrow('anchor:teleport-feedback');
    expect(() => patchRuntimeTeleportFeedback(region(native, name))).toThrow('anchor:teleport-feedback');
  });
});
