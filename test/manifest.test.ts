// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Phase A IWA', () => {
  it('declares an isolated, manually installed app with Direct Sockets permissions', async () => {
    const source = await readFile('public/.well-known/manifest.webmanifest', 'utf8');
    const manifest = JSON.parse(source);
    expect(manifest.name).toBe('LRO进阶客户端(Powered by LTSD.Ro)');
    expect(manifest.short_name).toBe('LRO进阶客户端');
    expect(manifest.version).toMatch(/^\d+(?:\.\d+)*$/);
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.permissions_policy['direct-sockets']).toEqual(['self']);
    expect(manifest.permissions_policy.gamepad).toEqual(['self']);
    expect(manifest.permissions_policy['cross-origin-isolated']).toEqual(['self']);
    expect(manifest.permissions_policy.autoplay).toEqual(['self']);
    expect(manifest.icons).toEqual([{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }]);
    expect(manifest).not.toHaveProperty('update_manifest_url');
    expect(source).not.toMatch(/socketProxy|WebSocket|wss/i);
  });

  it('keeps the full app title consistent across the HTML and shell sources', async () => {
    const [html, shell] = await Promise.all([
      readFile('index.html', 'utf8'),
      readFile('src/app-shell.ts', 'utf8'),
    ]);
    expect(html).toContain('<title>LRO进阶客户端(Powered by LTSD.Ro)</title>');
    expect(shell).toContain("title.textContent = 'LRO进阶客户端(Powered by LTSD.Ro)';");
  });

  it('ships the bundled Chinese font files and their license', async () => {
    const [medium, bold, license] = await Promise.all([
      readFile('public/fonts/SourceHanSansCN-Medium.otf'),
      readFile('public/fonts/SourceHanSansCN-Bold.otf'),
      readFile('public/fonts/OFL.txt', 'utf8'),
    ]);
    expect(medium.byteLength).toBeGreaterThan(8_000_000);
    expect(bold.byteLength).toBeGreaterThan(8_000_000);
    expect(license).toContain('SIL OPEN FONT LICENSE');
    expect(license).toContain('Version 1.1');
  });

});
