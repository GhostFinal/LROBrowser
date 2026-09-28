import { describe, expect, it, beforeAll } from 'vitest';
import { writeFile } from 'node:fs/promises';

beforeAll(async () => { await writeFile('/tmp/key.pem', 'test'); });
import { verifyReleaseInputs } from '../scripts/verify-release-inputs.mjs';

describe('verify release inputs', () => {
  const base = { keyPath: '/tmp/key.pem', expectedBundleId: 'a'.repeat(52), version: '0.1.3', commitSha: 'b'.repeat(40), updateManifestUrl: 'https://cdn.test/updates.json', bundleBaseUrl: 'https://cdn.test/releases/' };
  it('accepts complete production inputs', async () => expect(await verifyReleaseInputs(base)).toEqual(expect.objectContaining(base)));
  it('rejects missing key, wrong bundle id shape, and invalid URLs', async () => {
    await expect(verifyReleaseInputs({ ...base, keyPath: '' })).rejects.toThrow();
    await expect(verifyReleaseInputs({ ...base, expectedBundleId: 'bad' })).rejects.toThrow();
    await expect(verifyReleaseInputs({ ...base, updateManifestUrl: 'http://cdn.test/updates.json' })).rejects.toThrow();
  });
});
