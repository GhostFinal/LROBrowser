import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { minifyReleaseJavaScript } from '../scripts/minify-release-js.mjs';
import { auditDist } from '../scripts/audit-iwa-dist.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lastro-minify-'));
  const source = '// quest data\nglobalThis.quests = { title: "Quest", count: 1 + 2 };\n';
  await mkdir(path.join(root, 'core/data/questinfo'), { recursive: true });
  await mkdir(path.join(root, 'runtime'));
  await mkdir(path.join(root, '.well-known'));
  await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({ version: '0.1.0' }));
  await writeFile(path.join(root, 'core/data/questinfo/QuestInfo.js'), source);
  await writeFile(path.join(root, 'runtime/QuestInfo.js'), source);
  await writeFile(path.join(root, 'core/executable-assets.json'), JSON.stringify({ files: [{
    path: 'data/questinfo/QuestInfo.js', kind: 'runtime', bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  }] }));
  return { root, source };
}

it('keeps minified quest data and its runtime alias valid for the IWA audit', async () => {
  const { root, source } = await fixture();
  try {
    await minifyReleaseJavaScript(root);
    const bytes = await readFile(path.join(root, 'core/data/questinfo/QuestInfo.js'));
    expect(bytes.toString()).not.toBe(source);
    expect(await readFile(path.join(root, 'runtime/QuestInfo.js'))).toEqual(bytes);
    await expect(auditDist(root, path.join(root, 'report.json'))).resolves.toMatchObject({ prohibitedPatternResults: [] });
    await writeFile(path.join(root, 'core/data/questinfo/QuestInfo.js'), 'globalThis.tampered = true;');
    await expect(auditDist(root, path.join(root, 'report.json'))).rejects.toThrow('integrity mismatch');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('refuses to bless an asset modified before minification', async () => {
  const { root } = await fixture();
  try {
    await writeFile(path.join(root, 'core/data/questinfo/QuestInfo.js'), 'globalThis.tampered = true;');
    await expect(minifyReleaseJavaScript(root)).rejects.toThrow('integrity mismatch');
  } finally { await rm(root, { recursive: true, force: true }); }
});
