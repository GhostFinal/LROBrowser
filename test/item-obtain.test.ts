// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep native GUI append and base CSS from the generated game, and serialize the
// current installer exactly as prepare-runtime does, without running a build.
const source = readFileSync('generated/runtime/Online.js', 'utf8');
const ast = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let installer = '';
let pickupCss = '';
let nativeAppendSource = '';
function visit(node: ts.Node) {
  if (ts.isFunctionExpression(node) && node.name?.text === 'installLastroLootList') installer = node.getText(ast);
  if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === 'ItemObtain_default$1' &&
      ts.isStringLiteral(node.right)) pickupCss = node.right.text;
  if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'append' &&
      ts.isClassExpression(node.parent) && node.parent.name?.text === 'GUIComponent') nativeAppendSource = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!installer) throw new Error('Missing actual pickup list installer');
if (!pickupCss) throw new Error('Missing actual pickup list CSS');
if (!nativeAppendSource) throw new Error('Missing actual GUIComponent append method');
const installerSource = ts.createSourceFile('loot.mjs', readFileSync('scripts/lastro-loot-list.mjs', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const installFunction = installerSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'installLastroLootList');
if (!installFunction) throw new Error('Missing current pickup installer');
installer = installFunction.getText(installerSource).replace(/^export\s+/, '');
const styleSource = ts.createSourceFile('loot-style.mjs', readFileSync('scripts/lastro-loot-style.mjs', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let currentCss = '';
function currentStyle(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(styleSource) === 'ITEM_OBTAIN_CSS' && node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) currentCss = node.initializer.text;
  ts.forEachChild(node, currentStyle);
}
currentStyle(styleSource);
if (!currentCss) throw new Error('Missing current pickup CSS');
pickupCss = pickupCss.split('/* LastRO item-obtain placement and typography */')[0] + currentCss;
const nativeAppendImplementation = runInNewContext(`({${nativeAppendSource}}).append`, {
  document, console, MouseMode: { FREEZE: 99 },
}) as (this: unknown, target?: Element | string) => void;

type Item = { ITID: number; count?: number; [key: string]: unknown };
const cleanup: Array<() => void> = [];
function fixture(nativeClock = false, renderFrames = false) {
  const root = document.createElement('div').attachShadow({ mode: 'open' });
  root.innerHTML = '<div id="ItemObtain"><div class="content"></div></div>';
  const loads: Array<{ path: string; done: (url: string) => void }> = [];
  const frames = new Map<number, () => void>();
  let frameId = 0;
  const nativeAppend = vi.fn((target?: Element | string) => {
    nativeAppendImplementation.call(component, target);
  });
  const component = {
    __active: false, __loaded: true, _host: root.host, getRoot: () => root,
    onAppend: vi.fn(), onResize: () => {}, _setupScrollbars: vi.fn(), _fixPositionOverflow: vi.fn(), focus: vi.fn(),
    placeOnTop: vi.fn(), onRemove: () => {},
    append: nativeAppend, set: (_item: Item) => { void _item; }, remove: vi.fn(() => {
      component.__active = false;
      component.onRemove();
      root.host.remove();
    }),
  };
  runInNewContext(`(${installer})(component, dependencies, 5000)`, {
    component, dependencies: {
      ...(nativeClock ? {} : { Events: {
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout,
        ...(renderFrames ? {
          requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; },
          cancelAnimationFrame: (id: number) => frames.delete(id),
        } : {}),
      } }),
      DB: {
        INTERFACE_PATH: 'data/', getItemName: (item: Item) => item.display ?? `物品${item.ITID}`,
        getItemInfo: () => ({ identifiedResourceName: 'known', unidentifiedResourceName: 'unknown' }),
      },
      Client: { loadFile: (path: string, done: (url: string) => void) => loads.push({ path, done }) },
    },
  });
  cleanup.push(() => { component.onRemove(); root.host.remove(); });
  return {
    component, root, loads, nativeAppend, frames,
    paint: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    rows: () => [...root.querySelectorAll('.loot-list .loot-row')],
    names: () => [...root.querySelectorAll('.loot-list .loot-name')].map(node => node.textContent),
    counts: () => [...root.querySelectorAll('.loot-list .loot-count')].map(node => node.textContent),
  };
}
function animationEvent(type: string, name: string, elapsed: number, bubbles = false) {
  const event = new Event(type, { bubbles });
  Object.defineProperties(event, { animationName: { value: name }, elapsedTime: { value: elapsed / 1000 } });
  return event;
}
function responsiveFixture(width: number, height: number, zoom = 1, quantizePosition = false) {
  vi.stubGlobal('innerWidth', width); vi.stubGlobal('innerHeight', height);
  const f = fixture(), host = f.root.host as HTMLElement, plane = document.createElement('div');
  plane.style.zoom = String(zoom); document.body.append(plane); f.component.append(plane);
  cleanup.push(() => plane.remove());
  let uiZoom = zoom;
  const number = (name: string, fallback = 0) => Number.parseFloat(host.style.getPropertyValue('--loot-' + name)) || fallback;
  const nativeStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = nativeStyle(element, pseudo);
    if (element !== host) return style;
    // JSDOM does not resolve Shadow :host/custom dimensions or CSS zoom. Supply
    // the native computed layout and a visual rect, including integer offsets.
    return new Proxy(style, { get(target, property) {
      if (property === 'width') return number('width', 304) + 'px';
      if (property === 'height') return number('panel-height', 100) + 'px';
      if (property === 'left') return number('left') + 'px';
      if (property === 'top') return number('top') + 'px';
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
  Object.defineProperties(host, {
    offsetWidth: { get: () => Math.round(number('width', 304)) },
    offsetHeight: { get: () => Math.round(number('panel-height', 100)) },
  });
  vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => {
    // Chromium may resolve visual positions on a subpixel layout grid while
    // the custom-property/computed left/top still retain fractional values.
    const position = (value: number) => quantizePosition ? Math.round(value * 64) / 64 : value;
    const left = position(number('left') * uiZoom), top = position(number('top') * uiZoom);
    const width = number('width', 304) * number('scale', 0.75) * uiZoom;
    const height = number('panel-height', 100) * number('scale', 0.75) * uiZoom;
    return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) };
  });
  return { ...f, host, plane, setViewport: (width: number, height: number) => {
    vi.stubGlobal('innerWidth', width); vi.stubGlobal('innerHeight', height); window.dispatchEvent(new Event('resize'));
  }, setZoom: (zoom: number) => { uiZoom = zoom; plane.setAttribute('style', `zoom:${zoom}`); },
  bounds: () => host.getBoundingClientRect() };
}
function expectViewportFit(f: ReturnType<typeof responsiveFixture>, width: number, height: number) {
  const bounds = f.bounds();
  expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.left).toBeGreaterThanOrEqual(-0.0001); expect(bounds.top).toBeGreaterThanOrEqual(-0.0001);
  expect(bounds.right).toBeLessThanOrEqual(width + 0.0001); expect(bounds.bottom).toBeLessThanOrEqual(height + 0.0001);
  expect(Number.parseFloat(f.host.style.getPropertyValue('--loot-width'))).toBeGreaterThanOrEqual(243);
}

describe('item pickup list behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  });
  afterEach(() => {
    cleanup.splice(0).forEach(remove => remove());
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([1, 1.5].flatMap(zoom => [[1920, 1080], [640, 360], [360, 640], [240, 160]].map(([width, height]) => [zoom, width!, height!])))('fits the complete pickup group at %s GUI zoom and %s×%s viewport', (zoom, width, height) => {
    const f = responsiveFixture(width, height, zoom);
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id, count: 99999 });
    vi.advanceTimersByTime(1500);
    expectViewportFit(f, width, height);
    expect(f.rows().every(row => row.querySelector('.loot-count')?.textContent === '×99999')).toBe(true);
    const css = pickupCss.match(/:host\s*\{[^}]*transform-origin: top left;[^}]*\}/)?.[0];
    expect(css).toContain('position: fixed !important;'); expect(css).toContain('max-width: none;');
  });
  it('refits GUI zoom changes without reinsertion, animation restart, or a resize event', async () => {
    const f = responsiveFixture(640, 360);
    f.component.set({ ITID: 1 }); vi.advanceTimersByTime(100);
    const row = f.rows()[0]!, removeClass = vi.spyOn(row.classList, 'remove'), insert = vi.spyOn(f.root.querySelector('.loot-list')!, 'appendChild');
    const oldWidth = f.bounds().width;
    f.setZoom(1.5);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expectViewportFit(f, 640, 360); expect(f.bounds().width).toBeGreaterThan(oldWidth);
    expect(f.rows()).toEqual([row]); expect(row.classList.contains('is-entering')).toBe(true);
    expect(removeClass).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(139); expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(1); expect(row.classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(4360); expect(row.classList.contains('is-leaving')).toBe(true);
    f.setViewport(240, 160); f.setZoom(1);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expectViewportFit(f, 240, 160); expect(f.rows()).toEqual([row]);
    vi.advanceTimersByTime(399); expect(f.rows()).toEqual([row]);
    vi.advanceTimersByTime(1); expect(f.rows()).toHaveLength(0);
  });
  it('settles its own rounded host mutations and still refits ancestor zoom changes', async () => {
    const NativeObserver = window.MutationObserver;
    let deliveries = 0, overflow = false, drained = 0;
    // Bound the real observer so the regression reports a failure rather than
    // starving the test runner indefinitely with the former feedback loop.
    class BoundedObserver implements MutationObserver {
      private readonly observer: MutationObserver;
      constructor(callback: MutationCallback) {
        this.observer = new NativeObserver(records => {
          if (++deliveries > 20) { overflow = true; this.disconnect(); return; }
          callback(records, this);
        });
      }
      observe(target: Node, options?: MutationObserverInit) { this.observer.observe(target, options); }
      disconnect() { this.observer.disconnect(); }
      takeRecords() { const records = this.observer.takeRecords(); drained += records.length; return records; }
    }
    vi.stubGlobal('MutationObserver', BoundedObserver);
    const f = responsiveFixture(360, 240, 1.5, true);
    let zIndex = 50;
    f.component.placeOnTop.mockImplementation(() => { f.host.style.zIndex = String(++zIndex); });
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    const rows = f.rows(), oldWidth = f.bounds().width;
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(overflow).toBe(false); expect(deliveries).toBeLessThanOrEqual(2);
    expectViewportFit(f, 360, 240); expect(f.rows()).toEqual(rows);

    f.setZoom(1);
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(overflow).toBe(false); expect(deliveries).toBeLessThanOrEqual(4);
    expect(drained).toBeGreaterThan(0);
    expect(f.bounds().width).toBeLessThan(oldWidth);
    expectViewportFit(f, 360, 240); expect(f.rows()).toEqual(rows);
    expect(rows.every(row => row.classList.contains('is-entering'))).toBe(true);
  });
  it('fits all previously visible cards after a small-window resize and preserves each full phase', async () => {
    const f = responsiveFixture(1920, 1080);
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(1500); const rows = f.rows(); expect(rows).toHaveLength(5);
    f.setViewport(240, 160); f.setZoom(1.5);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expectViewportFit(f, 240, 160); expect(f.rows()).toEqual(rows);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    vi.advanceTimersByTime(3100); expect(rows[0]!.classList.contains('is-leaving')).toBe(true);
    f.setViewport(360, 640); expectViewportFit(f, 360, 640);
    expect(f.rows()).toEqual(rows);
    vi.advanceTimersByTime(399); expect(f.rows()).toContain(rows[0]);
    vi.advanceTimersByTime(1); expect(f.rows()).not.toContain(rows[0]); expect(f.rows()).toContain(rows[1]);
  });
  it('cleans layout observation and derives fresh dimensions after reopening', async () => {
    const f = responsiveFixture(640, 360);
    f.component.onResize(); f.component.set({ ITID: 1 });
    f.component.remove(); const style = f.host.style.cssText;
    f.setZoom(1.5); f.setViewport(360, 640);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(f.host.style.cssText).toBe(style);
    f.component.append(f.plane); f.component.set({ ITID: 2 });
    expectViewportFit(f, 360, 640); expect(f.names()).toEqual(['物品2']);
  });

  it('adapts dimensions while displayed cards retain their nodes, quantities and full lifetime on resize', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id, count: id });
    vi.advanceTimersByTime(2000);
    const displayed = f.rows();
    vi.stubGlobal('innerWidth', 640);
    vi.stubGlobal('innerHeight', 360);
    window.dispatchEvent(new Event('resize'));
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    expect(f.rows()).toEqual(displayed);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品6');
    const host = f.root.host as HTMLElement;
    const top = parseFloat(host.style.getPropertyValue('--loot-top'));
    const height = parseFloat(host.style.getPropertyValue('--loot-panel-height'));
    expect(top).toBeGreaterThanOrEqual(16);
    expect(top + height * Number(host.style.getPropertyValue('--loot-scale'))).toBeLessThanOrEqual(344);
    expect(parseFloat(host.style.getPropertyValue('--loot-width'))).toBeLessThan(304);
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 4, count: 2 });
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    expect(f.counts()).toEqual(['×1', '×2', '×3', '×6', '×5']);
    expect(parseFloat(host.style.getPropertyValue('--loot-width'))).toBeGreaterThan(304);
    vi.advanceTimersByTime(2300);
    expect(f.names()).toEqual(['物品4', '物品5', '物品6', '物品7', '物品8']);
    vi.advanceTimersByTime(600);
    expect(f.names()).toEqual(['物品4', '物品6', '物品7', '物品8']);
    vi.advanceTimersByTime(1799);
    expect(f.names()).toContain('物品4');
    vi.advanceTimersByTime(1);
    expect(f.names()).not.toContain('物品4');
  });

  it('removes the resize listener when the notification component closes', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.component.remove();
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
    removeListener.mockRestore();
  });

  it('finishes row and group entrance animations independently inside the Shadow DOM', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    const group = f.root.querySelector('.content')!;
    expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(240);
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-enter', 240, true));
    expect(row.classList.contains('is-entering')).toBe(false);
    expect(group.classList.contains('is-entering')).toBe(true);
    group.dispatchEvent(animationEvent('animationend', 'lastro-loot-fade', 120));
    expect(group.classList.contains('is-entering')).toBe(false);
    expect(f.names()).toEqual(['物品1']);
    vi.advanceTimersByTime(4359);
    expect(row.classList.contains('is-leaving')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(row.classList.contains('is-leaving')).toBe(true);
  });

  it('replays a canceled entrance in full and falls back safely when completion events are absent', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    const group = f.root.querySelector('.content')!;
    vi.advanceTimersByTime(100);
    row.dispatchEvent(animationEvent('animationcancel', 'lastro-loot-enter', 100, true));
    expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(19);
    expect(group.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(group.classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(219);
    expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(row.classList.contains('is-entering')).toBe(false);
    f.component.set({ ITID: 2 });
    const second = f.rows()[1]!;
    expect(second.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(240);
    expect(second.classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(4520);
    expect(f.names()).toEqual(['物品2']);
    vi.advanceTimersByTime(240);
    expect(f.rows()).toHaveLength(0);
  });

  it('cleans entrance listeners and timers when the component closes during its entrance', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    const group = f.root.querySelector('.content')!;
    const rowCleanup = vi.spyOn(row, 'removeEventListener');
    const groupCleanup = vi.spyOn(group, 'removeEventListener');
    f.component.remove();
    expect(row.classList.contains('is-entering')).toBe(false);
    expect(group.classList.contains('is-entering')).toBe(false);
    expect(rowCleanup).toHaveBeenCalledWith('animationend', expect.any(Function));
    expect(rowCleanup).toHaveBeenCalledWith('animationcancel', expect.any(Function));
    expect(groupCleanup).toHaveBeenCalledWith('animationend', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    f.component.set({ ITID: 2 });
    expect(f.rows()[0]?.classList.contains('is-entering')).toBe(true);
    expect(group.classList.contains('is-entering')).toBe(true);
  });

  it('renders names as safe text and keeps same-ID asynchronous icons isolated', () => {
    const f = fixture();
    f.component.set({ ITID: 1, IsIdentified: true, count: 4, display: '^FF0000<b>漂亮旧娃娃</b><img src=x onerror=alert(1)>' });
    f.component.set({ ITID: 1, IsIdentified: false });
    vi.advanceTimersByTime(300);
    expect(f.names()[0]).toBe('漂亮旧娃娃');
    expect(f.root.querySelector('.loot-name')?.children).toHaveLength(0);
    expect(f.counts()).toEqual(['×4', '×1']);
    expect(f.loads.map(load => load.path)).toEqual(['data/item/known.bmp', 'data/item/unknown.bmp']);
    f.loads[1]!.done('https://example.test/unknown.bmp');
    f.loads[0]!.done('https://example.test/known.bmp');
    expect(f.rows().map(row => row.querySelector('img')?.getAttribute('src'))).toEqual([
      'https://example.test/known.bmp', 'https://example.test/unknown.bmp',
    ]);
  });

  it('installs before GUIComponent prepares its lazy Shadow DOM', () => {
    const component = { getRoot: () => null };
    expect(() => runInNewContext(`(${installer})(component, {}, 5000)`, { component })).not.toThrow();
  });

  it('uses browser timers in production, including for newly displayed queued items', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const f = fixture(true);
    for (let id = 1; id <= 6; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(5000);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    vi.advanceTimersByTime(4999);
    expect(f.rows()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.rows()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('merges quantities despite different inventory indexes, refreshing only that row', () => {
    const f = fixture();
    f.component.set({ ITID: 1, count: 2, index: 1 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 2, count: 4 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 1, count: 3, index: 99 });
    expect(f.counts()).toEqual(['×5', '×4']);
    vi.advanceTimersByTime(4000);
    expect(f.names()).toEqual(['物品1']);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(f.rows()).toHaveLength(0);
    expect(f.component.remove).toHaveBeenCalledOnce();
  });

  it('queues beyond five in FIFO order and starts lifetime only on display', () => {
    const f = fixture();
    for (let id = 1; id <= 7; id++) f.component.set({ ITID: id, count: 1 });
    vi.advanceTimersByTime(1200);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    expect(f.root.querySelector('.loot-heading')?.textContent).toBe('获得物品');
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品6');
    expect(f.root.querySelector('.loot-pending')).toBeNull();
    expect(f.loads).toHaveLength(6);
    vi.advanceTimersByTime(2700);
    f.component.set({ ITID: 6, count: 8 });
    expect(f.root.querySelector('.loot-preview .loot-count')?.textContent).toBe('×9');
    vi.advanceTimersByTime(1100);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品7');
    vi.advanceTimersByTime(1200);
    expect(f.names()).toEqual(['物品6', '物品7']);
    expect(f.counts()).toEqual(['×9', '×1']);
    expect(f.root.querySelector<HTMLElement>('.loot-preview')?.hidden).toBe(true);
    vi.advanceTimersByTime(3799);
    expect(f.rows()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品7']);
    vi.advanceTimersByTime(300);
    expect(f.rows()).toHaveLength(0);
  });

  it.each([
    ['RefiningLevel', 5], ['IsIdentified', false], ['slot', { card1: 4001 }],
    ['Options', [{ index: 1, value: 5, param: 0 }]], ['enchantgrade', 2],
    ['bindOnEquipType', 1], ['HireExpireDate', 500], ['IsDamaged', true],
  ])('does not merge different %s attributes', (field, value) => {
    const f = fixture();
    f.component.set({ ITID: 1, IsIdentified: true });
    f.component.set({ ITID: 1, IsIdentified: true, [String(field)]: value });
    vi.advanceTimersByTime(300);
    expect(f.rows()).toHaveLength(2);
  });

  it('normalizes nested key order without changing the item packet', () => {
    const f = fixture();
    const item = { ITID: 1, count: 2, slot: { card1: 10, card2: 20 } };
    f.component.set(item);
    f.component.set({ slot: { card2: 20, card1: 10 }, count: 3, ITID: 1 });
    expect(f.counts()).toEqual(['×5']);
    expect(item.count).toBe(2);
  });

  it('finishes a fading entry before reusing its key for the next pickup', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4700);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    f.component.set({ ITID: 1 });
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    expect(f.rows()[1]?.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(f.counts()).toEqual(['×1']);
    f.component.set({ ITID: 1, count: 3 });
    expect(f.counts()).toEqual(['×4']);
    vi.advanceTimersByTime(5000);
    expect(f.rows()).toHaveLength(0);
    f.component.set({ ITID: 1 });
    expect(f.counts()).toEqual(['×1']);
  });

  it('clears visible entries, queue, timers and stale icon callbacks on removal', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(1200);
    f.component.remove();
    expect(vi.getTimerCount()).toBe(0);
    f.component.set({ ITID: 1 });
    f.loads.at(-1)!.done('https://example.test/new.bmp');
    f.loads[0]!.done('https://example.test/stale.bmp');
    expect(f.root.querySelector('img')?.getAttribute('src')).toBe('https://example.test/new.bmp');
    vi.advanceTimersByTime(5000);
    expect(f.rows()).toHaveLength(0);
    expect(f.loads).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains a burst of 100 distinct items without dropping or reordering any', () => {
    const f = fixture();
    for (let id = 1; id <= 100; id++) f.component.set({ ITID: id });
    const seen = new Set<string>();
    for (let tick = 0; tick < 1100; tick++) {
      expect(f.rows().length).toBeLessThanOrEqual(5);
      for (const name of f.names()) seen.add(name!);
      vi.advanceTimersByTime(100);
    }
    expect([...seen]).toEqual(Array.from({ length: 100 }, (_, i) => `物品${i + 1}`));
    expect(f.rows()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never accelerates the first row when queued loot arrives', () => {
    const f = fixture();
    for (let id = 1; id <= 5; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 6 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 7 });
    vi.advanceTimersByTime(2000);
    expect(f.rows().every(row => !row.classList.contains('is-leaving'))).toBe(true);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    vi.advanceTimersByTime(599);
    expect(f.rows().every(row => !row.classList.contains('is-leaving'))).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.rows().map(row => row.classList.contains('is-leaving'))).toEqual([true, false, false, false, false]);
    vi.advanceTimersByTime(400);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品7');
  });

  it('admits a burst one card every 300ms, with no premature half-row previews', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    expect(f.names()).toEqual(['物品1']);
    expect(f.root.querySelector<HTMLElement>('.loot-preview')?.hidden).toBe(true);
    for (let id = 2; id <= 5; id++) {
      vi.advanceTimersByTime(299);
      expect(f.rows()).toHaveLength(id - 1);
      vi.advanceTimersByTime(1);
      expect(f.rows()).toHaveLength(id);
    }
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品6');
    vi.advanceTimersByTime(3799);
    expect(f.names()[0]).toBe('物品1');
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    vi.advanceTimersByTime(299);
    expect(f.names()[0]).toBe('物品2');
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品3', '物品4', '物品5', '物品6', '物品7']);
  });

  it('merges a queued pickup without recreating or restarting the visible entry animation', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const first = f.rows()[0];
    f.component.set({ ITID: 2, count: 2 });
    vi.advanceTimersByTime(100);
    f.component.set({ ITID: 2, count: 3 });
    f.component.set({ ITID: 1, count: 4 });
    expect(f.rows()[0]).toBe(first);
    expect(f.counts()).toEqual(['×5']);
    vi.advanceTimersByTime(199);
    expect(f.rows()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.counts()).toEqual(['×5', '×5']);
  });

  it('cancels the entrance queue timer when the component closes before the second card', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(100);
    f.component.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(f.rows()).toHaveLength(0);
    f.component.set({ ITID: 99 });
    expect(f.names()).toEqual(['物品99']);
    vi.advanceTimersByTime(300);
    expect(f.names()).toEqual(['物品99']);
  });

  it('closes the group with the final card, but cancels closing if new loot arrives', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const group = f.root.querySelector('.content')!;
    expect(group.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(4600);
    expect(group.classList.contains('is-closing')).toBe(true);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    f.component.set({ ITID: 2 });
    expect(group.classList.contains('is-closing')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(f.names()).toEqual(['物品2']);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4400);
    expect(group.classList.contains('is-closing')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(f.component.remove).toHaveBeenCalledOnce();
    expect(group.classList.contains('is-closing')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the final card exiting while the next identical pickup enters independently', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4700);
    f.component.set({ ITID: 1, count: 2 });
    expect(f.root.querySelector('.content')?.classList.contains('is-closing')).toBe(false);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    expect(f.rows()[1]?.classList.contains('is-entering')).toBe(true);
    expect(f.counts()).toEqual(['×1', '×2']);
    vi.advanceTimersByTime(300);
    expect(f.component.remove).not.toHaveBeenCalled();
    expect(f.counts()).toEqual(['×2']);
  });

  it('waits for an actual paint before consuming either the entrance or exit duration', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    vi.advanceTimersByTime(30_000);
    expect(row.classList.contains('is-entering')).toBe(true);
    expect(f.component.remove).not.toHaveBeenCalled();
    f.paint();
    vi.advanceTimersByTime(30_000);
    expect(row.classList.contains('is-entering')).toBe(true);
    f.paint();
    vi.advanceTimersByTime(239);
    expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(row.classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(4360);
    expect(row.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(f.rows()).toEqual([row]);
    f.paint();
    f.paint();
    vi.advanceTimersByTime(399);
    expect(f.rows()).toEqual([row]);
    vi.advanceTimersByTime(1);
    expect(f.rows()).toHaveLength(0);
    expect(f.frames.size).toBe(0);
  });

  it.each([['entrance', 100], ['holding', 2000], ['exit', 4700]])(
    'pauses %s while hidden and resumes its remaining visible lifetime', (_phase, elapsed) => {
      const hidden = vi.spyOn(document, 'hidden', 'get');
      const f = fixture();
      f.component.set({ ITID: 1 });
      vi.advanceTimersByTime(elapsed as number);
      const row = f.rows()[0]!;
      const classes = row.className;
      hidden.mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(f.root.querySelector('.content')?.classList.contains('is-paused')).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(f.rows()).toEqual([row]);
      expect(row.className).toBe(classes);
      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(4999 - (elapsed as number));
      expect(f.rows()).toEqual([row]);
      vi.advanceTimersByTime(1);
      expect(f.rows()).toHaveLength(0);
    },
  );

  it('holds hidden arrivals and preserves their stagger when the page becomes visible', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const f = fixture();
    for (let id = 1; id <= 7; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(60_000);
    expect(f.names()).toEqual(['物品1']);
    expect(f.rows()[0]?.classList.contains('is-entering')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(299);
    expect(f.names()).toEqual(['物品1']);
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品1', '物品2']);
    vi.advanceTimersByTime(4700);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
  });

  it('pauses for pagehide and does not consume pending first-paint callbacks in the background', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    window.dispatchEvent(new Event('pagehide'));
    expect(f.frames.size).toBe(0);
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('pageshow'));
    f.paint();
    vi.advanceTimersByTime(1000);
    expect(f.rows()[0]?.classList.contains('is-entering')).toBe(true);
    f.paint();
    vi.advanceTimersByTime(240);
    expect(f.rows()[0]?.classList.contains('is-entering')).toBe(false);
  });

  it('replays a canceled exit in full and ignores unrelated or incomplete completion events', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4700);
    const row = f.rows()[0]!;
    row.dispatchEvent(animationEvent('animationcancel', 'lastro-loot-exit', 100));
    row.dispatchEvent(animationEvent('animationend', 'unrelated', 400));
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-exit', 100));
    vi.advanceTimersByTime(399);
    expect(f.rows()).toEqual([row]);
    expect(row.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.rows()).toHaveLength(0);
  });

  it('does not reinsert the attached native host on subsequent append/set packets', () => {
    const f = fixture();
    f.component.append();
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    const observe = vi.fn();
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true });
    vi.advanceTimersByTime(100);
    f.component.append();
    f.component.set({ ITID: 2 });
    expect(f.nativeAppend).toHaveBeenCalledOnce();
    expect(f.component.onAppend).toHaveBeenCalledOnce();
    expect(observer.takeRecords()).toHaveLength(0);
    expect(f.rows()[0]).toBe(row);
    expect(row.classList.contains('is-entering')).toBe(true);
    const differentParent = document.createElement('section');
    document.body.appendChild(differentParent);
    f.component.append(differentParent);
    expect(f.nativeAppend).toHaveBeenCalledTimes(2);
    expect(f.root.host.parentNode).toBe(differentParent);
    observer.disconnect();
    differentParent.remove();
    f.component.remove();
    f.component.append();
    expect(f.nativeAppend).toHaveBeenCalledTimes(3);
  });

  it('still invokes native append when an attached host was marked inactive', () => {
    const f = fixture();
    f.component.append();
    f.component.set({ ITID: 1 });
    f.component.__active = false;
    f.component.append();
    expect(f.nativeAppend).toHaveBeenCalledTimes(2);
    expect(f.component.__active).toBe(true);
  });

  it('keeps an already restarted browser animation rather than canceling it repeatedly', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    f.paint();
    const row = f.rows()[0]!;
    const browserAnimation = { animationName: 'lastro-loot-enter', playState: 'running', currentTime: 10 };
    Object.defineProperty(row, 'getAnimations', { value: () => [browserAnimation] });
    const removeClass = vi.spyOn(row.classList, 'remove');
    row.dispatchEvent(animationEvent('animationcancel', 'lastro-loot-enter', 100));
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-enter', 240));
    expect(removeClass).not.toHaveBeenCalled();
    f.paint();
    f.paint();
    vi.advanceTimersByTime(500);
    expect(row.classList.contains('is-entering')).toBe(true);
    expect(removeClass).not.toHaveBeenCalled();
    browserAnimation.currentTime = 240;
    browserAnimation.playState = 'finished';
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-enter', 240));
    expect(row.classList.contains('is-entering')).toBe(false);
  });

  it('ignores its own queued cancel event while a replacement animation is already running', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    f.paint();
    const row = f.rows()[0]!;
    let browserAnimations: Array<{ animationName: string; playState: string; currentTime: number }> = [];
    Object.defineProperty(row, 'getAnimations', { value: () => browserAnimations });
    const removeClass = vi.spyOn(row.classList, 'remove');
    row.dispatchEvent(animationEvent('animationcancel', 'lastro-loot-enter', 100));
    expect(removeClass).toHaveBeenCalledOnce();
    browserAnimations = [{ animationName: 'lastro-loot-enter', playState: 'running', currentTime: 0 }];
    row.dispatchEvent(animationEvent('animationcancel', 'lastro-loot-enter', 100));
    f.paint();
    f.paint();
    expect(removeClass).toHaveBeenCalledOnce();
    browserAnimations[0]!.currentTime = 240;
    browserAnimations[0]!.playState = 'finished';
    vi.advanceTimersByTime(240);
    expect(row.classList.contains('is-entering')).toBe(true);
    f.paint();
    f.paint();
    vi.advanceTimersByTime(0);
    expect(row.classList.contains('is-entering')).toBe(false);
    expect(removeClass).toHaveBeenCalledTimes(2);
  });

  it('prioritizes a running replacement over an older finished filled animation', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    f.paint();
    const row = f.rows()[0]!;
    const replacement = { animationName: 'lastro-loot-enter', playState: 'running', currentTime: 80 };
    Object.defineProperty(row, 'getAnimations', { value: () => [
      { animationName: 'lastro-loot-enter', playState: 'finished', currentTime: 240 }, replacement,
    ] });
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-enter', 240));
    vi.advanceTimersByTime(500);
    expect(row.classList.contains('is-entering')).toBe(true);
    replacement.currentTime = 240;
    replacement.playState = 'finished';
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-enter', 240));
    expect(row.classList.contains('is-entering')).toBe(false);
  });

  it('requires the full 400ms exit timeline rather than rounding 399.5ms up', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4600);
    const row = f.rows()[0]!;
    const animation = { animationName: 'lastro-loot-exit', playState: 'running', currentTime: 399.5 };
    Object.defineProperty(row, 'getAnimations', { value: () => [animation] });
    vi.advanceTimersByTime(400);
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-exit', 399.5));
    expect(f.rows()).toEqual([row]);
    animation.playState = 'finished';
    vi.advanceTimersByTime(16);
    expect(f.rows()).toEqual([row]);
    animation.currentTime = 400;
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-exit', 400));
    expect(f.rows()).toHaveLength(0);
  });

  it('lets the final native animationend bubble before a completed-timeline fallback removes the group', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    f.paint();
    vi.advanceTimersByTime(4600);
    const row = f.rows()[0]!;
    const animation = { animationName: 'lastro-loot-exit', playState: 'finished', currentTime: 400 };
    Object.defineProperty(row, 'getAnimations', { value: () => [animation] });
    const completed: number[] = [];
    f.root.addEventListener('animationend', event => {
      const nativeEvent = event as AnimationEvent;
      if (nativeEvent.animationName === 'lastro-loot-exit') completed.push(nativeEvent.elapsedTime * 1000);
    });
    f.paint();
    f.paint();
    vi.advanceTimersByTime(400);
    expect(f.rows()).toEqual([row]);
    expect(f.component.remove).not.toHaveBeenCalled();
    f.paint();
    row.dispatchEvent(animationEvent('animationend', 'lastro-loot-exit', 400, true));
    expect(completed).toEqual([400]);
    expect(f.rows()).toHaveLength(0);
    expect(f.component.remove).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses one bounded paint cycle when a completed browser animation never emits animationend', () => {
    const f = fixture(false, true);
    f.component.set({ ITID: 1 });
    f.paint();
    f.paint();
    vi.advanceTimersByTime(4600);
    const row = f.rows()[0]!;
    Object.defineProperty(row, 'getAnimations', { value: () => [
      { animationName: 'lastro-loot-exit', playState: 'finished', currentTime: 400 },
    ] });
    f.paint();
    f.paint();
    vi.advanceTimersByTime(400);
    expect(f.rows()).toEqual([row]);
    f.paint();
    f.paint();
    vi.advanceTimersByTime(0);
    expect(f.rows()).toHaveLength(0);
    expect(f.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves entrance and exit nodes across a capacity-reducing resize', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const row = f.rows()[0]!;
    vi.advanceTimersByTime(100);
    vi.stubGlobal('innerHeight', 200);
    window.dispatchEvent(new Event('resize'));
    expect(f.rows()).toEqual([row]);
    expect(row.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(4600);
    window.dispatchEvent(new Event('resize'));
    expect(f.rows()).toEqual([row]);
    expect(row.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(f.rows()).toHaveLength(0);
  });

  it('immediately clears paused cards and frame callbacks on character cleanup', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const f = fixture(false, true);
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    f.component.remove();
    expect(f.rows()).toHaveLength(0);
    expect(f.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    f.component.set({ ITID: 99 });
    f.paint();
    f.paint();
    vi.advanceTimersByTime(1000);
    expect(f.names()).toEqual(['物品99']);
  });

  it('retains movement under reduced-motion and avoids parent opacity or clipping cutting off card exits', () => {
    const style = document.createElement('style');
    style.textContent = pickupCss.replaceAll(':host', '.test-loot-host');
    document.head.appendChild(style);
    cleanup.push(() => style.remove());
    const f = fixture();
    document.body.appendChild(f.root.host);
    // Light-DOM copies allow JSDOM's CSS cascade to inspect the actual shipped
    // selectors; phase behavior above runs the actual Shadow DOM installer.
    const sample = document.createElement('div');
    sample.id = 'ItemObtain';
    sample.innerHTML = '<div class="content is-closing"><div class="loot-row is-entering"></div><div class="loot-row is-leaving"></div></div>';
    document.body.appendChild(sample);
    cleanup.push(() => sample.remove());
    const rules = [...style.sheet!.cssRules];
    expect(rules.filter(rule => rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion'))).toHaveLength(0);
    expect(getComputedStyle(sample.querySelector('.is-entering')!).animation).toContain('lastro-loot-enter 240ms');
    expect(getComputedStyle(sample.querySelector('.is-leaving')!).animation).toContain('lastro-loot-exit 400ms');
    const group = getComputedStyle(sample.querySelector('.content')!);
    expect(group.opacity).toBe('1');
    expect(group.overflow).toBe('visible');
    expect(group.clipPath).not.toContain('inset');
  });
});
