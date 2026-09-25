import { classifyResource, normalizeResourcePath } from './resource-policy';
import { createResourceCache, type ResourceCache } from './resource-cache';

export const DEFAULT_RESOURCE_ROOTS = Object.freeze([
  'https://game.lastro.cn/ro/client_re/',
  'https://clientdata.ltsd.ro/ro/client_re/'
] as const);

export class ResourceResolutionError extends Error {
  readonly path: string;
  readonly attempts: readonly ResourceAttempt[];

  constructor(path: string, attempts: ResourceAttempt[]) {
    super(`Unable to resolve passive resource: ${path}`);
    this.name = 'ResourceResolutionError';
    this.path = path;
    this.attempts = attempts;
  }
}

export interface ResourceAttempt {
  url: string;
  reason: string;
}

export interface ResolvePassiveResourceOptions {
  cache?: ResourceCache;
  fetch?: typeof globalThis.fetch;
  resourceRoots?: readonly string[];
  packageLookup?: (path: string) => Promise<ArrayBuffer | null>;
  primaryCharset?: string;
  fallbackCharset?: string;
  timeoutMs?: number;
}

function hasSingleByteMojibake(segment: string): boolean {
  let hasHighByte = false;
  for (const character of segment) {
    const code = character.charCodeAt(0);
    if (code > 255) return false;
    hasHighByte ||= code >= 128;
  }
  return hasHighByte && segment.length > 1;
}

function decodeSegment(segment: string, charset: string): string {
  if (!charset || !hasSingleByteMojibake(segment)) return segment;
  try {
    const decoded = new TextDecoder(charset).decode(Uint8Array.from(segment, (character) => character.charCodeAt(0)));
    if (!decoded.includes('\ufffd')) return decoded;
  } catch { return segment; }
  return segment;
}

function decodeMixedSegment(segment: string, charset: string): string {
  if (!charset) return segment;
  return segment.replace(/[\u0080-\u00ff]+/g, (run) => decodeSegment(run, charset));
}

const legacyEncoderCache = new Map<string, Map<string, number[]> | null>();

function getLegacyEncoder(charset: string): Map<string, number[]> | null {
  if (legacyEncoderCache.has(charset)) return legacyEncoderCache.get(charset) ?? null;
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(charset); } catch { legacyEncoderCache.set(charset, null); return null; }
  const encoder = new Map<string, number[]>();
  const bytes = new Uint8Array(2);
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    bytes[0] = lead;
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      bytes[1] = trail;
      const decoded = decoder.decode(bytes);
      if (decoded.length === 1 && !decoded.includes('\ufffd') && !encoder.has(decoded)) encoder.set(decoded, [lead, trail]);
    }
  }
  legacyEncoderCache.set(charset, encoder);
  return encoder;
}

function transcodeCjkRuns(segment: string, sourceCharset: string, targetCharset: string): string {
  if (!sourceCharset || !targetCharset || !/[\u3400-\u9fff\uf900-\ufaff]/.test(segment)) return segment;
  const encoder = getLegacyEncoder(sourceCharset);
  if (!encoder) return segment;
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(targetCharset); } catch { return segment; }
  return segment.replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, (run) => {
    const bytes: number[] = [];
    for (const character of run) {
      const encoded = encoder.get(character);
      if (!encoded) return run;
      bytes.push(...encoded);
    }
    const decoded = decoder.decode(Uint8Array.from(bytes));
    return decoded.includes('\ufffd') || !/[\u3131-\u318e\uac00-\ud7a3]/.test(decoded) ? run : decoded;
  });
}

function encodeResourcePath(resourcePath: string): string {
  return resourcePath.replace(/[^/]+/g, (segment) => encodeURIComponent(segment));
}

function addLegacySpriteFallbacks(resourcePath: string): string[] {
  const fallback = resourcePath.replace(/_(?:검광|八堡)\.(spr|act)$/i, '.$1');
  return fallback === resourcePath ? [resourcePath] : [resourcePath, fallback];
}

export function buildResourcePathCandidates(resourcePath: string, primaryCharset = 'gbk', fallbackCharset = 'euc-kr'): string[] {
  const normalizedPath = resourcePath.replace(/\\/g, '/');
  const variants = [
    normalizedPath,
    normalizedPath.split('/').map((segment) => decodeMixedSegment(segment, primaryCharset)).join('/'),
    normalizedPath.split('/').map((segment) => decodeMixedSegment(segment, fallbackCharset)).join('/'),
    normalizedPath.split('/').map((segment) => transcodeCjkRuns(segment, primaryCharset, fallbackCharset)).join('/'),
  ];
  const restoredCjkPath = variants[3] ?? normalizedPath;
  variants.push(
    restoredCjkPath.split('/').map((segment) => decodeMixedSegment(segment, primaryCharset)).join('/'),
    restoredCjkPath.split('/').map((segment) => decodeMixedSegment(segment, fallbackCharset)).join('/')
  );
  const candidates: string[] = [];
  const addCandidate = (value: string) => {
    const encoded = encodeResourcePath(value);
    if (candidates.length < 12 && !candidates.includes(encoded)) candidates.push(encoded);
  };
  const lowercaseExtension = (value: string) => value.replace(/([^/]+\.)([^/.]+)$/i, (_match, base, extension) => base + extension.toLowerCase());
  for (const variant of variants) addCandidate(variant);
  for (const variant of variants) addCandidate(lowercaseExtension(variant));
  if (/^data\/texture\/[^/]+\/item\/[a-z0-9_]+\.bmp$/i.test(normalizedPath)) {
    for (const variant of variants) addCandidate(variant.replace(/[^/]+$/, (filename) => filename.toLowerCase()));
  }
  for (const fallback of addLegacySpriteFallbacks(normalizedPath).slice(1)) addCandidate(fallback);
  for (const fallback of addLegacySpriteFallbacks(normalizedPath).slice(1)) addCandidate(lowercaseExtension(fallback));
  return candidates;
}

function normalizeRoot(root: string): string {
  if (!DEFAULT_RESOURCE_ROOTS.some(allowed => root === allowed)) throw new Error('Unapproved resource root');
  return root;
}

function header(response: Response, name: string): string | undefined {
  const value = response.headers?.get(name);
  return value || undefined;
}

async function fetchResource(url: string, options: ResolvePassiveResourceOptions): Promise<{ bytes: ArrayBuffer; response: Response }> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch-unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs ?? 8000));
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', credentials: 'omit' });
    if (!response.ok) throw new Error(`http-${response.status}`);
    const contentType = header(response, 'content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) throw new Error('html-response');
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('empty-response');
    const sample = new TextDecoder().decode(bytes.slice(0, 64)).trimStart().toLowerCase();
    if (sample.startsWith('<!doctype html') || sample.startsWith('<html')) throw new Error('html-response');
    return { bytes, response };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePassiveResource(resourcePath: string, options: ResolvePassiveResourceOptions = {}): Promise<ArrayBuffer> {
  const normalizedPath = normalizeResourcePath(resourcePath);
  const classification = classifyResource(normalizedPath);
  const attempts: ResourceAttempt[] = [];
  if (classification === 'forbidden') throw new ResourceResolutionError(resourcePath, [{ url: resourcePath, reason: 'forbidden-resource' }]);
  if (options.packageLookup) {
    const packaged = await options.packageLookup(normalizedPath);
    if (packaged) return packaged.slice(0);
  }
  if (classification === 'packaged-executable') throw new ResourceResolutionError(normalizedPath, [{ url: normalizedPath, reason: 'package-only-resource' }]);
  const cache = options.cache ?? createResourceCache();
  const cached = await cache.match(normalizedPath).catch(() => null);
  if (cached?.bytes.byteLength) return cached.bytes.slice(0);
  const candidates = buildResourcePathCandidates(normalizedPath, options.primaryCharset, options.fallbackCharset);
  const roots = (options.resourceRoots ?? DEFAULT_RESOURCE_ROOTS).map(normalizeRoot);
  if (roots.join('|') !== DEFAULT_RESOURCE_ROOTS.join('|')) throw new Error('Resource root order is fixed');
  for (const root of roots) {
    for (const candidate of candidates) {
      const url = root + candidate;
      try {
        const result = await fetchResource(url, options);
        const metadata = {
          sourceUrl: url,
          ...(header(result.response, 'etag') ? { etag: header(result.response, 'etag') } : {}),
          ...(header(result.response, 'last-modified') ? { lastModified: header(result.response, 'last-modified') } : {})
        };
        await cache.put(normalizedPath, result.bytes, metadata).catch(() => {});
        return result.bytes;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'fetch-failed';
        attempts.push({ url, reason });
        if (!reason.startsWith('http-404')) break;
      }
    }
  }
  throw new ResourceResolutionError(normalizedPath, attempts);
}
