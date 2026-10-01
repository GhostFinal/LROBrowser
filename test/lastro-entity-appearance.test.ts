import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { LASTRO_MONSTER_APPEARANCES, LASTRO_MERCENARY_APPEARANCES, patchRuntimeEntityAppearance } from '../scripts/lastro-entity-appearance.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8'), patched = patchRuntimeEntityAppearance(vendor);
const paths = { actions: 'src/Renderer/Entity/EntityAction.js', view: 'src/Renderer/Entity/EntityView.js', table: 'src/DB/Monsters/MonsterTable.js', db: 'src/DB/DBManager.js', engine: 'src/Engine/MapEngine/Entity.js' };
function region(name: string, source = patched) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + name);
  return source.slice(start, end + '//#endregion'.length);
}
function file(source: string) { return ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
const declarations = new Map<string, Map<string, string[]>>();
function declaration(source: string, name: string) {
  let functions = declarations.get(source);
  if (!functions) {
    functions = new Map(); const ast = file(source);
    for (const node of ast.statements) if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, [...(functions.get(node.name.text) || []), node.getText(ast)]);
    declarations.set(source, functions);
  }
  const found = functions.get(name);
  if (found?.length !== 1) throw new Error('Missing or duplicate native declaration: ' + name);
  return found[0]!;
}
const dbAst = file(region(paths.db));
const dbMethods = new Map<string, string[]>();
let sexTableSource = '';
function methods(node: ts.Node) {
  if (ts.isMethodDeclaration(node)) { const name = node.name.getText(dbAst); dbMethods.set(name, [...(dbMethods.get(name) || []), node.getText(dbAst)]); }
  if (ts.isBinaryExpression(node) && node.left.getText(dbAst) === 'SexTable') sexTableSource = node.right.getText(dbAst);
  ts.forEachChild(node, methods);
}
methods(dbAst);
if (!sexTableSource) throw new Error('Missing actual native SexTable');
const sexTable = vm.runInNewContext(sexTableSource) as string[];
function dbMethod(name: string) {
  const found = dbMethods.get(name);
  if (found?.length !== 1) throw new Error('Missing or duplicate native DB method: ' + name);
  return found[0]!;
}
const entityAst = file(region('src/Renderer/Entity/Entity.js', vendor)), typeDeclarations: string[] = [];
function types(node: ts.Node) {
  if (ts.isPropertyDeclaration(node) && node.name.getText(entityAst).startsWith('TYPE_')) typeDeclarations.push(node.getText(entityAst));
  ts.forEachChild(node, types);
}
types(entityAst);
const renderAst = file(region('src/Renderer/Entity/EntityRender.js', vendor));
let actionIndexSource = '';
function renderIndex(node: ts.Node) {
  if (ts.isElementAccessExpression(node) && node.expression.getText(renderAst) === 'act.actions') actionIndexSource = node.argumentExpression.getText(renderAst);
  ts.forEachChild(node, renderIndex);
}
renderIndex(renderAst);
if (!actionIndexSource.includes('entity.action * 8')) throw new Error('Missing native ACT action index');

interface ActionOptions { action: number; frame?: number; speed?: number; repeat?: boolean; play?: boolean; next?: ActionOptions | false; delay?: number; }
interface AppearanceEntity {
  constructor: Record<string, number>; GID: number; objecttype: number; _job: number; _sex: number; _body: number; job: number;
  ACTION: Record<string, number>; animation: { tick: number; frame: number; next: ActionOptions | false }; action: number;
  direction: number; files: Record<string, { act: string | null; spr: string | null; size?: number }>;
  position: Float32Array; sound: { free: ReturnType<typeof vi.fn> }; display: { name: string };
  lookTo: ReturnType<typeof vi.fn>; weapon: number; shield: number; attack_speed: number;
  setAction(options: ActionOptions): void;
  sex: number; head: number; accessory: number; accessory2: number; accessory3: number;
  set(unit: Record<string, unknown>): void;
}
interface NativeDB {
  getBodyPath(id: number, sex: number): string | null;
  getWeaponPath(id: number, job: number, sex: number): string | null;
  getWeaponTrail(id: number, job: number, sex: number): string | null;
  isMercenary(id: number): boolean;
}
function fixture(lastro = true, source = patched) {
  const entries = new Map<number, AppearanceEntity>(), requests: string[] = [];
  const loadFile = vi.fn((path: string, callback?: () => void) => { requests.push(path); callback?.(); });
  const context = vm.createContext({
    console, Float32Array, Date: { now: () => 10000 },
    __esmMin: (init: () => void) => { let initialized = false; return () => { if (!initialized) { initialized = true; init(); } }; },
    init_Configs: vi.fn(), Configs: { get: (name: string, fallback: unknown) => name === 'lastroProtocol' ? lastro : fallback },
    MountTable: {}, AllMountTable: {}, ShadowTable_default: {}, BabyTable_default: [], SexTable: sexTable, JobNameTable: {}, JobConst_default: {},
    PacketVerManager_default: { value: 20211103 }, Client: { loadFile }, refreshHeadState() {},
    EntityManager: { get: (id: number) => entries.get(id), add: (entity: AppearanceEntity) => entries.set(entity.GID, entity), getLife: () => null, pendingTransformations: {} }, SessionStorage_default: { Entity: { GID: 999 }, pet: {}, AdminList: [] },
    MAX_ATTACKMT: 2000, AVG_ATTACK_SPEED: 500, C_MULTIHIT_DELAY: 200, Renderer: { tick: 10000 },
    AE: { PROJECTILE: {}, SPAWN: {} }, EffectManager: { spam: vi.fn() }, EffectConst_default: { EF_HIT1: 1, EF_GUARD: 2 },
    Damage: { add: vi.fn(), TYPE: { CRIT: 1, COMBO: 2, COMBO_FINAL: 4 } }, onEntityWillBeHitSub: vi.fn(), controller: { isGroupMember: () => false },
    ChatBox_default: { addText: vi.fn(), TYPE: {}, FILTER: {} },
  });
  vm.runInContext(region(paths.table, source) + '\ninit_MonsterTable();', context);
  vm.runInContext([
    declaration(region(paths.db, source), 'applyLastROPetJobOverrides'), declaration(region(paths.db, source), 'mergeJobNameTable'),
    'class DB {' + ['getBodyPath', 'isPlayer', 'isDoram', 'isNPC', 'isMercenary', 'isMonster', 'isHomunculus', 'isElem', 'isAbr', 'isBionic', 'isWarp', 'isBaby'].map(dbMethod).join('\n')
      + '\nstatic getWeaponAction() { return 0; } static getWeaponSound() {} }',
    'class Entity {' + typeDeclarations.join('\n') + '}',
    ...['Action', 'Animation', 'setAction', 'Init$10'].map(name => declaration(region(paths.actions, source), name)),
    ...['hasTransformation', 'getEffectiveJob', 'isValidEntitySex', 'shouldSuppressHead', 'UpdateBody'].map(name => declaration(region(paths.view, source), name)),
    declaration(region(paths.engine, source), 'onEntityAction'),
    `function nativeActIndex(entity, camera = 0, length = 104) { const Camera = { direction: camera }, act = { actions: { length } }; return ${actionIndexSource}; }`,
  ].join('\n'), context);
  const functions = vm.runInContext('({ types: Entity, init: Init$10, update: UpdateBody, attack: onEntityAction, index: nativeActIndex, db: DB, table: MonsterTable_default, merge: mergeJobNameTable })', context) as {
    types: Record<string, number>; init(this: AppearanceEntity): void; update(this: AppearanceEntity, job: number): void;
    attack(packet: object): void; index(entity: AppearanceEntity, camera?: number, length?: number): number;
    db: NativeDB; table: Record<number, string>; merge(target: Record<number, string>, loaded: Record<number, string>): Record<number, string>;
  };
  function entity(job: number, objecttype = functions.types.TYPE_MERC!, gid = 10) {
    const result = {
      constructor: functions.types, GID: gid, objecttype, _job: job, job, _sex: 1, _body: 0,
      files: { body: { act: null, spr: null }, shadow: { size: 1 } }, position: new Float32Array([25, 41, 0]),
      sound: { free: vi.fn() }, lookTo: vi.fn(), display: { name: '离线实体' }, direction: 0, weapon: 0, shield: 0,
    } as unknown as AppearanceEntity;
    functions.init.call(result); entries.set(gid, result); return result;
  }
  function attack(actor: AppearanceEntity) {
    entity(1002, functions.types.TYPE_MOB!, 11);
    functions.attack({ GID: actor.GID, targetGID: 11, action: 0, attackMT: 250, attackedMT: 100, damage: 10, leftDamage: 0, count: 1 });
  }
  return { ...functions, entity, attack, requests, loadFile, context, entries };
}

let nativeSetSource = '';
const prototypeDefaults: string[] = [];
function entityMembers(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(entityAst) === 'set' &&
      (ts.isClassExpression(node.parent) || ts.isClassDeclaration(node.parent))) {
    if (nativeSetSource) throw new Error('Duplicate actual native Entity.set');
    nativeSetSource = node.getText(entityAst);
  }
  if (ts.isBinaryExpression(node) && node.left.getText(entityAst).startsWith('Entity.prototype.')
      && (ts.isNumericLiteral(node.right) || ts.isPrefixUnaryExpression(node.right) || node.right.kind === ts.SyntaxKind.NullKeyword
        || node.right.kind === ts.SyntaxKind.TrueKeyword || node.right.kind === ts.SyntaxKind.FalseKeyword || node.right.getText(entityAst).startsWith('Entity.TYPE_'))) prototypeDefaults.push(node.getText(entityAst) + ';');
  ts.forEachChild(node, entityMembers);
}
entityMembers(entityAst);
if (!nativeSetSource || !prototypeDefaults.length) throw new Error('Missing actual native Entity.set or defaults');

function spawnFixture(lastro = true) {
  const f = fixture(lastro), received: object[] = [];
  Object.assign(f.context, {
    init_JobConst() {}, init_JobNameTable() {}, init_Client() {}, init_DBManager() {}, init_ShadowTable() {}, init_MountTable() {}, init_AllMountTable() {}, init_EntityAction() {}, init_PacketVerManager() {}, init_GR2ModelRenderer() {},
    ItemTable_default: {}, RobeTable_default: {}, WeaponTypeExpansion: {}, StatusState_default: { EffectState: { FALCON: 1, WUG: 2, INVISIBLE: 4 } }, clanEmblems: {},
    MercenaryInformations_default: { startAI: vi.fn() }, HomunInformations_default: { startAI: vi.fn() },
    recordUnit: (unit: object) => received.push(unit),
    makeParts: () => ({ position: new Float32Array(3), sound: { free: vi.fn() }, lookTo: vi.fn(),
      display: { name: '', load: 0, TYPE: { NONE: 0 }, STYLE: {}, update: vi.fn() },
      life: { hp: -1, hp_max: -1, update: vi.fn() }, walk: { speed: 150 }, aura: { load: vi.fn() } }),
  });
  const nativeTables = [
    ['src/DB/Items/WeaponType.js', 'init_WeaponType'], ['src/DB/Items/WeaponTable.js', 'init_WeaponTable'],
    ['src/DB/Jobs/WeaponJobTable.js', 'init_WeaponJobTable'], ['src/DB/Items/WeaponTrailTable.js', 'init_WeaponTrailTable'],
    ['src/DB/Jobs/HairIndexTable.js', 'init_HairIndexTable'], ['src/DB/Items/HatTable.js', 'init_HatTable'],
  ];
  for (const [path, init] of nativeTables) vm.runInContext(region(path!, vendor) + '\n' + init + '();', f.context);
  vm.runInContext([
    `Object.assign(DB, {${['getWeaponPath', 'getWeaponTrail', 'getWeaponType', 'getWeaponViewID', 'getHeadPath', 'getHatPath', 'getCartPath', 'getRobePath'].map(name => dbMethod(name).replace(/^static /, '')).join(',\n')}});`,
    region(paths.view) + '\ninit_EntityView();',
    `Entity = class extends Entity { constructor() { super(); Object.assign(this, makeParts()); Init$10.call(this); Init$5.call(this); } ${nativeSetSource} };`,
    prototypeDefaults.join('\n'),
    'const nativeSet = Entity.prototype.set; Entity.prototype.set = function (unit) { recordUnit(unit); return nativeSet.call(this, unit); };',
    declaration(region(paths.engine), 'onEntitySpam'),
  ].join('\n'), f.context);
  const flow = vm.runInContext('({ spawn: onEntitySpam, type: Entity, weaponNames: WeaponName })', f.context) as { spawn(packet: object): void; type: new () => AppearanceEntity; weaponNames: Record<number, string> };
  function spawn(unit: Record<string, unknown>) { flow.spawn(unit); return f.entries.get(Number(unit.GID))!; }
  return { ...f, spawn, received, weaponNames: flow.weaponNames };
}

describe('native mercenary action ranges', () => {
  it.each(Array.from({ length: 30 }, (_, index) => 6017 + index))('maps mercenary %i ordinary server attack to native ACT 80 with human ready and death actions', job => {
    const f = fixture(), actor = f.entity(job);
    expect(actor.ACTION.ATTACK).toBe(-2); expect(actor.ACTION.ATTACK1).toBe(5);
    expect(actor.ACTION.READYFIGHT).toBe(4); expect(actor.ACTION.DIE).toBe(8);
    actor.setAction({ action: actor.ACTION.ATTACK! });
    expect(actor.action).toBe(5); expect(f.index(actor)).toBe(40);
    actor.setAction({ action: actor.ACTION.DIE! }); expect(actor.action).toBe(8);
    f.attack(actor);
    expect(actor.action).toBe(10); expect(f.index(actor)).toBe(80); expect(actor.attack_speed).toBe(250);
    actor.direction = 3; expect(f.index(actor, 2)).toBe(85);
    expect(actor.animation.next).toMatchObject({ action: actor.ACTION.IDLE });
  });

  it.each([1002, 3803, 20920])('keeps normal monster %i attack at native ACT 16 and death action 4', job => {
    const f = fixture(), actor = f.entity(job, 5); f.attack(actor);
    expect(actor.ACTION.ATTACK).toBe(2); expect(actor.action).toBe(2); expect(f.index(actor)).toBe(16); expect(actor.ACTION.DIE).toBe(4);
  });

  it.each([[6016, 8], [6047, 5]])('keeps non-mercenary entity %i type %i on its pre-existing action table', (job, type) => {
    const f = fixture(), actor = f.entity(job, type); expect(actor.ACTION.ATTACK).toBe(2); expect(actor.ACTION.DIE).toBe(4);
  });

  it.each([6017, 6026, 6027, 6036, 6037, 6046])('classifies initially UNKNOWN mercenary %i through actual UpdateBody', job => {
    const f = fixture(), actor = f.entity(job, f.types.TYPE_UNKNOWN!);
    expect(Object.hasOwn(f.types, 'TYPE_MER')).toBe(false);
    f.update.call(actor, job);
    expect(actor.objecttype).toBe(9); expect(actor.ACTION.ATTACK1).toBe(5);
    expect(actor.files.body!.spr).toBe(f.db.getBodyPath(job, 1) + '.spr');
    expect(f.requests).toEqual([f.db.getBodyPath(job, 1) + '.act', f.db.getBodyPath(job, 1) + '.spr']);
    f.attack(actor); expect(f.index(actor)).toBe(80);
  });
});

describe('native mercenary spawn and weapon layers', () => {
  it('uses the official class defaults rather than zero equipment from the spawn packet', () => {
    const f = spawnFixture();
    class SpawnPacket {
      GID = 20; job = 6017; objecttype = 9;
      sex = 1; head = 0; accessory = 0; accessory2 = 99; accessory3 = 99; weapon = 0;
    }
    const packet = new SpawnPacket(), actor = f.spawn(packet as unknown as Record<string, unknown>);
    expect(vm.runInContext('Object.getOwnPropertyNames(Entity.prototype)', f.context)).toContain('GID');
    expect([...f.entries.keys()]).toEqual([20]);
    expect(f.received).toEqual([packet]); expect(f.received[0]).toBeInstanceOf(SpawnPacket);
    expect(packet).toMatchObject({ sex: 0, head: 15, accessory: 160, accessory2: 0, accessory3: 0, weapon: 11, objecttype: 9 });
    expect(actor).toMatchObject({ sex: 0, head: 15, accessory: 160, accessory2: 0, accessory3: 0, weapon: 11, objecttype: 9 });
    const body = 'data/sprite/ÀÎ°£Á·/¸öÅë/' + sexTable[0] + '/È°¿ëº´';
    const weapon = 'data/sprite/ÀÎ°£Á·/¿ëº´/È°¿ëº´' + f.weaponNames[11];
    expect(actor.files.body).toMatchObject({ act: body + '.act', spr: body + '.spr' });
    expect(actor.files.weapon).toMatchObject({ act: weapon + '.act', spr: weapon + '.spr' });
    expect(f.requests).toContain(weapon + '.act'); expect(f.requests).toContain(weapon + '.spr');
    expect(f.db.getWeaponTrail(11, 6017, 0)).toBeNull();
    f.attack(actor); actor.direction = 0; expect(actor.action).toBe(10); expect(f.index(actor)).toBe(80);
  });

  it('loads separate body and weapon files for all thirty official mercenary appearances', () => {
    const f = spawnFixture();
    expect(Object.keys(LASTRO_MERCENARY_APPEARANCES).map(Number)).toEqual(Array.from({ length: 30 }, (_, index) => 6017 + index));
    for (const [id, appearances] of Object.entries(LASTRO_MERCENARY_APPEARANCES)) {
      const expected = appearances[0]!, job = Number(id);
      const packet = { GID: job, job, objecttype: 9, sex: 1 - expected.sex, head: 0, accessory: 0, accessory2: 99, accessory3: 99, weapon: 0 };
      const actor = f.spawn(packet);
      expect(actor, id).toMatchObject({ sex: expected.sex, head: expected.head, accessory: expected.accessory, accessory2: expected.accessory2, accessory3: expected.accessory3, weapon: expected.weapon, objecttype: 9 });
      const body = 'data/sprite/ÀÎ°£Á·/¸öÅë/' + sexTable[expected.sex] + '/' + expected.file;
      const weapon = 'data/sprite/ÀÎ°£Á·/¿ëº´/' + expected.file + f.weaponNames[expected.weapon];
      expect(f.db.getBodyPath(job, 0), id).toBe(body); expect(f.db.getBodyPath(job, 1), id).toBe(body);
      expect(actor.files.body, id).toMatchObject({ act: body + '.act', spr: body + '.spr' });
      expect(actor.files.weapon, id).toMatchObject({ act: weapon + '.act', spr: weapon + '.spr' });
      expect(f.requests, id).toContain(weapon + '.act'); expect(f.requests, id).toContain(weapon + '.spr');
      expect(f.db.getWeaponTrail(expected.weapon, job, expected.sex), id).toBeNull();
    }
    expect(f.requests.some(path => /NOVICE|ÃÊº¸ÀÚ/.test(path))).toBe(false);
  });

  it.each(['missing', 'unknown'])('normalizes a known mercenary with initially %s type before native set', type => {
    const f = spawnFixture(), packet = { GID: 22, job: 6027, ...(type === 'missing' ? {} : { objecttype: f.types.TYPE_UNKNOWN }), sex: 0, weapon: 0 };
    const actor = f.spawn(packet);
    expect(packet).toMatchObject({ objecttype: 9, sex: 1, head: 2, accessory: 64, accessory2: 0, accessory3: 0, weapon: 4 });
    expect(actor.objecttype).toBe(9); expect(actor.ACTION.DIE).toBe(8); expect(actor.files.weapon!.spr).toBe(f.db.getWeaponPath(4, 6027, 1) + '.spr');
  });

  it('updates an existing entity through native onEntitySpam and set without losing its identity or old packet prototype', () => {
    const f = spawnFixture(), initial = f.spawn({ GID: 23, job: 6017, objecttype: 9, sex: 1, weapon: 0 });
    class UpdatePacket { GID = 23; job = 6037; objecttype = 9; sex = 0; weapon = 0; }
    const packet = new UpdatePacket(), updated = f.spawn(packet as unknown as Record<string, unknown>);
    expect(updated).toBe(initial); expect(f.entries.size).toBe(1); expect(f.received[1]).toBe(packet); expect(packet).toBeInstanceOf(UpdatePacket);
    expect(updated.sex).toBe(1); expect(updated.weapon).toBe(2);
    expect(updated.files.body!.spr).toBe(f.db.getBodyPath(6037, 0) + '.spr');
    expect(updated.files.weapon!.spr).toBe(f.db.getWeaponPath(2, 6037, 1) + '.spr');
    f.attack(updated); expect(updated.action).toBe(10); expect(updated.animation.next).toMatchObject({ action: 0 });
  });

  it('does not rewrite other entity types or other servers spawn packets', () => {
    const f = spawnFixture(), nonLastro = spawnFixture(false);
    for (const type of [5, 6]) {
      const packet = { GID: 30 + type, job: 6017, objecttype: type, sex: 1, head: 0, accessory: 0, weapon: 0 };
      const original = { ...packet }; f.spawn(packet); expect(packet).toEqual(original);
    }
    const vanilla = { GID: 32, job: 6017, objecttype: 9, sex: 1, head: 0, accessory: 0, weapon: 0 };
    const original = { ...vanilla }, actor = nonLastro.spawn(vanilla);
    expect(vanilla).toEqual(original); expect(actor.weapon).toBe(0); expect(actor.sex).toBe(1);
    expect(actor.files.body!.spr).toBe(nonLastro.db.getBodyPath(6017, 1) + '.spr');
    expect(actor.files.weapon!.spr).toBeNull();
  });

  it('uses the native weapon suffix directly for mercenaries and retains vanilla paths for other jobs', () => {
    const f = spawnFixture(), vanilla = spawnFixture(false);
    (f.context.ItemTable_default as Record<number, { ClassNum: number }>)[11] = { ClassNum: 2 };
    expect(f.db.getWeaponPath(11, 6017, 0)).toBe('data/sprite/ÀÎ°£Á·/¿ëº´/È°¿ëº´' + f.weaponNames[11]);
    expect(f.db.getWeaponPath(0, 6017, 0)).toBeNull();
    expect(f.db.getWeaponPath(2, 0, 0)).toBe(vanilla.db.getWeaponPath(2, 0, 0));
    expect(f.db.getWeaponTrail(2, 0, 0)).toBe(vanilla.db.getWeaponTrail(2, 0, 0));
    expect(vanilla.db.getWeaponPath(11, 6017, 0)).not.toBe(f.db.getWeaponPath(11, 6017, 0));
  });
});

describe('actual MonsterTable initialization and Lua merging', () => {
  it.each([[3799, 'ILL_ASSULTER'], [3800, 'ILL_PERMETER'], [3801, 'ILL_FREEZER'], [3802, 'ILL_SOLIDER'], [3803, 'ILL_HEATER'], [3804, 'ILL_TURTLE_GENERAL']] as const)('loads official sprite name %i as %s instead of the scorpion fallback', (id, name) => {
    const f = fixture();
    expect(f.table[id]).toBe(name); expect(LASTRO_MONSTER_APPEARANCES[id]).toBe(name);
    expect(f.db.getBodyPath(id, 1)).toBe('data/sprite/¸ó½ºÅÍ/' + name.toLowerCase());
    expect(f.db.getBodyPath(id, 1)).not.toBe(f.db.getBodyPath(1001, 1));
    const actor = f.entity(id, f.types.TYPE_UNKNOWN!); f.update.call(actor, id);
    expect(actor.objecttype).toBe(f.types.TYPE_MOB); expect(actor.files.body!.act).toBe('data/sprite/¸ó½ºÅÍ/' + name.toLowerCase() + '.act');
  });

  it('resolves every added appearance through actual getBodyPath while retaining existing native mappings', () => {
    const f = fixture(), baseline = fixture(false, vendor);
    for (const [id, name] of Object.entries(LASTRO_MONSTER_APPEARANCES)) {
      expect(f.table[Number(id)], 'monster ' + id).toBe(baseline.table[Number(id)] || name);
      expect(f.db.getBodyPath(Number(id), 1), 'sprite ' + id).toBe('data/sprite/¸ó½ºÅÍ/' + (baseline.table[Number(id)] || name).toLowerCase());
    }
    for (const [id, name] of Object.entries(baseline.table)) expect(f.table[Number(id)], 'native ' + id).toBe(name);
  });

  it('leaves the complete native table unchanged for non-LastRO clients', () => {
    const vanilla = fixture(false), baseline = fixture(false, vendor);
    expect(vanilla.table).toEqual(baseline.table);
    expect(vanilla.table[3803]).toBeUndefined(); expect(vanilla.db.getBodyPath(3803, 1)).toBe(vanilla.db.getBodyPath(1001, 1));
  });

  it('fills missing Lua names without overwriting an existing authoritative resource name or LastRO pet overrides', () => {
    const f = fixture(), target = { 3803: 'LUA_HEATER', 3901: 'WRONG_PET', 1002: 'LUA_PORING' };
    const result = f.merge(target, { 3800: 'LUA_PERMETER', 3803: 'LUA_HEATER', 3901: 'LUA_PET' });
    expect(result).toBe(target); expect(result[3800]).toBe('LUA_PERMETER'); expect(result[3803]).toBe('LUA_HEATER');
    expect(result[3799]).toBe('ILL_ASSULTER'); expect(result[3804]).toBe('ILL_TURTLE_GENERAL');
    expect(result[3901]).toBe('GOLDEN_BUG'); expect(result[1002]).toBe('LUA_PORING');
    const empty = f.merge({}, {}); for (const [id, name] of Object.entries(LASTRO_MONSTER_APPEARANCES)) expect(empty[Number(id)]).toBe(name);
  });

  it('does not add LastRO fallback names or pet overrides when merging other servers Lua', () => {
    const f = fixture(false), target: Record<number, string> = { 3901: 'ORIGINAL_PET' };
    f.merge(target, { 3803: 'LUA_HEATER', 3901: 'LUA_PET' });
    expect(target).toEqual({ 3803: 'LUA_HEATER', 3901: 'LUA_PET' }); expect(target[3799]).toBeUndefined();
  });
});

describe('appearance patch anchors', () => {
  const needles = ['if (this._job == 6017) {', 'this._job == 6027 || this._job == 6037', 'objecttype = Entity.TYPE_MER;', '  MonsterTable_default = {', '  if (Configs.get("lastroProtocol", false)) applyLastROPetJobOverrides(target);',
    '      if (DB.isMercenary(id))\n        return "data/sprite/ÀÎ°£Á·/¸öÅë/" + MonsterTable_default[id];',
    '    static getWeaponPath(id, job, sex, leftid = false) {\n      if (id === 0) return null;',
    '    static getWeaponTrail(id, job, sex) {\n      if (id === 0) return null;',
    'function onEntitySpam(pkt) {\n  let entity', '      if (pkt.leftDamage) {\n        const useATTACK ='];
  it.each(needles)('rejects missing required native anchor %s', needle => {
    expect(() => patchRuntimeEntityAppearance(vendor.replace(/\r\n/g, '\n').replace(needle, '// missing required anchor'))).toThrow('anchor:entity-appearance');
  });
  it.each(needles)('rejects duplicate required native anchor %s', needle => {
    expect(() => patchRuntimeEntityAppearance(vendor.replace(/\r\n/g, '\n').replace(needle, needle + '\n' + needle))).toThrow('anchor:entity-appearance');
  });
  it.each(Object.values(paths))('rejects duplicate native region %s', name => {
    expect(() => patchRuntimeEntityAppearance(vendor + '\n' + region(name, vendor))).toThrow('anchor:entity-appearance');
  });
});
