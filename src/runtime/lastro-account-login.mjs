const DATABASE_NAME = 'lastro-iwa';
const DATABASE_VERSION = 1;
const ACCOUNT_STORE = 'accounts';
const UNAVAILABLE_REASON = 'App服协议参数尚未完成验证';

function openDatabase() {
  if (!globalThis.indexedDB) throw new Error('本地账号存储不可用');
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACCOUNT_STORE)) {
        const store = database.createObjectStore(ACCOUNT_STORE, { keyPath: 'id' });
        store.createIndex('serverProfileId', 'serverProfileId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地账号存储不可用'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地账号存储失败'));
  });
}

async function listAccounts(serverProfileId) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNT_STORE, 'readonly');
    const accounts = await requestResult(transaction.objectStore(ACCOUNT_STORE).getAll());
    return accounts
      .filter(account => !serverProfileId || account.serverProfileId === serverProfileId)
      .sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0)
        || (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  } finally {
    database.close();
  }
}

async function saveAccount(account) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNT_STORE, 'readwrite');
    transaction.objectStore(ACCOUNT_STORE).put(account);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error ?? new Error('本地账号写入失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('本地账号写入失败'));
    });
    return account;
  } finally {
    database.close();
  }
}

async function removeAccount(id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNT_STORE, 'readwrite');
    transaction.objectStore(ACCOUNT_STORE).delete(id);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error ?? new Error('本地账号删除失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('本地账号删除失败'));
    });
  } finally {
    database.close();
  }
}

async function markAccountUsed(id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNT_STORE, 'readwrite');
    const store = transaction.objectStore(ACCOUNT_STORE);
    const current = await requestResult(store.get(id));
    if (current) {
      current.lastUsedAt = Date.now();
      store.put(current);
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error ?? new Error('本地账号更新失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('本地账号更新失败'));
    });
  } finally {
    database.close();
  }
}

function removePrivateLoginPanel(htmlText) {
  const start = htmlText.indexOf('<div class="quick-login-panel">');
  if (start === -1) return htmlText;
  const rootEnd = htmlText.lastIndexOf('</div>');
  const panelEnd = htmlText.lastIndexOf('</div>', rootEnd - 1);
  if (panelEnd < start) return htmlText;
  return `${htmlText.slice(0, start)}${htmlText.slice(panelEnd + '</div>'.length)}`;
}

export function decorateLastROLoginTemplate(name, htmlText) {
  if (!name.startsWith('WinLogin') || htmlText.includes('data-lastro-login-panel')) return htmlText;
  const cleaned = removePrivateLoginPanel(htmlText);
  const closingIndex = cleaned.lastIndexOf('</div>');
  if (closingIndex === -1) return cleaned;
  const panel = '<section class="lastro-login-panel" data-lastro-login-panel>'
    + '<p class="lastro-login-environment" data-lastro-login-environment role="status"></p>'
    + '<section class="lastro-login-servers"><h3>服务器</h3><div class="lastro-server-list" data-lastro-server-list></div></section>'
    + '<section class="lastro-account-view" data-lastro-view="list">'
    + '<h3>快捷登录</h3>'
    + '<div class="lastro-account-list" data-lastro-account-list></div>'
    + '<button type="button" class="lastro-account-empty" data-lastro-action="add" data-lastro-empty hidden>'
    + '<span class="lastro-empty-icon">+</span>'
    + '<span class="lastro-empty-title">添加快捷登录</span>'
    + '<span class="lastro-empty-hint">保存账号后，双击卡片即可登录</span>'
    + '</button>'
    + '<div class="lastro-account-toolbar">'
    + '<button type="button" data-lastro-action="add">+ 添加账号</button>'
    + '<button type="button" class="lastro-primary" data-lastro-action="login" disabled>登录</button>'
    + '</div></section>'
    + '<form class="lastro-account-view" data-lastro-view="edit" data-lastro-account-form hidden>'
    + '<h3 data-lastro-form-title>添加账号</h3>'
    + '<p class="lastro-edit-server">服务器：<b data-lastro-edit-server></b></p>'
    + '<label>备注<input data-lastro-account-label type="text" autocomplete="off" placeholder="选填，例如：主号"></label>'
    + '<label>账号<input data-lastro-account-username type="text" autocomplete="username"></label>'
    + '<label>密码<input data-lastro-account-password type="password" autocomplete="current-password"></label>'
    + '<div class="lastro-account-toolbar lastro-edit-actions">'
    + '<button type="button" class="lastro-danger" data-lastro-action="delete">删除</button>'
    + '<button type="button" data-lastro-action="cancel">取消</button>'
    + '<button type="button" data-lastro-action="login-only">仅登录不保存</button>'
    + '<button type="button" class="lastro-primary" data-lastro-action="save">保存</button>'
    + '</div></form>'
    + '<p class="lastro-login-message" data-lastro-login-message role="status"></p></section>';
  return `${cleaned.slice(0, closingIndex)}${panel}${cleaned.slice(closingIndex)}`;
}

export function decorateLastROLoginStyles(name, cssText) {
  if (!name.startsWith('WinLogin') || cssText.includes('.lastro-login-panel')) return cssText;
  // The legacy skin positions every #WinLogin input, including panel descendants.
  cssText += '\n#WinLogin .lastro-login-panel input { position: static; left: auto; top: auto; width: 100%; height: auto; min-height: 30px; box-sizing: border-box; margin-top: 4px; padding: 5px 9px; border: 1px solid #d7e0ea; border-radius: 6px; background: #fff; color: #243447; font: 12px/1.4 "Segoe UI", "Microsoft YaHei", sans-serif; }';
  return `${cssText}
.lastro-login-panel { position: absolute; top: 0; left: calc(100% + 12px); z-index: 20; width: 308px; max-height: 400px; overflow-y: auto; box-sizing: border-box; padding: 14px; background: #fff; border: 1px solid #e3e9f2; border-radius: 10px; box-shadow: 0 10px 28px rgba(30, 55, 90, .18); color: #243447; font: 12px/1.5 "Segoe UI", "Microsoft YaHei", sans-serif; }
.lastro-login-panel h3 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #55677c; }
.lastro-login-environment, .lastro-login-message { min-height: 16px; margin: 0 0 8px; font-size: 11px; color: #7a8ba0; white-space: pre-wrap; }
.lastro-login-message { margin: 8px 0 0; }
.lastro-login-servers { margin-bottom: 12px; }
.lastro-server-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.lastro-login-panel button { box-sizing: border-box; min-height: 28px; padding: 4px 10px; overflow: hidden; border: 1px solid #d7e0ea; border-radius: 6px; background: #fff; color: #243447; font: 12px/1.4 "Segoe UI", "Microsoft YaHei", sans-serif; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.lastro-login-panel button:hover { border-color: #4a90d9; color: #4a90d9; }
.lastro-login-panel button:disabled { opacity: .45; cursor: default; }
.lastro-login-panel button:disabled:hover { border-color: #d7e0ea; color: #243447; }
.lastro-server-list button[data-selected="true"] { border-color: #4a90d9; background: #eaf3fc; color: #2f6fb2; font-weight: 600; }
.lastro-account-list { display: flex; flex-direction: column; gap: 6px; }
.lastro-account-card { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e3e9f2; border-radius: 8px; background: #fff; cursor: pointer; transition: border-color .12s, background .12s; }
.lastro-account-card:hover { border-color: #b9d2ec; background: #f7fbff; }
.lastro-account-card[data-selected="true"] { border-color: #4a90d9; background: #eaf3fc; }
.lastro-account-avatar { flex: none; width: 28px; height: 28px; border-radius: 50%; background: #e3eefb; color: #4a90d9; font-size: 13px; font-weight: 600; text-align: center; line-height: 28px; }
.lastro-account-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lastro-account-title { overflow: hidden; font-size: 12px; font-weight: 600; color: #243447; text-overflow: ellipsis; white-space: nowrap; }
.lastro-account-sub { overflow: hidden; font-size: 11px; color: #7a8ba0; text-overflow: ellipsis; white-space: nowrap; }
.lastro-account-card-actions { flex: none; display: flex; gap: 4px; opacity: 0; transition: opacity .12s; }
.lastro-account-card:hover .lastro-account-card-actions, .lastro-account-card[data-selected="true"] .lastro-account-card-actions { opacity: 1; }
.lastro-account-card-actions button { min-height: 22px; padding: 1px 7px; font-size: 11px; }
.lastro-account-empty { width: 100%; padding: 14px 8px; border: 1.5px dashed #c3d3e4; border-radius: 8px; background: #f8fbfe; text-align: center; }
.lastro-account-empty:not([hidden]) { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.lastro-account-empty:hover { border-color: #4a90d9; background: #f0f7ff; }
.lastro-empty-icon { font-size: 18px; line-height: 1; color: #4a90d9; }
.lastro-empty-title { font-size: 12px; font-weight: 600; color: #4a90d9; }
.lastro-empty-hint { font-size: 11px; color: #7a8ba0; }
.lastro-account-toolbar { display: flex; gap: 8px; margin-top: 10px; }
.lastro-account-toolbar button { flex: 1; }
.lastro-login-panel button.lastro-primary { border-color: #4a90d9; background: #4a90d9; color: #fff; font-weight: 600; }
.lastro-login-panel button.lastro-primary:hover { background: #3b7fc4; }
.lastro-login-panel button.lastro-primary:disabled:hover { background: #4a90d9; color: #fff; }
.lastro-login-panel button.lastro-danger { border-color: #eccccc; background: #fdf6f6; color: #c04545; }
.lastro-login-panel button.lastro-danger:hover { border-color: #c04545; color: #c04545; }
.lastro-edit-server { margin: 0 0 4px; font-size: 11px; color: #7a8ba0; }
.lastro-edit-server b { color: #243447; }
.lastro-login-panel label { display: block; margin: 8px 0 0; font-size: 12px; color: #55677c; }
.lastro-login-panel input:focus { border-color: #4a90d9; outline: 2px solid rgba(74, 144, 217, .2); }
.lastro-edit-actions { flex-wrap: wrap; }`;
}

function sendLoginRegistration(configs, phase, username, password) {
  const setting = phase === 'check' ? 'lastroLoginCheck' : 'lastroLoginCheckin';
  const enabled = configs?.get?.(setting, phase === 'checkin');
  if (enabled !== true) return;
  const sender = globalThis.LastROLoginRegistration;
  if (typeof sender !== 'function') return;
  const nid = Number(configs?.get?.('lastroNid', 0));
  try { sender(phase, nid, username, password); } catch { /* best effort */ }
}

function profilesFromConfig(configs) {
  const profiles = configs?.get?.('loginServerProfiles', []);
  return Array.isArray(profiles) ? profiles : [];
}

function formatLastUsed(timestamp) {
  if (!timestamp) return '从未用过';
  const delta = Date.now() - timestamp;
  if (delta < 60000) return '刚刚';
  if (delta < 3600000) return `${Math.floor(delta / 60000)} 分钟前`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
  if (delta < 604800000) return `${Math.floor(delta / 86400000)} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

export function installLastROLogin({ root, component, configs }) {
  const panel = root?.querySelector?.('[data-lastro-login-panel]');
  if (!panel) return;
  const environment = panel.querySelector('[data-lastro-login-environment]');
  const message = panel.querySelector('[data-lastro-login-message]');
  const serverList = panel.querySelector('[data-lastro-server-list]');
  const listView = panel.querySelector('[data-lastro-view="list"]');
  const accountList = panel.querySelector('[data-lastro-account-list]');
  const emptyState = panel.querySelector('[data-lastro-empty]');
  const loginButton = panel.querySelector('[data-lastro-action="login"]');
  const form = panel.querySelector('[data-lastro-account-form]');
  const formTitle = panel.querySelector('[data-lastro-form-title]');
  const editServer = panel.querySelector('[data-lastro-edit-server]');
  const labelInput = panel.querySelector('[data-lastro-account-label]');
  const usernameInput = panel.querySelector('[data-lastro-account-username]');
  const passwordInput = panel.querySelector('[data-lastro-account-password]');
  const deleteButton = form?.querySelector('[data-lastro-action="delete"]');
  const nativeUsername = root.querySelector('.user');
  const nativePassword = root.querySelector('.pass');
  const nativeConnect = root.querySelector('.connect');
  if (!environment || !message || !serverList || !listView || !accountList || !emptyState || !loginButton
    || !form || !formTitle || !editServer || !labelInput || !usernameInput || !passwordInput || !deleteButton) return;

  const profiles = profilesFromConfig(configs);
  const currentId = configs?.getServer?.()?.id ?? profiles.find(profile => profile.availability === 'available')?.id;
  let accountsCache = [];
  let selectedAccount;
  let selectedProfileId = currentId;

  function setMessage(value) {
    message.textContent = value;
  }

  function currentProfile() {
    return profiles.find(profile => profile.id === selectedProfileId);
  }

  function profileLabel(id) {
    return profiles.find(profile => profile.id === id)?.label || id || '';
  }

  function fillNativeCredentials(username, password) {
    if (nativeUsername) nativeUsername.value = username || '';
    if (nativePassword) nativePassword.value = password || '';
  }

  function syncLoginButton() {
    loginButton.disabled = !selectedAccount;
  }

  function showListView() {
    form.hidden = true;
    listView.hidden = false;
  }

  function showEditView(account) {
    selectedAccount = account;
    formTitle.textContent = account ? '编辑账号' : '添加账号';
    editServer.textContent = profileLabel(selectedProfileId);
    deleteButton.hidden = !account;
    labelInput.value = account?.label || '';
    usernameInput.value = account?.username || '';
    passwordInput.value = account?.password || '';
    listView.hidden = true;
    form.hidden = false;
    usernameInput.focus();
  }

  function selectAccount(account) {
    selectedAccount = account;
    accountList.querySelectorAll('[data-account-id]').forEach(card => {
      card.dataset.selected = String(card.dataset.accountId === account.id);
    });
    fillNativeCredentials(account.username, account.password);
    setMessage('已载入账号，双击卡片或点击「登录」进入游戏');
    syncLoginButton();
  }

  function loginWithAccount(account) {
    selectedAccount = account;
    fillNativeCredentials(account.username, account.password);
    nativeConnect?.click();
  }

  function renderAccounts(accounts) {
    accountsCache = accounts;
    accountList.replaceChildren();
    emptyState.hidden = accounts.length > 0;
    for (const account of accounts) {
      const card = globalThis.document.createElement('div');
      card.className = 'lastro-account-card';
      card.dataset.accountId = account.id;
      card.dataset.selected = String(account.id === selectedAccount?.id);
      card.tabIndex = 0;
      card.title = '单击载入，双击直接登录';
      const avatar = globalThis.document.createElement('span');
      avatar.className = 'lastro-account-avatar';
      avatar.textContent = (account.label || account.username || '?').trim().charAt(0).toUpperCase() || '?';
      const meta = globalThis.document.createElement('span');
      meta.className = 'lastro-account-meta';
      const title = globalThis.document.createElement('span');
      title.className = 'lastro-account-title';
      title.textContent = account.label || account.username;
      const sub = globalThis.document.createElement('span');
      sub.className = 'lastro-account-sub';
      sub.textContent = `${profileLabel(account.serverProfileId)} · ${formatLastUsed(account.lastUsedAt)}`;
      meta.append(title, sub);
      const actions = globalThis.document.createElement('span');
      actions.className = 'lastro-account-card-actions';
      const edit = globalThis.document.createElement('button');
      edit.type = 'button';
      edit.dataset.lastroAction = 'edit';
      edit.textContent = '编辑';
      const remove = globalThis.document.createElement('button');
      remove.type = 'button';
      remove.dataset.lastroAction = 'remove';
      remove.textContent = '删除';
      actions.append(edit, remove);
      card.append(avatar, meta, actions);
      accountList.append(card);
    }
    syncLoginButton();
  }

  async function refreshAccounts() {
    try {
      renderAccounts(await listAccounts(selectedProfileId));
    } catch {
      setMessage('本地账号存储不可用，仍可直接填写登录');
    }
  }

  async function deleteAccount(account) {
    if (!account?.id) return;
    if (typeof globalThis.confirm === 'function'
      && !globalThis.confirm(`确定删除账号「${account.label || account.username}」？`)) return;
    try {
      await removeAccount(account.id);
      if (selectedAccount?.id === account.id) selectedAccount = undefined;
      setMessage('已删除');
      showListView();
      await refreshAccounts();
    } catch {
      setMessage('本地账号删除失败');
    }
  }

  async function saveFromForm() {
    const profile = currentProfile();
    if (!profile || profile.availability === 'unavailable') {
      setMessage(profile?.unavailableReason || UNAVAILABLE_REASON);
      return;
    }
    if (!usernameInput.value || !passwordInput.value) {
      setMessage('账号和密码不能为空');
      return;
    }
    const now = Date.now();
    try {
      selectedAccount = await saveAccount({
        id: selectedAccount?.id || globalThis.crypto.randomUUID(),
        serverProfileId: profile.id,
        label: labelInput.value,
        username: usernameInput.value,
        password: passwordInput.value,
        createdAt: selectedAccount?.createdAt || now,
        updatedAt: now,
        lastUsedAt: selectedAccount?.lastUsedAt,
      });
      setMessage('已保存');
      showListView();
      await refreshAccounts();
    } catch {
      setMessage('本地账号存储不可用，账号仍可直接登录');
    }
  }

  function loginFromFormOnly() {
    if (!usernameInput.value || !passwordInput.value) {
      setMessage('账号和密码不能为空');
      return;
    }
    fillNativeCredentials(usernameInput.value, passwordInput.value);
    nativeConnect?.click();
  }

  function accountFromCard(card) {
    return accountsCache.find(account => account.id === card?.dataset?.accountId);
  }

  for (const profile of profiles) {
    const button = globalThis.document.createElement('button');
    button.type = 'button';
    button.dataset.serverProfile = profile.id;
    button.dataset.selected = String(profile.id === selectedProfileId);
    button.textContent = profile.label || profile.id;
    button.disabled = profile.availability === 'unavailable';
    button.title = profile.availability === 'unavailable' ? (profile.unavailableReason || UNAVAILABLE_REASON) : '';
    button.addEventListener('click', () => {
      if (profile.availability === 'unavailable') {
        setMessage(profile.unavailableReason || UNAVAILABLE_REASON);
        return;
      }
      if (profile.id !== selectedProfileId) {
        const url = new globalThis.URL(globalThis.location.href);
        url.searchParams.set('server', profile.id);
        globalThis.location.assign(url.href);
        return;
      }
      component.onServerSelect?.(profile);
    });
    serverList.append(button);
  }

  if (globalThis.LastRODirectSocketsSupported === false) {
    environment.textContent = '当前页面不是 Direct Sockets IWA。请安装 signed .swbn 后再登录。';
    if (nativeConnect) nativeConnect.disabled = true;
  } else {
    environment.textContent = 'Direct TCP API 可用；尚未连接游戏服务器';
  }

  form.addEventListener('submit', event => event.preventDefault());

  panel.addEventListener('click', event => {
    const actionElement = event.target.closest('[data-lastro-action]');
    if (actionElement && panel.contains(actionElement)) {
      const action = actionElement.dataset.lastroAction;
      const cardAccount = accountFromCard(actionElement.closest('[data-account-id]'));
      if (action === 'add') showEditView(undefined);
      else if (action === 'edit' && cardAccount) showEditView(cardAccount);
      else if (action === 'remove' && cardAccount) void deleteAccount(cardAccount);
      else if (action === 'delete') void deleteAccount(selectedAccount);
      else if (action === 'cancel') showListView();
      else if (action === 'save') void saveFromForm();
      else if (action === 'login-only') loginFromFormOnly();
      else if (action === 'login' && selectedAccount) loginWithAccount(selectedAccount);
      return;
    }
    const card = event.target.closest('[data-account-id]');
    const account = accountFromCard(card && accountList.contains(card) ? card : undefined);
    if (account) selectAccount(account);
  });

  panel.addEventListener('dblclick', event => {
    if (event.target.closest('[data-lastro-action]')) return;
    const card = event.target.closest('[data-account-id]');
    const account = accountFromCard(card && accountList.contains(card) ? card : undefined);
    if (account) loginWithAccount(account);
  });

  globalThis.LastROLoginBeforeConnect = (username, password) => {
    if (globalThis.LastRODirectSocketsSupported === false) {
      environment.textContent = '当前页面不是 Direct Sockets IWA。请安装 signed .swbn 后再登录。';
      return false;
    }
    if (selectedAccount?.id) void markAccountUsed(selectedAccount.id);
    if (nativeUsername && nativeUsername.value !== username) nativeUsername.value = username;
    if (nativePassword && nativePassword.value !== password) nativePassword.value = password;
    sendLoginRegistration(configs, 'check', username, password);
    return true;
  };
  globalThis.LastROLoginAfterPassword = (username, password) => {
    sendLoginRegistration(configs, 'checkin', username, password);
  };
  void refreshAccounts();
}
