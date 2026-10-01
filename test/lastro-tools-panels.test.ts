// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const panelsSource = readFileSync('scripts/lastro-tools-panels.mjs', 'utf8').replace('export function ', 'function ');
const install = runInNewContext(`${panelsSource}\ninstallLastroToolsPanels;`);
const onlineSource = readFileSync('vendor/v2/Online.js', 'utf8');
const sectionStart = onlineSource.indexOf('function patchLastROToolsTemplate()');
const originalSource = onlineSource.slice(sectionStart, onlineSource.indexOf('//#endregion', sectionStart));
const ast = ts.createSourceFile('LastROTools.js', originalSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function originalAssignment(name: string) {
  let found: ts.BinaryExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === name && !found) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error(`Missing original ${name}`);
  return found.right.getText(ast);
}
const originalTemplate = runInNewContext(originalAssignment('LastROTools_default$1')) as string;
const originalInitSource = originalAssignment('LastROTools.init');

type Route = { npc: string; desc: string; outset: [string, number, number]; path: [string, number, number][] };
type Catalog = Record<string, Record<string, Route>>;
const route = (name: string, map = 'prontera'): Route => ({ npc: name, desc: `${name}说明`, outset: [map, 100, 184], path: [[map, 100, 184]] });
const defaults = (): Catalog => ({ npc: { a: route('地点甲'), b: route('地点乙'), c: route('地点丙') }, train: { t: route('练级地点', 'pay_fild01') }, boss: { boss: route('BOSS 地点', 'moc_fild17') } });
const originalViewport = { width: window.innerWidth, height: window.innerHeight };
const mountedTools: Array<{ remove: () => void }> = [];

function fixture(options: { preferences?: unknown; storage?: Map<string, unknown>; catalogs?: Record<string, Catalog>; profile?: string; confirm?: boolean } = {}) {
  const storage = options.storage ?? new Map<string, unknown>([['1', Object.hasOwn(options, 'preferences') ? options.preferences : { orders: {} }]]);
  let profile = options.profile ?? '1';
  const catalogs = options.catalogs ?? { '1': defaults() };
  const saved = vi.fn();
  const requestRoute = vi.fn<(route: Route) => string | Promise<string | null>>(() => 'teleport');
  const confirmations: Array<{ yes: () => void; no: () => void; popup: { onRemove?: () => void; remove: () => void } }> = [];
  const showPrompt = vi.fn((_message: string, yes: () => void, no: () => void) => {
    const popup = { onRemove: undefined as (() => void) | undefined, remove: vi.fn(() => popup.onRemove?.()) };
    confirmations.push({ popup, yes: () => { popup.remove(); yes(); }, no: () => { popup.remove(); no(); } });
    return popup;
  });
  const cancelRoute = vi.fn(), routeMapChanged = vi.fn(), routeMapChanging = vi.fn(), cancelPendingRoute = vi.fn();
  const loadPreferences = vi.fn(() => {
    const stored = storage.get(profile);
    if (!stored || typeof stored !== 'object') return stored;
    const value = JSON.parse(JSON.stringify(stored));
    value.save = () => { storage.set(profile, JSON.parse(JSON.stringify(value))); saved(); };
    return value;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  class GUIComponent {
    _host = document.createElement('div');
    _root = this._host.attachShadow({ mode: 'open' });
    _cssText: string;
    __active = false;
    render = () => '';
    init = () => {};
    onAppend = () => {};
    onRemove = () => {};
    onDragEnd?: () => void;
    onResize = () => {};
    _fixPositionOverflow = () => {};
    draggable = vi.fn();
    focus = vi.fn();
    _setupScrollbars = vi.fn();
    constructor(public name: string, css: string) { this._cssText = css; this._host.dataset.component = name; this._host.style.zIndex = '50'; }
    getRoot() { return this._root; }
    append() {
      if (!this._root.childNodes.length) {
        const template = document.createElement('template');
        setLastROInnerHTML(template, this.render()); this._root.replaceChildren(template.content); this.init();
      }
      document.body.append(this._host); this.__active = true; this.onAppend();
    }
    remove() { this.__active = false; this.onRemove(); this._host.remove(); }
  }
  const tools = Object.assign(new GUIComponent('LastROTools', ''), {
    render: () => originalTemplate,
    _quickRoutes: {} as Catalog,
    loadQuickRoutes: vi.fn(() => {}),
    populateSkillSelects: vi.fn(), populateItemSelects: vi.fn(),
    setAutomationOption: vi.fn(), updateField: vi.fn(), submitAssistSkill: vi.fn(),
    minimizePanel: vi.fn(), hidePanel: vi.fn(), restorePanel: vi.fn(),
    runQuickRoute: vi.fn(),
    onMapChanged: vi.fn(),
    ensurePanelOpener: (): HTMLElement | null => null,
  });
  tools.hidePanel.mockImplementation(() => { tools._host.style.display = 'none'; });
  tools.restorePanel.mockImplementation(() => { tools._host.style.display = ''; });
  tools.init = runInNewContext(`(${originalInitSource})`, {
    installLastRORandomTeleportShortcut() {},
    showLastROSettingsView() {}, showLastROMainView() {}, activateLastROSettingsTab() {},
  });
  const previousRemove = vi.fn(); tools.onRemove = previousRemove;
  const UIManager = { addComponent: vi.fn((component: GUIComponent) => component) };
  const normalizeRoute = vi.fn((value: Route) => {
    if (!value || typeof value.npc !== 'string' || !Array.isArray(value.path) || !value.path.length) throw new Error('Invalid route');
    return value;
  });
  const deps = {
    document, window, GUIComponent, UIManager, setHtml: setLastROInnerHTML, normalizeRoute, requestRoute, loadPreferences,
    getProfile: () => profile, getPresetRoutes: () => catalogs[profile] ?? {},
    showPrompt: options.confirm ? showPrompt : undefined, cancelRoute, routeMapChanged, routeMapChanging, cancelPendingRoute,
  };
  const api = install(tools, deps, '') as {
    teleport: GUIComponent; showAutomation: () => void; showTeleport: () => void; select: (category: string) => void;
    ordered: (category: string) => string[];
    onMapChanging: () => void; cancelRoute: () => void;
  };
  tools.append();
  mountedTools.push(tools);
  const root = () => api.teleport.getRoot();
  const list = () => root().querySelector<HTMLElement>('.lastro-route-list')!;
  const ids = () => [...list().querySelectorAll<HTMLElement>('[data-route-id]')].map(node => node.dataset.routeId);
  const row = (id: string) => list().querySelector<HTMLElement>(`[data-route-id="${id}"]`)!;
  const handle = (id: string) => row(id).querySelector<HTMLElement>('[data-sort-handle]')!;
  const key = (id: string, direction: string) => handle(id).dispatchEvent(new KeyboardEvent('keydown', { key: direction, bubbles: true, cancelable: true }));
  const pointer = (target: Element, type: string, y: number, pointerId = 1) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: pointerId }); target.dispatchEvent(event);
  };
  const measureRows = () => {
    for (const node of list().querySelectorAll<HTMLElement>('[data-route-id]')) vi.spyOn(node, 'getBoundingClientRect').mockImplementation(() => {
      const top = [...list().children].indexOf(node) * 60;
      return { top, height: 40, bottom: top + 40, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) };
    });
    vi.spyOn(root().querySelector<HTMLElement>('.lastro-route-scroll')!, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 280, bottom: 280, left: 0, right: 400, width: 400, x: 0, y: 0, toJSON: () => ({}) });
  };
  const measurePanels = (scale = 1, origin = { x: 0, y: 0 }) => {
    const hosts = new Set([tools._host, api.teleport._host]);
    const layoutSize = (host: HTMLElement, axis: 'width' | 'height') => Math.min(
      parseFloat(host.style[axis]) || (axis === 'width' ? 520 : 390),
      parseFloat(host.style[axis === 'width' ? 'maxWidth' : 'maxHeight']) || Infinity,
    );
    for (const host of hosts) {
      Object.defineProperties(host, {
        offsetWidth: { get: () => Math.round(layoutSize(host, 'width')) },
        offsetHeight: { get: () => Math.round(layoutSize(host, 'height')) },
        offsetLeft: { get: () => parseFloat(host.style.left) || 0 },
        offsetTop: { get: () => parseFloat(host.style.top) || 0 },
      });
      vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => {
        const left = origin.x + host.offsetLeft * scale, top = origin.y + host.offsetTop * scale;
        const width = layoutSize(host, 'width') * scale, height = layoutSize(host, 'height') * scale;
        return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) };
      });
    }
    const computed = window.getComputedStyle.bind(window);
    // jsdom does not resolve used max-constrained sizes or ancestor CSS zoom.
    // Model those browser measurements while exercising the actual installer.
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
      const style = computed(node, pseudo);
      if (!hosts.has(node as HTMLDivElement)) return style;
      return new Proxy(style, {
        get(target, property) {
          if (property === 'width' || property === 'height') return `${layoutSize(node as HTMLElement, property)}px`;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
  };
  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    window.dispatchEvent(new Event('resize'));
  };
  return { api, tools, root, list, ids, row, handle, key, pointer, measureRows, saved, storage, catalogs, requestRoute, previousRemove, loadPreferences,
    showPrompt, confirmations, cancelRoute, routeMapChanged, routeMapChanging, cancelPendingRoute, measurePanels, setViewport,
    setProfile: (value: string) => { profile = value; } };
}

afterEach(() => {
  mountedTools.splice(0).forEach(tools => tools.remove());
  document.body.replaceChildren(); vi.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalViewport.width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalViewport.height });
});

function resizePointer(target: EventTarget, type: string, x: number, y: number, pointerId = 7, pointerType = 'mouse', button = 0) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } });
  target.dispatchEvent(event);
}

describe('native tools window resize handles', () => {
  it.each([
    ['auto', 1], ['auto', 1.5], ['teleport', 1], ['teleport', 1.5],
  ] as const)('resizes %s at %s ancestor scale, saves logical dimensions and restores them after reopening and reloading', (key, scale) => {
    const geometry = { [key]: { x: 40, y: 60, width: 500, height: 420 } };
    const f = fixture({ preferences: { orders: { npc: ['b', 'a', 'c'] }, geometry } });
    f.measurePanels(scale); f.setViewport(2400, 1600);
    const show = () => key === 'auto' ? f.api.showAutomation() : f.api.showTeleport();
    show();
    const component = key === 'auto' ? f.tools : f.api.teleport;
    const handle = component.getRoot().querySelector<HTMLButtonElement>('.lastro-window-resize')!;
    const captured = vi.fn(), released = vi.fn(); handle.setPointerCapture = captured; handle.releasePointerCapture = released;
    expect(handle.dataset.background).toBe('btn_resize.bmp'); expect(handle.textContent).toBe('');
    expect(handle.closest('.lastro-panel-footer')?.getAttribute('data-background')).toBe('basic_interface/btnbar_mid.bmp');
    const originalFields = [...component.getRoot().querySelectorAll('[data-field],[data-option]')];
    const rect = component._host.getBoundingClientRect();
    resizePointer(handle, 'pointerdown', rect.right, rect.bottom);
    resizePointer(window, 'pointermove', rect.right + 90 * scale, rect.bottom + 50 * scale, 8);
    expect(component._host.style.width).toBe('500px');
    resizePointer(window, 'pointermove', rect.right + 90 * scale, rect.bottom + 50 * scale);
    expect(component._host.style.width).toBe('590px'); expect(component._host.style.height).toBe('470px');
    expect(f.saved).not.toHaveBeenCalled();
    resizePointer(window, 'pointerup', rect.right + 90 * scale, rect.bottom + 50 * scale);
    expect(captured).toHaveBeenCalledWith(7); expect(released).toHaveBeenCalledWith(7); expect(f.saved).toHaveBeenCalledOnce();
    expect(f.storage.get('1')).toEqual({ orders: { npc: ['b', 'a', 'c'] }, geometry: { [key]: { x: 40, y: 60, width: 590, height: 470 } } });
    expect(component._host.style.fontSize).toBe(''); expect([...component.getRoot().querySelectorAll('[data-field],[data-option]')]).toEqual(originalFields);
    expect(f.requestRoute).not.toHaveBeenCalled(); expect(f.tools.setAutomationOption).not.toHaveBeenCalled();
    if (key === 'auto') f.tools.hidePanel(); else f.api.teleport.remove();
    show(); expect(component._host.style.width).toBe('590px'); expect(component._host.style.height).toBe('470px');
    f.tools.remove();
    const reloaded = fixture({ storage: f.storage }); reloaded.measurePanels(scale); reloaded.setViewport(2400, 1600);
    if (key === 'auto') reloaded.api.showAutomation(); else reloaded.api.showTeleport();
    const host = (key === 'auto' ? reloaded.tools : reloaded.api.teleport)._host;
    expect(host.style.width).toBe('590px'); expect(host.style.height).toBe('470px');
  });

  it('does not save a click or a tiny movement on a temporarily constrained panel', () => {
    const geometry = { auto: { x: 30, y: 50, width: 610, height: 410 } };
    const f = fixture({ preferences: { orders: {}, geometry } }); f.measurePanels(1.5); f.setViewport(400, 280); f.api.showAutomation();
    const handle = f.tools.getRoot().querySelector('.lastro-window-resize')!;
    const rect = f.tools._host.getBoundingClientRect();
    resizePointer(handle, 'pointerdown', rect.right, rect.bottom);
    resizePointer(window, 'pointerup', rect.right + 1, rect.bottom + 1);
    expect(f.saved).not.toHaveBeenCalled(); expect(f.storage.get('1')).toEqual({ orders: {}, geometry });
    f.setViewport(1600, 1100);
    expect(f.tools._host.style.width).toBe('610px'); expect(f.tools._host.style.height).toBe('410px');
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur'])('rolls back %s without saving, requesting a route or leaving listeners active', action => {
    const geometry = { teleport: { x: 40, y: 60, width: 500, height: 420 } };
    const f = fixture({ preferences: { orders: {}, geometry } }); f.measurePanels(); f.setViewport(1600, 1100); f.api.showTeleport();
    const handle = f.root().querySelector('.lastro-window-resize')!, rect = f.api.teleport._host.getBoundingClientRect();
    resizePointer(handle, 'pointerdown', rect.right, rect.bottom);
    resizePointer(window, 'pointermove', rect.right + 60, rect.bottom + 40);
    expect(f.api.teleport._host.style.width).toBe('560px');
    if (action === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else if (action === 'blur') window.dispatchEvent(new Event('blur'));
    else resizePointer(action === 'lostpointercapture' ? handle : window, action, rect.right + 60, rect.bottom + 40);
    resizePointer(window, 'pointerup', rect.right + 100, rect.bottom + 100);
    expect(f.api.teleport._host.style.width).toBe('500px'); expect(f.api.teleport._host.style.height).toBe('420px');
    expect(f.api.teleport._host.classList.contains('lastro-is-resizing')).toBe(false);
    expect(f.saved).not.toHaveBeenCalled(); expect(f.requestRoute).not.toHaveBeenCalled();
    expect(f.storage.get('1')).toEqual({ orders: {}, geometry });
  });

  it('caps touch resizing to a viewport smaller than the normal minimum and keeps category scrolling available', () => {
    const f = fixture(); f.measurePanels(1.5, { x: 13, y: 17 }); f.setViewport(250, 180); f.api.showTeleport();
    const handle = f.root().querySelector('.lastro-window-resize')!, rect = f.api.teleport._host.getBoundingClientRect();
    resizePointer(handle, 'pointerdown', rect.right, rect.bottom, 3, 'touch', -1);
    resizePointer(window, 'pointermove', rect.right + 900, rect.bottom + 900, 3, 'touch', -1);
    resizePointer(window, 'pointerup', rect.right + 900, rect.bottom + 900, 3, 'touch', -1);
    const assertFits = () => {
      const bounds = f.api.teleport._host.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(7.99); expect(bounds.top).toBeGreaterThanOrEqual(7.99);
      expect(bounds.right).toBeLessThanOrEqual(242.01); expect(bounds.bottom).toBeLessThanOrEqual(172.01);
    };
    assertFits();
    const scroll = f.root().querySelector<HTMLElement>('.lastro-route-scroll')!; scroll.scrollTop = 200;
    const height = f.api.teleport._host.style.height;
    f.api.select('custom'); assertFits(); expect(f.root().querySelector<HTMLFormElement>('[data-custom-form]')!.hidden).toBe(false);
    f.api.select('npc'); assertFits(); expect(scroll.hidden).toBe(false); expect(scroll.scrollTop).toBe(0);
    expect(f.api.teleport._host.style.height).toBe(height); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('cancels a pending size edit on close, logout and profile switch without contaminating saved sizes', () => {
    const storage = new Map<string, unknown>([
      ['1', { orders: {}, geometry: { auto: { x: 20, y: 20, width: 500, height: 420 } } }],
      ['2', { orders: {}, geometry: { auto: { x: 50, y: 70, width: 450, height: 350 } } }],
    ]);
    const f = fixture({ storage }); f.measurePanels(); f.setViewport(1800, 1300); f.api.showAutomation();
    const start = () => {
      const rect = f.tools._host.getBoundingClientRect();
      resizePointer(f.tools.getRoot().querySelector('.lastro-window-resize')!, 'pointerdown', rect.right, rect.bottom);
      resizePointer(window, 'pointermove', rect.right + 60, rect.bottom + 50);
      return rect;
    };
    let rect = start(); f.tools.hidePanel(); resizePointer(window, 'pointerup', rect.right + 60, rect.bottom + 50);
    f.api.showAutomation(); expect(f.tools._host.style.width).toBe('500px');
    rect = start(); f.setProfile('2'); resizePointer(window, 'pointerup', rect.right + 60, rect.bottom + 50);
    f.api.showAutomation(); expect(f.tools._host.style.width).toBe('450px'); expect(f.tools._host.style.height).toBe('350px');
    rect = start(); f.tools.remove(); resizePointer(window, 'pointerup', rect.right + 60, rect.bottom + 50);
    expect(f.saved).not.toHaveBeenCalled();
    expect(storage.get('1')).toEqual({ orders: {}, geometry: { auto: { x: 20, y: 20, width: 500, height: 420 } } });
    expect(storage.get('2')).toEqual({ orders: {}, geometry: { auto: { x: 50, y: 70, width: 450, height: 350 } } });
  });
});

describe('separate automation and teleport windows', () => {
  it.each([1, 1.5])('fits both panels inside a small viewport at %s ancestor scale without resetting their behavior', scale => {
    const f = fixture(); f.measurePanels(scale, { x: 13, y: 17 }); f.setViewport(360, 260);
    const assertFits = (host: HTMLElement) => {
      const rect = host.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(7.99); expect(rect.top).toBeGreaterThanOrEqual(7.99);
      expect(rect.right).toBeLessThanOrEqual(352.01); expect(rect.bottom).toBeLessThanOrEqual(252.01);
    };
    f.api.showAutomation(); assertFits(f.tools._host);
    expect(f.tools._host.style.width).toBe('520px');
    expect(f.tools.getRoot().querySelector('.lastro-settings-body')).not.toBeNull();
    f.api.showTeleport(); assertFits(f.api.teleport._host);
    expect(f.tools._host.style.display).toBe('none'); expect(f.ids()).toEqual(['a', 'b', 'c']);
    f.key('a', 'ArrowDown'); expect(f.ids()).toEqual(['b', 'a', 'c']);
    f.api.select('custom'); assertFits(f.api.teleport._host);
    expect(f.root().querySelector<HTMLFormElement>('[data-custom-form]')!.hidden).toBe(false);
    f.api.showAutomation(); assertFits(f.tools._host);
    expect(f.api.teleport._host.isConnected).toBe(false);
    expect(f.requestRoute).not.toHaveBeenCalled(); expect(f.tools.setAutomationOption).not.toHaveBeenCalled();
  });

  it.each([1, 1.5])('temporarily constrains saved size and position then restores them after enlarging the viewport at %s scale', scale => {
    const geometry = { auto: { x: 300, y: 120, width: 610, height: 410 }, teleport: { x: 280, y: 150, width: 480, height: 420 } };
    const f = fixture({ preferences: { orders: {}, geometry } }); f.measurePanels(scale); f.setViewport(1600, 1100);
    for (const key of ['auto', 'teleport'] as const) {
      if (key === 'auto') f.api.showAutomation(); else f.api.showTeleport();
      const component = key === 'auto' ? f.tools : f.api.teleport, host = component._host;
      const preferred = geometry[key];
      expect(host.style.left).toBe(`${preferred.x}px`); expect(host.style.top).toBe(`${preferred.y}px`);
      f.setViewport(320, 240);
      const rect = host.getBoundingClientRect();
      expect(rect.right).toBeLessThanOrEqual(312.01); expect(rect.bottom).toBeLessThanOrEqual(232.01);
      expect(host.style.width).toBe(`${preferred.width}px`); expect(host.style.height).toBe(`${preferred.height}px`);
      f.setViewport(1600, 1100);
      expect(host.style.left).toBe(`${preferred.x}px`); expect(host.style.top).toBe(`${preferred.y}px`);
      expect(host.getBoundingClientRect().width).toBeCloseTo(preferred.width * scale);
      expect(host.getBoundingClientRect().height).toBeCloseTo(preferred.height * scale);
    }
    expect(f.saved).not.toHaveBeenCalled(); expect(f.storage.get('1')).toEqual({ orders: {}, geometry });
  });

  it('saves logical drag geometry in existing profile preferences without replacing route order or saving a temporary size', () => {
    const geometry = { auto: { x: 20, y: 20, width: 610, height: 410 } };
    const f = fixture({ preferences: { orders: { npc: ['b', 'a', 'c'] }, geometry } });
    f.measurePanels(1.5); f.setViewport(400, 280); f.api.showAutomation();
    Object.assign(f.tools._host.style, { left: '12px', top: '10px' }); f.tools.onDragEnd?.();
    expect(f.storage.get('1')).toEqual({ orders: { npc: ['b', 'a', 'c'] }, geometry: { auto: { x: 12, y: 10, width: 610, height: 410 } } });
    expect(f.saved).toHaveBeenCalledOnce();
    f.setViewport(1600, 1100); expect(f.tools._host.style.left).toBe('12px'); expect(f.tools._host.style.width).toBe('610px');
    f.storage.set('2', { orders: {}, geometry: { auto: { x: 80, y: 90, width: 450 } } });
    f.setProfile('2'); f.api.showAutomation();
    expect(f.tools._host.style.left).toBe('80px'); expect(f.tools._host.style.top).toBe('90px');
    expect(f.tools._host.style.width).toBe('450px'); expect(f.tools._host.style.height).toBe('auto');
    expect(f.saved).toHaveBeenCalledOnce();
  });

  it('uses one viewport listener across toggles and removes it on logout while preserving a pending confirmation on resize', () => {
    const added = vi.spyOn(window, 'addEventListener'), removed = vi.spyOn(window, 'removeEventListener');
    const f = fixture({ confirm: true }); f.measurePanels(); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.setViewport(420, 300);
    expect(f.confirmations[0]!.popup.remove).not.toHaveBeenCalled(); expect(f.requestRoute).not.toHaveBeenCalled();
    f.confirmations[0]!.no(); f.api.showAutomation(); f.api.showTeleport(); f.api.showAutomation();
    const resizeCalls = added.mock.calls.filter(([name]) => name === 'resize'); expect(resizeCalls).toHaveLength(1);
    f.tools.remove();
    expect(removed.mock.calls.some(([name, listener]) => name === 'resize' && listener === resizeCalls[0]![1])).toBe(true);
    const before = f.tools._host.style.cssText; f.setViewport(200, 180); expect(f.tools._host.style.cssText).toBe(before);
    f.tools.append(); f.api.showAutomation();
    expect(added.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(2);
    expect(f.tools._host.getBoundingClientRect().right).toBeLessThanOrEqual(192.01);
  });

  it('keeps the dock entries independent while opening only one tools window at a time', () => {
    const f = fixture();
    const dock = document.getElementById('lastro-tools-dock')!;
    const buttons = dock.querySelectorAll<HTMLButtonElement>('button');
    expect([...buttons].map(button => button.getAttribute('aria-label'))).toEqual(['打开传送列表', '打开挂机设置']);
    expect([...buttons].map(button => button.textContent)).toEqual(['', '']);
    const automation = dock.querySelector<HTMLButtonElement>('[aria-label="打开挂机设置"]')!;
    const teleport = dock.querySelector<HTMLButtonElement>('[aria-label="打开传送列表"]')!;
    expect(f.tools._host.style.display).toBe('none');
    expect(f.api.teleport._host.isConnected).toBe(false);
    automation.click();
    expect(f.tools._host.style.display).toBe('');
    expect(f.tools.getRoot().querySelector('.lastro-ro-titlebar strong')?.textContent).toBe('挂机设置');
    expect(f.tools.getRoot().querySelector('.lastro-main-view')).toBeNull();
    expect(f.api.teleport._host.isConnected).toBe(false);
    automation.click();
    expect(f.tools._host.style.display).toBe('none');
    expect(dock.isConnected).toBe(true);
    automation.click();
    expect(f.tools._host.style.display).toBe('');
    teleport.click();
    expect(f.api.teleport._host.isConnected).toBe(true);
    expect(f.tools._host.style.display).toBe('none');
    expect(f.root().querySelector('.lastro-ro-titlebar strong')?.textContent).toBe('传送地点');
    expect(f.root().querySelector('[data-option]')).toBeNull();
    teleport.click();
    expect(f.api.teleport._host.isConnected).toBe(false);
    expect(f.tools._host.style.display).toBe('none');
    expect(dock.isConnected).toBe(true);
    teleport.click();
    expect(f.api.teleport._host.isConnected).toBe(true);
    automation.click();
    expect(f.tools._host.style.display).toBe('');
    expect(f.api.teleport._host.isConnected).toBe(false);
    expect(f.requestRoute).not.toHaveBeenCalled();
    expect(f.tools.setAutomationOption).not.toHaveBeenCalled();
  });

  it('uses only red book and gear artwork without button chrome below ordinary window layers', () => {
    const f = fixture();
    const dock = document.getElementById('lastro-tools-dock')!;
    const buttons = [...dock.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map(button => button.querySelector('[data-background]')?.getAttribute('data-background')))
      .toEqual(['ro_menu_icon/skill_1.bmp', 'ro_menu_icon/option_1.bmp']);
    expect(buttons.every(button => button.textContent === '' && !!button.getAttribute('aria-label'))).toBe(true);
    for (const button of buttons) {
      const style = getComputedStyle(button);
      expect(style.borderTopWidth).toBe('0px'); expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(['', 'none']).toContain(style.backgroundImage); expect(['', 'none']).toContain(style.boxShadow);
    }
    const dockLayer = Number(getComputedStyle(dock).zIndex || 0);
    expect(dockLayer).toBeLessThan(Number(f.tools._host.style.zIndex));
    expect(dockLayer).toBeLessThan(Number(f.api.teleport._host.style.zIndex));
  });

  it.each([['autoAttack', 'battle'], ['autoFollow', 'battle'], ['autoLoot', 'pick'], ['autoPots', 'eat']])('keeps the original %s checkbox wired to its original server option', (option, panel) => {
    const f = fixture(); f.api.showAutomation();
    const input = f.tools.getRoot().querySelector<HTMLInputElement>(`[data-option="${option}"]`)!;
    expect(input.type).toBe('checkbox');
    expect(input.closest('[data-tab-panel]')?.getAttribute('data-tab-panel')).toBe(panel);
    input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
    input.checked = false; input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.tools.setAutomationOption.mock.calls).toEqual([[option, true], [option, false]]);
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('renders destination names and descriptions as safe text in the selected category', () => {
    const unsafe = route('<img src=x onerror="alert(1)">'); unsafe.desc = '<script>alert(2)</script>';
    const f = fixture({ catalogs: { '1': { npc: { unsafe }, boss: { boss: route('首领地点') } } } });
    f.api.showTeleport();
    expect(f.root().querySelector('.lastro-route-name')?.textContent).toBe(unsafe.npc);
    expect(f.root().querySelector('.lastro-route-desc')?.textContent).toBe(unsafe.desc);
    expect(f.root().querySelector('img, script, [onerror]')).toBeNull();
    f.root().querySelector<HTMLButtonElement>('[data-category="boss"]')!.click();
    expect(f.ids()).toEqual(['boss']);
    expect(f.root().querySelector('[data-category="boss"]')?.getAttribute('aria-selected')).toBe('true');
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('preserves every original settings field and automation option while moving their positions', () => {
    const f = fixture();
    const original = document.createElement('template'); setLastROInnerHTML(original, originalTemplate);
    const keys = (root: ParentNode, attribute: string) => [...root.querySelectorAll(`[${attribute}]`)].map(node => node.getAttribute(attribute)).sort();
    expect(keys(f.tools.getRoot(), 'data-field')).toEqual(keys(original.content, 'data-field'));
    expect(keys(f.tools.getRoot(), 'data-option')).toEqual(keys(original.content, 'data-option'));
    for (const source of original.content.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')) {
      const target = f.tools.getRoot().querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${source.dataset.field}"]`)!;
      expect(target.tagName).toBe(source.tagName); expect(target.type).toBe(source.type);
      expect(target.value).toBe(source.value);
      if (source.tagName === 'SELECT') expect(target.innerHTML).toBe(source.innerHTML);
    }
    expect(f.tools.getRoot().querySelector('.lastro-quick-toggles')).toBeNull();
  });

  it('places the attack target group before basic battle settings without losing target controls', () => {
    const f = fixture(); f.api.showAutomation();
    const battle = f.tools.getRoot().querySelector('[data-tab-panel="battle"]')!;
    const targets = battle.querySelector('[data-targets]')!.closest('.lastro-group')!;
    const basic = [...battle.querySelectorAll('.lastro-group')].find(group => group.querySelector('.lastro-group-title')?.textContent === '基础')!;
    expect(targets.parentElement).toBe(battle);
    expect(targets.compareDocumentPosition(basic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(battle.querySelectorAll('[data-targets]')).toHaveLength(1);
    expect(f.tools.getRoot().querySelectorAll('[data-option]')).toHaveLength(4);
  });

  it('returns the settings scroll container to the top when each automation tab changes', () => {
    const f = fixture(); f.api.showAutomation();
    const root = f.tools.getRoot(), viewport = root.querySelector<HTMLElement>('.lastro-settings-body')!;
    for (const tab of ['pick', 'eat', 'mode', 'battle']) {
      viewport.scrollTop = 180;
      root.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)!.click();
      expect(viewport.scrollTop).toBe(0);
    }
    expect(f.tools.setAutomationOption).not.toHaveBeenCalled(); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it.each(['dock opener', 'native restore entry'])('closes teleport and invalidates its pending confirmation through the %s', entry => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    if (entry === 'dock opener') document.querySelector<HTMLButtonElement>('#lastro-tools-dock [aria-label="打开挂机设置"]')!.click();
    else f.tools.restorePanel();
    expect(f.tools._host.style.display).toBe(''); expect(f.api.teleport._host.isConnected).toBe(false);
    expect(f.confirmations[0]!.popup.remove).toHaveBeenCalledOnce();
    f.confirmations[0]!.yes(); expect(f.requestRoute).not.toHaveBeenCalled();
  });
});

describe('destination sorting and profile persistence', () => {
  it('resets scroll position on destination category changes from mouse and keyboard', () => {
    const f = fixture(); f.api.showTeleport();
    const viewport = f.root().querySelector<HTMLElement>('.lastro-route-scroll')!;
    for (const category of ['train', 'money', 'challenge', 'instance', 'boss', 'custom', 'npc']) {
      viewport.scrollTop = 220;
      f.root().querySelector<HTMLButtonElement>(`[data-category="${category}"]`)!.click();
      expect(viewport.scrollTop).toBe(0);
    }
    viewport.scrollTop = 220;
    f.root().querySelector<HTMLButtonElement>('[data-category="npc"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(viewport.scrollTop).toBe(0); expect(f.root().querySelector('[data-category="train"]')?.getAttribute('aria-selected')).toBe('true');
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('keeps the current scroll position while keyboard sorting within a category', () => {
    const f = fixture(); f.api.showTeleport();
    const viewport = f.root().querySelector<HTMLElement>('.lastro-route-scroll')!;
    viewport.scrollTop = 120; f.key('a', 'ArrowDown');
    expect(f.ids()).toEqual(['b', 'a', 'c']); expect(viewport.scrollTop).toBe(120);
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('saves keyboard ordering across closing, reopening, and a new tools instance', () => {
    const f = fixture(); f.api.showTeleport(); f.key('a', 'ArrowDown');
    expect(f.ids()).toEqual(['b', 'a', 'c']);
    expect(f.saved).toHaveBeenCalledOnce();
    f.api.teleport.remove(); f.api.showTeleport();
    expect(f.ids()).toEqual(['b', 'a', 'c']);
    f.tools.remove();
    const next = fixture({ storage: f.storage }); next.api.showTeleport();
    expect(next.ids()).toEqual(['b', 'a', 'c']);
    expect(f.requestRoute).not.toHaveBeenCalled(); expect(next.requestRoute).not.toHaveBeenCalled();
  });

  it('supports dragging a row down and back up while committing only on pointer release', () => {
    const f = fixture(); f.api.showTeleport(); f.measureRows();
    f.pointer(f.handle('a'), 'pointerdown', 20); f.pointer(f.list(), 'pointermove', 170);
    expect(f.ids()).toEqual(['b', 'c', 'a']); expect(f.saved).not.toHaveBeenCalled();
    f.pointer(f.list(), 'pointerup', 170);
    expect(f.saved).toHaveBeenCalledOnce();
    f.pointer(f.handle('a'), 'pointerdown', 140); f.pointer(f.list(), 'pointermove', 0); f.pointer(f.list(), 'pointerup', 0);
    expect(f.ids()).toEqual(['a', 'b', 'c']); expect(f.saved).toHaveBeenCalledTimes(2);
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('keeps pointer capture on the stationary list while the dragged handle changes DOM position', () => {
    const f = fixture(); f.api.showTeleport(); f.measureRows();
    const listCapture = vi.fn(), listRelease = vi.fn(), handleCapture = vi.fn(), handleRelease = vi.fn();
    Object.defineProperty(f.list(), 'setPointerCapture', { configurable: true, value: listCapture });
    Object.defineProperty(f.list(), 'releasePointerCapture', { configurable: true, value: listRelease });
    Object.defineProperty(f.handle('a'), 'setPointerCapture', { configurable: true, value: handleCapture });
    Object.defineProperty(f.handle('a'), 'releasePointerCapture', { configurable: true, value: handleRelease });
    f.pointer(f.handle('a'), 'pointerdown', 20, 7);
    expect(listCapture).toHaveBeenCalledExactlyOnceWith(7); expect(handleCapture).not.toHaveBeenCalled();
    f.pointer(f.list(), 'pointermove', 170, 7); expect(f.ids()).toEqual(['b', 'c', 'a']);
    f.pointer(f.list(), 'pointerup', 170, 7);
    expect(listRelease).toHaveBeenCalledExactlyOnceWith(7); expect(handleRelease).not.toHaveBeenCalled();
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'lostpointercapture'])('restores the prior order when a drag ends with %s', type => {
    const f = fixture(); f.api.showTeleport(); f.measureRows();
    f.pointer(f.handle('a'), 'pointerdown', 20); f.pointer(f.list(), 'pointermove', 170);
    expect(f.ids()).toEqual(['b', 'c', 'a']);
    f.pointer(f.list(), type, 170);
    expect(f.ids()).toEqual(['a', 'b', 'c']); expect(f.saved).not.toHaveBeenCalled();
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('cancels unfinished drag sorting when selecting another category', () => {
    const f = fixture(); f.api.showTeleport(); f.measureRows();
    f.pointer(f.handle('a'), 'pointerdown', 20); f.pointer(f.list(), 'pointermove', 170);
    f.api.select('boss'); f.api.select('npc');
    expect(f.ids()).toEqual(['a', 'b', 'c']);
    expect((f.storage.get('1') as { orders: Record<string, unknown> }).orders.npc).toBeUndefined();
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('merges saved ordering with newly added and removed destinations', () => {
    const f = fixture({ preferences: { category: 'npc', orders: { npc: ['b', 'gone', 'b', 42, 'a'] } } });
    f.api.showTeleport(); expect(f.ids()).toEqual(['b', 'a', 'c']);
    f.catalogs['1']!.npc = { b: route('地点乙'), c: route('地点丙'), d: route('新增地点') };
    f.api.teleport.remove(); f.api.showTeleport();
    expect(f.ids()).toEqual(['b', 'c', 'd']); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('restores default ordering only for the selected category', () => {
    const f = fixture({ preferences: { orders: { npc: ['c', 'b', 'a'], train: ['t'] } } });
    f.api.showTeleport(); expect(f.ids()).toEqual(['c', 'b', 'a']);
    f.root().querySelector<HTMLButtonElement>('[data-reset-order]')!.click();
    expect(f.ids()).toEqual(['a', 'b', 'c']);
    const stored = f.storage.get('1') as { orders: Record<string, unknown> };
    expect(stored.orders.npc).toBeUndefined(); expect(stored.orders.train).toEqual(['t']);
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('uses each profile catalog and its own saved order after switching profiles', () => {
    const storage = new Map<string, unknown>([
      ['1', { category: 'npc', orders: { npc: ['b', 'a'] } }],
      ['2', { category: 'boss', orders: { boss: ['two', 'one'] } }],
    ]);
    const f = fixture({ storage, catalogs: { '1': defaults(), '2': { boss: { one: route('二区首领一'), two: route('二区首领二') } } } });
    f.api.showTeleport(); expect(f.ids()).toEqual(['b', 'a', 'c']);
    f.setProfile('2'); f.api.showTeleport(); expect(f.ids()).toEqual(['two', 'one']);
    expect(f.root().textContent).toContain('二区首领二'); expect(f.root().textContent).not.toContain('地点甲');
    f.key('one', 'ArrowUp');
    expect((storage.get('2') as { orders: Record<string, unknown> }).orders.boss).toEqual(['one', 'two']);
    expect((storage.get('1') as { orders: Record<string, unknown> }).orders.npc).toEqual(['b', 'a']);
    f.setProfile('1'); f.api.showTeleport(); expect(f.ids()).toEqual(['b', 'a', 'c']);
    expect(f.requestRoute).not.toHaveBeenCalled();
  });
});

describe('destination actions and lifecycle', () => {
  it('waits for resource checks and displays their failure without claiming a request was sent', async () => {
    const f = fixture(); f.api.showTeleport();
    let reject!: (error: Error) => void;
    f.requestRoute.mockReturnValue(new Promise((_resolve, failure) => { reject = failure; }));
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    expect(f.root().querySelector('[role="status"]')?.textContent).toBe('正在检查传送地点');
    reject(new Error('地图资源不存在')); await Promise.resolve();
    expect(f.root().querySelector('[role="status"]')?.textContent).toBe('无法前往：地图资源不存在');
  });

  it('ignores a late resource result after switching to automation and cancels its pending check', async () => {
    const f = fixture(); f.api.showTeleport();
    let resolve!: (value: string) => void;
    f.requestRoute.mockReturnValue(new Promise(success => { resolve = success; }));
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.api.showAutomation(); const calls = f.cancelPendingRoute.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    resolve('teleport'); await Promise.resolve();
    expect(f.root().querySelector('[role="status"]')?.textContent).not.toContain('已发送传送请求');
  });

  it('requests a route only when its dedicated go button is clicked', () => {
    const f = fixture(); f.api.showTeleport();
    f.row('a').querySelector<HTMLElement>('.lastro-route-name')!.click(); f.handle('a').click();
    f.api.select('boss'); f.api.select('npc');
    expect(f.requestRoute).not.toHaveBeenCalled();
    f.row('b').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(f.catalogs['1']!.npc!.b);
    expect(f.root().querySelector('[role="status"]')?.textContent).toContain('已发送传送请求：地点乙');
  });

  it('validates custom destinations before passing them to the existing route request', () => {
    const f = fixture(); f.api.showTeleport(); f.api.select('custom');
    const form = f.root().querySelector<HTMLFormElement>('[data-custom-form]')!;
    const set = (name: string, value: string) => { (form.elements.namedItem(name) as HTMLInputElement).value = value; };
    set('map', '../prontera'); set('x', '100'); set('y', '184');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(f.requestRoute).not.toHaveBeenCalled();
    set('map', 'PRONTERA.GAT'); set('x', '65536');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(f.requestRoute).not.toHaveBeenCalled();
    set('x', '0'); set('y', '65535');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outset: ['prontera', 0, 65535], path: [['prontera', 0, 65535]] }));
  });

  it.each([null, 'corrupt JSON', 42, { category: 'missing', orders: [] }, { orders: { npc: 'corrupt order' } }])('recovers malformed preferences without losing the route catalog', preferences => {
    const f = fixture({ preferences });
    expect(() => f.api.showTeleport()).not.toThrow(); expect(f.ids()).toEqual(['a', 'b', 'c']);
    expect(() => f.key('a', 'ArrowDown')).not.toThrow();
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('removes both windows and the dock on logout without committing a pending drag', () => {
    const f = fixture(); f.api.showAutomation(); f.api.showTeleport(); f.measureRows();
    f.pointer(f.handle('a'), 'pointerdown', 20); f.pointer(f.list(), 'pointermove', 170);
    f.tools.remove();
    expect(document.getElementById('lastro-tools-dock')).toBeNull();
    expect(f.api.teleport._host.isConnected).toBe(false); expect(f.tools._host.isConnected).toBe(false);
    expect(f.previousRemove).toHaveBeenCalledOnce(); expect(f.saved).not.toHaveBeenCalled();
    expect(f.cancelRoute).toHaveBeenCalledOnce();
    expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('retains a catalog entry with missing coordinates as a disabled destination', () => {
    const unavailable = { npc: '未提供坐标', desc: '原版入口说明', path: [] } as unknown as Route;
    const f = fixture({ catalogs: { '1': { npc: { unavailable, a: route('可用地点') } } } }); f.api.showTeleport();
    expect(f.ids()).toEqual(['unavailable', 'a']);
    const button = f.row('unavailable').querySelector<HTMLButtonElement>('.lastro-route-go')!;
    expect(button.disabled).toBe(true); expect(button.textContent).toBe('不可用');
    button.click(); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('forwards map changes to the existing route controller', () => {
    const f = fixture(); f.tools.onMapChanged();
    expect(f.routeMapChanged).toHaveBeenCalledOnce(); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('preserves a confirmed route during map cleanup while canceling an unconfirmed popup', () => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click(); f.confirmations[0]!.yes();
    f.row('b').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.api.onMapChanging(); f.tools.remove();
    expect(f.routeMapChanging).toHaveBeenCalledOnce(); expect(f.cancelRoute).not.toHaveBeenCalled();
    expect(f.confirmations[1]!.popup.remove).toHaveBeenCalledOnce();
    f.confirmations[1]!.yes();
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(f.catalogs['1']!.npc!.a);
    expect(document.getElementById('lastro-tools-dock')).toBeNull();
    expect(f.api.teleport._host.isConnected).toBe(false);
  });

  it('cancels routing on ordinary logout and through explicit cancellation during a map transition', () => {
    const logout = fixture({ confirm: true }); logout.api.showTeleport();
    logout.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click(); logout.confirmations[0]!.yes();
    logout.tools.remove(); expect(logout.cancelRoute).toHaveBeenCalledOnce();

    const canceled = fixture({ confirm: true }); canceled.api.showTeleport();
    canceled.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click(); canceled.confirmations[0]!.yes();
    canceled.row('b').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    canceled.api.onMapChanging(); canceled.api.cancelRoute();
    expect(canceled.cancelRoute).toHaveBeenCalledOnce();
    expect(canceled.confirmations[1]!.popup.remove).toHaveBeenCalledOnce();
    canceled.confirmations[1]!.yes(); expect(canceled.requestRoute).toHaveBeenCalledOnce();
    canceled.tools.remove(); expect(canceled.cancelRoute).toHaveBeenCalledTimes(2);
  });
});

describe('native destination confirmation', () => {
  it('opens only on a go click, cancels without sending, and sends once after native removal followed by yes', () => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLElement>('.lastro-route-name')!.click(); f.handle('a').click();
    expect(f.showPrompt).not.toHaveBeenCalled();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.requestRoute).not.toHaveBeenCalled();
    f.confirmations[0]!.no(); expect(f.requestRoute).not.toHaveBeenCalled();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.confirmations[1]!.yes(); f.confirmations[1]!.yes();
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(f.catalogs['1']!.npc!.a);
  });

  it('does not open duplicate confirmations when different go buttons are clicked repeatedly', () => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.row('b').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.requestRoute).not.toHaveBeenCalled();
    f.confirmations[0]!.yes();
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(f.catalogs['1']!.npc!.a);
  });

  it.each(['window close', 'icon close', 'logout'])('removes a pending confirmation on %s and rejects its stale yes callback', reason => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    if (reason === 'logout') f.tools.remove();
    else if (reason === 'icon close') document.querySelector<HTMLButtonElement>('#lastro-tools-dock [aria-label="打开传送列表"]')!.click();
    else f.root().querySelector<HTMLButtonElement>('[data-action="close"]')!.click();
    expect(f.confirmations[0]!.popup.remove).toHaveBeenCalledOnce();
    f.confirmations[0]!.yes(); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('rejects a yes callback after external popup removal and recovers for a later request', async () => {
    const f = fixture({ confirm: true }); f.api.showTeleport();
    f.row('a').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    f.confirmations[0]!.popup.remove(); await Promise.resolve();
    f.confirmations[0]!.yes(); expect(f.requestRoute).not.toHaveBeenCalled();
    f.row('b').querySelector<HTMLButtonElement>('.lastro-route-go')!.click();
    expect(f.showPrompt).toHaveBeenCalledTimes(2);
    f.confirmations[1]!.yes();
    expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith(f.catalogs['1']!.npc!.b);
  });
});
