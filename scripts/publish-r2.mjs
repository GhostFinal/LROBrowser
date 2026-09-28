import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { buildUpdateManifest } from './build-update-manifest.mjs';

export function createR2Client({ accountId, accessKeyId, secretAccessKey, endpoint }) {
  return new S3Client({ region: 'auto', endpoint: endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
}
export function buildReleaseObjectKeys({ version, commitSha }) {
  const prefix = `releases/${version}`;
  return { bundle: `${prefix}/lastro-v2-${commitSha}.swbn`, checksum: `${prefix}/lastro-v2-${commitSha}.swbn.sha256`, releaseManifest: `${prefix}/release-manifest.json`, auditReport: `${prefix}/audit-report.json` };
}
async function put(client, bucket, key, body, contentType, { mutable = false } = {}) {
  const bytes = body instanceof Uint8Array ? body : Buffer.from(body);
  try {
    const existing = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const existingBytes = existing.Body?.transformToByteArray ? await existing.Body.transformToByteArray() : existing.Body;
    if (Buffer.compare(Buffer.from(existingBytes), Buffer.from(bytes)) === 0) return;
    if (!mutable) throw new Error(`immutable release conflict: ${key}`);
  } catch (error) {
    if (error?.message?.startsWith('immutable release conflict:')) throw error;
    if (!['NoSuchKey', 'NotFound'].includes(error?.name)) throw error;
  }
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: key === 'updates.json' ? 'no-cache' : 'public, max-age=31536000, immutable', Metadata: { sha256: createHash('sha256').update(bytes).digest('hex') } }));
}
export async function publishRelease({ client, bucket, artifacts, metadata, existingVersions = [], retentionCount = 3 }) {
  const keys = buildReleaseObjectKeys(metadata);
  for (const [name, key] of Object.entries(keys)) {
    const contentType = name === 'bundle' ? 'application/webbundle' : name === 'checksum' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8';
    await put(client, bucket, key, artifacts[name], contentType);
  }
  const versions = [...new Set([...existingVersions, metadata.version])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const retained = versions.slice(-retentionCount);
  const entries = retained.map(version => version === metadata.version ? { version, src: metadata.bundleUrl, channels: [metadata.channel] } : metadata.previousEntries?.find(entry => entry.version === version)).filter(Boolean);
  const updates = buildUpdateManifest(entries);
  await put(client, bucket, 'updates.json', JSON.stringify(updates, null, 2) + '\n', 'application/json; charset=utf-8', { mutable: true });
  for (const version of versions.slice(0, -retentionCount)) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `releases/${version}/` }));
    for (const object of listed.Contents ?? []) if (object.Key) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
  }
  return { version: metadata.version, keys, retainedVersions: retained };
}
export async function publishReleaseFromDirectory({ client, bucket, directory, metadata, existingVersions, previousEntries, retentionCount = 3 }) {
  const keys = buildReleaseObjectKeys(metadata);
  const artifacts = { bundle: await readFile(`${directory}/${keys.bundle.split('/').at(-1)}`), checksum: await readFile(`${directory}/${keys.checksum.split('/').at(-1)}`), releaseManifest: await readFile(`${directory}/release-manifest.json`), auditReport: await readFile(`${directory}/audit-report.json`) };
  return publishRelease({ client, bucket, artifacts, metadata: { ...metadata, previousEntries }, existingVersions, retentionCount });
}

if (process.argv[1]?.endsWith('publish-r2.mjs')) {
  const args = process.argv.slice(2);
  const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const releaseDir = value('--release-dir') ?? 'release';
  const bundleName = value('--bundle');
  if (!bundleName) throw new Error('--bundle is required');
  const version = process.env.IWA_VERSION ?? `0.1.${process.env.GITHUB_RUN_NUMBER}`;
  const commitSha = process.env.GITHUB_SHA;
  const updateManifestUrl = process.env.IWA_UPDATE_MANIFEST_URL ?? 'https://client.ltsd.ro/updates.json';
  const bundleBaseUrl = process.env.IWA_BUNDLE_BASE_URL ?? 'https://client.ltsd.ro/';
  if (!commitSha) throw new Error('GITHUB_SHA is required');
  const metadata = { version, commitSha, channel: process.env.IWA_CHANNEL ?? 'default', updateManifestUrl, bundleBaseUrl, bundleUrl: new globalThis.URL(`releases/${version}/${bundleName}`, bundleBaseUrl).href };
  const client = createR2Client({ accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, endpoint: process.env.R2_ENDPOINT });
  const signed = await readFile(`${releaseDir}/${bundleName}`);
  const checksum = await readFile(`${releaseDir}/${bundleName}.sha256`);
  const releaseManifest = await readFile(`${releaseDir}/release-manifest.json`);
  const auditReport = await readFile(`${releaseDir}/audit-report.json`);
  let previousEntries = [];
  try { const response = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: 'updates.json' })); previousEntries = JSON.parse(await response.Body.transformToString()).versions ?? []; } catch (error) { if (error?.name !== 'NoSuchKey' && error?.name !== 'NotFound') throw error; }
  const result = await publishRelease({ client, bucket: process.env.R2_BUCKET, artifacts: { bundle: signed, checksum, releaseManifest, auditReport }, metadata: { ...metadata, previousEntries }, existingVersions: previousEntries.map(entry => entry.version), retentionCount: 3 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
