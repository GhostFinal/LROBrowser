import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import { EXTRA_SKILL_NAMES } from './lastro-skill-extra.mjs';
import { SKILL_NAME_OVERRIDES } from './lastro-skill-localization.mjs';
import { readSkillSource } from './lastro-skill-data.mjs';
import { JOB_NAME_OVERRIDES, RUNTIME_TEXT_REPLACEMENTS } from './lastro-localization.mjs';

const runtime = readFileSync(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
const names = Object.fromEntries([...runtime.matchAll(/SkillInfo\[SkillConst_default\.([A-Z0-9_]+)\]\s*=\s*\{\s*Name:\s*"[^"]*",\s*SkillName:\s*"([^"]*)"/g)].map(m => [m[1], m[2]]));
const descriptions = readSkillSource('skilldescript_re_05.lua');
const descKeys = new Set([...descriptions.matchAll(/\[SKID\.([A-Z0-9_]+)\]\s*=\s*\{/g)].map(m => m[1]));
const keys = [...new Set([...Object.keys(names), ...Object.keys(SKILL_NAME_OVERRIDES)])].sort();
const isChinese = text => /[\u3400-\u9fff]/u.test(text || '');
const preserved = new Set(['HFLI_SBR44']);
const pending = keys.filter(key => !isChinese(SKILL_NAME_OVERRIDES[key]) && !preserved.has(key));
const translated = keys.filter(key => isChinese(SKILL_NAME_OVERRIDES[key])).length;
const rows = keys.map(key => [key, names[key] || '资源新增', SKILL_NAME_OVERRIDES[key] || names[key], preserved.has(key) ? '保留技能代号' : EXTRA_SKILL_NAMES[key] ? '本地译名，待用户校订' : isChinese(SKILL_NAME_OVERRIDES[key]) ? '中文资源/已校订覆盖' : '待翻译', descKeys.has(key) ? '已有GBK说明，待游戏复核' : '源表无说明']);
const safe = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const md = table => table.map(row => '| ' + row.map(safe).join(' | ') + ' |').join('\n');
const text = `# LASTRO 汉化核对表

由 node scripts/audit-localization.mjs 生成。统计范围为本地源代码和资源，不能代替登录游戏后的显示验证。

| 项目 | 数量 / 状态 |
| --- | --- |
| 技能条目（运行时与中文资源并集） | ${keys.length} |
| 技能名称中文覆盖 | ${translated} |
| 保留技能代号 | ${preserved.size}（S.B.R.44） |
| 本轮补充的本地译名 | ${Object.keys(EXTRA_SKILL_NAMES).length}（非官方地区译名声明） |
| 待翻译技能名称 | ${pending.length} |
| 现有 GBK 技能说明条目 | ${descKeys.size} |
| 职业名称覆盖规则 | ${Object.keys(JOB_NAME_OVERRIDES).length} |
| 界面文字替换规则 | ${RUNTIME_TEXT_REPLACEMENTS.length} |

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

${md([['技能常量', '运行时原文', '当前中文名称', '名称状态', '说明状态'], ['---','---','---','---','---'], ...rows])}

## 界面文字明细

规则条数不等于可见控件数量；无匹配的规则不计为已显示汉化。

${md([['原文匹配', '中文', '源代码匹配次数'], ['---','---','---'], ...RUNTIME_TEXT_REPLACEMENTS.map(([a,b]) => [a,b,runtime.split(a).length-1])])}
`;
writeFileSync(new URL('../docs/lastro-localization-progress.md', import.meta.url), text);
process.stdout.write(JSON.stringify({ skills: keys.length, translated, preserved: preserved.size, descriptions: descKeys.size, pending: pending.map(key => [key,names[key] || SKILL_NAME_OVERRIDES[key]]) }, null, 2) + '\n');
