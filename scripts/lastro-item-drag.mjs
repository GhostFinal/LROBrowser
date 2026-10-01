import ts from 'typescript';

// Keep native component payloads and drop handlers, without entering the
// browser's drag loop (which replaces the game cursor and stops pointermove).
export function installLastroItemDrag({ document: doc, mouse, cursor, isEnabled }) {
  if (doc._lastroItemDrag) return doc._lastroItemDrag;
  const win = doc.defaultView, emitted = new WeakSet(), listeners = [];
  let gesture, frame, lastOver = 0, suppressClickUntil = 0, consumeRelease = false;

  function listen(target, type, handler) {
    target.addEventListener(type, handler, true);
    listeners.push(() => target.removeEventListener(type, handler, true));
  }
  function ownerHost(element) {
    for (let host = element?.getRootNode().host; host; host = host.getRootNode().host) {
      if (host.id) return host;
    }
    return null;
  }
  function sourceAt(event) {
    const source = event.composedPath().find(node => node?.matches?.('[draggable="true"]'));
    const host = ownerHost(source);
    return host?.id && host.id !== 'Intro' ? source : null;
  }
  function point(event) {
    return { x: event.clientX, y: event.clientY, ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey };
  }
  function transferFor(state) {
    const values = new Map();
    const key = type => /^(text|text\/plain)$/i.test(type) ? 'text/plain' : String(type).toLowerCase();
    return {
      dropEffect: 'none', effectAllowed: 'all', files: [],
      get types() { return [...values.keys()]; },
      setData(type, value) { values.set(key(type), String(value)); },
      getData(type) { return values.get(key(type)) || ''; },
      clearData(type) { if (type === undefined) values.clear(); else values.delete(key(type)); },
      setDragImage(image, x, y) { state.image = { node: image, x, y }; },
    };
  }
  function emit(target, type, state, at, relatedTarget = null) {
    const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, composed: true,
      clientX: at.x, clientY: at.y, button: 0, buttons: type === 'dragend' || type === 'drop' ? 0 : 1,
      ctrlKey: at.ctrlKey, shiftKey: at.shiftKey, altKey: at.altKey, metaKey: at.metaKey, relatedTarget });
    Object.defineProperty(event, 'dataTransfer', { value: state.transfer });
    let stopped = false;
    for (const name of ['stopPropagation', 'stopImmediatePropagation']) {
      const native = event[name].bind(event);
      event[name] = () => { stopped = true; native(); };
    }
    emitted.add(event);
    target.dispatchEvent(event);
    // Some legacy component listeners return false and only stop propagation.
    // Their drop handlers still own payload validation, so retain that contract.
    return { accepted: event.defaultPrevented || stopped, canceled: event.defaultPrevented };
  }
  function hit(at) {
    let target = doc.elementFromPoint(at.x, at.y), next;
    const visited = new Set();
    while (target?.shadowRoot && !visited.has(target)) {
      visited.add(target);
      next = target.shadowRoot.elementFromPoint?.(at.x, at.y);
      if (!next || next === target) break;
      target = next;
    }
    const host = ownerHost(target);
    return host && host.id !== 'Intro' || target?.matches?.('canvas') && target.getRootNode() === doc ? target : null;
  }
  function follow(state) {
    const { x, y } = state.at;
    mouse.screen.x = x + win.scrollX;
    mouse.screen.y = y + win.scrollY;
    cursor.x = mouse.screen.x;
    cursor.y = mouse.screen.y;
    const pointer = doc.querySelector('.cursor');
    if (pointer) { pointer.style.left = x + 'px'; pointer.style.top = y + 'px'; }
    if (state.ghost) {
      state.ghost.style.left = x - (state.image?.x || 0) + 'px';
      state.ghost.style.top = y - (state.image?.y || 0) + 'px';
    }
  }
  function hover(state) {
    const target = hit(state.at);
    if (target !== state.target) {
      const previous = state.target;
      if (target) emit(target, 'dragenter', state, state.at, previous);
      if (previous) emit(previous, 'dragleave', state, state.at, target);
      state.target = target;
    }
    state.accepted = !!target && emit(target, 'dragover', state, state.at).accepted;
  }
  function pulse(time) {
    frame = undefined;
    if (!gesture?.started) return;
    if (!gesture.source.isConnected || doc.hidden || !isEnabled()) { cancel(); return; }
    if (time - lastOver >= 50) { lastOver = time; hover(gesture); }
    if (gesture?.started) frame = win.requestAnimationFrame(pulse);
  }
  function restore(state) {
    if (state.draggable === null) state.source.removeAttribute('draggable');
    else state.source.setAttribute('draggable', state.draggable);
    state.ghost?.remove();
    if (state.started) {
      cursor.freeze = state.freeze;
      cursor.blockMagnetism = state.blockMagnetism;
      const targeting = mouse.MOUSE_STATE && mouse.state === mouse.MOUSE_STATE.USESKILL;
      cursor.setType?.(targeting && Number.isFinite(state.type) ? state.type : cursor.ACTION?.DEFAULT ?? 0);
      doc.body.removeAttribute('data-lastro-item-drag');
    }
  }
  function finish(drop = false) {
    const state = gesture;
    gesture = undefined;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = undefined;
    if (!state) return;
    try {
      if (state.started) {
        if (drop && state.source.isConnected && state.target?.isConnected && state.accepted)
          emit(state.target, 'drop', state, state.at);
        else state.transfer.dropEffect = 'none';
        if (state.target) emit(state.target, 'dragleave', state, state.at);
        // Refine/EnchantGrade interpret a dragend outside the window as removal.
        // Cancellation must keep their staged item, so end at the initial point.
        emit(state.source, 'dragend', state, drop ? state.at : state.start);
        delete win._OBJ_DRAG_;
      }
    } finally { restore(state); }
  }
  function cancel() {
    if (gesture?.started) consumeRelease = true;
    finish(false);
  }
  function begin(state) {
    state.transfer = transferFor(state);
    state.started = true;
    state.freeze = cursor.freeze;
    state.blockMagnetism = cursor.blockMagnetism;
    state.type = cursor.getActualType?.();
    const rejected = emit(state.source, 'dragstart', state, state.start).canceled;
    if (gesture !== state) return;
    const text = state.transfer.getData('Text');
    let payload;
    try { payload = JSON.parse(text); } catch { /* Staged refine items use a plain id. */ }
    const staged = ['Refine', 'EnchantGrade'].includes(ownerHost(state.source)?.id);
    if (rejected || (!staged && (!text || !['item', 'skill'].includes(payload?.type)))) { cancel(); return; }
    cursor.setType?.(cursor.ACTION?.DEFAULT ?? 0);
    cursor.freeze = true;
    cursor.blockMagnetism = true;
    doc.body.setAttribute('data-lastro-item-drag', '');
    {
      const ghost = doc.createElement('div');
      ghost.setAttribute('data-lastro-item-drag-image', '');
      Object.assign(ghost.style, { position: 'fixed', zIndex: '9998', pointerEvents: 'none',
        userSelect: 'none', opacity: '0.75', cursor: 'none' });
      const image = (state.image?.node || state.source).cloneNode(true);
      if (!state.image) {
        const originals = [state.source, ...state.source.querySelectorAll('*')];
        const clones = [image, ...image.querySelectorAll('*')];
        const properties = ['width', 'height', 'display', 'position', 'left', 'top', 'right', 'bottom',
          'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'color', 'font',
          'lineHeight', 'textAlign', 'border', 'borderRadius', 'boxSizing', 'padding', 'margin'];
        originals.forEach((node, index) => {
          const computed = win.getComputedStyle(node), clone = clones[index];
          for (const property of properties) clone.style[property] = computed[property];
          clone.removeAttribute('id');
          clone.removeAttribute('draggable');
        });
        const computed = win.getComputedStyle(state.source), rect = state.source.getBoundingClientRect();
        Object.assign(image.style, { backgroundImage: computed.backgroundImage, backgroundSize: computed.backgroundSize,
          backgroundPosition: computed.backgroundPosition, width: rect.width + 'px', height: rect.height + 'px',
          position: 'relative', display: 'block', margin: '0', transform: 'none', pointerEvents: 'none' });
      }
      image.removeAttribute?.('id');
      image.removeAttribute?.('draggable');
      ghost.appendChild(image);
      doc.body.appendChild(ghost);
      state.ghost = ghost;
    }
    follow(state);
    lastOver = 0;
    frame = win.requestAnimationFrame(pulse);
  }
  listen(win, 'mousedown', event => {
    if (event.button !== 0 || !isEnabled() || doc.hidden) return;
    cancel();
    consumeRelease = false;
    suppressClickUntil = 0;
    const source = sourceAt(event);
    if (!source) return;
    const start = point(event);
    gesture = { source, start, at: start, draggable: source.getAttribute('draggable'), started: false };
    // Also block implicit image dragging; a capture dragstart guard covers descendants.
    source.setAttribute('draggable', 'false');
    event.preventDefault();
  });
  listen(win, 'mousemove', event => {
    if (!gesture) return;
    if (event.buttons !== 1 || !gesture.source.isConnected || !isEnabled()) { cancel(); return; }
    gesture.at = point(event);
    if (!gesture.started && Math.hypot(gesture.at.x - gesture.start.x, gesture.at.y - gesture.start.y) >= 5) begin(gesture);
    if (gesture?.started) {
      follow(gesture);
      hover(gesture);
      event.preventDefault();
    }
  });
  listen(win, 'dragstart', event => {
    if (emitted.has(event) || !gesture || !isEnabled()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!gesture.started) { gesture.at = point(event); begin(gesture); }
    if (gesture?.started) hover(gesture);
  });
  listen(win, 'mouseup', event => {
    if (event.button !== 0) return;
    if (!gesture) {
      if (consumeRelease) {
        consumeRelease = false;
        suppressClickUntil = Date.now() + 500;
        event.preventDefault(); event.stopImmediatePropagation();
      }
      return;
    }
    if (gesture.started) {
      gesture.at = point(event);
      follow(gesture);
      hover(gesture);
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = Date.now() + 500;
      finish(true);
    } else cancel();
  });
  listen(win, 'click', event => {
    if (event.button === 0 && Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
  listen(win, 'keydown', event => {
    if (event.key === 'Escape' && gesture) {
      const active = gesture.started;
      cancel();
      if (active) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  });
  listen(win, 'blur', cancel);
  listen(win, 'pointercancel', cancel);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  const observer = new win.MutationObserver(() => {
    if (gesture && !gesture.source.isConnected) cancel();
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const api = { cancel, active: () => !!gesture?.started,
    destroy() { cancel(); observer.disconnect(); listeners.forEach(remove => remove()); delete doc._lastroItemDrag; } };
  doc._lastroItemDrag = api;
  return api;
}

export function patchRuntimeItemDrag(source) {
  const marker = '//#region src/UI/CursorManager.js', start = source.indexOf(marker);
  if (start < 0) return source;
  if (source.includes('function installLastroItemDrag(')) throw new Error('anchor:item-drag:installed');
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:item-drag:region');
  const region = source.slice(start, end);
  const file = ts.createSourceFile('CursorManager.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'bindMouseEvents');
  if (functions.length !== 1 || !functions[0].body?.getText(file).includes('"pointermove"')) throw new Error('anchor:item-drag:cursor');
  const offset = functions[0].body.end - 1;
  const call = '\n  installLastroItemDrag({ document, mouse: Mouse, cursor: Cursor, isEnabled: () => GraphicsSettings.cursor });\n';
  let output = source.slice(0, start) + installLastroItemDrag.toString() + '\n' + region.slice(0, offset) + call + region.slice(offset) + source.slice(end);
  // Cancel before native map teardown, while source dragend handlers still exist.
  const mapMarker = '//#region src/Engine/MapEngine.js', mapStart = output.indexOf(mapMarker);
  if (mapStart >= 0) {
    const mapEnd = output.indexOf('//#endregion', mapStart), map = output.slice(mapStart, mapEnd);
    const tree = ts.createSourceFile('MapEngine.js', map, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), edits = [];
    for (const name of ['onMapChange', 'cleanGameUI']) {
      const found = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
      if (found.length !== 1 || !found[0].body) throw new Error('anchor:item-drag:' + name);
      edits.push(found[0].body.getStart(tree) + 1);
    }
    let patched = map;
    for (const position of edits.sort((a, b) => b - a)) patched = patched.slice(0, position) + '\n  document._lastroItemDrag?.cancel();' + patched.slice(position);
    output = output.slice(0, mapStart) + patched + output.slice(mapEnd);
  }
  return output;
}
