import type { AvailableServerProfile, LastROServerProfile } from './server-profile';

export class ServerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerUnavailableError';
  }
}

export const LASTRO_SERVER_PROFILES: readonly LastROServerProfile[] = Object.freeze([
  Object.freeze({
    id: 'lastro-3x', displayName: '3转服', availability: 'available',
    loginAddress: '45.248.8.68', loginPort: 28569, version: 45, langtype: 3, packetver: 20211103,
    packetKeys: Object.freeze([1205481659, 453061308, 592073252] as const),
    clientHash: '83ba069fd7c9e7683c435cecd507b18d', clientVer: 3, lastroNid: 3, resourceProfileId: 'lastro-public',
  }),
  Object.freeze({
    id: 'lastro-2x', displayName: '2转服', availability: 'available',
    loginAddress: '45.248.8.68', loginPort: 26569, version: 45, langtype: 4, packetver: 20211103,
    packetKeys: Object.freeze([1205481659, 453065404, 592073252] as const),
    clientHash: '83ba069fd7c9e7683c435cecd507b18d', clientVer: 5, lastroNid: 5, resourceProfileId: 'lastro-public',
  }),
  Object.freeze({
    id: 'lastro-app', displayName: 'App服', availability: 'unavailable',
    unavailableReason: 'App服协议参数尚未完成验证', resourceProfileId: 'lastro-public',
  }),
]);

export function getServerProfile(id: string): LastROServerProfile {
  const profile = LASTRO_SERVER_PROFILES.find(profile => profile.id === id);
  if (!profile) throw new Error('未知服务器');
  return profile;
}

export function getAvailableServerProfile(id: string): AvailableServerProfile {
  const profile = getServerProfile(id);
  if (profile.availability !== 'available') throw new ServerUnavailableError(profile.unavailableReason);
  return profile;
}
