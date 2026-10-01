// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLastroItemDrag } from '../scripts/lastro-item-drag.mjs';
import { installLastroStoreScroll } from '../scripts/lastro-store-scroll.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
const live: Array<{ destroy(): void }> = [];
const frames: HTMLIFrameElement[] = [];
afterEach(() => { live.splice(0).forEach(api => api.destroy()); frames.splice(0).forEach(frame => frame.remove()); });
function tree(path: string) {
  const start = vendor.indexOf('//#region ' + path), end = vendor.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + path);
  return ts.createSourceFile(path, vendor.slice(start, end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}
function functions(path: string, names: string[]) {
  const file = tree(path), found = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.set(node.name.text, node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return names.map(name => { const text = found.get(name); if (!text) throw new Error('Missing native function: ' + name); return text; }).join('\n');
}
function listener(path: string, type: string) {
  const file = tree(path), found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'container.addEventListener'
      && ts.isStringLiteral(node.arguments[0]!) && node.arguments[0].text === type) found.push(node.arguments[1]!.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file); if (found.length !== 1) throw new Error('Missing unique native listener: ' + type); return found[0]!;
}
type NativeFn = (this: unknown, event: Event, target?: HTMLElement) => void;
function fn(context: vm.Context, name: string) { return context[name] as NativeFn; }
type DragWindow = Window & typeof globalThis & { _OBJ_DRAG_?: unknown };
function fixture(sourceName = 'Inventory', targetName = 'Storage') {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as DragWindow, doc = win.document;
  let next = 0, time = 0, hit: Element | null = null;
  const raf = new Map<number, FrameRequestCallback>();
  win.requestAnimationFrame = callback => { raf.set(++next, callback); return next; };
  win.cancelAnimationFrame = id => { raf.delete(id); };
  function component(name: string) {
    const host = doc.createElement('div'); host.id = name; doc.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' }), root = doc.createElement('div'); root.className = 'ui-component-root';
    const style = doc.createElement('style'); style.dataset.component = name; shadow.append(style, root);
    host.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, width: 100, height: 100, toJSON: () => ({}) });
    Object.defineProperty(shadow, 'elementFromPoint', { value: () => root.querySelector('.hit') || root, configurable: true });
    return { host, root, shadow };
  }
  const sourceUi = component(sourceName), targetUi = component(targetName);
  sourceUi.root.innerHTML = '<div class="content"><div class="item" draggable="true" data-index="7"><div class="icon" style="background-image:url(/item.png)"></div></div></div><div class="overlay"></div>';
  targetUi.root.innerHTML = '<div class="hit container" data-index="14"><td></td></div>';
  const source = sourceUi.root.querySelector<HTMLElement>('.item')!, icon = source.querySelector<HTMLElement>('.icon')!, target = targetUi.root.querySelector<HTMLElement>('.hit')!;
  Object.defineProperty(doc, 'elementFromPoint', { value: () => hit, configurable: true });
  const mouse = { screen: { x: 0, y: 0 } }, cursor = { x: 0, y: 0, freeze: false, blockMagnetism: false, ACTION: { DEFAULT: 0 }, setType: vi.fn() };
  const bridge = installLastroItemDrag({ document: doc, mouse, cursor, isEnabled: () => true }); live.push(bridge);
  const item = { index: 7, ITID: 501, count: 1, type: 4, IsIdentified: true, IsDamaged: false, location: 8 };
  function context(code: string, globals: Record<string, unknown> = {}) {
    const ctx = vm.createContext({ window: win, document: doc, Image: win.Image, console, setTimeout: win.setTimeout.bind(win), ...globals });
    vm.runInContext(code, ctx); return ctx;
  }
  function mouseEvent(node: EventTarget, type: string, x = 20, y = 30) {
    const event = new win.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y });
    node.dispatchEvent(event); return event;
  }
  function start() { mouseEvent(icon, 'mousedown'); hit = targetUi.host; mouseEvent(target, 'mousemove', 160, 60); }
  function release() { mouseEvent(target, 'mouseup', 160, 60); }
  function nativeInventory() {
    const ctx = context(functions('src/UI/Components/Inventory/InventoryCommon.js', ['onItemDragStart', 'onItemDragEnd', 'onItemOut']),
      { Component: { getRoot: () => sourceUi.root, getItemByIndex: () => item } });
    source.addEventListener('dragstart', event => fn(ctx, 'onItemDragStart').call(source, event));
    source.addEventListener('dragend', fn(ctx, 'onItemDragEnd')); return ctx;
  }
  return { win, doc, item, sourceUi, targetUi, source, icon, target, bridge, cursor, context, mouseEvent, start, release, nativeInventory, setHit: (node: Element | null) => { hit = node; },
    tick() { time += 16; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(callback => callback(time)); } };
}

describe('actual native handlers through the custom item drag bridge', () => {
  it('preserves Inventory to Storage request arguments with a stopped-only dragover', () => {
    const f = fixture(); f.nativeInventory(); const add = vi.fn();
    const ctx = f.context(functions('src/UI/Components/Storage/StorageCommon.js', ['onDrop']), { Component: { reqAddItem: add } });
    f.target.addEventListener('dragover', event => event.stopImmediatePropagation()); f.target.addEventListener('drop', fn(ctx, 'onDrop'));
    f.start(); expect(f.bridge.active()).toBe(true); f.release(); expect(add).toHaveBeenCalledExactlyOnceWith(7, 1);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.draggable).toBe(true);
  });
  it('preserves Storage to Inventory request arguments from the native storage source', () => {
    const f = fixture('Storage', 'Inventory'), remove = vi.fn();
    const source = f.context(functions('src/UI/Components/Storage/StorageCommon.js', ['onItemDragStart', 'onItemDragEnd', 'getItemIndexById']), { _list: [f.item], asyncDragImage: true });
    f.source.addEventListener('dragstart', event => fn(source, 'onItemDragStart').call(null, event, f.source)); f.source.addEventListener('dragend', fn(source, 'onItemDragEnd'));
    const target = f.context(functions('src/UI/Components/Inventory/InventoryCommon.js', ['onDrop']), { StorageController: { reqRemoveItem: remove } });
    f.target.addEventListener('dragover', event => event.stopImmediatePropagation()); f.target.addEventListener('drop', fn(target, 'onDrop'));
    f.start(); f.release(); expect(remove).toHaveBeenCalledExactlyOnceWith(7, 1);
  });
  it('uses native Equipment highlighting and equipping despite its non-cancelled dragover', () => {
    const f = fixture('Inventory', 'Equipment'); f.nativeInventory(); const equip = vi.fn();
    const ctx = f.context(functions('src/UI/Components/Equipment/EquipmentCommon.js', ['onDragOver', 'onDrop']), {
      Component: { getRoot: () => f.targetUi.root, onEquipItem: equip }, ItemType_default: { WEAPON: 4, ARMOR: 5, SHADOWGEAR: 12, AMMO: 10 },
      getSelectorFromLocation$1: () => '.hit', DB: { INTERFACE_PATH: '' }, Client: { loadFile: (_name: string, callback: (value: string) => void) => callback('/highlight.png') },
    });
    f.target.addEventListener('dragover', fn(ctx, 'onDragOver')); f.target.addEventListener('drop', fn(ctx, 'onDrop'));
    f.start(); expect(f.target.style.backgroundImage).toContain('/highlight.png'); f.release(); expect(equip).toHaveBeenCalledExactlyOnceWith(7, 8);
  });
  it('moves an actual native shortcut icon and restores its hidden state on dragend', () => {
    const f = fixture('ShortCut', 'ShortCutTarget'); f.source.className = 'icon'; f.source.parentElement!.dataset.index = '7';
    f.source.innerHTML = '<div class="img" style="background-image:url(/shortcut.png)"></div>'; const startNode = f.source.firstElementChild!;
    const list = Array.from({ length: 8 }, () => ({ ID: 501, isSkill: false, count: 0 })), add = vi.fn(), change = vi.fn();
    const ctx = f.context(functions('src/UI/Components/ShortCut/ShortCut.js', ['onDragStart$2', 'onDragEnd', 'onDrop$8']), { _list$1: list, ShortCut: { removeElement: vi.fn(), addElement: add, onChange: change } });
    f.source.addEventListener('dragstart', event => fn(ctx, 'onDragStart$2').call(null, event, f.source));
    f.source.addEventListener('dragend', () => (ctx.onDragEnd as (icon: HTMLElement) => void)(f.source));
    f.target.addEventListener('dragover', event => event.preventDefault()); f.target.addEventListener('drop', event => fn(ctx, 'onDrop$8').call(null, event, f.target));
    f.mouseEvent(startNode, 'mousedown'); f.setHit(f.targetUi.host); f.mouseEvent(f.target, 'mousemove', 160, 60);
    expect(f.source.classList.contains('hide')).toBe(true); f.release();
    expect(add).toHaveBeenCalledExactlyOnceWith(14, false, 501, 0); expect(change).toHaveBeenCalledExactlyOnceWith(14, false, 501, 0);
    expect(f.source.classList.contains('hide')).toBe(false); expect(f.win._OBJ_DRAG_).toBeUndefined();
  });
  it('passes the native NPC shop container/index payload and retains edge scrolling', () => {
    const f = fixture('NpcStore', 'Unused');
    f.sourceUi.root.innerHTML = '<div class="InputWindow"><div class="content"></div></div><div class="OutputWindow"><div class="content hit"></div></div><div class="AvailableItemsWindow"><div class="content"></div></div>';
    const input = f.sourceUi.root.querySelector<HTMLElement>('.InputWindow .content')!, output = f.sourceUi.root.querySelector<HTMLElement>('.OutputWindow .content')!;
    input.append(f.source); for (let i = 0; i < 8; i++) { const row = f.doc.createElement('div'); row.className = 'item'; row.dataset.index = String(i); output.append(row); Object.defineProperties(row, { offsetTop: { value: i * 32 }, offsetHeight: { value: 32 } }); }
    Object.defineProperty(output, 'clientHeight', { value: 64 });
    output.getBoundingClientRect = () => ({ left: 100, top: 0, right: 200, bottom: 64, x: 100, y: 0, width: 100, height: 64, toJSON: () => ({}) });
    const move = vi.fn(), component = { _host: f.sourceUi.host, getRoot: () => f.sourceUi.root };
    installLastroStoreScroll(component);
    const ctx = f.context(functions('src/UI/Components/NpcStore/NpcStore.js', ['onDragStart', 'onDrop']), { NpcStore: component, requestMoveItem: move });
    f.source.addEventListener('dragstart', event => fn(ctx, 'onDragStart').call(f.source, event));
    output.addEventListener('dragover', event => { event.preventDefault(); event.stopImmediatePropagation(); });
    output.addEventListener('drop', event => fn(ctx, 'onDrop').call(output.parentElement, event));
    f.mouseEvent(f.icon, 'mousedown'); f.setHit(f.sourceUi.host); f.mouseEvent(output, 'mousemove', 160, 63);
    expect(f.win._OBJ_DRAG_).toEqual({ type: 'item', from: 'NpcStore', container: 'InputWindow', index: '7' });
    f.tick(); expect(output.scrollTop).toBeGreaterThan(0); f.mouseEvent(output, 'mouseup', 160, 63);
    expect(move).toHaveBeenCalledOnce(); const args = move.mock.calls[0]!;
    expect(args[0]).toBe('7'); expect(args[1] === input).toBe(true); expect(args[2] === output).toBe(true); expect(args[3]).toBe(true);
    expect(f.win._OBJ_DRAG_).toBeUndefined();
  });
  it.each(['Refine', 'EnchantGrade'])('retains native %s dragend-only removal when the staged item has no id', name => {
    const f = fixture(name, 'Inventory'), remove = vi.fn();
    const refine = name === 'Refine', start = refine ? 'onItemDragStart$8' : 'onItemDragStart$7', end = refine ? 'onItemDragEnd$9' : 'onItemDragEnd$8';
    const ctx = f.context(functions('src/UI/Components/' + name + '/' + name + '.js', [start, end]), {
      [name]: { _host: f.sourceUi.host }, refine_ongoing: 0, [refine ? 'onRemoveItem$1' : 'onRemoveItem']: remove,
    });
    f.source.addEventListener('dragstart', fn(ctx, start)); f.source.addEventListener('dragend', fn(ctx, end));
    f.start(); expect(f.bridge.active()).toBe(true); f.release(); expect(remove).toHaveBeenCalledOnce();
    f.start(); f.bridge.cancel(); expect(remove).toHaveBeenCalledOnce(); expect(f.source.draggable).toBe(true);
  });
  it('runs real SkillListCommon handlers with selected skill level and dragend click suppression', async () => {
    const f = fixture('SkillList', 'ShortCut'), add = vi.fn(); f.source.className = 'skill';
    f.icon.innerHTML = '<img src="/skill.png">'; const skill = { SKID: 28, level: 10, type: 1, selectedLevel: 3 };
    const code = 'var _justDragged = false; var nativeStart = ' + listener('src/UI/Components/SkillList/SkillListCommon.js', 'dragstart')
      + '; var nativeEnd = ' + listener('src/UI/Components/SkillList/SkillListCommon.js', 'dragend') + ';';
    const ctx = f.context(code + '\n' + functions('src/UI/Components/ShortCut/ShortCut.js', ['onDrop$8']), {
      getSkillById: () => skill, _dragFrom: 'SkillList', ShortCut: { removeElement: vi.fn(), addElement: add, onChange: vi.fn() },
    });
    f.source.addEventListener('dragstart', fn(ctx, 'nativeStart')); f.source.addEventListener('dragend', fn(ctx, 'nativeEnd'));
    f.target.addEventListener('dragover', event => event.preventDefault()); f.target.addEventListener('drop', event => fn(ctx, 'onDrop$8').call(null, event, f.target));
    f.start(); f.release(); expect(add).toHaveBeenCalledExactlyOnceWith(14, true, 28, 3); expect(ctx._justDragged).toBe(true);
    await new Promise(resolve => f.win.setTimeout(resolve, 0)); expect(ctx._justDragged).toBe(false); expect(f.win._OBJ_DRAG_).toBeUndefined();
  });
});
