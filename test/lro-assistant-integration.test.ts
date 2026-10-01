import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';
import { patchLroAssistantRuntime } from '../scripts/patch-lro-assistant.mjs';

describe('LRO assistant integration', () => {
  it('is built in by default and follows the selected server', () => {
    const credentials = { username: '', password: '' };
    const profile = getAvailableServerProfile('lastro-2x');
    expect(buildClientConfig(profile, credentials).lroAssistantEnabled).toBe(true);
    const enabled = buildClientConfig(profile, credentials, { assistantEnabled: true });
    expect(enabled.lroAssistantEnabled).toBe(true);
    expect(enabled.lroAssistantProfile).toBe('lastro-2x');
  });
  it('fails closed when upstream dispatch or boot structure changes', () => {
    expect(() => patchLroAssistantRuntime('init();')).toThrow('dispatch anchor');
    expect(() => patchLroAssistantRuntime('if (packet.callback) packet.callback(packet.instance);')).toThrow('boot anchor');
  });
  it('packages every assistant dependency and guards native capture listeners', async () => {
    const runtime = await readFile('generated/runtime/Online.js', 'utf8');
    expect(() => execFileSync(process.execPath, ['--check', 'generated/runtime/Online.js'])).not.toThrow();
    const manifest = JSON.parse(await readFile('generated/core/executable-assets.json', 'utf8'));
    for (const name of ['lro-market-api', 'lro-assistant', 'lro-assistant-standard', 'lro-assistant-storage', 'lro-assistant-dom', 'lro-assistant-input', 'lro-assistant-packets', 'lro-assistant-target', 'lro-monster-reference', 'lro-assistant-shop', 'lro-assistant-ui', 'lro-assistant-windows', 'lro-assistant-icon', 'lro-assistant-theme', 'lro-assistant-features', 'lro-client-knowledge', 'lastro-trusted-dom']) {
      expect(manifest.files.some((file: { path: string }) => file.path === `runtime/${name}.mjs`)).toBe(true);
    }
    expect(runtime).toContain('addAssistantAwareListener(document,');
    expect(runtime).toContain("lroAssistantPackets.emit(packet.Struct, packet.instance, 'before')");
    expect(runtime).toContain("finally { lroAssistantPackets.emit(packet.Struct, packet.instance, 'after'); }");
    expect(runtime).not.toContain('EventTarget.prototype.addEventListener =');
    expect(runtime).toContain('Component.lroReadItems =');
    expect(runtime).toContain('Component.lroReadParty =');
    expect(runtime).toContain('MiniMap.lroReadZoom =');
    expect(() => patchLroAssistantRuntime(runtime)).toThrow('already applied');
  });
});
