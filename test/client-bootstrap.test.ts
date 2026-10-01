import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapV2Client, parseExecutableAssetManifest } from '../src/runtime/client-bootstrap';
import { getAvailableServerProfile } from '../src/servers/server-profiles';

afterEach(() => vi.unstubAllGlobals());

describe('executable asset manifest loading', () => {
  it('blocks an ordinary browser before loading the runtime or its resources', async () => {
    vi.stubGlobal('TCPSocket', undefined);
    vi.stubGlobal('document', { baseURI: 'http://127.0.0.1:5173/' });
    const requests: unknown[] = [];
    vi.stubGlobal('fetch', (input: unknown) => { requests.push(input); throw new Error('unexpected fetch'); });
    await expect(bootstrapV2Client({ mount: {} as HTMLElement,
      profile: getAvailableServerProfile('lastro-2x'), credentials: { username: '', password: '' },
    })).rejects.toThrow(/IWA/);
    expect(requests).toEqual([]);
  });
  it('reports an HTML fallback instead of attempting JSON parsing', async () => {
    const response = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    await expect(parseExecutableAssetManifest(response)).rejects.toThrow('请重启 Vite 开发服务器');
  });

  it('accepts a JSON manifest with a files array', async () => {
    const entry = { path: 'runtime/Online.js', kind: 'runtime', bytes: 1, sha256: 'a'.repeat(64) };
    const response = new Response(JSON.stringify({ files: [entry] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(parseExecutableAssetManifest(response)).resolves.toEqual({
      files: [entry],
    });
  });
  it('preserves an immutable package manifest without new resource metadata gates', async () => {
    const entry = { path: 'data/resource.dat', kind: 'passive' };
    const valid = await parseExecutableAssetManifest(Response.json({ files: [entry] }));
    expect(Object.isFrozen(valid)).toBe(true); expect(Object.isFrozen(valid.files[0])).toBe(true);
    expect(valid.files[0]).toEqual(entry);
  });
  it('rejects runtime replacement before network or credential initialization', async () => {
    await expect(bootstrapV2Client({ mount: {} as HTMLElement, profile: getAvailableServerProfile('lastro-2x'),
      credentials: { username: '', password: '' }, runtimeUrl: 'https://evil.invalid/plugin.js' })).rejects.toThrow('内置');
  });
});
