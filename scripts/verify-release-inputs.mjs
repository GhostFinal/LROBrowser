import process from 'node:process';
import { access } from 'node:fs/promises';
import { getReleaseMetadata, validateIwaVersion } from './build-release-metadata.mjs';
export async function verifyReleaseInputs(input) {
  if (!input?.keyPath) throw new Error('keyPath is required');
  await access(input.keyPath);
  if (!/^[a-z2-7]{40,60}$/.test(input.expectedBundleId)) throw new Error('expectedBundleId must be a base32 Web Bundle ID');
  validateIwaVersion(input.version);
  if (!/^[0-9a-f]{40}$/i.test(input.commitSha)) throw new Error('commitSha must be a full SHA');
  const metadata = getReleaseMetadata({ runNumber: input.version.split('.')[2], commitSha: input.commitSha, channel: input.channel ?? 'default', updateManifestUrl: input.updateManifestUrl, bundleBaseUrl: input.bundleBaseUrl });
  if (metadata.version !== input.version) throw new Error('version does not match run number');
  return { ...input, ...metadata };
}

if (process.argv[1]?.endsWith('verify-release-inputs.mjs')) {
  const args = process.argv.slice(2); const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const result = await verifyReleaseInputs({ keyPath: value('--key'), expectedBundleId: value('--bundle-id'), version: value('--version'), commitSha: value('--commit-sha'), updateManifestUrl: process.env.IWA_UPDATE_MANIFEST_URL ?? 'https://client.ltsd.ro/updates.json', bundleBaseUrl: process.env.IWA_BUNDLE_BASE_URL ?? 'https://client.ltsd.ro/', channel: process.env.IWA_CHANNEL ?? 'default' });
  process.stdout.write(`${JSON.stringify({ version: result.version, commitSha: result.commitSha, expectedBundleId: result.expectedBundleId })}\n`);
}
