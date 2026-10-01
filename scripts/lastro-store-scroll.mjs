import ts from 'typescript';

export function installLastroStoreScroll(component) {
  if (component._lastroStoreScroll) return component._lastroStoreScroll;
  const root = component.getRoot(), host = component._host;
  const doc = host.ownerDocument, win = doc.defaultView;
  let frame, active, pointer, previous, gesture;
  const windows = '.InputWindow, .OutputWindow, .AvailableItemsWindow';

  function rows(content) {
    return [...content.children].filter(child => child.classList.contains('item'));
  }
  function bounds(content) {
    const height = content.clientHeight;
    const bar = content.querySelector(':scope > .ro-custom-scrollbar');
    if (bar) { bar.style.top = '0px'; bar.style.height = height + 'px'; }
    const items = rows(content);
    const bottom = items.reduce((value, item) => Math.max(value, item.offsetTop + item.offsetHeight), 0);
    const padding = parseFloat(win.getComputedStyle(content).paddingBottom) || 0;
    return { items, height, max: Math.max(0, bottom + padding - height) };
  }
  function sync(content) {
    if (typeof content._roScrollHandler === 'function') content._roScrollHandler();
    else content._roScrollbarRestart?.();
  }
  function refresh(content) {
    if (!content) return;
    const { max } = bounds(content);
    content.scrollTop = Math.max(0, Math.min(content.scrollTop, max));
    sync(content);
  }
  function reveal(content, index) {
    if (!content) return;
    const { items, height, max } = bounds(content);
    const item = items.find(row => row.getAttribute('data-index') === String(index));
    let top = Math.max(0, Math.min(content.scrollTop, max));
    if (item && height > 0) {
      const start = item.offsetTop, end = start + item.offsetHeight;
      if (start < top || item.offsetHeight > height) top = start;
      else if (end > top + height) top = end - height;
    }
    content.scrollTop = Math.max(0, Math.min(top, max));
    sync(content);
  }
  function pause() {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = active = pointer = previous = undefined;
  }
  function stop() { pause(); gesture = undefined; }
  function validDrag() {
    const data = win._OBJ_DRAG_;
    return gesture && data?.type === 'item' && data.from === 'NpcStore'
      && data.container === gesture.container && String(data.index) === gesture.index;
  }
  function speed(content) {
    const rect = content.getBoundingClientRect();
    if (!pointer || rect.height <= 0 || rect.width <= 0 || pointer.x < rect.left || pointer.x > rect.right
      || pointer.y < rect.top || pointer.y > rect.bottom) return 0;
    const scale = rect.height / content.clientHeight;
    const edge = Math.min(rect.height / 3, 32 * scale);
    if (!(edge > 0)) return 0;
    if (pointer.y < rect.top + edge) return -480 * (rect.top + edge - pointer.y) / edge;
    if (pointer.y > rect.bottom - edge) return 480 * (pointer.y - rect.bottom + edge) / edge;
    return 0;
  }
  function tick(time) {
    frame = undefined;
    if (!active?.isConnected || !host.isConnected || doc.hidden || !validDrag()) { stop(); return; }
    const velocity = speed(active);
    if (!velocity) { pause(); return; }
    const { max } = bounds(active);
    const delta = previous === undefined ? 16 : Math.max(0, Math.min(50, time - previous));
    previous = time;
    const top = Math.max(0, Math.min(active.scrollTop + velocity * delta / 1000, max));
    const moved = Math.abs(top - active.scrollTop) > 0.01;
    active.scrollTop = top;
    sync(active);
    if (moved) frame = win.requestAnimationFrame(tick);
    else pause();
  }
  function over(event) {
    if (!validDrag() || doc.hidden) { stop(); return; }
    const target = event.target?.closest?.(windows);
    const content = target && root.contains(target) ? target.querySelector('.content') : null;
    if (!content) { pause(); return; }
    if (active !== content) { pause(); active = content; }
    pointer = { x: event.clientX, y: event.clientY };
    if (!speed(content)) { pause(); return; }
    event.preventDefault();
    if (frame === undefined) frame = win.requestAnimationFrame(tick);
  }
  root.querySelectorAll('.content').forEach(content => { content.style.position = 'relative'; });
  root.addEventListener('dragstart', event => {
    stop();
    const item = event.target?.closest?.('.item');
    const container = item?.closest(windows);
    const index = item?.getAttribute('data-index');
    if (container && root.contains(container) && index) gesture = { container: container.className, index };
  }, true);
  root.addEventListener('dragover', over, true);
  root.addEventListener('dragleave', event => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) pause();
  }, true);
  doc.addEventListener('dragover', event => {
    if (!event.composedPath().includes(host) && !root.contains(event.target)) pause();
  }, true);
  doc.addEventListener('drop', stop, true);
  doc.addEventListener('dragend', stop, true);
  root.addEventListener('drop', stop, true);
  root.addEventListener('dragend', stop, true);
  win.addEventListener('blur', stop);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) stop(); });
  component._lastroStoreScroll = { stop, refresh, reveal };
  return component._lastroStoreScroll;
}

export function patchRuntimeStoreScroll(source) {
  const marker = '//#region src/UI/Components/NpcStore/NpcStore.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:store-scroll:region');
  const region = source.slice(start, end);
  if (source.includes('function installLastroStoreScroll(')) throw new Error('anchor:store-scroll:installed');
  const file = ts.createSourceFile('NpcStore.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function one(predicate, label) {
    const nodes = [];
    function visit(node) { if (predicate(node)) nodes.push(node); ts.forEachChild(node, visit); }
    visit(file);
    if (nodes.length !== 1) throw new Error('anchor:store-scroll:' + label);
    return nodes[0];
  }
  function method(name) {
    return one(node => ts.isBinaryExpression(node) && node.left.getText(file) === 'NpcStore.' + name
      && ts.isFunctionExpression(node.right), name).right.body;
  }
  const append = method('onAppend');
  edits.push({ start: append.getStart(file) + 1, text: '\n    installLastroStoreScroll(this);' });
  for (const name of ['onRemove', 'setType', 'setList']) {
    const body = method(name);
    edits.push({ start: body.getStart(file) + 1, text: '\n    this._lastroStoreScroll?.stop();' });
  }
  const setList = method('setList');
  const clear = one(node => node.getStart(file) > setList.getStart(file) && node.end < setList.end
    && ts.isBinaryExpression(node) && node.left.getText(file) === 'c.innerHTML'
    && ts.isStringLiteral(node.right) && node.right.text === '', 'reset-list');
  edits.push({ start: clear.parent.end, text: '\n      c.scrollTop = 0;' });
  const transfer = one(node => ts.isReturnStatement(node) && node.expression && ts.isFunctionExpression(node.expression)
    && node.expression.parameters.map(param => param.name.getText(file)).join(',') === 'fromContent,toContent,isAdding,index,count', 'transfer').expression.body;
  if (transfer.statements.slice(-2).map(node => node.getText(file)).join('\n')
    !== 'NpcStore.calculateCost();\nNpcStore.calculateWeight();') throw new Error('anchor:store-scroll:transfer-end');
  edits.push({ start: transfer.end - 1, text: `
      const lastroScroll = NpcStore._lastroStoreScroll;
      if (lastroScroll) {
        lastroScroll.refresh(fromContent);
        lastroScroll.refresh(toContent);
        lastroScroll.reveal(toContent, index);
      }
    ` });
  let output = region;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.start);
  output = installLastroStoreScroll.toString() + '\n' + output;
  return source.slice(0, start) + output + source.slice(end);
}
