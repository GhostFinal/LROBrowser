import { createResourceCache } from './resource-cache';
import { normalizeResourcePath } from './resource-policy';
import { resolvePassiveResource } from './resource-resolver';

interface RuntimeResourceOptions {
  packageBaseUrl: string;
  getManifest: () => readonly { path: string }[] | undefined;
  getCharset: () => string | undefined;
}

// Bundled as a classic worker script; all reads share one IndexedDB connection.
export function createRuntimeResourceLoader(options: RuntimeResourceOptions): (path: string) => Promise<ArrayBuffer> {
  const cache = createResourceCache();
  return (path) => resolvePassiveResource(path, {
    cache,
    primaryCharset: options.getCharset(),
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
}
