import ts from 'typescript';

// Native preferences use grid counts and window-specific flags, not pixel sizes.
export function lastroUiWindowAppend(component, preferences, append, snapshot) {
  const host = component._host, win = host?.ownerDocument?.defaultView;
  if (!host || !win || !preferences || typeof preferences.save !== 'function') return append();
  let state = component._lastroWindowState;
  if (!state) {
    const number = value => Number.isFinite(Number(value)) ? Number(value) : undefined;
    const pixel = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?px$/.test(value) ? number(parseFloat(value)) : undefined;
    const stored = preferences._lastroWindow;
    const geometry = stored && typeof stored === 'object' ? { ...stored } : {};
    let applying = false, removing = false, timer, lastSaved;
    let applied = {}, ownScale = 1;
    const originalSave = preferences.save;
    const root = component.getRoot();
    const dimensions = () => ({ width: host.offsetWidth || pixel(host.style.width) || 0, height: host.offsetHeight || pixel(host.style.height) || 0 });
    function capture() {
      if (applying || removing || !host.isConnected) return;
      if (component.isEmbedded?.()) {
        const geometryKeys = ['x', 'y', 'width', 'height'], previous = geometryKeys.map(key => preferences[key]);
        snapshot(); geometryKeys.forEach((key, index) => { preferences[key] = previous[index]; });
        return;
      }
      const left = pixel(host.style.left), top = pixel(host.style.top);
      const changed = (value, previous) => value == null || previous == null ? value !== previous : Math.abs(value - previous) > 0.01;
      const moved = changed(left, applied.left) || changed(top, applied.top);
      const oldX = preferences.x, oldY = preferences.y, oldWidth = preferences.width, oldHeight = preferences.height, oldStats = preferences.stats;
      snapshot();
      if (host.style.display === 'none') { preferences.width = oldWidth; preferences.height = oldHeight; preferences.stats = oldStats; }
      if (!moved && geometry.left != null) {
        preferences.x = oldX; preferences.y = oldY;
      }
      if (moved || geometry.left == null) {
        if (left != null) geometry.left = left;
        if (top != null) geometry.top = top;
      }
      const width = pixel(host.style.width), height = pixel(host.style.height);
      if (width > 0) geometry.width = width;
      if (height > 0) geometry.height = height;
      if (component._lastroResizeArgs) {
        const args = component._lastroResizeArgs;
        if (Object.hasOwn(preferences, 'width') && Number.isFinite(args[0])) preferences.width = args[0];
        if (Object.hasOwn(preferences, 'height') && Number.isFinite(args[1])) preferences.height = args[1];
      }
      preferences._lastroWindow = { ...geometry };
      applied.left = left; applied.top = top;
    }
    function persist() {
      const signature = JSON.stringify({ ...preferences, save: undefined, _key: undefined });
      if (signature !== lastSaved) { originalSave.call(preferences); lastSaved = signature; }
    }
    function save() {
      win.clearTimeout(timer); timer = undefined;
      if (removing) return;
      capture(); persist();
    }
    function fit() {
      if (applying || !host.isConnected || host.style.display === 'none' || !component._isDraggable) return;
      if (component.isEmbedded?.()) {
        if (ownScale !== 1) { ownScale = 1; host.style.scale = '1'; observer.takeRecords(); }
        return;
      }
      capture();
      applying = true;
      try {
        const { width, height } = dimensions(), rect = host.getBoundingClientRect();
        const ancestorScale = width > 0 && rect.width > 0 ? rect.width / width / ownScale : 1;
        const scale = Number.isFinite(ancestorScale) && ancestorScale > 0 ? ancestorScale : 1;
        const vw = win.innerWidth, vh = win.innerHeight;
        if (!(vw > 0 && vh > 0 && width > 0 && height > 0)) return;
        const originX = rect.left - host.offsetLeft * scale, originY = rect.top - host.offsetTop * scale;
        ownScale = Math.min(1, vw / (width * scale), vh / (height * scale));
        host.style.transformOrigin = '0 0';
        host.style.scale = String(ownScale);
        // Match the physical viewport edges used by native drag snapping.
        // An inset here would move a docked window away again on release/resize.
        const minX = -originX / scale, minY = -originY / scale;
        const maxX = (vw - originX) / scale - width * ownScale;
        const maxY = (vh - originY) / scale - height * ownScale;
        let left = number(geometry.left) ?? host.offsetLeft, top = number(geometry.top) ?? host.offsetTop;
        if (component.magnet?.LEFT) left = minX;
        if (component.magnet?.TOP) top = minY;
        if (component.magnet?.RIGHT) left = maxX;
        if (component.magnet?.BOTTOM) top = maxY;
        applied = { left: Math.max(minX, Math.min(left, maxX)), top: Math.max(minY, Math.min(top, maxY)) };
        host.style.left = applied.left + 'px'; host.style.top = applied.top + 'px';
        applied = { left: pixel(host.style.left), top: pixel(host.style.top) };
      } finally { applying = false; observer.takeRecords(); }
    }
    function schedule() {
      if (applying || removing) return;
      win.clearTimeout(timer);
      timer = win.setTimeout(() => { save(); fit(); }, 80);
    }
    const observer = new win.MutationObserver(schedule);
    observer.observe(host, { attributes: true, attributeFilter: ['style'] });
    const interactionEnd = () => { if (host.isConnected) { save(); fit(); } };
    const visibilityChange = () => { if (host.ownerDocument.hidden) save(); };
    host.addEventListener('mouseup', interactionEnd);
    root.addEventListener('click', schedule);
    root.addEventListener('change', schedule);
    win.addEventListener('mouseup', interactionEnd);
    win.addEventListener('pagehide', save);
    host.ownerDocument.addEventListener('visibilitychange', visibilityChange);
    win.addEventListener('resize', fit);
    const ancestors = new win.MutationObserver(records => {
      if (records.some(record => record.oldValue !== record.target.getAttribute(record.attributeName))) fit();
    });
    for (let parent = host.parentElement; parent; parent = parent.parentElement) ancestors.observe(parent, {
      attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true,
    });
    if (typeof component.resize === 'function') {
      const resize = component.resize;
      component.resize = function (...args) {
        const result = resize.apply(this, args);
        this._lastroResizeArgs = args;
        if (!applying) { capture(); schedule(); }
        return result;
      };
    }
    const remove = component.onRemove;
    component.onRemove = function (...args) {
      save(); removing = true;
      const values = { ...preferences };
      try { return remove?.apply(this, args); }
      finally {
        removing = false;
        // onRemove may clear content or measure a hidden/folded host.
        Object.assign(preferences, values); persist();
      }
    };
    const clamp = component._fixPositionOverflow;
    component._fixPositionOverflow = function () { if (host.style.display !== 'none') fit(); else clamp?.call(this); };
    preferences.save = save;
    state = component._lastroWindowState = {
      begin() { applying = true; },
      end() {
        if (component.isEmbedded?.()) { applying = false; observer.takeRecords(); fit(); return; }
        if (Number.isFinite(geometry.width) && geometry.width > 0) host.style.width = geometry.width + 'px';
        if (Number.isFinite(geometry.height) && geometry.height > 0) host.style.height = geometry.height + 'px';
        if (Number.isFinite(geometry.left)) host.style.left = geometry.left + 'px';
        if (Number.isFinite(geometry.top)) host.style.top = geometry.top + 'px';
        applying = false; observer.takeRecords();
        if (geometry.left == null) capture();
        fit();
      },
      save, fit,
      dispose() {
        win.clearTimeout(timer); observer.disconnect(); ancestors.disconnect();
        host.removeEventListener('mouseup', interactionEnd);
        root.removeEventListener('click', schedule); root.removeEventListener('change', schedule);
        win.removeEventListener('mouseup', interactionEnd); win.removeEventListener('pagehide', save);
        win.removeEventListener('resize', fit); host.ownerDocument.removeEventListener('visibilitychange', visibilityChange);
      },
    };
  }
  state.begin();
  try { return append(); } finally { state.end(); }
}

export function lastroBindNestedWindowState(component, preferences, current) {
  if (component._lastroNestedWindowState) return;
  const host = component._host, root = component.getRoot(), win = host.ownerDocument.defaultView;
  const save = preferences.save;
  let timer, signature;
  const records = [['inputWindow', '.InputWindow'], ['outputWindow', '.OutputWindow'], ['AvailableItemsWindow', '.AvailableItemsWindow'], ['PurchaseResult', '.PurchaseResult']];
  function capture() {
    if (!host.isConnected) return;
    const values = current();
    for (const [key, selector] of records) {
      const element = root.querySelector(selector), pref = values[key];
      if (!element || !pref) continue;
      const x = parseFloat(element.style.left), y = parseFloat(element.style.top);
      const height = Math.floor(parseFloat(element.querySelector('.content')?.style.height) / 32);
      if (Number.isFinite(x)) pref.x = x;
      if (Number.isFinite(y)) pref.y = y;
      if (height > 0) pref.height = height;
      const width = parseFloat(element.style.width);
      if (Object.hasOwn(pref, 'width') && width > 0) pref.width = width;
    }
  }
  function flush() {
    win.clearTimeout(timer); capture();
    const value = JSON.stringify({ ...preferences, _key: undefined, save: undefined });
    if (value !== signature) { save.call(preferences); signature = value; }
  }
  function schedule() { win.clearTimeout(timer); timer = win.setTimeout(flush, 80); }
  const observer = new win.MutationObserver(schedule);
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
  win.addEventListener('mouseup', flush); win.addEventListener('pagehide', flush);
  host.ownerDocument.addEventListener('visibilitychange', () => { if (host.ownerDocument.hidden) flush(); });
  preferences.save = flush;
  component._lastroNestedWindowState = { save: flush };
}

const excluded = /^(?:WorldMap\/|MobileUI\/|Quest\/Quest\/QuestWindow|Vending\/|CharSelect\/|WinLogin\/|Intro\/|NpcStore\/)/;

function patchStorageFilterUiState(region) {
  const file = ts.createSourceFile('StorageFilter.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const append = [], resize = [], remove = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && ts.isFunctionExpression(node.right)) {
      const name = node.left.getText(file);
      if (name === 'StorageFilter.prototype.onAppend') append.push(node);
      if (name === 'StorageFilter.prototype.resizeHeight') resize.push(node);
      if (name === 'component.onRemove') remove.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (append.length !== 1 || resize.length !== 1 || remove.length !== 1) throw new Error('anchor:ui-state:storage-filter');
  const clamp = resize[0].right.body.statements.find(node => node.getText(file) === 'height = Math.min(Math.max(height, 4), 10);');
  if (!clamp) throw new Error('anchor:ui-state:storage-filter-height');
  const original = append[0].right.body.getText(file).slice(1, -1);
  const body = `{ return lastroUiWindowAppend(this, this._preferences, () => {
    this.resizeHeight(this._preferences.height);
    ${original}
  }, () => {
    this._preferences.x = parseInt(this._host.style.left, 10);
    this._preferences.y = parseInt(this._host.style.top, 10);
    const content = this.getRoot().querySelector('.content');
    const height = content ? parseFloat(content.style.height) / 32 : NaN;
    if (Number.isFinite(height)) this._preferences.height = Math.min(Math.max(Math.floor(height), 4), 10);
  }); }`;
  const edits = [
    { start: append[0].right.body.getStart(file), end: append[0].right.body.end, text: body },
    { start: clamp.end, end: clamp.end, text: '\n    this._preferences.height = height;' },
    { start: remove[0].right.body.getStart(file), end: remove[0].right.body.end,
      text: `{ try { ${remove[0].right.body.getText(file).slice(1, -1)} } finally { this._lastroWindowState?.dispose(); } }` },
  ];
  for (const edit of edits.sort((a, b) => b.start - a.start)) region = region.slice(0, edit.start) + edit.text + region.slice(edit.end);
  return region;
}

function patchNestedWindowState(region, name) {
  const file = ts.createSourceFile(name, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let append;
  function visit(node) {
    if (ts.isBinaryExpression(node) && ts.isFunctionExpression(node.right)
      && node.left.getText(file) === (name === 'Vending/Vending' ? 'Vending.onAppend' : 'NpcStore.onAppend')) append = node.right;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!append) throw new Error('anchor:ui-state:' + name);
  const pref = name === 'Vending/Vending' ? '_preferences$16' : '_preferences$2';
  const current = name === 'Vending/Vending' ? '() => _preferences$16' : '() => getCurrentPref()';
  return region.slice(0, append.body.end - 1) + `\nlastroBindNestedWindowState(this, ${pref}, ${current});\n` + region.slice(append.body.end - 1);
}

function snapshotBody(body, file, preference) {
  function keep(node) {
    if (ts.isTryStatement(node)) return keep(node.tryBlock);
    if (ts.isVariableStatement(node)) return node.getText(file);
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.left.getText(file).startsWith(preference + '.')) return node.getText(file);
    if (ts.isIfStatement(node)) {
      const yes = keep(node.thenStatement), no = node.elseStatement && keep(node.elseStatement);
      return yes || no ? `if (${node.expression.getText(file)}) {${yes}}${no ? ` else {${no}}` : ''}` : '';
    }
    if (ts.isBlock(node)) return node.statements.map(keep).filter(Boolean).join('\n');
    return '';
  }
  return body.statements.map(keep).filter(Boolean).join('\n')
    .replace(/this\._host\.getBoundingClientRect\(\)/g, '({ width: this._host.offsetWidth, height: this._host.offsetHeight })');
}

export function patchRuntimeUiState(source) {
  if (source.includes('function lastroUiWindowAppend(')) return source;
  let count = 0;
  let output = source.replace(/\/\/#region src\/UI\/Components\/([^\r\n]+)\.js\r?\n[\s\S]*?\/\/#endregion/g, (region, name) => {
    if (name === 'Vending/Vending' || name === 'NpcStore/NpcStore') { count++; return patchNestedWindowState(region, name); }
    if (excluded.test(name) || !region.includes('Preferences.get(')) return region;
    if (name === 'Rodex/WriteRodex') region = region.replace('Preferences.get("WriteRodex", { show: false }, 1);', 'const lastroWriteRodexPreferences = Preferences.get("WriteRodex", { show: false }, 1);');
    if (name === 'Storage/StorageV3/StorageFilter') {
      count++;
      return patchStorageFilterUiState(region);
    }
    const file = ts.createSourceFile(name, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const assignments = [], methods = [], preferences = [];
    function visit(node) {
      if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && ts.isFunctionExpression(node.right)
        && ['onAppend', 'onRemove'].includes(node.left.name.text)) assignments.push(node);
      if (ts.isMethodDeclaration(node) && ['onAppend', 'onRemove'].includes(node.name.getText(file))) methods.push(node);
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'Preferences.get') {
        const parent = node.parent;
        const variable = ts.isBinaryExpression(parent) ? parent.left.getText(file) : ts.isVariableDeclaration(parent) ? parent.name.getText(file) : '';
        if (/^(?:_preferences(?:\$\d+)?|lastroWriteRodexPreferences)$/.test(variable)) preferences.push(variable);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    const edits = [];
    for (const append of assignments.filter(node => node.left.name.text === 'onAppend')) {
      const object = append.left.expression.getText(file);
      const remove = assignments.find(node => node.left.name.text === 'onRemove' && node.left.expression.getText(file) === object);
      const references = remove ? [...new Set([...remove.right.body.getText(file).matchAll(/(?:this\.)?_preferences(?:\$\d+)?\b/g)].map(match => match[0]))] : [];
      if (!references.length && preferences.length === 1) references.push(preferences[0]);
      if (references.length !== 1) continue;
      const preference = references[0];
      let body = remove ? snapshotBody(remove.right.body, file, preference) : '';
      if (!body.includes(preference + '.')) body = `${preference}.x = parseFloat(this._host.style.left) || 0; ${preference}.y = parseFloat(this._host.style.top) || 0;`;
      const original = append.right.body.getText(file).slice(1, -1);
      const wrapped = `{ return lastroUiWindowAppend(this, ${preference}, () => {${original}\n}, () => {${body}\n}); }`;
      edits.push({ start: append.right.body.getStart(file), end: append.right.body.end, text: wrapped }); count++;
    }
    for (const append of methods.filter(node => node.name.getText(file) === 'onAppend')) {
      const remove = methods.find(node => node.name.getText(file) === 'onRemove' && node.parent === append.parent);
      if (!remove || !append.body || !remove.body || preferences.length !== 1) continue;
      const preference = preferences[0], body = snapshotBody(remove.body, file, preference);
      edits.push({ start: append.body.getStart(file), end: append.body.end,
        text: `{ return lastroUiWindowAppend(this, ${preference}, () => {${append.body.getText(file).slice(1, -1)}\n}, () => {${body}\n}); }` }); count++;
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) region = region.slice(0, edit.start) + edit.text + region.slice(edit.end);
    // Local resize functions must update their grid preferences immediately.
    if (name === 'Storage/StorageCommon') {
      region = region.replace('height = Math.min(Math.max(height, 8), 17);', 'height = Math.min(Math.max(height, 8), 17);\n    _preferences.height = height;')
        .replace('this.ui.show();', 'resizeHeight(_preferences.height);\n    this.ui.show();');
      region = region.replace(/_preferences\.height = Math\.floor\(\s*\(this\._host\.getBoundingClientRect\(\)\.height - 20\) \/ 32,?\s*\);/g,
        '_preferences.height = Math.floor(parseFloat(this.getRoot().querySelector(".container .content").style.height) / 32) || _preferences.height;');
      region = region.replace(/_preferences\.height = Math\.floor\(\s*\(\(\{ width: this\._host\.offsetWidth, height: this\._host\.offsetHeight \}\)\.height - 20\) \/ 32,?\s*\);/g,
        '_preferences.height = Math.floor(parseFloat(this.getRoot().querySelector(".container .content").style.height) / 32) || _preferences.height;');
    }
    if (name === 'SkillList/SkillListCommon') region = region.replace(/function resize\(comp, width, height\) \{/, '$&\n    _preferences.width = width; _preferences.height = height;');
    if (name === 'MakeItemSelection/ItemConvertSelection/ConvertItems') {
      region = region.replace('height = Math.min(Math.max(height, 8), 17);', 'height = Math.min(Math.max(height, 8), 17);\n  _preferences$6.height = height;')
        .replace('this.material = [];', 'resizeHeight$1(_preferences$6.height);\n    this.material = [];');
    }
    if (name === 'MakeItemSelection/ItemListWindowSelection') {
      region = region.replace('height = Math.min(Math.max(height, 8), 17);', 'height = Math.min(Math.max(height, 8), 17);\n  _preferences$5.height = height;')
        .replace('this.setList(InventoryController.getUI().list);', 'resizeHeight(_preferences$5.height);\n    this.setList(InventoryController.getUI().list);');
    }
    if (name === 'Inventory/InventoryCommon' || name === 'CartItems/CartItems') {
      if (name === 'Inventory/InventoryCommon') region = region.replace('if (!_preferences.show) this._host.style.display = "none";',
        'this._host.style.display = "";\n    if (!resizableHeight) this._host.style.height = "";\n    const lastroExpandedPanel = root.querySelector(".panel");\n    if (lastroExpandedPanel) lastroExpandedPanel.style.display = "flex";');
      else region = region.replace(/if \(SessionStorage_default\.Entity\.hasCart === false\)\s+this\._host\.style\.display = "none";\s+if \(!_preferences\$26\.show\) this\._host\.style\.display = "none";/,
        'this._host.style.display = "";\n    const lastroExpandedPanel = this.getRoot().querySelector(".panel");\n    if (lastroExpandedPanel) lastroExpandedPanel.style.display = "block";');
      region = region.replace(/(this|Component|CartItems)\._host\.getBoundingClientRect\(\)\.height/g, '$1._host.offsetHeight');
      region = region.replace(/(this|Component|CartItems)\._host\.offsetHeight/g, '($1._host.offsetHeight || parseFloat($1._host.style.height) || 0)');
      if (name === 'CartItems/CartItems') region = region.replace('_realSize$1 = _preferences$26.reduce ? 0 : hostRect.height;',
        '_realSize$1 = _preferences$26.reduce ? 0 : (this._host.offsetHeight || parseFloat(this._host.style.height) || 0);');
      region = region.replace(/(miniBtn(?:Append)?\.dispatchEvent\(new Event\()"mousedown"(\)\))/g, '$1"click"$2');
      if (name === 'Inventory/InventoryCommon') region = region.replace('if (miniBtnAppend) miniBtnAppend.dispatchEvent(new Event("click"));',
        '$&\n    if (!_preferences.show) this._host.style.display = "none";');
      else region = region.replace('if (miniBtn) miniBtn.dispatchEvent(new Event("click"));',
        '$&\n    if (!_preferences$26.show || SessionStorage_default.Entity.hasCart === false) this._host.style.display = "none";');
    }
    return region;
  });
  if (count) output = output.replace('//#region src/UI/GUIComponent.js', lastroUiWindowAppend.toString() + '\n' + lastroBindNestedWindowState.toString() + '\n//#region src/UI/GUIComponent.js');
  output = output.replace('UIClamp(el, WIDTH, HEIGHT, component.magnet);', 'if (component._lastroWindowState) component._lastroWindowState.fit();\n        else UIClamp(el, WIDTH, HEIGHT, component.magnet);');
  const coreStart = output.indexOf('//#region src/Core/Preferences.js');
  if (coreStart >= 0) {
    const end = output.indexOf('//#endregion', coreStart);
    const file = ts.createSourceFile('Preferences.js', output.slice(coreStart, end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits = [];
    function visit(node) {
      if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'get') edits.push({ start: node.getStart(file), end: node.end, text: `static get(key, def, version = 0) {
        def._key = key; def._version = version; def.save = selfSave;
        let valid = false;
        try { Storage.get(key, value => {
          const data = JSON.parse(value[key]);
          if (data && typeof data === "object" && !Array.isArray(data) && data._version === version) {
            for (const field of Object.keys(data)) if (field !== "_key" && field !== "save" && field !== "__proto__") def[field] = data[field];
            valid = true;
          }
        }); } catch { /* Recover an invalid local UI preference record. */ }
        if (!valid) Preferences.save(def);
        return def;
      }` });
      if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'save') edits.push({ start: node.getStart(file), end: node.end, text: `static save(data) {
        if (!data || typeof data._key !== "string") return;
        const value = {};
        for (const key of Object.keys(data)) if (key !== "_key" && key !== "save") value[key] = data[key];
        const store = {}; store[data._key] = JSON.stringify(value); Storage.set(store);
      }` });
      ts.forEachChild(node, visit);
    }
    visit(file);
    let region = output.slice(coreStart, end);
    for (const edit of edits.sort((a, b) => b.start - a.start)) region = region.slice(0, edit.start) + edit.text + region.slice(edit.end);
    output = output.slice(0, coreStart) + region + output.slice(end);
  }
  output = output.replace(/\/\/#region src\/UI\/Components\/Inventory\/InventoryV0\/InventoryV0\.css\?raw\r?\n[\s\S]*?\/\/#endregion/, region => {
    const file = ts.createSourceFile('InventoryV0.css.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let style;
    function visit(node) {
      if (ts.isBinaryExpression(node) && node.left.getText(file) === 'InventoryV0_default$1' && ts.isStringLiteral(node.right)) style = node.right;
      ts.forEachChild(node, visit);
    }
    visit(file);
    if (!style) throw new Error('anchor:ui-state:inventory-grid-style');
    const css = style.text + '\n.ui-component-root, #InventoryV0 { height: 100%; }\n#InventoryV0 .titlebar { flex-shrink: 0; }\n#InventoryV0 .panel, #InventoryV0 .middle { min-height: 0; }\n';
    return region.slice(0, style.getStart(file)) + JSON.stringify(css) + region.slice(style.end);
  });
  return output;
}
