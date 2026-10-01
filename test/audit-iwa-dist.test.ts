import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditDist } from '../scripts/audit-iwa-dist.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lastro-iwa-audit-'));
  await mkdir(path.join(root, '.well-known'), { recursive: true });
  await mkdir(path.join(root, 'core'), { recursive: true });
  await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({ version: '0.1.0' }));
  await runtime(root, 'globalThis.LastRO = true;');
  return root;
}

async function runtime(root: string, source: string) {
  await writeFile(path.join(root, 'core/runtime.js'), source);
  await writeFile(path.join(root, 'core/executable-assets.json'), JSON.stringify({ files: [{
    path: 'runtime.js', kind: 'runtime', bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }] }));
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
      await runtime(root, source);
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('prohibited bundle content');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects unapproved origins and update manifests', async () => {
    const root = await fixture();
    try {
      await runtime(root, 'fetch("https://evil.invalid/data.bin");');
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('unapproved remote origins');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects protocol handlers that cannot receive the launched URL', async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({
        version: '0.1.0',
        protocol_handlers: [{ protocol: 'web+lastro', url: '/' }],
      }));
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('invalid protocol handler');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects modified and unlisted executable assets', async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, 'core/runtime.js'), 'globalThis.changed = true;');
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('integrity mismatch');
      await runtime(root, 'globalThis.LastRO = true;');
      await writeFile(path.join(root, 'core/unlisted.lua'), 'return {}');
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('unlisted executable');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('binds audit digest to file bytes rather than only filenames', async () => {
    const root = await fixture(), reportPath = path.join(os.tmpdir(), 'lastro-audit-' + Date.now() + '.json');
    try {
      const first = await auditDist(root, reportPath);
      await runtime(root, 'globalThis.LastRO = false;');
      const second = await auditDist(root, reportPath);
      expect(second.sha256).not.toBe(first.sha256);
    } finally { await rm(root, { recursive: true, force: true }); await rm(reportPath, { force: true }); }
  });
  it('rejects a cross-origin protocol launch target', async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({ version: '0.1.0', protocol_handlers: [{ protocol: 'web+lastro', url: '//evil.invalid/?url=%s' }] }));
      await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('invalid protocol handler');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
