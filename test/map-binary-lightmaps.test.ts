import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { validateMapBinary } from '../src/resources/map-binary-validation';
import { MemoryResourceCache } from '../src/resources/resource-cache';
import { DEFAULT_RESOURCE_ROOTS, resolvePassiveResource } from '../src/resources/resource-resolver';
import { mapBinaryFixture } from './map-binary-fixture';

function ground(count = 1, width = 8, height = 8, grid = 1, dataSize = count * width * height * grid * 4) {
  const original = new Uint8Array(mapBinaryFixture('gnd'));
  const bytes = new ArrayBuffer(original.length - 256 + dataSize), target = new Uint8Array(bytes);
  target.set(original.subarray(0, 46)); target.set(original.subarray(302), 46 + dataSize);
  const view = new DataView(bytes);
  [count, width, height, grid].forEach((value, index) => view.setInt32(30 + 4 * index, value, true));
  return bytes;
}

// Extract the bundled parser and reader, then intercept its allocation rather
// than attempting to reserve the malicious file's terabyte-sized atlas.
const worker = readFileSync('vendor/v2/ThreadEventHandler.js', 'utf8');
const syntax = ts.createSourceFile('native-worker.js', worker, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const classes: string[] = [];
function findGround(node: ts.Node) {
  if (ts.isClassExpression(node) && node.getText(syntax).includes('GND::load()')) classes.push(node.getText(syntax));
  ts.forEachChild(node, findGround);
}
findGround(syntax);
if (classes.length !== 1) throw new Error('Missing unique native GND parser');
const readerStart = worker.indexOf('function K(t,e,r)'), readerEnd = worker.indexOf('var V=', readerStart);
if (readerStart < 0 || readerEnd < readerStart) throw new Error('Missing native map BinaryReader');
const nativeSource = worker.slice(readerStart, readerEnd) + '\nvar NativeGround = ' + classes[0] + ';';

function nativeAtlasSize(bytes: ArrayBuffer) {
  const requested: number[] = [];
  const limit = new Error('intercepted-native-atlas-allocation');
  const TypedArray = new Proxy(Uint8Array, { construct(target, args) {
    if (typeof args[0] === 'number') { requested.push(args[0]); throw limit; }
    return Reflect.construct(target, args);
  } });
  const context = vm.createContext({ Uint8Array: TypedArray, ArrayBuffer, DataView, H: {}, SEEK_CUR: 1 });
  vm.runInContext(nativeSource, context);
  context.input = bytes;
  expect(() => vm.runInContext('new NativeGround(input).createLightmapImage()', context)).toThrow(limit);
  return requested[0];
}

function nativeEmptyMesh(bytes: ArrayBuffer) {
  // Empty faces only add/normalize zero vectors; no normal calculation is used.
  const vectors = { create: () => new Float32Array(3), normalize: (out: number[]) => out,
    add: (out: number[], a: number[], b: number[]) => { for (let index = 0; index < 3; index++) out[index] = a[index]! + b[index]!; return out; } };
  const context = vm.createContext({ Uint8Array, ArrayBuffer, DataView, H: {}, SEEK_CUR: 1, Ut: vectors });
  vm.runInContext(nativeSource, context); context.input = bytes;
  return vm.runInContext('new NativeGround(input).compile(Infinity, 0)', context) as { mesh: Float32Array; waterMesh: Float32Array; lightmap: Uint8Array };
}

const response = (bytes: ArrayBuffer) => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });

describe('GND native lightmap allocation validation', () => {
  it('rejects the 174-byte zero-stride file whose native parser requests a 1 TiB atlas', () => {
    const bytes = ground(0x7fffffff, 0, 8, 1);
    expect(bytes.byteLength).toBe(174); expect(nativeAtlasSize(bytes)).toBe(2 ** 40);
    expect(() => validateMapBinary('data/unsafe.gnd', bytes)).toThrow(/invalid-lightmaps/);
  });

  it.each([[8, 8, 0], [0, 8, 1], [8, 0, 1], [4, 8, 1]])('rejects lightmap %i x %i x %i blocks too short for native 8 x 8 sampling', (width, height, grid) => {
    expect(() => validateMapBinary('unsafe.gnd', ground(1, width, height, grid))).toThrow(/invalid-lightmaps/);
  });

  it.each([[-1, 8, 8, 1], [1, -8, 8, 1], [1, 8, -8, 1], [1, 8, 8, -1], [1, 0x7fffffff, 0x7fffffff, 0x7fffffff]])(
    'rejects invalid or unsafe integer lightmap section products %i x %i x %i x %i', (count, width, height, grid) => {
      expect(() => validateMapBinary('unsafe.gnd', ground(count, width, height, grid, 0))).toThrow(/invalid-lightmaps/);
    });

  it('rejects truncated lightmap data even when its declared dimensions are valid', () => {
    expect(() => validateMapBinary('unsafe.gnd', ground(2, 8, 8, 1, 0))).toThrow(/truncated/);
  });

  it('accepts the exact 64 MiB native atlas budget and rejects the next count despite complete source data', () => {
    const bytes = ground(512 * 512);
    expect(nativeAtlasSize(bytes)).toBe(64 * 1024 * 1024);
    expect(() => validateMapBinary('large.gnd', bytes)).not.toThrow();
    const next = ground(512 * 512 + 1);
    expect(nativeAtlasSize(next)).toBe(128 * 1024 * 1024);
    expect(() => validateMapBinary('unsafe.gnd', next)).toThrow(/lightmap-atlas-memory-limit/);
  });

  it.each([1.7, 1.8, 1.9])('preserves normal GND %s 8 x 8 lightmaps and references', version => {
    const bytes = mapBinaryFixture('gnd', 1, version);
    expect(nativeAtlasSize(bytes)).toBe(256);
    expect(() => validateMapBinary('normal.gnd', bytes)).not.toThrow();
  });

  it('accepts extra per-lightmap padding already supported by the bundled reader', () => {
    const bytes = ground(1, 8, 8, 2);
    expect(nativeAtlasSize(bytes)).toBe(256);
    expect(() => validateMapBinary('padded.gnd', bytes)).not.toThrow();
  });

  it('preserves an empty ground with no lightmaps, tiles, or referenced faces', () => {
    const original = new Uint8Array(ground(0, 0, 0, 0)), bytes = new ArrayBuffer(original.length - 40);
    const target = new Uint8Array(bytes); target.set(original.subarray(0, 50)); target.set(original.subarray(90), 50);
    const view = new DataView(bytes); view.setUint32(46, 0, true); view.setInt32(50 + 16, -1, true);
    expect(nativeAtlasSize(bytes)).toBe(0);
    expect(() => validateMapBinary('empty.gnd', bytes)).not.toThrow();
  });

  it.each([-1, -2])('preserves a ground with zero lightmaps and one unused tile when all faces are %s', face => {
    const bytes = ground(0), view = new DataView(bytes);
    for (let side = 0; side < 3; side++) view.setInt32(90 + 16 + side * 4, face, true);
    const compiled = nativeEmptyMesh(bytes);
    expect(compiled.mesh).toHaveLength(0); expect(compiled.waterMesh).toHaveLength(0); expect(compiled.lightmap).toHaveLength(0);
    expect(() => validateMapBinary('unused.gnd', bytes)).not.toThrow();
  });

  it('does not impose texture/lightmap reference checks on an unused tile', () => {
    const bytes = ground(), view = new DataView(bytes);
    for (let side = 0; side < 3; side++) view.setInt32(346 + 16 + side * 4, -1, true);
    view.setUint16(306 + 32, 0xffff, true); view.setUint16(306 + 34, 0xffff, true);
    expect(nativeEmptyMesh(bytes).mesh).toHaveLength(0);
    expect(() => validateMapBinary('unused.gnd', bytes)).not.toThrow();
  });

  it.each([0, 1, 2])('rejects a referenced tile with no lightmap backing on surface side %s', side => {
    const bytes = ground(0), view = new DataView(bytes);
    for (let other = 0; other < 3; other++) view.setInt32(90 + 16 + other * 4, other === side ? 0 : -1, true);
    expect(() => validateMapBinary('unsafe.gnd', bytes)).toThrow(/invalid-lightmap-index/);
  });

  it('rejects a referenced tile with no texture backing', () => {
    const bytes = ground(); new DataView(bytes).setUint16(306 + 32, 1, true);
    expect(() => validateMapBinary('unsafe.gnd', bytes)).toThrow(/invalid-texture-index/);
  });

  it('rejects a tile light index beyond the actual lightmap section', () => {
    const bytes = ground(); new DataView(bytes).setUint16(306 + 34, 1, true);
    expect(() => validateMapBinary('unsafe.gnd', bytes)).toThrow(/invalid-lightmap-index/);
  });

  it('rejects the malformed primary before caching and returns valid alternate-origin ground bytes', async () => {
    const path = 'data/map.gnd', unsafe = ground(0x7fffffff, 0, 8, 1), valid = ground();
    const cache = new MemoryResourceCache(), put = vi.spyOn(cache, 'put');
    const fetch = vi.fn<typeof globalThis.fetch>(async url => response(String(url).startsWith(DEFAULT_RESOURCE_ROOTS[0]) ? unsafe : valid));
    expect(new Uint8Array(await resolvePassiveResource(path, { cache, fetch }))).toEqual(new Uint8Array(valid));
    expect(put).toHaveBeenCalledOnce(); expect(new Uint8Array(put.mock.calls[0]![1])).toEqual(new Uint8Array(valid));
    expect(await cache.match(path)).toMatchObject({ bytes: valid, sourceUrl: DEFAULT_RESOURCE_ROOTS[1] + path });
    expect(await resolvePassiveResource(path, { cache, fetch: async () => { throw new Error('must use validated cache'); } })).toEqual(valid);
  });

  it('evicts a previously poisoned GND cache and does not save any malformed origin', async () => {
    const path = 'data/map.gnd', unsafe = ground(0x7fffffff, 0, 8, 1), cache = new MemoryResourceCache();
    await cache.put(path, unsafe, { sourceUrl: DEFAULT_RESOURCE_ROOTS[0] + path });
    const put = vi.spyOn(cache, 'put');
    await expect(resolvePassiveResource(path, { cache, fetch: async () => response(unsafe) })).rejects.toMatchObject({
      attempts: expect.arrayContaining([expect.objectContaining({ reason: 'invalid-map-gnd:invalid-lightmaps' })]),
    });
    expect(await cache.match(path)).toBeNull(); expect(put).not.toHaveBeenCalled();
  });
});
