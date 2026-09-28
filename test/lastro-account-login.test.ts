// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAccountStore } from '../src/accounts/account-store';
import { buildClientConfig } from '../src/runtime/client-config';
import { buildLastROLoginRequest } from '../src/network/lastro-login-http';
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
    const source = readFileSync('generated/runtime/Online.js', 'utf8');
    const css = vm.runInNewContext(source.match(/WinLogin_default\$1 =\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'));/s)![1]!);
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



  it('builds the LastRO login registration request with the nid-specific form fields', () => {
    const request = buildLastROLoginRequest('checkin', 5, 'testbot1', '123123');
    expect(request.path).toBe('/?r=mg/checkin&nid=5');
    expect(request.body).toBe('Login_debug%5Buserid%5D=testbot1&Login_debug%5Buser_pass%5D=123123');
  });

  it('sends login checks without observing the response and keeps check disabled by default', async () => {
    const calls: Array<{ phase: string; username: string; password: string }> = [];
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    expect(config.lastroLoginCheck).toBe(false);
    expect(config.lastroLoginCheckin).toBe(true);
    const html = '<div id="WinLogin"><input class="user"><input class="pass"><button class="connect"></button></div>';
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = decorateLastROLoginTemplate('WinLogin', html);
    document.body.append(host);
    vi.stubGlobal('LastRODirectSocketsSupported', true);
    vi.stubGlobal('LastROLoginRegistration', (phase: string, _nid: number, username: string, password: string) => {
      calls.push({ phase, username, password });
    });
    try {
      installLastROLogin({ root, component: {}, configs: {
        get: (key: keyof typeof config) => config[key], getServer: () => config.servers[0],
      } });
      const before = Reflect.get(globalThis, 'LastROLoginBeforeConnect') as (username: string, password: string) => boolean;
      const after = Reflect.get(globalThis, 'LastROLoginAfterPassword') as (username: string, password: string) => void;
      expect(before('testbot1', '123123')).toBe(true);
      expect(calls).toEqual([]);
      after('testbot1', '123123');
      expect(calls).toEqual([{ phase: 'checkin', username: 'testbot1', password: '123123' }]);
    } finally {
      host.remove();
      Reflect.deleteProperty(globalThis, 'LastROLoginBeforeConnect');
      Reflect.deleteProperty(globalThis, 'LastROLoginAfterPassword');
      vi.unstubAllGlobals();
    }
  });

  it('sends the optional check before checkin when explicitly enabled', () => {
    const calls: string[] = [];
    vi.stubGlobal('LastRODirectSocketsSupported', true);
    vi.stubGlobal('LastROLoginRegistration', (phase: string) => { calls.push(phase); });
    const base = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const config = { ...base, lastroLoginCheck: true };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = decorateLastROLoginTemplate('WinLogin', '<div id="WinLogin"><input class="user"><input class="pass"></div>');
    document.body.append(host);
    try {
      installLastROLogin({ root, component: {}, configs: {
        get: (key: keyof typeof config) => config[key], getServer: () => config.servers[0],
      } });
      const before = Reflect.get(globalThis, 'LastROLoginBeforeConnect') as (username: string, password: string) => boolean;
      const after = Reflect.get(globalThis, 'LastROLoginAfterPassword') as (username: string, password: string) => void;
      expect(before('testbot1', '123123')).toBe(true);
      after('testbot1', '123123');
      expect(calls).toEqual(['check', 'checkin']);
    } finally {
      host.remove();
      Reflect.deleteProperty(globalThis, 'LastROLoginBeforeConnect');
      Reflect.deleteProperty(globalThis, 'LastROLoginAfterPassword');
      vi.unstubAllGlobals();
    }
  });

  it('fills the original login fields from this IWA IndexedDB without submitting a login', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('LastRODirectSocketsSupported', true);
    const store = new IndexedDbAccountStore({ indexedDB: factory });
    await store.save({ serverProfileId: 'lastro-2x', label: 'Fixture', username: 'fixture-user', password: 'fixture-only' });
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const source = readFileSync('generated/runtime/Online.js', 'utf8');
    const html = vm.runInNewContext(source.match(/WinLogin_default\$2 =\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'));/s)![1]!);
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
      Reflect.deleteProperty(globalThis, 'LastROLoginAfterPassword');
      vi.unstubAllGlobals();
    }
  });
});
