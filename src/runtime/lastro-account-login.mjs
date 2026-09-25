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
    + '<h2>LastRO 登录</h2>'
    + '<p class="lastro-login-environment" data-lastro-login-environment role="status"></p>'
    + '<section class="lastro-login-servers"><h3>服务器</h3><div data-lastro-server-list></div></section>'
    + '<section class="lastro-login-accounts"><h3>账号</h3><div class="lastro-account-list" data-lastro-account-list></div></section>'
    + '<form data-lastro-account-form>'
    + '<label>备注<input data-lastro-account-label type="text" autocomplete="off"></label>'
    + '<label>账号<input data-lastro-account-username type="text" autocomplete="username"></label>'
    + '<label>密码<input data-lastro-account-password type="password" autocomplete="current-password"></label>'
    + '<div class="lastro-account-actions">'
    + '<button type="button" data-lastro-action="new">新增</button>'
    + '<button type="button" data-lastro-action="save">保存</button>'
    + '<button type="button" data-lastro-action="delete">删除</button>'
    + '</div><p class="lastro-login-message" data-lastro-login-message role="status"></p></form></section>';
  return `${cleaned.slice(0, closingIndex)}${panel}${cleaned.slice(closingIndex)}`;
}

export function decorateLastROLoginStyles(name, cssText) {
  if (!name.startsWith('WinLogin') || cssText.includes('.lastro-login-panel')) return cssText;
  return `${cssText}\n.lastro-login-panel { position: absolute; top: 0; left: calc(100% + 12px); z-index: 20; width: 300px; max-height: 370px; overflow-y: auto; box-sizing: border-box; padding: 8px; color: #171717; background: rgba(245, 248, 252, 0.98); border: 1px solid #8799b0; font: 12px sans-serif; }\n.lastro-login-panel h2, .lastro-login-panel h3 { margin: 0 0 6px; font-size: 13px; font-weight: bold; }\n.lastro-login-panel h3 { margin-top: 8px; font-size: 12px; }\n.lastro-login-panel label { display: block; margin: 5px 0; }\n.lastro-login-panel input { display: block; width: 100%; height: 22px; box-sizing: border-box; margin-top: 3px; padding: 2px 4px; border: 1px solid #8799b0; background: #fff; color: #182b40; font: 12px sans-serif; }\n.lastro-login-environment, .lastro-login-message { min-height: 16px; margin: 4px 0; color: #38546f; white-space: pre-wrap; }\n.lastro-login-servers [data-lastro-server-list], .lastro-account-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }\n.lastro-login-panel button { min-height: 24px; overflow: hidden; border: 1px solid #8799b0; background: #fff; color: #182b40; font: 11px sans-serif; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }\n.lastro-login-panel button[data-selected="true"] { background: #c9def4; border-color: #356b9e; font-weight: bold; }\n.lastro-login-panel button:disabled { opacity: .5; cursor: default; }\n.lastro-account-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-top: 7px; }`;
}

function profilesFromConfig(configs) {
  const profiles = configs?.get?.('loginServerProfiles', []);
  return Array.isArray(profiles) ? profiles : [];
}

export function installLastROLogin({ root, component, configs }) {
  const panel = root?.querySelector?.('[data-lastro-login-panel]');
  if (!panel) return;
  const environment = panel.querySelector('[data-lastro-login-environment]');
  const message = panel.querySelector('[data-lastro-login-message]');
  const serverList = panel.querySelector('[data-lastro-server-list]');
  const accountList = panel.querySelector('[data-lastro-account-list]');
  const form = panel.querySelector('[data-lastro-account-form]');
  const labelInput = panel.querySelector('[data-lastro-account-label]');
  const usernameInput = panel.querySelector('[data-lastro-account-username]');
  const passwordInput = panel.querySelector('[data-lastro-account-password]');
  const nativeUsername = root.querySelector('.user');
  const nativePassword = root.querySelector('.pass');
  const nativeConnect = root.querySelector('.connect');
  if (!environment || !message || !serverList || !accountList || !form || !labelInput || !usernameInput || !passwordInput) return;

  const profiles = profilesFromConfig(configs);
  const currentId = configs?.getServer?.()?.id ?? profiles.find(profile => profile.availability === 'available')?.id;
  let selectedAccount;
  let selectedProfileId = currentId;

  function setMessage(value) {
    message.textContent = value;
  }

  function currentProfile() {
    return profiles.find(profile => profile.id === selectedProfileId);
  }

  function clearForm() {
    selectedAccount = undefined;
    form.reset();
    accountList.querySelectorAll('button').forEach(button => { button.dataset.selected = 'false'; });
  }

  function renderAccounts(accounts) {
    accountList.replaceChildren();
    for (const account of accounts) {
      const button = globalThis.document.createElement('button');
      button.type = 'button';
      button.dataset.accountId = account.id;
      button.dataset.selected = String(account.id === selectedAccount?.id);
      button.textContent = account.label || account.username;
      button.addEventListener('click', () => {
        selectedAccount = account;
        labelInput.value = account.label || '';
        usernameInput.value = account.username || '';
        passwordInput.value = account.password || '';
        if (nativeUsername) nativeUsername.value = account.username || '';
        if (nativePassword) nativePassword.value = account.password || '';
        accountList.querySelectorAll('button').forEach(candidate => {
          candidate.dataset.selected = String(candidate === button);
        });
        setMessage('已载入账号');
      });
      accountList.append(button);
    }
  }

  async function refreshAccounts() {
    try {
      renderAccounts(await listAccounts(selectedProfileId));
    } catch {
      setMessage('本地账号存储不可用，仍可直接填写登录');
    }
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
    environment.textContent = 'Direct TCP 已就绪';
  }

  panel.querySelector('[data-lastro-action="new"]')?.addEventListener('click', clearForm);
  panel.querySelector('[data-lastro-action="save"]')?.addEventListener('click', async () => {
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
      await refreshAccounts();
    } catch {
      setMessage('本地账号存储不可用，账号仍可直接登录');
    }
  });
  panel.querySelector('[data-lastro-action="delete"]')?.addEventListener('click', async () => {
    if (!selectedAccount?.id) return;
    try {
      await removeAccount(selectedAccount.id);
      clearForm();
      setMessage('已删除');
      await refreshAccounts();
    } catch {
      setMessage('本地账号删除失败');
    }
  });

  globalThis.LastROLoginBeforeConnect = (username, password) => {
    if (globalThis.LastRODirectSocketsSupported === false) {
      environment.textContent = '当前页面不是 Direct Sockets IWA。请安装 signed .swbn 后再登录。';
      return false;
    }
    if (selectedAccount?.id) void markAccountUsed(selectedAccount.id);
    if (nativeUsername && nativeUsername.value !== username) nativeUsername.value = username;
    if (nativePassword && nativePassword.value !== password) nativePassword.value = password;
    return true;
  };
  void refreshAccounts();
}
