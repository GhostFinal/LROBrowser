import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectTcpSocket, type DirectSocketDependencies } from '../src/network/direct-tcp-socket';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(write?: (chunk: Uint8Array) => Promise<void>, dependencies: Partial<DirectSocketDependencies> = {}) {
  const opened = deferred<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>();
  const closed = deferred<void>();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const chunks: number[][] = [], options: unknown[] = [];
  const readable = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const writable = new WritableStream<Uint8Array>({ async write(chunk) { chunks.push([...chunk]); await write?.(chunk); } });
  const close = vi.fn(async () => {
    expect(readable.locked).toBe(false);
    expect(writable.locked).toBe(false);
    closed.resolve();
  });
  class Native {
    opened = opened.promise;
    closed = closed.promise;
    close = close;
    constructor(...args: unknown[]) { options.push(args); }
  }
  const socket = new DirectTcpSocket('45.248.8.68', 26569, { TCPSocket: Native, ...dependencies });
  socket.onComplete = vi.fn();
  socket.onClose = vi.fn();
  socket.onMessage = vi.fn();
  return { socket, opened, closed, close, controller, chunks, options, readable, writable,
    open: async () => { opened.resolve({ readable, writable }); await vi.waitFor(() => expect(socket.connected).toBe(true)); } };
}

afterEach(() => vi.unstubAllGlobals());

describe('Direct TCP lifecycle', () => {
  it('yields between buffered read batches so input and render tasks can run', async () => {
    const gate = deferred<void>();
    const yieldToMain = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(undefined);
    const h = harness(undefined, { yieldToMain, now: () => 0 });
    await h.open();
    for (let i = 0; i < 20; i++) h.controller.enqueue(new Uint8Array([i]));
    await vi.waitFor(() => expect(yieldToMain).toHaveBeenCalledOnce());
    expect(h.socket.onMessage).toHaveBeenCalledTimes(8);
    gate.resolve();
    await vi.waitFor(() => expect(h.socket.onMessage).toHaveBeenCalledTimes(20));
    expect(vi.mocked(h.socket.onMessage!).mock.calls.map(call => new Uint8Array(call[0])[0])).toEqual(Array.from({ length: 20 }, (_, i) => i));
    h.socket.close();
  });

  it('yields after an expensive packet handler even with fewer than eight chunks', async () => {
    let mono = 0;
    const gate = deferred<void>();
    const yieldToMain = vi.fn(() => gate.promise);
    const h = harness(undefined, { yieldToMain, now: () => mono });
    h.socket.onMessage = vi.fn(() => { mono += 5; });
    await h.open();
    h.controller.enqueue(new Uint8Array([1]));
    h.controller.enqueue(new Uint8Array([2]));
    await vi.waitFor(() => expect(yieldToMain).toHaveBeenCalledOnce());
    expect(h.socket.onMessage).toHaveBeenCalledOnce();
    h.socket.close();
    gate.resolve();
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
    expect(h.socket.onMessage).toHaveBeenCalledOnce();
  });

  it('opens asynchronously when the browser scheduler requires the global receiver', async () => {
    const schedule = globalThis.queueMicrotask;
    vi.stubGlobal('queueMicrotask', function (this: unknown, callback: () => void) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      schedule(callback);
    });

    const h = harness();
    expect(h.options).toEqual([]);
    expect(h.socket.onComplete).not.toHaveBeenCalled();
    await h.open();
    expect(h.socket.onComplete).toHaveBeenCalledExactlyOnceWith(true);
    h.socket.close();
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
  });

  it('opens once with latency options and copies exact read view boundaries', async () => {
    const h = harness();
    await h.open();
    expect(h.options).toEqual([['45.248.8.68', 26569, { noDelay: true, keepAliveDelay: 60_000 }]]);
    expect(h.socket.onComplete).toHaveBeenCalledExactlyOnceWith(true);
    const bytes = new Uint8Array([99, 1, 2, 98]);
    h.controller.enqueue(bytes.subarray(1, 3));
    h.controller.enqueue(new Uint8Array([3]));
    await vi.waitFor(() => expect(h.socket.onMessage).toHaveBeenCalledTimes(2));
    const received = vi.mocked(h.socket.onMessage!).mock.calls.map(call => [...new Uint8Array(call[0])]);
    expect(received).toEqual([[1, 2], [3]]);
    h.socket.close();
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
  });

  it('serializes writes and snapshots buffers before the caller can reuse them', async () => {
    const gate = deferred<void>();
    const h = harness(async chunk => { if (chunk[0] === 1) await gate.promise; });
    await h.open();
    const packet = new Uint8Array([1]);
    h.socket.send(packet.buffer);
    packet[0] = 9;
    h.socket.send(new Uint8Array([2]).buffer);
    await vi.waitFor(() => expect(h.chunks).toEqual([[1]]));
    gate.resolve();
    await vi.waitFor(() => expect(h.chunks).toEqual([[1], [2]]));
    h.socket.close();
  });

  it('discards later queued packets on close, releases locks, and preserves handoff state', async () => {
    const gate = deferred<void>();
    const h = harness(() => gate.promise);
    await h.open();
    h.socket.send(new Uint8Array([1]).buffer);
    h.socket.send(new Uint8Array([2]).buffer);
    await vi.waitFor(() => expect(h.chunks).toEqual([[1]]));
    let handoff: boolean | undefined;
    h.socket.onClose = vi.fn(() => { handoff = h.socket.handoffPending; });
    h.socket.handoffPending = true;
    h.socket.close();
    h.socket.close();
    gate.resolve();
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
    expect(handoff).toBe(true);
    expect(h.socket.onClose).toHaveBeenCalledOnce();
    expect(h.chunks).toEqual([[1]]);
  });

  it.each(['read', 'write', 'closed'] as const)('terminates once on %s failure', async mode => {
    const h = harness(mode === 'write' ? async () => { throw new Error('write failed'); } : undefined);
    await h.open();
    if (mode === 'read') h.controller.error(new Error('read failed'));
    if (mode === 'write') h.socket.send(new Uint8Array([1]).buffer);
    if (mode === 'closed') h.closed.reject(new Error('connection lost'));
    await vi.waitFor(() => expect(h.socket.onClose).toHaveBeenCalledOnce());
    h.socket.close();
    expect(h.socket.connected).toBe(false);
    expect(h.socket.onComplete).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reports open rejection once without a second close error', async () => {
    const h = harness();
    h.opened.reject(new Error('permission denied'));
    h.closed.reject(new Error('permission denied'));
    await vi.waitFor(() => expect(h.socket.onComplete).toHaveBeenCalledExactlyOnceWith(false));
    expect(h.socket.onClose).not.toHaveBeenCalled();
  });

  it('defers constructor errors until legacy callbacks have been installed', async () => {
    class Rejected { constructor() { throw new Error('permission denied'); } }
    const socket = new DirectTcpSocket('45.248.8.68', 26569, { TCPSocket: Rejected as never });
    socket.onComplete = vi.fn();
    await vi.waitFor(() => expect(socket.onComplete).toHaveBeenCalledExactlyOnceWith(false));
  });

  it('closes a late open without firing a successful connection callback', async () => {
    const h = harness();
    h.socket.close();
    h.opened.resolve({ readable: h.readable, writable: h.writable });
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
    expect(h.socket.onComplete).toHaveBeenCalledExactlyOnceWith(false);
    expect(h.socket.connected).toBe(false);
  });
});
