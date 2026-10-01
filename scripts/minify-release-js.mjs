import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(file);
  }
  return files;
}
export async function minifyReleaseJavaScript(dist = 'dist') {
  const root = path.resolve(dist);
  const files = await walk(root);
  const manifestPath = path.join(root, 'core/executable-assets.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entries = new Map(manifest.files.map(entry => ['core/' + entry.path, entry]));
  const originals = new Map();
  // Validate before rewriting: minification must not bless pre-existing corruption.
  for (const file of files) {
    const bytes = await readFile(file);
    originals.set(file, bytes);
    const entry = entries.get(path.relative(root, file).split(path.sep).join('/'));
    if (entry && (entry.bytes !== bytes.length || entry.sha256 !== createHash('sha256').update(bytes).digest('hex'))) {
      throw new Error('executable asset integrity mismatch: ' + entry.path);
    }
  }
  for (const file of files) {
    const source = originals.get(file).toString('utf8');
    const preserveRuntimeNames = /(?:Online|ThreadEventHandler|PathFindingWorker)\.js$/.test(file);
    const result = await transform(source, { loader: 'js', minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: !preserveRuntimeNames, legalComments: 'none', target: 'es2022' });
    await writeFile(file, result.code);
    const entry = entries.get(path.relative(root, file).split(path.sep).join('/'));
    if (entry) {
      entry.bytes = Buffer.byteLength(result.code);
      entry.sha256 = createHash('sha256').update(result.code).digest('hex');
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { files: files.length };
}
if (process.argv[1]?.endsWith('minify-release-js.mjs')) process.stdout.write(`${JSON.stringify(await minifyReleaseJavaScript(process.argv[2] ?? 'dist'))}\n`);
