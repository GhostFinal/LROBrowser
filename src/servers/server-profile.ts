export type ServerAvailability = 'available' | 'unavailable';
export type AvailableServerId = 'lastro-3x' | 'lastro-2x';
export type ServerProfileId = AvailableServerId | 'lastro-app';

interface BaseProfile {
  readonly id: ServerProfileId;
  readonly displayName: string;
  readonly resourceProfileId: 'lastro-public';
}

export interface AvailableServerProfile extends BaseProfile {
  readonly id: AvailableServerId;
  readonly availability: 'available';
  readonly loginAddress: string;
  readonly loginPort: number;
  readonly version: number;
  readonly langtype: number;
  readonly packetver: number;
  readonly packetKeys: readonly [number, number, number];
  readonly clientHash: string;
  readonly clientVer: number;
  readonly lastroNid: number;
}

export interface UnavailableServerProfile extends BaseProfile {
  readonly id: 'lastro-app';
  readonly availability: 'unavailable';
  readonly unavailableReason: string;
}

export type LastROServerProfile = AvailableServerProfile | UnavailableServerProfile;
