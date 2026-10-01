// This reduces accidental plaintext exposure. Scripts in this origin can use
// the key; CSP and signed IWA delivery remain the security boundary.
const DATABASE_NAME = 'lastro-iwa';
const DATABASE_VERSION = 2;
const ACCOUNT_STORE = 'accounts';
const KEY_STORE = 'credential-keys';
const KEY_ID = 'account-password-aes-gcm-v1';
const PROFILES = new Set(['lastro-2x', 'lastro-3x', 'lastro-app']);
const encoder = new globalThis.TextEncoder();
const decoder = new globalThis.TextDecoder('utf-8', { fatal: true });
function hasCredentialDelimiter(value) { return value.includes('\0') || value.includes('\r') || value.includes('\n'); }

export function validateAccountCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password
    || username.length > 1024 || password.length > 1024 || hasCredentialDelimiter(username + password)) {
    throw new Error('账号或密码格式无效');
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('本地账号存储失败'));
  });
}

function summary(account) {
  return { id: account.id, serverProfileId: account.serverProfileId, label: account.label,
    username: account.username, createdAt: account.createdAt, updatedAt: account.updatedAt,
    lastUsedAt: account.lastUsedAt ?? null };
}

function validRecord(account) {
  return account && typeof account.id === 'string' && account.id.length > 0 && account.id.length <= 256
    && PROFILES.has(account.serverProfileId) && typeof account.label === 'string' && account.label.length <= 256
    && typeof account.username === 'string' && account.username.length > 0 && account.username.length <= 1024
    && !hasCredentialDelimiter(account.username)
    && Number.isFinite(account.createdAt) && Number.isFinite(account.updatedAt)
    && (account.lastUsedAt == null || Number.isFinite(account.lastUsedAt));
}

function authenticatedData(account) {
  return encoder.encode(JSON.stringify([1, account.id, account.serverProfileId, account.username]));
}

function bufferLength(value) {
  try { return Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(value); }
  catch { return -1; }
}

export function createEncryptedAccountStorage(dependencies = {}) {
  const factory = dependencies.indexedDB ?? globalThis.indexedDB;
  const cryptoApi = dependencies.crypto ?? globalThis.crypto;
  const now = dependencies.now ?? Date.now;
  const newId = dependencies.newId ?? (() => cryptoApi.randomUUID());
  let opening;

  function open() {
    if (opening) return opening;
    const attempt = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('本地账号存储不可用')); return; }
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      let rejected = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ACCOUNT_STORE)) {
          db.createObjectStore(ACCOUNT_STORE, { keyPath: 'id' }).createIndex('serverProfileId', 'serverProfileId');
        }
        if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      };
      request.onblocked = () => { rejected = true; reject(new Error('本地账号存储被占用，请关闭其他旧版客户端')); };
      request.onerror = () => reject(new Error('本地账号存储不可用'));
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    });
    opening = attempt;
    void attempt.catch(() => { if (opening === attempt) opening = undefined; });
    return attempt;
  }

  async function transaction(storeName, mode, action) {
    const db = await open();
    const tx = db.transaction(storeName, mode);
    const completed = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(new Error('本地账号存储失败'));
    });
    void completed.catch(() => undefined);
    try {
      const value = await action(tx.objectStore(storeName));
      await completed;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* Already complete. */ }
      throw error;
    }
  }

  async function encryptionKey(create) {
    if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') {
      throw new Error('本地密码加密不可用，仍可选择仅登录不保存');
    }
    const stored = await transaction(KEY_STORE, 'readonly', store => requestResult(store.get(KEY_ID)));
    if (stored) {
      if (stored.type !== 'secret' || stored.extractable !== false || stored.algorithm?.name !== 'AES-GCM'
        || stored.algorithm.length !== 256 || !stored.usages?.includes('encrypt') || !stored.usages?.includes('decrypt')) {
        throw new Error('本地密码密钥无效');
      }
      return stored;
    }
    if (!create) throw new Error('本地密码密钥缺失');
    const generated = await cryptoApi.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // Do not await Web Crypto in an IndexedDB transaction: it auto-commits.
    return transaction(KEY_STORE, 'readwrite', async store => {
      const existing = await requestResult(store.get(KEY_ID));
      if (existing) return existing;
      await requestResult(store.put(generated, KEY_ID));
      return generated;
    });
  }

  async function encrypt(account, password) {
    const key = await encryptionKey(true);
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const plain = encoder.encode(password);
    try {
      const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: authenticatedData(account) }, key, plain);
      return { version: 1, iv, ciphertext };
    } finally { plain.fill(0); }
  }

  async function decrypt(account) {
    const value = account.encryptedPassword;
    if (!value || value.version !== 1 || !ArrayBuffer.isView(value.iv) || value.iv.BYTES_PER_ELEMENT !== 1 || value.iv.length !== 12
      || bufferLength(value.ciphertext) < 17 || bufferLength(value.ciphertext) > 4112) {
      throw new Error('本地密码数据无效');
    }
    let plain;
    try {
      plain = new Uint8Array(await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: value.iv,
        additionalData: authenticatedData(account) }, await encryptionKey(false), value.ciphertext));
      const password = decoder.decode(plain);
      validateAccountCredentials(account.username, password);
      return password;
    } catch { throw new Error('本地密码无法解密，请重新编辑保存该账号'); }
    finally { plain?.fill(0); }
  }

  async function migrate(account) {
    if (typeof account.password !== 'string') return account;
    validateAccountCredentials(account.username, account.password);
    const converted = { ...summary(account), encryptedPassword: await encrypt(account, account.password) };
    // Do not resurrect a deletion or overwrite a concurrent edit from another tab.
    return transaction(ACCOUNT_STORE, 'readwrite', async store => {
      const current = await requestResult(store.get(account.id));
      if (!current || current.password !== account.password || current.username !== account.username
        || current.serverProfileId !== account.serverProfileId || current.updatedAt !== account.updatedAt) return current;
      const migrated = { ...summary(current), encryptedPassword: converted.encryptedPassword };
      await requestResult(store.put(migrated));
      return migrated;
    });
  }

  return {
    async list(serverProfileId) {
      if (serverProfileId && !PROFILES.has(serverProfileId)) throw new Error('未知服务器');
      // Upgrade passwords for every saved profile even when this window shows
      // only one server. Never leave dormant accounts in the legacy format.
      const records = await transaction(ACCOUNT_STORE, 'readonly', store => requestResult(store.getAll()));
      const accounts = [];
      for (const raw of records) {
        if (!validRecord(raw)) continue;
        const account = await migrate(raw);
        if (validRecord(account) && (!serverProfileId || account.serverProfileId === serverProfileId)) accounts.push(summary(account));
      }
      return accounts.sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1)
        || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    },
    async get(id) {
      const raw = await transaction(ACCOUNT_STORE, 'readonly', store => requestResult(store.get(id)));
      if (!validRecord(raw)) return undefined;
      const account = await migrate(raw);
      if (!validRecord(account)) return undefined;
      return { ...summary(account), password: await decrypt(account) };
    },
    async save(draft) {
      if (!PROFILES.has(draft.serverProfileId) || typeof draft.label !== 'string' || draft.label.length > 256) throw new Error('账号资料不完整');
      validateAccountCredentials(draft.username, draft.password);
      const previous = draft.id ? await transaction(ACCOUNT_STORE, 'readonly', store => requestResult(store.get(draft.id))) : undefined;
      if (draft.id && !validRecord(previous)) throw new Error('账号已不存在');
      const at = now();
      const account = { id: previous?.id ?? newId(), serverProfileId: draft.serverProfileId, label: draft.label,
        username: draft.username, createdAt: previous?.createdAt ?? at, updatedAt: at, lastUsedAt: previous?.lastUsedAt ?? null };
      if (!validRecord(account)) throw new Error('账号资料不完整');
      const encryptedPassword = await encrypt(account, draft.password);
      return transaction(ACCOUNT_STORE, 'readwrite', async store => {
        if (draft.id && !await requestResult(store.get(draft.id))) throw new Error('账号已不存在');
        await requestResult(store.put({ ...account, encryptedPassword }));
        return summary(account);
      });
    },
    async remove(id) {
      await transaction(ACCOUNT_STORE, 'readwrite', store => requestResult(store.delete(id)));
    },
    async markUsed(id, at) {
      if (!Number.isFinite(at) || at < 0) throw new Error('无效使用时间');
      await transaction(ACCOUNT_STORE, 'readwrite', async store => {
        const account = await requestResult(store.get(id));
        if (!validRecord(account)) throw new Error('账号已不存在');
        await requestResult(store.put({ ...account, lastUsedAt: at }));
      });
    },
  };
}
