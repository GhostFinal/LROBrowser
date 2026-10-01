export interface TeleportFeedbackOptions {
  showNotice(message: string, response?: number): void;
  writeChat(message: string, response?: number): void;
  onRejected?(message: string, response: number): void;
  onError?(error: unknown): void;
}
export function createLastroTeleportFeedback(options: TeleportFeedbackOptions): (packet: { response?: unknown } | null | undefined) => boolean;
export function patchRuntimeTeleportFeedback(source: string): string;
