import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditRuntimeSource } from './audit-runtime-code.mjs';

const ALLOWED_ORIGINS = new Set(['https://game.lastro.cn', 'https://rodata.ltsd.ro']);
const NON_RESOURCE_ORIGINS = new Set(['http://www.w3.org']);
const REQUIRED_HEADERS = {
  'Content-Security-Policy': "script-src 'self' 'wasm-unsafe-eval'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const REMOTE_EXECUTABLE = /https?:\/\/[^\s"'`]+\.(?:js|mjs|cjs|wasm|lua|lub)(?:[?#]|$)/i;
const PROHIBITED_TEXT = [
  ['socket-proxy', /socketProxy/i],
  ['electron', /electronAPI|NodeSocket/i],
  ['personal-credentials', /quickLoginAccounts|xkore|lastro-v2-config|(?:username|password)\s*:\s*['"][^'"]+['"]/i],
  ['private-key', /-----BEGIN [^-]*PRIVATE KEY-----|BEGIN OPENSSH PRIVATE KEY/i],
  ['absolute-local-path', /(?:\/home\/parker(?:\/|$)|[A-Za-z]:\\Users\\)/],
];

async function walk(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  await visit(root);
  return files.sort();
}

function readManifestJson(contents, name) {
  try { return JSON.parse(contents); } catch (error) { throw new Error(`${name}: invalid JSON (${error.message})`); }
}

function validateProtocolHandlers(manifest) {
  if (!('protocol_handlers' in manifest)) return;
  if (!Array.isArray(manifest.protocol_handlers) || manifest.protocol_handlers.some((handler) => (
    !handler || typeof handler.protocol !== 'string' || !/^web\+[a-z]+$/.test(handler.protocol)
    || typeof handler.url !== 'string' || !handler.url.includes('%s')
  ))) throw new Error('invalid protocol handler');
}

function originReferences(source) {
  const origins = new Set();
  for (const match of source.matchAll(/https?:\/\/[^\s"'`<>)]*/gi)) {
    try { origins.add(new globalThis.URL(match[0]).origin); } catch { /* ignored malformed fragments are handled by the source audit */ }
  }
  return [...origins].sort();
}

export async function auditDist(distDirectory, reportPath = path.resolve('release/audit-report.json'), options = {}) {
  const dist = path.resolve(distDirectory);
  const files = await walk(dist);
  const relativeFiles = files.map((file) => path.relative(dist, file).replaceAll(path.sep, '/'));
  const manifestPath = path.join(dist, '.well-known/manifest.webmanifest');
  if (!relativeFiles.includes('.well-known/manifest.webmanifest')) throw new Error('missing IWA manifest');
  const manifest = readManifestJson(await readFile(manifestPath, 'utf8'), 'IWA manifest');
  validateProtocolHandlers(manifest);
  if ('update_manifest_url' in manifest) {
    if (!options.allowUpdateManifest && process.env.IWA_ALLOW_UPDATE_MANIFEST !== '1') throw new Error('Phase A manifest must omit update_manifest_url');
    try { const updateUrl = new globalThis.URL(manifest.update_manifest_url); if (updateUrl.protocol !== 'https:') throw new Error('update_manifest_url must use HTTPS'); } catch { throw new Error('invalid update_manifest_url'); }
  }
  const coreManifestRelative = 'core/executable-assets.json';
  if (!relativeFiles.includes(coreManifestRelative)) throw new Error('missing executable asset manifest');
  const coreManifest = readManifestJson(await readFile(path.join(dist, coreManifestRelative), 'utf8'), 'core executable manifest');
  if (!Array.isArray(coreManifest.files)) throw new Error('core executable manifest has no files array');
  for (const entry of coreManifest.files) {
    if (!entry || typeof entry.path !== 'string' || !relativeFiles.includes(`core/${entry.path}`)) {
      throw new Error(`missing executable asset: ${entry?.path ?? '<invalid>'}`);
    }
  }
  if (relativeFiles.some((file) => file.endsWith('.map'))) throw new Error('source maps are not allowed in the IWA bundle');

  const originSet = new Set();
  const prohibitedResults = [];
  const bytesByCategory = {};
  let totalBytes = 0;
  for (const file of files) {
    const relative = path.relative(dist, file).replaceAll(path.sep, '/');
    const bytes = await readFile(file);
    totalBytes += bytes.byteLength;
    const category = relative.startsWith('core/') ? 'core' : relative.startsWith('runtime/') ? 'runtime' : 'app';
    bytesByCategory[category] = (bytesByCategory[category] ?? 0) + bytes.byteLength;
    if (!/\.(?:js|mjs|cjs|html|json|css|webmanifest)$/i.test(relative)) continue;
    const source = bytes.toString('utf8');
    if (relative !== '.well-known/manifest.webmanifest') {
      for (const origin of originReferences(source)) originSet.add(origin);
    }
    for (const [name, pattern] of PROHIBITED_TEXT) {
      if (pattern.test(source)) prohibitedResults.push({ file: relative, name });
    }
    if (REMOTE_EXECUTABLE.test(source)) prohibitedResults.push({ file: relative, name: 'remote-executable' });
    if (/\.(?:js|mjs|cjs)$/i.test(relative)) {
      try { auditRuntimeSource(source, relative); }
      catch (error) { throw new Error(`prohibited bundle content: ${error.message}`); }
    }
  }
  const unapprovedOrigins = [...originSet].filter((origin) => !ALLOWED_ORIGINS.has(origin) && !NON_RESOURCE_ORIGINS.has(origin));
  if (unapprovedOrigins.length) throw new Error(`unapproved remote origins: ${unapprovedOrigins.join(', ')}`);
  if (prohibitedResults.length) throw new Error(`prohibited bundle content: ${prohibitedResults.map((item) => `${item.name}@${item.file}`).join(', ')}`);

  await mkdir(path.dirname(reportPath), { recursive: true });
  const report = {
    bundleVersion: manifest.version,
    fileCount: files.length,
    totalBytes,
    bytesByCategory,
    externalOrigins: [...originSet].filter((origin) => ALLOWED_ORIGINS.has(origin)),
    coreManifestSummary: { fileCount: coreManifest.files.length, packagedBytes: coreManifest.bytes },
    prohibitedPatternResults: [],
    requiredHeaders: REQUIRED_HEADERS,
    sha256: createHash('sha256').update(files.map((file) => path.relative(dist, file)).join('\n')).digest('hex'),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? 'dist';
  const report = await auditDist(dist, process.argv[3] ?? path.resolve('release/audit-report.json'));
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

export { REQUIRED_HEADERS };
