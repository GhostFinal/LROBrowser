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
import { decorateLastROLoginStyles, decorateLastROLoginTemplate, installLastROLogin, beforeLastROLoginConnect, afterLastROLoginPassword } from '../src/runtime/lastro-account-login.mjs';

describe('LastRO native login integration', () => {
  async function savedLogin() {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('LastRODirectSocketsSupported', true);
    const store = new IndexedDbAccountStore({ indexedDB: factory });
    const saved = await store.save({ serverProfileId: 'lastro-2x', label: 'Fixture', username: 'fixture-user', password: 'fixture-only' });
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = decorateLastROLoginTemplate('WinLogin', '<div id="WinLogin"><input class="user"><input class="pass"><button class="connect"></button></div>');
    document.body.append(host);
    const component: { onRemove?: () => void; onAppend?: () => void } = {};
    installLastROLogin({ root, component, configs: { get: (key: keyof typeof config) => config[key], getServer: () => config.servers[0] } });
    await vi.waitFor(() => expect(root.querySelector('[data-account-id]')).not.toBeNull());
    return { host, root, component, store, saved };
  }
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
      const before = beforeLastROLoginConnect;
      const after = afterLastROLoginPassword;
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
      const before = beforeLastROLoginConnect;
      const after = afterLastROLoginPassword;
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
      await vi.waitFor(() => expect((root.querySelector('.pass') as HTMLInputElement).value).toBe('fixture-only'));
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

  it('keeps credential hooks module-private and clears both password fields when login consumes them', async () => {
    const { host, root } = await savedLogin();
    try {
      const native = root.querySelector<HTMLInputElement>('.pass')!;
      const editor = root.querySelector<HTMLInputElement>('[data-lastro-account-password]')!;
      native.value = editor.value = 'fixture-only';
      expect(Reflect.get(globalThis, 'LastROLoginBeforeConnect')).toBeUndefined();
      expect(Reflect.get(globalThis, 'LastROLoginAfterPassword')).toBeUndefined();
      expect(beforeLastROLoginConnect('fixture-user', 'fixture-only')).toBe(true);
      expect(native.value).toBe('');
      expect(editor.value).toBe('');
      expect(beforeLastROLoginConnect('fixture-user', 'fixture\u0000bad')).toBe(false);
    } finally { host.remove(); vi.unstubAllGlobals(); }
  });

  it('clears a hidden login window and reloads summaries when it is shown again', async () => {
    const { host, root, component } = await savedLogin();
    try {
      root.querySelector<HTMLElement>('[data-account-id]')!.click();
      await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('.pass')!.value).toBe('fixture-only'));
      component.onRemove?.();
      expect(root.querySelector<HTMLInputElement>('.pass')!.value).toBe('');
      expect(root.querySelector('[data-account-id]')).toBeNull();
      expect(beforeLastROLoginConnect('fixture-user', 'fixture-only')).toBe(false);
      component.onAppend?.();
      await vi.waitFor(() => expect(root.querySelector('[data-account-id]')).not.toBeNull());
      expect(root.querySelector<HTMLInputElement>('.pass')!.value).toBe('');
    } finally { host.remove(); vi.unstubAllGlobals(); }
  });

  it('removes the editor password when cancelled without removing the saved account', async () => {
    const { host, root, store, saved } = await savedLogin();
    try {
      root.querySelector<HTMLElement>('[data-lastro-action="edit"]')!.click();
      const editor = root.querySelector<HTMLInputElement>('[data-lastro-account-password]')!;
      await vi.waitFor(() => expect(editor.value).toBe('fixture-only'));
      root.querySelector<HTMLElement>('[data-lastro-action="cancel"]')!.click();
      expect(editor.value).toBe('');
      expect(await store.get(saved.id)).toMatchObject({ password: 'fixture-only' });
    } finally { host.remove(); vi.unstubAllGlobals(); }
  });

  it('does not refill a password after a delayed decrypt finishes following a user edit', async () => {
    const { host, root } = await savedLogin();
    let complete: (buffer: ArrayBuffer) => void = () => undefined;
    const delayed = new Promise<ArrayBuffer>(resolve => { complete = resolve; });
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt').mockReturnValue(delayed);
    try {
      root.querySelector<HTMLElement>('[data-account-id]')!.click();
      await vi.waitFor(() => expect(decrypt).toHaveBeenCalled());
      const native = root.querySelector<HTMLInputElement>('.pass')!;
      native.value = 'new-user-input';
      native.dispatchEvent(new Event('input', { bubbles: true }));
      complete(new TextEncoder().encode('fixture-only').buffer);
      await delayed;
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(native.value).toBe('new-user-input');
    } finally { decrypt.mockRestore(); host.remove(); vi.unstubAllGlobals(); }
  });
});
