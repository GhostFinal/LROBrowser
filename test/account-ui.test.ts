// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAccountManager, type LoginRequest } from '../src/accounts/account-ui';
import type { AccountStore, AccountSummary, LocalAccount } from '../src/accounts/account-store';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

const summary: AccountSummary = { id: 'fixture', serverProfileId: 'lastro-2x', label: 'Fixture account', username: 'fixture-user',
  createdAt: 1, updatedAt: 2, lastUsedAt: null };
const account: LocalAccount = { ...summary, password: 'fixture-secret' };

function setup(onLogin = vi.fn<(request: LoginRequest) => void | Promise<void>>()) {
  const root = document.createElement('section');
  document.body.append(root);
  const store: AccountStore = { list: vi.fn(async () => [summary]), get: vi.fn(async () => account),
    save: vi.fn(async () => summary), remove: vi.fn(async () => undefined), markUsed: vi.fn(async () => undefined) };
  mountAccountManager({ root, profiles: LASTRO_SERVER_PROFILES, store, onLogin });
  return { root, store, onLogin, password: root.querySelector<HTMLInputElement>('[name="password"]')!,
    username: root.querySelector<HTMLInputElement>('[name="username"]')!, form: root.querySelector('form')! };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('account manager credential lifetime', () => {
  it('renders saved-account summaries without decrypting all passwords', async () => {
    const fixture = setup();
    await vi.waitFor(() => expect(fixture.root.querySelector('[data-account-id]')).not.toBeNull());
    expect(fixture.store.get).not.toHaveBeenCalled();
    expect(fixture.password.value).toBe('');
    fixture.root.querySelector<HTMLButtonElement>('[data-account-id]')!.click();
    await vi.waitFor(() => expect(fixture.password.value).toBe('fixture-secret'));
    expect(fixture.store.get).toHaveBeenCalledWith('fixture');
  });

  it('does not refill a new editor with an old asynchronous password', async () => {
    const fixture = setup();
    let complete: (account: LocalAccount) => void = () => undefined;
    const delayed = new Promise<LocalAccount>(resolve => { complete = resolve; });
    vi.mocked(fixture.store.get).mockReturnValue(delayed);
    await vi.waitFor(() => expect(fixture.root.querySelector('[data-account-id]')).not.toBeNull());
    fixture.root.querySelector<HTMLButtonElement>('[data-account-id]')!.click();
    fixture.root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
    complete(account);
    await delayed;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fixture.password.value).toBe('');
    expect(fixture.username.value).toBe('');
  });

  it('clears the password input immediately and the request object when login settles', async () => {
    let complete: () => void = () => undefined;
    const delayed = new Promise<void>(resolve => { complete = resolve; });
    const onLogin = vi.fn<(request: LoginRequest) => void | Promise<void>>(() => delayed);
    const fixture = setup(onLogin);
    fixture.username.value = 'fixture-user';
    fixture.password.value = 'fixture-secret';
    fixture.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onLogin).toHaveBeenCalledOnce();
    const request = onLogin.mock.calls[0]![0];
    expect(request.password).toBe('fixture-secret');
    expect(fixture.password.value).toBe('');
    complete();
    await vi.waitFor(() => expect(request.password).toBe(''));
  });

  it('clears password fields when switching server profiles', async () => {
    const fixture = setup();
    fixture.username.value = 'fixture-user';
    fixture.password.value = 'fixture-secret';
    const server = fixture.root.querySelector<HTMLSelectElement>('select')!;
    server.value = 'lastro-3x';
    server.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.password.value).toBe('');
    expect(fixture.username.value).toBe('');
  });
});
