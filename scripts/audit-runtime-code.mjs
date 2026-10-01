import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
/* eslint-disable no-control-regex -- Reject control characters in executable URLs. */

function unwrapped(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function literal(node) {
  node = unwrapped(node);
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literal(node.left), right = literal(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
  return undefined;
}

function property(node) {
  node = unwrapped(node);
  if (node && ts.isPropertyAccessExpression(node)) return node.name.text;
  if (node && ts.isElementAccessExpression(node)) return literal(node.argumentExpression);
  return undefined;
}

function globalName(node) {
  node = unwrapped(node);
  if (!node) return '';
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) return globalName(node.right);
  const name = property(node);
  if (!name) return '';
  const base = unwrapped(node.expression);
  if (ts.isIdentifier(base) && ['window', 'globalThis', 'self', 'global'].includes(base.text)) return name;
  if (['call', 'apply', 'bind'].includes(name) && !['call', 'apply', 'bind'].includes(property(base))) return globalName(base);
  if (name === 'constructor' && (ts.isArrowFunction(base) || ts.isFunctionExpression(base)
    || property(base) === 'constructor')) return 'Function';
  return '';
}

export function auditRuntimeSource(source, file = 'runtime.js') {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const violations = [];
  const report = code => { if (!violations.some(value => value.code === code)) violations.push({ file, code }); };
  const dangerous = new Set(['eval', 'Function', 'AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction']);
  const htmlCapability = /(?:^|\/)(?:core\/)?runtime\/lastro-trusted-dom\.mjs$/.test(file.replaceAll('\\', '/'));
  const nodes = [];
  const pending = [parsed];
  while (pending.length) {
    const node = pending.pop();
    nodes.push(node);
    ts.forEachChild(node, child => { pending.push(child); });
  }
  if (parsed.parseDiagnostics.length) report('invalid-javascript');
  for (const node of nodes) {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(node.operatorToken.kind)) {
      const name = property(node.left);
      if (name === 'srcdoc' || !htmlCapability && ['innerHTML', 'outerHTML'].includes(name)) report('uncontrolled-html-write');
    }
    if (ts.isVariableDeclaration(node) && node.initializer && dangerous.has(globalName(node.initializer))) report('dynamic-code-alias');
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && dangerous.has(globalName(node.right))) report('dynamic-code-alias');
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer
      && ['window', 'self', 'globalThis', 'global'].includes(globalName(node.initializer))) {
      for (const member of node.name.elements) {
        const name = member.propertyName || member.name;
        if (dangerous.has(ts.isIdentifier(name) ? name.text : literal(name))) report('dynamic-code-alias');
      }
    }
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) continue;
    const name = globalName(node.expression);
    if (dangerous.has(name)) report(ts.isNewExpression(node) ? 'new-' + name : name);
    const prop = property(node.expression);
    if (['setHTMLUnsafe', 'parseHTMLUnsafe'].includes(prop)
      || !htmlCapability && ['insertAdjacentHTML', 'parseFromString'].includes(prop)) report('uncontrolled-html-parser');
    if (['createElement', 'createElementNS'].includes(prop)) {
      const kind = literal(node.arguments?.[prop === 'createElementNS' ? 1 : 0])?.toLowerCase();
      if (kind === 'script') report('executable-script-element');
    }
    if (prop === 'setAttribute' || prop === 'setAttributeNS') {
      const attribute = literal(node.arguments?.[prop === 'setAttributeNS' ? 1 : 0]);
      if (/^(?:on[a-z]|srcdoc$)/i.test(attribute || '')) report('executable-dom-attribute');
    }
    if (['write', 'writeln'].includes(prop) && globalName(node.expression.expression) === 'document') report('document-write');
    if (prop === 'createContextualFragment') report('uncontrolled-html-fragment');
    if (['setTimeout', 'setInterval'].includes(name) && literal(node.arguments?.[0]) !== undefined) report('string-timer');
    if (name === 'fetch') {
      const url = literal(node.arguments?.[0]);
      if (url !== undefined && /\.(?:lua|lub|js|mjs|wasm)(?:[?#]|$)/i.test(url)) report('executable-fetch');
    }
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const url = literal(node.arguments?.[0]);
      if (url === undefined || !/^(?:\.{1,2}\/|\/(?!\/))[^\\?#\u0000-\u0020]+\.(?:js|mjs)$/.test(url)) report('uncontrolled-module-import');
    }
    if (name === 'importScripts') {
      for (const argument of node.arguments || []) {
        const value = unwrapped(argument);
        if (!ts.isCallExpression(value) || globalName(value.expression) !== 'createLastROWorkerScriptUrl'
          || !['lastro-resource-loader.js', 'ThreadEventHandler.js'].includes(literal(value.arguments[0]))) report('uncontrolled-worker-import');
      }
    }
  }
  if (violations.length) throw new Error(JSON.stringify(violations));
  return violations;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && /\.(?:[cm]?js)$/i.test(entry.name)) files.push(target);
  }
  return files;
}

if (process.argv[1]?.endsWith('audit-runtime-code.mjs')) {
  const target = process.argv[2];
  if (!target) { process.stderr.write('missing-target\n'); process.exitCode = 1; }
  else {
    const files = (await stat(target)).isDirectory() ? await walk(target) : [target];
    const violations = [];
    for (const file of files) violations.push(...auditRuntimeSource(await readFile(file, 'utf8'), file));
    if (violations.length) { process.stderr.write(JSON.stringify(violations) + '\n'); process.exitCode = 1; }
  }
}
