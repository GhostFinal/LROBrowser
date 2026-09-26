import type { LegacyClientSocket } from './client-socket';

export interface DirectSocketDependencies {
  TCPSocket?: DirectTcpConstructor;
  schedule?: (callback: () => void) => void;
  reportError?: (error: unknown) => void;
}

export class DirectTcpSocket implements LegacyClientSocket {
  connected = false;
  isZone?: boolean;
  handoffPending?: boolean;
  onComplete?: (success: boolean) => void;
  onMessage?: (buffer: ArrayBuffer) => void;
  onClose?: (error?: unknown) => void;

  private readonly host: string;
  private readonly port: number;
  private readonly constructorForSocket: DirectTcpConstructor | undefined;
  private readonly schedule: (callback: () => void) => void;
  private readonly reportError: (error: unknown) => void;
  private native?: DirectTcpConnection;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private writeTail: Promise<void> = Promise.resolve();
  private completed = false;
  private terminated = false;
  private openedSuccessfully = false;
  private closeRequested = false;
  private nativeCloseRequested = false;

  constructor(host: string, port: number, dependencies: DirectSocketDependencies = {}) {
    this.host = host;
    this.port = port;
    this.constructorForSocket = dependencies.TCPSocket ?? globalThis.TCPSocket;
    this.schedule = dependencies.schedule ?? ((callback) => globalThis.queueMicrotask(callback));
    this.reportError = dependencies.reportError ?? ((error) => {
      globalThis.reportError?.(error);
    });
    this.schedule(() => { void this.initialize(); });
  }

  send(buffer: ArrayBuffer): void {
    const copy = new Uint8Array(buffer.slice(0));
    this.writeTail = this.writeTail.then(async () => {
      if (this.terminated || !this.writer) return;
      await this.writer.write(copy);
    }).catch(error => {
      this.handleConnectionFailure(error);
    });
  }

  close(): void {
    if (this.terminated) return;
    this.closeRequested = true;
    if (!this.openedSuccessfully) {
      this.terminated = true;
      this.connected = false;
      this.notifyComplete(false);
      return;
    }
    this.terminate();
  }

  private async initialize(): Promise<void> {
    try {
      if (!this.constructorForSocket) throw new Error('Direct TCP 不受当前环境支持');
      const native = new this.constructorForSocket(this.host, this.port, { noDelay: true, keepAlive: true });
      this.native = native;
      void native.closed.then(() => this.handleNativeClosed(), error => this.handleNativeClosed(error));
      void native.opened.then(info => this.handleOpened(info), error => this.handleOpenFailure(error));
    } catch (error) {
      this.handleOpenFailure(error);
    }
  }

  private handleOpened(info: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): void {
    if (this.terminated || this.closeRequested) {
      const reader = info.readable.getReader();
      const writer = info.writable.getWriter();
      void reader.cancel().catch(() => undefined);
      void writer.abort().catch(() => undefined);
      reader.releaseLock();
      writer.releaseLock();
      this.notifyComplete(false);
      this.requestNativeClose();
      return;
    }
    this.reader = info.readable.getReader();
    this.writer = info.writable.getWriter();
    this.openedSuccessfully = true;
    this.connected = true;
    this.notifyComplete(true);
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (!this.terminated) {
        const result = await reader.read();
        if (result.done) {
          if (!this.terminated) this.handleConnectionFailure(new Error('Direct TCP 读取流已结束'));
          return;
        }
        if (!this.terminated && result.value) {
          const value = result.value;
          const bytes = new Uint8Array(value).slice().buffer;
          this.safeInvoke(() => this.onMessage?.(bytes));
        }
      }
    } catch (error) {
      if (!this.terminated) this.handleConnectionFailure(error);
    }
  }

  private handleOpenFailure(error: unknown): void {
    if (this.completed || this.openedSuccessfully) return;
    this.terminated = true;
    this.connected = false;
    this.notifyComplete(false);
    this.report(error);
  }

  private handleNativeClosed(error?: unknown): void {
    if (!this.openedSuccessfully) {
      this.handleOpenFailure(error ?? new Error('Direct TCP 在打开前关闭'));
      return;
    }
    if (!this.terminated) this.terminate(error);
  }

  private handleConnectionFailure(error: unknown): void {
    if (this.terminated) return;
    this.terminate(error);
  }

  private terminate(error?: unknown): void {
    if (this.terminated) return;
    this.terminated = true;
    this.connected = false;
    const reader = this.reader;
    const writer = this.writer;
    this.reader = undefined;
    this.writer = undefined;
    if (reader) {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (writer) {
      void writer.abort().catch(() => undefined);
      writer.releaseLock();
    }
    this.safeInvoke(() => this.onClose?.(error));
    this.requestNativeClose();
  }

  private requestNativeClose(): void {
    if (this.nativeCloseRequested || !this.native) return;
    this.nativeCloseRequested = true;
    try {
      void this.native.close().catch(error => this.report(error));
    } catch (error) {
      this.report(error);
    }
  }

  private notifyComplete(success: boolean): void {
    if (this.completed) return;
    this.completed = true;
    this.safeInvoke(() => this.onComplete?.(success));
  }

  private safeInvoke(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    if (error !== undefined) this.reportError(error);
  }
}
