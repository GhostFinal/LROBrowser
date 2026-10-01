import { describe, expect, it } from 'vitest';
import { validateMapBinary } from '../src/resources/map-binary-validation';
import { MemoryResourceCache } from '../src/resources/resource-cache';
import { DEFAULT_RESOURCE_ROOTS, resolvePassiveResource } from '../src/resources/resource-resolver';
import { mapBinaryFixture } from './map-binary-fixture';

const response = (body: ArrayBuffer) => new Response(body, { headers: { 'content-type': 'application/octet-stream' } });

describe('map binary validation and recovery', () => {
  it.each([
    ['gat', 1.2], ['gat', 1.3], ['gnd', 1.7], ['gnd', 1.8], ['gnd', 1.9],
    ['rsw', 1.2], ['rsw', 1.3], ['rsw', 1.4], ['rsw', 1.5], ['rsw', 1.7], ['rsw', 1.8], ['rsw', 1.9],
    ['rsw', 2.1], ['rsw', 2.2], ['rsw', 2.5], ['rsw', 2.6], ['rsw', 2.7],
  ] as const)('accepts the consumed %s %s layout', (kind, version) => {
    expect(() => validateMapBinary(`data/test.${kind}`, mapBinaryFixture(kind, 1, version, [1, 2, 3, 4]))).not.toThrow();
  });

  it.each(['gat', 'gnd', 'rsw'])('rejects every truncation of a valid %s body', kind => {
    const bytes = mapBinaryFixture(kind, 1, undefined, [1, 2, 3, 4]);
    for (let size = 0; size < bytes.byteLength; size++) {
      expect(() => validateMapBinary(`data/test.${kind}`, bytes.slice(0, size))).toThrow(/invalid-map/);
    }
  });

  it('rejects oversized dimensions, section counts, and invalid surface references', () => {
    const dimensions = mapBinaryFixture('gat');
    new DataView(dimensions).setUint32(6, 0xffffffff, true);
    expect(() => validateMapBinary('test.gat', dimensions)).toThrow(/invalid-dimensions/);
    const count = mapBinaryFixture('gnd');
    new DataView(count).setUint32(18, 0xffffffff, true);
    expect(() => validateMapBinary('test.gnd', count)).toThrow(/truncated/);
    const surface = mapBinaryFixture('gnd');
    new DataView(surface).setInt32(346 + 16, 1, true);
    expect(() => validateMapBinary('test.gnd', surface)).toThrow(/invalid-tile-index/);
    const objects = mapBinaryFixture('rsw');
    new DataView(objects).setInt32(objects.byteLength - 4, -1, true);
    expect(() => validateMapBinary('test.rsw', objects)).toThrow(/invalid-count/);
  });

  it('preserves RSW trailing quadtree bytes and other passive file types', () => {
    const original = new Uint8Array(mapBinaryFixture('rsw'));
    const extended = new Uint8Array(original.length + 120);
    extended.set(original);
    expect(() => validateMapBinary('test.RSW', extended.buffer)).not.toThrow();
    expect(() => validateMapBinary('test.bmp', new Uint8Array([1]).buffer)).not.toThrow();
  });

  it('deletes zero-length map cache entries when all remote requests fail', async () => {
    const cache = new MemoryResourceCache();
    await cache.put('data/prontera.gnd', new ArrayBuffer(0), { sourceUrl: 'cache://empty' });
    await expect(resolvePassiveResource('data/prontera.gnd', { cache, fetch: async () => response(new ArrayBuffer(0)) })).rejects.toThrow();
    expect(await cache.match('data/prontera.gnd')).toBeNull();
  });

  it.each(['gat', 'gnd', 'rsw'])('evicts damaged %s cache entries and replaces them with valid bytes', async kind => {
    const path = `data/prontera.${kind}`;
    const valid = mapBinaryFixture(kind);
    const cache = new MemoryResourceCache();
    await cache.put(path, valid.slice(0, valid.byteLength - 1), { sourceUrl: DEFAULT_RESOURCE_ROOTS[0] + path });
    const fetch = async (url: RequestInfo | URL) => response(String(url).startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? new Uint8Array([1, 2, 3]).buffer : valid);
    await expect(resolvePassiveResource(path, { cache, fetch })).resolves.toEqual(valid);
    expect((await cache.match(path))?.sourceUrl).toBe(DEFAULT_RESOURCE_ROOTS[1] + path);
    await expect(resolvePassiveResource(path, { cache, fetch: async () => { throw new Error('cache miss'); } })).resolves.toEqual(valid);
  });

  it.each(['gat', 'gnd', 'rsw'].flatMap(kind => [0, 1].map(origin => [kind, origin] as const)))('rejects %s HTTP bytes from origin %s with correct magic but incomplete structure before choosing an origin', async (kind, invalidOrigin) => {
    const path = `data/prontera.${kind}`;
    const valid = mapBinaryFixture(kind);
    const cache = new MemoryResourceCache();
    const fetch = async (url: RequestInfo | URL) => response(String(url).startsWith(DEFAULT_RESOURCE_ROOTS[invalidOrigin]!) ? valid.slice(0, 6) : valid);
    await expect(resolvePassiveResource(path, { cache, fetch })).resolves.toEqual(valid);
    expect((await cache.match(path))?.bytes).toEqual(valid);
    expect((await cache.match(path))?.sourceUrl).toBe(DEFAULT_RESOURCE_ROOTS[1 - invalidOrigin] + path);
  });

  it.each(['gat', 'gnd', 'rsw'])('leaves no %s cache entry when every origin returns invalid data', async kind => {
    const path = `data/prontera.${kind}`;
    const cache = new MemoryResourceCache();
    await cache.put(path, new Uint8Array([1]).buffer, { sourceUrl: 'cache://damaged' });
    await expect(resolvePassiveResource(path, { cache, fetch: async () => response(mapBinaryFixture(kind).slice(0, 6)) }))
      .rejects.toMatchObject({ attempts: expect.arrayContaining([expect.objectContaining({ reason: expect.stringMatching(/invalid-map/) })]) });
    expect(await cache.match(path)).toBeNull();
  });
});
