const ROUTE_FIELDS = ["npc", "desc", "outset", "path", "breakpoint", "position"];

export const AUTO_BATTLE_SCALAR_IDS = Object.freeze({
  onlynoattack: 0,
  pmdis: 1,
  mgdis: 2,
  AutoUseWing_time: 3,
  usehpConversion: 4,
  AutoSeeBoss: 5,
  qomobnumMin: 6,
  qomobnum: 7,
  usealheal: 8,
  MinHpValFly: 9,
  MinSpValFly: 10,
  MinHpVal: 11,
  useBoarding: 12,
  petTurnEgg: 13,
  AutoUseSit: 14,
  AutoUseSit_reHpVal: 15,
  AutoUseSit_reSpVal: 16,
  AutoUseSit_reHpUpVal: 17,
  AutoUseSit_reSpUpVal: 18,
  AutoUseSit_xw: 19,
  autoloot: 20,
  AutoUseItem_reHpVal: 21,
  AutoUseItem_reSpVal: 22,
  AutoUseItem_jsys: 23,
  AutoUseItem_Elemental: 24,
  AutoUseItem_Panacea: 25,
  useSiegfried: 26,
  AutoAttackstatus: 27,
  AutofollowMode: 28,
  disTarget: 29,
  addisTarget: 30,
  aidddis_reHpVal: 31,
  aidddis_reSpVal: 32,
  AutoUseItem_Elementalid: 33,
  startAutoAtk: 34,
  startAutoLoot: 35,
  startAutopots: 36,
  startAutofollow: 37,
  searchMode: 38,
  AutoUseSkillid: 39,
  AutoUseSkilllv: 40,
  useSkill_pro: 41,
  touchskillid: 42,
  touchskillop: 43,
  qo_AutoUseSkillid: 44,
  qo_AutoUseSkilllv: 45,
  AutoUseItem_Protection: 52,
  addiskillid: 53,
  addiskilllv: 54,
  addiskillop: 55,
  automaticid: 56,
  autoUseItem: 57,
  UseItemid: 58,
  AutoUseItem_Protectionid: 59,
  AutoUseItem_Protectionop: 60,
  adTarget: 61,
  keepwayOp: 62,
  useManuals: 63,
  useBubbles: 64,
  AutoUseItem_Dishid: 65,
  AutoUseItem_Dishop: 66,
  useAspersio: 67,
  ProtectTeam: 68
});

// v1 selects a recovery slot with id 57, then assigns its item with id 58.
export const AUTO_BATTLE_ITEM_SLOT_FIELDS = Object.freeze({
  AutoUseItem_hp_1: 1,
  AutoUseItem_hp_2: 2,
  AutoUseItem_hp_3: 3,
  AutoUseItem_sp_1: 4,
  AutoUseItem_sp_2: 5,
  AutoUseItem_sp_3: 6
});

const BOOLEAN_FIELDS = new Set([
  "usehpConversion", "AutoSeeBoss", "usealheal", "useBoarding", "AutoUseSit",
  "AutoUseItem_jsys", "AutoUseItem_Elemental", "AutoUseItem_Panacea", "useSiegfried",
  "startAutoAtk", "startAutoLoot", "startAutopots", "startAutofollow", "touchskillop",
  "AutoUseItem_Protection", "addiskillop", "AutoUseItem_Protectionop", "useManuals",
  "useBubbles", "AutoUseItem_Dishop", "useAspersio", "ProtectTeam"
]);

export function buildPrivateAirshipRequest({ mapname, x = 0, y = 0, type = 0, itemid = 14527 } = {}) {
  if (typeof mapname !== "string" || mapname.length === 0) {
    throw new TypeError("PRIVATE_AIRSHIP_REQUEST requires a mapname");
  }
  return { mapname, x: Number(x) || 0, y: Number(y) || 0, type: Number(type) || 0, itemid: Number(itemid) || 14527 };
}

export function normalizeRouteEntry(entry = {}) {
  const path = Array.isArray(entry.path) ? entry.path.filter((point) => Array.isArray(point) && typeof point[0] === "string") : [];
  const outset = Array.isArray(entry.outset) && typeof entry.outset[0] === "string" ? entry.outset.slice(0, 3) : null;
  if (path.length === 0 && !outset) throw new Error("route is missing a usable destination route");
  return Object.fromEntries(ROUTE_FIELDS.map((field) => {
    if (field === "path") return [field, path];
    if (field === "outset") return [field, outset];
    if (field === "breakpoint") return [field, Boolean(entry[field])];
    if (field === "position") return [field, Array.isArray(entry[field]) ? entry[field] : []];
    return [field, entry[field] ?? ""];
  }));
}

export function mapLoadInfoPayload(payload = {}) {
  const state = { ...payload };
  for (const field of BOOLEAN_FIELDS) if (field in state) state[field] = Boolean(state[field]);
  return state;
}

export function getVendingShopTitle(shopname, maxLength = 25) {
  const normalized = typeof shopname === "string" ? shopname : "";
  return normalized.length > maxLength ? `${normalized.substring(0, maxLength)}...` : normalized;
}

export function getAvailableInventoryItems(inventory = []) {
  const entries = Array.isArray(inventory) ? inventory : Object.values(inventory || {});
  const itemsById = new Map();

  for (const rawItem of entries) {
    const itemId = Number(rawItem?.ITID ?? rawItem?.id ?? rawItem?.ID ?? rawItem?.itemId);
    const count = Number(rawItem?.count ?? rawItem?.amount ?? 0);
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(count) || count <= 0) continue;

    const existing = itemsById.get(itemId);
    if (existing) {
      existing.count += count;
      if (!existing.identifiedDisplayName && rawItem.identifiedDisplayName) existing.identifiedDisplayName = rawItem.identifiedDisplayName;
      if (!existing.name && rawItem.name) existing.name = rawItem.name;
      continue;
    }

    itemsById.set(itemId, { ...rawItem, ITID: itemId, count });
  }

  return [...itemsById.values()].sort((a, b) => a.ITID - b.ITID);
}

export function mapReloadInfoPacket({ id, value } = {}) {
  return { id: Number(id), value: Number(value) || 0 };
}

export function mapScalarUpdate({ id, value } = {}) {
  return { id: Number(id), value: Number(value) || 0 };
}

export function buildAutoBattleFieldUpdate(field, rawValue, inputType = "number") {
  const id = AUTO_BATTLE_SCALAR_IDS[field];
  if (id === undefined) return null;
  const value = inputType === "checkbox" ? (rawValue ? 1 : 0) : field === "autoloot" ? mapAutolootPercent(rawValue) : Number(rawValue) || 0;
  return { id, value };
}

export function buildAutoBattleFieldUpdates(field, rawValue, inputType = "number") {
  const slot = AUTO_BATTLE_ITEM_SLOT_FIELDS[field];
  if (slot !== undefined) {
    const value = inputType === "checkbox" ? (rawValue ? 1 : 0) : Number(rawValue) || 0;
    return [
      { id: AUTO_BATTLE_SCALAR_IDS.autoUseItem, value: slot },
      { id: AUTO_BATTLE_SCALAR_IDS.UseItemid, value }
    ];
  }

  const update = buildAutoBattleFieldUpdate(field, rawValue, inputType);
  return update ? [update] : [];
}

export function mapAutolootPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(10000, Math.max(0, Math.round(percent * 100)));
}

export function buildAssistSkillUpdates({ skillId = 0, level = 0, enabled = false } = {}) {
  return [
    { id: AUTO_BATTLE_SCALAR_IDS.addiskillid, value: Number(skillId) || 0 },
    { id: AUTO_BATTLE_SCALAR_IDS.addiskilllv, value: Number(level) || 0 },
    { id: AUTO_BATTLE_SCALAR_IDS.addiskillop, value: enabled ? 1 : 0 }
  ];
}

export function mapOnlyTargetUpdate({ mobId, enabled } = {}) {
  const id = Number(mobId);
  if (!Number.isInteger(id) || id < 0) throw new TypeError("target-only update requires a valid mob id");
  return { id, value: enabled ? 1 : 0 };
}

export function canSelectOnlyTarget(selectedIds = [], mobId) {
  const id = Number(mobId);
  return selectedIds.includes(id) || selectedIds.length < 20;
}
