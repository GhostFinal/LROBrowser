import { describe, expect, it, vi } from 'vitest';
import { createLastroVerifiedTeleportRequest } from '../scripts/lastro-teleport-request.mjs';
import { createLastroTeleportNavigation } from '../scripts/lastro-teleport-navigation.mjs';

function fixture() {
  let map = 'izlude', profile = 5;
  const pending: Array<{ resolve: (value: { approved: boolean }) => void; reject: (error: Error) => void }> = [];
  const preflight = {
    check: vi.fn<(route: unknown) => Promise<{ approved: boolean }>>(() => new Promise((resolve, reject) => pending.push({ resolve, reject }))), cancel: vi.fn(),
  };
  const navigation = { request: vi.fn(() => 'teleport'), cancel: vi.fn() };
  const clearNavigation = vi.fn();
  const api = createLastroVerifiedTeleportRequest({ preflight, navigation, getMap: () => map, getProfile: () => profile, clearNavigation });
  return { api, pending, preflight, navigation, clearNavigation, setMap: (value: string) => { map = value; }, setProfile: (value: number) => { profile = value; } };
}

describe('verified teleport requests', () => {
  it('walks to the copied explicit same-map point only after approval, overriding an unrelated catalog path', async () => {
    const sendTeleport = vi.fn(), navigation = { request: vi.fn(() => 'navigation'), cancel: vi.fn() };
    let approved!: (value: { approved: boolean }) => void;
    const check = vi.fn<(route: unknown) => Promise<{ approved: boolean }>>(() => new Promise(resolve => { approved = resolve; }));
    const api = createLastroVerifiedTeleportRequest({
      preflight: { check, cancel: vi.fn() },
      navigation, getMap: () => 'prontera', getProfile: () => 5, sendTeleport,
    });
    const route = { outset: ['prontera', 127, 162], path: [['payon', 60, 80], ['prontera', 200, 201]], direct: true };
    const result = api.request(route); route.outset[1] = 65535; route.path[0]![0] = 'unknown';
    expect(sendTeleport).not.toHaveBeenCalled(); expect(navigation.request).not.toHaveBeenCalled();
    approved({ approved: true });
    expect(await result).toBe('navigation'); expect(sendTeleport).not.toHaveBeenCalled();
    expect(navigation.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outset: ['prontera', 127, 162], path: [['prontera', 127, 162]] }));
    expect(check.mock.calls[0]![0]).toMatchObject({ outset: ['prontera', 127, 162], path: [['payon', 60, 80], ['prontera', 200, 201]] });
  });

  it('keeps a different-map direct point as one native warp after approval', async () => {
    const sendTeleport = vi.fn(), navigation = { request: vi.fn(() => 'navigation'), cancel: vi.fn() };
    let approved!: (value: { approved: boolean }) => void;
    const api = createLastroVerifiedTeleportRequest({
      preflight: { check: () => new Promise(resolve => { approved = resolve; }), cancel: vi.fn() },
      navigation, getMap: () => 'izlude', getProfile: () => 5, sendTeleport,
    });
    const route = { outset: ['prontera', 127, 162], direct: true };
    const result = api.request(route); route.outset[1] = 65535;
    expect(sendTeleport).not.toHaveBeenCalled(); approved({ approved: true });
    expect(await result).toBe('teleport'); expect(sendTeleport).toHaveBeenCalledExactlyOnceWith(['prontera', 127, 162]);
    expect(navigation.request).not.toHaveBeenCalled();
  });

  it.each([['PRONTERA.GAT', 'prontera'], ['prontera', '  PrOnTeRa.gAt  ']])('uses real background navigation for the same map despite case/suffix differences: %s → %s', async (map, destination) => {
    vi.useFakeTimers();
    const sendTeleport = vi.fn(), navigate = vi.fn();
    let position = [1, 1];
    const navigation = createLastroTeleportNavigation({ getMap: () => map, getPosition: () => position, sendTeleport, navigate });
    try {
      const api = createLastroVerifiedTeleportRequest({
        preflight: { check: async () => ({ approved: true }), cancel: vi.fn() }, navigation,
        getMap: () => map, getProfile: () => 5, sendTeleport,
      });
      expect(await api.request({ outset: [destination, 127, 162], path: [['payon', 60, 80], [destination, 200, 201]], direct: true })).toBe('navigation');
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['prontera', 127, 162]); expect(sendTeleport).not.toHaveBeenCalled();
      position = [127, 162]; vi.advanceTimersByTime(600);
      expect(navigate).toHaveBeenCalledTimes(1); expect(sendTeleport).not.toHaveBeenCalled();
    } finally { navigation.dispose(); vi.useRealTimers(); }
  });

  it('does not require a teleport adapter to walk to an approved same-map point', async () => {
    const f = fixture(); f.navigation.request.mockReturnValue('navigation');
    const request = f.api.request({ outset: ['IZLUDE.GAT', 120, 130], direct: true });
    f.pending[0]!.resolve({ approved: true }); expect(await request).toBe('navigation');
    expect(f.navigation.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: [['IZLUDE.GAT', 120, 130]] }));
  });

  it('does not start walking when a direct quest request lacks the native teleport adapter', async () => {
    const f = fixture(); const result = f.api.request({ outset: ['prontera', 127, 162], direct: true });
    f.pending[0]!.resolve({ approved: true }); await expect(result).rejects.toThrow('当前客户端不支持快捷传送');
    expect(f.navigation.request).not.toHaveBeenCalled();
  });

  it('retains the original route exclusion maps for direct quest points', async () => {
    const sendTeleport = vi.fn(), navigation = { request: vi.fn(() => 'navigation'), cancel: vi.fn() };
    const api = createLastroVerifiedTeleportRequest({
      preflight: { check: async () => ({ approved: true }), cancel: vi.fn() },
      navigation, getMap: () => 'PRONTERA.gat', getProfile: () => 5, sendTeleport,
    });
    await expect(api.request({ outset: ['izlude', 127, 162], direct: true, position: ['prontera'] })).rejects.toThrow('当前位置不能使用此传送路线');
    expect(sendTeleport).not.toHaveBeenCalled(); expect(navigation.request).not.toHaveBeenCalled();
  });
  it('applies exclusion maps to same-map direct navigation before starting the native route', async () => {
    const navigation = { request: vi.fn(() => 'navigation'), cancel: vi.fn() }, sendTeleport = vi.fn();
    const api = createLastroVerifiedTeleportRequest({
      preflight: { check: async () => ({ approved: true }), cancel: vi.fn() }, navigation,
      getMap: () => 'PRONTERA.GAT', getProfile: () => 5, sendTeleport,
    });
    await expect(api.request({ outset: ['prontera', 127, 162], direct: true, position: ['PrOnTeRa.gat'] })).rejects.toThrow('当前位置不能使用此传送路线');
    expect(navigation.request).not.toHaveBeenCalled(); expect(sendTeleport).not.toHaveBeenCalled();
  });
  it('sends nothing while checking and starts the original route only after successful validation', async () => {
    const f = fixture(), route = { outset: ['prontera', 153, 192] };
    const result = f.api.request(route);
    expect(f.navigation.request).not.toHaveBeenCalled();
    f.pending[0]!.resolve({ approved: true });
    expect(await result).toBe('teleport');
    expect(f.navigation.request).toHaveBeenCalledExactlyOnceWith(route);
  });

  it.each(['地图资源不存在', '地图坐标超出范围'])('does not issue a command when validation fails: %s', async message => {
    const f = fixture(); const result = f.api.request({});
    f.pending[0]!.reject(new Error(message));
    await expect(result).rejects.toThrow(message);
    expect(f.navigation.request).not.toHaveBeenCalled();
  });

  it.each(['map', 'profile'])('rejects a request if its %s changes while downloading resources', async change => {
    const f = fixture(); const result = f.api.request({});
    if (change === 'map') f.setMap('geffen'); else f.setProfile(3);
    f.pending[0]!.resolve({ approved: true });
    await expect(result).rejects.toThrow('当前地图或区服已变化');
    expect(f.navigation.request).not.toHaveBeenCalled();
  });

  it('does not send an older request when its resource check completes after a newer request', async () => {
    const f = fixture(); const first = f.api.request({ npc: '旧地点' }), second = f.api.request({ npc: '卡普拉' });
    f.pending[1]!.resolve({ approved: true }); expect(await second).toBe('teleport');
    f.pending[0]!.resolve({ approved: true }); expect(await first).toBeNull();
    expect(f.navigation.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ npc: '卡普拉' }));
  });

  it('uses the same copied destination for validation and sending if the catalog changes during the check', async () => {
    const f = fixture(); const route = { outset: ['prontera', 116, 72], path: [['prontera', 149, 89]], position: ['blocked'] };
    const result = f.api.request(route);
    route.outset[0] = 'unknown'; route.outset[1] = 65535; route.path[0]![0] = 'unknown'; route.position.push('izlude');
    f.pending[0]!.resolve({ approved: true }); expect(await result).toBe('teleport');
    const approved = f.preflight.check.mock.calls[0]![0];
    expect(f.navigation.request).toHaveBeenCalledExactlyOnceWith(approved);
    expect(approved).toMatchObject({ outset: ['prontera', 116, 72], path: [['prontera', 149, 89]], position: ['blocked'] });
  });

  it.each(['cancelPending', 'cancel'] as const)('does not revive a request after %s', async method => {
    const f = fixture(); const result = f.api.request({});
    f.api[method](); f.pending[0]!.resolve({ approved: true });
    expect(await result).toBeNull(); expect(f.navigation.request).not.toHaveBeenCalled();
  });

  it('silences canceled errors and requires an explicit approved result', async () => {
    const f = fixture(); const canceled = f.api.request({});
    f.api.cancelPending(); f.pending[0]!.reject(new Error('旧请求失败'));
    expect(await canceled).toBeNull();
    const rejected = f.api.request({}); f.pending[1]!.resolve({ approved: false });
    await expect(rejected).rejects.toThrow('传送地点未通过检查');
    expect(f.navigation.request).not.toHaveBeenCalled();
  });
});
