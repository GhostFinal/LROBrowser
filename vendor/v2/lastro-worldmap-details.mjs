const WORLD_DATA_PATH = '../core/data/world/world-data.json';
const MOB_DATA_PATH = '../core/data/world/mob-data.json';

let cachedDataPromise;
let cachedWorldMapNameDataPromise;

export function parseAmdDataModule() {
  throw new Error("AMD world-map modules are converted during the build");
}

function getDrops(monster, getItemName) {
  const drops = [];
  const count = Number(monster.DropsNum) || 0;
  for (let index = 0; index < count; index++) {
    const id = Number(monster[`Drop${index}id`]);
    const probability = Number(monster[`Drop${index}per`]);
    if (!id || !probability) continue;
    drops.push({
      id,
      name: getItemName(id),
      rate: `${(probability / 100).toFixed(2)}%`
    });
  }
  return drops;
}

function normalizeMapId(mapId) {
  return String(mapId || '').trim().toLowerCase().replace(/\.(gat|rsw)$/i, '');
}

export function resolveWorldMapDisplayName(mapId, fallback, worldData, mapTable = {}) {
  const normalizedMapId = normalizeMapId(mapId);
  const localName = worldData?.[normalizedMapId]?.name;
  if (typeof localName === 'string' && localName.trim()) return localName;

  for (const candidate of [normalizedMapId, `${normalizedMapId}.rsw`, `${normalizedMapId}.gat`]) {
    const clientName = mapTable?.[candidate]?.name;
    if (typeof clientName === 'string' && clientName.trim()) return clientName;
  }

  return fallback;
}

/**
 * Return the parent map and every dungeon floor represented by its v1
 * `branch` list.  The Lua world-map table uses one screen position for a
 * stacked dungeon, so the floor IDs must come from worldData rather than the
 * rendered section's (shared) ID.
 */
export function getWorldMapFloorOptions(mapId, worldData) {
  const entries = Object.entries(worldData || {});
  const byId = new Map(entries.map(([id, value]) => [normalizeMapId(id), { id: normalizeMapId(id), value: value || {} }]));
  const currentId = normalizeMapId(mapId);
  if (!currentId) return [];
  const current = byId.get(currentId)?.value || {};
  let parentId = normalizeMapId(current.belong);
  if (!parentId) {
    for (const [id, entry] of byId) {
      if (Array.isArray(entry.value.branch) && entry.value.branch.some((child) => normalizeMapId(child) === currentId)) {
        parentId = id;
        break;
      }
    }
  }
  if (!parentId && Array.isArray(current.branch) && current.branch.length) parentId = currentId;
  if (!parentId) return [];

  const parent = byId.get(parentId)?.value || {};
  const ids = [parentId, ...(Array.isArray(parent.branch) ? parent.branch : []), currentId];
  const seen = new Set();
  return ids.reduce((result, candidate) => {
    const id = normalizeMapId(candidate);
    if (!id || seen.has(id)) return result;
    seen.add(id);
    const value = byId.get(id)?.value || {};
    result.push({ id, name: String(value.name || id), selected: id === currentId });
    return result;
  }, []);
}

export function getMapMonsterDetails(mapId, worldData, mobData, getItemName) {
  const map = worldData[mapId] || {};
  const mobIds = Array.isArray(map.mobs) ? map.mobs : [];
  const itemName = typeof getItemName === 'function' ? getItemName : (id) => `道具 #${id}`;

  return {
    mapId,
    mapName: map.name || mapId,
    monsters: mobIds.map((id) => {
      const monster = mobData[id] || {};
      return {
        id: Number(id),
        name: monster.kName || `魔物 #${id}`,
        level: Number(monster.LV) || 0,
        drops: getDrops(monster, itemName)
      };
    })
  };
}

export function getMapTargetOptions(mapId, worldData, mobData) {
  const map = worldData[mapId] || {};
  const mobIds = Array.isArray(map.mobs) ? map.mobs : [];
  return mobIds.map((id) => {
    const monster = mobData[id] || {};
    return {
      id: Number(id),
      name: monster.kName || `魔物 #${id}`,
      level: Number(monster.LV) || 0
    };
  }).filter((monster) => Number.isInteger(monster.id) && monster.id > 0)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || left.id - right.id);
}

export function getPrimaryMapMonsters(mapId, worldData, mobData, navigationMobs, limit = 2) {
  const normalizedMapId = String(mapId || '').toLowerCase().replace(/\.(gat|rsw)$/i, '');
  const map = worldData[normalizedMapId] || worldData[mapId] || {};
  const allowedIds = new Set((Array.isArray(map.mobs) ? map.mobs : []).map(Number));
  const rows = Array.isArray(navigationMobs) ? navigationMobs : Object.values(navigationMobs || {});
  const monsters = [];
  const bosses = [];
  const seen = new Set();

  for (const row of rows) {
    if (!Array.isArray(row) || String(row[0] || '').toLowerCase().replace(/\.(gat|rsw)$/i, '') !== normalizedMapId) continue;
    const packed = Number(row[3]) >>> 0;
    const id = packed & 65535;
    if (!id || !allowedIds.has(id) || seen.has(id)) continue;
    const data = mobData[id] || {};
    const name = String(data.kName || row[4] || '').trim();
    if (!name) continue;
    const entry = {
      id,
      name,
      level: Number(data.LV ?? row[6]) || 0,
      count: packed >>> 16
    };
    seen.add(id);
    if (Number(row[2]) === 301) bosses.push(entry);
    else monsters.push(entry);
  }

  if (!monsters.length && !bosses.length) {
    for (const id of allowedIds) {
      const data = mobData[id] || {};
      const name = String(data.kName || '').trim();
      if (!id || !name) continue;
      monsters.push({ id, name, level: Number(data.LV) || 0, count: 0 });
    }
  }

  const byPrevalence = (left, right) => right.count - left.count || right.level - left.level || left.id - right.id;
  monsters.sort(byPrevalence);
  bosses.sort(byPrevalence);
  return {
    monsters: monsters.slice(0, Math.max(1, Number(limit) || 2)),
    bosses
  };
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Unable to load world-map data (${response.status})`);
  return response.json();
}

export async function loadWorldMapNameData() {
  if (!cachedWorldMapNameDataPromise) {
    cachedWorldMapNameDataPromise = fetchJson(WORLD_DATA_PATH);
  }
  return cachedWorldMapNameDataPromise;
}

export async function loadWorldMapData() {
  if (!cachedDataPromise) {
    cachedDataPromise = Promise.all([loadWorldMapNameData(), fetchJson(MOB_DATA_PATH)]).then(([worldData, mobData]) => ({
      worldData,
      mobData
    }));
  }
  return cachedDataPromise;
}
