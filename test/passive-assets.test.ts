import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { downloadPassiveAssets } from '../scripts/import-passive-assets.mjs';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('passive asset importer', () => {
  it('downloads configured passive assets into their local source paths', async () => {
    const root = await mkdtemp(path.resolve('generated/passive-assets-fixtures-'));
    roots.push(root);
    const response = new Response(new TextEncoder().encode('mp3 names'), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });

    await downloadPassiveAssets({
      root,
      assets: [{ path: 'data/mp3nametable.txt', url: 'https://rodata.ltsd.ro/ro/client_re/data/mp3nametable.txt' }],
      fetch: async () => response,
    });

    await expect(readFile(path.join(root, 'data/mp3nametable.txt'), 'utf8')).resolves.toBe('mp3 names');
  });
});
