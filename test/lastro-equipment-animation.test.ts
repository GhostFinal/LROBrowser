import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeEquipmentAnimation } from '../scripts/lastro-equipment-animation.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeEquipmentAnimation(vendor);
const renderPath = 'src/Renderer/Entity/EntityRender.js';
function region(path: string, source = vendor) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing actual native region: ' + path);
  return source.slice(start, end);
}
function ast(source: string) { return ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
function functions(source: string, names: string[]) {
  const file = ast(source);
  return names.map(name => {
    const matches = file.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (matches.length !== 1) throw new Error('Missing or duplicate actual native function: ' + name);
    return matches[0]!.getText(file);
  }).join('\n');
}
function renderingSource(source: string) {
  const file = ast(region(renderPath, source)), extracted: string[] = [], closures = new Map<string, string[]>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && !['render$5', 'renderLayer', 'renderSecondBody', 'Init$3'].includes(statement.name?.text || '')) extracted.push(statement.getText(file));
    if (ts.isVariableStatement(statement) && !statement.declarationList.declarations.some(declaration => declaration.name.getText(file) === 'init_EntityRender')) extracted.push(statement.getText(file));
  }
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = node.left.getText(file);
      if (['renderEntity', 'renderElement', 'WALK_DIST_TO_MOTION'].includes(name)) closures.set(name, [...(closures.get(name) || []), node.getText(file) + ';']);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const name of ['WALK_DIST_TO_MOTION', 'renderEntity', 'renderElement']) {
    const matches = closures.get(name);
    if (matches?.length !== 1) throw new Error('Missing or duplicate actual native closure: ' + name);
    extracted.push(matches[0]!);
  }
  return extracted.join('\n');
}
const entityAst = ast(region('src/Renderer/Entity/Entity.js'));
const typeDeclarations: string[] = [];
function types(node: ts.Node) {
  if (ts.isPropertyDeclaration(node) && node.name.getText(entityAst).startsWith('TYPE_')) typeDeclarations.push(node.getText(entityAst));
  ts.forEachChild(node, types);
}
types(entityAst);
if (!typeDeclarations.length) throw new Error('Missing actual native Entity types');

interface ActionOptions { action: number; frame?: number; speed?: number; length?: number; repeat?: boolean; play?: boolean; next?: ActionOptions | false; }
interface NativeAnimation { tick: number; frame: number; repeat: boolean; play: boolean; next: ActionOptions | false; speed?: number | false; length?: number | false; }
interface Layer { index: number; frame: number; action: number; direction: number; pos?: number[]; }
interface NativeFrame { layers: Layer[]; pos: { x: number; y: number }[]; sound: number; }
interface NativeAction { animations: NativeFrame[]; delay: number; }
interface NativeAct { actions: NativeAction[]; sounds: string[]; }
interface PartFile { act: string; spr: string; size: number; }
interface Draw { type: string; part: string; frame: number; action: number; direction: number; position: number[]; zIndex: number; }
interface Actor {
  constructor: Record<string, number>; ACTION: Record<string, number>; animation: NativeAnimation;
  objecttype: number; action: number; direction: number; headDir: number; robe: number; weapon: number;
  shield: number; accessory: number; accessory2: number; accessory3: number;
  files: Record<string, PartFile>; attack_speed: number; walk: { speed: number; dist: number; _motionPhase?: number; _motionPhaseTick?: number };
  position: Float32Array; setAction(options: ActionOptions): void; renderLayer(layer: Layer, spr: { part: string }, pal: unknown, size: number, pos: Int32Array, type: string): void;
}
interface FixtureOptions {
  bodyCount?: number; robeCount?: number; headCount?: number; bodyDelay?: number; robeDelay?: number; headDelay?: number;
  parts?: Partial<Record<'accessory' | 'accessory2' | 'accessory3' | 'shield' | 'weapon_trail', { count: number; delay: number }>>;
}
function fixture(source = patched, options: FixtureOptions = {}) {
  let now = 1000, clockStep = 0;
  const resources = new Map<string, NativeAct | { part: string }>(), draws: Draw[] = [];
  const client = { loadFile: vi.fn((path: string) => resources.get(path)) };
  const renderer = { position: new Float32Array(3), zIndex: 0, shadow: 0, runWithDepth: (_test: boolean, _write: boolean, _color: boolean, callback: () => void) => callback() };
  const context = vm.createContext({
    console, Int32Array, Float32Array, Date: { now: () => { const value = now; now += clockStep; return value; } },
    Configs: { get: (key: string, fallback: unknown) => key === 'lastroProtocol' ? true : fallback },
    Client: client, SpriteRenderer: renderer, Camera: { direction: 0 },
    Ground_default: { getShadowFactor: () => 1 }, Altitude: { getCellHeight: () => 0 },
    StatusState_default: { EffectState: {}, Status: {}, OPT3: {} }, SessionStorage_default: { Playing: false },
    DB: { getWeaponAction: () => 0, isSuperNovice: () => false }, renderSecondBody: vi.fn(),
  });
  vm.runInContext('class Entity {' + typeDeclarations.join('\n') + '}\n' + functions(region('src/Renderer/Entity/EntityAction.js', source), ['Action', 'Animation', 'setAction', 'Init$10']) + '\n' + renderingSource(source), context);
  const native = vm.runInContext('({ Entity, init: Init$10, renderEntity, renderElement, calcAnimation })', context) as {
    Entity: Record<string, number>; init(this: Actor): void; renderEntity(this: Actor): void;
    renderElement(actor: Actor, files: PartFile, type: string, position: Int32Array, main: boolean): void;
    calcAnimation(actor: Actor, action: NativeAction, type: string, tick: number): number;
  };
  function addPart(part: string, count: number, delay: number) {
    const files = { act: part + '.act', spr: part + '.spr', size: 1 };
    const [anchorX, anchorY] = part === 'body' ? [10, 20] : part === 'robe' ? [100, 200] : [3, 7];
    // Every action and direction has distinguishable layers and anchor points.
    const act = { actions: Array.from({ length: 104 }, (_, index) => ({
      delay,
      animations: Array.from({ length: count }, (_, frame) => ({
        layers: [{ index: 0, frame, action: Math.floor(index / 8), direction: index % 8 }],
        pos: [{ x: (index % 8) * 10 + frame + anchorX!, y: Math.floor(index / 8) * 10 + frame * 2 + anchorY! }], sound: -1,
      })),
    })), sounds: [] };
    resources.set(files.act, act); resources.set(files.spr, { part });
    return files;
  }
  const actor = {
    constructor: native.Entity, objecttype: native.Entity.TYPE_PC, _job: 0, _sex: 0, job: 0,
    direction: 0, headDir: 0, robe: 1, weapon: 1, shield: 0, accessory: 0, accessory2: 0, accessory3: 0,
    position: new Float32Array([30, 40, 0]), hideShadow: true, effectState: 0, allRidingState: 0, virtue: 0,
    walk: { speed: 150, dist: 0 }, attack_speed: 400,
    attachments: { renderBefore: vi.fn() }, sound: { free: vi.fn(), freeOnAnimationEnd: vi.fn(), play: vi.fn() }, getOpt3: () => false,
    files: {
      body: addPart('body', options.bodyCount || 4, options.bodyDelay || 100),
      robe: addPart('robe', options.robeCount || 4, options.robeDelay || 100),
      head: addPart('head', options.headCount || 4, options.headDelay || 100),
      weapon: addPart('weapon', options.bodyCount || 4, options.bodyDelay || 100),
    },
    renderLayer: (layer: Layer, spr: { part: string }, _pal: unknown, _size: number, position: Int32Array, type: string) => draws.push({
      type, part: spr.part, frame: layer.frame, action: layer.action, direction: layer.direction, position: [...position], zIndex: renderer.zIndex,
    }),
  } as unknown as Actor;
  for (const [name, part] of Object.entries(options.parts || {})) {
    actor.files[name] = addPart(name, part.count, part.delay);
    if (name !== 'weapon_trail') Reflect.set(actor, name, Object.keys(actor.files).length);
  }
  native.init.call(actor);
  function render(elapsed: number) { now = 1000 + elapsed; draws.length = 0; native.renderEntity.call(actor); return [...draws]; }
  function part(part: string) { return resources.get(actor.files[part]!.act) as NativeAct; }
  return { ...native, actor, draws, resources, client, renderer, context, render, part, setNow: (value: number) => { now = value; }, setClockStep: (value: number) => { clockStep = value; } };
}

describe('equipment rendering through actual native animation and render closures', () => {
  it('clamps a completed one-shot action to its final ACT frame before modulo', () => {
    const baseline = fixture(vendor), fixed = fixture();
    for (const f of [baseline, fixed]) f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const baselineFrames = baseline.render(400), fixedFrames = fixed.render(400);
    expect(baselineFrames.find(draw => draw.part === 'body')!.frame).toBe(0);
    expect(fixedFrames.find(draw => draw.part === 'body')!.frame).toBe(3);
    expect(fixed.actor.animation.play).toBe(false);
    expect(fixed.render(800).every(draw => draw.frame === 3)).toBe(true);
  });

  it.each([0, 1, 3, 4, 5, 7])('keeps all equipment on the completing attack when facing direction %i', direction => {
    const baseline = fixture(vendor), fixed = fixture();
    for (const f of [baseline, fixed]) {
      f.actor.direction = direction;
      f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false, next: { action: f.actor.ACTION.IDLE!, repeat: true } });
    }
    const baselineFrames = baseline.render(300), fixedFrames = fixed.render(300);
    expect(baselineFrames.find(draw => draw.part === 'body')!.action).toBe(5);
    expect(baselineFrames.find(draw => draw.part === 'head')!.action).toBe(0);
    expect(fixedFrames.map(draw => draw.action)).toEqual([5, 5, 5, 5]);
    expect(fixedFrames.every(draw => draw.direction === direction)).toBe(true);
    expect(fixed.actor.action).toBe(fixed.actor.ACTION.IDLE);
    expect(fixed.render(316).every(draw => draw.action === fixed.actor.ACTION.IDLE)).toBe(true);
  });

  it('chooses the same walking robe frame before and after the body with different ACT delays', () => {
    const frames = (source: string, direction: number) => {
      const f = fixture(source, { bodyCount: 4, robeCount: 7, bodyDelay: 100, robeDelay: 50 });
      f.actor.direction = direction; f.actor.walk.dist = 250 / 170.2;
      f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
      const draws = f.render(100);
      expect(draws.map(draw => draw.part)).toEqual(direction === 0 ? ['robe', 'body', 'head', 'weapon'] : ['body', 'head', 'robe', 'weapon']);
      return draws.find(draw => draw.part === 'robe')!.frame;
    };
    expect(frames(vendor, 0)).toBe(5);
    expect(frames(vendor, 4)).toBe(2);
    expect(frames(patched, 0)).toBe(frames(patched, 4));
  });

  it.each([0, 2, 4, 6])('uses the same selected body anchor for attached head layers in direction %i', direction => {
    const f = fixture(); f.actor.direction = direction;
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const draws = f.render(200), body = draws.find(draw => draw.part === 'body')!, head = draws.find(draw => draw.part === 'head')!;
    expect(body.frame).toBe(2); expect(head.frame).toBe(2);
    expect(body.position).toEqual([0, 0]); expect(head.position).toEqual([7, 13]);
    expect(draws.find(draw => draw.part === 'robe')!.position).toEqual([0, 0]);
  });

  it('retains per-ACT frame counts during ordinary attack progress', () => {
    const f = fixture(patched, { bodyCount: 4, robeCount: 7, headCount: 6 });
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const draws = f.render(150);
    expect(draws.find(draw => draw.part === 'body')!.frame).toBe(1);
    expect(draws.find(draw => draw.part === 'robe')!.frame).toBe(2);
    expect(draws.find(draw => draw.part === 'head')!.frame).toBe(2);
  });

  it.each([0, 4])('holds each ACT at its own completed frame and honors a later explicitly frozen frame in direction %i', direction => {
    const f = fixture(patched, { bodyCount: 4, robeCount: 7, headCount: 6 });
    f.actor.direction = direction;
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    for (const elapsed of [400, 800, 1200]) {
      const draws = f.render(elapsed);
      expect(draws.find(draw => draw.part === 'body')!.frame).toBe(3);
      expect(draws.find(draw => draw.part === 'robe')!.frame).toBe(6);
      expect(draws.find(draw => draw.part === 'head')!.frame).toBe(5);
      expect(draws.find(draw => draw.part === 'weapon')!.frame).toBe(3);
    }
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, play: false, frame: 1 });
    expect(f.render(1300).map(draw => draw.frame)).toEqual([1, 1, 1, 1]);
    expect(f.render(1800).map(draw => draw.frame)).toEqual([1, 1, 1, 1]);
  });

  it('samples one clock value for an entire composite draw even when resource rendering crosses frame boundaries', () => {
    const baseline = fixture(vendor, { bodyCount: 10, robeCount: 10, headCount: 10 }), fixed = fixture(patched, { bodyCount: 10, robeCount: 10, headCount: 10 });
    for (const f of [baseline, fixed]) {
      f.actor.attack_speed = 1000;
      f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
      f.setClockStep(50);
    }
    expect(new Set(baseline.render(100).map(draw => draw.frame)).size).toBeGreaterThan(1);
    expect(fixed.render(100).map(draw => draw.frame)).toEqual([1, 1, 1, 1]);
  });

  it('does not treat a robe anchor as the body anchor while the body resource is still loading', () => {
    const f = fixture();
    f.resources.delete(f.actor.files.body!.spr);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const draws = f.render(100);
    expect(draws.map(draw => draw.part)).toEqual(['robe', 'head', 'weapon']);
    expect(draws.find(draw => draw.part === 'head')!.position).toEqual([-4, -59]);
  });

  it('cleans the composite snapshot after a renderer failure so the next draw can sample a new action', () => {
    const f = fixture(), drawLayer = f.actor.renderLayer;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    f.actor.renderLayer = () => { throw new Error('temporary sprite failure'); };
    expect(() => f.render(100)).toThrow('temporary sprite failure');
    expect(Reflect.get(f.actor, '_lastroEquipmentFrame')).toBeUndefined();
    f.actor.renderLayer = drawLayer;
    f.actor.setAction({ action: f.actor.ACTION.SIT!, repeat: true });
    expect(f.render(100).every(draw => draw.action === f.actor.ACTION.SIT)).toBe(true);
  });

  it.each(['body.act', 'body.spr'])('restores an enclosing composite snapshot when loading %s throws during the body prepass', path => {
    const f = fixture(), enclosingFrame = { name: 'enclosing composite' };
    Reflect.set(f.actor, '_lastroEquipmentFrame', enclosingFrame);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    f.client.loadFile.mockImplementation(resource => {
      if (resource === path) throw new Error('temporary body resource failure');
      return f.resources.get(resource);
    });
    expect(() => f.render(100)).toThrow('temporary body resource failure');
    expect(Reflect.get(f.actor, '_lastroEquipmentFrame')).toBe(enclosingFrame);
    f.client.loadFile.mockImplementation(resource => f.resources.get(resource));
    const draws = f.render(200);
    expect(draws).toHaveLength(4);
    expect(draws.every(draw => draw.action === f.actor.ACTION.ATTACK1 && draw.frame === 2)).toBe(true);
    expect(Reflect.get(f.actor, '_lastroEquipmentFrame')).toBe(enclosingFrame);
  });
});

describe('walking equipment cadence across body resources and movement speeds', () => {
  const speeds = [50, 150, 300];
  const bodyDelays = [50, 100, 200];
  const matrix = bodyDelays.flatMap(bodyDelay => speeds.map(speed => ({ bodyDelay, speed })));
  const extendedParts = {
    accessory: { count: 7, delay: 75 }, accessory2: { count: 9, delay: 150 }, accessory3: { count: 5, delay: 250 },
    shield: { count: 8, delay: 600 }, weapon_trail: { count: 8, delay: 800 },
  };

  it.each(matrix)('keeps cosmetic cadence at body delay $bodyDelay and movement speed $speed', ({ bodyDelay, speed }) => {
    const options = { bodyCount: 8, bodyDelay, robeCount: 8, robeDelay: 200, headCount: 13, headDelay: 100, parts: extendedParts };
    const fixed = fixture(patched, options), original = fixture(vendor, options);
    for (const f of [fixed, original]) {
      f.actor.walk.speed = speed;
      f.actor.walk.dist = 450 / speed;
      f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    }
    const frames = fixed.render(450), originalBody = original.render(450).find(draw => draw.part === 'body')!;
    const byPart = Object.fromEntries(frames.map(draw => [draw.part, draw.frame]));
    expect(byPart.robe).toBe(originalBody.frame);
    expect(byPart.head).toBe(4);
    expect(byPart.accessory).toBe(6);
    expect(byPart.accessory2).toBe(3);
    expect(byPart.accessory3).toBe(1);
    expect(byPart.body).toBe(originalBody.frame);
    expect(byPart.weapon).toBe(originalBody.frame);
    expect(byPart.shield).toBe(originalBody.frame);
    expect(byPart.weapon_trail).toBe(originalBody.frame);
  });

  it('reproduces movement-dependent cosmetic acceleration in the original renderer', () => {
    const framesAtSpeed = (source: string, speed: number) => {
      const f = fixture(source, { bodyCount: 12, bodyDelay: 100, headCount: 13, headDelay: 200 });
      f.actor.walk.speed = speed; f.actor.walk.dist = 500 / speed;
      f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
      return f.render(500).find(draw => draw.part === 'head')!.frame;
    };
    expect(framesAtSpeed(vendor, 50)).not.toBe(framesAtSpeed(vendor, 300));
    expect(framesAtSpeed(patched, 50)).toBe(2);
    expect(framesAtSpeed(patched, 300)).toBe(2);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('keeps independent ACT frames attached to the actual body pose in direction %i', direction => {
    const f = fixture(patched, {
      bodyCount: 4, robeCount: 7, robeDelay: 200, headCount: 6, headDelay: 150,
      parts: { accessory: { count: 11, delay: 100 }, accessory2: { count: 9, delay: 250 }, accessory3: { count: 5, delay: 175 } },
    });
    f.actor.direction = direction; f.actor.walk.dist = 250 / 170.2;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    const draws = f.render(550), byPart = Object.fromEntries(draws.map(draw => [draw.part, draw]));
    expect(draws.every(draw => draw.direction === direction && draw.action === f.actor.ACTION.WALK)).toBe(true);
    expect(byPart.body!.frame).toBe(2);
    expect(byPart.head!.frame).toBe(3);
    expect(byPart.robe!.frame).toBe(2);
    expect(byPart.accessory!.frame).toBe(5);
    expect(byPart.accessory2!.frame).toBe(2);
    expect(byPart.accessory3!.frame).toBe(3);
    expect(byPart.body!.position).toEqual([0, 0]);
    expect(byPart.robe!.position).toEqual([0, 0]);
    expect(byPart.head!.position).toEqual([6, 11]);
    expect(byPart.accessory!.position).toEqual([4, 7]);
    expect(byPart.accessory2!.position).toEqual([7, 13]);
    expect(byPart.accessory3!.position).toEqual([6, 11]);
  });

  it('uses the head ACT delay after several loops while preserving the robe walking pose', () => {
    const f = fixture(patched, { bodyCount: 4, robeCount: 7, robeDelay: 200, headCount: 6, headDelay: 100 });
    f.actor.walk.dist = 23;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    const draws = f.render(2050);
    expect(draws.find(draw => draw.part === 'robe')!.frame).toBe(4);
    expect(draws.find(draw => draw.part === 'head')!.frame).toBe(2);
  });

  it('renders the same costume frames after sparse or frequent draws at the same elapsed time', () => {
    const renderSchedule = (schedule: number[]) => {
      const f = fixture(patched, { bodyCount: 8, robeCount: 7, robeDelay: 125, headCount: 9, headDelay: 75, parts: extendedParts });
      f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
      let draws: Draw[] = [];
      for (const elapsed of schedule) {
        f.actor.walk.dist = elapsed / 150;
        draws = f.render(elapsed);
      }
      return draws;
    };
    const sparse = renderSchedule([0, 250, 550]);
    const frequent = renderSchedule([...Array.from({ length: 34 }, (_, index) => index * 16), 550]);
    expect(frequent).toEqual(sparse);
    expect(sparse.find(draw => draw.part === 'head')!.frame).toBe(7);
  });

  it('samples one walking clock for all costume layers across a render-time frame boundary', () => {
    const f = fixture(patched, { bodyCount: 8, robeCount: 11, robeDelay: 100, headCount: 11, headDelay: 100, parts: { accessory: { count: 11, delay: 100 } } });
    f.actor.walk.dist = 2;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    f.setClockStep(75);
    const costumes = f.render(299).filter(draw => ['head', 'accessory'].includes(draw.part));
    expect(costumes.map(draw => draw.frame)).toEqual([2, 2]);
  });

  it('honors an explicitly frozen walking frame even if elapsed time and movement distance advance', () => {
    const f = fixture(patched, { bodyCount: 8, robeCount: 7, robeDelay: 200, headCount: 6, headDelay: 100, parts: extendedParts });
    f.actor.setAction({ action: f.actor.ACTION.WALK!, play: false, repeat: true, frame: 2 });
    for (const elapsed of [100, 750, 2000]) {
      f.actor.walk.dist = elapsed / 50;
      expect(f.render(elapsed).map(draw => draw.frame)).toEqual(Array(9).fill(2));
    }
  });

  it('switches independently timed walking costumes to the complete attack pose before its next action', () => {
    const f = fixture(patched, { bodyCount: 4, robeCount: 7, robeDelay: 200, headCount: 6, headDelay: 150, parts: { accessory: { count: 11, delay: 125 } } });
    f.actor.walk.dist = 3;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    const walking = f.render(350);
    expect(walking.find(draw => draw.part === 'head')!.frame).toBe(2);
    f.setNow(1350);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false, next: { action: f.actor.ACTION.IDLE!, repeat: true } });
    const attack = f.render(750);
    expect(attack.every(draw => draw.action === f.actor.ACTION.ATTACK1)).toBe(true);
    expect(Object.fromEntries(attack.map(draw => [draw.part, draw.frame]))).toEqual({ robe: 6, body: 3, head: 5, accessory: 10, weapon: 3 });
    expect(f.actor.action).toBe(f.actor.ACTION.IDLE);
    expect(f.render(766).every(draw => draw.action === f.actor.ACTION.IDLE)).toBe(true);
  });
});

describe('continuous accessory loops through the native composite renderer', () => {
  function windFixture() {
    const f = fixture(patched, { parts: { accessory3: { count: 8, delay: 200 } } });
    // Match a looping head accessory: three idle head-turn groups, one walking
    // loop and a shorter attack subset. Sprite layers repeat across poses, but
    // their attachment anchors belong to the current character action.
    function installLoop(part: string) {
      const act = f.part(part);
      for (let direction = 0; direction < 8; direction++) {
        const makeFrame = (frame: number, anchor: number[]): NativeFrame => ({
          layers: [{ index: frame, pos: [2, -3], frame, action: 0, direction }],
          pos: [{ x: anchor[0]!, y: anchor[1]! }], sound: -1,
        });
        act.actions[f.actor.ACTION.IDLE! * 8 + direction] = {
          delay: 200, animations: Array.from({ length: 24 }, (_, index) => makeFrame(index % 8, [1, -56])),
        };
        act.actions[f.actor.ACTION.WALK! * 8 + direction] = {
          delay: 200, animations: Array.from({ length: 8 }, (_, index) => makeFrame(index, [-4, -57])),
        };
        act.actions[f.actor.ACTION.ATTACK1! * 8 + direction] = {
          delay: 200, animations: [0, 1, 2, 4, 5].map(index => makeFrame(index, [3, -51])),
        };
      }
    }
    installLoop('accessory3');
    f.actor.direction = 4;
    f.actor.walk.dist = 250 / 170.2;
    f.actor.setAction({ action: f.actor.ACTION.WALK!, repeat: true });
    return { ...f, installLoop };
  }

  it('retains the missing loop frame during a speed-overridden attack and uses the attack anchor until its next action', () => {
    const f = windFixture();
    expect(f.render(0).find(draw => draw.part === 'accessory3')!.frame).toBe(0);
    expect(f.render(600).find(draw => draw.part === 'accessory3')!.frame).toBe(3);
    f.setNow(1600);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false, speed: 50, length: 4, next: { action: f.actor.ACTION.IDLE!, repeat: true } });
    const starting = f.render(600);
    expect(starting.find(draw => draw.part === 'accessory3')!.frame).toBe(3);
    expect(starting.find(draw => draw.part === 'body')!.frame).toBe(0);
    const finishing = f.render(750), body = finishing.find(draw => draw.part === 'body')!, costume = finishing.find(draw => draw.part === 'accessory3')!;
    expect(body).toMatchObject({ frame: 3, action: f.actor.ACTION.ATTACK1, direction: 4 });
    expect(costume).toMatchObject({ frame: 3, direction: 4, position: [50, 127] });
    expect(finishing.find(draw => draw.part === 'head')).toMatchObject({ frame: 3, action: f.actor.ACTION.ATTACK1, position: [7, 13] });
    expect(f.actor.action).toBe(f.actor.ACTION.IDLE);
    const idle = f.render(800);
    expect(idle.find(draw => draw.part === 'body')!.action).toBe(f.actor.ACTION.IDLE);
    expect(idle.find(draw => draw.part === 'accessory3')).toMatchObject({ frame: 4, position: [49, 76] });
  });

  it('keeps a continuous accessory clock when repeated attacks reset the native action clock', () => {
    const f = windFixture();
    f.render(0);
    for (const elapsed of [600, 625, 650]) {
      f.setNow(1000 + elapsed);
      f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false, speed: 25, length: 4 });
      const draws = f.render(elapsed);
      expect(draws.find(draw => draw.part === 'body')!.frame).toBe(0);
      expect(draws.find(draw => draw.part === 'accessory3')!.frame).toBe(3);
    }
    expect(f.render(800).find(draw => draw.part === 'accessory3')!.frame).toBe(4);
  });

  it('continues a costume loop after natural body completion but honors an explicitly frozen action', () => {
    const f = windFixture();
    f.render(0);
    f.setNow(1600);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const completed = f.render(1000);
    expect(completed.find(draw => draw.part === 'body')!.frame).toBe(3);
    expect(completed.find(draw => draw.part === 'accessory3')!.frame).toBe(5);
    expect(f.actor.animation.play).toBe(false);
    const later = f.render(1200);
    expect(later.find(draw => draw.part === 'body')!.frame).toBe(3);
    expect(later.find(draw => draw.part === 'accessory3')!.frame).toBe(6);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, play: false, frame: 1 });
    expect(f.render(1600).find(draw => draw.part === 'accessory3')!.frame).toBe(1);
  });

  it('excludes the actual head resource even when its layers resemble a repeating accessory loop', () => {
    const f = windFixture();
    f.installLoop('head');
    f.render(0);
    expect(f.render(600).find(draw => draw.part === 'accessory3')!.frame).toBe(3);
    f.setNow(1600);
    f.actor.setAction({ action: f.actor.ACTION.ATTACK1!, repeat: false });
    const draws = f.render(600);
    expect(draws.find(draw => draw.part === 'head')!.frame).toBe(0);
    expect(draws.find(draw => draw.part === 'accessory3')!.frame).toBe(3);
  });
});

describe('all native player action groups and equipment slots', () => {
  const actions = ['IDLE', 'WALK', 'SIT', 'PICKUP', 'READYFIGHT', 'ATTACK1', 'HURT', 'FREEZE', 'DIE', 'FREEZE2', 'ATTACK2', 'ATTACK3', 'SKILL'];
  const cases = actions.flatMap(action => Array.from({ length: 8 }, (_, direction) => ({ action, direction })));
  const parts = ['body', 'robe', 'head', 'accessory', 'accessory2', 'accessory3', 'weapon', 'shield', 'weapon_trail'];

  it.each(cases)('renders every equipped slot consistently for $action in direction $direction', ({ action, direction }) => {
    const options = {
      bodyCount: 4, bodyDelay: 120, robeCount: 7, robeDelay: 75, headCount: 6, headDelay: 100,
      parts: {
        accessory: { count: 12, delay: 110 }, accessory2: { count: 15, delay: 130 }, accessory3: { count: 18, delay: 170 },
        shield: { count: 5, delay: 50 }, weapon_trail: { count: 7, delay: 60 },
      },
    };
    const f = fixture(patched, options), original = fixture(vendor, options);
    const repeating = ['IDLE', 'WALK', 'SIT', 'READYFIGHT'].includes(action);
    for (const instance of [f, original]) {
      instance.actor.direction = direction;
      instance.actor.headDir = direction % 3;
      instance.actor.walk.dist = 350 / 170.2;
      instance.actor.setAction({
        action: instance.actor.ACTION[action]!, repeat: repeating,
        next: repeating || action === 'DIE' ? false : { action: instance.actor.ACTION.IDLE!, repeat: true },
      });
    }
    const draws = f.render(500), nativeSlots = original.render(500).map(draw => draw.part).sort();
    expect(draws.map(draw => draw.part).sort()).toEqual(nativeSlots);
    expect(draws.map(draw => draw.part).sort()).toEqual([...parts].sort());
    expect(draws.every(draw => draw.action === f.actor.ACTION[action] && draw.direction === direction)).toBe(true);
    expect(draws.every(draw => Number.isInteger(draw.frame) && draw.frame >= 0 && Number.isFinite(draw.zIndex) && draw.position.every(Number.isFinite))).toBe(true);
    const body = draws.find(draw => draw.part === 'body')!;
    const bodyAnchor = f.part('body').actions[body.action * 8 + direction]!.animations[body.frame]!.pos[0]!;
    for (const draw of draws) {
      const source = f.part(draw.part).actions[draw.action * 8 + direction]!.animations[draw.frame]!;
      expect(source).toBeDefined();
      if (draw.type === 'head') {
        expect(draw.position).toEqual([bodyAnchor.x - source.pos[0]!.x, bodyAnchor.y - source.pos[0]!.y]);
      } else {
        expect(draw.position).toEqual([0, 0]);
      }
    }
    if (action === 'IDLE' || action === 'SIT') {
      expect(body.frame).toBe(f.actor.headDir);
      expect(draws.find(draw => draw.part === 'robe')!.frame).toBe(f.actor.headDir);
    }
    if (action === 'DIE') {
      expect(body.frame).toBe(3);
      expect(f.actor.action).toBe(f.actor.ACTION.DIE);
      expect(f.actor.animation.play).toBe(false);
    }
  });
});

describe('equipment animation patch anchors', () => {
  it('ignores source files without the native renderer region', () => {
    expect(patchRuntimeEquipmentAnimation('small fixture')).toBe('small fixture');
  });
  it('rejects applying the patch twice', () => {
    expect(() => patchRuntimeEquipmentAnimation(patched)).toThrow('anchor:equipment-animation');
  });
  it('rejects a missing native completion anchor', () => {
    expect(() => patchRuntimeEquipmentAnimation(vendor.replace('    if (animation.next) entity.setAction(animation.next);', '// missing completion'))).toThrow('anchor:equipment-animation');
  });
  it('rejects a duplicate native rendering region', () => {
    expect(() => patchRuntimeEquipmentAnimation(vendor + '\n' + region(renderPath))).toThrow('anchor:equipment-animation');
  });
});
