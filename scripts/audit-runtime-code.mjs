import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

export function auditRuntimeSource(source, file = 'runtime.js') {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const violations = [];
  const executableElements = new Set();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isPropertyAccessExpression(node.initializer.expression)
      && node.initializer.expression.name.text === 'createElement'
      && node.initializer.arguments.length === 1
      && ts.isStringLiteralLike(node.initializer.arguments[0])
      && node.initializer.arguments[0].text.toLowerCase() === 'script'
      && ts.isIdentifier(node.name)) {
      executableElements.add(node.name.text);
      violations.push({ file, code: 'executable-script-element' });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'createElement'
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])
      && node.arguments[0].text.toLowerCase() === 'script') {
      violations.push({ file, code: 'executable-script-element' });
    }
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
      && node.left.name.text === 'src' && ts.isIdentifier(node.left.expression)
      && executableElements.has(node.left.expression.text)) {
      violations.push({ file, code: 'trusted-script-url-assignment' });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'setAttribute' && ts.isIdentifier(node.expression.expression)
      && executableElements.has(node.expression.expression.text) && node.arguments.length >= 2
      && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text.toLowerCase() === 'src') {
      violations.push({ file, code: 'trusted-script-url-assignment' });
    }
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text : '';
      if (name === 'eval' || name === 'Function') violations.push({ file, code: name });
      if (name === 'fetch') {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteralLike(first) || ts.isNoSubstitutionTemplateLiteral(first)) && /\.(?:lua|lub|js|mjs|wasm)(?:[?#]|$)/i.test(first.text)) violations.push({ file, code: 'executable-fetch' });
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') violations.push({ file, code: 'new-Function' });
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (/createElement\(\s*["']script["']\s*\)[\s\S]{0,300}https?:\/\//i.test(source)) violations.push({ file, code: 'remote-script' });
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
