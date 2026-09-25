import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const file = process.argv[2] ?? '.staging/v2/lastro-worldmap-details.mjs';
let source = await readFile(file, 'utf8');

function replaceOnce(needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}:${count}`);
  source = source.replace(needle, replacement);
}

replaceOnce("const WORLD_DATA_PATH = '../ro/src/DB/worldData.js';", "const WORLD_DATA_PATH = '../core/data/world/world-data.json';", 'world-path');
replaceOnce("const MOB_DATA_PATH = '../ro/src/DB/Mobs/mob_db.js';", "const MOB_DATA_PATH = '../core/data/world/mob-data.json';", 'mob-path');
const parseStart = source.indexOf('export function parseAmdDataModule(source) {');
const parseEnd = source.indexOf('\n}\n\nfunction getDrops', parseStart);
if (parseStart < 0 || parseEnd < 0) throw new Error('amd-anchor');
source = source.slice(0, parseStart) + 'export function parseAmdDataModule() {\n  throw new Error("AMD world-map modules are converted during the build");\n}' + source.slice(parseEnd + 2);
const fetchStart = source.indexOf('async function fetchText(path) {');
const fetchEnd = source.indexOf('\n}\n\nexport async function loadWorldMapNameData', fetchStart);
if (fetchStart < 0 || fetchEnd < 0) throw new Error('fetch-anchor');
source = source.slice(0, fetchStart) + `async function fetchJson(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(\`Unable to load world-map data (\${response.status})\`);
  return response.json();
}` + source.slice(fetchEnd + 2);
replaceOnce('cachedWorldMapNameDataPromise = fetchText(WORLD_DATA_PATH).then(parseAmdDataModule);', 'cachedWorldMapNameDataPromise = fetchJson(WORLD_DATA_PATH);', 'world-load');
replaceOnce('Promise.all([loadWorldMapNameData(), fetchText(MOB_DATA_PATH)]).then(([worldData, mobSource]) => ({\n      worldData,\n      mobData: parseAmdDataModule(mobSource)\n    }))', 'Promise.all([loadWorldMapNameData(), fetchJson(MOB_DATA_PATH)]).then(([worldData, mobData]) => ({\n      worldData,\n      mobData\n    }))', 'mob-load');
await writeFile(file, source);
process.stdout.write(JSON.stringify({ file }) + '\n');
