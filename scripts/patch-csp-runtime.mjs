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
