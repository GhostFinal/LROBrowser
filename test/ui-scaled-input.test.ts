// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeUiInput } from '../scripts/lastro-ui-input.mjs';
import { lastroUiWindowAppend } from '../scripts/lastro-ui-state.mjs';

const source = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeUiInput(source);
function region(text: string, path: string) {
  const start = text.indexOf('//#region ' + path), end = text.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + path);
  return text.slice(start, end);
}
function find(text: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean) {
  const file = ts.createSourceFile('fixture.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), matches: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node, file)) matches.push(node); ts.forEachChild(node, visit); }
  visit(file);
  if (matches.length !== 1) throw new Error('Invalid native fixture anchor');
  return { node: matches[0]!, file };
}
const helperSource = patched.slice(patched.indexOf('// lastro-ui-input-installed'), patched.indexOf('//#region src/UI/GUIComponent.js'));
const dragMethod = find(region(patched, 'src/UI/GUIComponent.js'), (node, file) => ts.isMethodDeclaration(node) && node.name.getText(file) === 'draggable');
const frames: HTMLIFrameElement[] = [];
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); vi.restoreAllMocks(); });

function fixture(ancestor = 1, own = 1, origin = { x: 0, y: 0 }) {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  Object.defineProperty(win, 'innerWidth', { value: 1200, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 900, configurable: true });
  Object.defineProperty(win, 'scrollX', { value: 11, configurable: true });
  Object.defineProperty(win, 'scrollY', { value: 17, configurable: true });
  function hostAt(left: number, top: number, width = 200, height = 100, scale = own) {
    const host = doc.createElement('div');
    Object.assign(host.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, scale: String(scale), transformOrigin: '0 0' });
    Object.defineProperties(host, {
      offsetLeft: { get: () => parseFloat(host.style.left) }, offsetTop: { get: () => parseFloat(host.style.top) },
      offsetWidth: { get: () => width }, offsetHeight: { get: () => height }, offsetParent: { get: () => doc.body },
    });
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => {
      const left = origin.x + host.offsetLeft * ancestor, top = origin.y + host.offsetTop * ancestor;
      const effective = ancestor * Number(host.style.scale), rectWidth = width * effective, rectHeight = height * effective;
      return { x: left, y: top, left, top, width: rectWidth, height: rectHeight, right: left + rectWidth, bottom: top + rectHeight, toJSON: () => ({}) };
    });
    doc.body.append(host); return host;
  }
  const host = hostAt(40, 30), root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<button class="handle">move</button><div class="container"><div class="content"></div></div><div class="hide"></div>';
  const mouse = { screen: { x: 0, y: 0, width: 1200, height: 900 } };
  const animation = new Map<number, () => void>(), intervals = new Map<number, () => void>();
  let nextId = 0;
  const component = {
    _host: host, _shadow: root, _container: root, _isDraggable: false, __active: true, needFocus: true,
    getRoot: () => root, ui: { is: () => true }, magnet: { TOP: false, BOTTOM: false, LEFT: false, RIGHT: false },
    manager: { components: {} as Record<string, unknown> }, onDragEnd: vi.fn(), resize: vi.fn(), resizeHeight: vi.fn(),
    gridSnap: undefined as undefined | { width: number; height: number; padX?: number; padY?: number },
    _lastroWindowState: undefined as undefined | { fit(): void; dispose(): void },
  };
  const context = {
    window: win, document: doc, HTMLElement: win.HTMLElement, Mouse: mouse,
    UI_default: { windowmagnet: false }, _Renderer: { width: 1200, height: 900 }, _snapCache: [],
    requestAnimationFrame: (callback: () => void) => { const id = ++nextId; animation.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => { animation.delete(id); },
    setInterval: (callback: () => void) => { const id = ++nextId; intervals.set(id, callback); return id; },
    clearInterval: (id: number) => { intervals.delete(id); },
  };
  const bindDrag = () => runInNewContext(helperSource + `\n({${dragMethod.node.getText(dragMethod.file)}}).draggable.call(component, '.handle');`, { ...context, component });
  const setContentPointer = (x: number, y: number) => {
    const rect = host.getBoundingClientRect(), effective = ancestor * Number(host.style.scale);
    mouse.screen.x = rect.left + x * effective + win.scrollX;
    mouse.screen.y = rect.top + y * effective + win.scrollY;
  };
  const event = (type: string) => {
    const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(ev, 'which', { value: 1 }); return ev;
  };
  const tick = () => {
    const entry = animation.entries().next().value as [number, () => void] | undefined;
    if (entry) { animation.delete(entry[0]); entry[1](); }
  };
  const start = (touch = false) => {
    setContentPointer(20, 10); bindDrag();
    if (touch) {
      const ev = new win.Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: [{ pageX: mouse.screen.x, pageY: mouse.screen.y }] }); root.querySelector('.handle')!.dispatchEvent(ev);
    } else root.querySelector('.handle')!.dispatchEvent(event('mousedown'));
  };
  const move = (dx: number, dy: number) => { mouse.screen.x += dx; mouse.screen.y += dy; tick(); };
  const release = (touch = false) => { win.dispatchEvent(touch ? new win.Event('touchend') : event('mouseup')); };
  return { win, doc, host, root, component, context, mouse, animation, intervals, hostAt, setContentPointer, tick, start, move, release };
}

describe('native GUI drag in scaled UI coordinates', () => {
  it.each([[1, 1], [1.5, 1], [1.5, 0.65], [1, 0.65]])('moves by the pointer distance with ancestor=%s own=%s without changing global mouse coordinates', (ancestor, own) => {
    const f = fixture(ancestor, own, { x: 9, y: 7 }); f.start();
    const before = f.host.getBoundingClientRect(), pointer = { ...f.mouse.screen };
    f.move(90, 60);
    const after = f.host.getBoundingClientRect();
    expect(after.left - before.left).toBeCloseTo(90); expect(after.top - before.top).toBeCloseTo(60);
    expect(parseFloat(f.host.style.left)).toBeCloseTo(40 + 90 / ancestor);
    expect(f.mouse.screen.x).toBe(pointer.x + 90); expect(f.mouse.screen.y).toBe(pointer.y + 60);
    f.release(); expect(f.animation.size).toBe(0);
    f.host.dispatchEvent(new f.win.Event('transitionend')); expect(f.component.onDragEnd).toHaveBeenCalledOnce();
  });

  it('preserves touch dragging in the same parent coordinate system', () => {
    const f = fixture(1.5, 0.75); f.start(true); const before = f.host.getBoundingClientRect();
    f.move(45, 30); expect(f.host.getBoundingClientRect().left - before.left).toBeCloseTo(45);
    expect(f.host.getBoundingClientRect().top - before.top).toBeCloseTo(30);
    f.release(true); expect(f.animation.size).toBe(0);
  });

  it('snaps to the actual viewport edge using the visually scaled window size', () => {
    const f = fixture(1.5, 0.75); f.start();
    const desiredLeft = 1200 / 1.5 - 200 * 0.75 - 1;
    f.move((desiredLeft - 40) * 1.5, 0);
    expect(f.host.getBoundingClientRect().right).toBeCloseTo(1200); expect(f.component.magnet.RIGHT).toBe(true);
    f.release();
  });

  it.each([1, 1.5].flatMap(ancestor => ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'].map(edge => ({ ancestor, edge }))))(
    'keeps $edge docking flush after release, saved-state fitting and viewport resize at $ancestor scale', async ({ ancestor, edge }) => {
      const origin = { x: 9, y: 7 }, f = fixture(ancestor, 1, origin);
      const preferences = { x: 40, y: 30, save: vi.fn() };
      f.component._isDraggable = true;
      lastroUiWindowAppend(f.component, preferences, () => {}, () => {
        preferences.x = f.host.offsetLeft; preferences.y = f.host.offsetTop;
      });
      f.start();
      const horizontal = edge === 'LEFT' || edge === 'RIGHT', leading = edge === 'LEFT' || edge === 'TOP';
      const viewport = horizontal ? f.win.innerWidth : f.win.innerHeight;
      const size = horizontal ? f.host.offsetWidth : f.host.offsetHeight;
      const offset = horizontal ? origin.x : origin.y;
      const target = (leading ? -offset : viewport - offset) / ancestor - (leading ? 0 : size);
      const distance = (target - (horizontal ? f.host.offsetLeft : f.host.offsetTop)) * ancestor + (leading ? 3 : -3);
      f.move(horizontal ? distance : 0, horizontal ? 0 : distance);
      const assertEdge = () => {
        const rect = f.host.getBoundingClientRect();
        const actual = edge === 'LEFT' ? rect.left : edge === 'RIGHT' ? rect.right : edge === 'TOP' ? rect.top : rect.bottom;
        expect(actual).toBeCloseTo(leading ? 0 : horizontal ? f.win.innerWidth : f.win.innerHeight);
      };
      expect(f.component.magnet[edge as keyof typeof f.component.magnet]).toBe(true);
      assertEdge(); f.release(); assertEdge();
      // Exercise the style observer's delayed fit as well as the immediate mouseup fit.
      f.host.style.opacity = '1';
      await new Promise(resolve => f.win.setTimeout(resolve, 100)); assertEdge();
      Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 800 }, innerHeight: { configurable: true, value: 600 } });
      f.win.dispatchEvent(new f.win.Event('resize')); assertEdge();
      f.component._lastroWindowState!.dispose();
    },
  );

  it('keeps a docked corner flush while fitting and restoring an oversized window', () => {
    const f = fixture(1.5, 1, { x: 9, y: 7 });
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 240 }, innerHeight: { configurable: true, value: 120 } });
    f.component._isDraggable = true; f.component.magnet.RIGHT = f.component.magnet.BOTTOM = true;
    lastroUiWindowAppend(f.component, { save: vi.fn() }, () => {}, () => {});
    const assertCorner = () => {
      const rect = f.host.getBoundingClientRect();
      expect(rect.right).toBeCloseTo(f.win.innerWidth); expect(rect.bottom).toBeCloseTo(f.win.innerHeight);
      expect(rect.left).toBeGreaterThanOrEqual(-0.01); expect(rect.top).toBeGreaterThanOrEqual(-0.01);
    };
    assertCorner(); expect(f.host.style.scale).toBe('0.8');
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 160 }, innerHeight: { configurable: true, value: 200 } });
    f.win.dispatchEvent(new f.win.Event('resize')); assertCorner();
    Object.defineProperties(f.win, { innerWidth: { configurable: true, value: 1200 }, innerHeight: { configurable: true, value: 900 } });
    f.win.dispatchEvent(new f.win.Event('resize')); assertCorner(); expect(f.host.style.scale).toBe('1');
    f.component._lastroWindowState!.dispose();
  });

  it('uses neighboring transformed window bounds while preserving native magnet snapping', () => {
    const f = fixture(1.5, 1); const other = f.hostAt(300, 30, 160, 100, 0.5);
    f.context.UI_default.windowmagnet = true;
    f.component.manager.components.Other = { _host: other, __active: true, needFocus: true, ui: { is: () => true } };
    f.start(); f.move((379 - 40) * 1.5, 0);
    expect(parseFloat(f.host.style.left)).toBeCloseTo(380);
    expect(f.host.getBoundingClientRect().left).toBeCloseTo(other.getBoundingClientRect().right); f.release();
  });

  it('keeps grid snapping in layout units and clamps grid indexes to the scaled viewport', () => {
    const f = fixture(1.5, 0.75); f.component.gridSnap = { width: 25, height: 20, padX: 5, padY: 5 };
    f.start(); f.move((103 - 40) * 1.5, (81 - 30) * 1.5); f.release();
    expect(f.host.style.left).toBe('105px'); expect(f.host.style.top).toBe('85px');
    f.host.dispatchEvent(new f.win.Event('transitionend')); expect(f.component.onDragEnd).toHaveBeenCalledOnce();
    f.start(); f.move(1800, 1500); f.release();
    expect(f.host.getBoundingClientRect().right).toBeLessThanOrEqual(1200);
    expect(f.host.getBoundingClientRect().bottom).toBeLessThanOrEqual(900);
  });
});

const resizeCases = [
  { path: 'ChatBoxSettings/ChatBoxSettings', name: 'onResize$8', target: 'ChatBoxSettings', callback: 'resize$5', x: 0, y: 188, args: [5] },
  { path: 'ItemCompare/ItemCompare', name: 'onResize$7', target: 'ItemCompare', callback: 'resize$4', x: 0, y: 240.25, args: [240] },
  { path: 'PartyFriends/PartyFriendsCommon', name: 'onResize', target: 'Component', x: 225, y: 211, args: [12, 8] },
  { path: 'SkillList/SkillListCommon', name: 'onResize', target: 'comp', callback: 'resize', x: 258, y: 264, args: [8, 7] },
  { path: 'Inventory/InventoryCommon', name: 'onResize', target: 'Component', x: 257, y: 156, args: [7, 4] },
  { path: 'Storage/StorageCommon', name: 'onResize', target: 'Component', callback: 'resizeHeight', x: 0, y: 348, args: [10] },
  { path: 'Storage/StorageV3/StorageFilter', name: 'StorageFilter.prototype.onResize', target: 'self', x: 0, y: 236, args: [6] },
  { path: 'CartItems/CartItems', name: 'onResize$6', target: 'CartItems', x: 257, y: 156, args: [7, 4] },
  { path: 'ItemInfo/ItemInfo', name: 'onResize$5', target: 'ItemInfo', callback: 'resize$3', x: 0, y: 240.25, args: [240] },
  { path: 'ChatRoom/ChatRoom', name: 'onResize$4', target: 'ChatRoom', callback: 'resize$2', x: 321, y: 188, args: [9, 5] },
  { path: 'ShortCut/ShortCut', name: 'onResize$3', target: 'ShortCut', x: 0, y: 76.5, args: [3] },
  { path: 'MakeItemSelection/ItemConvertSelection/ConvertItems', name: 'onResize$2', target: 'ConvertItems', callback: 'resizeHeight$1', x: 0, y: 380, args: [11] },
  { path: 'MakeItemSelection/ItemListWindowSelection', name: 'onResize$1', target: 'ItemListWindowSelection', callback: 'resizeHeight', x: 0, y: 380, args: [11] },
];
function nativeResize(f: ReturnType<typeof fixture>, entry: typeof resizeCases[number]) {
  const actual = find(region(patched, 'src/UI/Components/' + entry.path + '.js'), (node, file) => entry.name.includes('.')
    ? ts.isBinaryExpression(node) && node.left.getText(file) === entry.name && ts.isFunctionExpression(node.right)
    : ts.isFunctionDeclaration(node) && node.name?.text === entry.name);
  const fn = ts.isBinaryExpression(actual.node) ? actual.node.right : actual.node;
  const resize = entry.target === 'self' ? f.component.resizeHeight : entry.callback ? vi.fn() : f.component.resize;
  const preferences = { size: 0, save: vi.fn() };
  const context = { ...f.context, [entry.target]: f.component, [entry.callback || 'unused']: resize, resizableHeight: true, _rowCount: 4, _preferences$19: preferences };
  const handler = runInNewContext(helperSource + '\n(' + fn.getText(actual.file) + ')', context) as (event?: { stopImmediatePropagation: () => void; preventDefault: () => void }, component?: typeof f.component) => void;
  handler.call(f.component, { stopImmediatePropagation() {}, preventDefault() {} }, f.component);
  return { resize, preferences, tick: () => [...f.intervals.values()].forEach(callback => callback()) };
}

describe('real native resize corners', () => {
  for (const [ancestor, own] of [[1, 1], [1.5, 1], [1.5, 0.65]]) {
    it.each(resizeCases)('$path keeps native size/count semantics at ancestor=' + ancestor + ' own=' + own, entry => {
      const f = fixture(ancestor, own, { x: 9, y: 7 }); f.setContentPointer(entry.x, entry.y);
      const { resize, preferences, tick } = nativeResize(f, entry); const pointer = { ...f.mouse.screen }; tick();
      if (entry.target === 'ShortCut') { expect(f.host.style.height).toBe('102px'); expect(preferences.size).toBe(3); expect(preferences.save).toHaveBeenCalledOnce(); }
      else if (entry.target === 'comp') {
        expect(resize).toHaveBeenCalledOnce(); expect(resize.mock.calls[0]![0]).toBe(f.component);
        expect(resize.mock.calls[0]!.slice(1)).toEqual(entry.args);
      }
      else expect(resize).toHaveBeenCalledExactlyOnceWith(...entry.args);
      expect(f.mouse.screen).toEqual(pointer);
      const up = new f.win.MouseEvent('mouseup'); Object.defineProperty(up, 'which', { value: 1 }); f.win.dispatchEvent(up);
      expect(f.intervals.size).toBe(0);
    });
  }
  it('remeasures the current host after a viewport fit moves and scales it during resize', () => {
    const entry = resizeCases.find(entry => entry.target === 'CartItems')!, f = fixture(1.5, 0.65);
    const resize = nativeResize(f, entry); f.setContentPointer(entry.x, entry.y); resize.tick();
    Object.assign(f.host.style, { left: '150px', top: '160px', scale: '0.8' }); f.setContentPointer(entry.x, entry.y); resize.tick();
    expect(resize.resize).toHaveBeenCalledExactlyOnceWith(7, 4);
    f.setContentPointer(entry.x, 188); resize.tick(); expect(resize.resize).toHaveBeenLastCalledWith(7, 5);
  });
  it('keeps VendingReport initial height and pointer delta in logical pixels', () => {
    const f = fixture(1.5, 0.65), content = f.root.querySelector<HTMLElement>('.content')!;
    Object.defineProperty(content, 'offsetHeight', { value: 130 });
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ height: 130 * 1.5 * 0.65 } as DOMRect);
    const entry = region(patched, 'src/UI/Components/VendingReport/VendingReport.js');
    const init = find(entry, (node, file) => ts.isBinaryExpression(node) && node.left.getText(file) === 'VendingReport.init');
    const start = find((init.node as ts.BinaryExpression).right.getText(init.file), (node, file) => ts.isCallExpression(node)
      && node.expression.getText(file) === 'extendBtn.addEventListener' && node.arguments[0]?.getText(file) === '"mousedown"');
    const state = { _host: f.host, _resizing: false, _startY: 0, _startHeight: 0, onResizeDrag() {}, onResizeStop() {} };
    const begin = runInNewContext('(function(){return ' + (start.node as ts.CallExpression).arguments[1]!.getText(start.file) + ';}).call(state)', {
      ...f.context, root: f.root, state,
    }) as (event: { clientY: number; preventDefault: () => void }) => void;
    begin({ clientY: 100, preventDefault() {} }); expect(state._startHeight).toBe(130);
    const handler = find(entry, (node, file) => ts.isBinaryExpression(node) && node.left.getText(file) === 'VendingReport.onResizeDrag');
    const fn = (handler.node as ts.BinaryExpression).right;
    const resize = runInNewContext(helperSource + '\n(' + fn.getText(handler.file) + ')', { ...f.context, _root$7: () => f.root }) as (event: { clientY: number }) => void;
    resize.call(state, { clientY: 100 + 50 * 1.5 * 0.65 });
    expect(content.style.height).toBe('180px'); expect(f.host.style.height).toBe('230px');
  });
});

describe('strict scaled UI patch anchors', () => {
  it('leaves unrelated small fixtures unchanged and rejects duplicate installation', () => {
    expect(patchRuntimeUiInput('const untouched = 1;')).toBe('const untouched = 1;');
    expect(() => patchRuntimeUiInput(patched)).toThrow('already-installed');
  });
  it('rejects drift or missing target functions in an existing native region', () => {
    expect(() => patchRuntimeUiInput(source.replace('const x = host.offsetLeft - Mouse.screen.x;', 'const x = host.offsetLeft + Mouse.screen.x;'))).toThrow('drag-origin');
    expect(() => patchRuntimeUiInput('//#region src/UI/GUIComponent.js\nclass GUIComponent {}\n//#endregion')).toThrow('draggable');
    expect(() => patchRuntimeUiInput('//#region src/UI/Components/CartItems/CartItems.js\nconst drift = 1;\n//#endregion')).toThrow('CartItems/CartItems');
  });
});
