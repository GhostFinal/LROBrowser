export interface MovementInputTarget { x: number; y: number; }
export interface MovementInputContext { map: string; player: unknown; }
export function createLastroMovementInput(deps: {
  getTarget: () => MovementInputTarget | null | undefined;
  getContext: () => MovementInputContext | null | undefined;
  canMove: (target: MovementInputTarget, phase: 'request' | 'pending' | 'repeat') => boolean;
  sendMove: (target: MovementInputTarget) => boolean | void;
  onManualMove?: () => void;
  onError?: (error: unknown) => void;
  now?: () => number;
  clock?: { setTimeout: (callback: () => void, ms: number) => unknown; clearTimeout: (timer: unknown) => void; };
}): { request(): boolean; stop(): void; cancel(): void; };
export function refreshLastroGroundInput(event: MouseEvent | undefined, deps: {
  mouse: { screen: { x: number; y: number }; world: { x: number; y: number; z: number }; intersect: boolean; state: number; MOUSE_STATE: { USESKILL: number }; };
  canvas: HTMLElement | null | undefined;
  ready: boolean;
  pick: (out: Int16Array) => boolean;
  getHeight: (x: number, y: number) => number;
  refreshEntity?: () => void;
  onError?: (error: unknown) => void;
}): boolean;
export function patchRuntimeMovementInput(source: string): string;
