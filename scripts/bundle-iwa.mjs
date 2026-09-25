import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { BundleBuilder } from 'wbn';
import { auditDist, REQUIRED_HEADERS } from './audit-iwa-dist.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.tga': 'image/x-tga', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.flac': 'audio/flac',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};

async function walk(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  await visit(root);
  return files.sort();
}

function parseArgs(args) {
  const values = { dist: 'dist', out: undefined, baseUrl: 'https://lastro-v2.local/', skipAudit: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dist') values.dist = args[++index];
    else if (argument === '--out') values.out = args[++index];
    else if (argument === '--base-url') values.baseUrl = args[++index];
    else if (argument === '--skip-audit') values.skipAudit = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return values;
}

export async function createBundle(distDirectory, baseUrl) {
  const dist = path.resolve(distDirectory);
  const origin = new globalThis.URL(baseUrl);
  if (origin.protocol !== 'https:' || !origin.pathname.endsWith('/')) throw new Error('base URL must be an HTTPS origin ending with /');
  const builder = new BundleBuilder();
  builder.setPrimaryURL(origin.href);
  for (const file of await walk(dist)) {
    const relative = path.relative(dist, file).replaceAll(path.sep, '/');
    const url = new globalThis.URL(relative, origin).href;
    const headers = { ...REQUIRED_HEADERS, 'Content-Type': MIME_TYPES[path.extname(relative).toLowerCase()] ?? 'application/octet-stream' };
    builder.addExchange(url, 200, headers, await readFile(file));
  }
  return builder.createBundle();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.skipAudit) await auditDist(options.dist);
  const bytes = await createBundle(options.dist, options.baseUrl);
  const output = options.out ?? path.resolve('release/lastro-v2.wbn');
  await writeFile(output, bytes);
  process.stdout.write(JSON.stringify({ output, bytes: bytes.byteLength, baseUrl: options.baseUrl }) + '\n');
}
