import ts from 'typescript';

/** Enchants share the four card fields but have no normal card affix. */
export function lastroItemEnchantName(info, normalCardResource) {
  if (!info || typeof info !== 'object') return '';
  const clean = value => typeof value === 'string' ? value.replace(/\^[a-f\d]{6}/gi, '').trim() : '';
  const affix = clean(info.prefixName);
  const knownEnchant = info._lastroEnchant === true;
  let name;
  if (/^\[[^[\]]+\]$/.test(affix)) name = affix.slice(1, -1).trim();
  else {
    // The packaged itemInfo tables give enchants their actual name even when
    // unidentified. Normal cards instead use an unidentified "card" label.
    // Do not infer this from a slot position or numeric item-ID range.
    if (affix && !knownEnchant) return '';
    const identified = clean(info.identifiedDisplayName);
    const unidentified = clean(info.unidentifiedDisplayName);
    if (!identified || (!knownEnchant && identified !== unidentified) || /卡片|card|カード|카드|卡$|unknown item/i.test(identified)
      || (normalCardResource && info.identifiedResourceName === normalCardResource)
      || Number(info.slotCount || 0) !== 0 || Number(info.ClassNum || 0) !== 0) return '';
    name = identified;
  }
  if (!name || /[<>[\]]/.test(name)) return '';
  // Keep the resource/display tables untouched; compact only the name suffix.
  name = name.replace(/\s*(?:lv\.?|level)\s*(\d+)\s*$/i, '$1')
    .replace(/(\d+)\s*lv\.?\s*$/i, '$1');
  return name;
}

function replaceOne(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error('anchor:item-name:' + label);
  return source.replace(needle, replacement);
}

export function patchRuntimeItemName(source) {
  const marker = '//#region src/DB/DBManager.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:item-name:region');
  const region = source.slice(start, end);
  if (region.includes('lastroItemEnchantName')) throw new Error('anchor:item-name:already-patched');
  const file = ts.createSourceFile('DBManager.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'getItemName') methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (methods.length !== 1 || !methods[0].body) throw new Error('anchor:item-name:method');
  const method = methods[0];
  let body = method.body.getText(file).replace(/\r\n/g, '\n');
  body = replaceOne(body, 'if (numOfOptions) str += " [" + numOfOptions + " Option]";',
    'if (numOfOptions) str += " [" + numOfOptions + "词条]";', 'option-label');
  body = replaceOne(body, '        showItemOptions = true,',
    '        showItemOptions = true,\n        showItemEnchants = true,', 'options');
  body = replaceOne(body, '      let prefix = "";',
    '      const enchants = [];\n      let prefix = "";', 'suffix-list');
  body = replaceOne(body, '              if (card) {', `              if (card) {
                const cardInfo = DB.getItemInfo(card);
                const enchantName = lastroItemEnchantName(cardInfo, DB.getItemInfo(4001).identifiedResourceName);
                if (enchantName) { enchants.push(enchantName); continue; }
                // Missing card-name data must not produce an empty Double/Triple.
                if (!cardInfo.prefixName || !cardInfo.prefixName.trim()) continue;`, 'card-classification');
  body = replaceOne(body, '      return str;',
    '      if (showItemEnchants && showItemPostfix) {\n        for (const enchant of enchants) str += " [" + enchant + "]";\n      }\n      return str;', 'suffix-output');
  const changes = [{ start: method.body.getStart(file), end: method.body.end, text: body }];
  const nameRegistrations = [];
  function findNames(node) {
    if (ts.isBinaryExpression(node) && node.left.getText(file) === 'ItemDBNameTbl[decoded_baseItem]'
      && node.right.getText(file) === 'itemID') nameRegistrations.push(node.parent);
    ts.forEachChild(node, findNames);
  }
  findNames(file);
  if (nameRegistrations.length !== 1) throw new Error('anchor:item-name:item-db-names');
  changes.push({ start: nameRegistrations[0].end, end: nameRegistrations[0].end, text: `
          if (lastroEnchantBases.has(decoded_baseItem))
            (ItemTable_default[itemID] || (ItemTable_default[itemID] = {}))._lastroEnchant = true;` });
  const loaders = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadEnchantListFile');
  if (loaders.length !== 1) throw new Error('anchor:item-name:enchant-loader');
  const registeredHandlers = new Set(['AddEnchantRate', 'AddPerfectEnchant', 'AddPerfectEnchantMaterial', 'AddUpgradeEnchant', 'AddUpgradeEnchantMaterial']);
  const handlers = new Map();
  let resolver;
  function findRegistrations(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'resolveItem') {
      if (resolver) throw new Error('anchor:item-name:resolve-item');
      resolver = node.parent.parent;
    }
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(file) === 'ctx'
      && registeredHandlers.has(node.left.name.text)) handlers.set(node.left.name.text, node.right);
    ts.forEachChild(node, findRegistrations);
  }
  findRegistrations(loaders[0]);
  if (!resolver || handlers.size !== registeredHandlers.size) throw new Error('anchor:item-name:enchant-registrations');
  changes.push({ start: resolver.end, end: resolver.end, text: `
        const resolveEnchantItem = (baseName) => {
          lastroEnchantBases.add(baseName);
          const item = resolveItem(baseName);
          if (item.id) (ItemTable_default[item.id] || (ItemTable_default[item.id] = {}))._lastroEnchant = true;
          return item;
        };` });
  for (const [name, handler] of handlers) {
    let count = 0;
    function mark(node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'resolveItem'
        && ['baseName', 'resultName'].includes(node.arguments[0]?.getText(file))) {
        changes.push({ start: node.expression.getStart(file), end: node.expression.end, text: 'resolveEnchantItem' });
        count++;
      }
      ts.forEachChild(node, mark);
    }
    mark(handler);
    if (count !== (name.startsWith('AddUpgrade') ? 2 : 1)) throw new Error('anchor:item-name:enchant-' + name);
  }
  let output = region;
  for (const edit of changes.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  // EnchantList and ItemDBNameTbl can finish in either order. Retain the base
  // names so the name-table callback can resolve enchants registered first.
  output = 'const lastroEnchantBases = new Set();\n' + lastroItemEnchantName.toString() + '\n' + output;
  return source.slice(0, start) + output + source.slice(end);
}
