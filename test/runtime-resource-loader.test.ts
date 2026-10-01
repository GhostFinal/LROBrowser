import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeResourceLoader } from '../src/resources/runtime-resource-loader';
import { resolvePassiveResource } from '../src/resources/resource-resolver';

vi.mock('../src/resources/resource-resolver', () => ({ resolvePassiveResource: vi.fn() }));

const resolver = vi.mocked(resolvePassiveResource);
const bytes = () => new Uint8Array([1, 2, 3]).buffer;
const loader = (getCharset: () => string | undefined = () => 'gbk') => createRuntimeResourceLoader({
  packageBaseUrl: 'https://iwa.invalid/core/', getManifest: () => [], getCharset,
});

beforeEach(() => { resolver.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('worker runtime resource in-flight sharing', () => {
  it('shares the same normalized path and charset while providing independent transferable buffers', async () => {
    let finish!: (value: ArrayBuffer) => void;
    resolver.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const load = loader();
    const first = load('data\\ein_fild04.gnd'), second = load('data/ein_fild04.gnd');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0]?.[1]?.primaryCharset).toBe('gbk');
    const original = bytes(); finish(original);
    const [a, b] = await Promise.all([first, second]);
    expect(a).not.toBe(b); expect(a).not.toBe(original); expect(b).not.toBe(original);
    const transferred = structuredClone(a, { transfer: [a] });
    expect(a.byteLength).toBe(0);
    expect(Array.from(new Uint8Array(transferred))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(b))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(original))).toEqual([1, 2, 3]);
  });

  it('releases successful in-flight entries so the resolver can apply its persistent cache again', async () => {
    resolver.mockResolvedValue(bytes()); const load = loader();
    const first = await load('data/ein_fild04.gat');
    const second = await load('data/ein_fild04.gat');
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  it('shares a pending failure, removes it, and permits the next request to retry', async () => {
    let fail!: (error: Error) => void;
    resolver.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const load = loader(), first = load('data/ein_fild04.gnd'), second = load('data/ein_fild04.gnd');
    const settled = Promise.allSettled([first, second]);
    const error = new Error('download timeout'); fail(error);
    expect(await settled).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
    expect(resolver).toHaveBeenCalledTimes(1);
    resolver.mockResolvedValue(bytes());
    expect(Array.from(new Uint8Array(await load('data/ein_fild04.gnd')))).toEqual([1, 2, 3]);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('keeps different charsets separate and captures the matching charset for each resolver call', async () => {
    const pending: Array<(value: ArrayBuffer) => void> = [];
    resolver.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    let charset = 'gbk'; const load = loader(() => charset);
    const first = load('data/model/name.rsm'); charset = 'euc-kr';
    const second = load('data/model/name.rsm');
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls.map(call => call[1]?.primaryCharset)).toEqual(['gbk', 'euc-kr']);
    pending[0]!(new Uint8Array([4]).buffer); pending[1]!(new Uint8Array([5]).buffer);
    expect(Array.from(new Uint8Array(await first))).toEqual([4]);
    expect(Array.from(new Uint8Array(await second))).toEqual([5]);
  });

  it('does not merge distinct resource paths or independent worker loader instances', async () => {
    resolver.mockResolvedValue(bytes());
    const firstWorker = loader(), secondWorker = loader();
    await Promise.all([firstWorker('data/a.gat'), firstWorker('data/b.gat'), secondWorker('data/a.gat')]);
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  it('does not merge invalid names whose normalized key is empty', async () => {
    resolver.mockRejectedValue(new Error('forbidden resource'));
    const load = loader();
    await Promise.allSettled([load('../bad.gat'), load('data/bad?.gat'), load('')]);
    expect(resolver.mock.calls.map(call => call[0])).toEqual(['../bad.gat', 'data/bad?.gat', '']);
  });

  it('still reads a manifest-listed executable from its encoded package URL', async () => {
    const actual = await vi.importActual<typeof import('../src/resources/resource-resolver')>('../src/resources/resource-resolver');
    resolver.mockImplementation(actual.resolvePassiveResource);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(bytes(), { headers: { 'content-type': 'text/javascript' } }));
    vi.stubGlobal('fetch', fetch);
    const load = createRuntimeResourceLoader({
      packageBaseUrl: 'https://iwa.invalid/core/', getCharset: () => 'gbk',
      getManifest: () => [{ path: 'data/ui/my module.mjs' }],
    });
    const [first, second] = await Promise.all([load('data/ui/my module.mjs'), load('data\\ui\\my module.mjs')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://iwa.invalid/core/data/ui/my%20module.mjs');
    expect(first).not.toBe(second);
    expect(Array.from(new Uint8Array(first))).toEqual([1, 2, 3]);
  });

  it('keeps unlisted executables package-only and rejects invalid paths before any transport', async () => {
    const actual = await vi.importActual<typeof import('../src/resources/resource-resolver')>('../src/resources/resource-resolver');
    resolver.mockImplementation(actual.resolvePassiveResource);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const load = loader();
    await expect(load('data/missing.mjs')).rejects.toThrow('package-only-resource');
    await expect(load('../outside.gat')).rejects.toThrow('forbidden-resource');
    expect(fetch).not.toHaveBeenCalled();
  });
});
