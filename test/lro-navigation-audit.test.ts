import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { auditDist } from '../scripts/audit-iwa-dist.mjs';

it.each([
  ['runtime/lro-reference-links.mjs', 'export const link="https://ro.dvg.cn/item/501";', true],
  ['runtime/lro-reference-links.mjs', 'fetch("https://ro.dvg.cn/item/501");', false],
  ['runtime/other.mjs', 'export const link="https://ro.dvg.cn/item/501";', false],
])('keeps external navigation separate from resource access: %s %s', async (file, source, allowed) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lro-navigation-'));
  try {
    await mkdir(path.join(root, '.well-known'), { recursive: true });
    await mkdir(path.join(root, 'core'), { recursive: true });
    await mkdir(path.join(root, 'core/runtime'), { recursive: true });
    await writeFile(path.join(root, '.well-known/manifest.webmanifest'), JSON.stringify({ version: '0.3.0' }));
    await writeFile(path.join(root, 'core/executable-assets.json'), JSON.stringify({ files: [{ path: file, kind: 'runtime' }], bytes: 1 }));
    await writeFile(path.join(root, 'core', file), source);
    const result = auditDist(root, path.join(root, 'report.json'));
    if (allowed) expect((await result).externalOrigins).toEqual([]);
    else await expect(result).rejects.toThrow(source.startsWith('fetch') ? 'navigation helper must not load remote resources' : 'unapproved remote origins');
  } finally { await rm(root, { recursive: true, force: true }); }
});
