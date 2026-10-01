// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastroBindNestedWindowState, patchRuntimeUiState } from '../scripts/lastro-ui-state.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeUiState(native);
type Kind = 'Vending' | 'NpcStore';
type WindowPref = { x: number; y: number; height: number; width?: number };
type ModePref = { inputWindow: WindowPref; outputWindow: WindowPref; AvailableItemsWindow: WindowPref; PurchaseResult: WindowPref };
function region(text: string, path: string) {
  const start = text.indexOf('//#region ' + path), end = text.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + path);
  return text.slice(start, end);
}
function extract(kind: Kind) {
  const path = `src/UI/Components/${kind}/${kind}`;
  const code = region(patched, path + '.js');
  const file = ts.createSourceFile(kind + '.js', code, ts.ScriptTarget.Latest, true);
  const assignments = new Map<string, string>(), functions: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node)) assignments.set(node.left.getText(file), node.getText(file) + ';');
    if (ts.isFunctionDeclaration(node) && ['resize$1', 'resize', '_hideAll', '_showAll', 'getCurrentPref'].includes(node.name?.text || '')) functions.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  const names = kind === 'Vending'
    ? ['Vending.Type', '_preferences$16', 'Vending.onAppend', 'Vending.onClose', 'Vending.onRemove']
    : ['NpcStore.Type', 'initialPreferences', '_preferences$2', 'NpcStore.onAppend', 'NpcStore.setType', 'NpcStore.onRemove'];
  const methods = names.map(name => {
    const result = assignments.get(name);
    if (!result) throw new Error('Missing native assignment: ' + name);
    return result;
  });
  const htmlFile = ts.createSourceFile('html.js', region(native, path + '.html?raw'), ts.ScriptTarget.Latest, true);
  let html = '';
  function findHtml(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) html = node.right.text;
    ts.forEachChild(node, findHtml);
  }
  findHtml(htmlFile);
  return { code: functions.join('\n') + '\n' + methods.join('\n'), html };
}
const sources = { Vending: extract('Vending'), NpcStore: extract('NpcStore') };
const frames: HTMLIFrameElement[] = [];
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); });

interface Component {
  _host: HTMLElement;
  _lastroNestedWindowState: { save(): void };
  isOpen: boolean;
  getRoot(): ShadowRoot;
  onAppend(): void;
  onClose(): void;
  onRemove(): void;
  setType(type: number): void;
}
function mount(kind: Kind, storage: Record<string, string> = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const host = doc.createElement('div'); host.attachShadow({ mode: 'open' }); doc.body.append(host);
  host.shadowRoot!.innerHTML = sources[kind].html;
  const root = host.shadowRoot!;
  // A hidden native sub-window has zero offsetHeight. Its inline content size
  // survives hiding and is the value the helper must preserve through cleanup.
  for (const content of root.querySelectorAll<HTMLElement>('.content')) {
    Object.defineProperty(content, 'offsetHeight', { get: () => {
      let current: HTMLElement | null = content;
      while (current) { if (current.style.display === 'none') return 0; current = current.parentElement; }
      return host.style.display === 'none' ? 0 : parseFloat(content.style.height) || 0;
    } });
  }
  const component = { _host: host, getRoot: () => root, isOpen: false };
  const closePacket = vi.fn(), messageCleanup = vi.fn(), loadFile = vi.fn((_path: string, done: (value: string) => void) => done('offline'));
  const input = [{ index: 4, count: 2 }], output = [{ index: 5, count: 3 }];
  const context = vm.createContext({ window: win, document: doc, console, lastroBindNestedWindowState,
    localStorage: { getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; } },
    __esmMin: (init: () => void) => init, Vending: component, NpcStore: { ...component, StoreClosePacket: closePacket },
    Renderer: { width: 1200, height: 900 }, DB: { INTERFACE_PATH: '' }, Client: { loadFile },
    VendingModelMessage_default: { onRemove: messageCleanup },
  });
  vm.runInContext(`
    ${region(patched, 'src/Core/Preferences.js')}
    init_Preferences$1();
    var _input$1=[], _output$1=[], _input=[], _output=[], _type=0, _closePacketSent=false;
    var _preferences$16, _preferences$2, initialPreferences;
    ${sources[kind].code}
    globalThis.fixture = {
      component: ${kind}, preferences: ${kind === 'Vending' ? '_preferences$16' : '_preferences$2'},
      setLists(input, output) { ${kind === 'Vending' ? '_input$1=input; _output$1=output;' : '_input=input; _output=output;'} },
      markClosed(value) { _closePacketSent = value; },
    };
  `, context);
  const fixture = context.fixture as { component: Component; preferences: Record<string, unknown> & { save(): void }; setLists(input: unknown[], output: unknown[]): void; markClosed(value: boolean): void };
  fixture.setLists(input, output);
  if (kind === 'NpcStore') fixture.component.setType(0);
  fixture.component.onAppend(); host.style.display = '';
  function windowElement(name: string) { return root.querySelector<HTMLElement>('.' + name)!; }
  function adjust(name: string, x: number, y: number, height: number, width?: number) {
    const element = windowElement(name); element.style.left = x + 'px'; element.style.top = y + 'px';
    element.querySelector<HTMLElement>('.content')!.style.height = height * 32 + 'px';
    if (width != null) element.style.width = width + 'px';
  }
  const flush = () => win.dispatchEvent(new win.Event('mouseup'));
  const saved = () => JSON.parse(storage[kind]!) as ModePref & Record<string, ModePref>;
  return { win, host, root, component: fixture.component, preferences: fixture.preferences, input, output, closePacket, messageCleanup, loadFile,
    adjust, windowElement, flush, saved, storage, markClosed: fixture.markClosed };
}

describe('native nested-window preferences', () => {
  it('patches only append to bind the native child windows and remains idempotent', () => {
    expect(sources.Vending.code).toContain('lastroBindNestedWindowState(this, _preferences$16, () => _preferences$16)');
    expect(sources.NpcStore.code).toContain('lastroBindNestedWindowState(this, _preferences$2, () => getCurrentPref())');
    expect(patchRuntimeUiState(patched)).toBe(patched);
  });

  it('saves Vending adjustments on mouseup without clearing items or submitting a store', () => {
    const f = mount('Vending');
    f.adjust('InputWindow', 235, 140, 8); f.adjust('OutputWindow', 540, 220, 3); f.flush();
    expect(f.saved().inputWindow).toMatchObject({ x: 235, y: 140, height: 8 });
    expect(f.saved().outputWindow).toMatchObject({ x: 540, y: 220, height: 3 });
    expect(f.input).toHaveLength(1); expect(f.output).toHaveLength(1);
    expect(f.messageCleanup).not.toHaveBeenCalled(); expect(f.closePacket).not.toHaveBeenCalled();
  });

  it('persists the native hide-only Vending close and restores on append and reload', () => {
    const f = mount('Vending'); f.adjust('InputWindow', 185, 165, 7); f.adjust('OutputWindow', 470, 275, 4);
    f.component.isOpen = true; f.component.onClose(); f.win.dispatchEvent(new f.win.Event('pagehide'));
    expect(f.host.style.display).toBe('none'); expect(f.component.isOpen).toBe(false);
    expect(f.saved().inputWindow.height).toBe(7); expect(f.saved().outputWindow.height).toBe(4);
    expect(f.input).toHaveLength(1); expect(f.output).toHaveLength(1);
    f.adjust('InputWindow', 0, 0, 2); f.component.onAppend();
    expect(f.windowElement('InputWindow').style.left).toBe('185px');
    expect(f.windowElement('InputWindow').querySelector<HTMLElement>('.content')!.style.height).toBe('224px');
    const reload = mount('Vending', f.storage);
    expect(reload.windowElement('OutputWindow').style.left).toBe('470px');
    expect(reload.windowElement('OutputWindow').querySelector<HTMLElement>('.content')!.style.height).toBe('128px');
  });

  it('keeps native Vending cleanup and saves dimensions while hidden content measures zero', () => {
    const f = mount('Vending'); f.adjust('InputWindow', 130, 180, 9); f.adjust('OutputWindow', 420, 290, 6);
    f.root.querySelector('.InputWindow .content')!.textContent = 'item'; f.component.onClose();
    expect(f.windowElement('InputWindow').querySelector<HTMLElement>('.content')!.offsetHeight).toBe(0);
    f.component.onRemove();
    expect(f.saved().inputWindow.height).toBe(9); expect(f.saved().outputWindow.height).toBe(6);
    expect(f.input).toHaveLength(0); expect(f.output).toHaveLength(0);
    expect(f.root.querySelector('.InputWindow .content')!.textContent).toBe('');
    expect(f.messageCleanup).toHaveBeenCalledTimes(1); expect(f.closePacket).not.toHaveBeenCalled();
  });

  it('reads hidden NpcStore sub-window sizes before native removal clears items', () => {
    const f = mount('NpcStore');
    f.adjust('InputWindow', 145, 120, 8, 330); f.adjust('OutputWindow', 460, 240, 5, 360);
    f.adjust('AvailableItemsWindow', 780, 90, 4); f.adjust('PurchaseResult', 795, 380, 6);
    f.windowElement('AvailableItemsWindow').style.display = 'none'; f.windowElement('PurchaseResult').style.display = 'none';
    expect(f.windowElement('PurchaseResult').querySelector<HTMLElement>('.content')!.offsetHeight).toBe(0);
    f.component.onRemove();
    const pref = f.saved()['0']!;
    expect(pref.inputWindow).toMatchObject({ x: 145, y: 120, height: 8, width: 330 });
    expect(pref.outputWindow).toMatchObject({ x: 460, y: 240, height: 5, width: 360 });
    expect(pref.AvailableItemsWindow.height).toBe(4); expect(pref.PurchaseResult.height).toBe(6);
    expect(f.input).toHaveLength(0); expect(f.output).toHaveLength(0); expect(f.closePacket).toHaveBeenCalledTimes(1);
  });

  it('saves current BUY/SELL geometry separately and restores each mode across reload', () => {
    const f = mount('NpcStore'); f.adjust('InputWindow', 160, 110, 8, 310); f.adjust('OutputWindow', 490, 260, 3, 340); f.flush();
    f.component.setType(1); f.adjust('InputWindow', 225, 155, 4, 320); f.adjust('OutputWindow', 565, 320, 9, 380);
    f.win.dispatchEvent(new f.win.Event('pagehide'));
    expect(f.saved()['0']!.inputWindow).toMatchObject({ x: 160, y: 110, height: 8, width: 310 });
    expect(f.saved()['1']!.inputWindow).toMatchObject({ x: 225, y: 155, height: 4, width: 320 });
    expect(f.saved()['1']!.outputWindow.height).toBe(9);
    f.component.setType(0);
    expect(f.windowElement('InputWindow').style.left).toBe('160px');
    expect(f.windowElement('InputWindow').querySelector<HTMLElement>('.content')!.style.height).toBe('256px');
    const reload = mount('NpcStore', f.storage); reload.component.setType(1);
    expect(reload.windowElement('InputWindow').style.left).toBe('225px');
    expect(reload.windowElement('OutputWindow').style.width).toBe('380px');
    expect(reload.windowElement('OutputWindow').querySelector<HTMLElement>('.content')!.style.height).toBe('288px');
    expect(f.input).toHaveLength(1); expect(f.closePacket).not.toHaveBeenCalled();
  });

  it('does not duplicate the binding on reopen and retains native already-closed packet guard', () => {
    const f = mount('NpcStore'), binding = f.component._lastroNestedWindowState, save = f.preferences.save;
    f.component.onAppend(); expect(f.component._lastroNestedWindowState).toBe(binding); expect(f.preferences.save).toBe(save);
    f.adjust('InputWindow', 250, 130, 5); f.preferences.save();
    expect(f.saved()['0']!.inputWindow.height).toBe(5);
    f.markClosed(true); f.component.onRemove(); expect(f.closePacket).not.toHaveBeenCalled();
    expect(f.input).toHaveLength(0); expect(f.output).toHaveLength(0);
  });
});
