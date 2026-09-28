import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { TextDecoder } from 'node:util';

const repo = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_ROOT = path.join(repo, 'vendor/core');
const ALLOWED_ORIGIN = 'https://rodata.ltsd.ro';

export const PASSIVE_ASSETS = Object.freeze([
  Object.freeze({
    path: 'data/mp3nametable.txt',
    url: 'https://rodata.ltsd.ro/ro/client_re/data/mp3nametable.txt',
  }),
]);

function safeRelative(value) {
  if (!value || value.includes('\\') || path.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`invalid-path:${value}`);
  }
  return value;
}

function validateUrl(value) {
  const url = new URL(value);
  if (url.origin !== ALLOWED_ORIGIN || url.username || url.password || url.search || url.hash) {
    throw new Error(`unapproved-url:${value}`);
  }
  return url;
}

async function download(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`http-${response.status}:${url}`);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) throw new Error(`html-response:${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error(`empty-response:${url}`);
  const sample = new TextDecoder().decode(bytes.slice(0, 64)).trimStart().toLowerCase();
  if (sample.startsWith('<!doctype html') || sample.startsWith('<html')) throw new Error(`html-response:${url}`);
  return bytes;
}

export async function downloadPassiveAssets({
  root = DEFAULT_ROOT,
  assets = PASSIVE_ASSETS,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch-unavailable');
  const destinationRoot = path.resolve(root);
  for (const asset of assets) {
    if (!asset || typeof asset.path !== 'string' || typeof asset.url !== 'string') throw new Error('invalid-asset');
    const relative = safeRelative(asset.path);
    const url = validateUrl(asset.url);
    const bytes = await download(url, fetchImpl);
    const destination = path.join(destinationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  return assets.map(asset => asset.path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await downloadPassiveAssets();
    process.stdout.write(JSON.stringify({ files: PASSIVE_ASSETS.map(asset => asset.path) }) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
