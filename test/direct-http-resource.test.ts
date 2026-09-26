import { describe, expect, it, vi } from 'vitest';
import { createDirectHttpFetch } from '../src/resources/direct-http-resource';

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function responseBytes(statusLine: string, headers: string[], body: Uint8Array): Uint8Array {
  return concatBytes(ascii(`${statusLine}\r\n${headers.join('\r\n')}\r\n\r\n`), body);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

interface HarnessOptions {
  response?: Uint8Array[];
  holdResponse?: boolean;
  openTimeoutMs?: number;
  readTimeoutMs?: number;
}

function harness(options: HarnessOptions = {}) {
  const opened = deferred<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>();
  const closed = deferred<void>();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const requests: Uint8Array[] = [];
  const constructorArgs: unknown[][] = [];
  const readable = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      requests.push(chunk.slice());
      if (!options.holdResponse) {
        for (const responseChunk of options.response ?? []) controller.enqueue(responseChunk);
        controller.close();
      }
    },
  });
  const close = vi.fn(async () => closed.resolve());
  class Native {
    opened = opened.promise;
    closed = closed.promise;
    constructor(...args: unknown[]) { constructorArgs.push(args); }
    close = close;
  }
  const fetch = createDirectHttpFetch({
    TCPSocket: Native,
    ...(options.openTimeoutMs === undefined ? {} : { openTimeoutMs: options.openTimeoutMs }),
    ...(options.readTimeoutMs === undefined ? {} : { readTimeoutMs: options.readTimeoutMs }),
  });
  return { fetch, requests, constructorArgs, close, controller, opened, readable, writable };
}

describe('Direct HTTP resource transport', () => {
  it('sends an allowlisted HTTP request and parses split binary responses', async () => {
    const body = new Uint8Array([0, 255, 1, 2]);
    const response = responseBytes('HTTP/1.1 200 OK', [
      'Content-Type: application/octet-stream',
      'Content-Length: 4',
      'ETag: "fixture"',
    ], body);
    const split = [response.slice(0, 17), response.slice(17, 63), response.slice(63)];
    const h = harness({ response: split });
    h.opened.resolve({ readable: h.readable, writable: h.writable });

    const result = await h.fetch('https://game.lastro.cn/ro/client_re/data/test.gat');

    expect(result.status).toBe(200);
    expect(result.headers.get('etag')).toBe('"fixture"');
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(body);
    expect(h.constructorArgs).toEqual([['game.lastro.cn', 80, { noDelay: true, keepAlive: true }]]);
    const request = new TextDecoder().decode(h.requests[0]);
    expect(request).toContain('GET /ro/client_re/data/test.gat HTTP/1.1\r\n');
    expect(request).toContain('Host: game.lastro.cn\r\n');
    expect(request).toContain('Accept-Encoding: identity\r\n');
    expect(request).toContain('Connection: close\r\n');
  });

  it('decodes chunked binary bodies and preserves non-success statuses', async () => {
    const response = responseBytes('HTTP/1.1 404 Not Found', [
      'Content-Type: application/octet-stream',
      'Transfer-Encoding: chunked',
    ], concatBytes(
      ascii('3\r\n'), new Uint8Array([0, 255, 1]), ascii('\r\n'),
      ascii('1\r\n'), new Uint8Array([2]), ascii('\r\n'),
      ascii('0\r\nX-Fixture: yes\r\n\r\n'),
    ));
    const h = harness({ response: [response] });
    h.opened.resolve({ readable: h.readable, writable: h.writable });

    const result = await h.fetch('https://game.lastro.cn/ro/client_re/data/missing.gat');

    expect(result.status).toBe(404);
    expect(result.ok).toBe(false);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([0, 255, 1, 2]));
  });

  it('rejects conflicting content lengths instead of guessing a body boundary', async () => {
    const response = responseBytes('HTTP/1.1 200 OK', [
      'Content-Length: 2',
      'Content-Length: 3',
    ], new Uint8Array([1, 2, 3]));
    const h = harness({ response: [response] });
    h.opened.resolve({ readable: h.readable, writable: h.writable });

    await expect(h.fetch('https://game.lastro.cn/ro/client_re/data/bad.gat')).rejects.toThrow(/content-length/i);
  });

  it('rejects a response that combines content-length with chunked framing', async () => {
    const response = responseBytes('HTTP/1.1 200 OK', [
      'Content-Length: 4',
      'Transfer-Encoding: chunked',
    ], concatBytes(ascii('4\r\n'), new Uint8Array([1, 2, 3, 4]), ascii('\r\n0\r\n\r\n')));
    const h = harness({ response: [response] });
    h.opened.resolve({ readable: h.readable, writable: h.writable });

    await expect(h.fetch('https://game.lastro.cn/ro/client_re/data/bad.gat')).rejects.toThrow(/both.*content-length.*transfer-encoding/i);
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('rejects transfer codings that the bounded parser cannot decode', async () => {
    const response = responseBytes('HTTP/1.1 200 OK', [
      'Transfer-Encoding: gzip, chunked',
    ], new Uint8Array());
    const h = harness({ response: [response] });
    h.opened.resolve({ readable: h.readable, writable: h.writable });

    await expect(h.fetch('https://game.lastro.cn/ro/client_re/data/bad.gat')).rejects.toThrow(/transfer encoding/i);
  });

  it('closes the native socket when opening exceeds the timeout', async () => {
    const h = harness({ openTimeoutMs: 1 });

    await expect(h.fetch('https://game.lastro.cn/ro/client_re/data/slow.gat')).rejects.toThrow(/open timeout/i);
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('closes the native socket when the caller aborts an in-flight request', async () => {
    const h = harness({ holdResponse: true });
    h.opened.resolve({ readable: h.readable, writable: h.writable });
    const signal = new AbortController();
    const pending = h.fetch('https://game.lastro.cn/ro/client_re/data/slow.gat', { signal: signal.signal });
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    signal.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('rejects unapproved origins before opening a socket', async () => {
    const h = harness({ response: [] });

    await expect(h.fetch('https://example.invalid/ro/client_re/data/test.gat')).rejects.toThrow(/approved resource origin/i);
    expect(h.constructorArgs).toEqual([]);
  });
});
