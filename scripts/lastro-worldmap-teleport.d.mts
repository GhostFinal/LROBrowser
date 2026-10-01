export interface WorldMapTeleportOptions {
  preflight: { check(route: unknown): Promise<{ approved: boolean }>; cancel(): void };
  getMap(): string;
  getProfile(): unknown;
  /** Preserve the native type 0 map warp and its default 0/0 coordinates. */
  send(mapid: string): void;
  onSameMap?(mapid: string): void;
  onError?(error: unknown): void;
}
export function createLastroWorldMapTeleport(options: WorldMapTeleportOptions): {
  request(mapid: string): Promise<boolean>;
  cancelPending(): void;
};
