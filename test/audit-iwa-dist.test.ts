import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditDist } from '../scripts/audit-iwa-dist.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lastro-iwa-audit-'));
  await mkdir(path.join(root, '.well-known'), { recursive: true });
  await mkdir(path.join(root, 'core'), { recursive: true });
  await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({ version: '0.1.0' }));
  await writeFile(path.join(root, 'core/executable-assets.json'), JSON.stringify({ files: [{ path: 'runtime.js', kind: 'runtime' }], bytes: 1 }));
  await writeFile(path.join(root, 'core/runtime.js'), 'globalThis.LastRO = true;');
  return root;
}

describe('IWA distribution audit', () => {
  it('accepts a minimal compliant distribution and writes a report', async () => {
    const root = await fixture();
    try {
      const report = await auditDist(root, path.join(root, 'report.json'));
      expect(report.fileCount).toBe(3);
      expect(report.prohibitedPatternResults).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ['dynamic code', 'const run = eval("1");'],
    ['remote executable', 'fetch("https://example.invalid/game.lua");'],
    ['personal credentials', 'const quickLoginAccounts = [{ username: "me", password: "secret" }];'],
    ['private key', '-----BEGIN PRIVATE KEY-----'],
    ['local path', 'const source = "/home/parker/private";'],
  ])('rejects %s', async (_name, source) => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, 'core/runtime.js'), source);
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('prohibited bundle content');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects unapproved origins and update manifests', async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, 'core/runtime.js'), 'fetch("https://evil.invalid/data.bin");');
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('unapproved remote origins');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
