# LASTRO 汉化核对表

由 node scripts/audit-localization.mjs 生成。统计范围为本地源代码和资源，不能代替登录游戏后的显示验证。

| 项目 | 数量 / 状态 |
| --- | --- |
| 技能条目（运行时与中文资源并集） | 1444 |
| 技能名称中文覆盖 | 1443 |
| 保留技能代号 | 1（S.B.R.44） |
| 本轮补充的本地译名 | 192（非官方地区译名声明） |
| 待翻译技能名称 | 0 |
| 现有 GBK 技能说明条目 | 1149 |
| 职业名称覆盖规则 | 86 |
| 界面文字替换规则 | 355 |

## 验证边界与修正

- 中文资源使用 GBK 编码；UTF-8 读取产生的替换符不代表源文件损坏。
- 技能名称覆盖运行时默认表和 Lua 加载后的表；技能数值、资源名、技能 ID 保持来源数据。
- 修复 Lua 表提前通知完成的问题，说明读取后才继续加载技能信息；错误路径也会结束等待。
- 技能说明保留源表文本、颜色代码与数值，未宣称全部重新人工翻译。
- 掉落提示右侧定位、快捷栏字号保留此前修改；实际游戏不同分辨率仍需视觉复核。应用名称的本地区分修改不纳入本次 PR。
- Zeny、Base、Job、EXP、HP、SP、属性缩写保留。
- 安装的 IWA 是否加载此版本尚待游戏端核对；普通 localhost 标签页不具备 Direct TCP，刷新不保证安装包更新。
- 已运行异步加载成功/读取失败/Lua失败/解析失败/回调失败测试，确认清理后只通知完成一次。静态中文存在测试不能证明游戏画面已更新。
- 既有实现修正：苍鹰/鸮枭名称对应修复；天使之护与天使之障壁区分；消息表已知英文同样翻译；自动战斗技能下拉框优先采用本地技能名。
- 隔离布局预览：使用实际生成 CSS/模板，在 805×906 视口验证 36 个技能栏数字无跨行溢出，4 行高度均为 34px，掉落提示右侧边距约 24px。测试图标为方块，不代表实战纹理验证。
- 职业汉化仅作用于显示标签；JobNameTable、PalNameTable、WeaponJobTable 保持原生资源名，避免角色身体、武器或调色板加载失败。
- 本表不固化测试数量；以提交时的 PR 验证记录为准。Windows 环境需注意符号链接权限、目录排序及测试中硬编码的 /tmp 路径，不能把这些失败报告为全量通过。

## 复核命令

- node scripts/audit-localization.mjs：重新生成本表，检查源表新增条目。
- node scripts/preview-localization.mjs：生成隔离布局预览；开发服务启动后访问 /generated/localization-preview.html。
- pnpm exec vitest run test/localization-behavior.test.ts test/v2-runtime-patch.test.ts test/manifest.test.ts：执行汉化、加载顺序与既有修改测试。

## 技能明细

| 技能常量 | 运行时原文 | 当前中文名称 | 名称状态 | 说明状态 |
| --- | --- | --- | --- | --- |
| ABC_ABYSS_DAGGER | Abyss Dagger | 深渊短剑 | 本地译名，待用户校订 | 源表无说明 |
| ABC_ABYSS_SLAYER | Abyss Slayer | 深渊杀戮者 | 本地译名，待用户校订 | 源表无说明 |
| ABC_ABYSS_SQUARE | Abyss Square | 深渊领域 | 本地译名，待用户校订 | 源表无说明 |
| ABC_ABYSS_STRIKE | Omega Abyss Strike | 终极深渊打击 | 本地译名，待用户校订 | 源表无说明 |
| ABC_CHAIN_REACTION_SHOT | Chain Reaction Shot | 连锁反应射击 | 本地译名，待用户校订 | 源表无说明 |
| ABC_DAGGER_AND_BOW_M | Dagger Bow Mastery | 短剑与弓修炼 | 本地译名，待用户校订 | 源表无说明 |
| ABC_DEFT_STAB | Deft Stab | 灵巧刺击 | 本地译名，待用户校订 | 源表无说明 |
| ABC_FRENZY_SHOT | Frenzy Shot | 狂乱射击 | 本地译名，待用户校订 | 源表无说明 |
| ABC_FROM_THE_ABYSS | From the Abyss | 来自深渊 | 本地译名，待用户校订 | 源表无说明 |
| ABC_MAGIC_SWORD_M | Magic Sword Mastery | 魔剑修炼 | 本地译名，待用户校订 | 源表无说明 |
| ABC_STRIP_SHADOW | Divest Shadow | 卸除影子装备 | 本地译名，待用户校订 | 源表无说明 |
| ABC_UNLUCKY_RUSH | Misfortune Rush | 厄运突袭 | 本地译名，待用户校订 | 源表无说明 |
| ABR_BATTLE_BUSTER | Battle Buster | 战斗破坏炮 | 本地译名，待用户校订 | 源表无说明 |
| ABR_DUAL_CANNON_FIRE | Dual Cannon Fire | 双炮射击 | 本地译名，待用户校订 | 源表无说明 |
| ABR_INFINITY_BUSTER | Infinity Buster | 无限破坏炮 | 本地译名，待用户校订 | 源表无说明 |
| ABR_NET_REPAIR | Net Repair | 网络修复 | 本地译名，待用户校订 | 源表无说明 |
| ABR_NET_SUPPORT | Net Support | 网络支援 | 本地译名，待用户校订 | 源表无说明 |
| AB_ADORAMUS | Adoramus | 讴歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_ANCILLA | Ancilla | 安希拉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_CANTO | Cantocandidus | 纯白百合花 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_CHEAL | Coluseo Heal | 灿烂圣光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_CLEARANCE | Clearance | 解除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_CLEMENTIA | Clementia | 慈悲术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_CONVENIO | Convenio | 集结 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_DUPLELIGHT | Duple Light | 二道圣光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_DUPLELIGHT_MAGIC | Duple Magic | 二道圣光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_DUPLELIGHT_MELEE | Duple Strike | 二道圣光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_EPICLESIS | Epiclesis | 圣灵降临祈祷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_EUCHARISTICA | Eucharistica | 感恩祈祷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_EXPIATIO | Expiatio | 赎罪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_HIGHNESSHEAL | High Heal | 高阶治愈术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_JUDEX | Judex | 审判 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_LAUDAAGNUS | Lauda Agnus | 羔羊歌颂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_LAUDARAMUS | Lauda Ramus | 折枝赞颂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_OFFERTORIUM | Offertorium | 奉献颂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_ORATIO | Oratio | 祈祷文 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_PRAEFATIO | Praefatio | 感恩歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_RENOVATIO | Renovatio | 净化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_SECRAMENT | Sacrament | 圣典 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_SILENTIUM | Silentium | 静寂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AB_VITUPERATUM | Vituperatum | 天罚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_CHARGEARROW | Arrow Repel | 冲锋箭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_CONCENTRATION | Improve Concentration | 心神凝聚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_DOUBLE | Double Strafe | 二连矢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_MAKINGARROW | Arrow Crafting | 制作箭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_OWL | Owl's Eye | 鸮枭之眼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_SHOWER | Arrow Shower | 箭雨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AC_VULTURE | Vulture's Eye | 苍鹰之眼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AG_ALL_BLOOM | All Bloom | 万物绽放 | 本地译名，待用户校订 | 源表无说明 |
| AG_ASTRAL_STRIKE | Astral Strike | 星界打击 | 本地译名，待用户校订 | 源表无说明 |
| AG_CLIMAX | Climax | 魔力巅峰 | 本地译名，待用户校订 | 源表无说明 |
| AG_CRIMSON_ARROW | Crimson Arrow | 绯红之箭 | 本地译名，待用户校订 | 源表无说明 |
| AG_CRYSTAL_IMPACT | Crystal Impact | 水晶冲击 | 本地译名，待用户校订 | 源表无说明 |
| AG_DEADLY_PROJECTION | Deadly Projection | 致命投射 | 本地译名，待用户校订 | 源表无说明 |
| AG_DESTRUCTIVE_HURRICANE | Destructive Hurricane | 毁灭飓风 | 本地译名，待用户校订 | 源表无说明 |
| AG_FLORAL_FLARE_ROAD | Floral Flare Road | 花焰之路 | 本地译名，待用户校订 | 源表无说明 |
| AG_FROZEN_SLASH | Frozen Slash | 冰冻斩击 | 本地译名，待用户校订 | 源表无说明 |
| AG_MYSTERY_ILLUSION | Mystery Illusion | 神秘幻象 | 本地译名，待用户校订 | 源表无说明 |
| AG_RAIN_OF_CRYSTAL | Crystal Rain | 水晶之雨 | 本地译名，待用户校订 | 源表无说明 |
| AG_ROCK_DOWN | Rock Down | 落岩 | 本地译名，待用户校订 | 源表无说明 |
| AG_SOUL_VC_STRIKE | Soul Vulcan Strike | 灵魂连击 | 本地译名，待用户校订 | 源表无说明 |
| AG_STORM_CANNON | Storm Cannon | 风暴炮 | 本地译名，待用户校订 | 源表无说明 |
| AG_STRANTUM_TREMOR | Stratum Tremor | 地层震颤 | 本地译名，待用户校订 | 源表无说明 |
| AG_TORNADO_STORM | Tornado Storm | 龙卷风暴 | 本地译名，待用户校订 | 源表无说明 |
| AG_TWOHANDSTAFF | Two-handed Staff Mastery | 双手杖修炼 | 本地译名，待用户校订 | 源表无说明 |
| AG_VIOLENT_QUAKE | Violent Quake | 猛烈地震 | 本地译名，待用户校订 | 源表无说明 |
| ALL_ANGEL_PROTECT | Thank You So Much!! | 感谢您! | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_BUYING_STORE | Open Buying Store | 开设购买商店(BUYING STORE) | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_CATCRY | Monster's Cry | 怪兽的咆哮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_DREAM_SUMMERNIGHT | Summer Dream | 仲夏夜之梦 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_FULL_THROTTLE | Full Throttle | 烈火战车 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_GUARDIAN_RECALL | Call of Guardian | 守护者的召唤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_INCCARRY | Increase Capacity | 负重量上升R | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_NIFLHEIM_RECALL | The World of the Dead! | 前往尼芙菲姆! | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_ODINS_POWER | Power of Odin | 奥丁之神力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_ODINS_RECALL | Call of Odin | 奥丁的召唤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_PARTYFLEE | Blowing Wind !! | 吹吧! 花风!! | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_PRONTERA_RECALL | Prontera Recall | 返回普隆德拉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_RAY_OF_PROTECTION | ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶ÃƒÆ’Ã‹â€\xA0Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã¢â‚¬Â¡Ãƒâ€šÃ‚Â\xA0ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â»  | 守护之光 | 中文资源/已校订覆盖 | 源表无说明 |
| ALL_RESURRECTION | Resurrection | 复活术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_REVERSEORCISH | Reverse Orcish | 变成兽人面孔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_TIMEIN | Time | 准时 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ALL_WEWISH | Sing along with the Singing Crystal's tune: | 跟随歌唱水晶合唱 | 本地译名，待用户校订 | 已有GBK说明，待游戏复核 |
| AL_ANGELUS | Angelus | 天使之障壁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_BLESSING | Blessing | 天使之赐福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_CRUCIS | Signum Crucis | 天使之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_CURE | Cure | 复原术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_DECAGI | Decrease Agility | 缓速术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_DEMONBANE | Demon Bane | 天使之击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_DP | Divine Protection | 天使之护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_HEAL | Heal | 治愈术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_HOLYLIGHT | Holy Light | 神圣之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_HOLYWATER | Aqua Benedicta | 天使之泪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_INCAGI | Increase Agility | 加速术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_PNEUMA | Pneuma | 光之障壁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_RUWACH | Ruwach | 光猎 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_TELEPORT | Teleport | 瞬间移动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AL_WARP | Warp Portal | 传送之阵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_ACIDTERROR | Acid Terror | 强酸攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_AXEMASTERY | Axe Mastery | 斧头使用熟练度 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_BERSERKPITCHER | Aid Berserk Potion | 菠色克投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_BIOETHICS | Bioethics | 生命伦理 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_BIOTECHNOLOGY | Biotechnology | 生命工学研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CALLHOMUN | Call Homunculus | 生命体召唤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CANNIBALIZE | Summon Flora | 生物调拨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CP_ARMOR | Synthetic Armor | 化学铠甲保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CP_HELM | Biochemical Helm | 化学头盔保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CP_SHIELD | Synthesized Shield | 化学盾牌保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CP_WEAPON | Alchemical Weapon | 化学武器保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CREATECREATURE | Creature Creation | 生命体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_CULTIVATION | Cultivation | 培养 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_DEMONSTRATION | Bomb | 火烟瓶投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_DRILLMASTER | Drillmaster | 攻击力训练 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_FLAMECONTROL | Flame Control | 火焰控制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_HEALHOMUN | Heal Homunculus | 治愈生命体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_LEARNINGPOTION | Potion Research | 知识药水 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_PHARMACY | Prepare Potion | 配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_POTIONPITCHER | Aid Potion | 药水投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_REST | Vaporize | 安息 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_RESURRECTHOMUN | Homunculus Resurrection | 复活生命体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_SPHEREMINE | Summon Marine Sphere | 气泡虫召唤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_TWILIGHT1 | Spiritual Potion Creation 1 | 宽广配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_TWILIGHT2 | Spiritual Potion Creation 2 | 宽广配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_TWILIGHT3 | Spiritual Potion Creation 3 | 宽广配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AM_TWILIGHT4 | Spiritual Potion Creation 4 | 宽广配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ASC_BREAKER | Soul Destroyer | 心灵震波 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ASC_CDP | Create Deadly Poison | 毒液制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ASC_EDP | Enchant Deadly Poison | 致命涂毒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ASC_KATAR | Advanced Katar Mastery | 高阶拳刃修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ASC_METEORASSAULT | Meteor Assault | 黑暗瞬间 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_CLOAKING | Cloaking | 伪装 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_ENCHANTPOISON | Enchant Poison | 涂毒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_GRIMTOOTH | Grimtooth | 无影之牙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_KATAR | Katar Mastery | 拳刃修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_LEFT | Lefthand Mastery | 左手修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_POISONREACT | Poison React | 毒性反弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_RIGHT | Righthand Mastery | 右手修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_SONICACCEL | Sonic Acceleration | 超音速投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_SONICBLOW | Sonic Blow | 音速投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_SPLASHER | Venom Splasher | 毒性感染 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_VENOMDUST | Venom Dust | 病毒散拨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| AS_VENOMKNIFE | Venom Knife | 毒刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_APPLEIDUN | Song of Lutie | 伊登的苹果 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_ASSASSINCROSS | Impressive Riff | 刺客的黄昏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_DISSONANCE | Unchained Serenade | 不协和音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_FROSTJOKE | Unbarring Octave | 冷笑话 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_MUSICALLESSON | Music Lessons | 操控乐器 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_MUSICALSTRIKE | Melody Strike | 乐器攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_PANGVOICE | Pang Voice | 阵痛之声 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_POEMBRAGI | Magic Strings | 布莱奇之诗 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BA_POEMBRAGI2 | Magic Strings | 布莱奇之诗 | 中文资源/已校订覆盖 | 源表无说明 |
| BA_WHISTLE | Perfect Tablature | 吹口哨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_ADAPTATION | Amp | 临机应变 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_DRUMBATTLEFIELD | Battle Theme | 战鼓震天 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_ENCORE | Encore | 安可 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_ETERNALCHAOS | Down Tempo | 永远的混沌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_INTOABYSS | Power Cord | 触媒之所 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_LULLABY | Lullaby | 摇篮曲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_RAGNAROK | Ragnarok | 仙境传说 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_RICHMANKIM | Mental Sensing | 经验值倍增 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_RINGNIBELUNGEN | Harmonic Lick | 尼贝隆根之戒指 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_ROKISWEIL | Classical Pluck | 洛奇的悲鸣 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BD_SIEGFRIED | Acoustic Rhythm | 不死神齐格弗里德 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BO_ACIDIFIED_ZONE_FIRE | Acidified Zone (Fire) | 酸化领域（火） | 本地译名，待用户校订 | 源表无说明 |
| BO_ACIDIFIED_ZONE_GROUND | Acidified Zone (Earth) | 酸化领域（地） | 本地译名，待用户校订 | 源表无说明 |
| BO_ACIDIFIED_ZONE_WATER | Acidified Zone (Water) | 酸化领域（水） | 本地译名，待用户校订 | 源表无说明 |
| BO_ACIDIFIED_ZONE_WIND | Acidified Zone (Wind) | 酸化领域（风） | 本地译名，待用户校订 | 源表无说明 |
| BO_ADVANCE_PROTECTION | Full Shadow Protection | 全面影子装备保护 | 本地译名，待用户校订 | 源表无说明 |
| BO_BIONICS_M | Bionics Mastery | 仿生学修炼 | 本地译名，待用户校订 | 源表无说明 |
| BO_BIONIC_PHARMACY | Bionic Pharmacy | 仿生制药 | 本地译名，待用户校订 | 源表无说明 |
| BO_CREEPER | Create Creeper | 制造蔓藤 | 本地译名，待用户校订 | 源表无说明 |
| BO_HELLTREE | Create Hell Tree | 制造地狱树 | 本地译名，待用户校订 | 源表无说明 |
| BO_RESEARCHREPORT | Research Report | 研究报告 | 本地译名，待用户校订 | 源表无说明 |
| BO_THE_WHOLE_PROTECTION | Group Protection | 群体保护 | 本地译名，待用户校订 | 源表无说明 |
| BO_WOODENWARRIOR | Create Wooden Warrior | 制造木制战士 | 本地译名，待用户校订 | 源表无说明 |
| BO_WOODEN_FAIRY | Create Wooden Fairy | 制造木精灵 | 本地译名，待用户校订 | 源表无说明 |
| BS_ADRENALINE | Adrenaline Rush | 速度激发 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_ADRENALINE2 | Advanced Adrenaline Rush | 所有速度激发 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_AXE | Smith Axe | 斧头制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_DAGGER | Smith Dagger | 短剑制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_ENCHANTEDSTONE | Enchanted Stone Craft | 属性石制造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_FINDINGORE | Ore Discovery | 寻找矿石 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_GREED | Greed | 贪婪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_HAMMERFALL | Hammerfall | 大地之击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_HILTBINDING | Hilt Binding | 武器保有 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_IRON | Iron Tempering | 铁制造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_KNUCKLE | Smith Brass Knuckle | 拳套制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_MACE | Smith Mace | 钝器制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_MAXIMIZE | Maximize Power | 极限攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_ORIDEOCON | Research Oridecon | 神之金属研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_OVERTHRUST | Power Thrust | 凶砍 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_REPAIRWEAPON | Repair Weapon | 武器修理 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_SKINTEMPER | Skin Tempering | 强化火属性 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_SPEAR | Smith Spear | 长矛制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_STEEL | Steel Tempering | 钢制造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_SWORD | Smith Sword | 剑制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_TWOHANDSWORD | Smith Two-handed Sword | 双手剑制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_UNFAIRLYTRICK | Dubious Salesmanship | 诡计的商术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_WEAPONPERFECT | Weapon Perfection | 无视体型攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| BS_WEAPONRESEARCH | Weaponry Research | 武器研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CD_ARBITRIUM | Arbitrium | 裁决 | 本地译名，待用户校订 | 源表无说明 |
| CD_ARGUTUS_TELUM | Argutus Telum | 锐利武器 | 本地译名，待用户校订 | 源表无说明 |
| CD_ARGUTUS_VITA | Argutus Vita | 敏锐生命 | 本地译名，待用户校订 | 源表无说明 |
| CD_BENEDICTUM | Benedictum | 祝福 | 本地译名，待用户校订 | 源表无说明 |
| CD_COMPETENTIA | Competentia | 赋能 | 本地译名，待用户校订 | 源表无说明 |
| CD_DILECTIO_HEAL | Dilectio Heal | 慈爱治愈 | 本地译名，待用户校订 | 源表无说明 |
| CD_EFFLIGO | Effligo | 神圣打击 | 本地译名，待用户校订 | 源表无说明 |
| CD_FIDUS_ANIMUS | Fidus Animus | 忠诚之心 | 本地译名，待用户校订 | 源表无说明 |
| CD_FRAMEN | Flamen | 圣焰 | 本地译名，待用户校订 | 源表无说明 |
| CD_MACE_BOOK_M | Mace Book Mastery | 钝器与书修炼 | 本地译名，待用户校订 | 源表无说明 |
| CD_MEDIALE_VOTUM | Mediale Votum | 祈愿 | 本地译名，待用户校订 | 源表无说明 |
| CD_PETITIO | Petitio | 祈求 | 本地译名，待用户校订 | 源表无说明 |
| CD_PNEUMATICUS_PROCELLA | Pneumaticus Procella | 圣灵风暴 | 本地译名，待用户校订 | 源表无说明 |
| CD_PRESENS_ACIES | Presens Acies | 洞察 | 本地译名，待用户校订 | 源表无说明 |
| CD_RELIGIO | Religio | 信仰 | 本地译名，待用户校订 | 源表无说明 |
| CD_REPARATIO | Repatatio | 复苏 | 本地译名，待用户校订 | 源表无说明 |
| CG_ARROWVULCAN | Arrow Vulcan | 奥义箭乱舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CG_HERMODE | Hermode's Rod | 海罗默德的手杖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CG_LONGINGFREEDOM | Longing for Freedom | 不要拘束我 | 中文资源/已校订覆盖 | 源表无说明 |
| CG_MARIONETTE | Marionette Control | 傀儡师的把戏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CG_MOONLIT | Sheltering Bliss | 落花伴着月光下的水车小屋 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CG_SPECIALSINGER | Skilled Special Singer | 职业演奏家 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CG_TAROTCARD | Tarot Card of Fate | 命运的塔罗牌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CH_CHAINCRUSH | Chain Crush Combo | 气绝崩击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CH_PALMSTRIKE | Raging Palm Strike | 猛虎硬爬山 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CH_SOULCOLLECT | Zen | 狂蓄气 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CH_TIGERFIST | Glacier Fist | 伏虎拳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_ACIDDEMONSTRATION | Acid Bomb | 强酸火烟瓶投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_ALCHEMY | Alchemy | 融合试验 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_AUTOGUARD | Guard | 自动防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_CULTIVATION | Cultivate Plant | 植物栽培 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_DEFENDER | Defending Aura | 光之盾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_DEVOTION | Sacrifice | 牺牲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_FULLPROTECTION | Full Chemical Protection | 所有化学武器保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_GRANDCROSS | Grand Cross | 圣十字审判 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_HOLYCROSS | Holy Cross | 圣十字攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_PROVIDENCE | Resistant Souls | 神佑之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_REFLECTSHIELD | Shield Reflect | 反射盾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SHIELDBOOMERANG | Shield Boomerang | 回旋盾击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SHIELDCHARGE | Smite | 盾击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SHRINK | Shrink | 退缩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SLIMPITCHER | Aid Condensed Potion | 纤细药水投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SPEARQUICKEN | Spear Quicken | 长矛加速术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_SYNTHESISPOTION | Potion Synthesis | 药剂试验 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| CR_TRUST | Faith | 信任 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_ACCESSORYMIX | Accessory mix | <黑暗搜集者>组装 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_BLACK | Black | <黑暗搜集者>宝石魔法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_CARTSWING | Cart Swing | <黑暗搜集者>魔法手推车冲撞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_CLOUD | Cloud | <黑暗搜集者>暗云 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_CONTRACT | Contract | <黑暗搜集者>宝石契约 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_COPY | Copy | <黑暗搜集者>复制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_CRUSH | Crush | <黑暗搜集者>冲撞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_CRYSTAL | Crystal | <黑暗搜集者>暴击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_DARKPOWER | Dark Power | 黑暗灵魂之力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_DREAM | Dream | <黑暗搜集者>宝石之梦 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_EARPLUG | Earplug | <黑暗搜集者>耳塞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_EDARKNESS | Eternal Darkness | <黑暗搜集者>华丽金属黑暗 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_EGUARDIAN | Guardian | <黑暗搜集者>华丽金属守卫 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_ENERGY | Energy | <黑暗搜集者>能量 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_EXP | Experience | <黑暗搜集者>经验值 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_EXPLOSION | Explosion | <黑暗搜集者>变形 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_FIRSTSLOT | First Slot | <黑暗搜集者>最初幻想 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_HEADDEF | Head Defense | <黑暗搜集者>头部防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_ILLUSION | Illusion | <黑暗搜集者>幻觉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_ITEMREBUILD | Item Rebuild | <黑暗搜集者>物品重组 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_JOBCHANGE | Job Change | <黑暗搜集者>新手更换职业 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_MAGICCART | Magic Cart | <黑暗搜集者>魔法手推车 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_NUETRALIZE | Neutralize | <黑暗搜集者>中和 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_REBUILD | Rebuild | <黑暗搜集者>人体重建 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_REVENGE | Revenge | <黑暗搜集者>复仇 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_REWARD | Reward | <黑暗搜集者>奖励 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_RUNNER | Runner | <黑暗搜集者>奔跑 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_SPACE | Space | <黑暗搜集者>暮光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_TIMEOUT | Time Out | <黑暗搜集者>超时 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_TRANSFER | Transfer | <黑暗搜集者>转移 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_TRANSFORM | Transform | <黑暗搜集者>变形 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_WALL | Wall | <黑暗搜集者>墙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DA_ZENYRANK | Zeny Rank | <黑暗搜集者>排列 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_DANCINGLESSON | Dance Lessons | 练习舞蹈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_DONTFORGETME | Slow Grace | 勿忘我 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_FORTUNEKISS | Lady Luck | 女神之吻 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_FORTUNEKISS2 | Lady Luck | 女神之吻 | 中文资源/已校订覆盖 | 源表无说明 |
| DC_HUMMING | Focus Ballet | 哼唱之音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_SCREAM | Dazzler | 惊声尖叫 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_SERVICEFORYOU | Gypsy's Kiss | 为您服务 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_THROWARROW | Slinging Arrow | 缠箭投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_UGLYDANCE | Hip Shaker | 丑陋之舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DC_WINKCHARM | Charming Wink | 眨眼之诱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_ACCEL | Acceleration | <死亡骑士>加速 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_AURA | Aura | <死亡骑士>灵气 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_BERSERKAIZER | Berserk Kaizer | 狂暴化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_BLOCKDOUBLE | Double Block | <死亡骑士>双重防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_BLOCKFAR | Far Black | <死亡骑士>远程防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_BLOCKMELEE | Melee Block | <死亡骑士>近身防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_CHANGEATTACK | Change Attack | <死亡骑士>转换攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_COIL | Coil | <死亡骑士>缠绕 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_DANGERATTACK | Dangerous Attack | <死亡骑士>威胁攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_ENERGY | Energy | <死亡骑士>能量 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_FREEZER | Freezer | <死亡骑士>冻结 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_FRONTATTACK | Front Attack | <死亡骑士>前方攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_GAUGE | Gauge | <死亡骑士>领域 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_GKILL | G Kill | <死亡骑士>死亡冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_GPAIN | G Pain | 死亡骑士<痛苦冲击> | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_GSKILL | G Skill | <死亡骑士>技能冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_GTIME | G Time | <死亡骑士>时间冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_INSTANT | Instant | <死亡骑士>紧急屏障 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_NIGHTMARE | Nightmare | <死亡骑士>梦魇 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PASSIVE | Death Passive | Death 被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PATTACK | Death Attack | Death 袭击被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PCRITICAL | Death Critical | Death 暴击被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PDEFENSE | Death Defense | Death 防御被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PHP | Death HP | Death 恢复被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_POISON | Death Poison | <死亡骑士>剧毒刀刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PSP | Death SP | Death 魔力被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PSPEED | Death Speed | Death 加速被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PTRIPLE | Death Triple | Death 三倍被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_PUNISH | Death Punish | <死亡骑士>惩罚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_RANKEDGRADIUS | Death Gradisu | <死亡骑士>排射 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_RANKEDKNIFE | Ranked Knife | <死亡骑士>排刀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_RANKING | Ranking | Death 排列被动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_REBIRTH | Rebirth | <死亡骑士>能量重生 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_RESET | Death Reset | Death 强化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_SLASH | Slash | <死亡骑士>挥砍 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_TWINATTACK | Twin Attack | <死亡骑士>危险攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_WARNING | Warning | <死亡骑士>警告 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_WATERATTACK | Water Attack | <死亡骑士>水攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_WAVE | Wave | <死亡骑士>冲击波 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DE_WINDATTACK | Wind Attack | <死亡骑士>暴风攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| DK_CHARGINGPIERCE | Charging Pierce | 蓄力穿刺 | 本地译名，待用户校订 | 源表无说明 |
| DK_DRAGONIC_AURA | Dragonic Aura | 龙之气息 | 本地译名，待用户校订 | 源表无说明 |
| DK_HACKANDSLASHER | Hack and Slash | 劈砍 | 本地译名，待用户校订 | 源表无说明 |
| DK_MADNESS_CRUSHER | Madness Crusher | 疯狂粉碎 | 本地译名，待用户校订 | 源表无说明 |
| DK_SERVANTWEAPON | Servant Weapon | 侍从武器 | 本地译名，待用户校订 | 源表无说明 |
| DK_SERVANT_W_DEMOL | Servant Weapon - Demolition | 侍从武器－破坏 | 本地译名，待用户校订 | 源表无说明 |
| DK_SERVANT_W_PHANTOM | Servant Weapon - Phantom | 侍从武器－幻影 | 本地译名，待用户校订 | 源表无说明 |
| DK_SERVANT_W_SIGN | Servant Weapon - Sign | 侍从武器－印记 | 本地译名，待用户校订 | 源表无说明 |
| DK_STORMSLASH | Storm Slash | 风暴斩击 | 本地译名，待用户校订 | 源表无说明 |
| DK_TWOHANDDEF | Two-handed Defense | 双手武器防御 | 本地译名，待用户校订 | 源表无说明 |
| DK_VIGOR | Vigor | 活力 | 本地译名，待用户校订 | 源表无说明 |
| ECLAGE_RECALL | Return to Eclage | 返回埃克拉珠 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ECL_PEONYMAMY | Peony Mommy | 粉红厚叶 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ECL_SADAGUI | Slapping Herb | 筮答葵叶 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ECL_SEQUOIADUST | Yggdrasil Dust | 世界树之尘 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ECL_SNOWFLIP | Snow Flip | 冰雪寒叶 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| EL_AQUAPLAY | Aquaplay | 冰封领域 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_BLAST | Blast Mine | 风暴冲击 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_CHILLY_AIR | Chilly Air | 绝对零度 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_CIRCLE_OF_FIRE | Circle of Fire | 烈焰之环 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_COOLER | Cooler | 急速降温 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_CURSED_SOIL | Cursed Soil | 诅咒之地 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_ARROW | Fire Arrow | 火箭 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_BOMB | Fire Bomb | 火焰炸弹 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_BOMB_ATK | Fire Bomb Attack | 火焰炸弹 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_CLOAK | Fire Cloak | 火焰斗篷 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_MANTLE | Fire Mantle | 火焰披风 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_WAVE | Fire Wave | 火焰冲击波 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_FIRE_WAVE_ATK | Fire Wave Attack | 火焰冲击波 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_GUST | Gust | 雷电强化 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_HEATER | Heater | 急速升温 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_HURRICANE | Hurricane | 飓风肆虐 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_HURRICANE_ATK | Hurricange Attack | 飓风肆虐 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_ICE_NEEDLE | Ice Needle | 冰针 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_PETROLOGY | 资源新增 | 岩石领域 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_POWER_OF_GAIA | Power of Gaia | 天神下凡 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_PYROTECHNIC | Pyrotechnic | 烈焰强化 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_ROCK_CRUSHER | Rock Crusher | 碎石 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_ROCK_CRUSHER_ATK | Rock Crusher Attack | 碎石 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_SOLID_SKIN | Solid Skin | 皮肤固化 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_STONE_HAMMER | Stone Hammer | 石锤 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_STONE_RAIN | Stone Rain | 岩石风暴 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_STONE_SHIELD | Stone Shield | 岩石盾 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_TIDAL_WEAPON | Tidal Weapon | 海啸武器 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_TROPIC | Tropic | 灼热地带 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_TYPOON_MIS | Typhoon Mist | 台风飞弹 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_TYPOON_MIS_ATK | Typhoon Mist Attack | 台风飞弹 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_UPHEAVAL | Upheaval | 天崩地裂 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WATER_BARRIER | Water Barrier | 水之屏障 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WATER_DROP | Water Drop | 大豪雨 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WATER_SCREEN | Water Screen | 水之守护 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WATER_SCREW | Water Screw | 螺旋水波 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WATER_SCREW_ATK | Water Screw Attack | 螺旋水波 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WILD_STORM | Wild Storm | 荒野风暴 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WIND_CURTAIN | Wind Curtain | 风之魂 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WIND_SLASH | Wind Slash | 风之刃 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_WIND_STEP | Wind Step | 风之闪现 | 中文资源/已校订覆盖 | 源表无说明 |
| EL_ZEPHYR | Zephyr | 风之结界 | 中文资源/已校订覆盖 | 源表无说明 |
| EM_ACTIVITY_BURN | AP Burn | AP燃烧 | 本地译名，待用户校订 | 源表无说明 |
| EM_CONFLAGRATION | Conflagration | 烈焰焚烧 | 本地译名，待用户校订 | 源表无说明 |
| EM_DIAMOND_STORM | Diamond Storm | 钻石风暴 | 本地译名，待用户校订 | 源表无说明 |
| EM_ELEMENTAL_BUSTER | Elemental Buster | 元素爆破 | 本地译名，待用户校订 | 源表无说明 |
| EM_ELEMENTAL_SPIRIT_M | Elemental Spirit Mastery | 元素精灵修炼 | 本地译名，待用户校订 | 源表无说明 |
| EM_ELEMENTAL_VEIL | Elemental Veil | 元素帷幕 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_AGE_OF_ICE | Ice Age | 冰河时代 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_AVALANCHE | Avalanche | 雪崩 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_COLD_FORCE | Cold Force | 寒冰之力 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_CRYSTAL_ARMOR | Crystal Armor | 水晶护甲 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_DEADLY_POISON | Deadly Poison | 致命剧毒 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_DEEP_POISONING | Deep Poisoning | 深度中毒 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_EARTH_CARE | Earth Care | 大地庇护 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_EYES_OF_STORM | Eye of the Storm | 风暴之眼 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_FLAMEARMOR | Flame Armor | 火焰护甲 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_FLAMEROCK | Flame Rock | 火焰岩石 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_FLAMETECHNIC | Flame Technique | 火焰技巧 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_GRACE_BREEZE | Grace Breeze | 恩惠微风 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_POISON_SHIELD | Poison Shield | 毒素之盾 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_STORM_WIND | Storm Wind | 暴风 | 本地译名，待用户校订 | 源表无说明 |
| EM_EL_STRONG_PROTECTION | Strong Protection | 强力保护 | 本地译名，待用户校订 | 源表无说明 |
| EM_INCREASING_ACTIVITY | Increase AP | AP提升 | 本地译名，待用户校订 | 源表无说明 |
| EM_LIGHTNING_LAND | Lightning Land | 雷电领域 | 本地译名，待用户校订 | 源表无说明 |
| EM_MAGIC_BOOK_M | Magic Book Mastery | 魔法书修炼 | 本地译名，待用户校订 | 源表无说明 |
| EM_SPELL_ENCHANTING | Spell Enchanting | 魔法附加 | 本地译名，待用户校订 | 源表无说明 |
| EM_SUMMON_ELEMENTAL_ARDOR | Summon Elemental: Ador | 召唤元素：烈焰 | 本地译名，待用户校订 | 源表无说明 |
| EM_SUMMON_ELEMENTAL_DILUVIO | Summon Elemental: Diluvio | 召唤元素：洪流 | 本地译名，待用户校订 | 源表无说明 |
| EM_SUMMON_ELEMENTAL_PROCELLA | Summon Elemental: Procella | 召唤元素：风暴 | 本地译名，待用户校订 | 源表无说明 |
| EM_SUMMON_ELEMENTAL_SERPENS | Summon Elemental: Serpens | 召唤元素：毒蛇 | 本地译名，待用户校订 | 源表无说明 |
| EM_SUMMON_ELEMENTAL_TERREMOTUS | Summon Elemental: Terremotus | 召唤元素：地震 | 本地译名，待用户校订 | 源表无说明 |
| EM_TERRA_DRIVE | Terra Drive | 大地驱动 | 本地译名，待用户校订 | 源表无说明 |
| EM_VENOM_SWAMP | Venom Swamp | 剧毒沼泽 | 本地译名，待用户校订 | 源表无说明 |
| GC_ANTIDOTE | Antidote | 解毒剂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_CLOAKINGEXCEED | Cloaking Exceed | 伪装强化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_COUNTERSLASH | Counter Slash | 反击斩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_CREATENEWPOISON | New Poison Creation | 新毒制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_CROSSIMPACT | Cross Impact | 十字斩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_CROSSRIPPERSLASHER | Cross Ripper Slasher | 回旋十字斩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_DARKCROW | Dark Claw | 致命爪痕 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_DARKILLUSION | Dark Illusion | 黑色幻影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_HALLUCINATIONWALK | Hallucination Walk | 幻影步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_PHANTOMMENACE | Phantom Menace | 恶灵威胁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_POISONINGWEAPON | Poisonous Weapon | 剧毒武器 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_POISONSMOKE | Poisonous Smoke | 毒雾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_RESEARCHNEWPOISON | New Poison Research | 新毒研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_ROLLINGCUTTER | Rolling Cutter | 回旋刀刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_VENOMIMPRESS | Venom Impression | 毒耐性弱化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_VENOMPRESSURE | Venom Pressure | 剧毒强制赋予 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_WEAPONBLOCKING | Weapon Blocking | 武器抵御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GC_WEAPONCRUSH | Weapon Crush | 卸除武装 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_APPROVAL | Official Guild Approval | 正式工会认证 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_BATTLEORDER | Battle Command | 下达战斗命令 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_CHARGESHOUT_BEATING | 资源新增 | 吹响冲锋号角 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_CHARGESHOUT_FLAG | 资源新增 | 冲锋旗飘扬 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_DEVELOPMENT | Permanent Development | 永久的发展 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_EMERGENCYCALL | Urgent Call | 紧急呼叫 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_EMERGENCY_MOVE | 资源新增 | 紧急移动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_EXTENSION | Guild Extension | 扩充组合体制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_GLORYGUILD | Guild Glory | 公会荣耀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_GLORYWOUNDS | Glorious Wounds | 光荣的伤口 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_GUARDRESEARCH | Guardian Research | 研究监护人 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_GUARDUP | Strengthen Guardians | 监护人魔物强化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_GUILD_STORAGE | Guild Storage Extension | 公会仓库扩充 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_HAWKEYES | Sharp Gaze | 尖锐的视线 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_ITEMEMERGENCYCALL | Faux Urgent Call | 紧急呼叫 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_KAFRACONTRACT | Contract With Kafra | 和卡普拉订契约 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_LEADERSHIP | Guild Leadership | 伟大的指导力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_REGENERATION | Regeneration | 复兴公会员体力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_RESTORE | Restoration | 恢复公会员体力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GD_SOULCOLD | Cold Heart | 冷漠之心 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_FORCE_TRANSFER | 资源新增 | 转移力量 | 中文资源/已校订覆盖 | 源表无说明 |
| GM_ITEM_ATKMAX | UNKNOW NAME | 物理道具最大攻击力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_ITEM_ATKMIN | Max Physical item attack rate | 物理道具最小攻击力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_ITEM_MATKMAX | Minimize Physical item attack rate | 魔法道具最大攻击力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_ITEM_MATKMIN | Minimize Magic item attack rate | 魔法道具最小攻击力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_SANDMAN | Goodnight, Sweety | 摇篮曲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GM_WIDE_RESURRECTION | 资源新增 | 广泛复活术 | 中文资源/已校订覆盖 | 源表无说明 |
| GN_BLOOD_SUCKER | Blood Sucker | 吸血植物 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_CARTBOOST | Geneticist Cart Boost | 手推车加速 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_CARTCANNON | Cart Cannon | 手推车加农炮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_CART_TORNADO | Cart Tornado | 手推车龙卷风 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_CHANGEMATERIAL | Change Material | 素材变化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_CRAZYWEED | Crazy Vines | 疯狂野草 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_DEMONIC_FIRE | Demonic Fire  | 恶魔火焰 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_FIRE_EXPANSION | Fire Expansion | 火焰扩散 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_HELLS_PLANT | Hell Plant | 地狱植物 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_ILLUSIONDOPING | Hallucination Drug | 幻觉禁药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_MAKEBOMB | Bomb Creation | 炸弹制造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_MANDRAGORA | Mandragora Howl | 曼陀罗魔花的尖叫 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_MIX_COOKING | Mixed Cooking | 调配料理 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_REMODELING_CART | Cart Remodeling | 手推车改良 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_SLINGITEM | Item Sling | 道具投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_SPORE_EXPLOSION | Spore Explosion | 爆炸孢子 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_S_PHARMACY | Special Pharmacy | 专门配药 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_THORNS_TRAP | Thorn Trap | 荆棘陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_TRAINING_SWORD | Sword Mastery | 单手剑使用熟练度 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GN_WALLOFTHORN | Thorn Wall | 荆棘之壁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_ADJUSTMENT | Gunslinger's Panic | 终极闪躲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_BULLSEYE | Bull's Eye | 公牛之眼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_CHAINACTION | Chain Action | 连锁冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_CRACKER | Cracker | 轰然巨响 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_DESPERADO | Desperado | 亡命之徒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_DISARM | Disarm | 抛戈卸甲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_DUST | Crowd Control Shot | 弹片四射 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_FLING | Coin Fling | 投掷硬币 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_FULLBUSTER | Full Blast | 全面破坏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_GATLINGFEVER | Gatling Feaver | 格林狂热 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_GLITTERING | Coin Flip | 装满硬币 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_GROUNDDRIFT | Gunslinger Mine | 四面埋伏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_INCREASING | Increase Accuracy | 命中率递增 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_MADNESSCANCEL | Last Stand | 疯狂凯斯乐 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_MAGICALBULLET | Magical Bullet | 魔术弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_PIERCINGSHOT | Wounding Shot | 霹雳弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_RAPIDSHOWER | Trigger Happy Shot | 五连击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_SINGLEACTION | Single Action | 单枪射击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_SNAKEEYE | Snake Eyes | 瞄准之眼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_SPREADATTACK | Spread Attack | 火力全开 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_TRACKING | Tracking | 百步穿杨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| GS_TRIPLEACTION | Triple Action | 三连攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HAMI_BLOODLUST | Blood Lust | 血的贪求 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HAMI_CASTLE | Castling | 位置互换 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HAMI_DEFENCE | Amistr Bulwark | 防御力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HAMI_SKIN | Adamantium Skin | 活命之肤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HFLI_FLEET | Flitting | 横越速度 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HFLI_MOON | Moonlight | 月光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HFLI_SBR44 | S.B.R.44 | S.B.R.44 | 保留技能代号 | 已有GBK说明，待游戏复核 |
| HFLI_SPEED | Accelerated Flight | 紧急回避 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HLIF_AVOID | Urgent Escape | 轻捷移动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HLIF_BRAIN | Brain Surgery | 脑手术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HLIF_CHANGE | Mental Charge | 智力变换 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HLIF_HEAL | Healing Hands | 治愈之手 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HP_ASSUMPTIO | Assumptio | 圣母之祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HP_BASILICA | Basilica | 神圣殿堂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HP_MANARECHARGE | Spiritual Thrift | 魔力减免 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HP_MEDITATIO | Meditation | 冥想 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_ANKLESNARE | Anklesnare | 定位陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_BEASTBANE | Beastbane | 动物杀手 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_BLASTMINE | Blast Mine | 定时爆炸陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_BLITZBEAT | Blitz Beat | 闪电冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_CLAYMORETRAP | Claymore Trap | 爆散陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_DETECTING | Detect | 猎鹰寻敌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_FALCON | Falconry Mastery | 驯鹰术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_FLASHER | Flasher | 强光陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_FREEZINGTRAP | Freezing Trap | 霜冻陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_LANDMINE | Land Mine | 地雷陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_PHANTASMIC | Phantasmic Arrow | 幻影箭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_POWER | Beast Charge | 动物猛击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_REMOVETRAP | Remove Trap | 陷阱移除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_SANDMAN | Sandman | 睡魔陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_SHOCKWAVE | Shockwave Trap | 魔耗陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_SKIDTRAP | Skid Trap | 滑动陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_SPRINGTRAP | Spring Trap | 爆破陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_STEELCROW | Steel Crow | 钢制喙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HT_TALKIEBOX | Talkie Box | 陷阱探查 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HVAN_CAPRICE | Caprice | 善变 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HVAN_CHAOTIC | Chaotic Blessings | 混乱的祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HVAN_EXPLOSION | Self-Destruction | 生物爆炸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HVAN_INSTRUCT | Instruction Change | 变更指示 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_GANBANTEIN | Ganbantein | 咖般塔音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_GRAVITATION | Gravitational Field | 重力原野 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_MAGICCRASHER | Stave Crasher | 魔击术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_MAGICPOWER | Mystical Amplification | 魔力增幅 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_NAPALMVULCAN | Napalm Vulcan | 念力连击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| HW_SOULDRAIN | Soul Drain | 吸魂术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| IG_ATTACK_STANCE | Attack Stance | 攻击姿态 | 本地译名，待用户校订 | 源表无说明 |
| IG_CROSS_RAIN | Cross Rain | 十字之雨 | 本地译名，待用户校订 | 源表无说明 |
| IG_GRAND_JUDGEMENT | Grand Judgment | 大审判 | 本地译名，待用户校订 | 源表无说明 |
| IG_GUARDIAN_SHIELD | Guardian Shield | 守护者之盾 | 本地译名，待用户校订 | 源表无说明 |
| IG_GUARD_STANCE | Guard Stance | 防御姿态 | 本地译名，待用户校订 | 源表无说明 |
| IG_HOLY_SHIELD | Holy Shield | 神圣之盾 | 本地译名，待用户校订 | 源表无说明 |
| IG_JUDGEMENT_CROSS | Judgement Cross | 审判十字 | 本地译名，待用户校订 | 源表无说明 |
| IG_OVERSLASH | Overslash | 超越斩击 | 本地译名，待用户校订 | 源表无说明 |
| IG_REBOUND_SHIELD | Rebound Shield | 反弹之盾 | 本地译名，待用户校订 | 源表无说明 |
| IG_SHIELD_MASTERY | Shield Mastery | 盾牌修炼 | 本地译名，待用户校订 | 源表无说明 |
| IG_SHIELD_SHOOTING | Shield Shooting | 盾牌射击 | 本地译名，待用户校订 | 源表无说明 |
| IG_SPEAR_SWORD_M | Spear Sword Mastery | 长矛与剑修炼 | 本地译名，待用户校订 | 源表无说明 |
| IG_ULTIMATE_SACRIFICE | Ultimate Sacrifice | 终极牺牲 | 本地译名，待用户校订 | 源表无说明 |
| IQ_EXPOSION_BLASTER | Explosion Blaster | 爆裂冲击 | 本地译名，待用户校订 | 源表无说明 |
| IQ_FIRM_FAITH | Firm Faith | 坚定信仰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_FIRST_BRAND | First Brand | 第一式：烙印 | 本地译名，待用户校订 | 源表无说明 |
| IQ_FIRST_FAITH_POWER | First Faith Power | 第一式：信仰之力 | 本地译名，待用户校订 | 源表无说明 |
| IQ_JUDGE | Judgment | 审判 | 本地译名，待用户校订 | 源表无说明 |
| IQ_MASSIVE_F_BLASTER | Massive Flame Blaster | 巨焰爆破 | 本地译名，待用户校订 | 源表无说明 |
| IQ_OLEUM_SANCTUM | Oleum Sanctum | 圣油 | 本地译名，待用户校订 | 源表无说明 |
| IQ_POWERFUL_FAITH | Powerful Faith | 强大信仰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_SECOND_FAITH | Second Faith | 第二式：信仰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_SECOND_FLAME | Second Flame | 第二式：火焰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_SECOND_JUDGEMENT | Second Judgment | 第二式：审判 | 本地译名，待用户校订 | 源表无说明 |
| IQ_SINCERE_FAITH | Sincere Faith | 虔诚信仰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_THIRD_CONSECRATION | Third Consecration | 第三式：奉献 | 本地译名，待用户校订 | 源表无说明 |
| IQ_THIRD_EXOR_FLAME | Third Exorcism Flame | 第三式：驱魔之焰 | 本地译名，待用户校订 | 源表无说明 |
| IQ_THIRD_FLAME_BOMB | Third Flame Bomb | 第三式：火焰弹 | 本地译名，待用户校订 | 源表无说明 |
| IQ_THIRD_PUNISH | Third Punishment | 第三式：惩戒 | 本地译名，待用户校订 | 源表无说明 |
| IQ_WILL_OF_FAITH | Will of Faith | 信仰意志 | 本地译名，待用户校订 | 源表无说明 |
| ITM_TOMAHAWK | Tomahawk Throwing | 投掷风灵之斧 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KG_KAGEHUMI | Shadow Trampling | 踏影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KG_KAGEMUSYA | Shadow Warrior | 影子武士 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KG_KYOMU | Empty Shadow | 虚无缥缈之影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_AUTOCOUNTER | Counter Attack | 反击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_BOWLINGBASH | Bowling Bash | 怪物互击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_BRANDISHSPEAR | Brandish Spear | 骑乘攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_CAVALIERMASTERY | Cavalier Mastery | 骑兵修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_CHARGEATK | Charge Attack | 冲锋攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_ONEHAND | One Handed Quicken | 单手剑攻击速度增加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_PIERCE | Pierce | 连刺攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_RIDING | Peco Peco Ride | 骑乘术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_SPEARBOOMERANG | Spear Boomerang | 投掷长矛攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_SPEARMASTERY | Spear Mastery | 长矛使用熟练度 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_SPEARSTAB | Spear Stab | 长矛刺击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KN_TWOHANDQUICKEN | Two Hand Quicken | 双手剑攻击速度增加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_BAKURETSU | Kunai Explosion | 爆炸飞刀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_DOHU_KOUKAI | Earth Charm | 地符:刚块 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_GENWAKU | Illusion - Bewitch | 幻术-迷惑 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_HAPPOKUNAI | Kunai Splash | 八方飞刀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_HUUMARANKA | Swirling Petal | 风魔飞镖之飞舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_HYOUHU_HUBUKI | Ice Charm | 冰符:吹雪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_IZAYOI | 16th Night | 十六夜 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_JYUMONJIKIRI | Cross Slash | 幽冥十字斩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_JYUSATSU | Illusion - Death | 幻术-咒死 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_KAHU_ENTEN | Fire Charm | 火符:炎天 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_KAIHOU | Release Ninja Spell | 法术-释放 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_KAZEHU_SEIRAN | Wind Charm | 风符:青岚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_KYOUGAKU | Illusion - Shock | 幻术-惊恐 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_LEFT | Lefthand Mastery | 左手修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_MAKIBISHI | Makibishi | 投掷三角钉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_MEIKYOUSISUI | Pure Soul | 明镜止水 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_MUCHANAGE | Rapid Throw | 投掷魔币 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_RIGHT | Righthand Mastery | 右手修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_SETSUDAN | Soul Cutter | 灵魂阻隔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_YAMIKUMO | Shadow Hiding | 暗云 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_ZANZOU | Illusion - Shadow | 幻术-残影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| KO_ZENKAI | Cast Ninja Spell | 法术-施展 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_BANDING | Banding | 聚集 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_BANISHINGPOINT | Vanishing Point | 放逐攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_CANNONSPEAR | Cannon Spear | 加农炮攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_EARTHDRIVE | Earth Drive | 大地毁灭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_EXEEDBREAK | Exceed Break | 强化冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_FORCEOFVANGUARD | Vanguard Force | 先锋部队 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_HESPERUSLIT | Hesperus Lit | 黄昏星之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_INSPIRATION | Inspiration | 灵感 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_KINGS_GRACE | King's Grace | 王的恩典 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_MOONSLASHER | Moonslasher | 半月斩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_OVERBRAND | Overbrand | 支配烙印 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_PIETY | Piety | 虔诚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_PINPOINTATTACK | Pinpoint Attack | 精准攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_PRESTIGE | Prestige | 威信 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_RAGEBURST | Burst Attack | 愤怒突击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_RAYOFGENESIS | Genesis Ray | 创世之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_REFLECTDAMAGE | Reflect Damage | 坚盾护体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_SHIELDPRESS | Shield Press | 重压盾击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_SHIELDSPELL | Shield Spell | 盾咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LG_TRAMPLE | Trample | 摧残 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_AURABLADE | Aura Blade | 灵气剑 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_BERSERK | Frenzy | 狂怒之枪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_CONCENTRATION | Spear Dynamo | 集中攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_HEADCRUSH | Traumatic Blow | 伤害增压 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_JOINTBEAT | Vital Strike | 巧打 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_PARRYING | Parry | 双剑格挡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_SPIRALPIERCE | Clashing Spiral | 螺旋击刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| LK_TENSIONRELAX | Relax | 极速恢复 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_CHARGEARROW | Arrow Repel | 冲锋箭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_DOUBLE | Double Strafe | 二连矢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_FREEZINGTRAP | Freezing Trap | 霜冻陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_LANDMINE | Land Mine | 地雷陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_REMOVETRAP | Remove Trap | 陷阱移除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_SANDMAN | Sandman | 睡魔陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_SHARPSHOOTING | Focused Arrow Strike | 锐利射击 | 本地译名，待用户校订 | 已有GBK说明，待游戏复核 |
| MA_SHOWER | Arrow Shower | 箭雨  | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MA_SKIDTRAP | Skid Trap | 滑动陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_BODYALTER | Alter Body | 身体改造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_BODYSTUDY | Body Study | 身体研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_DRIFT | Bongun Drift | 妖道漂流 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_EQUIP | Bongun Equip | 妖道装备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_EXCLUDE | Bongun Exclude | 妖道排斥 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_GAIN | Bongun Gain | 妖道获得经验 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_GATHERING | Bongun Gathering | 妖道聚集 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_WALLRUSH | Bongun Wall Rush | 妖道墙扫荡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_B_WALLSHIFT | Bongun Wallshift | 妖道墙变形 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_CARDPITCHER | Card Pitcher | 卡片投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_FIGHTING | Munak Fighting | 僵尸战斗 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_MENTAL | Mental Errands | 精神控制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_MISSION | Mission Timing | 认养宠物任务 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_MUNAKBALL | Munak Ball | 僵尸球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_MUNAKKNOWLEDGE | ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã…â€™Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã¢â‚¬â€œÃƒâ€šÃ‚Â\xA0ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¶ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â | 认养宠物大师 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_GAIN | Munak Gain | 僵尸获得经验 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_GATHERING | Munak Gathering | 僵尸聚集 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_REINCARNATION | Munak Reincarnation | 僵尸重生 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_TELEPORT | Pet Teleport | 僵尸传送 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_WALLCRASH | Munak Wall Crash | 僵尸墙冲撞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_M_WALLRUSH | Munak Wall Rush | 僵尸墙扫荡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_NEUTRAL | Bongun Neutral | 妖道中立 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_PETMEMORY | Pet Memory | 宠物记忆 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_PETPITCHER | Kick the Baby | 宠物投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_SCROLL | Pet Scroll | 妖道球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_TAIMING_PUTI | Puti Taming | 宠物驯化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MB_WHITEPOTION | White Potion | 药水控制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_CARTDECORATE | Cart Decoration | 改装手推车 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_CARTREVOLUTION | Cart Revolution | 手推车攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_CHANGECART | Change Cart | 改装手推车 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_DISCOUNT | Discount | 低价买进 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_IDENTIFY | Item Appraisal | 鉴定 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_IDENTIFY_C | 资源新增 | 高级物品鉴定 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_INCCARRY | Enlarge Weight Limit | 负重增加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_LOUD | Crazy Uproar | 大声呐喊 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_MAMMONITE | Mammonite | 金钱攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_OVERCHARGE | Overcharge | 高价卖出 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_PUSHCART | Pushcart | 手推车 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MC_VENDING | Vending | 露天商店 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_AUTOBERSERK | Berserk | 狂暴状态 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_BENEDICTION | Benediction | 祝福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_BLESSING | Blessing | 天使之赐福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_COMPRESS | Compress | 压制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_CRASH | Crash | 撞击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_DECAGI | Decrease AGI | 缓速术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_ESTIMATION | Sense | 怪物情报 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_INCAGI | Increase Agility | 加速术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_INVINCIBLEOFF2 | Mind Blaster | 心灵净化 | 中文资源/已校订覆盖 | 源表无说明 |
| MER_KYRIE | Kyrie Eleison | 霸邪之阵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_LEXDIVINA | Lex Divina | 沉默之术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_MAGNIFICAT | Magnificat | 圣母之颂歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_MENTALCURE | Mental Cure | 精神治愈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_PROVOKE | Provoke | 挑衅 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_QUICKEN | Weapon Quicken | 加速武器 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_RECUPERATE | Recuperate | 复原 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_REGAIN | Regain | 恢复 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_SCAPEGOAT | Scapegoat | 替罪羔羊 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_SIGHT | Sight | 火狩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MER_TENDER | Tender | 补给 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_COLDBOLT | Cold Bolt | 冰箭术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_ENERGYCOAT | Energy Coat | 能量外套 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_FIREBALL | Fire Ball | 火球术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_FIREBOLT | Fire Bolt | 火箭术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_FIREWALL | Fire Wall | 火墙术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_FROSTDIVER | Frost Driver | 冰冻术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_LIGHTNINGBOLT | Lightning Bolt | 雷击术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_NAPALMBEAT | Napalm Beat | 心灵爆破 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_SAFETYWALL | Safety Wall | 暗之障壁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_SIGHT | Sight | 火狩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_SOULSTRIKE | Soul Strike | 圣灵召唤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_SRECOVERY | Increase SP Recovery | 禅心 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_STONECURSE | Stone Curse | 石化术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MG_THUNDERSTORM | Thunder Storm | 雷爆术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_ANGRIFFS_MODUS | Angriffs Modus | 攻击准备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_CBC | C.B.C : Continual Break Combo | C.B.C : 连续突破组合 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_EQC | E.Q.C : Eternal Quick Combo | E.Q.C : 永恒快速组合 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_ERASER_CUTTER | Eraser Cutter | 音速刀刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_GOLDENE_FERSE | Goldene Ferse | 黄金脚跟 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_GRANITIC_ARMOR | Granitic Armor | 花岗岩铠甲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_HEILIGE_STANGE | Heilage Stange | 圣刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_LAVA_SLIDE | Lava Slide | 熔岩滑动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_LIGHT_OF_REGENE | Light of Regeneration | 重生之光 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_MAGMA_FLOW | Magma Flow | 岩浆流动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_MIDNIGHT_FRENZY | Midnight Frenzy | 午夜狂暴 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_NEEDLE_OF_PARALYZE | Needle of Paralysis | 麻痹针 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_OVERED_BOOST | Over Boost | 瞬间增压 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_PAIN_KILLER | Pain Killer | 镇痛剂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_POISON_MIST | Poison Mist | 剧毒粉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_PYROCLASTIC | Pyroclastic | 火山尘暴 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_SILENT_BREEZE | Silent Breeze | 沉默微风 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_SILVERVEIN_RUSH | Silvervein Rush | 银脉冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_SONIC_CRAW | Sonic Claw | 音速利爪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_STAHL_HORN | Stahl Horn | 钢铁之角 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_STEINWAND | Stein Wand | 岩壁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_STYLE_CHANGE | Style Change | 转换型态 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_SUMMON_LEGION | Summon Legion | 召唤虫团 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_TINDER_BREAKER | Tinder Breaker | 粉碎骨折 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_VOLCANIC_ASH | Volcanic Ash | 火山灰 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MH_XENO_SLASHER | Xeno Slasher | 血腥魔刀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MI_ECHOSONG | Echo Song | 回音之歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MI_HARMONIZE | Harmonize | 和声演奏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MI_RUSH_WINDMILL | Windmill Rush | 朝风车突击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_AUTOGUARD | Guard | 自动防御 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_BRANDISH | Brandish Spear | 骑乘攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_DEFENDER | Defending Aura | 光之盾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_DEVOTION | Sacrifice | 牺牲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_PIERCE | Pierce | 连刺攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ML_SPIRALPIERCE | Clashing Spiral | 螺旋击刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_ABSORBSPIRITS | Spiritual Sphere Absorption | 吸气 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_BALKYOUNG | Excruciating Palm | 发劲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_BLADESTOP | Root | 真剑百破道 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_BODYRELOCATION | Snap | 弓身弹影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_CALLSPIRITS | Summon Spirit Sphere | 蓄气 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_CHAINCOMBO | Raging Quadruple Blow | 连环全身掌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_COMBOFINISH | Raging Thrust | 猛龙夸强 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_DODGE | Flee | 移花接木 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_EXPLOSIONSPIRITS | Fury | 爆气 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_EXTREMITYFIST | Guillotine Fist | 阿修罗霸凰拳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_FINGEROFFENSIVE | Throw Spirit Sphere | 弹指神通 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_INVESTIGATE | Occult Impaction | 浸透劲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_IRONHAND | Iron Fists | 铁沙掌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_KITRANSLATION | Spiritual Bestowment | 振气注入 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_SPIRITSRECOVERY | Spiritual Cadence | 运气调息 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_STEELBODY | Mental Strength | 金刚不坏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MO_TRIPLEATTACK | Raging Trifecta Blow | 六合拳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_BASH | Bash | 狂击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_BERSERK | Frenzy | 狂怒之枪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_BOWLINGBASH | Bowling Bash | 怪物互击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_MAGNUM | Magnum Break | 怒爆 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_PARRYING | Parry | 双剑格挡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MS_REFLECTSHIELD | Shield Reflect | 反射盾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| MT_ABR_M | ABR Mastery | ABR修炼 | 本地译名，待用户校订 | 源表无说明 |
| MT_AXE_STOMP | Axe Stomp | 战斧践踏 | 本地译名，待用户校订 | 源表无说明 |
| MT_A_MACHINE | Activate Attack Device | 启动攻击装置 | 本地译名，待用户校订 | 源表无说明 |
| MT_D_MACHINE | Activate Defense Device | 启动防御装置 | 本地译名，待用户校订 | 源表无说明 |
| MT_M_MACHINE | Manufacture Machine | 机械制造 | 本地译名，待用户校订 | 源表无说明 |
| MT_RUSH_QUAKE | Rush Quake | 冲击震荡 | 本地译名，待用户校订 | 源表无说明 |
| MT_SUMMON_ABR_BATTLE_WARIOR | ABR: Battle Warrior | ABR：战斗勇士 | 本地译名，待用户校订 | 源表无说明 |
| MT_SUMMON_ABR_DUAL_CANNON | ABR: Dual Cannon | ABR：双炮 | 本地译名，待用户校订 | 源表无说明 |
| MT_SUMMON_ABR_INFINITY | ABR: Infinity | ABR：无限 | 本地译名，待用户校订 | 源表无说明 |
| MT_SUMMON_ABR_MOTHER_NET | ABR: Mother Net | ABR：母体网络 | 本地译名，待用户校订 | 源表无说明 |
| MT_TWOAXEDEF | Two-handed Axe Defense | 双手斧防御 | 本地译名，待用户校订 | 源表无说明 |
| NC_ACCELERATION | Acceleration | 超音速投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_ANALYZE | Analyze | 解析 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_ARMSCANNON | Arm Cannon | 加农炮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_AXEBOOMERANG | Axe Boomerang | 回旋斧 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_AXETORNADO | Axe Tornado  | 战斧飓风 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_BOOSTKNUCKLE | Knuckle Boost | 喷射飞拳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_B_SIDESLIDE | Back Slide | 大步后退、后侧滑行 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_COLDSLOWER | Ice Launcher | 液体冷却弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_DISJOINT | Divest FAW  | FAW解体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_EMERGENCYCOOL | Cooldown | 紧急冷却 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_FLAMELAUNCHER | Flame Launcher | 火焰喷射器 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_F_SIDESLIDE | Front Slide | 大步前进、前侧滑行 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_HOVERING | Hover | 悬停 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_INFRAREDSCAN | Infrared Scan | 红外线扫描 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_MADOLICENCE | Madogear License | 魔导机甲执照 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_MAGICDECOY | FAW Magic Decoy | FAW魔法傀儡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_MAGMA_ERUPTION | Lava Flow | 岩浆喷发 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_MAGNETICFIELD | Magnetic Field | 磁场 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_MAINFRAME | Remodel Mainframe | 主体改造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_NEUTRALBARRIER | Neutral Barrier | 中性防护罩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_PILEBUNKER | Pile Bunker | 冲击椎 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_POWERSWING | Power Swing | 挥斧重击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_REPAIR | Repair | 修复 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_RESEARCHFE | Fire Earth Research  | 火焰与大地的研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_SELFDESTRUCTION | Suicidal Destruction | 自我摧毁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_SHAPESHIFT | Elemental Shift | 形态转换 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_SILVERSNIPER | FAW Silver Sniper | FAW银光狙击手 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_STEALTHFIELD | Stealth Field | 隐形力场 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_TRAININGAXE | Axe Mastery  | 斧头修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NC_VULCANARM | Vulcan Arm | 火神炮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_BAKUENRYU | Exploding Dragon | 爆炎龙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_BUNSINJYUTSU | Mirror Image | 幻影分身 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_HUUJIN | Wind Blade | 风刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_HUUMA | Throw Huuma Shuriken | 投掷风魔飞镖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_HYOUSENSOU | Freezing Spear | 冰闪枪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_HYOUSYOURAKU | Snow Flake Draft | 冰晶落 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_ISSEN | Killing Strike | 一闪击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KAENSIN | Blaze Shield | 火炎阵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KAMAITACHI | First Wind | 朔风 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KASUMIKIRI | Haze Slasher | 雾里砍劈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KIRIKAGE | Shadow Slash | 隐身攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KOUENKA | Flaming Petals | 火炎花 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_KUNAI | Throw Kunai | 投掷飞刀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_NEN | Ninja Aura | 念 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_NINPOU | Ninja Mastery | 忍术修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_RAIGEKISAI | Lightning Jolt | 雷击碎 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_SHADOWJUMP | Shadow Leap | 影子跳跃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_SUITON | Watery Evasion | 水遁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_SYURIKEN | Throw Shuriken | 投掷飞镖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_TATAMIGAESHI | Flip Tatami | 榻榻米攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_TOBIDOUGU | Dagger Throwing Practice | 飞刀修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_UTSUSEMI | Cicada Skin Shed | 金蝉脱壳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NJ_ZENYNAGE | Throw Coins | 投掷金钱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_ALLHEAL | Full Heal | 生命之流 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_ALL_STAT_DOWN | 资源新增 | 全素质下降 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_ANTIMAGIC | Deadzone | 反魔法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_ASSASSINCROSS | Impressive Riff | 刺客的黄昏 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_CLOUD_KILL | Killing Cloud | 云杀 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_COMET | Comet | 流星雨 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_CRITICALWOUND | Critical Wounds | 致命伤口 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_DAMAGE_HEAL | 资源新增 | 转祸为福 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_DEADLYCURSE2 | Wide Deadly Curse | 广域致命诅咒 | 本地译名，待用户校订 | 源表无说明 |
| NPC_DEFENDER | 资源新增 | 光之盾 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_DISSONANCE | Unchained Serenade | 不谐和音 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_DRAGONBREATH | Dragon's Breath | 龙之气息 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_DRAGONFEAR | Dragon Fear | 天龙恐惧 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_EARTHQUAKE | Earthquake | 地震连击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_EARTHQUAKE_K | Earthquake | 地震连击 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_ELECTRICWALK | 资源新增 | 电流步 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_EVILLAND | Evil Land | 邪降 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_EVILLAND2 | Demonic Evil Land | 恶魔邪降 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_FATALMENACE | Fatal Menace | 致命威胁 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_FIRESTORM | Fire storm | 火焰风暴 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_FIREWALK | 资源新增 | 火焰步 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_FLAMECROSS | Flame cross | 火焰十字架 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_GRADUAL_GRAVITY | 资源新增 | 重力增加 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_HALLUCINATIONWALK | 资源新增 | 幻影步 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_HELLJUDGEMENT | Hell's Judgement | 死亡天谴 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_HELLJUDGEMENT2 | Demonic Hell Judgment | 恶魔死亡天谴 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_HELLPOWER | Hell's Power | 地狱之权能 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_ICEMINE | Ice mine | 寒冰地雷 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_IGNITIONBREAK | Ignition Break | 致命爆裂 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_IMMUNE_PROPERTY | 资源新增 | 属性免疫 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_JACKFROST | Jack Frost | 冰冻穿孔 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_LEASH | 资源新增 | 死亡之手 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_LEX_AETERNA | Wide area Lex Aeterna | 广范围天使之怒 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_MAGICMIRROR | Magic Mirror | 魔镜 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_MAGMA_ERUPTION | Lava Flow | 岩浆喷发 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_MANDRAGORA | Mandragora Howl | 曼陀罗花的尖叫 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_MAXPAIN | 资源新增 | 极限痛苦 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_MILLENNIUMSHIELD | 资源新增 | 千年神盾 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_MOVE_COORDINATE | 资源新增 | 位置转换 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_PSYCHIC_WAVE | Psychic Wave | 超自然波 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_PULSESTRIKE | Pulse Strike | 脉振冲撞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_PULSESTRIKE2 | Pulse Strike | 脉振冲撞 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_RAYOFGENESIS | Genesis Ray | 创世之光 | 本地译名，待用户校订 | 源表无说明 |
| NPC_REVERBERATION | Reverberation | 残响 | 本地译名，待用户校订 | 源表无说明 |
| NPC_SLOWCAST | Slow Cast | 减缓咏唱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_SR_CURSEDCIRCLE | Cursed Circle | 咒缚阵 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_STONESKIN | Stone Skin | 钢筋铁骨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_STORMGUST2 | Storm Gust | 暴风雪 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_UGLYDANCE | Hip Shaker | 丑陋之舞 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_VAMPIRE_GIFT | Vampire's Gift | 吸血鬼接触 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_VENOMFOG | Venom fog | 毒雾 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEBLEEDING | Bloody Party | 广范围出血 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDEBLEEDING2 | Demonic Mass Bleeding | 恶魔广范围出血 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEBODYBURNNING | Wide area burnning | 广范围着火 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDECOLD | Wide area freeze | 广范围冷冻 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDECONFUSE | Confusion Rule | 广范围混乱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDECONFUSE2 | Demonic Mass Confuse | 恶魔广范围混乱 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDECURSE | Cursed Fate | 广范围诅咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDECURSE2 | Demonic Mass Curse | 恶魔广范围诅咒 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEFREEZE | Frozen Heart | 广范围冰冻 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDEFREEZE2 | Demonic Mass Freeze | 恶魔广范围冰冻 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEFROSTMISTY | Wide area frost misty | 广范围冰封 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEHEALTHFEAR | Wide area fear | 广范围恐怖 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDELEASH | 资源新增 | 广范围死亡之手 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESIGHT | Wide sight | 广范围火狩 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESILENCE | Bedlam | 广范围沉默 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDESILENCE2 | Demonic Mass Silence | 恶魔广范围沉默 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESIREN | Wide area fascination | 广范围蛊惑 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESLEEP | Morpheus Slumber | 广范围睡眠 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDESLEEP2 | Demonic Mass Sleep | 恶魔广范围睡眠 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESOULDRAIN | Souless Defeat | 法力燃烧 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDESTONE | Medusa's Stare | 广范围石化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDESTONE2 | Demonic Mass Stone | 恶魔广范围石化 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESTUN | Stunning Gaze | 广范围晕眩 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NPC_WIDESTUN2 | Demonic Mass Stun | 恶魔广范围晕眩 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDESUCK | Wide bloodsucking | 广范围吸血 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDEWEB | Wide web | 广范围易燃之网 | 中文资源/已校订覆盖 | 源表无说明 |
| NPC_WIDE_DEEP_SLEEP | Wide area deep sleep | 广范围沉睡 | 中文资源/已校订覆盖 | 源表无说明 |
| NV_BASIC | Basic Skill | 基本技能 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NV_BREAKTHROUGH | Breakthrough | 突破极限 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NV_FIRSTAID | First Aid | 紧急治疗 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NV_HELPANGEL | Help, Angel! | 救援天使 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NV_TRANSCENDENCE | Transcendence | 心灵超越 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| NV_TRICKDEAD | Play Dead | 装死 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| OB_AKAITSUKI | Ominous Moonlight | 不祥的红月 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| OB_OBOROGENSOU | Moonlight Fantasy | 阴月的幻影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| OB_ZANGETSU | Distorted Crescent | 变形的上弦月 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PA_GOSPEL | Battle Chant | 圣音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PA_PRESSURE | Gloria Domini | 神之威压 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PA_SACRIFICE | Martyr's Reckoning | 舍命攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PA_SHIELDCHAIN | Rapid Smiting | 连续盾击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_DOUBLECASTING | Double Bolt | 双倍投掷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_FOGWALL | Blinding Mist | 薄雾墙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_HPCONVERSION | Indulge | HP转换 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_MEMORIZE | Foresight | 速读术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_MINDBREAKER | Mind Breaker | 精神撼动 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_SOULBURN | Soul Siphon | 精神耗弱术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_SOULCHANGE | Soul Exhale | 心神互换 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PF_SPIDERWEB | Fiber Lock | 易燃之网 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_ASPERSIO | Aspersio | 洒水祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_BENEDICTIO | B.S Sacramenti  | 圣之祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_GLORIA | Gloria | 幸运之颂歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_IMPOSITIO | Impositio Manus | 神威祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_KYRIE | Kyrie Eleison | 霸邪之阵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_LEXAETERNA | Lex Aeterna | 天使之怒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_LEXDIVINA | Lex Divina | 沉默之术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_MACEMASTERY | Mace Mastery | 钝器使用熟练度 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_MAGNIFICAT | Magnificat | 圣母之颂歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_MAGNUS | Magnus Exorcismus | 十字驱魔攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_REDEMPTIO | Redemptio | 舍身取义 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_SANCTUARY | Sanctuary | 光耀之堂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_SLOWPOISON | Slow Poison | 缓毒术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_STRECOVERY | Status Recovery | 痊愈术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_SUFFRAGIUM | Suffragium | 牺牲祈福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| PR_TURNUNDEAD | Turn Undead | 转生术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_AIMEDBOLT | Aimed Bolt | 瞄准标靶 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_ARROWSTORM | Arrow Storm | 箭雨风暴 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_CAMOUFLAGE | Camouflage | 伪装战术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_CLUSTERBOMB | Bomb Cluster | 榴霰弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_COBALTTRAP | Cobalt Trap | 深蓝陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_DETONATOR | Detonator | 雷管 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_ELECTRICSHOCKER | Electric Shock | 电击陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_FEARBREEZE | Fear Breeze | 微风恐惧 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_FIRINGTRAP | Fire Trap | 燃烧陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_ICEBOUNDTRAP | Ice Trap | 冰封陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_MAGENTATRAP | Magenta Trap | 紫红陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_MAIZETRAP | Maze Trap | 浅黄陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_RANGERMAIN | Main Ranger | 游侠主意 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_RESEARCHTRAP | Trap Research | 陷阱研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_SENSITIVEKEEN | Keen Nose | 敏锐嗅觉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_TOOTHOFWUG | Warg Teeth | 狼牙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_UNLIMIT | No Limits | 精英狙击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_VERDURETRAP | Verdure Trap | 青翠陷阱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_WUGBITE | Warg Bite | 狼咬 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_WUGDASH | Warg Dash | 疾狼术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_WUGMASTERY | Warg Mastery | 召狼术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_WUGRIDER | Warg Ride | 骑狼术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RA_WUGSTRIKE | Warg Strike | 狼突击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RETURN_TO_ELDICASTES | To El Dicastes | 返回艾尔迪卡斯特 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_BACKSTAP | Back Stab | 背刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_CLEANER | Remover | 清洗 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_CLOSECONFINE | Close Confine | 紧密的约束 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_COMPULSION | Haggle | 强制减价 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_FLAGGRAFFITI | Piece | 旗帜涂鸦 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_GANGSTER | Slyness | 流氓天国 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_GRAFFITI | Scribble | 涂鸦 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_INTIMIDATE | Snatch | 胁持 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_PLAGIARISM | Intimidate | 抄袭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_RAID | Sightless Mind | 潜击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_SNATCHER | Gank | 强夺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_STEALCOIN | Mug | 偷钱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_STRIPARMOR | Divest Armor | 卸除铠甲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_STRIPHELM | Divest Helm | 卸除头盔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_STRIPSHIELD | Divest Shield | 卸除盾牌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_STRIPWEAPON | Divest Weapon | 卸除武器 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RG_TUNNELDRIVE | Stalk | 潜遁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_ABUNDANCE | Abundance | 丰足 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_CRUSHSTRIKE | Crushing Strike | 重击强袭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_DEATHBOUND | Death Bound | 死亡反弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_DRAGONBREATH | Dragon's Breath | 龙之气息 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_DRAGONBREATH_WATER | Dragon's Water Breath | 龙之气息-水 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_DRAGONHOWLING | Dragon Howling | 龙之咆哮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_DRAGONTRAINING | Dragon Training | 龙驾驭 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_ENCHANTBLADE | Enchant Blade | 魔力剑 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_FIGHTINGSPIRIT | Determination | 提升斗志 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_GIANTGROWTH | Giant Growth | 力量成长 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_HUNDREDSPEAR | Hundred Spears | 百矛穿刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_IGNITIONBREAK | Ignition Break | 致命爆裂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_LUXANIMA | Lux Anima | 符文爆发 | 中文资源/已校订覆盖 | 源表无说明 |
| RK_MILLENNIUMSHIELD | Millenium Shield | 千年神盾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_PHANTOMTHRUST | Phantom Thrust | 幻象突刺 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_REFRESH | Refresh | 恢复 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_RUNEMASTERY | Rune Mastery | 符文精熟 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_SONICWAVE | Sonic Wave | 音速冲击波 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_STONEHARDSKIN | Skin of Stone | 岩石皮肤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_STORMBLAST | Storm Blast | 风暴冲击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_VITALITYACTIVATION | Vitality Activation | 生命激化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RK_WINDCUTTER | Wind Cutter | 风压飞刃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_AM_BLAST | Anti Material Blast | 毁灭重击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_BANISHING_BUSTER | Vanishing Buster | 强制驱逐 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_B_TRAP | Binding Trap | 暗黑地狱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_C_MARKER | Crimson Marker | 血色烙印 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_D_TAIL | Dragon Tail | 魔兽摆尾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_E_CHAIN | Eternal Chain | 无限连锁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_FALLEN_ANGEL | Fallen Angel | 堕落天使 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_FIREDANCE | Fire Dance | 杀戮暗舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_FIRE_RAIN | Fire Rain | 火焰暴雨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_FLICKER | Flicker | 闪烁信号 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_HAMMER_OF_GOD | God's Hammer | 天神愤怒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_HEAT_BARREL | Hit Barrel | 加速子弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_H_MINE | Howling Mine | 破坏怒吼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_MASS_SPIRAL | Mass Spiral | 绝对贯穿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_P_ALTER | Platinum Altar | 白金祭坛 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_QD_SHOT | Quick Draw Shot | 瞬速子弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_RICHS_COIN | Rich's Coin | 富翁的财货 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_R_TRIP | Round Trip | 圆桌舞蹈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_SLUGSHOT | Slug Shot | 根源破坏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| RL_S_STORM | Shattering Storm | 粉碎风暴 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ABRACADABRA | Hocus-pocus | 随机技能 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ADVANCEDBOOK | Study | 进化之书 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_AUTOSPELL | Hindsight | 自动念咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_CASTCANCEL | Cast Cancel | 取消施法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_CLASSCHANGE | Class Change | 变换成Boss级魔物 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_COMA | Coma | 频死之术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_CREATECON | Create Elemental Converter | 元素肯贝特制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_DEATH | Grim Reaper | 死身 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_DELUGE | Deluge | 水元素领域 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_DISPELL | Dispell | 魔法效果解除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_DRAGONOLOGY | Dragonology | 龙知识 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ELEMENTFIRE | Elemental Change - Fire | 元素更换(火) | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ELEMENTGROUND | Elemental Change - Ground | 元素更换(地) | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ELEMENTWATER | Elemental Change - Water | 元素更换(水) | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_ELEMENTWIND | Elemental Change - Wind | 元素更换(风) | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_FLAMELAUNCHER | Endow Blaze | 火焰属性附加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_FORTUNE | Gold Digger | 宿命 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_FREECAST | Free Cast | 自由施法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_FROSTWEAPON | Endow Tsunami | 水属性附加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_FULLRECOVERY | Rejuvenation | 完全恢复 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_GRAVITY | Gravity | 重力术 | 本地译名，待用户校订 | 已有GBK说明，待游戏复核 |
| SA_INSTANTDEATH | Suicide | 当场死亡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_LANDPROTECTOR | Land Protector | 地元素领域 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_LEVELUP | Leveling | 升级 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_LIGHTNINGLOADER | Endow Tornado | 风属性附加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_MAGICROD | Magic Rod | 魔法惩罚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_MONOCELL | Mono Cell | 变换成波利 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_QUESTION | Questioning | 问号 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_REVERSEORCISH | Grampus Morph | 变成兽人面孔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_SEISMICWEAPON | Endow Quake | 地属性附加 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_SPELLBREAKER | Spell Breaker | 念咒拆除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_SUMMONMONSTER | Monster Chant | 召唤魔物 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_TAMINGMONSTER | Beastly Hypnosis | 认养宠物 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_VIOLENTGALE | Whirlwind | 风元素领域 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SA_VOLCANO | Volcano | 火元素领域 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_AUTOSHADOWSPELL | Shadow Spell | 自动魅影念咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_BLOODYLUST | Bloody Lust  | 血腥欲望 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_BODYPAINT | Body Painting | 人体彩绘 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_CHAOSPANIC | Chaos Panic  | 混沌恐慌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_DEADLYINFECT | Deadly Infection | 致命感染 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_DIMENSIONDOOR | Dimensional Door | 异次元之门 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_ENERVATION | Masquerade-Enervation | 面具:无力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_ESCAPE | Urgent Escape | 紧急脱身 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_FATALMENACE | Fatal Menace | 致命威胁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_FEINTBOMB | Feint Bomb | 虚击炸弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_GROOMY | Masquerade-Gloomy | 面具-忧郁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_IGNORANCE | Masquerade-Ignorance | 面具-无知 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_INVISIBILITY | Invisibility | 透明术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_LAZINESS | Masquerade-Laziness | 面具:懒散 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_MAELSTROM | Maelstrom | 漩涡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_MANHOLE | Manhole  | 人孔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_REPRODUCE | Reproduce | 繁殖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_SHADOWFORM | Shadow Formation | 魅影形态 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_STRIPACCESSARY | Divest Accessory  | 卸除配件 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_TRIANGLESHOT | Triangle Shot | 三角射击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_UNLUCKY | Masquerade-Unlucky | 面具-不幸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SC_WEAKNESS | Masquerade-Weakness | 面具-衰弱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_DEVIL | Solar, Lunar and Stellar Shadow  | 太阳和月亮和星星的恶魔 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_FEEL | Solar, Lunar and Stellar Perception | 太阳和月亮和星星的感觉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_FRIEND | Solar, Lunar and Stellar Team-Up | 太阳和月亮和星星的朋友 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_FUSION | Solar, Lunar and Stellar Union  | 太阳和月亮和星星的融合 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_HATE | Solar, Lunar and Stellar Opposition | 太阳和月亮和星星的憎恶 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_KNOWLEDGE | Solar, Lunar and Stellar Courier  | 太阳和月亮和星星的知识 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_MOON_ANGER | Lunar Wrath | 月亮的愤怒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_MOON_BLESS | Lunar Blessings | 月亮的祝福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_MOON_COMFORT | Lunar Protection | 月亮的平安感 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_MOON_WARM | Lunar Heat | 月亮的温暖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_STAR_ANGER | Stellar Wrath | 星星的愤怒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_STAR_BLESS | Stellar Blessings | 星星的祝福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_STAR_COMFORT | Stellar Protection | 星星的平安感 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_STAR_WARM | Stellar Heat | 星星的温暖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_SUN_ANGER | Solar Wrath | 太阳的愤怒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_SUN_BLESS | Solar Blessings | 太阳的祝福 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_SUN_COMFORT | Solar Protection | 太阳的平安感 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SG_SUN_WARM | Solar Heat | 太阳的温暖 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SHC_DANCING_KNIFE | Dancing Knife | 舞动短刃 | 本地译名，待用户校订 | 源表无说明 |
| SHC_ENCHANTING_SHADOW | Enchanting Shadow | 暗影附魔 | 本地译名，待用户校订 | 源表无说明 |
| SHC_ETERNAL_SLASH | Eternal Slash | 永恒斩击 | 本地译名，待用户校订 | 源表无说明 |
| SHC_FATAL_SHADOW_CROW | Fatal Shadow Claw | 致命暗影爪 | 本地译名，待用户校订 | 源表无说明 |
| SHC_IMPACT_CRATER | Impact Crater | 冲击陨坑 | 本地译名，待用户校订 | 源表无说明 |
| SHC_POTENT_VENOM | Potent Venom | 强效剧毒 | 本地译名，待用户校订 | 源表无说明 |
| SHC_SAVAGE_IMPACT | Savage Impact | 野蛮冲击 | 本地译名，待用户校订 | 源表无说明 |
| SHC_SHADOW_EXCEED | Shadow Exceed | 暗影超越 | 本地译名，待用户校订 | 源表无说明 |
| SHC_SHADOW_SENSE | Shadow Sense | 暗影感知 | 本地译名，待用户校订 | 源表无说明 |
| SHC_SHADOW_STAB | Shadow Stab | 暗影刺击 | 本地译名，待用户校订 | 源表无说明 |
| SJ_BOOKOFCREATINGSTAR | Star Creator's Book | 创星之书 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_BOOKOFDIMENSION | Book of Dimensions | 次元之书 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_DOCUMENT | Solar, Lunar, and Stellar Record | 太阳和月亮和星星的记录 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_FALLINGSTAR | Falling Stars | 流星陨落 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_FALLINGSTAR_ATK | Falling Star | 流星陨落 | 中文资源/已校订覆盖 | 源表无说明 |
| SJ_FALLINGSTAR_ATK2 | Falling Star | 流星陨落 | 中文资源/已校订覆盖 | 源表无说明 |
| SJ_FLASHKICK | Flash Kick | 闪光脚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_FULLMOONKICK | Full Moon Kick | 满月脚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_GRAVITYCONTROL | Gravity Control | 重力调整 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_LIGHTOFMOON | Lunar Luminance | 月亮光辉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_LIGHTOFSTAR | Stellar Luminance | 星星光辉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_LIGHTOFSUN | Solar Luminance | 太阳光辉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_LUNARSTANCE | Lunar Stance | 月亮英姿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_NEWMOONKICK | New Moon Kick | 朔月脚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_NOVAEXPLOSING | Nova Explosion | 新星爆发 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_PROMINENCEKICK | Blaze Kick | 红焰脚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_PURIFY | Solar, Lunar, and Stellar Purification | 太阳和月亮和星星的净化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_SOLARBURST | Solar Explosion | 太阳爆炸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_STAREMPEROR | Star Emperor's Descent | 星帝降临 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_STARSTANCE | Stellar Stance | 星星英姿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_SUNSTANCE | Solar Stance | 太阳英姿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SJ_UNIVERSESTANCE | Universal Stance | 宇宙英姿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_ALCHEMIST | Alchemist Spirit | 炼金术士的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_ASSASIN | Assassin Spirit | 刺客的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_BARDDANCER | Bard and Dancer Spirits | 诗人和舞娘的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_BLACKSMITH | Blacksmith Spirit | 铁匠的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_COLLECTOR | Soul Collector's Spirit | 黑暗搜集者之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_CRUSADER | Crusader Spirit | 十字军的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_DEATHKNIGHT | Deathknight Spirit | 死亡骑士之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_GUNNER | Gunslinger Spirit | 神枪手之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_HIGH | 1st Transcendent Spirit | 一转上等职业的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_HUNTER | Hunter Spirit | 猎人的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KAAHI | Kaahi | 凯阿希 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KAINA | Kaina | 凯易娜 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KAITE | Kaite | 凯易特 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KAIZEL | Kaizel | 凯易哲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KAUPE | Kaupe | 凯诬仆 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_KNIGHT | Knight Spirit | 骑士的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_MONK | Monk Spirit | 武僧的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_NINJA | Ninja Spirit | 忍者之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_PRIEST | Priest Spirit | 牧师的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_ROGUE | Rogue Spirit | 流氓的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SAGE | Sage Spirit | 贤者的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SKA | Eska | 艾斯卡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SKE | Eske | 艾斯克 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SMA | Esma | 艾斯麻 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SOULLINKER | Soul Linker Spirit | 悟灵士的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_STAR | Taekwon Master Spirit | 拳圣的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_STIN | Estin | 艾斯提 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_STUN | Estun | 艾斯敦 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SUPERNOVICE | Super Novice Spirit | 超级初心者的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_SWOO | Eswoo | 艾斯诬 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SL_WIZARD | Wizard Spirit | 巫师的灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_AUTOBERSERK | Berserk | 狂暴状态 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_BASH | Bash | 狂击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_ENDURE | Endure | 霸体 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_FATALBLOW | Fatal Blow | 攻击弱点 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_MAGNUM | Magnum Break | 怒爆 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_MOVINGRECOVERY | HP Recovery While Moving | 移动时恢复HP | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_PROVOKE | Provoke | 挑衅 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_RECOVERY | Increase HP Recovery | HP恢复力提升 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_SWORD | Sword Mastery | 剑术修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SM_TWOHAND | Two Handed Sword Mastery | 双手剑修炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SN_FALCONASSAULT | Falcon Assault | 猎鹰突击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SN_SHARPSHOOTING | Focused Arrow Strike | 锐利射击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SN_SIGHT | Falcon Eyes | 狙杀瞄准 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SN_WINDWALK | Wind Walker | 风之步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_ARRULLO | Arrullo | 摇篮曲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_CLOUD_KILL | Killing Cloud | 云杀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_DIAMONDDUST | Diamond Dust | 钻石星尘 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EARTHGRAVE | Earth Grave | 大地坟场 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EARTH_INSIGNIA | Earth Insignia | 地之纹章 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_ELECTRICWALK | Electric Walk | 电流步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_ELEMENTAL_SHIELD | Elemental Shield | 精灵结界 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EL_ACTION | Elemental Action | 精灵激发 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EL_ANALYSIS | Analyze Element | 元素分析 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EL_CONTROL | Spirit Control  | 精灵控制 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EL_CURE | Spirit Cure | 精灵治愈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_EL_SYMPATHY | Spirit Sympathy | 精灵交流 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_FIREWALK | Fire Walk | 火焰步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_FIRE_INSIGNIA | Fire Insignia | 火之纹章 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_POISON_BUSTER | Poison Burst | 剧毒猛击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_PSYCHIC_WAVE | Psychic Wave | 超自然波 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_SPELLFIST | Spell Fist | 魔力拳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_STRIKING | Striking | 打击强化 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_SUMMON_AGNI | Call Agni | 召唤火元素 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_SUMMON_AQUA | Call Aqua | 召唤水精灵阿库亚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_SUMMON_TERA | Call Tera | 召唤地精灵泰拉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_SUMMON_VENTUS | Call Ventus | 召唤风精灵梵图斯 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_VACUUM_EXTREME | Extreme Vacuum | 极限空虚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_VARETYR_SPEAR | Varetyr Spear | 圣枪刺击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_WARMER | Warmer | 加热术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_WATER_INSIGNIA | Water Insignia | 水之纹章 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SO_WIND_INSIGNIA | Wind Insignia | 风之纹章 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_CURSEEXPLOSION | Curse Explosion | 邪灵爆炸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_KAUTE | Kaute | 凯沃特 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SHA | Esha | 艾斯哈 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULCOLLECT | Soul Collection | 灵魂蓄积 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULCURSE | Evil Soul Curse | 邪恶灵魂诅咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULDIVISION | Soul Division | 灵魂分裂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULENERGY | Soul Energy Research | 灵魂能量研究 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULEXPLOSION | Soul Explosion | 灵魂爆炸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULFAIRY | Fairy Soul | 精灵灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULFALCON | Falcon Soul | 隼鹰灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULGOLEM | Golem Soul | 巨人灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULREAPER | Soul Harvest | 灵魂收割 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULREVOLVE | Soul Circulation | 灵魂循环 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULSHADOW | Shadow Soul | 影子灵魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SOULUNITY | Soul Bind | 灵魂集结 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SPA | Espa | 艾斯帕 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SP_SWHOO | Eswoo | 艾斯核 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_ASSIMILATEPOWER | Power Absorb | 吸气攻 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_CRESCENTELBOW | Crescent Elbow | 破碎柱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_CURSEDCIRCLE | Cursed Circle | 咒缚阵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_DRAGONCOMBO | Dragon Combo | 双龙脚 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_EARTHSHAKER | Earth Shaker | 地雷震 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_FALLENEMPIRE | Fallen Empire | 大缠崩坠 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_FLASHCOMBO | Flash Combo | 闪光连击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GATEOFHELL | Gates of Hell | 罗刹破凰击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GENTLETOUCH_CHANGE | Gentle Touch-Convert | 点穴-反 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GENTLETOUCH_CURE | Gentle Touch-Cure | 点穴-快 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GENTLETOUCH_ENERGYGAIN | Gentle Touch-Energy Gain | 点穴-球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GENTLETOUCH_QUIET | Gentle Touch-Silence | 点穴-默 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_GENTLETOUCH_REVITALIZE | Gentle Touch-Revitalize | 点穴-活 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_HOWLINGOFLION | Lion's Howl | 狮子吼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_KNUCKLEARROW | Knuckle Arrow | 修罗身弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_LIGHTNINGWALK | Lightning Walk | 闪电步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_POWERVELOCITY | Power Implantation | 全气注入 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_RAISINGDRAGON | Rising Dragon | 潜龙升天 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_RAMPAGEBLASTER | Rampage Blast | 爆气散弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_RIDEINLIGHTNING | Lightning Ride | 雷光弹 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_SKYNETBLOW | Sky Blow | 天罗地网 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_TIGERCANNON | Tiger Cannon | 虎炮 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SR_WINDMILL | Windmill | 旋风腿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ST_CHASEWALK | Stealth | 暗影追踪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ST_FULLSTRIP | Full Divestment | 所有卸除 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ST_PRESERVE | Preserve | 自由保护 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ST_REJECTSWORD | Counter Instinct | 霸王魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| ST_STEALBACKPACK | Steal Lunch Money | 背包偷窃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_ARCLOUSEDASH | Arclouze Dash | 卷甲虫暴冲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_BASIC_SKILL | New Basic Skill | 新基础技能 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_BITE | Bite | 狠咬 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_BUNCHOFSHRIMP | Bunch of Shrimp | 虾群 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_CHATTERING | Chattering | 喵喵不休 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_CN_METEOR | CN Meteor | 猫薄荷陨石 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_CN_POWDERING | CN Powdering | 猫薄荷撒粉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_FRESHSHRIMP | Fresh Shrimp | 鲜虾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_GROOMING | Grooming | 舔毛 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_HIDE | Hide | 躲藏 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_HISS | Hiss | 嘶嘶声 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_LOPE | Lope | 跳跃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_LUNATICCARROTBEAT | Lunatic Carrot Beat | 疯兔胡萝卜重击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_MEOWMEOW | Meow Meow | 喵喵 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_NYANGGRASS | Nyang Grass | 喵喵草 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_PICKYPECK | Picky Peck | 小鸡啄击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_POWEROFFLOCK | Power Of Lock | 喵喵威武 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_POWEROFLAND | Power of Land | 大地力量 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_POWEROFLIFE | Power of Life | 生命力量 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_POWEROFSEA | Power of Sea | 海洋力量 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_PURRING | Purring | 咕噜咕噜 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SCAROFTAROU | Scar of Tarou | 白鼠创伤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SCRATCH | Scratch | 抓伤 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SHRIMPARTY | Tasty Shrimp Party | 美味的鲜虾派对 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SOULATTACK | Soul Attack | 灵魂攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SPIRITOFLAND | Spirit Of Land | 大地之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SPIRITOFLIFE | Spirit Of Life | 生命之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SPIRITOFSEA | Spirit Of Sea | 海洋之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SPRITEMABLE | Sprite Mable | 灵魂魔珠 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_STOOP | Stoop | 俯身 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SVG_SPIRIT | Sprit Of Savage | 野猪之魂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SV_ROOTTWIST | SV Root Twist | 猕猴桃根茎缠绕 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_SV_STEMSPEAR | SV Stem Spear | 猕猴桃梗枪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_TUNABELLY | Tuna Belly | 金枪鱼肚肉 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| SU_TUNAPARTY | Tuna Party | 金枪鱼派对 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_BACKSLIDING | Back Slide | 后退回避 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_DETOXIFY | Detoxify | 解毒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_DOUBLE | Double Attack | 二刀连击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_HIDING | Hiding | 隐匿 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_MISS | Improve Dodge | 残影 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_PICKSTONE | Find Stone | 捡石头 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_POISON | Envenom | 施毒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_SPRINKLESAND | Sand Attack | 喷砂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_STEAL | Steal | 偷窃 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TF_THROWSTONE | Stone Fling | 投掷石头 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_COUNTER | Counter Kick | 还击踢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_DODGE | Tumbling | 落法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_DOWNKICK | Heel Drop | 砸踢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_HIGHJUMP | Leap | 跳高 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_HPTIME | Peaceful Break | 平安的休息 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_JUMPKICK | Flying Kick | 飞脚踢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_MISSION | Taekwon Mission | 太拳任务 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_POWER | Kihop | 加油 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_READYCOUNTER | Counter Kick Stance | 还击准备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_READYDOWN | Heel Drop Stance | 砸踢准备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_READYSTORM | Tornado Stance | 回旋准备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_READYTURN | Roundhouse Stance | 踢准备 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_RUN | Sprint | 跑步 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_SEVENWIND | Mild Wind | 温暖的风 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_SPTIME | Happy Break | 快乐的休息 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_STORMKICK | Tornado Kick | 回旋踢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TK_TURNKICK | Roundhouse | 转身踢 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| TR_AIN_RHAPSODY | Miner Rhapsody | 矿工狂想曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_GEF_NOCTURN | Geffenia Nocturne | 吉芬尼亚夜曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_JAWAII_SERENADE | Jawaii Serenade | 爪哇岛小夜曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_KVASIR_SONATA | Kvasir Sonata | 克瓦希尔奏鸣曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_METALIC_FURY | Metallic Fury | 金属狂怒 | 本地译名，待用户校订 | 源表无说明 |
| TR_MUSICAL_INTERLUDE | Musical Interlude | 音乐间奏 | 本地译名，待用户校订 | 源表无说明 |
| TR_MYSTIC_SYMPHONY | Mystic Symphony | 神秘交响曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_NIPELHEIM_REQUIEM | Nifflheim Requiem | 尼芙菲姆安魂曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_PRON_MARCH | Prontera March | 普隆德拉进行曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_RETROSPECTION | Retrospection | 追忆 | 本地译名，待用户校订 | 源表无说明 |
| TR_RHYTHMSHOOTING | Rhythm Shooting | 节奏射击 | 本地译名，待用户校订 | 源表无说明 |
| TR_ROKI_CAPRICCIO | Loki Capriccio | 洛基随想曲 | 本地译名，待用户校订 | 源表无说明 |
| TR_ROSEBLOSSOM | Rose Blossom | 玫瑰绽放 | 本地译名，待用户校订 | 源表无说明 |
| TR_SOUNDBLEND | Sound Blend | 音律融合 | 本地译名，待用户校订 | 源表无说明 |
| TR_STAGE_MANNER | Stage Etiquette | 舞台礼仪 | 本地译名，待用户校订 | 源表无说明 |
| WA_MOONLIT_SERENADE | Moonlight Serenade | 月光小夜曲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WA_SWING_DANCE | Swing Dance | 摇摆舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WA_SYMPHONY_OF_LOVER | Lover Symphony | 恋人交响乐 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_BABY | Mom, Dad, I love you! | 爸妈我爱您 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_CALLALLFAMILY | Let's Go Family! | 当我们同在一起 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_CALLBABY | Come to me, honey~ | 宝贝请来这里 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_CALLPARENT | Mom, Dad, I miss you! | 爸妈我想念您 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_CALLPARTNER | Romantic Rendeavous!! | 想念你 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_CHEERUP | Go! Parents Go! | 爸比妈咪请加油 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_FEMALE | Undying Love | 只为你牺牲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_MALE | Loving Touch | 只呵护妳 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WE_ONEFOREVER | Love Conquers Death | 生生世世永不分离 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WH_ADVANCED_TRAP | Advanced Trap | 高级陷阱 | 本地译名，待用户校订 | 源表无说明 |
| WH_CALAMITYGALE | Calamity Gale | 灾厄疾风 | 本地译名，待用户校订 | 源表无说明 |
| WH_CRESCIVE_BOLT | Crescive Bolt | 递增箭矢 | 本地译名，待用户校订 | 源表无说明 |
| WH_DEEPBLINDTRAP | Deep Blind Trap | 深度致盲陷阱 | 本地译名，待用户校订 | 源表无说明 |
| WH_FLAMETRAP | Flame Trap | 火焰陷阱 | 本地译名，待用户校订 | 源表无说明 |
| WH_GALESTORM | Gale Storm | 疾风暴雨 | 本地译名，待用户校订 | 源表无说明 |
| WH_HAWKBOOMERANG | Hawk Boomerang | 战鹰回旋 | 本地译名，待用户校订 | 源表无说明 |
| WH_HAWKRUSH | Hawk Rush | 战鹰突袭 | 本地译名，待用户校订 | 源表无说明 |
| WH_HAWK_M | Hawk Mastery | 战鹰修炼 | 本地译名，待用户校订 | 源表无说明 |
| WH_NATUREFRIENDLY | Nature's Friend | 自然之友 | 本地译名，待用户校订 | 源表无说明 |
| WH_SOLIDTRAP | Solid Trap | 坚固陷阱 | 本地译名，待用户校订 | 源表无说明 |
| WH_SWIFTTRAP | Swift Trap | 迅捷陷阱 | 本地译名，待用户校订 | 源表无说明 |
| WH_WIND_SIGN | Wind Sign | 风之印记 | 本地译名，待用户校订 | 源表无说明 |
| WL_CHAINLIGHTNING | Chain Lightning | 连锁电击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_COMET | Comet | 毁灭彗星 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_CRIMSONROCK | Crimson Rock | 碧血陨石 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_DRAINLIFE | Drain Life | 吸星大法 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_EARTHSTRAIN | Earth Strain | 地牛翻身 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_FREEZE_SP | Freezing Spell | 魔法保存 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_FROSTMISTY | Frost Misty | 寒冰浓雾 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_HELLINFERNO | Hell Inferno | 地狱火焰 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_JACKFROST | Jack Frost | 冻僵术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_MARSHOFABYSS | Marsh Of Abyss | 深渊沼地 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_RADIUS | Radius | 半径扩大 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_READING_SB | Reading Spell Book | 阅读魔法书 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_READING_SB_READING | Reading Spell Book | 阅读魔法书 | 中文资源/已校订覆盖 | 源表无说明 |
| WL_RECOGNIZEDSPELL | Recognized Spell | 魔法醒悟 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_RELEASE | Release | 释放 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SIENNAEXECRATE | Sienna Execrate | 石化诅咒 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SOULEXPANSION | Soul Expansion | 灵魂爆炸 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_STASIS | Stasis | 魔力冻结 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SUMMONBL | Summon Lightning Ball | 召唤雷电球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SUMMONFB | Summon Fire Ball | 召唤火焰球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SUMMONSTONE | Summon Stone | 召唤石块 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_SUMMONWB | Summon Water Ball | 召唤水球 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_TELEKINESIS_INTENSE | Intensification | 终极念力 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_TETRAVORTEX | Tetra Vortex | 属性漩涡 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WL_WHITEIMPRISON | White Imprison | 白色监狱 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_BEYOND_OF_WARCRY | Warcry from Beyond | 战嚎的彼端 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_DANCE_WITH_WUG | Dances with Wargs | 与狼共舞 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_DEADHILLHERE | Death Valley | 死亡峡谷 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_DOMINION_IMPULSE | Dominion Impulse | 支配动力 | 中文资源/已校订覆盖 | 源表无说明 |
| WM_FRIGG_SONG | Frigg's Song | 丰年颂 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_GLOOMYDAY | Gloomy Shyness | 羞怯一天的忧郁 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_GREAT_ECHO | Great Echo | 巨大共鸣 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_LERADS_DEW | Lerad's Dew | 雷拉多露水 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_LESSON | Voice Lessons | 课程 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_LULLABY_DEEPSLEEP | Deep Sleep Lullaby | 沉睡摇篮曲 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_MELODYOFSINK | Sinking Melody | 消沉旋律 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_METALICSOUND | Metallic Sound | 重金属音乐 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_POEMOFNETHERWORLD | Song of Despair | 绝望之歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_RANDOMIZESPELL | Improvised Song | 不确定要素的语言 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_REVERBERATION | Reverberation | 残响 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_SATURDAY_NIGHT_FEVER | Saturday Night Fever | 狂欢周末夜 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_SEVERE_RAINSTORM | Severe Rainstorm | 大暴雨 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_SIRCLEOFNATURE | Circle of Nature | 循环的大自然之音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_SONG_OF_MANA | Song Of Mana | 魔力之歌 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_SOUND_OF_DESTRUCTION | Song of Destruction | 毁灭之声 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_UNLIMITED_HUMMING_VOICE | Infinite Humming | 无限哼唱声 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WM_VOICEOFSIREN | Siren's Voice | 塞壬之音 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_CARTBOOST | Cart Boost | 手推车加速 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_CARTTERMINATION | High Speed Cart Ram | 手推车终结技 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_CREATECOIN | Coin Craft | 金钱铸造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_CREATENUGGET | Nugget Craft | 金属块制造 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_MELTDOWN | Shattering Strike | 野蛮凶砍 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_OVERTHRUSTMAX | Maximum Power-Thrust | 凶砍最大值 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_SYSTEMCREATE | Battle Machine Craft | 攻击塔制作 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WS_WEAPONREFINE | Upgrade Weapon | 武器精炼 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_EARTHSPIKE | Earth Spike | 地震术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_ESTIMATION | Sense | 怪物情报 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_FIREIVY | Fire Ivy | 火焰藤蔓 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_FIREPILLAR | Fire Pillar | 火柱攻击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_FROSTNOVA | Frost Nova | 霜冻之术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_HEAVENDRIVE | Heaven's Drive | 崩裂术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_ICEWALL | Ice Wall | 冰刃之墙 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_JUPITEL | Jupitel Thunder | 雷鸣术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_METEOR | Meteor Storm | 陨石术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_QUAGMIRE | Quagmire | 泥沼地 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_SIGHTBLASTER | Sight Blaster | 火狩芽 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_SIGHTRASHER | Sightrasher | 火之猎杀 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_STORMGUST | Storm Gust | 暴风雪 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_VERMILION | Lord of Vermilion | 怒雷强击 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |
| WZ_WATERBALL | Waterball | 水球术 | 中文资源/已校订覆盖 | 已有GBK说明，待游戏复核 |

## 界面文字明细

规则条数不等于可见控件数量；无匹配的规则不计为已显示汉化。

| 原文匹配 | 中文 | 源代码匹配次数 |
| --- | --- | --- |
| >Make a Room< | >创建聊天室< | 1 |
| >Title :< | >标题：< | 1 |
| >Limit :< | >人数上限：< | 1 |
| >Type :< | >类型：< | 1 |
| >Chat Room< | >聊天室< | 2 |
| >Restrict :< | >限制：< | 1 |
| >Sign :< | >密码：< | 1 |
| >Roulette< | >抽奖转盘< | 1 |
| >Points:< | >点数：< | 1 |
| >Spin< | >开始< | 1 |
| >Info< | >说明< | 1 |
| >Get Prize< | >领取奖励< | 1 |
| >Result:< | >结果：< | 1 |
| >Pet Info< | >宠物信息< | 2 |
| >Homunculus Info< | >使魔信息< | 2 |
| >Mercenary Info< | >佣兵信息< | 2 |
| >Name< | >名称< | 8 |
| >Level< | >等级< | 4 |
| >Hunger< | >饥饿度< | 1 |
| >Intimacy< | >亲密度< | 1 |
| >Accessory< | >饰品< | 2 |
| >Equipped< | >已装备< | 2 |
| >Auto Feeding< | >自动喂食< | 2 |
| >Feed Pet< | >喂食宠物< | 1 |
| >Performance< | >动作< | 1 |
| >Return to Egg Shell< | >收回宠物< | 1 |
| >Unequip Accessory< | >卸下饰品< | 1 |
| >Time Left< | >剩余时间< | 0 |
| >Kills< | >击杀数< | 0 |
| >Faith< | >信仰< | 0 |
| >Show Equip< | >显示装备< | 5 |
| >Show Costume< | >显示时装< | 1 |
| >Show Monsters< | >显示魔物< | 2 |
| >Show Quest< | >显示任务< | 1 |
| >Skill List< | >技能列表< | 2 |
| >Skill Tree< | >技能树< | 1 |
| >Character Info< | >角色信息< | 1 |
| >Guild Info< | >公会信息< | 2 |
| >Party Window< | >队伍窗口< | 1 |
| >Bank< | >银行< | 1 |
| >Storage< | >仓库< | 4 |
| >Status< | >状态< | 6 |
| >Mail< | >邮件< | 3 |
| >Description< | >说明< | 1 |
| >Position< | >位置< | 2 |
| >Next< | >下一页< | 2 |
| >Previous< | >上一页< | 1 |
| >Close< | >关闭< | 1 |
| >Delete< | >删除< | 2 |
| >Reset< | >重置< | 1 |
| >Read< | >阅读< | 2 |
| >OK< | >确定< | 2 |
| >cancel< | >取消< | 1 |
| >Default< | >默认< | 2 |
| >Left< | >左侧< | 1 |
| >Top< | >顶部< | 1 |
| >Right< | >右侧< | 1 |
| >Color< | >彩色< | 1 |
| >Han< | >汉化< | 1 |
| >Hidden< | >隐藏< | 1 |
| >All on< | >全部开启< | 1 |
| >Public Log< | >公共记录< | 0 |
| >Public Chat< | >公共聊天< | 0 |
| >Whisper< | >私聊< | 1 |
| >Party< | >队伍< | 7 |
| >Guild< | >公会< | 1 |
| >Item< | >物品< | 2 |
| >Equipment on/off< | >装备开关< | 0 |
| >Abnormal Status< | >异常状态< | 0 |
| >Party Item< | >队伍物品< | 0 |
| >Party Status< | >队伍状态< | 0 |
| >Skill Fail< | >技能失败< | 0 |
| >Party Setup< | >队伍设置< | 3 |
| >Equip Damage< | >装备损坏< | 0 |
| >Party Search< | >队伍搜索< | 0 |
| >Battle< | >战斗< | 1 |
| >Party Battle< | >队伍战斗< | 0 |
| >Party EXP< | >队伍经验< | 0 |
| >Quest< | >任务< | 6 |
| >Battlefield< | >战场< | 0 |
| >Clan< | >氏族< | 1 |
| >Achievement Challenges< | >成就挑战< | 1 |
| >Achievement< | >成就< | 3 |
| >Attendance Check< | >签到< | 2 |
| >Available Items< | >可用物品< | 1 |
| >Available Items for Buying< | >可购买物品< | 1 |
| >Available Items for selling< | >可出售物品< | 1 |
| >Available Items for Vending< | >可摆摊物品< | 1 |
| >Basic Info< | >基本信息< | 2 |
| >Basic Information< | >基本信息< | 4 |
| >Battleground< | >战场< | 3 |
| >Cash Point< | >现金点< | 1 |
| >Cart Decoration< | >手推车装饰< | 1 |
| >Cart Window< | >手推车窗口< | 1 |
| >Chat History< | >聊天记录< | 1 |
| >Check Reward< | >查看奖励< | 1 |
| >Clan Info< | >氏族信息< | 1 |
| >Clan level< | >氏族等级< | 1 |
| >Clan mark< | >氏族标志< | 1 |
| >Clan Name< | >氏族名称< | 1 |
| >Clean cache< | >清理缓存< | 1 |
| >Cleaning cache...< | >正在清理缓存……< | 1 |
| >Click anywhere to close< | >点击任意位置关闭< | 1 |
| >Complete< | >完成< | 1 |
| >Contents< | >内容< | 1 |
| >Costume< | >时装< | 5 |
| >Create Party< | >创建队伍< | 4 |
| >Cursor< | >鼠标指针< | 2 |
| >Damage Font< | >伤害字体< | 1 |
| >Day< | >天< | 1 |
| >Details< | >详情< | 1 |
| >Devotion< | >贡献度< | 1 |
| >Disable Virtual Mouse< | >禁用虚拟鼠标< | 1 |
| >Disband< | >解散< | 1 |
| >Display Name< | >显示名称< | 1 |
| >Effect< | >效果< | 1 |
| >Emblem< | >徽章< | 1 |
| >Emotion icon List< | >表情图标列表< | 1 |
| >Emotion List< | >表情列表< | 1 |
| >Enchant< | >附魔< | 1 |
| >Equipment< | >装备< | 5 |
| >Even Share< | >平均分配< | 1 |
| >Expel History< | >驱逐记录< | 1 |
| >FPS Display< | >显示 FPS< | 1 |
| >FPS Limit< | >FPS 上限< | 1 |
| >Free Points< | >自由点数< | 1 |
| >Friend Setup< | >好友设置< | 3 |
| >Friends List< | >好友列表< | 1 |
| >Friends< | >好友< | 6 |
| >General< | >通用< | 6 |
| >Guild Companion< | >公会助手< | 1 |
| >Guild lvl< | >公会等级< | 1 |
| >Guild Master< | >公会会长< | 1 |
| >Guild Name< | >公会名称< | 2 |
| >Guild Notice< | >公会公告< | 1 |
| >Guild Skill< | >公会技能< | 1 |
| >Guildsmen Info< | >公会成员信息< | 1 |
| >Guildsmen< | >公会成员< | 1 |
| >Homunculus State< | >生命体状态< | 1 |
| >Hostile Clan< | >敌对氏族< | 1 |
| >How to share EXP< | >如何分配 EXP< | 1 |
| >How to share Items< | >如何分配物品< | 1 |
| >Incomplete< | >未完成< | 1 |
| >Individual< | >个人< | 1 |
| >Input number< | >输入数字< | 1 |
| >Instant Mode< | >即时模式< | 1 |
| >Interface< | >界面< | 1 |
| >Inventory (Alt + E)< | >物品栏（Alt + E）< | 3 |
| >Inventory< | >物品栏< | 4 |
| >Invitation< | >邀请< | 1 |
| >Item Filter< | >物品筛选< | 1 |
| >Item Sharing type< | >物品分配方式< | 1 |
| >Item Window< | >物品窗口< | 1 |
| >Items wanted< | >需求物品< | 1 |
| >Job Lv. < | >职业等级：< | 5 |
| >Join a guild or start your own!< | >加入公会，或创建属于自己的公会！< | 1 |
| >Leave Party< | >离开队伍< | 2 |
| >Lowest HP< | >最低 HP< | 1 |
| >Mail List< | >邮件列表< | 1 |
| >Master Name< | >会长名称< | 1 |
| >Mercenary State< | >佣兵状态< | 1 |
| >Merchant Shop< | >商人商店< | 1 |
| >Message< | >消息< | 2 |
| >Mouse Move< | >鼠标移动< | 1 |
| >Navigation< | >导航< | 4 |
| >No results found< | >未找到结果< | 1 |
| >Note< | >备注< | 1 |
| >Open 1:1 Chat between Friends< | >打开好友私聊< | 1 |
| >Open 1:1 Chat between Strangers< | >打开陌生人私聊< | 1 |
| >Option (Esc)< | >选项（Esc）< | 3 |
| >Party (Alt + Z)< | >队伍（Alt + Z）< | 3 |
| >Party Invitation< | >队伍邀请< | 2 |
| >Party Name:< | >队伍名称：< | 1 |
| >Party Share< | >队伍分配< | 1 |
| >Point(s)< | >点数< | 1 |
| >Position Title< | >职位名称< | 1 |
| >Price limit: %s Zeny< | >价格上限：%s Zeny< | 1 |
| >Purchase Zeny Limit< | >购买 Zeny 上限< | 1 |
| >Purchase< | >购买< | 1 |
| >Quest Information< | >任务信息< | 2 |
| >Quest List (Alt + U)< | >任务列表（Alt + U）< | 3 |
| >Rank< | >排名< | 1 |
| >Read Mail< | >阅读邮件< | 1 |
| >Reward< | >奖励< | 1 |
| >Screen Resolution< | >屏幕分辨率< | 1 |
| >Select Option< | >选择选项< | 1 |
| >Send Message< | >发送消息< | 2 |
| >Server List< | >服务器列表< | 1 |
| >Short Cuts< | >快捷栏< | 1 |
| >ShortCuts< | >快捷栏< | 1 |
| >Sit/Stand< | >坐下／站立< | 1 |
| >Skill Points: < | >技能点数：< | 3 |
| >SkillTree (Alt + S)< | >技能树（Alt + S）< | 3 |
| >Sound< | >声音< | 2 |
| >Activate lock function< | >启用锁定< | 2 |
| >Deactivate lock function< | >解除锁定< | 2 |
| >Advanced< | >高级< | 1 |
| >Alliance< | >同盟< | 1 |
| >Ally Clan< | >同盟氏族< | 1 |
| >Antagonist< | >敌对公会< | 1 |
| >Attack Target Mode< | >攻击目标模式< | 1 |
| >Auto Hide UI< | >自动隐藏界面< | 1 |
| >Auto Read< | >自动阅读< | 2 |
| >Avg.lvl of Guildsmen< | >成员平均等级< | 1 |
| >Axis Threshold< | >摇杆阈值< | 1 |
| >Bank (Ctrl + B)< | >银行（Ctrl + B）< | 3 |
| >Basic< | >基本< | 1 |
| >Bloom< | >泛光< | 1 |
| >Blur< | >模糊< | 1 |
| >Bookmark< | >书签< | 1 |
| >Buy List< | >购买列表< | 1 |
| >Buying Items< | >购买物品< | 1 |
| >Buying< | >购买< | 1 |
| >CartItems< | >手推车物品< | 1 |
| >ChangeCart< | >更换手推车< | 1 |
| >Chat Bar Size< | >聊天栏大小< | 1 |
| >Closest< | >最近< | 1 |
| >Consumption items are used in the synthesis. Are you sure?< | >合成将消耗所需物品，确定继续吗？< | 1 |
| >create guild< | >创建公会< | 1 |
| >Downgrade< | >降级< | 1 |
| >Each Take< | >各自取得< | 2 |
| >Equip (Alt + Q)< | >装备（Alt + Q）< | 3 |
| >Etc< | >其他< | 2 |
| >Expel from party< | >移出队伍< | 1 |
| >Full Client< | >完整客户端< | 1 |
| >Gamepad< | >手柄< | 1 |
| >Guild (Alt + G)< | >公会（Alt + G）< | 3 |
| >Managed Territory< | >管理领地< | 1 |
| >Normal< | >普通< | 1 |
| >Off< | >关闭< | 2 |
| >Passive< | >被动< | 1 |
| >Perfect< | >完美< | 1 |
| >Pet Evolution< | >宠物进化< | 1 |
| >Player Name:< | >角色名称：< | 1 |
| >Point< | >点数< | 1 |
| >Prev< | >上一页< | 1 |
| >Punish< | >惩罚< | 1 |
| >Quick-Cast Mode< | >快速施法模式< | 1 |
| >Release Mode< | >松开施放模式< | 1 |
| >Replay< | >回放< | 3 |
| >Reputation Status< | >声望状态< | 1 |
| >Resets all enchant slots.< | >重置所有附魔栏位。< | 1 |
| >Resolution Details< | >分辨率详情< | 1 |
| >Resolution< | >分辨率< | 1 |
| >Sell List< | >出售列表< | 1 |
| >Selling Items< | >出售物品< | 1 |
| >Shared< | >共享< | 1 |
| >Shop Items< | >商店物品< | 1 |
| >ShortCut Description< | >快捷键说明< | 2 |
| >Shortcut key setting window< | >快捷键设置窗口< | 1 |
| >Skill Bar Size< | >技能栏大小< | 1 |
| >Skill Bar< | >技能栏< | 1 |
| >Sort Mini Party Window< | >迷你队伍窗口排序< | 1 |
| >Status (Alt + A)< | >状态（Alt + A）< | 3 |
| >Swap L3-R3 Sticks< | >交换 L3/R3 摇杆< | 1 |
| >Target:< | >目标：< | 1 |
| >Tax Point< | >税率< | 2 |
| >Tendency< | >倾向< | 1 |
| >Territory< | >领地< | 1 |
| >The number of members< | >成员数量< | 1 |
| >The Reason of Expulsion< | >驱逐原因< | 1 |
| >Tipbox (Alt + D)< | >提示（Alt + D）< | 2 |
| >Title< | >标题< | 6 |
| >Toggle< | >切换< | 5 |
| >Total : < | >合计：< | 3 |
| >Unknown< | >未知< | 1 |
| >Upgrade< | >升级< | 2 |
| >Use Free Points< | >使用自由点数< | 1 |
| >Uses the next available slot.< | >使用下一个可用栏位。< | 1 |
| >Vending< | >摆摊< | 1 |
| >Version< | >版本< | 1 |
| >Vibrance< | >自然饱和度< | 1 |
| >Weight : < | >负重：< | 5 |
| >Weight:< | >负重：< | 1 |
| >Weigth:< | >负重：< | 1 |
| >Window< | >窗口< | 1 |
| >World Map< | >世界地图< | 1 |
| >Skill bar 1-1< | >技能栏 1-1< | 1 |
| >Skill bar 1-2< | >技能栏 1-2< | 1 |
| >Skill bar 1-3< | >技能栏 1-3< | 1 |
| >Skill bar 1-4< | >技能栏 1-4< | 1 |
| >Skill bar 1-5< | >技能栏 1-5< | 1 |
| >Skill bar 1-6< | >技能栏 1-6< | 1 |
| >Skill bar 1-7< | >技能栏 1-7< | 1 |
| >Skill bar 1-8< | >技能栏 1-8< | 1 |
| >Skill bar 1-9< | >技能栏 1-9< | 1 |
| >Skill bar 2-1< | >技能栏 2-1< | 1 |
| >Skill bar 2-2< | >技能栏 2-2< | 1 |
| >Skill bar 2-3< | >技能栏 2-3< | 1 |
| >Skill bar 2-4< | >技能栏 2-4< | 1 |
| >Skill bar 2-5< | >技能栏 2-5< | 1 |
| >Skill bar 2-6< | >技能栏 2-6< | 1 |
| >Skill bar 2-7< | >技能栏 2-7< | 1 |
| >Skill bar 2-8< | >技能栏 2-8< | 1 |
| >Skill bar 2-9< | >技能栏 2-9< | 1 |
| >Skill bar 3-1< | >技能栏 3-1< | 1 |
| >Skill bar 3-2< | >技能栏 3-2< | 1 |
| >Skill bar 3-3< | >技能栏 3-3< | 1 |
| >Skill bar 3-4< | >技能栏 3-4< | 1 |
| >Skill bar 3-5< | >技能栏 3-5< | 1 |
| >Skill bar 3-6< | >技能栏 3-6< | 1 |
| >Skill bar 3-7< | >技能栏 3-7< | 1 |
| >Skill bar 3-8< | >技能栏 3-8< | 1 |
| >Skill bar 3-9< | >技能栏 3-9< | 1 |
| >Skill bar 4-1< | >技能栏 4-1< | 1 |
| >Skill bar 4-2< | >技能栏 4-2< | 1 |
| >Skill bar 4-3< | >技能栏 4-3< | 1 |
| >Skill bar 4-4< | >技能栏 4-4< | 1 |
| >Skill bar 4-5< | >技能栏 4-5< | 1 |
| >Skill bar 4-6< | >技能栏 4-6< | 1 |
| >Skill bar 4-7< | >技能栏 4-7< | 1 |
| >Skill bar 4-8< | >技能栏 4-8< | 1 |
| >Skill bar 4-9< | >技能栏 4-9< | 1 |
| message log settings | 聊天记录设置 | 1 |
| Sound Settings | 声音设置 | 1 |
| Graphics Settings | 图像设置 | 1 |
| >Reset to Default Values< | >恢复默认设置< | 1 |
| >Full Screen</option> | >全屏</option> | 2 |
| >Unlimited</option> | >无限制</option> | 1 |
| &lt; Command &gt; | &lt; 指令 &gt; | 1 |
| >Select slot for < | >选择技能栏位：< | 1 |
| Use L2/R2 to change tab, D-pad to navigate slot, A to select, Select to cancel | 使用 L2/R2 切换页签，方向键选择栏位，A 确定，Select 取消 | 1 |
| Graphics Context Lost | 图形上下文已丢失 | 1 |
| The browser lost connection to the GPU. | 浏览器与 GPU 的连接已断开。 | 1 |
| Attempting to restore automatically... | 正在尝试自动恢复…… | 1 |
| >Settings< | >设置< | 0 |
| > Save Files</label> | > 保存文件</label> | 1 |
| /> Services </label> | /> 服务 </label> | 1 |
| Show official cursor | 显示系统鼠标指针 | 2 |
| placeholder="Item Search" | placeholder="物品搜索" | 1 |
| placeholder="Search..." | placeholder="搜索……" | 1 |
| placeholder="No file selected" | placeholder="未选择文件" | 1 |
| data-title="Account Limited" | data-title="账号限制" | 1 |
| data-title="Permanent Equipment" | data-title="永久装备" | 1 |
| data-title="Rental Equipment" | data-title="租赁装备" | 1 |
| data-title="Popular" | data-title="热门" | 1 |
| data-title="Consumables" | data-title="消耗品" | 1 |
| data-title="Scrolls" | data-title="卷轴" | 1 |
| data-title="Armor" | data-title="防具" | 1 |
| data-title="Weapon" | data-title="武器" | 1 |
| data-title="Cash" | data-title="现金点" | 1 |
| data-title="Card" | data-title="卡片" | 1 |
| data-title="Other" | data-title="其他" | 1 |
| data-title="Limited Sale" | data-title="限时特卖" | 1 |
| data-title="New" | data-title="新品" | 1 |
| >Use< | >使用< | 0 |
| START NOW | 立即开始 | 1 |
| SAVE SETTINGS | 保存设置 | 1 |
| Trade : <span | 交易：<span | 1 |
| Hello, illegal software is being monitored. | 正在监测非法软件。 | 1 |
| Please enter the text below within the specified time. | 请在规定时间内输入下方文字。 | 1 |
| If you enter the text wrong three times, you will get banned | 连续三次输入错误将被封禁。 | 1 |
| Remaining chance: 3 | 剩余次数：3 | 1 |
| placeholder="Captcha Answer" | placeholder="请输入验证码" | 2 |
| Saves current chat tab to txt file. | 将当前聊天页签保存为文本文件。 | 1 |
