// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDebugAccessGuard } from '../src/runtime/debug-access';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
function region(path: string) {
  const start = native.indexOf('//#region ' + path), end = native.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + path);
  return native.slice(start, end);
}
function nativeFunction(path: string, name: string) {
  const file = ts.createSourceFile('fixture.js', region(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: ts.FunctionDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (found.length !== 1) throw new Error('Missing native function: ' + name);
  return found[0]!.getText(file);
}
function nativeAssignment(path: string, left: string) {
  const file = ts.createSourceFile('fixture.js', region(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: ts.ExpressionStatement[] = [];
  function visit(node: ts.Node) {
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.left.getText(file) === left) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (found.length !== 1) throw new Error('Missing native assignment: ' + left);
  return found[0]!.getText(file);
}
function nativeMethods(path: string, names: string[]) {
  const file = ts.createSourceFile('fixture.js', region(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(file))) {
      const name = node.name.getText(file);
      if (found.has(name)) throw new Error('Duplicate native method: ' + name);
      found.set(name, node.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return names.map(name => {
    const method = found.get(name);
    if (!method) throw new Error('Missing native method: ' + name);
    return method;
  }).join('\n');
}
const frames: HTMLIFrameElement[] = [];
afterEach(() => frames.splice(0).forEach(frame => frame.remove()));
function fixture(protocol = 'isolated-app:') {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis;
  // Use actual browser event propagation while injecting the deployment protocol.
  const target = { location: { protocol }, addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win) } as unknown as Window;
  const dispose = installDebugAccessGuard(target);
  const context = vm.createContext({ window: win, document: win.document, __esmMin: (fn: () => void) => fn });
  vm.runInContext(region('src/Controls/KeyEventHandler.js') + '\ninit_KeyEventHandler();', context);
  const press = (event: KeyboardEventInit) => {
    const key = new win.KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...event });
    win.document.body.dispatchEvent(key); return key;
  };
  return { win, target, context, dispose, press };
}

describe('game IWA page debug access', () => {
  const reserved: KeyboardEventInit[] = [
    ...[true, false].flatMap(ctrl => ['I', 'J', 'C'].map(letter => ({ key: letter.toLowerCase(), code: 'Key' + letter,
      keyCode: letter.charCodeAt(0), shiftKey: true, ctrlKey: ctrl, metaKey: !ctrl }))),
    ...[true, false].map(ctrl => ({ key: 'u', code: 'KeyU', keyCode: 85, ctrlKey: ctrl, metaKey: !ctrl })),
  ];
  it.each(reserved)('suppresses the debug shortcut %j before page handlers', event => {
    const f = fixture(), gameHandler = vi.fn(); f.win.addEventListener('keydown', gameHandler, true);
    expect(f.press(event).defaultPrevented).toBe(true); expect(gameHandler).not.toHaveBeenCalled();
  });

  it.each([{ key: 'F12' }, { code: 'F12' }, { keyCode: 123 }])('cancels browser F12 without stopping capture or bubble game listeners %j', event => {
    const f = fixture(), capture = vi.fn(), bubble = vi.fn();
    f.win.addEventListener('keydown', capture, true); f.win.addEventListener('keydown', bubble);
    const key = f.press(event);
    expect(key.defaultPrevented).toBe(true);
    expect(capture).toHaveBeenCalledExactlyOnceWith(key); expect(bubble).toHaveBeenCalledExactlyOnceWith(key);
  });

  it.each([false, true])('lets the actual game keyboard pipeline extend and cycle the skill bar with capture=%s', captureKeyEvents => {
    const f = fixture(), save = vi.fn(), skillBarHost = f.win.document.createElement('div');
    const chatRoot = f.win.document.createElement('div');
    chatRoot.innerHTML = '<div class="battlemode"></div><div class="input"><div class="input-chatbox"></div><input class="username"></div>';
    const nativeUi = nativeMethods('src/UI/GUIComponent.js', ['_bindKeyDown', '_unbindKeyDown']);
    Object.assign(f.context, {
      captureKeyEvents, chatRoot, skillBarHost, save,
      init_ProcessCommand() {}, init_ShortCutControls() {}, init_UIManager() {},
      _root$18: () => chatRoot,
    });
    vm.runInContext(`
      const ShortCuts$2 = {};
      ${nativeAssignment('src/Preferences/ShortCutControls.js', 'ShortCuts$2.SkillBarSize')}
      const ShortCutControls_default = { ShortCuts: ShortCuts$2 };
      const _preferences$19 = { size: 1, save }, _rowCount = 4;
      const ShortCut = { _host: skillBarHost };
      ${nativeAssignment('src/UI/Components/ShortCut/ShortCut.js', 'ShortCut.onShortCut')}
      const UIManager = { getComponent: name => name === 'ShortCutOption' ? {isCapturing: false} : ShortCut };
      ${region('src/Controls/BattleMode.js')}
      init_BattleMode();
      class KeyboardComponent { ${nativeUi} }
      const ChatBox = new KeyboardComponent();
      ChatBox.captureKeyEvents = captureKeyEvents;
      ${nativeAssignment('src/UI/Components/ChatBox/ChatBox.js', 'ChatBox.processBattleMode')}
      ${nativeAssignment('src/UI/Components/ChatBox/ChatBox.js', 'ChatBox.onKeyDown')}
      ChatBox._bindKeyDown();
    `, f.context);
    for (const size of [2, 3, 4, 0, 1]) {
      const key = f.press({ key: 'F12', code: 'F12', keyCode: 123, which: 123 });
      expect(key.defaultPrevented).toBe(true);
      expect(skillBarHost.style.height).toBe(`${size * 34}px`);
    }
    expect(save).toHaveBeenCalledTimes(5);
  });

  it.each(Array.from({ length: 11 }, (_, index) => index + 1))('preserves F%d for actual game keyboard handlers', number => {
    const f = fixture(), gameHandler = vi.fn(); f.win.addEventListener('keydown', gameHandler);
    expect(f.press({ key: 'F' + number, code: 'F' + number, keyCode: 111 + number }).defaultPrevented).toBe(false);
    expect(gameHandler).toHaveBeenCalledOnce();
  });

  it.each([
    { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true },
    { key: 'Control', code: 'ControlLeft', keyCode: 17, ctrlKey: true },
    { key: 'q', code: 'KeyQ', keyCode: 81, shiftKey: true },
    { key: 'i', code: 'KeyI', keyCode: 73, ctrlKey: true },
    { key: 'u', code: 'KeyU', keyCode: 85, ctrlKey: true, shiftKey: true },
    { key: 'r', code: 'KeyR', keyCode: 82, ctrlKey: true },
    { key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true },
    { key: 'Process', code: 'KeyI', keyCode: 229, ctrlKey: true, shiftKey: true, isComposing: true },
    { key: 'i', code: 'KeyI', keyCode: 73, ctrlKey: true, shiftKey: true, altKey: true },
  ])('keeps normal modifiers, skills, copy and custom shortcuts %j', event => {
    const f = fixture();
    expect(f.press(event).defaultPrevented).toBe(false);
    expect(vm.runInContext('KEYS.SHIFT', f.context)).toBe(Boolean(event.shiftKey));
    expect(vm.runInContext('KEYS.CTRL', f.context)).toBe(Boolean(event.ctrlKey));
    expect(vm.runInContext('KEYS.ALT', f.context)).toBe(Boolean(event.altKey));
  });

  it('installs once, can be removed, and leaves a developer browser unsuppressed', () => {
    const f = fixture(); expect(installDebugAccessGuard(f.target)).toBe(f.dispose);
    f.dispose(); expect(f.press({ key: 'F12' }).defaultPrevented).toBe(false);
    const developer = fixture('http:');
    expect(developer.press({ key: 'F12' }).defaultPrevented).toBe(false);
    expect(developer.press({ key: 'i', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  });

  it.each(['Inventory', 'Storage'])('lets the actual %s right-click handler show item info and transfer with Alt', kind => {
    const f = fixture();
    const item = { index: 7, ITID: 1201, count: 2 }, append = vi.fn(), setItem = vi.fn(), transfer = vi.fn();
    const context = vm.createContext({
      Component: { getItemByIndex: () => item, transferItemToOtherUI: transfer },
      favoriteTab: false, ItemInfo_default: { uid: 0, append, setItem, remove: vi.fn() },
      transferItemToOtherUI: transfer, _list: [item], getItemIndexById: () => 0,
    });
    vm.runInContext(nativeFunction(`src/UI/Components/${kind}/${kind}Common.js`, 'onItemInfo'), context);
    const element = f.win.document.createElement('div'); element.dataset.index = '7'; f.win.document.body.append(element);
    const handler = context.onItemInfo as (this: HTMLElement, event: MouseEvent, item?: HTMLElement) => void;
    element.addEventListener('contextmenu', event => handler.call(element, event, element));
    const rightClick = (altKey = false) => {
      const event = new f.win.MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, button: 2, altKey });
      Object.defineProperty(event, 'which', { value: 3 }); element.dispatchEvent(event); return event;
    };
    expect(rightClick().defaultPrevented).toBe(true);
    expect(append).toHaveBeenCalledOnce(); expect(setItem).toHaveBeenCalledExactlyOnceWith(item);
    expect(rightClick(true).defaultPrevented).toBe(true); expect(transfer).toHaveBeenCalledExactlyOnceWith(item);
  });

  it('preserves actual map right-button camera rotation and entity menus', () => {
    const f = fixture(), rotate = vi.fn(), menu = vi.fn();
    const other = { objecttype: 1, onContextMenu: menu }, entity = {};
    const context = vm.createContext({
      Mouse: { intersect: true, state: 0, MOUSE_STATE: { USESKILL: 1 }, screen: { x: 80, y: 90 } }, KEYS: { SHIFT: false, ALT: false, CTRL: false },
      SessionStorage_default: { Entity: entity }, EntityManager: { getOverEntity: () => other, getFocusEntity: () => null },
      Entity: { TYPE_EFFECT: 99, TYPE_TRAP: 100 }, Cursor: { ACTION: { ROTATE: 1, DEFAULT: 0 }, setType() {} },
      Camera: { rotate }, _rightClickPosition: [0, 0],
    });
    const path = 'src/Controls/MapControl.js';
    vm.runInContext(nativeFunction(path, 'onMouseDown') + '\n' + nativeFunction(path, 'onMouseUp'), context);
    f.win.document.body.addEventListener('mousedown', context.onMouseDown);
    f.win.document.body.addEventListener('mouseup', context.onMouseUp);
    for (const name of ['mousedown', 'contextmenu', 'mouseup']) {
      const event = new f.win.MouseEvent(name, { bubbles: true, cancelable: true, button: 2 });
      Object.defineProperty(event, 'which', { value: 3 }); f.win.document.body.dispatchEvent(event);
    }
    expect(rotate.mock.calls).toEqual([[true], [false]]); expect(menu).toHaveBeenCalledOnce();
  });
});
