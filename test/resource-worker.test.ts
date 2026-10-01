import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { patchResourceHandler, patchResourceWorker } from '../scripts/patch-resource-worker.mjs';
import { mapBinaryFixture } from './map-binary-fixture';

async function loadWorker(responses: Array<Response | Error>, manifest: string[] = []) {
  const source = await readFile('generated/runtime/LastROThreadEventHandler.js', 'utf8');
  const urls: string[] = [];
  const tcpRequests: { host: string; port: number; request: string }[] = [];
  const saved: ArrayBuffer[] = [];
  const context: Record<string, unknown> = {
    ArrayBuffer, Promise, URL, TextDecoder, TextEncoder, Uint8Array, Response, Headers, encodeURIComponent,
    indexedDB: new IDBFactory(), AbortController, DOMException, Error, AggregateError, setTimeout, clearTimeout,
    importScripts: () => {},
    ne: { saveFile: (_path: string, bytes: ArrayBuffer) => saved.push(bytes) },
    se: {
      resourcePathCharset: 'gbk',
      lastroResourceRoots: ['https://game.lastro.cn/ro/client_re/', 'https://rodata.ltsd.ro/ro/client_re/'],
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
  const loader = await readFile('generated/runtime/lastro-resource-loader.js', 'utf8');
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
        .toEqual([`GET /ro/client_re/${publishedPath} HTTP/1.1`]);
      expect(worker.urls).toEqual([`https://rodata.ltsd.ro/ro/client_re/${encodeURI(publishedPath)}`]);
      expect(result.error).toContain(`https://game.lastro.cn/ro/client_re/${encodeURI(publishedPath)} [http-404]`);
      expect(result.error).toContain(`https://rodata.ltsd.ro/ro/client_re/${encodeURI(publishedPath)} [http-503]`);
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
  const loader = await readFile('generated/runtime/lastro-resource-loader.js', 'utf8');
    expect(loader).toContain('function createDirectHttpFetch');
    expect(loader).toContain('new constructorForSocket(host, 80');
    expect(loader).toContain('nativeFetch');
    expect(loader).toContain('Direct HTTP only permits approved resource origins');
  });

  it('uses TrustedScriptURL values for worker bootstrap scripts', async () => {
    const handler = await readFile('vendor/v2/LastROThreadEventHandler.js', 'utf8');
    const patched = patchResourceHandler(handler);
    expect(patched).toContain('trustedTypes.createPolicy("lastro-iwa-worker"');
    expect(patched).toContain('createLastROWorkerScriptUrl("lastro-resource-loader.js")');
    expect(patched).toContain('createLastROWorkerScriptUrl("ThreadEventHandler.js")');
    expect(patched).not.toContain('importScripts("lastro-resource-loader.js", "ThreadEventHandler.js")');
    expect(patched).not.toContain('__lastroIwaWorkerPolicy');
  });

  it('races official and backup origins for map resources', async () => {
    const worker = await loadWorker([response(404), response(200, mapBinaryFixture('gat', 9))]);
    const result = await worker.load('data/map/prt.gat');
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(mapBinaryFixture('gat', 9));
    expect(worker.urls).toEqual(['https://rodata.ltsd.ro/ro/client_re/data/map/prt.gat']);
    expect(worker.tcpRequests.map(request => [request.host, request.port])).toEqual([
      ['game.lastro.cn', 80],
    ]);
  });

  it('loads the TXT tables required by DB.init through the passive resolver', async () => {
    const worker = await loadWorker([response(200, new Uint8Array([35]).buffer)]);
    const result = await worker.load('data/mp3nametable.txt');
    expect(result.error).toBeUndefined();
    expect(new Uint8Array(result.data!)).toEqual(new Uint8Array([35]));
  });

  it('loads the mp3 name table from the local package before opening a TCP socket', async () => {
    const tableBytes = new TextEncoder().encode('mp3 names').buffer;
    const worker = await loadWorker([response(200, tableBytes)], ['data/mp3nametable.txt']);
    const result = await worker.load('data/mp3nametable.txt');
    expect(result.error).toBeUndefined();
    expect(new Uint8Array(result.data!)).toEqual(new Uint8Array(tableBytes));
    expect(worker.urls).toEqual(['https://iwa.invalid/core/data/mp3nametable.txt']);
    expect(worker.tcpRequests).toEqual([]);
  });

  it('loads startup fonts from the package manifest before opening a TCP socket', async () => {
    const fontBytes = new Uint8Array([79, 84, 84, 79]).buffer;
    const worker = await loadWorker([response(200, fontBytes)], ['System/Font/Source Han Sans CN4.otf']);
    const result = await worker.load('System/Font/Source Han Sans CN4.otf');
    expect(result.error).toBeUndefined();
    expect(new Uint8Array(result.data!)).toEqual(new Uint8Array(fontBytes));
    expect(worker.urls).toEqual(['https://iwa.invalid/core/System/Font/Source%20Han%20Sans%20CN4.otf']);
    expect(worker.tcpRequests).toEqual([]);
  });

  it('loads the startup message table from the package manifest before opening a TCP socket', async () => {
    const tableBytes = new TextEncoder().encode('message-table').buffer;
    const worker = await loadWorker([response(200, tableBytes)], ['data/msgstringtable.csv']);
    const result = await worker.load('data/msgstringtable.csv');
    expect(result.error).toBeUndefined();
    expect(new Uint8Array(result.data!)).toEqual(new Uint8Array(tableBytes));
    expect(worker.urls).toEqual(['https://iwa.invalid/core/data/msgstringtable.csv']);
    expect(worker.tcpRequests).toEqual([]);
  });

  it('serves a second request from IndexedDB without fetching again', async () => {
    const worker = await loadWorker([response(200, mapBinaryFixture('gat')), response(503), response(503)]);
    const first = await worker.load('data/map/prt.gat');
    expect(first.error).toBeUndefined();
    const initialCounts = [worker.urls.length, worker.tcpRequests.length];
    const second = await worker.load('data/map/prt.gat');
    expect(second.error).toBeUndefined();
    expect([worker.urls.length, worker.tcpRequests.length]).toEqual(initialCounts);
  });

  it('falls back after empty and disguised HTML responses without hanging', async () => {
    for (const invalid of [new ArrayBuffer(0), new TextEncoder().encode('<!doctype html>').buffer]) {
      const worker = await loadWorker([response(200, invalid), response(200, mapBinaryFixture('gat', 7))]);
      const result = await worker.load('data/map/prt.gat');
      expect(result.data).toEqual(mapBinaryFixture('gat', 7));
      expect(worker.urls).toHaveLength(1);
      expect(worker.tcpRequests).toHaveLength(1);
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
    const worker = await readFile('vendor/v2/ThreadEventHandler.js', 'utf8');
    const handler = await readFile('vendor/v2/LastROThreadEventHandler.js', 'utf8');
    expect(() => patchResourceWorker(worker.replace('static getHTTP(', 'static changedHTTP('))).toThrow(/anchor/);
    expect(() => patchResourceWorker(worker + worker)).toThrow(/anchor/);
    expect(() => patchResourceHandler(handler.replace('getLastROHTTP', 'changedHTTP'))).toThrow(/anchor/);
    expect(() => patchResourceHandler(handler + handler)).toThrow(/anchor/);
    expect(() => patchResourceWorker(worker.replace('function i(t){t?', 'function i(t,u){t?'))).toThrow(/anchor/);
  });

  it.each(['rsw', 'gat', 'gnd'])('retains the real %s load or parse failure instead of reporting a missing file', async failure => {
    const source = patchResourceWorker(await readFile('vendor/v2/ThreadEventHandler.js', 'utf8'));
    const ast = ts.createSourceFile('worker.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let loader = '';
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'fe' && node.initializer && ts.isClassExpression(node.initializer)) {
        loader = node.initializer.members.find(member => member.name?.getText(ast) === 'load')!.getText(ast);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const calls: unknown[][] = [];
    const context = {
      Error, String,
      se: {
        filesAlias: {},
        load: (path: string, callback: (data: unknown, error?: string) => void) => {
          if (path.endsWith('.' + failure)) callback(null, `actual-${failure}-parser-error`);
          else if (path.endsWith('.rsw')) callback({ files: { gat: 'prontera.gat', gnd: 'prontera.gnd' } });
          else callback({ compile: () => ({}) });
        },
      },
      subject: { setProgress() {}, ondata() {}, onload: (...args: unknown[]) => calls.push(args) },
    };
    vm.runInNewContext(`subject.load=({${loader}}).load;subject.load('prontera.rsw');`, context);
    expect(calls).toEqual([[false, `actual-${failure}-parser-error`]]);
  });

  it.each(['gat', 'gnd', 'rsw'])('returns %s compile exceptions through the map completion callback', async kind => {
    const source = patchResourceWorker(await readFile('vendor/v2/ThreadEventHandler.js', 'utf8'));
    const ast = ts.createSourceFile('worker.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let loader = '';
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'fe' && node.initializer && ts.isClassExpression(node.initializer)) {
        loader = node.initializer.members.find(member => member.name?.getText(ast) === 'load')!.getText(ast);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const calls: unknown[][] = [];
    const context = {
      Error, String,
      se: { filesAlias: {}, load: (path: string, callback: (data: unknown) => void) => callback({
        files: { gat: 'prontera.gat', gnd: 'prontera.gnd' },
        water: {}, textures: [], models: [],
        compile: () => {
          if (path.endsWith('.' + kind)) throw new Error(`invalid ${kind} data`);
          return {};
        },
      }) },
      subject: { setProgress() {}, ondata() {}, loadGroundTextures: (_world: unknown, _ground: unknown, callback: () => void) => callback(), onload: (...args: unknown[]) => calls.push(args) },
    };
    expect(() => vm.runInNewContext(`subject.load=({${loader}}).load;subject.load('prontera.rsw');`, context)).not.toThrow();
    expect(calls).toEqual([[false, `invalid ${kind} data`]]);
  });
});
