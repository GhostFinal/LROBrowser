// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAccountStore } from '../src/accounts/account-store';
import { mountAccountManager } from '../src/accounts/account-ui';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

afterEach(() => document.body.replaceChildren());
function mount(store = new IndexedDbAccountStore({ indexedDB: new IDBFactory() })) {
  const root = document.createElement('div');
  document.body.append(root);
  const onLogin = vi.fn().mockResolvedValue(undefined);
  mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin });
  const input = (name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  const select = root.querySelector<HTMLSelectElement>('[name="serverProfileId"]')!;
  return { root, store, onLogin, input, button, select };
}

describe('server-bound account manager', () => {
  it('shows all servers, masks passwords, and allows the verified App server', async () => {
    const ui = mount();
    expect([...ui.select.options].map(o => o.textContent?.slice(0, 3))).toEqual(['3转服', '2转服', 'App']);
    expect(ui.select.querySelector<HTMLOptionElement>('[value="lastro-app"]')!.disabled).toBe(false);
    expect(ui.input('password').type).toBe('password');
    ui.select.value = 'lastro-app';
    ui.select.dispatchEvent(new Event('change'));
    ui.input('username').value = 'fixture-user';
    ui.input('password').value = 'fixture-password';
    ui.button('login').click();
    await vi.waitFor(() => expect(ui.onLogin).toHaveBeenCalledOnce());
    expect(ui.onLogin.mock.calls[0]![0]).toMatchObject({ profile: { id: 'lastro-app' } });
  });

  it('allows unsaved login without writing accounts or marking successful use early', async () => {
    const ui = mount();
    ui.input('username').value = 'fixture-user';
    ui.input('password').value = 'fixture-password';
    ui.button('login').click();
    await vi.waitFor(() => expect(ui.onLogin).toHaveBeenCalledOnce());
    expect(ui.onLogin.mock.calls[0]![0]).toMatchObject({ profile: { id: 'lastro-2x' }, username: 'fixture-user', password: 'fixture-password' });
    expect(await ui.store.list()).toEqual([]);
  });

  it('adds, selects, edits, filters, and deletes persisted accounts', async () => {
    const ui = mount();
    await vi.waitFor(() => expect(ui.button('save').disabled).toBe(false));
    ui.input('label').value = '自己的角色';
    ui.input('username').value = 'fixture-user';
    ui.input('password').value = 'fixture-password';
    ui.button('save').click();
    await vi.waitFor(() => expect(ui.root.querySelector('[data-account-id]')).not.toBeNull());
    const saved = (await ui.store.list())[0]!;
    ui.button('new').click();
    expect(ui.input('password').value).toBe('');
    ui.root.querySelector<HTMLButtonElement>('[data-account-id]')!.click();
    expect(ui.input('password').value).toBe('fixture-password');
    ui.input('label').value = '修改后的角色';
    ui.button('save').click();
    await vi.waitFor(async () => expect((await ui.store.get(saved.id))!.label).toBe('修改后的角色'));
    await vi.waitFor(() => expect(ui.select.disabled).toBe(false));
    ui.select.value = 'lastro-3x';
    ui.select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(ui.root.querySelector('[data-account-id]')).toBeNull());
    expect(ui.input('password').value).toBe('');
    ui.select.value = 'lastro-2x';
    ui.select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(ui.root.querySelector('[data-account-id]')).not.toBeNull());
    ui.root.querySelector<HTMLButtonElement>('[data-account-id]')!.click();
    ui.button('delete').click();
    await vi.waitFor(async () => expect(await ui.store.list()).toEqual([]));
  });

  it('keeps manual login available after storage failure, without exposing error details', async () => {
    const store = new IndexedDbAccountStore({ indexedDB: { open() { throw new Error('private diagnostic'); } } as unknown as IDBFactory });
    const ui = mount(store);
    await vi.waitFor(() => expect(ui.root.textContent).toContain('本地账号存储不可用'));
    expect(ui.button('save').disabled).toBe(true);
    expect(ui.root.textContent).not.toContain('private diagnostic');
    ui.input('username').value = 'fixture-user';
    ui.input('password').value = 'fixture-password';
    ui.button('login').click();
    await vi.waitFor(() => expect(ui.onLogin).toHaveBeenCalledOnce());
  });

  it('retains entered credentials for manual login when saving fails', async () => {
    const ui = mount();
    await vi.waitFor(() => expect(ui.button('save').disabled).toBe(false));
    vi.spyOn(ui.store, 'save').mockRejectedValue(new Error('private diagnostic'));
    ui.input('username').value = 'fixture-user';
    ui.input('password').value = 'fixture-password';
    ui.button('save').click();
    await vi.waitFor(() => expect(ui.root.textContent).toContain('本地账号存储不可用'));
    expect(ui.input('password').value).toBe('fixture-password');
    expect(ui.button('save').disabled).toBe(true);
    expect(ui.root.textContent).not.toContain('private diagnostic');
    ui.button('login').click();
    await vi.waitFor(() => expect(ui.onLogin).toHaveBeenCalledOnce());
  });
});
