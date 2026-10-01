// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeUiState } from '../scripts/lastro-ui-state.mjs';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
function region(source: string, suffix: string) {
  const start = source.indexOf('//#region src/UI/Components/Storage/StorageV3/StorageFilter.' + suffix);
  const end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native StorageFilter ' + suffix);
  return source.slice(start, end + '//#endregion'.length);
}
const nativeRegion = region(native, 'js');
const patched = patchRuntimeUiState(nativeRegion);
const file = ts.createSourceFile('StorageFilter.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const statements: string[] = [];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && ['StorageFilter', 'lastroUiWindowAppend'].includes(node.name?.text ?? '')) statements.push(node.getText(file));
  if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
    const left = node.expression.left.getText(file);
    if (['StorageFilter.prototype', 'StorageFilter.prototype.constructor', 'StorageFilter.prototype.init', 'StorageFilter.prototype.onAppend', 'StorageFilter.prototype.resizeHeight', 'StorageFilter.prototype.onResize'].includes(left)) statements.push(node.getText(file));
  }
  ts.forEachChild(node, collect);
}
collect(file);
// The helper is inserted at GUIComponent's region, which is absent from this narrow fixture.
const helperFile = ts.createSourceFile('UiState.js', readFileSync('scripts/lastro-ui-state.mjs', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const helper = helperFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'lastroUiWindowAppend')?.getText(helperFile).replace(/^export\s+/, '');
if (!helper) throw new Error('Missing production UI state helper');
const templateFile = ts.createSourceFile('StorageFilter.html', region(native, 'html?raw'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let template = '';
function findTemplate(node: ts.Node) {
  if (ts.isBinaryExpression(node) && node.left.getText(templateFile) === 'StorageFilter_default$1' && ts.isStringLiteral(node.right)) template = node.right.text;
  ts.forEachChild(node, findTemplate);
}
findTemplate(templateFile);
if (!template) throw new Error('Missing native StorageFilter template');

interface Preference {
  x: number; y: number; height: number; _key: string;
  save(): void;
  _lastroWindow?: { left?: number; top?: number; height?: number };
}
interface Filter {
  _host: HTMLElement; _preferences: Preference; _list: unknown[]; _currentTabId: number;
  onCloseCallback: (() => void) | null;
  init(): void; onAppend(): void; onRemove(): void; onResize(): void; resizeHeight(height: number): void;
  getRoot(): ShadowRoot; append(): void; remove(): void;
}
function fixture(saved = new Map<string, Record<string, unknown>>()) {
  const writes = vi.fn();
  const mouse = { screen: { x: 0, y: 0 } };
  class GUIComponent {
    _host = document.createElement('div');
    _shadow = this._host.attachShadow({ mode: 'open' });
    _isDraggable = false;
    magnet = {};
    constructor(public name: string) {
      this._host.style.width = '220px';
      this._host.style.height = '164px';
      this._host.style.left = '150px';
      this._host.style.top = '150px';
      Object.defineProperties(this._host, {
        offsetWidth: { get: () => this._host.style.display === 'none' ? 0 : parseFloat(this._host.style.width) },
        offsetHeight: { get: () => this._host.style.display === 'none' ? 0 : parseFloat(this._host.style.height) },
        offsetLeft: { get: () => parseFloat(this._host.style.left) },
        offsetTop: { get: () => parseFloat(this._host.style.top) },
      });
      this._host.getBoundingClientRect = () => {
        const x = this._host.offsetLeft, y = this._host.offsetTop;
        return { x, y, left: x, top: y, right: x + this._host.offsetWidth, bottom: y + this._host.offsetHeight, width: this._host.offsetWidth, height: this._host.offsetHeight, toJSON() {} };
      };
      const nativeTemplate = document.createElement('template');
      setLastROInnerHTML(nativeTemplate, template);
      this._shadow.appendChild(nativeTemplate.content.cloneNode(true));
      const content = this._shadow.querySelector<HTMLElement>('.content')!;
      Object.defineProperty(content, 'offsetHeight', { get: () => this._host.style.display === 'none' ? 0 : parseFloat(content.style.height) });
    }
    getRoot() { return this._shadow; }
    draggable() { this._isDraggable = true; }
    ui = {
      hide: () => { this._host.style.display = 'none'; },
      show: () => { this._host.style.display = ''; },
    };
    append() { document.body.appendChild(this._host); (this as unknown as Filter).onAppend(); }
    remove() { (this as unknown as Filter).onRemove(); this._host.remove(); }
  }
  const FilterClass = runInNewContext(helper + '\n' + statements.join('\n') + '\nStorageFilter;', {
    GUIComponent, StorageFilter_default: '', StorageFilter_default$1: template,
    Preferences: { get(key: string, defaults: object) {
      const pref = Object.assign({}, defaults, saved.get(key), { _key: key }) as unknown as Preference;
      pref.save = () => {
        const data = Object.fromEntries(Object.entries(pref).filter(([key]) => key !== 'save'));
        saved.set(key, JSON.parse(JSON.stringify(data)) as Record<string, unknown>); writes(key, data);
      };
      return pref;
    } },
    Renderer: { width: window.innerWidth, height: window.innerHeight }, Mouse: mouse,
    window, document, setInterval, clearInterval,
  }) as new (tab: number) => Filter;
  return { create(tab = 0) { const filter = new FilterClass(tab); filter.init(); filter.append(); return filter; }, writes, saved, mouse };
}
function mouseup() {
  const event = new MouseEvent('mouseup', { bubbles: true, button: 0 });
  Object.defineProperty(event, 'which', { value: 1 });
  window.dispatchEvent(event);
}
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('native StorageFilter window persistence', () => {
  it('binds the prototype append to the constructor preference without clearing native items', () => {
    const f = fixture(), filter = f.create(2), close = vi.fn();
    filter.onCloseCallback = close;
    filter._list.push({ index: 4 }); filter._currentTabId = 2;
    const item = document.createElement('div'); filter.getRoot().querySelector('.content')!.appendChild(item);
    filter.resizeHeight(7); mouseup();
    expect(f.saved.get('StorageFilter_2')?.height).toBe(7);
    expect(filter._host.style.height).toBe('260px');
    expect(filter._list).toHaveLength(1);
    expect(item.isConnected).toBe(true); expect(close).not.toHaveBeenCalled();
    filter.remove();
    expect(filter._list).toHaveLength(0); expect(filter._currentTabId).toBe(-1);
    expect(filter.getRoot().querySelector('.content')!.childElementCount).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('persists a real native resize drag before closing and restores both height and position', () => {
    vi.useFakeTimers();
    const f = fixture(), filter = f.create(1);
    f.mouse.screen.y = filter._host.offsetTop + 36 + 9 * 32;
    filter.onResize(); vi.advanceTimersByTime(30); mouseup();
    filter._host.style.left = '420px'; filter._host.style.top = '80px'; mouseup();
    expect(f.saved.get('StorageFilter_1')?.height).toBe(9);
    filter.remove();
    const reopened = fixture(f.saved).create(1);
    expect(reopened._host.style.height).toBe('324px');
    expect(reopened.getRoot().querySelector<HTMLElement>('.content')!.style.height).toBe('288px');
    expect(reopened._host.style.left).toBe('420px'); expect(reopened._host.style.top).toBe('80px');
  });

  it('keeps logical grid height when the native host is hidden during pagehide and removal', () => {
    const f = fixture(), filter = f.create(); filter.resizeHeight(10); mouseup();
    filter._host.style.display = 'none'; window.dispatchEvent(new Event('pagehide'));
    expect(filter._host.offsetHeight).toBe(0); expect(f.saved.get('StorageFilter_0')?.height).toBe(10);
    filter.remove(); expect(f.saved.get('StorageFilter_0')?.height).toBe(10);
    expect(fixture(f.saved).create()._host.style.height).toBe('356px');
  });

  it('stores per-tab window heights independently and clamps through the native resize method', () => {
    const f = fixture(), first = f.create(0), second = f.create(3);
    first.resizeHeight(100); second.resizeHeight(-1); mouseup();
    expect(f.saved.get('StorageFilter_0')?.height).toBe(10);
    expect(f.saved.get('StorageFilter_3')?.height).toBe(4);
  });

  it('disposes a removed dynamic filter so later pagehide cannot save stale window state', () => {
    const f = fixture(), filter = f.create(4);
    filter.resizeHeight(8); mouseup(); filter.remove(); f.writes.mockClear();
    filter._preferences.height = 5;
    window.dispatchEvent(new Event('pagehide'));
    expect(f.writes).not.toHaveBeenCalled();
    expect(f.saved.get('StorageFilter_4')?.height).toBe(8);
  });

  it('rejects a drifted StorageFilter append or resize anchor while unrelated fixtures remain unchanged', () => {
    expect(() => patchRuntimeUiState(nativeRegion.replace('StorageFilter.prototype.onAppend', 'StorageFilter.prototype.renamedAppend'))).toThrow('anchor:ui-state:storage-filter');
    expect(() => patchRuntimeUiState(nativeRegion.replace('height = Math.min(Math.max(height, 4), 10);', 'height = Math.min(Math.max(height, 4), 11);'))).toThrow('anchor:ui-state:storage-filter-height');
    expect(patchRuntimeUiState('const unrelated = true;')).toBe('const unrelated = true;');
  });
});
