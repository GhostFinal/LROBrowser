export function createLastroVerifiedTeleportRequest({ preflight, navigation, getMap, getProfile, clearNavigation, sendTeleport }) {
  let generation = 0;
  function cancelPending() {
    generation++;
    preflight.cancel();
  }
  function cancel() {
    cancelPending();
    navigation.cancel();
    clearNavigation?.();
  }
  async function request(route) {
    cancel();
    const current = generation;
    const map = getMap(), profile = getProfile();
    const copy = value => Array.isArray(value) ? value.map(copy) : value;
    const target = route && typeof route === 'object' && !Array.isArray(route)
      ? { npc: route.npc, desc: route.desc, outset: copy(route.outset), path: copy(route.path), position: copy(route.position), ...(route.direct === true ? { direct: true } : {}) }
      : route;
    try {
      const result = await preflight.check(target);
      if (current !== generation) return null;
      if (map !== getMap() || profile !== getProfile()) throw new Error('当前地图或区服已变化，请重新选择地点');
      if (!result?.approved) throw new Error('传送地点未通过检查');
      if (target?.direct === true) {
        if (!Array.isArray(target.outset)) throw new Error('当前客户端不支持快捷传送');
        const normalize = value => typeof value === 'string' ? value.trim().replace(/\.gat$/i, '').toLowerCase() : '';
        if (Array.isArray(target.position) && target.position.some(value => normalize(value) === normalize(map))) throw new Error('当前位置不能使用此传送路线');
        if (normalize(target.outset[0]) === normalize(map)) {
          // A direct point does not inherit the catalog's multi-map itinerary.
          return navigation.request({ ...target, path: [[...target.outset]] });
        }
        if (typeof sendTeleport !== 'function') throw new Error('当前客户端不支持快捷传送');
        sendTeleport([...target.outset]);
        return 'teleport';
      }
      return navigation.request(target);
    } catch (error) {
      if (current !== generation || error?.name === 'AbortError') return null;
      throw error;
    }
  }
  return { request, cancelPending, cancel };
}
