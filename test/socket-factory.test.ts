import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectSocket, isDirectSocketsSupported, UnsupportedDirectSocketsError } from '../src/network/socket-factory';
afterEach(() => vi.unstubAllGlobals());

describe('Direct TCP factory', () => {
  it('blocks unsupported environments without creating a transport', () => {
    vi.stubGlobal('TCPSocket', undefined);
    expect(isDirectSocketsSupported()).toBe(false);
    expect(() => createDirectSocket('45.248.8.68', 26569)).toThrow(UnsupportedDirectSocketsError);
  });
  it('contains no alternate transport implementation', async () => {
    const source = await readFile('src/network/socket-factory.ts', 'utf8') + await readFile('src/network/direct-tcp-socket.ts', 'utf8');
    expect(source).not.toMatch(/WebSocket|wss?:\/\/|proxy|electron|NodeSocket/i);
  });
});
