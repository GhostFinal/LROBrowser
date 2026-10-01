// Serialized into the runtime; sending a map-level warp stays in the adapter.
export function createLastroWorldMapTeleport({ preflight, getMap, getProfile, send, onSameMap, onError }) {
  if (typeof preflight?.check !== 'function' || typeof preflight?.cancel !== 'function'
    || typeof getMap !== 'function' || typeof getProfile !== 'function' || typeof send !== 'function') {
    throw new TypeError('World map teleport requires preflight, map, profile, and send functions');
  }
  let generation = 0;

  function cancelPending() {
    generation++;
    preflight.cancel();
  }

  async function request(mapid) {
    cancelPending();
    const token = generation;
    try {
      const id = typeof mapid === 'string' ? mapid.trim().toLowerCase().replace(/\.(gat|rsw)$/i, '') : '';
      if (!/^[a-z0-9_@#-]{1,16}$/.test(id)) throw new Error('地图名无效，请重新选择。');
      const origin = getMap();
      const profile = getProfile();
      if (typeof origin !== 'string' || !origin) throw new Error('当前地图尚未就绪，请稍后重新选择。');
      if (id === origin.trim().toLowerCase().replace(/\.(gat|rsw)$/i, '')) {
        onSameMap?.(id);
        return false;
      }
      // Type 0 map-level warps use the original 0/0 default, rather than an NPC route.
      const result = await preflight.check({ outset: [id, 0, 0] });
      if (token !== generation) return false;
      if (origin !== getMap() || profile !== getProfile()) throw new Error('当前地图或区服已变化，请重新选择地点。');
      if (!result?.approved) throw new Error('传送地点未通过检查。');
      send(id);
      return true;
    } catch (error) {
      if (token !== generation || error?.name === 'AbortError') return false;
      onError?.(error);
      return false;
    }
  }

  return { request, cancelPending };
}
