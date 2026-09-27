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

describe('local plaintext accounts', () => {
  it('round-trips unmodified credentials across store instances and deletes persistently', async () => {
    const { store, factory } = setup();
    const saved = await store.save(draft);
    const reopened = new IndexedDbAccountStore({ indexedDB: factory });
    expect(await reopened.get(saved.id)).toEqual(saved);
    expect(saved.username).toBe(draft.username);
    expect(saved.password).toBe(draft.password);
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
    await expect(store.save({ ...saved, label: 'old edit' })).rejects.toThrow();
    await expect(store.markUsed(saved.id, 1000)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });

  it('reports a storage-open failure without including credentials', async () => {
    const store = new IndexedDbAccountStore({ indexedDB: { open() { throw new Error('unavailable'); } } as unknown as IDBFactory });
    await expect(store.save(draft)).rejects.toThrow('unavailable');
  });
});
