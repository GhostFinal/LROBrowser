// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { mountAppShell } from '../src/app-shell';

describe('Phase A IWA', () => {
  it('declares an isolated, manually installed app with Direct Sockets permissions', async () => {
    const source = await readFile('public/.well-known/manifest.webmanifest', 'utf8');
    const manifest = JSON.parse(source);
    expect(manifest.name).toBe('LastRO V2');
    expect(manifest.version).toMatch(/^\d+(?:\.\d+)*$/);
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.permissions_policy['direct-sockets']).toEqual(['self']);
    expect(manifest.permissions_policy['cross-origin-isolated']).toEqual(['self']);
    expect(manifest.icons).toEqual([{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }]);
    expect(manifest).not.toHaveProperty('update_manifest_url');
    expect(source).not.toMatch(/socketProxy|WebSocket|wss/i);
  });

  it('mounts accessible environment, server, account, and game regions', () => {
    const root = document.createElement('div');
    mountAppShell(root);
    expect(root.querySelector('[role="status"]')?.id).toBe('environment-status');
    expect(root.querySelector('#server-region')?.getAttribute('aria-labelledby')).toBe('server-title');
    expect(root.querySelector('#account-region')?.getAttribute('aria-labelledby')).toBe('account-title');
    expect(root.querySelector('#game-mount')).toBeInstanceOf(HTMLElement);
    expect(root.textContent).toContain('LastRO V2');
  });
});
