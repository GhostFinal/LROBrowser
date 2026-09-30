// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractWorldMapFixture } from '../scripts/extract-worldmap-fixture.mjs';

const fixture = extractWorldMapFixture(readFileSync('generated/runtime/Online.js', 'utf8'));
const data = {
  worldData: { prontera: { name: '普隆德拉', branch: ['test_dun'], mobs: [1002, 1002] }, test_dun: { name: '测试地下城', belong: 'prontera', mobs: [1039] }, unknown: { name: '未标记地图', mobs: [] } },
  mobData: {
    1002: { kName: '波利', LV: '1', DropsNum: 2, Drop0id: 501, Drop0per: 1000, Drop1id: 501, Drop1per: 500 },
    1039: { kName: '巴风特', LV: '81', MvpDropsNum: 1, MVP0id: 501, MVP0per: 2000 },
  },
};
const items = { 501: { identifiedDisplayName: '红色药水', identifiedResourceName: 'red-potion', identifiedDescriptionName: ['恢复 HP。', '^ff0000<img src=x onerror=alert(1)>^000000'], slotCount: 0 }, 502: { identifiedDisplayName: '橙色药水' } };
const model = runInNewContext(`(${fixture.createWorldMapIndex})(worldData,mobData,items,()=>({}))`, { ...data, items });
function mount(loadData = vi.fn(async () => data), itemTable: Record<number, { identifiedDisplayName: string }> = items, monsterPortrait = vi.fn(async (_id: number) => { void _id; return 'data:image/png;base64,AAAA'; })) {
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }); root.innerHTML = fixture.html;
  const component = { _host: host, getRoot: () => root, focus: vi.fn(), init: () => {}, onAppend: () => {}, toggle: () => {}, onRemove: () => {}, onResize: () => {}, updatePartyMembers: (_pkt: unknown) => { void _pkt; } };
  const navigate = vi.fn(), teleport = vi.fn();
  const Client = { loadFile: vi.fn((_path: string, _done: (url: string) => void, fail?: () => void) => fail?.()) };
  const api = runInNewContext(`(${fixture.installLastroWorldMap})(component,deps,regions,(${fixture.createWorldMapIndex}))`, {
    component, regions: fixture.regions,
    deps: { document, DB: { INTERFACE_PATH: '', getItemInfo: (id: number) => itemTable[id] || {} }, Client, loadData, itemTable: () => itemTable, currentMap: () => 'prontera.gat', navigate, teleport, monsterPortrait },
  });
  component.init(); component.onAppend();
  const click = (text: string) => {
    const el = [...root.querySelectorAll('button')].find(b => b.textContent === text);
    if (!el) throw new Error('Missing button ' + text); el.click();
  };
  return { root, component, api, click, navigate, teleport, monsterPortrait, Client };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('packaged official-style world map', () => {
  it('uses a single vertical workspace with one page scrollbar at every window size', () => {
    expect(fixture.css).toContain('.wm-workspace{display:grid;grid-template-columns:minmax(0,1fr);');
    expect(fixture.css).toContain('.wm-context,.wm-inspectors{min-width:0;max-height:none;overflow:visible;');
    expect(fixture.css).not.toContain('max-height:calc(100dvh - 130px)');
    expect(fixture.css).not.toContain('.wm-inspectors{border-left:');
  });
  it('bundles every official backdrop and map thumbnail', () => {
    expect(fixture.regions.map(r => r.name)).toEqual(['中土大陆', '次元大陆', '局部地图01', '局部地图02']);
    for (const region of fixture.regions) {
      expect(existsSync('public/worldmap/' + region.background)).toBe(true);
      for (const cell of region.cells) { expect(existsSync('public/worldmap/' + cell.image)).toBe(true); expect(cell.x + cell.span).toBeLessThanOrEqual(region.columns); }
    }
  });
  it('searches all items including those with no drop records and ranks exact ID first', () => {
    expect(model.search('502')[0].record.name).toBe('橙色药水');
    expect(model.search('药水', 'item')).toHaveLength(2);
    expect(model.search('波利', 'monster')[0].record.id).toBe(1002);
    expect(model.search('PRONTERA.GAT', 'map')[0].record.name).toBe('普隆德拉');
    expect(model.search('')).toEqual([]);
  });
  it('preserves independent ordinary and MVP drops without summing duplicate items', () => {
    expect(model.items.get(501).sources.map((s: { rate: number }) => s.rate)).toEqual([1000, 500, 2000]);
    expect(model.monsters.get(1039).drops[0].kind).toBe('MVP 奖励');
    expect(model.monsters.get(1002).maps).toHaveLength(1);
    expect(model.floors('test_dun.rsw').map((m: { id: string }) => m.id)).toEqual(['prontera', 'test_dun']);
  });
  it('uses actual repository monster/drop data including MVP rewards', () => {
    const actual = runInNewContext(`(${fixture.createWorldMapIndex})(w,m,{},()=>({}))`, {
      w: JSON.parse(readFileSync('vendor/core/data/world/world-data.json', 'utf8')),
      m: JSON.parse(readFileSync('vendor/core/data/world/mob-data.json', 'utf8')),
    });
    expect(actual.monsters.get(1039).drops.filter((d: { kind: string }) => d.kind === 'MVP 奖励')).toHaveLength(3);
    expect(actual.items.get(909).sources.length).toBeGreaterThan(0);
    expect(actual.maps.size).toBe(Object.keys(JSON.parse(readFileSync('vendor/core/data/world/world-data.json', 'utf8'))).length);
  });
  it('keeps the selected map mounted with inline monster details and a single item popup', async () => {
    const f = mount(); await f.api.open({ kind: 'map', id: 'prontera' });
    const map = f.root.querySelector('.wm-context');
    const large = f.root.querySelector('.wm-map-image img');
    expect(large?.getAttribute('src')).toBe('/worldmap/prontera.png');
    expect(f.root.querySelector('.wm-body')?.textContent).toContain('地图怪物 · 1 种');
    await f.api.open({ kind: 'monster', id: 1002 });
    expect(f.root.querySelector('.wm-body')?.textContent).toContain('10.00%');
    await f.api.open({ kind: 'item', id: 501 });
    expect(f.root.querySelector('.wm-item-window')?.textContent).toContain('恢复 HP');
    expect(f.root.querySelector('.wm-item-window')?.textContent).toContain('掉落来源 · 3');
    expect(f.root.querySelector('.wm-body .wm-item-detail')).toBeNull();
    expect(f.root.querySelector('.wm-description')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(f.root.querySelector('.wm-description img[src="x"]')).toBeNull();
    for (let i = 0; i < 12; i++) {
      await f.api.open({ kind: 'monster', id: i % 2 ? 1002 : 1039 });
      await f.api.open({ kind: 'item', id: 501 });
    }
    expect(f.root.querySelector('.wm-context')).toBe(map);
    expect(f.root.querySelector('.wm-map-image img')).toBe(large);
    expect(f.root.querySelectorAll('.wm-inspector')).toHaveLength(1);
    expect(f.root.querySelectorAll('.wm-item-window')).toHaveLength(1);
    expect(f.root.querySelector('.wm-title')?.textContent).toBe('普隆德拉 · prontera');
    f.click('返回世界地图'); await flush();
    expect(f.root.querySelector<HTMLElement>('.wm-panel')?.hidden).toBe(true);
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
  });
  it('opens drops without scrolling or appending page content and reuses the RO popup', async () => {
    const f = mount(); await f.api.open({ kind: 'map', id: 'prontera' });
    await f.api.open({ kind: 'monster', id: 1002 }); await flush();
    const panel = f.root.querySelector<HTMLElement>('.wm-panel')!;
    const map = f.root.querySelector('.wm-context');
    const monster = f.root.querySelector('.wm-monster-detail');
    const bodyText = f.root.querySelector('.wm-body')!.textContent;
    panel.scrollTop = 240;
    const drop = f.root.querySelector<HTMLButtonElement>('.wm-monster-detail .wm-card[data-kind="item"]')!;
    drop.click(); await flush();
    const popup = f.root.querySelector('.wm-item-window');
    expect(popup?.getAttribute('role')).toBe('dialog');
    expect(popup?.parentElement?.id).toBe('WorldMap');
    expect(f.root.activeElement).toBe(popup?.querySelector('.wm-item-window-close'));
    expect(panel.scrollTop).toBe(240);
    expect(f.root.querySelector('.wm-body')!.textContent).toBe(bodyText);
    expect(f.root.querySelector('.wm-context')).toBe(map);
    expect(f.root.querySelector('.wm-monster-detail')).toBe(monster);
    expect(popup?.querySelector<HTMLDetailsElement>('.wm-item-sources')?.open).toBe(false);
    expect([...popup!.querySelectorAll<HTMLSpanElement>('.wm-description span')].some(span => span.style.color === 'rgb(255, 0, 0)')).toBe(true);
    await f.api.open({ kind: 'item', id: 502 });
    expect(f.root.querySelector('.wm-item-window')).toBe(popup);
    expect(f.root.querySelectorAll('.wm-item-window')).toHaveLength(1);
    expect(popup?.querySelector('.wm-item-window-title')?.textContent).toBe('橙色药水');
    expect(panel.scrollTop).toBe(240);
    (popup!.querySelector('.wm-item-window-close') as HTMLButtonElement).click();
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    expect(f.root.activeElement).toBe(drop);
    expect(panel.scrollTop).toBe(240);
    expect(panel.hidden).toBe(false);
  });
  it('Escape closes only the item popup first and returns focus to its drop card', async () => {
    const f = mount(); await f.api.open({ kind: 'monster', id: 1002 });
    const drop = f.root.querySelector<HTMLButtonElement>('.wm-monster-detail .wm-card[data-kind="item"]')!;
    drop.click(); await flush();
    f.root.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    expect(f.root.activeElement).toBe(drop);
    expect(drop.getAttribute('aria-pressed')).toBe('false');
    expect(f.root.querySelector<HTMLElement>('.wm-panel')!.hidden).toBe(false);
    drop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(f.root.querySelector<HTMLElement>('.wm-panel')!.hidden).toBe(true);
  });
  it('cleans up item windows on navigation, monster inspection and component removal', async () => {
    const f = mount(); await f.api.open({ kind: 'item', id: 501 });
    await f.api.open({ kind: 'monster', id: 1039 });
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    expect(f.root.querySelector('.wm-monster-detail')?.textContent).toContain('巴风特');
    await f.api.open({ kind: 'item', id: 501 }); await f.api.open({ kind: 'map', id: 'prontera' });
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    await f.api.open({ kind: 'item', id: 501 }); await f.api.open({ kind: 'search' });
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    await f.api.open({ kind: 'item', id: 501 }); f.component.onRemove();
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
  });
  it('restores drop source clicks to monster details and expands spawn maps by default', async () => {
    const f = mount(); await f.api.open({ kind: 'map', id: 'prontera' });
    await f.api.open({ kind: 'monster', id: 1002 }); await f.api.open({ kind: 'item', id: 501 });
    f.root.querySelector<HTMLDetailsElement>('.wm-item-sources')!.open = true;
    f.root.querySelector<HTMLButtonElement>('.wm-item-sources .wm-card[data-id="1039"]')!.click(); await flush();
    expect(f.root.querySelector('.wm-item-window')).toBeNull();
    expect(f.root.querySelector('.wm-title')?.textContent).toBe('普隆德拉 · prontera');
    expect(f.root.querySelector('.wm-monster-detail')?.textContent).toContain('巴风特');
    expect(f.root.querySelector<HTMLDetailsElement>('.wm-locations')?.open).toBe(true);
    expect(f.root.querySelector('.wm-locations summary')?.textContent).toBe('出没地图 · 1');
    expect(f.root.querySelector('.wm-locations .wm-card[data-id="test_dun"]')).not.toBeNull();
    expect(f.teleport).not.toHaveBeenCalled();
  });
  it('drags by the title bar, clamps to the viewport, retains position and ends capture on cancellation', async () => {
    const f = mount(); await f.api.open({ kind: 'item', id: 501 });
    const area = f.root.querySelector('#WorldMap')!;
    const popup = f.root.querySelector<HTMLElement>('.wm-item-window')!;
    const header = f.root.querySelector<HTMLElement>('.wm-item-window-header')!;
    const rectangle = (width: number, height: number) => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) });
    const bounds = vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(rectangle(800, 600));
    vi.spyOn(popup, 'getBoundingClientRect').mockReturnValue(rectangle(280, 240));
    header.setPointerCapture = vi.fn(); header.hasPointerCapture = vi.fn(() => true); header.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number, target: HTMLElement = header, button = 0) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerId', { value: 1 }); target.dispatchEvent(event);
    };
    f.component.onResize(); const startX = parseFloat(popup.style.left), startY = parseFloat(popup.style.top);
    pointer('pointerdown', 100, 100); pointer('pointermove', 220, 180);
    expect(parseFloat(popup.style.left)).toBe(startX + 120); expect(parseFloat(popup.style.top)).toBe(startY + 80);
    expect(header.setPointerCapture).toHaveBeenCalledWith(1);
    pointer('pointerup', 220, 180); expect(popup.hasAttribute('data-dragging')).toBe(false);
    await f.api.open({ kind: 'item', id: 502 }); expect(parseFloat(popup.style.left)).toBe(startX + 120);
    pointer('pointerdown', 100, 100); pointer('pointermove', 9999, 9999);
    expect(popup.style.left).toBe('514px'); expect(popup.style.top).toBe('354px');
    pointer('pointercancel', 9999, 9999); pointer('pointermove', 0, 0);
    expect(popup.style.left).toBe('514px');
    bounds.mockReturnValue(rectangle(400, 300)); f.component.onResize();
    expect(popup.style.left).toBe('114px'); expect(popup.style.top).toBe('54px');
    pointer('pointerdown', 100, 100, header, 2); expect(popup.hasAttribute('data-dragging')).toBe(false);
    pointer('pointerdown', 100, 100, f.root.querySelector<HTMLElement>('.wm-item-window-close')!);
    expect(popup.hasAttribute('data-dragging')).toBe(false);
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); expect(popup.style.left).toBe('104px');
    f.click('关闭详情'); expect(f.root.querySelector('.wm-item-window')).toBeNull();
    document.defaultView!.dispatchEvent(new Event('resize'));
  });
  it('loads native item window skin and collection art through the shared image cache', async () => {
    const f = mount(); f.Client.loadFile.mockImplementation((path, done) => done('data:image/png;base64,' + path));
    await f.api.open({ kind: 'item', id: 501 }); await flush();
    expect(f.root.querySelector('.wm-item-window')?.hasAttribute('data-skinned')).toBe(true);
    const artwork = f.root.querySelector<HTMLImageElement>('.wm-item-collection')!;
    expect(artwork.src).toBe('data:image/png;base64,collection/red-potion.bmp');
    artwork.dispatchEvent(new Event('load')); expect(artwork.hidden).toBe(false);
    f.click('关闭详情'); await f.api.open({ kind: 'item', id: 501 }); await flush();
    for (const path of ['collection/red-potion.bmp', 'basic_interface/collection_bg.bmp', 'basic_interface/sys_close_off.bmp', 'basic_interface/sys_close_on.bmp']) {
      expect(f.Client.loadFile.mock.calls.filter(c => c[0] === path)).toHaveLength(1);
    }
  });
  it('keeps search term/type/page when returning from details', async () => {
    const f = mount(); await f.api.open({ kind: 'search' });
    const input = f.root.querySelector('input')!;
    input.value = '药水'; input.dispatchEvent(new Event('input'));
    expect(f.root.querySelector('.wm-body')?.textContent).toContain('找到 2 条结果');
    await f.api.open({ kind: 'item', id: 501 });
    expect(f.root.querySelector('input')).toBe(input);
    expect(f.root.querySelector('input')?.value).toBe('药水');
  });
  it('updates the large image to the selected floor and removes the locate action', async () => {
    const f = mount(); await f.api.open({ kind: 'map', id: 'prontera' });
    await f.api.open({ kind: 'map', id: 'test_dun' });
    expect(f.root.querySelector('.wm-map-image img')?.getAttribute('alt')).toBe('测试地下城地图大图');
    expect(f.root.querySelector('.wm-map-image')?.textContent).toContain('test_dun（地图图像暂缺）');
    expect(f.root.querySelector('.wm-body')?.textContent).not.toContain('在世界地图定位');
    expect(f.root.querySelector('.wm-body')?.textContent).toContain('巴风特');
  });
  it('prefers the native full-size minimap instead of enlarging the 60px overview tile', async () => {
    const f = mount();
    f.Client.loadFile.mockImplementation((path, done) => done('data:image/bmp;base64,' + path));
    await f.api.open({ kind: 'map', id: 'prontera' });
    expect(f.root.querySelector('.wm-map-image img')?.getAttribute('src')).toBe('data:image/bmp;base64,map/prontera.bmp');
    await f.api.open({ kind: 'map', id: 'test_dun' });
    expect(f.root.querySelector('.wm-map-image img')?.getAttribute('src')).toBe('data:image/bmp;base64,map/test_dun.bmp');
  });
  it('pages all matches instead of silently truncating and restores the page', async () => {
    const catalog = Object.fromEntries(Array.from({ length: 125 }, (_, i) => [5000 + i, { identifiedDisplayName: `测试道具${i}` }]));
    const f = mount(undefined, catalog); await f.api.open({ kind: 'search' });
    const input = f.root.querySelector('input')!; input.value = '测试道具'; input.dispatchEvent(new Event('input'));
    expect(f.root.querySelectorAll('.wm-card')).toHaveLength(60); f.click('下一页');
    expect(f.root.querySelector('.wm-page')?.textContent).toContain('2 / 3');
    await f.api.open({ kind: 'item', id: 5000 });
    expect(f.root.querySelector('.wm-page')?.textContent).toContain('2 / 3'); f.click('下一页');
    expect(f.root.querySelectorAll('.wm-search-results .wm-card')).toHaveLength(5);
  });
  it('keeps party map markers while switching regions', () => {
    const f = mount(); f.component.updatePartyMembers({ groupInfo: [{ AID: 22, state: 0, mapName: 'prontera.gat' }] });
    expect(f.root.querySelector('.wm-tile.party')?.getAttribute('data-map-id')).toBe('prontera');
    f.component.updatePartyMembers({ groupInfo: [] }); expect(f.root.querySelector('.wm-tile.party')).toBeNull();
  });
  it('returns to search in one step even after switching maps and opening details', async () => {
    const f = mount(); await f.api.open({ kind: 'search' });
    const input = f.root.querySelector('input')!; input.value = '波利'; input.dispatchEvent(new Event('input'));
    await f.api.open({ kind: 'map', id: 'prontera' });
    await f.api.open({ kind: 'map', id: 'test_dun' });
    await f.api.open({ kind: 'monster', id: 1039 }); await f.api.open({ kind: 'item', id: 501 });
    f.click('返回搜索'); await flush();
    expect(f.root.querySelector('input')?.value).toBe('波利');
    expect(f.root.querySelectorAll('.wm-inspector')).toHaveLength(0);
  });
  it('sends teleport once immediately for the selected floor without extra confirmation', async () => {
    const f = mount(); await f.api.open({ kind: 'map', id: 'test_dun' }); f.click('传送到此地图');
    expect(f.teleport).toHaveBeenCalledExactlyOnceWith('test_dun');
    expect(f.root.querySelector<HTMLElement>('.wm-panel')?.hidden).toBe(true);
  });
  it('retries after load failure', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(data);
    const f = mount(load); await f.api.open({ kind: 'monster', id: 1002 });
    expect(f.root.querySelector('.wm-title')?.textContent).toBe('资料加载失败');
    f.click('重试'); await flush(); expect(f.root.querySelector('.wm-monster-detail')?.textContent).toContain('波利 · Lv.1');
  });
  it('shows real portrait loader output on search cards and inline monster details', async () => {
    const f = mount(); await f.api.open({ kind: 'search' });
    const input = f.root.querySelector('input')!; input.value = '波利'; input.dispatchEvent(new Event('input')); await flush();
    expect(f.monsterPortrait).toHaveBeenCalledWith(1002);
    expect(f.root.querySelector('.wm-search-results .wm-portrait img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    (f.root.querySelector('.wm-search-results .wm-card') as HTMLButtonElement).click(); await flush();
    expect(f.root.querySelector('.wm-monster-detail .wm-portrait img')).not.toBeNull();
    (f.root.querySelector('.wm-monster-detail .wm-card[data-kind="item"]') as HTMLButtonElement).click(); await flush();
    expect(f.root.querySelector('.wm-item-detail')?.textContent).toContain('恢复 HP');
    expect(f.root.querySelector('input')).toBe(input);
  });
  it('shows cached item thumbnails in search, monster drops and the item popup', async () => {
    const f = mount();
    f.Client.loadFile.mockImplementation((path, done, fail) => { if (path === 'item/red-potion.bmp') done('data:image/png;base64,potion'); else fail?.(); });
    await f.api.open({ kind: 'search' });
    const input = f.root.querySelector('input')!; input.value = '红色药水'; input.dispatchEvent(new Event('input')); await flush();
    expect(f.root.querySelector('.wm-search-results .wm-item-icon')?.getAttribute('src')).toBe('data:image/png;base64,potion');
    await f.api.open({ kind: 'monster', id: 1002 });
    expect(f.root.querySelector('.wm-monster-detail .wm-item-icon')?.getAttribute('src')).toBe('data:image/png;base64,potion');
    await f.api.open({ kind: 'item', id: 501 });
    const icon = f.root.querySelector<HTMLImageElement>('.wm-description .wm-item-icon')!;
    expect(icon.src).toBe('data:image/png;base64,potion'); expect(icon.alt).toBe('红色药水缩略图'); expect(icon.hidden).toBe(false);
    icon.dispatchEvent(new Event('error')); expect(icon.hidden).toBe(true);
    expect(f.root.querySelector('.wm-description .wm-icon-fallback')?.textContent).toBe('图标暂缺');
    expect(f.root.querySelector('.wm-description')?.textContent).toContain('恢复 HP');
    expect(f.Client.loadFile.mock.calls.filter(c => c[0] === 'item/red-potion.bmp')).toHaveLength(1);
  });
  it('coalesces repeated image loads and reuses the result after closing the panel', async () => {
    const f = mount(); let resolve!: (url: string) => void;
    f.Client.loadFile.mockImplementation((path, done, fail) => { if (path === 'item/red-potion.bmp') resolve = done; else fail?.(); });
    await f.api.open({ kind: 'monster', id: 1002 });
    await f.api.open({ kind: 'item', id: 501 });
    expect(f.Client.loadFile.mock.calls.filter(c => c[0] === 'item/red-potion.bmp')).toHaveLength(1);
    resolve('data:image/png;base64,cached'); await flush();
    expect(f.root.querySelectorAll('.wm-item-icon[src="data:image/png;base64,cached"]')).toHaveLength(3);
    f.click('关闭详情'); await f.api.open({ kind: 'item', id: 501 });
    expect(f.Client.loadFile.mock.calls.filter(c => c[0] === 'item/red-potion.bmp')).toHaveLength(1);
    expect(f.root.querySelector('.wm-description .wm-item-icon')?.getAttribute('src')).toBe('data:image/png;base64,cached');
  });
  it('keeps data usable if a portrait fails and ignores detached portrait callbacks', async () => {
    const failed = mount(undefined, items, vi.fn().mockRejectedValue(new Error('missing')));
    await failed.api.open({ kind: 'map', id: 'prontera' }); await flush();
    expect(failed.root.querySelector('.wm-portrait')?.textContent).toBe('外貌暂缺');
    let resolve!: (value: string) => void;
    const f = mount(undefined, items, vi.fn(() => new Promise<string>(r => { resolve = r; })));
    await f.api.open({ kind: 'map', id: 'prontera' }); await flush();
    const portrait = f.root.querySelector('.wm-portrait')!;
    f.click('关闭详情'); resolve('data:image/png;base64,AAAA'); await flush();
    expect(portrait.querySelector('img')).toBeNull();
  });
  it('ignores stale requests after dismissing or removing the component', async () => {
    let resolve!: (value: typeof data) => void;
    const f = mount(vi.fn(() => new Promise(r => { resolve = r; })));
    const request = f.api.open({ kind: 'monster', id: 1002 }); f.click('关闭详情'); resolve(data); await request;
    expect(f.root.querySelector<HTMLElement>('.wm-panel')?.hidden).toBe(true);
    f.component.onRemove();
  });
  it('isolates input shortcuts and dismisses details with Escape', async () => {
    const f = mount(); await f.api.open({ kind: 'search' });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    f.root.querySelector('input')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(f.root.querySelector<HTMLElement>('.wm-panel')?.hidden).toBe(true);
  });
});
