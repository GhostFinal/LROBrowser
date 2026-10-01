import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildLastroQuestMetadata, createLastroQuestData } from '../scripts/lastro-quest-data.mjs';
import type { LastroQuest, LastroHydratedQuest, LastroQuestInfo, LastroQuestMetadata } from '../scripts/lastro-quest-data.mjs';

const source = readFileSync(new URL('../vendor/core/data/questinfo/QuestInfo.js', import.meta.url), 'utf8');
const metadata = buildLastroQuestMetadata(source);
const normal = (): LastroHydratedQuest => ({ questID: 1, title: '普通任务', active: 0, start_time: 123, end_time: 456, count: 1,
  hunt_list: { 41: { huntID: 41, mobGID: 1031, mobName: '标准目标', huntCount: 4, maxCount: 20 } } });
function fixture(info: Record<number, LastroQuestInfo> = {}, legacy: Record<string, LastroQuestMetadata> = {}, enabled = true) {
  const getInfo = vi.fn((id: number) => info[id] || { Title: 'Unknown Quest', Summary: 'Uknown Quest', Description: [] });
  const getMonsterName = vi.fn((id: number) => ({ 1002: '波利', 1004: '蜂兵', 1031: '波波利' }[id] || 'Unknown'));
  const data = createLastroQuestData({ getInfo, getMonsterName, legacyMetadata: legacy, isLastro: enabled });
  return { data, getInfo, getMonsterName };
}
const rows = (...entries: { questID: number; mobGID: number; count: number; maxCount: number }[]) => ({ HuntingList: entries });

describe('literal LastRO quest metadata extraction', () => {
  it('extracts the real 3333 entries and 561 bounty classifications without executing AMD code', () => {
    expect(Object.keys(metadata)).toHaveLength(3333);
    expect(Object.values(metadata).filter(row => row.type === 7)).toHaveLength(561);
    expect(metadata[30001]).toMatchObject({ name: '狩猎任务-猎杀波利', type: 7, show: true, display: true });
    expect(metadata[30002]?.name).toBe('狩猎任务-猎杀蜂兵');
    expect(metadata[30001]).not.toHaveProperty('ename'); expect(metadata[30001]).not.toHaveProperty('cg');
  });

  it('does not execute surrounding scripts or data expressions', () => {
    const result = buildLastroQuestMetadata('throw new Error("never run"); QuestInfo[7]={name:"名字",desc:"正文",type:7};');
    expect(result[7]?.name).toBe('名字');
    expect(() => buildLastroQuestMetadata('QuestInfo[7]={name:globalThis.execute()};')).toThrow('anchor:lastro-quest-metadata');
  });

  it('preserves structured literals, including negative values and nested item records', () => {
    const result = buildLastroQuestMetadata('QuestInfo[7]={name:"名字",outset:["prontera",127,162],path:[["prt_in",1,2]],position:["forbidden"],items:[{id:501,count:-1}],type:7};');
    expect(result[7]).toMatchObject({ outset: ['prontera', 127, 162], path: [['prt_in', 1, 2]], position: ['forbidden'], items: [{ id: 501, count: -1 }] });
  });

  it('retains the final literal assignment as the legacy table itself would', () => {
    expect(buildLastroQuestMetadata('QuestInfo[7]={name:"旧"};QuestInfo[7]={name:"新"};')[7]?.name).toBe('新');
  });

  it.each(['', 'QuestInfo[0]={name:"名字"};', 'QuestInfo["7"]={name:"名字"};', 'QuestInfo[7]={...other};', 'QuestInfo[7]={name:()=>"名字"};'])('rejects unsupported metadata anchors and executable values', input => {
    expect(() => buildLastroQuestMetadata(input)).toThrow('anchor:lastro-quest-metadata');
  });
});

describe('current DB quest hydration and route provenance', () => {
  const route = { name: '真实任务', desc: '真实描述', type: 7, npc: '原始NPC', outset: ['prontera', 127, 162],
    path: [['prontera', 125, 144]], questPos: ['prontera', 125, 144], position: ['excluded_map'] };

  it('prefers current DB text while preserving live server state and standard target names', () => {
    const f = fixture({ 1: { Title: '当前名字', Summary: '当前概要', Description: ['当前描述'], IconName: 'ico_nq.bmp' } });
    const input = normal(), hydrated = f.data.hydrateQuest(input);
    expect(hydrated).toMatchObject({ title: '当前名字', summary: '当前概要', description: ['当前描述'], active: 0, end_time: 456 });
    expect(hydrated.hunt_list?.[41]).toEqual(input.hunt_list?.[41]);
    expect(hydrated.hunt_list).not.toBe(input.hunt_list); expect(hydrated.description).not.toBe(f.getInfo(1).Description);
    expect(input.title).toBe('普通任务');
  });

  it('uses current monster names only when a standard server target name is absent', () => {
    const f = fixture();
    expect(f.data.hydrateQuest({ questID: 1, hunt_list: { 1002: { mobGID: 1002, huntCount: 0, maxCount: 80 } } }).hunt_list?.[1002])
      .toMatchObject({ mobName: '波利', huntCount: 0, maxCount: 80 });
  });

  it('permits routes only when the cleaned current title exactly matches the legacy name', () => {
    const f = fixture({ 7: { Title: '[赏金] ^FF0000真实任务', Description: '不同描述' } }, { 7: route });
    expect(f.data.metadataFor(7)).toEqual({ type: 7, route: { npc: '原始NPC', outset: route.outset, path: route.path, questPos: route.questPos, position: route.position } });
    expect(f.data.metadataFor(7).route?.outset).not.toBe(route.outset);
  });

  it('accepts an exact nonempty plain-text description match independently of title', () => {
    const f = fixture({ 7: { Title: '另一个名字', Description: ['<b>真实描述</b>'] } }, { 7: route });
    expect(f.data.metadataFor(7).route?.outset).toEqual(route.outset);
  });

  it.each([
    { Title: '真实任务的后续', Description: '不同描述' },
    { Title: 'Unknown Quest', Description: '' },
    { Title: '其他名字', Description: [] },
  ])('withholds routes on conflicting or missing current data', info => {
    expect(fixture({ 7: info }, { 7: route }).data.metadataFor(7)).toEqual({ type: 7, route: null });
  });

  it('does not match two empty descriptions or infer a route from an exclusion list', () => {
    expect(fixture({ 7: { Title: '别的任务', Description: '' } }, { 7: { ...route, desc: '' } }).data.metadataFor(7).route).toBeNull();
    expect(fixture({ 7: { Title: '真实任务' } }, { 7: { name: '真实任务', position: ['prontera'] } }).data.metadataFor(7).route).toBeNull();
  });

  it('gates legacy metadata by the current LastRO profile', () => {
    expect(fixture({ 7: { Title: '真实任务' } }, { 7: route }, false).data.metadataFor(7)).toEqual({ type: null, route: null });
    let active = false;
    const data = createLastroQuestData({ getInfo: () => ({ Title: '真实任务' }), getMonsterName: () => '', legacyMetadata: { 7: route }, isLastro: () => active });
    expect(data.metadataFor(7).route).toBeNull(); active = true; expect(data.metadataFor(7).route).not.toBeNull();
  });
});

describe('accepted server bounty snapshots', () => {
  it('uses server target/count/maxCount even when legacy and current DB names conflict', () => {
    const f = fixture({ 30002: { Title: '冒险任务-狩猎吸血蝙蝠', Summary: '当前概要', Description: '当前描述' } }, metadata);
    const result = f.data.fromHuntingList(rows({ questID: 30002, mobGID: 1004, count: 0, maxCount: 80 }));
    expect(Object.keys(result)).toEqual(['30002']);
    expect(result[30002]).toMatchObject({ title: '狩猎任务-猎杀蜂兵', summary: '', description: '击败80只蜂兵', count: 1, lastroBountySource: true });
    expect(result[30002]?.hunt_list?.[1004]).toMatchObject({ mobName: '蜂兵', huntCount: 0, maxCount: 80 });
  });

  it('groups multiple mobs under one quest and treats a duplicate row as the latest count', () => {
    const f = fixture();
    const result = f.data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 10, maxCount: 80 }, { questID: 7, mobGID: 1004, count: 0, maxCount: 0 }, { questID: 7, mobGID: 1002, count: 11, maxCount: 80 }));
    expect(result[7]?.count).toBe(2); expect(result[7]?.hunt_list?.[1002]?.huntCount).toBe(11);
    expect(result[7]?.hunt_list?.[1004]).toMatchObject({ huntCount: 0, maxCount: 0 });
  });

  it('removes expired snapshot-only quests while retaining ordinary quests', () => {
    const f = fixture(), ordinary = normal();
    const first = f.data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 3, maxCount: 80 }), { 1: ordinary });
    const second = f.data.fromHuntingList(rows({ questID: 8, mobGID: 1004, count: 4, maxCount: 80 }), first);
    expect(Object.keys(second)).toEqual(['1', '8']); expect(second[1]?.hunt_list).toEqual(ordinary.hunt_list);
    expect(Object.keys(f.data.fromHuntingList(rows(), second))).toEqual(['1']);
  });

  it('preserves ordinary status, timers and goals when the same ID also appears in a bounty snapshot', () => {
    const f = fixture(), ordinary = normal();
    const first = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 0, maxCount: 80 }), { 1: ordinary });
    expect(first[1]).toMatchObject({ active: 0, start_time: 123, end_time: 456, count: 2, lastroBountyOnly: false });
    expect(first[1]?.hunt_list?.[41]).toEqual(ordinary.hunt_list?.[41]);
    first[1]!.active = 1; first[1]!.end_time = 999;
    const empty = f.data.fromHuntingList(rows(), first);
    expect(empty[1]).toMatchObject({ active: 1, end_time: 999, count: 1 });
    expect(empty[1]?.hunt_list).toEqual(ordinary.hunt_list); expect(empty[1]).not.toHaveProperty('lastroBountySource');
  });

  it('keeps overlapping ordinary and bounty targets independent without restoring stale progress', () => {
    const f = fixture(), ordinary: LastroHydratedQuest = { questID: 1, active: 0, count: 1, hunt_list: { 1002: { mobGID: 1002, huntID: 17, huntCount: 8, maxCount: 10, mobName: '标准波利' } } };
    const first = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 11, maxCount: 80 }), { 1: ordinary });
    expect(first[1]?.hunt_list?.[1002]).toMatchObject({ huntID: 17, huntCount: 8, maxCount: 10 });
    expect(first[1]?.hunt_list?.['bounty:1002']).toMatchObject({ huntCount: 11, maxCount: 80 });
    first[1]!.hunt_list[1002]!.huntCount = 9;
    const next = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 12, maxCount: 80 }), first);
    expect(next[1]?.hunt_list?.[1002]?.huntCount).toBe(9);
    expect(next[1]?.hunt_list?.['bounty:1002']?.huntCount).toBe(12);
    const empty = f.data.fromHuntingList(rows(), next);
    expect(empty[1]?.hunt_list).toEqual({ 1002: { ...ordinary.hunt_list[1002], huntCount: 9 } });
    expect(ordinary.hunt_list?.[1002]?.huntCount).toBe(8);
  });

  it('keeps live ordinary target progress, including zero, and newly added goals across snapshots', () => {
    const f = fixture(), first = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 2, maxCount: 80 }), { 1: normal() });
    first[1]!.hunt_list[41]!.huntCount = 0;
    first[1]!.hunt_list[42] = { huntID: 42, mobGID: 1004, huntCount: 5, maxCount: 10, mobName: '新的标准目标' };
    const next = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 3, maxCount: 80 }), first);
    expect(next[1]?.hunt_list[41]?.huntCount).toBe(0); expect(next[1]?.hunt_list[42]?.huntCount).toBe(5);
    const empty = f.data.fromHuntingList(rows(), next);
    expect(empty[1]?.count).toBe(2); expect(Object.keys(empty[1]!.hunt_list)).toEqual(['41', '42']);
  });

  it('preserves a standard huntID that numerically collides with a different bounty monster ID', () => {
    const f = fixture(), ordinary: LastroQuest = { questID: 1, active: 1, count: 1, hunt_list: { 1002: { huntID: 1002, mobGID: 1031, huntCount: 8, maxCount: 10 } } };
    const result = f.data.fromHuntingList(rows({ questID: 1, mobGID: 1002, count: 11, maxCount: 80 }), { 1: ordinary });
    expect(result[1]?.hunt_list?.[1002]).toMatchObject({ mobGID: 1031, huntCount: 8 });
    expect(result[1]?.hunt_list?.['bounty:1002']).toMatchObject({ mobGID: 1002, huntCount: 11 });
  });

  it('accepts keyed sparse arrays and never enumerates the static catalog into accepted quests', () => {
    const f = fixture({}, metadata), sparse: LastroQuest[] = []; sparse[1] = normal();
    expect(Object.keys(f.data.fromHuntingList(rows(), sparse))).toEqual(['1']);
    expect(Object.keys(f.data.fromHuntingList(rows()))).toHaveLength(0);
  });

  it('ignores malformed rows and preserves state when the expected snapshot field is absent', () => {
    const f = fixture();
    expect(Object.keys(f.data.fromHuntingList(rows({ questID: 0, mobGID: 1002, count: 1, maxCount: 80 }, { questID: 7, mobGID: 1002, count: -1, maxCount: 80 })))).toHaveLength(0);
    const first = f.data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 1, maxCount: 80 }));
    expect(Object.keys(f.data.fromHuntingList({}, first))).toEqual(['7']);
  });

  it('performs no bounty additions on another server profile', () => {
    const f = fixture({}, metadata, false);
    expect(Object.keys(f.data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 1, maxCount: 80 }), { 1: normal() }))).toEqual(['1']);
  });

  it('serializes as a standalone factory without TypeScript, network or outer helper dependencies', () => {
    const factory = new Function(`return (${createLastroQuestData.toString()});`)() as typeof createLastroQuestData;
    const data = factory({ getInfo: () => ({ Title: '当前任务' }), getMonsterName: () => '波利', isLastro: true });
    expect(data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 0, maxCount: 80 }))[7]?.title).toBe('[赏金] 狩猎：波利');
  });
});

describe('server-authoritative bounty text and official NPC fields', () => {
  const collisionInfo = { Title: '冒险任务-狩猎鸟人哈比', Summary: '错误目标说明', Description: '击败50只鸟人哈比', NpcNavi: 'wrong_map', NpcPosX: 0, NpcPosY: 20 };
  const evilBox = (legacy: Record<string, LastroQuestMetadata> = metadata, info: LastroQuestInfo = collisionInfo) => createLastroQuestData({
    getInfo: () => info, getMonsterName: () => '邪恶箱', legacyMetadata: legacy, isLastro: true,
  });
  const accepted = { questID: 30090, mobGID: 1191, count: 7, maxCount: 50 };

  it('keeps the real legacy 30090 evil-box text only after name and server quantity validation', () => {
    const data = evilBox(), quest = data.fromHuntingList(rows(accepted))[30090]!;
    expect(quest).toMatchObject({ title: '狩猎任务-猎杀邪恶箱', summary: '', description: '击败50只邪恶箱', npc_navi: null, npc_pos_x: null, npc_pos_y: null });
    expect(data.hydrateQuest(quest)).toMatchObject({ title: '狩猎任务-猎杀邪恶箱', description: '击败50只邪恶箱' });
    expect(data.metadataFor(30090).route).toBeNull();
    expect(quest.description).not.toContain('鸟人哈比');
  });

  it.each([
    { type: 7, name: '狩猎任务-猎杀邪恶箱', desc: '击败150只邪恶箱' },
    { type: 7, name: '狩猎任务-猎杀邪恶箱', desc: '击败50只邪恶箱王' },
    { type: 7, name: '狩猎任务-猎杀鸟人哈比', desc: '击败50只邪恶箱' },
    { type: 2, name: '狩猎任务-猎杀邪恶箱', desc: '击败50只邪恶箱' },
  ])('generates only server target text when legacy data conflicts or is not bounty metadata', legacy => {
    const data = evilBox({ 30090: { ...legacy, items: [[501, 100]], outset: ['wrong_map', 1, 2] } });
    const quest = data.fromHuntingList(rows(accepted))[30090]!;
    expect(quest).toMatchObject({ title: '[赏金] 狩猎：邪恶箱', summary: '', description: '击败50只邪恶箱' });
    expect(quest).not.toHaveProperty('items'); expect(quest).not.toHaveProperty('outset'); expect(quest).not.toHaveProperty('end_time');
    expect(data.metadataFor(30090).route).toBeNull();
  });

  it('uses current DB text only when the description identifies every actual target and quantity', () => {
    const info = { Title: '[赏金] 当前邪恶箱任务', Summary: '不额外展示概要', Description: ['击败50只邪恶箱'], NpcNavi: 'npc_map', NpcPosX: 0, NpcPosY: 0 };
    const quest = evilBox(metadata, info).fromHuntingList(rows(accepted))[30090]!;
    expect(quest).toMatchObject({ title: info.Title, description: info.Description, summary: '', npc_navi: 'npc_map', npc_pos_x: 0, npc_pos_y: 0 });
    expect(quest.description).not.toBe(info.Description);
  });

  it('does not keep a contradictory hunting title even when the current description is correct', () => {
    const quest = evilBox({}, { ...collisionInfo, Description: '击败50只邪恶箱' }).fromHuntingList(rows(accepted))[30090]!;
    expect(quest.title).toBe('[赏金] 狩猎：邪恶箱'); expect(quest.description).toBe('击败50只邪恶箱');
  });

  it('requires all targets and quantities, and generates multi-target text including zero', () => {
    const data = fixture({ 7: { Title: '波利与蜂兵', Description: '击败80只波利' } }, { 7: { type: 7, name: '波利与蜂兵', desc: '击败80只波利；击败1只蜂兵' } }).data;
    const quest = data.fromHuntingList(rows({ questID: 7, mobGID: 1002, count: 0, maxCount: 80 }, { questID: 7, mobGID: 1004, count: 0, maxCount: 0 }))[7]!;
    expect(quest).toMatchObject({ title: '[赏金] 狩猎：波利、蜂兵', summary: '', description: '击败80只波利；击败0只蜂兵' });
  });

  it('keeps ordinary packet status and goals while correcting mixed-source static text', () => {
    const data = evilBox({}), ordinary: LastroHydratedQuest = { questID: 30090, active: 0, end_time: 999, count: 1, hunt_list: { 41: { huntID: 41, mobGID: 1031, huntCount: 4, maxCount: 20, mobName: '标准目标' } } };
    const merged = data.fromHuntingList(rows(accepted), { 30090: ordinary })[30090]!;
    expect(merged).toMatchObject({ active: 0, end_time: 999, title: '[赏金] 狩猎：邪恶箱', description: '击败50只邪恶箱', lastroBountyOnly: false });
    expect(merged.hunt_list[41]).toEqual(ordinary.hunt_list[41]);
    const restored = data.fromHuntingList(rows(), { 30090: merged })[30090]!;
    expect(restored).toMatchObject({ active: 0, end_time: 999, title: collisionInfo.Title, description: collisionInfo.Description });
    expect(restored.hunt_list).toEqual(ordinary.hunt_list);
  });

  it('passes typed current DB NPC fields with zero coordinates for ordinary quests', () => {
    const data = fixture({ 1: { Title: '普通任务', NpcNavi: 'npc_map', NpcPosX: 0, NpcPosY: 0 } }).data;
    expect(data.hydrateQuest({ questID: 1, npc_navi: null, npc_pos_x: null, npc_pos_y: null })).toMatchObject({ npc_navi: 'npc_map', npc_pos_x: 0, npc_pos_y: 0 });
  });

  it('does not transfer invalid NPC coordinates or change ordinary metadata on another profile', () => {
    const invalid = fixture({ 1: { NpcNavi: 'npc_map', NpcPosX: NaN, NpcPosY: Infinity } }).data.hydrateQuest({ questID: 1 });
    expect(invalid).not.toHaveProperty('npc_pos_x'); expect(invalid).not.toHaveProperty('npc_pos_y');
    const data = createLastroQuestData({ getInfo: () => collisionInfo, getMonsterName: () => '邪恶箱', isLastro: false });
    const quest = data.hydrateQuest({ questID: 30090, lastroBountySource: true, lastroBountyKeys: ['1191'], hunt_list: { 1191: { mobGID: 1191, maxCount: 50 } } });
    expect(quest).toMatchObject({ title: collisionInfo.Title, description: collisionInfo.Description, npc_navi: 'wrong_map' });
  });
});
