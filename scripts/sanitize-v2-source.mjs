import ts from 'typescript';

export const namespaceUris = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
]);
const absoluteUrl = /(?:https?|wss?):\/\/[^\s"'`<>\\)\]}]+/gi;

// Only called after the importer verifies the reviewed source's exact hash.
export function sanitizeReviewedSource(source, file, allowedOrigins) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = new Map();
  const changes = {};
  const replace = (start, end, text, rule) => {
    edits.set(`${start}:${end}`, { start, end, text });
    changes[rule] = (changes[rule] ?? 0) + 1;
  };
  const cleanUrls = text => text.replace(absoluteUrl, url => {
    if (namespaceUris.has(url) || allowedOrigins.some(origin => url.startsWith(origin + '/'))) return url;
    return '[external reference removed]';
  });
  function comments(position, trailing = false) {
    const ranges = trailing ? ts.getTrailingCommentRanges(source, position) : ts.getLeadingCommentRanges(source, position);
    for (const range of ranges ?? []) {
      const original = source.slice(range.pos, range.end);
      const cleaned = cleanUrls(original).replace(/WebSocket|XKore/gi, 'legacy transport');
      if (original !== cleaned) replace(range.pos, range.end, cleaned, 'comment-references');
    }
  }
  function visit(node) {
    comments(node.pos);
    comments(node.end, true);
    if (ts.isFunctionDeclaration(node) && ['populateQuickLoginButtons', 'populateLoginServerButtons', 'patchWinLoginTemplate'].includes(node.name?.text)) {
      replace(node.body.getStart(parsed), node.body.end, '{}', 'remove-personal-login-ui');
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'populateQuickLoginButtons') {
      replace(node.getStart(parsed), node.end, 'void 0', 'remove-personal-login-call');
      return;
    }
    if (ts.isFunctionExpression(node) && ['saveToServer', 'loadFromServer'].includes(node.name?.text)
      && ts.isBinaryExpression(node.parent) && node.parent.left.getText(parsed).startsWith('ShortCut.')) {
      replace(node.body.getStart(parsed), node.body.end,
        node.name.text === 'loadFromServer' ? '{ if (callback) callback(); }' : '{}', 'disable-http-hotkey-service');
      return;
    }
    if (ts.isIfStatement(node) && node.expression.getText(parsed).includes('Cinzel')) {
      replace(node.getStart(parsed), node.end, ';', 'remove-remote-font-stylesheet');
      return;
    }
    if (ts.isTemplateExpression(node) && /(?:https?|wss?):\/\//i.test(node.getText(parsed))) {
      const parent = node.parent;
      const packageWasm = ts.isBinaryExpression(parent) && ts.isPropertyAccessExpression(parent.left)
        && parent.left.name.text === 'customWasmUri';
      const fragments = [JSON.stringify(cleanUrls(node.head.text))];
      for (const span of node.templateSpans) {
        fragments.push(`String(${span.expression.getText(parsed)})`, JSON.stringify(cleanUrls(span.literal.text)));
      }
      replace(node.getStart(parsed), node.end, packageWasm ? '"/core/wasm/liblua5.1.wasm"' : `(${fragments.join(' + ')})`,
        packageWasm ? 'package-only-wasm' : 'remove-external-template-reference');
      return;
    }
    if (ts.isStringLiteralLike(node)) {
      const cleaned = cleanUrls(node.text);
      if (cleaned !== node.text) {
        const isScreenshotService = ts.isPropertyAssignment(node.parent) && node.parent.name?.text === 'proxy';
        replace(node.getStart(parsed), node.end, isScreenshotService ? 'null' : JSON.stringify(cleaned), 'remove-external-reference');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const ordered = [...edits.values()].sort((a, b) => a.start - b.start);
  let result = '', position = 0;
  for (const edit of ordered) {
    if (edit.start < position) continue;
    result += source.slice(position, edit.start) + edit.text;
    position = edit.end;
  }
  return { source: result + source.slice(position), changes };
}
