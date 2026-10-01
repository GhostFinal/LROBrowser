// Serialized into the client runtime; dependencies must remain explicit.
export function createLastroTeleportNavigation({ getMap, getPosition, sendTeleport, navigate, stopNavigation, setStatus, clock = globalThis }) {
  let active = null;
  let disposed = false;
  let pollTimer;
  let timeoutTimer;

  function mapName(value) {
    return typeof value === 'string' ? value.trim().replace(/\.gat$/i, '').toLowerCase() : '';
  }

  function point(value) {
    if (!Array.isArray(value) || value.length < 3) throw new Error('传送地点缺少地图或坐标');
    const map = mapName(value[0]);
    const x = value[1];
    const y = value[2];
    if (!/^[a-z0-9_@#-]{1,16}$/.test(map) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 65535 || y > 65535) {
      throw new Error('传送地点的地图或坐标无效');
    }
    return [map, x, y];
  }

  function cancel() {
    const state = active;
    active = null;
    if (pollTimer !== undefined) clock.clearTimeout(pollTimer);
    if (timeoutTimer !== undefined) clock.clearTimeout(timeoutTimer);
    pollTimer = timeoutTimer = undefined;
    if (state?.phase === 'navigation') stopNavigation?.();
  }

  function finish(state, message) {
    if (active !== state) return;
    cancel();
    setStatus?.(message);
  }

  function timeout(state, milliseconds, message) {
    if (timeoutTimer !== undefined) clock.clearTimeout(timeoutTimer);
    timeoutTimer = clock.setTimeout(() => finish(state, message), milliseconds);
  }

  function step(state) {
    if (active !== state || state.phase !== 'navigation' || state.suspended) return;
    const currentMap = mapName(getMap());
    // A map name can change before its collision data and entity position are ready.
    if (!currentMap || state.readyMap !== currentMap) return;
    let target = state.path[state.index];
    if (currentMap !== target[0]) {
      const nextIndex = state.path.findIndex((entry, index) => index > state.index && entry[0] === currentMap);
      if (nextIndex === -1) return;
      // The portal can load the next map before the outgoing cell is observed.
      state.index = nextIndex;
      state.startedIndex = -1;
      target = state.path[state.index];
    }
    const position = getPosition();
    if (!position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) return;
    // Native navigation chooses a walkable neighbour when the NPC occupies its cell.
    while (currentMap === target[0] && Math.abs(position[0] - target[1]) <= 1 && Math.abs(position[1] - target[2]) <= 1) {
      state.index += 1;
      if (state.index === state.path.length) {
        finish(state, '已到达目标地点');
        return;
      }
      target = state.path[state.index];
    }
    if (state.startedIndex !== state.index && active === state) {
      state.startedIndex = state.index;
      navigate([...target]);
    }
  }

  function observe(state) {
    if (active !== state) return;
    try {
      step(state);
    } catch (error) {
      finish(state, error instanceof Error ? error.message : '导航失败');
    }
    if (active === state && !state.suspended) pollTimer = clock.setTimeout(() => observe(state), 200);
  }

  function request(route) {
    if (disposed) throw new Error('传送导航已关闭');
    cancel();
    if (!route || typeof route !== 'object') throw new Error('传送地点不可用');
    const outset = route.outset?.length ? point(route.outset) : null;
    if (route.path !== undefined && !Array.isArray(route.path)) throw new Error('传送路径无效');
    const path = route.path?.length ? route.path.map(point) : outset ? [outset] : [];
    if (!path.length) throw new Error('传送地点缺少地图或坐标');
    const currentMap = mapName(getMap());
    if (!currentMap) throw new Error('当前地图尚未就绪');
    const index = path.findIndex((entry) => entry[0] === currentMap);
    const needsTeleport = index === -1;
    if (needsTeleport) {
      if (Array.isArray(route.position) && route.position.some((entry) => mapName(entry) === currentMap)) {
        throw new Error('当前位置不能使用此传送路线');
      }
      if (!outset) throw new Error('传送路线缺少出发地点');
    }
    const state = { path, index: needsTeleport ? 0 : index, phase: needsTeleport ? 'warp' : 'navigation', readyMap: currentMap, outset, startedIndex: -1, suspended: false };
    active = state;
    try {
      if (needsTeleport) {
        timeout(state, 30000, '传送等待超时，请重新选择地点');
        setStatus?.('正在传送到路线出发地点');
        if (active === state) sendTeleport([...outset]);
      } else {
        timeout(state, 180000, '导航超时，请重新选择地点');
        setStatus?.('正在前往目标地点');
        step(state);
      }
      if (active === state) pollTimer = clock.setTimeout(() => observe(state), 200);
    } catch (error) {
      if (active === state) cancel();
      throw error;
    }
    return needsTeleport ? 'teleport' : 'navigation';
  }

  function onMapChanged() {
    const state = active;
    if (!state) return;
    const currentMap = mapName(getMap());
    if (!currentMap) return;
    state.suspended = false;
    state.readyMap = currentMap;
    if (state.phase === 'warp') {
      if (currentMap !== state.outset[0]) return;
      state.phase = 'navigation';
      timeout(state, 180000, '导航超时，请重新选择地点');
      setStatus?.('正在前往目标地点');
    }
    state.startedIndex = -1;
    try {
      step(state);
    } catch (error) {
      finish(state, error instanceof Error ? error.message : '导航失败');
    }
    if (pollTimer !== undefined) clock.clearTimeout(pollTimer);
    pollTimer = undefined;
    if (active === state) pollTimer = clock.setTimeout(() => observe(state), 200);
  }

  function onMapChanging() {
    if (!active) return;
    active.suspended = true;
    active.readyMap = '';
    if (pollTimer !== undefined) clock.clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  function onTeleportRejected(message) {
    if (active?.phase !== 'warp') return;
    finish(active, message);
  }

  return { request, onMapChanging, onMapChanged, onTeleportRejected, cancel, dispose() { disposed = true; cancel(); } };
}
