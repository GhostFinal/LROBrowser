// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The native migration helpers have no declaration file.
import * as migration from '../vendor/v2/lastro-v1-migration.mjs';
const { AUTO_BATTLE_SCALAR_IDS, AUTO_BATTLE_ITEM_SLOT_FIELDS, buildAutoBattleFieldUpdates, buildAssistSkillUpdates } = migration;

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const start = native.indexOf('function patchLastROToolsTemplate()');
const file = ts.createSourceFile('LastROTools.js', native.slice(start, native.indexOf('//#endregion', start)), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const assignments = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isBinaryExpression(node) && !assignments.has(node.left.getText(file))) assignments.set(node.left.getText(file), node.right.getText(file));
  ts.forEachChild(node, visit);
}
visit(file);
function assigned(name: string) {
  const result = assignments.get(name);
  if (!result) throw new Error(`Missing native assignment: ${name}`);
  return result;
}
const template = runInNewContext(assigned('LastROTools_default$1')) as string;
// The installer and parser patch are tested together with the actual native factories below.
import { installLastroAutomationSync as install, patchRuntimeAutomationSync } from '../scripts/lastro-automation-sync.mjs';
const patched = patchRuntimeAutomationSync(native);
const headerFile = ts.createSourceFile('Online.imports.js', patched.slice(0, patched.indexOf('//#region')), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const migrationImport = headerFile.statements.find((node): node is ts.ImportDeclaration => ts.isImportDeclaration(node)
  && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('./lastro-v1-migration.mjs'));
const bindings = migrationImport?.importClause?.namedBindings;
if (!bindings || !ts.isNamedImports(bindings)) throw new Error('Missing patched migration imports');
const migrationBindings = Object.fromEntries(bindings.elements.map(element => [element.name.text, element.propertyName?.text || element.name.text]));
// Runtime fixtures receive only helpers the actual patched runtime imports.
const migrationGlobals = Object.fromEntries(Object.entries(migrationBindings).map(([local, imported]) => {
  if (!(imported in migration)) throw new Error('Missing native migration export: ' + imported);
  return [local, migration[imported]];
}));
function parser(source: string) {
  const from = source.indexOf('PACKET.ZC.NOTIFY_LOADINFO = function');
  const to = source.indexOf('PACKET.ZC.NOTIFY_LOADINFO.size', from);
  if (from < 0 || to < 0) throw new Error('Missing native load-info parser');
  return runInNewContext(source.slice(from, to) + '\nPACKET.ZC.NOTIFY_LOADINFO;', { PACKET: { ZC: {} } });
}
const decode = parser(patched);
function packet(bytes = new Uint8Array(58)) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  const fp = { tell: () => offset, readUChar: () => bytes[offset++], readUShort: () => { const value = view.getUint16(offset, true); offset += 2; return value; }, readLong: () => { const value = view.getInt32(offset, true); offset += 4; return value; } };
  const state = new decode(fp, bytes.byteLength) as Values;
  return { state, offset };
}
function snapshot(overrides: Values = {}) { return { ...packet().state, ...overrides }; }

const adapterStart = patched.indexOf('//#region src/UI/Components/LastROTools/LastROTools.js');
const adapterFile = ts.createSourceFile('LastROTools.patched.js', patched.slice(adapterStart, patched.indexOf('//#endregion', adapterStart)), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let adapterSource = '';
function findAdapter(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(adapterFile).startsWith('(function installLastroAutomationSync(')) adapterSource = node.arguments[1]?.getText(adapterFile) || '';
  ts.forEachChild(node, findAdapter);
}
findAdapter(adapterFile);
if (!adapterSource) throw new Error('Missing actual automation runtime adapter');
const mapStart = patched.indexOf('//#region src/Engine/MapEngine.js');
const mapFile = ts.createSourceFile('MapEngine.patched.js', patched.slice(mapStart, patched.indexOf('//#endregion', mapStart)), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let mapLoadSource = '', logoutSource = '';
function findMapLoad(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'cleanGameUI') logoutSource = node.getText(mapFile);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'onMapChange') {
    function inspect(child: ts.Node) {
      if (ts.isBinaryExpression(child) && child.left.getText(mapFile) === 'MapRenderer.onLoad') mapLoadSource = child.right.getText(mapFile);
      ts.forEachChild(child, inspect);
    }
    inspect(node);
  }
  ts.forEachChild(node, findMapLoad);
}
findMapLoad(mapFile);
if (!mapLoadSource || !logoutSource) throw new Error('Missing actual native map lifecycle callbacks');

class PacketWriter {
  bytes: Uint8Array;
  private offset = 0;
  private view: DataView;
  constructor(length: number) { this.bytes = new Uint8Array(length); this.view = new DataView(this.bytes.buffer); }
  writeShort(value: number) { this.view.setUint16(this.offset, value, true); this.offset += 2; }
  writeUChar(value: number) { this.view.setUint8(this.offset++, value); }
  writeLong(value: number) { this.view.setInt32(this.offset, value, true); this.offset += 4; }
}
interface OutgoingPacket { id?: number; value?: number; receiver?: string; msg?: string; build?: () => PacketWriter; }
function nativeAdapter(nid = 3) {
  const sent: OutgoingPacket[] = [];
  const session: { Playing: boolean; GID: number; Entity: { position: number[] } | null } = { Playing: true, GID: 1234, Entity: { position: [25, 41] } };
  const map = { loading: false };
  const flags: Record<string, unknown> = { lastroCustomPackets: true, lastroNid: nid };
  const from = native.indexOf('  PACKET.CZ.NOTIFY_ACTORINIT = function'), to = native.indexOf('  PACKET.CZ.REQUEST_CARDCONNECTION_RECHARGE =', from);
  const PACKET = runInNewContext(native.slice(from, to) + '\nPACKET;', { PACKET: { CZ: {} }, BinaryWriter: PacketWriter });
  PACKET.CZ.WHISPER = class { receiver = ''; msg = ''; };
  const deps = runInNewContext(`(${adapterSource})`, {
    globalThis: window, SessionStorage_default: session, MapRenderer: map, PACKET,
    Configs: { get: (key: string, fallback: unknown) => flags[key] ?? fallback }, Network: { sendPacket: (value: OutgoingPacket) => sent.push(value) },
    ...migrationGlobals,
  });
  return { deps, sent, session, map, flags, PACKET };
}
function nativeMapLoad(tools: Tools, adapter: ReturnType<typeof nativeAdapter>, mapName = 'prontera.gat') {
  const ui = { append: vi.fn(), setMap: vi.fn() };
  const components = Object.fromEntries([
    'ChatBox_default', 'ChatBoxSettings_default', 'Escape_default', 'CartItems_default', 'Vending_default', 'ChangeCart_default',
    'CartDecoration_default', 'ShortCuts_default', 'StatusIcons_default', 'ShortCut_default', 'ChatRoomCreate_default', 'Emoticons_default',
    'FPS_default', 'Guild_default', 'WorldMap_default', 'MobileUI_default', 'JoystickUI_default', 'Navigation_default', 'Roulette_default',
  ].map(name => [name, ui]));
  const controllers = Object.fromEntries([
    'Controller$5', 'BasicInfoController', 'InventoryController', 'EquipmentController', 'Controller$4', 'controller',
    'WinStatsController', 'Controller$3',
  ].map(name => [name, { getUI: () => ui }]));
  const load = runInNewContext(`(${mapLoadSource})`, {
    pkt: { xPos: 25, yPos: 41 }, resetEntityForMapEntry: vi.fn(), EntityManager: { add: vi.fn() },
    SessionStorage_default: { ...adapter.session, Entity: { effectState: 0, aura: { free() {}, load() {} } } },
    StatusState_default: { EffectState: { FALCON: 1, WUG: 2 } }, EffectManager: {}, MapRenderer: { currentMap: mapName },
    DB: { getAllSignboardsForMap: () => null }, Camera: { setTarget() {}, init() {} },
    LastROTools: Object.assign(tools, { append: vi.fn() }), SkillListMH_default: { homunculus: ui, mercenary: ui },
    Configs: { get: (key: string, fallback: unknown) => adapter.flags[key] ?? fallback },
    PacketVerManager_default: { value: 0 }, Plugins: { init() {} }, PACKET: adapter.PACKET,
    Network: { sendPacket: (value: OutgoingPacket) => adapter.sent.push(value) }, shouldUseLegacyMapEnter: () => true,
    ...components, ...controllers,
  });
  load();
}
function nativeLogout(tools: Tools) {
  const ui = { __loaded: false }, controller = { getUI: () => ui };
  const clean = runInNewContext(`(${logoutSource})`, {
    LastROTools: tools, WhisperBox: { clearAll() {} }, BasicInfoController: controller, PlayerViewEquipController: controller,
    StatusIcons_default: ui, ChatBox_default: ui, ShortCut_default: ui, Controller$3: controller, controller, CashShop_default: ui,
  });
  clean();
}
function reloadBytes(id: number, value: number) {
  const bytes = new Uint8Array(7), view = new DataView(bytes.buffer); view.setUint16(0, 2806, true); view.setUint8(2, id); view.setInt32(3, value, true);
  const from = native.indexOf('  PACKET.ZC.NOTIFY_RELOADINFOS = function'), to = native.indexOf('  PACKET.ZC.NOTIFY_RELOADINFOS.size', from);
  const read = runInNewContext(native.slice(from, to) + '\nPACKET.ZC.NOTIFY_RELOADINFOS;', { PACKET: { ZC: {} } });
  let offset = 2;
  return new read({ readUChar: () => view.getUint8(offset++), readLong: () => { const result = view.getInt32(offset, true); offset += 4; return result; } }, 7) as { id: number; value: number };
}

type Values = Record<string, unknown>;
interface Tools {
  _host: HTMLElement; _settingState: Values; _onlyTargets: number[]; _assistSkills: Array<{ skillId: number; level: number; enabled: boolean }>;
  getRoot(): ShadowRoot; init(): void; restorePanel(): void; onMapChanged(): Promise<void> | void; onRemove(): void;
  setLoadInfo(packet: Values): void; setReloadInfo(packet: { id: number; value: number }): void;
  setOnlyTargetState(packet: { mobid: number; value: number }): void; setOnlyTargetOptions(targets: Array<{ id: number; name: string }>): void;
  applyState(state: Values): void; updateField(field: string, input: HTMLInputElement | HTMLSelectElement): unknown;
  setAutomationOption(option: string, enabled: boolean): unknown;
  toggleOnlyTarget(id: number, enabled: boolean, checkbox?: HTMLInputElement): unknown;
  submitAssistSkill(values?: { skillId: number; level: number; enabled: boolean }): unknown;
  populateItemSelects(): void; populateSkillSelects(): void;
  setStatus: ReturnType<typeof vi.fn>; renderCompactStatus: ReturnType<typeof vi.fn>;
}

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

function fixture(nid = 3, overrideDeps: object = {}) {
  vi.useFakeTimers();
  let identity: string | null = `${nid}:character-a`, connected = true;
  let items: Array<{ ITID: number; count: number; name: string }> = [{ ITID: 503, count: 5, name: '黄色药水' }];
  let skills: Array<{ SKID: number; SkillName: string }> = [{ SKID: 28, SkillName: '治愈术' }];
  let loadMapData = async (): Promise<{ worldData: Values; mobData: Values }> => ({ worldData: {}, mobData: {} });
  let mapTargets: Array<{ id: number; name: string }> = [];
  const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' }), container = document.createElement('div');
  container.className = 'ui-component-root'; container.innerHTML = template; root.append(container); document.body.append(host);
  const tools = {
    _host: host, _settingState: {}, _onlyTargets: [], _assistSkills: [], getRoot: () => root,
    setStatus: vi.fn(), renderCompactStatus: vi.fn(), ensurePanelOpener: () => null,
    loadQuickRoutes() {}, collapseDetailedSettings() {}, onRemove: vi.fn(),
  } as unknown as Tools;
  const globals = {
    document, Configs: { get: () => nid }, SCALAR_FIELD_BY_ID: Object.fromEntries(Object.entries(AUTO_BATTLE_SCALAR_IDS).map(([field, id]) => [id, field])),
    mapLoadInfoPayload: (value: Values) => value, mapReloadInfoPacket: (value: Values) => value,
    mapOnlyTargetPacket: ({ mobid, value }: { mobid: number; value: number }) => ({ mobId: mobid, enabled: Boolean(value) }),
    installLastRORandomTeleportShortcut() {}, showLastROSettingsView() {}, showLastROMainView() {}, activateLastROSettingsTab() {},
    getLastROInventoryItems: () => items, getLastROLearnedSkills: () => skills, SkillInfo: {},
    MapRenderer: { currentMap: 'prontera.gat' }, loadWorldMapData: () => loadMapData(), getMapTargetOptions: () => mapTargets,
  };
  for (const name of ['init', 'restorePanel', 'onMapChanged', 'setLoadInfo', 'setReloadInfo', 'setOnlyTargetState', 'setOnlyTargetOptions', 'applyState', 'populateItemSelects', 'populateSkillSelects']) {
    Object.assign(tools, { [name]: runInNewContext(`(${assigned('LastROTools.' + name)})`, globals) });
  }
  const requestSettings = vi.fn(() => true), sendUpdates = vi.fn(() => true), sendToggle = vi.fn(() => true), sendTarget = vi.fn(() => true);
  const deps = { clock: window, now: () => Date.now(), getIdentity: () => identity, getNid: () => nid, canRequest: () => connected, requestSettings, sendUpdates, sendToggle, sendTarget, scalarIds: AUTO_BATTLE_SCALAR_IDS, itemSlots: AUTO_BATTLE_ITEM_SLOT_FIELDS, buildFieldUpdates: buildAutoBattleFieldUpdates, buildAssistUpdates: buildAssistSkillUpdates };
  const sync = install(tools, { ...deps, ...overrideDeps });
  tools.init();
  const field = (name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)!;
  const option = (name: string) => root.querySelector<HTMLInputElement>(`[data-option="${name}"]`)!;
  return { tools, sync, field, option, root, host, requestSettings, sendUpdates, sendToggle, sendTarget,
    identity: (value: string | null) => { identity = value; }, connect: (value: boolean) => { connected = value; },
    inventory: (value: typeof items) => { items = value; }, skills: (value: typeof skills) => { skills = value; },
    mapData: (value: typeof loadMapData) => { loadMapData = value; }, targets: (value: typeof mapTargets) => { mapTargets = value; } };
}

describe('server-confirmed automation settings', () => {
  it('starts with unknown controls until the first server snapshot', () => {
    const f = fixture();
    expect(f.field('autoloot').disabled).toBe(true);
    expect(f.field('autoloot').value).toBe('');
    expect(f.option('autoLoot').disabled).toBe(true);
    expect(f.option('autoLoot').indeterminate).toBe(true);
  });

  it.each([[0, '0'], [10, '0.1'], [100, '1'], [10000, '100']])('displays wire autoloot %i as %s percent without altering confirmed units', (wire, ui) => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: wire }));
    expect(f.field('autoloot').value).toBe(ui);
    expect(f.tools._settingState.autoloot).toBe(wire);
    expect(f.field('autoloot').disabled).toBe(false);
    f.tools.setReloadInfo({ id: 1, value: 7 });
    expect(f.field('autoloot').value).toBe(ui);
    expect(f.tools._settingState.autoloot).toBe(wire);
    expect(f.sendUpdates).not.toHaveBeenCalled();
  });

  it('does not mix a pending displayed percent with an unrelated scalar delta', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10 }));
    f.field('autoloot').value = '100'; f.tools.updateField('autoloot', f.field('autoloot'));
    expect(f.sendUpdates).toHaveBeenCalledWith([{ id: 20, value: 10000 }]);
    expect(f.tools._settingState.autoloot).toBe(10);
    expect(f.field('autoloot').disabled).toBe(true);
    f.tools.setReloadInfo({ id: 1, value: 8 });
    expect(f.field('autoloot').value).not.toBe('1');
    expect(f.field('autoloot').disabled).toBe(true);
    f.tools.setReloadInfo({ id: 20, value: 5000 });
    expect(f.field('autoloot').value).toBe('50');
    expect(f.tools._settingState.autoloot).toBe(5000);
    expect(f.field('autoloot').disabled).toBe(false);
  });

  it('sends 0.1 percent as wire value 10 and waits for server confirmation', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.field('autoloot').value = '0.1'; f.tools.updateField('autoloot', f.field('autoloot'));
    expect(f.sendUpdates).toHaveBeenCalledWith([{ id: 20, value: 10 }]);
    expect(f.tools._settingState.autoloot).toBe(10000);
    f.tools.setReloadInfo({ id: 20, value: 10 });
    expect(f.tools._settingState.autoloot).toBe(10);
    expect(f.field('autoloot').value).toBe('0.1');
  });

  it.each([3, 5, 6])('uses server snapshot and delta auto-loot polarity for nid %i', nid => {
    const f = fixture(nid);
    for (const value of [0, 1]) {
      f.tools.setLoadInfo(snapshot({ startAutoLoot: value }));
      const checked = nid === 3 ? Boolean(value) : !value;
      expect(f.option('autoLoot').checked).toBe(checked);
      expect(f.option('autoLoot').indeterminate).toBe(false);
      f.tools.setReloadInfo({ id: 35, value: 1 - value });
      expect(f.option('autoLoot').checked).toBe(!checked);
    }
  });

  it.each(['autoAttack', 'autoLoot', 'autoPots', 'autoFollow'])('does not confirm %s optimistically and blocks duplicate pending toggles', option => {
    const f = fixture(); f.tools.setLoadInfo(snapshot());
    f.option(option).checked = true; f.tools.setAutomationOption(option, true);
    expect(f.sendToggle).toHaveBeenCalledWith(option, true);
    expect(f.tools._settingState[option]).toBe(false);
    expect(f.option(option).disabled).toBe(true);
    f.tools.setAutomationOption(option, true);
    expect(f.sendToggle).toHaveBeenCalledTimes(1);
    const id = { autoAttack: 34, autoLoot: 35, autoPots: 36, autoFollow: 37 }[option]!;
    f.tools.setReloadInfo({ id, value: 0 });
    expect(f.option(option).checked).toBe(false);
    expect(f.option(option).disabled).toBe(false);
  });

  it('uses zero and false from server instead of preserving an old truthy value', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ AutoSeeBoss: 1, startAutoAtk: 1, pmdis: 9 }));
    f.tools.setLoadInfo(snapshot());
    expect((f.field('AutoSeeBoss') as HTMLInputElement).checked).toBe(false);
    expect(f.option('autoAttack').checked).toBe(false);
    expect(f.field('pmdis').value).toBe('0');
  });

  it('keeps fields absent from the full packet unknown until their own delta', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot());
    for (const name of ['touchskillid', 'touchskillop', 'AutoUseItem_Dishid', 'AutoUseItem_hp_1']) {
      expect(f.tools._settingState[name]).toBeUndefined();
      expect(f.field(name).disabled).toBe(false);
    }
    expect(f.field('touchskillid').value).toBe('');
    expect((f.field('touchskillop') as HTMLInputElement).indeterminate).toBe(true);
    f.tools.setReloadInfo({ id: 43, value: 1 });
    expect((f.field('touchskillop') as HTMLInputElement).checked).toBe(true);
    expect(f.field('touchskillop').disabled).toBe(false);
    expect(f.tools._settingState.touchskillid).toBeUndefined();
  });

  it('never sends a synthetic edit for an unknown field', () => {
    const f = fixture(); f.field('autoloot').value = '100'; f.tools.updateField('autoloot', f.field('autoloot'));
    f.tools.setAutomationOption('autoAttack', true);
    expect(f.sendUpdates).not.toHaveBeenCalled(); expect(f.sendToggle).not.toHaveBeenCalled();
  });

  it('reads only once automatically and keeps window reopening independent from explicit retries', async () => {
    const f = fixture(); await f.tools.onMapChanged(); f.sync.onMapReady(); f.tools.restorePanel(); f.sync.request();
    expect(f.requestSettings).toHaveBeenCalledTimes(1);
    expect(f.field('autoloot').disabled).toBe(true);
    f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.tools.restorePanel(); expect(f.requestSettings).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500); f.tools.restorePanel();
    expect(f.requestSettings).toHaveBeenCalledTimes(1);
    expect(f.field('autoloot').disabled).toBe(false);
    expect(f.sync.request()).toBe(true);
    expect(f.requestSettings).toHaveBeenCalledTimes(2);
    expect(f.field('autoloot').disabled).toBe(true);
    expect(f.field('autoloot').value).toBe('100');
  });

  it('unlocks only confirmed controls when snapshot request times out', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 })); f.sync.request();
    expect(f.field('autoloot').disabled).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(f.field('autoloot').disabled).toBe(false);
    expect(f.field('autoloot').value).toBe('1');
    expect(f.field('touchskillid').disabled).toBe(false);
    expect(f.tools.setStatus).toHaveBeenCalled();
  });

  it('retains server-confirmed wire value after a pending edit times out', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.field('autoloot').value = '1'; f.tools.updateField('autoloot', f.field('autoloot'));
    vi.advanceTimersByTime(5000);
    expect(f.field('autoloot').value).toBe('100');
    expect(f.field('autoloot').disabled).toBe(false);
    expect(f.tools._settingState.autoloot).toBe(10000);
  });

  it('clears an expired edit warning when the late server delta confirms the field without requesting again', () => {
    const f = fixture(); f.sync.onMapReady(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.field('autoloot').value = '50'; f.tools.updateField('autoloot', f.field('autoloot'));
    vi.advanceTimersByTime(5000);
    expect(f.tools.setStatus.mock.lastCall?.[0]).not.toBe('');
    expect(f.tools._settingState.autoloot).toBe(10000);
    f.tools.setReloadInfo(reloadBytes(20, 10));
    expect(f.field('autoloot').value).toBe('0.1'); expect(f.field('autoloot').disabled).toBe(false);
    expect(f.tools._settingState.autoloot).toBe(10); expect(f.tools.setStatus).toHaveBeenLastCalledWith('');
    vi.advanceTimersByTime(15000);
    expect(f.requestSettings).toHaveBeenCalledTimes(1); expect(f.sendUpdates).toHaveBeenCalledTimes(1);
    expect(f.tools.setStatus).toHaveBeenLastCalledWith('');
  });

  it('clears the expired target warning after a late server target update', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot());
    f.tools.setOnlyTargetState({ mobid: 1191, value: 0 }); f.tools.setOnlyTargetOptions([{ id: 1191, name: '邪恶箱' }]);
    const checkbox = f.root.querySelector<HTMLInputElement>('[data-target-id="1191"]')!;
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.sendTarget).toHaveBeenCalledWith(1191, true);
    vi.advanceTimersByTime(5000);
    expect(checkbox.checked).toBe(false); expect(f.tools.setStatus.mock.lastCall?.[0]).not.toBe('');
    f.tools.setOnlyTargetState({ mobid: 1191, value: 1 });
    expect(checkbox.checked).toBe(true); expect(checkbox.disabled).toBe(false); expect(f.tools._onlyTargets).toContain(1191);
    expect(f.tools.setStatus).toHaveBeenLastCalledWith('');
    expect(f.requestSettings).not.toHaveBeenCalled(); expect(f.sendTarget).toHaveBeenCalledTimes(1);
  });

  it('keeps the warning until every expired field or target modification has settled', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 }));
    f.field('autoloot').value = '50'; f.tools.updateField('autoloot', f.field('autoloot'));
    f.tools.toggleOnlyTarget(1191, true); vi.advanceTimersByTime(5000);
    f.tools.setReloadInfo({ id: 20, value: 10 });
    expect(f.tools.setStatus.mock.lastCall?.[0]).not.toBe('');
    f.tools.setOnlyTargetState({ mobid: 1191, value: 1 });
    expect(f.tools.setStatus).toHaveBeenLastCalledWith('');
  });

  it('clears confirmed values when character identity changes on the same server', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.tools._assistSkills = [{ skillId: 28, level: 10, enabled: true }]; f.tools._onlyTargets = [1191];
    f.identity('3:character-b'); f.tools.restorePanel();
    expect(f.tools._settingState.autoloot).toBeUndefined();
    expect(f.field('autoloot').value).toBe(''); expect(f.option('autoAttack').indeterminate).toBe(true);
    expect(f.tools._assistSkills).toEqual([]); expect(f.tools._onlyTargets).toEqual([]);
  });

  it('does not invalidate the first native target query started after changing characters', async () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    let resolve!: (value: { worldData: Values; mobData: Values }) => void;
    const mapData = new Promise<{ worldData: Values; mobData: Values }>(done => { resolve = done; });
    f.mapData(() => mapData); f.targets([{ id: 1191, name: '邪恶箱' }]); f.identity('3:character-b');
    const ready = f.tools.onMapChanged();
    expect(f.tools._settingState.autoloot).toBeUndefined(); expect(f.requestSettings).not.toHaveBeenCalled();
    f.sync.onMapReady(); expect(f.requestSettings).toHaveBeenCalledTimes(1);
    resolve({ worldData: {}, mobData: {} }); await ready;
    expect(f.root.querySelector('[data-target-id="1191"]')).not.toBeNull();
    expect(f.root.querySelector('[data-targets]')!.textContent).toContain('邪恶箱');
  });

  it('does not allow an old pending timeout to unlock a new character', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.field('autoloot').value = '1'; f.tools.updateField('autoloot', f.field('autoloot'));
    vi.advanceTimersByTime(1000); f.identity('3:character-b'); f.tools.restorePanel();
    vi.advanceTimersByTime(4000);
    expect(f.field('autoloot').disabled).toBe(true); expect(f.field('autoloot').value).toBe('');
  });

  it('resets confirmed values on explicit logout reset and does not request while disconnected', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 10000 }));
    f.connect(false); f.sync.reset(); f.sync.request();
    expect(f.requestSettings).not.toHaveBeenCalled();
    expect(f.tools._settingState.autoloot).toBeUndefined(); expect(f.field('autoloot').disabled).toBe(true);
    expect(f.tools.setStatus).toHaveBeenLastCalledWith('');
  });

  it('stores server target changes even when a target is not rendered yet', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot());
    f.tools.setOnlyTargetState({ mobid: 1191, value: 1 });
    expect(f.tools._onlyTargets).toContain(1191);
    f.tools.setOnlyTargetOptions([{ id: 1191, name: '邪恶箱' }]);
    expect(f.root.querySelector<HTMLInputElement>('[data-target-id="1191"]')!.checked).toBe(true);
    f.tools.setOnlyTargetState({ mobid: 1191, value: 0 });
    expect(f.tools._onlyTargets).not.toContain(1191);
    expect(f.root.querySelector<HTMLInputElement>('[data-target-id="1191"]')!.checked).toBe(false);
  });

  it('wires the native input change listener through the server-confirmed edit handler', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 }));
    f.field('autoloot').value = '0.1'; f.field('autoloot').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.sendUpdates).toHaveBeenCalledTimes(1); expect(f.sendUpdates).toHaveBeenCalledWith([{ id: 20, value: 10 }]);
    expect(f.tools._settingState.autoloot).toBe(100);
  });

  it('acknowledges only the edited field whose server delta arrived', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100, pmdis: 3 }));
    f.field('autoloot').value = '100'; f.tools.updateField('autoloot', f.field('autoloot'));
    f.field('pmdis').value = '7'; f.tools.updateField('pmdis', f.field('pmdis'));
    f.tools.setReloadInfo({ id: 1, value: 6 });
    expect(f.field('pmdis').disabled).toBe(false); expect(f.field('pmdis').value).toBe('6');
    expect(f.field('autoloot').disabled).toBe(true); expect(f.tools._settingState.autoloot).toBe(100);
    f.tools.setReloadInfo({ id: 20, value: 10000 });
    expect(f.field('autoloot').disabled).toBe(false); expect(f.field('autoloot').value).toBe('100');
  });

  it('ignores repeated snapshot requests while one is pending without extending its timeout', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot()); f.sync.request();
    vi.advanceTimersByTime(1000); f.sync.request(); vi.advanceTimersByTime(1000); f.tools.restorePanel();
    expect(f.requestSettings).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000); expect(f.field('autoloot').disabled).toBe(false);
  });

  it('a full snapshot settles pending scalar and toggle edits using returned values', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 }));
    f.field('autoloot').value = '100'; f.tools.updateField('autoloot', f.field('autoloot')); f.tools.setAutomationOption('autoAttack', true);
    f.tools.setLoadInfo(snapshot({ autoloot: 1000, startAutoAtk: 0 }));
    expect(f.field('autoloot').value).toBe('10'); expect(f.field('autoloot').disabled).toBe(false);
    expect(f.option('autoAttack').checked).toBe(false); expect(f.option('autoAttack').disabled).toBe(false);
  });

  it.each([['autoloot', '-1'], ['autoloot', '100.1'], ['autoloot', ''], ['pmdis', '13'], ['pmdis', '1.5'], ['AutoUseWing_time', '4']])('does not send invalid %s value %s', (name, value) => {
    const f = fixture(); f.tools.setLoadInfo(snapshot()); f.field(name).value = value; f.tools.updateField(name, f.field(name));
    expect(f.sendUpdates).not.toHaveBeenCalled(); expect(f.field(name).disabled).toBe(false);
  });

  it('a transport rejection leaves the confirmed scalar editable', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 })); f.sendUpdates.mockReturnValueOnce(false);
    f.field('autoloot').value = '50'; f.tools.updateField('autoloot', f.field('autoloot'));
    expect(f.tools._settingState.autoloot).toBe(100); expect(f.field('autoloot').disabled).toBe(false);
  });

  it('a rejected snapshot request does not block the confirmed fields for five seconds', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ autoloot: 100 })); f.requestSettings.mockReturnValueOnce(false); f.sync.request();
    expect(f.field('autoloot').disabled).toBe(false); expect(f.field('autoloot').value).toBe('1');
  });

  it('does not send a mutation after the player connection becomes unavailable', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot()); f.connect(false);
    f.field('autoloot').value = '50'; f.tools.updateField('autoloot', f.field('autoloot')); f.tools.setAutomationOption('autoAttack', true);
    expect(f.sendUpdates).not.toHaveBeenCalled(); expect(f.sendToggle).not.toHaveBeenCalled();
  });

  it('binds slot-item deltas to the selected HP or SP slot and clears cursor on a full snapshot', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot());
    f.tools.setReloadInfo({ id: 57, value: 4 }); f.tools.setReloadInfo({ id: 58, value: 503 });
    expect(f.tools._settingState.AutoUseItem_sp_1).toBe(503);
    expect(f.tools._settingState.AutoUseItem_hp_1).toBeUndefined();
    expect(f.field('AutoUseItem_sp_1').value).toBe('503');
    f.tools.setLoadInfo(snapshot()); f.tools.setReloadInfo({ id: 58, value: 504 });
    expect(f.tools._settingState.AutoUseItem_sp_1).toBeUndefined();
    expect(f.tools._settingState.AutoUseItem_hp_1).toBeUndefined();
  });

  it('does not turn an unavailable confirmed potion into a different selected item during inventory refresh', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot()); f.tools.setReloadInfo({ id: 57, value: 1 }); f.tools.setReloadInfo({ id: 58, value: 503 });
    f.inventory([]); f.tools.populateItemSelects();
    expect(f.tools._settingState.AutoUseItem_hp_1).toBe(503); expect(f.field('AutoUseItem_hp_1').value).toBe('503');
    expect(f.sendUpdates).not.toHaveBeenCalled();
  });

  it('keeps an unavailable server-selected skill visible without sending a replacement', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot({ AutoUseSkillid: 28 })); f.skills([]); f.tools.populateSkillSelects();
    expect(f.tools._settingState.AutoUseSkillid).toBe(28); expect(f.field('AutoUseSkillid').value).toBe('28');
    expect(f.sendUpdates).not.toHaveBeenCalled();
  });

  it('keeps the assist editor pending without creating an unconfirmed active assist list', () => {
    const f = fixture(); f.tools.setLoadInfo(snapshot()); f.tools.submitAssistSkill({ skillId: 28, level: 7, enabled: true });
    expect(f.sendUpdates).toHaveBeenCalledWith([{ id: 53, value: 28 }, { id: 54, value: 7 }, { id: 55, value: 1 }]);
    expect(f.tools._assistSkills).toEqual([]); expect(f.field('addiskillid').disabled).toBe(true);
    f.tools.setReloadInfo({ id: 53, value: 28 }); f.tools.setReloadInfo({ id: 54, value: 6 }); f.tools.setReloadInfo({ id: 55, value: 0 });
    expect(f.field('addiskilllv').value).toBe('6'); expect((f.field('addiskillop') as HTMLInputElement).checked).toBe(false);
    expect(f.tools._assistSkills).toEqual([]);
  });
});

describe('actual 58-byte server settings packet', () => {
  it('reads every field at the official offset, including the protection byte before start toggles', () => {
    const bytes = Uint8Array.from({ length: 58 }, (_, index) => index), view = new DataView(bytes.buffer);
    view.setInt32(18, 10000, true); view.setUint16(10, 513, true); view.setUint16(47, 1025, true); view.setUint16(51, 769, true);
    bytes[41] = 1; bytes[42] = 0; bytes[43] = 1; bytes[44] = 0; bytes[45] = 1;
    const parsed = packet(bytes);
    const byOffset: Record<number, string> = {
      2: 'pmdis', 3: 'mgdis', 4: 'AutoUseWing_time', 5: 'usehpConversion', 6: 'AutoSeeBoss', 7: 'qomobnumMin', 8: 'qomobnum', 9: 'usealheal',
      12: 'qo_AutoUseSkilllv', 13: 'MinHpValFly', 14: 'MinSpValFly', 15: 'MinHpVal', 16: 'useBoarding', 17: 'petTurnEgg',
      22: 'AutoUseItem_reHpVal', 23: 'AutoUseItem_reSpVal', 24: 'AutoUseItem_jsys', 25: 'AutoUseItem_Elemental', 26: 'AutoUseItem_Panacea',
      27: 'useSiegfried', 28: 'AutoAttackstatus', 29: 'AutofollowMode', 30: 'disTarget', 31: 'addisTarget', 32: 'aidddis_reHpVal', 33: 'aidddis_reSpVal',
      34: 'AutoUseSit', 35: 'AutoUseSit_reHpVal', 36: 'AutoUseSit_reSpVal', 37: 'AutoUseSit_reHpUpVal', 38: 'AutoUseSit_reSpUpVal', 39: 'AutoUseSit_xw',
      40: 'onlynoattack', 41: 'AutoUseItem_Protection', 42: 'startAutoAtk', 43: 'startAutoLoot', 44: 'startAutopots', 45: 'startAutofollow',
      46: 'searchMode', 49: 'AutoUseSkilllv', 50: 'useSkill_pro', 53: 'ProtectTeam', 54: 'keepwayOp', 55: 'useManuals', 56: 'useBubbles', 57: 'useAspersio',
    };
    for (const [offset, field] of Object.entries(byOffset)) expect(parsed.state[field], `${field} offset ${offset}`).toBe(bytes[Number(offset)]);
    expect(parsed.state.autoloot).toBe(10000); expect(parsed.state.qo_AutoUseSkillid).toBe(513);
    expect(parsed.state.AutoUseSkillid).toBe(1025); expect(parsed.state.AutoUseItem_Elementalid).toBe(769);
    expect(parsed.offset).toBe(58); expect(parsed.state).not.toHaveProperty('reserved');
  });

  it('renders real decoded protection and auto-attack independently with no one-byte shift', () => {
    const f = fixture(), bytes = new Uint8Array(58);
    bytes[41] = 1; bytes[42] = 0; bytes[43] = 1; bytes[44] = 0; bytes[45] = 1; bytes[49] = 8; bytes[50] = 40;
    new DataView(bytes.buffer).setInt32(18, 10000, true);
    f.tools.setLoadInfo(packet(bytes).state);
    expect((f.field('AutoUseItem_Protection') as HTMLInputElement).checked).toBe(true);
    expect(f.option('autoAttack').checked).toBe(false); expect(f.option('autoLoot').checked).toBe(true);
    expect(f.option('autoPots').checked).toBe(false); expect(f.option('autoFollow').checked).toBe(true);
    expect(f.field('AutoUseSkilllv').value).toBe('8'); expect(f.field('useSkill_pro').value).toBe('40'); expect(f.field('autoloot').value).toBe('100');
  });
});

describe('native runtime request and update wiring', () => {
  it('imports every referenced migration helper before installing the actual runtime adapter', () => {
    const dependencies = ts.createSourceFile('Automation.deps.js', `const deps = ${adapterSource};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const references = new Set<string>();
    function inspect(node: ts.Node) {
      if (ts.isIdentifier(node) && Object.hasOwn(migration, node.text)) references.add(node.text);
      ts.forEachChild(node, inspect);
    }
    inspect(dependencies);
    expect(references.has('AUTO_BATTLE_ITEM_SLOT_FIELDS')).toBe(true);
    for (const name of references) expect(migrationBindings, `actual adapter dependency: ${name}`).toHaveProperty(name);
  });

  it('uses the real lastroCustomPackets flag and native character identity gate', () => {
    const adapter = nativeAdapter();
    const initialIdentity = adapter.deps.getIdentity();
    expect(typeof initialIdentity).toBe('string'); expect(initialIdentity).toContain(':1234'); expect(adapter.deps.canRequest()).toBe(true);
    adapter.session.GID = 1235; expect(adapter.deps.getIdentity()).not.toBe(initialIdentity); adapter.session.GID = 1234;
    adapter.flags.lastroCustomPackets = false; expect(adapter.deps.canRequest()).toBe(false);
    adapter.flags.lastroCustomPackets = true; adapter.map.loading = true; expect(adapter.deps.canRequest()).toBe(false);
    adapter.map.loading = false; adapter.session.Entity = null; expect(adapter.deps.canRequest()).toBe(false);
    adapter.session.Playing = false; expect(adapter.deps.getIdentity()).toBeNull(); expect(adapter.deps.canRequest()).toBe(false);
  });

  it('requests settings after the first ready map and serializes the actual two-byte request', async () => {
    const adapter = nativeAdapter(); adapter.map.loading = true;
    const f = fixture(3, adapter.deps); f.tools.restorePanel(); expect(adapter.sent).toEqual([]);
    adapter.map.loading = false; nativeMapLoad(f.tools, adapter); await Promise.resolve();
    expect(adapter.sent).toHaveLength(2);
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0], [0xff, 0x0a]]);
    const bytes = new Uint8Array(58), view = new DataView(bytes.buffer); view.setUint16(0, 2805, true); view.setInt32(18, 10000, true);
    bytes[41] = 1; bytes[42] = 0; bytes[43] = 1;
    f.tools.setLoadInfo(packet(bytes).state);
    expect(f.field('autoloot').value).toBe('100'); expect(f.field('autoloot').disabled).toBe(false);
    expect((f.field('AutoUseItem_Protection') as HTMLInputElement).checked).toBe(true); expect(f.option('autoAttack').checked).toBe(false);
  });

  it('retains confirmed settings and sends no additional read on a second map or repeated window openings', async () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps);
    nativeMapLoad(f.tools, adapter); await Promise.resolve();
    f.tools.setLoadInfo(snapshot({ autoloot: 10 }));
    vi.advanceTimersByTime(5000); f.tools.restorePanel(); f.tools.restorePanel();
    nativeMapLoad(f.tools, adapter, 'geffen.gat'); await Promise.resolve();
    f.tools.restorePanel(); vi.advanceTimersByTime(5000); f.tools.restorePanel();
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0], [0xff, 0x0a], [0x7d, 0]]);
    expect(f.field('autoloot').value).toBe('0.1'); expect(f.field('autoloot').disabled).toBe(false);
  });

  it('uses a full server push received before the first ready map without sending a duplicate read', async () => {
    const adapter = nativeAdapter(); adapter.map.loading = true;
    const f = fixture(3, adapter.deps); f.tools.setLoadInfo(snapshot({ autoloot: 10, startAutoAtk: 1 }));
    expect(f.field('autoloot').disabled).toBe(true);
    adapter.map.loading = false; nativeMapLoad(f.tools, adapter); await Promise.resolve();
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0]]);
    expect(f.field('autoloot').value).toBe('0.1'); expect(f.field('autoloot').disabled).toBe(false);
    expect(f.option('autoAttack').checked).toBe(true);
    expect(f.tools._settingState.AutoUseItem_hp_1).toBeUndefined();
    expect(f.tools._onlyTargets).toEqual([]);
    f.tools.restorePanel(); expect(adapter.sent).toHaveLength(1);
  });

  it('does not retry a failed login read when opening the panel or entering another map', async () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps);
    nativeMapLoad(f.tools, adapter); await Promise.resolve();
    vi.advanceTimersByTime(5000);
    expect(f.field('autoloot').disabled).toBe(true); expect(f.field('autoloot').value).toBe('');
    f.tools.restorePanel(); nativeMapLoad(f.tools, adapter, 'geffen.gat'); await Promise.resolve();
    vi.advanceTimersByTime(5000); f.tools.restorePanel();
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0], [0xff, 0x0a], [0x7d, 0]]);
    expect(f.tools._settingState.autoloot).toBeUndefined();
    expect(f.sync.request()).toBe(true);
    expect([...adapter.sent.at(-1)!.build!().bytes]).toEqual([0xff, 0x0a]);
  });

  it('reads again after actual logout cleanup even when the profile, character and entity token are unchanged', async () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps);
    nativeMapLoad(f.tools, adapter); await Promise.resolve(); f.tools.setLoadInfo(snapshot({ autoloot: 10 }));
    nativeLogout(f.tools); expect(f.tools._settingState.autoloot).toBeUndefined();
    f.tools.restorePanel(); expect(adapter.sent).toHaveLength(2);
    nativeMapLoad(f.tools, adapter); await Promise.resolve();
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0], [0xff, 0x0a], [0x7d, 0], [0xff, 0x0a]]);
  });

  it('detects a fresh player session for the same character even without observing Playing=false', async () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps);
    const originalIdentity = adapter.deps.getIdentity();
    nativeMapLoad(f.tools, adapter); await Promise.resolve(); f.tools.setLoadInfo(snapshot({ autoloot: 10 }));
    adapter.session.Entity = { position: [25, 41] };
    expect(adapter.deps.getIdentity()).toBe(originalIdentity);
    f.tools.restorePanel(); expect(f.tools._settingState.autoloot).toBeUndefined(); expect(adapter.sent).toHaveLength(2);
    nativeMapLoad(f.tools, adapter); await Promise.resolve();
    expect(adapter.sent.map(value => [...value.build!().bytes])).toEqual([[0x7d, 0], [0xff, 0x0a], [0x7d, 0], [0xff, 0x0a]]);
  });

  it('blocks reads and edits between map-change setup and the post-ACTORINIT ready hook', async () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps);
    f.tools.setLoadInfo(snapshot({ autoloot: 10 })); await f.tools.onMapChanged();
    expect(f.field('autoloot').disabled).toBe(true); expect(f.sync.request()).toBe(false);
    f.field('autoloot').value = '50'; f.tools.updateField('autoloot', f.field('autoloot'));
    expect(adapter.sent).toEqual([]);
    adapter.session.Playing = false; expect(f.sync.onMapReady()).toBe(false);
    expect(adapter.sent).toEqual([]); expect(f.tools._settingState.autoloot).toBeUndefined();
  });

  it('requires exactly one actual map-entry confirmation anchor and rejects reapplying the patch', () => {
    const from = native.indexOf('//#region src/Engine/MapEngine.js'), to = native.indexOf('//#endregion', from);
    const engine = native.slice(from, to);
    const anchor = '    Network.sendPacket(new PACKET.CZ.NOTIFY_ACTORINIT());';
    expect(engine.split(anchor)).toHaveLength(2);
    const prefix = native.slice(0, from), suffix = native.slice(to);
    expect(() => patchRuntimeAutomationSync(prefix + engine.replace(anchor, '') + suffix)).toThrow('anchor:automation-sync:map-ready');
    expect(() => patchRuntimeAutomationSync(prefix + engine.replace(anchor, anchor + '\n' + anchor) + suffix)).toThrow('anchor:automation-sync:map-ready');
    expect(() => patchRuntimeAutomationSync(patched)).toThrow(/^anchor:automation-sync:/);
    expect(patchRuntimeAutomationSync('const unrelated = true;')).toBe('const unrelated = true;');
  });

  it('serializes a native percent update and displays the clamped value from the real delta parser', () => {
    const adapter = nativeAdapter(), f = fixture(3, adapter.deps); f.tools.setLoadInfo(snapshot({ autoloot: 100 }));
    f.field('autoloot').value = '100'; f.field('autoloot').dispatchEvent(new Event('change', { bubbles: true }));
    expect(adapter.sent).toHaveLength(1);
    const outgoing = adapter.sent[0]!, wire = outgoing.build!().bytes;
    expect([...wire.slice(0, 3)]).toEqual([0xfe, 0x0a, 20]); expect(new DataView(wire.buffer).getInt32(3, true)).toBe(10000);
    expect(f.tools._settingState.autoloot).toBe(100); expect(f.field('autoloot').disabled).toBe(true);
    f.tools.setReloadInfo(reloadBytes(20, 9000));
    expect(f.tools._settingState.autoloot).toBe(9000); expect(f.field('autoloot').value).toBe('90'); expect(f.field('autoloot').disabled).toBe(false);
    expect(adapter.sent).toHaveLength(1);
  });

  it.each([3, 5, 6])('keeps native toggle and offline packet behavior for profile %i without optimistic state', nid => {
    const adapter = nativeAdapter(nid), f = fixture(nid, adapter.deps); f.tools.setLoadInfo(snapshot());
    const input = f.option('autoAttack'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(adapter.sent).toHaveLength(2);
    if (nid === 3) expect(adapter.sent[0]).toMatchObject({ receiver: 'NPC:setautoattack', msg: '0' });
    else {
      const bytes = adapter.sent[0]!.build!().bytes;
      expect([...bytes]).toEqual([0xfe, 0x0a, 34, 1, 0, 0, 0]);
    }
    expect(adapter.sent[1]).toMatchObject({ receiver: 'NPC:setoffline', msg: '0' });
    expect(f.tools._settingState.autoAttack).toBe(false); expect(input.disabled).toBe(true);
    f.tools.setReloadInfo(reloadBytes(34, 0));
    expect(input.checked).toBe(false); expect(input.disabled).toBe(false);
    expect(adapter.sent).toHaveLength(2);
  });
});
