import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { lastroItemEnchantName, patchRuntimeItemName } from '../scripts/lastro-item-name.mjs';

const source = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeItemName(source);
function nativeParts(text: string) {
  const start = text.indexOf('//#region src/DB/DBManager.js'), end = text.indexOf('//#endregion', start);
  const region = text.slice(start, end);
  const file = ts.createSourceFile('DBManager.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let method = '', preferred = '';
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'getItemName') method = node.getText(file);
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'getPreferredItemDisplayName') preferred = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!method || !preferred) throw new Error('Changed native item-name fixture');
  return { method, preferred };
}
const originalParts = nativeParts(source), patchedParts = nativeParts(patched);
type Info = { identifiedDisplayName?: string; unidentifiedDisplayName?: string; identifiedResourceName?: string; prefixName?: string; isPostfix?: boolean; slotCount?: number; ClassNum?: number; _lastroEnchant?: boolean };
type Item = { ITID: number; IsIdentified: boolean; slot?: Record<string, number>; RefiningLevel?: number; enchantgrade?: number; Options?: { index: number }[] };
const itemTableSources = new Map<string, string>();
function realItemInfo(path: string, id: number): Info {
  let text = itemTableSources.get(path);
  if (!text) { text = new TextDecoder('gbk').decode(readFileSync(path)); itemTableSources.set(path, text); }
  const block = new RegExp('\\[' + id + '\\]\\s*=\\s*\\{[\\s\\S]*?(?=\\r?\\n\\s*\\[\\d+\\]\\s*=|$)').exec(text)?.[0];
  if (!block) throw new Error('Missing real item fixture: ' + id);
  const field = (name: string) => {
    const literal = new RegExp('\\b' + name + '\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")', 'i').exec(block)?.[1];
    return literal ? JSON.parse(literal) as string : undefined;
  };
  return { prefixName: '', isPostfix: false, identifiedDisplayName: field('identifiedDisplayName'), unidentifiedDisplayName: field('unidentifiedDisplayName'),
    identifiedResourceName: field('identifiedResourceName'), slotCount: Number(/slotCount\s*=\s*(\d+)/.exec(block)?.[1]),
    ClassNum: Number(/ClassNum\s*=\s*(\d+)/.exec(block)?.[1]) };
}
function fixture(path = 'vendor/core/System/itemInfo_re_61.lua', before = false) {
  const ids = [1724, 4001, 4256, 4700, 4833, 4834, 27344, 300139, 300230, 300372, 300473];
  const table: Record<number, Info> = Object.fromEntries(ids.map(id => [id, realItemInfo(path, id)]));
  const parts = before ? originalParts : patchedParts;
  const db = runInNewContext(parts.preferred + '\nclass DB {' + parts.method + '\n}; DB;', {
    lastroItemEnchantName, MsgStringTable: {}, document: {}, setTimeout,
  }) as { getItemInfo(id: number): Info; getItemName(item: Item, options?: Record<string, boolean>): string };
  db.getItemInfo = id => table[id] ?? { identifiedDisplayName: 'Unknown Item' };
  const item = (cards = [0, 0, 4833, 4833]): Item => ({ ITID: 1724, IsIdentified: true,
    slot: Object.fromEntries(cards.map((card, i) => ['card' + (i + 1), card])) });
  return { db, table, item };
}

describe('native enchant name suffixes', () => {
  it('reproduces the reported empty Double prefix in the unpatched runtime', () => {
    const f = fixture(undefined, true);
    expect(f.db.getItemName(f.item())).toBe('Double  天龙之翼');
  });
  it.each(['59', '61'])('uses actual packaged itemInfo_%s enchant names and preserves repeated slots', version => {
    const f = fixture('vendor/core/System/itemInfo_re_' + version + '.lua');
    expect(f.db.getItemName(f.item())).toBe('天龙之翼 [名弓2] [名弓2]');
    expect(f.db.getItemName(f.item([0, 0, 4833, 4834]))).toBe('天龙之翼 [名弓2] [名弓3]');
    expect(f.table[4833]?.identifiedDisplayName).toBe('名弓Lv2');
  });
  it('retains real normal-card prefixes while appending enchants after slots/options', () => {
    const f = fixture(); f.table[4001]!.prefixName = '幸运之'; f.table[1724]!.slotCount = 2;
    const item = { ...f.item([4001, 4001, 4833, 4834]), RefiningLevel: 7, enchantgrade: 3, Options: [{ index: 1 }, { index: 0 }] };
    expect(f.db.getItemName(item)).toBe('+7 [B] Double 幸运之 天龙之翼 [2] [1词条] [名弓2] [名弓3]');
  });
  it('keeps normal-card postfixes and their native duplicate count', () => {
    const f = fixture(); Object.assign(f.table[4001]!, { prefixName: '幸运', isPostfix: true }); f.table[1724]!.slotCount = 2;
    expect(f.db.getItemName(f.item([4001, 4001, 4700, 4833]))).toBe('天龙之翼 Double 幸运 [2] [STR +1] [名弓2]');
  });
  it('uses the Chinese option count with the native non-empty option filter', () => {
    const f = fixture();
    const item = { ...f.item([0, 0, 0, 0]), Options: [{ index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }, { index: 5 }] };
    expect(f.db.getItemName(item)).toBe('天龙之翼 [5词条]');
    expect(f.db.getItemName(item, { showItemOptions: false })).toBe('天龙之翼');
    expect(f.db.getItemName({ ...item, Options: [{ index: 0 }, { index: 1 }, { index: 0 }] })).toBe('天龙之翼 [1词条]');
    expect(f.db.getItemName({ ...item, Options: [] })).toBe('天龙之翼');
    expect(f.db.getItemName({ ...item, IsIdentified: false })).toBe('天龙之翼');
    expect(item.Options).toHaveLength(5);
  });
  it('does not turn normal cards with missing affix data into enchants or empty Double', () => {
    const f = fixture();
    for (const id of [4001, 4256, 27344, 300139, 300230, 300372, 300473]) {
      expect(f.db.getItemName(f.item([id, id, 0, 0]))).toBe('天龙之翼');
    }
  });
  it('honors name options and keeps unidentified and special slot records private', () => {
    const f = fixture();
    f.table[1724]!.slotCount = 2;
    expect(f.db.getItemName(f.item(), { showItemSlots: false })).toBe('天龙之翼 [名弓2] [名弓2]');
    expect(f.db.getItemName(f.item(), { showItemEnchants: false })).toBe('天龙之翼 [2]');
    expect(f.db.getItemName(f.item(), { showItemPostfix: false })).toBe('天龙之翼 [2]');
    expect(f.db.getItemName({ ...f.item(), IsIdentified: false })).toBe('天龙之翼');
    expect(f.db.getItemName(f.item([65280, 4833, 4834, 0]))).toBe('天龙之翼 [2]');
  });
  it('retains official bracket affixes and normalizes level notation only for suffixes', () => {
    expect(lastroItemEnchantName({ prefixName: '[名弓3]' })).toBe('名弓3');
    expect(lastroItemEnchantName({ identifiedDisplayName: '魔力 Lv. 4', unidentifiedDisplayName: '魔力 Lv. 4' })).toBe('魔力4');
    expect(lastroItemEnchantName({ identifiedDisplayName: '尖锐3Lv', unidentifiedDisplayName: '尖锐3Lv' })).toBe('尖锐3');
    expect(lastroItemEnchantName({ prefixName: '[<img>]' })).toBe('');
  });
  it('marks only registered enchant outputs and covers real mismatched identified/unidentified names', () => {
    const start = patched.indexOf('//#region src/DB/DBManager.js'), end = patched.indexOf('//#endregion', start);
    const file = ts.createSourceFile('DBManager.js', patched.slice(start, end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let loader: ts.FunctionDeclaration | undefined;
    for (const statement of file.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'loadEnchantListFile') loader = statement;
    }
    if (!loader) throw new Error('Missing native enchant loader');
    const declarations: string[] = [], callbacks: string[] = [];
    const helpers = new Set(['resolveItem', 'resolveEnchantItem', 'ensureGroup', 'ensureSlot']);
    const names = new Set(['AddEnchantTargetItem', 'AddEnchantRequireMaterial', 'AddEnchantRate', 'AddPerfectEnchant',
      'AddPerfectEnchantMaterial', 'AddUpgradeEnchant', 'AddUpgradeEnchantMaterial']);
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && helpers.has(node.name.getText(file))) declarations.push('const ' + node.getText(file) + ';');
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && ts.isPropertyAccessExpression(node.expression.left) && node.expression.left.expression.getText(file) === 'ctx'
        && names.has(node.expression.left.name.text)) callbacks.push(node.getText(file));
      ts.forEachChild(node, visit);
    }
    visit(loader);
    expect(declarations).toHaveLength(4); expect(callbacks).toHaveLength(7);
    const f = fixture();
    const bases = { Wolf_Orb_P_F_3: 310608, Wolf_Orb_A_Delay_2: 310620, Wolf_Orb_E_Archer_4: 310631, Poring_Card: 4001 };
    for (const id of [310608, 310620, 310631]) f.table[id] = realItemInfo('vendor/core/System/itemInfo_re_61.lua', id);
    const ctx = runInNewContext('const ctx={};\n' + declarations.join('\n') + '\n' + callbacks.join('\n') + '\nctx;', {
      EnchantListTable: {}, ItemTable_default: f.table, lastroEnchantBases: new Set(), decodeLuaString: (value: string) => value,
      DB: { getItemIdfromBase: (base: keyof typeof bases) => bases[base] },
    }) as Record<string, (...args: unknown[]) => number>;
    ctx.AddEnchantTargetItem!(1, 'Poring_Card');
    ctx.AddEnchantRequireMaterial!(1, 4, 'Poring_Card', 1);
    ctx.AddEnchantRate!(1, 4, 0, 'Wolf_Orb_P_F_3', 1000);
    ctx.AddPerfectEnchant!(1, 3, 'Wolf_Orb_A_Delay_2', 1000);
    ctx.AddPerfectEnchantMaterial!(1, 2, 'Wolf_Orb_E_Archer_4', 'Poring_Card', 1);
    ctx.AddUpgradeEnchant!(1, 3, 'Wolf_Orb_P_F_3', 'Wolf_Orb_E_Archer_4', 1000);
    ctx.AddUpgradeEnchantMaterial!(1, 1, 'Wolf_Orb_A_Delay_2', 'Poring_Card', 1);
    expect(f.table[4001]!._lastroEnchant).toBeUndefined();
    for (const id of [310608, 310620, 310631]) expect(f.table[id]!._lastroEnchant).toBe(true);
    expect(f.db.getItemName(f.item([0, 310608, 310620, 310631])))
      .toBe('天龙之翼 [沃尔夫晶体(武力)3] [沃尔夫晶体(攻击延迟)2] [沃尔夫晶体(弓箭手泵)4]');
    let namesCallback = '';
    function findNameCallback(node: ts.Node) {
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && node.expression.left.getText(file) === 'ctx.AddDBItemName') namesCallback = node.getText(file);
      ts.forEachChild(node, findNameCallback);
    }
    findNameCallback(file);
    expect(namesCallback).not.toBe('');
    const late = fixture();
    late.table[310608] = realItemInfo('vendor/core/System/itemInfo_re_61.lua', 310608);
    const itemNames: Record<string, number> = {};
    const lateCtx = runInNewContext('const ctx={};\n' + declarations.join('\n') + '\n' + callbacks.join('\n') + '\n' + namesCallback + '\nctx;', {
      EnchantListTable: {}, ItemTable_default: late.table, ItemDBNameTbl: itemNames, lastroEnchantBases: new Set(),
      decodeLuaString: (value: string) => value, userStringDecoder: { decode: (value: string) => value },
      DB: { getItemIdfromBase: (base: string) => itemNames[base] },
    }) as Record<string, (...args: unknown[]) => number>;
    lateCtx.AddEnchantRate!(1, 4, 0, 'Wolf_Orb_P_F_3', 1000);
    expect(late.table[310608]!._lastroEnchant).toBeUndefined();
    lateCtx.AddDBItemName!('Wolf_Orb_P_F_3', 310608);
    expect(late.table[310608]!._lastroEnchant).toBe(true);
    expect(late.db.getItemName(late.item([0, 0, 0, 310608]))).toBe('天龙之翼 [沃尔夫晶体(武力)3]');
  });
  it('fails clearly when the upstream getItemName/card anchors drift or the patch is repeated', () => {
    expect(() => patchRuntimeItemName(patched)).toThrow('already-patched');
    expect(() => patchRuntimeItemName(source.replace('              if (card) {', '              if (card > 0) {'))).toThrow('card-classification');
    expect(() => patchRuntimeItemName(source.replace('" Option]"', '" Options]"'))).toThrow('option-label');
    expect(patchRuntimeItemName('const unrelated = true;')).toBe('const unrelated = true;');
  });
});
