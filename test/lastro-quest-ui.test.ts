// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL as NodeURL, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLastroQuestUI } from '../scripts/lastro-quest-ui.mjs';
import type { LastroQuestUI, NativeQuest, NativeQuestComponent, QuestRoute } from '../scripts/lastro-quest-ui.mjs';
import { patchRuntimeQuests, installLastroQuestBridge } from '../scripts/lastro-quest-runtime.mjs';
import { buildLastroQuestMetadata, createLastroQuestData } from '../scripts/lastro-quest-data.mjs';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
// Vite's jsdom module URL is HTTP; run the actual patch with its filesystem module
// location so its checked-in metadata read stays offline and is not mocked away.
const runtimeModule = readFileSync('scripts/lastro-quest-runtime.mjs', 'utf8');
const patchDeclaration = functionSource(runtimeModule, 'patchRuntimeQuests');
const patchFactory = runInNewContext('(' + patchDeclaration.declaration.getText(patchDeclaration.file).replace(/^export\s+/, '').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(resolve('scripts/lastro-quest-runtime.mjs')).href)) + ')', {
  ts, readFileSync, URL: NodeURL, buildLastroQuestMetadata, createLastroQuestData, installLastroQuestBridge, installLastroQuestUI,
  fail: () => { throw new Error('anchor:lastro-quests'); },
}) as typeof patchRuntimeQuests;
const patched = patchFactory(native);
function region(source: string, path: string) {
  const marker = '//#region src/UI/Components/Quest/' + path;
  const start = source.indexOf(marker), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native quest fixture: ' + path);
  return source.slice(start, end + '//#endregion'.length);
}
function ast(source: string) { return ts.createSourceFile('Quest.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
function template(path: string) {
  const file = ast(region(native, path)), literals: ts.StringLiteral[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) literals.push(node.right);
    ts.forEachChild(node, visit);
  }
  visit(file); if (literals.length !== 1) throw new Error('Changed native quest template'); return literals[0]!.text;
}
function functionSource(source: string, name: string) {
  const file = ast(source), declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration || !ts.isFunctionDeclaration(declaration)) throw new Error('Changed native quest factory');
  return { file, declaration };
}
const questFactory = (() => {
  const { file, declaration } = functionSource(region(patched, 'QuestCommon.js'), 'createQuest');
  // Retain the patched native update/cleanup methods. Install our factory with explicit
  // offline services instead of running the production network adapters in this fixture.
  const statements = declaration.body!.statements.filter(node => !node.getText(file).includes('lastroQuestData') && !node.getText(file).includes('function installLastroQuestBridge') && !node.getText(file).includes('function installLastroQuestUI'));
  const body = statements.map(node => ts.isReturnStatement(node)
    ? 'Quest.fixtureQuests = () => _questList; Quest.fixtureHidden = () => _questNotShowList;\n' + node.getText(file)
    : node.getText(file)).join('\n');
  return 'function createQuest(config) {\n' + body + '\n}';
})();
const helperFactory = (() => { const { file, declaration } = functionSource(region(native, 'QuestHelperCommon.js'), 'createQuestHelper'); return declaration.getText(file); })();
const trackerSource = region(native, 'Quest/QuestWindow.js');
const html = {
  classic: template('QuestV1/QuestV1.html?raw'), renew: template('Quest/Quest.html?raw'),
  classicHelper: template('QuestV1/QuestHelperV1.html?raw'), renewHelper: template('Quest/QuestHelper.html?raw'),
  tracker: template('Quest/QuestWindow.html?raw'),
};
const css = {
  classic: template('QuestV1/QuestV1.css?raw'), renew: template('Quest/Quest.css?raw'),
  classicHelper: template('QuestV1/QuestHelperV1.css?raw'), renewHelper: template('Quest/QuestHelper.css?raw'), tracker: template('Quest/QuestWindow.css?raw'),
};
interface Component extends NativeQuestComponent {
  _host: HTMLElement; getRoot(): ShadowRoot; render(): string; prepare(): void; append(): void; remove(): void;
  init(): void; onAppend(): void; onRemove(): void; clean(): void; ClearQuestList(): void;
  setQuestList(value: Record<string, NativeQuest>, hidden?: number[]): void;
  addQuest(value: NativeQuest, id: number): void; updateMissionHunt(value: object, questId: number, huntId: number): void;
  removeQuest(id: number): void; toggleQuestActive(id: number, active: number): void; setQuestInfo(value: NativeQuest): void;
  fixtureQuests(): Record<string, NativeQuest>; fixtureHidden(): number[]; mouseMode: number;
}
const disposals: LastroQuestUI[] = [];
function fixture(renew = false) {
  const preference = { show: true, showwindow: true, save: vi.fn() };
  const network = { sendPacket: vi.fn() }, chat = { addText: vi.fn(), TYPE: { ADMIN: 1, SELF: 2 }, FILTER: { QUEST: 1 } };
  const showMonster = vi.fn(), requestRoute = vi.fn<(route: QuestRoute) => boolean | Promise<boolean>>(() => true), cancelPendingRoute = vi.fn(), cancelRoute = vi.fn();
  const resources: string[] = [];
  class GUIComponent {
    static MouseMode = { CROSS: 0, STOP: 1 }; name: string; _host: HTMLElement | null = null; _root: ShadowRoot | null = null;
    ui = { hide: () => { if (this._host) this._host.style.display = 'none'; }, show: () => { if (this._host) this._host.style.display = 'block'; } };
    __loaded = false; draggable = vi.fn(); mouseMode = 1; cssText: string;
    constructor(name: string, cssText: string) { this.name = name; this.cssText = cssText; }
    getRoot() { return this._root; }
    render() { return ''; } init() {} onAppend() {} onRemove() {}
    prepare() {
      if (this.__loaded) return; this._host = document.createElement('div'); this._host.style.zIndex = '50'; this._host.id = this.name;
      this._root = this._host.attachShadow({ mode: 'open' }); const style = document.createElement('style'); style.textContent = this.cssText; this._root.append(style);
      const container = document.createElement('div'); setLastROInnerHTML(container, this.render()); this._root.append(container);
      this.__loaded = true; this.init();
    }
    append() { this.prepare(); document.body.append(this._host!); this.onAppend(); }
    remove() { if (this._host?.isConnected) { this.onRemove(); this._host.remove(); } }
  }
  const context = {
    GUIComponent, document, window, getComputedStyle, __esmMin: (callback: () => void) => callback,
    init_Preferences$1: vi.fn(), init_UIManager: vi.fn(), init_GUIComponent: vi.fn(), init_QuestWindow$2: vi.fn(), init_QuestWindow$1: vi.fn(), init_QuestWindow: vi.fn(),
    Preferences: { get: (_key: string, defaults: object) => Object.assign({}, defaults, preference) },
    UIManager: { addComponent: (component: unknown) => component }, Renderer: { width: 1024, height: 768 },
    DB: { INTERFACE_PATH: '', getQuestInfo: () => ({ Title: '真实狩猎任务' }), getItemInfo: () => ({ identifiedDisplayName: '道具', identifiedResourceName: 'apple' }) },
    Client: { loadFile: (path: string, callback: (data: string) => void) => { resources.push(path); callback('data:image/bmp;base64,AA=='); } },
    Network: network, PACKET: { CZ: { ACTIVE_QUEST: class {} } }, ChatBox_default: chat, SessionStorage_default: {},
    processText$1: (value: unknown) => typeof value === 'string' ? value : '', ItemInfo_default: {}, Navigation_default: {},
    QuestWindow_default$1: css.tracker, QuestWindow_default$2: html.tracker,
  };
  const result = runInNewContext(`${helperFactory}\n${trackerSource}\ninit_QuestWindow();\n${questFactory}\nconst helper = createQuestHelper(${JSON.stringify({ name: renew ? 'QuestHelper' : 'QuestHelperV1', htmlText: renew ? html.renewHelper : html.classicHelper, cssText: renew ? css.renewHelper : css.classicHelper, preferencesKey: 'Quest', renewLayout: renew })});\nconst quest = createQuest({name:${JSON.stringify(renew ? 'Quest' : 'QuestV1')},htmlText:${JSON.stringify(renew ? html.renew : html.classic)},cssText:${JSON.stringify(renew ? css.renew : css.classic)},questHelper:helper,questWindow:QuestWindow_default,renewLayout:${renew}});\n({quest,helper,tracker:QuestWindow_default});`, context) as { quest: Component; helper: Component; tracker: Component };
  const mini = document.createElement('div'); mini.style.display = 'block'; document.body.append(mini);
  const rect = { x: 856, y: 16, width: 128, height: 152, top: 16, bottom: 168, left: 856, right: 984, toJSON() {} };
  mini.getBoundingClientRect = () => rect;
  const viewport = { width: 1024, height: 768 }, readiness = { value: true };
  const install = runInNewContext('(' + installLastroQuestUI.toString() + ')') as typeof installLastroQuestUI;
  const api = install({ ...result, getQuests: () => result.quest.fixtureQuests(), getHidden: () => result.quest.fixtureHidden(),
    hydrateQuest: value => value, showMonster, requestRoute, cancelPendingRoute, cancelRoute, getShowTracker: () => preference.showwindow,
    setShowTracker: value => { preference.showwindow = value; preference.save(); }, getMapReady: () => readiness.value,
    getMiniMap: () => mini, getViewport: () => viewport, document, window });
  disposals.push(api); result.quest.append(); result.tracker.append(); result.helper.append();
  const route: QuestRoute = { name: '任务地点', outset: ['prontera', 127, 162], path: [['prontera', 127, 162]] };
  const value = (qid = 7): NativeQuest => ({ questID: qid, active: 1, start_time: 0, end_time: 0, icon: 'ico_nq.bmp', title: '真实狩猎任务 ' + qid,
    summary: '取得苹果', description: ['与城镇居民交谈', '^ff0000击败波利^000000'], hunt_list: {
      21: { huntID: 21, mobGID: 1002, mobName: '波利', huntCount: 5, maxCount: 20 },
      22: { huntID: 22, mobGID: 1004, mobName: '蜂兵', huntCount: 0, maxCount: 5 },
    }, reward_item_list: [], route });
  return { ...result, api, preference, network, chat, resources, showMonster, requestRoute, cancelPendingRoute, cancelRoute, viewport, rect, mini, readiness, value,
    root: result.quest.getRoot(), detailRoot: result.helper.getRoot(), trackerRoot: result.tracker.getRoot() };
}
const content = (root: ParentNode) => root.querySelector('.lastro-quest-detail')?.textContent || '';
const click = (root: ParentNode, label: string) => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button.lastro-quest-link')].find(value => value.textContent === label);
  if (!button) throw new Error('Missing quest action: ' + label); button.click(); return button;
};
afterEach(() => { disposals.splice(0).forEach(value => value.dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('native quest windows and live tracking', () => {
  it.each([false, true])('preserves native frame/close/resources and safely renders all detail targets (renew=%s)', renew => {
    const f = fixture(renew), value = f.value();
    const close = f.detailRoot.querySelector('.quest-info-close-btn,.quest-info-bottom-btn');
    f.quest.setQuestList({ 7: value }); f.helper.append(); f.helper.setQuestInfo(value);
    expect(f.detailRoot.querySelector('.quest-info-close-btn,.quest-info-bottom-btn')).toBe(close);
    expect(content(f.detailRoot)).toContain('与城镇居民交谈\n击败波利'); expect(content(f.detailRoot)).toContain('波利 (5/20)'); expect(content(f.detailRoot)).toContain('蜂兵 (0/5)');
    expect(f.trackerRoot.querySelectorAll('.quest-window-li')).toHaveLength(1); expect(f.trackerRoot.textContent).toContain('波利 (5/20)');
    close?.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(f.helper._host.style.display).toBe('none');
    expect(f.resources.some(path => path.includes(renew ? 'bg_questsub.bmp' : 'quest_window.bmp'))).toBe(true);
    expect(f.tracker.mouseMode).toBe(1); expect(f.tracker._host.style.zIndex).toBe('50');
  });

  it('uses the live mobGID, does not mistake the huntID for the monster ID, and handles each monster', () => {
    const f = fixture(), value = f.value(); f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value);
    click(f.detailRoot, '波利'); click(f.trackerRoot, '蜂兵');
    expect(f.showMonster.mock.calls).toEqual([[1002, '波利'], [1004, '蜂兵']]); expect(f.network.sendPacket).not.toHaveBeenCalled();
  });

  it('covers printed classic foreign labels with an opaque native-sized pane and Chinese caption, preserving the close hit area', () => {
    const f = fixture(), value = f.value(); f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); f.helper.setQuestInfo(value);
    expect(f.detailRoot.querySelectorAll('.lastro-quest-caption')).toHaveLength(1);
    expect(f.detailRoot.querySelector('.lastro-quest-caption')?.textContent).toBe('任务详情');
    // jsdom does not apply Shadow DOM styles: apply the actual generated styles
    // to a clone of the native DOM to check the final cascade.
    const sheet = document.createElement('style'); sheet.textContent = [...f.detailRoot.querySelectorAll('style')].map(style => style.textContent).join('\n');
    const clone = f.detailRoot.querySelector('#QuestInfoV1')!.cloneNode(true) as HTMLElement; document.body.append(sheet, clone);
    const pane = getComputedStyle(clone.querySelector('.lastro-quest-detail')!);
    const caption = getComputedStyle(clone.querySelector('.lastro-quest-caption')!);
    const close = getComputedStyle(clone.querySelector('.quest-info-close-btn')!);
    expect(pane.backgroundColor).toBe('rgb(255, 255, 255)'); expect(caption.backgroundColor).toBe('rgb(255, 255, 255)');
    expect([caption.top, caption.left, caption.right, caption.height]).toEqual(['3px', '30px', '30px', '20px']);
    expect(caption.pointerEvents).toBe('none'); expect([close.top, close.right, close.width, close.height]).toEqual(['3px', '2px', '11px', '11px']);
    expect(f.resources.some(path => path.endsWith('basic_interface/quest_window.bmp'))).toBe(true);
  });

  it.each([false, true])('updates canonical quest data first and refreshes selected detail + tracker including zero (renew=%s)', renew => {
    const f = fixture(renew), value = f.value(); f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value);
    f.quest.updateMissionHunt({ huntCount: 0, maxCount: 0 }, 7, 21);
    expect(f.quest.fixtureQuests()[7]?.hunt_list?.[21]).toMatchObject({ huntCount: 0, maxCount: 0 });
    expect(content(f.detailRoot)).toContain('波利 (0/0)'); expect(f.trackerRoot.textContent).toContain('波利 (0/0)');
    f.quest.updateMissionHunt({ huntCount: 12, maxCount: 20 }, 7, 21); expect(content(f.detailRoot)).toContain('波利 (12/20)');
  });

  it('adds local classic tracking checkboxes in both views without sending ACTIVE_QUEST', () => {
    const f = fixture(); f.quest.setQuestList({ 7: f.value() });
    const checkboxes = [...f.root.querySelectorAll<HTMLInputElement>('input.lastro-quest-track')]; expect(checkboxes).toHaveLength(2);
    checkboxes[0]!.click(); expect(f.quest.fixtureHidden()).toEqual([7]); expect(checkboxes[1]!.checked).toBe(false); expect(f.trackerRoot.querySelector('.quest-window-li')).toBeNull();
    checkboxes[1]!.click(); expect(f.quest.fixtureHidden()).toEqual([]); expect(f.trackerRoot.querySelectorAll('.quest-window-li')).toHaveLength(1);
    expect(f.quest.fixtureQuests()[7]?.active).toBe(1); expect(f.network.sendPacket).not.toHaveBeenCalled();
  });

  it('shows at most four active tracked quests, including tasks with a future deadline', () => {
    const f = fixture(), values = Object.fromEntries([1, 2, 3, 4, 5, 6].map(id => [id, f.value(id)]));
    values[1]!.end_time = Math.floor(Date.now() / 1000) + 3600; values[6]!.active = 0;
    f.quest.setQuestList(values); expect([...f.trackerRoot.querySelectorAll<HTMLElement>('.quest-window-li')].map(value => value.dataset.questId)).toEqual(['1', '2', '3', '4']);
    f.helper.setQuestInfo(values[1]!); expect(f.detailRoot.querySelector('.lastro-quest-deadline')?.textContent).toMatch(/^期限：/);
  });

  it('applies the total local switch and preserves it across native detach/append', () => {
    const f = fixture(); f.quest.setQuestList({ 7: f.value() });
    const toggle = f.root.querySelector<HTMLInputElement>('.lastro-quest-display input')!; toggle.click();
    expect(f.preference.showwindow).toBe(false); expect(f.tracker._host.style.display).toBe('none'); expect(f.preference.save).toHaveBeenCalled();
    f.quest.remove(); f.tracker.remove(); f.quest.append(); f.tracker.append(); expect(f.tracker._host.style.display).toBe('none');
    toggle.click(); expect(f.tracker._host.style.display).toBe('block'); expect(f.network.sendPacket).not.toHaveBeenCalled();
  });

  it('retains tasks across map detach, clears removed selected details, and clears character state on clean', () => {
    const f = fixture(); f.quest.setQuestList({ 7: f.value(), 8: f.value(8) }); f.helper.setQuestInfo(f.quest.fixtureQuests()[7]!);
    f.quest.remove(); f.tracker.remove(); f.quest.append(); f.tracker.append(); expect(f.quest.fixtureQuests()[7]).toBeDefined(); expect(f.api.selectedQuestId).toBe(7);
    f.quest.removeQuest(7); expect(f.api.selectedQuestId).toBeNull(); expect(content(f.detailRoot)).toBe('');
    f.quest.fixtureHidden().push(8); f.quest.clean(); expect(f.quest.fixtureQuests()).toEqual({}); expect(f.quest.fixtureHidden()).toEqual([]);
    expect(f.tracker._host.isConnected).toBe(false); expect(f.cancelRoute).toHaveBeenCalled();
    f.quest.setQuestList({ 9: f.value(9) }); f.quest.append(); f.tracker.append(); expect(f.root.querySelector<HTMLElement>('#active-quest-list')?.style.display).toBe('block');
  });

  it('shows fresh details when clicking the brief task name', () => {
    const f = fixture(), value = f.value(); f.quest.setQuestList({ 7: value }); click(f.trackerRoot, '真实狩猎任务 7');
    expect(f.helper._host.isConnected).toBe(true); expect(f.helper._host.style.display).toBe('block'); expect(f.api.selectedQuestId).toBe(7);
    f.quest.toggleQuestActive(7, 0); expect(f.trackerRoot.querySelector('.quest-window-li')).toBeNull();
  });
});

describe('safe native quest descriptions and direct route actions', () => {
  it.each([false, true])('does not insert executable HTML from titles, descriptions, target names, or rewards (renew=%s)', renew => {
    const f = fixture(renew), value = f.value(); value.title = '<img src=x onerror=evil()>任务'; value.description = '<script>evil()</script>正文';
    value.hunt_list![21]!.mobName = '<img src=x>波利'; value.reward_item_list = [{ ItemID: 501, ItemNum: 1 }];
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value);
    for (const root of [f.root, f.detailRoot, f.trackerRoot]) expect(root.querySelector('img,script,[onclick],[onerror]')).toBeNull();
    expect(content(f.detailRoot)).toContain('<script>evil()</script>正文'); expect(f.requestRoute).not.toHaveBeenCalled();
  });

  it('turns only exact smob spans into name lookups while preserving item text and line breaks', () => {
    const f = fixture(), value = f.value(); value.description = ['收集苹果 <span class="sitem">苹果</span>', "猎杀<span class='smob'>波利</span><br>找<smob>蜂兵</smob>"];
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); click(f.detailRoot, '波利'); click(f.detailRoot, '蜂兵');
    expect(f.showMonster.mock.calls).toEqual([[null, '波利'], [null, '蜂兵']]); expect(content(f.detailRoot)).toContain('收集苹果 苹果\n猎杀波利\n找蜂兵');
    expect(f.detailRoot.querySelector('span.smob')).toBeNull();
  });

  it('requests a valid native NAVI coordinate only when explicitly clicked and never asks another confirmation', async () => {
    const f = fixture(), value = f.value(); delete value.route; value.description = '<NAVI>居民<INFO>prontera,127,162,0,101,0</INFO></NAVI>';
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); expect(f.requestRoute).not.toHaveBeenCalled();
    click(f.detailRoot, '居民（前往）'); await Promise.resolve(); expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith({ name: '居民', outset: ['prontera', 127, 162], path: [['prontera', 127, 162]] });
    expect(f.network.sendPacket).not.toHaveBeenCalled();
  });

  it('uses official NPC coordinates including zero and strips only the .gat map suffix', async () => {
    const f = fixture(), value = f.value(); delete value.route;
    value.npc_navi = 'prontera.gat'; value.npc_pos_x = 0; value.npc_pos_y = 0;
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); click(f.detailRoot, '前往');
    await Promise.resolve(); expect(f.requestRoute).toHaveBeenCalledExactlyOnceWith({ outset: ['prontera', 0, 0], path: [['prontera', 0, 0]] });
    value.npc_pos_x = null; f.helper.setQuestInfo(value);
    expect([...f.detailRoot.querySelectorAll('.lastro-quest-link')].some(node => node.textContent === '前往')).toBe(false);
  });

  it('accepts explicit outset-only/path-only metadata but refuses map-only and malformed path data', async () => {
    const f = fixture(), value = f.value();
    value.route = { outset: ['prontera', 1, 2], path: [] }; f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); click(f.detailRoot, '前往');
    await vi.waitFor(() => expect(f.api.pending).toBe(false)); expect(f.requestRoute.mock.calls[0]?.[0]).toMatchObject({ outset: ['prontera', 1, 2], path: [['prontera', 1, 2]] });
    value.route = { outset: [] as unknown as QuestRoute['outset'], path: [['prt_in', 3, 4]] }; f.helper.setQuestInfo(value); click(f.detailRoot, '前往');
    await vi.waitFor(() => expect(f.api.pending).toBe(false)); expect(f.requestRoute.mock.calls[1]?.[0]).toMatchObject({ outset: ['prt_in', 3, 4], path: [['prt_in', 3, 4]] });
    for (const route of [{ questPos: ['prontera'], outset: [], path: [] }, { outset: ['prontera', 1, 2], path: 'not an array' }, { outset: ['prontera'], path: [['prt_in', 3, 4]] }, { outset: ['prontera', 1, 2], path: [['prt_in', 3]] }]) {
      value.route = route as unknown as QuestRoute; f.helper.setQuestInfo(value);
      expect([...f.detailRoot.querySelectorAll('.lastro-quest-link')].some(node => node.textContent?.startsWith('前往'))).toBe(false);
    }
  });

  it.each(['<NAVI>坏点<INFO>prontera,-1,162</INFO></NAVI>', '<NAVI>坏点<INFO>prontera,1,65536</INFO></NAVI>', '<NAVI>坏点<INFO>../prontera,1,2</INFO></NAVI>', '<NAVI>坏点<INFO>prontera,1</INFO></NAVI>'])('does not create actions for malformed/guessed coordinates: %s', description => {
    const f = fixture(), value = f.value(); value.description = description; value.route = { outset: ['prontera', 0, 0], path: [] };
    value.route = { outset: ['prontera', null as unknown as number, 0], path: [] };
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); expect([...f.detailRoot.querySelectorAll('.lastro-quest-link')].some(node => node.textContent?.includes('前往'))).toBe(false);
  });

  it('prevents duplicate requests across detail rerender and ignores an old async failure after clean', async () => {
    const f = fixture(), value = f.value(); let reject!: (reason: Error) => void;
    f.requestRoute.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; })); f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value);
    const button = click(f.detailRoot, '前往：任务地点'); expect(f.api.pending).toBe(true); button.click();
    f.quest.updateMissionHunt({ huntCount: 6 }, 7, 21); click(f.detailRoot, '前往：任务地点'); expect(f.requestRoute).toHaveBeenCalledTimes(1);
    f.quest.clean(); reject(new Error('late')); await Promise.resolve(); await Promise.resolve(); expect(f.api.pending).toBe(false); expect(content(f.detailRoot)).toBe('');
  });

  it('does not request while the map is unavailable, handles errors locally, and recovers for another click', async () => {
    const f = fixture(), value = f.value(); f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); f.readiness.value = false;
    click(f.detailRoot, '前往：任务地点'); expect(f.requestRoute).not.toHaveBeenCalled(); f.readiness.value = true;
    f.requestRoute.mockRejectedValueOnce(new Error('offline')); click(f.detailRoot, '前往：任务地点'); await Promise.resolve(); await Promise.resolve();
    await vi.waitFor(() => { expect(content(f.detailRoot)).toContain('暂时无法前往任务地点'); expect(f.api.pending).toBe(false); });
    click(f.detailRoot, '前往：任务地点'); expect(f.requestRoute).toHaveBeenCalledTimes(2);
  });

  it('cancels preflight when its selected quest is deleted or details close; map detach preserves the route', async () => {
    const f = fixture(), value = f.value(); let reject!: (error: Error) => void;
    f.requestRoute.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    f.quest.setQuestList({ 7: value }); f.helper.setQuestInfo(value); const old = click(f.detailRoot, '前往：任务地点');
    f.quest.remove(); expect(f.cancelPendingRoute).not.toHaveBeenCalled(); expect(f.cancelRoute).not.toHaveBeenCalled(); f.quest.append();
    f.quest.removeQuest(7); expect(f.cancelPendingRoute).toHaveBeenCalledTimes(1); old.click(); expect(f.requestRoute).toHaveBeenCalledTimes(1);
    reject(new Error('late')); await vi.waitFor(() => expect(f.api.pending).toBe(false)); expect(content(f.detailRoot)).toBe('');
    f.quest.setQuestList({ 8: f.value(8) }); f.helper.ui?.show?.(); f.helper.setQuestInfo(f.quest.fixtureQuests()[8]!); click(f.detailRoot, '前往：任务地点');
    f.detailRoot.querySelector('.quest-info-close-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(f.cancelPendingRoute).toHaveBeenCalledTimes(2); expect(f.cancelRoute).not.toHaveBeenCalled(); reject(new Error('closed'));
  });
});

describe('brief minimap placement and native cleanup', () => {
  it('docks below the real minimap and clamps position/scroll height to a small viewport', () => {
    const f = fixture(); f.quest.setQuestList({ 7: f.value() }); expect(f.tracker._host.style.top).toBe('176px'); expect(f.tracker._host.style.left).toBe('744px');
    expect(f.tracker._host.style.getPropertyValue('--lastro-quest-height')).toBe('576px');
    f.viewport.width = 240; f.viewport.height = 240; window.dispatchEvent(new Event('resize'));
    expect(Number.parseInt(f.tracker._host.style.top)).toBeLessThanOrEqual(160); expect(Number.parseInt(f.tracker._host.style.left)).toBeGreaterThanOrEqual(8);
    expect(f.trackerRoot.querySelector('style[data-lastro-quest]')?.textContent).toContain('overflow-y:auto');
  });

  it('installs once, removes resize observers on clean, and rejects detached old action callbacks after dispose', () => {
    const f = fixture(), remove = vi.spyOn(window, 'removeEventListener'); f.quest.setQuestList({ 7: f.value() }); f.helper.setQuestInfo(f.quest.fixtureQuests()[7]!);
    const button = [...f.detailRoot.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === '波利')!;
    expect(installLastroQuestUI({ quest: f.quest, helper: f.helper, tracker: f.tracker, getQuests: () => ({}), document, window })).toBe(f.api);
    f.quest.clean(); expect(remove.mock.calls.some(call => call[0] === 'resize')).toBe(true);
    f.api.dispose(); button.click(); expect(f.showMonster).not.toHaveBeenCalled();
  });

  it('converts 150% visual minimap rectangles to the tracker layout coordinates including a transformed origin', () => {
    const f = fixture(), host = f.tracker._host;
    Object.defineProperties(host, { offsetWidth: { value: 240 }, offsetHeight: { value: 160 }, offsetLeft: { value: 20 }, offsetTop: { value: 30 } });
    host.getBoundingClientRect = () => ({ ...f.rect, left: 40, top: 55, width: 360, height: 240, right: 400, bottom: 295 });
    f.rect.bottom = 252; f.rect.right = 1008; f.api.position();
    expect(Number.parseFloat(host.style.left)).toBeCloseTo((1008 - 360 - 10) / 1.5);
    expect(Number.parseFloat(host.style.top)).toBeCloseTo((252 + 8 - 10) / 1.5);
    expect(Number.parseFloat(host.style.getPropertyValue('--lastro-quest-height'))).toBeCloseTo((768 - 260 - 16) / 1.5);
    expect(host.style.zIndex).toBe('50');
  });
});
