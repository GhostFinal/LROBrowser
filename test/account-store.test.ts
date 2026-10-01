import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbAccountStore } from '../src/accounts/account-store';

function setup() {
  let time = 100, id = 0;
  const factory = new IDBFactory();
  const store = new IndexedDbAccountStore({ indexedDB: factory, now: () => time++, newId: () => `fixture-${++id}` });
  return { store, factory };
}
const draft = { serverProfileId: 'lastro-2x' as const, label: '测试角色', username: ' test-user ', password: ' test-password ' };

async function rawDatabase(factory: IDBFactory, version = 2) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('lastro-iwa', version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts', { keyPath: 'id' }).createIndex('serverProfileId', 'serverProfileId');
  });
}

async function rawRead<T = Record<string, unknown>>(db: IDBDatabase, id: string, name = 'accounts'): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rawWrite(db: IDBDatabase, record: unknown) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    tx.objectStore('accounts').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('encrypted local accounts', () => {
  it('round-trips unmodified credentials across store instances and deletes persistently', async () => {
    const { store, factory } = setup();
    const saved = await store.save(draft);
    const reopened = new IndexedDbAccountStore({ indexedDB: factory });
    expect(await reopened.get(saved.id)).toEqual({ ...saved, password: draft.password });
    expect(saved.username).toBe(draft.username);
    expect(saved).not.toHaveProperty('password');
    expect(saved.lastUsedAt).toBeNull();
    await reopened.remove(saved.id);
    expect(await store.get(saved.id)).toBeUndefined();
  });

  it('preserves creation time on update and filters accounts by their server', async () => {
    const { store } = setup();
    const first = await store.save(draft);
    const second = await store.save({ ...draft, serverProfileId: 'lastro-3x' });
    const updated = await store.save({ ...first, password: 'changed' });
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(first.updatedAt);
    expect((await store.list('lastro-2x')).map(a => a.id)).toEqual([first.id]);
    expect((await store.list('lastro-3x')).map(a => a.id)).toEqual([second.id]);
  });

  it('orders by last use then update and marks use without changing credentials', async () => {
    const { store } = setup();
    const first = await store.save(draft), second = await store.save(draft);
    expect((await store.list()).map(a => a.id)).toEqual([second.id, first.id]);
    await store.markUsed(first.id, 1000);
    expect((await store.list()).map(a => a.id)).toEqual([first.id, second.id]);
    expect(await store.get(first.id)).toMatchObject({ password: draft.password, lastUsedAt: 1000 });
  });

  it('rejects unknown profiles before opening storage', async () => {
    const { store } = setup();
    for (const serverProfileId of ['untrusted']) {
      await expect(store.save({ ...draft, serverProfileId } as never)).rejects.toThrow();
    }
    expect(await store.list()).toEqual([]);
  });

  it('accepts App服 accounts with the verified profile', async () => {
    const { store } = setup();
    const saved = await store.save({ ...draft, serverProfileId: 'lastro-app' });
    expect(saved.serverProfileId).toBe('lastro-app');
    expect((await store.list('lastro-app')).map(account => account.id)).toEqual([saved.id]);
  });

  it('does not recreate a deleted account when an old edit or login completes', async () => {
    const { store } = setup();
    const saved = await store.save(draft);
    await store.remove(saved.id);
    await expect(store.save({ ...saved, password: draft.password, label: 'old edit' })).rejects.toThrow();
    await expect(store.markUsed(saved.id, 1000)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });

  it('reports a storage-open failure without including credentials', async () => {
    const store = new IndexedDbAccountStore({ indexedDB: { open() { throw new Error('unavailable'); } } as unknown as IDBFactory });
    await expect(store.save(draft)).rejects.toThrow('unavailable');
  });

  it('persists authenticated ciphertext and a non-exportable AES key, never passwords in list results', async () => {
    const { store, factory } = setup();
    const saved = await store.save(draft);
    const db = await rawDatabase(factory);
    try {
      const raw = await rawRead(db, saved.id);
      expect(raw).not.toHaveProperty('password');
      expect(JSON.stringify(raw)).not.toContain(draft.password);
      expect(raw).toHaveProperty('encryptedPassword.version', 1);
      expect(await store.list()).toEqual([saved]);
      const key = await rawRead<CryptoKey>(db, 'account-password-aes-gcm-v1', 'credential-keys');
      expect(key.extractable).toBe(false);
      expect(key.algorithm.name).toBe('AES-GCM');
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    } finally { db.close(); }
  });

  it('migrates legacy passwords in place without changing account metadata or trimming credentials', async () => {
    const { store, factory } = setup();
    const old = await rawDatabase(factory, 1);
    const legacy = { ...draft, id: 'legacy', createdAt: 10, updatedAt: 20, lastUsedAt: 30 };
    await rawWrite(old, legacy);
    old.close();
    expect(await store.list()).toEqual([{ id: 'legacy', serverProfileId: draft.serverProfileId,
      label: draft.label, username: draft.username, createdAt: 10, updatedAt: 20, lastUsedAt: 30 }]);
    expect(await store.get('legacy')).toEqual(legacy);
    const db = await rawDatabase(factory);
    try { expect(await rawRead(db, 'legacy')).not.toHaveProperty('password'); }
    finally { db.close(); }
  });

  it('also migrates dormant server profiles when only one server is listed', async () => {
    const { store, factory } = setup();
    const old = await rawDatabase(factory, 1);
    await rawWrite(old, { ...draft, id: 'dormant', serverProfileId: 'lastro-3x', createdAt: 10, updatedAt: 20 });
    old.close();
    expect(await store.list('lastro-2x')).toEqual([]);
    const db = await rawDatabase(factory);
    try { expect(await rawRead(db, 'dormant')).not.toHaveProperty('password'); }
    finally { db.close(); }
  });

  it('authenticates ciphertext bytes and keeps a damaged account available for repair', async () => {
    const { store, factory } = setup();
    const saved = await store.save(draft);
    const db = await rawDatabase(factory);
    try {
      const raw = await rawRead<{ encryptedPassword: { ciphertext: ArrayBuffer } }>(db, saved.id);
      const bytes = new Uint8Array(raw.encryptedPassword.ciphertext);
      bytes[0] = bytes[0]! ^ 1;
      await rawWrite(db, raw);
      await expect(store.get(saved.id)).rejects.toThrow('无法解密');
      expect(await store.list()).toEqual([saved]);
    } finally { db.close(); }
  });

  it('uses a fresh IV on every save and rejects ciphertext copied to another account', async () => {
    const { store, factory } = setup();
    const first = await store.save(draft), second = await store.save(draft);
    const db = await rawDatabase(factory);
    try {
      const original = await rawRead(db, first.id);
      const other = await rawRead(db, second.id);
      expect(original.encryptedPassword).not.toEqual(other.encryptedPassword);
      await rawWrite(db, { ...other, encryptedPassword: original.encryptedPassword });
      await expect(store.get(second.id)).rejects.toThrow('无法解密');
      expect(await store.get(first.id)).toMatchObject({ password: draft.password });
    } finally { db.close(); }
  });

  it.each(['username', 'serverProfileId'])('authenticates the %s against tampering', async field => {
    const { store, factory } = setup();
    const saved = await store.save(draft);
    const db = await rawDatabase(factory);
    try {
      const raw = await rawRead(db, saved.id);
      await rawWrite(db, { ...raw, [field]: field === 'username' ? 'changed-user' : 'lastro-3x' });
      await expect(store.get(saved.id)).rejects.toThrow('无法解密');
      await store.save({ ...draft, id: saved.id });
      expect(await store.get(saved.id)).toMatchObject({ password: draft.password });
    } finally { db.close(); }
  });

  it('shares one key across concurrent first saves in separate store instances', async () => {
    const { store, factory } = setup();
    const other = new IndexedDbAccountStore({ indexedDB: factory });
    const [left, right] = await Promise.all([store.save(draft), other.save({ ...draft, password: 'different' })]);
    expect(await other.get(left.id)).toMatchObject({ password: draft.password });
    expect(await store.get(right.id)).toMatchObject({ password: 'different' });
  });

  it('does not resurrect an account deleted while legacy encryption is pending', async () => {
    const factory = new IDBFactory();
    const old = await rawDatabase(factory, 1);
    await rawWrite(old, { ...draft, id: 'legacy', createdAt: 10, updatedAt: 20 });
    old.close();
    function deferred() {
      let resolve: () => void = () => undefined;
      const promise = new Promise<void>(done => { resolve = done; });
      return { promise, resolve };
    }
    const entered = deferred();
    const resume = deferred();
    const subtle = new Proxy(crypto.subtle, {
      get(target, property) {
        if (property === 'encrypt') return async (...args: Parameters<SubtleCrypto['encrypt']>) => {
          entered.resolve();
          await resume.promise;
          return target.encrypt(...args);
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const store = new IndexedDbAccountStore({ indexedDB: factory,
      crypto: { subtle, getRandomValues: crypto.getRandomValues.bind(crypto), randomUUID: crypto.randomUUID.bind(crypto) } });
    const listing = store.list();
    await entered.promise;
    await store.remove('legacy');
    resume.resolve();
    expect(await listing).toEqual([]);
    expect(await store.get('legacy')).toBeUndefined();
  });

  it('refuses to fall back to plaintext if Web Crypto is unavailable', async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbAccountStore({ indexedDB: factory, crypto: {} as Crypto, newId: () => 'fixture' });
    await expect(store.save(draft)).rejects.toThrow('密码加密不可用');
    expect(await store.list()).toEqual([]);
  });

  it.each(['\u0000', '\r', '\n', 'x'.repeat(1025)])('rejects malformed credentials before persistence (%j)', async suffix => {
    const { store } = setup();
    await expect(store.save({ ...draft, password: draft.password + suffix })).rejects.toThrow('格式无效');
    expect(await store.list()).toEqual([]);
  });
});
