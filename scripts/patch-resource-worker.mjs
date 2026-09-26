import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import ts from 'typescript';
import { build } from 'esbuild';
import { patchElectronRequireFallbacks } from './patch-csp-runtime.mjs';

function replaceOnce(source, needle, replacement) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error('worker-anchor:' + count);
  return source.replace(needle, replacement);
}

export function patchResourceWorker(source) {
  const file = ts.createSourceFile('ThreadEventHandler.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const targets = new Map();
  const replacements = {
    get: 'static get(filename, callback) { this.getHTTP(filename, callback); }',
    getHTTP: 'static getHTTP() { throw new Error("IWA resource loader unavailable"); }',
    getBatchHTTP: 'static getBatchHTTP(filename, callback) { this.getHTTP(filename, callback); }',
    search: 'static search() { throw new Error("Remote directory search is not supported by IWA resources"); }',
  };
  function target(key, node, text) {
    if (targets.has(key)) throw new Error('worker-anchor-duplicate:' + key);
    targets.set(key, { start: node.getStart(file), end: node.end, text });
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'se' && node.initializer && ts.isClassExpression(node.initializer)) {
      for (const member of node.initializer.members) {
        const name = member.name?.getText(file);
        if (Object.hasOwn(replacements, name)) target(name, member, replacements[name]);
      }
    }
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'CLIENT_INIT') {
      // IWA uses IndexedDB, not the legacy filesystem or DATA.INI/GRF scan.
      target('CLIENT_INIT', node, 'case"CLIENT_INIT":se.clean();postMessage({uid:e.uid,arguments:[0,null,e.data]});break;');
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const name of [...Object.keys(replacements), 'CLIENT_INIT']) {
    if (!targets.has(name)) throw new Error('worker-anchor-missing:' + name);
  }
  let output = source;
  for (const edit of [...targets.values()].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  output = replaceOnce(output,
    'case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;',
    'case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;case"SET_EXECUTABLE_MANIFEST":se.lastroExecutableManifest=e.data.files;break;');
  return patchElectronRequireFallbacks(output);
}

export function patchResourceHandler(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  const start = '  se.getHTTP = function getLastROHTTP(filename, callback) {';
  const end = '\n  };\n})();';
  if (normalized.split(start).length !== 2 || normalized.split(end).length !== 2) throw new Error('handler-anchor');
  const begin = normalized.indexOf(start);
  const finish = normalized.indexOf(end, begin);
  if (finish < begin) throw new Error('handler-anchor-order');
  let output = normalized.slice(0, begin) + [
    '  const loadResource = LastROResources.createRuntimeResourceLoader({',
    '    packageBaseUrl: new URL("../core/", self.location.href).href,',
    '    getManifest: () => se.lastroExecutableManifest,',
    '    getCharset: () => se.resourcePathCharset,',
    '  });',
    '  se.getHTTP = function getLastROHTTP(filename, callback) {',
    '    loadResource(filename).then(',
    '      (bytes) => callback(bytes),',
    '      (error) => callback(null, error.message)',
    '    );',
    '  };',
  ].join('\n') + normalized.slice(finish + '\n  };'.length);
  output = replaceOnce(output,
    'importScripts("lastro-resource-path.js?build=20260923-v2-skill-icons-1","ThreadEventHandler.js");',
    'importScripts("lastro-resource-loader.js", "ThreadEventHandler.js");');
  return output;
}

async function main() {
  const [input = '.staging/v2', output = '.staging/runtime'] = process.argv.slice(2);
  const worker = patchResourceWorker(await readFile(path.join(input, 'ThreadEventHandler.js'), 'utf8'));
  const handler = patchResourceHandler(await readFile(path.join(input, 'LastROThreadEventHandler.js'), 'utf8'));
  await mkdir(output, { recursive: true });
  await build({ entryPoints: ['src/resources/runtime-resource-loader.ts'], bundle: true, format: 'iife',
    globalName: 'LastROResources', target: 'es2022', outfile: path.join(output, 'lastro-resource-loader.js') });
  await writeFile(path.join(output, 'ThreadEventHandler.js'), worker);
  await writeFile(path.join(output, 'LastROThreadEventHandler.js'), handler);
  process.stdout.write(JSON.stringify({ output, files: 3 }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
