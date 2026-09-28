import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Bundle } from 'wbn';
import { SignedWebBundle } from 'wbn-sign';
import { describe, expect, it } from 'vitest';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

const release = path.resolve('release');

describe('Phase A release smoke', () => {
  it('verifies the signed candidate, audit report, assets, modules, and repository boundary', async () => {
    const metadata = JSON.parse(await readFile(path.join(release, 'release-manifest.json'), 'utf8')) as {
      input: string; output: string; version: string; bytes: number; sha256: string; webBundleId: string; testKey: boolean;
    };
    const audit = JSON.parse(await readFile(path.join(release, 'audit-report.json'), 'utf8')) as { bundleVersion: string; prohibitedPatternResults: unknown[]; coreManifestSummary: { fileCount: number } };
    const signedBytes = await readFile(path.join(release, metadata.output));
    const unsignedBytes = await readFile(path.join(release, metadata.input));
    const signed = SignedWebBundle.fromBytes(signedBytes);
    const bundle = new Bundle(unsignedBytes);
    const urls = new Set(bundle.urls);
    const coreManifest = JSON.parse(await readFile('dist/core/executable-assets.json', 'utf8')) as { files: Array<{ path: string }> };
    const inventory = JSON.parse(await readFile('config/lastro-module-inventory.json', 'utf8')) as { entries: Array<{ module: string }> };
    const bundleId = signed.getWebBundleId();

    expect(metadata.testKey).toBe(true);
    expect(metadata.version).toBe(audit.bundleVersion);
    expect(metadata.bytes).toBe(signedBytes.byteLength);
    expect(metadata.sha256).toBe(createHash('sha256').update(signedBytes).digest('hex'));
    expect(bundleId).toBe(metadata.webBundleId);
    expect(audit.prohibitedPatternResults).toEqual([]);
    expect(audit.coreManifestSummary.fileCount).toBe(coreManifest.files.length);
    expect(urls).toContain('');
    expect([...urls].every((url) => !url.includes('://'))).toBe(true);
    for (const entry of coreManifest.files) expect(urls).toContain(`core/${entry.path}`);
    for (const entry of inventory.entries) expect(urls).toContain(`core/runtime/${entry.module}`);
    expect(LASTRO_SERVER_PROFILES.find((profile) => profile.id === 'lastro-app')).toMatchObject({ availability: 'available', loginAddress: '45.248.8.68', loginPort: 27569, lastroNid: 6 });
    expect(execFileSync('git', ['ls-files', '--', 'release', 'generated'], { encoding: 'utf8' })).toBe('');
  });
});
