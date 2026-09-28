import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { compareIwaVersions, validateIwaVersion } from './build-release-metadata.mjs';
export function buildUpdateManifest(entries, { channelName = 'Stable' } = {}) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('at least one update entry is required');
  const seen = new Map();
  for (const entry of entries) {
    validateIwaVersion(entry.version);
    if (!Array.isArray(entry.channels) || !entry.channels.length) throw new Error(`missing channels for ${entry.version}`);
    new globalThis.URL(entry.src);
    const prior = seen.get(entry.version);
    if (prior && JSON.stringify(prior) !== JSON.stringify(entry)) throw new Error(`conflicting duplicate version: ${entry.version}`);
    seen.set(entry.version, entry);
  }
  const versions = [...seen.values()].sort((a, b) => compareIwaVersions(b.version, a.version));
  return { versions, channels: { default: { name: channelName } } };
}
if (process.argv[1]?.endsWith('build-update-manifest.mjs')) {
  const input = JSON.parse(await readFile(process.argv[2] ?? 'release/updates-input.json', 'utf8'));
  await writeFile(process.argv[3] ?? 'release/updates.json', `${JSON.stringify(buildUpdateManifest(input), null, 2)}\n`);
}
