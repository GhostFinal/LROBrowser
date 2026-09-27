const FREE_PVP_ZONE = 1;
const EVENT_PVP_ZONE = 2;
const PVP_MAP_FLAG = 1;

export function isPvpMapProperty(type) {
  const value = Number(type);
  return value === FREE_PVP_ZONE || value === EVENT_PVP_ZONE;
}

export function isPvpEnabled(packet, pvpMapFlag = PVP_MAP_FLAG) {
  const flag = Number(packet?.flag) || 0;
  return isPvpMapProperty(packet?.type) || (flag & pvpMapFlag) !== 0;
}
