// Serialized into the packaged runtime by patch-v2-runtime.mjs. Keep this
// installer self-contained so upstream changes stay separate from local UI logic.
export function installLastroLootList(component, { DB, Client, Events }, life = 5000) {
  const active = [];
  const pending = [];
  const entries = new Map();
  const phases = new Map();
  const timers = new Set();
  const paints = new Set();
  let list;
  let previewBox;
  let previewEntry;
  let capacity = 5;
  let view;
  let content;
  let layoutObserver;
  let layoutGeometry;
  const arrivalGap = 300;
  let nextArrivalAt = 0;
  let arrivalTimer;
  let paused = false;
  let pausedAt = 0;
  let pausedDuration = 0;
  const entranceDuration = 240;
  const exitDuration = 400;
  // GUIComponent creates its Shadow DOM lazily on the first append().
  let document;

  // Ignore only acquisition metadata, not item attributes. Sorting nested keys
  // handles equivalent card/option objects regardless of insertion order.
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
  }
  function keyOf(item) {
    return JSON.stringify(stable(Object.fromEntries(Object.entries(item)
      .filter(([key]) => !['count', 'index', 'result'].includes(key)))));
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function rawNow() { return Events.now ? Events.now() : view.Date.now(); }
  function now() { return rawNow() - pausedDuration - (paused ? rawNow() - pausedAt : 0); }
  function armTimer(timer) {
    if (paused || !timers.has(timer)) return;
    timer.started = rawNow();
    timer.handle = Events.setTimeout(() => {
      if (!timers.delete(timer)) return;
      timer.handle = undefined;
      timer.callback();
    }, timer.remaining);
  }
  function setTimer(callback, delay) {
    const timer = { callback, remaining: Math.max(0, delay), handle: undefined, started: 0 };
    timers.add(timer);
    armTimer(timer);
    return timer;
  }
  function clearTimer(timer) {
    if (!timer) return;
    timers.delete(timer);
    if (timer.handle !== undefined) Events.clearTimeout(timer.handle);
    timer.handle = undefined;
  }
  function armPaint(paint) {
    if (paused || !paints.has(paint)) return;
    if (!Events.requestAnimationFrame) {
      paints.delete(paint);
      paint.callback();
      return;
    }
    // The second frame follows an actual paint. Wall-clock timers must not
    // consume an animation before the browser first renders the new card.
    paint.handle = Events.requestAnimationFrame(() => {
      if (!paints.has(paint)) return;
      paint.handle = undefined;
      if (++paint.frame < 2) armPaint(paint);
      else {
        paints.delete(paint);
        paint.callback();
      }
    });
  }
  function afterPaint(callback) {
    const paint = { callback, frame: 0, handle: undefined };
    paints.add(paint);
    armPaint(paint);
    return paint;
  }
  function clearPaint(paint) {
    if (!paint) return;
    paints.delete(paint);
    if (paint.handle !== undefined) Events.cancelAnimationFrame?.(paint.handle);
    paint.handle = undefined;
  }
  function stopPhase(node) {
    if (!node) return;
    const phase = phases.get(node);
    if (phase) {
      clearTimer(phase.timer);
      clearPaint(phase.paint);
      node.removeEventListener('animationend', phase.finished);
      node.removeEventListener('animationcancel', phase.canceled);
      phases.delete(node);
      node.classList.remove(phase.className);
    }
  }
  function startPhase(node, className, animationName, duration, complete = () => {}) {
    stopPhase(node);
    const phase = {
      className, timer: undefined, paint: undefined, finished: undefined, canceled: undefined,
      restarting: false, needsRestart: false,
    };
    const finish = (fromEvent = false, finalPaint = false) => {
      if (phases.get(node) !== phase) return;
      const animation = currentAnimation();
      if (animation && (animation.currentTime === null && animation.playState !== 'finished' ||
          typeof animation.currentTime === 'number' && animation.currentTime < duration)) {
        phase.timer = setTimer(finish, Math.max(16, duration - (animation.currentTime || 0)));
        return;
      }
      if (animation && !fromEvent && !finalPaint) {
        // A completed WAAPI timeline can precede the queued CSS animationend.
        // Give that native event one paint cycle before the bounded fallback
        // removes its listener/DOM, especially for the group's final card.
        phase.paint = afterPaint(() => {
          if (phases.get(node) === phase) phase.timer = setTimer(() => finish(false, true), 0);
        });
        return;
      }
      stopPhase(node);
      complete();
    };
    const currentAnimation = () => {
      const animations = node.getAnimations?.()
        .filter(animation => animation.animationName === animationName && animation.playState !== 'idle');
      return animations?.find(animation => animation.playState !== 'finished') || animations?.[0];
    };
    const resetClock = () => {
      clearTimer(phase.timer);
      clearPaint(phase.paint);
      phase.paint = afterPaint(() => {
        if (phases.get(node) !== phase) return;
        phase.restarting = false;
        if (phase.needsRestart) restart();
        else phase.timer = setTimer(finish, duration);
      });
    };
    const restart = () => {
      phase.restarting = true;
      phase.needsRestart = false;
      node.classList.remove(className);
      void node.offsetWidth;
      node.classList.add(className);
      resetClock();
    };
    phase.finished = event => {
      if (!paused && event.target === node && event.animationName === animationName &&
          event.elapsedTime * 1000 >= duration) {
        const animation = currentAnimation();
        if (animation && typeof animation.currentTime === 'number' && animation.currentTime < duration) return;
        finish(true);
      }
    };
    // A canceled animation did not finish. Replay this phase rather than
    // starting its lifetime or removing the card prematurely.
    phase.canceled = event => {
      if (event.target !== node || event.animationName !== animationName) return;
      const animation = currentAnimation();
      // Chromium may have already restarted an animation after a DOM move.
      // Removing its class again would queue another cancellation indefinitely.
      if (phase.restarting) {
        if (node.getAnimations && !animation) phase.needsRestart = true;
      } else if (animation) resetClock();
      else restart();
    };
    phases.set(node, phase);
    node.addEventListener('animationend', phase.finished);
    node.addEventListener('animationcancel', phase.canceled);
    restart();
  }
  function setPaused(hidden) {
    if (hidden === paused) return;
    if (hidden) {
      pausedAt = rawNow();
      paused = true;
      for (const timer of timers) {
        if (timer.handle === undefined) continue;
        timer.remaining = Math.max(0, timer.remaining - (pausedAt - timer.started));
        Events.clearTimeout(timer.handle);
        timer.handle = undefined;
      }
      for (const paint of paints) {
        if (paint.handle !== undefined) Events.cancelAnimationFrame?.(paint.handle);
        paint.handle = undefined;
        paint.frame = 0;
      }
    } else {
      pausedDuration += rawNow() - pausedAt;
      paused = false;
      for (const timer of timers) armTimer(timer);
      for (const paint of paints) armPaint(paint);
    }
    content?.classList.toggle('is-paused', paused);
  }
  function onVisibilityChange() { setPaused(document.hidden); }
  function onPageHide() { setPaused(true); }
  function onPageShow() { setPaused(document.hidden); }
  function viewportGeometry() {
    const host = component._host || component.getRoot().host;
    const style = view.getComputedStyle(host), bounds = host.getBoundingClientRect();
    const ownScale = Number(style.getPropertyValue('--loot-scale') || host.style.getPropertyValue('--loot-scale')) || 0.75;
    let zoom = 1;
    for (let node = host; node; node = node.parentElement || node.getRootNode()?.host) {
      const value = Number.parseFloat(view.getComputedStyle(node).zoom);
      if (value > 0) zoom *= value;
    }
    const width = Number.parseFloat(style.width) || host.offsetWidth;
    const height = Number.parseFloat(style.height) || host.offsetHeight;
    // The host's panel transform is ours; zoom/transform on its ancestors or on
    // the GUI host is part of the client's coordinate system.
    const scaleX = width > 0 && bounds.width > 0 ? bounds.width / width / ownScale : zoom;
    const scaleY = height > 0 && bounds.height > 0 ? bounds.height / height / ownScale : scaleX;
    const originX = bounds.width > 0 ? bounds.left - (Number.parseFloat(style.left) || 0) * scaleX : 0;
    const originY = bounds.height > 0 ? bounds.top - (Number.parseFloat(style.top) || 0) * scaleY : 0;
    return { host, width: view.innerWidth, height: view.innerHeight, scaleX, scaleY, originX, originY };
  }
  function observeLayout() {
    layoutObserver?.disconnect();
    if (!view.MutationObserver) return;
    layoutObserver ||= new view.MutationObserver(() => {
      if (!list) return;
      const geometry = viewportGeometry();
      if (!layoutGeometry || ['width', 'height', 'scaleX', 'scaleY', 'originX', 'originY'].some(key => Math.abs(geometry[key] - layoutGeometry[key]) > 0.0001)) updateLayout();
    });
    for (let node = component._host || component.getRoot().host; node; node = node.parentElement || node.getRootNode()?.host)
      layoutObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  function ensureLayout() {
    if (list) return;
    document = component.getRoot().ownerDocument;
    // Native UI timers start at actual display time, even if the game render
    // loop was suspended. Tests/previews may inject a deterministic clock.
    Events ||= document.defaultView;
    view = document.defaultView;
    paused = document.hidden;
    pausedAt = rawNow();
    pausedDuration = 0;
    content = component.getRoot().querySelector('.content');
    const heading = element('div', 'loot-heading', '获得物品');
    list = element('div', 'loot-list');
    previewBox = element('div', 'loot-preview');
    previewBox.setAttribute('aria-hidden', 'true');
    content.replaceChildren(heading, list, previewBox);
    content.classList.toggle('is-paused', paused);
    startPhase(content, 'is-entering', 'lastro-loot-fade', 120);
    updateLayout();
    observeLayout();
    view.addEventListener('resize', updateLayout);
    document.addEventListener('visibilitychange', onVisibilityChange);
    view.addEventListener('pagehide', onPageHide);
    view.addEventListener('pageshow', onPageShow);
  }
  function updateLayout() {
    if (!list || !view) return;
    const geometry = viewportGeometry();
    const { host, width, height, scaleX, scaleY, originX, originY } = geometry;
    if (!(width > 0 && height > 0)) return;
    const scale = Math.max(0.8, Math.min(1.15, width / 1440, height / 900));
    const edge = Math.min(Math.round(20 * scale), width / 4, height / 4);
    const row = Math.round(56 * scale);
    const gap = Math.round(6 * scale);
    const chrome = Math.round(32 * scale) + row / 2 + gap;
    // Reserve roughly a sixth of the screen above and below the notification
    // lane. Capacity changes apply only to future arrivals: a displayed card
    // keeps its DOM node and completes every phase, even during a resize.
    capacity = Math.max(1, Math.min(5, Math.floor((height * 0.68 - chrome) / (row + gap))));
    const panelHeight = chrome + Math.max(capacity, active.length) * (row + gap) - gap;
    const panelWidth = Math.round(304 * scale);
    // Keep the card's layout wide enough for its icon/count. Fit the whole group
    // to both visible dimensions, including the client's effective GUI scale.
    const panelScale = Math.min(0.75, (height - 2 * edge) / panelHeight / scaleY, (width - 2 * edge) / panelWidth / scaleX);
    const visibleHeight = panelHeight * panelScale * scaleY, visibleWidth = panelWidth * panelScale * scaleX;
    const visualTop = Math.max(edge, Math.min(height - visibleHeight - edge, height * 0.56 - visibleHeight / 2));
    const properties = {
      width: panelWidth,
      left: (width - edge - visibleWidth - originX) / scaleX,
      top: (visualTop - originY) / scaleY,
      edge: edge / (panelScale * scaleX), 'panel-height': panelHeight, 'row-height': row, gap,
      font: Math.max(12, Math.round(14 * scale)),
      'line-height': Math.ceil(Math.max(12, Math.round(14 * scale)) * 1.3),
      'count-font': Math.max(12, Math.round(15 * scale)),
      'small-font': Math.max(10, Math.round(11 * scale)),
      icon: Math.round(34 * scale), 'image-size': Math.round(24 * scale),
      padding: Math.round(5 * scale), 'inline-padding': Math.round(12 * scale),
    };
    for (const [name, value] of Object.entries(properties))
      host.style.setProperty('--loot-' + name, value + 'px');
    host.style.setProperty('--loot-scale', String(panelScale));
    fill();
    // This observer includes the host. Browser subpixel rounding can change the
    // measured origin after these writes; comparing it with the old geometry
    // would repeatedly fit our own mutations instead of letting a frame render.
    layoutGeometry = viewportGeometry();
    layoutObserver?.takeRecords();
  }
  function updatePending() {
    // Only overflow beyond the full list gets a half-row preview. Items waiting
    // for their entrance beat must not flash briefly as previews in empty slots.
    const next = active.length >= capacity ? pending[0] : undefined;
    if (previewEntry !== next) {
      if (previewEntry) previewEntry.previewNode = null;
      previewEntry = next;
      previewBox.replaceChildren();
      if (next) previewBox.appendChild(createRow(next, true));
    }
    if (next) next.previewQuantity.textContent = String(next.count);
    previewBox.hidden = !next;
    syncGroupExit();
  }
  function syncGroupExit() {
    const closing = active.length > 0 && !pending.length &&
      active.every(entry => entry.node.classList.contains('is-leaving'));
    content.classList.toggle('is-closing', closing);
  }
  function cancelTimers(entry) {
    clearTimer(entry.timer);
    entry.timer = undefined;
  }
  function schedule(entry, duration = Math.max(0, life - exitDuration)) {
    cancelTimers(entry);
    entry.phase = 'holding';
    entry.timer = setTimer(() => {
      entry.timer = undefined;
      entry.phase = 'leaving';
      startPhase(entry.node, 'is-leaving', 'lastro-loot-exit', exitDuration, () => removeEntry(entry));
      syncGroupExit();
    }, duration);
  }
  function removeEntry(entry) {
    cancelTimers(entry);
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    const index = active.indexOf(entry);
    if (index >= 0) active.splice(index, 1);
    stopPhase(entry.node);
    entry.node.remove();
    entry.node = null;
    updateLayout();
    if (!active.length && !pending.length) component.remove();
  }
  function createRow(entry, preview = false) {
    const row = element('div', 'loot-row');
    row.title = entry.name;
    const icon = element('div', 'loot-icon');
    const image = document.createElement('img');
    image.width = image.height = 24;
    image.alt = '';
    image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    icon.appendChild(image);
    const name = element('span', 'loot-name', entry.name);
    const amount = element('span', 'loot-count');
    const quantity = document.createTextNode(String(entry.count));
    entry[preview ? 'previewQuantity' : 'quantity'] = quantity;
    amount.append(element('span', 'loot-times', '×'), quantity);
    row.append(icon, name, amount);
    const nodeKey = preview ? 'previewNode' : 'node';
    entry[nodeKey] = row;
    // Capture the actual row/image, never look up another pickup by item ID.
    if (entry.imageUrl) image.src = entry.imageUrl;
    else Client.loadFile(DB.INTERFACE_PATH + 'item/' + entry.resource + '.bmp', url => {
      entry.imageUrl = url;
      if (entry[nodeKey] === row) image.src = url;
    });
    return row;
  }
  function render(entry) {
    list.appendChild(createRow(entry));
    entry.phase = 'entering';
    startPhase(entry.node, 'is-entering', 'lastro-loot-enter', entranceDuration,
      () => schedule(entry, Math.max(0, life - entranceDuration - exitDuration)));
  }
  function fill() {
    if (active.length < capacity && pending.length && arrivalTimer === undefined) {
      const delay = Math.max(0, nextArrivalAt - now());
      if (delay) {
        arrivalTimer = setTimer(() => {
          arrivalTimer = undefined;
          fill();
        }, delay);
      } else {
        const entry = pending.shift();
        active.push(entry);
        render(entry);
        nextArrivalAt = now() + arrivalGap;
        // Re-enter only to schedule the next beat, never drain a burst at once.
        fill();
        return;
      }
    }
    updatePending();
  }
  component.onRemove = function onRemove() {
    layoutObserver?.disconnect(); layoutGeometry = undefined;
    view?.removeEventListener('resize', updateLayout);
    document?.removeEventListener('visibilitychange', onVisibilityChange);
    view?.removeEventListener('pagehide', onPageHide);
    view?.removeEventListener('pageshow', onPageShow);
    clearTimer(arrivalTimer);
    arrivalTimer = undefined;
    nextArrivalAt = 0;
    for (const node of phases.keys()) stopPhase(node);
    for (const timer of timers) clearTimer(timer);
    for (const paint of paints) clearPaint(paint);
    for (const entry of [...active, ...pending]) {
      cancelTimers(entry);
      entry.node = null;
      entry.previewNode = null;
    }
    active.length = pending.length = 0;
    entries.clear();
    component.getRoot()?.querySelector('.content')?.replaceChildren();
    if (content) {
      content.classList.remove('is-entering', 'is-closing', 'is-paused');
    }
    list = previewBox = previewEntry = null;
  };
  component.onResize = updateLayout;
  component.set = function set(item) {
    ensureLayout();
    content.classList.remove('is-closing');
    component.placeOnTop();
    const key = keyOf(item);
    const count = Number(item.count) || 1;
    const existing = entries.get(key);
    if (existing && existing.phase !== 'leaving') {
      existing.count += count;
      if (existing.node) {
        existing.quantity.textContent = String(existing.count);
        if (existing.phase === 'holding') schedule(existing);
      }
      updatePending();
      return;
    }
    const info = DB.getItemInfo(item.ITID);
    const name = String(DB.getItemName(item, { showItemSlots: true, showItemOptions: true }))
      .replace(/<[^>]*>/g, '').replace(/\^[0-9a-f]{6}/gi, '');
    const entry = {
      key, count, name,
      resource: item.IsIdentified ? info.identifiedResourceName : info.unidentifiedResourceName,
      node: null,
    };
    entries.set(key, entry);
    pending.push(entry);
    fill();
  };
  // Native packet handling calls append() before every set(). Re-inserting an
  // already attached host cancels its CSS animations in Chromium.
  const append = component.append;
  if (typeof append === 'function') component.append = function appendLoot(target) {
    const host = this._host || this.getRoot()?.host;
    const owner = host?.ownerDocument;
    const parent = target ? typeof target === 'string' ? owner?.querySelector(target) : target : owner?.body;
    if (list && this.__active && host?.isConnected && host.parentNode === parent) {
      this.__active = true;
      return;
    }
    const result = append.call(this, target);
    if (list) { updateLayout(); observeLayout(); }
    return result;
  };
}
