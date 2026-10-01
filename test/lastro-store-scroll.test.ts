// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLastroStoreScroll, patchRuntimeStoreScroll, type StoreScrollApi } from '../scripts/lastro-store-scroll.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
function region(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + path);
  return source.slice(start, end + '//#endregion'.length);
}
const native = region(vendor, 'src/UI/Components/NpcStore/NpcStore.js'), patched = patchRuntimeStoreScroll(native);
function extract(source: string) {
  const file = ts.createSourceFile('NpcStore.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), assignments = new Map<string, string>(), functions: string[] = [];
  const names = new Set(['installLastroStoreScroll', 'addItem', 'resize', 'getCurrentPref', '_escapeHTML', '_hideAll', '_showAll', 'formatStoreItemName', 'prettyZeny', 'onDragStart']);
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text || '')) functions.push(node.getText(file));
    if (ts.isBinaryExpression(node)) assignments.set(node.left.getText(file), node.getText(file) + ';');
    ts.forEachChild(node, visit);
  }
  visit(file);
  const wanted = ['NpcStore.Type', 'initialPreferences', 'NpcStore.onAppend', 'NpcStore.onRemove', 'NpcStore.setType', 'NpcStore.setList', 'NpcStore.calculateCost', 'NpcStore.calculateWeight', 'transferItem'];
  const methods = wanted.map(name => { const code = assignments.get(name); if (!code) throw new Error('Missing native method: ' + name); return code; });
  return { code: functions.join('\n') + '\n' + methods.join('\n'), addItem: functions.find(fn => fn.startsWith('function addItem(')) };
}
const parts = extract(patched);
const htmlFile = ts.createSourceFile('NpcStore.html.js', region(vendor, 'src/UI/Components/NpcStore/NpcStore.html?raw'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let html = '';
function extractHtml(node: ts.Node) { if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) html = node.right.text; ts.forEachChild(node, extractHtml); }
extractHtml(htmlFile);
const frames: HTMLIFrameElement[] = [];
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); });

interface Item { index: number; ITID: number; count: number; price: number; IsIdentified?: boolean; total_weight?: number; }
interface Store {
  _host: HTMLElement; _lastroStoreScroll?: StoreScrollApi; getRoot(): HTMLElement;
  onAppend(): void; onRemove(): void; setType(type: number): void; setList(items: Item[]): void;
  calculateCost(): number; calculateWeight(): number;
}
type PreviewWindow = Window & typeof globalThis & { _OBJ_DRAG_?: unknown };
function mount({ scale = 1 }: { scale?: number } = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as PreviewWindow, doc = win.document;
  let id = 0, timestamp = 0, hidden = false;
  const raf = new Map<number, FrameRequestCallback>();
  win.requestAnimationFrame = vi.fn(callback => { raf.set(++id, callback); return id; });
  win.cancelAnimationFrame = vi.fn(handle => { raf.delete(handle); });
  Object.defineProperty(doc, 'hidden', { get: () => hidden, configurable: true });
  const host = doc.createElement('div'), shadow = host.attachShadow({ mode: 'open' }), root = doc.createElement('div');
  root.className = 'ui-component-root'; root.innerHTML = html; shadow.append(root); doc.body.append(host);
  const directly = (content: Element) => [...content.children].filter(child => child.classList.contains('item')) as HTMLElement[];
  const rowHeight = (row: HTMLElement) => parseFloat(row.style.height) || 32;
  // Dynamic row geometry follows the real native DOM, including row deletion.
  Object.defineProperties(win.HTMLElement.prototype, {
    offsetTop: { configurable: true, get(this: HTMLElement) {
      if (this.classList.contains('item') && this.parentElement?.classList.contains('content')) {
        const rows = directly(this.parentElement); return rows.slice(0, rows.indexOf(this)).reduce((sum, row) => sum + rowHeight(row), 0);
      }
      return parseFloat(this.style.top) || 0;
    } },
    offsetHeight: { configurable: true, get(this: HTMLElement) { return this.classList.contains('item') ? rowHeight(this) : parseFloat(this.style.height) || 64; } },
  });
  const scroll = new Map<HTMLElement, { handler: ReturnType<typeof vi.fn>; restart: ReturnType<typeof vi.fn>; bar: HTMLElement }>();
  for (const content of root.querySelectorAll<HTMLElement>('.content')) {
    content.style.height = '64px';
    const bar = doc.createElement('div'); bar.className = 'ro-custom-scrollbar'; bar.style.top = '400px'; bar.style.height = '64px'; bar.style.display = 'block'; content.append(bar);
    const handler = vi.fn(), restart = vi.fn();
    Object.assign(content, { _roScrollHandler: handler, _roScrollbarRestart: restart }); scroll.set(content, { handler, restart, bar });
    Object.defineProperties(content, {
      clientHeight: { get: () => parseFloat(content.style.height) || 64 }, clientWidth: { get: () => 200 },
      scrollHeight: { get: () => Math.max(content.clientHeight, directly(content).reduce((sum, row) => sum + rowHeight(row), 0), bar.isConnected ? bar.offsetTop + bar.offsetHeight : 0) },
    });
    content.getBoundingClientRect = () => ({ left: 100 * scale, top: 100 * scale, right: 300 * scale,
      bottom: (100 + content.clientHeight) * scale, width: 200 * scale, height: content.clientHeight * scale, x: 100 * scale, y: 100 * scale, toJSON: () => ({}) });
  }
  const preferences: Record<string, unknown> & { save(): void } = { save: vi.fn() };
  const close = vi.fn(), send = vi.fn(), loadFile = vi.fn(), messages = vi.fn();
  const component = { _host: host, getRoot: () => root, StoreClosePacket: close } as unknown as Store;
  const context = vm.createContext({ window: win, document: doc, NpcStore: component, Client: { loadFile },
    _preferences$2: preferences, _type: 0, _input: [], _output: [], _closePacketSent: false,
    DB: { INTERFACE_PATH: '', getItemInfo: () => ({ identifiedResourceName: 'offline', unidentifiedResourceName: 'offline' }), getItemName: (item: Item) => '物品' + item.ITID, getMessage: () => '离线原生提示' },
    SessionStorage_default: { zeny: 10000000, Entity: { weight: 0, max_weight: 1000000 } }, Image: win.Image,
    ChatBox_default: { addText: messages, TYPE: { ERROR: 1 }, FILTER: { PUBLIC_LOG: 1 } }, Network: { sendPacket: send },
    getItemCountUnit: () => '个', console,
  });
  vm.runInContext(parts.code, context); component.setType(0); component.onAppend();
  const input = root.querySelector<HTMLElement>('.InputWindow .content')!, output = root.querySelector<HTMLElement>('.OutputWindow .content')!, available = root.querySelector<HTMLElement>('.AvailableItemsWindow .content')!;
  for (const content of [input, output, available]) content.style.height = '64px';
  const api = component._lastroStoreScroll!;
  function items(count: number) { return Array.from({ length: count }, (_, index) => ({ index, ITID: 501 + index, count: 1, price: 10 })); }
  function seed(count: number) { component.setList(items(count)); }
  const transfer = context.transferItem as (from: HTMLElement, to: HTMLElement, adding: boolean, index: number, count: number) => void;
  function rows(content: HTMLElement, heights: number[]) {
    content.querySelectorAll(':scope > .item').forEach(row => row.remove());
    heights.forEach((height, index) => { const row = doc.createElement('div'); row.className = 'item'; row.dataset.index = String(index); row.style.height = height + 'px'; row.append(doc.createElement('div')); content.append(row); });
  }
  function tick(milliseconds = 16) {
    timestamp += milliseconds; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(callback => callback(timestamp));
  }
  function drag(content: HTMLElement, edge: 'top' | 'bottom' | 'center' = 'bottom') {
    const rect = content.getBoundingClientRect();
    const event = new win.MouseEvent('dragover', { bubbles: true, composed: true, cancelable: true, clientX: rect.left + rect.width / 2,
      clientY: edge === 'top' ? rect.top + 1 : edge === 'bottom' ? rect.bottom - 1 : rect.top + rect.height / 2 });
    content.dispatchEvent(event); return event;
  }
  function validDrag(container = 'InputWindow') {
    const content = root.querySelector<HTMLElement>('.' + container + ' .content')!;
    let item = content.querySelector<HTMLElement>('.item[data-index="4"]');
    if (!item) { item = doc.createElement('div'); item.className = 'item'; item.dataset.index = '4'; item.append(doc.createElement('div')); content.append(item); }
    const event = new win.Event('dragstart', { bubbles: true, composed: true });
    Object.defineProperty(event, 'dataTransfer', { value: { setData: vi.fn(), setDragImage: vi.fn() } });
    // Capture records the gesture first; the unchanged native bubbling handler
    // then supplies its real root-level index/container payload.
    const handler = context.onDragStart as (event: Event) => void;
    item.addEventListener('dragstart', handler, { once: true }); item.dispatchEvent(event);
  }
  return { win, doc, host, root, component, context, input, output, available, api, scroll, raf, close, send, messages, preferences, seed, transfer, rows, tick, drag, validDrag,
    setHidden: (value: boolean) => { hidden = value; }, directly };
}

describe('NPC store row bounds and minimal reveal', () => {
  it('clamps a deleted last row using real item bounds instead of a self-inflated native scrollbar', () => {
    const f = mount(); f.rows(f.input, [32, 32, 32, 32, 32]); f.input.scrollTop = 96;
    const nested = f.doc.createElement('div'); nested.className = 'item'; nested.style.top = '1000px'; nested.style.height = '1000px'; f.scroll.get(f.input)!.bar.append(nested);
    f.directly(f.input).at(-1)!.remove(); expect(f.input.scrollHeight).toBeGreaterThan(300);
    f.api.refresh(f.input); expect(f.input.scrollTop).toBe(64); expect(f.scroll.get(f.input)!.bar.style.top).toBe('0px');
    expect(f.scroll.get(f.input)!.bar.style.height).toBe('64px'); expect(f.scroll.get(f.input)!.bar.style.display).toBe('block');
    expect(f.scroll.get(f.input)!.handler).toHaveBeenCalledOnce(); expect(f.scroll.get(f.input)!.restart).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it('resets empty content to zero and respects variable row heights and bottom padding', () => {
    const f = mount(); f.input.style.paddingBottom = '8px'; f.rows(f.input, [32, 80, 48]); f.input.scrollTop = 200;
    f.api.refresh(f.input); expect(f.input.scrollTop).toBe(104);
    f.rows(f.input, []); f.api.refresh(f.input); expect(f.input.scrollTop).toBe(0);
  });
  it('reveals below and above with the minimum scroll, leaves visible rows still, and tolerates missing rows', () => {
    const f = mount(); f.rows(f.input, [32, 32, 32, 32, 32]); f.api.reveal(f.input, 3); expect(f.input.scrollTop).toBe(64);
    f.api.reveal(f.input, 2); expect(f.input.scrollTop).toBe(64); f.api.reveal(f.input, 1); expect(f.input.scrollTop).toBe(32);
    f.api.reveal(f.input, 999); expect(f.input.scrollTop).toBe(32); f.api.refresh(null); f.api.reveal(null, 1);
  });
  it('shows the start of a row taller than the viewport without jumping to its bottom', () => {
    const f = mount(); f.rows(f.input, [32, 96, 32]); f.api.reveal(f.input, 1); expect(f.input.scrollTop).toBe(32);
  });
  it('uses scrollbar restart only when its existing scroll handler is unavailable', () => {
    const f = mount(); Object.assign(f.input, { _roScrollHandler: undefined }); f.api.refresh(f.input);
    expect(f.scroll.get(f.input)!.restart).toHaveBeenCalledOnce();
  });
});

describe('native NPC item transfer and lifecycle', () => {
  it('moves the last input row, clamps its source, reveals the added output row, and preserves real native counts/costs', () => {
    const f = mount(); f.seed(8); for (const index of [0, 1, 2]) f.transfer(f.input, f.output, true, index, 1);
    f.input.scrollTop = 96; f.output.scrollTop = 0; f.transfer(f.input, f.output, true, 7, 1);
    expect(f.directly(f.input)).toHaveLength(4); expect(f.directly(f.output)).toHaveLength(4);
    expect(f.input.scrollTop).toBe(64); expect(f.output.scrollTop).toBe(64); expect(f.component.calculateCost()).toBe(40);
    const input = f.context._input as Item[], output = f.context._output as Item[];
    expect(output[7]!.count).toBe(1); expect(input[7]!.count).toBe(1); expect(output.reduce((sum, item) => sum + item.count, 0)).toBe(4);
    f.transfer(f.output, f.input, false, 7, 1); expect(f.directly(f.output)).toHaveLength(3); expect(f.output.scrollTop).toBe(32);
    expect(f.input.scrollTop).toBe(96); expect(output[7]!.count).toBe(0); expect(f.component.calculateCost()).toBe(30); expect(f.send).not.toHaveBeenCalled();
  });
  it('does not auto-reveal each native addItem while setting a long list and resets both previous scroll positions', () => {
    const f = mount(); f.seed(20); f.input.scrollTop = 200; f.output.scrollTop = 150; f.validDrag(); f.drag(f.input); f.tick();
    f.component.setList(Array.from({ length: 12 }, (_, index) => ({ index, ITID: 600 + index, count: 1, price: 3 })));
    expect(f.input.scrollTop).toBe(0); expect(f.output.scrollTop).toBe(0); expect(f.directly(f.input)).toHaveLength(12); expect(f.raf.size).toBe(0);
    expect(parts.addItem).toBe(extract(native).addItem); expect(f.send).not.toHaveBeenCalled();
  });
  it('keeps native close cleanup and reinstalls only once on the same root after reopening', () => {
    const f = mount(); f.seed(10); const api = f.api; f.validDrag(); f.drag(f.input); f.tick();
    f.component.onRemove(); f.host.remove(); expect(f.raf.size).toBe(0); expect(f.directly(f.input)).toHaveLength(0);
    expect(f.context._input).toHaveLength(0); expect(f.context._output).toHaveLength(0); expect(f.close).toHaveBeenCalledOnce();
    f.doc.body.append(f.host); f.component.onAppend(); f.component.onAppend(); expect(f.component._lastroStoreScroll).toBe(api);
    expect(installLastroStoreScroll(f.component)).toBe(api); f.seed(10); f.validDrag(); f.drag(f.input); expect(f.raf.size).toBe(1);
  });
  it('stops an active drag when switching the actual native shop mode', () => {
    const f = mount(); f.seed(12); f.validDrag(); f.drag(f.input); expect(f.raf.size).toBe(1);
    f.component.setType(3); expect(f.raf.size).toBe(0); expect(f.send).not.toHaveBeenCalled();
  });
  it('keeps insufficient-zeny transfer rejection and does not reveal or alter counts', () => {
    const f = mount(); f.seed(8); (f.context.SessionStorage_default as { zeny: number }).zeny = 0;
    f.transfer(f.input, f.output, true, 7, 1); expect(f.messages).toHaveBeenCalledOnce(); expect(f.directly(f.input)).toHaveLength(8);
    expect(f.directly(f.output)).toHaveLength(0); expect((f.context._output as Item[])[7]!.count).toBe(0); expect(f.send).not.toHaveBeenCalled();
  });
});

describe('native store drag edge auto-scroll', () => {
  it.each([1, 1.5])('scrolls at client-rect edges and clamps to real rows at %s UI scale', scale => {
    const f = mount({ scale }); f.rows(f.input, Array(10).fill(32)); f.validDrag(); expect(f.drag(f.input).defaultPrevented).toBe(true);
    f.tick(); expect(f.input.scrollTop).toBeGreaterThan(0); for (let i = 0; i < 50; i++) f.tick();
    expect(f.input.scrollTop).toBe(256); expect(f.raf.size).toBe(0);
    f.drag(f.input, 'top'); for (let i = 0; i < 50; i++) f.tick(); expect(f.input.scrollTop).toBe(0); expect(f.raf.size).toBe(0); expect(f.send).not.toHaveBeenCalled();
  });
  it('caps a delayed frame and does not scroll from a center drag', () => {
    const f = mount(); f.rows(f.input, Array(100).fill(32)); f.validDrag(); f.drag(f.input); f.tick(); const before = f.input.scrollTop;
    f.tick(1000); expect(f.input.scrollTop - before).toBeLessThanOrEqual(24); f.drag(f.input, 'center'); expect(f.raf.size).toBe(0);
  });
  it.each(['InputWindow', 'OutputWindow', 'AvailableItemsWindow'])('accepts the real native %s payload', container => {
    const f = mount(); f.rows(f.available, Array(12).fill(32)); f.validDrag(container); f.drag(f.available); f.tick(); expect(f.available.scrollTop).toBeGreaterThan(0);
  });
  it.each([undefined, { type: 'skill', from: 'NpcStore', container: 'InputWindow', index: '4' },
    { type: 'item', from: 'Inventory', container: 'InputWindow', index: '4' }, { type: 'item', from: 'NpcStore', container: 'Outside', index: '4' },
    { type: 'item', from: 'NpcStore', container: 'InputWindow' }, { type: 'item', from: 'NpcStore', container: 'InputWindow', index: '' }])('rejects unrelated/incomplete drag payload %s', data => {
    const f = mount(); f.rows(f.input, Array(12).fill(32)); f.validDrag(); f.win._OBJ_DRAG_ = data;
    const event = f.drag(f.input); f.tick(); expect(event.defaultPrevented).toBe(false); expect(f.input.scrollTop).toBe(0); expect(f.raf.size).toBe(0);
  });
  it.each(['drop', 'dragend', 'outside', 'blur', 'hidden', 'leave', 'stop', 'payload-end', 'detach'])('stops scrolling on %s', action => {
    const f = mount(); f.rows(f.input, Array(30).fill(32)); f.validDrag(); f.drag(f.input); f.tick(); const before = f.input.scrollTop;
    if (action === 'drop' || action === 'dragend') f.input.dispatchEvent(new f.win.Event(action, { bubbles: true, composed: true }));
    if (action === 'outside') f.doc.body.dispatchEvent(new f.win.MouseEvent('dragover', { bubbles: true, clientX: 900, clientY: 900 }));
    if (action === 'blur') f.win.dispatchEvent(new f.win.Event('blur'));
    if (action === 'hidden') { f.setHidden(true); f.doc.dispatchEvent(new f.win.Event('visibilitychange')); }
    if (action === 'leave') f.input.dispatchEvent(new f.win.MouseEvent('dragleave', { bubbles: true, relatedTarget: f.doc.body }));
    if (action === 'stop') f.api.stop();
    if (action === 'payload-end') delete f.win._OBJ_DRAG_;
    if (action === 'detach') f.host.remove();
    f.tick(); expect(f.input.scrollTop).toBe(before); expect(f.raf.size).toBe(0); expect(f.send).not.toHaveBeenCalled();
  });
  it('rejects a stale native global payload unless a real item dragstart occurred in this component', () => {
    const f = mount(); f.rows(f.input, Array(12).fill(32)); f.win._OBJ_DRAG_ = { type: 'item', from: 'NpcStore', container: 'InputWindow', index: '4' };
    expect(f.drag(f.input).defaultPrevented).toBe(false); expect(f.raf.size).toBe(0);
    f.doc.body.dispatchEvent(new f.win.Event('dragstart', { bubbles: true })); expect(f.drag(f.input).defaultPrevented).toBe(false);
    f.validDrag(); expect(f.drag(f.input).defaultPrevented).toBe(true); f.tick(); expect(f.input.scrollTop).toBeGreaterThan(0);
  });
  it.each(['container', 'index'])('rejects a forged %s after a genuine dragstart', field => {
    const f = mount(); f.rows(f.input, Array(12).fill(32)); f.validDrag();
    f.win._OBJ_DRAG_ = { ...(f.win._OBJ_DRAG_ as object), [field]: field === 'container' ? 'OutputWindow' : '999' };
    expect(f.drag(f.input).defaultPrevented).toBe(false); expect(f.raf.size).toBe(0);
  });
  it('ignores null-relatedTarget child dragleave caused by scrolling rows', () => {
    const f = mount(); f.rows(f.input, Array(12).fill(32)); f.validDrag(); f.drag(f.input); f.tick(); const before = f.input.scrollTop;
    f.directly(f.input)[0]!.dispatchEvent(new f.win.MouseEvent('dragleave', { bubbles: true, relatedTarget: null }));
    expect(f.raf.size).toBe(1); f.tick(); expect(f.input.scrollTop).toBeGreaterThan(before);
  });
  it('pauses outside or at the center and resumes the same native gesture upon returning to an edge', () => {
    const f = mount(); f.rows(f.input, Array(30).fill(32)); f.validDrag(); f.drag(f.input); f.tick();
    f.doc.body.dispatchEvent(new f.win.MouseEvent('dragover', { bubbles: true, clientX: 900, clientY: 900 })); expect(f.raf.size).toBe(0);
    f.drag(f.input, 'center'); expect(f.raf.size).toBe(0); f.drag(f.input); expect(f.raf.size).toBe(1); f.tick(); expect(f.input.scrollTop).toBeGreaterThan(10);
  });
  it.each(['stop', 'drop', 'dragend', 'blur', 'hidden', 'onRemove', 'setList', 'setType'])('does not resume using stale payload after %s clears the gesture', action => {
    const f = mount(); f.rows(f.input, Array(30).fill(32)); f.validDrag(); f.drag(f.input); f.tick();
    if (action === 'stop') f.api.stop();
    if (action === 'drop' || action === 'dragend') f.input.dispatchEvent(new f.win.Event(action, { bubbles: true, composed: true }));
    if (action === 'blur') f.win.dispatchEvent(new f.win.Event('blur'));
    if (action === 'hidden') { f.setHidden(true); f.doc.dispatchEvent(new f.win.Event('visibilitychange')); f.setHidden(false); }
    if (action === 'onRemove') f.component.onRemove();
    if (action === 'setList') f.component.setList([]);
    if (action === 'setType') f.component.setType(0);
    expect(f.drag(f.input).defaultPrevented).toBe(false); expect(f.raf.size).toBe(0);
  });
  it('rejects duplicate installation patches instead of accumulating drag listeners', () => {
    expect(() => patchRuntimeStoreScroll(patched)).toThrow('anchor:store-scroll:installed');
  });
});
