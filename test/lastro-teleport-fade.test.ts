// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLastroTeleportFade, patchRuntimeTeleportFade } from '../scripts/lastro-teleport-fade.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeTeleportFade(vendor);
function region(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region ' + path);
  return source.slice(start, end);
}
function parts(source: string) {
  const file = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods = new Map<string, string[]>(), functions = new Map<string, string>();
  for (const node of file.statements) if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(file));
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && (ts.isClassExpression(node.parent) || ts.isClassDeclaration(node.parent))) {
      const name = node.name.getText(file); methods.set(name, [...(methods.get(name) ?? []), node.getText(file)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return {
    method(name: string) {
      const found = methods.get(name); if (found?.length !== 1) throw new Error('Missing or duplicate native method ' + name);
      return found[0]!;
    },
    function(name: string) { const found = functions.get(name); if (!found) throw new Error('Missing native function ' + name); return found; },
  };
}
const rendererPath = 'src/Renderer/MapRenderer.js';
const renderer = parts(region(patched, rendererPath));
const nativeRenderer = parts(region(vendor, 'src/Renderer/Renderer.js'));
const background = parts(region(vendor, 'src/UI/Background.js'));
const htmlHelper = parts(region(vendor, 'src/Utils/HtmlHelper.js'));
const entities = parts(region(patched, 'src/Engine/MapEngine/Entity.js'));
const mapEngine = parts(region(vendor, 'src/Engine/MapEngine.js'));
function packetConstructor(name: string) {
  const text = vendor.match(new RegExp(`PACKET\\.ZC\\.${name} = function [^{]+\\{[^}]+\\};`))?.[0];
  if (!text) throw new Error('Missing native packet constructor ' + name);
  return text;
}
const helperFile = ts.createSourceFile('helpers.js', patched.slice(0, patched.indexOf('//#region ' + rendererPath)), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const helper = helperFile.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(helperFile) === 'LastROTeleportFade'));
if (helper.length !== 1) throw new Error('Missing actual serialized teleport fade factory');

interface FadeAnimation { onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn>; }
const disposers: Array<() => void> = [];
const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
let animations: FadeAnimation[], animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); animations = [];
  animate = vi.fn(() => { const animation: FadeAnimation = { onfinish: null, cancel: vi.fn() }; animations.push(animation); return animation; });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren();
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor); else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor); else delete (window as Partial<Window>).matchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else Reflect.deleteProperty(document, 'hidden');
});
const overlay = () => document.querySelector<HTMLElement>('[data-lastro-teleport-fade]');
function fadeFixture() { const fade = createLastroTeleportFade({ document }); disposers.push(fade.reset); return fade; }

describe('teleport fade lifecycle', () => {
  it('does nothing until explicitly played and waits for a completed frame before fading', () => {
    const fade = fadeFixture(); fade.reveal(); expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    fade.play(); expect(overlay()).not.toBeNull(); expect(overlay()!.style.pointerEvents).toBe('none');
    vi.advanceTimersByTime(600); expect(animate).not.toHaveBeenCalled(); expect(overlay()).not.toBeNull();
    fade.reveal(); expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0.3 }, { opacity: 0 }], expect.objectContaining({ duration: 350 }));
    fade.reveal(); expect(animate).toHaveBeenCalledOnce();
    animations[0]!.onfinish!(); expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans an unfinished animation with the fallback timer', () => {
    const fade = fadeFixture(); fade.play(); fade.reveal();
    vi.advanceTimersByTime(449); expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(overlay()).toBeNull(); expect(animations[0]!.cancel).toHaveBeenCalledOnce();
  });

  it('cleans a pending overlay when no frame ever renders', () => {
    const fade = fadeFixture(); fade.play(); vi.advanceTimersByTime(1999); expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
    fade.reveal(); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('replaces a prior transition without stacked overlays or stale cleanup removing the new one', () => {
    const fade = fadeFixture(); fade.play(); fade.reveal(); const previous = animations[0]!;
    vi.advanceTimersByTime(100); fade.play();
    expect(previous.cancel).toHaveBeenCalledOnce(); expect(previous.onfinish).toBeNull();
    expect(document.querySelectorAll('[data-lastro-teleport-fade]')).toHaveLength(1);
    vi.advanceTimersByTime(350); expect(overlay()).not.toBeNull();
    fade.reveal(); animations[1]!.onfinish!(); expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['pending', 'animating'])('resets a %s transition and leaves no timers or opacity layer', phase => {
    const fade = fadeFixture(); fade.play(); if (phase === 'animating') fade.reveal(); fade.reset();
    expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    fade.reveal(); vi.advanceTimersByTime(5000); expect(overlay()).toBeNull();
  });

  it('keeps a short non-spatial fade visible with reduced motion and preserves click-through', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const fade = fadeFixture(); fade.play();
    expect(document.querySelectorAll('[data-lastro-teleport-fade]')).toHaveLength(1);
    expect(overlay()!.style.pointerEvents).toBe('none'); fade.reveal();
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0.3 }, { opacity: 0 }], expect.objectContaining({ duration: 100 }));
    vi.advanceTimersByTime(199); expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['pending', 'animating'])('cleans a %s transition when the document becomes hidden', phase => {
    const fade = fadeFixture(); fade.play(); if (phase === 'animating') fade.reveal();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    fade.play(); expect(overlay()).toBeNull();
  });

  it('removes the layer if the browser cannot start its animation', () => {
    animate.mockImplementationOnce(() => { throw new Error('animation unavailable'); });
    const fade = fadeFixture(); fade.play(); expect(() => fade.reveal()).not.toThrow();
    expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it('is safe without a document or browsing context', () => {
    for (const document of [undefined, window.document.implementation.createHTMLDocument('offline')]) {
      const fade = createLastroTeleportFade({ document }); expect(() => { fade.play(); fade.reveal(); fade.reset(); }).not.toThrow();
    }
    expect(overlay()).toBeNull();
  });
});

interface NativeMap {
  currentMap: string; loading: boolean; onLoad: () => void; onRender(tick: number, gl: object): void;
  setMap(map: string): void; free(): void;
}
function nativeFixture(currentMap = 'prontera.gat') {
  const calls: string[] = [], loads: Array<{ filename: string; complete: (success: boolean, error?: string) => void }> = [];
  const nativeTransitions: Array<() => void> = [];
  const container = document.createElement('div'), canvas = document.createElement('canvas');
  const renderPart = () => ({ render: vi.fn(), free: vi.fn(), init: vi.fn() });
  const actor = (GID: number, position: number[]) => ({
    GID, position, walkTo: vi.fn(), objecttype: 0, effectState: 0, _effectState: 0,
    remove: vi.fn(), aura: { remove: vi.fn(), free: vi.fn(), load: vi.fn() },
  });
  const player = actor(10, [1, 2, 0]), other = actor(11, [3, 4, 0]);
  const context = vm.createContext({
    document, console,
    SoundManager: { stop: vi.fn() }, BGM: { stop: vi.fn(), play: vi.fn() },
    Renderer: { stop: vi.fn(), remove: vi.fn(), init: vi.fn(), show: vi.fn(), getContext: () => ({}), render: vi.fn(() => { calls.push('renderer-start'); expect(animate).not.toHaveBeenCalled(); }) },
    UIManager: { removeComponents: vi.fn(), showErrorBox: vi.fn(() => ({ ui: { css: vi.fn() } })) },
    Cursor: { ACTION: { DEFAULT: 0 }, setType: vi.fn() }, _container: container, _canvas: canvas,
    transition: (callback: () => void) => { calls.push('native-transition'); nativeTransitions.push(callback); },
    Thread: { hook: vi.fn(), send: (_type: string, filename: string, complete: (success: boolean, error?: string) => void) => loads.push({ filename, complete }) },
    onProgressUpdate() {}, onWorldComplete() {}, onGroundComplete() {}, onAltitudeComplete() {}, onModelsComplete() {}, onAnimatedModelComplete() {},
    EntityManager: { add: vi.fn(), removeLife: vi.fn(), removeGID: vi.fn(), free: vi.fn(), clearLifeCache: vi.fn(), render: vi.fn(), intersect: () => null, setOverEntity: vi.fn(), get: (id: number) => id === 10 ? player : id === 11 ? other : undefined },
    Damage: renderPart(), EffectManager: { ...renderPart(), spam: vi.fn(), remove: vi.fn() }, ScreenEffectManager: { ...renderPart(), startMapflagEffect: vi.fn() },
    SpriteRenderer: { init: vi.fn() }, JoystickUI_default: { onRestore: vi.fn(), append: vi.fn() },
    Mouse: { intersect: true, world: { x: 1, y: 2, z: 0 } }, Camera: { update: vi.fn() },
    Sky_default: { ...renderPart(), setUpCloudData: vi.fn(() => calls.push('sky-ready')) },
    Ground_default: renderPart(), Models_default: renderPart(), AnimatedModels_default: renderPart(), GR2ModelRenderer_default: renderPart(), Water_default: renderPart(), GridSelector_default: renderPart(),
    Sounds_default: { ...renderPart(), free: vi.fn() }, Effects_default: { free: vi.fn(), spam: vi.fn() }, SignboardManager: renderPart(),
    Map_default: { fog: false }, Altitude: { intersect: () => false, getCellHeight: () => 5 }, _pos$6: [],
    SessionStorage_default: { Entity: player, AID: player.GID, Playing: true, serverTick: 0 }, MemoryManager: { clean: vi.fn() }, PacketVerManager_default: { value: 20211103 },
    PostProcess: { prepare: vi.fn(), clean: vi.fn(), render: vi.fn(() => calls.push('frame-presented')) },
    DB: { getMap: () => ({}), getAllSignboardsForMap: () => null }, registerPostProcessModules: vi.fn(),
    Entity: { TYPE_PC: 0, TYPE_HOM: 1, TYPE_MERC: 2, VT: { EXIT: 0, DEAD: 1, OUTOFSIGHT: 2, TELEPORT: 3 } },
    StatusState_default: { EffectState: { INVISIBLE: 1, FALCON: 2, WUG: 4 } }, EffectConst_default: {},
    Escape_default: { append: vi.fn(), showDeathMenu: vi.fn() }, haveSiegfriedItem: () => false,
    Events: { process: vi.fn(), setTimeout: vi.fn() }, C_DEATH_SYNC_OFFSET: 200,
  });
  vm.runInContext([
    helper[0]!.getText(helperFile), renderer.function('stripMapExtension'), renderer.function('onMapComplete'),
    `class Background { ${background.method('remove')} static setLoading(callback) { document.body.append(_container, _canvas); callback(); } }`,
    `class MapRenderer { ${['setMap', 'free', 'onRender'].map(name => renderer.method(name)).join('\n')} }`,
    entities.function('onEntityMove'), entities.function('onEntityJump'), entities.function('onEntityVanish'),
  ].join('\n'), context);
  const api = vm.runInContext('({ map: MapRenderer, fade: LastROTeleportFade, move: onEntityMove, jump: onEntityJump, vanish: onEntityVanish })', context) as {
    map: NativeMap; fade: ReturnType<typeof createLastroTeleportFade>; move(packet: object): void; jump(packet: object): void; vanish(packet: object): void;
  };
  Object.assign(api.map, { currentMap, loading: false, fog: {}, light: {}, onLoad: () => calls.push('map-loaded') });
  const originalAnimate = animate.getMockImplementation()!;
  animate.mockImplementation(() => { calls.push('fade-start'); return originalAnimate(); });
  disposers.push(api.fade.reset);
  return { ...api, context, calls, loads, nativeTransitions, player, other, draw: () => api.map.onRender(Date.now(), {}) };
}

function nativePacketFixture(currentMap = 'prontera.gat') {
  const f = nativeFixture(currentMap), frames: Array<(time: number) => void> = [];
  const ui = { append: vi.fn(), setMap: vi.fn() };
  for (const name of ['ChatBox', 'ChatBoxSettings', 'CartItems', 'Vending', 'ChangeCart', 'CartDecoration', 'ShortCuts', 'StatusIcons', 'ShortCut', 'ChatRoomCreate', 'Emoticons', 'FPS', 'Guild', 'WorldMap', 'MobileUI', 'Navigation', 'Roulette']) f.context[name + '_default'] = ui;
  for (const name of ['Controller$5', 'BasicInfoController', 'InventoryController', 'EquipmentController', 'Controller$4', 'controller', 'WinStatsController', 'Controller$3']) f.context[name] = { getUI: () => ui };
  Object.assign(f.context, {
    SkillListMH_default: { homunculus: ui, mercenary: ui }, Plugins: { init: vi.fn() },
    Configs: { get: () => false }, Network: { sendPacket: vi.fn() }, shouldUseLegacyMapEnter: () => true,
    PACKET: { ZC: {}, CZ: { NOTIFY_ACTORINIT: function () {} } },
    resetEntityForMapEntry: (entity: typeof f.player, packet: { xPos: number; yPos: number }) => { entity.position = [packet.xPos, packet.yPos, 5]; },
    GraphicsSettings: { fpslimit: 0, bloom: false },
    _requestAnimationFrame: (callback: (time: number) => void) => { frames.push(callback); return frames.length; },
    _cancelAnimationFrame: vi.fn(), clearInterval: vi.fn(),
  });
  Object.assign(f.context.Camera, { setTarget: vi.fn(), init: vi.fn() });
  Object.assign(f.context.Cursor, { render: vi.fn() });
  // MapRenderer uses the real render scheduling/dispatch methods; only WebGL
  // primitives and unrelated windows are offline stubs.
  vm.runInContext(`class NativeRenderer { ${['_render', 'render', 'stop'].map(name => nativeRenderer.method(name)).join('\n')} }
    Object.assign(NativeRenderer, { getContext: Renderer.getContext, remove: Renderer.remove, init: Renderer.init, show: Renderer.show,
      renderCallbacks: [], rendering: false, frameLimit: 0, tick: 0, updateId: 0, gl: {} });
    Renderer = NativeRenderer;
    ${packetConstructor('NOTIFY_VANISH')}
    ${packetConstructor('NPCACK_MAPMOVE')}
    ${mapEngine.function('onMapChange')}`, f.context);
  const change = vm.runInContext('onMapChange', f.context) as (packet: object) => void;
  const packets = f.context.PACKET.ZC as Record<string, new (reader: object) => object>;
  function decode(name: string, bytes: Uint8Array) {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 2;
    return new packets[name]!({
      readULong() { const value = data.getUint32(offset, true); offset += 4; return value; },
      readUChar() { return data.getUint8(offset++); },
      readShort() { const value = data.getInt16(offset, true); offset += 2; return value; },
      readBinaryString(length: number) { const value = String.fromCharCode(...bytes.slice(offset, offset + length)).replace(/\0.*$/, ''); offset += length; return value; },
    });
  }
  return {
    ...f,
    vanishPacket(id: number, type = 3) { const bytes = new Uint8Array(7), data = new DataView(bytes.buffer); data.setUint16(0, 0x80, true); data.setUint32(2, id, true); bytes[6] = type; f.vanish(decode('NOTIFY_VANISH', bytes)); },
    mapPacket(map = 'prontera.gat', x = 42, y = 67) { const bytes = new Uint8Array(22), data = new DataView(bytes.buffer); data.setUint16(0, 0x91, true); bytes.set([...map].map(char => char.charCodeAt(0)), 2); data.setInt16(18, x, true); data.setInt16(20, y, true); change(decode('NPCACK_MAPMOVE', bytes)); },
    frame() { const callback = frames.shift(); if (!callback) throw new Error('No native frame scheduled'); callback(Date.now()); },
  };
}

function useNativeLoadingOverlay(f: ReturnType<typeof nativePacketFixture>) {
  const cover = document.createElement('div');
  Object.assign(cover.style, { position: 'fixed', inset: '0', background: '#000', zIndex: '1000' });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(Date.now()), 16));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id));
  Object.assign(f.context, {
    _overlay: cover, _overlayAnim: null, _pixelProps: new Set(),
    performance: { now: () => Date.now() }, requestAnimationFrame: window.requestAnimationFrame.bind(window),
    Configs: { get: (name: string) => name === 'transitionDuration' ? 500 : false },
  });
  vm.runInContext(htmlHelper.function('animateElement') + '\n' + background.function('transition'), f.context);
  return cover;
}

describe('native map renderer teleport integration', () => {
  it('does not add a custom fade to the first login or the native cross-map loading transition', () => {
    const f = nativeFixture(''); f.map.setMap('prontera.gat');
    expect(f.loads).toHaveLength(1); expect(f.loads[0]!.filename).toBe('prontera.rsw'); expect(overlay()).toBeNull();
    f.loads[0]!.complete(true); expect(f.nativeTransitions).toHaveLength(1); expect(overlay()).toBeNull();
    f.nativeTransitions[0]!(); f.draw(); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled(); expect(f.map.loading).toBe(false);
  });

  it('starts the same-map fade after the native onLoad callback and reveals only after the first complete render', () => {
    const f = nativeFixture(); f.map.setMap('prontera.gat');
    expect(f.loads).toHaveLength(0); expect(f.nativeTransitions).toHaveLength(0);
    expect(f.calls).toEqual(['map-loaded', 'sky-ready', 'renderer-start']); expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(600); expect(animate).not.toHaveBeenCalled();
    f.draw(); expect(f.calls.slice(-2)).toEqual(['frame-presented', 'fade-start']); expect(animate).toHaveBeenCalledOnce();
    f.draw(); expect(animate).toHaveBeenCalledOnce();
    animations[0]!.onfinish!(); expect(overlay()).toBeNull();
  });

  it('cancels a pending same-map fade before a new map begins its own native background transition', () => {
    const f = nativeFixture(); f.map.setMap('prontera.gat'); expect(overlay()).not.toBeNull();
    f.map.setMap('geffen.gat'); expect(overlay()).toBeNull(); expect(f.loads[0]!.filename).toBe('geffen.rsw');
    f.loads[0]!.complete(true); f.nativeTransitions[0]!(); f.draw();
    expect(f.calls).toContain('native-transition'); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('does not flash while loading or after a map-load failure', () => {
    const f = nativeFixture(''); f.map.setMap('prontera.gat');
    f.map.setMap('prontera.gat'); expect(f.loads).toHaveLength(1); expect(overlay()).toBeNull();
    f.loads[0]!.complete(false, 'offline fixture failure'); expect(overlay()).toBeNull(); expect(f.nativeTransitions).toHaveLength(0); expect(animate).not.toHaveBeenCalled();
  });

  it('clears an active transition through native free while preserving renderer cleanup', () => {
    const f = nativeFixture(); f.map.setMap('prontera.gat'); f.draw(); f.map.free();
    expect(overlay()).toBeNull(); expect(animations[0]!.cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect((f.context.EntityManager as { free: ReturnType<typeof vi.fn> }).free).toHaveBeenCalledTimes(2);
    f.draw(); expect(animate).toHaveBeenCalledOnce();
  });

  it('preserves native movement and HIGHJUMP without treating them as teleports', () => {
    const f = nativeFixture(); f.move({ GID: 10, MoveData: [1, 2, 8, 9], moveStartTime: 100 });
    f.jump({ AID: 10, xPos: 20, yPos: 30 }); f.jump({ AID: 11, xPos: 40, yPos: 50 });
    expect(f.player.walkTo).toHaveBeenCalledOnce(); expect(f.player.position).toEqual([20, 30, 5]); expect(f.other.position).toEqual([40, 50, 5]);
    expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });
});

describe('native teleport packet and frame dispatch', () => {
  it('handles a same-map NPCACK_MAPMOVE packet and waits for the actual Renderer frame', () => {
    const f = nativePacketFixture(); f.mapPacket();
    expect(f.player.position).toEqual([42, 67, 5]); expect(overlay()).not.toBeNull();
    expect(animate).not.toHaveBeenCalled(); expect(f.loads).toHaveLength(0);
    f.frame(); expect(f.calls.slice(-2)).toEqual(['frame-presented', 'fade-start']);
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0.3 }, { opacity: 0 }], expect.objectContaining({ duration: 350 }));
    f.frame(); expect(animate).toHaveBeenCalledOnce();
  });

  it.each(['skill', 'flywing'])('holds a %s teleport notification through old frames until the server commits the new position', () => {
    const f = nativePacketFixture();
    // The server's successful TELEPORT notification is identical for either
    // trigger; no optimistic animation is attached to outgoing skill/items.
    f.context.Renderer.render(f.map.onRender); f.vanishPacket(10);
    expect(f.player.remove).toHaveBeenCalledWith(3); expect(overlay()).not.toBeNull();
    expect(animate).not.toHaveBeenCalled(); f.frame(); f.frame(); vi.advanceTimersByTime(400);
    expect(f.player.position).toEqual([1, 2, 0]); expect(animate).not.toHaveBeenCalled();
    f.mapPacket('prontera.gat', 80, 120); expect(f.player.position).toEqual([80, 120, 5]);
    expect(animate).not.toHaveBeenCalled(); f.frame(); expect(animate).toHaveBeenCalledOnce();
  });

  it('deduplicates a self vanish followed by a same-map acknowledgement and rapid further teleports', () => {
    const f = nativePacketFixture(); f.vanishPacket(10); const first = overlay(); f.mapPacket();
    expect(first!.isConnected).toBe(false); expect(document.querySelectorAll('[data-lastro-teleport-fade]')).toHaveLength(1);
    f.frame(); expect(animate).toHaveBeenCalledOnce(); f.vanishPacket(10); f.mapPacket('prontera.gat', 50, 80);
    expect(animations[0]!.cancel).toHaveBeenCalledOnce(); expect(animations[0]!.onfinish).toBeNull();
    expect(document.querySelectorAll('[data-lastro-teleport-fade]')).toHaveLength(1);
    f.frame(); expect(animate).toHaveBeenCalledTimes(2); expect(f.player.position).toEqual([50, 80, 5]);
  });

  it.each([0, 1, 2])('does not fade for self non-teleport vanish type %s', type => {
    const f = nativePacketFixture(); f.vanishPacket(10, type);
    expect(f.player.remove).toHaveBeenCalledWith(type); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('does not fade for another player, an unknown actor, a login session or map loading', () => {
    const f = nativePacketFixture(); f.vanishPacket(11); f.vanishPacket(999);
    f.context.SessionStorage_default.Playing = false; f.vanishPacket(10);
    f.context.SessionStorage_default.Playing = true; f.map.loading = true; f.vanishPacket(10);
    expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('cancels a self teleport transition when the acknowledgement loads a different map', () => {
    const f = nativePacketFixture(); f.vanishPacket(10); expect(overlay()).not.toBeNull();
    f.mapPacket('geffen.gat'); expect(overlay()).toBeNull(); expect(f.loads[0]!.filename).toBe('geffen.rsw');
    f.loads[0]!.complete(true); f.nativeTransitions[0]!(); f.frame();
    expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('uses only the actual native Background transition when loading already supplies the effect', () => {
    const f = nativePacketFixture(), cover = useNativeLoadingOverlay(f);
    document.body.append(f.context._container, f.context._canvas);
    f.mapPacket('prontera.gat', 80, 120);
    expect(cover.isConnected).toBe(true); expect(f.player.position).toEqual([1, 2, 0]);
    vi.advanceTimersByTime(512);
    expect(f.player.position).toEqual([80, 120, 5]); expect(cover.style.opacity).toBe('1');
    expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
    f.frame(); expect(f.calls.at(-1)).toBe('frame-presented');
    vi.advanceTimersByTime(400); expect(cover.isConnected).toBe(true); expect(animate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(112); expect(cover.isConnected).toBe(false); expect(animate).not.toHaveBeenCalled();
    f.frame(); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });

  it('does not add another fade after native transition even if the first new-position frame is late', () => {
    const f = nativePacketFixture(), cover = useNativeLoadingOverlay(f);
    document.body.append(f.context._container, f.context._canvas); f.mapPacket();
    vi.advanceTimersByTime(1024); expect(cover.isConnected).toBe(false); expect(animate).not.toHaveBeenCalled();
    f.frame(); expect(animate).not.toHaveBeenCalled(); expect(overlay()).toBeNull();
  });

  it('does not retain an extra layer or schedule a delayed fade while a native cover remains', () => {
    const f = nativePacketFixture(), cover = useNativeLoadingOverlay(f);
    document.body.append(cover); f.mapPacket(); f.frame();
    vi.advanceTimersByTime(2500); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
    cover.remove(); vi.advanceTimersByTime(16); f.frame(); expect(animate).not.toHaveBeenCalled();
  });

  it('handles rapid teleports during native transition and restores a short fade for a later uncovered teleport', () => {
    const f = nativePacketFixture(), cover = useNativeLoadingOverlay(f);
    document.body.append(f.context._container, f.context._canvas); f.mapPacket(); vi.advanceTimersByTime(512); f.frame();
    f.mapPacket('prontera.gat', 60, 90); f.frame();
    expect(document.querySelectorAll('[data-lastro-teleport-fade]')).toHaveLength(0);
    expect(cover.isConnected).toBe(true); expect(animate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(512); expect(cover.isConnected).toBe(false);
    f.mapPacket('prontera.gat', 40, 70); f.frame(); expect(animate).toHaveBeenCalledOnce();
    f.map.free(); vi.advanceTimersByTime(1000);
    expect(overlay()).toBeNull(); expect(animate).toHaveBeenCalledOnce();
  });

  it('cancels the short pending effect if native transition starts before its first frame', () => {
    const f = nativePacketFixture(), cover = useNativeLoadingOverlay(f);
    f.mapPacket(); expect(overlay()).not.toBeNull();
    document.body.append(cover); f.frame(); expect(overlay()).toBeNull();
    cover.remove(); f.frame(); vi.advanceTimersByTime(1000);
    expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
  });
});

describe('teleport fade runtime anchors', () => {
  it('rejects duplicate patch application', () => { expect(() => patchRuntimeTeleportFade(patched)).toThrow('anchor:teleport-fade'); });
  it.each(['PostProcess.render(gl);', 'MapRenderer.onLoad();', 'if (this.loading) return;', 'stripMapExtension(this.currentMap) !== stripMapExtension(mapname)'])('rejects an altered native hook %s', hook => {
    expect(() => patchRuntimeTeleportFade(vendor.replaceAll(hook, 'changedNativeHook();'))).toThrow('anchor:teleport-fade');
  });
  it.each(['const entity = EntityManager.get(pkt.GID);', 'case Entity.VT.TELEPORT:'])('rejects an altered teleport packet hook %s', hook => {
    expect(() => patchRuntimeTeleportFade(vendor.replaceAll(hook, 'changedNativeHook();'))).toThrow('anchor:teleport-fade');
  });
  it.each(['document.body.appendChild(_overlay);', '_overlay.parentNode.removeChild(_overlay);'])('rejects a changed native loading-overlay anchor %s', hook => {
    expect(() => patchRuntimeTeleportFade(vendor.replaceAll(hook, 'changedNativeHook();'))).toThrow('anchor:teleport-fade');
  });
});
