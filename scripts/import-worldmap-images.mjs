// Explicit passive-image import. Bundling avoids the official image server's
// missing CORS/CORP headers without weakening IWA isolation or adding a proxy.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import console from 'node:console';
import layout from './lastro-worldmap-layout.json' with { type: 'json' };

const root = new URL('../public/worldmap/', import.meta.url);
await mkdir(root, { recursive: true });
const paths = [...new Set(layout.regions.flatMap(region => [region.background, ...region.cells.map(cell => 'map/s/' + cell.image)]))];
const files = [];
let cursor = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    const url = 'https://game.lastro.cn/statics/imgs/' + path;
    const response = await globalThis.fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!(bytes[0] === 137 && bytes[1] === 80) && !(bytes[0] === 255 && bytes[1] === 216)) throw new Error(`Not an image: ${url}`);
    const name = path.split('/').pop();
    await writeFile(new URL(name, root), bytes);
    files.push({ file: name, source: url, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}));
const bossUrl = 'https://game.lastro.cn/ro/client_re/data/texture/%E8%9C%A1%E5%8E%86%E7%89%A2%E7%A3%90%E5%85%B6%E6%8D%9E%E8%83%B6/minimap/boss_1.bmp';
const bossResponse = await globalThis.fetch(bossUrl);
if (!bossResponse.ok) throw new Error(`Boss marker HTTP ${bossResponse.status}`);
const boss = new Uint8Array(await bossResponse.arrayBuffer());
if (boss[0] !== 66 || boss[1] !== 77) throw new Error('Invalid BMP marker');
await writeFile(new URL('boss_1.bmp', root), boss);
files.push({ file: 'boss_1.bmp', source: bossUrl, sha256: createHash('sha256').update(boss).digest('hex') });
await writeFile(new URL('sources.json', root), JSON.stringify(files.sort((a, b) => a.file.localeCompare(b.file)), null, 2) + '\n');
console.log(`Imported ${files.length} official passive images`);
