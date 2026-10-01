// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The native migration helpers have no declaration file.
import * as migration from '../vendor/v2/lastro-v1-migration.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
function region(name: string) {
  const from = native.indexOf('//#region ' + name), to = native.indexOf('//#endregion', from);
  if (from < 0 || to < from) throw new Error('Missing native region: ' + name);
  return native.slice(from, to);
}
const toolsFile = ts.createSourceFile('LastROTools.js', region('src/UI/Components/LastROTools/LastROTools.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const assignments = new Map<string, string>();
function collect(node: ts.Node) {
  if (ts.isBinaryExpression(node) && !assignments.has(node.left.getText(toolsFile))) assignments.set(node.left.getText(toolsFile), node.right.getText(toolsFile));
  ts.forEachChild(node, collect);
}
collect(toolsFile);
function assigned(name: string) {
  const result = assignments.get(name);
  if (!result) throw new Error('Missing native assignment: ' + name);
  return result;
}
const template = runInNewContext(assigned('LastROTools_default$1')) as string;
const mapFile = ts.createSourceFile('MapEngine.js', region('src/Engine/MapEngine.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let mapLoadSource = '';
function collectMapLoad(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'onMapChange') {
    function inspect(child: ts.Node) {
      if (ts.isBinaryExpression(child) && child.left.getText(mapFile) === 'MapRenderer.onLoad') mapLoadSource = child.right.getText(mapFile);
      ts.forEachChild(child, inspect);
    }
    inspect(node);
  }
  ts.forEachChild(node, collectMapLoad);
}
collectMapLoad(mapFile);
if (!mapLoadSource) throw new Error('Missing native map ready callback');

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
interface Tools {
  _settingState: Record<string, unknown>; _onlyTargets?: number[];
  init(): void; restorePanel(): void; onMapChanged(): Promise<void>;
  setOnlyTargetOptions(targets: Array<{ id: number; name: string }>): void;
  setOnlyTargetState(packet: { mobid: number; value: number }): void;
  setLoadInfo(packet: Record<string, unknown>): void; setReloadInfo(packet: { id: number; value: number }): void;
  toggleOnlyTarget(id: number, enabled: boolean, checkbox?: HTMLInputElement): unknown;
}
afterEach(() => { document.body.replaceChildren(); });
function fixture(nid = 3) {
  const sent: OutgoingPacket[] = [];
  const from = native.indexOf('  PACKET.CZ.NOTIFY_ACTORINIT = function'), to = native.indexOf('  PACKET.CZ.REQUEST_CARDCONNECTION_RECHARGE =', from);
  if (from < 0 || to < from) throw new Error('Missing native packet factories');
  const PACKET = runInNewContext(native.slice(from, to) + '\nPACKET;', { PACKET: { CZ: {} }, BinaryWriter: PacketWriter });
  PACKET.CZ.WHISPER = class { receiver = ''; msg = ''; };
  const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div'); container.className = 'ui-component-root'; container.innerHTML = template;
  root.append(container); document.body.append(host);
  const tools = {
    _host: host, getRoot: () => root,
    loadQuickRoutes() {}, ensurePanelOpener: () => null, collapseDetailedSettings() {},
    setStatus: vi.fn(), append: vi.fn(),
  } as unknown as Tools;
  const Configs = { get: (name: string, fallback?: unknown) => name === 'lastroNid' ? nid : name === 'lastroCustomPackets' ? true : fallback };
  const Network = { sendPacket: (value: OutgoingPacket) => sent.push(value) };
  const globals = {
    ...migration, document, PACKET, Network, Configs,
    OPTION_TO_PACKET_ID: runInNewContext(assigned('OPTION_TO_PACKET_ID')),
    SCALAR_FIELD_BY_ID: Object.fromEntries(Object.entries(migration.AUTO_BATTLE_SCALAR_IDS).map(([field, id]) => [String(id), field])),
    getLastROInventoryItems: () => [], getLastROLearnedSkills: () => [], SkillInfo: {},
    installLastRORandomTeleportShortcut() {}, showLastROSettingsView() {}, showLastROMainView() {}, activateLastROSettingsTab() {},
    MapRenderer: { currentMap: 'prontera.gat' }, loadWorldMapData: async () => ({ worldData: {}, mobData: {} }),
    getMapTargetOptions: () => [{ id: 1002, name: '波利' }, { id: 1007, name: '疯兔' }],
  };
  for (const name of ['init', 'restorePanel', 'onMapChanged', 'setOnlyTargetOptions', 'toggleOnlyTarget', 'setOnlyTargetState', 'setAutomationOption', 'updateField', 'setLoadInfo', 'setReloadInfo', 'applyState', 'populateItemSelects', 'populateSkillSelects', 'getOptionLabel', 'renderCompactStatus', 'submitAssistSkill', 'renderAssistSkillList']) {
    Object.assign(tools, { [name]: runInNewContext(`(${assigned('LastROTools.' + name)})`, globals) });
  }
  tools.init();
  const field = (name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)!;
  const option = (name: string) => root.querySelector<HTMLInputElement>(`[data-option="${name}"]`)!;
  const targets = () => [...root.querySelectorAll<HTMLInputElement>('[data-target-id]')];
  return { tools, root, sent, PACKET, Configs, Network, field, option, targets };
}
function mapReady(f: ReturnType<typeof fixture>) {
  const ui = { append() {}, setMap() {} };
  const components = Object.fromEntries([
    'ChatBox', 'ChatBoxSettings', 'Escape', 'CartItems', 'Vending', 'ChangeCart', 'CartDecoration', 'ShortCuts', 'StatusIcons',
    'ShortCut', 'ChatRoomCreate', 'Emoticons', 'FPS', 'Guild', 'WorldMap', 'MobileUI', 'JoystickUI', 'Navigation', 'Roulette',
  ].map(name => [name + '_default', ui]));
  const controllers = Object.fromEntries([
    'Controller$5', 'BasicInfoController', 'InventoryController', 'EquipmentController', 'Controller$4', 'controller', 'WinStatsController', 'Controller$3',
  ].map(name => [name, { getUI: () => ui }]));
  const load = runInNewContext(`(${mapLoadSource})`, {
    ...components, ...controllers, pkt: { xPos: 25, yPos: 41 }, resetEntityForMapEntry() {}, EntityManager: { add() {} },
    SessionStorage_default: { Entity: { effectState: 0, aura: { free() {}, load() {} } } },
    StatusState_default: { EffectState: { FALCON: 1, WUG: 2 } }, EffectManager: {}, MapRenderer: { currentMap: 'prontera.gat' },
    DB: { getAllSignboardsForMap: () => null }, Camera: { setTarget() {}, init() {} },
    LastROTools: f.tools, SkillListMH_default: { homunculus: ui, mercenary: ui }, Configs: f.Configs,
    PacketVerManager_default: { value: 0 }, Plugins: { init() {} }, PACKET: f.PACKET, Network: f.Network, shouldUseLegacyMapEnter: () => true,
  });
  load();
}

describe('native automation without automatic settings reads or confirmation gates', () => {
  it('packages no added synchronization installer, settings read or indeterminate control override', () => {
    const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
    expect(runtime).not.toContain('_lastroAutomationSync');
    expect(runtime).not.toMatch(/new\s+PACKET\.CZ\.NOTIFY_LOADINFO\s*\(/);
    expect(runtime).not.toContain('input.indeterminate');
  });

  it('starts with an editable empty target selection and sends no read on init, reopen or map changes', async () => {
    const f = fixture(); f.tools.restorePanel(); await f.tools.onMapChanged(); await f.tools.onMapChanged();
    expect(f.targets()).toHaveLength(2);
    for (const input of f.targets()) { expect(input.checked).toBe(false); expect(input.indeterminate).toBe(false); expect(input.disabled).toBe(false); }
    expect(f.option('autoAttack').disabled).toBe(false); expect(f.option('autoAttack').indeterminate).toBe(false);
    expect(f.sent).toEqual([]); expect('_lastroAutomationSync' in f.tools).toBe(false);
  });

  it('selects and deselects the actual target checkbox immediately without a server snapshot or acknowledgement', async () => {
    const f = fixture(); await f.tools.onMapChanged(); const input = f.targets()[0]!;
    input.click(); expect(input.checked).toBe(true); expect(f.tools._onlyTargets).toEqual([1002]);
    input.click(); expect(input.checked).toBe(false); expect(f.tools._onlyTargets).toEqual([]);
    expect(input.disabled).toBe(false); expect(input.indeterminate).toBe(false);
    expect(f.sent.map(packet => ({ id: packet.id, value: packet.value }))).toEqual([{ id: 1002, value: 1 }, { id: 1002, value: 0 }]);
    expect(f.sent.map(packet => [...packet.build!().bytes])).toEqual([[0xfd, 0x0a, 0xea, 3, 0, 0, 1], [0xfd, 0x0a, 0xea, 3, 0, 0, 0]]);
  });

  it('allows an upstream server-selected target to be cleared without waiting for another response', async () => {
    const f = fixture(); await f.tools.onMapChanged(); f.tools.setOnlyTargetState({ mobid: 1002, value: 1 });
    const input = f.targets()[0]!; expect(input.checked).toBe(true); input.click();
    expect(input.checked).toBe(false); expect(input.disabled).toBe(false); expect(input.indeterminate).toBe(false);
    expect(f.sent[0]).toMatchObject({ id: 1002, value: 0 });
  });

  it('sends only native ACTORINIT when the real map ready callback runs', () => {
    const f = fixture(); mapReady(f);
    expect(f.sent.map(packet => [...packet.build!().bytes])).toEqual([[0x7d, 0]]);
  });

  it.each([3, 5, 6])('keeps profile %i auto battle online and editable before any settings push', nid => {
    const f = fixture(nid), input = f.option('autoAttack'); input.click(); input.click();
    expect(f.tools._settingState.autoAttack).toBe(false); expect(input.disabled).toBe(false); expect(input.indeterminate).toBe(false);
    if (nid === 3) expect(f.sent).toEqual([expect.objectContaining({ receiver: 'NPC:setautoattack', msg: '0' }), expect.objectContaining({ receiver: 'NPC:setautoattack', msg: '0' })]);
    else expect(f.sent.map(packet => ({ id: packet.id, value: packet.value }))).toEqual([{ id: 34, value: 1 }, { id: 34, value: 1 }]);
    expect(f.sent.some(packet => packet.receiver === 'NPC:setoffline')).toBe(false);
  });

  it('retains upstream field updates and passive settings pushes without disabling controls', () => {
    const f = fixture(); f.field('autoloot').value = '25'; f.field('autoloot').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.sent[0]).toMatchObject({ id: 20, value: 2500 }); expect(f.field('autoloot').disabled).toBe(false);
    f.tools.setLoadInfo({ autoloot: 100, startAutoAtk: 1, startAutoLoot: 1, startAutopots: 0, startAutofollow: 0 });
    expect(f.field('autoloot').value).toBe('1'); expect(f.option('autoAttack').checked).toBe(true);
    f.tools.setReloadInfo({ id: 20, value: 9000 }); expect(f.field('autoloot').value).toBe('90');
    expect(f.option('autoAttack').indeterminate).toBe(false); expect(f.sent).toHaveLength(1);
  });
});
