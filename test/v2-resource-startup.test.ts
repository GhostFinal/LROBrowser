import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';
import { createHash, webcrypto } from 'node:crypto';

const source = readFileSync('generated/runtime/Online.js', 'utf8');
const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const pieces = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && ['init', 'loadFiles', 'savingFiles', 'onFileLoaded', 'onFileGetted'].includes(node.name?.text ?? '')) {
    pieces.set(node.name!.text, node.getText(file).replaceAll('import.meta.url', '"https://iwa.invalid/runtime/Online.js"'));
  }
  if (ts.isClassExpression(node) && node.name?.text === 'Client') pieces.set('Client', node.getText(file));
  ts.forEachChild(node, visit);
}
visit(file);

function harness() {
  const requests: string[] = [];
  const tcpRequests: { host: string; port: number; request: string }[] = [];
  const callbacks = new Map<number, (data: unknown, error: unknown, input: unknown) => void>();
  let uid = 0;
  let ready = false;
  let advances = 0;
  const tableBytes = new TextEncoder().encode('test#table#');
  const manifest = { files: [
    { path: 'System/test.lua', kind: 'lua', bytes: tableBytes.byteLength, sha256: createHash('sha256').update(tableBytes).digest('hex') },
    { path: 'System/achievement_list_cn2_06.lua', kind: 'lua',
      bytes: readFileSync('generated/core/System/achievement_list_cn2_06.lua').byteLength,
      sha256: createHash('sha256').update(readFileSync('generated/core/System/achievement_list_cn2_06.lua')).digest('hex') },
  ] };
  const worker = vm.createContext({
    ArrayBuffer, Uint8Array, URL, Blob, TextDecoder, TextEncoder, Response, Headers, AbortController, crypto: webcrypto,
    indexedDB: new IDBFactory(), setTimeout, clearTimeout, console,
    // WorkerLocation exposes protocol and host as well as href. Origin guards
    // must see the same URL fields here as they do in the real worker.
    location: new URL('https://iwa.invalid/runtime/LastROThreadEventHandler.js'),
    // Legacy filesystem initialization must never be required by an IWA.
    requestFileSystemSync: () => { throw new Error('legacy filesystem used'); },
    requestFileSystem: () => { throw new Error('legacy filesystem used'); },
    fetch: async (input: string | URL) => {
      requests.push(String(input));
      if (String(input).endsWith('/core/System/achievement_list_cn2_06.lua')) {
        return new Response(readFileSync('generated/core/System/achievement_list_cn2_06.lua'), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      return new Response(tableBytes, { headers: { 'content-type': 'application/octet-stream' } });
    },
    TCPSocket: class {
      readonly opened: Promise<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>;
      readonly closed = new Promise<void>(() => {});
      constructor(host: string, port: number) {
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const readable = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
        const writable = new WritableStream<Uint8Array>({
          write: (chunk) => {
            tcpRequests.push({ host, port, request: new TextDecoder().decode(chunk) });
            const body = new TextEncoder().encode('test#table#');
            controller.enqueue(new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.byteLength}\r\nConnection: close\r\n\r\n`));
            controller.enqueue(body);
            controller.close();
          },
        });
        this.opened = Promise.resolve({ readable, writable });
      }
      close = async () => {};
    },
    postMessage: (message: { type?: string; uid?: number; arguments?: [unknown, unknown, unknown] }) => {
      if (message.type === 'THREAD_READY') ready = true;
      if (message.uid) {
        const callback = callbacks.get(message.uid);
        callbacks.delete(message.uid);
        if (callback && message.arguments) callback(...message.arguments);
      }
    },
  });
  worker.self = worker;
  worker.importScripts = (...paths: string[]) => {
    for (const path of paths) {
      const filename = String(path).split('/').pop()!.split('?')[0];
      vm.runInContext(readFileSync(`generated/core/runtime/${filename}`, 'utf8'), worker);
    }
  };
  vm.runInContext(readFileSync('generated/runtime/LastROThreadEventHandler.js', 'utf8'), worker);
  const send = (type: string, data: unknown, callback?: (data: unknown, error: unknown, input: unknown) => void) => {
    const id = callback ? ++uid : 0;
    if (callback) callbacks.set(id, callback);
    worker.onmessage({ data: { type, data, uid: id } });
  };
  const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
  const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: unknown) => void }>();
  const main = vm.createContext({
    ArrayBuffer, Uint8Array,
    Configs: { get: (key: keyof typeof config) => config[key] },
    LastROExecutableManifest: manifest,
    Thread: { send }, PacketVerManager_default: { value: 0 },
    MemoryManager: {
      exist: () => false,
      get: (path: string, resolve: (data: unknown) => void, reject: (error: unknown) => void) => pending.set(path, { resolve, reject }),
      set: (path: string, data: unknown, error: unknown) => {
        const callback = pending.get(path)!;
        pending.delete(path);
        if (error) callback.reject(error);
        else callback.resolve(data);
      },
    },
    navigator: { webkitTemporaryStorage: { queryUsageAndQuota: () => { throw new Error('legacy quota used'); } } },
    document: { createElement: () => ({}) },
    Queue: class {
      tasks: Array<() => void> = [];
      add(task: () => void) { this.tasks.push(task); }
      run() { this.tasks[0]!(); }
      _next() { advances++; }
    },
    Intro_default: { append: () => { throw new Error('GRF picker displayed'); } },
  });
  vm.runInContext(`${pieces.get('savingFiles')}\n${pieces.get('loadFiles')}\n${pieces.get('onFileLoaded')}\n${pieces.get('onFileGetted')}\nvar Client = ${pieces.get('Client')};`, main);
  return { requests, tcpRequests, ready, main, send, advances: () => advances };
}

describe('V2 native resource startup', () => {
  it('removes the native loading overlay when WebGL startup throws', () => {
    let visible = false;
    const context = vm.createContext({
      roInitSpinner: { add: () => { visible = true; }, remove: () => { visible = false; } },
      Plugins: { init: () => {} },
      GameEngine: { init: () => { throw new Error('WebGL2 unavailable'); } },
      window: {},
    });
    expect(() => vm.runInContext(`${pieces.get('init')}\ninit();`, context)).toThrow('WebGL2 unavailable');
    expect(visible).toBe(false);
  });
  it('passes THREAD_READY and CLIENT_INIT without a GRF picker or legacy filesystem', () => {
    const runtime = harness();
    expect(runtime.ready).toBe(true);
    vm.runInContext('loadFiles(() => {});', runtime.main);
    expect(runtime.advances()).toBe(1);
  });

  it('passes the manifest from Client.init to real Worker LOAD_FILE and GET_FILE handlers', async () => {
    const runtime = harness();
    vm.runInContext('loadFiles(() => {});', runtime.main);
    const table = await vm.runInContext('new Promise((resolve, reject) => Client.loadFile("data/mp3nametable.txt", resolve, reject));', runtime.main);
    expect(table).toBeInstanceOf(Uint8Array);
    const script = await vm.runInContext('new Promise((resolve, reject) => Client.getFile("System/test.lua", resolve, reject));', runtime.main);
    expect(script).toBeInstanceOf(ArrayBuffer);
    expect(runtime.requests).toEqual(['https://iwa.invalid/core/System/test.lua']);
    expect(runtime.tcpRequests).toHaveLength(1);
    expect(runtime.tcpRequests[0]).toMatchObject({ host: 'game.lastro.cn', port: 80 });
    const request = runtime.tcpRequests[0]!.request;
    expect(request).toContain('GET /ro/client_re/data/mp3nametable.txt HTTP/1.1\r\n');
    expect(request).not.toMatch(/^(?:authorization|cookie):/im);
    expect(request.endsWith('\r\n\r\n')).toBe(true);
  });

  it('loads the packaged achievement Lua through the real LOAD_FILE path', async () => {
    const runtime = harness();
    vm.runInContext('loadFiles(() => {});', runtime.main);
    const source = await vm.runInContext('new Promise((resolve, reject) => Client.loadFile("System/achievement_list_cn2_06.lua", resolve, reject));', runtime.main);
    expect(source).toBeInstanceOf(Uint8Array);
    expect((source as Uint8Array).byteLength).toBeGreaterThan(200_000);
    expect(runtime.requests).toContain('https://iwa.invalid/core/System/achievement_list_cn2_06.lua');
    expect(runtime.tcpRequests).toHaveLength(0);
  });
});
