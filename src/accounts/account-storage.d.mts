import type { AvailableServerId } from '../servers/server-profile';
export interface AccountSummary {
  id: string; serverProfileId: AvailableServerId; label: string; username: string;
  createdAt: number; updatedAt: number; lastUsedAt: number | null;
}
export interface LocalAccount extends AccountSummary { password: string }
export type AccountDraft = Pick<LocalAccount, 'serverProfileId' | 'label' | 'username' | 'password'> & { id?: string };
export interface AccountStore {
  list(serverProfileId?: AvailableServerId): Promise<AccountSummary[]>;
  get(id: string): Promise<LocalAccount | undefined>;
  save(draft: AccountDraft): Promise<AccountSummary>;
  remove(id: string): Promise<void>;
  markUsed(id: string, at: number): Promise<void>;
}
export interface StoreDependencies { indexedDB?: IDBFactory; crypto?: Crypto; now?: () => number; newId?: () => string }
export function validateAccountCredentials(username: string, password: string): void;
export function createEncryptedAccountStorage(dependencies?: StoreDependencies): AccountStore;
