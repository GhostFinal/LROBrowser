// Optional preview fixtures: real passive assets, decoded by the repository's SPR/ACT
// loaders. Production uses Client directly and is not limited to these samples.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import console from 'node:console';
import { build } from 'esbuild';

const source = (await readFile('vendor/v2/Online.js', 'utf8')).replace(/\r\n/g, '\n');
function region(path) {
  const start = source.indexOf('//#region ' + path + '\n');
  if (start < 0) throw new Error('Missing native loader ' + path);
  return source.slice(start, source.indexOf('//#endregion', start));
}
const context = { ArrayBuffer, Uint8Array, TextDecoder, window: {}, CodepageManager: { decode: bytes => new TextDecoder('gb18030').decode(bytes) } };
context.window = context;
const loaders = runInNewContext(`
  const __esmMin=fn=>{let ready=false;return()=>{if(!ready){ready=true;fn()}}};
  const init_Struct=()=>{},init_CodepageManager=()=>{};
  ${region('src/Utils/BinaryReader.js')}
  ${region('src/Loaders/Sprite.js')}
  ${region('src/Loaders/Action.js')}
  ${region('src/DB/Monsters/MonsterTable.js')}
  init_Sprite();init_Action();init_MonsterTable();
  ({SPR,ACT,names:MonsterTable_default});`, context);
const resolverBundle = await build({ entryPoints: ['src/resources/resource-resolver.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const resolver = await import('data:text/javascript;base64,' + Buffer.from(resolverBundle.outputFiles[0].text).toString('base64'));
const world = JSON.parse(await readFile('vendor/core/data/world/world-data.json', 'utf8'));
const ids = [...new Set([1002, 1007, 1008, 1010, 1012, 1031, 1039, ...(world.prt_fild08?.mobs || [])])];
await mkdir('generated/worldmap-sprites', { recursive: true });
const manifest = {};
for (const id of ids) {
  const name = loaders.names[id]?.toLowerCase(); if (!name) continue;
  try {
    const files = await Promise.all(['spr', 'act'].map(async ext => {
      const path = resolver.buildResourcePathCandidates(`data/sprite/¸ó½ºÅÍ/${name}.${ext}`)[0];
      const response = await globalThis.fetch(resolver.DEFAULT_RESOURCE_ROOTS[0] + path, { signal: globalThis.AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${name}.${ext}: ${response.status}`);
      return response.arrayBuffer();
    }));
    const spr = new loaders.SPR(files[0]); spr.switchToRGBA();
    const compiled = spr.compile(), act = new loaders.ACT(files[1]).compile();
    const animation = act.actions[0].animations[0];
    const used = new Set(animation.layers.filter(l => l.index >= 0).map(l => l.index + (l.spr_type === 1 ? compiled.old_rgba_index : 0)));
    compiled.frames = compiled.frames.map((f, i) => used.has(i) ? { ...f, data: [...f.data] } : null);
    compiled.palette = [...compiled.palette];
    await writeFile(`generated/worldmap-sprites/${id}.json`, JSON.stringify({ spr: compiled, act: { actions: [{ animations: [animation] }] } }));
    manifest[id] = name; console.log(`Portrait fixture: ${id} ${name}`);
  } catch (error) { console.warn(`Portrait ${id} unavailable: ${error.message}`); }
}
await writeFile('generated/worldmap-sprites/index.json', JSON.stringify(manifest));
for (const id of ['prt_fild08', 'prontera', 'prt_maze01']) {
  const path = resolver.buildResourcePathCandidates(`data/texture/유저인터페이스/map/${id}.bmp`)[0];
  const response = await globalThis.fetch(resolver.DEFAULT_RESOURCE_ROOTS[0] + path, { signal: globalThis.AbortSignal.timeout(20000) });
  if (!response.ok) { console.warn(`Map fixture ${id}: ${response.status}`); continue; }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 66 || bytes[1] !== 77) throw new Error('Invalid BMP map');
  await writeFile(`generated/worldmap-sprites/${id}.bmp`, bytes);
  console.log(`Map fixture: ${id}`);
}
