import type { AccountStore, LocalAccount } from './account-store';
import type { AvailableServerProfile, LastROServerProfile } from '../servers/server-profile';
import { getAvailableServerProfile } from '../servers/server-profiles';

export interface LoginRequest {
  profile: AvailableServerProfile;
  username: string;
  password: string;
  savedAccountId?: string;
}
export type LoginHandler = (request: LoginRequest) => void | Promise<void>;

export function mountAccountManager({ root, profiles, store, onLogin }: {
  root: HTMLElement; profiles: readonly LastROServerProfile[]; store: AccountStore; onLogin: LoginHandler;
}): void {
  const serverRoot = root.querySelector('#server-region') ?? root;
  const accountRoot = root.querySelector('#account-region') ?? root;
  const serverLabel = document.createElement('label');
  serverLabel.textContent = '服务器';
  const select = document.createElement('select');
  select.name = 'serverProfileId';
  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.displayName;
    option.disabled = profile.availability === 'unavailable';
    select.append(option);
  }
  select.value = 'lastro-2x';
  serverLabel.append(select);
  const unavailable = document.createElement('p');
  unavailable.className = 'muted';
  unavailable.textContent = profiles.find(p => p.availability === 'unavailable')?.unavailableReason ?? '';
  serverRoot.append(serverLabel, unavailable);

  const list = document.createElement('div');
  list.className = 'account-list';
  list.setAttribute('aria-label', '已保存账号');
  const form = document.createElement('form');
  const inputs = {} as Record<'label' | 'username' | 'password', HTMLInputElement>;
  for (const [name, caption] of [['label', '备注'], ['username', '账号'], ['password', '密码']] as const) {
    const label = document.createElement('label');
    label.textContent = caption;
    const input = document.createElement('input');
    input.name = name;
    input.type = name === 'password' ? 'password' : 'text';
    input.required = name !== 'label';
    input.autocomplete = name === 'password' ? 'current-password' : name === 'username' ? 'username' : 'off';
    inputs[name] = input;
    label.append(input);
    form.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'account-actions';
  const buttons = {} as Record<'new' | 'save' | 'delete' | 'login', HTMLButtonElement>;
  for (const [action, text] of [['new', '新增'], ['save', '保存'], ['delete', '删除'], ['login', '登录']] as const) {
    const button = document.createElement('button');
    button.type = action === 'login' ? 'submit' : 'button';
    button.dataset.action = action;
    button.textContent = text;
    if (action === 'login') button.className = 'primary';
    buttons[action] = button;
    actions.append(button);
  }
  const message = document.createElement('p');
  message.className = 'account-message';
  message.setAttribute('role', 'status');
  form.append(actions, message);
  accountRoot.append(list, form);

  let accountId: string | undefined, storage = false, busy = false, revision = 0;
  function controls() {
    const available = profiles.some(p => p.id === select.value && p.availability === 'available');
    select.disabled = busy;
    buttons.new.disabled = busy;
    buttons.login.disabled = busy || !available;
    buttons.save.disabled = busy || !storage || !available;
    buttons.delete.disabled = busy || !storage || !accountId;
  }
  function clear() {
    accountId = undefined;
    form.reset();
    list.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
    controls();
  }
  function storageFailed() {
    storage = false;
    message.textContent = '本地账号存储不可用，仍可手动登录';
    controls();
  }
  function render(accounts: LocalAccount[]) {
    list.replaceChildren();
    for (const account of accounts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.accountId = account.id;
      button.textContent = account.label || account.username;
      button.setAttribute('aria-pressed', String(account.id === accountId));
      button.addEventListener('click', () => {
        if (busy) return;
        accountId = account.id;
        inputs.label.value = account.label;
        inputs.username.value = account.username;
        inputs.password.value = account.password;
        list.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        controls();
      });
      list.append(button);
    }
  }
  async function refresh() {
    const requested = ++revision;
    try {
      const profile = getAvailableServerProfile(select.value);
      const accounts = await store.list(profile.id);
      if (requested !== revision) return;
      storage = true;
      render(accounts);
      controls();
    } catch {
      if (requested === revision) storageFailed();
    }
  }
  select.addEventListener('change', () => {
    ++revision;
    list.replaceChildren();
    clear();
    if (select.value === 'lastro-app') { message.textContent = unavailable.textContent; return; }
    message.textContent = '';
    void refresh();
  });
  buttons.new.addEventListener('click', clear);
  buttons.save.addEventListener('click', async () => {
    if (busy || !storage || !form.reportValidity()) return;
    busy = true;
    controls();
    try {
      const profile = getAvailableServerProfile(select.value);
      const saved = await store.save({ id: accountId, serverProfileId: profile.id,
        label: inputs.label.value, username: inputs.username.value, password: inputs.password.value });
      accountId = saved.id;
      message.textContent = '已保存';
      await refresh();
    } catch { storageFailed(); }
    finally { busy = false; controls(); }
  });
  buttons.delete.addEventListener('click', async () => {
    if (busy || !storage || !accountId) return;
    busy = true;
    controls();
    try {
      await store.remove(accountId);
      clear();
      message.textContent = '已删除';
      await refresh();
    } catch { storageFailed(); }
    finally { busy = false; controls(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    controls();
    try {
      await onLogin({ profile: getAvailableServerProfile(select.value), username: inputs.username.value,
        password: inputs.password.value, ...(accountId ? { savedAccountId: accountId } : {}) });
    } catch { message.textContent = '登录未完成，请检查连接状态'; }
    finally { busy = false; controls(); }
  });
  controls();
  void refresh();
}
