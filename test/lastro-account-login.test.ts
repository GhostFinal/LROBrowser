// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAccountStore } from '../src/accounts/account-store';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';

// The runtime module is deliberately shipped as an executable MJS asset.
// @ts-expect-error Runtime MJS is validated by the Vite bundle and this focused test.
import { decorateLastROLoginStyles, decorateLastROLoginTemplate, installLastROLogin } from '../src/runtime/lastro-account-login.mjs';

describe('LastRO native login integration', () => {
  it('replaces the private quick-login panel with the native account panel', () => {
    const html = '<div class="login"><div class="quick-login-panel">private data</div><input class="user" /></div>';
    const decorated = decorateLastROLoginTemplate('WinLogin', html);
    expect(decorated).not.toContain('quick-login-panel');
    expect(decorated).toContain('data-lastro-login-panel');
    expect(decorated).toContain('data-lastro-server-list');
    expect(decorated).toContain('data-lastro-account-password');
  });

  it('leaves unrelated V2 windows unchanged', () => {
    const html = '<div class="window"></div>';
    const css = '.window { color: black; }';
    expect(decorateLastROLoginTemplate('WinInventory', html)).toBe(html);
    expect(decorateLastROLoginStyles('WinInventory', css)).toBe(css);
  });

  it('keeps account editor inputs in normal flow alongside the legacy native form', () => {
    const source = readFileSync('.staging/runtime/Online.js', 'utf8');
    const css = vm.runInNewContext(source.match(/WinLogin_default\$1 = ("[^\n]+");/)![1]!);
    const style = document.createElement('style');
    style.textContent = decorateLastROLoginStyles('WinLogin', css);
    const root = document.createElement('div');
    root.innerHTML = decorateLastROLoginTemplate('WinLogin', '<div id="WinLogin"><input class="user"><input class="pass"><button class="connect"></button></div>');
    document.head.append(style);
    document.body.append(root);
    try {
      expect(getComputedStyle(root.querySelector('.user')!).position).toBe('absolute');
      expect(getComputedStyle(root.querySelector('[data-lastro-account-username]')!).position).toBe('static');
      expect(root.querySelector('[data-lastro-login-panel]')?.parentElement?.id).toBe('WinLogin');
    } finally { root.remove(); style.remove(); }
  });

  it('fills the original login fields from this IWA IndexedDB without submitting a login', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('LastRODirectSocketsSupported', true);
    const store = new IndexedDbAccountStore({ indexedDB: factory });
    await store.save({ serverProfileId: 'lastro-2x', label: 'Fixture', username: 'fixture-user', password: 'fixture-only' });
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const source = readFileSync('.staging/runtime/Online.js', 'utf8');
    const html = vm.runInNewContext(source.match(/WinLogin_default\$2 = ("[^\n]+");/)![1]!);
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = decorateLastROLoginTemplate('WinLogin', html);
    document.body.append(host);
    const connect = vi.fn();
    root.querySelector('.connect')!.addEventListener('click', connect);
    try {
      installLastROLogin({ root, component: {}, configs: {
        get: (key: keyof typeof config) => config[key], getServer: () => config.servers[0],
      } });
      await vi.waitFor(() => expect(root.querySelector('[data-account-id]')).not.toBeNull());
      (root.querySelector('[data-account-id]') as HTMLButtonElement).click();
      expect((root.querySelector('.user') as HTMLInputElement).value).toBe('fixture-user');
      expect((root.querySelector('.pass') as HTMLInputElement).value).toBe('fixture-only');
      expect(connect).not.toHaveBeenCalled();
      expect(root.querySelector('.quick-login-panel')).toBeNull();
      host.remove();
      expect(document.querySelector('[data-lastro-login-panel]')).toBeNull();
    } finally {
      host.remove();
      Reflect.deleteProperty(globalThis, 'LastROLoginBeforeConnect');
      vi.unstubAllGlobals();
    }
  });
});
