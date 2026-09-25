import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { patchV2Runtime } from '../scripts/patch-v2-runtime.mjs';
import { buildClientConfig } from '../src/runtime/client-config';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

const profile = LASTRO_SERVER_PROFILES[0];
if (!profile || profile.availability !== 'available') throw new Error('missing fixture profile');

describe('V2 runtime patch', () => {
  it('replaces the factory and removes legacy initialization regions', () => {
    const fixture = [
      '/** Earlier runtime documentation */\nconst retainedRuntime = 1;',
      '//#region src/Network/SocketHelpers/WebSocket.js\nfunction Socket$1() {}\n//#endregion',
      '//#region src/Network/SocketHelpers/NodeSocket.js\nvar Socket;\n//#endregion',
      'function defaultSocketFactory(host, port) { return new Socket(host, port); }',
      'function init_NetworkManager() { init_WebSocket(); init_NodeSocket(); }',
      'function loadFiles() { if (!Configs.get("remoteClient") && !count && !window.electronAPI?.isElectron) { alert("x"); } }',
    ].join('\n');
    const patched = patchV2Runtime(fixture);
    expect(patched).toContain('globalThis.LastRODirectSocketFactory(host, port)');
    expect(patched).toContain('const retainedRuntime = 1;');
    expect(patched).not.toMatch(/WebSocket|wss?:\/\/|socketProxy|electronAPI|NodeSocket/i);
  });

  it('fails closed when an anchored region drifts', () => {
    expect(() => patchV2Runtime('function defaultSocketFactory(host, port) {}')).toThrow(/anchor|function/);
  });

  it('maps available profiles to one server and only selected credentials', () => {
    for (const candidate of LASTRO_SERVER_PROFILES.slice(0, 2)) {
      if (candidate.availability !== 'available') throw new Error('unexpected unavailable profile');
      const config = buildClientConfig(candidate, { username: 'user', password: 'pass' });
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0]).toMatchObject({ address: candidate.loginAddress, port: candidate.loginPort,
        version: candidate.version, langtype: candidate.langtype, packetver: candidate.packetver });
      expect(config.autoLogin).toEqual(['user', 'pass']);
      expect(JSON.stringify(config)).not.toMatch(/wss?:\/\/|XKore|quickLogin|socketProxy/i);
      expect(Object.isFrozen(config)).toBe(true);
    }
  });

  it('keeps the real imported runtime source available for the next patch step', async () => {
    await expect(readFile('.staging/v2/Online.js', 'utf8')).resolves.toContain('defaultSocketFactory');
  });
});
