import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { patchResourceHandler, patchResourceWorker } from '../scripts/patch-resource-worker.mjs';

async function loadWorker(responses: Array<Response | Error>, manifest: string[] = []) {
  const source = await readFile('.staging/runtime/LastROThreadEventHandler.js', 'utf8');
  const urls: string[] = [];
  const tcpRequests: { host: string; port: number; request: string }[] = [];
  const saved: ArrayBuffer[] = [];
  const context: Record<string, unknown> = {
    ArrayBuffer, Promise, URL, TextDecoder, TextEncoder, Uint8Array, Response, Headers, encodeURIComponent,
    indexedDB: new IDBFactory(), AbortController, setTimeout, clearTimeout,
    importScripts: () => {},
    ne: { saveFile: (_path: string, bytes: ArrayBuffer) => saved.push(bytes) },
    se: {
      resourcePathCharset: 'gbk',
      lastroResourceRoots: ['https://game.lastro.cn/ro/client_re/', 'https://clientdata.ltsd.ro/ro/client_re/'],
      lastroExecutableManifest: manifest.map((path) => ({ path }))
    },
    self: { location: { href: 'https://iwa.invalid/runtime/LastROThreadEventHandler.js' } },
    fetch: (url: string) => {
      urls.push(String(url));
      const response = responses.shift();
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    },
    TCPSocket: class {
      readonly opened: Promise<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>;
      readonly closed: Promise<void>;
      private closeHandler: () => void = () => {};
      constructor(host: string, port: number) {
        let resolveOpened!: (value: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }) => void;
        this.closed = new Promise<void>(resolve => { this.closeHandler = resolve; });
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const readable = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
        const writable = new WritableStream<Uint8Array>({
          write: async chunk => {
            tcpRequests.push({ host, port, request: new TextDecoder().decode(chunk) });
            const response = responses.shift();
            if (response instanceof Error) { controller.error(response); return; }
            if (!response) { controller.error(new Error('missing TCP fixture response')); return; }
            const body = new Uint8Array(await response.arrayBuffer());
            const headers = [`Content-Length: ${body.byteLength}`];
            response.headers.forEach((value, name) => {
              if (name.toLowerCase() !== 'content-length') headers.push(`${name}: ${value}`);
            });
            controller.enqueue(new TextEncoder().encode(`HTTP/1.1 ${response.status} ${response.statusText || 'Fixture'}\r\n${headers.join('\r\n')}\r\n\r\n`));
            controller.enqueue(body);
            controller.close();
          },
        });
        this.opened = new Promise(resolve => { resolveOpened = resolve; resolveOpened({ readable, writable }); });
      }
      close = async () => { this.closeHandler(); };
    },
  };
  const loader = await readFile('.staging/runtime/lastro-resource-loader.js', 'utf8');
  vm.runInNewContext(loader, context);
  vm.runInNewContext(source, context, { filename: 'LastROThreadEventHandler.js' });
  return { urls, tcpRequests, saved, load: (path: string) => new Promise<{ data: ArrayBuffer | null; error?: string }>((resolve) => {
    (context.se as { getHTTP: (path: string, callback: (data: ArrayBuffer | null, error?: string) => void) => void }).getHTTP(path, (data, error) => resolve({ data, error }));
  }) };
}

function response(status: number, body = new Uint8Array([1]).buffer): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'application/octet-stream' }), arrayBuffer: async () => body } as Response;
}

describe('LastRO resource worker', () => {
  it('requests published names for every Korean texture failure in the supplied log and retains attempted URLs in errors', async () => {
    const files = [
      ...[
        'bt_close2_normal', 'bt_close2_press', 'img_info', 'bt_gamestart_press',
        'bt_info_over', 'bt_gamestart_off', 'bt_gamestart_over', 'bt_close2_over',
        'bt_info_normal', 'bt_info_press', 'img_slot2_normal', 'img_slot_normal',
        ...Array.from({ length: 8 }, (_, index) => `img_slot_select${index}`),
      ].map(name => `select_character_ver3/${name}.bmp`),
      'renewalparty/icon_jobs_4016.bmp', 'renewalparty/icon_jobs_0.bmp',
    ];
    for (const file of files) {
      const worker = await loadWorker([response(404), response(503)]);
      const result = await worker.load(`data/texture/유저인터페이스/${file}`);
      const publishedPath = `data/texture/蜡历牢磐其捞胶/${file}`;
      expect(result.data).toBeNull();
      expect(worker.tcpRequests.map(value => decodeURIComponent(value.request.split('\r\n')[0]!)))
        .toEqual(Array(2).fill(`GET /ro/client_re/${publishedPath} HTTP/1.1`));
      expect(result.error).toContain(`https://game.lastro.cn/ro/client_re/${encodeURI(publishedPath)} [http-404]`);
      expect(result.error).toContain(`https://clientdata.ltsd.ro/ro/client_re/${encodeURI(publishedPath)} [http-503]`);
    }
  });

  it('sends GBK-named directories and basenames through the generated TCP resource loader', async () => {
    const worker = await loadWorker([response(200), response(200)]);
    expect((await worker.load('data/sprite/인간족/몸통/남/초보자_남.spr')).error).toBeUndefined();
    expect((await worker.load('data/wav/버튼소리.wav')).error).toBeUndefined();
    expect(worker.tcpRequests.map(value => decodeURIComponent(value.request.split('\r\n')[0]!))).toEqual([
      'GET /ro/client_re/data/sprite/牢埃练/个烹/巢/檬焊磊_巢.spr HTTP/1.1',
      'GET /ro/client_re/data/wav/滚瓢家府.wav HTTP/1.1',
    ]);
  });

  it('bundles the Direct TCP HTTP transport for remote passive resources', async () => {
    const loader = await readFile('.staging/runtime/lastro-resource-loader.js', 'utf8');
    expect(loader).toContain('function createDirectHttpFetch');
    expect(loader).toContain('new constructorForSocket(host, 80');
    expect(loader).toContain('Direct HTTP only permits approved resource origins');
  });

  it('uses TrustedScriptURL values for worker bootstrap scripts', async () => {
    const handler = await readFile('.staging/v2/LastROThreadEventHandler.js', 'utf8');
    const patched = patchResourceHandler(handler);
    expect(patched).toContain('trustedTypes.createPolicy("lastro-iwa-worker"');
    expect(patched).toContain('createLastROWorkerScriptUrl("lastro-resource-loader.js")');
    expect(patched).toContain('createLastROWorkerScriptUrl("ThreadEventHandler.js")');
    expect(patched).not.toContain('importScripts("lastro-resource-loader.js", "ThreadEventHandler.js")');
  });

  it('tries official then backup for passive resources', async () => {
    const worker = await loadWorker([response(404), response(200, new Uint8Array([9]).buffer)]);
    const result = await worker.load('data/map/prt.gat');
    expect(result.error).toBeUndefined();
    expect(result.data?.byteLength).toBe(1);
    expect(worker.urls).toEqual([]);
    expect(worker.tcpRequests.map(request => [request.host, request.port])).toEqual([
      ['game.lastro.cn', 80],
      ['clientdata.ltsd.ro', 80],
    ]);
  });

  it('loads the TXT tables required by DB.init through the passive resolver', async () => {
    const worker = await loadWorker([response(200, new Uint8Array([35]).buffer)]);
    const result = await worker.load('data/mp3nametable.txt');
    expect(result.error).toBeUndefined();
    expect(new Uint8Array(result.data!)).toEqual(new Uint8Array([35]));
  });

  it('serves a second request from IndexedDB without fetching again', async () => {
    const worker = await loadWorker([response(200), response(503), response(503)]);
    await worker.load('data/map/prt.gat');
    const second = await worker.load('data/map/prt.gat');
    expect(second.error).toBeUndefined();
    expect(worker.urls).toHaveLength(0);
    expect(worker.tcpRequests).toHaveLength(1);
  });

  it('falls back after empty and disguised HTML responses without hanging', async () => {
    for (const invalid of [new ArrayBuffer(0), new TextEncoder().encode('<!doctype html>').buffer]) {
      const worker = await loadWorker([response(200, invalid), response(200, new Uint8Array([7]).buffer)]);
      const result = await worker.load('data/map/prt.gat');
      expect(new Uint8Array(result.data!)).toEqual(new Uint8Array([7]));
      expect(worker.urls).toHaveLength(0);
      expect(worker.tcpRequests).toHaveLength(2);
    }
  });

  it('rejects traversal before any package or remote request', async () => {
    const worker = await loadWorker([response(200)]);
    expect((await worker.load('data/../../escape.bmp')).error).toBeTruthy();
    expect(worker.urls).toEqual([]);
  });

  it('loads executable resources only from the package manifest', async () => {
    const worker = await loadWorker([response(200)], ['data/script.lua']);
    const result = await worker.load('data/script.lua');
    expect(result.error).toBeUndefined();
    expect(worker.urls).toEqual(['https://iwa.invalid/core/data/script.lua']);
  });

  it('rejects unlisted executable and unknown remote resources', async () => {
    const worker = await loadWorker([]);
    expect((await worker.load('data/unknown.lua')).error).toBeTruthy();
    expect((await worker.load('data/unknown.exe')).error).toBeTruthy();
    expect(worker.urls).toEqual([]);
  });

  it('does not fall back to remote sources when a listed executable is missing from the package', async () => {
    const worker = await loadWorker([response(404)], ['System/test.lua']);
    expect((await worker.load('System/test.lua')).error).toBeTruthy();
    expect(worker.urls).toEqual(['https://iwa.invalid/core/System/test.lua']);
  });

  it('fails the build when worker or handler anchors disappear or are duplicated', async () => {
    const worker = await readFile('.staging/v2/ThreadEventHandler.js', 'utf8');
    const handler = await readFile('.staging/v2/LastROThreadEventHandler.js', 'utf8');
    expect(() => patchResourceWorker(worker.replace('static getHTTP(', 'static changedHTTP('))).toThrow(/anchor/);
    expect(() => patchResourceWorker(worker + worker)).toThrow(/anchor/);
    expect(() => patchResourceHandler(handler.replace('getLastROHTTP', 'changedHTTP'))).toThrow(/anchor/);
    expect(() => patchResourceHandler(handler + handler)).toThrow(/anchor/);
  });
});
