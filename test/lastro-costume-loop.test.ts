import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { sampleLastroCostumeLoop, type CostumeLoopAction, type CostumeLoopEntity, type CostumeLoopFrame } from '../scripts/lastro-costume-loop.mjs';

const ACTION = { IDLE: 0, WALK: 1, SIT: 2, PICKUP: 3, READYFIGHT: 4, ATTACK1: 5, HURT: 6, FREEZE: 7, DIE: 8 };
function frame(index: number, mirror = false, anchor = [1, -56]): CostumeLoopFrame {
  return {
    layers: [{ index, spr_type: 0, pos: [mirror ? -index : index, -16 - index], is_mirror: mirror ? 1 : 0, scale: [1, 1], color: [1, 1, 1, (index + 1) / 8], angle: 0 }],
    pos: [{ x: anchor[0]!, y: anchor[1]! }], sound: -1,
  };
}
function fixture() {
  const actor: CostumeLoopEntity = { ACTION, action: ACTION.IDLE, headDir: 0, animation: { play: true, tick: 1000 } };
  const actions: CostumeLoopAction[] = Array.from({ length: 104 }, () => ({ delay: 200, animations: [frame(0)] }));
  for (let direction = 0; direction < 8; direction++) {
    const loops = [0, 1, 2].flatMap(head => Array.from({ length: 8 }, (_, index) => frame(index, head === 1, [head * 5 + 1, -56 - head])));
    actions[direction] = { delay: 200, animations: loops };
    actions[8 + direction] = { delay: 200, animations: Array.from({ length: 8 }, (_, index) => frame(index)) };
    actions[16 + direction] = { delay: 200, animations: loops.map(value => ({ ...value, pos: value.pos.map(point => ({ x: point.x, y: point.y + 20 })) })) };
    actions[40 + direction] = { delay: 200, animations: [0, 1, 2, 4, 5].map(index => frame(index, direction === 4, [-4, -57])) };
    actions[48 + direction] = { delay: 100, animations: [frame(0, false, [13, -73]), frame(1, false, [18, -74]), frame(0, false, [13, -73])] };
    actions[64 + direction] = { delay: 200, animations: Array.from({ length: 8 }, (_, index) => frame(index + 8, false, [55, -45])) };
  }
  const act = { actions };
  function sample(tick: number, action = actor.action, direction = 0) {
    actor.action = action;
    return sampleLastroCostumeLoop(actor, act, actions[action * 8 + direction]!, direction, tick);
  }
  return { actor, act, actions, sample };
}

describe('independent accessory loops from actual ACT layout patterns', () => {
  it('keeps the full eight-frame loop through a five-frame attack subset', () => {
    const f = fixture();
    expect(f.sample(1000)?.index).toBe(0);
    f.actor.animation = { play: true, tick: 1590, speed: 15, length: 2, frame: 1 };
    const attack = f.sample(1600, ACTION.ATTACK1)!;
    expect(attack.index).toBe(3);
    expect(attack.animation.layers[0]!.index).toBe(3);
    expect(attack.animation.pos).toEqual([{ x: -4, y: -57 }]);
    expect(f.sample(2400, ACTION.ATTACK1)?.animation.layers[0]!.index).toBe(7);
    expect(f.sample(2600, ACTION.ATTACK1)?.index).toBe(0);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('preserves the matching combat mirror and current anchor in direction %i', direction => {
    const f = fixture();
    f.sample(1000, ACTION.IDLE, direction);
    const attack = f.sample(1800, ACTION.ATTACK1, direction)!;
    expect(attack.animation.layers[0]!.index).toBe(4);
    expect(attack.animation.layers[0]!.is_mirror).toBe(direction === 4 ? 1 : 0);
    expect(attack.animation.pos).toEqual([{ x: -4, y: -57 }]);
  });

  it('keeps one clock across movement, redirects, action changes, and directions', () => {
    const f = fixture();
    f.sample(1000);
    expect(f.sample(1400, ACTION.WALK)?.index).toBe(2);
    f.actor.animation.tick = 1599;
    expect(f.sample(1600, ACTION.WALK, 6)?.index).toBe(3);
    expect(f.sample(1800, ACTION.ATTACK1, 4)?.index).toBe(4);
    expect(f.sample(2000, ACTION.IDLE, 3)?.index).toBe(5);
  });

  it('selects the requested head turn during idle and sitting without changing the clock', () => {
    const f = fixture();
    f.sample(1000);
    f.actor.headDir = 1;
    const idle = f.sample(1200)!;
    expect(idle.animation.layers[0]!.is_mirror).toBe(1);
    expect(idle.animation.pos).toEqual([{ x: 6, y: -57 }]);
    const sit = f.sample(1400, ACTION.SIT)!;
    expect(sit.index).toBe(2);
    expect(sit.animation.layers[0]!.is_mirror).toBe(1);
    expect(sit.animation.pos).toEqual([{ x: 6, y: -37 }]);
  });

  it('continues after natural body completion but respects an explicit frozen frame', () => {
    const f = fixture();
    f.sample(1000);
    f.actor.animation = { play: false, _lastroEquipmentFinished: true, frame: 4 };
    expect(f.sample(1600, ACTION.ATTACK1)?.index).toBe(3);
    f.actor.animation._lastroEquipmentFinished = false;
    expect(f.sample(1800, ACTION.ATTACK1)).toBeNull();
    f.actor.animation.play = true;
    expect(f.sample(2000, ACTION.IDLE)?.index).toBe(5);
  });

  it('uses the composite action snapshot when rendering spans a body transition', () => {
    const f = fixture();
    f.sample(1000);
    f.actor.action = ACTION.DIE;
    f.actor._lastroEquipmentFrame = { action: ACTION.ATTACK1, animation: { play: true } };
    expect(sampleLastroCostumeLoop(f.actor, f.act, f.actions[40]!, 0, 1600)?.index).toBe(3);
  });

  it('separates entity clocks even when their ACT resource is shared', () => {
    const f = fixture(), second = { ...f.actor, animation: { play: true } };
    f.sample(1000);
    expect(sampleLastroCostumeLoop(second, f.act, f.actions[0]!, 0, 1400)?.index).toBe(0);
    expect(f.sample(1600)?.index).toBe(3);
    expect(sampleLastroCostumeLoop(second, f.act, f.actions[0]!, 0, 1600)?.index).toBe(1);
  });

  it('starts a separate clock for a replacement resource', () => {
    const f = fixture(), replacement = fixture();
    f.sample(1000);
    expect(sampleLastroCostumeLoop(f.actor, replacement.act, replacement.actions[0]!, 0, 1600)?.index).toBe(0);
    expect(f.sample(1600)?.index).toBe(3);
  });

  it.each(['single', 'changed pose', 'variable anchor', 'different delay', 'repeated static', 'missing anchor'])(
    'falls back for %s resources', kind => {
      const f = fixture(), walking = f.actions[8]!;
      if (kind === 'single') walking.animations = [frame(0)];
      if (kind === 'changed pose') walking.animations[2]!.layers[0]!.angle = 30;
      if (kind === 'variable anchor') walking.animations[2]!.pos[0]!.y++;
      if (kind === 'different delay') walking.delay = 100;
      if (kind === 'repeated static') walking.animations = Array.from({ length: 8 }, () => frame(0));
      if (kind === 'missing anchor') walking.animations[2]!.pos = [];
      expect(f.sample(1000, ACTION.WALK)).toBeNull();
    },
  );

  it('does not treat ordinary three-frame hair or static headgear as an independent loop', () => {
    const f = fixture();
    f.actions[0]!.animations = [frame(0), frame(1), frame(2)];
    expect(f.sample(1000, ACTION.WALK)).toBeNull();
  });

  it('preserves native hurt and death poses', () => {
    const f = fixture();
    expect(f.sample(1000, ACTION.HURT)).toBeNull();
    expect(f.sample(1000, ACTION.DIE)).toBeNull();
  });

  it.each(['canonical', 'current'])('preserves native sound timing when the %s action contains an event', target => {
    const f = fixture();
    if (target === 'canonical') {
      for (const index of [3, 11, 19]) f.actions[0]!.animations[index]!.sound = 0;
    } else f.actions[40]!.animations[1]!.sound = 0;
    expect(f.sample(1000, ACTION.ATTACK1)).toBeNull();
  });

  it('does not mutate ACT frames when replacing the pose anchor', () => {
    const f = fixture(), before = JSON.stringify(f.act);
    f.sample(1000);
    f.sample(1600, ACTION.ATTACK1);
    expect(JSON.stringify(f.act)).toBe(before);
  });

  it('caches signatures instead of serializing layers on every render', () => {
    const f = fixture();
    f.sample(1000);
    Object.defineProperty(f.actions[0]!.animations[0]!.layers, 'toJSON', { value: () => { throw new Error('serialized cached resource'); } });
    expect(f.sample(1200)?.index).toBe(1);
  });

  it('rejects malformed input and handles a backwards clock without an invalid frame', () => {
    const f = fixture();
    expect(sampleLastroCostumeLoop(f.actor, f.act, f.actions[0]!, 8, 1000)).toBeNull();
    expect(f.sample(Number.NaN)).toBeNull();
    f.sample(1000);
    expect(f.sample(900)?.index).toBe(0);
  });

  it('runs after serialization without module globals', () => {
    const f = fixture();
    const serialized = vm.runInNewContext('(' + sampleLastroCostumeLoop.toString() + ')') as typeof sampleLastroCostumeLoop;
    expect(serialized(f.actor, f.act, f.actions[0]!, 0, 1000)?.index).toBe(0);
    f.actor.action = ACTION.ATTACK1;
    expect(serialized(f.actor, f.act, f.actions[40]!, 0, 1600)?.animation.layers[0]!.index).toBe(3);
  });
});
