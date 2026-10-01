import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { patchRuntimeJobLocalization } from '../scripts/patch-v2-runtime.mjs';
import { patchRuntimeEquipmentCatalog } from '../scripts/lastro-equipment-view.mjs';

const original = readFileSync('vendor/v2/Online.js', 'utf8');
const packaged = readFileSync('generated/runtime/Online.js', 'utf8');
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };
const document = new JSDOM('<!doctype html><html><body></body></html>').window.document;
const packagedAst = ts.createSourceFile('runtime.js', packaged, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function nativeRegion(source: string, path: string) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region ' + path);
  return source.slice(start, end);
}
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
// Catalog repairs resolve existing job IDs before localization. Compare that
// corrected catalog too, while independently preserving every valid old name.
const upstream = tables(original), baseline = tables(patchRuntimeEquipmentCatalog(original)), fixed = tables(packaged);
const jobDeclarations = packagedAst.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && /^lastroJob/.test(node.name?.text ?? '')) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => /^lastroJob/.test(d.name.getText(packagedAst))))
).map(node => node.getText(packagedAst)).join('\n');
function displayFixture() {
  const monsters: Record<number, string> = { 0: 'Novice', 1002: 'PORING', 1039: 'BAPHOMET', 4010: 'High Wizard', 4023: 'Baby Novice', 4061: 'Warlock' };
  const context = { document, JobConst_default: fixed.JobConst_default, init_JobConst: () => {}, MonsterTable_default: monsters };
  const display = runInNewContext(jobDeclarations + '\nlastroJobDisplayName;', context) as (id: number) => string | undefined;
  return { context, display, monsters };
}
function basicInfoFixture(version: 'BasicInfoV1' | 'BasicInfoV3') {
  const f = displayFixture();
  const factory = packagedAst.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createBasicInfo');
  if (factory.length !== 1) throw new Error('Missing or duplicate native createBasicInfo factory');
  class GUIComponent {
    readonly _host = document.createElement('div');
    readonly _shadow = this._host.attachShadow({ mode: 'open' });
    render!: () => string;
    constructor(readonly name: string, readonly css: string) {}
    getRoot() { return this._shadow; }
  }
  const component = runInNewContext([
    jobDeclarations, factory[0]!.getText(packagedAst),
    ...['html?raw', 'css?raw', 'js'].map(extension => nativeRegion(packaged, `src/UI/Components/BasicInfo/${version}/${version}.${extension}`)),
    `init_${version}(); ${version}_default;`,
  ].join('\n'), {
    ...f.context, GUIComponent, UIManager: { addComponent: (component: GUIComponent) => component },
    Preferences: { get: (_name: string, defaults: object) => ({ ...defaults, save() {} }) },
    __esmMin: (fn: () => void) => { let ready = false; return () => { if (!ready) { ready = true; fn(); } }; },
    init_BasicInfoCommon() {},
  }) as GUIComponent & { update(type: string, value: number): void };
  const container = document.createElement('div');
  container.className = 'ui-component-root'; container.innerHTML = component.render();
  component._shadow.append(container);
  return { ...f, component, root: component.getRoot() };
}
const dbMethodCache = new Map<string, Map<string, string[]>>();
function method(source: string, name: string) {
  let methods = dbMethodCache.get(source);
  if (!methods) {
    methods = new Map();
    const ast = ts.createSourceFile('DBManager.js', nativeRegion(source, 'src/DB/DBManager.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node: ts.Node) {
      if (ts.isMethodDeclaration(node) && (ts.isClassExpression(node.parent) || ts.isClassDeclaration(node.parent))) {
        const key = node.name.getText(ast); methods!.set(key, [...(methods!.get(key) ?? []), node.getText(ast)]);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast); dbMethodCache.set(source, methods);
  }
  const matches = methods.get(name);
  if (matches?.length !== 1) throw new Error('Missing or duplicate native DB method ' + name);
  return matches[0]!;
}
describe('character resource names survive Chinese UI localization', () => {
  it.each(['JobNameTable', 'PalNameTable', 'WeaponJobTable'])('preserves every valid upstream %s basename and the repaired catalog through localization', table => {
    for (const [id, resource] of Object.entries(upstream[table])) {
      if (/^\d+$/.test(id)) expect(fixed[table][id], `${table}[${id}]`).toBe(resource);
    }
    expect(fixed[table]).toEqual(baseline[table]);
    expect(Object.keys(fixed[table]).length).toBeGreaterThan(100);
  });
  it('preserves body paths for every job and both sexes, including alternate costumes', () => {
    function db(source: string, data: typeof fixed) {
      return runInNewContext(`class DB {
        ${method(source, 'isPlayer')}
        ${method(source, 'isDoram')}
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
  it('preserves native palette and weapon paths for all resource-table jobs and both sexes', () => {
    function db(source: string, data: typeof fixed) {
      const mercenaryTable = ts.createSourceFile('MonsterTable.js', nativeRegion(source, 'src/DB/Monsters/MonsterTable.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
        .statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText() === 'LastROMercenaryAppearances'))
        .map(node => node.getText()).join('\n');
      return runInNewContext(`
        const __esmMin=fn=>{let ready=false;return()=>{if(!ready){ready=true;fn()}}};
        ${mercenaryTable}
        ${['WeaponType', 'WeaponTable'].map(name => nativeRegion(source, 'src/DB/Items/' + name + '.js')).join('\n')}
        init_WeaponType(); init_WeaponTable();
        class DB { ${['getBodyPalPath', 'getWeaponPath', 'getWeaponType'].map(name => method(source, name)).join('\n')} }; DB;
      `, { ...data, SexTable: ['¿©', '³²'], init_JobConst() {}, init_JobNameTable() {}, Configs: { get: () => true }, ItemTable_default: {}, WeaponTypeExpansion: {} });
    }
    const expected = db(original, baseline), actual = db(packaged, fixed);
    for (const job of Object.keys(fixed.PalNameTable).map(Number)) for (const sex of [0, 1]) for (const costume of [false, true]) {
      expect(actual.getBodyPalPath(job, 1, sex, costume), `palette job ${job}, sex ${sex}, costume ${costume}`).toBe(expected.getBodyPalPath(job, 1, sex, costume));
    }
    for (const job of Object.keys(fixed.WeaponJobTable).map(Number)) for (const sex of [0, 1]) for (const weapon of [0, 2, 4, 11]) {
      expect(actual.getWeaponPath(weapon, job, sex), `weapon ${weapon}, job ${job}, sex ${sex}`).toBe(expected.getWeaponPath(weapon, job, sex));
    }
  });
  it('keeps Chinese display names separate and never alters monster resource names', () => {
    const { display, monsters } = displayFixture();
    expect(display(0)).toBe('初心者'); expect(display(fixed.JobConst_default.DRAGON_KNIGHT)).toBe('龙骑士');
    expect(display(1002)).toBe('PORING'); expect(monsters[0]).toBe('Novice');
    expect(packaged.match(/lastroJobDisplayName\(info\.job\)/g)).toHaveLength(2);
  });
  it.each([[4010, '超魔导师'], [4023, '宝宝初心者'], [4061, '咒术师']] as const)('resolves exact names and explicit job aliases for %i even after an English monster table reload', (job, label) => {
    const { display, monsters } = displayFixture(), resourceName = monsters[job];
    expect(display(job)).toBe(label);
    monsters[job] = 'LATE_ENGLISH_JOB_' + job;
    expect(display(job)).toBe(label);
    expect(resourceName).toBeDefined(); expect(monsters[job]).toBe('LATE_ENGLISH_JOB_' + job);
  });
  it.each(['BasicInfoV1', 'BasicInfoV3'] as const)('%s native initializer and shared factory update both expanded and folded job fields', version => {
    const f = basicInfoFixture(version), fields = f.root.querySelectorAll('.job_value');
    expect(fields.length).toBeGreaterThanOrEqual(2);
    for (const [job, label] of [[4010, '超魔导师'], [4023, '宝宝初心者'], [4061, '咒术师']] as const) {
      f.component.update('job', job);
      expect([...fields].map(field => field.textContent)).toEqual(Array(fields.length).fill(label));
      f.monsters[job] = 'LATE_ENGLISH_JOB_' + job;
      f.component.update('job', job);
      expect([...fields].map(field => field.textContent)).toEqual(Array(fields.length).fill(label));
      expect(f.monsters[job]).toBe('LATE_ENGLISH_JOB_' + job);
    }
  });
  it('fails visibly if upstream job display sites change', () => {
    expect(() => patchRuntimeJobLocalization(original.replace('MonsterTable_default[info.job]', 'changedJobDisplay(info.job)'))).toThrow('anchor:job-display-lookups');
  });
});
