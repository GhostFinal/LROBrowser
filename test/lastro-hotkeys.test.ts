// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeHotkeys } from '../scripts/lastro-hotkeys.mjs';

const source = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeHotkeys(source);
function region(text: string, name: string) {
  const start = text.indexOf('//#region ' + name), end = text.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native fixture: ' + name);
  return text.slice(start, end);
}
function assignment(text: string, name: string) {
  const file = ts.createSourceFile('fixture.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(file) === name) result = node.getText(file) + ';';
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error('Missing assignment: ' + name);
  return result;
}
function method(name: string) {
  const file = ts.createSourceFile('gui.js', region(source, 'src/UI/GUIComponent.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) result = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error('Missing GUI method: ' + name);
  return result;
}
const bindKeys = method('_bindKeyDown'), unbindKeys = method('_unbindKeyDown'), editableFocused = method('isEditableFocused');
function fixtureSource(text: string) {
  const helper = text.includes('function lastroHotkeyId(')
    ? text.slice(text.indexOf('function lastroHotkeyId('), text.indexOf('//#region src/Controls/KeyEventHandler.js')) : '';
  const chat = region(text, 'src/UI/Components/ChatBox/ChatBox.js');
  return helper + [
    'src/Controls/KeyEventHandler.js', 'src/Preferences/ShortCutControls.js', 'src/Controls/BattleMode.js',
    'src/UI/Components/ShortCutOption/ShortCutOption.html?raw', 'src/UI/Components/ShortCutOption/ShortCutOption.js',
  ].map(name => region(text, name)).join('\n') + '\n' + assignment(chat, 'ChatBox.processBattleMode') + '\n' + assignment(chat, 'ChatBox.onKeyDown') +
    (chat.includes('ChatBox.onShortCut') ? '\n' + assignment(chat, 'ChatBox.onShortCut') : '');
}
const patchedFixture = fixtureSource(patched), nativeFixture = fixtureSource(source);
interface Binding { key: number | string; alt: boolean; ctrl: boolean; shift: boolean; }
interface Option {
  isCapturing: boolean;
  getRoot(): ShadowRoot;
  append(): void;
  remove(): void;
  _host: HTMLElement;
}
interface NativeApi {
  KEYS: Record<string, unknown>;
  BattleMode: { match(key: number): unknown; process(key: number): boolean; reload(): void };
  ShortCutOption: Option;
  ShortCutControls_default: { ShortCuts: Record<string, { cust: Binding | false }> };
}
const frames: HTMLIFrameElement[] = [];
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); });
function fixture(options: { patched?: boolean; preferences?: Record<string, unknown> } = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const calls = vi.fn(), commands = vi.fn(), height = vi.fn(), submit = vi.fn(), saved = vi.fn();
  const preferences: Record<string, unknown> = options.preferences ?? {};
  const chatHost = doc.createElement('div'); chatHost.id = 'ChatBox'; doc.body.append(chatHost);
  const chatRoot = chatHost.attachShadow({ mode: 'open' });
  chatRoot.innerHTML = '<div class="input"><input class="username"><div class="input-chatbox" contenteditable="true" tabindex="0"></div></div><div class="header"></div><div class="battlemode" style="display:none"></div><div class="content" data-content="0"></div>';
  const message = chatRoot.querySelector<HTMLElement>('.input-chatbox')!, nick = chatRoot.querySelector<HTMLInputElement>('.username')!;
  const chat = { activeTab: 0, getRoot: () => chatRoot, updateHeight: height, submit, onKeyDown: (() => true) as (event: KeyboardEvent) => boolean };
  const initNames = [...(options.patched === false ? nativeFixture : patchedFixture).matchAll(/\b(init_[\w$]+)\(\);/g)].map(match => match[1]!);
  const components: Record<string, unknown> = { ChatBox: chat };
  const context = vm.createContext({
    window: win, document: doc, console, Object, Number, parseInt, Array,
    getComputedStyle: win.getComputedStyle.bind(win), Renderer: { width: 800, height: 600 },
    DB: { getMessage: () => '输入数量', formatMsgToHtml: (value: string) => value },
    ShortCutOption_default$1: '', _root$18: () => chatRoot, ChatBox: chat,
    _historyMessage: { previous: () => '上一条', next: () => '下一条' },
    _historyNickName: { previous: () => '角色', next: () => '角色' },
    shouldLetChatInputHandleVerticalArrows: () => false,
    ChatBoxSettings_default: { updateTab() {} },
    Controls: { getValue: () => 0, setValue() {} },
    Preferences: { get(name: string, defaults: unknown) {
      const value = JSON.parse(JSON.stringify(preferences[name] ?? defaults)) as Record<string, unknown>;
      Object.defineProperty(value, 'save', { value: () => {
        preferences[name] = JSON.parse(JSON.stringify(value)); saved(name);
      } });
      return value;
    } },
    UIManager: { components, addComponent(component: { name: string }) { components[component.name] = component; return component; },
      getComponent(name: string) { return components[name] ?? { onShortCut: (binding: unknown) => calls(name, binding), updateAllTooltips() {} }; } },
    ProcessCommand_default: { processCommand: commands },
    __esmMin: (fn: () => void) => { let initialized = false; return () => { if (!initialized) { initialized = true; fn(); } }; },
  });
  // Use the native GUI keyboard binding, with only rendering/positioning stubbed.
  vm.runInContext(`
    ${[...new Set(initNames)].map(name => `var ${name} = () => {};`).join('\n')}
    class GUIComponent {
      static MouseMode = { STOP: 1 };
      constructor(name) { this.name = name; }
      getRoot() { return this._shadow; }
      draggable() {}
      focus() { this._host.tabIndex = -1; this._host.focus(); }
      append() {
        this.__active = true;
        if (!this._host) {
          this._host = document.createElement('div'); this._host.id = this.name;
          this._shadow = this._host.attachShadow({mode:'open'}); this._shadow.innerHTML = this.render();
          this.init();
        }
        document.body.append(this._host); this._bindKeyDown(); this.onAppend?.();
      }
      remove() { this.__active = false; this._unbindKeyDown(); this.onRemove?.(); this._host?.remove(); }
      ${editableFocused}
      ${bindKeys}
      ${unbindKeys}
    }
    ${options.patched === false ? nativeFixture : patchedFixture}
    init_ShortCutOption();
    globalThis.nativeApi = {KEYS, BattleMode, ShortCutOption, ShortCutControls_default};
  `, context);
  const api = context.nativeApi as NativeApi;
  // Chat is mounted first, as in the game. Its capture handler used to preempt recording.
  win.addEventListener('keydown', event => { if (!chat.onKeyDown(event)) event.preventDefault(); }, true);
  api.ShortCutOption.append();
  const root = api.ShortCutOption.getRoot();
  const cell = (id: string) => root.querySelector<HTMLElement>(`td[data-button="${id}"]`)!;
  const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();
  const press = (key: number, modifiers: KeyboardEventInit = {}, target: EventTarget = doc.body) => {
    const event = new win.KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, keyCode: key, which: key, ...modifiers });
    target.dispatchEvent(event); return event;
  };
  return {
    ...api, calls, commands, height, submit, saved, preferences, root, win, doc, message, nick, cell, click, press, context, components,
    select: (id: string) => cell(id).click(),
    binding: (id: string) => api.ShortCutControls_default.ShortCuts[id]!.cust,
    apply: () => click('.ok'), cancel: () => click('.cancel'), close: () => click('.close'),
    battleMode: (enabled: boolean) => { chatRoot.querySelector<HTMLElement>('.battlemode')!.style.display = enabled ? '' : 'none'; },
  };
}

describe('native custom shortcuts and browser event ownership', () => {
  it('reproduces the stale recording state after the original close button', () => {
    const f = fixture({ patched: false }); f.select('Inventory'); f.close();
    expect(f.ShortCutOption.isCapturing).toBe(true);
    expect(f.BattleMode.process(69)).toBe(false);
  });

  it('records Ctrl+R ahead of chat and prevents the browser default without running an action', () => {
    const f = fixture(); f.message.focus(); f.select('Inventory');
    expect(f.doc.activeElement).not.toBe(f.message);
    const event = f.press(82, { ctrlKey: true }, f.message);
    expect(event.defaultPrevented).toBe(true); expect(f.calls).not.toHaveBeenCalled();
    expect(f.cell('Inventory').textContent).toBe('CTRL + R');
    f.apply();
    expect(f.binding('Inventory')).toEqual({ key: 82, alt: false, ctrl: true, shift: false });
    expect(f.saved).toHaveBeenCalledWith('ShortCutControls');
    f.ShortCutOption.remove();
    expect(f.press(82, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('Inventory', expect.objectContaining({ cmd: 'TOGGLE' }));
  });

  it('records a function key even when a chat input is still focused', () => {
    const f = fixture(); f.select('Inventory'); f.message.focus();
    expect(f.press(116, { key: 'F5' }, f.message).defaultPrevented).toBe(true);
    expect(f.cell('Inventory').textContent).toBe('F5'); expect(f.calls).not.toHaveBeenCalled();
    f.apply(); expect(f.binding('Inventory')).toMatchObject({ key: 116 });
  });

  it('keeps recording through modifier-only keys and records the current combination exactly', () => {
    const f = fixture(); f.select('Inventory');
    expect(f.press(17, { ctrlKey: true, key: 'Control' }).defaultPrevented).toBe(true);
    expect(f.ShortCutOption.isCapturing).toBe(true);
    f.press(75, { ctrlKey: true, shiftKey: true }); f.apply();
    expect(f.binding('Inventory')).toEqual({ key: 75, ctrl: true, shift: true, alt: false });
  });

  it('moves a conflicting binding using the original swap behavior and persists it on reopen', () => {
    const f = fixture(); f.select('Inventory'); f.press(82, { ctrlKey: true }); f.apply();
    expect(f.binding('MercInfo')).toEqual({ key: 69, ctrl: false, shift: false, alt: true });
    f.close(); f.ShortCutOption.append();
    expect(f.cell('Inventory').textContent).toBe('CTRL + R');
    const reopened = fixture({ preferences: f.preferences });
    expect(reopened.cell('Inventory').textContent).toBe('CTRL + R');
    expect(reopened.cell('MercInfo').textContent).toBe('ALT + E');
  });

  it.each(['close', 'cancel', 'remove'] as const)('clears capture and discards unsaved edits on %s', action => {
    const f = fixture(); f.select('Inventory'); f.press(75, { ctrlKey: true }); f.select('Equipment');
    if (action === 'remove') f.ShortCutOption.remove(); else f[action]();
    expect(f.ShortCutOption.isCapturing).toBe(false); expect(f.binding('Inventory')).toBe(false);
    expect(f.root.querySelector('td.selected')).toBeNull();
    f.press(69, { altKey: true }); expect(f.calls).toHaveBeenCalledWith('Inventory', expect.anything());
    if (action !== 'cancel') f.ShortCutOption.append();
    expect(f.cell('Inventory').textContent).toBe('ALT + E');
  });

  it('resets keys to original RO defaults and keeps Escape as the native unbind action', () => {
    const f = fixture(); f.select('Inventory'); f.press(27, { key: 'Escape' }); f.apply();
    expect(f.binding('Inventory')).toEqual({ key: '', ctrl: false, shift: false, alt: false });
    f.click('.reset'); f.apply(); expect(f.binding('Inventory')).toBe(false);
    f.ShortCutOption.remove(); f.press(69, { altKey: true });
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('Inventory', expect.anything());
  });

  it('matches modifiers from the current event and clears them on keyup and window blur', () => {
    const f = fixture(); f.ShortCutOption.remove();
    f.press(69, { altKey: true });
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('Inventory', expect.anything());
    expect(f.press(69).defaultPrevented).toBe(false);
    expect(f.calls).toHaveBeenCalledOnce();
    f.win.dispatchEvent(new f.win.KeyboardEvent('keyup', { altKey: false })); expect(f.KEYS.ALT).toBe(false);
    f.press(17, { ctrlKey: true }); f.win.dispatchEvent(new f.win.Event('blur'));
    expect(f.KEYS.CTRL).toBe(false); expect(f.KEYS.SHIFT).toBe(false); expect(f.KEYS.ALT).toBe(false);
  });

  it('does not activate bare letter/number skill bindings until battle mode is enabled', () => {
    const f = fixture(); f.ShortCutOption.remove();
    expect(f.press(81).defaultPrevented).toBe(false); expect(f.calls).not.toHaveBeenCalled();
    f.battleMode(true); expect(f.press(81).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('ShortCut', expect.objectContaining({ cmd: 'EXECUTE18' }));
    expect(f.press(112).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenLastCalledWith('ShortCut', expect.objectContaining({ cmd: 'EXECUTE0' }));
  });

  it.each([13, 38, 121])('uses customized key %i before its former hardcoded chat action', key => {
    const f = fixture(); f.select('Inventory'); f.press(key); f.apply(); f.ShortCutOption.remove(); f.battleMode(true);
    expect(f.press(key).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('Inventory', expect.anything());
    expect(f.height).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });

  it('leaves ordinary chat text and editing shortcuts untouched, including Shift+Insert', () => {
    const f = fixture(); f.ShortCutOption.remove(); f.battleMode(true); f.message.focus();
    for (const [key, mods] of [[81, {}], [65, { shiftKey: true }], [67, { ctrlKey: true }], [86, { ctrlKey: true }], [90, { ctrlKey: true, shiftKey: true }], [45, { shiftKey: true }], [37, { ctrlKey: true }]] as [number, KeyboardEventInit][]) {
      expect(f.press(key, mods, f.message).defaultPrevented).toBe(false);
    }
    expect(f.calls).not.toHaveBeenCalled();
    expect(f.press(112, {}, f.message).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('ShortCut', expect.objectContaining({ cmd: 'EXECUTE0' }));
  });

  it('preserves typing and edit behavior in other shadow inputs and textareas', () => {
    const f = fixture(); f.ShortCutOption.remove(); f.battleMode(true);
    const host = f.doc.createElement('div'); f.doc.body.append(host); const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<textarea></textarea>'; const input = shadow.querySelector('textarea')!; input.focus();
    expect(f.press(81, {}, input).defaultPrevented).toBe(false);
    expect(f.press(82, { ctrlKey: true }, input).defaultPrevented).toBe(false);
    expect(f.press(112, {}, input).defaultPrevented).toBe(false);
    expect(f.calls).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { key: 'Process', keyCode: 229, which: 229 }, { key: 'Dead' }, { metaKey: true }])('does not record or trigger a composing/system event %j', mods => {
    const f = fixture(); f.select('Inventory'); f.press(69, { altKey: true, ...mods });
    expect(f.ShortCutOption.isCapturing).toBe(true); expect(f.calls).not.toHaveBeenCalled();
    f.ShortCutOption.remove(); expect(f.press(69, { altKey: true, ...mods }).defaultPrevented).toBe(false);
    expect(f.calls).not.toHaveBeenCalled();
  });

  it('preserves AltGraph input rather than treating it as Ctrl+Alt', () => {
    const f = fixture(); f.ShortCutOption.remove();
    const event = new f.win.KeyboardEvent('keydown', { keyCode: 69, which: 69, ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'getModifierState', { value: (name: string) => name === 'AltGraph' });
    f.doc.body.dispatchEvent(event); expect(event.defaultPrevented).toBe(false); expect(f.calls).not.toHaveBeenCalled();
  });

  it('supports modern code-only keyboard events when deprecated which is absent', () => {
    const f = fixture(); f.select('Inventory'); f.press(0, { code: 'KeyK', key: 'k', ctrlKey: true }); f.apply();
    expect(f.binding('Inventory')).toMatchObject({ key: 75, ctrl: true });
    f.ShortCutOption.remove(); expect(f.press(0, { code: 'KeyK', key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith('Inventory', expect.anything());
  });

  it('does not swallow unregistered combinations and retains native Insert sit and F10 resizing', () => {
    const f = fixture(); f.ShortCutOption.remove();
    expect(f.press(75, { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(f.press(45).defaultPrevented).toBe(true); expect(f.commands).toHaveBeenCalledExactlyOnceWith('sit');
    expect(f.press(121).defaultPrevented).toBe(true);
    expect(f.height).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('moves ChatSize to a custom key and stops resizing on the former F10 binding', () => {
    const f = fixture(); f.select('ChatSize'); f.press(72, { ctrlKey: true }); f.apply(); f.ShortCutOption.remove();
    f.press(121); expect(f.height).not.toHaveBeenCalled();
    expect(f.press(72, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(f.height).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('does not retain the hardcoded F10 resize action after ChatSize is unbound', () => {
    const f = fixture(); f.select('ChatSize'); f.press(27); f.apply(); f.ShortCutOption.remove();
    f.press(121); expect(f.height).not.toHaveBeenCalled();
  });

  it('does not let a detached or hidden stale recorder disable the active bindings', () => {
    const f = fixture(); f.select('Inventory'); f.ShortCutOption._host.style.display = 'none';
    f.press(69, { altKey: true }); expect(f.ShortCutOption.isCapturing).toBe(false);
    expect(f.calls).toHaveBeenCalledWith('Inventory', expect.anything());
  });

  it('rejects changed anchors and a second patch while preserving unrelated code', () => {
    expect(patchRuntimeHotkeys('const nothingToPatch = true;')).toBe('const nothingToPatch = true;');
    expect(() => patchRuntimeHotkeys(patched)).toThrow('already-patched');
    expect(() => patchRuntimeHotkeys(source.replace('onKeyEvent = (event)', 'differentHandler = (event)'))).toThrow('anchor:hotkeys');
    expect(patchRuntimeHotkeys(source + '\nfunction externalChat(text) { return text; }')).toContain('function externalChat(text) { return text; }');
    const file = ts.createSourceFile('Online.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] };
    expect(file.parseDiagnostics).toEqual([]);
  });
});

interface NativeDialog extends Option {
  __active: boolean;
  ownerID: number;
  addNext(owner: number): void;
  addClose(owner: number): void;
  setMenu(menu: string, owner: number): void;
  setType(type: string, persistent: boolean, value?: string | number): void;
  onNextPressed(owner: number): void;
  onClosePressed(owner: number): void;
  onSelectMenu(owner: number, selection: number): void;
  onSubmitRequest(value: string | number): void;
}
function nativeDialogs(configure?: (value: ReturnType<typeof fixture>) => void) {
  const f = fixture(); configure?.(f); f.ShortCutOption.remove();
  const names = ['InputBox', 'NpcMenu', 'NpcBox', 'Escape'];
  const text = names.map(name => [
    region(patched, `src/UI/Components/${name}/${name}.html?raw`),
    region(patched, `src/UI/Components/${name}/${name}.js`),
  ].join('\n')).join('\n');
  const initNames = [...new Set([...text.matchAll(/\b(init_[\w$]+)\(\);/g)].map(match => match[1]!))];
  vm.runInContext(`
    ${initNames.map(name => `var ${name} = typeof ${name} === 'function' ? ${name} : () => {};`).join('\n')}
    ${names.map(name => `var ${name}_default$1 = '';`).join('\n')}
    ${text}
    init_NpcBox(); init_Escape();
    globalThis.dialogs = { NpcBox, NpcMenu, InputBox, Escape };
  `, f.context);
  const dialogs = f.context.dialogs as Record<'NpcBox' | 'NpcMenu' | 'InputBox' | 'Escape', NativeDialog>;
  const next = vi.fn(), close = vi.fn(), select = vi.fn(), input = vi.fn();
  dialogs.NpcBox.onNextPressed = next;
  dialogs.NpcBox.onClosePressed = owner => { close(owner); dialogs.NpcBox.remove(); };
  dialogs.NpcMenu.onSelectMenu = (owner, value) => { select(owner, value); dialogs.NpcMenu.remove(); };
  dialogs.InputBox.onSubmitRequest = value => { input(value); dialogs.InputBox.remove(); };
  return { ...f, ...dialogs, next, close, select, input };
}

describe('native NPC steps and Escape menu key ownership', () => {
  it('uses modern Escape events to open and close the actual native menu without repeat flicker', () => {
    const f = nativeDialogs(); f.Escape.append();
    expect(f.Escape._host.style.display).toBe('none');
    f.press(0, { code: 'Escape', key: 'Unidentified' }); expect(f.Escape._host.style.display).toBe('');
    f.press(0, { code: 'Escape', key: 'Escape', repeat: true }); expect(f.Escape._host.style.display).toBe('');
    f.press(0, { code: 'Escape', key: 'Escape' }); expect(f.Escape._host.style.display).toBe('none');
  });

  it('advances the visible native next button once without stealing chat focus or dispatching an Enter shortcut', () => {
    const f = nativeDialogs(value => { value.select('Inventory'); value.press(13); value.apply(); }); f.battleMode(true);
    expect(f.binding('Inventory')).toMatchObject({ key: 13 });
    f.NpcBox.append(); f.NpcBox.addNext(123); f.message.focus();
    expect(f.press(0, { code: 'Enter', key: 'Enter' }, f.message).defaultPrevented).toBe(true);
    expect(f.next).toHaveBeenCalledExactlyOnceWith(123); expect(f.submit).not.toHaveBeenCalled(); expect(f.calls).not.toHaveBeenCalled();
    expect(f.NpcBox.getRoot().querySelector<HTMLElement>('.next')?.style.display).toBe('none');
    f.NpcBox.addNext(123); f.press(13, { repeat: true }, f.message); expect(f.next).toHaveBeenCalledOnce();
    f.press(13, {}, f.message); expect(f.next).toHaveBeenCalledTimes(2);
  });

  it('closes the native NPC step before opening Escape and keeps the correct owner callback', () => {
    const f = nativeDialogs(); f.Escape.append(); f.NpcBox.append(); f.NpcBox.addClose(456);
    f.press(0, { key: 'Escape', code: 'Escape' });
    expect(f.close).toHaveBeenCalledExactlyOnceWith(456); expect(f.Escape._host.style.display).toBe('none');
    f.press(27, { key: 'Escape' }); expect(f.Escape._host.style.display).toBe('');
  });

  it('routes Enter to the native menu selection rather than the NPC next step', () => {
    const f = nativeDialogs(); f.NpcBox.append(); f.NpcBox.addNext(123); f.NpcMenu.append(); f.NpcMenu.setMenu('选项一:选项二', 123);
    f.press(0, { code: 'Enter', key: 'Enter' }); expect(f.select).toHaveBeenCalledExactlyOnceWith(123, 1);
    expect(f.next).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });

  it.each(['text', 'number'])('routes Enter to the native %s input, including zero, without duplicate callbacks', type => {
    const f = nativeDialogs(); f.NpcBox.append(); f.NpcBox.addNext(123); f.NpcMenu.append(); f.NpcMenu.setMenu('选项', 123);
    f.InputBox.append(); f.InputBox.setType(type, true, type === 'text' ? '文字' : 0);
    const input = f.InputBox.getRoot().querySelector<HTMLInputElement>('input')!; input.focus();
    f.press(0, { code: 'Enter', key: 'Enter' }, input);
    expect(f.input).toHaveBeenCalledExactlyOnceWith(type === 'text' ? '文字' : 0);
    expect(f.select).not.toHaveBeenCalled(); expect(f.next).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });

  it('preserves IME confirmation in native input and does not advance dialog buttons during composition', () => {
    const f = nativeDialogs(); f.NpcBox.append(); f.NpcBox.addNext(123);
    expect(f.press(13, { isComposing: true }).defaultPrevented).toBe(false); expect(f.next).not.toHaveBeenCalled();
    f.InputBox.append(); f.InputBox.setType('text', true, '拼音');
    const input = f.InputBox.getRoot().querySelector<HTMLInputElement>('input')!;
    expect(f.press(0, { code: 'Enter', key: 'Process', isComposing: true }, input).defaultPrevented).toBe(false);
    expect(f.input).not.toHaveBeenCalled();
  });

  it('leaves an unrelated text editor alone while NPC dialogs are visible', () => {
    const f = nativeDialogs(); f.Escape.append(); f.NpcBox.append(); f.NpcBox.addNext(123);
    const editor = f.doc.createElement('textarea'); f.doc.body.append(editor); editor.focus();
    expect(f.press(13, {}, editor).defaultPrevented).toBe(false); expect(f.next).not.toHaveBeenCalled();
    f.press(27, { key: 'Escape' }, editor); expect(f.Escape._host.style.display).toBe('none');
  });

  it('lets hidden and detached NPC components fall through to normal chat without invoking a stale step', () => {
    const f = nativeDialogs(); f.NpcBox.append(); f.NpcBox.addNext(123); f.NpcBox.remove();
    f.message.focus(); f.press(13, {}, f.message); expect(f.submit).toHaveBeenCalledOnce(); expect(f.next).not.toHaveBeenCalled();
    expect(() => patchRuntimeHotkeys(source.replace('NpcBox.onKeyDown = function onKeyDown(event)', 'NpcBox.otherHandler = function onKeyDown(event)'))).toThrow('anchor:hotkeys');
  });

  it('lets events inside a visible world-map control reach its handler before customized battle shortcuts', () => {
    const f = nativeDialogs(); f.battleMode(true);
    const host = f.doc.createElement('div'); f.doc.body.append(host); const shadow = host.attachShadow({ mode: 'open' });
    const pane = f.doc.createElement('button'); shadow.append(pane); f.components.WorldMap = { _host: host, __active: true };
    const target = vi.fn(); pane.addEventListener('keydown', target);
    expect(f.press(112, { key: 'F1' }, pane).defaultPrevented).toBe(false);
    expect(target).toHaveBeenCalledOnce(); expect(f.calls).not.toHaveBeenCalled();
    host.style.display = 'none'; f.press(112); expect(f.calls).toHaveBeenCalledOnce();
  });
});
