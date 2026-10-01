// Serialized into the packaged runtime; all client services are supplied explicitly.
export function installLastroToolsPanels(tools, deps, css, presetRoutes = {}) {
  if (tools._lastroPanels) return tools._lastroPanels;
  const { document: doc, window: win, GUIComponent, UIManager, setHtml, normalizeRoute, requestRoute, loadPreferences } = deps;
  function readPreferences() {
    let value;
    try { value = loadPreferences(); } catch { value = { orders: {} }; }
    if (!value || typeof value !== 'object') value = { orders: {} };
    if (!value.orders || typeof value.orders !== 'object' || Array.isArray(value.orders)) value.orders = {};
    if (!value.geometry || typeof value.geometry !== 'object' || Array.isArray(value.geometry)) value.geometry = {};
    return value;
  }
  let preferences = readPreferences(), profile = deps.getProfile?.();
  const categories = [['npc', 'NPC'], ['train', '练级'], ['money', '打钱'], ['challenge', '挑战'], ['instance', '副本'], ['boss', 'BOSS'], ['custom', '自定义']];
  let selected = categories.some(([id]) => id === preferences.category) ? preferences.category : 'npc';
  let root, list, status, dock, drag, resizing, scrollFrame, confirmation, requestGeneration = 0;
  const layouts = new Map();
  let listeningForResize = false;
  const catalog = Object.create(null);
  const teleport = new GUIComponent('LastROTeleport', css);
  const element = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const titlebar = title => `<div class="lastro-ro-titlebar" data-background="basic_interface/titlebar_mid.bmp"><span class="lastro-title-left" data-background="basic_interface/titlebar_left.bmp"></span><span class="lastro-title-right" data-background="basic_interface/titlebar_right.bmp"></span><strong>${title}</strong><button type="button" class="lastro-window-close" data-action="close" data-background="basic_interface/sys_close_off.bmp" data-hover="basic_interface/sys_close_on.bmp" aria-label="关闭${title}" title="关闭"></button></div>`;
  const resizeFooter = title => `<div class="lastro-panel-footer" data-background="basic_interface/btnbar_mid.bmp"><button type="button" class="lastro-window-resize" data-background="btn_resize.bmp" aria-label="调整${title}窗口大小"></button></div>`;
  function save(message) {
    try { preferences.save?.(); if (message && status) status.textContent = message; }
    catch { if (status) status.textContent = '顺序已调整，但本地保存失败。'; }
  }
  function ordered(category) {
    const entries = catalog[category] || {};
    const saved = Array.isArray(preferences.orders[category]) ? preferences.orders[category] : [];
    return [...new Set([...saved.filter(id => typeof id === 'string' && Object.hasOwn(entries, id)), ...Object.keys(entries)])];
  }
  function refreshProfile() {
    if (profile !== deps.getProfile?.()) {
      stopPanelResize(true, false);
      cancelConfirmation(); deps.cancelRoute?.();
      profile = deps.getProfile?.(); preferences = readPreferences();
      layouts.clear();
      selected = categories.some(([id]) => id === preferences.category) ? preferences.category : 'npc';
    }
  }
  function refreshCatalog() {
    refreshProfile();
    tools.loadQuickRoutes();
    for (const [category] of categories) catalog[category] = Object.create(null);
    for (const [category, entries] of Object.entries(deps.getPresetRoutes?.() || presetRoutes)) {
      if (!Object.hasOwn(catalog, category)) continue;
      for (const [id, raw] of Object.entries(entries || {})) {
        try { catalog[category][id] = normalizeRoute(raw); }
        catch { catalog[category][id] = { npc: raw?.npc || '未命名地点', desc: raw?.desc || '地点资料暂不可用', unavailable: true }; }
      }
    }
    // Keep every existing destination available when an original catalog is absent.
    const fallback = { guide: 'npc', wild: 'train', train: 'instance' };
    for (const [from, to] of Object.entries(fallback)) {
      if (Object.keys(catalog[to]).length) continue;
      for (const [id, raw] of Object.entries(tools._quickRoutes?.[from] || {})) {
        try { catalog[to][`${from}:${id}`] = normalizeRoute(raw); } catch { /* Same validation as the existing selector. */ }
      }
    }
  }
  function stopDrag(cancel = false) {
    if (scrollFrame != null) win.cancelAnimationFrame?.(scrollFrame);
    scrollFrame = null;
    if (!drag) return;
    const previous = drag;
    drag = null;
    previous.node.classList.remove('is-dragging');
    previous.handle.setAttribute('aria-grabbed', 'false');
    if (cancel) for (const id of previous.order) {
      const node = [...list.children].find(row => row.dataset.routeId === id);
      if (node) list.append(node);
    }
    else if (previous.moved) {
      preferences.orders[selected] = [...list.children].map(row => row.dataset.routeId);
      save();
    }
    try { list.releasePointerCapture?.(previous.pointerId); } catch { /* Capture may already be released. */ }
  }
  function moveAtPointer() {
    if (!drag || !drag.moved) return;
    const before = [...list.children].find(row => row !== drag.node && drag.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    list.insertBefore(drag.node, before || null);
  }
  function autoScroll() {
    if (!drag) return;
    const viewport = root.querySelector('.lastro-route-scroll');
    const bounds = viewport.getBoundingClientRect();
    const delta = drag.y < bounds.top + 28 ? -8 : drag.y > bounds.bottom - 28 ? 8 : 0;
    if (delta && drag.moved) { viewport.scrollTop += delta; moveAtPointer(); }
    scrollFrame = win.requestAnimationFrame?.(autoScroll);
  }
  function commitMove(id, offset) {
    const order = ordered(selected);
    const index = order.indexOf(id), next = index + offset;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    preferences.orders[selected] = order;
    renderList();
    [...list.querySelectorAll('[data-sort-handle]')].find(node => node.closest('[data-route-id]').dataset.routeId === id)?.focus();
    save();
  }
  function run(route) {
    const generation = ++requestGeneration;
    const complete = mode => {
      if (generation !== requestGeneration || mode == null) return;
      status.textContent = `${mode === 'navigation' ? '已开始导航' : '已发送传送请求'}：${route.npc}`;
      fitPanel(teleport, 'teleport', 34);
    };
    const failed = error => {
      if (generation === requestGeneration) { status.textContent = `无法前往：${error.message}`; fitPanel(teleport, 'teleport', 34); }
    };
    try {
      const mode = requestRoute(route);
      if (mode && typeof mode.then === 'function') {
        status.textContent = '正在检查传送地点';
        mode.then(complete, failed);
      } else complete(mode);
    } catch (error) { failed(error); }
  }
  function cancelPendingRequest() {
    requestGeneration++;
    deps.cancelPendingRoute?.();
    if (status?.textContent === '正在检查传送地点') status.textContent = '';
  }
  function cancelConfirmation() {
    if (!confirmation) return;
    const previous = confirmation;
    confirmation = null; previous.settled = true; previous.popup?.remove?.();
  }
  function go(route) {
    if (!deps.showPrompt) { run(route); return; }
    if (confirmation) return;
    const pending = { settled: false, popup: null }; confirmation = pending;
    const finish = yes => {
      if (pending.settled) return;
      pending.settled = true;
      if (confirmation === pending) confirmation = null;
      if (yes) run(route);
    };
    try {
      pending.popup = deps.showPrompt(`是否前往${route.npc}？`, () => finish(true), () => finish(false));
      if (pending.popup) {
        const previousRemove = pending.popup.onRemove;
        pending.popup.onRemove = function (...args) {
          win.queueMicrotask(() => finish(false));
          return previousRemove?.apply(this, args);
        };
      } else if (!pending.settled) finish(false);
    } catch (error) { finish(false); status.textContent = `无法打开确认窗口：${error.message}`; }
  }
  function renderList() {
    stopDrag(true);
    list.replaceChildren();
    root.querySelector('[data-custom-form]').hidden = selected !== 'custom';
    root.querySelector('.lastro-route-scroll').hidden = selected === 'custom';
    root.querySelectorAll('[data-category]').forEach(tab => {
      const active = tab.dataset.category === selected;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    for (const id of ordered(selected)) {
      const route = catalog[selected][id];
      const row = element('li', 'lastro-route-row');
      row.dataset.routeId = id;
      const handle = element('button', 'lastro-sort-handle', '⋮⋮');
      handle.type = 'button';
      handle.dataset.sortHandle = '';
      handle.setAttribute('aria-label', `调整${route.npc}的位置`);
      handle.setAttribute('aria-grabbed', 'false');
      handle.title = '上下拖拽排序，也可使用方向键';
      handle.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault(); event.stopPropagation();
        commitMove(id, event.key === 'ArrowUp' ? -1 : 1);
      });
      const text = element('div', 'lastro-route-copy');
      text.append(element('strong', 'lastro-route-name', route.npc), element('span', 'lastro-route-desc', route.desc));
      const button = element('button', 'lastro-button lastro-route-go', '前往');
      button.type = 'button'; button.setAttribute('aria-label', `前往${route.npc}`);
      if (route.unavailable) { button.disabled = true; button.title = route.unavailableReason || '地点资料暂不可用'; button.textContent = '不可用'; }
      button.addEventListener('click', () => go(route));
      row.append(handle, text, button); list.append(row);
    }
    if (!list.children.length && selected !== 'custom') list.append(element('li', 'lastro-route-empty', '此分类暂无可用地点。'));
    teleport._setupScrollbars?.();
    fitPanel(teleport, 'teleport', 34);
  }
  function select(category) {
    if (!categories.some(([id]) => id === category)) return;
    stopDrag(true); selected = category; preferences.category = category; renderList(); resetScroll(teleport, '.lastro-route-scroll'); save();
  }
  function resetScroll(component, selector) {
    const viewport = component.getRoot().querySelector(selector);
    if (viewport) viewport.scrollTop = 0;
    component._setupScrollbars?.();
  }
  function panelVisible(component) {
    const host = component._host;
    return component.__active !== false && !!host?.isConnected && host.style.display !== 'none'
      && win.getComputedStyle(host).display !== 'none';
  }
  function layoutFor(key) {
    if (!layouts.has(key)) {
      const saved = preferences.geometry[key], value = { width: 520 };
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const name of ['x', 'y', 'width', 'height']) {
          if (typeof saved[name] === 'number' && Number.isFinite(saved[name])
            && (name === 'x' || name === 'y' || saved[name] > 0)) value[name] = saved[name];
        }
      }
      layouts.set(key, value);
    }
    return layouts.get(key);
  }
  function panelMeasurements(host) {
    const rect = host.getBoundingClientRect(), computed = win.getComputedStyle(host);
    const size = (name, sides, fallback) => {
      const value = parseFloat(computed[name]);
      if (!(value > 0)) return fallback;
      return computed.boxSizing === 'border-box' ? value
        : value + sides.reduce((sum, side) => sum + (parseFloat(computed[side]) || 0), 0);
    };
    const width = size('width', ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'], host.offsetWidth);
    const height = size('height', ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'], host.offsetHeight);
    const ratio = (visual, logical, fallback) => visual > 0 && logical > 0 ? visual / logical : fallback;
    const scaleX = ratio(rect.width, width, 1), scaleY = ratio(rect.height, height, scaleX);
    return { width, height, scaleX, scaleY };
  }
  function stopPanelResize(cancel = false, fit = true) {
    if (!resizing) return;
    const previous = resizing; resizing = null;
    win.removeEventListener('pointermove', previous.move);
    win.removeEventListener('pointerup', previous.up);
    win.removeEventListener('pointercancel', previous.cancel);
    win.removeEventListener('keydown', previous.key, true);
    win.removeEventListener('blur', previous.cancel);
    win.removeEventListener('pagehide', previous.cancel);
    previous.handle.removeEventListener('lostpointercapture', previous.cancel);
    previous.component._host.classList.remove('lastro-is-resizing');
    try { previous.handle.releasePointerCapture?.(previous.pointerId); } catch { /* A canceled pointer may already have released capture. */ }
    if (cancel) layouts.set(previous.layoutKey, previous.original);
    else if (previous.moved) {
      preferences.geometry[previous.layoutKey] = { ...layoutFor(previous.layoutKey) }; save();
    }
    if (fit) fitPanel(previous.component, previous.layoutKey, previous.right);
  }
  function beginPanelResize(component, layoutKey, right, handle, event) {
    if (resizing || drag || !panelVisible(component) || (event.button !== 0 && event.button !== -1)) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    refreshProfile();
    const { width, height, scaleX, scaleY } = panelMeasurements(component._host);
    if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) return;
    event.preventDefault(); event.stopPropagation();
    const previous = { component, layoutKey, right, handle, pointerId: event.pointerId, profile,
      startX: event.clientX, startY: event.clientY, width, height, scaleX, scaleY,
      x: parseFloat(component._host.style.left), y: parseFloat(component._host.style.top),
      original: { ...layoutFor(layoutKey) }, moved: false };
    previous.move = move => {
      if (resizing !== previous || move.pointerId !== previous.pointerId) return;
      if (profile !== deps.getProfile?.()) { stopPanelResize(true, false); refreshProfile(); return; }
      const dx = move.clientX - previous.startX, dy = move.clientY - previous.startY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!previous.moved && Math.max(Math.abs(dx), Math.abs(dy)) < 3)) return;
      move.preventDefault(); move.stopPropagation(); previous.moved = true;
      const preferred = layoutFor(layoutKey);
      const maxWidth = Math.max(1, ((win.innerWidth || doc.documentElement.clientWidth) - 16) / scaleX);
      const maxHeight = Math.max(1, ((win.innerHeight || doc.documentElement.clientHeight) - 16) / scaleY);
      preferred.width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), width + dx / scaleX));
      preferred.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), height + dy / scaleY));
      if (Number.isFinite(previous.x)) preferred.x = previous.x;
      if (Number.isFinite(previous.y)) preferred.y = previous.y;
      fitPanel(component, layoutKey, right);
      preferred.x = parseFloat(component._host.style.left); preferred.y = parseFloat(component._host.style.top);
    };
    previous.up = up => { if (up.pointerId === previous.pointerId) { previous.move(up); stopPanelResize(); } };
    previous.cancel = cancel => { if (cancel.pointerId == null || cancel.pointerId === previous.pointerId) stopPanelResize(true); };
    previous.key = key => { if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); stopPanelResize(true); } };
    resizing = previous;
    component._host.classList.add('lastro-is-resizing');
    win.addEventListener('pointermove', previous.move);
    win.addEventListener('pointerup', previous.up);
    win.addEventListener('pointercancel', previous.cancel);
    win.addEventListener('keydown', previous.key, true);
    win.addEventListener('blur', previous.cancel);
    win.addEventListener('pagehide', previous.cancel);
    handle.addEventListener('lostpointercapture', previous.cancel);
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events do not own a pointer. */ }
  }
  function fitPanel(component, key, right) {
    const host = component._host;
    if (!panelVisible(component)) return;
    refreshProfile();
    const { scaleX, scaleY } = panelMeasurements(host);
    const width = win.innerWidth || doc.documentElement.clientWidth, height = win.innerHeight || doc.documentElement.clientHeight;
    if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) return;
    const preferred = layoutFor(key);
    host.style.position = 'fixed';
    host.style.right = 'auto'; host.style.bottom = 'auto';
    // Keep the preferred size intact. CSS max constraints shrink only the current
    // viewport, so restoring a larger viewport restores the user's dimensions.
    host.style.setProperty('width', `${preferred.width}px`, 'important');
    host.style.height = preferred.height ? `${preferred.height}px` : 'auto';
    host.style.setProperty('max-width', `${Math.max(0, (width - 16) / scaleX)}px`, 'important');
    const maxHeight = Math.max(0, (height - 16) / scaleY);
    host.style.setProperty('max-height', `${maxHeight}px`, 'important');
    host.style.setProperty('--lastro-panel-max-height', `${maxHeight}px`);
    const rect = host.getBoundingClientRect();
    const originX = rect.left - (parseFloat(host.style.left) || host.offsetLeft || 0) * scaleX;
    const originY = rect.top - (parseFloat(host.style.top) || host.offsetTop || 0) * scaleY;
    const minX = (8 - originX) / scaleX, minY = (8 - originY) / scaleY;
    const maxX = Math.max(minX, (width - 8 - rect.width - originX) / scaleX);
    const maxY = Math.max(minY, (height - 8 - rect.height - originY) / scaleY);
    if (!Number.isFinite(preferred.x)) preferred.x = (width - right * scaleX - rect.width - originX) / scaleX;
    if (!Number.isFinite(preferred.y)) preferred.y = (height - 88 * scaleY - rect.height - originY) / scaleY;
    host.style.left = `${Math.max(minX, Math.min(maxX, preferred.x))}px`;
    host.style.top = `${Math.max(minY, Math.min(maxY, preferred.y))}px`;
    component._setupScrollbars?.();
  }
  function fitPanels() {
    stopPanelResize(true, false);
    fitPanel(tools, 'auto', 12); fitPanel(teleport, 'teleport', 34);
  }
  function listenForResize() {
    if (listeningForResize) return;
    win.addEventListener('resize', fitPanels); listeningForResize = true;
  }
  function stopListeningIfInactive() {
    if (!listeningForResize || tools.__active || teleport.__active) return;
    win.removeEventListener('resize', fitPanels); listeningForResize = false;
  }
  function setupPanel(component, key, right) {
    component._host.style.position = 'fixed';
    component.draggable('.lastro-ro-titlebar');
    const resizeHandle = component.getRoot().querySelector('.lastro-window-resize');
    resizeHandle.addEventListener('pointerdown', event => beginPanelResize(component, key, right, resizeHandle, event));
    resizeHandle.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); });
    resizeHandle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    // Native append/show calls this hook after lifecycle callbacks. Use the
    // same scaled clamp instead of applying the unscaled native clamp afterward.
    component._fixPositionOverflow = () => fitPanel(component, key, right);
    const previousDragEnd = component.onDragEnd, previousResize = component.onResize;
    component.onDragEnd = function (...args) {
      previousDragEnd?.apply(this, args);
      refreshProfile();
      const preferred = layoutFor(key), host = this._host;
      const x = parseFloat(host.style.left), y = parseFloat(host.style.top);
      if (Number.isFinite(x)) preferred.x = x;
      if (Number.isFinite(y)) preferred.y = y;
      const width = parseFloat(host.style.width), height = parseFloat(host.style.height);
      if (width > 0) preferred.width = width;
      if (height > 0) preferred.height = height;
      preferences.geometry[key] = { ...preferred }; save();
      fitPanel(this, key, right);
    };
    component.onResize = function (...args) { previousResize?.apply(this, args); fitPanel(this, key, right); };
  }
  function ensureDock() {
    if (!tools.__active) return null;
    if (dock?.isConnected) return dock;
    dock = element('div', 'lastro-tools-dock'); dock.id = 'lastro-tools-dock';
    const style = element('style', '', '.lastro-tools-dock{position:fixed;right:12px;bottom:12px;display:flex;gap:12px;z-index:49}#lastro-tools-dock button{display:block;width:36px;height:36px;min-height:0;margin:0;padding:0;border:0;background:none;box-shadow:none;cursor:pointer}#lastro-tools-dock button:focus-visible{outline:2px solid #7396d0;outline-offset:2px}.lastro-dock-icon{display:block;width:36px;height:36px;background-size:36px 36px;background-repeat:no-repeat;background-position:center}');
    dock.append(style);
    const automationButton = element('button', ''), teleportButton = element('button', '');
    automationButton.type = teleportButton.type = 'button';
    automationButton.setAttribute('aria-label', '打开挂机设置'); teleportButton.setAttribute('aria-label', '打开传送列表');
    for (const [button, asset] of [[teleportButton, 'skill'], [automationButton, 'option']]) {
      const icon = element('span', 'lastro-dock-icon'); icon.dataset.background = 'ro_menu_icon/' + asset + '_1.bmp'; icon.dataset.down = 'ro_menu_icon/' + asset + '_2.bmp';
      icon.setAttribute('aria-hidden', 'true'); button.replaceChildren(icon);
      GUIComponent.processDataAttrs?.(icon);
    }
    automationButton.addEventListener('click', () => {
      if (tools._host?.isConnected && tools._host.style.display !== 'none') tools.hidePanel();
      else showAutomation();
    });
    teleportButton.addEventListener('click', () => {
      if (teleport._host?.isConnected && teleport._host.style.display !== 'none') teleport.remove();
      else showTeleport();
    });
    dock.addEventListener('mousedown', event => event.stopPropagation());
    dock.addEventListener('pointerdown', event => event.stopPropagation());
    dock.append(teleportButton, automationButton); doc.body.append(dock);
    tools._panelOpener = automationButton;
    return dock;
  }
  function showAutomation() {
    tools.restorePanel(); tools.populateItemSelects();
    tools.getRoot().querySelector('.lastro-settings-view').hidden = false;
    resetScroll(tools, '.lastro-settings-body');
    tools.focus?.(); ensureDock();
  }
  function showTeleport() {
    tools.hidePanel(); refreshCatalog(); teleport.append(); renderList(); resetScroll(teleport, '.lastro-route-scroll'); teleport.focus?.(); ensureDock();
  }
  const originalRender = tools.render;
  tools._cssText = css;
  tools.render = function () {
    const template = doc.createElement('template');
    setHtml(template, originalRender.call(this));
    const content = template.content;
    const header = content.querySelector('.lastro-header');
    const bar = doc.createElement('div'); setHtml(bar, titlebar('挂机设置')); header.replaceWith(bar.firstElementChild);
    content.querySelector('.lastro-settings-bar').remove();
    const settings = content.querySelector('.lastro-settings-view'); settings.hidden = false;
    const options = content.querySelectorAll('[data-option]');
    for (const option of [...options].reverse()) {
      const tab = option.dataset.option === 'autoLoot' ? 'pick' : option.dataset.option === 'autoPots' ? 'eat' : 'battle';
      const label = option.closest('label'); label.className = 'lastro-line'; option.classList.remove('lastro-switch');
      content.querySelector(`[data-tab-panel="${tab}"]`).prepend(label);
    }
    const battle = content.querySelector('[data-tab-panel="battle"]');
    battle.insertBefore(battle.querySelector('[data-targets]').closest('.lastro-group'), battle.querySelector('.lastro-group'));
    const minimize = element('button', 'lastro-window-minimize'); minimize.type = 'button';
    minimize.dataset.action = 'minimize'; minimize.dataset.background = 'basic_interface/sys_mini_off.bmp'; minimize.dataset.hover = 'basic_interface/sys_mini_on.bmp';
    minimize.setAttribute('aria-label', '最小化挂机设置'); minimize.title = '最小化';
    content.querySelector('.lastro-ro-titlebar').append(minimize);
    const statusNode = content.querySelector('.lastro-status'); settings.append(statusNode);
    content.querySelector('.lastro-main-view').remove();
    const footer = doc.createElement('template'); setHtml(footer, resizeFooter('挂机设置'));
    content.querySelector('.lastro-tools').append(footer.content);
    return template.innerHTML;
  };
  const originalInit = tools.init;
  tools.init = function () {
    originalInit.call(this);
    setupPanel(this, 'auto', 12);
    this.getRoot().querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => resetScroll(this, '.lastro-settings-body')));
    this.getRoot().querySelectorAll('.lastro-ro-titlebar button').forEach(button => button.addEventListener('mousedown', event => event.stopPropagation()));
  };
  tools.ensurePanelOpener = () => { ensureDock(); return tools._panelOpener; };
  const originalHide = tools.hidePanel, originalRestore = tools.restorePanel;
  tools.hidePanel = function () { if (resizing?.component === this) stopPanelResize(true); originalHide.call(this); ensureDock(); };
  tools.restorePanel = function () {
    teleport.remove();
    originalRestore.call(this);
    this.getRoot().querySelector('.lastro-settings-view').hidden = false;
    if (this._panelOpener) this._panelOpener.hidden = false;
    fitPanel(this, 'auto', 12);
  };
  tools.collapseDetailedSettings = function () { this.getRoot()?.querySelector('.lastro-settings-view')?.removeAttribute('hidden'); };
  const previousAppend = tools.onAppend, previousRemove = tools.onRemove;
  tools.onAppend = function () { previousAppend?.call(this); this._host.style.display = 'none'; ensureDock(); listenForResize(); };
  tools.onRemove = function () {
    stopPanelResize(true, false);
    stopDrag(true); cancelConfirmation();
    if (!this._lastroMapTransition) deps.cancelRoute?.();
    teleport.remove(); dock?.remove(); dock = null; previousRemove?.call(this);
    stopListeningIfInactive();
  };
  const previousMapChanged = tools.onMapChanged;
  tools.onMapChanged = function (...args) { this._lastroMapTransition = false; deps.routeMapChanged?.(); return previousMapChanged?.apply(this, args); };
  teleport.render = () => `<div class="lastro-tools">${titlebar('传送地点')}<div class="lastro-teleport-body"><div class="lastro-tabs lastro-route-tabs" role="tablist" aria-label="传送分类">${categories.map(([id, name]) => `<button type="button" class="lastro-tab" role="tab" data-category="${id}">${name}</button>`).join('')}</div><div class="lastro-route-scroll" data-scrollbar-skin="blue"><ul class="lastro-route-list" aria-label="传送地点列表"></ul><div class="lastro-route-footer"><button type="button" class="lastro-button" data-reset-order>恢复默认</button></div></div><form data-custom-form hidden><label class="lastro-line">地图名<input name="map" required maxlength="20" placeholder="prontera" autocomplete="off"></label><label class="lastro-line">X 坐标<input name="x" type="number" required min="0" max="65535" step="1"></label><label class="lastro-line">Y 坐标<input name="y" type="number" required min="0" max="65535" step="1"></label><button type="submit" class="lastro-button">前往</button></form><div class="lastro-status" role="status" aria-live="polite"></div></div></div>`;
  const renderTeleport = teleport.render;
  teleport.render = () => renderTeleport().replace(/<\/div>$/, `${resizeFooter('传送地点')}</div>`);
  teleport.init = function () {
    root = this.getRoot(); list = root.querySelector('.lastro-route-list'); status = root.querySelector('.lastro-status');
    setupPanel(this, 'teleport', 34);
    root.querySelector('[data-action="close"]').addEventListener('click', () => this.remove());
    root.querySelector('[data-action="close"]').addEventListener('mousedown', event => event.stopPropagation());
    root.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', () => select(button.dataset.category));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = categories.findIndex(([id]) => id === selected);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + categories.length) % categories.length;
        select(categories[next][0]); root.querySelector(`[data-category="${selected}"]`).focus();
      });
    });
    root.querySelector('[data-reset-order]').addEventListener('click', () => { stopDrag(true); delete preferences.orders[selected]; renderList(); save(); });
    root.querySelector('[data-custom-form]').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const map = form.elements.namedItem('map').value.trim().toLowerCase().replace(/\.gat$/i, '');
      const coordinate = name => {
        const text = form.elements.namedItem(name).value.trim(), value = Number(text);
        if (!/^\d{1,5}$/.test(text) || value > 65535) throw new Error('坐标必须为 0–65535 的整数');
        return value;
      };
      try {
        if (!/^[a-z0-9_@#-]{1,16}$/.test(map)) throw new Error('请输入有效地图名');
        const destination = [map, coordinate('x'), coordinate('y')];
        go({ npc: `${map} ${destination[1]},${destination[2]}`, desc: '', outset: destination, path: [destination] });
      } catch (error) { status.textContent = error.message; }
    });
    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('[data-sort-handle]');
      if (!handle || (event.button !== 0 && event.button !== -1) || drag) return;
      event.preventDefault(); event.stopPropagation();
      const node = handle.closest('[data-route-id]');
      drag = { node, handle, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, moved: false, order: [...list.children].map(row => row.dataset.routeId) };
      // Capture on the stationary list: moving a captured row loses capture in Chromium.
      try { list.setPointerCapture?.(event.pointerId); } catch { /* Synthetic/test events have no active pointer. */ }
      handle.setAttribute('aria-grabbed', 'true'); autoScroll();
    });
    list.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.y = event.clientY;
      if (Math.abs(drag.y - drag.startY) >= 4) drag.moved = true;
      if (drag.moved) { event.preventDefault(); drag.node.classList.add('is-dragging'); moveAtPointer(); }
    });
    list.addEventListener('pointerup', event => { if (drag?.pointerId === event.pointerId) stopDrag(); });
    list.addEventListener('pointercancel', () => stopDrag(true));
    list.addEventListener('lostpointercapture', () => stopDrag(true));
    renderList();
  };
  teleport.onRemove = () => { if (resizing?.component === teleport) stopPanelResize(true, false); stopDrag(true); cancelConfirmation(); cancelPendingRequest(); stopListeningIfInactive(); };
  teleport.onAppend = () => { tools.hidePanel(); listenForResize(); fitPanel(teleport, 'teleport', 34); };
  UIManager.addComponent(teleport);
  tools._lastroPanels = {
    teleport, showAutomation, showTeleport, select, ordered, catalog,
    setStatus: message => { if (status) status.textContent = message; },
    onMapChanging: () => { tools._lastroMapTransition = true; deps.routeMapChanging?.(); },
    cancelRoute: () => { tools._lastroMapTransition = false; cancelConfirmation(); cancelPendingRequest(); deps.cancelRoute?.(); },
  };
  return tools._lastroPanels;
}
