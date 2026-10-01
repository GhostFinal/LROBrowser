import { createRequire } from 'node:module';
import ts from 'typescript';
import { RUNTIME_TEXT_REPLACEMENTS } from './lastro-localization.mjs';

const require = createRequire(import.meta.url);
const { parseFragment } = createRequire(require.resolve('jsdom/package.json'))('parse5');
const normalizeText = text => text.trim().replace(/\s+/gu, ' ');
const commonText = new Map(RUNTIME_TEXT_REPLACEMENTS
  .filter(([from, to]) => /^>[^<>]+<$/.test(from) && /^>[^<>]+<$/.test(to))
  .map(([from, to]) => [normalizeText(from.slice(1, -1)), normalizeText(to.slice(1, -1))]));

for (const [from, to] of Object.entries({
  'Púb.': '公开',
  'Priv.': '私密',
  'Num:': '数量：',
  '1:1 Chat': '私聊',
  "Adventurer's Agency": '冒险者招募',
  'Alarm when receive a 1:1 Chat': '收到私聊时提醒',
  'Create Guild': '创建公会',
  'Tax': '税率',
  'on': '开启',
  'Pixel Perfect Sprites': '像素精确精灵',
  'Force nearest neighbor filtering': '使用最近邻过滤',
  'Intensity:': '强度：',
  'Area:': '范围：',
  'Contr. Adapt. Sharp. (CAS)': '对比度自适应锐化（CAS）',
  'Contrast:': '对比度：',
  'Sharpening:': '锐化：',
  'Subpix:': '子像素：',
  'Edge Threshold:': '边缘阈值：',
  'Cartoon': '卡通效果',
  'Power:': '强度：',
  'Edge Slope:': '边缘斜率：',
  'Performance Mode': '性能模式',
  'Culling Area:': '显示范围：',
  'Force nearest neighbor filtering for pixel-perfect sprite rendering': '使用最近邻过滤，保持精灵像素清晰',
  'Add a glowing bloom effect to bright areas': '为明亮区域添加泛光效果',
  'Apply a blur effect to the screen': '为画面添加模糊效果',
  'Contrast Adaptive Sharpening for enhanced details': '通过对比度自适应锐化增强细节',
  'Fast Approximate Anti-Aliasing for smoother edges': '使用快速近似抗锯齿使边缘更平滑',
  'Cartoon rendering effect for stylized visuals': '使用卡通风格渲染效果',
  'Increase color intensity and saturation': '提高颜色强度与饱和度',
  'Hide objects outside the viewing area, enable downsampling rendering and others to improve performance': '隐藏视野外的对象，并使用降低渲染分辨率等方式提高性能',
  'Macros': '宏指令',
  'Sensitivity:': '灵敏度：',
  'Deadline:': '死区阈值：',
  'Define how targets are selected in combat': '设置战斗时选择目标的方式',
  'Choose how skills are cast with gamepad': '设置使用手柄施放技能的方式',
  'Adjust mouse movement sensitivity for R3 stick': '调整 R3 摇杆移动鼠标的灵敏度',
  'Disable mouse input from gamepad for UI interaction': '禁用手柄对界面的虚拟鼠标输入',
  'Swap L3 and R3 stick functions': '交换 L3 与 R3 摇杆的功能',
  'Automatically hide UI during gameplay mouse movement': '游戏中移动鼠标时自动隐藏界面',
  'Set deadzone threshold for analog sticks': '设置模拟摇杆的死区阈值',
  'view skill info': '查看技能信息',
  '1st': '一转',
  '2nd': '二转',
  '3rd': '三转',
  '4th': '四转',
  'Monster': '魔物',
  'monster': '魔物',
  'title': '标题',
  'summary': '摘要',
  'objective': '目标',
  'killed': '已击败',
  'limited': '目标数量',
  'GROUP:': '分组：',
  "World Map (Ctrl + ')": "世界地图（Ctrl + '）",
  "Adventurer's Agency (Ctrl + Z)": '冒险者招募（Ctrl + Z）',
  'Charging': '充值',
  "Don't ask the Quantity of Items": '不询问物品数量',
  "Pincodewindow": '安全码',
  'Sign Up': '注册',
  'Full Screen': '全屏',
  'Unlimited': '无限制',
  'Set 1': '第 1 组',
  'Set 2': '第 2 组',
  'Item Search': '物品搜索',
  'Search...': '搜索……',
  'No file selected': '未选择文件',
  'Captcha Answer': '请输入验证码',
  'Open Source Ragnarok Online Web Client': '开源 RO 网页客户端',
  'Author:': '作者：',
  'Site:': '网站：',
  'Source:': '源码：',
  'roBrowser is an open source project based on the game Ragnarok Online.': 'roBrowser 是基于 Ragnarok Online 的开源项目。',
  "It's not affiliated in any way with Gravity.": '此项目与 Gravity 无关联。',
  'The concept is to reproduce the game using web technologies (HTML5, Javascript, WebGL) to bring it to Web Browsers.': '通过网页技术（HTML5、JavaScript、WebGL）重现游戏，使其能在浏览器中运行。',
  'Cross-platform: runs on Windows, Linux, macOS, and any device with WebGL support.': '支持 Windows、Linux、macOS 及具备 WebGL 支持的设备。',
  '⚙ Settings': '⚙ 设置',
  'Using clientinfo.xml file stored in my FullClient': '使用完整客户端中的 clientinfo.xml 文件',
  'Using servers from the current list:': '使用当前列表中的服务器：',
  'Address': '地址',
  'Langtype': '语言类型',
  'Packet Ver': '封包版本',
  '+ Add Server': '+ 添加服务器',
  'UNOFFICIAL': '非官方',
  'Drop GRF / data files here': '将 GRF / data 文件拖放到这里',
  'or click to browse': '或点击选择文件',
})) commonText.set(from, to);

for (let index = 0; index <= 10; index++) {
  commonText.set(`Macro ${index}`, `宏 ${index}`);
  commonText.set(`Flag ${index}`, `标记 ${index}`);
}

const componentText = {
  'Navigation/Navigation': { ALL: '全部', MOB: '魔物', 'Mouse:': '鼠标：' },
  'PartyFriends/PartyFriendsV1/PartyFriendsV1': { Cap: '人数' },
  'WhisperBox/WhisperBox': { 'With weeeee (Friend) *^.^* [813-338]': '私聊' },
  'Guild/Guild': { R: '正', W: '邪', V: '俗', F: '誉', Job: '职业' },
  'Mail/Mail': { To: '收件人' },
  'Storage/StorageV3/Storage': { Ammo: '弹药' },
  'Enchant/Enchant': { TAX: '费用' },
  'NpcStore/NpcStore': { "]'s Points:": ']的点数：' },
};

// Only reviewed display literals are eligible, and only in their component.
// Identifiers such as Storage/Inventory, action enums, and resource paths must
// keep their original spelling even when the same word is a translated label.
const componentJsText = {
  'ChatBox/ChatBox': {
    'Chat font x1.0': '聊天字号 ×1.0',
    'Chat font x1.2': '聊天字号 ×1.2',
    'Chat font x1.4': '聊天字号 ×1.4',
    'New Tab': '新页签',
    'Chat History [': '聊天记录 [',
    ' can be saved by <a style="color:#F88" download="ChatHistory [': ' 可通过以下链接保存：<a style="color:#F88" download="ChatHistory [',
    '" target="_blank">clicking here</a>.': '" target="_blank">点击保存</a>。',
  },
  'InputBox/InputBox': { 'Input Price': '请输入价格', 'Input your Shop Name': '请输入商店名称' },
  'Navigation/Navigation': { ' (no path found)': '（未找到路线）', 'Map Click': '地图选定位置' },
  'WhisperBox/WhisperBox': { 'With ': '与 ', ' (Friend)': '（好友）' },
  'PartyFriends/PartyMemberExternal/PartyMemberExternal': { 'Remove small party window': '关闭迷你队伍窗口' },
  'PartyFriends/PartyFriendsCommon': { Unknown: '未知' },
  'GuildCompanion/GuildCompanion': {
    'Disband the Guild': '解散公会', 'Enter Guild Name': '请输入公会名称', 'Create Guild': '创建公会', 'Guild Name': '公会名称',
  },
  'Guild/Guild': { 'If you are using a guild storage, all items inside it will disappear.': '若正在使用公会仓库，仓库内的所有物品将会消失。' },
  'GraphicsOption/GraphicsOption': { '[System] Pixel Perfect is disabled. Reload the page (F5) to apply the changes.': '[系统] 已关闭像素精确显示，请刷新页面（F5）使设置生效。' },
  'ShortCutOption/ShortCutOption': { 'N/A': '未设置' },
  'CheckAttendance/CheckAttendance': {
    'Currently there is no attendance check event.': '当前没有签到活动。',
    ' Day attendance success': ' 天签到成功',
    'Event Period: From ': '活动时间：从 ',
    ' ~ Until ': ' 至 ',
    ' (Month/Day) 24:00': '（月／日）24:00',
    'Click the item to claim day ': '点击物品领取第 ',
    ' reward': ' 天奖励',
    ' Day</div></li>': ' 天</div></li>',
  },
  'Achievement/Achievement': { Unknown: '未知', 'Select an achievement': '请选择一项成就' },
  'Enchant/Enchant': {
    Unknown: '未知',
    'Enchant data missing.': '缺少附魔数据。',
    'No enchantable items.': '没有可附魔的物品。',
    'Select an item': '请选择物品',
    'Result: ': '结果：',
    'Slot ': '栏位 ',
    'Enchant data missing for this group.': '缺少此组的附魔数据。',
    'Invalid item.': '无效的物品。',
    'Item must be in inventory.': '物品必须位于背包中。',
    'Item cannot be in equipment switch.': '物品不能放在装备切换栏中。',
    'Item attribute must be normal.': '物品必须处于正常状态。',
    'Item is not valid for this enchant group.': '此物品不适用于这组附魔。',
    'Refine level too low.': '精炼等级不足。',
    'Enchant grade too low.': '附魔等级不足。',
    'Random options not allowed.': '不允许带有随机属性的物品。',
    'Select an item first.': '请先选择物品。',
    'No available enchant slot.': '没有可用的附魔栏位。',
    'Select a perfect enchant.': '请选择完美附魔。',
    'Invalid perfect enchant selection.': '所选完美附魔无效。',
    'Select an upgrade slot.': '请选择升级栏位。',
    'Request sent...': '已发送请求……',
    'Enchant result: ': '附魔结果：',
    'Request in progress...': '正在处理请求……',
    'Enchant data missing for group ': '缺少附魔组的数据：',
  },
  'Storage/StorageCommon': { Search: '搜索结果', Items: '物品' },
  'Equipment/EquipmentCommon': { 'Remove Title': '取消称号' },
  'Captcha/CaptchaSelector': { Unknown: '未知' },
  'Captcha/CaptchaAnswer': { 'Remaining chance: 0': '剩余次数：0' },
  'SkillListMH/SkillListMH': { 'Homunculus Skills': '生命体技能', 'Mercenary Skills': '佣兵技能' },
  'ShortCut/ShortCut': { 'Skill ': '技能 ' },
  'PetInformations/PetInformations': { 'Evolution ': '进化 ', 'Evolution - ': '进化 - ' },
  'PetEvolution/PetEvolution': { 'Item ': '物品 ' },
  'VendingReport/VendingReport': { Unknown: '未知' },
  'ChangeCart/ChangeCart': { 'Change Cart!!': '更换手推车！', 'Close your Room first!!': '请先关闭聊天室！' },
  'CashShop/CashShop': {
    'No items found in auction search': '未找到商品。',
    'Max Quantity 99!': '数量最多为 99！',
    'Minimum Quantity 1!': '数量至少为 1！',
    '8 Items can only be stored in cart!': '购物车最多可放入 8 种商品！',
    'Are you sure you want to buy this items?': '确定购买这些物品吗？',
    'You dont have enough Kafra Points!': '卡普拉点数不足！',
    'No item in cart!': '购物车中没有物品！',
    'Successfully done buying items from cash shop!': '商城购买成功！',
    'Insuficient cash points or kafra points!': '现金点或卡普拉点数不足！',
    "You are over you're weight limit!": '超过负重上限！',
    'You are over youre weight limit!': '超过负重上限！',
    'Something went wrong while using cashshop!': '商城操作失败！',
  },
  'WinLogin/WinLoginCommon': {
    'Please select a Ragnarok replay file (.rrf).': '请选择 RO 回放文件（.rrf）。',
    'Could not load the replay file.\n': '无法读取回放文件。\n',
    'No registration URL was provided.\nIf this server uses simplified registration, then input your new:\n - Username followed by _M for Male and _F for Female account (Eg: MyUser_M)\n - Password.': '未提供注册页面地址。\n如果此服务器支持简易注册，请输入新的账号和密码。\n男性账号在账号名末尾添加 _M，女性账号添加 _F（例如 MyUser_M）。',
  },
  'Intro/Intro': {
    ' files selected': ' 个文件已选择',
    ' GiB saved': ' GiB 空间已释放',
    ' MiB saved': ' MiB 空间已释放',
    ' KiB saved': ' KiB 空间已释放',
  },
};

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function ownText(table, key) {
  return table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function applyEdits(source, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

function localizeTemplate(html, component) {
  const root = parseFragment(html, { sourceCodeLocationInfo: true });
  const scopedText = componentText[component] || {};
  const edits = [];
  function visit(node) {
    if (node.tagName === 'script' || node.tagName === 'style') return;
    // QuestV1's empty title uses msgid, which neither UIText nor the GUI reads.
    // Bind only this display label through the native data-text path and retain
    // the packaged Chinese caption when the message table is unavailable.
    if (component === 'Quest/QuestV1/QuestV1' && node.tagName === 'ui-text'
        && node.attrs.some(attr => attr.name === 'class' && attr.value === 'title')
        && node.attrs.some(attr => attr.name === 'msgid' && attr.value === '1317')
        && !node.attrs.some(attr => attr.name === 'msg' || attr.name === 'data-text')
        && node.childNodes.every(child => child.nodeName === '#text' && !normalizeText(child.value))) {
      const location = node.sourceCodeLocation;
      const binding = location?.attrs?.msgid;
      if (binding && location.startTag && location.endTag) {
        const raw = html.slice(binding.startOffset, binding.endOffset);
        edits.push({ start: binding.startOffset, end: binding.endOffset, text: raw.replace(/^msgid(?=\s*=)/iu, 'data-text') });
        edits.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, text: '任务目录' });
      }
    }
    if (component === 'Intro/Intro' && node.attrs?.some(attr => attr.name === 'class' && attr.value === 'loading-text')) {
      const letters = node.childNodes.filter(child => child.tagName === 'span').flatMap(child => child.childNodes);
      if (letters.length === 10 && letters.every(child => child.nodeName === '#text') && letters.map(child => child.value).join('') === 'Loading...') {
        const translated = ['正', '在', '加', '载', '中', '', '', '.', '.', '.'];
        for (const [index, letter] of letters.entries()) {
          const location = letter.sourceCodeLocation;
          if (location) edits.push({ start: location.startOffset, end: location.endOffset, text: translated[index] });
        }
      }
    }
    if (node.nodeName === '#text' && node.sourceCodeLocation) {
      const original = normalizeText(node.value);
      let translated = ownText(scopedText, original) ?? commonText.get(original);
      // These are alphabetical sort modes, not item upgrade/downgrade actions.
      if (component === 'Storage/StorageV3/Storage' && node.parentNode?.tagName === 'option') {
        translated = { BASE: '默认顺序', UPGRADE: '名称升序', DOWNGRADE: '名称降序' }[
          node.parentNode.attrs.find(attr => attr.name === 'value')?.value
        ] ?? translated;
      }
      if (translated !== undefined && translated !== original) {
        const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
        const raw = html.slice(start, end);
        const leading = raw.match(/^\s*/u)[0];
        const trailing = raw.match(/\s*$/u)[0];
        edits.push({ start, end, text: leading + escapeHtml(translated) + trailing });
      }
    }
    for (const attr of node.attrs || []) {
      if (!['title', 'placeholder', 'alt', 'aria-label', 'data-title'].includes(attr.name)) continue;
      const original = normalizeText(attr.value);
      const translated = ownText(scopedText, original) ?? commonText.get(original);
      const location = node.sourceCodeLocation?.attrs?.[attr.name];
      if (translated === undefined || translated === original || !location) continue;
      const raw = html.slice(location.startOffset, location.endOffset);
      const match = raw.match(/^([^=]+\s*=\s*)(?:"[\s\S]*"|'[\s\S]*'|[^\s]+)$/u);
      if (match) edits.push({ start: location.startOffset, end: location.endOffset, text: match[1] + '"' + escapeHtml(translated) + '"' });
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(root);
  return applyEdits(html, edits);
}

function templateToken(node, text) {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
  const start = node.kind === ts.SyntaxKind.TemplateHead ? '`' : '}';
  const end = node.kind === ts.SyntaxKind.TemplateTail ? '`' : '${';
  return start + escaped + end;
}

function isDataKey(node) {
  const parent = node.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  if (ts.isBinaryExpression(parent) && [
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ].includes(parent.operatorToken.kind)) return true;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node && ts.isPropertyAccessExpression(parent.expression)) {
    return ['addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getAttribute', 'setAttribute', 'getElementById'].includes(parent.expression.name.text);
  }
  return false;
}

/** Patch parsed UI templates and reviewed display literals; leave other regions unchanged. */
export function patchRuntimeUiText(source) {
  return source.replace(/\/\/#region (src\/UI\/Components\/([^\r\n]+)\.(html\?raw|js))\r?\n([\s\S]*?)\/\/#endregion/g,
    (region, _path, component, kind, body) => {
      // The world map has its own complete Chinese template overlay. Its
      // upstream initializer also removes controls by their English text.
      if (component === 'WorldMap/WorldMap' && kind === 'html?raw') return region;
      const text = componentJsText[component];
      if (kind === 'js' && !text) return region;
      const file = ts.createSourceFile('ui-region.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      if (file.parseDiagnostics.length) throw new Error(`anchor:ui-text:${component}`);
      const edits = [];
      function visit(node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          if (kind === 'js' && isDataKey(node)) return;
          const translated = kind === 'html?raw' && node.text.includes('<')
            ? localizeTemplate(node.text, component)
            : ownText(text, node.text);
          if (translated !== undefined && translated !== node.text) edits.push({ start: node.getStart(file), end: node.end, text: JSON.stringify(translated) });
        } else if ([ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) {
          const translated = ownText(text, node.text);
          if (translated !== undefined && translated !== node.text) edits.push({ start: node.getStart(file), end: node.end, text: templateToken(node, translated) });
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
      const offset = region.indexOf(body);
      return region.slice(0, offset) + applyEdits(body, edits) + region.slice(offset + body.length);
    });
}
