import type { LegacyClientSocket } from './client-socket';
import { DirectTcpSocket } from './direct-tcp-socket';

export class UnsupportedDirectSocketsError extends Error {
  constructor() {
    super('当前环境不支持 Direct TCP');
    this.name = 'UnsupportedDirectSocketsError';
  }
}

export function isDirectSocketsSupported(): boolean {
  return typeof globalThis.TCPSocket === 'function';
}

export function createDirectSocket(host: string, port: number): LegacyClientSocket {
  if (!isDirectSocketsSupported()) throw new UnsupportedDirectSocketsError();
  return new DirectTcpSocket(host, port);
}
