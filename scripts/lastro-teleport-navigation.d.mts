export type TeleportNavigationPoint = readonly [map: string, x: number, y: number];
export interface TeleportNavigationRoute {
  outset?: readonly unknown[];
  path?: readonly (readonly unknown[])[];
  position?: readonly string[];
}
export function createLastroTeleportNavigation(deps: {
  getMap: () => string | null | undefined;
  getPosition: () => readonly number[] | null | undefined;
  sendTeleport: (point: TeleportNavigationPoint) => void;
  navigate: (point: TeleportNavigationPoint) => void;
  setStatus?: (message: string) => void;
  clock?: {
    setTimeout: (callback: () => void, milliseconds: number) => unknown;
    clearTimeout: (timer: unknown) => void;
  };
}): {
  request: (route: TeleportNavigationRoute) => 'navigation' | 'teleport';
  onMapChanging: () => void;
  onMapChanged: () => void;
  onTeleportRejected: (message: string) => void;
  cancel: () => void;
  dispose: () => void;
};
