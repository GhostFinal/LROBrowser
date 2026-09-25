import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const repo = fileURLToPath(new URL('../', import.meta.url));
export async function buildCoreManifest({ input = path.join(repo, '.staging/core/executable-assets.json'), output = path.join(repo, 'dist/core/executable-assets.json') } = {}) {
  const manifest = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(manifest.files) || manifest.files.some(file => typeof file.path !== 'string' || !file.kind)) throw new Error('invalid-core-manifest');
  manifest.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(input, output);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildCoreManifest();
