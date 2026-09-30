/**
 * LASTRO skill-data localization overlay.
 *
 * Skill names and skill descriptions are intentionally kept apart from the
 * general UI/job localization table.  The runtime can select either the
 * regular or LastRO skill Lua files, so this overlay is applied after those
 * files have been parsed and works for both sources.
 */

/**
 * Bundled Chinese names, project translations, and reviewed terminology.
 *
 * Keep keys equal to SkillConst names.  Unknown keys are ignored by the
 * runtime overlay, which lets this list remain compatible with older skill
 * tables while the data is being reviewed.
 */
import { BUNDLED_SKILL_NAMES } from './lastro-skill-data.mjs';
import { EXTRA_SKILL_NAMES } from './lastro-skill-extra.mjs';

export const SKILL_NAME_OVERRIDES = {
  ...BUNDLED_SKILL_NAMES,
  ...EXTRA_SKILL_NAMES,
  NV_BASIC: '基本技能',

  SM_SWORD: '剑术修炼',
  SM_TWOHAND: '双手剑修炼',
  SM_RECOVERY: 'HP恢复力提升',
  SM_BASH: '狂击',
  SM_PROVOKE: '挑衅',
  SM_MAGNUM: '怒爆',
  SM_ENDURE: '霸体',

  MG_SRECOVERY: '禅心',
  MG_SIGHT: '火狩',
  MG_NAPALMBEAT: '心灵爆破',
  MG_SAFETYWALL: '暗之障壁',
  MG_SOULSTRIKE: '圣灵召唤',
  MG_COLDBOLT: '冰箭术',
  MG_FROSTDIVER: '冰冻术',
  MG_STONECURSE: '石化术',
  MG_FIREBALL: '火球术',
  MG_FIREWALL: '火墙术',
  MG_FIREBOLT: '火箭术',
  MG_LIGHTNINGBOLT: '雷击术',
  MG_THUNDERSTORM: '雷爆术',

  AL_DP: '天使之护',
  AL_DEMONBANE: '天使之击',
  AL_RUWACH: '光猎',
  AL_PNEUMA: '光之障壁',
  AL_TELEPORT: '瞬间移动',
  AL_WARP: '传送之阵',
  AL_HEAL: '治愈术',
  AL_INCAGI: '加速术',
  AL_DECAGI: '缓速术',
  AL_CURE: '复原术',
  AL_BLESSING: '天使之赐福',
  AL_ANGELUS: '天使之障壁',

  TF_DOUBLE: '二刀连击',
  TF_MISS: '残影',
  TF_STEAL: '偷窃',
  TF_HIDING: '隐匿',
  TF_POISON: '施毒',
  TF_DETOXIFY: '解毒',

  AC_OWL: '鸮枭之眼',
  AC_VULTURE: '苍鹰之眼',
  AC_CONCENTRATION: '心神凝聚',
  AC_DOUBLE: '二连矢',
  AC_SHOWER: '箭雨',

  MC_INCCARRY: '负重增加',
  MC_DISCOUNT: '低价买进',
  MC_OVERCHARGE: '高价卖出',
  MC_PUSHCART: '手推车',
  MC_IDENTIFY: '鉴定',
  MC_VENDING: '露天商店',
  MC_MAMMONITE: '金钱攻击',
};

/**
 * SkillDescription is an ID -> newline-separated string table. Keep this map
 * empty until a description needs a correction to the bundled GBK source;
 * names can be shipped independently without replacing a complete tooltip
 * with a partial translation.
 */
export const SKILL_DESCRIPTION_OVERRIDES = {};
