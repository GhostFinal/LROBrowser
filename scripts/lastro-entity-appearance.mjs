import monsterAppearances from './lastro-monster-appearances.json' with { type: 'json' };
import mercenaryAppearances from './lastro-mercenary-appearances.json' with { type: 'json' };

// Missing monster resource names from https://game.lastro.cn/ro/Online.js?71.91,
// DB/Monsters/MonsterTable; SHA-256 ab9b575fe06af8f3eb86fedd0a5c134162aadb7dfeb880cb8f3f99677a69e936.
// Keep existing native/Lua mappings and the server's custom pet appearances.
export const LASTRO_MONSTER_APPEARANCES = Object.freeze(monsterAppearances);
export const LASTRO_MERCENARY_APPEARANCES = Object.freeze(mercenaryAppearances);

function replaceExact(source, needle, replacement) {
  if (source.split(needle).length !== 2) throw new Error('anchor:entity-appearance');
  return source.replace(needle, replacement);
}

function patchRegion(source, name, update) {
  const marker = `//#region ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:entity-appearance');
  return source.slice(0, start) + update(source.slice(start, end).replace(/\r\n/g, '\n')) + source.slice(end);
}

export function patchRuntimeEntityAppearance(source) {
  let output = patchRegion(source, 'src/Renderer/Entity/EntityAction.js', region => {
    replaceExact(region, 'if (this._job == 6017) {', '');
    replaceExact(region, 'this._job == 6027 || this._job == 6037', '');
    replaceExact(region, '    case Entity.TYPE_MERC:\n', '');
    replaceExact(region, '    case Entity.TYPE_MOB:\n', '');
    const start = region.indexOf('    case Entity.TYPE_MERC:\n');
    const end = region.indexOf('    case Entity.TYPE_MOB:\n', start);
    if (start < 0 || end < start) throw new Error('anchor:entity-appearance');
    return region.slice(0, start) + `    case Entity.TYPE_MERC:
      this.ACTION.IDLE = 0;
      this.ACTION.WALK = 1;
      this.ACTION.SIT = 2;
      this.ACTION.PICKUP = 3;
      this.ACTION.READYFIGHT = 4;
      this.ACTION.ATTACK1 = 5;
      this.ACTION.HURT = 6;
      this.ACTION.FREEZE = 7;
      this.ACTION.DIE = 8;
      this.ACTION.FREEZE2 = 9;
      this.ACTION.ATTACK2 = 10;
      this.ACTION.ATTACK3 = 11;
      this.ACTION.SKILL = 12;
      break;
` + region.slice(end);
  });
  output = patchRegion(output, 'src/Renderer/Entity/EntityView.js', region =>
    replaceExact(region, 'objecttype = Entity.TYPE_MER;', 'objecttype = Entity.TYPE_MERC;'));
  output = patchRegion(output, 'src/DB/Monsters/MonsterTable.js', region => {
    let patched = replaceExact(region, '  MonsterTable_default = {', '  init_Configs();\n  MonsterTable_default = {');
    patched = replaceExact(patched, '  };\n});', `  };
  if (Configs.get("lastroProtocol", false)) applyLastROMonsterAppearanceFallbacks(MonsterTable_default);
});`);
    const helper = `const LastROMonsterAppearanceFallbacks = ${JSON.stringify(LASTRO_MONSTER_APPEARANCES)};
const LastROMercenaryAppearances = ${JSON.stringify(LASTRO_MERCENARY_APPEARANCES)};
function applyLastROMonsterAppearanceFallbacks(jobNames) {
  for (const [id, name] of Object.entries(LastROMonsterAppearanceFallbacks)) {
    if (!jobNames[id]) jobNames[id] = name;
  }
}
function applyLastROMercenaryAppearance(pkt) {
  const appearance = LastROMercenaryAppearances[pkt.job]?.[0];
  if (!Configs.get("lastroProtocol", false) || !appearance ||
      (pkt.objecttype !== Entity.TYPE_MERC && pkt.objecttype !== Entity.TYPE_UNKNOWN &&
       typeof pkt.objecttype !== "undefined")) return;
  for (const key of ["sex", "head", "accessory", "accessory2", "accessory3", "weapon"]) pkt[key] = appearance[key];
  pkt.objecttype = Entity.TYPE_MERC;
}
`;
    return replaceExact(patched, '//#region src/DB/Monsters/MonsterTable.js\n',
      '//#region src/DB/Monsters/MonsterTable.js\n' + helper);
  });
  output = patchRegion(output, 'src/DB/DBManager.js', region => {
    let patched = replaceExact(region,
      '  if (Configs.get("lastroProtocol", false)) applyLastROPetJobOverrides(target);',
      `  if (Configs.get("lastroProtocol", false)) {
    applyLastROPetJobOverrides(target);
    applyLastROMonsterAppearanceFallbacks(target);
  }`);
    patched = replaceExact(patched, `      if (DB.isMercenary(id))
        return "data/sprite/ÀÎ°£Á·/¸öÅë/" + MonsterTable_default[id];`, `      if (DB.isMercenary(id)) {
        const appearance = Configs.get("lastroProtocol", false) && LastROMercenaryAppearances[id]?.[0];
        return "data/sprite/ÀÎ°£Á·/¸öÅë/" + (appearance
          ? SexTable[appearance.sex] + "/" + appearance.file
          : MonsterTable_default[id]);
      }`);
    patched = replaceExact(patched, `    static getWeaponPath(id, job, sex, leftid = false) {
      if (id === 0) return null;`, `    static getWeaponPath(id, job, sex, leftid = false) {
      if (id === 0) return null;
      const appearance = Configs.get("lastroProtocol", false) && LastROMercenaryAppearances[job]?.[0];
      if (appearance) return "data/sprite/ÀÎ°£Á·/¿ëº´/" + appearance.file + (WeaponName[id] || "_" + id);`);
    return replaceExact(patched, `    static getWeaponTrail(id, job, sex) {
      if (id === 0) return null;`, `    static getWeaponTrail(id, job, sex) {
      if (id === 0 || (Configs.get("lastroProtocol", false) && DB.isMercenary(job))) return null;`);
  });
  return patchRegion(output, 'src/Engine/MapEngine/Entity.js', region => {
    let patched = replaceExact(region, 'function onEntitySpam(pkt) {\n  let entity',
      'function onEntitySpam(pkt) {\n  applyLastROMercenaryAppearance(pkt);\n  let entity');
    // The original client uses ATTACK2; ATTACK1 has static body frames and no weapon layers.
    return replaceExact(patched, `      if (pkt.leftDamage) {
        const useATTACK =`, `      if (srcEntity.objecttype === Entity.TYPE_MERC) {
        srcEntity.setAction({
          action: srcEntity.ACTION.ATTACK2,
          frame: 0,
          repeat: false,
          play: true,
          next: {
            delay: Renderer.tick + pkt.attackMT,
            action: srcEntity.ACTION.IDLE,
            frame: 0,
            repeat: true,
            play: true,
            next: false,
          },
        });
      } else if (pkt.leftDamage) {
        const useATTACK =`);
  });
}
