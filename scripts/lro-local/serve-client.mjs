import { REQUIRED_HEADERS } from '../iwa-security.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createMarketReader } from './local-market.mjs';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const port = Number(process.env.LRO_TEST_PORT || 4178);
const readMarket = createMarketReader();
const manifestPath = '/.well-known/manifest.webmanifest';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
await stat(path.join(root, 'index.html'));
await stat(path.join(root, 'runtime/lro-assistant.mjs'));
const server = http.createServer(async (request, response) => {
  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) response.setHeader(name, value);
  response.setHeader('Cache-Control', 'no-store');
  const route = new URL(request.url, 'http://127.0.0.1');
  if (route.pathname === '/__lro_market/search') {
    await readMarket(request, response, route); return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
    let body = await readFile(file);
    if (pathname === '/runtime/lro-market-api.mjs') {
      // The IWA development proxy serves this endpoint on the app's own origin.
      // Production source/bundles keep the direct HTTPS API implementation.
      body = Buffer.from(body.toString('utf8').replace(
        "const ENDPOINT='https://ltsd.ro/api/v1/market/search';",
        "const ENDPOINT='/__lro_market/search';"));
    }
    if (pathname === manifestPath) {
      // Only this local server's response is customized. Source, dist and the
      // author's published app are unchanged; Chrome assigns a dev app identity.
      const manifest = JSON.parse(body.toString('utf8'));
      manifest.name = 'LRO助手 · 本地测试客户端';
      manifest.short_name = 'LRO助手本地测试';
      manifest.start_url = '/?server=lastro-2x&assistant=1';
      body = Buffer.from(JSON.stringify(manifest));
    }
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.writeHead(200);response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404);response.end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
if (process.argv.includes('--check')) {
  try {
    const manifest = await (await fetch(`http://127.0.0.1:${port}${manifestPath}`)).json();
    assert.equal(manifest.start_url, '/?server=lastro-2x&assistant=1');
    const module = await fetch(`http://127.0.0.1:${port}/runtime/lro-assistant.mjs`);
    assert.equal(module.status,200);
    assert.equal(module.headers.get('cross-origin-embedder-policy'),'require-corp');
    assert.match(await module.text(),/installLroAssistant/);
    const invalid = await fetch(`http://127.0.0.1:${port}/%2e%2e%5cpackage.json`);
    assert.equal(invalid.status,403);
    console.log('PASS: local entry, auto-enabled assistant, IWA headers and path boundary.');
  } finally {await new Promise(resolve=>server.close(resolve));}
} else {
  console.log('\nLRO assistant LOCAL TEST client');
  console.log(`Chrome Dev Mode Proxy URL: http://127.0.0.1:${port}`);
  console.log('Keep this window open while testing. Close it to stop.');
  console.log('Install from chrome://web-app-internals, not a normal browser tab.');
  console.log('This server does not submit Git commits or upload your source code.\n');
}
