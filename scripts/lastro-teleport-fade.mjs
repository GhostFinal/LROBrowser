import ts from 'typescript';

export function createLastroTeleportFade({ document, getCover = () => null }) {
  const win = document?.defaultView;
  let overlay, animation, timer, pending = false, committed = false;
  function onVisibility() { if (document.hidden) reset(); }
  function reset() {
    if (timer !== undefined) win?.clearTimeout(timer);
    timer = undefined;
    pending = false;
    committed = false;
    if (animation) { animation.onfinish = null; animation.cancel(); }
    animation = undefined;
    overlay?.remove(); overlay = undefined;
    document?.removeEventListener('visibilitychange', onVisibility);
  }
  function reveal() {
    if (!pending || !committed) return;
    if (document.hidden || getCover()?.isConnected) { reset(); return; }
    pending = false;
    win.clearTimeout(timer);
    overlay.style.opacity = '0';
    try {
      const duration = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 100 : 350;
      animation = overlay.animate([{ opacity: 0.3 }, { opacity: 0 }], { duration, easing: 'ease-out' });
      animation.onfinish = reset;
      timer = win.setTimeout(reset, duration + 100);
    } catch { reset(); }
  }
  function start(ready) {
    reset();
    if (!win || !document.body || document.hidden || getCover()?.isConnected) return;
    const node = document.createElement('div');
    node.dataset.lastroTeleportFade = '';
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, {
      position: 'fixed', inset: '0', background: '#000', opacity: '0.3',
      pointerEvents: 'none', zIndex: '49',
    });
    overlay = node; document.body.append(node);
    pending = true;
    committed = ready;
    document.addEventListener('visibilitychange', onVisibility);
    timer = win.setTimeout(reset, 2000);
  }
  function play() { start(true); }
  function arm() { start(false); }
  return { play, arm, reveal, reset };
}

export function patchRuntimeTeleportFade(source) {
  const marker = '//#region src/Renderer/MapRenderer.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  const fail = () => { throw new Error('anchor:teleport-fade'); };
  if (end < start || source.indexOf(marker, start + marker.length) >= 0 || source.includes('LastROTeleportFade')) fail();
  const region = source.slice(start, end);
  const file = ts.createSourceFile('MapRenderer.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods = [], edits = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node) && ['setMap', 'free', 'onRender'].includes(node.name.getText(file))) methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const setMap = methods.filter(node => node.name.getText(file) === 'setMap');
  const free = methods.filter(node => node.name.getText(file) === 'free');
  const onRender = methods.filter(node => node.name.getText(file) === 'onRender');
  if (setMap.length !== 1 || free.length !== 1 || onRender.length !== 1) fail();
  const callbacks = [];
  function findCallbacks(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'Background.remove') callbacks.push(node.arguments[0]);
    ts.forEachChild(node, findCallbacks);
  }
  findCallbacks(setMap[0]);
  if (callbacks.length !== 1 || !ts.isArrowFunction(callbacks[0]) || !ts.isBlock(callbacks[0].body)) fail();
  const statements = callbacks[0].body.statements;
  const render = statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(file) === 'Renderer.render');
  if (render.length !== 1 || !statements.some(node => node.getText(file) === 'MapRenderer.onLoad();')) fail();
  const guard = setMap[0].body.statements.filter(node => node.getText(file) === 'if (this.loading) return;');
  if (guard.length !== 1 || !setMap[0].body.getText(file).includes('stripMapExtension(this.currentMap) !== stripMapExtension(mapname)')) fail();
  const drawn = onRender[0].body.statements.filter(node => node.getText(file) === 'PostProcess.render(gl);');
  if (drawn.length !== 1 || drawn[0] !== onRender[0].body.statements.at(-1)) fail();
  edits.push({ at: render[0].getStart(file), text: 'LastROTeleportFade.play();\n        ' });
  edits.push({ at: guard[0].end, text: '\n      LastROTeleportFade.reset();' });
  edits.push({ at: free[0].body.getStart(file) + 1, text: '\n      LastROTeleportFade.reset();' });
  edits.push({ at: drawn[0].end, text: '\n      LastROTeleportFade.reveal();' });
  let patched = region;
  for (const { at, text } of edits.sort((a, b) => b.at - a.at)) patched = patched.slice(0, at) + text + patched.slice(at);
  let getCover = '() => null';
  const backgroundMarker = '//#region src/UI/Background.js';
  const backgroundStart = source.indexOf(backgroundMarker);
  if (backgroundStart >= 0) {
    const backgroundEnd = source.indexOf('//#endregion', backgroundStart);
    if (backgroundEnd < backgroundStart || source.indexOf(backgroundMarker, backgroundStart + backgroundMarker.length) >= 0) fail();
    const backgroundRegion = source.slice(backgroundStart, backgroundEnd);
    const backgroundFile = ts.createSourceFile('Background.js', backgroundRegion, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const transition = backgroundFile.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'transition');
    const overlay = backgroundFile.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(decl => decl.name.getText(backgroundFile) === '_overlay'));
    if (transition.length !== 1 || overlay.length !== 1
      || !transition[0].body?.getText(backgroundFile).includes('document.body.appendChild(_overlay);')
      || !transition[0].body?.getText(backgroundFile).includes('_overlay.parentNode.removeChild(_overlay);')) fail();
    getCover = '() => typeof _overlay !== "undefined" ? _overlay : null';
  }
  const helper = `const LastROTeleportFade = (${createLastroTeleportFade.toString()})({ document: globalThis.document, getCover: ${getCover} });\n`;
  let output = source.slice(0, start) + helper + patched + source.slice(end);
  // A successful blink can be reported as a self TELEPORT vanish without a
  // map reload. Ordinary exits, deaths and other actors never dim the viewport.
  const entityMarker = '//#region src/Engine/MapEngine/Entity.js';
  const entityStart = output.indexOf(entityMarker);
  if (entityStart < 0) return output;
  const entityEnd = output.indexOf('//#endregion', entityStart);
  if (entityEnd < entityStart || output.indexOf(entityMarker, entityStart + entityMarker.length) >= 0) fail();
  const entityRegion = output.slice(entityStart, entityEnd);
  const entityFile = ts.createSourceFile('Entity.js', entityRegion, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const vanish = entityFile.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'onEntityVanish');
  if (vanish.length !== 1 || vanish[0].parameters.map(node => node.name.getText(entityFile)).join(',') !== 'pkt' || !vanish[0].body) fail();
  const exists = vanish[0].body.statements.filter(node => ts.isIfStatement(node) && node.expression.getText(entityFile) === 'entity');
  const lookup = vanish[0].body.statements.filter(node => node.getText(entityFile) === 'const entity = EntityManager.get(pkt.GID);');
  if (exists.length !== 1 || lookup.length !== 1 || !ts.isBlock(exists[0].thenStatement)
    || !vanish[0].body.getText(entityFile).includes('case Entity.VT.TELEPORT:')) fail();
  const at = exists[0].thenStatement.getStart(entityFile) + 1;
  const notify = `
    if (pkt.type === Entity.VT.TELEPORT &&
        pkt.GID === SessionStorage_default.Entity?.GID &&
        SessionStorage_default.Playing && !MapRenderer.loading) LastROTeleportFade.arm();`;
  output = output.slice(0, entityStart) + entityRegion.slice(0, at) + notify + entityRegion.slice(at) + output.slice(entityEnd);
  return output;
}
