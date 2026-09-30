import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { patchRuntimeJobLocalization } from '../scripts/patch-v2-runtime.mjs';

const original = readFileSync('vendor/v2/Online.js', 'utf8');
const packaged = readFileSync('generated/runtime/Online.js', 'utf8');
function region(source: string, name: string) {
  const start = source.indexOf('//#region src/DB/Jobs/' + name + '.js');
  if (start < 0) throw new Error('Missing table ' + name);
  return source.slice(start, source.indexOf('//#endregion', start));
}
function tables(source: string) {
  return runInNewContext(`
    const __esmMin=fn=>{let ready=false;return()=>{if(!ready){ready=true;fn()}}};
    ${['JobConst', 'JobNameTable', 'PalNameTable', 'WeaponJobTable'].map(name => region(source, name)).join('\n')}
    init_JobConst();init_JobNameTable();init_PalNameTable();init_WeaponJobTable();
    ({JobConst_default,JobNameTable,PalNameTable,WeaponJobTable});
  `);
}
const baseline = tables(original), fixed = tables(packaged);
function method(source: string, name: string) {
  const ast = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) result = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); if (!result) throw new Error('Missing DB method ' + name); return result;
}
describe('character resource names survive Chinese UI localization', () => {
  it.each(['JobNameTable', 'PalNameTable', 'WeaponJobTable'])('keeps every %s basename exactly equal to upstream', table => {
    expect(fixed[table]).toEqual(baseline[table]);
    expect(Object.keys(fixed[table]).length).toBeGreaterThan(100);
  });
  it('preserves body paths for every job and both sexes, including alternate costumes', () => {
    function db(source: string, data: typeof fixed) {
      return runInNewContext(`class DB {
        static isPlayer(id){return id in JobNameTable}
        static isDoram(id){return id===JobConst_default.DO_SUMMONER}
        ${method(source, 'getBodyPath')}
      }; DB;`, { ...data, SexTable: ['¿©', '³²'], PacketVerManager_default: { value: 20211103 } });
    }
    const expected = db(original, baseline), actual = db(packaged, fixed);
    for (const job of Object.keys(fixed.JobNameTable).map(Number).filter(Number.isFinite)) for (const sex of [0, 1]) {
      expect(actual.getBodyPath(job, sex), `job ${job}, sex ${sex}`).toBe(expected.getBodyPath(job, sex));
      expect(actual.getBodyPath(job, sex, fixed.JobConst_default.RUNE_KNIGHT_2ND)).toBe(expected.getBodyPath(job, sex, fixed.JobConst_default.RUNE_KNIGHT_2ND));
    }
    expect(actual.getBodyPath(0, 1)).not.toContain('初心者');
  });
  it('keeps Chinese display names separate and never alters monster resource names', () => {
    const ast = ts.createSourceFile('runtime.js', packaged, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const declarations = ast.statements.filter(node =>
      (ts.isFunctionDeclaration(node) && node.name?.text === 'lastroJobDisplayName') ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['lastroJobLabels', 'lastroJobLabelsById'].includes(d.name.getText(ast))))
    ).map(node => node.getText(ast)).join('\n');
    const monsters = { 0: 'Novice', 1002: 'PORING', 1039: 'BAPHOMET' };
    const display = runInNewContext(declarations + '\nlastroJobDisplayName;', { JobConst_default: fixed.JobConst_default, init_JobConst: () => {}, MonsterTable_default: monsters });
    expect(display(0)).toBe('初心者'); expect(display(fixed.JobConst_default.DRAGON_KNIGHT)).toBe('龙骑士');
    expect(display(1002)).toBe('PORING'); expect(monsters[0]).toBe('Novice');
    expect(packaged.match(/lastroJobDisplayName\(info\.job\)/g)).toHaveLength(2);
  });
  it('fails visibly if upstream job display sites change', () => {
    expect(() => patchRuntimeJobLocalization(original.replace('MonsterTable_default[info.job]', 'changedJobDisplay(info.job)'))).toThrow('anchor:job-display-lookups');
  });
});
