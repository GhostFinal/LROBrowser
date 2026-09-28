import process from 'node:process';
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
  const files = await walk(path.resolve(dist));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const preserveRuntimeNames = /(?:Online|ThreadEventHandler|PathFindingWorker)\.js$/.test(file);
    const result = await transform(source, { loader: 'js', minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: !preserveRuntimeNames, legalComments: 'none', target: 'es2022' });
    await writeFile(file, result.code);
  }
  return { files: files.length };
}
if (process.argv[1]?.endsWith('minify-release-js.mjs')) process.stdout.write(`${JSON.stringify(await minifyReleaseJavaScript(process.argv[2] ?? 'dist'))}\n`);
