import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Bundle } from 'wbn';
import { describe, expect, it } from 'vitest';
import { createBundle } from '../scripts/bundle-iwa.mjs';
import { signBundle } from '../scripts/sign-iwa.mjs';
import { REQUIRED_HEADERS } from '../scripts/iwa-security.mjs';

describe('IWA Web Bundle', () => {
  it('packages distribution files as relative IWA exchanges with isolated headers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lastro-iwa-bundle-'));
    try {
      await mkdir(path.join(root, '.well-known'), { recursive: true });
      await writeFile(path.join(root, '.well-known/manifest.webmanifest'), '{}');
      await writeFile(path.join(root, 'index.html'), '<!doctype html>');
      const bytes = await createBundle(root);
      const bundle = new Bundle(bytes);
      expect(bundle.version).toMatch(/^b/);
      expect(bundle.primaryURL).toBeNull();
      expect(bundle.urls).toEqual(expect.arrayContaining(['', '.well-known/manifest.webmanifest', 'index.html']));
      expect(bundle.urls.every((url) => !url.includes('://'))).toBe(true);
      const response = bundle.getResponse('');
      expect(response.status).toBe(200);
      expect(response.headers['content-security-policy']).toBe(REQUIRED_HEADERS['Content-Security-Policy']);
      expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('signs with a disposable key outside the repository and records only safe metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lastro-iwa-sign-'));
    try {
      await mkdir(path.join(root, '.well-known'), { recursive: true });
      await writeFile(path.join(root, '.well-known/manifest.webmanifest'), '{}');
      const unsigned = path.join(root, 'client.wbn');
      const signed = path.join(root, 'client.swbn');
      await writeFile(unsigned, await createBundle(root));
      const { privateKey } = generateKeyPairSync('ed25519');
      const keyPath = path.join(root, 'disposable-test-key.pem');
      await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
      const metadata = await signBundle(unsigned, keyPath, signed);
      expect(metadata.testKey).toBe(true);
      expect(metadata.webBundleId).toMatch(/^[a-z2-7]+$/);
      expect(metadata).not.toHaveProperty('keyPath');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
