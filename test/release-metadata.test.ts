import { describe, expect, it } from 'vitest';
import { compareIwaVersions, getReleaseMetadata, validateIwaVersion } from '../scripts/build-release-metadata.mjs';

describe('release metadata', () => {
  it('accepts numeric IWA versions and compares them numerically', () => {
    expect(() => validateIwaVersion('0.1.12')).not.toThrow();
    expect(compareIwaVersions('0.1.12', '0.1.9')).toBeGreaterThan(0);
    expect(() => validateIwaVersion('abc123')).toThrow();
  });
  it('derives deterministic release metadata from GitHub inputs', () => {
    expect(getReleaseMetadata({ runNumber: '12', commitSha: 'a'.repeat(40), channel: 'default', updateManifestUrl: 'https://cdn.example.test/updates.json', bundleBaseUrl: 'https://cdn.example.test/releases/' })).toEqual(expect.objectContaining({ version: '0.1.12', commitSha: 'a'.repeat(40), channel: 'default' }));
  });
  it('rejects malformed commit and non-HTTPS production URLs', () => {
    expect(() => getReleaseMetadata({ runNumber: '1', commitSha: 'bad', channel: 'default', updateManifestUrl: 'https://cdn.example.test/updates.json', bundleBaseUrl: 'https://cdn.example.test/releases/' })).toThrow();
    expect(() => getReleaseMetadata({ runNumber: '1', commitSha: 'a'.repeat(40), channel: 'default', updateManifestUrl: 'http://cdn.example.test/updates.json', bundleBaseUrl: 'https://cdn.example.test/releases/' })).toThrow();
  });
});
