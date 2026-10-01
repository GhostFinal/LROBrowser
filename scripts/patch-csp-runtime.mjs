import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import ts from 'typescript';

export function patchCspRuntime(source) {
  const rootPattern = 'var root = freeGlobal || freeSelf || Function("return this")();';
  if (source.split(rootPattern).length - 1 !== 1) throw new Error('root-anchor');
  let output = patchElectronRequireFallbacks(source.replace(rootPattern, 'var root = globalThis;'));
  const file = ts.createSourceFile('Online.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'template') functions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (functions.length !== 1) throw new Error('template-anchor');
  const body = functions[0].body;
  output = output.slice(0, body.getStart(file)) + '{ throw new Error("Lodash template is disabled by IWA CSP"); }' + output.slice(body.end);
  return output;
}

export function patchElectronRequireFallbacks(source) {
  return source.replace(
    /if\("undefined"!=typeof process&&process\.versions\?\.electron\)try\{[A-Za-z_$][\w$]*=Function\("return require"\)\(\)\("fs"\)\}catch\{\}/g,
    '',
  );
}

/** Restrict native banner/registration navigation to the configured HTTPS sites. */
export function patchRuntimeNavigation(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  const pending = [file];
  while (pending.length) {
    const node = pending.pop();
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'open' && ts.isIdentifier(node.expression.expression)
      && ['window', 'globalThis', 'self'].includes(node.expression.expression.text)) {
      if (!node.arguments.length) throw new Error('navigation-missing-url');
      edits.push({ start: node.getStart(file), end: node.end, text: `openLastROExternalURL(${node.arguments[0].getText(file)})` });
    }
    ts.forEachChild(node, child => { pending.push(child); });
  }
  if (!edits.length) return source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return 'import { openLastROExternalURL } from "./lastro-trusted-dom.mjs";\n' + source;
}

/** Optional config must never become a source of executable module paths. */
export function patchRuntimePluginLoader(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const pending = [file];
  const matches = [];
  while (pending.length) {
    const node = pending.pop();
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(file) === 'Plugins.init' && ts.isFunctionExpression(node.right)) matches.push(node.right);
    ts.forEachChild(node, child => { pending.push(child); });
  }
  if (matches.length !== 1) throw new Error('plugin-loader-anchor');
  const body = matches[0].body;
  return source.slice(0, body.getStart(file)) + '{\n    if (_initialized) return;\n    _initialized = true;\n    this.list = [];\n    // IWA features are statically imported from the verified package.\n  }' + source.slice(body.end);
}

/** Character/item names are server data, not formatted UI markup. */
export function patchRuntimePlainTextSinks(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const pending = [file];
  const edits = [];
  let alreadyPatched = 0;
  while (pending.length) {
    const node = pending.pop();
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
      const property = node.left.name.text;
      const target = node.left.expression.getText(file);
      const value = node.right.getText(file).replace(/\s+/g, '');
      const character = target === 'charCanvases[i].querySelector(".name")' && value === '_slots[i]?_slots[i].name:""';
      const item = target === 'nameSpan' && value === 'DB.getItemName(item)';
      const quantity = target === 'overlay' && value === '`${DB.getItemName(item)}${item.count||1}${getItemCountUnit()}`';
      if (character || item || quantity) {
        const regionStart = source.lastIndexOf('//#region', node.getStart(file));
        const region = source.slice(regionStart, source.indexOf('\n', regionStart));
        if (character || region.includes('src/UI/Components/Storage/')) {
          if (property === 'innerHTML') edits.push({ start: node.left.name.getStart(file), end: node.left.name.end });
          if (property === 'textContent') alreadyPatched++;
        }
      }
    }
    ts.forEachChild(node, child => { pending.push(child); });
  }
  if (edits.length + alreadyPatched !== 5) throw new Error('plain-text-sinks-anchor');
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + 'textContent' + source.slice(edit.end);
  return source;
}

if (process.argv[1]?.endsWith('patch-csp-runtime.mjs')) {
  const input = process.argv[2];
  const output = process.argv[3] ?? input;
  try {
    const source = await readFile(input, 'utf8');
    const patched = source.includes('var root = freeGlobal || freeSelf || Function("return this")();')
      ? patchCspRuntime(source)
      : patchElectronRequireFallbacks(source);
    await writeFile(output, patched);
  }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
