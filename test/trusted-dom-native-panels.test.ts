// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLastROAdjacentHTML, setLastROInnerHTML, setLastROOuterHTML } from '../src/runtime/lastro-trusted-dom.mjs';

// Evaluate the production transform alone: importing the build entry point in
// jsdom would also initialize unrelated file-URL based skill-table tooling.
const patchFile = ts.createSourceFile('patch-v2-runtime.mjs', readFileSync('scripts/patch-v2-runtime.mjs', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const patchFunction = patchFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'patchTrustedTypesDomWrites');
if (!patchFunction) throw new Error('Missing native HTML sink transform');
const patchTrustedTypesDomWrites = vm.runInNewContext('(' + patchFunction.getText(patchFile).replace(/^export\s+/, '') + ')', { ts }) as (source: string) => string;

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const guiStart = native.indexOf('//#region src/UI/GUIComponent.js');
const guiRegion = native.slice(guiStart, native.indexOf('//#endregion', guiStart));
const guiFile = ts.createSourceFile('GUIComponent.js', guiRegion, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let guiClass: string | undefined;
function findGUI(node: ts.Node) {
  if (ts.isBinaryExpression(node) && node.left.getText(guiFile) === 'GUIComponent' && ts.isClassExpression(node.right)) {
    if (guiClass) throw new Error('Duplicated native GUIComponent');
    guiClass = node.right.getText(guiFile);
  }
  ts.forEachChild(node, findGUI);
}
findGUI(guiFile);
if (!guiClass) throw new Error('Missing native GUIComponent');
const patchedGUI = patchTrustedTypesDomWrites('var GUIComponent = ' + guiClass + ';');

interface CardData {
  data: Record<number, { enable: number; data: Record<number, { cards: number[]; recharge: number[]; activate: number }> }>;
}
interface CardComponent {
  __loaded: boolean;
  _host: HTMLElement;
  _data: CardData;
  _tab: number;
  _level: number;
  _page: number;
  _totalPages: number;
  prepare(): void;
  append(): void;
  getRoot(): ShadowRoot;
  renderCards(): void;
  switchTab(tab: number): void;
  commitSearch(): void;
}

function loadModule(source: string, context: vm.Context): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  context.exports = exports;
  vm.runInContext('(function (exports, require) {\n' + code + '\n})(exports, require);', context);
  return exports;
}

function cardFixture() {
  vi.useFakeTimers();
  const Client = { loadFile: vi.fn(), loadFiles: vi.fn() };
  const DB = {
    INTERFACE_PATH: 'data/texture/ui/',
    getMessage: () => '',
    getItemInfo: (id: number) => ({ identifiedDisplayName: `测试卡片 ${id}` }),
  };
  const html = { setLastROAdjacentHTML, setLastROInnerHTML, setLastROOuterHTML };
  const context = vm.createContext({
    document, window, HTMLElement, Event, CustomEvent, MutationObserver, console,
    setTimeout, clearTimeout, _ensureDeps: () => Promise.resolve(),
    _Client: Client, _DB: DB, _Cursor: null, _EntityManager: null, _ScrollBar: null,
    _Renderer: { width: 800, height: 600 }, Common_default$1: '',
    MouseMode: { CROSS: 0, STOP: 1, FREEZE: 2 }, Mouse: { intersect: true },
    SessionStorage_default: {}, UI_default: { windowmagnet: false }, _snapCache: [], CSS_NUMBER: {},
    require: (specifier: string) => {
      if (specifier === './lastro-trusted-dom.mjs') return html;
      throw new Error('Unexpected native panel dependency: ' + specifier);
    },
  });
  const gui = loadModule(patchedGUI + '\nexports.GUIComponent = GUIComponent;', context);
  const data = loadModule(readFileSync('vendor/v2/lastro-card-collection.mjs', 'utf8'), context);
  const ui = loadModule(patchTrustedTypesDomWrites(readFileSync('vendor/v2/lastro-card-collection-ui.mjs', 'utf8')), context);
  const create = ui.createCardCollectionComponent as (deps: Record<string, unknown>) => CardComponent;
  const component = create({
    ...data, GUIComponent: gui.GUIComponent, Client, DB,
    Network: { sendPacket: vi.fn() }, PACKET: {}, Configs: { get: () => 5 },
  });
  return { component, Client };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('packaged native panels through the real HTML boundary', () => {
  it('accepts complete static fragments in every external runtime module', () => {
    const extra = JSON.parse(readFileSync('config/core-asset-roots.json', 'utf8')) as { runtimeFiles: string[] };
    const files = [
      ...readdirSync('vendor/v2').filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(name => path.join('vendor/v2', name)),
      ...extra.runtimeFiles.filter(name => name.endsWith('.mjs')),
    ];
    const rejected: Array<{ file: string; line: number; error: string }> = [];
    let count = 0;
    for (const filename of files) {
      const source = readFileSync(filename, 'utf8');
      const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function visit(node: ts.Node) {
        if (ts.isStringLiteralLike(node) && /^\s*<[a-z]/i.test(node.text) && node.text.includes('</')) {
          count++;
          try { setLastROInnerHTML(document.createElement('div'), node.text); }
          catch (error) { rejected.push({ file: filename, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, error: String(error) }); }
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
    expect(count).toBeGreaterThanOrEqual(5);
    expect(rejected).toEqual([]);
  });

  it('prepares and initializes the actual CardConnection2 panel before game status hooks', () => {
    const { component, Client } = cardFixture();
    expect(() => component.prepare()).not.toThrow();
    const root = component.getRoot();
    expect(component.__loaded).toBe(true);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('卡片典藏');
    expect(root.querySelector('aside .cc-nav')?.children).toHaveLength(8);
    expect(root.querySelector('footer [data-status]')?.textContent).toBe('就绪');
    expect(root.querySelectorAll('.slot-empty')).toHaveLength(8);
    expect(root.querySelector('.deck-rules')?.textContent).toContain('卡组最多添加 8 张卡片');
    expect(component._host.isConnected).toBe(false);
    expect(Client.loadFile).not.toHaveBeenCalled();
  });

  it('renders live deck, charged cards, all categories and search pagination with packaged DOM helpers', () => {
    const { component } = cardFixture();
    component.prepare();
    component.append();
    const root = component.getRoot();
    const id = component._data.data[1]!.data[1]!.cards[0]!;
    component._data.data[0]!.data[1]!.cards[0] = id;
    component._data.data[0]!.enable = 1;
    component._data.data[0]!.data[1]!.activate = 1;
    component._data.data[2]!.data[1]!.recharge[0] = 1;
    component.renderCards();
    expect(root.querySelector('.slot-grid .card .nm')?.textContent).toBe(`测试卡片 ${id}`);
    expect(root.querySelector('.card-grid [data-card-action="add-deck"]')).not.toBeNull();
    expect(root.querySelectorAll('.meta-chip.on')).toHaveLength(2);
    for (let tab = 1; tab < 8; tab++) {
      expect(() => component.switchTab(tab)).not.toThrow();
      expect(root.querySelectorAll('.card-grid .card')).toHaveLength(8);
      expect(root.querySelector('.cat-tip')?.textContent).toContain('8 张卡片全部充能');
      expect(root.querySelector('[data-pages]')?.textContent).toContain('第 1 /');
    }
    const search = root.querySelector<HTMLInputElement>('[data-search]')!;
    search.value = '测试卡片';
    component.commitSearch();
    expect(root.querySelectorAll('.card-grid .card')).toHaveLength(16);
    expect(component._totalPages).toBeGreaterThan(1);
    expect(root.querySelector<HTMLButtonElement>('[data-page-action="prev"]')?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-page-action="next"]')!.click();
    expect(component._page).toBe(2);
    search.value = '没有匹配的卡片';
    component.commitSearch();
    expect(root.querySelector('.empty-box')?.textContent).toContain('没有找到与');
    expect(root.querySelector('.empty-box b')?.textContent).toBe('没有匹配的卡片');
  });
});
