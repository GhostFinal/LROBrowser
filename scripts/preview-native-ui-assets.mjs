import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { build } from 'esbuild';

export async function cacheNativeUiAssets(assets, directory) {
  const bundle = await build({ entryPoints: ['src/resources/resource-resolver.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
  const resolver = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const origins = new Set(['https://game.lastro.cn', 'https://rodata.ltsd.ro']);
  const manifest = {}, failures = [];
  await mkdir(directory, { recursive: true });
  await Promise.all([...new Set(assets)].map(async asset => {
    const filename = createHash('sha256').update(asset).digest('hex').slice(0, 24) + '.bmp';
    try {
      let cached;
      for (const cache of [directory, 'generated/mail-assets', 'generated/tools-panels-assets', 'generated/chat-map-links-assets']) {
        try {
          const bytes = await readFile(cache + '/' + filename);
          if (bytes[0] === 66 && bytes[1] === 77) { cached = bytes; break; }
        } catch { /* Fetch a missing passive resource below. */ }
      }
      if (cached) await writeFile(directory + '/' + filename, cached);
      else {
        const candidates = resolver.buildResourcePathCandidates('data/texture/유저인터페이스/' + asset);
        let downloaded = false;
        for (const candidate of candidates) {
          for (const root of resolver.DEFAULT_RESOURCE_ROOTS) {
            const url = new URL(candidate, root);
            if (!origins.has(url.origin)) throw new Error('Unexpected passive resource origin');
            try {
              const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(10000), redirect: 'error' });
              if (!response.ok) continue;
              const bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes[0] !== 66 || bytes[1] !== 77) continue;
              await writeFile(directory + '/' + filename, bytes); downloaded = true; break;
            } catch { /* Try the next allowlisted passive path. */ }
          }
          if (downloaded) break;
        }
        if (!downloaded) throw new Error('Native BMP unavailable');
      }
      manifest[asset] = filename;
    } catch (error) { failures.push(asset + ': ' + error.message); }
  }));
  await writeFile(directory + '/index.json', JSON.stringify(manifest, null, 2) + '\n');
  return { manifest, failures };
}

export const NATIVE_BMP_PREVIEW_SOURCE = String.raw`
const decoded = new Map();
function assetError(error) { document.body.dataset.assetFailure = 'true'; document.getElementById('assets').textContent = error.message; }
function decodeBmp(asset) {
  if (!decoded.has(asset)) decoded.set(asset, new Promise((resolve, reject) => {
    const filename = manifest[asset];
    if (!filename) { reject(new Error('Missing native BMP: ' + asset)); return; }
    const image = new Image();
    image.onerror = () => reject(new Error('Cannot load native BMP: ' + asset));
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (pixels.data[offset] === 255 && pixels.data[offset + 1] === 0 && pixels.data[offset + 2] === 255) pixels.data[offset + 3] = 0;
      }
      context.putImageData(pixels, 0, 0); resolve(canvas.toDataURL());
    };
    image.src = './' + assetDirectory + '/' + filename;
  }));
  return decoded.get(asset);
}
`;
