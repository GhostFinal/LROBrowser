import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { assertRuntimeLocalizationMount, createLastroMapLocalization, patchRuntimeMapLocalization } from '../scripts/lastro-localization.mjs';
import { patchRuntimeJobLocalization, patchRuntimeSkillLocalization, patchV2Runtime } from '../scripts/patch-v2-runtime.mjs';
import { patchRuntimeItemName } from '../scripts/lastro-item-name.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };
const document = new JSDOM('<!doctype html><html><body></body></html>').window.document;
function region(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing actual native region: ' + path);
  return source.slice(start, end);
}
function file(source: string) { return ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
function functions(source: string, names: string[]) {
  const ast = file(source);
  return names.map(name => {
    const matches = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (matches.length !== 1) throw new Error('Missing or duplicate actual native function: ' + name);
    return matches[0]!.getText(ast);
  }).join('\n');
}
function methods(source: string, names: string[]) {
  const ast = file(source), found = new Map<string, string[]>();
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) {
      const name = node.name.getText(ast); found.set(name, [...(found.get(name) || []), node.getText(ast)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return names.map(name => {
    const matches = found.get(name);
    if (matches?.length !== 1) throw new Error('Missing or duplicate actual native DB method: ' + name);
    return matches[0]!;
  }).join('\n');
}

interface NamedItem {
  ITID: number;
  IsIdentified: boolean;
  Options?: Array<{ index?: number; value?: number; param?: number }>;
}
function itemNameFixture(source: string) {
  const dbRegion = region(source, 'src/DB/DBManager.js');
  const ast = file(dbRegion), preferred: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'getPreferredItemDisplayName') preferred.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (preferred.length !== 1) throw new Error('Missing or duplicate actual item display-name helper');
  const info = { identifiedDisplayName: '测试装备', unidentifiedDisplayName: '未鉴定装备', identifiedResourceName: 'Option_Resource', slotCount: 0 };
  const DB = vm.runInNewContext(preferred[0] + '\nclass DB {\n' + methods(dbRegion, ['getItemName']) + '\n}; DB;', {
    MsgStringTable: {},
  }) as { getItemInfo(id: number): typeof info; getItemName(item: NamedItem, options?: { showItemOptions?: boolean }): string };
  DB.getItemInfo = () => info;
  const item: NamedItem = {
    ITID: 1724, IsIdentified: true,
    Options: [{ index: 1, value: 10 }, { index: 2 }, { index: 3 }, { index: 4 }, { index: 5 }, { index: 0 }, {}],
  };
  return { DB, item, info };
}

interface MapInfo {
  displayName?: string; notifyEnter?: boolean; backgroundBmp?: string | null;
  signName?: { mainTitle?: string | null; subTitle?: string | null };
}
interface MapApi {
  DB: { init(): void; getMapName(name: string, fallback?: string): string; getMapInfo(name: string): MapInfo | null };
  MapName: { setMap(name: string): void; onAppend(): void; onRemove(): void; resetState(): void; getRoot(): ShadowRoot; remove: ReturnType<typeof vi.fn> };
  loadMapTbl(path: string, callback: ((data: unknown) => void) | null, done: (success: boolean) => void): void;
  updateMapTable(): void;
}
function nativeMapLuaCallback(source: string) {
  const ast = file(source), callbacks: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'tryLoadLuaAliases' && node.arguments[0]?.getText(ast) === 'loadMapTbl' && node.arguments[2]) callbacks.push(node.arguments[2].getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (callbacks.length !== 1) throw new Error('Missing or duplicate native lazy map-loading callback');
  return callbacks[0]!;
}
function mapFixture(source: string) {
  const maps = vm.runInNewContext(region(vendor, 'src/DB/Map/MapTable.js') + '\ninit_MapTable(); MapInfo;', { __esmMin: (fn: () => void) => fn }) as Record<string, MapInfo>;
  const table: Record<string, { name?: string; mp3?: string }> = {}, luaContext: Record<string, unknown> = {};
  const tableLoads: { path: string; row: (...values: unknown[]) => void; done: () => void }[] = [];
  const reads: string[] = [], timers: { callback: () => void; delay: number }[] = [];
  let luaInfo: { name: string; info: MapInfo } | undefined;
  class GUIComponent {
    static MouseMode = { CROSS: 0 };
    __loaded = true;
    readonly _host = document.createElement('div');
    readonly root = this._host.attachShadow({ mode: 'open' });
    render!: () => string;
    remove = vi.fn();
    prepare() { this.root.innerHTML = this.render(); }
    getRoot() { return this.root; }
  }
  const context = vm.createContext({
    console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() }, GUIComponent,
    __esmMin: (fn: () => void) => fn, init_DBManager() {}, init_UIManager() {}, init_GUIComponent() {}, init_Client() {}, init_Events() {},
    UIManager: { addComponent: (component: GUIComponent) => { component.prepare(); return component; } },
    Events: { setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: vi.fn() },
    MapInfo: maps, MapTable: table, MsgStringTable: {}, LastROMapLocalization: createLastroMapLocalization(),
    userCharpage: 'gbk', userStringDecoder: { decode: (value: string) => value },
    loadFontFromClient: vi.fn(), loadCSV: vi.fn(),
    loadTable: (path: string, _separator: string, _size: number, row: (...values: unknown[]) => void, done: () => void) => tableLoads.push({ path, row, done }),
    lua: {
      ctx: luaContext, mountFile: vi.fn(), unmountFile: vi.fn(), doFile: async () => {},
      doStringSync: () => {
        if (!luaInfo) throw new Error('Missing Lua map fixture');
        const { name, info } = luaInfo;
        (luaContext.AddMapDisplayName as (...args: unknown[]) => void)(name, info.displayName, info.notifyEnter);
        (luaContext.AddMapSignName as (...args: unknown[]) => void)(name, info.signName?.subTitle, info.signName?.mainTitle);
        (luaContext.AddMapBackgroundBmp as (...args: unknown[]) => void)(name, info.backgroundBmp);
      },
    },
    Client: { loadFile: (path: string, success: (data: string | Uint8Array) => void) => {
      reads.push(path); success(path.endsWith('.png') ? 'data:image/png;base64,test' : new Uint8Array());
    } },
  });
  const dbRegion = region(source, 'src/DB/DBManager.js');
  // Execute the actual embedded helper so this also checks the build's mount.
  const prefix = source.slice(0, source.indexOf('import '));
  vm.runInContext(prefix + '\n' + functions(dbRegion, ['loadMapTbl', 'updateMapTable']) + '\nclass DB { static mapalias={}; static INTERFACE_PATH="data/interface/"; static getMessage(){return "未知地图";}\n' + methods(dbRegion, ['init', 'getMapName', 'getMapInfo']) + '\n};\n' +
    ['html?raw', 'css?raw', 'js'].map(extension => region(source, `src/UI/Components/MapName/MapName.${extension}`)).join('\n') + '\ninit_MapName();', context);
  const api = vm.runInContext('({DB, MapName, loadMapTbl, updateMapTable});', context) as MapApi;
  const onLuaReady = vm.runInContext('(' + nativeMapLuaCallback(dbRegion) + ')', context) as (data: unknown) => void;
  function loadNames(rows: [string, string][]) {
    api.DB.init();
    const load = [...tableLoads].reverse().find(row => row.path === 'data/mapnametable.txt');
    if (!load) throw new Error('Missing actual native map-name table request');
    rows.forEach(([map, name], index) => load.row(index, map, name)); load.done();
  }
  async function loadLua(name: string, info: MapInfo) {
    luaInfo = { name, info };
    const done = vi.fn(); api.loadMapTbl('System/mapInfo.lub', onLuaReady, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledExactlyOnceWith(true));
  }
  const title = () => api.MapName.getRoot().querySelector('.maptitle')?.textContent;
  const subtitle = () => api.MapName.getRoot().querySelector('.mapsubtitle')?.textContent;
  return { api, maps, table, loadNames, loadLua, title, subtitle, reads, timers, context };
}

describe('map-name localization survives native loading and teleport lifecycle', () => {
  it('reproduces the English arrival banner using the actual native Prontera Field record', () => {
    const f = mapFixture(vendor); f.loadNames([['prt_fild08.rsw', '普隆德拉 区域8']]);
    expect(f.api.DB.getMapName('prt_fild08.gat')).toBe('普隆德拉 区域8');
    f.api.MapName.setMap('prt_fild08.gat'); expect(f.title()).toBe('Prontera Field');
  });

  it('uses the packaged Chinese name for arrival while preserving background, notification and resource paths', () => {
    const f = mapFixture(patchRuntimeMapLocalization(vendor));
    f.api.MapName.setMap('prt_fild08.gat'); f.api.MapName.onAppend();
    expect(f.title()).toBe('普隆德拉 区域8');
    expect(f.api.DB.getMapName('prt_fild08.gat')).toBe('普隆德拉 区域8');
    expect(f.maps['prt_fild08.rsw']).toMatchObject({ displayName: 'Prontera Field', notifyEnter: true, backgroundBmp: 'field_s2' });
    expect(f.reads).toEqual(['data/interface/display_mapname/field_s2.png']);
    expect(f.timers.map(timer => timer.delay)).toEqual([5000, 6000]);
    expect(f.api.DB.getMapName('PRT_FILD08.GAT')).toBe('普隆德拉 区域8');
    expect(f.api.DB.getMapName('prt_fild08')).toBe('普隆德拉 区域8');
    expect(f.api.DB.getMapInfo('PRT_FILD08.RSW')?.signName?.mainTitle).toBe('普隆德拉 区域8');
  });

  it('resolves every Chinese world-data map at the native DB display getter without changing the resource key', () => {
    const f = mapFixture(patchRuntimeMapLocalization(vendor));
    const world = JSON.parse(readFileSync('vendor/core/data/world/world-data.json', 'utf8')) as Record<string, { name: string }>;
    const rows = Object.entries(world).filter(([, value]) => /[\u3400-\u9fff]/u.test(value.name));
    expect(rows.length).toBeGreaterThan(700);
    for (const [id, data] of rows) {
      expect(f.api.DB.getMapName(id + '.gat'), id).toBe(data.name);
      expect(f.api.DB.getMapName(id + '.rsw'), id).toBe(data.name);
      const map = f.maps[id + '.rsw'];
      if (map && !/[\u3400-\u9fff]/u.test(map.displayName || '')) expect(f.api.DB.getMapInfo(id + '.rsw')?.displayName, id).toBe(data.name);
    }
  });

  it.each(['text-first', 'lua-first'] as const)('keeps Chinese titles when mapInfo Lua loads %s and DB.init runs repeatedly', async order => {
    const f = mapFixture(patchRuntimeMapLocalization(vendor));
    const lateInfo: MapInfo = { displayName: 'Late English Field', signName: { mainTitle: 'Late English Field', subTitle: '自定义中文副标题' }, backgroundBmp: 'field_s2', notifyEnter: true };
    if (order === 'text-first') f.loadNames([['prt_fild08.rsw', '已校订的地图名称']]);
    await f.loadLua('prt_fild08.rsw', lateInfo);
    if (order === 'lua-first') f.loadNames([['prt_fild08.rsw', '已校订的地图名称']]);
    f.api.updateMapTable();
    for (let init = 0; init < 3; init++) {
      f.loadNames([['prt_fild08.rsw', 'Late English TXT']]);
      f.api.MapName.setMap('prt_fild08.gat');
      expect(f.title()).toBe('已校订的地图名称'); expect(f.subtitle()).toBe('自定义中文副标题');
      expect(f.api.DB.getMapName('prt_fild08.gat')).toBe('已校订的地图名称');
    }
    expect(f.maps['prt_fild08.rsw']?.backgroundBmp).toBe('field_s2');
  });

  it('retains Chinese labels through repeated same-map teleport without showing duplicate arrival banners', () => {
    const f = mapFixture(patchRuntimeMapLocalization(vendor));
    f.api.MapName.setMap('prt_fild08.gat'); f.api.MapName.onAppend();
    const timers = f.timers.length;
    f.api.MapName.setMap('prt_fild08.gat'); f.api.MapName.onAppend();
    expect(f.title()).toBe('普隆德拉 区域8'); expect(f.timers).toHaveLength(timers);
    expect(f.api.MapName.remove).toHaveBeenCalledOnce();
    f.api.MapName.resetState(); f.api.MapName.setMap('prt_fild08.gat'); f.api.MapName.onAppend();
    expect(f.title()).toBe('普隆德拉 区域8'); expect(f.timers).toHaveLength(timers + 2);
  });

  it('keeps unknown maps and custom Chinese main/subtitles without changing filenames or interpreting markup', async () => {
    const f = mapFixture(patchRuntimeMapLocalization(vendor));
    await f.loadLua('custom_map.rsw', { displayName: '活动地图', signName: { mainTitle: '自定义<主标题>', subTitle: '自定义<副标题>' }, backgroundBmp: 'custom_art', notifyEnter: true });
    f.api.MapName.setMap('custom_map.gat');
    expect(f.title()).toBe('自定义<主标题>'); expect(f.subtitle()).toBe('自定义<副标题>');
    expect(f.api.MapName.getRoot().querySelector('.maptitle')?.children).toHaveLength(0);
    expect(f.reads.at(-1)).toBe('data/interface/display_mapname/custom_art.png');
    expect(f.api.DB.getMapName('unknown_map.gat', 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('late executable display tables keep localization separate from resources', () => {
  it('reapplies Chinese skill names after each Lua overwrite without changing combat records or resource identifiers', async () => {
    const source = patchRuntimeSkillLocalization(vendor.replace(/\r\n/g, '\n')), info: Record<number, Record<string, unknown>> = {}, luaContext: Record<string, unknown> = {};
    const pending: ((data: Uint8Array) => Promise<void>)[] = [], done = vi.fn(); let version = 0;
    const load = vm.runInNewContext(functions(region(source, 'src/DB/DBManager.js'), ['loadSkillInfoList']) + '\nloadSkillInfoList;', {
      Client: { loadFile: (_path: string, success: (data: Uint8Array) => Promise<void>) => pending.push(success) },
      SkillInfo: info, SkillConst_default: { AL_HEAL: 28 }, JobConst_default: { WIZARD_H: 4010 },
      userCharpage: 'gbk', userStringDecoder: { decode: (value: string) => value }, console: { log: vi.fn(), error: vi.fn() },
      lua: { ctx: luaContext, doString: async () => {}, doFile: async () => {}, mountFile: vi.fn(), unmountFile: vi.fn(), doStringSync: () => {
        (luaContext.AddSkillInfo as (...values: unknown[]) => void)(28, 'AL_HEAL', `Late English Heal ${version}`, 10 + version, [13 + version, 16], true, [9 + version, 9], { ratio: 2 + version });
        (luaContext.AddSkillRequirement as (...values: unknown[]) => void)(28, 1, 2 + version);
      } },
    }) as (path: string, callback: null, done: () => void) => void;
    for (version = 0; version < 3; version++) {
      load(`skills-${version}.lub`, null, done); await pending[version]!(new Uint8Array());
      expect(info[28]).toMatchObject({ Name: 'AL_HEAL', SkillName: '治愈术', MaxLv: 10 + version, SpAmount: [13 + version, 16], AttackRange: [9 + version, 9], SkillScale: { ratio: 2 + version }, _NeedSkillList: [[1, 2 + version]] });
    }
    expect(done).toHaveBeenCalledTimes(3);
  });

  it('keeps job display Chinese after repeated late table reloads while preserving body, palette and weapon basenames', () => {
    const source = patchRuntimeJobLocalization(vendor), prefix = source.slice(0, source.indexOf('import '));
    const monsters: Record<number, string> = { 4010: 'High Wizard' }, resourceName = 'resource_body_male';
    const resources = { JobNameTable: { 4010: resourceName }, PalNameTable: { 4010: 'resource_palette' }, WeaponJobTable: { 4010: 'resource_weapon' } };
    const display = vm.runInNewContext(prefix + '\nlastroJobDisplayName;', { ...resources, init_JobConst() {}, JobConst_default: { WIZARD_H: 4010 }, MonsterTable_default: monsters }) as (id: number) => string;
    for (let reload = 0; reload < 3; reload++) {
      monsters[4010] = 'LATE_ENGLISH_JOB_' + reload; expect(display(4010)).toBe('超魔导师');
      expect(resources.JobNameTable[4010]).toBe(resourceName);
      expect(resources.PalNameTable[4010]).toBe('resource_palette'); expect(resources.WeaponJobTable[4010]).toBe('resource_weapon');
    }
  });
});

describe('localization mount verification fails visibly when later patches drop a hook', () => {
  const baseline = vendor.replace(/\r\n/g, '\n');
  const localized = patchV2Runtime(vendor);

  it('accepts all active map, skill, job and message mounts against the unchanged native resource identifiers', () => {
    expect(() => assertRuntimeLocalizationMount(localized, baseline)).not.toThrow();
  });

  it('reproduces the native English item suffix and localizes the complete runtime behavior without mutating item data', () => {
    const original = itemNameFixture(vendor);
    expect(original.DB.getItemName(original.item)).toBe('测试装备 [5 Option]');
    const f = itemNameFixture(localized), before = JSON.stringify(f.item);
    expect(f.DB.getItemName(f.item)).toBe('测试装备 [5词条]');
    expect(f.DB.getItemName(f.item, { showItemOptions: false })).toBe('测试装备');
    expect(f.DB.getItemName({ ...f.item, Options: undefined })).toBe('测试装备');
    expect(f.DB.getItemName({ ...f.item, Options: [{ index: 0 }, {}] })).toBe('测试装备');
    expect(f.DB.getItemName({ ...f.item, Options: [{ index: 1 }] })).toBe('测试装备 [1词条]');
    expect(f.DB.getItemName({ ...f.item, IsIdentified: false })).not.toContain('词条');
    expect(JSON.stringify(f.item)).toBe(before);
    for (let reload = 0; reload < 3; reload++) {
      f.info.identifiedDisplayName = '晚加载装备' + reload;
      expect(f.DB.getItemName(f.item)).toBe(`晚加载装备${reload} [5词条]`);
      expect(f.info.identifiedResourceName).toBe('Option_Resource');
    }
  });

  it.each(['generated/runtime/Online.js', 'generated/core/runtime/Online.js'])('keeps dynamic item labels localized in the actual prepared artifact %s', filename => {
    const source = readFileSync(filename, 'utf8'), f = itemNameFixture(source);
    expect(f.DB.getItemName(f.item)).toBe('测试装备 [5词条]');
    expect(f.DB.getItemName(f.item, { showItemOptions: false })).toBe('测试装备');
    expect(() => assertRuntimeLocalizationMount(source, vendor)).not.toThrow();
  });

  it('rejects an upstream item-name method restored inside an otherwise localized runtime, including Chinese decoys', () => {
    const original = methods(region(vendor, 'src/DB/DBManager.js'), ['getItemName']);
    const current = methods(region(localized, 'src/DB/DBManager.js'), ['getItemName']);
    const changed = localized.replace(current, () => original) + '\n// Translation retained elsewhere: [5词条]\nconst itemLabelDecoy = "词条]";';
    const f = itemNameFixture(changed);
    expect(f.DB.getItemName(f.item)).toBe('测试装备 [5 Option]');
    expect(() => assertRuntimeLocalizationMount(changed, vendor)).toThrow('localization-mount:item-options-display');
  });

  it('checks item option count behavior instead of only the presence of a Chinese suffix', () => {
    const current = methods(region(localized, 'src/DB/DBManager.js'), ['getItemName']);
    const ast = file('class DB {\n' + current + '\n}');
    let initializer: ts.Expression | undefined;
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'numOfOptions') initializer = node.initializer;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (!initializer) throw new Error('Missing actual item option counter');
    const broken = current.replace(initializer.getText(ast), '0');
    expect(broken).not.toBe(current);
    expect(broken).toContain('词条]');
    const changed = localized.replace(current, () => broken);
    const f = itemNameFixture(changed);
    expect(f.DB.getItemName(f.item)).toBe('测试装备');
    expect(() => assertRuntimeLocalizationMount(changed, vendor)).toThrow('localization-mount:item-options-display');
  });

  it('allows unrelated English Option resource labels while auditing the actual DB display getter', () => {
    const source = localized + '\nconst preservedResourceName = "Option_Resource";';
    expect(() => assertRuntimeLocalizationMount(source, vendor)).not.toThrow();
  });

  it('fails clearly when upstream changes the option-label patch anchor', () => {
    const changed = vendor.replace('" Option]"', '" Options]"');
    expect(changed).not.toBe(vendor);
    expect(() => patchRuntimeItemName(changed)).toThrow('anchor:item-name:option-label');
  });

  it.each([
    ['map-text-loader', 'LastROMapLocalization.rememberName(key, val)'],
    ['map-info-display', 'LastROMapLocalization.localizeInfo(map, MapInfo[map] || null, MapTable[map]?.name)'],
    ['map-info-loader', 'if (typeof callback === "function") callback(MapInfo);'],
    ['message-display', 'LastROUiMessages.resolveMessage(id, MsgStringTable[id], defaultText)'],
    ['skill-name-loader', 'LASTRO Chinese skill-name overlay'],
    ['skill-description-loader', 'SkillDescription = _json;'],
    ['arrival-map-info', '_mapinfo = DB.getMapInfo(mapname.replace(".gat", ".rsw"))'],
    ['job-display', 'function lastroJobDisplayName(id)'],
  ])('rejects a missing %s hook', (label, hook) => {
    const target = label === 'job-display' ? localized : region(localized, label === 'arrival-map-info' ? 'src/UI/Components/MapName/MapName.js' : 'src/DB/DBManager.js');
    const changed = localized.replace(target, () => target.replaceAll(hook, 'DROPPED_LOCALIZATION_HOOK'));
    expect(changed).not.toBe(localized);
    expect(() => assertRuntimeLocalizationMount(changed, baseline)).toThrow('localization-mount:' + label);
  });

  it('rejects a localization patch that changes an actual native body resource basename', () => {
    const path = 'src/DB/Jobs/JobNameTable.js', native = region(localized, path);
    const ast = file(native); let replaced = false;
    function alter(node: ts.Node): string | undefined {
      if (ts.isStringLiteral(node)) { replaced = true; return native.slice(0, node.getStart(ast)) + '"错误的中文资源名"' + native.slice(node.end); }
      for (const child of node.getChildren(ast)) { const changed = alter(child); if (changed) return changed; }
      return undefined;
    }
    const changed = alter(ast);
    expect(replaced).toBe(true);
    expect(() => assertRuntimeLocalizationMount(localized.replace(native, () => changed!), baseline)).toThrow('localization-mount:resource-identifiers');
  });

  it('rejects upstream map loader and display drift instead of silently skipping localization', () => {
    expect(() => patchRuntimeMapLocalization(vendor.replace('static getMapInfo(mapname)', 'static changedGetMapInfo(mapname)'))).toThrow('anchor:map-localization-getMapInfo');
    const loader = functions(region(vendor, 'src/DB/DBManager.js'), ['loadMapTbl']);
    const changed = vendor.replace(loader, () => loader.replace('lua.doStringSync("main()");', 'lua.doStringSync("changed_main()");'));
    expect(changed).not.toBe(vendor);
    expect(() => patchRuntimeMapLocalization(changed)).toThrow('anchor:map-localization-mapinfo-callback');
  });
});

describe('static UI translations survive later template changes', () => {
  const english = '<div>Storage</div><input placeholder="Item Search"><span data-title="Popular">Text</span>';
  const chinese = '<div>仓库</div><input placeholder="物品搜索"><span data-title="热门">Text</span>';
  const uiSource = (html: string) => '//#region src/UI/Components/Regression/Regression.html?raw\nconst html = ' + JSON.stringify(html) + ';\n//#endregion';
  const baseline = uiSource(english);

  it('accepts rendered Chinese labels and escaped attribute quotes in the actual JS string literal format', () => {
    const source = uiSource(chinese);
    expect(source).toContain('placeholder=\\"物品搜索\\"');
    expect(() => assertRuntimeLocalizationMount(source, baseline)).not.toThrow();
    const string = file(source).statements[0];
    expect(string && ts.isVariableStatement(string)).toBe(true);
    const html = vm.runInNewContext(source + '\nhtml;') as string;
    const container = document.createElement('div'); container.innerHTML = html;
    expect(container.querySelector('div')?.textContent).toBe('仓库');
    expect(container.querySelector('input')?.placeholder).toBe('物品搜索');
    expect(container.querySelector('span')?.dataset.title).toBe('热门');
  });

  it.each([
    ['>Storage<', '>仓库<'],
    ['placeholder="Item Search"', 'placeholder="物品搜索"'],
    ['data-title="Popular"', 'data-title="热门"'],
  ])('rejects restored English and removed Chinese for %s', (original, translated) => {
    expect(() => assertRuntimeLocalizationMount(uiSource(chinese.replace(translated, original)), baseline)).toThrow('localization-mount:ui-text:' + original);
    expect(() => assertRuntimeLocalizationMount(uiSource(chinese.replace(translated, '')), baseline)).toThrow('localization-mount:ui-text:' + original);
  });
});
