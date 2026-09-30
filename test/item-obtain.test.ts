// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the installer extracted from the generated game, not a copy of it.
const source = readFileSync('generated/runtime/Online.js', 'utf8');
const ast = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let installer = '';
function visit(node: ts.Node) {
  if (ts.isFunctionExpression(node) && node.name?.text === 'installLastroLootList') installer = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!installer) throw new Error('Missing actual pickup list installer');

type Item = { ITID: number; count?: number; [key: string]: unknown };
const cleanup: Array<() => void> = [];
function fixture(nativeClock = false) {
  const root = document.createElement('div').attachShadow({ mode: 'open' });
  root.innerHTML = '<div id="ItemObtain"><div class="content"></div></div>';
  const loads: Array<{ path: string; done: (url: string) => void }> = [];
  const component = {
    getRoot: () => root, placeOnTop: vi.fn(), onRemove: () => {},
    set: (_item: Item) => { void _item; }, remove: vi.fn(() => component.onRemove()),
  };
  runInNewContext(`(${installer})(component, dependencies, 5000)`, {
    component, dependencies: {
      ...(nativeClock ? {} : { Events: { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout } }),
      DB: {
        INTERFACE_PATH: 'data/', getItemName: (item: Item) => item.display ?? `物品${item.ITID}`,
        getItemInfo: () => ({ identifiedResourceName: 'known', unidentifiedResourceName: 'unknown' }),
      },
      Client: { loadFile: (path: string, done: (url: string) => void) => loads.push({ path, done }) },
    },
  });
  cleanup.push(() => component.onRemove());
  return {
    component, root, loads,
    rows: () => [...root.querySelectorAll('.loot-list .loot-row')],
    names: () => [...root.querySelectorAll('.loot-list .loot-name')].map(node => node.textContent),
    counts: () => [...root.querySelectorAll('.loot-list .loot-count')].map(node => node.textContent),
  };
}

describe('item pickup list behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup.splice(0).forEach(remove => remove());
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('adapts dimensions and queues overflow on resize without losing quantities or order', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id, count: id });
    vi.advanceTimersByTime(2000);
    vi.stubGlobal('innerWidth', 640);
    vi.stubGlobal('innerHeight', 360);
    window.dispatchEvent(new Event('resize'));
    expect(f.names()).toEqual(['物品1', '物品2', '物品3']);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品4');
    const host = f.root.host as HTMLElement;
    const top = parseFloat(host.style.getPropertyValue('--loot-top'));
    const height = parseFloat(host.style.getPropertyValue('--loot-panel-height'));
    expect(top).toBeGreaterThanOrEqual(16);
    expect(top + height).toBeLessThanOrEqual(344);
    expect(parseFloat(host.style.getPropertyValue('--loot-width'))).toBeLessThan(304);
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 4, count: 2 });
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    expect(f.counts()).toEqual(['×1', '×2', '×3', '×6', '×5']);
    expect(parseFloat(host.style.getPropertyValue('--loot-width'))).toBeGreaterThan(304);
    vi.advanceTimersByTime(2300);
    expect(f.names()).toEqual(['物品4', '物品5', '物品6', '物品7', '物品8']);
    vi.advanceTimersByTime(2399);
    expect(f.names()).toContain('物品4');
    vi.advanceTimersByTime(1);
    expect(f.names()).not.toContain('物品4');
  });

  it('removes the resize listener when the notification component closes', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const f = fixture();
    f.component.set({ ITID: 1 });
    f.component.remove();
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
    removeListener.mockRestore();
  });

  it('renders names as safe text and keeps same-ID asynchronous icons isolated', () => {
    const f = fixture();
    f.component.set({ ITID: 1, IsIdentified: true, count: 4, display: '^FF0000<b>漂亮旧娃娃</b><img src=x onerror=alert(1)>' });
    f.component.set({ ITID: 1, IsIdentified: false });
    vi.advanceTimersByTime(300);
    expect(f.names()[0]).toBe('漂亮旧娃娃');
    expect(f.root.querySelector('.loot-name')?.children).toHaveLength(0);
    expect(f.counts()).toEqual(['×4', '×1']);
    expect(f.loads.map(load => load.path)).toEqual(['data/item/known.bmp', 'data/item/unknown.bmp']);
    f.loads[1]!.done('https://example.test/unknown.bmp');
    f.loads[0]!.done('https://example.test/known.bmp');
    expect(f.rows().map(row => row.querySelector('img')?.getAttribute('src'))).toEqual([
      'https://example.test/known.bmp', 'https://example.test/unknown.bmp',
    ]);
  });

  it('installs before GUIComponent prepares its lazy Shadow DOM', () => {
    const component = { getRoot: () => null };
    expect(() => runInNewContext(`(${installer})(component, {}, 5000)`, { component })).not.toThrow();
  });

  it('uses browser timers in production, including for newly displayed queued items', () => {
    const f = fixture(true);
    for (let id = 1; id <= 6; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(5000);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    vi.advanceTimersByTime(4999);
    expect(f.rows()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.rows()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('merges quantities despite different inventory indexes, refreshing only that row', () => {
    const f = fixture();
    f.component.set({ ITID: 1, count: 2, index: 1 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 2, count: 4 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 1, count: 3, index: 99 });
    expect(f.counts()).toEqual(['×5', '×4']);
    vi.advanceTimersByTime(4000);
    expect(f.names()).toEqual(['物品1']);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(f.rows()).toHaveLength(0);
    expect(f.component.remove).toHaveBeenCalledOnce();
  });

  it('queues beyond five in FIFO order and starts lifetime only on display', () => {
    const f = fixture();
    for (let id = 1; id <= 7; id++) f.component.set({ ITID: id, count: 1 });
    vi.advanceTimersByTime(1200);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    expect(f.root.querySelector('.loot-heading')?.textContent).toBe('获得物品');
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品6');
    expect(f.root.querySelector('.loot-pending')).toBeNull();
    expect(f.loads).toHaveLength(6);
    vi.advanceTimersByTime(2700);
    f.component.set({ ITID: 6, count: 8 });
    expect(f.root.querySelector('.loot-preview .loot-count')?.textContent).toBe('×9');
    vi.advanceTimersByTime(1100);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品7');
    vi.advanceTimersByTime(1200);
    expect(f.names()).toEqual(['物品6', '物品7']);
    expect(f.counts()).toEqual(['×9', '×1']);
    expect(f.root.querySelector<HTMLElement>('.loot-preview')?.hidden).toBe(true);
    vi.advanceTimersByTime(3799);
    expect(f.rows()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品7']);
    vi.advanceTimersByTime(300);
    expect(f.rows()).toHaveLength(0);
  });

  it.each([
    ['RefiningLevel', 5], ['IsIdentified', false], ['slot', { card1: 4001 }],
    ['Options', [{ index: 1, value: 5, param: 0 }]], ['enchantgrade', 2],
    ['bindOnEquipType', 1], ['HireExpireDate', 500], ['IsDamaged', true],
  ])('does not merge different %s attributes', (field, value) => {
    const f = fixture();
    f.component.set({ ITID: 1, IsIdentified: true });
    f.component.set({ ITID: 1, IsIdentified: true, [String(field)]: value });
    vi.advanceTimersByTime(300);
    expect(f.rows()).toHaveLength(2);
  });

  it('normalizes nested key order without changing the item packet', () => {
    const f = fixture();
    const item = { ITID: 1, count: 2, slot: { card1: 10, card2: 20 } };
    f.component.set(item);
    f.component.set({ slot: { card2: 20, card1: 10 }, count: 3, ITID: 1 });
    expect(f.counts()).toEqual(['×5']);
    expect(item.count).toBe(2);
  });

  it('restores a fading entry on merge and begins a fresh count after expiry', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4700);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(true);
    f.component.set({ ITID: 1 });
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(f.counts()).toEqual(['×2']);
    vi.advanceTimersByTime(4700);
    expect(f.rows()).toHaveLength(0);
    f.component.set({ ITID: 1 });
    expect(f.counts()).toEqual(['×1']);
  });

  it('clears visible entries, queue, timers and stale icon callbacks on removal', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(1200);
    f.component.remove();
    expect(vi.getTimerCount()).toBe(0);
    f.component.set({ ITID: 1 });
    f.loads.at(-1)!.done('https://example.test/new.bmp');
    f.loads[0]!.done('https://example.test/stale.bmp');
    expect(f.root.querySelector('img')?.getAttribute('src')).toBe('https://example.test/new.bmp');
    vi.advanceTimersByTime(5000);
    expect(f.rows()).toHaveLength(0);
    expect(f.loads).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains a burst of 100 distinct items without dropping or reordering any', () => {
    const f = fixture();
    for (let id = 1; id <= 100; id++) f.component.set({ ITID: id });
    const seen = new Set<string>();
    for (let tick = 0; tick < 1100; tick++) {
      expect(f.rows().length).toBeLessThanOrEqual(5);
      for (const name of f.names()) seen.add(name!);
      vi.advanceTimersByTime(100);
    }
    expect([...seen]).toEqual(Array.from({ length: 100 }, (_, i) => `物品${i + 1}`));
    expect(f.rows()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never accelerates the first row when queued loot arrives', () => {
    const f = fixture();
    for (let id = 1; id <= 5; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 6 });
    vi.advanceTimersByTime(1000);
    f.component.set({ ITID: 7 });
    vi.advanceTimersByTime(2000);
    expect(f.rows().every(row => !row.classList.contains('is-leaving'))).toBe(true);
    expect(f.names()).toEqual(['物品1', '物品2', '物品3', '物品4', '物品5']);
    vi.advanceTimersByTime(599);
    expect(f.rows().every(row => !row.classList.contains('is-leaving'))).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.rows().map(row => row.classList.contains('is-leaving'))).toEqual([true, false, false, false, false]);
    vi.advanceTimersByTime(400);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品7');
  });

  it('admits a burst one card every 300ms, with no premature half-row previews', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    expect(f.names()).toEqual(['物品1']);
    expect(f.root.querySelector<HTMLElement>('.loot-preview')?.hidden).toBe(true);
    for (let id = 2; id <= 5; id++) {
      vi.advanceTimersByTime(299);
      expect(f.rows()).toHaveLength(id - 1);
      vi.advanceTimersByTime(1);
      expect(f.rows()).toHaveLength(id);
    }
    expect(f.root.querySelector('.loot-preview .loot-name')?.textContent).toBe('物品6');
    vi.advanceTimersByTime(3799);
    expect(f.names()[0]).toBe('物品1');
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品2', '物品3', '物品4', '物品5', '物品6']);
    vi.advanceTimersByTime(299);
    expect(f.names()[0]).toBe('物品2');
    vi.advanceTimersByTime(1);
    expect(f.names()).toEqual(['物品3', '物品4', '物品5', '物品6', '物品7']);
  });

  it('merges a queued pickup without recreating or restarting the visible entry animation', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const first = f.rows()[0];
    f.component.set({ ITID: 2, count: 2 });
    vi.advanceTimersByTime(100);
    f.component.set({ ITID: 2, count: 3 });
    f.component.set({ ITID: 1, count: 4 });
    expect(f.rows()[0]).toBe(first);
    expect(f.counts()).toEqual(['×5']);
    vi.advanceTimersByTime(199);
    expect(f.rows()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.counts()).toEqual(['×5', '×5']);
  });

  it('cancels the entrance queue timer when the component closes before the second card', () => {
    const f = fixture();
    for (let id = 1; id <= 8; id++) f.component.set({ ITID: id });
    vi.advanceTimersByTime(100);
    f.component.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(f.rows()).toHaveLength(0);
    f.component.set({ ITID: 99 });
    expect(f.names()).toEqual(['物品99']);
    vi.advanceTimersByTime(300);
    expect(f.names()).toEqual(['物品99']);
  });

  it('closes the group with the final card, but cancels closing if new loot arrives', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    const group = f.root.querySelector('.content')!;
    expect(group.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(4600);
    expect(group.classList.contains('is-closing')).toBe(true);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    f.component.set({ ITID: 2 });
    expect(group.classList.contains('is-closing')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(f.names()).toEqual(['物品2']);
    expect(f.component.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4400);
    expect(group.classList.contains('is-closing')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(f.component.remove).toHaveBeenCalledOnce();
    expect(group.classList.contains('is-closing')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reverses the group exit when the final item is merged during its exit', () => {
    const f = fixture();
    f.component.set({ ITID: 1 });
    vi.advanceTimersByTime(4700);
    f.component.set({ ITID: 1, count: 2 });
    expect(f.root.querySelector('.content')?.classList.contains('is-closing')).toBe(false);
    expect(f.rows()[0]?.classList.contains('is-leaving')).toBe(false);
    expect(f.counts()).toEqual(['×3']);
    vi.advanceTimersByTime(300);
    expect(f.component.remove).not.toHaveBeenCalled();
  });
});
