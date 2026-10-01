import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNavigationDockPosition, patchRuntimeNavigationUi } from '../scripts/lastro-navigation-ui.mjs';
import { patchNavigationPendingTargets } from '../scripts/patch-v2-runtime.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new(html: string, options: { url: string }) => { window: Window & typeof globalThis } };
const { document, HTMLCanvasElement, MouseEvent } = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1/' }).window;

const vendor = readFileSync(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
function region(source: string, path: string) {
  const start = source.indexOf(`//#region ${path}`), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error(`Missing ${path}`);
  return source.slice(start, end + '//#endregion'.length);
}
const navigationPath = 'src/UI/Components/Navigation/Navigation.js';
const minimapPath = 'src/UI/Components/MiniMap/MiniMapCommon.js';
const native = region(vendor, navigationPath) + '\n' + region(vendor, minimapPath);
const patched = patchRuntimeNavigationUi(patchNavigationPendingTargets(native));
const file = ts.createSourceFile('Navigation.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const methodNames = new Set(['init', 'onAppend', 'onRemove', 'show', 'hide', 'navigateTo', 'waitForMapData', 'clear', 'clearPath', 'findPath', 'renderCanvas']);
const functions: string[] = [];
let minimapInit = '';
function extract(node: ts.Node) {
  if (ts.isBinaryExpression(node)) {
    if (ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(file) === 'Navigation'
      && methodNames.has(node.left.name.text)) functions.push(node.getText(file));
    if (node.left.getText(file) === 'MiniMap.init') minimapInit = node.getText(file);
  }
  ts.forEachChild(node, extract);
}
extract(file);
const helpers = file.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(decl => ['getNavigationDockPosition', 'dockLastroNavigation'].includes(decl.name.getText(file)))).map(node => node.getText(file));
const htmlFile = ts.createSourceFile('Navigation.html.js', region(vendor, 'src/UI/Components/Navigation/Navigation.html?raw'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let html = '';
function extractHtml(node: ts.Node) {
  if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) html = node.right.text;
  ts.forEachChild(node, extractHtml);
}
extractHtml(htmlFile);

interface Options { startMap: string; startX: number; startY: number; endMap: string; endX: number; endY: number; showWindow?: boolean; }
interface Target { map: string; x: number; y: number; showWindow?: boolean; }
interface Navigation {
  _host: HTMLElement; __loaded: boolean;
  prepare(): void; append(): void; init(): void; onAppend(): void; onRemove(): void;
  show(host?: HTMLElement): void; hide(): void; clear(): void;
  navigateTo(options: Options): void; renderCanvas(tick: number): void;
}

function fixture({ ready = true, scale = 1, layoutHeight = 330, scrollHeight = layoutHeight, minimapTop = 16, viewportHeight = 768 }: {
  ready?: boolean; scale?: number; layoutHeight?: number; scrollHeight?: number; minimapTop?: number; viewportHeight?: number;
} = {}) {
  expect(functions).toHaveLength(methodNames.size);
  expect(helpers).toHaveLength(2);
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' }); root.innerHTML = html;
  const minimap = document.createElement('div'); minimap.id = 'MiniMapV2';
  document.body.append(host, minimap);
  Object.defineProperties(host, {
    offsetWidth: { value: 300 }, offsetHeight: { value: layoutHeight }, scrollHeight: { value: scrollHeight },
    offsetLeft: { get: () => parseFloat(host.style.left) || 0 },
    offsetTop: { get: () => parseFloat(host.style.top) || 0 },
  });
  host.getBoundingClientRect = () => ({ left: host.offsetLeft * scale, top: host.offsetTop * scale,
    width: 300 * scale, height: layoutHeight * scale, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
  minimap.getBoundingClientRect = () => ({ left: 810, top: minimapTop, right: 1010, bottom: minimapTop + 200, width: 200, height: 200, x: 810, y: minimapTop, toJSON: () => ({}) });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  let currentMap = 'prontera', workerId = 0;
  const scheduled: (() => void)[] = [];
  const postMessage = vi.fn(), stop = vi.fn(), initialize = vi.fn();
  const ui = { hide: vi.fn(() => { host.style.display = 'none'; }), show: vi.fn(() => { host.style.display = ''; }) };
  const prepare = vi.fn(() => { nav.__loaded = true; nav.init(); host.remove(); });
  const loadMap = vi.fn(() => { context._mapData = ready ? { map: currentMap, walkableType: 0 } : { walkableType: 0 }; });
  const renderer = { render: vi.fn() }, move = vi.fn();
  const append = vi.fn(() => { document.body.append(host); nav.onAppend(); });
  const nav = { _host: host, __loaded: false, getRoot: () => root, ui, prepare, loadMap, append,
    draggable: vi.fn(), setMapNameText: vi.fn(), setLocationTitle: vi.fn(),
    setTargetCoordinatesText: vi.fn(), setTargetCoordinatesBlinking: vi.fn(),
    findClosestWalkableCell: (x: number, y: number) => ({ x, y }) } as unknown as Navigation;
  const context = {
    Navigation: nav, _ctx$2: null, _mapData: null as { map?: string; walkableType: number; } | null,
    _finalTargetData: null as Target | null, _targetData: null as Target | null,
    _isMapClickTarget: false, _path: [] as { x: number; y: number }[], _lastPathUpdate: 0,
    _pathUpdateThrottle: 500, _pathUpdateLock: false,
    _pathFindingWorker: null as { id: number; postMessage: typeof postMessage } | null,
    _documentClickHandler: null, document, window: { innerWidth: 1024, innerHeight: viewportHeight },
    getComputedStyle: (node: HTMLElement) => ({ display: node.style.display || 'block' }),
    getCurrentMap: () => currentMap, getPlayerPosition: () => ({ x: 10, y: 10 }),
    normalizeMapName: (map: string) => map.replace(/\.gat$/i, ''),
    initializePathFindingWorker: () => { initialize(); context._pathFindingWorker ||= { id: ++workerId, postMessage }; },
    terminatePathFindingWorker: () => { stop(); context._pathFindingWorker = null; },
    resetPathFindingWorker: () => { context._pathFindingWorker = { id: ++workerId, postMessage }; context._pathUpdateLock = false; },
    Renderer: { width: 1024, height: 768, render: renderer.render }, Altitude: { TYPE: { WALKABLE: 0 } },
    Client: { loadFile: vi.fn() }, DB: { INTERFACE_PATH: 'data/texture/', getNaviLinkTable: () => [] },
    KEYS: { ENTER: 13 }, SessionStorage_default: { Entity: { walk: { total: 0 }, __navigationMovePending: null } },
    MapPathFinder: { findPathBetweenMaps: (_map: string, _x: number, _y: number, map: string, x: number, y: number) => [{ map, x, y }] },
    setTimeout: (callback: () => void) => scheduled.push(callback),
    isNavigationTargetReached: () => false, requestNavigationMove: move,
    _arrow: {}, _toolDealer: {}, _weaponDealer: {}, _armorDealer: {}, _blacksmith: {}, _guide: {}, _inn: {}, _kafra: {},
  };
  runInNewContext(helpers.join('\n') + '\n' + functions.join(';\n'), context);
  const request = (showWindow?: boolean, x = 50) => nav.navigateTo({ startMap: currentMap, startX: 10, startY: 10, endMap: currentMap, endX: x, endY: 60, showWindow });
  return { nav, host, root, minimap, context, initialize, stop, ui, prepare, loadMap, renderer, postMessage, move, append, request,
    tick: () => { for (const callback of scheduled.splice(0)) callback(); }, scheduled,
    ready: () => { ready = true; context._mapData = { map: currentMap, walkableType: 0 }; },
    map: (map: string) => { currentMap = map; },
  };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('native Navigation background mode and dock', () => {
  it('prepares a hidden background route and appends once for native renderer/map initialization', () => {
    const f = fixture(); f.request(false);
    expect(f.prepare).toHaveBeenCalledOnce(); expect(f.loadMap).toHaveBeenCalledExactlyOnceWith('prontera');
    expect(f.append).toHaveBeenCalledOnce(); expect(f.renderer.render).toHaveBeenCalledOnce();
    expect(f.ui.show).not.toHaveBeenCalled(); expect(f.host.style.display).toBe('none');
    expect(f.postMessage).toHaveBeenCalledOnce();
    expect(f.context._finalTargetData).toMatchObject({ map: 'prontera', x: 50, showWindow: false });
  });

  it('uses the existing map-ready renderer while hidden, with no duplicate append/render on requests', () => {
    const f = fixture(); f.nav.prepare(); f.nav.append(); f.request(false);
    f.context._path = [{ x: 10, y: 10 }, { x: 50, y: 60 }];
    f.context._pathUpdateLock = false; f.nav.renderCanvas(1000);
    expect(f.move).toHaveBeenCalledOnce(); expect(f.context._finalTargetData?.showWindow).toBe(false);
    expect(f.host.style.display).toBe('none'); expect(f.renderer.render).toHaveBeenCalledOnce();
    expect(f.loadMap).toHaveBeenCalledOnce(); expect(f.append).toHaveBeenCalledOnce();
  });

  it('keeps an already open manual window open for a background request, and keeps walking after close', () => {
    const f = fixture(); f.nav.prepare(); f.nav.append(); f.nav.show(f.minimap); f.request(false);
    expect(f.host.style.display).toBe(''); f.nav.hide();
    expect(f.stop).not.toHaveBeenCalled(); expect(f.host.style.display).toBe('none');
    f.context._path = [{ x: 10, y: 10 }, { x: 50, y: 60 }]; f.nav.renderCanvas(1);
    expect(f.move).toHaveBeenCalledOnce();
    f.context._pathUpdateLock = false; f.request(false, 70);
    expect(f.postMessage).toHaveBeenCalledTimes(2); expect(f.ui.show).toHaveBeenCalledOnce();
  });

  it('preserves background mode through manual show and map remove/append without canceling the final target', () => {
    const f = fixture(); f.nav.prepare(); f.nav.append(); f.request(false); f.nav.show(f.minimap);
    expect(f.context._finalTargetData?.showWindow).toBe(false); f.nav.hide(); expect(f.stop).not.toHaveBeenCalled();
    f.nav.onRemove(); f.host.remove(); expect(f.stop).toHaveBeenCalledOnce();
    expect(f.context._finalTargetData?.showWindow).toBe(false); f.map('izlude'); f.nav.append();
    expect(f.context._mapData?.map).toBe('izlude'); expect(f.context._finalTargetData?.showWindow).toBe(false);
    expect(f.postMessage).toHaveBeenCalledTimes(3); expect(f.host.style.display).toBe('none');
  });

  it('retains ordinary close behavior for a new manual route and after clear', () => {
    const f = fixture(); f.request(false); f.request(undefined, 80); f.nav.hide();
    expect(f.stop).toHaveBeenCalledOnce(); f.request(false); f.nav.clear(); f.nav.hide();
    expect(f.stop).toHaveBeenCalledTimes(2); expect(f.context._finalTargetData).toBeNull();
  });

  it('keeps captured-target cancellation intact while waiting for map data', () => {
    const f = fixture({ ready: false }); f.request(false); f.request(false, 70); f.nav.clear(); f.tick();
    expect(f.scheduled).toHaveLength(0); expect(f.postMessage).not.toHaveBeenCalled();
    f.request(false, 90); f.ready(); f.tick();
    expect(f.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ endX: 90, endY: 60 }));
  });

  it.each([1, 1.5])('docks beside the current minimap at effective UI scale %s and leaves dragging enabled', scale => {
    const f = fixture({ scale }); f.nav.prepare(); f.nav.append(); f.nav.show(f.minimap);
    const rect = f.host.getBoundingClientRect();
    expect(rect.left + rect.width + 8).toBeCloseTo(810); expect(rect.top).toBeCloseTo(16);
    f.host.style.left = '30px'; f.host.style.top = '50px'; // Native draggable can still update the position.
    expect(f.host.offsetLeft).toBe(30); expect(f.host.offsetTop).toBe(50);
    expect(f.renderer.render).toHaveBeenCalledOnce(); expect(f.append).toHaveBeenCalledOnce();
  });

  it('manually shows a previously unprepared/detached window once, without repeated renderer registration', () => {
    const f = fixture(); f.nav.show(f.minimap); f.nav.show(f.minimap);
    expect(f.prepare).toHaveBeenCalledOnce(); expect(f.append).toHaveBeenCalledOnce();
    expect(f.renderer.render).toHaveBeenCalledOnce(); expect(f.ui.show).toHaveBeenCalledTimes(2);
    expect(f.host.isConnected).toBe(true); expect(f.host.style.display).toBe('');
  });

  it.each([1, 1.5])('counts the overflowing native footer when docking near the bottom at scale %s', scale => {
    const f = fixture({ scale, layoutHeight: 300, scrollHeight: 321, minimapTop: 500, viewportHeight: 720 });
    f.nav.show(f.minimap);
    const rect = f.host.getBoundingClientRect();
    const completeBottom = rect.top + f.host.scrollHeight * scale;
    expect(rect.top).toBeCloseTo(720 - 321 * scale);
    expect(completeBottom).toBeLessThanOrEqual(720);
    expect(Math.abs(rect.left + rect.width + 8 - 810)).toBeLessThanOrEqual(1);
    expect(rect.height).toBe(300 * scale); // Overflow must not change the coordinate scale.
  });
});

describe('navigation dock viewport bounds', () => {
  it('uses the left neighbour of a right-hand minimap and follows its current position', () => {
    expect(getNavigationDockPosition({ left: 700, right: 900, top: 40 }, { width: 300, height: 330 }, { width: 1000, height: 800 })).toEqual({ left: 392, top: 40 });
  });
  it('uses the right neighbour when a left-hand minimap has room there', () => {
    expect(getNavigationDockPosition({ left: 10, right: 150, top: 40 }, { width: 300, height: 330 }, { width: 1000, height: 800 })).toEqual({ left: 158, top: 40 });
  });
  it('clamps narrow and short screens without negative positions', () => {
    expect(getNavigationDockPosition({ left: 200, right: 400, top: 500 }, { width: 300, height: 330 }, { width: 420, height: 400 })).toEqual({ left: 0, top: 70 });
    expect(getNavigationDockPosition({ left: 100, right: 200, top: -20 }, { width: 300, height: 330 }, { width: 240, height: 200 })).toEqual({ left: 0, top: 0 });
  });
});

describe('actual MiniMapCommon click handler', () => {
  it('opens navigation only from plain left canvas clicks and preserves zoom/world-map buttons', () => {
    const root = document.createElement('div'); root.innerHTML = '<canvas></canvas><button class="plus"></button><button class="minus"></button><button class="viewon"></button><button class="object"></button>';
    const host = document.createElement('div'), show = vi.fn(), initialize = vi.fn(), zoom = vi.fn(), toggle = vi.fn();
    const MiniMap = { _host: host, getRoot: () => root, updateZoom: zoom };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    runInNewContext(minimapInit, { MiniMap, init_Navigation: initialize, Navigation_default: { show },
      _ctx: null, Client: { loadFile: vi.fn() }, DB: { INTERFACE_PATH: 'data/texture/' },
      _arrow: {}, _toolDealer: {}, _weaponDealer: {}, _armorDealer: {}, _blacksmith: {}, _guide: {}, _inn: {}, _kafra: {},
      townInfoToggle: true, worldMap: { toggle }, _preferences: { townInfoShow: true, save: vi.fn() } });
    (MiniMap as typeof MiniMap & { init(): void }).init();
    const canvas = root.querySelector('canvas')!;
    canvas.dispatchEvent(new MouseEvent('click', { button: 0 }));
    expect(show).toHaveBeenCalledExactlyOnceWith(host); expect(initialize).toHaveBeenCalledOnce();
    for (const modifier of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) canvas.dispatchEvent(new MouseEvent('click', { button: 0, [modifier]: true }));
    canvas.dispatchEvent(new MouseEvent('click', { button: 2 }));
    root.querySelector('.plus')!.dispatchEvent(new MouseEvent('mousedown'));
    root.querySelector('.minus')!.dispatchEvent(new MouseEvent('mousedown'));
    root.querySelector('.viewon')!.dispatchEvent(new MouseEvent('mousedown'));
    expect(show).toHaveBeenCalledOnce(); expect(zoom.mock.calls).toEqual([[1], [-1]]); expect(toggle).toHaveBeenCalledOnce();
  });
});

describe('navigation UI pinned anchors', () => {
  it('skips fixtures without either optional component', () => {
    expect(patchRuntimeNavigationUi('const tiny = 1;')).toBe('const tiny = 1;');
  });
  it.each([
    native.replace('Navigation.navigateTo =', 'Navigation.changedNavigateTo ='),
    native.replace('Navigation.show =', 'Navigation.changedShow ='),
    native.replace('Navigation.hide =', 'Navigation.changedHide ='),
    native.replace('Navigation.onRemove =', 'Navigation.changedOnRemove ='),
    native.replace('MiniMap.init =', 'MiniMap.changedInit ='),
    native.replace('_ctx = root.querySelector("canvas").getContext("2d");', '_ctx = null;'),
    native + region(vendor, navigationPath),
    patched,
  ])('rejects missing, changed, duplicate or already patched native anchors', source => {
    expect(() => patchRuntimeNavigationUi(source)).toThrow('anchor:navigation-ui');
  });
  it('preserves pending-target guard semantics in either pipeline order', () => {
    expect(patchNavigationPendingTargets(patchRuntimeNavigationUi(native))).toContain('lastroNavigationWaitingTarget');
    expect(patched).toContain('if (_finalTargetData !== lastroNavigationPendingTarget) return;');
  });
});
