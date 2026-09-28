import process from 'node:process';

export function validateIwaVersion(version) {
  if (typeof version !== 'string' || !/^(?:\d+)(?:\.\d+)*$/.test(version)) throw new Error(`invalid IWA version: ${version}`);
}
export function compareIwaVersions(left, right) {
  validateIwaVersion(left); validateIwaVersion(right);
  const a = left.split('.').map(Number); const b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) { const diff = (a[i] ?? 0) - (b[i] ?? 0); if (diff) return diff; }
  return 0;
}
function httpsUrl(value, name, trailingSlash = false) {
  let url; try { url = new globalThis.URL(value); } catch { throw new Error(`${name} must be a valid HTTPS URL`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  if (trailingSlash && !url.pathname.endsWith('/')) throw new Error(`${name} must end with /`);
  return url.href;
}
export function getReleaseMetadata({ runNumber, commitSha, channel = 'default', updateManifestUrl, bundleBaseUrl }) {
  if (!/^\d+$/.test(String(runNumber)) || Number(runNumber) < 1) throw new Error('runNumber must be a positive integer');
  if (!/^[0-9a-f]{40}$/i.test(String(commitSha))) throw new Error('commitSha must be a full 40-character hexadecimal SHA');
  if (!/^[a-z0-9_-]+$/.test(channel)) throw new Error('channel must contain lowercase ASCII characters, digits, hyphens, or underscores');
  const version = `0.1.${Number(runNumber)}`; validateIwaVersion(version);
  return { version, commitSha: String(commitSha).toLowerCase(), channel, updateManifestUrl: httpsUrl(updateManifestUrl, 'updateManifestUrl'), bundleBaseUrl: httpsUrl(bundleBaseUrl, 'bundleBaseUrl', true) };
}
if (process.argv[1]?.endsWith('build-release-metadata.mjs')) {
  const metadata = getReleaseMetadata({ runNumber: process.env.GITHUB_RUN_NUMBER, commitSha: process.env.GITHUB_SHA, channel: process.env.IWA_CHANNEL ?? 'default', updateManifestUrl: process.env.IWA_UPDATE_MANIFEST_URL, bundleBaseUrl: process.env.IWA_BUNDLE_BASE_URL });
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
