// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeStorageCount } from '../scripts/lastro-storage-count.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
function region(path: string) {
  const start = vendor.indexOf('//#region ' + path), end = vendor.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('Missing native region: ' + path);
  return vendor.slice(start, end + '//#endregion'.length);
}
const native = region('src/UI/Components/Storage/StorageCommon.js') + '\n'
  + region('src/UI/Components/Storage/StorageV3/StorageFilter.js');
const patched = patchRuntimeStorageCount(native);
function runtime(source: string) {
  const file = ts.createSourceFile('Storage.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements: string[] = [];
  const names = new Set(['createStorage', 'StorageFilter', 'onStorageItemAdded', 'onStorageItemRemoved']);
  const methods = new Set(['setItems', 'renderItem', 'getItemFromIndex', 'removeItem', 'addItem']);
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? '')) statements.push(node.getText(file));
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
      const name = node.expression.left.getText(file);
      if (name === 'StorageFilter.prototype' || name === 'StorageFilter.prototype.constructor'
        || [...methods].some(method => name === 'StorageFilter.prototype.' + method)) statements.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return statements.join('\n');
}
const code = runtime(patched + '\n' + region('src/Engine/MapEngine/Storage.js'));

interface Item {
  index: number; ITID: number; count?: number; type: number; name: string;
  IsIdentified?: boolean; RefiningLevel?: number; card?: number[];
}
interface WindowUI {
  name: string; _host: HTMLElement; _list: Item[]; getRoot(): HTMLElement;
  onCloseCallback?: () => void; onTransferItemToOtherUI(item: Item): void;
  init(): void; remove(): void; onSearch(): void; setItems(items: Item[]): void;
  addItem(item: Item): void; removeItem(index: number, count: number): Item | null;
  reqRemoveItem(index: number, count: number): void;
}
function fixture(items: Item[], { search = false, category = false } = {}) {
  const windows: WindowUI[] = [];
  class GUIComponent {
    static MouseMode = { STOP: 1 };
    _host = document.createElement('div');
    root = document.createElement('div');
    ui = { hide() {}, show() {}, is() { return true; } };
    constructor(public name: string) {
      this.root.innerHTML = '<div class="titlebar"><span class="text"></span></div><div class="overlay"></div>'
        + '<div class="tabs"></div><div class="container"><div class="content"></div></div>'
        + '<div class="filter-buttons"><button data-tab-id="0" data-title="Use"></button></div>'
        + '<input id="storage-search-input"><select class="storage-order-by">'
        + '<option value="BASE">Base</option><option value="UPGRADE">Upgrade</option><option value="DOWNGRADE">Downgrade</option></select>';
      this._host.append(this.root); document.body.append(this._host);
      windows.push(this as unknown as WindowUI);
    }
    getRoot() { return this.root; }
    draggable() {}
    append() {}
    remove() { (this as unknown as { onRemove(): void }).onRemove(); this._host.remove(); }
  }
  const context = {
    GUIComponent, StorageFilter_default: '', StorageFilter_default$1: '', document, window,
    DB: { INTERFACE_PATH: '', getItemInfo: () => ({ identifiedResourceName: 'offline', unidentifiedResourceName: 'offline' }),
      getItemName: (item: Item) => item.name },
    ItemType_default: { HEALING: 0, USABLE: 1, DELAYCONSUME: 2, CASH: 3, ARMOR: 4, SHADOWGEAR: 5,
      PETEGG: 6, WEAPON: 7, PETARMOR: 8, AMMO: 9, CARD: 10, SEARCH: 99 },
    Preferences: { get: (_name: string, defaults: object) => ({ ...defaults, save() {} }) },
    Client: { loadFile: (_path: string, callback: (url: string) => void) => callback('offline.bmp') },
    UIManager: { addComponent: (component: WindowUI) => component },
    StorageController: { getUI: () => storage },
    InventoryController: { getUI: () => ({ ui: { is: () => true } }) },
    CartItems_default: { ui: { is: () => false } },
  };
  const api = runInNewContext(code + '\n({ createStorage, StorageFilter, onStorageItemAdded, onStorageItemRemoved });', context) as {
    createStorage(config: object): WindowUI;
    StorageFilter: unknown;
    onStorageItemAdded(item: Item): void;
    onStorageItemRemoved(packet: { index: number; count: number }): void;
  };
  const storage = api.createStorage({ name: 'Storage', StorageFilter: api.StorageFilter,
    hasFilters: true, hasSearch: true, hasOrderBy: true, htmlText: '', cssText: '' });
  storage.init(); storage.setItems(items);
  const input = storage.getRoot().querySelector<HTMLInputElement>('input')!;
  const button = storage.getRoot().querySelector<HTMLElement>('.filter-buttons button')!;
  const order = storage.getRoot().querySelector<HTMLSelectElement>('select')!;
  function query(value = '药水') { input.value = value; storage.onSearch(); }
  function toggleCategory() { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
  if (category) toggleCategory();
  if (search) query();
  function current(name: string) { return windows.filter(component => component.name === name && component._host.isConnected).at(-1)!; }
  function counts(component: WindowUI) {
    return [...component.getRoot().querySelectorAll<HTMLElement>('.content .item')].map(row => ({
      index: Number(row.dataset.index), count: row.querySelector('.count')?.textContent ?? null,
    }));
  }
  return { storage, query, toggleCategory, order, counts, search: () => current('StorageFilter_99'),
    category: () => current('StorageFilter_0'),
    remove: (index: number, count: number) => api.onStorageItemRemoved({ index, count }),
    deposit: api.onStorageItemAdded };
}
function potion(index = 1, count = 10): Item {
  return { index, ITID: 501, count, type: 0, name: '红色药水', IsIdentified: true };
}
afterEach(() => document.body.replaceChildren());

describe('native storage quantity updates across search and category windows', () => {
  it.each([
    { search: false, category: false }, { search: true, category: false },
    { search: false, category: true }, { search: true, category: true },
  ])('applies a server withdrawal once with windows %j', options => {
    const item = potion(), f = fixture([item], options);
    f.remove(1, 2);
    expect(item.count).toBe(8);
    expect(f.counts(f.storage)).toEqual([{ index: 1, count: '8' }]);
    if (options.search) {
      expect(f.counts(f.search())).toEqual([{ index: 1, count: '8' }]);
      expect(f.search()._list[0]?.count).toBe(8);
    }
    if (options.category) expect(f.counts(f.category())).toEqual([{ index: 1, count: '8' }]);
  });

  it('removes exhausted stacks from every window after repeated partial withdrawals', () => {
    const item = potion(), f = fixture([item], { search: true, category: true });
    f.remove(1, 2); f.remove(1, 3);
    expect(item.count).toBe(5);
    for (const ui of [f.storage, f.search(), f.category()]) expect(f.counts(ui)).toEqual([{ index: 1, count: '5' }]);
    f.remove(1, 5);
    expect(item.count).toBe(0);
    for (const ui of [f.storage, f.search(), f.category()]) expect(f.counts(ui)).toEqual([]);
    expect(f.search()._list).toHaveLength(0); expect(f.category()._list).toHaveLength(0);
    expect(f.storage.removeItem(1, 1)).toBeNull();
    f.query(); expect(f.counts(f.search())).toEqual([]);
  });

  it('keeps separate storage indices for the same item and removes count-less equipment', () => {
    const first = potion(), second = potion(2, 7);
    const equipment = { index: 3, ITID: 1201, type: 7, name: '药水测试武器', IsIdentified: true, RefiningLevel: 9, card: [4001, 0, 0, 0] };
    const f = fixture([first, second, equipment], { search: true, category: true });
    f.remove(1, 4);
    expect(first.count).toBe(6); expect(second.count).toBe(7);
    expect(f.counts(f.search())).toEqual([{ index: 1, count: '6' }, { index: 2, count: '7' }, { index: 3, count: null }]);
    expect(f.search()._list[2]).toEqual(equipment);
    f.remove(3, 1);
    expect(f.counts(f.search())).toEqual([{ index: 1, count: '6' }, { index: 2, count: '7' }]);
    expect(f.counts(f.category())).toEqual([{ index: 1, count: '6' }, { index: 2, count: '7' }]);
  });

  it('refreshes an open search on confirmed deposits without losing filters or double-counting', () => {
    const item = potion(), f = fixture([item], { search: true, category: true });
    f.remove(1, 2); f.deposit(potion(1, 4));
    expect(item.count).toBe(12);
    for (const ui of [f.storage, f.search(), f.category()]) expect(f.counts(ui)).toEqual([{ index: 1, count: '12' }]);
    f.deposit({ ...potion(2, 3), name: '蓝色药水', ITID: 505 });
    f.deposit({ ...potion(3, 5), name: '苹果', ITID: 512 });
    expect(f.counts(f.search())).toEqual([{ index: 1, count: '12' }, { index: 2, count: '3' }]);
    expect(f.counts(f.storage)).toEqual([{ index: 1, count: '12' }, { index: 2, count: '3' }]);
    expect(f.counts(f.category())).toEqual([{ index: 1, count: '12' }, { index: 2, count: '3' }, { index: 3, count: '5' }]);
    f.remove(2, 2);
    expect(f.search()._list[1]?.count).toBe(1);
    expect(f.counts(f.search())[1]).toEqual({ index: 2, count: '1' });
  });

  it('reopens filters from current counts and preserves the search when sorting', () => {
    const first = potion(), second = { ...potion(2, 6), name: '蓝色药水', ITID: 505 };
    const f = fixture([first, second, { ...potion(3, 3), name: '苹果' }], { search: true, category: true });
    f.remove(1, 3); f.search().remove(); f.toggleCategory();
    f.query('红色'); f.toggleCategory();
    expect(f.counts(f.search())).toEqual([{ index: 1, count: '7' }]);
    expect(f.counts(f.category())).toEqual([{ index: 1, count: '7' }, { index: 2, count: '6' }, { index: 3, count: '3' }]);
    for (const order of ['UPGRADE', 'DOWNGRADE']) {
      f.order.value = order; f.query('药水');
      expect(f.counts(f.storage)).toHaveLength(2);
      expect(f.counts(f.storage).map(row => row.index).sort()).toEqual([1, 2]);
      expect(f.search()._list.map(item => item.count)).toEqual([7, 6]);
    }
  });

  it('keeps counts unchanged while a transfer request awaits server confirmation', () => {
    const item = potion(), f = fixture([item], { search: true, category: true });
    const request = vi.fn(); f.storage.reqRemoveItem = request;
    f.remove(1, 2);
    f.search().onTransferItemToOtherUI(f.search()._list[0]!);
    expect(request).toHaveBeenCalledWith(1, 8);
    expect(item.count).toBe(8);
    for (const ui of [f.storage, f.search(), f.category()]) expect(f.counts(ui)).toEqual([{ index: 1, count: '8' }]);
    f.remove(1, 8);
    for (const ui of [f.storage, f.search(), f.category()]) expect(f.counts(ui)).toEqual([]);
  });

  it('rejects changed or duplicated patch anchors and leaves unrelated fixtures untouched', () => {
    expect(patchRuntimeStorageCount('const unrelated = true;')).toBe('const unrelated = true;');
    expect(() => patchRuntimeStorageCount(native.replace('items.slice(0)', 'items.slice(1)'))).toThrow('anchor:storage-count:filter-copy');
    expect(() => patchRuntimeStorageCount(native.replace('Component.addItem =', 'Component.renamedAddItem ='))).toThrow('anchor:storage-count:add-item');
    expect(() => patchRuntimeStorageCount(native + native)).toThrow('anchor:storage-count:region');
  });
});
