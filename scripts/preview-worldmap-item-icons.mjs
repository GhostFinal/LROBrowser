// Download passive item thumbnails for the isolated preview, not remote code.
// All files stay in ignored generated/, and successful imports are reused.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import process from 'node:process';
import console from 'node:console';
import { build } from 'esbuild';

const lua = new TextDecoder('gb18030').decode(await readFile('vendor/core/System/itemInfo_re_61.lua'));
const resources = [...new Set([...lua.matchAll(/\bidentifiedResourceName\s*=\s*"([^"\n]*)"/g)].map(m => m[1]).filter(Boolean))];
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8) || resources.length);
const bundle = await build({ entryPoints: ['src/resources/resource-resolver.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const resolver = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const directory = 'generated/worldmap-item-icons'; await mkdir(directory, { recursive: true });
let manifest = {}; try { manifest = JSON.parse(await readFile(directory + '/index.json', 'utf8')); } catch { /* first import */ }
let cursor = 0, completed = 0;
const failures = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < Math.min(resources.length, limit)) {
    const resource = resources[cursor++], filename = createHash('sha256').update(resource).digest('hex').slice(0, 24) + '.bmp';
    try {
      let cached = false; try { await access(directory + '/' + filename); cached = true; } catch { /* fetch below */ }
      if (!cached) {
        const path = resolver.buildResourcePathCandidates(`data/texture/유저인터페이스/item/${resource}.bmp`)[0];
        const response = await globalThis.fetch(resolver.DEFAULT_RESOURCE_ROOTS[0] + path, { signal: globalThis.AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes[0] !== 66 || bytes[1] !== 77) throw new Error('Invalid BMP');
        await writeFile(directory + '/' + filename, bytes);
      }
      manifest[resource] = filename;
    } catch (error) { failures.push({ resource, error: error.message }); }
    completed++;
    if (completed % 500 === 0) console.log(`Item thumbnails: ${completed}/${Math.min(resources.length, limit)}, missing ${failures.length}`);
  }
}));
await writeFile(directory + '/index.json', JSON.stringify(manifest));
await writeFile(directory + '/missing.json', JSON.stringify(failures, null, 2));
console.log(JSON.stringify({ available: Object.keys(manifest).length, missing: failures.length, total: resources.length }));
