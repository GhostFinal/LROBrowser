import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { BUNDLED_SKILL_NAMES, readSkillSource } from '../scripts/lastro-skill-data.mjs';
import { patchLuaTableCompletion, patchRuntimeSkillLocalization } from '../scripts/patch-v2-runtime.mjs';
import { createLastroUiMessages } from '../scripts/lastro-ui-messages.mjs';

const source = readFileSync('generated/runtime/Online.js', 'utf8');
const ast = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function declaration(name: string) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing function ${name}`);
  return node.getText(ast);
}

describe('localization behavior', () => {
  it('decodes the actual Chinese skill data without replacement characters', () => {
    expect(BUNDLED_SKILL_NAMES.SN_WINDWALK).toBe('风之步');
    expect(BUNDLED_SKILL_NAMES.AL_ANGELUS).toBe('天使之障壁');
    expect(Object.keys(BUNDLED_SKILL_NAMES).length).toBeGreaterThan(1200);
    expect(readSkillSource('skilldescript_re_05.lua')).not.toContain('\ufffd');
  });

  it.each(['success', 'id-read', 'value-read', 'lua', 'parse', 'callback'])('finishes once after cleanup on %s', async mode => {
    const reads: Array<{ file: string; ok: (data: Uint8Array) => void; error: () => void }> = [];
    const events: string[] = [];
    const table: Record<string, (key: number, value: string) => number> = {};
    const onEnd = vi.fn(() => events.push('end'));
    const callback = vi.fn((value: Record<number, string>) => {
      events.push('callback');
      expect(value[28]).toBe('治愈术\nHP恢复\n');
      if (mode === 'callback') throw new Error('callback failed');
    });
    const ctx = {
      Client: { loadFile: (file: string, ok: (data: Uint8Array) => void, error: () => void) => reads.push({ file, ok, error }) },
      lua: {
        ctx: table,
        mountFile: (file: string) => events.push('mount:' + file),
        unmountFile: (file: string) => events.push('unmount:' + file),
        doFile: async () => { if (mode === 'lua') throw new Error('lua failed'); },
        doStringSync: () => {
          if (mode === 'parse') throw new Error('parse failed');
          table.addKeyAndMoreValuesToTable!(28, '治愈术');
          table.addKeyAndMoreValuesToTable!(28, 'HP恢复');
        },
      },
      console: { error: vi.fn() }, getLuaTableValueCharset: () => 'gbk', userCharpage: 'gbk',
      userStringDecoder: { decode: (value: string) => value },
    };
    const load = runInNewContext(declaration('loadLuaTable') + '; loadLuaTable;', ctx);
    load(['id.lua', 'description.lua'], 'SKILL_DESCRIPT', callback, onEnd);
    expect(onEnd).not.toHaveBeenCalled();
    expect(reads.map(r => r.file)).toEqual(['id.lua']);
    if (mode === 'id-read') reads[0]!.error(); else reads[0]!.ok(new Uint8Array());
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!['id-read', 'lua'].includes(mode)) {
      expect(onEnd).not.toHaveBeenCalled();
      expect(reads[1]!.file).toBe('description.lua');
      if (mode === 'value-read') reads[1]!.error(); else reads[1]!.ok(new Uint8Array());
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toBe('end');
    expect(events.filter(e => e.startsWith('mount:')).length).toBe(events.filter(e => e.startsWith('unmount:')).length);
    expect(callback).toHaveBeenCalledTimes(['success', 'callback'].includes(mode) ? 1 : 0);
  });

  it('keeps skill IDs and combat data while localizing the built-in fallback', () => {
    const region = source.slice(source.indexOf('var SkillInfo;'), source.indexOf('//#endregion', source.indexOf('var SkillInfo;')));
    const constants = { AL_HEAL: 28, AC_OWL: 43, AC_VULTURE: 44 };
    const table = runInNewContext(region + '; init_SkillInfo(); SkillInfo;', {
      __esmMin: (fn: () => void) => fn, init_SkillConst: () => {}, init_JobConst: () => {},
      SkillConst_default: constants, JobConst_default: {},
    });
    expect(table[28]).toMatchObject({ Name: 'AL_HEAL', SkillName: '治愈术', MaxLv: 10 });
    expect(table[43].SkillName).toBe('鸮枭之眼');
    expect(table[44].SkillName).toBe('苍鹰之眼');
    expect(table[28].SpAmount).toHaveLength(10);
  });

  it('does not silently accept upstream loader drift', () => {
    expect(() => patchRuntimeSkillLocalization('var SkillInfo = {};')).toThrow('anchor:skill-loader');
    expect(() => patchLuaTableCompletion('function loadLuaTable() {}')).toThrow('anchor:lua-table-parser');
  });

  it('reapplies Chinese names after Lua overwrites the built-in skill record', async () => {
    const info: Record<number, unknown> = {};
    const luaContext: Record<string, unknown> = {};
    const onEnd = vi.fn();
    const load = runInNewContext(declaration('loadSkillInfoList') + '; loadSkillInfoList;', {
      Client: { loadFile: (_: string, success: (data: Uint8Array) => Promise<void>) => success(new Uint8Array()) },
      SkillInfo: info, SkillConst_default: { AL_HEAL: 28 }, JobConst_default: {},
      userCharpage: 'gbk', userStringDecoder: { decode: (value: string) => value },
      console: { log: vi.fn(), error: vi.fn() },
      lua: {
        ctx: luaContext, doString: async () => {}, doFile: async () => {}, mountFile: () => {}, unmountFile: () => {},
        doStringSync: () => (luaContext.AddSkillInfo as (...args: unknown[]) => void)(28, 'AL_HEAL', 'Heal', 10, [13,16], true, [9,9], {}),
      },
    });
    load('skills.lua', null, onEnd);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(info[28]).toMatchObject({ Name: 'AL_HEAL', SkillName: '治愈术', MaxLv: 10, SpAmount: [13,16], AttackRange: [9,9] });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('translates known message-table English and keeps Chinese and RO terms', () => {
    const labels = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations[0]?.name.getText(ast) === 'lastroUiMessages');
    const method = source.match(/static getMessage\(id, defaultText\) \{[\s\S]*?\n {4}\}/)?.[0];
    const getMessage = runInNewContext(`${labels?.getText(ast)}\nclass DB { ${method} }; DB.getMessage;`, {
      MsgStringTable: { 1: 'Shop Items', 2: '已有中文', 3: 'Zeny', 4: 'Base Job' },
      LastROUiMessages: createLastroUiMessages(),
    });
    expect(getMessage(1)).toBe('商店物品');
    expect(getMessage(2)).toBe('已有中文');
    expect(getMessage(3)).toBe('Zeny');
    expect(getMessage(4)).toBe('Base Job');
    expect(getMessage(99, '缺省中文')).toBe('缺省中文');
  });
});
