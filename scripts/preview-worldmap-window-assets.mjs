// Small passive-resource fixture for checking the native item window locally.
// Cache downloaded BMPs in generated/; never fetch executable game code.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import console from 'node:console';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/resources/resource-resolver.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const resolver = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const lua = new TextDecoder('gb18030').decode(await readFile('vendor/core/System/itemInfo_re_61.lua'));
const paths = ['basic_interface/collection_bg.bmp', 'basic_interface/sys_close_off.bmp', 'basic_interface/sys_close_on.bmp'];
for (const match of lua.matchAll(/^\s*\[(\d+)\]\s*=\s*\{([\s\S]*?)(?=^\s*\[\d+\]\s*=|^\})/gm)) {
  if (![501, 944, 1202, 4001].includes(Number(match[1]))) continue;
  const resource = match[2].match(/\bidentifiedResourceName\s*=\s*"([^"\n]*)"/)?.[1];
  if (resource) paths.push(`collection/${resource}.bmp`);
}
const directory = 'generated/worldmap-window-assets'; await mkdir(directory, { recursive: true });
let manifest = {}; try { manifest = JSON.parse(await readFile(directory + '/index.json', 'utf8')); } catch { /* first import */ }
for (const path of paths) {
  const filename = createHash('sha256').update(path).digest('hex').slice(0, 24) + '.bmp';
  try {
    let cached = false; try { await access(directory + '/' + filename); cached = true; } catch { /* fetch below */ }
    if (!cached) {
      const candidate = resolver.buildResourcePathCandidates(`data/texture/유저인터페이스/${path}`)[0];
      const response = await globalThis.fetch(resolver.DEFAULT_RESOURCE_ROOTS[0] + candidate, { signal: globalThis.AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 66 || bytes[1] !== 77) throw new Error('Invalid BMP');
      await writeFile(directory + '/' + filename, bytes);
    }
    manifest[path] = filename;
  } catch (error) { console.warn(`${path}: ${error.message}`); }
}
await writeFile(directory + '/index.json', JSON.stringify(manifest));
console.log(`Native item window preview assets: ${Object.keys(manifest).length}/${paths.length}`);
