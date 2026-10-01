import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbResourceCache, MemoryResourceCache } from '../src/resources/resource-cache';
import { buildResourcePathCandidates, DEFAULT_RESOURCE_ROOTS, ResourceResolutionError, resolvePassiveResource } from '../src/resources/resource-resolver';
import { mapBinaryFixture } from './map-binary-fixture';

function response(status: number, bytes = new Uint8Array([1, 2]).buffer, contentType = 'application/octet-stream'): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': contentType }), arrayBuffer: async () => bytes } as Response;
}

function streamingResponse(bytes: ArrayBuffer, signal: AbortSignal, chunks: number, onChunk: (size: number) => void, onAbort: () => void): Response {
  const source = new Uint8Array(bytes);
  let timer: ReturnType<typeof setTimeout>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;
      const abort = () => {
        clearTimeout(timer);
        onAbort();
        controller.error(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      const emit = () => {
        const chunk = source.slice(Math.floor(index * source.length / chunks), Math.floor((index + 1) * source.length / chunks));
        index++;
        controller.enqueue(chunk);
        onChunk(chunk.length);
        if (index === chunks) {
          signal.removeEventListener('abort', abort);
          controller.close();
        } else timer = setTimeout(emit, 1_000);
      };
      timer = setTimeout(emit, 1_000);
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/octet-stream' } });
}

function downloadFixture(extension: string): ArrayBuffer {
  return ['rsw', 'gnd', 'gat'].includes(extension) ? mapBinaryFixture(extension) : new Uint8Array(1_200).fill(7).buffer;
}

describe('passive resource resolver', () => {
  it('reuses legacy resource caches without requiring new source or size metadata', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/a.bmp', new Uint8Array([9]).buffer, { sourceUrl: 'http://game.lastro.cn/ro/client_re/data/a.bmp', size: 99 });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(200, new Uint8Array([1]).buffer));
    expect(new Uint8Array(await resolvePassiveResource('data/a.bmp', { cache, fetch }))).toEqual(new Uint8Array([9]));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads passive binary bytes even when the resource server supplies an unexpected MIME type', async () => {
    const cache = new MemoryResourceCache();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(200, new Uint8Array([1]).buffer, 'application/javascript'));
    expect(new Uint8Array(await resolvePassiveResource('data/a.bmp', { cache, fetch }))).toEqual(new Uint8Array([1]));
    expect(await cache.match('data/a.bmp')).toMatchObject({ size: 1 });
  });
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
    await cache.put('data/map/prt.gat', mapBinaryFixture('gat', 7), { sourceUrl: 'cache://test' });
    const fetch = async () => { throw new Error('fetch should not run'); };
    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(mapBinaryFixture('gat', 7));
  });

  it('expires cached resources after the 30-day retention period', async () => {
    const cache = new MemoryResourceCache();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    await cache.put('data/map/prt.gat', mapBinaryFixture('gat', 7), {
      sourceUrl: 'cache://expired',
      savedAt: Date.now() - thirtyDays - 1,
    });
    const fetch = async () => response(200, mapBinaryFixture('gat', 8));

    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(mapBinaryFixture('gat', 8));
    await expect(cache.match('data/map/prt.gat')).resolves.toMatchObject({ sourceUrl: DEFAULT_RESOURCE_ROOTS[0] + 'data/map/prt.gat' });
  });

  it('does not trust a cache entry with an invalid timestamp', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/map/prt.gat', mapBinaryFixture('gat', 7), {
      sourceUrl: 'cache://invalid-time',
      savedAt: Number.NaN,
    });
    const fetch = async () => response(200, mapBinaryFixture('gat', 8));

    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(mapBinaryFixture('gat', 8));
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
        return response(200, mapBinaryFixture('gnd', 1));
      }
      await backupReady;
      return response(200, mapBinaryFixture('gnd', 2));
    };
    const result = await resolvePassiveResource('data/map/prt.gnd', {
      cache: new MemoryResourceCache(),
      fetch: fetch as typeof globalThis.fetch,
    });
    releaseBackup();
    expect(result).toEqual(mapBinaryFixture('gnd', 1));
    expect(urls).toEqual([
      DEFAULT_RESOURCE_ROOTS[0] + 'data/map/prt.gnd',
      DEFAULT_RESOURCE_ROOTS[1] + 'data/map/prt.gnd',
    ]);
  });

  it.each([0, 1])('uses origin %s when its body finishes first and cancels the pending body', async (winner) => {
    const cache = new MemoryResourceCache();
    let cancelled = false;
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.startsWith(DEFAULT_RESOURCE_ROOTS[winner]!)) return response(200, mapBinaryFixture('gnd', 9));
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
    expect(bytes).toEqual(mapBinaryFixture('gnd', 9));
    expect(cancelled).toBe(true);
    expect((await cache.match('data/prt.gnd'))?.sourceUrl).toBe(DEFAULT_RESOURCE_ROOTS[winner] + 'data/prt.gnd');
  });

  it('keeps trying backup path variants after the official origin fails', async () => {
    const fetch = async (url: string) => response(
      url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? 503 : url.endsWith('.GND') ? 404 : 200,
      mapBinaryFixture('gnd'),
    );
    await expect(resolvePassiveResource('data/Map.GND', { fetch: fetch as typeof globalThis.fetch }))
      .resolves.toEqual(mapBinaryFixture('gnd'));
  });

  it.each([0, 1])('falls back from invalid body on origin %s', async (invalidOrigin) => {
    const fetch = async (url: string) => response(200, url.startsWith(DEFAULT_RESOURCE_ROOTS[invalidOrigin]!)
      ? new TextEncoder().encode('<html>error</html>').buffer : mapBinaryFixture('gnd', 9));
    await expect(resolvePassiveResource('data/prt.gnd', { fetch: fetch as typeof globalThis.fetch }))
      .resolves.toEqual(mapBinaryFixture('gnd', 9));
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
      return url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? response(503) : response(200, mapBinaryFixture('gat', 9));
    };
    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch: fetch as typeof globalThis.fetch })).resolves.toEqual(mapBinaryFixture('gat', 9));
    expect(calls).toBe(2);
    await expect(cache.match('data/map/prt.gat')).resolves.toMatchObject({ sourceUrl: `${DEFAULT_RESOURCE_ROOTS[1]}data/map/prt.gat`, size: mapBinaryFixture('gat').byteLength });
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

  it.each(['data/texture/item/potion.bmp', 'data/sprite/poring.spr', 'data/sprite/poring.act'])('reuses persistent world-map resource %s without another server fetch', async path => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    try {
      const databaseName = `worldmap-persistent-${path}-${Math.random()}`;
      const fetch = vi.fn(async () => response(200, new Uint8Array([4, 5]).buffer, 'application/octet-stream'));
      await resolvePassiveResource(path, { cache: new IndexedDbResourceCache(databaseName), fetch: fetch as typeof globalThis.fetch });
      expect(fetch).toHaveBeenCalledTimes(1); fetch.mockClear();
      await expect(resolvePassiveResource(path, { cache: new IndexedDbResourceCache(databaseName), fetch: fetch as typeof globalThis.fetch })).resolves.toEqual(new Uint8Array([4, 5]).buffer);
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
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
    const fetch = async (url: string) => {
      urls.push(url);
      const kind = /\.(gat|gnd|rsw)$/i.exec(input)?.[1];
      return response(url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? 404 : 200, kind ? mapBinaryFixture(kind) : undefined);
    };
    await resolvePassiveResource(input, { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch });
    expect(urls).toEqual(DEFAULT_RESOURCE_ROOTS.map(root => root + encodeURI(expected)));
    expect(urls.map(decodeURIComponent).join('\n')).not.toMatch(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/);
  });
});

describe('resource download deadlines', () => {
  afterEach(() => { vi.useRealTimers(); });

  it.each(['rsw', 'gnd', 'gat', 'rsm', 'rsm2', 'str'])('lets a continuously arriving %s body finish after eight seconds', async extension => {
    vi.useFakeTimers();
    const cache = new MemoryResourceCache();
    const put = vi.spyOn(cache, 'put');
    const bytes = downloadFixture(extension);
    const path = `data/ein_fild04.${extension}`;
    const aborted = vi.fn();
    const chunks = vi.fn();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => url.startsWith(DEFAULT_RESOURCE_ROOTS[0])
      ? streamingResponse(bytes, init!.signal!, 12, chunks, aborted) : response(503));
    let settled = false;
    const outcome = resolvePassiveResource(path, { cache, fetch: fetch as typeof globalThis.fetch })
      .then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });

    await vi.advanceTimersByTimeAsync(8_001);
    expect(chunks).toHaveBeenCalledTimes(8);
    expect(aborted).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(put).not.toHaveBeenCalled();
    await expect(cache.match(path)).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(3_999);
    await expect(outcome).resolves.toEqual({ value: bytes });
    expect(aborted).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
    await expect(cache.match(path)).resolves.toMatchObject({ bytes, sourceUrl: DEFAULT_RESOURCE_ROOTS[0] + path });
  });

  it.each(['rsw', 'gnd', 'gat', 'rsm', 'rsm2', 'str'])('stops both incomplete %s bodies at sixty seconds without caching partial bytes', async extension => {
    vi.useFakeTimers();
    const cache = new MemoryResourceCache();
    const put = vi.spyOn(cache, 'put');
    const path = `data/ein_fild04.${extension}`;
    let receivedBytes = 0;
    const aborted = vi.fn();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => streamingResponse(
      downloadFixture(extension), init!.signal!, 120, size => { receivedBytes += size; }, aborted,
    ));
    let settled = false;
    const outcome = resolvePassiveResource(path, { cache, fetch: fetch as typeof globalThis.fetch })
      .then(value => { settled = true; return value; }, error => { settled = true; return error; });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(receivedBytes).toBeGreaterThan(0);
    expect(settled).toBe(false);
    expect(aborted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome as ResourceResolutionError;
    expect(error).toBeInstanceOf(ResourceResolutionError);
    expect(error.attempts).toEqual(DEFAULT_RESOURCE_ROOTS.map(root => ({ url: root + path, reason: 'download-timeout-60000ms' })));
    expect(error.message).toContain('download-timeout-60000ms');
    expect(aborted).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    await expect(cache.match(path)).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the eight-second default for an ordinary asset body and tries the backup', async () => {
    vi.useFakeTimers();
    const cache = new MemoryResourceCache();
    const put = vi.spyOn(cache, 'put');
    const path = 'data/texture/item/potion.bmp';
    const aborted = vi.fn();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => url.startsWith(DEFAULT_RESOURCE_ROOTS[0])
      ? streamingResponse(downloadFixture('bmp'), init!.signal!, 12, () => {}, aborted) : response(503));
    let settled = false;
    const outcome = resolvePassiveResource(path, { cache, fetch: fetch as typeof globalThis.fetch })
      .then(value => { settled = true; return value; }, error => { settled = true; return error; });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    expect(aborted).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome as ResourceResolutionError;
    expect(error).toBeInstanceOf(ResourceResolutionError);
    expect(error.attempts).toEqual([
      { url: DEFAULT_RESOURCE_ROOTS[0] + path, reason: 'download-timeout-8000ms' },
      { url: DEFAULT_RESOURCE_ROOTS[1] + path, reason: 'http-503' },
    ]);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    await expect(cache.match(path)).resolves.toBeNull();
  });

  it.each(['gnd', 'bmp'])('honors a shorter explicit timeout for %s', async extension => {
    vi.useFakeTimers();
    const cache = new MemoryResourceCache();
    const path = `data/test.${extension}`;
    const aborted = vi.fn();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => streamingResponse(
      downloadFixture(extension), init!.signal!, 12, () => {}, aborted,
    ));
    const outcome = resolvePassiveResource(path, { cache, fetch: fetch as typeof globalThis.fetch, timeoutMs: 1_500 })
      .catch(error => error as ResourceResolutionError);

    await vi.advanceTimersByTimeAsync(extension === 'gnd' ? 1_500 : 3_000);
    const error = await outcome as ResourceResolutionError;
    expect(error).toBeInstanceOf(ResourceResolutionError);
    expect(error.attempts).toEqual(DEFAULT_RESOURCE_ROOTS.map(root => ({ url: root + path, reason: 'download-timeout-1500ms' })));
    expect(aborted).toHaveBeenCalledTimes(2);
    await expect(cache.match(path)).resolves.toBeNull();
  });

  it.each([
    ['gnd', 90_000, 70],
    ['bmp', 20_000, 12],
  ] as const)('honors a longer explicit timeout for %s', async (extension, timeoutMs, chunks) => {
    vi.useFakeTimers();
    const cache = new MemoryResourceCache();
    const path = `data/test.${extension}`;
    const bytes = downloadFixture(extension);
    const aborted = vi.fn();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => url.startsWith(DEFAULT_RESOURCE_ROOTS[0])
      ? streamingResponse(bytes, init!.signal!, chunks, () => {}, aborted) : response(503));
    const outcome = resolvePassiveResource(path, { cache, fetch: fetch as typeof globalThis.fetch, timeoutMs })
      .then(value => ({ value }), error => ({ error }));

    await vi.advanceTimersByTimeAsync(chunks * 1_000);
    await expect(outcome).resolves.toEqual({ value: bytes });
    expect(aborted).not.toHaveBeenCalled();
    await expect(cache.match(path)).resolves.toMatchObject({ bytes });
  });
});
