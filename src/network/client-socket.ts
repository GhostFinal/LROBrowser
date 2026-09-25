export interface LegacyClientSocket {
  connected: boolean;
  isZone?: boolean;
  handoffPending?: boolean;
  onComplete?: (success: boolean) => void;
  onMessage?: (buffer: ArrayBuffer) => void;
  onClose?: (error?: unknown) => void;
  send(buffer: ArrayBuffer): void;
  close(): void;
}
