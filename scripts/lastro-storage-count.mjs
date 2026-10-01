import ts from 'typescript';

function patchRegion(source, path, patch) {
  const marker = '//#region ' + path;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:storage-count:region');
  const region = source.slice(start, end);
  const file = ts.createSourceFile(path, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function one(predicate, label) {
    const matches = [];
    function visit(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
    visit(file);
    if (matches.length !== 1) throw new Error('anchor:storage-count:' + label);
    return matches[0];
  }
  patch(file, one, edits);
  let output = region;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end ?? edit.start);
  }
  return source.slice(0, start) + output + source.slice(end);
}

export function patchRuntimeStorageCount(source) {
  source = patchRegion(source, 'src/UI/Components/Storage/StorageV3/StorageFilter.js', (file, one, edits) => {
    const method = one(node => ts.isBinaryExpression(node) && node.left.getText(file) === 'StorageFilter.prototype.setItems'
      && ts.isFunctionExpression(node.right), 'set-items').right;
    const list = one(node => node.getStart(file) > method.body.getStart(file) && node.end < method.body.end
      && ts.isBinaryExpression(node) && node.left.getText(file) === 'this._list', 'filter-list');
    if (list.right.getText(file) !== 'items.slice(0)') throw new Error('anchor:storage-count:filter-copy');
    // Each filter applies the same server delta as the main storage. Copy the
    // records, not just the array, so their count fields cannot be changed twice.
    edits.push({ start: list.right.getStart(file), end: list.right.end, text: 'items.map((item) => ({ ...item }))' });
  });
  return patchRegion(source, 'src/UI/Components/Storage/StorageCommon.js', (file, one, edits) => {
    const add = one(node => ts.isBinaryExpression(node) && node.left.getText(file) === 'Component.addItem'
      && ts.isFunctionExpression(node.right), 'add-item').right.body;
    const returned = one(node => node.getStart(file) > add.getStart(file) && node.end < add.end
      && ts.isReturnStatement(node) && !node.expression, 'add-return');
    const refresh = '\n      if (hasSearch && _openFilters[ItemType_default.SEARCH]) Component.onSearch();\n';
    // Search filters are not category tabs; rebuild an open search only after
    // the authoritative storage record receives a confirmed deposit.
    edits.push({ start: returned.getStart(file), text: refresh });
    edits.push({ start: add.end - 1, text: refresh });
    const order = one(node => ts.isBinaryExpression(node) && node.left.getText(file) === 'list'
      && node.right.getText(file) === '_list.slice(0)', 'order-list');
    edits.push({ start: order.right.getStart(file), end: order.right.end, text: 'list.slice(0)' });
  });
}
