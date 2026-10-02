import ts from 'typescript';

const IMPORTS = `import { assistantIcon } from "./lro-assistant-icon.mjs";
import { installLroAssistant } from "./lro-assistant.mjs";
import { createAssistantPacketBus } from "./lro-assistant-packets.mjs";
import { installAssistantInputTracking, addAssistantAwareListener, removeAssistantAwareListener, guardAssistantInputHandler } from "./lro-assistant-input.mjs";
const lroAssistantPackets = createAssistantPacketBus();
if (globalThis.ROConfig?.lroAssistantEnabled === true) installAssistantInputTracking(window);
`;

const START = `
// Deliberately narrow compatibility map. Nothing is installed on window.require.
// Versioned UI components are resolved afresh through the client's own aliases.
const lroAssistantModules = {
  get(name) {
    const native = {
      'Core/Client': () => Client,
      'Core/MemoryManager': () => MemoryManager,
      'Core/Preferences': () => Preferences,
      'DB/DBManager': () => DB,
      'DB/Items/ItemTable': () => ItemTable_default,
      'DB/WorldMapData': () => { init_WorldMap(); return { load: WorldMap_default.lroLoadData, navigationMobs: NaviMobTable }; },
      'UI/WorldMapActions': () => { init_WorldMap(); return { teleport: map => WorldMap_default.lroTeleport(map) }; },
      'DB/Items/EquipmentLocation': () => EquipmentLocation_default,
      'DB/Skills/SkillInfo': () => SkillInfo,
      'Engine/SessionStorage': () => SessionStorage_default,
      'Network/NetworkManager': () => Network,
      'Network/PacketStructure': () => PACKET,
      'Preferences/Controls': () => Controls_default,
      'Renderer/Camera': () => Camera,
      'Renderer/Entity/Entity': () => Entity,
      'Renderer/EntityManager': () => EntityManager,
      'Renderer/Map/Altitude': () => Altitude,
      'Renderer/MapRenderer': () => MapRenderer,
      'UI/UIManager': () => UIManager,
      'UI/GUIComponent': () => GUIComponent,
      'UI/CommonStyles': () => Common_default$1,
    };
    try {
      if (Object.hasOwn(native, name)) return native[name]();
      const components = {
        'UI/Components/Equipment/Equipment': 'Equipment',
        'UI/Components/Inventory/Inventory': 'Inventory',
        'UI/Components/ItemInfo/ItemInfo': 'ItemInfo',
        'UI/Components/Storage/Storage': 'Storage',
        'UI/Components/OnPushCart/OnPushCart': 'CartItems',
        'UI/Components/PartyFriends/PartyFriends': 'PartyFriends',
        'UI/Components/MiniMap/MiniMap': 'MiniMap',
        'UI/Components/SkillTargetSelection/SkillTargetSelection': 'SkillTargetSelection',
        'UI/Components/CardConnection/CardConnection2': 'CardConnection2',
        'UI/Components/InputBox/InputBox': 'InputBox',
        'UI/Components/Mail/RodexSend': 'WriteRodex',
        'UI/Components/Mail/Rodex': 'Rodex',
        'UI/Components/Trade/Trade': 'Trade',
        'UI/Components/Auction/Auction': 'Auction',
        'UI/Components/PlayerStore/PlayerStore': 'PlayerStore',
        'UI/Components/BuyingStore/BuyingStore': 'BuyingStore',
        'UI/Components/NpcMenu/NpcMenu': 'NpcMenu',
        'UI/Components/NpcStore/NpcStore': 'NpcStore',
      };
      return Object.hasOwn(components, name) ? UIManager.getComponent(components[name]) : null;
    } catch { return null; }
  },
};
if (globalThis.ROConfig?.lroAssistantEnabled === true) {
  try {
    const assistant = await installLroAssistant({ enabled: true, page: window,
      profile: globalThis.ROConfig.lroAssistantProfile,
      modules: lroAssistantModules, subscribePackets: lroAssistantPackets.subscribe });
    UIManager.getComponent('LROAssistant').open = assistant.open;
  } catch (error) {
    console.error('[LRO助手] 启动失败，客户端继续启动', error?.message);
  }
}
`;

export function patchLroAssistantRuntime(source) {
  if (source.includes('const lroAssistantPackets =')) throw new Error('Assistant patch already applied');
  const dispatchFile = ts.createSourceFile('dispatch.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const callbacks = [];
  function findDispatch(node) {
    if (ts.isIfStatement(node) && node.expression.getText(dispatchFile) === 'packet.callback'
      && node.thenStatement.getText(dispatchFile).includes('packet.callback(packet.instance);')) callbacks.push(node);
    ts.forEachChild(node, findDispatch);
  }
  findDispatch(dispatchFile);
  if (callbacks.length !== 1) throw new Error('Assistant packet dispatch anchor changed');
  const dispatch = callbacks[0];
  // Keep the upstream diagnostic catch/rethrow intact inside the observer pair.
  source = source.slice(0, dispatch.getStart(dispatchFile)) + `lroAssistantPackets.emit(packet.Struct, packet.instance, 'before');
          try { ${dispatch.getText(dispatchFile)} }
          finally { lroAssistantPackets.emit(packet.Struct, packet.instance, 'after'); }` + source.slice(dispatch.end);
  // Wrap native event registrations only; no prototype mutation and no changes
  // to assistant controls. Inserting tokens also preserves nested registrations.
  const parsed = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    // Cursor motion is presentation, not a game action. Keep the client's own
    // cursor lifecycle running over every window, including assistant panels.
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'bindMouseEvents') return;
    if (ts.isMethodDeclaration(node) && node.name?.getText(parsed) === '_setupShadowCursorEvents') return;
    if (ts.isClassExpression(node) && node.name?.text === 'GUIComponent') {
      const at = node.members[0].getStart(parsed);
      edits.push({ start: at, end: at, text: `
    lroAdopt(host) {
      if (this.__loaded || !host.shadowRoot) throw new Error('Invalid assistant window');
      _ensureDeps();
      this._host = host;
      this._shadow = host.shadowRoot;
      this._container = this._shadow;
      this.__loaded = true;
      this._createUIProxy();
      this._setupMouseMode();
      return this;
    }
` });
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'createBasicInfo') {
      const text = node.getText(parsed);
      const anchor = '    root.querySelectorAll(topbarItemSelector)';
      const offset = text.indexOf(anchor);
      if (offset < 0) throw new Error('BasicInfo assistant entry anchor changed');
      const at = node.getStart(parsed) + offset;
      edits.push({ start: at, end: at, text: `
    if (globalThis.ROConfig?.lroAssistantEnabled === true) {
      const buttons = root.querySelector('.buttons') || root.querySelector(innerId);
      if (buttons && !root.querySelector('[data-lro-assistant-entry]')) {
        const entry = document.createElement(buttonKeyBy === 'id' ? 'div' : 'button');
        entry.id = 'lro-assistant';
        entry.className = 'lro-assistant event_add_cursor item-link';
        if (entry.tagName === 'BUTTON') entry.type = 'button';
        entry.dataset.lroAssistantEntry = 'true';
        const icon = document.createElement('img'); icon.src = assistantIcon; icon.alt = 'LRO助手'; icon.width = 32; icon.height = 32; icon.style.pointerEvents = 'none'; entry.appendChild(icon);
        icon.style.position = 'absolute'; icon.style.inset = '0';
        const label = document.createElement('span'); label.className = 'name'; label.textContent = 'LRO助手'; entry.appendChild(label);
        entry.title = 'LRO助手';
        entry.setAttribute('aria-label', 'LRO助手');
        entry.style.cssText = 'position:relative;width:32px;height:32px;padding:0;margin:6px;border:0;background:transparent;cursor:pointer;';
        const labelStyle = document.createElement('style');
        labelStyle.textContent = '[data-lro-assistant-entry] > .name{position:absolute;display:none;z-index:20;top:auto;bottom:100%;left:0;background:rgba(0,0,0,.6);text-shadow:1px 1px black;color:white;padding:5px;white-space:nowrap;font-size:.6rem;pointer-events:none}[data-lro-assistant-entry]:hover > .name{display:table}';
        root.appendChild(labelStyle);
        entry.addEventListener('mousedown', event => event.stopImmediatePropagation());
        entry.addEventListener('click', event => {
          event.stopImmediatePropagation();
          UIManager.getComponent('LROAssistant')?.open?.();
        });
        buttons.appendChild(entry);
      }
    }
` });
    }
    if (ts.isFunctionDeclaration(node) && node.body) {
      const additions = {
        createEquipment: 'Component.lroReadEquipment = () => Object.values(_list).map(item => ({item: {...item, slot: item.slot ? {...item.slot} : undefined, options: item.options ? {...item.options} : undefined}, location: Number(item.equipped ?? item.WearState ?? item.location) || 0}));',
        createStorage: 'Component.lroReadItems = () => _list.map(item => ({ ...item }));',
        createPartyFriends: 'Component.lroReadParty = () => _party.map(member => ({ ...member, life: member.life ? { ...member.life } : undefined }));',
        createMiniMap: 'MiniMap.lroReadZoom = () => _preferences.zoom;',
      };
      const addition = Object.hasOwn(additions, node.name?.text) ? additions[node.name.text] : null;
      if (addition) {
        const end = node.body.statements.findLast(statement => ts.isReturnStatement(statement));
        if (!end) throw new Error('Missing native component return: ' + node.name.text);
        edits.push({ start: end.getStart(parsed), end: end.getStart(parsed), text: addition + '\n' });
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['addEventListener','removeEventListener'].includes(node.expression.name.text)
      && node.arguments.length >= 2 && !node.questionDotToken && !node.expression.questionDotToken) {
      const expr = node.expression;
      // Runtime bindings use simple targets (window/document/elements). A target
      // with nested event registrations is rejected rather than producing overlap.
      const target = expr.expression.getText(parsed);
      const helper = expr.name.text === 'addEventListener' ? 'addAssistantAwareListener' : 'removeAssistantAwareListener';
      edits.push({ start: expr.getStart(parsed), end: expr.end, text: helper });
      edits.push({ start: node.arguments[0].getStart(parsed), end: node.arguments[0].getStart(parsed), text: target + ', ' });
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && /^on(?:pointer(?:down|up|move|cancel)|mouse(?:down|up|move)|click|dblclick|contextmenu|touch(?:start|move|end|cancel)|wheel|key(?:down|up|press))$/.test(node.left.name.text)) {
      edits.push({ start: node.right.getStart(parsed), end: node.right.getStart(parsed), text: 'guardAssistantInputHandler(' });
      edits.push({ start: node.right.end, end: node.right.end, text: ')' });
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  for (const edit of edits.sort((a,b) => b.start-a.start || b.end-a.end)) {
    source = source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  }
  const boot = 'init();\n//#endregion';
  if (source.split(boot).length !== 2) throw new Error('Assistant boot anchor changed');
  source = source.replace(boot, START + '\n' + boot);
  // Expose the native world-map callbacks without replacing their preflight,
  // cancellation, map/profile checks, or loading behavior.
  for (const [anchor, replacement] of [
    ['loadData: async () => {', 'loadData: WorldMap.lroLoadData = async () => {'],
    ['teleport: (mapname, label) => {', 'teleport: WorldMap.lroTeleport = (mapname, label) => {'],
  ]) {
    if (source.split(anchor).length !== 2) throw new Error('Native world map callback changed: ' + anchor);
    source = source.replace(anchor, replacement);
  }
  return IMPORTS + source;
}
