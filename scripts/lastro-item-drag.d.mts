interface ItemDragCursor {
  x: number;
  y: number;
  freeze?: boolean;
  blockMagnetism?: boolean;
  ACTION?: { DEFAULT: number };
  setType?: (type: number) => void;
  getActualType?: () => number;
}
export function installLastroItemDrag(options: {
  document: Document;
  mouse: { screen: { x: number; y: number }; state?: number; MOUSE_STATE?: { USESKILL: number } };
  cursor: ItemDragCursor;
  isEnabled: () => boolean;
}): { cancel(): void; destroy(): void; active(): boolean };
export function patchRuntimeItemDrag(source: string): string;
