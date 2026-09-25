import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

export function auditRuntimeSource(source, file = 'runtime.js') {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const violations = [];
  function visit(node) {
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
