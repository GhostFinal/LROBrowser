// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeAchievementLinks, type AchievementLinkComponent, type AchievementLinksApi } from '../scripts/lastro-achievement-links.mjs';
import { resolveLastroMapResourceName } from '../scripts/lastro-map-resource-name.mjs';
import { describeLastroMapLoadFailure } from '../scripts/lastro-map-load-diagnostic.mjs';
import { mapBinaryFixture } from './map-binary-fixture';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const lua = new TextDecoder('gbk').decode(readFileSync('vendor/core/System/achievement_list_cn2_06.lua'));
function region(source: string, name: string) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + name);
  return source.slice(start, end) + '\n//#endregion';
}
function nodeText(source: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean) {
  const file = ts.createSourceFile('achievement-fixture.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches: string[] = [];
  const visit = (node: ts.Node) => { if (predicate(node, file)) matches.push(node.getText(file)); ts.forEachChild(node, visit); };
  visit(file); if (matches.length !== 1) throw new Error('Missing/ambiguous native fixture');
  return matches[0]!;
}
const achievementRegion = region(native, 'src/UI/Components/Achievement/Achievement.js');
const guiRegion = region(native, 'src/UI/GUIComponent.js');
const guiMethod = (name: string) => nodeText(guiRegion, (node, file) => ts.isMethodDeclaration(node)
  && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) && node.name.getText(file) === name);
const uiRegion = region(native, 'src/UI/UIManager.js');
const showPromptBox = nodeText(uiRegion, (node, file) => ts.isMethodDeclaration(node) && node.name.getText(file) === 'showPromptBox');
const promptHelpers = ['_createButton', '_popupPosition'].map(name => nodeText(uiRegion, node => ts.isFunctionDeclaration(node) && node.name?.text === name)).join('\n');
const patcherSource = readFileSync('scripts/patch-v2-runtime.mjs', 'utf8');
const loaderDeclaration = nodeText(patcherSource, node => ts.isFunctionDeclaration(node) && node.name?.text === 'teleportResourceLoaderCode');
const resourceLoaderCode = vm.runInNewContext(`(${loaderDeclaration})()`, { resolveLastroMapResourceName }) as string;
const migration = readFileSync('vendor/v2/lastro-v1-migration.mjs', 'utf8');
const requestBuilder = nodeText(migration, node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildPrivateAirshipRequest').replace(/^export\s+/, '');
const buildPrivateAirshipRequest = vm.runInNewContext(`(${requestBuilder})`) as (value: { mapname: string }) => Record<string, unknown>;
const patched = patchRuntimeAchievementLinks(achievementRegion, resourceLoaderCode);
const cleanups: Array<() => void> = [];

interface NativeAchievement extends AchievementLinkComponent {
  _host: HTMLElement;
  getRoot(): ShadowRoot;
  currentMajor: number; currentMinor: number;
  append(): void; remove(): void; toggle(): void;
  updateHeaderAndView(): void; renderDetail(): void; renderList(): void; renderOverview(): void;
  _lastroAchievementLinks: AchievementLinksApi;
}
interface NativePrompt {
  _host: HTMLElement; _shadow: ShadowRoot; captureKeyEvents?: boolean;
  getRoot(): ShadowRoot; remove(): void; onRemove?(): void;
}
interface AchievementRecord {
  title: string; group: string; major: number; minor: number;
  content: { summary: string; details: string };
  resource: Record<number, { text: string }>;
  reward: Record<string, number>; score: number;
}
function luaRecord(id: number, major: number, minor: number): AchievementRecord {
  const start = lua.indexOf(`[${id}] = {UI_Type`), next = lua.slice(start + 1).search(/\n\[\d+\] = \{UI_Type/);
  if (start < 0 || next < 0) throw new Error('Missing packaged achievement: ' + id);
  const chunk = lua.slice(start, start + 1 + next);
  const field = (name: string) => {
    const match = new RegExp(`\\b${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")`).exec(chunk);
    if (!match) throw new Error('Missing packaged achievement field: ' + name);
    return JSON.parse(match[1]!) as string;
  };
  return { title: field('title'), group: field('group'), major, minor,
    content: { summary: field('summary'), details: field('details') },
    resource: { 1: { text: field('text') } }, reward: {}, score: 5 };
}
function resources() {
  const rsw = mapBinaryFixture('rsw');
  new Uint8Array(rsw).set(new TextEncoder().encode('terrain.gnd'), 51);
  new Uint8Array(rsw).set(new TextEncoder().encode('collision.gat'), 91);
  const gnd = mapBinaryFixture('gnd'); new DataView(gnd).setFloat32(14, 10, true);
  const gat = new ArrayBuffer(94); new Uint8Array(gat).set([71, 82, 65, 84, 1, 2]);
  new DataView(gat).setUint32(6, 2, true); new DataView(gat).setUint32(10, 2, true);
  return { 'data/ra_fild05.rsw': rsw, 'data/terrain.gnd': gnd, 'data/collision.gat': gat } as Record<string, ArrayBuffer | null>;
}
function fixture(options: { files?: Record<string, ArrayBuffer | null>; label?: string } = {}) {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const records: Record<number, AchievementRecord> = { 120083: luaRecord(120083, 2, 2), 140001: luaRecord(140001, 3, 1) };
  const packets: Array<Record<string, unknown>> = [], reads: string[] = [], delayed: Array<() => void> = [];
  const files = options.files ?? resources(), popup = vi.fn(), notice = vi.fn(), monster = vi.fn<(target: { name: string }) => Promise<boolean>>(async () => true);
  const prompts: Array<{ prompt: NativePrompt; yes(): void; no(): void }> = [];
  const mouse = { intersect: false }, session = { FreezeUI: true, Achievement: { list: {}, rank: 0, total_points: 0 } };
  const state = { currentMap: 'izlude.gat', loading: false };
  const preference = { x: 100, y: 100, save: vi.fn() };
  let manual = false, profile = 5;
  const context = vm.createContext({ window: win, document: doc, Event: win.Event, console: { warn() {}, error() {} },
    ArrayBuffer, DataView, Uint8Array, queueMicrotask, setTimeout, clearTimeout, Mouse: mouse, MouseMode: { FREEZE: 2 }, SessionStorage_default: session,
    MapRenderer: state, Configs: { get: () => profile },
    normalizeLastROTeleportMap: (map: string) => map.trim().toLowerCase().replace(/\.(gat|rsw)$/i, ''),
    DB: { mapalias: {}, getAchievementTable: () => records, getMessage: (id: number) => '消息' + id,
      getMapName: () => options.label ?? '拉赫草原5' },
    Preferences: { get: () => preference }, Client: { loadFile: vi.fn() }, ItemInfo_default: {},
    WorldMap_default: { searchMonster: monster }, showLastroTeleportNotice: notice, describeLastroMapLoadFailure,
    Network: { sendPacket: (packet: Record<string, unknown>) => packets.push({ ...packet }) }, buildPrivateAirshipRequest,
    PACKET: { CZ: { PRIVATE_AIRSHIP_REQUEST: class {}, REQ_ACH_REWARD: class {} } },
    Thread: { send: (type: string, input: { filename: string; args: null }, callback: (bytes: ArrayBuffer | null, error?: string) => void) => {
      expect(type).toBe('GET_FILE'); expect(input.args).toBeNull(); reads.push(input.filename);
      const complete = () => callback(files[input.filename] ?? null, files[input.filename] ? undefined : 'http-404');
      if (manual) delayed.push(complete); else queueMicrotask(complete);
    } },
    __esmMin: (initialize: () => void) => { let done = false; return () => { if (!done) { done = true; initialize(); } }; },
  });
  for (const match of patched.matchAll(/\b(init_[\w$]+)\(\);/g)) context[match[1]!] = () => {};
  vm.runInContext(`
    class GUIComponent {
      static processDataAttrs() {}
      constructor(name, css) {
        this.name = name; this.__active = false; this.__loaded = false;
        this._host = document.createElement('div'); this._host.id = name; this._shadow = this._host.attachShadow({mode:'open'});
        this.css = css;
      }
      prepare() {
        this.__loaded = true;
        const style = document.createElement('style'); style.textContent = this.css || ''; this._shadow.append(style);
        const container = document.createElement('div'); container.className = 'ui-component-root'; container.innerHTML = this.render(); this._shadow.append(container);
        document.body.append(this._host); this.init?.(); this._host.remove();
      }
      getRoot() { if (!this.__loaded) this.prepare(); return this._shadow; }
      draggable() {} _setupScrollbars() {} _fixPositionOverflow() {} focus() {}
      ${guiMethod('append')}
      ${guiMethod('remove')}
      ${guiMethod('_bindKeyDown')}
      ${guiMethod('_unbindKeyDown')}
    }
    const _Cursor = null;
    ${region(native, 'src/UI/Components/Achievement/Achievement.html?raw')}
    ${region(native, 'src/UI/Components/Achievement/Achievement.css?raw')}
    ${region(native, 'src/UI/Components/WinPopup/WinPopup.html?raw')}
    init_WinPopup$2();
    ${promptHelpers}
    class UIManager {
      static components = {};
      static addComponent(component) { this.components[component.name] = component; return component; }
      static getComponent() { return {clone(name) {
        const prompt = new GUIComponent(name, ''); prompt.mouseMode = MouseMode.FREEZE;
        prompt.render = () => WinPopup_default$2; return prompt;
      }}; }
      ${showPromptBox}
    }
    const NpcBox_default = {__active:false}, NpcMenu_default = {__active:false}, InputBox_default = {__active:false};
    ${patched}
    init_Achievement$1();
  `, context);
  const ui = vm.runInContext('UIManager', context) as { showPromptBox(message: string, ok: string, cancel: string, yes: () => void, no: () => void): NativePrompt; showErrorBox?: unknown };
  ui.showErrorBox = popup;
  const nativeShowPrompt = ui.showPromptBox.bind(ui);
  const showPrompt = vi.spyOn(ui, 'showPromptBox').mockImplementation((message, ok, cancel, yes, no) => {
    const prompt = nativeShowPrompt(message, ok, cancel, yes, no); prompts.push({ prompt, yes, no }); return prompt;
  });
  const component = context.Achievement as NativeAchievement;
  component.toggle(); component.currentMajor = 2; component.currentMinor = -1; component.selectedAchId = 120083; component.renderList();
  const root = component.getRoot(), api = component._lastroAchievementLinks;
  const mapLink = () => { const link = root.querySelector<HTMLAnchorElement>('.js-d-desc a[data-kind="map"]'); if (!link) throw new Error('Missing native achievement map link'); return link; };
  const fragment = (value: unknown) => { const parent = doc.createElement('div'); root.append(parent); api.render(parent, value); return parent; };
  const answer = async (yes = true, index = prompts.length - 1) => {
    const prompt = prompts[index]?.prompt; if (!prompt) throw new Error('Missing native confirmation');
    prompt.getRoot().querySelector<HTMLButtonElement>(`[data-background="btn_${yes ? 'ok' : 'cancel'}.bmp"]`)!.click(); await settle();
  };
  const flush = async () => { for (let index = 0; index < 5; index++) { await settle(); delayed.shift()?.(); } await settle(); };
  const key = (key: string, options: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...options });
    win.dispatchEvent(event); return event;
  };
  cleanups.push(() => { api.invalidate(); prompts.forEach(({ prompt }) => prompt.remove()); component.remove(); frame.remove(); });
  return { component, root, api, records, fragment, mapLink, packets, reads, popup, notice, monster, prompts, showPrompt, answer,
    mouse, session, state, preference, flush, key, manual: () => { manual = true; }, setProfile: () => { profile++; } };
}
async function settle() { for (let index = 0; index < 16; index++) await Promise.resolve(); }
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('achievement description whitelist', () => {
  it('renders every packaged GBK goto/smob/sitem marker as a safe map/monster link or plain item name', () => {
    const f = fixture(), spans = [...lua.matchAll(/<span\b[^>]*>[^<]*<\/span>/gi)].map(match => match[0]);
    expect(spans).toHaveLength(651);
    const parent = f.fragment(spans.join('\n'));
    expect(parent.querySelectorAll('a[data-kind="map"]')).toHaveLength(142);
    expect(parent.querySelectorAll('a[data-kind="monster"]')).toHaveLength(485);
    expect(parent.textContent).toContain('青苹果'); expect(parent.textContent).not.toContain('<span');
    expect(parent.querySelector('span,img,script')).toBeNull(); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
  });
  it('preserves adjacent text, color/line-break formatting and plain sitem text', () => {
    const f = fixture(), parent = f.fragment(["^FF0000前往<span class='goto'>RA_FILD05.GAT</span>^000000<br>猎杀<span class=\"smob\">蝎子</span>", "捕捉<span class='sitem'>青苹果</span> &amp; 伙伴"]);
    expect(parent.textContent).toBe('前往RA_FILD05.GAT\n猎杀蝎子\n捕捉青苹果 & 伙伴');
    expect([...parent.querySelectorAll('a')].map(link => [link.dataset.kind, link.dataset.target])).toEqual([['map', 'ra_fild05'], ['monster', '蝎子']]);
    expect(parent.querySelector('[data-kind="item"]')).toBeNull();
  });
  it('normalizes only resource suffixes and preserves permitted instance-name characters as part of the map target', () => {
    const f = fixture(), parent = f.fragment("<SPAN CLASS = \"goto\"> RA_FILD05.RSW </SPAN> <span class='goto'>1@abc#-</span>");
    expect([...parent.querySelectorAll<HTMLAnchorElement>('a')].map(link => link.dataset.target)).toEqual(['ra_fild05', '1@abc#-']);
    expect(f.packets).toEqual([]);
  });
  it.each(['', '../ra_fild05', 'ra/fild05', 'ra_fild05,1,2', 'a'.repeat(17), '地图', 'ra_fild05 多余文字'])('does not invent a destination from invalid goto %j', payload => {
    const f = fixture(), parent = f.fragment(`<span class='goto'>${payload}</span>`);
    expect(parent.querySelector('a')).toBeNull(); expect(f.showPrompt).not.toHaveBeenCalled(); expect(f.reads).toEqual([]);
  });
  it.each(["<span class='goto' onclick='bad()'>ra_fild05</span>", "<span class='goto' class='smob'>ra_fild05</span>", "<span class='goto'><b>ra_fild05</b></span>", "&lt;span class='goto'&gt;ra_fild05&lt;/span&gt;"] )('does not activate non-whitelisted or encoded markup: %s', value => {
    const f = fixture(), parent = f.fragment(value);
    expect(parent.querySelector('a,[onclick],b')).toBeNull(); expect(f.packets).toEqual([]);
  });
  it('never interprets executable-looking text adjacent to a trusted link or within its localized map label', () => {
    const f = fixture({ label: '<img src=x onerror=bad()> & 草原' });
    const parent = f.fragment("<script>bad()</script><img src=x onerror=bad()> <span class='goto'>ra_fild05</span>");
    expect(parent.querySelector('img,script,[onerror]')).toBeNull(); expect(parent.textContent).toContain('<script>bad()</script>');
    expect(parent.querySelector('a')!.textContent).toBe('ra_fild05');
    expect(parent.querySelector('a')!.title).toContain('<img src=x onerror=bad()> & 草原');
  });
  it('rejects forged, copied or tampered links rather than trusting their dataset', async () => {
    const f = fixture(), link = f.mapLink(), forged = link.cloneNode(true) as HTMLAnchorElement; f.root.append(forged);
    expect(await f.api.request(forged)).toBe(false); link.dataset.target = 'prontera'; expect(await f.api.request(link)).toBe(false);
    expect(f.showPrompt).not.toHaveBeenCalled(); expect(f.packets).toEqual([]);
  });
});

describe('actual native Achievement render and lifecycle', () => {
  it('renders the screenshot records through native renderList/renderDetail, and searches the monster by name only', async () => {
    const f = fixture();
    expect(f.root.querySelector('.js-d-title')!.textContent).toBe(f.records[120083]!.title);
    expect(f.root.querySelector('.js-d-desc')!.textContent).toContain('区域5(ra_fild05)');
    f.component.currentMajor = 3; f.component.selectedAchId = null; f.component.renderList();
    const link = f.root.querySelector<HTMLAnchorElement>('.d-goal-item a')!;
    expect(link.textContent).toBe('蝎子'); expect(f.root.querySelector('.d-goal-item')!.textContent).toBe('消灭蝎子 10次');
    expect(await f.api.request(link)).toBe(true); expect(f.monster).toHaveBeenCalledExactlyOnceWith({ name: '蝎子' });
    expect(f.showPrompt).not.toHaveBeenCalled(); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
  });
  it('confirms before actual map-resource preflight and sends one type-0 packet without closing the achievement', async () => {
    const f = fixture(), request = f.api.request(f.mapLink());
    expect(f.showPrompt).toHaveBeenCalledWith(expect.stringContaining('拉赫草原5'), 'ok', 'cancel', expect.any(Function), expect.any(Function));
    expect(f.api.canSend('ra_fild05')).toBe(false); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
    await f.answer(); expect(await request).toBe(true);
    expect(f.reads).toEqual(['data/ra_fild05.rsw', 'data/terrain.gnd', 'data/collision.gat']);
    expect(f.packets).toEqual([{ mapname: 'ra_fild05', type: 0, x: 0, y: 0, itemid: 14527 }]);
    expect(f.component.__active).toBe(true); expect(f.component._host.isConnected).toBe(true); expect(f.component._host.style.display).not.toBe('none');
  });
  it.each(['cancel', 'external-remove'])('keeps the achievement open after %s and ignores the old approval callback after retry', async how => {
    const f = fixture(), first = f.api.request(f.mapLink()), old = f.prompts[0]!;
    if (how === 'cancel') await f.answer(false); else { old.prompt.remove(); await settle(); }
    expect(await first).toBe(false); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
    const second = f.api.request(f.mapLink()); old.yes(); await settle(); expect(f.reads).toEqual([]);
    await f.answer(); expect(await second).toBe(true); expect(f.packets).toHaveLength(1);
  });
  it('coalesces repeated clicks throughout confirmation and resource approval', async () => {
    const f = fixture(); f.manual(); const link = f.mapLink(); link.click(); link.click();
    expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.reads).toEqual([]);
    await f.answer(); link.click(); expect(f.showPrompt).toHaveBeenCalledOnce();
    await f.flush(); expect(f.packets).toHaveLength(1); expect(link.hasAttribute('aria-busy')).toBe(false);
  });
  it('confirms through native prompt Enter without hiding or removing the underlying achievement', async () => {
    const f = fixture(), request = f.api.request(f.mapLink());
    expect(f.prompts[0]!.prompt.captureKeyEvents).toBe(true); expect(f.key('Enter').defaultPrevented).toBe(true);
    expect(await request).toBe(true); expect(f.packets).toHaveLength(1); expect(f.component._host.style.display).not.toBe('none');
    expect(f.prompts[0]!.prompt._host.isConnected).toBe(false); expect(f.mouse.intersect).toBe(false); expect(f.session.FreezeUI).toBe(true);
  });
  it.each(['Enter', ' '])('activates the focused native cancel button using %j', async key => {
    const f = fixture(), request = f.api.request(f.mapLink());
    f.prompts[0]!.prompt.getRoot().querySelector<HTMLButtonElement>('[data-background="btn_cancel.bmp"]')!.focus();
    expect(f.key(key).defaultPrevented).toBe(true); expect(await request).toBe(false);
    expect(f.packets).toEqual([]); expect(f.reads).toEqual([]); expect(f.component._host.style.display).not.toBe('none');
  });
  it('cancels through Escape and keeps an unfocused Space from approving a warp', async () => {
    const f = fixture(), request = f.api.request(f.mapLink());
    expect(f.key(' ').defaultPrevented).toBe(true); await settle(); expect(f.reads).toEqual([]);
    expect(f.prompts[0]!.prompt._host.isConnected).toBe(true);
    expect(f.key('Escape').defaultPrevented).toBe(true); expect(await request).toBe(false); expect(f.packets).toEqual([]);
  });
  it.each([{ repeat: true }, { isComposing: true }])('consumes repeat/IME prompt Enter without approval: %j', async options => {
    const f = fixture(), request = f.api.request(f.mapLink());
    expect(f.key('Enter', options).defaultPrevented).toBe(true); await settle(); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
    await f.answer(false); expect(await request).toBe(false);
  });
  it.each(['toggle', 'remove', 'renderDetail', 'renderList', 'renderOverview', 'sidebar-overview', 'filter', 'entry'])('invalidates a native confirmation when %s changes or hides its view', async change => {
    const f = fixture();
    if (change === 'entry') { f.records[120084] = { ...f.records[120083]!, title: '另一成就' }; f.component.renderList(); }
    const request = f.api.request(f.mapLink()), old = f.prompts[0]!;
    if (change === 'sidebar-overview') f.root.querySelector<HTMLElement>('.major-tab')!.click();
    else if (change === 'filter') f.root.querySelector<HTMLElement>('.radio')!.click();
    else if (change === 'entry') f.root.querySelectorAll<HTMLElement>('.ach-item')[1]!.click();
    else f.component[change as 'toggle' | 'remove' | 'renderDetail' | 'renderList' | 'renderOverview']();
    old.yes(); expect(await request).toBe(false); expect(old.prompt._host.isConnected).toBe(false);
    expect(f.reads).toEqual([]); expect(f.packets).toEqual([]); expect(f.api.canSend('ra_fild05')).toBe(false);
  });
  it('retains unmodified summary links when only the detail generation changes', async () => {
    const f = fixture(); f.records[120083]!.content.summary = "记录<span class='goto'>ra_fild05</span>";
    f.component.renderList(); const summary = f.root.querySelector('.ach-item .desc')!; f.api.render(summary, f.records[120083]!.content.summary);
    const link = summary.querySelector('a')!; f.component.renderDetail();
    link.click(); expect(f.showPrompt).toHaveBeenCalledOnce(); expect(f.prompts[0]!.prompt._host.isConnected).toBe(true);
    await f.answer(false); expect(f.reads).toEqual([]); expect(f.packets).toEqual([]);
  });
  it('allows reopening after the native close button hides without onRemove', async () => {
    const f = fixture(), first = f.api.request(f.mapLink()); f.root.querySelector<HTMLElement>('.close')!.click();
    expect(await first).toBe(false); expect(f.component.__active).toBe(true); expect(f.component._host.style.display).toBe('none');
    f.component.toggle(); const retry = f.api.request(f.mapLink()); await f.answer(); expect(await retry).toBe(true);
    expect(f.packets).toHaveLength(1); expect(f.component._host.style.display).toBe('');
  });
  it.each(['desc-refresh', 'selection', 'hidden', 'removed-link', 'tampered-link', 'map', 'profile'])('rejects an approved late resource check after %s', async change => {
    const f = fixture(); f.manual(); const link = f.mapLink(), request = f.api.request(link); await f.answer();
    if (change === 'desc-refresh') f.component.renderDetail();
    if (change === 'selection') f.component.selectedAchId = 140001;
    if (change === 'hidden') f.component._host.style.display = 'none';
    if (change === 'removed-link') link.remove();
    if (change === 'tampered-link') link.dataset.target = 'prontera';
    if (change === 'map') f.state.currentMap = 'payon.gat';
    if (change === 'profile') f.setProfile();
    await f.flush(); expect(await request).toBe(false); expect(f.packets).toEqual([]); expect(f.api.canSend('ra_fild05')).toBe(false);
  });
  it.each(['scene', 'ground', 'collision', 'corrupt-ground'])('does not send or hide the achievement for failed %s resources', async kind => {
    const files = resources();
    if (kind === 'scene') files['data/ra_fild05.rsw'] = null;
    if (kind === 'ground') files['data/terrain.gnd'] = null;
    if (kind === 'collision') files['data/collision.gat'] = null;
    if (kind === 'corrupt-ground') files['data/terrain.gnd'] = new ArrayBuffer(100);
    const f = fixture({ files }), request = f.api.request(f.mapLink()); await f.answer(); expect(await request).toBe(false);
    expect(f.packets).toEqual([]); expect(f.popup).toHaveBeenCalledOnce(); expect(f.component._host.style.display).not.toBe('none');
  });
  it('treats the same-map goto as a map-only notice instead of navigating to invented 0,0 coordinates', async () => {
    const f = fixture(); f.state.currentMap = 'RA_FILD05.GAT'; const request = f.api.request(f.mapLink());
    await f.answer(); expect(await request).toBe(false); expect(f.notice).toHaveBeenCalledExactlyOnceWith('已在目标地图。');
    expect(f.reads).toEqual([]); expect(f.packets).toEqual([]); expect(f.component._host.style.display).not.toBe('none');
  });
});

describe('achievement patch anchors', () => {
  it('preserves native render and reward actions and serializes every resource/map helper dependency', () => {
    expect(patched).toContain('this._lastroAchievementLinks.render(g, res.text)');
    expect(patched).toContain('WorldMap_default.searchMonster({ name })');
    expect(patched).toContain('buildPrivateAirshipRequest({ mapname })');
    expect(patched).toContain('if (!Achievement._lastroAchievementLinks.canSend(mapname))');
    expect(patched).toContain('Network.sendPacket(pkt)'); expect(patched).not.toContain('CLOSE_DIALOG');
  });
  it('skips unrelated fixtures but rejects missing or duplicate native anchors and repeated patches', () => {
    expect(patchRuntimeAchievementLinks('const other = 1;', resourceLoaderCode)).toBe('const other = 1;');
    expect(() => patchRuntimeAchievementLinks(achievementRegion.replace('g.textContent = res.text;', 'g.textContent = "changed";'), resourceLoaderCode)).toThrow('anchor:achievement-links');
    expect(() => patchRuntimeAchievementLinks(achievementRegion + achievementRegion, resourceLoaderCode)).toThrow('anchor:achievement-links');
    expect(() => patchRuntimeAchievementLinks(patched, resourceLoaderCode)).toThrow('anchor:achievement-links');
  });
});
