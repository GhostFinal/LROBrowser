import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLastroQuestData } from '../scripts/lastro-quest-data.mjs';
import { installLastroQuestBridge, patchRuntimeQuests } from '../scripts/lastro-quest-runtime.mjs';

type Goal = { huntID?: number; mobGID: number; huntCount: number; maxCount: number; };
type Quest = { questID: number; active: number; hunt_list: Record<string, Goal>; [key: string]: unknown; };
function fixture() {
  let quests: Record<string, Quest> = {}, ready = true;
  const query = vi.fn();
  const ui = {
    setQuestList: vi.fn((values: Record<string, Quest>) => { quests = values; }),
    addQuest: (value: Quest, id: number) => { quests[id] = value; },
    updateMissionHunt: (update: Partial<Goal>, id: number, huntID: number) => { Object.assign(quests[id]!.hunt_list[huntID]!, update); },
    removeQuest: (id: number) => { delete quests[id]; },
    onAppend: vi.fn(), onRemove: vi.fn(), clean: () => { quests = {}; }, toggle: vi.fn(), onShortCut: vi.fn(),
  };
  const data = createLastroQuestData({ getInfo: () => ({ Title: '任务', Description: ['任务信息'] }), getMonsterName: () => '波利', isLastro: true });
  const quest = installLastroQuestBridge(ui, { data, getQuests: () => quests, canRefresh: () => ready, queryHuntingList: query });
  return { quest, quests: () => quests, query, ready: (value: boolean) => { ready = value; } };
}
const snapshot = (count = 0) => ({ HuntingList: [{ questID: 30001, mobGID: 1002, maxCount: 80, count }] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => vi.useRealTimers());

describe('native bounty snapshot bridge', () => {
  it('merges bounty snapshots with ordinary accepted quests and treats empty snapshots as removal', () => {
    const f = fixture();
    f.quest.setQuestList({ 7: { questID: 7, active: 0, hunt_list: {} } });
    f.quest.receiveHuntingList(snapshot(3));
    expect(f.quests()[30001]?.hunt_list[1002]).toMatchObject({ mobGID: 1002, huntCount: 3, maxCount: 80 });
    expect(f.quests()[7]?.active).toBe(0);
    f.quest.setQuestList({ 8: { questID: 8, active: 1, hunt_list: {} } });
    expect(Object.keys(f.quests())).toEqual(['8', '30001']);
    f.quest.receiveHuntingList({ HuntingList: [] });
    expect(Object.keys(f.quests())).toEqual(['8']);
  });

  it('keeps standard hunt identifiers separate from actual monster IDs and accepts zero progress', () => {
    const f = fixture();
    f.quest.setQuestList({ 7: { questID: 7, active: 1, hunt_list: { 9001: { huntID: 9001, mobGID: 1002, huntCount: 4, maxCount: 9 } } } });
    f.quest.receiveHuntingList(snapshot(8));
    f.quest.updateMissionHunt({ huntCount: 0 }, 30001, 1002);
    f.quest.updateMissionHunt({ huntCount: 0 }, 7, 9001);
    f.quest.addQuest({ questID: 8, active: 1, hunt_list: {} }, 8);
    expect(f.quests()[30001]?.hunt_list[1002]?.huntCount).toBe(0);
    expect(f.quests()[7]?.hunt_list[9001]).toMatchObject({ mobGID: 1002, huntID: 9001, huntCount: 0 });
  });

  it('does not resurrect a removed bounty on a later ordinary list rebuild', () => {
    const f = fixture(); f.quest.receiveHuntingList(snapshot()); f.quest.removeQuest(30001);
    f.quest.addQuest({ questID: 7, active: 1, hunt_list: {} }, 7);
    expect(Object.keys(f.quests())).toEqual(['7']);
  });

  it('does not copy ordinary progress into a private goal with the same quest and mob', () => {
    const f = fixture();
    f.quest.setQuestList({ 30001: { questID: 30001, active: 1, hunt_list: { 1002: { huntID: 1002, mobGID: 1002, huntCount: 4, maxCount: 9 } } } });
    f.quest.receiveHuntingList(snapshot(8));
    f.quest.updateMissionHunt({ huntCount: 0 }, 30001, 1002);
    f.quest.addQuest({ questID: 8, active: 1, hunt_list: {} }, 8);
    expect(f.quests()[30001]?.hunt_list[1002]?.huntCount).toBe(0);
    expect(f.quests()[30001]?.hunt_list['bounty:1002']).toMatchObject({ huntCount: 8, maxCount: 80 });
  });

  it('keeps progress when the native method resolves a hunt ID through its mobGID', () => {
    // The native patched method resolves huntID 17 to the bounty key 1002.
    const ui = {
      setQuestList: (values: Record<string, Quest>) => { current = values; },
      updateMissionHunt: (update: Partial<Goal>, id: number, huntID: number) => {
        expect(id).toBe(30001); expect(huntID).toBe(17);
        Object.assign(current[id]!.hunt_list[1002]!, update);
      },
      addQuest: (value: Quest, id: number) => { current[id] = value; }, removeQuest: () => {},
    };
    let current: Record<string, Quest> = {};
    const data = createLastroQuestData({ getInfo: () => ({}), getMonsterName: () => '波利', isLastro: true });
    const quest = installLastroQuestBridge(ui, { data, getQuests: () => current, canRefresh: () => false, queryHuntingList: vi.fn() });
    quest.receiveHuntingList(snapshot(4)); quest.updateMissionHunt({ mobGID: 1002, huntCount: 8 }, 30001, 17);
    quest.addQuest({ questID: 7, active: 1, hunt_list: {} }, 7);
    expect(current[30001]?.hunt_list[1002]?.huntCount).toBe(8);
  });

  it('ignores malformed packets without replacing accepted quests', () => {
    const f = fixture(); f.quest.receiveHuntingList(snapshot()); f.quest.receiveHuntingList({});
    expect(Object.keys(f.quests())).toEqual(['30001']);
  });

  it('bounds refresh requests, gates loading/logged-out state, and stops timers during map removal', () => {
    const f = fixture(); f.ready(false); f.quest.onAppend();
    expect(f.query).not.toHaveBeenCalled(); f.ready(true); vi.advanceTimersByTime(15000);
    expect(f.query).toHaveBeenCalledOnce(); f.quest.toggle(); f.quest.onShortCut({ cmd: 'TOGGLE' });
    expect(f.query).toHaveBeenCalledOnce(); vi.advanceTimersByTime(1000); f.quest.toggle();
    expect(f.query).toHaveBeenCalledTimes(2); f.quest.onRemove(); vi.advanceTimersByTime(60000);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('keeps a single interval after duplicate append and clears character state on logout', () => {
    const f = fixture(); f.quest.receiveHuntingList(snapshot()); f.quest.onAppend(); f.quest.onAppend();
    vi.advanceTimersByTime(30000); expect(f.query).toHaveBeenCalledTimes(3);
    f.quest.clean(); expect(f.quests()).toEqual({}); vi.advanceTimersByTime(60000);
    expect(f.query).toHaveBeenCalledTimes(3);
    f.quest.setQuestList({ 7: { questID: 7, active: 1, hunt_list: {} } });
    expect(Object.keys(f.quests())).toEqual(['7']); f.quest.onAppend(); expect(f.query).toHaveBeenCalledTimes(4);
  });

  it('recovers from a disconnected send rather than throwing in a polling callback', () => {
    const f = fixture(); f.query.mockImplementationOnce(() => { throw new Error('disconnected'); });
    expect(f.quest.refreshBounties()).toBe(false); vi.advanceTimersByTime(1000);
    expect(f.quest.refreshBounties()).toBe(true);
  });
});

const vendor = readFileSync(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
const patched = patchRuntimeQuests(vendor);
const file = ts.createSourceFile('Online.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const assignments = new Map<string, string>();
let bountyHook = '';
function extract(node: ts.Node) {
  if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)) {
    const left = node.left.getText(file);
    if (['PACKET.CZ.HUNTINGLIST', 'PACKET.CZ.HUNTINGLIST.prototype.build', 'PACKET.ZC.HUNTINGLIST'].includes(left)) assignments.set(left, node.getText(file));
  }
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'Network.hookPacket' && node.arguments[0]?.getText(file) === 'PACKET.ZC.HUNTINGLIST') bountyHook = node.getText(file);
  ts.forEachChild(node, extract);
}
extract(file);

describe('packaged quest protocol and native lifecycle patch', () => {
  it('retains and decodes the native 12-byte bounty rows and two-byte request opcode', () => {
    class BinaryWriter { bytes: Uint8Array; constructor(size: number) { this.bytes = new Uint8Array(size); } writeShort(value: number) { new DataView(this.bytes.buffer).setUint16(0, value, true); } }
    const context = { PACKET: { CZ: {}, ZC: {} }, BinaryWriter };
    runInNewContext([...assignments.values()].join(';\n') + ';', context);
    const packet = context.PACKET as unknown as { CZ: { HUNTINGLIST: new() => { build(): BinaryWriter } }; ZC: { HUNTINGLIST: new(fp: unknown, end: number) => { HuntingList: unknown[] } } };
    expect(new packet.CZ.HUNTINGLIST().build().bytes).toEqual(new Uint8Array([0x79, 0x02]));
    const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
    for (const [offset, qid, mob, max, count] of [[0, 30090, 1321, 50, 0], [12, 30001, 1002, 80, 11]]) {
      view.setUint32(offset!, qid!, true); view.setUint32(offset! + 4, mob!, true); view.setInt16(offset! + 8, max!, true); view.setInt16(offset! + 10, count!, true);
    }
    let cursor = 0;
    const fp = { tell: () => cursor, readULong: () => { const value = view.getUint32(cursor, true); cursor += 4; return value; }, readShort: () => { const value = view.getInt16(cursor, true); cursor += 2; return value; } };
    expect(new packet.ZC.HUNTINGLIST(fp, bytes.length).HuntingList).toEqual([
      { questID: 30090, mobGID: 1321, maxCount: 50, count: 0 }, { questID: 30001, mobGID: 1002, maxCount: 80, count: 11 },
    ]);
  });

  it('hooks bounty packets only for the active LastRO protocol and delegates to the native quest component', () => {
    const receiveHuntingList = vi.fn(); let enabled = true, handler: (value: unknown) => void = () => {};
    runInNewContext(bountyHook, { Network: { hookPacket: (_type: unknown, cb: typeof handler) => { handler = cb; } }, PACKET: { ZC: { HUNTINGLIST: {} } }, Configs: { get: () => enabled }, Controller$3: { getUI: () => ({ receiveHuntingList }) } });
    const packet = snapshot(); handler(packet); expect(receiveHuntingList).toHaveBeenCalledExactlyOnceWith(packet);
    enabled = false; handler(packet); expect(receiveHuntingList).toHaveBeenCalledOnce();
  });

  it('parses as JavaScript and patches all four zero-sensitive fields while preserving inactive state', () => {
    expect((file as ts.SourceFile & { parseDiagnostics: unknown[] }).parseDiagnostics).toEqual([]);
    expect(patched).toContain('active: pkt.active ?? 1');
    for (const field of ['huntIDCount', 'maxCount', 'huntCount', 'mobGID']) expect(patched).toContain(`if (hunt_info.${field} !== undefined)`);
    expect(patched).toContain('_questNotShowList.length = 0;');
    expect(patched).toContain('questWindow = (init_QuestWindow(), QuestWindow_default)');
  });

  it('fails closed when native anchors drift or a duplicate patch is attempted', () => {
    expect(() => patchRuntimeQuests(patched)).toThrow('anchor:lastro-quests');
    expect(() => patchRuntimeQuests(vendor.replace('questWindow = null,', 'questWindow = undefined,'))).toThrow('anchor:lastro-quests');
  });
});
