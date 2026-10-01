import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import { buildLastroQuestMetadata, createLastroQuestData } from './lastro-quest-data.mjs';
import { installLastroQuestUI } from './lastro-quest-ui.mjs';

export function installLastroQuestBridge(quest, { data, getQuests, canRefresh, queryHuntingList, clock = globalThis }) {
  let snapshot = null, interval = null, lastQuery = -Infinity;
  const originalSet = quest.setQuestList;
  quest.setQuestList = function (quests) {
    return originalSet.call(this, snapshot ? data.fromHuntingList({ HuntingList: snapshot }, quests) : quests);
  };
  quest.receiveHuntingList = function (packet) {
    if (!Array.isArray(packet?.HuntingList)) return;
    snapshot = packet.HuntingList.filter(row => row && typeof row === 'object').map(row => ({ questID: row.questID, mobGID: row.mobGID, maxCount: row.maxCount, count: row.count }));
    this.setQuestList(getQuests());
  };
  quest.refreshBounties = function () {
    if (!canRefresh() || Date.now() - lastQuery < 1000) return false;
    lastQuery = Date.now();
    try { queryHuntingList(); return true; } catch { return false; }
  };
  for (const name of ['addQuest', 'updateMissionHunt', 'removeQuest']) {
    const original = quest[name];
    quest[name] = function (...args) {
      if (snapshot && name === 'removeQuest') snapshot = snapshot.filter(row => Number(row.questID) !== Number(args[0]));
      const result = original.apply(this, args);
      if (snapshot && name === 'updateMissionHunt') {
        const [update, id, huntID] = args;
        const value = getQuests()[id], hunts = Object.entries(value?.hunt_list || {});
        const match = hunts.find(([key]) => key === String(huntID)) || hunts.find(([, hunt]) => Number(hunt.huntID) === Number(huntID)
          || (Number(update.mobGID) > 0 && Number(hunt.mobGID) === Number(update.mobGID)));
        if (match && value.lastroBountyKeys?.includes(match[0])) for (const row of snapshot) if (Number(row.questID) === Number(id) && Number(row.mobGID) === Number(match[1].mobGID)) {
          if (update.huntCount !== undefined) row.count = update.huntCount;
          if (update.maxCount !== undefined) row.maxCount = update.maxCount;
        }
      }
      if (snapshot && name === 'addQuest') this.setQuestList(getQuests());
      return result;
    };
  }
  const stop = () => { if (interval !== null) clock.clearInterval(interval); interval = null; };
  const onAppend = quest.onAppend, onRemove = quest.onRemove, clean = quest.clean;
  quest.onAppend = function (...args) {
    const result = onAppend?.apply(this, args);
    stop(); this.refreshBounties();
    interval = clock.setInterval(() => this.refreshBounties(), 15000);
    return result;
  };
  quest.onRemove = function (...args) { stop(); return onRemove?.apply(this, args); };
  quest.clean = function (...args) { stop(); snapshot = null; lastQuery = -Infinity; return clean?.apply(this, args); };
  for (const name of ['toggle', 'onShortCut']) {
    const original = quest[name];
    quest[name] = function (...args) { const result = original?.apply(this, args); this.refreshBounties(); return result; };
  }
  return quest;
}

function fail() { throw new Error('anchor:lastro-quests'); }

export function patchRuntimeQuests(source) {
  if (!source.includes('//#region src/UI/Components/Quest/QuestCommon.js')) return source;
  if (source.includes('/* lastro-quest-integration */')) fail();
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = new Map(), edits = [], updates = [], active = [], cleanups = [], defaults = [], appends = [];
  function visit(node, scope = '') {
    if (ts.isFunctionDeclaration(node)) {
      scope = node.name?.text || scope;
      if (['createQuest', 'MainEngine$6', 'onCloseScript'].includes(scope)) {
        if (functions.has(scope)) fail(); functions.set(scope, node);
      }
    }
    if (scope === 'createQuest' && ts.isBindingElement(node) && node.name.getText(file) === 'questWindow') defaults.push(node);
    if (scope === 'createQuest' && ts.isFunctionExpression(node) && node.name?.text === 'updateMissionHunt') updates.push(node);
    if (scope === 'createQuest' && ts.isFunctionExpression(node) && node.name?.text === 'clean') cleanups.push(node);
    if (scope === 'createQuest' && ts.isFunctionExpression(node) && node.name?.text === 'onAppend') appends.push(node);
    if (scope === 'onAddQuest' && ts.isPropertyAssignment(node) && node.name.getText(file) === 'active') active.push(node);
    if (ts.isFunctionExpression(node) && node.name?.text === 'onClosePressed' && ts.isBinaryExpression(node.parent)
      && node.parent.left.getText(file) === 'NpcBox_default.onClosePressed') {
      edits.push({ start: node.body.end - 1, end: node.body.end - 1, text: '\n    Controller$3.getUI()?.refreshBounties?.();\n  ' });
    }
    ts.forEachChild(node, child => visit(child, scope));
  }
  visit(file);
  if (functions.size !== 3 || defaults.length !== 1 || updates.length !== 1 || active.length !== 1 || cleanups.length !== 1 || appends.length !== 1 || edits.length !== 1) fail();
  const factory = functions.get('createQuest');
  const returns = factory.body.statements.filter(node => ts.isReturnStatement(node) && node.expression?.getText(file) === 'UIManager.addComponent(Quest)');
  if (returns.length !== 1 || defaults[0].initializer?.getText(file) !== 'null') fail();
  edits.push({ start: defaults[0].initializer.getStart(file), end: defaults[0].initializer.end, text: '(init_QuestWindow(), QuestWindow_default)' });
  const layout = appends[0].body.statements.find(node => ts.isIfStatement(node) && node.expression.getText(file) === 'renewLayout');
  if (!layout || !layout.elseStatement || !ts.isBlock(layout.elseStatement)) fail();
  edits.push({ start: layout.elseStatement.end - 1, end: layout.elseStatement.end - 1, text: '\n      Quest.setQuestList(_questList);\n      questWindow.append();\n    ' });
  const update = updates[0];
  const updateText = update.body.getText(file);
  let updated = updateText;
  for (const field of ['huntIDCount', 'maxCount', 'huntCount', 'mobGID']) {
    const anchor = `if (hunt_info.${field})`;
    if (updated.split(anchor).length !== 2) fail();
    updated = updated.replace(anchor, `if (hunt_info.${field} !== undefined)`);
  }
  updated = updated.replace('{', `{
    const saved = _questList[questID];
    if (!saved) return;
    saved.hunt_list ||= [];
    if (!saved.hunt_list[huntID]) {
      const match = Object.entries(saved.hunt_list).find(([, hunt]) => Number(hunt.huntID) === Number(huntID)
        || (Number(hunt_info.mobGID) > 0 && Number(hunt.mobGID) === Number(hunt_info.mobGID)));
      if (match) huntID = match[0];
      else saved.hunt_list[huntID] = {huntID, mobGID: hunt_info.mobGID || null, mobName: hunt_info.mobName || "未知目标", huntCount: 0, maxCount: 0};
    }
  `);
  const chat = 'const chat_quest_text = `Mission [${DB.getQuestInfo(questID).Title}], you killed [${mob_name}]. (${_questList[questID].hunt_list[huntID].huntCount}/${_questList[questID].hunt_list[huntID].maxCount})`;';
  if (!updated.includes(chat) || !updated.includes('`${mob_name} [Completed]`')) fail();
  updated = updated.replace(chat, 'const chat_quest_text = `任务 [${_questList[questID].title || DB.getQuestInfo(questID).Title}]：击败 [${mob_name}]。(${_questList[questID].hunt_list[huntID].huntCount}/${_questList[questID].hunt_list[huntID].maxCount})`;')
    .replace('`${mob_name} [Completed]`', '`${mob_name} [已完成]`');
  edits.push({ start: update.body.getStart(file), end: update.body.end, text: updated });
  const clean = cleanups[0];
  if (!clean.body.getText(file).includes('_active_menu = "";')) fail();
  edits.push({ start: clean.body.getStart(file), end: clean.body.end, text: clean.body.getText(file).replace('_active_menu = "";', '_active_menu = "active";\n    _index = -1;\n    _questNotShowList.length = 0;') });
  if (active[0].initializer.getText(file) !== 'pkt.active || 1') fail();
  edits.push({ start: active[0].initializer.getStart(file), end: active[0].initializer.end, text: 'pkt.active ?? 1' });
  const hooks = functions.get('MainEngine$6');
  edits.push({ start: hooks.body.end - 1, end: hooks.body.end - 1, text: `
  Network.hookPacket(PACKET.ZC.HUNTINGLIST, packet => {
    if (Configs.get("lastroProtocol", false)) Controller$3.getUI()?.receiveHuntingList?.(packet);
  });
` });
  const close = functions.get('onCloseScript');
  edits.push({ start: close.body.end - 1, end: close.body.end - 1, text: '\n  Controller$3.getUI()?.refreshBounties?.();\n' });
  const metadata = buildLastroQuestMetadata(readFileSync(new URL('../vendor/core/data/questinfo/QuestInfo.js', import.meta.url), 'utf8'));
  const monsters = JSON.parse(readFileSync(new URL('../vendor/core/data/world/mob-data.json', import.meta.url), 'utf8'));
  const names = Object.fromEntries(Object.entries(monsters).filter(([, value]) => typeof value.kName === 'string' && value.kName.trim()).map(([id, value]) => [id, value.kName]));
  const install = `
  /* lastro-quest-integration */
  const lastroQuestMonsterNames = ${JSON.stringify(names)};
  const lastroQuestData = (${createLastroQuestData.toString()})({
    getInfo: id => DB.getQuestInfo(id), getMonsterName: id => lastroQuestMonsterNames[id] || DB.getMonsterName(id),
    legacyMetadata: ${JSON.stringify(metadata)}, isLastro: () => Configs.get("lastroProtocol", false),
  });
  (${installLastroQuestBridge.toString()})(Quest, {
    data: lastroQuestData, getQuests: () => _questList,
    canRefresh: () => Configs.get("lastroProtocol", false) && !MapRenderer.loading && !!SessionStorage_default.Entity && !!PACKET.CZ.HUNTINGLIST,
    queryHuntingList: () => Network.sendPacket(new PACKET.CZ.HUNTINGLIST()),
  });
  (${installLastroQuestUI.toString()})({
    quest: Quest, helper: questHelper, tracker: questWindow,
    getQuests: () => _questList, getHidden: () => _questNotShowList,
    hydrateQuest: value => ({...lastroQuestData.hydrateQuest(value), route: lastroQuestData.metadataFor(value.questID).route}),
    getItemInfo: id => DB.getItemInfo(id),
    preferences: _preferences, document: globalThis.document, window: globalThis,
    getShowTracker: () => _preferences.showwindow,
    setShowTracker: show => { _preferences.showwindow = show; _preferences.save(); },
    getMapReady: () => !MapRenderer.loading && !!SessionStorage_default.Entity,
    getMiniMap: () => ['MiniMapV2', 'MiniMap'].map(id => document.getElementById(id)).find(host => host?.isConnected && host.style.display !== 'none'),
    getViewport: () => ({width: globalThis.innerWidth, height: globalThis.innerHeight}),
    showMonster: (id, name) => WorldMap_default.searchMonster({id, name}),
    requestRoute: route => {
      const requests = LastROTools?._lastroQuestRoute;
      if (!requests) throw new Error("传送功能尚未就绪");
      const direct = route.path?.length === 1 && route.outset?.every((value, index) => value === route.path[0][index]);
      return requests.request({...route, direct});
    },
    cancelPendingRoute: () => LastROTools?._lastroQuestRoute?.cancelPending(),
    cancelRoute: () => LastROTools?._lastroQuestRoute?.cancel(),
  });
  `;
  edits.push({ start: returns[0].getStart(file), end: returns[0].getStart(file), text: install });
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
