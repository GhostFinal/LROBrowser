import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { NodeCryptoSigningStrategy, SignedWebBundle, WebBundleId, parsePemKey } from 'wbn-sign';

function parseArgs(args) {
  const values = { input: undefined, key: undefined, out: undefined, bundleId: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--input') values.input = args[++index];
    else if (argument === '--key') values.key = args[++index];
    else if (argument === '--out') values.out = args[++index];
    else if (argument === '--bundle-id') values.bundleId = args[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return values;
}

async function newestBundle() {
  const files = (await readdir('release')).filter((file) => file.endsWith('.wbn'));
  if (!files.length) throw new Error('no unsigned .wbn bundle found; run pnpm bundle:iwa first');
  const withStats = await Promise.all(files.map(async (file) => ({ file, mtime: (await stat(path.join('release', file))).mtimeMs })));
  return path.join('release', withStats.sort((a, b) => b.mtime - a.mtime)[0].file);
}

export async function signBundle(inputPath, keyPath, outputPath, bundleId) {
  const input = path.resolve(inputPath);
  const key = await realpath(keyPath);
  const repository = await realpath(process.cwd());
  const localKeyDirectory = path.join(repository, '.local', 'keys') + path.sep;
  const isIgnoredLocalKey = key.startsWith(localKeyDirectory);
  if ((key === repository || key.startsWith(`${repository}${path.sep}`)) && !isIgnoredLocalKey) {
    throw new Error('signing key must be outside the repository or inside .local/keys');
  }
  const privateKey = parsePemKey(await readFile(key), process.env.WEB_BUNDLE_SIGNING_PASSPHRASE);
  const strategy = new NodeCryptoSigningStrategy(privateKey);
  const publicKey = await strategy.getPublicKey();
  const derivedId = new WebBundleId(publicKey).serialize();
  if (bundleId && bundleId !== derivedId) throw new Error(`bundle ID does not match signing key: expected ${derivedId}`);
  const signed = await SignedWebBundle.fromWebBundle(await readFile(input), [strategy], bundleId ? { webBundleId: bundleId } : undefined);
  const bytes = signed.getSignedWebBundleBytes();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(`${outputPath}.sha256`, `${sha256}  ${path.basename(outputPath)}\n`);
  let version = null;
  try { version = JSON.parse(await readFile(path.join(path.dirname(outputPath), 'audit-report.json'), 'utf8')).bundleVersion ?? null; } catch { /* signing can be unit-tested without an audit report */ }
  const metadata = { input: path.basename(input), output: path.basename(outputPath), version, bytes: bytes.byteLength, sha256, webBundleId: derivedId, testKey: true };
  await writeFile(path.join(path.dirname(outputPath), 'release-manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.key) throw new Error('--key is required; use a disposable test key outside the repository');
  const input = options.input ?? await newestBundle();
  const output = options.out ?? input.replace(/\.wbn$/, '.swbn');
  const metadata = await signBundle(input, options.key, output, options.bundleId);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
