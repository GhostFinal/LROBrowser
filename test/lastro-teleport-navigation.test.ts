import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLastroTeleportNavigation, type TeleportNavigationPoint } from '../scripts/lastro-teleport-navigation.mjs';

const npcRoute = { outset: ['izlude', 127, 162], path: [['izlude', 125, 144]], position: [] };
const indoorRoute = { outset: ['izlude', 127, 162], path: [['izlude', 110, 180], ['izlude_in', 60, 123]], position: [] };

function fixture(map = 'prontera.gat', position = [150, 150]) {
  vi.useFakeTimers();
  const state = { map, position };
  const sendTeleport = vi.fn<(point: TeleportNavigationPoint) => void>();
  const navigate = vi.fn<(point: TeleportNavigationPoint) => void>();
  const stopNavigation = vi.fn();
  const setStatus = vi.fn<(message: string) => void>();
  const controller = createLastroTeleportNavigation({
    getMap: () => state.map,
    getPosition: () => state.position,
    sendTeleport,
    navigate,
    stopNavigation,
    setStatus,
  });
  return { state, sendTeleport, navigate, stopNavigation, setStatus, controller };
}

afterEach(() => vi.useRealTimers());

describe('LastRO teleport route navigation', () => {
  it('stops a rejected warp immediately without a later timeout or stale navigation', () => {
    const f = fixture();
    f.controller.request(npcRoute);
    f.controller.onTeleportRejected('传送失败：背包中没有 VIP 卡或传送券。');
    expect(f.setStatus).toHaveBeenLastCalledWith('传送失败：背包中没有 VIP 卡或传送券。');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(180000);
    f.state.map = 'izlude'; f.controller.onMapChanged();
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.setStatus).not.toHaveBeenCalledWith('传送等待超时，请重新选择地点');
  });

  it('does not cancel an existing local walking route when an unrelated warp rejection arrives', () => {
    const f = fixture('izlude');
    f.controller.request(npcRoute);
    f.controller.onTeleportRejected('旧传送失败');
    f.state.position = [125, 144]; vi.advanceTimersByTime(200);
    expect(f.setStatus).toHaveBeenLastCalledWith('已到达目标地点');
    expect(f.setStatus).not.toHaveBeenCalledWith('旧传送失败');
  });
  it('warps only to the outset and waits for the map-ready notification before walking to the NPC', () => {
    const f = fixture();
    expect(f.controller.request(npcRoute)).toBe('teleport');
    expect(f.sendTeleport).toHaveBeenCalledExactlyOnceWith(['izlude', 127, 162]);
    expect(f.navigate).not.toHaveBeenCalled();
    f.state.map = 'izlude.gat';
    f.state.position = [127, 162];
    vi.advanceTimersByTime(1000);
    expect(f.navigate).not.toHaveBeenCalled();
    f.controller.onMapChanged();
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith(['izlude', 125, 144]);
    f.state.position = [125, 145];
    vi.advanceTimersByTime(200);
    expect(f.setStatus).toHaveBeenLastCalledWith('已到达目标地点');
    expect(f.sendTeleport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps multi-map gates in order and never sends an indoor teleport', () => {
    const f = fixture('izlude.gat', [127, 162]);
    expect(f.controller.request(indoorRoute)).toBe('navigation');
    expect(f.navigate).toHaveBeenLastCalledWith(['izlude', 110, 180]);
    f.state.position = [110, 180];
    vi.advanceTimersByTime(200);
    expect(f.navigate).toHaveBeenLastCalledWith(['izlude_in', 60, 123]);
    f.state.map = 'izlude_in.gat';
    f.state.position = [48, 114];
    vi.advanceTimersByTime(200);
    expect(f.navigate).toHaveBeenCalledTimes(2);
    f.controller.onMapChanged();
    expect(f.navigate).toHaveBeenLastCalledWith(['izlude_in', 60, 123]);
    expect(f.sendTeleport).not.toHaveBeenCalled();
  });

  it('continues after a portal loads before its outgoing cell is observed', () => {
    const f = fixture('izlude', [127, 162]);
    f.controller.request(indoorRoute);
    f.state.map = 'izlude_in';
    f.state.position = [48, 114];
    f.controller.onMapChanged();
    expect(f.navigate).toHaveBeenLastCalledWith(['izlude_in', 60, 123]);
    expect(f.sendTeleport).not.toHaveBeenCalled();
  });

  it('suspends polling during map teardown and preserves the confirmed route until the next map is ready', () => {
    const f = fixture('izlude', [127, 162]);
    f.controller.request(indoorRoute);
    f.controller.onMapChanging();
    expect(vi.getTimerCount()).toBe(1);
    f.state.map = 'izlude_in';
    f.state.position = [60, 123];
    vi.advanceTimersByTime(1000);
    expect(f.navigate).toHaveBeenCalledTimes(1);
    expect(f.setStatus).not.toHaveBeenCalledWith('已到达目标地点');
    f.state.position = [48, 114];
    f.controller.onMapChanged();
    expect(f.navigate).toHaveBeenLastCalledWith(['izlude_in', 60, 123]);
    f.state.position = [60, 123];
    vi.advanceTimersByTime(200);
    expect(f.setStatus).toHaveBeenLastCalledWith('已到达目标地点');
  });

  it('resumes an existing route on its current map without returning to outset', () => {
    const f = fixture('izlude_in', [48, 114]);
    f.controller.request(indoorRoute);
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith(['izlude_in', 60, 123]);
    expect(f.sendTeleport).not.toHaveBeenCalled();
  });

  it('preserves same-map and cross-map custom single-point behavior', () => {
    const f = fixture('prontera', [150, 150]);
    expect(f.controller.request({ outset: ['prontera', 100, 100] })).toBe('navigation');
    expect(f.navigate).toHaveBeenLastCalledWith(['prontera', 100, 100]);
    expect(f.controller.request({ outset: ['payon', 50, 75], path: [['payon', 50, 75]] })).toBe('teleport');
    expect(f.sendTeleport).toHaveBeenCalledExactlyOnceWith(['payon', 50, 75]);
  });

  it('rejects missing and malformed coordinates without substituting zero', () => {
    const f = fixture();
    for (const route of [
      { path: [], outset: [] },
      { outset: ['izlude', undefined, 162] },
      { outset: ['izlude', 127, 162], path: [['izlude', 125]] },
      { outset: ['izlude', -1, 162] },
    ]) expect(() => f.controller.request(route)).toThrow();
    expect(f.sendTeleport).not.toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses path-only routes on their current map but does not invent an outset for cross-map requests', () => {
    const f = fixture('izlude', [127, 162]);
    expect(f.controller.request({ path: [['izlude', 125, 144]] })).toBe('navigation');
    f.state.map = 'prontera';
    expect(() => f.controller.request({ path: [['izlude', 125, 144]] })).toThrow('出发地点');
    expect(f.sendTeleport).not.toHaveBeenCalled();
  });

  it('honours original excluded positions when teleporting, while permitting navigation on the path', () => {
    const f = fixture('PRONTERA.gat');
    const route = { ...npcRoute, position: ['prontera'] };
    expect(() => f.controller.request(route)).toThrow('当前位置');
    expect(f.sendTeleport).not.toHaveBeenCalled();
    f.state.map = 'izlude';
    expect(f.controller.request({ ...npcRoute, position: ['izlude'] })).toBe('navigation');
  });

  it('times out waiting for warp and stops its callbacks', () => {
    const f = fixture();
    f.controller.request(npcRoute);
    vi.advanceTimersByTime(30000);
    expect(f.setStatus).toHaveBeenLastCalledWith('传送等待超时，请重新选择地点');
    f.state.map = 'izlude';
    f.controller.onMapChanged();
    expect(f.navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a stalled navigation route', () => {
    const f = fixture('izlude');
    f.controller.request(npcRoute);
    vi.advanceTimersByTime(180000);
    expect(f.setStatus).toHaveBeenLastCalledWith('导航超时，请重新选择地点');
    expect(f.stopNavigation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prevents old requests, cancellation and disposal from continuing after map changes', () => {
    const f = fixture();
    f.controller.request(npcRoute);
    f.controller.request({ outset: ['payon', 50, 75] });
    f.state.map = 'izlude';
    f.controller.onMapChanged();
    expect(f.navigate).not.toHaveBeenCalled();
    f.controller.cancel();
    f.state.map = 'payon';
    f.controller.onMapChanged();
    vi.advanceTimersByTime(1000);
    expect(f.navigate).not.toHaveBeenCalled();
    f.controller.request({ outset: ['payon', 50, 75] });
    f.controller.dispose();
    vi.advanceTimersByTime(180000);
    expect(() => f.controller.request(npcRoute)).toThrow('已关闭');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a stale timeout even if an already-queued callback runs after clearTimeout', () => {
    const callbacks: (() => void)[] = [];
    let currentMap = 'prontera';
    const navigate = vi.fn();
    const setStatus = vi.fn();
    const controller = createLastroTeleportNavigation({
      getMap: () => currentMap,
      getPosition: () => [127, 162],
      sendTeleport: vi.fn(), navigate, setStatus,
      clock: { setTimeout: (callback) => callbacks.push(callback), clearTimeout: () => undefined },
    });
    controller.request(npcRoute);
    const staleTimeout = callbacks[0];
    controller.request({ outset: ['payon', 50, 75] });
    staleTimeout?.();
    expect(setStatus).not.toHaveBeenCalledWith('传送等待超时，请重新选择地点');
    controller.dispose();
    currentMap = 'payon';
    for (const callback of callbacks) callback();
    controller.onMapChanged();
    expect(navigate).not.toHaveBeenCalled();
  });
});
