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
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'fe' && node.initializer && ts.isClassExpression(node.initializer)) {
      const load = node.initializer.members.find(member => member.name?.getText(file) === 'load');
      if (!load?.body) throw new Error('worker-anchor-map-load');
      const callbacks = [], failures = [];
      function findCallbacks(child) {
        if ((ts.isFunctionDeclaration(child) && ['i', 'a'].includes(child.name?.text)) || ts.isFunctionExpression(child)) callbacks.push(child);
        if (ts.isCallExpression(child) && child.expression.getText(file) === 'e.onload' && child.arguments.length === 2) failures.push(child);
        ts.forEachChild(child, findCallbacks);
      }
      findCallbacks(load.body);
      if (callbacks.length !== 4 || failures.length !== 3 || callbacks.filter(callback => callback.parameters.length === 1).length !== 3
        || callbacks.filter(callback => callback.parameters.length === 2).length !== 1) throw new Error('worker-anchor-map-callbacks');
      const edits = [];
      for (const callback of callbacks) {
        if (callback.parameters.length === 1) edits.push({ start: callback.parameters[0].end, end: callback.parameters[0].end, text: ',lastroError' });
        edits.push({ start: callback.body.getStart(file) + 1, end: callback.body.getStart(file) + 1, text: 'try{' });
        edits.push({ start: callback.body.end - 1, end: callback.body.end - 1, text: '}catch(error){e.onload(false,error instanceof Error?error.message:String(error));}' });
      }
      for (const failure of failures) {
        const argument = failure.arguments[1];
        edits.push({ start: argument.getStart(file), end: argument.getStart(file), text: 'lastroError||' });
      }
      let text = load.getText(file);
      const begin = load.getStart(file);
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        text = text.slice(0, edit.start - begin) + edit.text + text.slice(edit.end - begin);
      }
      target('map-load', load, text);
    }
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'CLIENT_INIT') {
      // IWA uses IndexedDB, not the legacy filesystem or DATA.INI/GRF scan.
      target('CLIENT_INIT', node, 'case"CLIENT_INIT":se.clean();postMessage({uid:e.uid,arguments:[0,null,e.data]});break;');
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const name of [...Object.keys(replacements), 'CLIENT_INIT', 'map-load']) {
    if (!targets.has(name)) throw new Error('worker-anchor-missing:' + name);
  }
  let output = source;
  for (const edit of [...targets.values()].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  output = replaceOnce(output,
    'case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;',
    'case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;case"SET_EXECUTABLE_MANIFEST":se.lastroExecutableManifest=LastROResources.snapshotPackageManifest(e.data?.files);break;');
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
    [
      '(() => {',
      '  const allowedWorkerScriptUrls = new Set([',
      '    new URL("lastro-resource-loader.js", self.location.href).href,',
      '    new URL("ThreadEventHandler.js", self.location.href).href,',
      '  ]);',
      '  const trustedTypes = globalThis.trustedTypes;',
      '  const policy = trustedTypes',
      '    ? trustedTypes.createPolicy("lastro-iwa-worker", {',
      '        createScriptURL: (value) => {',
      '          const candidate = new URL(value, self.location.href);',
      '          if (!allowedWorkerScriptUrls.has(candidate.href)) throw new TypeError("Unexpected worker URL");',
      '          return candidate.href;',
      '        },',
      '      })',
      '    : null;',
      '  function createLastROWorkerScriptUrl(relativePath) {',
      '    if (relativePath !== "lastro-resource-loader.js" && relativePath !== "ThreadEventHandler.js") {',
      '      throw new TypeError("Unexpected worker path");',
      '    }',
      '    const scriptUrl = new URL(relativePath, self.location.href);',
      '    if (!allowedWorkerScriptUrls.has(scriptUrl.href)) throw new TypeError("Unexpected worker URL");',
      '    return policy ? policy.createScriptURL(scriptUrl.href) : scriptUrl.href;',
      '  }',
      '  importScripts(',
      '    createLastROWorkerScriptUrl("lastro-resource-loader.js"),',
      '    createLastROWorkerScriptUrl("ThreadEventHandler.js")',
      '  );',
      '})();',
    ].join('\n'));
  return output;
}

async function main() {
  const [input = 'vendor/v2', output = 'generated/runtime'] = process.argv.slice(2);
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
