import { createEncryptedAccountStorage, type AccountStore, type StoreDependencies } from './account-storage.mjs';
export type { AccountDraft, AccountStore, AccountSummary, LocalAccount } from './account-storage.mjs';

export class IndexedDbAccountStore implements AccountStore {
  private readonly store: AccountStore;
  constructor(dependencies: StoreDependencies = {}) { this.store = createEncryptedAccountStorage(dependencies); }
  list(...args: Parameters<AccountStore['list']>) { return this.store.list(...args); }
  get(...args: Parameters<AccountStore['get']>) { return this.store.get(...args); }
  save(...args: Parameters<AccountStore['save']>) { return this.store.save(...args); }
  remove(...args: Parameters<AccountStore['remove']>) { return this.store.remove(...args); }
  markUsed(...args: Parameters<AccountStore['markUsed']>) { return this.store.markUsed(...args); }
}

export function createAccountStore(): AccountStore { return new IndexedDbAccountStore(); }
