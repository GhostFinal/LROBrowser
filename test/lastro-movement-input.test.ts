// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLastroMovementInput, patchRuntimeMovementInput, refreshLastroGroundInput } from '../scripts/lastro-movement-input.mjs';

const dispose: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { dispose.splice(0).forEach(fn => fn()); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });
const clock = { setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
function inputFixture() {
  const state = { target: { x: 10, y: 20 }, map: 'prontera', player: {}, ready: true };
  const send = vi.fn<(target: { x: number; y: number }) => boolean>(() => true), cancelNavigation = vi.fn(), error = vi.fn();
  const input = createLastroMovementInput({ getTarget: () => state.target, getContext: () => ({ map: state.map, player: state.player }),
    canMove: () => state.ready, sendMove: send, onManualMove: cancelNavigation, onError: error, clock, now: () => Date.now() });
  return { input, state, send, cancelNavigation, error };
}

describe('manual movement input scheduler', () => {
  it('accepts the first click at time zero and retains a quick second click after release', () => {
    const f = inputFixture(); expect(f.input.request()).toBe(true); f.input.stop();
    vi.advanceTimersByTime(100); f.state.target = { x: 30, y: 40 }; f.input.request(); f.input.stop();
    f.state.target = { x: 90, y: 90 }; vi.advanceTimersByTime(99); expect(f.send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1); expect(f.send.mock.calls.map(call => call[0])).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    vi.advanceTimersByTime(1000); expect(f.send).toHaveBeenCalledTimes(2);
  });
  it('coalesces rapid clicks to the latest valid destination while retaining 200ms packet spacing', () => {
    const f = inputFixture(); f.input.request(); f.input.stop();
    for (const x of [20, 30, 40]) { vi.advanceTimersByTime(50); f.state.target = { x, y: 5 }; f.input.request(); f.input.stop(); }
    vi.advanceTimersByTime(50); expect(f.send.mock.calls.map(call => call[0])).toEqual([{ x: 10, y: 20 }, { x: 40, y: 5 }]);
    expect(f.cancelNavigation).toHaveBeenCalledTimes(4);
  });
  it('does not replace a queued valid click with an invalid picker result', () => {
    const f = inputFixture(); f.input.request(); f.input.stop(); vi.advanceTimersByTime(50);
    f.state.target = { x: 30, y: 40 }; f.input.request(); f.input.stop(); f.state.target = { x: -1, y: -1 };
    expect(f.input.request()).toBe(false); vi.advanceTimersByTime(150);
    expect(f.send).toHaveBeenLastCalledWith({ x: 30, y: 40 });
  });
  it('preserves the native 500ms held-button repeat and stops repetition on release', () => {
    const f = inputFixture(); f.input.request(); f.state.target = { x: 30, y: 40 };
    vi.advanceTimersByTime(499); expect(f.send).toHaveBeenCalledOnce(); vi.advanceTimersByTime(1);
    expect(f.send).toHaveBeenLastCalledWith({ x: 30, y: 40 }); f.input.stop(); vi.advanceTimersByTime(2000);
    expect(f.send).toHaveBeenCalledTimes(2);
  });
  it.each(['map', 'player', 'freeze', 'cancel'])('cancels pending input after %s changes', change => {
    const f = inputFixture(); f.input.request(); f.input.stop(); vi.advanceTimersByTime(50); f.state.target.x = 30; f.input.request();
    if (change === 'map') f.state.map = 'geffen';
    if (change === 'player') f.state.player = {};
    if (change === 'freeze') f.state.ready = false;
    if (change === 'cancel') f.input.cancel();
    vi.advanceTimersByTime(1000); expect(f.send).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('recovers errors without leaving a held repeat or sending a later stale request', () => {
    const f = inputFixture(); f.send.mockImplementation(() => { throw new Error('offline socket is closed'); });
    expect(f.input.request()).toBe(false); expect(f.error).toHaveBeenCalledOnce(); vi.advanceTimersByTime(1000); expect(f.send).toHaveBeenCalledOnce();
  });
  it('does not depend on renderer/server time for click throttling', () => {
    const f = inputFixture(); f.input.request(); f.input.stop(); vi.advanceTimersByTime(100); f.state.target.x = 30; f.input.request(); f.input.stop();
    vi.advanceTimersByTime(100); expect(f.send).toHaveBeenCalledTimes(2);
  });
});

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
function region(path: string) {
  const start = vendor.indexOf('//#region ' + path); expect(start).toBeGreaterThan(-1);
  return vendor.slice(start, vendor.indexOf('//#endregion', start) + '//#endregion'.length);
}
const native = ['src/Engine/MapEngine.js', 'src/Controls/MapControl.js', 'src/Renderer/MapRenderer.js'].map(region).join('\n');
const patched = patchRuntimeMovementInput(native);
interface NativeParts { functions: Map<string, string>; factory: string; init: string; hover: string; setMap: string; navigate: string; }
function extract(source: string): NativeParts {
  const file = ts.createSourceFile('Native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), functions = new Map<string, string>();
  let factory = '', init = '', hover = '', setMap = '', navigate = '';
  const names = new Set(['onRequestWalk', 'onRequestStopWalk', 'walkIntervalProcess', 'checkFreeCell', 'isFreeCell', 'onMouseDown', 'onMouseUp', 'onMouseUpCapture', 'onMapChange', 'cleanGameUI']);
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text || '')) functions.set(node.name!.text, node.getText(file));
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(file) === 'refreshLastroGroundInput')) functions.set('ground', node.getText(file));
    if (ts.isBinaryExpression(node) && node.left.getText(file) === 'MapControl._lastroMovementInput') factory = node.getText(file) + ';';
    if (ts.isBinaryExpression(node) && node.left.getText(file) === 'Navigation.navigateTo') navigate = node.getText(file) + ';';
    if (ts.isMethodDeclaration(node)) {
      if (node.name.getText(file) === 'init' && node.body?.getText(file).includes('Mobile.init')) init = 'MapControl.init = function() ' + node.body.getText(file) + ';';
      if (node.name.getText(file) === '_setupMouseMode') hover = 'component._setupMouseMode = function() ' + node.body!.getText(file) + ';';
      if (node.name.getText(file) === 'setMap') setMap = 'MapRenderer.setMap = function(mapname) ' + node.body!.getText(file) + ';';
    }
    ts.forEachChild(node, visit);
  }
  visit(file); return { functions, factory, init, hover, setMap, navigate };
}
const baselineParts = extract(native), parts = extract(patched);
const hoverParts = extract(region('src/UI/GUIComponent.js'));
const navigationParts = extract(patchRuntimeMovementInput(region('src/UI/Components/Navigation/Navigation.js')));

function nativeFixture(patch = true) {
  const source = patch ? parts : baselineParts;
  const canvas = document.createElement('canvas'), overlay = document.createElement('div'); document.body.append(canvas, overlay);
  const calls: string[] = [], sent: { dest?: number[]; kind: string }[] = [];
  const player = { position: [1, 1], action: 0, ACTION: { SIT: 1, DIE: 2 }, headDir: 0, direction: 0,
    lookTo: vi.fn(), constructor: { TYPE_EFFECT: 9, TYPE_UNIT: 10, TYPE_TRAP: 11 } };
  const session = { Entity: player as typeof player | null, FreezeUI: false, moveAction: null, autoFollow: false, TouchTargeting: false };
  const mouse = { screen: { x: 5, y: 5, width: 300, height: 300 }, world: { x: 10, y: 20, z: 0 }, intersect: true, state: 0, MOUSE_STATE: { NORMAL: 0, USESKILL: 2 } };
  const map = { currentMap: 'prontera.gat', loading: false, setMap: vi.fn<(name: string) => void>(), onLoad: () => {} };
  const keys = { SHIFT: false, ALT: false, CTRL: false }, renderer = { tick: 1000, canvas };
  let pickTarget: { x: number; y: number } | null = { x: 30, y: 40 }, free: ((x: number, y: number) => boolean) = () => true;
  const altitude = { width: 300, height: 300, TYPE: { WALKABLE: 1 }, getCellType: (x: number, y: number) => x >= 0 && y >= 0 && x < 300 && y < 300 && free(x, y) ? 1 : 0,
    getCellHeight: () => 2, intersect: vi.fn((_view: unknown, _projection: unknown, point: Int16Array) => {
      if (!pickTarget) return false; point[0] = pickTarget.x; point[1] = pickTarget.y; return true;
    }) };
  type MoveInput = ReturnType<typeof createLastroMovementInput>;
  const control = { onRequestWalk: () => {}, onRequestStopWalk: () => {}, _lastroMovementInput: undefined as MoveInput | undefined, init: () => {} };
  const cleanup: (() => void)[] = [];
  function listen(target: Window | Document, type: string, handler: EventListener, options?: boolean) {
    target.addEventListener(type, handler, options); cleanup.push(() => target.removeEventListener(type, handler, options));
  }
  let hidden = false;
  const camera = { modelView: [], projection: [], action: { active: false }, rotate: vi.fn() };
  let overEntity: unknown = null;
  const entityManager = { getFocusEntity: () => null, getOverEntity: () => overEntity, setFocusEntity: vi.fn(),
    setOverEntity: vi.fn((entity: unknown) => { overEntity = entity; }), intersect: vi.fn<() => unknown>(() => null), forEach: vi.fn() };
  const component = { _host: overlay, mouseMode: 0, _setupShadowCursorEvents: vi.fn(), _setupMouseMode: () => {}, focus: vi.fn() };
  class Move { dest = [0, 0]; kind = 'move2'; }
  class LegacyMove extends Move { kind = 'move'; }
  class Direction { kind = 'direction'; }
  const context = vm.createContext({ document: { addEventListener: (type: string, handler: EventListener) => listen(document, type, handler), get hidden() { return hidden; } },
    window: { addEventListener: (type: string, handler: EventListener, options?: boolean) => listen(window, type, handler, options) },
    performance: { now: () => Date.now() }, Events: clock, Mouse: mouse, MapControl: control, MapRenderer: map,
    SessionStorage_default: session, KEYS: keys, Renderer: renderer, Altitude: altitude, Camera: camera,
    EntityManager: entityManager, Entity: { TYPE_EFFECT: 9, TYPE_TRAP: 11 }, Controls_default: { noctrl: false },
    Navigation_default: { clear: vi.fn(() => calls.push('navigation')) },
    LastROTools: { _lastroPanels: { cancelRoute: vi.fn(() => calls.push('tools')) }, _lastroQuestRoute: { cancel: vi.fn(() => calls.push('quest')) } },
    PacketVerManager_default: { value: 20211103 }, PACKET: { CZ: { REQUEST_MOVE: LegacyMove, REQUEST_MOVE2: Move, CHANGE_DIRECTION: Direction, CHANGE_DIRECTION2: Direction } },
    Network: { sendPacket: vi.fn((packet: Move) => { sent.push({ kind: packet.kind, dest: packet.dest ? [...packet.dest] : undefined }); calls.push('packet'); }) },
    SkillTargetSelection_default: { onMapMouseDown: vi.fn(() => true) }, Mobile: { init: vi.fn() },
    Cursor: { ACTION: { DEFAULT: 0, ROTATE: 1 }, setType: vi.fn() }, AIDriver: { setmsg: vi.fn() },
    _rightClickPosition: new Int16Array(2), _walkTimer: null, _walkLastTick: 0,
    onMouseWheel: vi.fn(), onDragOver: vi.fn(), onDrop$6: vi.fn(), onAutoFollow: vi.fn(),
    component, GUIComponent: { MouseMode: { STOP: 0, CROSS: 1 } }, _Cursor: { ACTION: { DEFAULT: 0 }, setType: vi.fn() }, _EntityManager: entityManager,
    WhisperBox: { clearAll: vi.fn() }, console: { warn: vi.fn() },
  });
  const needed = ['onRequestWalk', 'onRequestStopWalk', 'walkIntervalProcess', 'checkFreeCell', 'isFreeCell', 'onMouseDown', 'onMouseUp', 'onMouseUpCapture', 'ground'];
  vm.runInContext(needed.map(name => source.functions.get(name) || '').join('\n') + '\n' + source.factory
    + '\nMapControl.onRequestWalk=onRequestWalk; MapControl.onRequestStopWalk=onRequestStopWalk;\n' + source.init + '\n' + hoverParts.hover, context);
  control.init();
  dispose.push(() => { control._lastroMovementInput?.cancel(); cleanup.forEach(fn => fn()); });
  const down = (target: HTMLElement = canvas, x = 100, y = 120) => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y }));
  const up = (target: HTMLElement = canvas) => target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  return { context, control, mouse, map, session, keys, renderer, altitude, calls, sent, component, entityManager, canvas, overlay, down, up,
    setPick: (target: typeof pickTarget) => { pickTarget = target; }, setFree: (predicate: typeof free) => { free = predicate; }, setHidden: (value: boolean) => { hidden = value; } };
}

describe('actual MapControl and MapEngine movement', () => {
  it('reproduces the original lost second click within its 200ms throttle', () => {
    const f = nativeFixture(false); f.control.onRequestWalk(); f.control.onRequestStopWalk();
    f.renderer.tick += 100; f.mouse.world.x = 50; f.control.onRequestWalk(); f.control.onRequestStopWalk();
    vi.advanceTimersByTime(1000); expect(f.sent).toEqual([{ kind: 'move2', dest: [10, 20] }]);
  });
  it('sends the captured second click after release despite the old renderer tick moving backwards', () => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(100); f.setPick({ x: 60, y: 70 }); f.down(); f.up();
    f.renderer.tick = -100000; f.mouse.world.x = 200; f.mouse.world.y = 201; vi.advanceTimersByTime(100);
    expect(f.sent).toEqual([{ kind: 'move2', dest: [30, 40] }, { kind: 'move2', dest: [60, 70] }]);
    vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(2);
  });
  it('cancels both automated routes before clearing native navigation and requesting movement', () => {
    const f = nativeFixture(); f.down();
    expect(f.calls.slice(0, 3)).toEqual(['tools', 'quest', 'navigation']); expect(f.calls.at(-1)).toBe('packet');
  });
  it('uses native GAT/occupied-cell search to select a walkable neighbour and never sends a solid wall', () => {
    const f = nativeFixture(); f.setFree((x, y) => x === 29 && y === 39); f.down(); f.up();
    expect(f.sent).toEqual([{ kind: 'move2', dest: [29, 39] }]); vi.advanceTimersByTime(200);
    f.setFree(() => false); f.down(); f.up(); expect(f.sent).toHaveLength(1);
  });
  it('keeps legacy packet selection and the native seated/Shift direction action', () => {
    const f = nativeFixture(); (f.context.PacketVerManager_default as { value: number }).value = 20170201; f.down(); f.up();
    expect(f.sent[0]?.kind).toBe('move'); f.keys.SHIFT = true; f.down(); f.up();
    expect(f.session.Entity?.lookTo).toHaveBeenCalledWith(30, 40); expect(f.sent.at(-1)?.kind).toBe('direction');
  });
  it.each(['loading', 'freeze', 'skill', 'dead', 'missing-player', 'bounds'])('retains the %s movement gate', mode => {
    const f = nativeFixture();
    if (mode === 'loading') f.map.loading = true;
    if (mode === 'freeze') f.session.FreezeUI = true;
    if (mode === 'skill') f.mouse.state = 2;
    if (mode === 'dead') f.session.Entity!.action = 2;
    if (mode === 'missing-player') f.session.Entity = null;
    if (mode === 'bounds') f.setPick({ x: 300, y: 40 });
    f.down(); f.up(); vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(0);
  });
  it('updates the picker with actual click coordinates before native entity/floor handling', () => {
    const f = nativeFixture(); f.down(f.canvas, 170, 180); f.up();
    expect(f.mouse.screen).toMatchObject({ x: 170, y: 180 }); expect(f.altitude.intersect).toHaveBeenCalledOnce();
    expect(f.entityManager.intersect).toHaveBeenCalledOnce(); expect(f.sent[0]?.dest).toEqual([30, 40]);
  });
  it('recovers a real GUI hover lock after hide only on a ground click, with no UI click-through', () => {
    const f = nativeFixture(); f.component._setupMouseMode(); f.overlay.dispatchEvent(new MouseEvent('mouseenter'));
    expect(f.mouse.intersect).toBe(false); f.overlay.style.display = 'none';
    f.down(f.overlay); f.up(f.overlay); expect(f.mouse.intersect).toBe(false); expect(f.sent).toHaveLength(0);
    f.down(); f.up(); expect(f.mouse.intersect).toBe(true); expect(f.sent[0]?.dest).toEqual([30, 40]);
  });
  it('does not revive a ground hover lock beneath a frozen native dialog', () => {
    const f = nativeFixture(); f.mouse.intersect = false; f.session.FreezeUI = true; f.down(); f.up();
    expect(f.mouse.intersect).toBe(false); expect(f.altitude.intersect).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(0);
  });
  it('captures release even when an overlay swallows bubbling mouseup', () => {
    const f = nativeFixture(); f.down(); f.overlay.addEventListener('mouseup', event => event.stopImmediatePropagation()); f.up(f.overlay);
    vi.advanceTimersByTime(1500); expect(f.sent).toHaveLength(1);
  });
  it('sends a captured released click after merely hovering a native UI, without resuming held repeats', () => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.up();
    f.component._setupMouseMode(); f.overlay.dispatchEvent(new MouseEvent('mouseenter')); expect(f.mouse.intersect).toBe(false);
    vi.advanceTimersByTime(150); expect(f.sent).toEqual([{ kind: 'move2', dest: [30, 40] }, { kind: 'move2', dest: [60, 70] }]);
    vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(2);
  });
  it('retains the hover protection for a held-button repeat', () => {
    const f = nativeFixture(); f.down(); f.component._setupMouseMode(); f.overlay.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(1500); expect(f.sent).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['freeze', 'skill', 'dead', 'loading'])('keeps the %s gate for a captured click even though passive hover is allowed', action => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.up(); f.mouse.intersect = false;
    if (action === 'freeze') f.session.FreezeUI = true;
    if (action === 'skill') f.mouse.state = 2;
    if (action === 'dead') f.session.Entity!.action = 2;
    if (action === 'loading') f.map.loading = true;
    vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels queued floor input at an actual new native Navigation.navigateTo request', () => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.up();
    const root = document.createElement('div'), path = vi.fn(() => []);
    Object.assign(f.context, { Navigation: { getRoot: () => root }, normalizeMapName: (map: string) => map.replace(/\.gat$/i, ''),
      _finalTargetData: null, MapPathFinder: { findPathBetweenMaps: path } });
    vm.runInContext(navigationParts.navigate + '\nNavigation.navigateTo({startMap:"prontera",startX:1,startY:1,endMap:"prontera",endX:80,endY:90,showWindow:false});', f.context);
    expect(path).toHaveBeenCalledOnce(); vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('retires queued ground movement before native skill handling removes its selection UI and restores Mouse.state', () => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.up();
    f.mouse.state = 2;
    const skill = f.context.SkillTargetSelection_default as { onMapMouseDown: ReturnType<typeof vi.fn> };
    skill.onMapMouseDown.mockImplementation(() => { f.mouse.state = 0; f.sent.push({ kind: 'skill' }); return true; });
    f.down(); f.up(); vi.advanceTimersByTime(1000);
    expect(f.sent.map(packet => packet.kind)).toEqual(['move2', 'skill']); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['onMouseDown', 'onFocus'])('does not overwrite a newer native entity %s operation with an old queued destination', handler => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.up();
    const entity = { objecttype: 3, onMouseDown: () => false, onFocus: () => false };
    entity[handler as keyof Pick<typeof entity, 'onMouseDown' | 'onFocus'>] = () => { f.sent.push({ kind: 'entity', dest: [80, 90] }); return true; };
    f.entityManager.intersect.mockReturnValue(entity); f.down(); f.up(); vi.advanceTimersByTime(1000);
    expect(f.sent).toEqual([{ kind: 'move2', dest: [30, 40] }, { kind: 'entity', dest: [80, 90] }]); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['blur', 'hidden', 'map-change', 'logout'])('cancels pending click and repetition on %s', action => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down();
    if (action === 'blur') window.dispatchEvent(new Event('blur'));
    if (action === 'hidden') { f.setHidden(true); document.dispatchEvent(new Event('visibilitychange')); }
    if (action === 'map-change' || action === 'logout') {
      const name = action === 'map-change' ? 'onMapChange' : 'cleanGameUI';
      // Invoke the actual patched entry prologue: the remaining native body owns map/UI teardown.
      const file = ts.createSourceFile('entry.js', parts.functions.get(name)!, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const fn = file.statements[0] as ts.FunctionDeclaration;
      vm.runInContext(fn.body!.statements[0]!.getText(file), f.context);
    }
    vi.advanceTimersByTime(1000); expect(f.sent).toHaveLength(1);
  });
  it('cancels at the actual MapRenderer.setMap entry, including before loading early-return', () => {
    const f = nativeFixture(); f.down(); f.up(); vi.advanceTimersByTime(50); f.setPick({ x: 60, y: 70 }); f.down(); f.map.loading = true;
    vm.runInContext(parts.setMap, f.context); f.map.setMap('geffen.gat'); f.map.loading = false; vi.advanceTimersByTime(1000);
    expect(f.sent).toHaveLength(1);
  });
  it('rejects duplicate patch application and unexpected movement anchors', () => {
    expect(() => patchRuntimeMovementInput(patched)).toThrow('anchor:movement-input');
    expect(() => patchRuntimeMovementInput(native.replace('_walkLastTick + 200 > Renderer.tick', 'false'))).toThrow('anchor:movement-input');
  });
});

describe('ground-picker safety', () => {
  it('does not reuse the previous cell when a fresh native raycast misses', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const mouse = { screen: { x: 0, y: 0 }, world: { x: 10, y: 20, z: 0 }, intersect: true, state: 0, MOUSE_STATE: { USESKILL: 2 } };
    const event = new MouseEvent('mousedown', { button: 0 }); Object.defineProperty(event, 'target', { value: canvas });
    expect(refreshLastroGroundInput(event, { mouse, canvas, ready: true, pick: () => false, getHeight: () => 0 })).toBe(false);
    expect(mouse.world).toEqual({ x: -1, y: -1, z: -1 });
  });
});
