// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAccountManager } from '../src/accounts/account-ui';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';
import type { AccountStore, LocalAccount } from '../src/accounts/account-store';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
function storeFixture(overrides: Partial<AccountStore> = {}): AccountStore {
  return {
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    markUsed: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as AccountStore;
}
function accountFixture(overrides: Partial<LocalAccount> = {}): LocalAccount {
  return { id: 'a1', serverProfileId: 'lastro-2x', label: '剑士小号', username: 'testuser', password: 'secret',
    createdAt: 1, updatedAt: 1, lastUsedAt: null, ...overrides };
}
function account(region: HTMLElement, id: string): HTMLElement {
  return region.querySelector(`[data-account-id="${id}"]`) as HTMLElement;
}

describe('account-ui', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.append(root);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders the three-server selector with 2转服 selected', () => {
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store: storeFixture(), onLogin: vi.fn() });
    const select = root.querySelector<HTMLSelectElement>('[name="serverProfileId"]');
    expect(select?.value).toBe('lastro-2x');
    expect(select?.options.length).toBe(3);
    expect(select?.options[2]?.disabled).toBe(true);
  });

  it('shows the empty state with an add button when no accounts are saved', async () => {
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store: storeFixture(), onLogin: vi.fn() });
    await flush();
    expect(root.querySelector('.am-empty')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector<HTMLElement>('.am-empty [data-action="add"]')?.textContent).toContain('添加快捷登录');
  });

  it('adds a new account through the edit view', async () => {
    const store = storeFixture();
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin: vi.fn() });
    await flush();
    root.querySelector<HTMLElement>('[data-action="add"]')!.click();
    root.querySelector<HTMLInputElement>('[name="label"]')!.value = '剑士小号';
    root.querySelector<HTMLInputElement>('[name="username"]')!.value = 'newuser';
    root.querySelector<HTMLInputElement>('[name="password"]')!.value = 'newpass';
    root.querySelector<HTMLFormElement>('.am-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined,
      serverProfileId: 'lastro-2x', username: 'newuser', password: 'newpass' }));
  });

  it('selects an account on click and logs in with the login button', async () => {
    const onLogin = vi.fn();
    const store = storeFixture({ list: vi.fn().mockResolvedValue([accountFixture()]) });
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin });
    await flush();
    account(root, 'a1').click();
    await flush();
    root.querySelector<HTMLElement>('.am-list-view [data-action="login"]')!.click();
    await flush();
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
      username: 'testuser', savedAccountId: 'a1' }));
  });

  it('logs in directly on double-click', async () => {
    const onLogin = vi.fn();
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES,
      store: storeFixture({ list: vi.fn().mockResolvedValue([accountFixture()]) }), onLogin });
    await flush();
    account(root, 'a1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('logs in without saving through the edit view', async () => {
    const onLogin = vi.fn();
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store: storeFixture(), onLogin });
    await flush();
    root.querySelector<HTMLElement>('[data-action="add"]')!.click();
    root.querySelector<HTMLInputElement>('[name="username"]')!.value = 'manual';
    root.querySelector<HTMLInputElement>('[name="password"]')!.value = 'p';
    root.querySelector<HTMLElement>('[data-action="login-unsaved"]')!.click();
    await flush();
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'manual' }));
    expect(onLogin.mock.calls[0]?.[0]?.savedAccountId).toBeUndefined();
  });

  it('still allows unsaved login when local storage is unavailable', async () => {
    const onLogin = vi.fn();
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES,
      store: storeFixture({ list: vi.fn().mockRejectedValue(new Error('db down')) }), onLogin });
    await flush();
    expect(root.querySelector('.am-message')?.textContent).toContain('本地账号存储不可用');
    root.querySelector<HTMLElement>('[data-action="add"]')!.click();
    expect(root.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(true);
    root.querySelector<HTMLInputElement>('[name="username"]')!.value = 'manual';
    root.querySelector<HTMLInputElement>('[name="password"]')!.value = 'p';
    root.querySelector<HTMLElement>('[data-action="login-unsaved"]')!.click();
    await flush();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('deletes an account after confirmation', async () => {
    const existing = accountFixture();
    const store = storeFixture({ list: vi.fn().mockResolvedValue([existing]) });
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin: vi.fn() });
    await flush();
    account(root, 'a1').querySelector<HTMLElement>('[data-action="delete"]')!.click();
    await flush();
    expect(window.confirm).toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('a1');
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const store = storeFixture({ list: vi.fn().mockResolvedValue([accountFixture()]) });
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin: vi.fn() });
    await flush();
    account(root, 'a1').querySelector<HTMLElement>('[data-action="delete"]')!.click();
    await flush();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('disables actions for the unavailable App server', async () => {
    mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store: storeFixture(), onLogin: vi.fn() });
    await flush();
    const select = root.querySelector<HTMLSelectElement>('[name="serverProfileId"]')!;
    select.value = 'lastro-app';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.am-message')?.textContent).toContain('App服协议参数尚未完成验证');
    expect(root.querySelector<HTMLButtonElement>('[data-action="add"]')?.disabled).toBe(true);
  });
});
