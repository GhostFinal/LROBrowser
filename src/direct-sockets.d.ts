declare global {
  interface DirectTcpSocketOptions {
    noDelay?: boolean;
    keepAlive?: boolean;
  }

  interface DirectTcpConnection {
    readonly opened: Promise<{
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    }>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
  }

  interface DirectTcpConstructor {
    new (host: string, port: number, options?: DirectTcpSocketOptions): DirectTcpConnection;
  }

  var TCPSocket: DirectTcpConstructor | undefined;
}

export {};
