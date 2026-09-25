export type ResourceClassification = 'packaged-executable' | 'remote-passive' | 'forbidden';

const packagedExtensions = new Set(['js', 'mjs', 'cjs', 'wasm', 'lua', 'lub']);
const passiveExtensions = new Set([
  'gat', 'gnd', 'rsw', 'rsm', 'str', 'spr', 'act', 'gr2',
  'bmp', 'tga', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'dds',
  'mp3', 'wav', 'ogg', 'opus', 'flac'
]);

export function normalizeResourcePath(resourcePath: string): string {
  if (typeof resourcePath !== 'string') return '';
  if (resourcePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(resourcePath)) return '';
  const normalized = resourcePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return '';
  return normalized;
}

export function classifyResource(resourcePath: string): ResourceClassification {
  const normalized = normalizeResourcePath(resourcePath);
  if (!normalized) return 'forbidden';
  const extension = normalized.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
  if (packagedExtensions.has(extension)) return 'packaged-executable';
  if (passiveExtensions.has(extension)) return 'remote-passive';
  return 'forbidden';
}
