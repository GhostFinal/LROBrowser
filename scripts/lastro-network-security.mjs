import ts from 'typescript';

/** LastRO keeps these published legacy frames while selecting a newer client date. */
export function patchRuntimeLastROItemLayouts(source) {
  const marker = '//#region src/Network/PacketStructure.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:network-security:packet-structure');
  const region = source.slice(start, end);
  const file = ts.createSourceFile('PacketStructure.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const layouts = new Map([
    ['PACKET_ZC_ITEM_FALL_ENTRY2', [19, 1]],
    ['PACKET_ZC_PROPERTY_HOMUN2', [75, 1]],
    ['PACKET_ZC_ACK_ADD_ITEM_RODEX', [53, 5]],
    ['PACKET_ZC_ADD_ITEM_TO_STORE3', [47, 5]],
    ['PACKET_ZC_ADD_ITEM_TO_CART3', [47, 5]],
    ['PACKET_ZC_ITEM_PICKUP_ACK7', [59, 5]],
  ]);
  const found = new Map();
  function collect(node) {
    if (ts.isFunctionExpression(node) && layouts.has(node.name?.text)) {
      const name = node.name.text;
      if (found.has(name) || node.parameters.map(parameter => parameter.name.getText(file)).join(',') !== 'fp,end') {
        throw new Error('anchor:network-security:item-layout:' + name);
      }
      found.set(name, node);
      return;
    }
    ts.forEachChild(node, collect);
  }
  collect(file);
  const changes = [];
  for (const [name, [legacyLength, expectedConditions]] of layouts) {
    const fn = found.get(name);
    if (!fn || fn.getText(file).includes('lastroUsesWideItemIds')) throw new Error('anchor:network-security:item-layout:' + name);
    const conditions = [];
    function findConditions(node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(file).replace(/\s/g, '') === 'PacketVerManager_default.value>=20181121'
        && node.whenTrue.getText(file).replace(/\s/g, '') === 'fp.readULong()'
        && node.whenFalse.getText(file).replace(/\s/g, '') === 'fp.readUShort()') {
        conditions.push(node.condition);
      }
      ts.forEachChild(node, findConditions);
    }
    findConditions(fn.body);
    if (conditions.length !== expectedConditions) throw new Error('anchor:network-security:item-width:' + name);
    for (const condition of conditions) changes.push({ start: condition.getStart(file), end: condition.end, text: 'lastroUsesWideItemIds' });
    changes.push({ start: fn.body.getStart(file) + 1, end: fn.body.getStart(file) + 1, text: `
    const lastroUsesWideItemIds = Configs.get("lastroProtocol", false) && end - fp.tell() + 2 === ${legacyLength}
      ? false : PacketVerManager_default.value >= 20181121;
` });
  }
  let patched = region;
  for (const change of changes.sort((a, b) => b.start - a.start)) patched = patched.slice(0, change.start) + change.text + patched.slice(change.end);
  return source.slice(0, start) + patched + source.slice(end);
}
