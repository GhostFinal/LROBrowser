import { describe, expect, it } from 'vitest';
import { MemoryResourceCache } from '../src/resources/resource-cache';
import { buildResourcePathCandidates, DEFAULT_RESOURCE_ROOTS, ResourceResolutionError, resolvePassiveResource } from '../src/resources/resource-resolver';

function response(status: number, bytes = new Uint8Array([1, 2]).buffer, contentType = 'application/octet-stream'): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': contentType }), arrayBuffer: async () => bytes } as Response;
}

describe('passive resource resolver', () => {
  it('serves a cache hit without calling fetch', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/map/prt.gat', new Uint8Array([7]).buffer, { sourceUrl: 'cache://test' });
    const fetch = async () => { throw new Error('fetch should not run'); };
    await expect(resolvePassiveResource('data/map/prt.gat', { cache, fetch })).resolves.toEqual(new Uint8Array([7]).buffer);
  });

  it('tries official candidates before the backup source', async () => {
    const urls: string[] = [];
    const candidateCount = buildResourcePathCandidates('data/map/Map.GAT').length;
    const fetch = async (url: string) => {
      urls.push(url);
      return response(url.startsWith(DEFAULT_RESOURCE_ROOTS[0]) && urls.length < candidateCount + 1 ? 404 : 200);
    };
    await resolvePassiveResource('data/map/Map.GAT', { cache: new MemoryResourceCache(), fetch: fetch as typeof globalThis.fetch });
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

  it('keeps legacy GBK/EUC-KR candidate order and sprite fallbacks', () => {
    const mojibake = `data/sprite/${String.fromCharCode(0xb0, 0xa1)}/normal.act`;
    expect(buildResourcePathCandidates(mojibake)).toEqual([
      encodeURI(mojibake).replace(/%25/g, '%'),
      'data/sprite/%E5%95%8A/normal.act',
      'data/sprite/%EA%B0%80/normal.act'
    ]);
    const sprite = buildResourcePathCandidates('data/sprite/normal_검광.ACT');
    expect(sprite).toContain('data/sprite/normal.ACT');
    expect(sprite).toContain('data/sprite/normal.act');
  });

  it('recovers mixed CJK segments without exceeding the candidate bound', () => {
    const path = 'data/sprite/牢埃练/鸥炼胶唱捞欺/鸥炼胶唱捞欺_巢_劝.act';
    const candidates = buildResourcePathCandidates(path);
    expect(candidates[0]).toBe('data/sprite/%E7%89%A2%E5%9F%83%E7%BB%83/%E9%B8%A5%E7%82%BC%E8%83%B6%E5%94%B1%E6%8D%9E%E6%AC%BA/%E9%B8%A5%E7%82%BC%E8%83%B6%E5%94%B1%E6%8D%9E%E6%AC%BA_%E5%B7%A2_%E5%8A%9D.act');
    expect(candidates).toContain('data/sprite/%EC%9D%B8%EA%B0%84%EC%A1%B1/%ED%83%80%EC%A1%B0%EC%8A%A4%EB%82%98%EC%9D%B4%ED%8D%BC/%ED%83%80%EC%A1%B0%EC%8A%A4%EB%82%98%EC%9D%B4%ED%8D%BC_%EB%82%A8_%ED%99%9C.act');
    expect(candidates.length).toBeLessThanOrEqual(12);
  });
});
