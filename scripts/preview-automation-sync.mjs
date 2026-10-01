// Offline QA: actual generated automation methods and native panel/scrollbar.
// All packets are recorded locally; artwork comes only from existing caches.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import console from 'node:console';
import ts from 'typescript';

const runtime = await readFile('generated/runtime/Online.js', 'utf8');
const file = ts.createSourceFile('Online.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const sourceHash = createHash('sha256').update(runtime).digest('hex');
const values = {}, functions = {}, methods = {};
const wantedValues = new Set(['Common_default$1', 'LastROTools_default', 'WinPopup_default$1', 'WinPopup_default$2']);
const wantedFunctions = new Set(['patchLastROToolsTemplate', 'activateLastROSettingsTab', 'showLastROSettingsView',
  'showLastROMainView', '_popupPosition', '_createButton', 'getLastROLearnedSkills', 'getLastROInventoryItems',
  'installLastroAutomationSync']);
const wantedMethods = new Set(['init', 'ensurePanelOpener', 'hidePanel', 'restorePanel', 'minimizePanel', 'setStatus',
  'renderCompactStatus', 'populateSkillSelects', 'populateItemSelects', 'setAutomationOption', 'updateField',
  'submitAssistSkill', 'renderAssistSkillList', 'getOptionLabel', 'setOnlyTargetState', 'setLoadInfo', 'setReloadInfo',
  'applyState', 'toggleOnlyTarget', 'setOnlyTargetOptions']);
let scrollbar, promptMethod, panelsFactory, panelsCss, loadInfoFields;
function visit(node) {
  if (ts.isBinaryExpression(node)) {
    const name = node.left.getText(file);
    if (wantedValues.has(name) && ts.isStringLiteral(node.right)) {
      values[name] = node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ? (values[name] || '') + node.right.text : node.right.text;
    }
    if (name.startsWith('LastROTools.') && wantedMethods.has(name.slice(12)) && ts.isFunctionExpression(node.right)) {
      methods[name.slice(12)] = node.right.getText(file);
    }
    if (name === 'PACKET.ZC.NOTIFY_LOADINFO' && ts.isFunctionExpression(node.right)) {
      loadInfoFields = [...node.right.getText(file).matchAll(/this\.(\w+)\s*=\s*read(?:Byte|Word|Long)\(/g)].map(match => match[1]);
    }
  }
  if (ts.isFunctionDeclaration(node) && wantedFunctions.has(node.name?.text)) functions[node.name.text] = node.getText(file);
  if (ts.isFunctionExpression(node) && node.name?.text === 'installLastroToolsPanels') {
    panelsFactory = node.getText(file);
    const call = ts.isParenthesizedExpression(node.parent) ? node.parent.parent : node.parent;
    if (ts.isCallExpression(call) && ts.isStringLiteral(call.arguments[2])) panelsCss = call.arguments[2].text;
  }
  if (ts.isFunctionExpression(node) && node.name?.text === 'installLastroAutomationSync') functions[node.name.text] = node.getText(file);
  if (ts.isClassExpression(node) && node.name?.text === 'ScrollBar') scrollbar = node.getText(file);
  if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'showPromptBox') promptMethod = node.getText(file).replace(/^static\s+/, '');
  ts.forEachChild(node, visit);
}
visit(file);
for (const name of wantedValues) if (!values[name]) throw new Error('Missing generated native CSS/template: ' + name);
for (const name of wantedMethods) if (!methods[name]) throw new Error('Missing generated LastROTools method: ' + name);
for (const name of wantedFunctions) if (!functions[name]) throw new Error('Build the final automation-sync runtime before generating this preview: ' + name);
if (!scrollbar || !promptMethod || !panelsFactory || !panelsCss || !loadInfoFields?.length) throw new Error('Missing generated native scrollbar, prompt, tools panel, or full snapshot packet');
values.toolsTemplate = runInNewContext('let LastROTools_default$1 = "";\n' + functions.patchLastROToolsTemplate + '\npatchLastROToolsTemplate(); LastROTools_default$1;', {});

// Reuse the existing preview's GUI adapter without executing its fetch/setup.
const baseSource = await readFile('scripts/preview-tools-panels.mjs', 'utf8');
const baseFile = ts.createSourceFile('preview-tools-panels.mjs', baseSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let adapter;
function baseVisit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(baseFile) === 'stubSource' && ts.isTaggedTemplateExpression(node.initializer)) {
    const literal = node.initializer.template.getText(baseFile);
    adapter = literal.slice(1, -1).replace("'./tools-panels-assets/'", "'./automation-sync-assets/'")
      .replace('this.__active = true;', 'this.__active = true; this.__loaded = true;');
  }
  ts.forEachChild(node, baseVisit);
}
baseVisit(baseFile);
if (!adapter) throw new Error('Missing existing native tools GUI preview adapter');
const directory = 'generated/automation-sync-assets';
await mkdir(directory, { recursive: true });
const cached = JSON.parse(await readFile('generated/tools-panels-assets/index.json', 'utf8'));
const manifest = {}, missing = [];
for (const [asset, filename] of Object.entries(cached)) {
  try {
    const bytes = await readFile('generated/tools-panels-assets/' + filename);
    if (bytes[0] !== 66 || bytes[1] !== 77) throw new Error('Invalid local BMP');
    await writeFile(directory + '/' + filename, bytes); manifest[asset] = filename;
  } catch { missing.push(asset); }
}
await writeFile(directory + '/index.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile('generated/automation-sync-trusted-dom.mjs', await readFile('src/runtime/lastro-trusted-dom.mjs', 'utf8'));
await writeFile('generated/automation-sync-migration.mjs', await readFile('vendor/v2/lastro-v1-migration.mjs', 'utf8'));

const setup = String.raw`
const components = new Map(), requests = [];
let panels, sync, stateObserver, character = 10001, latest;
const Configs = { get: (name, fallback) => name === 'lastroNid' ? 3 : fallback };
const SkillInfo = { 28: { SkillName: '治愈术' }, 29: { SkillName: '天使之赐福' }, 34: { SkillName: '加速术' } };
const Controller$4 = { getUI: () => ({ getSkills: () => [{ SKID: 28, level: 10 }, { SKID: 29, level: 10 }, { SKID: 34, level: 10 }] }) };
const InventoryController = { getUI: () => ({ list: [{ ITID: 501, count: 30, type: 0, name: '红色药水' }, { ITID: 505, count: 20, type: 0, name: '蓝色药水' }] }) };
const PACKET = { CZ: { WHISPER: class WHISPER {}, NOTIFY_UPDATEINFO: class NOTIFY_UPDATEINFO {}, NOTIFY_ONLYTARGET: class NOTIFY_ONLYTARGET {}, NOTIFY_LOADINFO: class NOTIFY_LOADINFO {} } };
const Network = { sendPacket: packet => { requests.push({ name: packet.constructor.name, ...packet }); recordState(); } };
const OPTION_TO_PACKET_ID = Object.freeze({ autoAttack: 34, autoLoot: 35, autoPots: 36, autoFollow: 37 });
const SCALAR_FIELD_BY_ID = Object.freeze(Object.fromEntries(Object.entries(AUTO_BATTLE_SCALAR_IDS).map(([field, id]) => [id, field])));
function installLastRORandomTeleportShortcut() { return false; }
const WinPopup = new GUIComponent('WinPopup', values['WinPopup_default$1']); WinPopup.render = () => values['WinPopup_default$2']; components.set('WinPopup', WinPopup);
const LastROTools = new GUIComponent('LastROTools', values.LastROTools_default); LastROTools.render = () => values.toolsTemplate; components.set('LastROTools', LastROTools);
const tools = LastROTools;
TOOLS_METHODS
tools.loadQuickRoutes = function () { this._quickRoutes = {}; };
tools.stopQuickRoute = () => {};
tools.runQuickRoute = () => {};
const preferences = { orders: {}, geometry: {}, save() {} };
SYNC_INSTALL
panels = installLastroToolsPanels(tools, { document, window, GUIComponent, UIManager,
  setHtml: setLastROInnerHTML, normalizeRoute: normalizeRouteEntry, requestRoute: () => { throw new Error('This fixture does not execute teleport routes'); },
  loadPreferences: () => preferences, getProfile: () => 3, getPresetRoutes: () => ({}) }, toolsCss);
function visible(component) { return !!(component?._host?.isConnected && getComputedStyle(component._host).display !== 'none'); }
function recordState() {
  if (!tools._host) return;
  const root = tools.getRoot();
  const fields = Object.fromEntries([...root.querySelectorAll('[data-field]')].map(input => [input.dataset.field, { value: input.type === 'checkbox' ? input.checked : input.value,
    disabled: input.disabled, placeholder: input.placeholder || '', state: input.dataset.automationState || '', indeterminate: Boolean(input.indeterminate) }]));
  const options = Object.fromEntries([...root.querySelectorAll('[data-option]')].map(input => [input.dataset.option, { checked: input.checked, disabled: input.disabled,
    state: input.dataset.automationState || '', indeterminate: Boolean(input.indeterminate) }]));
  latest = { sourceHash, character, requests: requests.slice(), confirmed: { ...(tools._settingState || {}) }, fields, options,
    visible: visible(tools), status: root.querySelector('.lastro-status')?.textContent || '', wirePackets: 0 };
  document.body.dataset.automationMetrics = JSON.stringify(latest);
  document.getElementById('metrics').textContent = JSON.stringify(latest, null, 2);
}
function loadSnapshot(extra = {}) {
  const packet = Object.fromEntries(loadInfoFields.map(key => [key, 0]));
  Object.assign(packet, { startAutoAtk: 0, startAutoLoot: 0, startAutopots: 0, startAutofollow: 0, autoloot: 50,
    AutoUseWing_time: 15, AutoUseItem_reHpVal: 50, AutoUseItem_reSpVal: 20, AutoUseSkillid: 28, AutoUseSkilllv: 10 }, extra);
  tools.setLoadInfo(packet); recordState();
}
function reload(id, value) { tools.setReloadInfo({ id, value }); recordState(); }
function changeField(field, value) {
  const input = tools.getRoot().querySelector('[data-field="' + field + '"]');
  if (!input || input.disabled) return false;
  input[input.type === 'checkbox' ? 'checked' : 'value'] = value;
  input.dispatchEvent(new Event('change', { bubbles: true })); recordState(); return true;
}
document.getElementById('open').addEventListener('click', () => { panels.showAutomation(); recordState(); });
document.getElementById('load').addEventListener('click', () => loadSnapshot({ autoloot: 10000 }));
document.getElementById('send-loot').addEventListener('click', () => { activateLastROSettingsTab(tools.getRoot(), 'pick'); changeField('autoloot', '0.1'); });
document.getElementById('reject-loot').addEventListener('click', () => reload(20, 50));
document.getElementById('accept-loot').addEventListener('click', () => reload(20, 10));
document.getElementById('accept-switches').addEventListener('click', () => { reload(34, 1); reload(35, 1); });
document.getElementById('unrelated').addEventListener('click', () => reload(1, 6));
document.getElementById('read').addEventListener('click', () => { sync.request(); recordState(); });
document.getElementById('clear').addEventListener('click', () => { character++; SYNC_CLEAR recordState(); });
document.getElementById('scale').addEventListener('change', event => { document.body.style.zoom = event.target.value; window.dispatchEvent(new Event('resize')); recordState(); });
stateObserver = new MutationObserver(recordState);
tools.append(); panels.showAutomation();
stateObserver.observe(tools.getRoot(), { childList: true, subtree: true, attributes: true });
tools.getRoot().addEventListener('change', () => queueMicrotask(recordState));
window.addEventListener('pagehide', () => stateObserver.disconnect());
window.__automationSyncPreview = { tools, panels, sync, get metrics() { recordState(); return latest; }, loadSnapshot, reload, changeField,
  get requests() { return requests; }, clear() { character++; SYNC_CLEAR recordState(); } };
ScrollBar.init(); recordState(); document.body.dataset.ready = 'true';
Promise.all(Object.keys(manifest).map(decodeBmp)).then(() => { document.body.dataset.assetsReady = 'true'; recordState(); });
previewFontsReady.then(recordState);
`;

const syncInstall = String.raw`sync = installLastroAutomationSync(tools, {
  clock: window, now: () => Date.now(), getIdentity: () => 'offline:' + character, getNid: () => 3, canRequest: () => true,
  requestSettings: () => { Network.sendPacket(new PACKET.CZ.NOTIFY_LOADINFO()); },
  sendUpdates: updates => { for (const update of updates) { const packet = new PACKET.CZ.NOTIFY_UPDATEINFO(); Object.assign(packet, mapScalarUpdate(update)); Network.sendPacket(packet); } },
  sendToggle: (option, enabled) => {
    const request = buildAutoToggleRequest({ nid: 3, option, enabled });
    const packet = request.kind === 'whisper' ? new PACKET.CZ.WHISPER() : new PACKET.CZ.NOTIFY_UPDATEINFO();
    Object.assign(packet, request.kind === 'whisper' ? { receiver: request.receiver, msg: request.msg } : mapScalarUpdate(request)); Network.sendPacket(packet);
    if (option === 'autoAttack' && enabled) { const offline = new PACKET.CZ.WHISPER(); offline.receiver = 'NPC:setoffline'; offline.msg = '0'; Network.sendPacket(offline); }
  },
  sendTarget: (mobId, enabled) => { const packet = new PACKET.CZ.NOTIFY_ONLYTARGET(); Object.assign(packet, mapOnlyTargetUpdate({ mobId, enabled })); Network.sendPacket(packet); },
  buildFieldUpdates: buildAutoBattleFieldUpdates, buildAssistUpdates: buildAssistSkillUpdates,
  scalarIds: AUTO_BATTLE_SCALAR_IDS, itemSlots: AUTO_BATTLE_ITEM_SLOT_FIELDS,
});`;
const syncClear = 'sync.reset();';
const js = [
  'import { setLastROInnerHTML } from "./automation-sync-trusted-dom.mjs";',
  'import { mapLoadInfoPayload, mapReloadInfoPacket, mapScalarUpdate, buildAutoToggleRequest, buildAutoBattleFieldUpdates, buildAssistSkillUpdates, mapOnlyTargetUpdate, mapOnlyTargetPacket, canSelectOnlyTarget, AUTO_BATTLE_SCALAR_IDS, AUTO_BATTLE_ITEM_SLOT_FIELDS, getAvailableInventoryItems, normalizeRouteEntry } from "./automation-sync-migration.mjs";',
  'const values = ' + JSON.stringify(values) + ', manifest = ' + JSON.stringify(manifest) + ', toolsCss = ' + JSON.stringify(panelsCss) + ', sourceHash = ' + JSON.stringify(sourceHash) + ', loadInfoFields = ' + JSON.stringify(loadInfoFields) + ';',
  'window.addEventListener("error", event => { document.body.dataset.fixtureError = event.message; document.getElementById("assets").textContent = event.message; });',
  adapter, 'const ScrollBar = ' + scrollbar + ';',
  ...Object.entries(functions).filter(([name]) => !['patchLastROToolsTemplate', 'installLastroAutomationSync'].includes(name)).map(([, source]) => source),
  'const installLastroAutomationSync = ' + functions.installLastroAutomationSync + ';',
  'const installLastroToolsPanels = ' + panelsFactory + ';',
  'const UIManager = { addComponent: component => { components.set(component.name, component); return component; }, getComponent: name => components.get(name), ' + promptMethod + ' };',
  setup.replace('TOOLS_METHODS', Object.entries(methods).map(([name, method]) => 'tools.' + name + ' = ' + method + ';').join('\n'))
    .replace('SYNC_INSTALL', syncInstall).replaceAll('SYNC_CLEAR', syncClear),
].join('\n');
await writeFile('generated/automation-sync-preview.js', js);
const shellCss = await readFile('src/styles.css', 'utf8');
await writeFile('generated/automation-sync-preview.html', `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>挂机设置同步离线验证</title>
<link rel="stylesheet" href="/fonts/misans.css"><style>${shellCss}</style>
<style>html,body{height:100%;overflow:hidden}body{margin:0;padding:16px;box-sizing:border-box;background:#263238;color:#eef3f5;font:13px MiSans,Arial,sans-serif;font-size-adjust:none}h1{font-size:18px;margin:0 0 8px}.controls{display:flex;flex-wrap:wrap;gap:6px;max-width:560px}#metrics{width:min(45vw,540px);height:calc(100vh - 200px);overflow:auto;white-space:pre-wrap;font-size:11px;margin:10px 0;color:#b9d5e8}#assets{color:#ffbaa5;white-space:pre-wrap}</style>
<header><h1>挂机设置 · 本地回包验证</h1><div class="controls"><button id="open">打开挂机设置</button><button id="read">请求读取（不自动回包）</button><button id="load">模拟 LOADINFO：100%</button><button id="send-loot">请求 0.1%</button><button id="reject-loot">服务端返回 0.5%</button><button id="accept-loot">服务端返回 0.1%</button><button id="unrelated">无关增量：攻击距离6</button><button id="accept-switches">确认战斗/拾取开启</button><button id="clear">切换另一角色：清空</button><select id="scale" aria-label="缩放"><option value="1">100%</option><option value="1.5">150%</option></select></div><div id="assets">${missing.join('\n')}</div><pre id="metrics"></pre></header><script type="module" src="./automation-sync-preview.js"></script></html>`);
console.log('Preview: /generated/automation-sync-preview.html; local cached BMP: ' + Object.keys(manifest).length);
