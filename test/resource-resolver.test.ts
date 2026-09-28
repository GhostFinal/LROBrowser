import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbResourceCache, MemoryResourceCache } from '../src/resources/resource-cache';
import { buildResourcePathCandidates, DEFAULT_RESOURCE_ROOTS, ResourceResolutionError, resolvePassiveResource } from '../src/resources/resource-resolver';

function response(status: number, bytes = new Uint8Array([1, 2]).buffer, contentType = 'application/octet-stream'): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': contentType }), arrayBuffer: async () => bytes } as Response;
}

describe('passive resource resolver', () => {
  it('loads native login assets from the official GBK interface directory after HTML or 404 candidates', async () => {
    for (const [input, available] of [
      ['data/texture/유저인터페이스/login_interface/win_login.bmp', 'data/texture/蜡历牢磐其捞胶/login_interface/win_login.bmp'],
      ['data/texture/유저인터페이스/t_¹è°æ1-1.bmp', 'data/texture/蜡历牢磐其捞胶/t_硅版1-1.bmp'],
    ]) {
      const urls: string[] = [];
      const cache = new MemoryResourceCache();
      const fetch = async (url: string) => {
        urls.push(url);
        if (url === DEFAULT_RESOURCE_ROOTS[0] + encodeURI(available!)) return response(200, new Uint8Array([66, 77]).buffer);
        return urls.length === 1 ? response(200, new TextEncoder().encode('<html>missing</html>').buffer, 'text/html') : response(404);
      };
      await expect(resolvePassiveResource(input!, { cache, fetch: fetch as typeof globalThis.fetch }))
        .resolves.toEqual(new Uint8Array([66, 77]).buffer);
      expect(urls.every(url => url.startsWith(DEFAULT_RESOURCE_ROOTS[0]))).toBe(true);
      expect((await cache.match(input!))?.sourceUrl).toBe(DEFAULT_RESOURCE_ROOTS[0] + encodeURI(available!));
    }
  });

  it('serves a cache hit without calling fetch', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/map/prt.gat', new Uint8Array([7]).buffer, { sourceUrl: 'cache://test' });
    const fetch = async () => { throw new Error('fetch should not run'); };
    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(new Uint8Array([7]).buffer);
  });

  it('expires cached resources after the 30-day retention period', async () => {
    const cache = new MemoryResourceCache();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    await cache.put('data/map/prt.gat', new Uint8Array([7]).buffer, {
      sourceUrl: 'cache://expired',
      savedAt: Date.now() - thirtyDays - 1,
    });
    const fetch = async () => response(200, new Uint8Array([8]).buffer);

    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(new Uint8Array([8]).buffer);
    await expect(cache.match('data/map/prt.gat')).resolves.toMatchObject({ sourceUrl: DEFAULT_RESOURCE_ROOTS[0] + 'data/map/prt.gat' });
  });

  it('does not trust a cache entry with an invalid timestamp', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/map/prt.gat', new Uint8Array([7]).buffer, {
      sourceUrl: 'cache://invalid-time',
      savedAt: Number.NaN,
    });
    const fetch = async () => response(200, new Uint8Array([8]).buffer);

    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(new Uint8Array([8]).buffer);
  });

  it('keeps original logical paths for existing caches and packaged executables', async () => {
    const cache = new MemoryResourceCache();
    const path = 'data/wav/버튼소리.wav';
    await cache.put(path, new Uint8Array([7]).buffer, { sourceUrl: 'cache://test' });
    const fetch = async () => { throw new Error('unexpected remote request'); };
    await expect(resolvePassiveResource(path, { cache, fetch })).resolves.toEqual(new Uint8Array([7]).buffer);
    const script = 'data/배경.lua';
    await expect(resolvePassiveResource(script, { fetch, packageLookup: async name => {
      expect(name).toBe(script);
      return new Uint8Array([8]).buffer;
    } })).resolves.toEqual(new Uint8Array([8]).buffer);
  });

  it('races both origins for map resources and uses the first successful response', async () => {
    const urls: string[] = [];
    let releaseBackup!: () => void;
    const backupReady = new Promise<void>((resolve) => { releaseBackup = resolve; });
    const fetch = async (url: string) => {
      urls.push(url);
      if (url.startsWith(DEFAULT_RESOURCE_ROOTS[0])) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return response(200, new Uint8Array([1]).buffer);
      }
      await backupReady;
      return response(200, new Uint8Array([2]).buffer);
    };
    const result = await resolvePassiveResource('data/map/prt.gnd', {
      cache: new MemoryResourceCache(),
      fetch: fetch as typeof globalThis.fetch,
    });
    releaseBackup();
    expect(result).toEqual(new Uint8Array([1]).buffer);
    expect(urls).toEqual([
      DEFAULT_RESOURCE_ROOTS[0] + 'data/map/prt.gnd',
      DEFAULT_RESOURCE_ROOTS[1] + 'data/map/prt.gnd',
    ]);
  });

  it.each([0, 1])('uses origin %s when its body finishes first and cancels the pending body', async (winner) => {
    const cache = new MemoryResourceCache();
    let cancelled = false;
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.startsWith(DEFAULT_RESOURCE_ROOTS[winner]!)) return response(200, new Uint8Array([9]).buffer);
      return {
        ...response(200),
        arrayBuffer: () => new Promise<ArrayBuffer>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => {
            cancelled = true;
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
      } as Response;
    };
    const bytes = await resolvePassiveResource('data/prt.gnd', { cache, fetch: fetch as typeof globalThis.fetch });
    expect(bytes).toEqual(new Uint8Array([9]).buffer);
    expect(cancelled).toBe(true);
    expect((await cache.match('data/prt.gnd'))?.sourceUrl).toBe(DEFAULT_RESOURCE_ROOTS[winner] + 'data/prt.gnd');
  });

  it('keeps trying backup path variants after the official origin fails', async () => {
    const fetch = async (url: string) => response(
      url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? 503 : url.endsWith('.GND') ? 404 : 200,
    );
    await expect(resolvePassiveResource('data/Map.GND', { fetch: fetch as typeof globalThis.fetch }))
      .resolves.toEqual(new Uint8Array([1, 2]).buffer);
  });

  it.each([0, 1])('falls back from invalid body on origin %s', async (invalidOrigin) => {
    const fetch = async (url: string) => response(200, url.startsWith(DEFAULT_RESOURCE_ROOTS[invalidOrigin]!)
      ? new TextEncoder().encode('<html>error</html>').buffer : new Uint8Array([9]).buffer);
    await expect(resolvePassiveResource('data/prt.gnd', { fetch: fetch as typeof globalThis.fetch }))
      .resolves.toEqual(new Uint8Array([9]).buffer);
  });

  it('tries official candidates before the backup source', async () => {
    const urls: string[] = [];
    const candidateCount = buildResourcePathCandidates('data/texture/Map.BMP').length;
    const fetch = async (url: string) => {
      urls.push(url);
      return response(url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) && urls.length < candidateCount + 1 ? 404 : 200);
    };
    await resolvePassiveResource('data/texture/Map.BMP', { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch });
    expect(urls.slice(0, candidateCount).every((url) => url.startsWith(DEFAULT_RESOURCE_ROOTS[0]))).toBe(true);
    expect(urls.at(-1)).toMatch(new RegExp(`^${DEFAULT_RESOURCE_ROOTS[1]}`));
  });

  it('falls back after official failure and stores backup bytes', async () => {
    const cache = new MemoryResourceCache();
    let calls = 0;
    const fetch = async (url: string) => {
      calls++;
      return url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? response(503) : response(200, new Uint8Array([9]).buffer);
    };
    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch: fetch as typeof globalThis.fetch })).resolves.toEqual(new Uint8Array([9]).buffer);
    expect(calls).toBe(2);
    await expect(cache.match('data/map/prt.gat')).resolves.toMatchObject({ sourceUrl: `${DEFAULT_RESOURCE_ROOTS[1]}data/map/prt.gat`, size: 1 });
  });

  it.each([
    ['http-503', () => response(503)],
    ['abort-error', () => { throw new DOMException('The operation was aborted', 'AbortError'); }],
    ['network-error', () => { throw new Error('fetch failed'); }],
  ])('enters the backup root after an official %s failure', async (_name, officialFailure) => {
    const urls: string[] = [];
    const input = 'data/sprite/normal_검광.spr';
    const fetch = async (url: string) => {
      urls.push(url);
      if (url.startsWith(DEFAULT_RESOURCE_ROOTS[0])) return officialFailure();
      return response(200, new Uint8Array([9]).buffer);
    };

    await expect(resolvePassiveResource(input, {
      cache: new MemoryResourceCache(),
      fetch: fetch as typeof globalThis.fetch,
    })).resolves.toEqual(new Uint8Array([9]).buffer);
    expect(urls[0]).toBe(`${DEFAULT_RESOURCE_ROOTS[0]}data/sprite/normal_%E5%85%AB%E5%A0%A1.spr`);
    expect(urls[1]).toBe(`${DEFAULT_RESOURCE_ROOTS[1]}data/sprite/normal_%E5%85%AB%E5%A0%A1.spr`);
  });

  it('persists successful resources in IndexedDB so a new cache instance can reuse them', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const databaseName = `lastro-resource-cache-${Date.now()}-${Math.random()}`;
    const firstCache = new IndexedDbResourceCache(databaseName);
    await firstCache.put('data/map/prt.gat', new Uint8Array([4, 5]).buffer, { sourceUrl: DEFAULT_RESOURCE_ROOTS[1] + 'data/map/prt.gat' });

    const secondCache = new IndexedDbResourceCache(databaseName);
    await expect(secondCache.match('data/map/prt.gat')).resolves.toMatchObject({
      sourceUrl: DEFAULT_RESOURCE_ROOTS[1] + 'data/map/prt.gat',
      size: 2,
    });
    vi.unstubAllGlobals();
  });

  it('rejects HTML and reports structured failures after both roots fail', async () => {
    const fetch = async () => response(200, new Uint8Array([60, 104, 116, 109, 108]).buffer, 'text/html');
    await expect(resolvePassiveResource('data/map/prt.gat', { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch })).rejects.toMatchObject({
      name: 'ResourceResolutionError', path: 'data/map/prt.gat'
    });
    try {
      await resolvePassiveResource('data/map/prt.gat', { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch });
    } catch (error) {
      expect(error).toBeInstanceOf(ResourceResolutionError);
      expect((error as ResourceResolutionError).attempts.length).toBeGreaterThan(0);
    }
  });

  it('never fetches a package-only or forbidden path', async () => {
    const fetch = async () => response(200);
    await expect(resolvePassiveResource('data/script.lua', { fetch })).rejects.toMatchObject({ name: 'ResourceResolutionError' });
    await expect(resolvePassiveResource('../secret.exe', { fetch })).rejects.toMatchObject({ name: 'ResourceResolutionError' });
  });

  it('uses GBK-decoded legacy bytes and keeps sprite fallbacks without Korean URLs', () => {
    const mojibake = `data/sprite/${String.fromCharCode(0xb0, 0xa1)}/normal.act`;
    expect(buildResourcePathCandidates(mojibake)).toEqual([
      'data/sprite/%E5%95%8A/normal.act'
    ]);
    const sprite = buildResourcePathCandidates('data/sprite/normal_검광.ACT');
    expect(sprite).toContain('data/sprite/normal.ACT');
    expect(sprite).toContain('data/sprite/normal.act');
  });

  it('preserves already published CJK names without converting them back to Korean', () => {
    const path = 'data/sprite/牢埃练/鸥炼胶唱捞欺/鸥炼胶唱捞欺_巢_劝.act';
    const candidates = buildResourcePathCandidates(path);
    expect(candidates[0]).toBe('data/sprite/%E7%89%A2%E5%9F%83%E7%BB%83/%E9%B8%A5%E7%82%BC%E8%83%B6%E5%94%B1%E6%8D%9E%E6%AC%BA/%E9%B8%A5%E7%82%BC%E8%83%B6%E5%94%B1%E6%8D%9E%E6%AC%BA_%E5%B7%A2_%E5%8A%9D.act');
    expect(candidates.map(decodeURIComponent)).toEqual([path]);
    expect(candidates.length).toBeLessThanOrEqual(12);
  });

  it.each([
    ['data/texture/유저인터페이스/t_¹è°æ1-1.bmp', 'data/texture/蜡历牢磐其捞胶/t_硅版1-1.bmp'],
    ['data/sprite/인간족/몸통/남/초보자_남.spr', 'data/sprite/牢埃练/个烹/巢/檬焊磊_巢.spr'],
    ['data/sprite/인간족/몸통/여/초보자_여.act', 'data/sprite/牢埃练/个烹/咯/檬焊磊_咯.act'],
    ['data/model/배경/검사.rsm', 'data/model/硅版/八荤.rsm'],
    ['data/texture/배경/검사.bmp', 'data/texture/硅版/八荤.bmp'],
    ['data/wav/버튼소리.wav', 'data/wav/滚瓢家府.wav'],
    ['data/배경.gnd', 'data/硅版.gnd'],
    ['data/배경.gat', 'data/硅版.gat'],
    ['data/배경.rsw', 'data/硅版.rsw'],
    ['BGM/01.mp3', 'BGM/01.mp3'],
    ['data/model/中文_배경.rsm', 'data/model/中文_硅版.rsm'],
  ])('normalizes the entire remote path %s before either origin is contacted', async (input, expected) => {
    const urls: string[] = [];
    const fetch = async (url: string) => { urls.push(url); return response(url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? 404 : 200); };
    await resolvePassiveResource(input, { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch });
    expect(urls).toEqual(DEFAULT_RESOURCE_ROOTS.map(root => root + encodeURI(expected)));
    expect(urls.map(decodeURIComponent).join('\n')).not.toMatch(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/);
  });
});
