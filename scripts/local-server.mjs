import { createLogger, createServer } from 'vite';
import { existsSync, readFileSync, statSync, appendFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { readdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { REQUIRED_HEADERS as headers } from './iwa-security.mjs';
import { isLocalRequest, requestPath, resolveStagedResource } from './dev-resource-security.mjs';

export const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SERVER_KIND = 'lastro-local-server-v1';
export const SERVER_PORT = 5173;
export const SERVER_STATUS_PATH = '/__lastro_local_server/status';
export const SERVER_DIRECTORY = path.join(SERVER_ROOT, '.local', 'local-server');
export const SERVER_STATE_PATH = path.join(SERVER_DIRECTORY, 'process.json');
export const SERVER_LOG_PATH = path.join(SERVER_DIRECTORY, 'server.log');
const executeFile = promisify(execFile);
const runtimeFiles = ['generated/runtime/Online.js', 'generated/runtime/LastROThreadEventHandler.js', 'generated/core/executable-assets.json'];
const readyCache = new Map();

export function runtimeReady(root = SERVER_ROOT) {
  if (!runtimeFiles.every(file => existsSync(path.join(root, file)))) return false;
  const filename = path.join(root, runtimeFiles[2]);
  try {
    const info = statSync(filename), key = `${info.mtimeMs}:${info.size}`;
    const cached = readyCache.get(filename);
    if (cached?.key === key) return cached.ready;
    const manifest = JSON.parse(readFileSync(filename, 'utf8'));
    const ready = Array.isArray(manifest.files) && manifest.files.length > 0;
    readyCache.set(filename, { key, ready }); return ready;
  } catch { return false; }
}

export async function runtimeNeedsPreparation(root = SERVER_ROOT) {
  if (!runtimeReady(root)) return true;
  let manifest;
  try { manifest = JSON.parse(readFileSync(path.join(root, runtimeFiles[2]), 'utf8')); }
  catch { return true; }
  if (!Array.isArray(manifest.files)) return true;
  for (const file of manifest.files) {
    const resolved = path.resolve(root, 'generated/core', file.path);
    if (!resolved.startsWith(path.join(root, 'generated/core') + path.sep)) throw new Error('Invalid staged resource path');
    try { await access(resolved); } catch { return true; }
  }
  const preparedAt = Math.min(...runtimeFiles.map(file => statSync(path.join(root, file)).mtimeMs));
  async function newer(directory, accept = () => true) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) { if (await newer(filename, accept)) return true; }
      else if (item.isFile() && accept(item.name) && statSync(filename).mtimeMs > preparedAt) return true;
    }
    return false;
  }
  for (const directory of ['vendor/v2', 'vendor/core', 'src/accounts', 'src/resources', 'src/runtime']) if (await newer(path.join(root, directory))) return true;
  if (statSync(path.join(root, 'config/core-asset-roots.json')).mtimeMs > preparedAt) return true;
  return newer(path.join(root, 'scripts'), name => /^(?:patch-|lastro-|prepare-runtime\.|import-core-assets\.)/.test(name) && /\.(?:mjs|json)$/.test(name));
}

export async function createLocalServer({ port = SERVER_PORT, instanceId = 'test', logger, ready = runtimeReady } = {}) {
  const startedAt = new Date().toISOString();
  const identity = { kind: SERVER_KIND, root: SERVER_ROOT, pid: process.pid, instanceId, startedAt };
  const server = await createServer({
    root: SERVER_ROOT,
    configFile: path.join(SERVER_ROOT, 'vite.config.ts'),
    clearScreen: false,
    logLevel: 'error',
    ...(logger ? { customLogger: logger } : {}),
    server: {
      host: '127.0.0.1', port, strictPort: true, hmr: false,
    },
    plugins: [{
      name: 'lastro-local-server-status', enforce: 'pre',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
          if (!isLocalRequest(request.headers.host, request.headers.origin)) {
            response.statusCode = 403; response.end('Forbidden request origin'); return;
          }
          let pathname;
          try { pathname = requestPath(request.url); }
          catch { response.statusCode = 400; response.end('Invalid request path'); return; }
          if (pathname === SERVER_STATUS_PATH) {
            for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ ...identity, ready: ready() })); return;
          }
          let resource, invalid = false;
          try { resource = resolveStagedResource(SERVER_ROOT, request.url); }
          catch { invalid = true; }
          if (!invalid && !resource) { next(); return; }
          if (!invalid && ready() && resource.exists) { next(); return; }
          for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
          response.statusCode = invalid ? 403 : ready() ? 404 : 503;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          if (response.statusCode === 503) response.setHeader('Retry-After', '2');
          response.end(JSON.stringify({ error: invalid ? 'Invalid resource path' : ready() ? 'Resource not found' : 'Client resources are being prepared' }));
        });
      },
    }],
  });
  try { await server.listen(); }
  catch (error) { await server.close(); throw error; }
  return server;
}

async function main() {
  const instanceId = process.argv[process.argv.indexOf('--managed') + 1];
  if (!process.argv.includes('--managed') || !/^[0-9a-f-]{36}$/.test(instanceId)) throw new Error('Use the local server launcher to start this service');
  process.chdir(SERVER_ROOT);
  mkdirSync(SERVER_DIRECTORY, { recursive: true });
  const log = message => appendFileSync(SERVER_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  const logger = createLogger('error', { allowClearScreen: false });
  for (const name of ['info', 'warn', 'warnOnce', 'error']) logger[name] = message => log(message);
  log('Starting local server');
  try {
    if (await runtimeNeedsPreparation()) {
      log('Preparing client resources');
      await executeFile(process.execPath, [path.join(SERVER_ROOT, 'scripts/prepare-runtime.mjs')], { cwd: SERVER_ROOT, windowsHide: true, maxBuffer: 1024 * 1024 });
    }
    const server = await createLocalServer({ instanceId, logger });
    log(`Ready: http://127.0.0.1:${SERVER_PORT}`);
    let closing = false;
    const close = async () => {
      if (closing) return; closing = true;
      await server.close(); process.exit(0);
    };
    process.on('SIGINT', close); process.on('SIGTERM', close);
    process.on('exit', () => {
      try { if (JSON.parse(readFileSync(SERVER_STATE_PATH, 'utf8')).instanceId === instanceId) unlinkSync(SERVER_STATE_PATH); } catch { /* State may already have been removed by the stop command. */ }
    });
  } catch (error) { log(error.stack || String(error)); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
}
