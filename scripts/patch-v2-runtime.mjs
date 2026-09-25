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
  let output = source;
  output = replaceFunctionBody(output, 'defaultSocketFactory', '{\n\tif (typeof globalThis.LastRODirectSocketFactory !== "function") throw new Error("Direct TCP factory unavailable");\n\treturn globalThis.LastRODirectSocketFactory(host, port);\n}');
  output = replaceOnce(output, 'init_WebSocket();', '');
  output = replaceOnce(output, 'init_NodeSocket();', '');
  output = replaceOnce(output, 'if (!Configs.get("remoteClient") && !count && !window.electronAPI?.isElectron) {', 'if (!Configs.get("remoteClient") && !count) {');
  output = removeRegion(output, ['legacy transport', 'WebSocket']);
  output = removeRegion(output, ['NodeSocket']);
  output = output.replace(/\/\*\*(?:(?!\*\/)[\s\S])*?Default socket factory(?:(?!\*\/)[\s\S])*?\*\/\r?\nfunction defaultSocketFactory/, 'function defaultSocketFactory');
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
    anchors: ['defaultSocketFactory', 'init_WebSocket', 'init_NodeSocket', 'electronAPI', 'legacy transport regions'],
  };
  await writeFile(values.manifest, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ bytes: output.length, ...manifest }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
