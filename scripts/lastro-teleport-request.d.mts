export interface VerifiedTeleportRequestOptions {
  preflight: { check(route: unknown): Promise<{ approved: boolean }>; cancel(): void };
  navigation: { request(route: unknown): string; cancel(): void };
  getMap(): string;
  getProfile(): unknown;
  clearNavigation?(): void;
  sendTeleport?(point: readonly unknown[]): void;
}
export function createLastroVerifiedTeleportRequest(options: VerifiedTeleportRequestOptions): {
  request(route: unknown): Promise<string | null>;
  cancelPending(): void;
  cancel(): void;
};
