import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
const path = 'dist/.well-known/manifest.webmanifest';
const manifest = JSON.parse(await readFile(path, 'utf8'));
if (!process.env.IWA_VERSION || !process.env.IWA_UPDATE_MANIFEST_URL) throw new Error('IWA_VERSION and IWA_UPDATE_MANIFEST_URL are required');
manifest.version = process.env.IWA_VERSION;
manifest.update_manifest_url = process.env.IWA_UPDATE_MANIFEST_URL;
await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
