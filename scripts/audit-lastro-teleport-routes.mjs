import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import ts from 'typescript';
import { PARADISE_GROUP_QUICK_ROUTE, QUICK_TELEPORT_CAVE_ROUTES } from '../vendor/v2/lastro-quick-teleport-catalog.mjs';
import { buildPrivateAirshipRequest } from '../vendor/v2/lastro-v1-migration.mjs';

const roots = ['https://game.lastro.cn/ro/client_re/', 'https://rodata.ltsd.ro/ro/client_re/'];
const origins = new Set(roots.map(root => new URL(root).origin));
const mapping = { guide: 'npc', train: 'train', makeMonzy: 'money', challenge: 'challenge', dungeons: 'instance', mvp: 'boss' };

// The public catalog is parsed as data, never evaluated as JavaScript.
function literal(node, symbols = {}) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => literal(item, symbols));
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -literal(node.operand, symbols);
  if (ts.isIdentifier(node) && Object.hasOwn(symbols, node.text)) return symbols[node.text];
  if (ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze' && node.arguments.length === 1) return literal(node.arguments[0], symbols);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.flatMap(property => {
    if (ts.isSpreadAssignment(property)) return Object.entries(literal(property.expression, symbols));
    if (!ts.isPropertyAssignment(property)) throw new Error('Unsupported catalog property');
    const name = ts.isComputedPropertyName(property.name) ? literal(property.name.expression, symbols) : property.name.text;
    if (name === undefined) throw new Error('Unsupported catalog key');
    return [[String(name), literal(property.initializer, symbols)]];
  }));
  throw new Error('Catalog contains executable or unsupported data');
}

export function parseOfficialTeleportCatalog(source) {
  const ast = ts.createSourceFile('logsTable.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'logsTable' && node.initializer) matches.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (matches.length !== 1) throw new Error('Expected one public logsTable data declaration');
  const profiles = literal(matches[0]);
  return Object.fromEntries(Object.entries(profiles).map(([profile, categories]) => [profile,
    Object.fromEntries(Object.entries(categories).map(([category, entries]) => [mapping[category] || category, entries]))]));
}

export function parseOfficialTeleportRuntimeEvidence(source) {
  const ast = ts.createSourceFile('official-online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let quest, packet;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'define' && node.arguments[0]?.text === 'UI/Components/Quest/Quest') quest = node.getText(ast);
    if (ts.isBinaryExpression(node) && node.left.getText(ast).endsWith('.CZ.PRIVATE_AIRSHIP_REQUEST.prototype.build')) packet = node.right.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const assignment = source.match(/(\w+)=\w+\.get\(["']ClientVer["']\);(\w+)\.nid=\1/);
  return {
    sha256: createHash('sha256').update(source).digest('hex'),
    catalogueSelector: assignment ? 'ClientVer' : null,
    catalogueSelectorExcerpt: assignment?.[0] || null,
    outsetPoint: Boolean(quest && /\.mapname=\w+\.outset\[0\]/.test(quest) && /\.x=\w+\.outset\[1\]/.test(quest) && /\.y=\w+\.outset\[2\]/.test(quest)),
    type: quest && /\.type=1[,;]/.test(quest) ? 1 : null,
    itemid: quest && /\.itemid=14527[,;]/.test(quest) ? 14527 : null,
    packetId: packet?.includes('writeShort(2633)') ? 2633 : null,
    packetBytesForCurrentVersion: packet && /new \w+\(34\)/.test(packet) && packet.includes('writeBinaryString(this.mapname,16)') ? 34 : null,
  };
}

export function teleportAuditProfiles(catalogs) {
  return [
    { id: 'lastro-3x', clientVer: 3, lastroNid: 3 },
    { id: 'lastro-2x', clientVer: 5, lastroNid: 5 },
    { id: 'lastro-app', clientVer: 5, lastroNid: 6 },
  ].map(profile => ({ ...profile, sourceCatalogProfile: String(profile.clientVer), catalogueSelector: 'clientVer', orderIsolationKey: 'lastroNid', catalogRows: Object.values(catalogs[String(profile.clientVer)] || {}).reduce((count, rows) => count + Object.keys(rows).length, 0) }));
}

export function parseTeleportResourceAliases(bytes) {
  // All audited map filenames are ASCII; this preserves those exact bytes.
  const text = Buffer.from(bytes).toString('latin1');
  const elements = ('\n' + text).replace(/\n(\/\/[^\n]+)/g, '').split('#');
  const aliases = Object.create(null);
  for (let index = 0; index + 1 < elements.length; index += 2) aliases[elements[index].trim()] = elements[index + 1].trim();
  return aliases;
}

export function auditTeleportResourceAliases(assets, aliases) {
  const resources = Object.values(assets).flatMap(entry => [entry.rsw, entry.gat, entry.gnd]).filter(entry => entry?.header && entry.url);
  const lookup = filename => resources.find(entry => decodeURIComponent(new URL(entry.url).pathname).endsWith('/data/' + filename.replace(/\\/g, '/')));
  const checks = [], resolvedAssets = {};
  const resolve = key => Object.hasOwn(aliases, key) ? aliases[key] : key;
  for (const [map, entry] of Object.entries(assets)) {
    if (map === 'prontera_a') continue; // Diagnostic candidate; not a catalog destination.
    const rswKey = map + '.rsw', rswResolved = resolve(rswKey), rsw = lookup(rswResolved);
    const gatKey = rsw?.header.altitude || entry.rsw?.header?.altitude;
    const gndKey = rsw?.header.ground || entry.rsw?.header?.ground;
    resolvedAssets[map] = {};
    for (const [role, key] of [['rsw', rswKey], ['gat', gatKey], ['gnd', gndKey]]) {
      const resolved = key ? resolve(key) : null, resource = resolved ? lookup(resolved) : null;
      checks.push({ map, role, key: key || null, aliasPresent: key ? Object.hasOwn(aliases, key) : false, resolved, changed: key !== resolved, verifiedFromCachedHeader: Boolean(resource), resourceUrl: resource?.url || null });
      resolvedAssets[map][role] = resource || { error: 'Alias target is not present in verified resource evidence', filename: resolved };
    }
  }
  return { checks, aliasHits: checks.filter(check => check.aliasPresent).length, changedKeys: checks.filter(check => check.changed).length, unverifiedKeys: checks.filter(check => !check.verifiedFromCachedHeader).length, resolvedAssets };
}

export function parseTeleportMapHeader(extension, bytes) {
  const data = Buffer.from(bytes);
  const magic = data.subarray(0, 4).toString('ascii');
  const expected = { rsw: 'GRSW', gat: 'GRAT', gnd: 'GRGN' }[extension];
  if (!expected || magic !== expected || data.length < 14) throw new Error('Invalid ' + extension + ' map header');
  const result = { magic, version: `${data[4]}.${data[5]}` };
  if (extension === 'rsw') {
    // Same version-dependent header offsets as the pinned native RSW loader.
    const version = data[4] + data[5] / 10;
    const offset = 6 + (version >= 2.5 ? 4 : 0) + (version >= 2.2 ? 1 : 0);
    if (data.length < offset + 120) throw new Error('Truncated RSW filenames');
    const filename = start => data.subarray(start, start + 40).toString('ascii').split('\0')[0];
    result.ground = filename(offset + 40);
    result.altitude = filename(offset + 80);
    if (!/^[a-zA-Z0-9_@-]+\.gnd$/i.test(result.ground) || !/^[a-zA-Z0-9_@-]+\.gat$/i.test(result.altitude)) throw new Error('Invalid RSW map dependency filenames');
  } else {
    result.width = data.readUInt32LE(6); result.height = data.readUInt32LE(10);
    if (!result.width || !result.height || result.width > 8192 || result.height > 8192) throw new Error('Invalid map dimensions');
  }
  return result;
}

export function auditTeleportRoute(route, mapAssets) {
  const issues = [], points = [];
  const outset = route?.outset;
  const path = route?.path;
  if (!Array.isArray(outset) || outset.length < 3) issues.push({ code: 'missing-outset', severity: 'error' });
  else points.push({ role: 'outset', point: outset });
  if (!Array.isArray(path) || !path.length) issues.push({ code: 'missing-path', severity: 'error' });
  else path.forEach((point, index) => points.push({ role: `path[${index}]`, point }));
  for (const { role, point } of points) {
    if (!Array.isArray(point) || point.length < 3 || typeof point[0] !== 'string' || !/^[a-z0-9_]{1,16}$/.test(point[0])) {
      issues.push({ code: 'invalid-map-or-point', severity: 'error', role, point }); continue;
    }
    const [map, x, y] = point;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 65535 || y > 65535) {
      issues.push({ code: 'invalid-coordinate', severity: 'error', role, point }); continue;
    }
    const assets = mapAssets[map];
    if (!assets || !assets.gat?.header || !assets.rsw?.header || !assets.gnd?.header) {
      issues.push({ code: 'unverified-map-assets', severity: 'error', role, map }); continue;
    }
    const { width, height } = assets.gat.header;
    if (x >= width || y >= height) issues.push({ code: 'coordinate-out-of-bounds', severity: 'error', role, point, dimensions: [width, height] });
  }
  if (!Array.isArray(route?.position) && route?.position !== undefined) issues.push({ code: 'invalid-exclusion-list', severity: 'error' });
  return { result: issues.some(issue => issue.severity === 'error') ? 'unavailable-or-unverified' : 'verified-passive-assets-and-bounds', issues };
}

async function prefix(url, size = 256) {
  if (!origins.has(new URL(url).origin)) throw new Error('Unapproved resource origin');
  const response = await globalThis.fetch(url, { headers: { Range: `bytes=0-${size - 1}` }, signal: globalThis.AbortSignal.timeout(10000), redirect: 'error' });
  const result = { url: String(url), status: response.status, contentLength: response.headers.get('content-length'), contentRange: response.headers.get('content-range') };
  if (!response.ok) { await response.body?.cancel(); return result; }
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (length < size) {
      const part = await reader.read(); if (part.done) break;
      const chunk = part.value.subarray(0, size - length); chunks.push(chunk); length += chunk.length;
    }
  } finally { await reader.cancel(); }
  return { ...result, bytes: Buffer.concat(chunks), bytesRead: length };
}

async function probe(filename, extension) {
  const attempts = [];
  for (const root of roots) {
    try {
      const response = await prefix(new URL('data/' + filename, root));
      const { bytes, ...metadata } = response;
      if (!bytes) { attempts.push(metadata); continue; }
      try { return { ...metadata, header: parseTeleportMapHeader(extension, bytes), attempts }; }
      catch (error) { attempts.push({ ...metadata, error: error.message }); }
    } catch (error) { attempts.push({ url: new URL('data/' + filename, root).href, error: error.message }); }
  }
  return { filename, attempts, error: 'No valid public map resource' };
}

async function inspectMap(map, world) {
  const rsw = await probe(map + '.rsw', 'rsw');
  const [gat, gnd] = await Promise.all([probe(rsw.header?.altitude || map + '.gat', 'gat'), probe(rsw.header?.ground || map + '.gnd', 'gnd')]);
  return { map, worldMetadata: world[map] ? { name: world[map].name, coordinate: world[map].coordinate } : null, rsw, gat, gnd };
}

function oldInlineCatalog(runtime) {
  const ast = ts.createSourceFile('Online.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), matches = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'LastROTools._defaultQuickRoutes') matches.push(node.right);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (matches.length !== 1) throw new Error('Expected one old quick-route catalog');
  return literal(matches[0], { PARADISE_GROUP_QUICK_ROUTE, QUICK_TELEPORT_CAVE_ROUTES });
}

export async function auditLastroTeleportRoutes({ reuseResources = false } = {}) {
  const imported = JSON.parse(await readFile('scripts/lastro-teleport-routes.json', 'utf8'));
  const world = JSON.parse(await readFile('vendor/core/data/world/world-data.json', 'utf8'));
  const runtime = await readFile('vendor/v2/Online.js', 'utf8');
  const legacy = oldInlineCatalog(runtime);
  const rows = [];
  for (const [profile, categories] of Object.entries(imported.profiles)) for (const [category, entries] of Object.entries(categories)) {
    for (const [id, route] of Object.entries(entries)) rows.push({ source: 'imported-official', profile, category, id, ...route });
  }
  for (const [category, entries] of Object.entries(legacy)) for (const [id, route] of Object.entries(entries)) rows.push({ source: 'legacy-fallback', profile: '3/5/6 fallback only', category, id, ...route });
  const maps = new Set(['prontera', 'prontera_a']);
  for (const row of rows) for (const point of [row.outset, ...(row.path || [])]) if (Array.isArray(point) && typeof point[0] === 'string') maps.add(point[0]);
  const pending = [...maps];
  let assets = {}, assetsVerifiedAt = new Date().toISOString(), previousAudit;
  if (reuseResources) {
    previousAudit = JSON.parse(await readFile('generated/teleport-route-audit.json', 'utf8'));
    assets = previousAudit.assets; assetsVerifiedAt = previousAudit.assetsVerifiedAt || previousAudit.generatedAt;
    for (const map of maps) if (!assets[map]) throw new Error('Cached resource audit is missing ' + map);
  } else await Promise.all(Array.from({ length: 6 }, async () => {
    for (;;) {
      const map = pending.shift(); if (!map) return;
      assets[map] = await inspectMap(map, world);
      console.log(`Checked ${map}: ${assets[map].gat.header ? assets[map].gat.header.width + 'x' + assets[map].gat.header.height : 'unverified'}`);
    }
  }));
  const officialUrl = 'https://game.lastro.cn/ro/src/DB/logsTable.js?71.91';
  let official = reuseResources ? previousAudit.official : undefined;
  if (reuseResources && (!official?.matchesImportedHash || official.sha256 !== imported.sourceSha256)) throw new Error('Cached official catalogue evidence does not match imported source');
  if (!reuseResources) try {
    const response = await globalThis.fetch(officialUrl, { signal: globalThis.AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text(), profiles = parseOfficialTeleportCatalog(text);
    official = { url: officialUrl, sha256: createHash('sha256').update(text).digest('hex'), matchesImportedHash: createHash('sha256').update(text).digest('hex') === imported.sourceSha256, profiles: Object.keys(profiles), importedRowsMatch: Object.entries(profiles).every(([profile, data]) => JSON.stringify(data) === JSON.stringify(imported.profiles[profile])) };
  } catch (error) { official = { url: officialUrl, error: error.message }; }
  let resourceAliases, resolvedAssets = assets;
  try {
    const bytes = await readFile('generated/teleport-route-assets/resnametable-official.txt');
    const aliases = parseTeleportResourceAliases(bytes), checked = auditTeleportResourceAliases(assets, aliases);
    resolvedAssets = checked.resolvedAssets;
    const { resolvedAssets: unusedResolvedAssets, ...evidence } = checked;
    void unusedResolvedAssets;
    const line = 'prt_evt.gnd#prontera.gnd#';
    resourceAliases = { source: 'https://game.lastro.cn/ro/client_re/data/resnametable.txt', localFile: 'generated/teleport-route-assets/resnametable-official.txt', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mappingRule: 'Exact original filename key, one hop, before prefixing data/; no lowercasing or recursive alias chasing', prontera: ['prontera.rsw', 'prontera.gnd', 'prontera.gat'].map(key => ({ key, alias: aliases[key] || null })), byteEvidence: { line, offset: bytes.indexOf(Buffer.from(line)), hex: Buffer.from(line).toString('hex') }, ...evidence };
    const fallbackBytes = await readFile('generated/teleport-route-assets/resnametable-fallback.txt');
    const fallback = auditTeleportResourceAliases(assets, parseTeleportResourceAliases(fallbackBytes));
    resourceAliases.fallbackSnapshot = { source: 'https://rodata.ltsd.ro/ro/client_re/data/resnametable.txt', bytes: fallbackBytes.length, sha256: createHash('sha256').update(fallbackBytes).digest('hex'), sameDestinationChecks: JSON.stringify(fallback.checks) === JSON.stringify(checked.checks) };
  } catch (error) { resourceAliases = { error: error.message }; }
  const audited = rows.map(row => ({ ...row, ...auditTeleportRoute(row, resolvedAssets) }));
  const profiles = teleportAuditProfiles(imported.profiles);
  const adapter = await readFile('scripts/patch-v2-runtime.mjs', 'utf8');
  let originalRuntime;
  try { originalRuntime = { url: 'https://game.lastro.cn/ro/Online.js?71.91', ...parseOfficialTeleportRuntimeEvidence(await readFile('generated/teleport-route-assets/official-online-71.91.txt', 'utf8')) }; }
  catch (error) { originalRuntime = { error: error.message }; }
  const protocol = { packet: 'CZ.PRIVATE_AIRSHIP_REQUEST', type: 1, itemid: 14527, constructed: buildPrivateAirshipRequest({ mapname: 'prontera', x: 116, y: 72, type: 1 }), adapterMatches: /buildPrivateAirshipRequest\(\{mapname: point\[0\], x: point\[1\], y: point\[2\], type: 1\}\)/.test(adapter), originalRuntime };
  let kafraCellSamples;
  try {
    const gat = await readFile('generated/teleport-route-assets/prontera.gat'), header = parseTeleportMapHeader('gat', gat);
    const points = [imported.profiles['5'].npc['1'].outset, ...imported.profiles['5'].npc['1'].path, legacy.guide.pronteraKafra.outset];
    kafraCellSamples = { source: 'generated/teleport-route-assets/prontera.gat', sha256: createHash('sha256').update(gat).digest('hex'), points: points.map(point => ({ point, cellType: gat.readUInt32LE(14 + (point[2] * header.width + point[1]) * 20 + 16) })) };
  } catch (error) { kafraCellSamples = { error: error.message }; }
  const report = { generatedAt: new Date().toISOString(), assetsVerifiedAt, official, protocol, profiles, kafraCellSamples, resourceAliases, adapterCatalogSelectorMatches: /LastROTeleportPresets\.profiles\[Configs\.get\(["']clientVer["'],\s*0\)\]/.test(adapter), limitations: ['Public resource and coordinate bounds checks do not establish server warp permissions or quest prerequisites', 'World metadata has names and world coordinates; actual tile dimensions are read from official GAT headers', 'Only map resource headers were checked for the whole catalog; full prontera files were saved for separate native-loader validation', 'Whole-catalog cell walkability and live game Network were not tested; selected Kafra cells are reported separately', 'Official alias snapshots were checked against every actual destination key; user account storage and private browser caches were not inspected', 'Official App ClientVer=5 uses table5; lastroNid=6 remains an independent local order preference key, not an invented table6', 'prontera_a is probed as a resource alias candidate only; commands are never rewritten'], summary: { rows: audited.length, maps: maps.size, verified: audited.filter(row => row.result === 'verified-passive-assets-and-bounds').length, unavailableOrUnverified: audited.filter(row => row.result !== 'verified-passive-assets-and-bounds').length, effectiveClientCatalogRows: profiles.reduce((sum, profile) => sum + profile.catalogRows, 0) }, assets, rows: audited };
  await mkdir('generated', { recursive: true });
  await writeFile('generated/teleport-route-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await auditLastroTeleportRoutes({ reuseResources: process.argv.includes('--reuse-resources') });
