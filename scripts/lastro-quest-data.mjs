import ts from 'typescript';

const metadataFields = new Set(['name', 'desc', 'type', 'show', 'display', 'outset', 'path', 'questPos', 'position', 'npc', 'keyword', 'items']);

export function buildLastroQuestMetadata(source) {
  const file = ts.createSourceFile('QuestInfo.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) throw new Error('anchor:lastro-quest-metadata');
  const result = Object.create(null);
  const keyOf = node => ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : null;
  function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node)) {
      const value = Object.create(null);
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || keyOf(property.name) === null) throw new Error('anchor:lastro-quest-metadata');
        value[keyOf(property.name)] = literal(property.initializer);
      }
      return value;
    }
    throw new Error('anchor:lastro-quest-metadata');
  }
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isElementAccessExpression(node.left) && node.left.expression.getText(file) === 'QuestInfo') {
      const id = ts.isNumericLiteral(node.left.argumentExpression) ? Number(node.left.argumentExpression.text) : 0;
      if (!Number.isSafeInteger(id) || id <= 0 || !ts.isObjectLiteralExpression(node.right)) throw new Error('anchor:lastro-quest-metadata');
      const row = Object.create(null);
      for (const property of node.right.properties) {
        if (!ts.isPropertyAssignment(property) || keyOf(property.name) === null) throw new Error('anchor:lastro-quest-metadata');
        const key = keyOf(property.name);
        if (metadataFields.has(key)) row[key] = literal(property.initializer);
      }
      result[id] = row;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!Object.keys(result).length) throw new Error('anchor:lastro-quest-metadata');
  return result;
}

// Self-contained so the runtime patch can serialize this factory into its bundle.
export function createLastroQuestData({ getInfo, getMonsterName, legacyMetadata = {}, isLastro = false }) {
  const enabled = () => typeof isLastro === 'function' ? Boolean(isLastro()) : Boolean(isLastro);
  const infoFor = id => getInfo?.(id) || {};
  const clone = value => Array.isArray(value) ? value.map(clone)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
  const plain = value => (Array.isArray(value) ? value.join('\n') : String(value ?? ''))
    .replace(/\^[0-9a-f]{6}/gi, '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
  const titleKey = value => plain(value).replace(/^(?:(?:\[[^\]]+\]|【[^】]+】)\s*)+/, '').trim();
  const meaningful = value => typeof value === 'string' && value.trim() && !/^(?:unknown quest|uknown quest|未知任务)$/i.test(value.trim());
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const idOf = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff ? value : null;
  const knownMonsterName = value => typeof value === 'string' && value.trim() && value !== 'Unknown' && !/^魔物 #\d+$/.test(value);
  const regexpText = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function bountyTargets(quest) {
    return (quest.lastroBountyKeys || []).map(key => quest.hunt_list[key]).filter(hunt => hunt && idOf(hunt.mobGID)).map(hunt => {
      const dbName = getMonsterName?.(hunt.mobGID), name = plain(knownMonsterName(dbName) ? dbName : hunt.mobName || `魔物 #${hunt.mobGID}`);
      return { name, maxCount: hunt.maxCount, known: knownMonsterName(name) && /[\u3400-\u9fff]/.test(name) };
    });
  }

  function matchesTargets(description, targets) {
    const text = plain(description);
    return targets.length > 0 && targets.every(({ name, maxCount, known }) => {
      if (!known || !Number.isSafeInteger(maxCount) || maxCount < 0) return false;
      const count = String(maxCount), monster = regexpText(name), end = '(?=$|[\\s，。；、,.!！;:：()（）]|后|并|即可|完成)';
      return new RegExp(`(?:^|[^0-9])${count}\\s*(?:只|个|头)?\\s*${monster}${end}`).test(text)
        || new RegExp(`${monster}\\s*[:：]\\s*${count}\\s*(?:只|个|头)?${end}`).test(text);
    });
  }

  function hydrateBountyText(quest, info) {
    const targets = bountyTargets(quest), names = targets.map(target => target.name);
    const titleContainsTargets = value => names.length > 0 && targets.every(target => target.known) && names.every(name => plain(value).includes(name));
    const serverTitle = names.length ? `[赏金] 狩猎：${names.join('、')}` : '[赏金] 狩猎任务';
    quest.summary = '';
    if (matchesTargets(info.Description, targets)) {
      quest.title = meaningful(info.Title) && (titleContainsTargets(info.Title) || !/狩猎|猎杀/.test(plain(info.Title))) ? info.Title : serverTitle;
      quest.description = clone(info.Description);
      return 'current';
    }
    const legacy = legacyMetadata[quest.questID];
    if (legacy?.type === 7 && meaningful(legacy.name) && titleContainsTargets(legacy.name) && matchesTargets(legacy.desc, targets)) {
      quest.title = plain(legacy.name);
      quest.description = plain(legacy.desc);
      return 'legacy';
    }
    quest.title = serverTitle;
    quest.description = targets.map(({ name, maxCount }) => Number.isSafeInteger(maxCount) && maxCount >= 0 ? `击败${maxCount}只${name}` : `狩猎${name}`).join('；');
    return 'server';
  }

  function metadataFor(questID) {
    const legacy = enabled() ? legacyMetadata[questID] : null;
    if (!legacy) return { type: null, route: null };
    const info = infoFor(questID);
    const currentTitle = meaningful(info.Title) ? titleKey(info.Title) : '', oldTitle = plain(legacy.name);
    const currentDescription = plain(info.Description), oldDescription = plain(legacy.desc);
    const matches = Boolean((currentTitle && oldTitle && currentTitle === oldTitle)
      || (currentDescription && oldDescription && currentDescription === oldDescription));
    if (!matches || !['outset', 'path', 'questPos'].some(key => Array.isArray(legacy[key]) && legacy[key].length)) {
      return { type: Number.isInteger(legacy.type) ? legacy.type : null, route: null };
    }
    const route = { npc: typeof legacy.npc === 'string' ? legacy.npc : '' };
    for (const key of ['outset', 'path', 'questPos', 'position']) route[key] = Array.isArray(legacy[key]) ? clone(legacy[key]) : [];
    return { type: Number.isInteger(legacy.type) ? legacy.type : null, route };
  }

  function hydrateQuest(quest) {
    const info = infoFor(quest.questID), hydrated = { ...quest };
    hydrated.title = meaningful(info.Title) ? info.Title : meaningful(quest.title) ? quest.title : `任务 #${quest.questID}`;
    hydrated.summary = has(info, 'Summary') ? info.Summary : quest.summary || '';
    hydrated.description = has(info, 'Description') ? clone(info.Description) : clone(quest.description ?? '');
    hydrated.icon = info.IconName || quest.icon || 'ico_nq.bmp';
    if (has(info, 'NpcNavi') && typeof info.NpcNavi === 'string') hydrated.npc_navi = info.NpcNavi;
    if (has(info, 'NpcPosX') && typeof info.NpcPosX === 'number' && Number.isFinite(info.NpcPosX)) hydrated.npc_pos_x = info.NpcPosX;
    if (has(info, 'NpcPosY') && typeof info.NpcPosY === 'number' && Number.isFinite(info.NpcPosY)) hydrated.npc_pos_y = info.NpcPosY;
    hydrated.hunt_list = Object.create(null);
    for (const [key, hunt] of Object.entries(quest.hunt_list || {})) {
      if (!hunt || typeof hunt !== 'object') continue;
      const name = !hunt.mobName && idOf(hunt.mobGID) ? getMonsterName?.(hunt.mobGID) : null;
      hydrated.hunt_list[key] = { ...hunt, mobName: hunt.mobName || (name && name !== 'Unknown' ? name : '') };
    }
    if (enabled() && hydrated.lastroBountySource && hydrateBountyText(hydrated, info) !== 'current') {
      // A matching numeric ID does not authorize another task's NPC coordinates.
      hydrated.npc_navi = null; hydrated.npc_pos_x = null; hydrated.npc_pos_y = null;
    }
    return hydrated;
  }

  function fromHuntingList(pkt, currentQuests = {}) {
    const output = Object.create(null);
    if (!enabled() || !Array.isArray(pkt?.HuntingList)) {
      for (const [id, quest] of Object.entries(currentQuests)) if (quest) output[id] = hydrateQuest(quest);
      return output;
    }
    // Strip only the previous snapshot's contribution; ordinary quest state stays.
    for (const [id, quest] of Object.entries(currentQuests)) {
      if (!quest || quest.lastroBountyOnly) continue;
      const base = { ...quest };
      if (quest.lastroBountySource) {
        base.hunt_list = clone(quest.hunt_list || {});
        for (const key of quest.lastroBountyKeys || []) delete base.hunt_list[key];
        base.count = Object.keys(base.hunt_list).length;
      }
      for (const key of ['lastroBountySource', 'lastroBountyOnly', 'lastroBountyKeys']) delete base[key];
      output[id] = hydrateQuest(base);
    }
    const groups = new Map();
    for (const row of pkt.HuntingList) {
      if (!row || !idOf(row.questID) || !idOf(row.mobGID)
        || !Number.isSafeInteger(row.count) || row.count < 0
        || !Number.isSafeInteger(row.maxCount) || row.maxCount < 0) continue;
      if (!groups.has(row.questID)) groups.set(row.questID, new Map());
      groups.get(row.questID).set(row.mobGID, row);
    }
    for (const [id, hunts] of groups) {
      const ordinary = output[id];
      const quest = hydrateQuest(ordinary || { questID: id, active: 1, count: 0, hunt_list: {} });
      quest.lastroBountySource = true;
      quest.lastroBountyOnly = !ordinary;
      quest.lastroBountyKeys = [];
      for (const [mobGID, row] of hunts) {
        // Ordinary packet targets stay independent, even for the same monster.
        // Only remove keys added by this snapshot so live standard progress survives.
        let key = String(mobGID);
        if (has(quest.hunt_list, key)) {
          key = `bounty:${mobGID}`;
          let suffix = 1;
          while (has(quest.hunt_list, key)) key = `bounty:${mobGID}:${suffix++}`;
        }
        const name = getMonsterName?.(mobGID);
        quest.hunt_list[key] = { mobGID,
          huntCount: row.count, maxCount: row.maxCount, mobName: name && name !== 'Unknown' ? name : `魔物 #${mobGID}` };
        quest.lastroBountyKeys.push(key);
      }
      quest.count = Object.keys(quest.hunt_list).length;
      output[id] = hydrateQuest(quest);
    }
    return output;
  }
  return { hydrateQuest, fromHuntingList, metadataFor };
}
