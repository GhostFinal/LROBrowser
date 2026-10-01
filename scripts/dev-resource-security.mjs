import path from 'node:path';
import { existsSync, realpathSync, statSync } from 'node:fs';
/* eslint-disable no-control-regex -- Reject control characters in request paths. */

export function requestPath(url) {
  let pathname;
  try { pathname = decodeURIComponent((url || '').split('?')[0]); }
  catch { throw new Error('invalid-request-path'); }
  if (!pathname.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(pathname)) throw new Error('invalid-request-path');
  return pathname;
}

export function isLocalRequest(host, origin) {
  if (typeof host !== 'string' || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  if (!origin) return true;
  if (/^isolated-app:\/\/[a-z2-7]{56}$/.test(origin)) return true;
  try {
    const url = new globalThis.URL(origin);
    return url.protocol === 'http:' && !url.username && !url.password && url.host === host && url.origin === origin;
  } catch { return false; }
}

export function resolveStagedResource(root, url) {
  const pathname = requestPath(url);
  let base, relative;
  if (pathname === '/runtime/Online.js' || pathname === '/runtime/LastROThreadEventHandler.js') {
    base = path.resolve(root, 'generated/runtime'); relative = pathname.slice(9);
  } else if (pathname.startsWith('/runtime/')) {
    base = path.resolve(root, 'generated/core/runtime'); relative = pathname.slice(9);
  } else if (pathname.startsWith('/core/')) {
    base = path.resolve(root, 'generated/core'); relative = pathname.slice(6);
  } else return null;
  if (!relative || relative.includes('%') || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('invalid-resource-path');
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep)) throw new Error('invalid-resource-path');
  if (!existsSync(file)) return { file, exists: false };
  // Do not allow a symlink/junction inside staging to expose another directory.
  const actual = realpathSync(file), actualBase = realpathSync(base);
  if (!actual.startsWith(actualBase + path.sep) || !statSync(actual).isFile()) throw new Error('invalid-resource-path');
  return { file: actual, exists: true };
}
