const monster = (id, name, level) => Object.freeze({ id, name, level });

function createRoute({ group, npc, map, x, y, monsterMap = map, monsters, restriction = "", staticMonsterData = false }) {
  const destination = Object.freeze([map, x, y]);
  const primaryMonsters = Object.freeze(monsters);
  const details = primaryMonsters.map((entry) => `${entry.name} Lv${entry.level}`).join("、");
  return Object.freeze({
    group,
    npc,
    desc: `${restriction ? `${restriction} · ` : ""}入口 · 主怪：${details} · ${map} ${x},${y}`,
    outset: destination,
    path: Object.freeze([destination]),
    monsterMap,
    monsters: primaryMonsters,
    ...(staticMonsterData ? { staticMonsterData: true } : {})
  });
}

export const PARADISE_GROUP_QUICK_ROUTE = Object.freeze({
  group: "首都功能服务",
  npc: "乐园团·宝雅前",
  desc: "乐园团内部 · moc_para01 27,30",
  outset: Object.freeze(["moc_para01", 27, 30]),
  path: Object.freeze([Object.freeze(["moc_para01", 27, 30])])
});

export const QUICK_TELEPORT_CAVE_ROUTES = Object.freeze({
  pronteraSewers: createRoute({
    group: "经典地下城", npc: "普隆德拉地下水道", map: "prt_fild05", x: 271, y: 210, monsterMap: "prt_sewb1",
    monsters: [monster(1005, "吸血蝙蝠", 24), monster(1048, "盗虫卵", 20)]
  }),
  mazeForest: createRoute({
    group: "经典地下城", npc: "迷藏森林", map: "prt_fild01", x: 136, y: 373, monsterMap: "prt_maze01",
    monsters: [monster(1092, "流浪之狼", 93), monster(1099, "艾吉欧蜈蚣", 75)]
  }),
  payonCave: createRoute({
    group: "经典地下城", npc: "斐扬洞窟", map: "pay_arche", x: 36, y: 131, monsterMap: "pay_dun01",
    monsters: [monster(1116, "转转蛋", 53), monster(1016, "邪骸弓箭手", 50)]
  }),
  geffenDungeon: createRoute({
    group: "经典地下城", npc: "吉芬地下密穴", map: "geffen", x: 120, y: 114, monsterMap: "gef_dun00",
    monsters: [monster(1035, "赤苍蝇", 63), monster(2797, "愤怒赤苍蝇", 63)]
  }),
  mjolnirMine: createRoute({
    group: "经典地下城", npc: "妙勒尼废弃矿场", map: "mjolnir_02", x: 79, y: 365, monsterMap: "mjo_dun01",
    monsters: [monster(1145, "土拨鼠", 39), monster(1005, "吸血蝙蝠", 24)]
  }),
  clockTower: createRoute({
    group: "经典地下城", npc: "钟塔", map: "aldebaran", x: 139, y: 135, monsterMap: "c_tower1",
    monsters: [monster(1270, "钟塔守护者", 90), monster(1102, "巫婆", 86)]
  }),
  clockTowerBasement: createRoute({
    group: "经典地下城", npc: "钟塔地下", map: "alde_dun01", x: 125, y: 22,
    monsters: [monster(1194, "卷甲虫", 107), monster(2894, "菁英卷甲虫", 107)]
  }),
  toyFactory: createRoute({
    group: "经典地下城", npc: "玩具工厂", map: "xmas", x: 143, y: 314, monsterMap: "xmas_dun01",
    monsters: [monster(1096, "天使波利", 77), monster(1090, "波利之王", 42)]
  }),
  pyramid: createRoute({
    group: "经典地下城", npc: "金字塔迷宫", map: "moc_ruins", x: 54, y: 161, monsterMap: "moc_pryd01",
    monsters: [monster(1031, "波波利", 30), monster(1005, "吸血蝙蝠", 24)]
  }),
  sphinx: createRoute({
    group: "经典地下城", npc: "史芬克斯密穴", map: "moc_fild19", x: 98, y: 99, monsterMap: "in_sphinx1",
    monsters: [monster(1164, "诺可伊", 71), monster(1178, "杰洛米", 70)]
  }),
  antHell: createRoute({
    group: "经典地下城", npc: "蚂蚁地狱", map: "cmd_fild08", x: 329, y: 352, monsterMap: "anthell01",
    monsters: [monster(1121, "基尔瑟", 42), monster(1176, "黑蚁", 35)]
  }),
  orcsDungeon: createRoute({
    group: "经典地下城", npc: "兽人地下洞窟", map: "gef_fild10", x: 63, y: 337, monsterMap: "orcsdun01",
    monsters: [monster(1152, "邪骸兽人", 53), monster(1153, "兽人腐尸", 51)]
  }),
  byalan: createRoute({
    group: "经典地下城", npc: "海底洞窟", map: "izlu2dun", x: 108, y: 83, monsterMap: "iz_dun00",
    monsters: [monster(1066, "螃蟹", 45), monster(1070, "库克雷", 42)]
  }),
  sunkenShip: createRoute({
    group: "经典地下城", npc: "沉没之船", map: "alb2trea", x: 85, y: 107, monsterMap: "treasure01", restriction: "船夫",
    monsters: [monster(1071, "邪骸海盗", 48), monster(1179, "白幽灵", 46)]
  }),
  comodoNorth: createRoute({
    group: "经典地下城", npc: "克魔岛北边洞穴·卢安达", map: "comodo", x: 176, y: 358, monsterMap: "beach_dun2",
    monsters: [monster(1255, "奈利虫", 98), monster(1278, "钟乳巨石怪", 68)]
  }),
  comodoWest: createRoute({
    group: "经典地下城", npc: "克魔岛西边洞穴·加露", map: "comodo", x: 24, y: 214, monsterMap: "beach_dun",
    monsters: [monster(1583, "塔奥群卡", 110), monster(1148, "米杜沙", 102)]
  }),
  comodoEast: createRoute({
    group: "经典地下城", npc: "克魔岛东边洞穴·马吾", map: "comodo", x: 333, y: 175, monsterMap: "beach_dun3",
    monsters: [monster(1255, "奈利虫", 98), monster(1064, "邪骸食人鱼", 46)]
  }),
  turtleIsland: createRoute({
    group: "经典地下城", npc: "乌龟岛", map: "tur_dun01", x: 154, y: 241,
    monsters: [monster(1314, "果树龟", 90), monster(1256, "单眼虫", 89)]
  }),
  glastHeim: createRoute({
    group: "经典地下城", npc: "古城", map: "glast_01", x: 200, y: 297, monsterMap: "gl_cas01",
    monsters: [monster(1295, "鹗枭男爵", 120), monster(1267, "卡拉特小丑", 103)]
  }),
  glastHeimAbyss: createRoute({
    group: "经典地下城", npc: "古城深渊", map: "gl_cas01_", x: 20, y: 20,
    monsters: [monster(20371, "越狱腐尸", 186), monster(20369, "冰冻蝙蝠弓箭手", 186)]
  }),
  gefenia: createRoute({
    group: "经典地下城", npc: "葛帔尼亚", map: "gefenia01", x: 37, y: 103, restriction: "任务前置",
    monsters: [monster(1203, "弑神者", 130), monster(1219, "深渊骑士", 122)]
  }),
  amatsuDungeon: createRoute({
    group: "经典地下城", npc: "天津町地下神社", map: "ama_dun01", x: 232, y: 144,
    monsters: [monster(1401, "火忍西怒毕", 95), monster(1403, "武士火枪兵", 88)]
  }),
  kunlunDungeon: createRoute({
    group: "经典地下城", npc: "昆仑神殿", map: "gonryun", x: 159, y: 201, monsterMap: "gon_dun01",
    monsters: [monster(1408, "血蝴蝶", 94), monster(2883, "迅捷血蝴蝶", 94)]
  }),
  louyangDungeon: createRoute({
    group: "经典地下城", npc: "龙之城王陵", map: "louyang", x: 37, y: 271, monsterMap: "lou_dun01",
    monsters: [monster(1306, "狂暴大脚熊", 118), monster(1516, "米糕", 83)]
  }),
  ayothayaDungeon: createRoute({
    group: "经典地下城", npc: "哎哟泰雅古代神殿", map: "ayo_dun01", x: 275, y: 18,
    monsters: [monster(1587, "克莱本", 70), monster(1586, "群叶猫", 64)]
  }),
  moscoviaDungeon: createRoute({
    group: "经典地下城", npc: "莫斯科比亚森林洞窟", map: "mosk_dun01", x: 189, y: 45,
    monsters: [monster(1881, "雷斯", 82), monster(1880, "枯树精", 81)]
  }),
  niflheimDungeon: createRoute({
    group: "经典地下城", npc: "尼芙菲姆死者之城", map: "niflheim", x: 149, y: 124, monsterMap: "nif_dun01", restriction: "任务前置",
    monsters: [monster(20935, "Gan Ceann", 215), monster(20937, "Brutal Murderer", 214)]
  }),
  yggdrasil: createRoute({
    group: "经典地下城", npc: "天地树叶树干", map: "yggdrasil01", x: 249, y: 262,
    monsters: [monster(1083, "光芒草", 1), monster(1079, "蓝草", 1)]
  }),

  abyssLake: createRoute({
    group: "地区与扩展地下城", npc: "深渊湖水洞穴", map: "abyss_01", x: 25, y: 30,
    monsters: [monster(1714, "红贝勒斯", 126), monster(1717, "绿贝勒斯", 126)]
  }),
  iceDungeon: createRoute({
    group: "地区与扩展地下城", npc: "冰洞窟", map: "ra_fild01", x: 233, y: 333, monsterMap: "ice_dun01",
    monsters: [monster(1778, "寒冰雕像", 106), monster(1780, "邪恶噬人花", 105)]
  }),
  noggRoad: createRoute({
    group: "地区与扩展地下城", npc: "诺可罗德洞窟", map: "yuno_fild03", x: 32, y: 139, monsterMap: "mag_dun01",
    monsters: [monster(1366, "熔岩巨石", 103), monster(1367, "火焰妖", 101)]
  }),
  einbechMine: createRoute({
    group: "地区与扩展地下城", npc: "艾音贝赫矿山", map: "einbech", x: 138, y: 252, monsterMap: "ein_dun01",
    monsters: [monster(1618, "温古力安特", 94), monster(1617, "废铁暖炉", 92)]
  }),
  juperos: createRoute({
    group: "地区与扩展地下城", npc: "优配擂斯废墟", map: "yuno_fild07", x: 207, y: 175, monsterMap: "juperos_01",
    monsters: [monster(1670, "暴风迪靡克", 116), monster(1671, "冰冻迪靡克", 116)]
  }),
  kielDungeon: createRoute({
    group: "地区与扩展地下城", npc: "机械娃娃工厂", map: "kh_dun01", x: 13, y: 12, restriction: "任务前置",
    monsters: [monster(1735, "爱丽削", 115), monster(1736, "爱丽俄", 112)]
  }),
  bioLab: createRoute({
    group: "地区与扩展地下城", npc: "生命体研究所", map: "lhz_dun01", x: 281, y: 154, restriction: "任务前置",
    monsters: [monster(1652, "暗●剑士", 136), monster(1656, "暗●弓箭手", 135)]
  }),
  tombFallen: createRoute({
    group: "地区与扩展地下城", npc: "战死者之墓", map: "lhz_dun_n", x: 20, y: 20, restriction: "任务前置",
    monsters: [monster(3208, "暗●十字切割者", 179), monster(3211, "暗●游侠", 179)]
  }),
  thorVolcano: createRoute({
    group: "地区与扩展地下城", npc: "图尔火山", map: "ve_fild03", x: 168, y: 240, monsterMap: "thor_v01",
    monsters: [monster(1831, "熔岩蜥蜴", 138), monster(1833, "不死鸟", 135)]
  }),
  rachelSanctuary: createRoute({
    group: "地区与扩展地下城", npc: "拉赫神殿圣域", map: "ra_san01", x: 20, y: 20, restriction: "任务前置",
    monsters: [monster(1772, "依斯拉", 124), monster(1771, "凡贝尔克", 123)]
  }),
  thanatosTower: createRoute({
    group: "地区与扩展地下城", npc: "达纳托斯之塔", map: "tha_t01", x: 149, y: 224, restriction: "任务前置",
    monsters: [monster(1703, "慰劳者", 123), monster(1695, "绿色等离子体", 116)]
  }),
  odinTemple: createRoute({
    group: "地区与扩展地下城", npc: "奥丁神殿", map: "odin_tem01", x: 373, y: 182,
    monsters: [monster(1753, "彩妆皮影魔", 128), monster(1752, "皮影魔", 126)]
  }),
  namelessIsland: createRoute({
    group: "地区与扩展地下城", npc: "无名岛修道院", map: "nameless_n", x: 157, y: 184, monsterMap: "abbey01", restriction: "船夫/任务前置",
    monsters: [monster(1867, "女妖", 130), monster(2887, "迅捷女妖", 130)]
  }),
  brasilisDungeon: createRoute({
    group: "地区与扩展地下城", npc: "巴西瀑布洞穴", map: "bra_dun01", x: 20, y: 20,
    monsters: [monster(2069, "亚拉", 79), monster(2070, "食人鱼", 75)]
  }),
  dewataDungeon: createRoute({
    group: "地区与扩展地下城", npc: "德瓦他火山岛", map: "dew_dun01", x: 20, y: 20,
    monsters: [monster(1305, "狂暴蜈蚣", 121), monster(1311, "狂暴野猪", 120)]
  }),
  scarabaHole: createRoute({
    group: "地区与扩展地下城", npc: "斯卡拉巴洞穴", map: "dic_fild01", x: 24, y: 79, monsterMap: "dic_dun01", restriction: "任务前置",
    monsters: [monster(2084, "双角甲虫", 134), monster(2083, "独角甲虫", 130)]
  }),
  eclageTower: createRoute({
    group: "地区与扩展地下城", npc: "彩虹桥高塔", map: "ecl_fild01", x: 182, y: 82, monsterMap: "ecl_tdun01", restriction: "任务前置",
    monsters: [monster(2367, "元素鬼火(蓝)", 149), monster(2366, "古灵精怪书", 148)]
  }),
  malangdo: createRoute({
    group: "地区与扩展地下城", npc: "马来港星光珊瑚", map: "malangdo", x: 73, y: 239, monsterMap: "mal_dun01",
    monsters: [monster(2208, "野猫骑士", 95), monster(2197, "红海星", 91)]
  }),
  nightmareHospital: createRoute({
    group: "地区与扩展地下城", npc: "噩梦医院", map: "ma_dun01", x: 147, y: 10, restriction: "副本/任务前置",
    monsters: [monster(2315, "食尸鬼", 111), monster(2311, "玛那能革", 107)]
  }),
  nidhoggurNest: createRoute({
    group: "地区与扩展地下城", npc: "尼德霍格之巢", map: "nyd_dun01", x: 20, y: 20, restriction: "副本/任务前置",
    monsters: [monster(2018, "杜内尔", 135), monster(2017, "拉塔", 131)]
  }),
  moroVolcano: createRoute({
    group: "地区与扩展地下城", npc: "梦罗克火焰盆地", map: "moro_vol", x: 165, y: 165, restriction: "任务前置",
    monsters: [monster(3027, "火蚁", 150), monster(3023, "火焰巨石怪", 148)]
  }),
  rockridge: createRoute({
    group: "地区与扩展地下城", npc: "洛克里奇矿山", map: "rockrdg2", x: 304, y: 350, monsterMap: "rockmi1",
    monsters: [monster(3741, "蜘蛛战车", 158), monster(3749, "精英弯刀草寇", 152)]
  }),
  verusLab: createRoute({
    group: "地区与扩展地下城", npc: "维尔纳研究所", map: "slabw01", x: 14, y: 88, restriction: "任务前置",
    monsters: [monster(3633, "剧毒凯美拉", 110), monster(3631, "人类型凯美拉", 100)]
  }),
  rudus: createRoute({
    group: "地区与扩展地下城", npc: "鲁杜斯实验体废弃场", map: "ein_fild05", x: 158, y: 289, monsterMap: "sp_rudus", restriction: "任务前置",
    monsters: [monster(20365, "双头卡夫特", 125), monster(20363, "贝纳姆", 123)]
  }),
  amicitia: createRoute({
    group: "地区与扩展地下城", npc: "阿米希提亚", map: "ein_fild08", x: 152, y: 95, monsterMap: "amicitia1", restriction: "Lv230/任务前置",
    monsters: [monster(20927, "Vanilaqus", 230), monster(20926, "Fillia", 229)]
  }),

  barmundWarehouseUpper: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·塔尔塔罗斯储藏室上层", map: "ba_2whs01", x: 156, y: 32, restriction: "任务前置",
    monsters: [monster(20639, "故障的警卫型α", 186), monster(20682, "邪心猎人侦察兵", 176)]
  }),
  barmundWarehouseLower: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·塔尔塔罗斯储藏室下层", map: "ba_2whs02", x: 337, y: 337, restriction: "任务前置",
    monsters: [monster(20637, "故障的仓管", 185), monster(20639, "故障的警卫型α", 186)]
  }),
  barmundBath: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·冥想大浴池", map: "ba_bath", x: 159, y: 26, restriction: "任务前置",
    monsters: [monster(20634, "故障的搓澡师", 144), monster(20633, "故障的搓澡师", 143)]
  }),
  barmundLibrary: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·图书馆记忆回廊", map: "ba_lib", x: 159, y: 4, restriction: "任务前置",
    monsters: [monster(20630, "故障的β", 145), monster(20684, "流浪魔法书", 144)]
  }),
  barmundPowerPlant1: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·第一魔力发电厂", map: "ba_pw01", x: 91, y: 288, restriction: "任务前置",
    monsters: [monster(20630, "故障的β", 145), monster(20689, "魔瘾朵洛尔", 145)]
  }),
  barmundWaterTreatment: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·污水处理厂", map: "ba_pw02", x: 10, y: 149, restriction: "任务前置",
    monsters: [monster(20685, "下水道贝纳姆", 142), monster(20688, "菁英贝拉雷", 143)]
  }),
  barmundPowerPlant2: createRoute({
    group: "高等级与剧情区域", npc: "巴蒙德·第二魔力发电厂", map: "ba_pw03", x: 13, y: 115, restriction: "任务前置",
    monsters: [monster(20692, "魔瘾萨纳雷", 194), monster(20693, "强大魔力", 193)]
  }),
  hallOfLife: createRoute({
    group: "高等级与剧情区域", npc: "生命殿堂", map: "for_dun01", x: 20, y: 20, restriction: "任务前置", staticMonsterData: true,
    monsters: [monster(22192, "地之精灵", 262), monster(22196, "火焰精灵", 263)]
  }),
  ozLabyrinth: createRoute({
    group: "高等级与剧情区域", npc: "奥兹迷宫", map: "oz_dun01", x: 112, y: 34, restriction: "任务前置", staticMonsterData: true,
    monsters: [monster(21296, "Rake Hand", 177), monster(21295, "Ash Toad", 179)]
  }),
  pronteraPrison: createRoute({
    group: "高等级与剧情区域", npc: "普隆德拉地下监狱", map: "prt_prison", x: 160, y: 290, restriction: "任务前置",
    monsters: [monster(3443, "塔皮", 145), monster(3444, "观察者", 145)]
  }),
  invadedProntera: createRoute({
    group: "高等级与剧情区域", npc: "被侵略的普隆德拉", map: "prt_q", x: 155, y: 354, restriction: "任务前置",
    monsters: [monster(3741, "蜘蛛战车", 158), monster(3749, "精英弯刀草寇", 152)]
  })
});
