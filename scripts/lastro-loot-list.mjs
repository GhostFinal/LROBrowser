// Serialized into the packaged runtime by patch-v2-runtime.mjs. Keep this
// installer self-contained so upstream changes stay separate from local UI logic.
export function installLastroLootList(component, { DB, Client, Events }, life = 5000) {
  const active = [];
  const pending = [];
  const entries = new Map();
  let list;
  let previewBox;
  let previewEntry;
  let capacity = 5;
  let view;
  let content;
  const arrivalGap = 300;
  let nextArrivalAt = 0;
  let arrivalTimer;
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
  function ensureLayout() {
    if (list) return;
    document = component.getRoot().ownerDocument;
    // Native UI timers start at actual display time, even if the game render
    // loop was suspended. Tests/previews may inject a deterministic clock.
    Events ||= document.defaultView;
    view = document.defaultView;
    content = component.getRoot().querySelector('.content');
    content.classList.add('is-entering');
    content.onanimationend = event => {
      if (event.target === content) content.classList.remove('is-entering');
    };
    const heading = element('div', 'loot-heading', '获得物品');
    list = element('div', 'loot-list');
    previewBox = element('div', 'loot-preview');
    previewBox.setAttribute('aria-hidden', 'true');
    content.replaceChildren(heading, list, previewBox);
    updateLayout();
    view.addEventListener('resize', updateLayout);
  }
  function updateLayout() {
    const width = view.innerWidth;
    const height = view.innerHeight;
    const scale = Math.max(0.8, Math.min(1.15, width / 1440, height / 900));
    const edge = Math.round(20 * scale);
    const row = Math.round(56 * scale);
    const gap = Math.round(6 * scale);
    const chrome = Math.round(32 * scale) + row / 2 + gap;
    // Reserve roughly a sixth of the screen above and below the notification
    // lane. Shrink the visible count instead of clipping live notifications.
    capacity = Math.max(1, Math.min(5, Math.floor((height * 0.68 - chrome) / (row + gap))));
    const panelHeight = chrome + capacity * (row + gap) - gap;
    const visibleHeight = panelHeight * 0.75;
    const host = component._host || component.getRoot().host;
    const properties = {
      width: Math.max(1, Math.min(width - 2 * edge, Math.round(304 * scale))),
      top: Math.max(edge, Math.min(height - visibleHeight - edge, height * 0.56 - visibleHeight / 2)),
      edge, 'panel-height': panelHeight, 'row-height': row, gap,
      font: Math.max(12, Math.round(14 * scale)),
      'line-height': Math.ceil(Math.max(12, Math.round(14 * scale)) * 1.3),
      'count-font': Math.max(12, Math.round(15 * scale)),
      'small-font': Math.max(10, Math.round(11 * scale)),
      icon: Math.round(34 * scale), 'image-size': Math.round(24 * scale),
      padding: Math.round(5 * scale), 'inline-padding': Math.round(12 * scale),
    };
    for (const [name, value] of Object.entries(properties))
      host.style.setProperty('--loot-' + name, value + 'px');
    if (active.length > capacity) {
      const suspended = active.splice(capacity);
      for (const entry of suspended) {
        cancelTimers(entry);
        entry.node.remove();
        entry.node = null;
      }
      pending.unshift(...suspended);
    }
    fill();
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
    if (closing) content.classList.remove('is-entering');
    content.classList.toggle('is-closing', closing);
  }
  function now() { return Events.now ? Events.now() : view.Date.now(); }
  function cancelTimers(entry) {
    if (entry.fadeTimer !== undefined) Events.clearTimeout(entry.fadeTimer);
    if (entry.timer !== undefined) Events.clearTimeout(entry.timer);
    entry.fadeTimer = entry.timer = undefined;
  }
  function schedule(entry) {
    cancelTimers(entry);
    entry.node.classList.remove('is-leaving');
    entry.fadeTimer = Events.setTimeout(() => {
      entry.node?.classList.remove('is-entering');
      entry.node?.classList.add('is-leaving');
      syncGroupExit();
    }, Math.max(0, life - 400));
    entry.timer = Events.setTimeout(() => {
      cancelTimers(entry);
      entries.delete(entry.key);
      active.splice(active.indexOf(entry), 1);
      entry.node.remove();
      entry.node = null;
      fill();
      if (!active.length && !pending.length) component.remove();
    }, life);
  }
  function createRow(entry, preview = false) {
    const row = element('div', 'loot-row');
    if (!preview) {
      row.classList.add('is-entering');
      row.onanimationend = event => {
        if (event.target === row) row.classList.remove('is-entering');
      };
    }
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
    schedule(entry);
  }
  function fill() {
    if (active.length < capacity && pending.length && arrivalTimer === undefined) {
      const delay = Math.max(0, nextArrivalAt - now());
      if (delay) {
        arrivalTimer = Events.setTimeout(() => {
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
    view?.removeEventListener('resize', updateLayout);
    if (arrivalTimer !== undefined) Events.clearTimeout(arrivalTimer);
    arrivalTimer = undefined;
    nextArrivalAt = 0;
    for (const entry of entries.values()) {
      cancelTimers(entry);
      entry.node = null;
      entry.previewNode = null;
    }
    active.length = pending.length = 0;
    entries.clear();
    component.getRoot()?.querySelector('.content')?.replaceChildren();
    if (content) {
      content.classList.remove('is-entering', 'is-closing');
      content.onanimationend = null;
    }
    list = previewBox = previewEntry = null;
  };
  component.set = function set(item) {
    ensureLayout();
    content.classList.remove('is-closing');
    component.placeOnTop();
    const key = keyOf(item);
    const count = Number(item.count) || 1;
    const existing = entries.get(key);
    if (existing) {
      existing.count += count;
      if (existing.node) {
        existing.quantity.textContent = String(existing.count);
        schedule(existing);
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
}
