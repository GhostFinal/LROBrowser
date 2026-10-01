import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeEntitySync } from '../scripts/lastro-entity-sync.mjs';

const vendor = readFileSync(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
function region(name: string, source = vendor) {
  const start = source.indexOf(`//#region ${name}`);
  if (start < 0) throw new Error(name);
  const end = source.indexOf('//#endregion', start) + '//#endregion'.length;
  return source.slice(start, end);
}
const native = region('src/Renderer/Entity/EntityWalk.js') + '\n' + region('src/Engine/MapEngine/Entity.js');
const patched = patchRuntimeEntitySync(native);
function declaration(source: string, name: string) {
  const file = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (nodes.length !== 1) throw new Error(name);
  return nodes[0]!.getText(file);
}
function entityMethod(name: string) {
  const file = ts.createSourceFile('Entity.js', region('src/Renderer/Entity/Entity.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods: ts.MethodDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (methods.length !== 1) throw new Error(name);
  return methods[0]!.getText(file);
}

interface Walk {
  speed: number; tick: number; prevTick: number; dist: number; index: number; total: number;
  pos: Float32Array; lastPos: Float32Array; path: Int16Array; onEnd: (() => void) | null;
}
interface ActionOptions {
  action: number; frame?: number; repeat?: boolean; play?: boolean; next?: ActionOptions | false; delay?: number;
}
interface Entity {
  GID: number; objecttype: number; ACTION: Record<string, number>; action: number;
  position: Float32Array; walk: Walk;
  animation: { next: ActionOptions | false; save: ActionOptions | false; repeat: boolean; delay: number };
  _deathSyncTick: number; remove_tick: number; remove_delay: number;
  onWalkEnd: () => void;
  walkTo(x0: number, y0: number, x1: number, y1: number, range?: number, start?: number): void;
  walkProcess(): void; resetRoute(keepDistance?: boolean): void; remove(type: number): void;
  setAction(options: ActionOptions): void;
}

function fixture(source = patched, objecttype = 5) {
  let now = 10000;
  const SessionStorage_default = { serverTick: 10000, Entity: null as Entity | null };
  const Renderer = { tick: now };
  const cells = new Uint8Array(12 * 12).fill(10);
  const Altitude = {
    width: 12, height: 12, cells, types: { NONE: 1, WALKABLE: 2, WATER: 4, SNIPABLE: 8 },
    getCellHeight: vi.fn((x: number, y: number) => x + y),
  };
  const timers: { callback: () => void; due: number }[] = [];
  const Events = { setTimeout: vi.fn((callback: () => void, delay: number) => { timers.push({ callback, due: now + delay }); }) };
  const entries = new Map<number, Entity>();
  const EntityManager = {
    get: (id: number) => entries.get(id),
    removeGID: vi.fn((id: number) => entries.delete(id)),
    removeLife: vi.fn(), getFocusEntity: () => SessionStorage_default.Entity,
  };
  const constants = {
    TYPE_PC: 0, TYPE_DISGUISED: 1, TYPE_MOB: 5, TYPE_NPC: 6, TYPE_PET: 7, TYPE_HOM: 8,
    TYPE_MERC: 9, TYPE_ELEM: 10, TYPE_NPC2: 12, TYPE_NPC_ABR: 13, TYPE_NPC_BIONIC: 14,
    TYPE_FALCON: 15, TYPE_WUG: 16, TYPE_WARP: -1,
    VT: { OUTOFSIGHT: 0, DEAD: 1, EXIT: 2, TELEPORT: 3 },
  };
  const LastROAdvanceServerTick = vi.fn(() => SessionStorage_default.serverTick);
  const context = vm.createContext({
    Date: { now: () => now }, console, Float32Array, Int16Array, Uint32Array, Uint16Array, Uint8Array,
    __esmMin: (init: () => void) => { let loaded = false; return () => { if (!loaded) { loaded = true; init(); } }; },
    init_PathFinding: () => {}, init_Altitude: () => {},
    init_SessionStorage: () => {}, init_DBManager: () => {},
    SessionStorage_default, Renderer, Events, EntityManager, Altitude, Entity: constants,
    LastROAdvanceServerTick,
    Configs: { get: (name: string, fallback: unknown) => name === 'lastroProtocol' ? true : fallback },
    DB: { getWeaponAction: () => 0 },
    EffectManager: { remove: vi.fn(), spam: vi.fn() },
    StatusState_default: { EffectState: { INVISIBLE: 1 } },
    EffectConst_default: { EF_DEVIL: 1 },
    HomunInformations_default: { stopAI: vi.fn() }, MercenaryInformations_default: { stopAI: vi.fn() },
    Escape_default: { showDeathMenu: vi.fn() }, haveSiegfriedItem: () => false,
    C_DEATH_SYNC_OFFSET: 200, C_MULTIHIT_DELAY: 200,
  });
  vm.runInContext(region('src/Utils/PathFinding.js'), context);
  vm.runInContext('init_PathFinding(); PathFinding_default.setGat(Altitude);', context);
  const action = region('src/Renderer/Entity/EntityAction.js');
  const walk = region('src/Renderer/Entity/EntityWalk.js', source);
  const engine = region('src/Engine/MapEngine/Entity.js', source);
  vm.runInContext([
    declaration(action, 'Action'), declaration(action, 'Animation'), declaration(action, 'setAction'), declaration(action, 'Init$10'),
    walk,
    declaration(engine, 'onEntityVanish'), declaration(engine, 'onEntityWillBeHitSub'),
    'init_EntityWalk();',
  ].join('\n'), context);
  const functions = vm.runInContext(`({
    action: Init$10, walk: Init$4, compute: computeWalkStartTick,
    vanish: onEntityVanish, hit: onEntityWillBeHitSub,
    methods: {${entityMethod('remove')}, ${entityMethod('clean')}}
  })`, context) as {
    action(this: Entity): void; walk(this: Entity): void;
    compute(now: number, start: unknown, duration: number, limit?: number): number;
    vanish(pkt: { GID: number; type: number }): void;
    hit(pkt: { damage: number; leftDamage?: number; count?: number; action: number; attackMT: number; attackedMT: number }, entity: Entity): void;
    methods: Record<string, unknown>;
  };
  const noop = () => {};
  const component = { clean: noop, free: noop, remove: noop };
  const entity = Object.assign({
    constructor: constants, GID: 123, objecttype, position: new Float32Array([1, 1, 2]),
    sound: { free: noop }, _job: 1002, _sex: 0, weapon: 0, _effectState: 0,
    life: component, emblem: component, display: component, dialog: component, cast: component,
    room: component, attachments: component, animations: component, aura: component, dropEffect: component,
    _deathSyncTick: 0, remove_tick: 0, remove_delay: 0,
  }, functions.methods) as unknown as Entity;
  functions.action.call(entity);
  functions.walk.call(entity);
  entity.setAction({ action: entity.ACTION.IDLE!, repeat: true, play: true });
  entries.set(entity.GID, entity);
  // A separate current player keeps NPC deaths out of the player death-menu branch.
  SessionStorage_default.Entity = objecttype === constants.TYPE_PC ? entity : { GID: 999 } as Entity;
  return {
    entity, functions, SessionStorage_default, Renderer, Events, timers, entries, cells, EntityManager,
    Altitude, LastROAdvanceServerTick,
    setNow(value: number) { now = value; },
    flush(value: number) { now = value; for (const timer of timers.filter(timer => timer.due <= now)) timer.callback(); },
  };
}

describe('server-authoritative entity synchronization', () => {
  it('reproduces the native wait for attack motion plus 200ms before showing a received death', () => {
    const f = fixture(native);
    f.functions.hit({ damage: 10, count: 4, action: 0, attackMT: 800, attackedMT: 400 }, f.entity);
    f.functions.vanish({ GID: 123, type: 1 });
    expect(f.entity.action).toBe(f.entity.ACTION.IDLE);
    expect(f.Events.setTimeout.mock.calls.at(-1)?.[1]).toBe(1600);
    expect(f.entries.has(123)).toBe(false);
    f.flush(11600);
    expect(f.entity.action).toBe(f.entity.ACTION.DIE);
  });

  it('plays native death immediately and clears saved/next animations despite pending multihits', () => {
    const f = fixture();
    f.entity.setAction({ action: f.entity.ACTION.ATTACK!, next: { action: f.entity.ACTION.WALK! } });
    f.entity.setAction({ action: f.entity.ACTION.HURT!, delay: 20000 });
    f.functions.hit({ damage: 10, leftDamage: 10, count: 5, action: 0, attackMT: 800, attackedMT: 400 }, f.entity);
    const timers = f.timers.length;
    f.functions.vanish({ GID: 123, type: 1 });
    expect(f.entity.action).toBe(f.entity.ACTION.DIE);
    expect(f.entity.animation.next).toBe(false);
    expect(f.entity.animation.save).toBe(false);
    expect(f.entity._deathSyncTick).toBe(0);
    expect(f.entity.remove_delay).toBe(5000);
    expect(f.timers).toHaveLength(timers);
    f.flush(20000);
    expect(f.entity.action).toBe(f.entity.ACTION.DIE);
  });

  it('preserves native player death/repeat and out-of-sight cleanup', () => {
    const player = fixture(patched, 0);
    player.entity._deathSyncTick = 50000;
    player.functions.vanish({ GID: 123, type: 1 });
    expect(player.entity.action).toBe(player.entity.ACTION.DIE);
    expect(player.entity.animation.repeat).toBe(true);
    expect(player.entity.GID).toBe(123);
    expect(player.Events.setTimeout).not.toHaveBeenCalled();
    const mob = fixture();
    mob.functions.vanish({ GID: 123, type: 0 });
    expect(mob.entity.GID).toBe(-1);
    expect(mob.entity.remove_tick).toBe(10000);
    expect(mob.entity.remove_delay).toBe(1000);
  });

  it('uses a fresh server clock when the packet arrives before the next render frame', () => {
    const f = fixture();
    f.LastROAdvanceServerTick.mockImplementation(() => f.SessionStorage_default.serverTick = 10450);
    f.entity.walk.speed = 150;
    f.entity.walkTo(1, 1, 6, 1, undefined, 10000);
    expect(f.LastROAdvanceServerTick).toHaveBeenCalledOnce();
    expect(f.entity.position[0]).toBeCloseTo(4);
    expect(f.entity.position[1]).toBe(1);
    expect(f.entity.walk.tick).toBe(10000);
  });

  it('reproduces the native ignored moveStartTime and fixes it for monsters and players', () => {
    const old = fixture(native);
    old.SessionStorage_default.serverTick = 10300;
    old.entity.walkTo(1, 1, 6, 1, undefined, 10000);
    expect(old.entity.position[0]).toBe(1);
    expect(old.entity.walk.tick).toBe(10000);
    for (const type of [5, 0]) {
      const f = fixture(patched, type);
      f.SessionStorage_default.serverTick = 10300;
      f.entity.walkTo(1, 1, 6, 1, undefined, 10000);
      expect(f.entity.position[0]).toBeCloseTo(3);
      expect(f.entity.walk.tick).toBe(10000);
    }
  });

  it('resumes at current authoritative route time after a stall and then advances at normal speed', () => {
    const f = fixture();
    f.entity.walk.speed = 150;
    f.entity.walkTo(1, 1, 10, 1, undefined, 10000);
    f.setNow(10600);
    f.entity.walkProcess();
    expect(f.entity.position[0]).toBeCloseTo(5);
    f.setNow(10616);
    f.entity.walkProcess();
    expect(f.entity.position[0]).toBeCloseTo(5 + 16 / 150);
    f.setNow(13000);
    f.entity.walkProcess();
    expect(Array.from(f.entity.position)).toEqual([10, 1, 11]);
    expect(f.entity.walk.total).toBe(0);
    expect(f.entity.action).toBe(f.entity.ACTION.IDLE);
  });

  it('does not interpolate a stale displayed position through a wall to the first server path cell', () => {
    const old = fixture(native);
    const fixed = fixture();
    for (const f of [old, fixed]) {
      f.cells[3 + 3 * 12] = 1;
      f.entity.position.set([2, 3, 5]);
      f.entity.walk.speed = 150;
      f.entity.walkTo(4, 3, 7, 3, undefined, 10000);
      f.setNow(10150);
      f.entity.walkProcess();
    }
    expect(old.entity.position[0]).toBeCloseTo(3);
    expect(fixed.entity.position[0]).toBeCloseTo(5);
    expect(fixed.entity.position[1]).toBe(3);
    expect(fixed.entity.position[2]).toBe(8);
  });

  it('retains native A* obstacle routing rather than turning the whole route into a straight segment', () => {
    const f = fixture();
    f.cells[3 + 3 * 12] = 1;
    f.entity.walk.speed = 150;
    f.entity.position.set([1, 3, 4]);
    f.entity.walkTo(1, 3, 5, 3, undefined, 10000);
    const points = Array.from(f.entity.walk.path.slice(0, f.entity.walk.total));
    for (let i = 0; i < points.length; i += 2) {
      expect(f.cells[points[i]! + points[i + 1]! * 12]).not.toBe(1);
    }
    expect(points.some((value, index) => index % 2 === 1 && value !== 3)).toBe(true);
    f.setNow(10300);
    f.entity.walkProcess();
    expect(Math.round(f.entity.position[1]!)).not.toBe(3);
    f.setNow(12000);
    f.entity.walkProcess();
    expect(Array.from(f.entity.position)).toEqual([5, 3, 8]);
  });

  it('replaces an old route using the native reset/onEnd lifecycle exactly once', () => {
    const f = fixture();
    f.entity.walkTo(1, 1, 7, 1, undefined, 10000);
    const previous = vi.fn();
    f.entity.walk.onEnd = previous;
    f.SessionStorage_default.serverTick = 10150;
    f.entity.walkTo(2, 1, 2, 5, undefined, 10150);
    expect(previous).toHaveBeenCalledOnce();
    expect(f.entity.walk.onEnd).toBe(null);
    const current = vi.fn();
    f.entity.walk.onEnd = current;
    f.setNow(11000);
    f.entity.walkProcess();
    f.entity.walkProcess();
    expect(previous).toHaveBeenCalledOnce();
    expect(current).toHaveBeenCalledOnce();
    expect(Array.from(f.entity.position)).toEqual([2, 5, 7]);
  });

  it('applies a zero-distance server movement correction and stops the previous route', () => {
    const f = fixture();
    f.entity.walkTo(1, 1, 7, 1, undefined, 10000);
    f.entity.walkTo(3, 4, 3, 4, undefined, 10000);
    expect(Array.from(f.entity.position)).toEqual([3, 4, 7]);
    expect(f.entity.walk.total).toBe(0);
    expect(f.entity.action).toBe(f.entity.ACTION.IDLE);
  });

  it('preserves the no-timestamp native movement and non-walkable follower API', () => {
    const f = fixture();
    f.entity.position.set([1.5, 1, 2.5]);
    f.entity.walkTo(1, 1, 4, 1);
    expect(Array.from(f.entity.walk.pos)).toEqual([1.5, 1, 2.5]);
    expect(f.entity.walk.prevTick).toBe(10000);
    expect(f.entity.position[0]).toBe(1.5);
    expect(declaration(region('src/Renderer/Entity/EntityWalk.js', patched), 'walkToNonWalkableGround'))
      .toBe(declaration(region('src/Renderer/Entity/EntityWalk.js'), 'walkToNonWalkableGround'));
  });

  it('clamps a delayed completed route to its endpoint instead of replaying a stale movement', () => {
    const f = fixture();
    f.SessionStorage_default.serverTick = 20000;
    f.entity.walkTo(1, 1, 4, 1, undefined, 10000);
    expect(Array.from(f.entity.position)).toEqual([4, 1, 5]);
    expect(f.entity.walk.total).toBe(0);
  });

  it('handles uint32 rollover and a zero packet timestamp', () => {
    const f = fixture();
    f.SessionStorage_default.serverTick = 50;
    expect(f.functions.compute(10000, 0xfffffff0, 500)).toBe(9934);
    f.SessionStorage_default.serverTick = 0x100000032;
    expect(f.functions.compute(10000, 0xfffffff0, 500)).toBe(9934);
    expect(f.functions.compute(10000, 0, 500)).toBe(9950);
  });

  it.each([undefined, NaN, Infinity, -1, 0x100000000, 1.5, '10000'])('does not fast-forward an invalid packet timestamp %s', start => {
    const f = fixture();
    f.SessionStorage_default.serverTick = 11000;
    expect(f.functions.compute(10000, start, 500)).toBe(10000);
  });

  it('does not fast-forward a future timestamp or an unsampled server clock', () => {
    const f = fixture();
    expect(f.functions.compute(10000, 10500, 500)).toBe(10000);
    f.SessionStorage_default.serverTick = 0;
    expect(f.functions.compute(10000, 1, 500)).toBe(10000);
  });
});

describe('entity synchronization patch anchors', () => {
  it('skips small fixtures without either independent region', () => {
    expect(patchRuntimeEntitySync('const sample = 1;')).toBe('const sample = 1;');
  });
  it.each([
    native.replace('function walkTo(', 'function renamedWalkTo('),
    native.replaceAll('this.walk.pos.set(this.position);', 'this.walk.pos.set(otherPosition);'),
    native.replace('walk.prevTick + MAX_WALK_CATCHUP_DELTA', 'walk.prevTick + 200'),
    native.replace('entity.remove(pkt.type);', 'entity.remove(otherType);'),
    native + region('src/Renderer/Entity/EntityWalk.js'),
  ])('rejects changed or duplicate native anchors', source => {
    expect(() => patchRuntimeEntitySync(source)).toThrow('anchor:entity-sync');
  });
  it('preserves the native packet handlers, movement pathfinder and damage scheduling', () => {
    const engine = region('src/Engine/MapEngine/Entity.js', patched);
    for (const name of ['onEntityMove', 'onEntityStopMove', 'onEntityWillBeHitSub']) {
      expect(declaration(engine, name)).toBe(declaration(region('src/Engine/MapEngine/Entity.js'), name));
    }
    const output = patchRuntimeEntitySync(vendor);
    expect(region('src/Utils/PathFinding.js', output)).toBe(region('src/Utils/PathFinding.js'));
    expect(region('src/Engine/MapEngine/Main.js', output)).toBe(region('src/Engine/MapEngine/Main.js'));
  });
});
