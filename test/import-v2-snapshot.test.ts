import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];
const files = ['Online.js', 'lastro-example.mjs'];

async function fixture() {
  await mkdir('generated/test-fixtures', { recursive: true });
  const root = await mkdtemp(path.resolve('generated/test-fixtures/import-'));
  fixtures.push(root);
  const source = path.join(root, 'source');
  const output = path.join(root, 'output');
  const allowlist = path.join(root, 'allowlist.json');
  await mkdir(source);
  await writeFile(allowlist, JSON.stringify({ files }));
  await writeFile(path.join(source, 'Online.js'), 'export const start = () => true;\n');
  await writeFile(path.join(source, 'lastro-example.mjs'), 'export const example = 1;\n');
  const run = () => spawnSync(process.execPath, [
    'scripts/import-v2-snapshot.mjs', '--source', source, '--allowlist', allowlist, '--out', output,
  ], { encoding: 'utf8' });
  return { root, source, output, allowlist, run };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('reviewed V2 import gate', () => {
  it('excludes the known personal config without copying or printing its credentials', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'lastro-v2-config.js'),
      'const quickLoginAccounts = [{ username: "synthetic-user", password: "synthetic-password" }];');
    const result = f.run();
    expect(result.status).toBe(0);
    expect(result.stderr + result.stdout).not.toMatch(/synthetic-user|synthetic-password/);
    expect(existsSync(path.join(f.output, 'v2/lastro-v2-config.js'))).toBe(false);
    expect(await readdir(path.join(f.output, 'v2'))).toEqual(files);
  });

  it('rejects an attempt to allowlist the personal config', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'lastro-v2-config.js'), '// excluded');
    await writeFile(f.allowlist, JSON.stringify({ files: [...files, 'lastro-v2-config.js'] }));
    expect(f.run().stderr).toContain('excluded-allowlist-entry');
  });

  it('sanitizes reviewed legacy UI and rejects source hash drift', async () => {
    const f = await fixture();
    const source = 'function populateQuickLoginButtons() { return "private-ui"; }\n'
      + 'populateQuickLoginButtons(root, Configs.get("quickLoginAccounts", []));\n'
      + 'console.warn("Reference: https://example.invalid/docs");\n'
      + 'options.customWasmUri = `https://example.invalid/${version}/liblua5.1.wasm`;\n'
      + 'console.warn(`Unsupported ${name}: https://example.invalid/docs`);';
    await writeFile(path.join(f.source, 'Online.js'), source);
    await writeFile(f.allowlist, JSON.stringify({ files, reviewedSha256: {
      'Online.js': createHash('sha256').update(source).digest('hex'),
    } }));
    expect(f.run().status).toBe(0);
    const imported = await readFile(path.join(f.output, 'v2/Online.js'), 'utf8');
    expect(imported).not.toMatch(/private-ui|quickLoginAccounts|example\.invalid/);
    expect(imported).toContain('/core/wasm/liblua5.1.wasm');
    await writeFile(path.join(f.source, 'Online.js'), source + '\n// changed');
    expect(f.run().stderr).toContain('source-hash-drift');
  });

  it('copies only reviewed files with stable, sorted hashes and excludes tests/HTML', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'lastro-example.test.mjs'), '// test-only fixture');
    await writeFile(path.join(f.source, 'index.html'), '<!doctype html>');
    expect(f.run().status).toBe(0);
    const first = await readFile(path.join(f.output, 'v2-manifest.json'), 'utf8');
    const manifest = JSON.parse(first);
    expect(await readdir(path.join(f.output, 'v2'))).toEqual(files);
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toEqual(files);
    for (const entry of manifest.files) {
      const bytes = await readFile(path.join(f.source, entry.path));
      expect(entry.bytes).toBe(bytes.length);
      expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(f.run().status).toBe(0);
    expect(await readFile(path.join(f.output, 'v2-manifest.json'), 'utf8')).toBe(first);
  });

  it('fails closed when an allowlisted file is missing', async () => {
    const f = await fixture();
    await rm(path.join(f.source, 'lastro-example.mjs'));
    expect(f.run().stderr).toContain('missing');
    expect(f.run().status).toBe(1);
    expect(existsSync(f.output)).toBe(false);
  });

  it('rejects unexpected executable files', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'unexpected.mjs'), 'export const extra = true;');
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected-executable');
    expect(existsSync(f.output)).toBe(false);
  });

  it.each([
    'https://unapproved.invalid/resource.png',
    'http://game.lastro.cn/resource.png',
    'wss://unapproved.invalid/connect',
    'https://game.lastro.cn.unapproved.invalid/resource.png',
  ])('rejects and redacts an unapproved origin: %s', async url => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'Online.js'), `export const resource = ${JSON.stringify(url)};`);
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unapproved-origin');
    expect(result.stderr + result.stdout).not.toContain('unapproved.invalid');
    expect(existsSync(f.output)).toBe(false);
  });

  it('accepts only the two approved HTTPS resource origins', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'lastro-example.mjs'),
      'export const roots = ["https://game.lastro.cn/ro/client_re/", "https://rodata.ltsd.ro/ro/client_re/"];');
    expect(f.run().status).toBe(0);
  });

  it.each([
    'const profile = { username: "synthetic-user", password: "synthetic-password" };',
    'const profile = { "username": "synthetic-user", "password": "synthetic-password" };',
    'const profile = { id: "xkore-fixture" };',
    'const key = "-----BEGIN PRIVATE KEY----- synthetic-key";',
  ])('rejects sensitive structures without echoing values: %s', async source => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'lastro-example.mjs'), source);
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/credential|private-profile|private-key/);
    expect(result.stderr + result.stdout).not.toMatch(/synthetic-user|synthetic-password|synthetic-key|xkore-fixture/);
    expect(existsSync(f.output)).toBe(false);
  });

  it('records legacy transport counts only in raw Online.js', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'Online.js'),
      'const marker = ["socketProxy", "WebSocket", "WebSocket", "electronAPI", "NodeSocket"];');
    expect(f.run().status).toBe(0);
    const manifest = JSON.parse(await readFile(path.join(f.output, 'v2-manifest.json'), 'utf8'));
    expect(manifest.legacyTransportMarkers).toMatchObject({ WebSocket: 2, NodeSocket: 1, socketProxy: 1, electronAPI: 1 });
    await writeFile(path.join(f.source, 'lastro-example.mjs'), 'export const marker = "WebSocket";');
    const previous = await readFile(path.join(f.output, 'v2/lastro-example.mjs'), 'utf8');
    expect(f.run().status).toBe(1);
    expect(await readFile(path.join(f.output, 'v2/lastro-example.mjs'), 'utf8')).toBe(previous);
  });

  it('rejects symlinks and path traversal before staging', async () => {
    const f = await fixture();
    await rm(path.join(f.source, 'lastro-example.mjs'));
    await symlink(path.join(f.source, 'Online.js'), path.join(f.source, 'lastro-example.mjs'));
    expect(f.run().stderr).toContain('symlink');
    await writeFile(f.allowlist, JSON.stringify({ files: ['../escape.js'] }));
    expect(f.run().stderr).toContain('invalid-path');
    expect(existsSync(f.output)).toBe(false);
  });
});
