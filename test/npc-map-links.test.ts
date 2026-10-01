// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLastroNpcMapLinks, patchRuntimeNpcMapLinks, type NpcMapComponent } from '../scripts/lastro-npc-map-links.mjs';
import { createLastroWorldMapTeleport } from '../scripts/lastro-worldmap-teleport.mjs';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const generated = readFileSync('generated/runtime/Online.js', 'utf8');
function region(source: string, name: string) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + name);
  return source.slice(start, end);
}
function assignment(source: string, name: string) {
  const file = ts.createSourceFile('npc.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(file) === name) matches.push(node.getText(file) + ';');
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) throw new Error('Missing/ambiguous native assignment: ' + name);
  return matches[0]!;
}
function guiMethod(name: string) {
  const file = ts.createSourceFile('gui.js', region(native, 'src/UI/GUIComponent.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) result = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error('Missing native GUI method: ' + name);
  return result;
}
const uiFile = ts.createSourceFile('ui.js', region(native, 'src/UI/UIManager.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const nativePromptMethods: string[] = [];
function visitPrompt(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(uiFile) === 'showPromptBox') nativePromptMethods.push(node.getText(uiFile));
  ts.forEachChild(node, visitPrompt);
}
visitPrompt(uiFile);
if (nativePromptMethods.length !== 1) throw new Error('Missing/ambiguous native prompt method');
const promptHelpers = ['_createButton', '_popupPosition'].map(name => {
  const node = uiFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error('Missing native prompt helper: ' + name);
  return node.getText(uiFile);
}).join('\n');
const npcRegion = region(native, 'src/UI/Components/NpcBox/NpcBox.js');
const htmlRegion = region(native, 'src/UI/Components/NpcBox/NpcBox.html?raw');
const cssRegion = region(native, 'src/UI/Components/NpcBox/NpcBox.css?raw');
const slot = 'div.innerHTML = processText(text);';
if (npcRegion.split(slot).length !== 2) throw new Error('Native NPC render anchor changed');
const installedNpc = npcRegion.replace(slot, 'NpcBox._lastroMapLinks.render(div, text, processText);');
const hotkeyRegion = region(generated, 'src/UI/Components/NpcBox/NpcBox.js');
const hotkeyFile = ts.createSourceFile('hotkeys.mjs', readFileSync('scripts/lastro-hotkeys.mjs', 'utf8'), ts.ScriptTarget.Latest, true);
const hotkeyHelpers = hotkeyFile.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ['lastroHotkeyId', 'lastroHotkeyComponentVisible', 'lastroHotkeyEditable'].includes(node.name?.text ?? '')).map(node => node.getText(hotkeyFile)).join('\n');
const npcCallbacks = ['onNextPressed', 'onClosePressed'].map(name => assignment(region(native, 'src/Engine/MapEngine/NPC.js'), 'NpcBox_default.' + name)).join('\n');
const packetStart = native.indexOf('PACKET.CZ.PRIVATE_AIRSHIP_REQUEST =');
const packetEnd = native.indexOf('PACKET.CZ.PRIVATE_AIRSHIP_REQUEST.prototype.build', packetStart);
if (packetStart < 0 || packetEnd < packetStart) throw new Error('Missing native map-level packet constructor');
const packetConstructor = native.slice(packetStart, packetEnd);
const migration = ts.createSourceFile('migration.mjs', readFileSync('vendor/v2/lastro-v1-migration.mjs', 'utf8'), ts.ScriptTarget.Latest, true);
const builderNode = migration.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildPrivateAirshipRequest');
if (!builderNode) throw new Error('Missing actual map-level request builder');
type Airship = { mapname: string; x: number; y: number; type: number; itemid: number };
const buildRequest = vm.runInNewContext('(' + builderNode.getText(migration).replace(/^export\s+/, '') + ')') as (value: { mapname: string }) => Airship;
const bindKeys = guiMethod('_bindKeyDown'), unbindKeys = guiMethod('_unbindKeyDown');
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); });

interface NativeNpc extends NpcMapComponent {
  _host: HTMLElement;
  getRoot(): ShadowRoot;
  append(): void;
  remove(): void;
  onKeyDown(event: KeyboardEvent): unknown;
}
interface NativePrompt extends NativeNpc { _shadow: ShadowRoot; captureKeyEvents: boolean; }
function fixture(options: { label?: string; unavailable?: boolean } = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const sent: Array<Record<string, unknown>> = [];
  const item = { uid: 0, append: vi.fn(), remove: vi.fn(), setItem: vi.fn() };
  const navigation = { uid: '', _host: doc.createElement('div'), show: vi.fn(), hide: vi.fn(), setNaviInfo: vi.fn() };
  const components: Record<string, unknown> = {};
  const menuValidate = vi.fn(), inputValidate = vi.fn();
  const makeDialog = () => {
    const host = doc.createElement('div'), root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="content"></div><input>'; host.style.display = 'none';
    return { _host: host, __active: false, getRoot: () => root, isEditableFocused: () => false,
      onKeyDown: (event: KeyboardEvent): unknown => { void event; return true; }, _unbindKeyDown() { unbindDialog.call(this); } };
  };
  const menu = makeDialog(), input = makeDialog();
  const context = vm.createContext({ window: win, document: doc, console,
    getComputedStyle: (element: Element) => ({ display: (element as HTMLElement).style.display || win.getComputedStyle(element).display }),
    Renderer: { width: 1024, height: 720 },
    UIManager: { components, addComponent(component: { name: string }) { components[component.name] = component; return component; } },
    ItemInfo_default: item, Navigation_default: navigation, NpcMenu_default: menu, InputBox_default: input,
    NpcMenu: menu, InputBox: input, validate: menuValidate, validate$1: inputValidate, cancel$1: vi.fn(), _index: 0,
    KEYS: { SPACE: 32, ENTER: 13, ESCAPE: 27, getDeepActiveElement: () => {
      let active = doc.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active;
    } },
    Network: { sendPacket(packet: Record<string, unknown>) { sent.push({ ...packet }); } },
    PACKET: { CZ: { REQ_NEXT_SCRIPT: function () { return { kind: 'next', NAID: 0 }; }, CLOSE_DIALOG: function () { return { kind: 'close', NAID: 0 }; } } },
    __esmMin: (fn: () => void) => { let done = false; return () => { if (!done) { done = true; fn(); } }; },
  });
  for (const match of installedNpc.matchAll(/\b(init_[\w$]+)\(\);/g)) context[match[1]!] = () => {};
  vm.runInContext(`
    class GUIComponent {
      static MouseMode = { FREEZE: 2 };
      static processDataAttrs() {}
      constructor(name) {
        this.name = name; this._host = document.createElement('div'); this._host.id = name;
        this.root = this._host.attachShadow({mode:'open'}); this.__active = false; this.__loaded = false;
      }
      getRoot() {
        if (!this.__loaded) {
          this.__loaded = true; this.root.innerHTML = this.render();
          for (const button of this.root.querySelectorAll('.next,.close')) button.style.display = 'none';
        }
        return this.root;
      }
      draggable() {}
      append() {
        this.getRoot(); if (!this.initialized) { this.initialized = true; this.init(); }
        document.body.append(this._host); this.__active = true; this._host.style.display = ''; this._bindKeyDown();
      }
      remove() { this._unbindKeyDown(); this.__active = false; this.onRemove?.(); this._host.remove(); }
      ${bindKeys}
      ${unbindKeys}
    }
    ${htmlRegion}
    ${cssRegion}
    ${hotkeyHelpers}
    ${installedNpc}
    init_NpcBox();
    ${assignment(hotkeyRegion, 'NpcBox.onKeyDown')}
    ${assignment(region(generated, 'src/UI/Components/NpcMenu/NpcMenu.js'), 'NpcMenu.onKeyDown')}
    ${assignment(region(generated, 'src/UI/Components/InputBox/InputBox.js'), 'InputBox.onKeyDown')}
    ${npcCallbacks}
    ${packetConstructor}
    ${promptHelpers}
    UIManager.getComponent = () => ({ clone(name) {
      const prompt = new GUIComponent(name);
      prompt._shadow = prompt.root;
      prompt.render = () => '<div class="text"></div><div class="btns"></div>';
      prompt.onRemove = () => {};
      return prompt;
    }});
    UIManager.showPromptBox = class NativeUI { ${nativePromptMethods[0]} }.showPromptBox;
  `, context);
  const bindDialog = vm.runInContext(`({${bindKeys}})._bindKeyDown`, context) as (this: unknown) => void;
  const unbindDialog = vm.runInContext(`({${unbindKeys}})._unbindKeyDown`, context) as (this: unknown) => void;
  const component = context.NpcBox as NativeNpc;
  let map = 'prontera.gat', profile = '6:5';
  const pending: Array<{ resolve(value: { approved: boolean }): void; reject(error: Error): void }> = [];
  const preflight = { check: vi.fn<(route: unknown) => Promise<{ approved: boolean }>>(() => new Promise((resolve, reject) => pending.push({ resolve, reject }))), cancel: vi.fn() };
  const onError = vi.fn();
  const send = vi.fn<(id: string) => void>(id => {
    if (!api.canSend(id)) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
    if (options.unavailable) throw new Error('当前客户端不支持传送');
    const packet = vm.runInContext('new PACKET.CZ.PRIVATE_AIRSHIP_REQUEST()', context) as Airship;
    Object.assign(packet, buildRequest({ mapname: id })); api.commit(id, () => sent.push({ ...packet }));
  });
  const controller = createLastroWorldMapTeleport({ preflight, getMap: () => map, getProfile: () => profile, send, onError });
  const teleport = vi.fn<(id: string) => Promise<boolean>>(id => controller.request(id));
  const prompts: Array<{ prompt: NativePrompt; yes(): void; no(): void }> = [];
  const showPrompt = vi.fn((message: string, yes: () => void, no: () => void) => {
    const ui = context.UIManager as { showPromptBox(text: string, ok: string, cancel: string, yes: () => void, no: () => void): NativePrompt };
    const prompt = ui.showPromptBox(message, 'ok', 'cancel', yes, no);
    prompts.push({ prompt, yes, no }); return prompt;
  });
  const api = installLastroNpcMapLinks(component, {
    setHtml: setLastROInnerHTML, labelFor: id => options.label ?? (id === 'lhz_dun03' ? '生体试验研究所三层' : id),
    showPrompt, teleport, cancelPending: controller.cancelPending, onError,
    canActivate: () => ![menu, input].some(dialog => dialog.__active && dialog._host && dialog._host.style.display !== 'none'),
  });
  component.append();
  cleanups.push(() => { component.remove(); prompts.forEach(({ prompt }) => prompt.remove()); menu._unbindKeyDown(); input._unbindKeyDown(); frame.remove(); });
  const render = (text: string, gid = 101) => component.setText(text, gid);
  const link = () => {
    const link = component.getRoot().querySelector<HTMLAnchorElement>('a.lastro-npc-map-link');
    if (!link) throw new Error('Missing map location link'); return link;
  };
  const key = (value: string, options: KeyboardEventInit = {}, target: EventTarget = win) => {
    const event = new win.KeyboardEvent('keydown', { key: value, code: value === ' ' ? 'Space' : value, bubbles: true, composed: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  };
  const showDialog = (name: 'menu' | 'input') => {
    const dialog = name === 'menu' ? menu : input;
    doc.body.append(dialog._host); dialog.__active = true; dialog._host.style.display = ''; bindDialog.call(dialog);
  };
  const answer = async (yes = true, index = prompts.length - 1) => {
    const prompt = prompts[index]?.prompt;
    if (!prompt) throw new Error('Missing native confirmation');
    prompt._shadow.querySelector<HTMLButtonElement>(`[data-background="btn_${yes ? 'ok' : 'cancel'}.bmp"]`)!.click();
    await settle();
  };
  return { api, component, doc, win, render, link, key, sent, pending, preflight, teleport, send, onError, item, navigation,
    menu, input, showDialog, menuValidate, inputValidate, showPrompt, prompts, answer,
    setMap: (value: string) => { map = value; }, setProfile: (value: string) => { profile = value; } };
}
async function settle() { for (let index = 0; index < 10; index++) await Promise.resolve(); }

describe('native NPC map-location links', () => {
  it('renders the MVP screenshot marker as a localized map link without dropping the leading l', () => {
    const f = fixture(); f.render('(Lv.160) 暗•超魔导师 凯特莉娜 位于地图\n^nMapName^lhz_dun03');
    expect(f.component.getRoot().textContent).toContain('位于地图\n生体试验研究所三层');
    expect(f.component.getRoot().textContent).not.toContain('^nMapName^');
    expect(f.link().dataset.map).toBe('lhz_dun03'); expect(f.link().title).toContain('lhz_dun03');
    expect(f.teleport).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
  });

  it('supports multiple line-tail map markers and canonical resource suffixes', () => {
    const f = fixture(); f.render('地点：^nMapName^LHZ_DUN03.GAT\r\n地点：^nMapName^payon');
    expect([...f.component.getRoot().querySelectorAll<HTMLAnchorElement>('a.lastro-npc-map-link')].map(link => link.dataset.map)).toEqual(['lhz_dun03', 'payon']);
  });

  it.each(['', '../lhz_dun03', 'lhz/dun03', 'lhz_dun03 更多文字', 'a'.repeat(17), 'lhz_dun03^000000'])('does not invent a destination for malformed map payload %j', payload => {
    const f = fixture(); f.render('地点：^nMapName^' + payload);
    expect(f.component.getRoot().querySelector('a.lastro-npc-map-link')).toBeNull(); expect(f.teleport).not.toHaveBeenCalled();
  });

  it('creates literal DOM labels rather than interpreting localized map-name markup', () => {
    const label = '研究所 <img src=x onerror="bad"> & 三层';
    const f = fixture({ label }); f.render('^nMapName^lhz_dun03');
    expect(f.link().textContent).toBe(label); expect(f.link().querySelector('img')).toBeNull();
    expect(f.link().getAttribute('href')).toBe('#');
  });

  it('requires native confirmation before checking resources and sending one type-0 map warp', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03');
    const request = f.api.request(f.link());
    expect(f.showPrompt).toHaveBeenCalledOnce();
    expect(f.prompts[0]!.prompt._shadow.querySelector('.text')!.textContent).toContain('生体试验研究所三层');
    expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.teleport).not.toHaveBeenCalled();
    const earlySend = vi.fn();
    expect(() => f.api.commit('lhz_dun03', earlySend)).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(earlySend).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
    await f.answer();
    expect(f.prompts[0]!.prompt._host.isConnected).toBe(false);
    expect(f.preflight.check).toHaveBeenCalledExactlyOnceWith({ outset: ['lhz_dun03', 0, 0] });
    expect(f.sent).toEqual([]); expect(f.link().getAttribute('aria-busy')).toBe('true');
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(true);
    expect(f.sent).toEqual([{ kind: 'close', NAID: 101 }, { mapname: 'lhz_dun03', x: 0, y: 0, type: 0, itemid: 14527 }]);
    expect(f.component.__active).toBe(false); expect(f.component.ownerID).toBe(0);
  });

  it('opens one confirmation without advancing the NPC and blocks repeated clicks through preflight', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101);
    f.link().click(); f.link().click();
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.teleport).not.toHaveBeenCalled();
    await f.answer(); f.link().click();
    expect(f.teleport).toHaveBeenCalledExactlyOnceWith('lhz_dun03'); expect(f.sent).toEqual([]);
    expect(f.showPrompt).toHaveBeenCalledOnce();
    f.pending[0]!.resolve({ approved: true }); await settle();
    expect(f.sent).toHaveLength(2); expect(f.sent.some(packet => packet.kind === 'next')).toBe(false);
  });

  it.each(['menu', 'input'] as const)('allows the screenshot mouse link while native %s remains open', async name => {
    const f = fixture(); f.render('巴风特已死亡，预计 15:24 复活\n(Lv.160) 凯特莉娜 位于地图\n^nMapName^lhz_dun03');
    f.showDialog(name); f.link().click();
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.preflight.check).not.toHaveBeenCalled();
    expect(f.component.getRoot().textContent).toContain('巴风特已死亡');
    expect((name === 'menu' ? f.menu : f.input).__active).toBe(true);
    await f.answer(); f.pending[0]!.resolve({ approved: true }); await settle();
    expect(f.sent).toEqual([{ kind: 'close', NAID: 101 }, { mapname: 'lhz_dun03', x: 0, y: 0, type: 0, itemid: 14527 }]);
    expect(f.menuValidate).not.toHaveBeenCalled(); expect(f.inputValidate).not.toHaveBeenCalled();
  });

  it.each(['cancel-button', 'external-remove'])('cancels before preflight on %s and ignores its late callback after retry', async how => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const link = f.link();
    const first = f.api.request(link), old = f.prompts[0]!;
    if (how === 'cancel-button') await f.answer(false); else { old.prompt.remove(); await settle(); }
    expect(await first).toBe(false); expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
    expect(link.hasAttribute('aria-busy')).toBe(false); expect(f.component.__active).toBe(true);
    const retry = f.api.request(link); old.yes(); old.no(); await settle();
    expect(f.showPrompt).toHaveBeenCalledTimes(2); expect(f.preflight.check).not.toHaveBeenCalled();
    await f.answer(); f.prompts[1]!.yes(); await settle();
    expect(f.preflight.check).toHaveBeenCalledTimes(1);
    f.pending[0]!.resolve({ approved: true }); expect(await retry).toBe(true);
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('rejects stale or repeated commit callbacks without closing a new NPC or sending another warp', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const result = f.api.request(f.link());
    await f.answer(); f.component.setText('新的 NPC', 202);
    const send = vi.fn();
    expect(() => f.api.commit('lhz_dun03', send)).toThrow(expect.objectContaining({ name: 'AbortError' }));
    f.pending[0]!.resolve({ approved: true }); expect(await result).toBe(false);
    expect(send).not.toHaveBeenCalled(); expect(f.sent).toEqual([]); expect(f.component.ownerID).toBe(202);
    f.render('^nMapName^lhz_dun03', 202);
    const newLink = [...f.component.getRoot().querySelectorAll('a.lastro-npc-map-link')].at(-1)!;
    const retry = f.api.request(newLink);
    await f.answer(); f.pending[1]!.resolve({ approved: true }); expect(await retry).toBe(true);
    expect(() => f.api.commit('lhz_dun03', send)).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(send).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(2);
  });

  it.each(['next', 'remove', 'setText'] as const)('closes the confirmation when native %s invalidates its NPC', async action => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const result = f.api.request(f.link()), old = f.prompts[0]!;
    if (action === 'setText') f.component.setText('另一位 NPC', 202); else f.component[action]();
    const nativeOperations = [...f.sent]; old.yes(); await settle();
    expect(await result).toBe(false); expect(old.prompt._host.isConnected).toBe(false);
    expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual(nativeOperations);
  });

  it('confirms with scoped native Enter without advancing the underlying NPC, then removes that key binding', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101);
    const result = f.api.request(f.link()), prompt = f.prompts[0]!.prompt;
    expect(prompt.captureKeyEvents).toBe(true);
    expect(f.key('Enter').defaultPrevented).toBe(true); await settle();
    expect(prompt._host.isConnected).toBe(false); expect(f.preflight.check).toHaveBeenCalledTimes(1); expect(f.sent).toEqual([]);
    f.pending[0]!.resolve({ approved: false }); expect(await result).toBe(false);
    f.key('Enter'); expect(f.sent).toEqual([{ kind: 'next', NAID: 101 }]);
  });

  it('cancels with scoped Escape without closing the underlying NPC', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addClose(101);
    const result = f.api.request(f.link());
    expect(f.key('Escape').defaultPrevented).toBe(true); expect(await result).toBe(false);
    expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual([]); expect(f.component.__active).toBe(true);
  });

  it.each(['Enter', ' '])('uses the native cancel button when it is focused and receives %j', async key => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101);
    const result = f.api.request(f.link());
    f.prompts[0]!.prompt._shadow.querySelector<HTMLButtonElement>('[data-background="btn_cancel.bmp"]')!.focus();
    expect(f.key(key).defaultPrevented).toBe(true); expect(await result).toBe(false);
    expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual([]); expect(f.component.__active).toBe(true);
  });

  it('consumes Space without confirming when no native prompt button has focus', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101);
    const result = f.api.request(f.link());
    expect(f.key(' ').defaultPrevented).toBe(true); await settle();
    expect(f.prompts[0]!.prompt._host.isConnected).toBe(true); expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
    await f.answer(false); expect(await result).toBe(false);
  });

  it.each([{ repeat: true }, { isComposing: true }, { keyCode: 229 }])('consumes repeated/IME Enter before native NPC handlers: %j', async options => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101);
    const result = f.api.request(f.link());
    expect(f.key('Enter', options).defaultPrevented).toBe(true); await settle();
    expect(f.prompts[0]!.prompt._host.isConnected).toBe(true); expect(f.preflight.check).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
    await f.answer(false); expect(await result).toBe(false);
  });

  it('retains the board and permits retry after failed resource approval', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const link = f.link();
    const failed = f.api.request(link); await f.answer(); f.pending[0]!.resolve({ approved: false });
    expect(await failed).toBe(false); expect(f.sent).toEqual([]); expect(f.component.__active).toBe(true);
    expect(f.link()).toBe(link); expect(link.hasAttribute('aria-busy')).toBe(false);
    const retry = f.api.request(link); await f.answer(); f.pending[1]!.resolve({ approved: true }); expect(await retry).toBe(true);
    expect(f.send).toHaveBeenCalledExactlyOnceWith('lhz_dun03');
  });

  it('shows a failed-load error once without closing or sending a game operation', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const request = f.api.request(f.link());
    await f.answer();
    const error = new Error('无法读取地图资源：data/lhz_dun03.gnd'); f.pending[0]!.reject(error);
    expect(await request).toBe(false); expect(f.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(f.sent).toEqual([]); expect(f.component.__active).toBe(true);
  });

  it.each(['setText', 'addNext', 'addClose'] as const)('cancels a pending jump when native %s changes the NPC owner', async name => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const request = f.api.request(f.link());
    await f.answer();
    if (name === 'setText') f.component.setText('新的 NPC', 202); else f.component[name](202);
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(false);
    expect(f.sent).toEqual([]); expect(f.onError).not.toHaveBeenCalled(); expect(f.component.ownerID).toBe(202);
  });

  it('preserves pending link validity when the same NPC adds its native next button', async () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const request = f.api.request(f.link()); await f.answer(); f.component.addNext(101);
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(true); expect(f.send).toHaveBeenCalledTimes(1);
  });

  it.each(['next', 'close', 'remove'] as const)('prevents stale teleport and duplicate close after native %s', async action => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const request = f.api.request(f.link());
    await f.answer();
    f.component[action](); const nativeOperations = [...f.sent];
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(false);
    expect(f.send).not.toHaveBeenCalled(); expect(f.sent).toEqual(nativeOperations); expect(f.onError).not.toHaveBeenCalled();
  });

  it.each(['detach-link', 'hide-host', 'change-map-attribute'])('rechecks DOM provenance at send time after %s', async action => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const link = f.link(), request = f.api.request(link);
    await f.answer();
    if (action === 'detach-link') link.remove();
    else if (action === 'hide-host') f.component._host.style.display = 'none';
    else link.dataset.map = 'payon';
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(false);
    expect(f.sent).toEqual([]); expect(f.onError).not.toHaveBeenCalled();
  });

  it('does not authorize raw or forged server HTML as a teleport link', async () => {
    const f = fixture(); f.render('<a class="lastro-npc-map-link" data-map="payon">假链接</a>');
    expect(f.component.getRoot().querySelector('a.lastro-npc-map-link')).toBeNull();
    const forged = f.doc.createElement('a'); forged.className = 'lastro-npc-map-link'; forged.dataset.map = 'payon';
    f.component.getRoot().querySelector('.content')!.append(forged);
    expect(await f.api.request(forged)).toBe(false); forged.click(); expect(f.teleport).not.toHaveBeenCalled();
  });

  it('retains native ITEM/NAVI click actions and color formatting', () => {
    const f = fixture(); f.render('^FF0000红字^000000\n<ITEM>红色药水<INFO>501</INFO></ITEM>\n<NAVI>普隆德拉<INFO>prontera,100,100,0,101</INFO></NAVI>');
    const root = f.component.getRoot();
    expect(root.querySelector('[style*="color"]')).not.toBeNull();
    root.querySelector<HTMLElement>('.item-link')!.click();
    expect(f.item.append).toHaveBeenCalledTimes(1); expect(f.item.setItem).toHaveBeenCalledExactlyOnceWith({ ITID: 501, IsIdentified: true });
    root.querySelector<HTMLElement>('.navi-link')!.click();
    expect(f.navigation.show).toHaveBeenCalledTimes(1);
    expect(f.navigation.setNaviInfo).toHaveBeenCalledExactlyOnceWith('prontera,100,100,0,101', '普隆德拉');
    expect(f.teleport).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
  });

  it('preserves ordinary modern Enter advancement and native page cleanup', () => {
    const f = fixture(); f.render('第一步'); f.component.addNext(101);
    f.key('Enter'); f.key('Enter');
    expect(f.sent).toEqual([{ kind: 'next', NAID: 101 }]);
    f.render('第二步'); expect(f.component.getRoot().querySelector('.content')!.textContent).toBe('第二步');
    f.component.addClose(101); f.key('Enter'); expect(f.sent.at(-1)).toEqual({ kind: 'close', NAID: 101 });
    expect(f.teleport).not.toHaveBeenCalled();
  });

  it('does not let a focused map link hijack the native close-button click', () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addClose(101); f.link().focus();
    f.component.getRoot().querySelector<HTMLElement>('.close')!.click();
    expect(f.sent).toEqual([{ kind: 'close', NAID: 101 }]); expect(f.teleport).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('activates a focused map with %j without also sending NPC next', async value => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101); f.link().focus();
    const event = f.key(value, {}, f.link()); expect(event.defaultPrevented).toBe(true);
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.teleport).not.toHaveBeenCalled();
    await f.answer();
    expect(f.teleport).toHaveBeenCalledTimes(1); expect(f.sent).toEqual([]);
    f.pending[0]!.resolve({ approved: true }); await settle(); expect(f.sent.some(packet => packet.kind === 'next')).toBe(false);
  });

  it.each([
    { repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true },
  ])('does not turn repeated/composing/modified focused-link Enter into a jump: %j', options => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.link().focus();
    f.key('Enter', options, f.link()); f.key('Enter', options);
    expect(f.teleport).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
  });

  it('rejects an IME legacy key code even when modern key says Enter', () => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.link().focus();
    const event = new f.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true });
    Object.defineProperty(event, 'which', { value: 229 }); f.link().dispatchEvent(event);
    expect(f.teleport).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
  });

  it.each((['menu', 'input'] as const).flatMap(name => ['Enter', ' '].map(key => [name, key] as const)))('lets native %s handle %j while a map link retains DOM focus', (name, key) => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); f.component.addNext(101); f.link().focus(); f.showDialog(name);
    expect(f.component.getRoot().activeElement).toBe(f.link());
    f.key(key, {}, f.link()); f.key(key);
    expect(f.teleport).not.toHaveBeenCalled(); expect(f.sent).toEqual([]);
    if (name === 'menu') expect(f.menuValidate).toHaveBeenCalledTimes(2);
    else expect(f.inputValidate).toHaveBeenCalledTimes(key === 'Enter' ? 2 : 0);
  });

  it.each(['menu', 'input'] as const)('retains mouse authorization when %s opens during a resource check', async name => {
    const f = fixture(); f.render('^nMapName^lhz_dun03'); const link = f.link(), request = f.api.request(link);
    await f.answer(); f.showDialog(name); expect(f.api.canSend('lhz_dun03')).toBe(true);
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe(true);
    expect(f.send).toHaveBeenCalledExactlyOnceWith('lhz_dun03'); expect(f.component.__active).toBe(false); expect(link.hasAttribute('aria-busy')).toBe(false);
    expect(f.onError).not.toHaveBeenCalled();
  });
});

describe('NPC runtime patch anchors', () => {
  it('patches the real native factory while retaining its item/navigation/next handlers and map-level builder', () => {
    const output = patchRuntimeNpcMapLinks(npcRegion + '\n//#endregion', '() => Promise.reject(new Error("offline"))');
    expect(output).toContain('NpcBox._lastroMapLinks.render(div, text, processText)');
    expect(output).toContain('buildPrivateAirshipRequest({ mapname })');
    expect(output).toContain('DB.getMapName(mapname + ".gat", mapname)');
    expect(output).toContain('NpcBox._lastroMapLinks.commit(mapname');
    expect(output).toContain('Navigation_default.setNaviInfo(naviInfo, displayName)');
    expect(output).toContain('this.onNextPressed(NpcBox.ownerID)');
    expect(output).not.toContain(slot);
  });
  it('leaves a fixture without the NPC region unchanged', () => { expect(patchRuntimeNpcMapLinks('const other = 1;', '() => {}')).toBe('const other = 1;'); });
  it.each(['missing-slot', 'duplicate-region', 'missing-end'])('rejects present but drifted native anchors: %s', drift => {
    const input = drift === 'missing-slot' ? (npcRegion + '\n//#endregion').replace(slot, 'div.textContent = text;')
      : drift === 'duplicate-region' ? npcRegion + '\n//#endregion\n' + npcRegion + '\n//#endregion' : npcRegion;
    expect(() => patchRuntimeNpcMapLinks(input, '() => {}')).toThrow(/anchor:npc-map-links/);
  });
});
