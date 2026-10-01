import ts from 'typescript';

function lastroHotkeyId(event) {
  const legacy = event.which || event.keyCode;
  if (Number.isInteger(legacy) && legacy > 0) return legacy;
  const code = event.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return 111 + Number(code.slice(1));
  const codes = { Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111 };
  if (Object.hasOwn(codes, code)) return codes[code];
  const keys = { Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, Meta: 91, ContextMenu: 93, NumLock: 144, ScrollLock: 145 };
  return Object.hasOwn(keys, event.key) ? keys[event.key] : Object.hasOwn(keys, code) ? keys[code]
    : code === 'Space' ? 32 : code === 'NumpadEnter' ? 13 : 0;
}

function lastroHotkeyComponentVisible(component) {
  const host = component?._host;
  return !!host?.isConnected && component.__active === true && host.style.display !== 'none'
    && host.ownerDocument.defaultView.getComputedStyle(host).display !== 'none';
}

function lastroHotkeyEditable(element) {
  return !!element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable
    || element.closest?.('[contenteditable]:not([contenteditable="false"])'));
}

const npcPrefix = `
    const keyId = lastroHotkeyId(event);
    if (!lastroHotkeyComponentVisible(this)) return true;
    if (event.isComposing || keyId === 229 || event.key === "Process" || event.key === "Dead" ||
        event.metaKey || event.getModifierState?.("AltGraph")) {
      event.stopImmediatePropagation();
      return true;
    }
    const nativeActive = KEYS.getDeepActiveElement();
    const nativeChat = UIManager.components.ChatBox?.getRoot?.();
    const nativeChatInput = nativeActive === nativeChat?.querySelector(".input-chatbox") ||
      nativeActive === nativeChat?.querySelector(".input .username");
    if (lastroHotkeyEditable(nativeActive) && !nativeChatInput && !this.getRoot()?.contains(nativeActive)) return true;
    if ((keyId === KEYS.ENTER || keyId === KEYS.SPACE) && (event.ctrlKey || event.altKey || event.shiftKey)) return true;
    if (event.repeat && [KEYS.ENTER, KEYS.SPACE, KEYS.ESCAPE].includes(keyId)) {
      event.stopImmediatePropagation();
      return false;
    }
`;

const escapePrefix = `
    const keyId = lastroHotkeyId(event);
    if (!this.__active || !this._host?.isConnected) return true;
    if (event.isComposing || keyId === 229 || event.key === "Process" || event.key === "Dead" ||
        event.metaKey || event.getModifierState?.("AltGraph")) return true;
    if (keyId !== KEYS.ESCAPE) return true;
    const escapeComponents = UIManager.components;
    // NPC handlers decide whether their current dialog can be closed.
    if (["NpcBox", "NpcMenu", "InputBox"].some(name => lastroHotkeyComponentVisible(escapeComponents[name]))) return true;
    const escapeActive = KEYS.getDeepActiveElement();
    const escapeChat = escapeComponents.ChatBox?.getRoot?.();
    if (lastroHotkeyEditable(escapeActive) && !escapeChat?.contains(escapeActive) && !this.getRoot()?.contains(escapeActive)) return true;
    if (event.repeat) {
      event.stopImmediatePropagation();
      return false;
    }
`;

const keyEventBody = `{
    KEYS.SHIFT = !!event.shiftKey;
    KEYS.CTRL = !!event.ctrlKey;
    KEYS.ALT = !!event.altKey;
    if (event.type !== "keydown") return;
    const recorder = typeof UIManager !== "undefined" ? UIManager?.components?.ShortCutOption : null;
    if (!recorder?.isCapturing) return;
    if (!recorder._host?.isConnected || recorder._host.style.display === "none") {
      recorder.isCapturing = false;
      return;
    }
    recorder.onKeyDown(event);
  }`;

const capturePrefix = `
    const keyId = lastroHotkeyId(event);
    if (!this.isCapturing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isComposing || keyId === 229 || event.key === "Process" || event.key === "Dead" ||
        event.metaKey || event.getModifierState?.("AltGraph") ||
        [16, 17, 18, 91, 92, 93].includes(keyId) || !KEYS.toReadableKey(keyId)) return false;
`;

const dispatchPrefix = `
    const keyId = lastroHotkeyId(event);
    // The current event is authoritative even when another UI stopped propagation.
    KEYS.SHIFT = !!event.shiftKey;
    KEYS.CTRL = !!event.ctrlKey;
    KEYS.ALT = !!event.altKey;
    if (event.isComposing || keyId === 229 || event.key === "Process" || event.key === "Dead" ||
        event.metaKey || event.getModifierState?.("AltGraph")) {
      event.stopImmediatePropagation();
      return true;
    }
    const hotkeyActive = KEYS.getDeepActiveElement();
    const hotkeyRoot = _root$18();
    const hotkeyChatInput = hotkeyActive === hotkeyRoot.querySelector(".input-chatbox") ||
      hotkeyActive === hotkeyRoot.querySelector(".input .username");
    const hotkeyEditable = !!hotkeyActive && (/^(INPUT|TEXTAREA|SELECT)$/.test(hotkeyActive.tagName) ||
      hotkeyActive.isContentEditable || hotkeyActive.closest?.('[contenteditable]:not([contenteditable="false"])'));
    const hotkeyFunction = keyId >= KEYS.F1 && keyId <= KEYS.F24;
    const hotkeyEditing = (event.ctrlKey && !event.altKey && [KEYS.A, KEYS.C, KEYS.V, KEYS.X, KEYS.Y, KEYS.Z, KEYS.INSERT].includes(keyId)) ||
      ((event.altKey || event.ctrlKey) && [KEYS.LEFT, KEYS.RIGHT, KEYS.UP, KEYS.DOWN, KEYS.BACK, KEYS.SUPR, KEYS.HOME, KEYS.END].includes(keyId)) ||
      (!event.ctrlKey && !event.altKey && event.shiftKey && keyId === KEYS.INSERT);
    const hotkeyMap = UIManager.components.WorldMap;
    if (lastroHotkeyComponentVisible(hotkeyMap) && event.composedPath?.().includes(hotkeyMap._host)) return true;
    if (hotkeyChatInput && hotkeyEditing) {
      event.stopImmediatePropagation();
      return true;
    }
    if (keyId === KEYS.ENTER && !event.ctrlKey && !event.altKey && !event.shiftKey &&
        ["InputBox", "NpcMenu", "NpcBox"].some(name => lastroHotkeyComponentVisible(UIManager.components[name]))) {
      // Let the visible native NPC step own Enter before a battle shortcut or chat.
      return true;
    }
    if ((!hotkeyEditable || (hotkeyChatInput && (hotkeyFunction || event.ctrlKey || event.altKey))) &&
        this.processBattleMode(keyId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
`;

const stopCapture = `
  ShortCutOption.isCapturing = false;
  ShortCutOption.getRoot()?.querySelectorAll("td.selected").forEach(cell => cell.classList.remove("selected"));
`;

function parseRegion(source, name) {
  const marker = `//#region ${name}`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:hotkeys:' + name);
  const end = source.indexOf('//#endregion', start);
  if (end < 0) throw new Error('anchor:hotkeys:' + name);
  const text = source.slice(start, end);
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return { start, text, file };
}

function one(region, predicate, label) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(region.file);
  if (found.length !== 1) throw new Error('anchor:hotkeys:' + label);
  return found[0];
}

export function patchRuntimeHotkeys(source) {
  if (!source.includes('//#region src/Controls/KeyEventHandler.js') && !source.includes('ShortCutOption.isCapturing')) return source;
  if (source.includes('function lastroHotkeyId(')) throw new Error('anchor:hotkeys:already-patched');
  const keys = parseRegion(source, 'src/Controls/KeyEventHandler.js');
  const option = parseRegion(source, 'src/UI/Components/ShortCutOption/ShortCutOption.js');
  const chat = parseRegion(source, 'src/UI/Components/ChatBox/ChatBox.js');
  const edits = [];
  const edit = (region, start, end, text) => edits.push({ start: region.start + start, end: region.start + end, text });
  function assignment(region, name) {
    return one(region, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(region.file) === name && (ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right)), name).right;
  }
  const keyEvent = assignment(keys, 'onKeyEvent');
  if (!ts.isBlock(keyEvent.body) || !keyEvent.body.getText(keys.file).includes('KEYS.ALT')) throw new Error('anchor:hotkeys:onKeyEvent');
  edit(keys, keyEvent.body.getStart(keys.file), keyEvent.body.end, keyEventBody);
  edit(keys, 0, 0, `${lastroHotkeyId.toString()}\n${lastroHotkeyComponentVisible.toString()}\n${lastroHotkeyEditable.toString()}\n`);
  for (const type of ['keydown', 'keyup']) {
    const call = one(keys, node => ts.isCallExpression(node) && node.expression.getText(keys.file) === 'window.addEventListener' &&
      node.arguments[0]?.text === type && node.arguments[1]?.getText(keys.file) === 'onKeyEvent', type);
    if (call.arguments.length !== 2) throw new Error('anchor:hotkeys:capture:' + type);
    edit(keys, call.arguments[1].end, call.arguments[1].end, ', true');
  }
  const focus = one(keys, node => ts.isCallExpression(node) && node.expression.getText(keys.file) === 'window.addEventListener' &&
    node.arguments[0]?.text === 'focus', 'modifier-reset');
  edit(keys, focus.parent.end, focus.parent.end, '\n  window.addEventListener("blur", () => { KEYS.SHIFT = false; KEYS.CTRL = false; KEYS.ALT = false; });');

  function addFunctionPrefix(region, fn, prefix, replaceWhich = false, dropChatSizeCase = false) {
    const body = fn.body;
    if (!ts.isBlock(body)) throw new Error('anchor:hotkeys:function-body');
    let text = body.getText(region.file);
    if (dropChatSizeCase) {
      const hardcoded = one({ ...region, file: body }, node => ts.isCaseClause(node) && node.expression.getText(region.file) === 'KEYS.F10', 'hardcoded-chat-size');
      text = text.slice(0, hardcoded.getStart(region.file) - body.getStart(region.file)) + text.slice(hardcoded.end - body.getStart(region.file));
    }
    if (replaceWhich) text = text.replace(/\bevent\.which\b/g, 'keyId');
    edit(region, body.getStart(region.file), body.end, '{' + prefix + text.slice(1));
  }
  addFunctionPrefix(option, assignment(option, 'ShortCutOption.onKeyDown'), capturePrefix, true);
  const captureStart = one(option, node => ts.isBinaryExpression(node) && node.left.getText(option.file) === 'ShortCutOption.isCapturing' &&
    node.right.kind === ts.SyntaxKind.TrueKeyword, 'recorder-cell');
  edit(option, captureStart.parent.end, captureStart.parent.end, `
          KEYS.getDeepActiveElement()?.blur?.();
          ShortCutOption.focus();`);
  for (const name of ['resetKeysToDefault', 'applySettings', 'cancelSettings']) {
    const fn = one(option, node => ts.isFunctionDeclaration(node) && node.name?.text === name, name);
    addFunctionPrefix(option, fn, stopCapture);
  }
  addFunctionPrefix(option, assignment(option, 'ShortCutOption.onRemove'), '\n    cancelSettings();\n');
  addFunctionPrefix(option, assignment(option, 'ShortCutOption.onAppend'), '\n    cancelSettings();\n');

  const chatKeys = assignment(chat, 'ChatBox.onKeyDown');
  addFunctionPrefix(chat, chatKeys, dispatchPrefix, true, true);
  // ChatSize already has a shortcut-table entry, but upstream only implemented
  // a hardcoded F10 branch. Give that existing action its normal dispatch hook.
  if (chat.text.includes('ChatBox.onShortCut')) throw new Error('anchor:hotkeys:chat-shortcut');
  edit(chat, chatKeys.parent.parent.end, chatKeys.parent.parent.end, `
  ChatBox.onShortCut = function (binding) {
    if (binding.cmd !== "updateHeight") return;
    this.updateHeight(false);
    const content = _root$18().querySelector(\`.content[data-content="\${this.activeTab}"]\`);
    if (content) content.scrollTop = content.scrollHeight;
  };`);
  const gate = assignment(chat, 'ChatBox.processBattleMode');
  const insert = one({ ...chat, file: gate.body }, node => ts.isPropertyAccessExpression(node) && node.getText(chat.file) === 'KEYS.INSERT', 'battle-mode-gate');
  edit(chat, insert.getStart(chat.file), insert.end, 'keyId === KEYS.INSERT');
  for (const [name, component, prefix, anchor] of [
    ['src/UI/Components/NpcBox/NpcBox.js', 'NpcBox', npcPrefix, 'switch (event.which)'],
    ['src/UI/Components/NpcMenu/NpcMenu.js', 'NpcMenu', npcPrefix, 'switch (event.which)'],
    ['src/UI/Components/InputBox/InputBox.js', 'InputBox', npcPrefix, 'event.which === KEYS.ENTER'],
    ['src/UI/Components/Escape/Escape.js', 'Escape', escapePrefix, 'event.which === KEYS.ESCAPE'],
  ]) {
    // Small independent fixtures need not contain unrelated native UI regions.
    if (!source.includes('//#region ' + name)) continue;
    const region = parseRegion(source, name), fn = assignment(region, component + '.onKeyDown');
    if (!fn.body.getText(region.file).includes(anchor)) throw new Error('anchor:hotkeys:' + component);
    addFunctionPrefix(region, fn, prefix, true);
  }
  for (const change of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, change.start) + change.text + source.slice(change.end);
  return source;
}
