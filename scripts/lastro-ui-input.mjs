import ts from 'typescript';

// UI positions move in the parent's coordinates. Content dimensions also
// include the component's own scale, so the two conversions are distinct.
function lastroUiInputFrame(host) {
  const win = host.ownerDocument.defaultView, rect = host.getBoundingClientRect();
  const positive = (value, fallback = 1) => Number.isFinite(value) && value > 0 ? value : fallback;
  const effectiveX = positive(rect.width / host.offsetWidth), effectiveY = positive(rect.height / host.offsetHeight);
  const scale = String(win.getComputedStyle(host).scale || host.style.scale || '1').trim().split(/\s+/).map(Number);
  const ownX = positive(scale[0]), ownY = positive(scale[1], ownX);
  const ancestorX = effectiveX / ownX, ancestorY = effectiveY / ownY;
  const originX = rect.left - host.offsetLeft * ancestorX, originY = rect.top - host.offsetTop * ancestorY;
  return {
    effectiveX, effectiveY, ancestorX, ancestorY, originX, originY,
    rectLeft: rect.left, rectTop: rect.top, scrollX: win.scrollX || 0, scrollY: win.scrollY || 0,
    left: -originX / ancestorX, top: -originY / ancestorY,
    right: (win.innerWidth - originX) / ancestorX, bottom: (win.innerHeight - originY) / ancestorY,
    width: rect.width / ancestorX, height: rect.height / ancestorY,
  };
}

function lastroUiLogicalPointer(frame, pointer, content = false) {
  const x = pointer.x - frame.scrollX, y = pointer.y - frame.scrollY;
  return content ? { x: (x - frame.rectLeft) / frame.effectiveX, y: (y - frame.rectTop) / frame.effectiveY }
    : { x: (x - frame.originX) / frame.ancestorX, y: (y - frame.originY) / frame.ancestorY };
}

function lastroUiDragBounds(host, frame) {
  const rect = host.getBoundingClientRect();
  return { left: (rect.left - frame.originX) / frame.ancestorX, top: (rect.top - frame.originY) / frame.ancestorY,
    right: (rect.right - frame.originX) / frame.ancestorX, bottom: (rect.bottom - frame.originY) / frame.ancestorY };
}

function fail(label) { throw new Error('anchor:ui-input:' + label); }

function patchRegion(source, path, mutate) {
  const marker = '//#region ' + path, start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) fail(path);
  const region = source.slice(start, end);
  const file = ts.createSourceFile(path, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), edits = [];
  const find = (scope, predicate) => {
    const result = [];
    function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
    visit(scope); return result;
  };
  const one = (scope, predicate, label) => {
    const found = find(scope, predicate);
    if (found.length !== 1) fail(label);
    return found[0];
  };
  const replace = (node, text) => edits.push({ start: node.getStart(file), end: node.end, text });
  mutate({ file, find, one, replace, edits });
  let result = region;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end ?? edit.start);
  return source.slice(0, start) + result + source.slice(end);
}

function patchDrag(source) {
  return patchRegion(source, 'src/UI/GUIComponent.js', ({ file, find, one, replace, edits }) => {
    const method = one(file, node => ts.isMethodDeclaration(node) && node.name.getText(file) === 'draggable', 'draggable');
    const variable = name => one(method, node => ts.isVariableDeclaration(node) && node.name.getText(file) === name, 'drag-' + name);
    const start = variable('onStart').initializer, move = variable('dragging').initializer, end = variable('onEnd').initializer;
    if (![start, move, end].every(node => ts.isArrowFunction(node) && ts.isBlock(node.body))) fail('drag-functions');
    const x = variable('x'), y = variable('y'), width = variable('width'), height = variable('height');
    if (x.initializer.getText(file) !== 'host.offsetLeft - Mouse.screen.x' || y.initializer.getText(file) !== 'host.offsetTop - Mouse.screen.y'
      || width.initializer.getText(file) !== 'host.offsetWidth' || height.initializer.getText(file) !== 'host.offsetHeight') fail('drag-origin');
    edits.push({ start: x.parent.parent.getStart(file), text: 'const lastroDragFrame = lastroUiInputFrame(host);\n        const lastroStartPointer = lastroUiLogicalPointer(lastroDragFrame, Mouse.screen);\n        ' });
    replace(x.initializer, 'host.offsetLeft - lastroStartPointer.x'); replace(y.initializer, 'host.offsetTop - lastroStartPointer.y');
    replace(width.parent.parent, ''); replace(height.parent.parent, '');
    for (const [name, value] of [['lastMx', 'lastroStartPointer.x'], ['lastMy', 'lastroStartPointer.y']]) {
      const node = variable(name);
      if (!/^Mouse\.screen\.[xy]$/.test(node.initializer.getText(file))) fail('drag-last-pointer');
      replace(node.initializer, value);
    }
    const mx = variable('mx'), my = variable('my');
    if (mx.initializer.getText(file) !== 'Mouse.screen.x' || my.initializer.getText(file) !== 'Mouse.screen.y') fail('drag-move-pointer');
    edits.push({ start: mx.parent.parent.getStart(file), text: 'const lastroMoveFrame = lastroUiInputFrame(host);\n          const lastroMovePointer = lastroUiLogicalPointer(lastroMoveFrame, Mouse.screen);\n          ' });
    replace(mx.initializer, 'lastroMovePointer.x'); replace(my.initializer, 'lastroMovePointer.y');
    const finished = one(end.body, node => ts.isIfStatement(node) && node.expression.getText(file).includes('ev.which === 1'), 'drag-end-condition');
    if (!ts.isBlock(finished.thenStatement) || !finished.expression.getText(file).includes('ev.which === 1')) fail('drag-end-condition');
    edits.push({ start: finished.thenStatement.getStart(file) + 1, text: '\n            const lastroEndFrame = lastroUiInputFrame(host);' });
    for (const [scope, prefix] of [[move.body, 'lastroMoveFrame'], [end.body, 'lastroEndFrame']]) {
      for (const axis of ['width', 'height']) {
        const reads = find(scope, node => ts.isIdentifier(node) && node.text === axis && !ts.isPropertyAccessExpression(node.parent));
        if (reads.length !== (prefix === 'lastroMoveFrame' ? 5 : 1)) fail('drag-' + prefix + '-' + axis);
        for (const node of reads) replace(node, prefix + '.' + axis);
      }
    }
    for (const [axis, edge] of [['width', 'right'], ['height', 'bottom']]) {
      const references = find(move.body, node => ts.isPropertyAccessExpression(node) && node.getText(file) === 'Mouse.screen.' + axis);
      if (references.length !== 2) fail('drag-edge-' + axis);
      for (const node of references) replace(node, 'lastroMoveFrame.' + edge);
    }
    for (const [position, edge] of [['x_', 'left'], ['y_', 'top']]) {
      const absolute = one(move.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'Math.abs'
        && node.arguments[0]?.getText(file) === position, 'drag-abs-' + position);
      replace(absolute.arguments[0], position + ' - lastroMoveFrame.' + edge);
      const reset = one(move.body, node => ts.isBinaryExpression(node) && node.left.getText(file) === position
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.right.getText(file) === '0', 'drag-reset-' + position);
      replace(reset.right, 'lastroMoveFrame.' + edge);
    }
    const push = one(start.body, node => ts.isCallExpression(node) && node.expression.getText(file) === '_snapCache.push', 'drag-snap-cache');
    const box = push.arguments[0];
    if (!ts.isObjectLiteralExpression(box) || box.properties.map(node => node.name?.getText(file)).join(',') !== 'left,top,right,bottom') fail('drag-snap-box');
    const nativeBounds = ['el.offsetLeft', 'el.offsetTop', 'el.offsetLeft + el.offsetWidth', 'el.offsetTop + el.offsetHeight'];
    if (box.properties.some((node, index) => !ts.isPropertyAssignment(node) || node.initializer.getText(file) !== nativeBounds[index])) fail('drag-snap-values');
    edits.push({ start: push.parent.getStart(file), text: 'const lastroSnapRect = lastroUiDragBounds(el, lastroDragFrame);\n            ' });
    replace(box, '{ left: lastroSnapRect.left, top: lastroSnapRect.top, right: lastroSnapRect.right, bottom: lastroSnapRect.bottom }');
    const current = variable('curRect');
    if (current.initializer.getText(file) !== 'host.getBoundingClientRect()') fail('drag-grid-position');
    replace(current.initializer, '{ left: host.offsetLeft, top: host.offsetTop }');
    for (const [axis, edge] of [['width', 'right'], ['height', 'bottom']]) {
      const viewport = one(end.body, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        && node.left.getText(file) === '_Renderer?.' + axis && node.right.getText(file) === 'window.inner' + (axis === 'width' ? 'Width' : 'Height'), 'drag-grid-' + axis);
      replace(viewport, 'lastroEndFrame.' + edge);
    }
    for (const [index, edge, pad, step] of [['gxi', 'left', 'padX', 'gw'], ['gyi', 'top', 'padY', 'gh']]) {
      const clamp = one(end.body, node => ts.isBinaryExpression(node) && node.left.getText(file) === index
        && ts.isCallExpression(node.right) && node.right.expression.getText(file) === 'Math.max'
        && node.right.arguments[0]?.getText(file) === '0', 'drag-grid-min-' + index);
      replace(clamp.right.arguments[0], `Math.max(0, Math.ceil((lastroEndFrame.${edge} - ${pad}) / ${step}))`);
    }
  });
}

const resizeRegions = [
  ['ChatBoxSettings/ChatBoxSettings', 'onResize$8', 'ChatBoxSettings._host', 0],
  ['ItemCompare/ItemCompare', 'onResize$7', 'ItemCompare._host', 0],
  ['PartyFriends/PartyFriendsCommon', 'onResize', 'Component._host', 1],
  ['SkillList/SkillListCommon', 'onResize', 'comp._host', 1],
  ['Inventory/InventoryCommon', 'onResize', 'Component._host', 1],
  ['Storage/StorageCommon', 'onResize', 'Component._host', 0],
  ['Storage/StorageV3/StorageFilter', 'StorageFilter.prototype.onResize', 'this._host', 0],
  ['CartItems/CartItems', 'onResize$6', 'CartItems._host', 1],
  ['ItemInfo/ItemInfo', 'onResize$5', 'ItemInfo._host', 0],
  ['ChatRoom/ChatRoom', 'onResize$4', 'ChatRoom._host', 1],
  ['ShortCut/ShortCut', 'onResize$3', 'host', 0],
  ['MakeItemSelection/ItemConvertSelection/ConvertItems', 'onResize$2', 'ConvertItems._host', 0],
  ['MakeItemSelection/ItemListWindowSelection', 'onResize$1', 'ItemListWindowSelection._host', 0],
];

export function patchRuntimeUiInput(source) {
  if (source.includes('// lastro-ui-input-installed')) fail('already-installed');
  let output = patchDrag(source);
  for (const [path, name, host, horizontal] of resizeRegions) {
    output = patchRegion(output, 'src/UI/Components/' + path + '.js', ({ file, find, one, replace }) => {
      const fn = name.includes('.') ? one(file, node => ts.isBinaryExpression(node) && node.left.getText(file) === name
        && ts.isFunctionExpression(node.right), name).right : one(file, node => ts.isFunctionDeclaration(node) && node.name?.text === name, path);
      for (const [axis, captured, expected] of [['x', 'left', horizontal], ['y', 'top', 1]]) {
        const differences = find(fn.body, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusToken
          && node.left.getText(file) === 'Mouse.screen.' + axis && node.right.getText(file) === captured);
        if (differences.length !== expected) fail(path + '-' + axis);
        for (const node of differences) replace(node, `lastroUiLogicalPointer(lastroUiInputFrame(${host === 'this._host' ? 'self._host' : host}), Mouse.screen, true).${axis}`);
        if (expected) {
          const capturedVar = one(fn.body, node => ts.isVariableDeclaration(node) && node.name.getText(file) === captured, path + '-' + captured);
          const value = capturedVar.initializer.getText(file);
          if (!value.includes('_host') && value !== 'host.offsetTop' && value !== 'host.offsetLeft') fail(path + '-origin');
          replace(capturedVar.parent.parent, '');
        }
      }
    });
  }
  output = patchRegion(output, 'src/UI/Components/VendingReport/VendingReport.js', ({ file, one, replace }) => {
    const init = one(file, node => ts.isBinaryExpression(node) && node.left.getText(file) === 'VendingReport.init'
      && ts.isFunctionExpression(node.right), 'vending-init').right;
    const height = one(init.body, node => ts.isPropertyAccessExpression(node) && node.getText(file) === 'content.getBoundingClientRect().height', 'vending-height');
    replace(height, 'content.offsetHeight');
    const drag = one(file, node => ts.isBinaryExpression(node) && node.left.getText(file) === 'VendingReport.onResizeDrag'
      && ts.isFunctionExpression(node.right), 'vending-drag').right;
    const delta = one(drag.body, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusToken
      && node.left.getText(file) === 'e.clientY' && node.right.getText(file) === 'this._startY', 'vending-delta');
    replace(delta, '(e.clientY - this._startY) / lastroUiInputFrame(this._host).effectiveY');
  });
  if (output === source) return source;
  const marker = output.indexOf('//#region src/UI/GUIComponent.js');
  const start = marker < 0 ? 0 : marker;
  const helpers = '// lastro-ui-input-installed\n' + [lastroUiInputFrame, lastroUiLogicalPointer, lastroUiDragBounds].map(fn => fn.toString()).join('\n') + '\n';
  return output.slice(0, start) + helpers + output.slice(start);
}
