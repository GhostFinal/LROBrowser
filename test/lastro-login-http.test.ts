import { describe, expect, it, vi } from 'vitest';
import { buildLastROLoginRequest, prepareLastROLoginSession, sendLastROLoginPost } from '../src/network/lastro-login-http';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('LastRO login HTTP transport', () => {
  it('encodes nid-specific credentials into the requested endpoint', () => {
    expect(buildLastROLoginRequest('check', 3, 'user name', 'p&ss').body)
      .toBe('Login_cn2%5Buserid%5D=user+name&Login_cn2%5Buser_pass%5D=p%26ss');
    expect(buildLastROLoginRequest('checkin', 4, 'user', 'pass').path).toBe('/?r=mg/checkin&nid=4');
  });

  it('bootstraps Yii2 csrf state before sending the registration POST', async () => {
    const csrfToken = 'csrf-token/with+chars=';
    const csrfCookie = 'cookie-value%3A2%3A%7Bi%3A0%3Bs%3A5%3A%22_csrf%22%3B%7D';
    const page = `<input name="_csrf" type="hidden" id="_csrf" value="${csrfToken}" />`;
    const pageBytes = new TextEncoder().encode(page);
    const response = new TextEncoder().encode([
      'HTTP/1.1 200 OK',
      `Set-Cookie: _csrf=${csrfCookie}; path=/; httponly`,
      'Transfer-Encoding: chunked',
      'Content-Type: text/html; charset=UTF-8',
      'Connection: close',
      '',
      `${pageBytes.byteLength.toString(16)}\r\n${page}\r\n0\r\n\r\n`,
    ].join('\r\n'));
    const requests: string[] = [];
    const constructorArgs: unknown[][] = [];
    const postReadable = { getReader: vi.fn() } as unknown as ReadableStream<Uint8Array>;
    let instance = 0;
    class Native {
      opened: Promise<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>;
      closed = Promise.resolve();
      close = vi.fn(async () => {});
      constructor(...args: unknown[]) {
        constructorArgs.push(args);
        const current = instance++;
        const readable = current === 0
          ? new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(response); controller.close(); },
          })
          : postReadable;
        const writable = new WritableStream<Uint8Array>({
          write(chunk) { requests.push(new TextDecoder().decode(chunk)); },
        });
        this.opened = Promise.resolve({ readable, writable });
      }
    }

    await sendLastROLoginPost('checkin', 5, 'testbot1', '5158951589', { TCPSocket: Native });

    expect(requests).toHaveLength(2);
    expect(constructorArgs).toEqual([
      ['game.lastro.cn', 80, { noDelay: true, keepAliveDelay: 60_000 }],
      ['game.lastro.cn', 80, { noDelay: true, keepAliveDelay: 60_000 }],
    ]);
    expect(requests[0]).toContain('GET /?r=pc/index HTTP/1.1\r\n');
    expect(requests[1]).toContain('POST /?r=mg/checkin&nid=5 HTTP/1.1\r\n');
    expect(requests[1]).toContain(`Cookie: _csrf=${csrfCookie}\r\n`);
    expect(requests[1]).toContain(`_csrf=${encodeURIComponent(csrfToken).replace(/%20/g, '+')}`);
    const expectedBody = `_csrf=${encodeURIComponent(csrfToken).replace(/%20/g, '+')}&Login_debug%5Buserid%5D=testbot1&Login_debug%5Buser_pass%5D=5158951589`;
    expect(requests[1]).toContain(`Content-Length: ${new TextEncoder().encode(expectedBody).byteLength}\r\n`);
    expect(requests[1]).toContain('Login_debug%5Buserid%5D=testbot1&Login_debug%5Buser_pass%5D=5158951589');
    expect(postReadable.getReader).not.toHaveBeenCalled();
  });

  it('reuses a session prepared before login instead of delaying the POST for bootstrap', async () => {
    const csrfToken = 'prepared-token';
    const csrfCookie = 'prepared-cookie';
    const page = `<input name="_csrf" value="${csrfToken}">`;
    const pageBytes = new TextEncoder().encode(page);
    const response = new TextEncoder().encode([
      'HTTP/1.1 200 OK',
      `Set-Cookie: _csrf=${csrfCookie}; path=/; httponly`,
      'Content-Length: ' + pageBytes.byteLength,
      'Connection: close',
      '',
      page,
    ].join('\r\n'));
    const requests: string[] = [];
    let instance = 0;
    class Native {
      opened: Promise<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>;
      closed = Promise.resolve();
      close = vi.fn(async () => {});
      constructor() {
        const current = instance++;
        const readable = current === 0
          ? new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(response); controller.close(); },
          })
          : new ReadableStream<Uint8Array>();
        const writable = new WritableStream<Uint8Array>({
          write(chunk) { requests.push(new TextDecoder().decode(chunk)); },
        });
        this.opened = Promise.resolve({ readable, writable });
      }
    }

    await prepareLastROLoginSession({ TCPSocket: Native });
    await sendLastROLoginPost('checkin', 5, 'testbot1', '5158951589', { TCPSocket: Native });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('GET /?r=pc/index HTTP/1.1\r\n');
    expect(requests[1]).toContain('POST /?r=mg/checkin&nid=5 HTTP/1.1\r\n');
    expect(requests[1]).toContain(`Cookie: _csrf=${csrfCookie}\r\n`);
  });

  it('closes the socket when opening fails', async () => {
    const opened = deferred<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>();
    const closed = deferred<void>();
    const close = vi.fn(async () => closed.resolve());
    class Native {
      opened = opened.promise;
      closed = closed.promise;
      close = close;
    }
    const pending = sendLastROLoginPost('check', 5, 'user', 'pass', { TCPSocket: Native });
    opened.reject(new Error('denied'));
    await expect(pending).rejects.toThrow('denied');
    expect(close).toHaveBeenCalledOnce();
  });
});
