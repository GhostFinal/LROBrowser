import ts from 'typescript';

export function getNavigationDockPosition(minimap, navigation, viewport, gap = 8) {
  const width = Math.max(0, navigation.width), height = Math.max(0, navigation.height);
  const maxLeft = Math.max(0, viewport.width - width), maxTop = Math.max(0, viewport.height - height);
  let left = minimap.left - width - gap;
  if (left < 0 && minimap.right + gap + width <= viewport.width) left = minimap.right + gap;
  return {
    left: Math.round(Math.max(0, Math.min(maxLeft, left))),
    top: Math.min(maxTop, Math.round(Math.max(0, Math.min(maxTop, minimap.top)))),
  };
}

export function dockLastroNavigation(navigation, minimapHost) {
  const host = navigation._host;
  if (!host) return;
  const minimap = minimapHost || ['MiniMapV2', 'MiniMap']
    .map(id => globalThis.document.getElementById(id))
    .find(node => node && globalThis.getComputedStyle(node).display !== 'none');
  if (!minimap) return;
  const rect = host.getBoundingClientRect();
  // Preserve the original layout scale; the native footer can overflow the host.
  const scaleX = rect.width / host.offsetWidth || 1, scaleY = rect.height / host.offsetHeight || 1;
  const position = getNavigationDockPosition(minimap.getBoundingClientRect(), {
    width: rect.width, height: Math.max(rect.height, host.scrollHeight * scaleY),
  }, {
    width: globalThis.window.innerWidth, height: globalThis.window.innerHeight,
  });
  // Rects are visual CSS pixels; left/top use the host's layout coordinates.
  const originX = rect.left - host.offsetLeft * scaleX, originY = rect.top - host.offsetTop * scaleY;
  host.style.left = `${(position.left - originX) / scaleX}px`;
  host.style.top = `${(position.top - originY) / scaleY}px`;
}

function fail() { throw new Error('anchor:navigation-ui'); }

function patchRegion(source, path, mutate) {
  const marker = `//#region ${path}`, start = source.indexOf(marker);
  // Independent components may be absent from small runtime fixtures.
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) fail();
  const region = source.slice(start, end);
  if (region.includes('lastro-navigation-ui-installed')) fail();
  const file = ts.createSourceFile(path, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  const find = (node, predicate) => {
    const matches = [];
    function visit(child) {
      if (predicate(child)) matches.push(child);
      ts.forEachChild(child, visit);
    }
    visit(node);
    return matches;
  };
  const method = (name, parameters) => {
    const matches = find(file, node => ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(file) === name
      && ts.isFunctionExpression(node.right));
    const fn = matches[0]?.right;
    if (matches.length !== 1 || !fn.body || fn.parameters.map(node => node.name.getText(file)).join(',') !== parameters) fail();
    return fn;
  };
  mutate({ file, find, method, edits });
  let output = region;
  for (const { start: at, end: until = at, text } of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, at) + text + output.slice(until);
  }
  return source.slice(0, start) + output + source.slice(end);
}

export function patchRuntimeNavigationUi(source) {
  source = patchRegion(source, 'src/UI/Components/Navigation/Navigation.js', ({ file, find, method, edits }) => {
    const navigate = method('Navigation.navigateTo', 'options');
    const show = method('Navigation.show', '');
    const hide = method('Navigation.hide', '');
    const clear = method('Navigation.clear', '');
    const removed = method('Navigation.onRemove', '');
    const finalTargets = find(navigate.body, node => ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(file) === '_finalTargetData');
    if (finalTargets.length !== 1 || !ts.isObjectLiteralExpression(finalTargets[0].right)
      || finalTargets[0].right.properties.map(node => node.name?.getText(file)).join(',') !== 'map,x,y,displayName') fail();
    const roots = find(navigate.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'Navigation.getRoot');
    if (roots.length !== 1 || navigate.body.statements.some(node => node.getText(file).includes('showWindow'))) fail();
    edits.push({ start: navigate.body.getStart(file) + 1, text: `
    if (!this.__loaded) this.prepare();
    if (options.showWindow === false) {
      const lastroNavigationDetached = !this._host?.isConnected;
      if (lastroNavigationDetached) {
        this.ui.hide();
        this.append();
      }
      initializePathFindingWorker();
      const lastroCurrentMap = getCurrentMap();
      if (!lastroNavigationDetached && (!_mapData || _mapData.map !== lastroCurrentMap)) this.loadMap(lastroCurrentMap);
    }` });
    edits.push({ start: finalTargets[0].right.end - 1, text: '\n      showWindow: options.showWindow,\n    ' });
    // Preserve the route mode through native map changes, periodic repaths and manual show.
    for (const fn of [method('Navigation.onAppend', ''), method('Navigation.renderCanvas', 'tick'), show]) {
      const calls = find(fn.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'this.navigateTo');
      const options = calls[0]?.arguments[0];
      if (calls.length !== 1 || calls[0].arguments.length !== 1 || !options || !ts.isObjectLiteralExpression(options)
        || options.properties.map(node => node.name?.getText(file)).join(',') !== 'startMap,startX,startY,endMap,endX,endY,displayName') fail();
      edits.push({ start: options.end - 1, text: '\n        showWindow: _finalTargetData.showWindow,\n      ' });
    }
    const stops = find(hide.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'terminatePathFindingWorker');
    if (stops.length !== 1 || !ts.isExpressionStatement(stops[0].parent)
      || find(removed.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'terminatePathFindingWorker').length !== 1
      || find(clear.body, node => ts.isBinaryExpression(node) && node.left.getText(file) === '_finalTargetData'
        && node.right.kind === ts.SyntaxKind.NullKeyword).length !== 1) fail();
    edits.push({ start: stops[0].parent.getStart(file), end: stops[0].parent.end,
      text: 'if (_finalTargetData?.showWindow !== false) terminatePathFindingWorker();' });
    const shown = find(show.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'this.ui.show');
    if (shown.length !== 1 || !ts.isExpressionStatement(shown[0].parent)) fail();
    edits.push({ start: show.parameters.pos, text: 'minimapHost' });
    edits.push({ start: show.body.getStart(file) + 1, text: '\n    if (!this.__loaded) this.prepare();\n    if (!this._host?.isConnected) this.append();' });
    edits.push({ start: shown[0].parent.end, text: '\n    dockLastroNavigation(this, minimapHost);' });
    edits.push({ start: 0, text: `// lastro-navigation-ui-installed\nconst getNavigationDockPosition = ${getNavigationDockPosition.toString()};\nconst dockLastroNavigation = ${dockLastroNavigation.toString()};\n` });
  });
  return patchRegion(source, 'src/UI/Components/MiniMap/MiniMapCommon.js', ({ file, find, method, edits }) => {
    const init = method('MiniMap.init', '');
    const contexts = find(init.body, node => ts.isCallExpression(node) && node.expression.getText(file) === 'root.querySelector("canvas").getContext');
    const clicks = find(init.body, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'addEventListener' && node.arguments[0]?.getText(file) === '"click"');
    if (contexts.length !== 1 || clicks.length || !ts.isExpressionStatement(contexts[0].parent.parent)) fail();
    edits.push({ start: contexts[0].parent.parent.end, text: `
    // lastro-navigation-ui-installed
    root.querySelector("canvas").addEventListener("click", event => {
      if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      init_Navigation();
      Navigation_default.show(this._host);
      event.stopPropagation();
    });` });
  });
}
