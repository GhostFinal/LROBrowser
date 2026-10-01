import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeFrameTiming } from '../scripts/lastro-frame-timing.mjs';

const source = await readFile(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
const patched = patchRuntimeFrameTiming(source.replaceAll('\r\n', '\n'));
function region(name: string) {
  const start = patched.indexOf('//#region ' + name);
  return patched.slice(start, patched.indexOf('//#endregion', start));
}
function events() {
  let wall = 1000;
  const errors = vi.fn();
  const api = new Function('__esmMin', 'Date', 'console', region('src/Core/Events.js') + '\nreturn {Events, LastROEventDueTick};')(
    (initialize: () => void) => initialize(), { now: () => wall }, { error: errors },
  );
  return { ...api, errors, setWall: (value: number) => { wall = value; } };
}

describe('real runtime frame and event timing', () => {
  it('schedules fresh packets from their arrival time after a stopped renderer', () => {
    const h = events(), callback = vi.fn();
    h.Events.process(1000);
    h.setWall(8000);
    h.Events.setTimeout(callback, 150);
    h.Events.process(8000);
    expect(callback).not.toHaveBeenCalled();
    h.Events.process(8150);
    expect(callback).toHaveBeenCalledOnce();
  });
  it('does not replay recursively scheduled callbacks in the recovery frame', () => {
    const h = events(), calls: number[] = [];
    h.Events.setTimeout(() => {
      calls.push(1);
      h.Events.setTimeout(() => calls.push(2), 50);
    }, 50);
    h.setWall(5000);
    h.Events.process(5000);
    expect(calls).toEqual([1]);
    h.Events.process(5049);
    expect(calls).toEqual([1]);
    h.Events.process(5050);
    expect(calls).toEqual([1, 2]);
  });
  it('isolates a failing callback so it cannot permanently stop rendering', () => {
    const h = events(), after = vi.fn();
    h.Events.setTimeout(() => { throw new Error('late resource'); }, 0);
    h.Events.setTimeout(after, 0);
    expect(() => h.Events.process(1000)).not.toThrow();
    expect(h.errors).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    expect(h.LastROEventDueTick()).toBeUndefined();
  });
  it('exposes the original due time only while executing a delayed event', () => {
    const h = events(), due: unknown[] = [];
    h.Events.setTimeout(() => due.push(h.LastROEventDueTick()), 100);
    h.setWall(4000);
    h.Events.process(4000);
    expect(due).toEqual([1100]);
    expect(h.LastROEventDueTick()).toBeUndefined();
  });
  it('still honours cancellation during an event batch', () => {
    const h = events(), after = vi.fn();
    h.Events.setTimeout(() => h.Events.clearTimeout(cancel), 0);
    const cancel = h.Events.setTimeout(after, 0);
    h.Events.process(1000);
    expect(after).not.toHaveBeenCalled();
  });
  it('bounds huge event batches and executes every remaining event next frame', () => {
    const h = events(), callback = vi.fn();
    for (let i = 0; i < 300; i++) h.Events.setTimeout(callback, 0);
    h.Events.process(1000);
    expect(callback).toHaveBeenCalledTimes(256);
    h.Events.process(1016);
    expect(callback).toHaveBeenCalledTimes(300);
  });
  it('keeps zero-delay self scheduling for the next frame', () => {
    const h = events(), callback = vi.fn(() => h.Events.setTimeout(callback, 0));
    h.Events.setTimeout(callback, 0);
    h.Events.process(1000);
    expect(callback).toHaveBeenCalledOnce();
    h.Events.process(1016);
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it('advances the server sample only from its receive time, never the stale render tick', () => {
    let mono = 0;
    const session = { serverTick: 0 };
    const rendererRegion = region('src/Renderer/Renderer.js');
    const clock = rendererRegion.slice(rendererRegion.indexOf('let lastroServerClockMark'), rendererRegion.indexOf('var mat4$9'));
    const api = new Function('performance', 'SessionStorage_default', clock + '\nreturn {LastROResetServerTick,LastROAdvanceServerTick};')({ now: () => mono }, session);
    api.LastROResetServerTick(10000);
    mono = 100;
    expect(api.LastROAdvanceServerTick()).toBe(10100);
    mono = 8000;
    api.LastROResetServerTick(20000);
    mono = 8016;
    expect(api.LastROAdvanceServerTick()).toBe(20016);
    expect(api.LastROAdvanceServerTick()).toBe(20016);
    mono = 8032;
    expect(api.LastROAdvanceServerTick()).toBe(20032);
  });
  it('does not add the initial epoch timestamp to an unsampled server tick', () => {
    let mono = 40000;
    const session = { serverTick: 0 };
    const rendererRegion = region('src/Renderer/Renderer.js');
    const clock = rendererRegion.slice(rendererRegion.indexOf('let lastroServerClockMark'), rendererRegion.indexOf('var mat4$9'));
    const advance = new Function('performance', 'SessionStorage_default', clock + '\nreturn LastROAdvanceServerTick;')({ now: () => mono }, session);
    expect(advance()).toBe(0);
    mono = 42000;
    expect(advance()).toBe(0);
  });
  it('invalidates the previous zone clock until the new zone supplies its own sample', () => {
    let mono = 0;
    const session = { serverTick: 0 };
    const rendererRegion = region('src/Renderer/Renderer.js');
    const clock = rendererRegion.slice(rendererRegion.indexOf('let lastroServerClockMark'), rendererRegion.indexOf('var mat4$9'));
    const api = new Function('performance', 'SessionStorage_default', clock + '\nreturn {LastROResetServerTick,LastROAdvanceServerTick,LastROInvalidateServerTick};')({ now: () => mono }, session);
    api.LastROResetServerTick(100000);
    mono = 10000;
    api.LastROInvalidateServerTick();
    mono = 20000;
    expect(api.LastROAdvanceServerTick()).toBe(0);
    api.LastROResetServerTick(5000);
    mono = 20016;
    expect(api.LastROAdvanceServerTick()).toBe(5016);
    expect(region('src/Engine/MapEngine.js')).toMatch(/if \(!success\)[\s\S]*?return;\s*\}\s*LastROInvalidateServerTick\(\);/);
    expect(region('src/Engine/MapEngine.js')).toContain('function cleanGameUI() {\n  LastROInvalidateServerTick();');
  });
  it('records actual ping latency and anchors a pong received between frames', () => {
    let mono = 8000;
    const session = { serverTick: 0, ping: { returned: false, pingTime: 10, lastroSentAt: 5000, pongTime: 0, value: 0 } };
    const rendererRegion = region('src/Renderer/Renderer.js');
    const clock = rendererRegion.slice(rendererRegion.indexOf('let lastroServerClockMark'), rendererRegion.indexOf('var mat4$9'));
    const pong = region('src/Engine/MapEngine.js').match(/function onPong\(pkt\) \{[\s\S]*?\n\}/)?.[0];
    expect(pong).toBeTruthy();
    const api = new Function('performance', 'Date', 'SessionStorage_default', clock + '\n' + pong + '\nreturn {onPong,LastROAdvanceServerTick};')({ now: () => mono }, { now: () => 5080 }, session);
    api.onPong({ time: 25000 });
    expect(session.ping).toMatchObject({ returned: true, pongTime: 5080, value: 80 });
    mono = 8016;
    expect(api.LastROAdvanceServerTick()).toBe(25016);
  });
  it('uses the entry packet server tick immediately without waiting for the first ping', () => {
    const resets = vi.fn();
    const engine = region('src/Engine/MapEngine.js');
    const start = engine.indexOf('function onConnectionAccepted$2(pkt) {');
    const end = engine.indexOf('  SessionStorage_default.Entity.onWalkEnd', start);
    const initialize = new Function('LastROResetServerTick', engine.slice(start, end) + '}\nreturn onConnectionAccepted$2;')(resets);
    initialize({ startTime: 5000 });
    initialize({ startTime: 0xffffffff });
    initialize({ startTime: 0 });
    expect(resets.mock.calls).toEqual([[5000], [0xffffffff], [0]]);
    resets.mockClear();
    for (const startTime of [undefined, NaN, -1, 0x100000000, '5000']) initialize({ startTime });
    expect(resets).not.toHaveBeenCalled();
  });
  it('rejects duplicated or changed runtime anchors', () => {
    expect(() => patchRuntimeFrameTiming(patched)).toThrow('anchor:frame-timing');
    expect(() => patchRuntimeFrameTiming(source.replace('const tick = _tick$1 + delay;', 'const tick = delay;'))).toThrow('anchor:frame-timing');
    expect(patchRuntimeFrameTiming('small fixture')).toBe('small fixture');
  });
});
