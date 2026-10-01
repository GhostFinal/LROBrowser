// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { patchRuntimeHotkeys } from '../scripts/lastro-hotkeys.mjs';
import { lastroUiWindowAppend, patchRuntimeUiState } from '../scripts/lastro-ui-state.mjs';
import { installDebugAccessGuard } from '../src/runtime/debug-access';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeUiState(patchRuntimeHotkeys(native));
const shortcutPath = 'src/UI/Components/ShortCut/ShortCut.js';
function region(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing actual runtime region: ' + path);
  return source.slice(start, end);
}
function assignment(source: string, path: string, left: string) {
  const file = ts.createSourceFile('actual.js', region(source, path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: ts.BinaryExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(file) === left) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (found.length !== 1) throw new Error('Missing or duplicate actual assignment: ' + left);
  return found[0]!.getText(file) + ';';
}
function guiMethods() {
  const names = ['_bindKeyDown', '_unbindKeyDown'];
  const file = ts.createSourceFile('GUI.js', region(native, 'src/UI/GUIComponent.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(file))) found.set(node.name.getText(file), node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return names.map(name => {
    const method = found.get(name);
    if (!method) throw new Error('Missing actual GUI method: ' + name);
    return method;
  }).join('\n');
}
const keyboardMethods = guiMethods();
interface ShortcutPreferences {
  size: number;
  save(): void;
  _lastroWindow?: { height?: number };
}
interface Shortcut {
  _host: HTMLElement;
  getRoot(): ShadowRoot;
  onAppend(): void;
  onRemove(): void;
  _lastroWindowState: { dispose(): void };
}
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

function fixture(options: { legacyExtend?: boolean; storage?: Record<string, string>; focus?: 'message' | 'nickname'; rows?: number } = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const storage = options.storage ?? {};
  const disposeGuard = installDebugAccessGuard({ location: { protocol: 'isolated-app:' },
    addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win) } as unknown as Window);
  const host = doc.createElement('div'); host.id = 'ShortCut'; doc.body.append(host);
  Object.assign(host.style, { position: 'absolute', width: '280px', top: '0px', left: '480px' });
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<div id="ShortCut"><div class="shortcut-tooltip"></div></div>';
  for (const [property, style] of [['offsetWidth', 'width'], ['offsetHeight', 'height'], ['offsetLeft', 'left'], ['offsetTop', 'top']] as const)
    Object.defineProperty(host, property, { get: () => parseFloat(host.style[style]) || 0 });
  host.getBoundingClientRect = () => ({ x: host.offsetLeft, y: host.offsetTop, left: host.offsetLeft, top: host.offsetTop,
    width: host.offsetWidth, height: host.offsetHeight, right: host.offsetLeft + host.offsetWidth, bottom: host.offsetTop + host.offsetHeight, toJSON() {} });
  const chatHost = doc.createElement('div'); doc.body.append(chatHost);
  const chatRoot = chatHost.attachShadow({ mode: 'open' });
  chatRoot.innerHTML = '<div class="battlemode"></div><div class="input"><div class="input-chatbox" contenteditable="true" tabindex="0"></div><input class="username"></div>';
  const context = vm.createContext({
    window: win, document: doc, host, root, chatRoot, rows: options.rows ?? 4, lastroUiWindowAppend,
    localStorage: { getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; } },
    __esmMin: (init: () => void) => { let ready = false; return () => { if (!ready) { ready = true; init(); } }; },
    init_ProcessCommand() {}, init_ShortCutControls() {}, init_UIManager() {},
    Renderer: { width: 1200, height: 900 }, Controller$4: { getUI: () => ({}) },
    updateEmptySlotTooltips() {}, onUpdateSkill() {}, _root$18: () => chatRoot,
    cancelAnimationFrame() {},
  });
  const hotkeyHelpers = patched.slice(patched.indexOf('function lastroHotkeyId('), patched.indexOf('//#region src/Controls/KeyEventHandler.js'));
  vm.runInContext(`
    ${region(patched, 'src/Core/Preferences.js')}
    init_Preferences$1();
    ${hotkeyHelpers}
    ${region(patched, 'src/Controls/KeyEventHandler.js')}
    init_KeyEventHandler();
    const ShortCuts$2 = {};
    ${assignment(native, 'src/Preferences/ShortCutControls.js', 'ShortCuts$2.SkillBarSize')}
    const ShortCutControls_default = { ShortCuts: ShortCuts$2 };
    ${assignment(patched, shortcutPath, '_preferences$19')}
    const ShortCut = { _host: host, getRoot: () => root, magnet: {}, _isDraggable: true, __active: true,
      addElement() {}, _fixPositionOverflow() {} };
    const _list$1 = [], _activeAnimations = new Map(); let _rowCount = 0;
    ${assignment(patched, shortcutPath, 'ShortCut.onAppend')}
    ${assignment(patched, shortcutPath, 'ShortCut.onRemove')}
    ${assignment(patched, shortcutPath, 'ShortCut.setList')}
    ${assignment(options.legacyExtend ? native : patched, shortcutPath, 'ShortCut.onShortCut')}
    const UIManager = { components: {}, getComponent: name => name === 'ShortCutOption' ? {isCapturing: false} : ShortCut };
    ${region(patched, 'src/Controls/BattleMode.js')}
    init_BattleMode();
    class KeyboardComponent { ${keyboardMethods} }
    const ChatBox = new KeyboardComponent(); ChatBox.captureKeyEvents = true;
    ${assignment(patched, 'src/UI/Components/ChatBox/ChatBox.js', 'ChatBox.processBattleMode')}
    ${assignment(patched, 'src/UI/Components/ChatBox/ChatBox.js', 'ChatBox.onKeyDown')}
    ChatBox._bindKeyDown();
    ShortCut.setList(Array.from({length: rows * 9}, () => ({ID: 0, isSkill: false, count: 0})));
    ShortCut.onAppend();
    globalThis.api = { ShortCut, preferences: _preferences$19 };
  `, context);
  const api = context.api as { ShortCut: Shortcut; preferences: ShortcutPreferences };
  cleanups.push(() => { api.ShortCut._lastroWindowState.dispose(); disposeGuard(); frame.remove(); });
  const target = options.focus === 'message' ? chatRoot.querySelector<HTMLElement>('.input-chatbox')!
    : options.focus === 'nickname' ? chatRoot.querySelector<HTMLInputElement>('.username')! : doc.body;
  target.focus();
  const press = (legacy = true) => {
    const event = new win.KeyboardEvent('keydown', { key: 'F12', code: 'F12', keyCode: legacy ? 123 : 0,
      which: legacy ? 123 : 0, bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(event); return event;
  };
  const saved = () => JSON.parse(storage.ShortCut!) as ShortcutPreferences;
  return { ...api, host, storage, press, saved,
    close() { api.ShortCut.onRemove(); host.remove(); },
    reopen() { doc.body.append(host); api.ShortCut.onAppend(); },
  };
}

describe('F12 with actual skill-bar window persistence', () => {
  it('reproduces the old EXTEND save order restoring the previous row count', () => {
    const f = fixture({ legacyExtend: true });
    expect(f.host.style.height).toBe('34px');
    expect(f.press().defaultPrevented).toBe(true);
    expect(f.preferences.size).toBe(1); expect(f.saved().size).toBe(1);
    expect(f.host.style.height).toBe('34px');
  });

  it.each([undefined, 'message', 'nickname'] as const)('cycles actual rows and saves them immediately with focus=%s', focus => {
    const f = fixture({ focus });
    for (const size of [2, 3, 4, 0, 1]) {
      expect(f.press().defaultPrevented).toBe(true);
      expect(f.host.style.height).toBe(`${size * 34}px`);
      expect(f.preferences.size).toBe(size); expect(f.saved().size).toBe(size);
      expect(f.saved()._lastroWindow?.height).toBe(size * 34);
    }
  });

  it('normalizes code-only F12 through the prepared game keyboard path', () => {
    const f = fixture(); f.press(false);
    expect(f.host.style.height).toBe('68px'); expect(f.saved().size).toBe(2);
  });

  it.each([0, 2, 3, 4])('restores the saved %i-row skill bar after closing and reopening the UI', size => {
    const f = fixture();
    for (let count = 0; f.preferences.size !== size && count < 5; count++) f.press();
    expect(f.preferences.size).toBe(size);
    const restored = fixture({ storage: f.storage });
    expect(restored.host.style.height).toBe(`${size * 34}px`);
    expect(restored.preferences.size).toBe(size);
  });

  it('keeps a collapsed row preference when an older window record still has an expanded pixel height', () => {
    const f = fixture({ storage: { ShortCut: JSON.stringify({ _version: 1, size: 0, x: 480, y: 0,
      magnet_top: true, _lastroWindow: { left: 480, top: 0, width: 280, height: 136 } }) } });
    expect(f.host.style.height).toBe('0px'); expect(f.preferences.size).toBe(0);
  });

  it.each([0, 1, 2, 4])('retains %i rows and the installed save hook when the same component is removed and appended', size => {
    const f = fixture();
    for (let count = 0; f.preferences.size !== size && count < 5; count++) f.press();
    expect(f.preferences.size).toBe(size);
    const windowSave = f.preferences.save;
    f.close();
    expect(f.host.isConnected).toBe(false); expect(f.saved().size).toBe(size);
    f.reopen();
    expect(f.host.style.height).toBe(`${size * 34}px`); expect(f.preferences.size).toBe(size);
    expect(f.preferences.save).toBe(windowSave);
    const next = (size + 1) % 5;
    f.press();
    expect(f.host.style.height).toBe(`${next * 34}px`); expect(f.saved().size).toBe(next);
  });

  it.each(['missing-extend', 'duplicate-extend', 'duplicate-handler'] as const)('fails patching explicitly when the actual upstream shortcut anchor drifts: %s', change => {
    const original = assignment(native, shortcutPath, 'ShortCut.onShortCut');
    const changed = change === 'missing-extend' ? original.replace('case "EXTEND":', 'case "GROW":')
      : change === 'duplicate-extend' ? original.replace('case "EXTEND":', 'case "EXTEND":\ncase "EXTEND":')
        : original + '\n' + original;
    expect(changed).not.toBe(original);
    expect(() => patchRuntimeUiState(native.replace(original, () => changed))).toThrow('anchor:ui-state:shortcut-extend-save-order');
  });
});
