import ts from 'typescript';

// IDs and source strings are taken from the packaged message table and native UI.
// Preserve unknown values, Chinese TXT translations and RO abbreviations.
export const UI_MESSAGE_OVERRIDES = {
  99: { source: '1:1 Chat', label: '私聊' },
  1259: { source: 'Input Number', label: '输入数值' },
  2209: { source: 'Mob', label: '魔物' },
  2776: { source: '1 z UP', label: '增加1' },
  2777: { source: '1 z Down', label: '减少1' },
  2778: { source: 'Max', label: '最大值' },
  3111: { source: 'CHANGE', label: '切换' },
  3231: { source: 'Cap', label: '队员' },
  3504: { source: "Adventurer's Agency", label: '冒险家中介' },
};

/** Self-contained so the same implementation can be embedded in the native DB. */
export function createLastroUiMessages(overrides = UI_MESSAGE_OVERRIDES) {
  const isChinese = text => typeof text === 'string' && /[\u3400-\u9fff]/u.test(text);

  function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') { value += '"'; index++; }
        else if (quoted || value.length === 0) quoted = !quoted;
        else value += character;
      } else if (!quoted && character === ',') {
        row.push(value); value = '';
      } else if (!quoted && (character === '\r' || character === '\n')) {
        row.push(value); rows.push(row); row = []; value = '';
        if (character === '\r' && text[index + 1] === '\n') index++;
      } else value += character;
    }
    if (quoted) return null;
    if (row.length || value.length) { row.push(value); rows.push(row); }
    return rows;
  }

  function loadCsv(data, targetTable, decode) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const text = decode(bytes).replace(/^\uFEFF/, '');
    // Keep the native legacy Base64/TAB handling outside this narrowly scoped fix.
    if (text.trimEnd().endsWith('=') || !/^MSI_[^,\r\n]+,/.test(text)) return false;
    const rows = parseCsv(text);
    if (!rows || text.includes('\uFFFD')) return false;
    for (let id = 0; id < rows.length; id++) {
      const row = rows[id];
      if (!/^(?:MSI|MIS)_/.test(row[0] || '') || row.length !== 2) continue;
      const value = row[1];
      const previous = targetTable[id];
      // Blank records reserve their ID. Never shift later rows or downgrade TXT Chinese.
      if (isChinese(previous)) continue;
      if (isChinese(value) || typeof previous !== 'string' || !previous.trim()) targetTable[id] = value;
    }
    return true;
  }

  function resolveMessage(id, value, defaultText) {
    if (!Object.prototype.hasOwnProperty.call(overrides, id)) return undefined;
    const entry = overrides[id];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      if (defaultText !== undefined && defaultText !== '' && defaultText !== entry.source) return undefined;
      return entry.label;
    }
    if (typeof value === 'string' && value.trim() === entry.source) return entry.label;
    return undefined;
  }
  return { loadCsv, resolveMessage };
}

export function patchRuntimeUiMessages(source) {
  const marker = '//#region src/DB/DBManager.js';
  const start = source.indexOf(marker);
  if (start === -1) return source;
  const end = source.indexOf('//#endregion', start);
  if (end === -1 || source.lastIndexOf(marker) !== start || source.includes('const LastROUiMessages =')) throw new Error('anchor:ui-message-region');
  const section = source.slice(start, end);
  const file = ts.createSourceFile('DBManager.js', section, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const loaders = [], methods = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadCSV') loaders.push(node);
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'getMessage') methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (loaders.length !== 1 || methods.length !== 1) throw new Error('anchor:ui-message-functions');
  const loader = loaders[0], method = methods[0];
  if (loader.parameters.map(node => node.name.getText(file)).join(',') !== 'filename,targetTable,keyIndex,valueIndex,onEnd'
      || method.parameters.map(node => node.name.getText(file)).join(',') !== 'id,defaultText'
      || !method.modifiers?.some(node => node.kind === ts.SyntaxKind.StaticKeyword)
      || !method.body?.getText(file).includes('if (!(id in MsgStringTable))')) throw new Error('anchor:ui-message-signatures');
  const callbacks = [];
  function findCallback(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'Client.loadFile'
        && node.arguments[0]?.getText(file) === 'filename' && ts.isFunctionExpression(node.arguments[1])) callbacks.push(node.arguments[1]);
    ts.forEachChild(node, findCallback);
  }
  findCallback(loader);
  if (callbacks.length !== 1 || callbacks[0].parameters.map(node => node.name.getText(file)).join(',') !== 'data') throw new Error('anchor:ui-message-loader');
  const insertions = [
    { at: start + callbacks[0].body.getStart(file) + 1, text: '\n      if (filename === "data/msgstringtable.csv" && keyIndex === 0 && valueIndex === 1 && LastROUiMessages.loadCsv(data, targetTable, bytes => CodepageManager.decode(bytes, "utf-8"))) {\n        if (typeof onEnd === "function") onEnd();\n        return;\n      }\n' },
    { at: start + method.body.getStart(file) + 1, text: '\n      const lastroUiMessage = LastROUiMessages.resolveMessage(id, MsgStringTable[id], defaultText);\n      if (lastroUiMessage !== undefined) return lastroUiMessage;\n' },
  ];
  for (const insertion of insertions.sort((a, b) => b.at - a.at)) source = source.slice(0, insertion.at) + insertion.text + source.slice(insertion.at);
  return `const LastROUiMessages = (${createLastroUiMessages.toString()})(${JSON.stringify(UI_MESSAGE_OVERRIDES)});\n` + source;
}
