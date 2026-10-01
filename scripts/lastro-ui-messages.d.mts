export interface UiMessageOverride { source: string; label: string; }
export type UiMessageTable = Record<number, string> | string[];
export const UI_MESSAGE_OVERRIDES: Readonly<Record<number, UiMessageOverride>>;
export interface LastroUiMessages {
  loadCsv(data: ArrayBuffer | Uint8Array, targetTable: UiMessageTable, decode: (bytes: Uint8Array) => string): boolean;
  resolveMessage(id: number | string, value: unknown, defaultText?: string): string | undefined;
}
export function createLastroUiMessages(overrides?: Readonly<Record<number, UiMessageOverride>>): LastroUiMessages;
export function patchRuntimeUiMessages(source: string): string;
