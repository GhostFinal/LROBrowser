import { describe, expect, it } from 'vitest';
import { LASTRO_SERVER_PROFILES, getServerProfile, getAvailableServerProfile } from '../src/servers/server-profiles';

describe('immutable LastRO profiles', () => {
  it('contains the three verified server profiles', () => {
    expect(LASTRO_SERVER_PROFILES.map(p => p.id)).toEqual(['lastro-3x', 'lastro-2x', 'lastro-app']);
    for (const [id, port, langtype, packetKeys, ver] of [
      ['lastro-3x', 28569, 3, [1205481659, 453061308, 592073252], 3],
      ['lastro-2x', 26569, 4, [1205481642, 453065386, 592073252], 5],
      ['lastro-app', 27569, 4, [1473917115, 721500860, 860508708], 6],
    ] as const) {
      expect(getAvailableServerProfile(id)).toEqual({
        id, displayName: id === 'lastro-3x' ? '3转服' : id === 'lastro-2x' ? '2转服' : 'App服', availability: 'available',
        loginAddress: '45.248.8.68', loginPort: port, version: 45, langtype, packetver: 20211103,
        packetKeys, clientHash: id === 'lastro-app' ? '23ba069fd7c9e5683c435cecd507b11d' : '83ba069fd7c9e7683c435cecd507b18d',
        clientVer: id === 'lastro-app' ? 5 : ver, lastroNid: ver, resourceProfileId: 'lastro-public',
      });
    }
    expect(getAvailableServerProfile("lastro-app")).toEqual({
      id: "lastro-app",
      displayName: "App服",
      availability: "available",
      loginAddress: "45.248.8.68",
      loginPort: 27569,
      version: 45,
      langtype: 4,
      packetver: 20211103,
      packetKeys: [1473917115, 721500860, 860508708],
      clientHash: "23ba069fd7c9e5683c435cecd507b11d",
      clientVer: 5,
      lastroNid: 6,
      resourceProfileId: "lastro-public",
    });
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
