import { describe, expect, it } from 'vitest';
import { LASTRO_SERVER_PROFILES, getServerProfile, getAvailableServerProfile, ServerUnavailableError } from '../src/servers/server-profiles';

describe('immutable LastRO profiles', () => {
  it('contains exactly the two known servers and the disabled placeholder', () => {
    expect(LASTRO_SERVER_PROFILES.map(p => p.id)).toEqual(['lastro-3x', 'lastro-2x', 'lastro-app']);
    for (const [id, port, langtype, key, ver] of [
      ['lastro-3x', 28569, 3, 453061308, 3], ['lastro-2x', 26569, 4, 453065404, 5],
    ] as const) {
      expect(getAvailableServerProfile(id)).toEqual({
        id, displayName: id === 'lastro-3x' ? '3转服' : '2转服', availability: 'available',
        loginAddress: '45.248.8.68', loginPort: port, version: 45, langtype, packetver: 20211103,
        packetKeys: [1205481659, key, 592073252], clientHash: '83ba069fd7c9e7683c435cecd507b18d',
        clientVer: ver, lastroNid: ver, resourceProfileId: 'lastro-public',
      });
    }
    expect(getServerProfile('lastro-app')).toEqual({
      id: 'lastro-app', displayName: 'App服', availability: 'unavailable',
      unavailableReason: 'App服协议参数尚未完成验证', resourceProfileId: 'lastro-public',
    });
    expect(() => getAvailableServerProfile('lastro-app')).toThrow(ServerUnavailableError);
    expect(() => getServerProfile('untrusted-server')).toThrow();
  });

  it('freezes the collection, profiles, and packet keys against runtime overrides', () => {
    expect(Object.isFrozen(LASTRO_SERVER_PROFILES)).toBe(true);
    const profile = getAvailableServerProfile('lastro-2x');
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.packetKeys)).toBe(true);
    expect(() => Object.assign(profile, { loginPort: 1 })).toThrow();
    expect(getAvailableServerProfile('lastro-2x').loginPort).toBe(26569);
  });
});
