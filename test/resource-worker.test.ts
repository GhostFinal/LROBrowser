import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

async function loadWorker(responses: Array<Response | Error>, manifest: string[] = []) {
  const source = await readFile('.staging/v2/LastROThreadEventHandler.js', 'utf8');
  const urls: string[] = [];
  const saved: ArrayBuffer[] = [];
  const context: Record<string, unknown> = {
    ArrayBuffer, Promise, URL, TextDecoder, Uint8Array, encodeURIComponent,
    importScripts: () => {},
    ne: { saveFile: (_path: string, bytes: ArrayBuffer) => saved.push(bytes) },
    se: {
      resourcePathCharset: 'gbk',
      lastroResourceRoots: ['https://game.lastro.cn/ro/client_re/', 'https://clientdata.ltsd.ro/ro/client_re/'],
      lastroExecutableManifest: manifest.map((path) => ({ path }))
    },
    self: { location: { href: 'https://iwa.invalid/runtime/LastROThreadEventHandler.js' } },
    fetch: (url: string) => {
      urls.push(url);
      const response = responses.shift();
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    }
  };
  vm.runInNewContext(source, context, { filename: 'LastROThreadEventHandler.js' });
  return { urls, saved, load: (path: string) => new Promise<{ data: ArrayBuffer | null; error?: string }>((resolve) => {
    (context.se as { getHTTP: (path: string, callback: (data: ArrayBuffer | null, error?: string) => void) => void }).getHTTP(path, (data, error) => resolve({ data, error }));
  }) };
}

function response(status: number, body = new Uint8Array([1]).buffer): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'application/octet-stream' }), arrayBuffer: async () => body } as Response;
}

describe('LastRO resource worker', () => {
  it('tries official then backup for passive resources', async () => {
    const worker = await loadWorker([response(404), response(200, new Uint8Array([9]).buffer)]);
    const result = await worker.load('data/map/prt.gat');
    expect(result.error).toBeUndefined();
    expect(result.data?.byteLength).toBe(1);
    expect(worker.urls).toEqual([
      'https://game.lastro.cn/ro/client_re/data/map/prt.gat',
      'https://clientdata.ltsd.ro/ro/client_re/data/map/prt.gat'
    ]);
  });

  it('loads executable resources only from the package manifest', async () => {
    const worker = await loadWorker([response(200)], ['data/script.lua']);
    const result = await worker.load('data/script.lua');
    expect(result.error).toBeUndefined();
    expect(worker.urls).toEqual(['https://iwa.invalid/core/data/script.lua']);
  });

  it('rejects unlisted executable and unknown remote resources', async () => {
    const worker = await loadWorker([]);
    await expect(worker.load('data/unknown.lua')).resolves.toMatchObject({ error: 'Package-only resource is missing from the executable manifest' });
    await expect(worker.load('data/unknown.exe')).resolves.toMatchObject({ error: 'Forbidden remote resource' });
    expect(worker.urls).toEqual([]);
  });
});
