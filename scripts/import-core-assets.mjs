import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import { patchGuildEmblemRequestCallbacks, patchTrustedTypesDomWrites } from './patch-v2-runtime.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../config/core-asset-roots.json', import.meta.url), 'utf8'));

function fail(code, file) {
  throw new Error(JSON.stringify({ code, ...(file ? { file } : {}) }));
}

function requireAbsolute(value, flag) {
  if (!value || !path.isAbsolute(value)) fail(`${flag}-absolute-required`);
  return path.resolve(value);
}

async function ensureSafeRoot(root, flag) {
  const info = await lstat(root).catch(() => null);
  if (!info?.isDirectory()) fail(`${flag}-root-invalid`);
}

function safeRelative(value) {
  if (!value || value.includes('\\') || path.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) fail('invalid-path');
  return value;
}

async function filesUnder(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    safeRelative(name);
    if (entry.isSymbolicLink()) fail('symlink', name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, name));
    else if (entry.isFile()) files.push(name);
    else fail('unsupported-file', name);
  }
  return files.sort();
}

function kindFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.lua') return 'lua';
  if (extension === '.lub') return 'lub';
  if (extension === '.wasm') return 'wasm';
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'runtime';
  fail('unsupported-executable', file);
}

async function addFile(entries, destinations, source, destination, kind, output) {
  safeRelative(destination);
  if (destinations.has(destination)) fail('duplicate-destination', destination);
  destinations.add(destination);
  let bytes = await readFile(source);
  if (kind === 'runtime' && /runtime\/(?:Online\.js|[^/]+\.mjs)$/.test(destination)
    && path.basename(destination) !== 'lastro-trusted-dom.mjs') {
    let text = bytes.toString('utf8');
    if (path.basename(destination) === 'lastro-guild-emblem-request.mjs') {
      text = patchGuildEmblemRequestCallbacks(text);
    }
    bytes = Buffer.from(patchTrustedTypesDomWrites(text));
  }
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  entries.push({ path: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), kind });
}

export async function importCoreAssets({ clientRoot, roSourceRoot, runtimePath, output }) {
  const client = requireAbsolute(clientRoot, 'client-root');
  const source = requireAbsolute(roSourceRoot, 'ro-source-root');
  const destinationRoot = path.resolve(output ?? path.join(repo, '.staging/core'));
  await ensureSafeRoot(client, 'client');
  await ensureSafeRoot(source, 'ro-source');
  const entries = [];
  const destinations = new Set();
  const luaRoot = path.join(client, config.luaRelativeRoot);
  await ensureSafeRoot(luaRoot, 'lua');
  for (const relative of await filesUnder(luaRoot)) {
    if (!/\.(?:lua|lub)$/i.test(relative)) continue;
    const kind = kindFor(relative);
    await addFile(entries, destinations, path.join(luaRoot, relative), `${config.luaRelativeRoot}/${relative}`, kind, destinationRoot);
  }
  const systemRoot = path.join(client, 'System');
  for (const relative of config.systemFiles) {
    safeRelative(relative);
    await addFile(entries, destinations, path.join(systemRoot, relative), `System/${relative}`, 'lua', destinationRoot);
  }
  if (runtimePath) {
    const runtime = requireAbsolute(runtimePath, 'runtime');
    const runtimeBytes = await readFile(runtime);
    const text = runtimeBytes.toString('utf8');
    const wasmMatches = [...text.matchAll(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/g)];
    if (wasmMatches.length > 1) fail('duplicate-wasm');
    if (wasmMatches.length === 1) {
      const wasmPath = path.join(destinationRoot, 'wasm/liblua5.1.wasm');
      const wasmBytes = Buffer.from(wasmMatches[0][1], 'base64');
      await mkdir(path.dirname(wasmPath), { recursive: true });
      await writeFile(wasmPath, wasmBytes);
      entries.push({ path: 'wasm/liblua5.1.wasm', bytes: wasmBytes.length, sha256: createHash('sha256').update(wasmBytes).digest('hex'), kind: 'wasm' });
    }
    await addFile(entries, destinations, runtime, 'runtime/Online.js', 'runtime', destinationRoot);
  }
  for (const relative of config.runtimeFiles ?? []) {
    safeRelative(relative);
    await addFile(entries, destinations, path.join(repo, relative), `runtime/${path.basename(relative)}`, 'runtime', destinationRoot);
  }
  const stagedRuntime = path.join(repo, '.staging/v2');
  try {
    for (const relative of await filesUnder(stagedRuntime)) {
      if (relative === 'Online.js' || !/\.(?:[cm]?js)$/i.test(relative)) continue;
      const patchedWorker = runtimePath && ['ThreadEventHandler.js', 'LastROThreadEventHandler.js'].includes(relative);
      const inputRoot = patchedWorker ? path.dirname(runtimePath) : stagedRuntime;
      await addFile(entries, destinations, path.join(inputRoot, relative), `runtime/${path.basename(relative)}`, 'runtime', destinationRoot);
    }
  } catch (error) {
    if (error.code !== 'ENOENT' || runtimePath) throw error;
  }
  for (const name of ['world-data.json', 'mob-data.json']) {
    const generated = path.join(destinationRoot, 'data/world', name);
    try {
      const bytes = await readFile(generated);
      const destination = `data/world/${name}`;
      if (!destinations.has(destination)) entries.push({ path: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), kind: 'data-json' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (runtimePath) {
    await addFile(entries, destinations, path.join(path.dirname(runtimePath), 'lastro-resource-loader.js'),
      'runtime/lastro-resource-loader.js', 'runtime', destinationRoot);
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifest = { files: entries };
  await mkdir(destinationRoot, { recursive: true });
  await writeFile(path.join(destinationRoot, 'executable-assets.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    'client-root': { type: 'string' }, 'ro-source-root': { type: 'string' }, runtime: { type: 'string' }, output: { type: 'string' },
  } });
  if (!values['client-root'] || !values['ro-source-root']) fail('explicit-roots-required');
  const manifest = await importCoreAssets({ clientRoot: values['client-root'], roSourceRoot: values['ro-source-root'],
    runtimePath: values.runtime ?? path.join(repo, '.staging/runtime/Online.js'), output: values.output });
  process.stdout.write(JSON.stringify({ files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
