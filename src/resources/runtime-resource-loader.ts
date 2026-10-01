import { createResourceCache } from './resource-cache';
import { createDirectHttpFetch } from './direct-http-resource';
import { normalizeResourcePath } from './resource-policy';
import { resolvePassiveResource } from './resource-resolver';

export interface PackageResourceEntry { readonly path: string; }

export function snapshotPackageManifest(files: unknown): readonly PackageResourceEntry[] {
  if (!Array.isArray(files)) throw new Error('Invalid package resource manifest');
  return Object.freeze(files.map((file: unknown) => {
    if (!file || typeof file !== 'object' || !('path' in file) || typeof file.path !== 'string') {
      throw new Error('Invalid package resource entry');
    }
    return Object.freeze({ ...file, path: file.path });
  }));
}

interface RuntimeResourceOptions {
  packageBaseUrl: string;
  getManifest: () => readonly { path: string }[] | undefined;
  getCharset: () => string | undefined;
}

// Bundled as a classic worker script; all reads share one IndexedDB connection.
export function createRuntimeResourceLoader(options: RuntimeResourceOptions): (path: string) => Promise<ArrayBuffer> {
  const cache = createResourceCache();
  const directHttpFetch = createDirectHttpFetch({ nativeFetch: globalThis.fetch });
  const inFlight = new Map<string, Promise<ArrayBuffer>>();
  return (path) => {
    const normalizedPath = normalizeResourcePath(path);
    const charset = options.getCharset();
    // Invalid names must each reach the resolver's own rejection, not share an
    // empty normalization key with unrelated requests.
    const key = normalizedPath ? JSON.stringify([normalizedPath, charset]) : null;
    let loading = key ? inFlight.get(key) : undefined;
    if (!loading) {
      loading = resolvePassiveResource(path, {
        cache,
        fetch: directHttpFetch,
        primaryCharset: charset,
        packageLookup: async (normalizedPath) => {
          const entry = options.getManifest()?.find(file => file.path.toLowerCase() === normalizedPath.toLowerCase());
          if (!entry) return null;
          if (normalizeResourcePath(entry.path) !== entry.path) throw new Error('Invalid package resource path');
          const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
          const response = await fetch(new URL(encodedPath, options.packageBaseUrl), { redirect: 'error', credentials: 'omit' });
          if (!response.ok) throw new Error(`Package resource failed (${response.status}): ${entry.path}`);
          const bytes = await response.arrayBuffer();
          if (!bytes.byteLength || (response.headers.get('content-type') ?? '').includes('text/html')) {
            throw new Error(`Invalid package resource: ${entry.path}`);
          }
          return bytes;
        },
      });
      if (key) {
        loading = loading.finally(() => { inFlight.delete(key); });
        inFlight.set(key, loading);
      }
    }
    // Native worker callers may transfer their result. Never hand out the
    // shared request buffer, or one transfer would detach another caller's data.
    return loading.then(bytes => bytes.slice(0));
  };
}
