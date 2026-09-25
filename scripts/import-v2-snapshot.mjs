import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import ts from 'typescript';
import { namespaceUris, sanitizeReviewedSource } from './sanitize-v2-source.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const staging = path.join(repo, '.staging');
const policy = JSON.parse(await readFile(new URL('../config/forbidden-source-patterns.json', import.meta.url), 'utf8'));
const executable = /\.(?:[cm]?js|wasm|lua|lub)$/i;
const textFile = /\.(?:[cm]?js|json|html?|css|lua|txt|ya?ml)$/i;

function fail(code, file) {
  // Report only reviewed diagnostic categories and file names, never source values.
  const error = new Error(JSON.stringify({ code, ...(file ? { file } : {}) }));
  error.name = 'ImportGateError';
  throw error;
}

function checkPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) fail('invalid-path');
}

async function inspectTree(root, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    checkPath(name);
    if (entry.isSymbolicLink()) fail('symlink', name);
    if (entry.isDirectory()) files.push(...await inspectTree(root, name));
    else if (entry.isFile()) files.push(name);
    else fail('unsupported-file', name);
  }
  return files.sort();
}

async function rejectSymlinkParents(target) {
  for (let current = target; ; current = path.dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) fail('symlink');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current === path.dirname(current)) return;
  }
}

function scanOrigins(source, file) {
  for (const match of source.matchAll(/(?:https?|wss?):\/\/[^\s"'`<>\\)\]}]+/gi)) {
    if (namespaceUris.has(match[0])) continue;
    let url;
    try { url = new URL(match[0]); } catch { fail('unapproved-origin', file); }
    if (!policy.allowedOrigins.includes(url.origin) || url.username || url.password) fail('unapproved-origin', file);
  }
}

function scanText(source, file) {
  if (policy.credentialMarkers.some(marker => source.includes(marker))) fail('credential', file);
  if (policy.privateProfileMarkers.some(marker => source.toLowerCase().includes(marker))) fail('private-profile', file);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(source)) fail('private-key', file);
  scanOrigins(source, file);

  if (/\.(?:[cm]?js|json)$/i.test(file)) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = new Set(node.properties.map(property => property.name?.text?.toLowerCase()));
        if (keys.has('username') && keys.has('password')) fail('credential', file);
      }
      // Inspect decoded literals too, so JS string escapes cannot hide origins or keys.
      if (ts.isStringLiteralLike(node)) {
        scanOrigins(node.text, file);
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(node.text)) fail('private-key', file);
        if (policy.privateProfileMarkers.some(marker => node.text.toLowerCase().includes(marker))) fail('private-profile', file);
        if (policy.credentialMarkers.some(marker => node.text.includes(marker))) fail('credential', file);
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  const markers = Object.fromEntries(policy.legacyTransportMarkers.map(marker => [marker, source.split(marker).length - 1]));
  if (file !== 'Online.js' && Object.values(markers).some(count => count > 0)) fail('legacy-transport', file);
  return markers;
}

async function importSnapshot() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({ args, options: {
    source: { type: 'string' }, allowlist: { type: 'string' }, out: { type: 'string' },
  } });
  if (!values.source || !path.isAbsolute(values.source)) fail('absolute-source-required');
  const source = path.resolve(values.source);
  const output = path.resolve(values.out ?? staging);
  if (output !== staging && !output.startsWith(staging + path.sep)) fail('staging-output-required');
  if (source === output || output.startsWith(source + path.sep) || source.startsWith(output + path.sep)) fail('overlapping-roots');
  await rejectSymlinkParents(source);
  await rejectSymlinkParents(output);
  const allowlist = JSON.parse(await readFile(values.allowlist ?? path.join(repo, 'config/v2-allowlist.json'), 'utf8'));
  if (!Array.isArray(allowlist.files) || !allowlist.files.length) fail('invalid-allowlist');
  allowlist.files.forEach(checkPath);
  if (new Set(allowlist.files).size !== allowlist.files.length) fail('duplicate-path');
  const names = await inspectTree(source);
  const allowed = new Set(allowlist.files);
  for (const name of allowed) if (!names.includes(name)) fail('missing', name);
  const buffered = new Map();
  const provenance = [];
  let legacyTransportMarkers = {};
  for (const name of names) {
    const excluded = /\.test\.mjs$/i.test(name) || /\.html?$/i.test(name)
      || policy.excludedConfigFiles.includes(name) || allowlist.excludedBuildTools?.includes(name);
    if (allowed.has(name) && excluded) fail('excluded-allowlist-entry', name);
    if (!allowed.has(name) && executable.test(name) && !excluded) fail('unexpected-executable', name);
    if (excluded) continue;
    let bytes = await readFile(path.join(source, name));
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    const expectedHash = allowlist.reviewedSha256?.[name];
    if (expectedHash && expectedHash !== sourceSha256) fail('source-hash-drift', name);
    if (expectedHash && /\.[cm]?js$/i.test(name)) {
      const sanitized = sanitizeReviewedSource(bytes.toString('utf8'), name, policy.allowedOrigins);
      bytes = Buffer.from(sanitized.source, 'utf8');
      provenance.push({ path: name, sourceSha256, changes: sanitized.changes });
    }
    if (textFile.test(name) && !/\.test\.mjs$/i.test(name) && !/\.html?$/i.test(name)
      && !allowlist.excludedBuildTools?.includes(name)) {
      const markers = scanText(bytes.toString('utf8'), name);
      if (name === 'Online.js') legacyTransportMarkers = markers;
    }
    if (allowed.has(name)) buffered.set(name, bytes);
  }
  const files = [...allowed].sort().map(name => {
    const bytes = buffered.get(name);
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  // No destination is touched before the entire source has passed inspection.
  const destination = path.join(output, 'v2');
  await rejectSymlinkParents(destination);
  try {
    const existing = await inspectTree(destination);
    if (existing.some(name => !allowed.has(name))) fail('stale-staging');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of files) {
    const target = path.join(destination, file.path);
    await rejectSymlinkParents(target);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffered.get(file.path));
  }
  const manifestPath = path.join(output, 'v2-manifest.json');
  await rejectSymlinkParents(manifestPath);
  await writeFile(manifestPath, JSON.stringify({ files, legacyTransportMarkers, provenance }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ files: files.length, bytes: files.reduce((sum, entry) => sum + entry.bytes, 0) }) + '\n');
}

try {
  await importSnapshot();
} catch (error) {
  process.stderr.write((error.name === 'ImportGateError' ? error.message : JSON.stringify({ code: 'import-failed' })) + '\n');
  process.exitCode = 1;
}
