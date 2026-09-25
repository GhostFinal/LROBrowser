import type { AvailableServerId } from '../servers/server-profile';
import { getAvailableServerProfile } from '../servers/server-profiles';

export interface LocalAccount {
  id: string;
  serverProfileId: AvailableServerId;
  label: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}
export type AccountDraft = Pick<LocalAccount, 'serverProfileId' | 'label' | 'username' | 'password'> & { id?: string };
export interface AccountStore {
  list(serverProfileId?: AvailableServerId): Promise<LocalAccount[]>;
  get(id: string): Promise<LocalAccount | undefined>;
  save(draft: AccountDraft): Promise<LocalAccount>;
  remove(id: string): Promise<void>;
  markUsed(id: string, at: number): Promise<void>;
}

interface StoreDependencies { indexedDB?: IDBFactory; now?: () => number; newId?: () => string }
function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地账号存储失败'));
  });
}

export class IndexedDbAccountStore implements AccountStore {
  private database?: Promise<IDBDatabase>;
  private readonly factory: IDBFactory | undefined;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(dependencies: StoreDependencies = {}) {
    this.factory = dependencies.indexedDB ?? globalThis.indexedDB;
    this.now = dependencies.now ?? Date.now;
    this.newId = dependencies.newId ?? (() => crypto.randomUUID());
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      if (!this.factory) { reject(new Error('本地账号存储不可用')); return; }
      const opened = this.factory.open('lastro-iwa', 1);
      let rejected = false;
      opened.onupgradeneeded = () => {
        const store = opened.result.createObjectStore('accounts', { keyPath: 'id' });
        store.createIndex('serverProfileId', 'serverProfileId');
      };
      opened.onblocked = () => { rejected = true; reject(new Error('本地账号存储被占用')); };
      opened.onerror = () => reject(opened.error ?? new Error('本地账号存储不可用'));
      opened.onsuccess = () => {
        const database = opened.result;
        if (rejected) { database.close(); return; }
        database.onversionchange = () => { database.close(); this.database = undefined; };
        resolve(database);
      };
    });
    return this.database;
  }

  private async transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const database = await this.open();
    const transaction = database.transaction('accounts', mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('本地账号写入失败'));
    });
    void completed.catch(() => undefined);
    try {
      const result = await action(transaction.objectStore('accounts'));
      await completed;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* The transaction may already have ended. */ }
      throw error;
    }
  }

  async list(serverProfileId?: AvailableServerId): Promise<LocalAccount[]> {
    if (serverProfileId) getAvailableServerProfile(serverProfileId);
    const accounts: LocalAccount[] = await this.transaction('readonly', store => request(
      serverProfileId ? store.index('serverProfileId').getAll(serverProfileId) : store.getAll(),
    ));
    return accounts.sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1)
      || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  get(id: string): Promise<LocalAccount | undefined> {
    return this.transaction('readonly', store => request(store.get(id)));
  }

  async save(draft: AccountDraft): Promise<LocalAccount> {
    getAvailableServerProfile(draft.serverProfileId);
    if (typeof draft.username !== 'string' || !draft.username || typeof draft.password !== 'string' || !draft.password
      || typeof draft.label !== 'string') throw new Error('账号资料不完整');
    return this.transaction('readwrite', async store => {
      const previous: LocalAccount | undefined = draft.id ? await request(store.get(draft.id)) : undefined;
      if (draft.id && !previous) throw new Error('账号已不存在');
      const at = this.now();
      const account: LocalAccount = {
        id: previous?.id ?? this.newId(), serverProfileId: draft.serverProfileId,
        label: draft.label, username: draft.username, password: draft.password,
        createdAt: previous?.createdAt ?? at, updatedAt: at, lastUsedAt: previous?.lastUsedAt ?? null,
      };
      await request(store.put(account));
      return account;
    });
  }

  async remove(id: string): Promise<void> {
    await this.transaction('readwrite', store => request(store.delete(id)));
  }

  async markUsed(id: string, at: number): Promise<void> {
    if (!Number.isFinite(at) || at < 0) throw new Error('无效使用时间');
    await this.transaction('readwrite', async store => {
      const account: LocalAccount | undefined = await request(store.get(id));
      if (!account) throw new Error('账号已不存在');
      await request(store.put({ ...account, lastUsedAt: at }));
    });
  }
}

export function createAccountStore(): AccountStore { return new IndexedDbAccountStore(); }
