import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { patchRuntimeEquipmentCatalog } from '../scripts/lastro-equipment-view.mjs';

const vendor = fs.readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeEquipmentCatalog(vendor);
function region(source: string, name: string) {
  const marker = '//#region ' + name, start = source.indexOf(marker), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + name);
  return source.slice(start, end);
}
const paths = ['Jobs/JobConst', 'Jobs/JobNameTable', 'Jobs/WeaponJobTable', 'Jobs/MountTable', 'Jobs/AllMountTable',
  'Items/WeaponType', 'Items/HatTable', 'Items/RobeTable', 'Items/ShieldTable', 'Items/WeaponTable', 'Items/WeaponTypeExpansion', 'Items/WeaponTrailTable'];
const methodNames = ['getHatPath', 'getRobePath', 'getRobePathNoSex', 'isDoram', 'getWeaponPath', 'getWeaponTrail', 'getWeaponType', 'getShieldPath', 'isShield', 'getBodyPath', 'isPlayer'];
interface Catalog {
  HatTable_default: Record<string, string>; RobeTable_default: Record<string, string>;
  JobNameTable: Record<string, string>; WeaponJobTable: Record<string, string>;
  MountTable: Record<string, number>; AllMountTable: Record<string, number>; JobConst_default: Record<string, number>;
  WeaponType_default: Record<string, number>; WeaponTypeExpansion: Record<string, number>;
  WeaponName: Record<string, string>; WeaponTrail: Record<string, string>; ShieldTable_default: Record<string, string>;
  ItemTable_default: Record<number, { ClassNum: number }>;
  DB: {
    getBodyPath(id: number, sex: number, alternative?: number, cashMount?: boolean): string | null;
    getHatPath(id: number, sex: number): string | null;
    getRobePath(id: number, job: number, sex: number): string | null;
    getRobePathNoSex(id: number, job: number, sex: number): string | null;
    getWeaponType(id: number, real?: boolean, dual?: boolean): number;
    getWeaponPath(id: number, job: number, sex: number): string | null;
    getWeaponTrail(id: number, job: number, sex: number): string | null;
    getShieldPath(id: number, job: number, sex: number): string | null;
  };
}
function load(source: string): Catalog {
  const file = ts.createSourceFile('DB.js', region(source, 'src/DB/DBManager.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && methodNames.includes(node.name.getText(file))) methods.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (methods.length !== methodNames.length) throw new Error('Missing or duplicate native equipment path method');
  return vm.runInNewContext(`
    const __esmMin = fn => { let ready = false; return () => { if (!ready) { ready = true; fn(); } }; };
    ${paths.map(path => region(source, 'src/DB/' + path + '.js')).join('\n')}
    ${paths.map(path => 'init_' + path.split('/')[1] + '();').join('\n')}
    const SexTable = ['¿©', '³²'], ItemTable_default = {}, PacketVerManager_default = { value: 20240101 };
    class DB { ${methods.join('\n')} }
    ({DB, ItemTable_default, HatTable_default, RobeTable_default, JobNameTable, WeaponJobTable,
      MountTable, AllMountTable, JobConst_default, WeaponType_default, WeaponTypeExpansion, WeaponName, WeaponTrail, ShieldTable_default});
  `) as Catalog;
}
const catalog = load(patched);
const numericKeys = (table: object) => Object.keys(table).filter(key => /^\d+$/.test(key)).map(Number);
const jobs = numericKeys(catalog.JobNameTable), weaponJobs = numericKeys(catalog.WeaponJobTable);

describe('complete bundled equipment catalogs through native resource resolvers', () => {
  it('preserves all existing valid resource names and job IDs while repairing missing aliases', () => {
    const native = load(vendor);
    for (const name of ['HatTable_default', 'RobeTable_default', 'WeaponName', 'WeaponTrail', 'ShieldTable_default', 'WeaponType_default'] as const) {
      expect(catalog[name]).toEqual(native[name]);
    }
    for (const name of ['JobNameTable', 'WeaponJobTable', 'MountTable', 'AllMountTable'] as const) {
      for (const [key, value] of Object.entries(native[name])) {
        if (key !== 'undefined' && value !== undefined) expect(catalog[name][key]).toBe(value);
      }
    }
  });

  it('keeps every catalog entry resolvable for both sexes without losing its resource identifier', () => {
    const failures: string[] = [];
    for (const [id, resource] of Object.entries(catalog.HatTable_default)) {
      if (+id === 0) continue;
      for (const sex of [0, 1]) {
        const path = catalog.DB.getHatPath(+id, sex);
        if (typeof resource !== 'string' || !resource || !path?.endsWith(resource) || /undefined|null|\.\.\//.test(path)) failures.push(`hat ${id}/${sex}`);
      }
    }
    for (const [id, resource] of Object.entries(catalog.RobeTable_default)) {
      if (+id === 0) continue;
      for (const job of jobs) for (const sex of [0, 1]) {
        const path = catalog.DB.getRobePath(+id, job, sex);
        if (typeof resource !== 'string' || !resource || !path?.includes('/' + resource + '/') || !path.includes(catalog.JobNameTable[job]!) || /undefined|null|\.\.\//.test(path)) failures.push(`robe ${id}/${job}/${sex}`);
      }
    }
    expect(failures).toEqual([]);
    expect(Object.keys(catalog.HatTable_default).length).toBeGreaterThan(2000);
    expect(Object.keys(catalog.RobeTable_default).length).toBeGreaterThan(200);
  });

  it('maps every expanded weapon class to a defined base weapon and trail', () => {
    const failures = Object.entries(catalog.WeaponTypeExpansion).filter(([, base]) =>
      !Number.isInteger(base) || !(base in catalog.WeaponName) || !(base in catalog.WeaponTrail));
    expect(failures).toEqual([]);
    for (const [classId, base] of Object.entries(catalog.WeaponTypeExpansion)) {
      expect(catalog.DB.getWeaponType(+classId, true)).toBe(base);
    }
  });

  it('regresses the two staff classes that previously produced undefined weapon resources', () => {
    const native = load(vendor);
    for (const id of [catalog.WeaponType_default.Staff_Of_Soul!, catalog.WeaponType_default.Wizardy_Staff!]) {
      expect(native.DB.getWeaponType(id, true)).toBeUndefined();
      expect(catalog.DB.getWeaponType(id, true)).toBe(catalog.WeaponType_default.TWOHANDROD);
      expect(catalog.DB.getWeaponTrail(id, 4010, 1)).not.toContain('undefined');
    }
  });

  it('resolves all base weapon and shield families for every bundled job and sex', () => {
    const failures: string[] = [];
    for (const job of weaponJobs) for (const sex of [0, 1]) {
      for (const type of numericKeys(catalog.WeaponName).filter(id => id !== 0)) {
        const weapon = catalog.DB.getWeaponPath(type, job, sex), trail = catalog.DB.getWeaponTrail(type, job, sex);
        if (!weapon || !trail || /undefined|null/.test(weapon + trail)) failures.push(`weapon ${type}/${job}/${sex}`);
      }
      for (const type of numericKeys(catalog.ShieldTable_default)) {
        const itemId = 2100 + type;
        catalog.ItemTable_default[itemId] = { ClassNum: type };
        const path = catalog.DB.getShieldPath(itemId, job, sex);
        if (!path?.endsWith(catalog.ShieldTable_default[type]!) || /undefined|null/.test(path)) failures.push(`shield ${type}/${job}/${sex}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('preserves missing and unequipped resource behavior', () => {
    for (const sex of [0, 1]) for (const id of [0, 999999]) {
      expect(catalog.DB.getHatPath(id, sex)).toBeNull();
      expect(catalog.DB.getRobePath(id, 4010, sex)).toBeNull();
      expect(catalog.DB.getRobePathNoSex(id, 4010, sex)).toBeNull();
    }
    expect(catalog.DB.getWeaponPath(0, 4010, 1)).toBeNull();
    expect(catalog.DB.getShieldPath(0, 4010, 1)).toBeNull();
  });

  it('resolves every native mount to a numeric job with a real bundled body name', () => {
    for (const table of [catalog.MountTable, catalog.AllMountTable]) {
      const failures = Object.entries(table).filter(([key, value]) => !/^\d+$/.test(key) || !Number.isInteger(value) || typeof catalog.JobNameTable[value] !== 'string');
      expect(failures).toEqual([]);
      for (const target of Object.values(table)) for (const sex of [0, 1]) {
        const path = catalog.DB.getBodyPath(target, sex);
        expect(path).toContain(catalog.JobNameTable[target]);
        expect(path).not.toMatch(/undefined|null/);
      }
    }
    expect(Object.hasOwn(catalog.JobNameTable, 'undefined')).toBe(false);
    expect(Object.hasOwn(catalog.WeaponJobTable, 'undefined')).toBe(false);
  });

  it('uses the intended body and robe names for alternate Archbishop and Soul Reaper mounts', () => {
    const native = load(vendor);
    expect(native.JobNameTable[4336]).toBeUndefined();
    for (const job of [4336, 4246, 4248]) for (const sex of [0, 1]) {
      const resource = catalog.JobNameTable[job]!;
      expect(resource).toBeTruthy();
      expect(resource).not.toBe(catalog.JobNameTable[0]);
      expect(catalog.DB.getBodyPath(job, sex)).toContain(resource);
      for (const robe of numericKeys(catalog.RobeTable_default).filter(id => id !== 0)) expect(catalog.DB.getRobePath(robe, job, sex)).toContain(resource);
    }
    expect(catalog.AllMountTable[4227]).toBe(4235);
    expect(catalog.AllMountTable[4228]).toBe(4236);
    expect(catalog.AllMountTable[4240]).toBe(4246);
    expect(catalog.AllMountTable[4242]).toBe(4248);
  });

  it('keeps the reviewed costume headgear IDs and both shared robe resource forms', () => {
    for (const [id, name] of [[3133, '_44503'], [3134, '_44504'], [3143, '_44565']] as const) expect(catalog.HatTable_default[id]).toBe(name);
    for (const id of numericKeys(catalog.RobeTable_default).filter(id => id !== 0)) {
      const shared = catalog.DB.getRobePathNoSex(id, 4010, 1)!;
      expect(shared.endsWith(catalog.RobeTable_default[id]!)).toBe(true);
      expect(catalog.DB.getRobePathNoSex(id, 4218, 0)).toBe(shared + '_doram');
    }
  });

  it('fails closed if an upstream catalog changes the reviewed patch anchors', () => {
    expect(() => patchRuntimeEquipmentCatalog(patched)).toThrow('anchor:equipment-catalog');
    expect(() => patchRuntimeEquipmentCatalog(vendor.replace('WeaponType_default.WPCLASS_TWOHANDROD', 'WeaponType_default.TWOHANDROD'))).toThrow('anchor:equipment-catalog');
  });
});
