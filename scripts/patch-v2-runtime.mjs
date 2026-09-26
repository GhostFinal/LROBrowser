import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import ts from 'typescript';

const repo = fileURLToPath(new URL('../', import.meta.url));

function fail(code) {
  throw new Error(JSON.stringify({ code }));
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function replaceOnce(source, needle, replacement) {
  if (count(source, needle) !== 1) fail(`anchor:${needle}`);
  return source.replace(needle, replacement);
}

function removeRegion(source, names) {
  const pattern = new RegExp(`//#region src/Network/SocketHelpers/(?:${names.join('|')})\\.js\\r?\\n[\\s\\S]*?//#endregion`, 'g');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) fail(`region:${names.join('|')}`);
  const match = matches[0];
  return source.slice(0, match.index) + source.slice(match.index + match[0].length);
}

function replaceFunctionBody(source, name, body) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) fail(`function:${name}`);
  const node = matches[0];
  const start = node.body.getStart(file);
  return source.slice(0, start) + body + source.slice(node.body.end);
}

export function patchV2Runtime(source) {
  if (!source.startsWith('import ')) fail('anchor:runtime-imports');
  const normalizedSource = source.replace(/\r\n/g, '\n');
  let output = `import { decorateLastROLoginTemplate, decorateLastROLoginStyles, installLastROLogin } from "./lastro-account-login.mjs";\n${normalizedSource}`;
  output = output.replace(/\?build=[A-Za-z0-9._-]+/g, '');
  output = replaceOnce(output, '\troInitSpinner.add();\n\tPlugins.init();\n\tGameEngine.init();',
    '\troInitSpinner.add();\n\ttry {\n\t\tPlugins.init();\n\t\tGameEngine.init();\n\t} catch (error) {\n\t\troInitSpinner.remove();\n\t\tthrow error;\n\t}');
  output = replaceOnce(output, 'if (_source instanceof Worker) _source.addEventListener("message", Thread.receive, false);',
    'if (_source instanceof Worker) {\n\t\t\t\tconsole.info("[LastRO IWA] waiting for resource worker");\n\t\t\t\t_source.addEventListener("error", (event) => console.error("[LastRO IWA] resource worker failed", event.message));\n\t\t\t\t_source.addEventListener("message", Thread.receive, false);\n\t\t\t}');
  output = replaceOnce(output, '_thread_ready = true;', '_thread_ready = true;\n\t\t\t\t\t\tconsole.info("[LastRO IWA] resource worker ready; initializing renderer");');
  output = replaceOnce(output, 'savingFiles(files);', 'console.info("[LastRO IWA] initializing remote client resources");\n\t\t\tThread.send("CLIENT_INIT", { files: [], save: false }, (...args) => Client.onFilesLoaded(...args));');
  output = replaceFunctionBody(output, 'defaultSocketFactory', '{\n\tif (typeof globalThis.LastRODirectSocketFactory !== "function") throw new Error("Direct TCP factory unavailable");\n\treturn globalThis.LastRODirectSocketFactory(host, port);\n}');
  output = replaceOnce(output, 'init_WebSocket();', '');
  output = replaceOnce(output, 'init_NodeSocket();', '');
  output = replaceOnce(output, 'if (!Configs.get("remoteClient") && !count && !window.electronAPI?.isElectron) {', 'if (!Configs.get("remoteClient") && !count) {');
  for (const anchor of ['if (remoteClient) Thread.send("SET_HOST", remoteClient);', '\t\t\t\tThread.send("SET_HOST", remoteClient);']) {
    output = replaceOnce(output, anchor, anchor + '\n\t\t\tThread.send("SET_EXECUTABLE_MANIFEST", globalThis.LastROExecutableManifest);');
  }
  output = replaceOnce(output, 'var root = freeGlobal || freeSelf || Function("return this")();', 'var root = freeGlobal || freeSelf || globalThis;');
  output = replaceOnce(output, 'return Function(importsKeys, sourceURL + "return " + source).apply(undefined, importsValues);',
    'throw new Error("Dynamic templates are disabled in the IWA runtime");');
  output = removeRegion(output, ['legacy transport', 'WebSocket']);
  output = removeRegion(output, ['NodeSocket']);
  output = output.replace(/\/\*\*(?:(?!\*\/)[\s\S])*?Default socket factory(?:(?!\*\/)[\s\S])*?\*\/\r?\nfunction defaultSocketFactory/, 'function defaultSocketFactory');
  output = replaceOnce(output, 'new GUIComponent(name, enhanceWinLoginStyles(name, cssText))',
    'new GUIComponent(name, decorateLastROLoginStyles(name, enhanceWinLoginStyles(name, cssText)))');
  output = replaceOnce(output, 'const renderedHtmlText = enhanceWinLoginTemplate(name, htmlText);',
    'const renderedHtmlText = decorateLastROLoginTemplate(name, enhanceWinLoginTemplate(name, htmlText));');
  output = replaceOnce(output,
    '\t\tvoid 0;\n\t\tpopulateLoginServerButtons(root, Configs.get("loginServerProfiles", []), Configs.getServer?.().id || "lastro", (profile) => Component.onServerSelect(profile));',
    '\t\tinstallLastROLogin({ root, component: Component, configs: Configs });');
  output = replaceOnce(output, '\t\tconst pass = _inputPassword.value;\n\t\tapplyDebugLoginFields();',
    '\t\tconst pass = _inputPassword.value;\n\t\tconst beforeConnect = globalThis.LastROLoginBeforeConnect;\n\t\tif (typeof beforeConnect === "function" && beforeConnect(user, pass) === false) return false;\n\t\tapplyDebugLoginFields();');
  if (/new WebSocket|wss?:\/\/|socketProxy|electronAPI|NodeSocket/i.test(output)) fail('legacy-transport');
  return output;
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    input: { type: 'string' }, output: { type: 'string' }, manifest: { type: 'string' },
  } });
  if (!values.input || !values.output || !values.manifest || !path.isAbsolute(values.input)
    || !path.isAbsolute(values.output) || !path.isAbsolute(values.manifest)) fail('absolute-path-required');
  const input = await readFile(values.input);
  const output = Buffer.from(patchV2Runtime(input.toString('utf8')));
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, output);
  const manifest = {
    source: path.relative(repo, values.input),
    output: path.relative(repo, values.output),
    preSha256: createHash('sha256').update(input).digest('hex'),
    postSha256: createHash('sha256').update(output).digest('hex'),
    anchors: ['defaultSocketFactory', 'init_WebSocket', 'init_NodeSocket', 'electronAPI', 'legacy transport regions', 'Client.init resource manifest', 'LoginEngine.init resource manifest'],
  };
  await writeFile(values.manifest, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ bytes: output.length, ...manifest }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
