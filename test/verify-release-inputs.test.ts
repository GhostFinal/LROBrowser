import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { verifyReleaseInputs } from '../scripts/verify-release-inputs.mjs';

let fixtureRoot: string;
beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'lastro-release-inputs-'));
  await writeFile(path.join(fixtureRoot, 'synthetic-key.pem'), 'test');
});
afterAll(async () => { if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true }); });

describe('verify release inputs', () => {
  const base = { get keyPath() { return path.join(fixtureRoot, 'synthetic-key.pem'); }, expectedBundleId: 'a'.repeat(52), version: '0.1.3', commitSha: 'b'.repeat(40), updateManifestUrl: 'https://cdn.test/updates.json', bundleBaseUrl: 'https://cdn.test/releases/' };
  it('accepts complete production inputs', async () => expect(await verifyReleaseInputs(base)).toEqual(expect.objectContaining(base)));
  it('rejects missing key, wrong bundle id shape, and invalid URLs', async () => {
    await expect(verifyReleaseInputs({ ...base, keyPath: '' })).rejects.toThrow();
    await expect(verifyReleaseInputs({ ...base, expectedBundleId: 'bad' })).rejects.toThrow();
    await expect(verifyReleaseInputs({ ...base, updateManifestUrl: 'http://cdn.test/updates.json' })).rejects.toThrow();
  });
});
