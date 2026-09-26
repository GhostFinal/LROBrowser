import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { patchResourceHandler, patchResourceWorker } from '../scripts/patch-resource-worker.mjs';

async function loadWorker(responses: Array<Response | Error>, manifest: string[] = []) {
  const source = await readFile('.staging/runtime/LastROThreadEventHandler.js', 'utf8');
  const urls: string[] = [];
  const saved: ArrayBuffer[] = [];
  const context: Record<string, unknown> = {
    ArrayBuffer, Promise, URL, TextDecoder, Uint8Array, encodeURIComponent,
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
    }
  };
  const loader = await readFile('.staging/runtime/lastro-resource-loader.js', 'utf8');
  vm.runInNewContext(loader, context);
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
    expect(worker.urls).toHaveLength(1);
  });

  it('falls back after empty and disguised HTML responses without hanging', async () => {
    for (const invalid of [new ArrayBuffer(0), new TextEncoder().encode('<!doctype html>').buffer]) {
      const worker = await loadWorker([response(200, invalid), response(200, new Uint8Array([7]).buffer)]);
      const result = await worker.load('data/map/prt.gat');
      expect(new Uint8Array(result.data!)).toEqual(new Uint8Array([7]));
      expect(worker.urls).toHaveLength(2);
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
