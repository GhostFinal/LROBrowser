// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastroUiWindowAppend, patchRuntimeUiState } from '../scripts/lastro-ui-state.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeUiState(native);
function region(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing region: ' + path);
  return source.slice(start, end);
}
function template(version: number, kind = 'Inventory') {
  const path = kind === 'WinStats' ? 'WinStats/WinStats/WinStats' : `Inventory/InventoryV${version}/InventoryV${version}`;
  const text = region(native, `src/UI/Components/${path}.html?raw`);
  const file = ts.createSourceFile('html.js', text, ts.ScriptTarget.Latest, true);
  let html = '';
  function visit(node: ts.Node) { if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) html = node.right.text; ts.forEachChild(node, visit); }
  visit(file); return html;
}
const cursorFile = ts.createSourceFile('Cursor.js', region(native, 'src/UI/CursorManager.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let cursorRender = '';
function findCursorRender(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(cursorFile) === 'render') cursorRender = node.getText(cursorFile);
  ts.forEachChild(node, findCursorRender);
}
findCursorRender(cursorFile);
if (!cursorRender.includes('document.body.classList.add("custom-cursor")')) throw new Error('Missing native cursor frame class mutation');
const guiFile = ts.createSourceFile('GUI.js', region(patched, 'src/UI/GUIComponent.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let nativeDraggable = '';
function findDraggable(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(guiFile) === 'draggable') {
    if (nativeDraggable) throw new Error('Duplicate native draggable method');
    nativeDraggable = node.getText(guiFile);
  }
  ts.forEachChild(node, findDraggable);
}
findDraggable(guiFile);
if (!nativeDraggable) throw new Error('Missing actual native draggable method');
function cursorFrames(doc: Document) {
  return vm.runInNewContext(`class Cursor { static ACTION={DEFAULT:0}; ${cursorRender} }; tick => Cursor.render(tick);`, {
    document: doc, GraphicsSettings: { cursor: true }, _compiledStyle: ['compiled'], _selector: null,
    ActionInformations: [{ delayMult: 1, startX: 0, startY: 0 }], _type$4: 0, _action$2: { actions: [{ delay: 1, animations: [] }] }, _animation: 0, _play: false,
  }) as (tick: number) => void;
}
const frames: HTMLIFrameElement[] = [];
interface NativeInventory {
  _host: HTMLElement; list: { index: number }[];
  _lastroWindowState: { save(): void };
  magnet: Record<string, boolean>;
  isEmbedded?: () => boolean;
  append(): void; remove(): void; resize(width: number, height: number): void; getRoot(): ShadowRoot;
}
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); });
function mount(version = 0, storage: Record<string, string> = {}, kind: 'Inventory' | 'WinStats' = 'Inventory') {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  let zoom = 1;
  const mouse = { screen: { x: 10, y: 10, width: 1200, height: 800 } };
  const raf = new Map<number, FrameRequestCallback>(); let rafId = 0;
  const context = vm.createContext({ window: win, document: doc, Event: win.Event, console,
    localStorage: { getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; } },
    __esmMin: (init: () => void) => init, UIVersionManager: { getInventoryVersion: () => version },
    Client: { loadFile: (_path: string, done: (value: string) => void) => done('') },
    DB: { INTERFACE_PATH: '' }, Renderer: { width: 1200, height: 800 }, UIManager: { addComponent: (value: unknown) => value },
    html: template(version, kind), version, zoomValue: () => zoom,
    lastroUiWindowAppend, HTMLElement: win.HTMLElement, Mouse: mouse, UI_default: { windowmagnet: false }, _snapCache: [], _Renderer: { width: 1200, height: 800 },
    requestAnimationFrame: (callback: FrameRequestCallback) => { raf.set(++rafId, callback); return rafId; }, cancelAnimationFrame: (id: number) => raf.delete(id),
  });
  vm.runInContext(`
    ${region(patched, 'src/Core/Preferences.js')}
    init_Preferences$1();
    class GUIComponent {
      constructor(name) { this.name=name; this.magnet={}; this._host=document.createElement('div');
        this._host.style.position='absolute'; this._host.attachShadow({mode:'open'});
        this._shadow=this._host.shadowRoot; this._container=this._shadow;
        if(name==='WinStats'){this._host.style.width='280px';this._host.style.height='140px';}
        this.ui={is:()=>this._host.style.display!=='none',show:()=>this._host.style.display='',hide:()=>this._host.style.display='none'};
        for (const [property,css] of [['offsetWidth','width'],['offsetHeight','height'],['offsetLeft','left'],['offsetTop','top']]) {
          Object.defineProperty(this._host,property,{get:()=>property==='offsetWidth'||property==='offsetHeight' ? (this._host.style.display==='none'?0:parseFloat(this._host.style[css])||(property==='offsetHeight'&&version>0?194:0)) : parseFloat(this._host.style[css])||0});
        }
        this._host.getBoundingClientRect=()=>{const z=zoomValue(),s=Number(this._host.style.scale)||1;
          const left=this._host.offsetLeft*z,top=this._host.offsetTop*z,width=this._host.offsetWidth*z*s,height=this._host.offsetHeight*z*s;
          return {left,top,width,height,right:left+width,bottom:top+height};};
      }
      getRoot(){return this._host.shadowRoot;} ${nativeDraggable}
      focus(){} clearNewItems(){} _fixPositionOverflow(){}
      append(){if(!this.loaded){this.getRoot().innerHTML=this.render();this.loaded=true;document.body.append(this._host);this.init();}else document.body.append(this._host);this.onAppend();}
      remove(){this.onRemove();this._host.remove();}
    }
    ${region(patched, kind === 'Inventory' ? 'src/UI/Components/Inventory/InventoryCommon.js' : 'src/UI/Components/WinStats/WinStatsCommon.js')}
    globalThis.create = () => ${kind === 'Inventory' ? "createInventory({name:'InventoryV'+version,htmlText:html,cssText:'',defaultHeight:4,resizableHeight:version===0})" : "createWinStats({name:'WinStats',htmlText:html,cssText:'',hasTraits:false})"};
    globalThis.preferences=Preferences;
  `, context);
  const component = (context.create as () => NativeInventory)();
  const saved = () => JSON.parse(storage[kind === 'Inventory' ? 'InventoryV' + version : 'WinStats']!) as { _version: number; width: number; height: number; x: number; y: number; reduce: boolean };
  const flush = () => win.dispatchEvent(new win.Event('mouseup'));
  const tickDrag = () => { const tasks = [...raf.values()]; raf.clear(); tasks.forEach(task => task(0)); };
  const mouseEvent = (type: string) => { const event = new win.MouseEvent(type, { bubbles: true, button: 0 }); Object.defineProperty(event, 'which', { value: 1 }); return event; };
  const dragTo = (left: number, top: number) => {
    const x = component._host.offsetLeft, y = component._host.offsetTop;
    mouse.screen.x = mouse.screen.y = 10;
    component.getRoot().querySelector('.titlebar')!.dispatchEvent(mouseEvent('mousedown'));
    mouse.screen.x = left - x + 10; mouse.screen.y = top - y + 10; tickDrag();
  };
  return { win, doc, component, saved, flush, storage, context, setZoom: (value: number) => { zoom = value; }, dragTo, endDrag: () => win.dispatchEvent(mouseEvent('mouseup')) };
}

describe('native window preferences', () => {
  it.each([
    { kind: 'Inventory' as const, zoom: 1 }, { kind: 'Inventory' as const, zoom: 1.5 },
    { kind: 'WinStats' as const, zoom: 1 }, { kind: 'WinStats' as const, zoom: 1.5 },
  ])('retains native $kind titlebar dragging during cursor frames at $zoom zoom before the debounced save', async ({ kind, zoom }) => {
    const f = mount(0, {}, kind); f.setZoom(zoom); f.component.append(); f.component._host.style.display = '';
    for (const key of ['LEFT', 'RIGHT', 'TOP', 'BOTTOM']) f.component.magnet[key] = false;
    Object.assign(f.component._host.style, { left: '30px', top: '40px' }); f.flush();
    const renderCursor = cursorFrames(f.doc); renderCursor(0); await Promise.resolve(); await Promise.resolve();
    f.dragTo(130, 90);
    expect(f.component._host.style.left).toBe('130px'); expect(f.component._host.style.top).toBe('90px');
    renderCursor(16); renderCursor(32); await Promise.resolve(); await Promise.resolve();
    expect(f.component._host.style.left).toBe('130px'); expect(f.component._host.style.top).toBe('90px');
    f.endDrag(); expect(f.saved().x).toBe(130); expect(f.saved().y).toBe(90);
    f.component.remove(); const restored = mount(0, f.storage, kind); restored.setZoom(zoom); restored.component.append();
    expect(restored.component._host.style.left).toBe('130px'); expect(restored.component._host.style.top).toBe('90px');
  });

  it.each(['Inventory', 'WinStats'] as const)('captures unsaved %s drag movement before a genuine ancestor scale or class change fits it', async kind => {
    const f = mount(0, {}, kind); f.component.append(); f.component._host.style.display = '';
    for (const key of ['LEFT', 'RIGHT', 'TOP', 'BOTTOM']) f.component.magnet[key] = false;
    Object.assign(f.component._host.style, { left: '30px', top: '40px' }); f.flush();
    f.dragTo(130, 90); f.setZoom(1.5); f.doc.body.style.setProperty('zoom', '1.5');
    await Promise.resolve(); await Promise.resolve();
    expect(f.component._host.style.left).toBe('130px'); expect(f.component._host.style.top).toBe('90px');
    f.endDrag(); f.dragTo(260, 220); f.doc.body.classList.add('native-theme-change');
    await Promise.resolve(); await Promise.resolve();
    expect(f.component._host.style.left).toBe('260px'); expect(f.component._host.style.top).toBe('220px');
    f.endDrag(); expect(f.saved().x).toBe(260); expect(f.saved().y).toBe(220);
  });

  it.each(['Inventory', 'WinStats'] as const)('does not persist the temporary fitted %s position when native cursor and ancestor mutations continue in a small viewport', async kind => {
    const f = mount(0, {}, kind); f.component.append(); f.component._host.style.display = '';
    for (const key of ['LEFT', 'RIGHT', 'TOP', 'BOTTOM']) f.component.magnet[key] = false;
    Object.assign(f.component._host.style, { left: '620px', top: '410px' }); f.flush();
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 320 }, innerHeight: { configurable: true, value: 240 } });
    f.setZoom(1.5); f.win.dispatchEvent(new f.win.Event('resize'));
    expect(parseFloat(f.component._host.style.left)).toBeLessThan(620);
    const renderCursor = cursorFrames(f.doc); renderCursor(0); renderCursor(16); f.doc.body.classList.add('native-theme-change');
    await Promise.resolve(); await Promise.resolve();
    f.win.dispatchEvent(new f.win.Event('pagehide'));
    expect(f.saved().x).toBe(620); expect(f.saved().y).toBe(410);
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 1200 }, innerHeight: { configurable: true, value: 900 } });
    f.setZoom(1); f.win.dispatchEvent(new f.win.Event('resize'));
    expect(f.component._host.style.left).toBe('620px'); expect(f.component._host.style.top).toBe('410px');
  });

  it.each([0, 1, 2, 3])('initializes hidden InventoryV%i with its full saved height', version => {
    const f = mount(version); f.component.append();
    expect(f.component._host.style.display).toBe('none');
    expect(parseFloat(f.component._host.style.height)).toBeGreaterThan(17);
    expect(f.component.getRoot().querySelector<HTMLElement>('.panel')!.style.display).not.toBe('none');
    f.component._host.style.display = ''; f.flush();
    expect(f.saved().reduce).toBe(false);
    const height = f.component._host.style.height;
    f.component._host.style.display = 'none'; f.flush(); f.component.remove();
    const restored = mount(version, f.storage); restored.component.append();
    expect(restored.component._host.style.height).toBe(height);
    expect(restored.component.getRoot().querySelector<HTMLElement>('.panel')!.style.display).not.toBe('none');
  });

  it('creates a valid keyed/versioned record and recovers corrupt local UI data', () => {
    const f = mount(0, { InventoryV0: '{broken' });
    expect(f.saved()._version).toBe(1); expect(f.saved().width).toBe(7);
    f.component.append(); f.component._host.style.display = '';
    f.component.resize(8, 5); f.flush();
    expect(f.saved().width).toBe(8); expect(f.saved().height).toBe(5);
  });

  it.each([0, 1, 2, 3])('saves InventoryV%i size/position without quitting or clearing items', version => {
    const f = mount(version); f.component.append(); f.component._host.style.display = '';
    f.component.list.push({ index: 9 });
    f.component.resize(8, 5); Object.assign(f.component._host.style, { left: '130px', top: '90px' }); f.flush();
    expect(f.saved().width).toBe(8); if (version === 0) expect(f.saved().height).toBe(5);
    expect(f.saved().x).toBe(130); expect(f.saved().y).toBe(90);
    expect(f.component.list).toHaveLength(1);
    f.component._host.style.display = 'none'; f.flush();
    const restored = mount(version, f.storage); restored.component.append();
    expect(restored.component._host.style.width).toBe(f.component._host.style.width);
    expect(restored.component._host.style.left).toBe('130px');
    expect(restored.component._host.style.top).toBe('90px');
    expect(restored.saved().reduce).toBe(false);
  });

  it('retains expanded and folded state with correct logical dimensions at 150% zoom', () => {
    const f = mount(); f.setZoom(1.5); f.component.append(); f.component._host.style.display = '';
    f.component.resize(8, 5); f.flush(); expect(f.saved().reduce).toBe(false);
    const mini = f.component.getRoot().querySelector('.titlebar .mini')!;
    mini.dispatchEvent(new f.win.Event('click', { bubbles: true })); f.flush();
    expect(f.saved().reduce).toBe(true); expect(f.saved().height).toBe(5);
    const collapsed = mount(0, f.storage); collapsed.setZoom(1.5); collapsed.component.append();
    expect(collapsed.component._host.style.height).toBe('17px');
    collapsed.component._host.style.display = '';
    collapsed.component.getRoot().querySelector('.titlebar .mini')!.dispatchEvent(new collapsed.win.Event('click', { bubbles: true })); collapsed.flush();
    expect(collapsed.saved().reduce).toBe(false); expect(collapsed.component._host.style.height).not.toBe('17px');
  });

  it('keeps preferred geometry while temporarily fitting a small viewport and restores it on enlargement', () => {
    const f = mount(); f.component.append(); f.component._host.style.display = '';
    f.component.resize(8, 5); Object.assign(f.component._host.style, { left: '700px', top: '500px' }); f.flush();
    const original = f.saved();
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 240 }, innerHeight: { configurable: true, value: 160 } });
    f.setZoom(1.5); f.win.dispatchEvent(new f.win.Event('resize'));
    const rect = f.component._host.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(-0.01); expect(rect.top).toBeGreaterThanOrEqual(-0.01);
    expect(rect.right).toBeLessThanOrEqual(240.01); expect(rect.bottom).toBeLessThanOrEqual(160.01);
    f.win.dispatchEvent(new f.win.Event('pagehide'));
    expect(f.saved().x).toBe(original.x); expect(f.saved().y).toBe(original.y); expect(f.saved().width).toBe(8);
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 1200 }, innerHeight: { configurable: true, value: 900 } });
    f.setZoom(1); f.win.dispatchEvent(new f.win.Event('resize'));
    expect(f.component._host.style.scale).toBe('1'); expect(f.component._host.style.top).toBe('500px');
  });

  it('flushes pagehide, survives native cleanup, and keeps the preference save method usable', () => {
    const f = mount(); f.component.append(); f.component._host.style.display = '';
    f.component.resize(6, 2); f.win.dispatchEvent(new f.win.Event('pagehide'));
    expect(f.saved().width).toBe(6); expect(f.saved().height).toBe(2);
    f.component.remove(); expect(f.saved().width).toBe(6); expect(f.saved().height).toBe(2);
    f.component.append(); f.component.resize(8, 4); f.flush(); expect(f.saved().width).toBe(8);
  });

  it('ignores browser rounding of temporary fitted positions at fractional zoom', () => {
    const f = mount(); f.component.append(); f.component._host.style.display = '';
    f.component.resize(8, 5); Object.assign(f.component._host.style, { left: '700px', top: '500px' }); f.flush();
    const original = f.saved();
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 960 }, innerHeight: { configurable: true, value: 560 } });
    f.setZoom(1.5); f.win.dispatchEvent(new f.win.Event('resize'));
    f.component._host.style.left = parseFloat(f.component._host.style.left).toFixed(3) + 'px';
    f.component._host.style.top = parseFloat(f.component._host.style.top).toFixed(3) + 'px';
    f.flush();
    expect(f.saved().x).toBe(original.x); expect(f.saved().y).toBe(original.y);
  });

  it('does not stack wrappers when the same window is reopened', () => {
    const f = mount(); f.component.append(); const resize = f.component.resize;
    f.component.append(); expect(f.component.resize).toBe(resize);
    const save = vi.spyOn(f.component._lastroWindowState, 'save');
    f.component.append(); expect(save).not.toHaveBeenCalled();
  });

  it('keeps independent geometry when a window is temporarily embedded beside equipment', () => {
    const f = mount(); f.component.append(); f.component._host.style.display = '';
    f.component.magnet.LEFT = false;
    Object.assign(f.component._host.style, { left: '130px', top: '90px' }); f.flush();
    const original = f.saved(); f.component.isEmbedded = () => true;
    Object.assign(f.component._host.style, { left: '600px', top: '400px' }); f.flush();
    expect(f.component._host.style.left).toBe('600px');
    expect(f.saved().x).toBe(original.x); expect(f.saved().y).toBe(original.y);
    f.component.isEmbedded = () => false; f.component.append();
    expect(f.component._host.style.left).toBe('130px'); expect(f.component._host.style.top).toBe('90px');
  });

  it('preserves equipment status-panel choices after hiding and native removal cleanup', () => {
    const f = mount(), host = f.doc.createElement('div'); f.doc.body.append(host);
    Object.assign(host.style, { left: '80px', top: '70px', width: '300px', height: '200px' });
    const root = host.attachShadow({ mode: 'open' });
    let embedded = true, saved = false;
    const pref = { x: 80, y: 70, stats: true, save() { saved = this.stats; } };
    const component = { _host: host, getRoot: () => root, onRemove() { embedded = false; pref.stats = false; pref.save(); } };
    lastroUiWindowAppend(component, pref, () => {}, () => { pref.stats = embedded; });
    host.style.display = 'none'; embedded = false; pref.save(); expect(saved).toBe(true);
    component.onRemove(); expect(saved).toBe(true); expect(pref.stats).toBe(true);
  });

  it('patches real common factories and preserves automatic map/navigation/quest tracking placement', () => {
    expect(patched).toContain('return lastroUiWindowAppend(this, _preferences');
    expect(region(patched, 'src/UI/Components/Storage/StorageCommon.js')).toContain('resizeHeight(_preferences.height)');
    expect(region(patched, 'src/UI/Components/SkillList/SkillListCommon.js')).toContain('_preferences.width = width; _preferences.height = height');
    expect(region(patched, 'src/UI/Components/Quest/Quest/QuestWindow.js')).not.toContain('lastroUiWindowAppend');
    expect(region(patched, 'src/UI/Components/WorldMap/WorldMap.js')).not.toContain('lastroUiWindowAppend');
    expect(patchRuntimeUiState(patched)).toBe(patched);
  });
});
