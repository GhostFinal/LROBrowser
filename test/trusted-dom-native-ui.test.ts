// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLastroChatMapLinks } from '../scripts/lastro-chat-map-links.mjs';
import { setLastROAdjacentHTML, setLastROInnerHTML, setLastROOuterHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const originalShadowHTML = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'innerHTML');
// Extract the actual sink patch without importing its unrelated build-time
// asset loaders into Vitest's browser-like module environment.
const patchSource = readFileSync('scripts/patch-v2-runtime.mjs', 'utf8');
const patchFile = ts.createSourceFile('patch-v2-runtime.mjs', patchSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const patchNode = patchFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'patchTrustedTypesDomWrites');
if (!patchNode) throw new Error('Missing actual Trusted Types sink patch');
const patchTrustedTypesDomWrites = vm.runInNewContext(patchNode.getText(patchFile).replace(/^export\s+/, '') + '\npatchTrustedTypesDomWrites;', { ts }) as (source: string) => string;

function region(path: string) {
  const start = native.indexOf('//#region ' + path), end = native.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + path);
  return native.slice(start, end);
}
function parts(path: string) {
  const file = ts.createSourceFile(path, patchTrustedTypesDomWrites(region(path)), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = new Map<string, string[]>();
  function collect(key: string, node: ts.Node) { found.set(key, [...(found.get(key) ?? []), node.getText(file)]); }
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) collect(node.name.text, node);
    if (ts.isMethodDeclaration(node)) collect(node.name.getText(file), node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isFunctionExpression(node.right)) collect(node.left.getText(file), node.right);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return (name: string) => {
    const values = found.get(name);
    if (values?.length !== 1) throw new Error('Missing or duplicate native function: ' + name);
    return values[0]!;
  };
}
const gui = parts('src/UI/GUIComponent.js');
const dbParts = parts('src/DB/DBManager.js');
const compareParts = parts('src/UI/Components/ItemCompare/ItemCompare.js');
const skillParts = parts('src/UI/Components/SkillDescription/SkillDescription.js');
const navigationParts = parts('src/UI/Components/Navigation/Navigation.js');
const guildParts = parts('src/UI/Components/Guild/Guild.js');

const templates = Array.from(native.matchAll(/\/\/#region (src\/UI\/Components\/[^\r\n]+\.html\?raw)\r?\n([\s\S]*?)\/\/#endregion/g), match => {
  const file = ts.createSourceFile(match[1]!, match[2]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let html: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isStringLiteral(node.right)) html = node.right.text;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (html === undefined) throw new Error('Missing native template: ' + match[1]);
  return { path: match[1]!, html };
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'trustedTypes', { configurable: true, value: {
    createPolicy: (_name: string, rules: { createHTML(value: string): string }) => ({
      createHTML: (value: string) => ({ __trustedHTML: true, toString: () => rules.createHTML(value) }),
    }),
  } });
  for (const [prototype, original] of [[Element.prototype, originalInnerHTML], [ShadowRoot.prototype, originalShadowHTML]] as const) {
    Object.defineProperty(prototype, 'innerHTML', {
      configurable: true,
      get: original?.get,
      set(value: unknown) {
        if (!value || typeof value !== 'object' || !(value as { __trustedHTML?: boolean }).__trustedHTML) throw new TypeError('TrustedHTML required');
        original?.set?.call(this, String(value));
      },
    });
  }
});
afterEach(() => {
  if (originalInnerHTML) Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
  if (originalShadowHTML) Object.defineProperty(ShadowRoot.prototype, 'innerHTML', originalShadowHTML);
  Reflect.deleteProperty(globalThis, 'trustedTypes');
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function context(extra: Record<string, unknown> = {}) {
  return vm.createContext({ document, window, setLastROInnerHTML, setLastROOuterHTML, setLastROAdjacentHTML, ...extra });
}
function db() {
  const ctx = context();
  return vm.runInContext('class DB {' + ['formatItemDescription', 'formatMsgToHtml'].map(dbParts).join('\n') + '}\nDB;', ctx) as {
    formatItemDescription(value: unknown): string; formatMsgToHtml(value: string): string;
  };
}

describe('actual native UI construction with TrustedHTML enforcement', () => {
  it.each(templates)('prepares $path through the actual GUIComponent Shadow DOM method', template => {
    const init = vi.fn();
    const ctx = context({ _ensureDeps: vi.fn(), Common_default$1: ':host{display:block}' });
    const Component = vm.runInContext('class GUIComponent {' + gui('prepare') + gui('_prepare') + '}\nGUIComponent;', ctx);
    const component = new Component();
    Object.assign(component, { name: 'NativeFixture', _cssText: ':host{color:#333}', render: () => template.html,
      _processAllDataAttrs: vi.fn(), _createUIProxy: vi.fn(), _setupMouseMode: vi.fn(), init });
    expect(() => component.prepare()).not.toThrow();
    expect(component.__loaded).toBe(true);
    expect(component._host.isConnected).toBe(false);
    expect(component._shadow.querySelectorAll('style')).toHaveLength(2);
    expect(component._container.children.length).toBeGreaterThanOrEqual(template.html ? 1 : 0);
    expect(init).toHaveBeenCalledOnce();
  });

  it('keeps real ShadowRoot targets and contextual table and select fragments usable', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    expect(() => { shadow.innerHTML = '<span>blocked</span>'; }).toThrow('TrustedHTML required');
    setLastROInnerHTML(shadow, '<table><tbody><tr><td>名弓3</td></tr></tbody></table><select></select>');
    const row = shadow.querySelector('tr')!;
    setLastROInnerHTML(row, '<td><span>圣德芬翅膀</span></td>');
    const select = shadow.querySelector('select')!;
    setLastROInnerHTML(select, '<option value="1" selected>会长</option><option value="2">成员</option>');
    expect(row.cells[0]?.textContent).toBe('圣德芬翅膀');
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe('1');
  });
});

describe('actual native dynamic game UI under the HTML policy', () => {
  it('renders equipped item names, colored descriptions, options, ordinary cards and enchants', () => {
    const root = document.createElement('div');
    setLastROInnerHTML(root, templates.find(template => template.path.includes('/ItemCompare/'))!.html);
    const info = { identifiedDisplayName: '天龙之翼', identifiedResourceName: 'bow', slotCount: 2, identifiedDescriptionName: '^FF0000攻击：100^000000\n范围 < 9 格 & 对龙族增伤' };
    const Database = Object.assign(db(), {
      INTERFACE_PATH: 'data/texture/', getItemInfo: (id: number) => id === 1724 ? info : { identifiedDisplayName: id === 4834 ? '名弓Lv3' : '幸运卡片', identifiedResourceName: 'card' },
      getPreferredItemResourceName: () => 'bow', getPreferredItemDescription: () => info.identifiedDescriptionName,
      getItemName: () => '天龙之翼 [2] [名弓3]', getOptionName: () => '攻击力增加 %d%%',
    });
    const component = { getRoot: () => root };
    const requests: string[] = [];
    const ctx = context({ ItemCompare: component, DB: Database, ItemType_default: { WEAPON: 4, ARMOR: 5, SHADOWGEAR: 12, PETEGG: 7 },
      addEvent$1: vi.fn(), resize$4: vi.fn(), Client: { loadFile: (path: string, callback: (data: string) => void) => { requests.push(path); callback('data:image/png;base64,aGVsbG8='); } } });
    vm.runInContext(compareParts('_escapeHTML$5') + '\n' + compareParts('addCard$1') + '\nItemCompare.setItem = ' + compareParts('ItemCompare.setItem') + ';', ctx);
    ctx.ItemCompare.setItem({ ITID: 1724, IsIdentified: true, type: 4, Options: [{ index: 1, value: 5 }], slot: { card1: 4001, card2: 0, card3: 4834, card4: 0 } });
    expect(root.querySelector('.title')?.textContent).toBe('天龙之翼 [2] [名弓3]');
    expect(root.querySelector('.description-inner')?.textContent).toBe('攻击：100\n范围 < 9 格 & 对龙族增伤');
    expect(root.querySelector('.optionlist')?.textContent).toBe('攻击力增加 5%');
    expect(root.querySelectorAll('.cardlist .item')).toHaveLength(4);
    expect(root.querySelector('.cardlist .item[data-index="2"] .name')?.textContent).toBe('名弓Lv3');
    expect(requests.some(path => path.includes('collection/bow.bmp'))).toBe(true);
  });

  it('formats native skill descriptions and item substitutions without losing RO colors', () => {
    const ctx = context({ _allowedTags: new Set(['font', 'i', 'b']), DB: { getItemInfo: () => ({ identifiedDisplayName: '红色药水' }) } });
    vm.runInContext(skillParts('_formatROText'), ctx);
    const html = ctx._formatROText('^00FF00<b>恢复</b>^000000\n消耗 ^nItemID^501');
    const root = document.createElement('div');
    setLastROInnerHTML(root, html);
    expect(root.textContent).toBe('恢复消耗 红色药水');
    expect(root.querySelector('b')?.textContent).toBe('恢复');
    expect(root.querySelectorAll('br')).toHaveLength(1);
    expect(root.querySelector('span')?.style.color).toBe('rgb(0, 255, 0)');
  });

  it('renders native navigation search results and keeps their click handlers', () => {
    const root = document.createElement('div');
    setLastROInnerHTML(root, '<div class="content"></div>');
    const navigate = vi.fn();
    const Navigation = { getRoot: () => root, navigateToSearchResult: navigate };
    const ctx = context({ Navigation });
    vm.runInContext('Navigation.displaySearchResults = ' + navigationParts('Navigation.displaySearchResults') + ';', ctx);
    const result = { type: 'NPC', name: '卡普拉服务人员', mapName: 'prontera' };
    ctx.Navigation.displaySearchResults([result]);
    expect(root.querySelector('.result-name')?.textContent).toBe('卡普拉服务人员');
    root.querySelector<HTMLLIElement>('.result-item')!.click();
    expect(navigate).toHaveBeenCalledWith(result);
  });

  it('keeps rendered chat item and teleport links interactive without trusting ordinary chat text', () => {
    const rendered = document.createElement('div');
    const links = createLastroChatMapLinks({ setHtml: setLastROInnerHTML, showPrompt: () => undefined, teleport: vi.fn(), getMap: () => 'prontera' });
    const item = links.formatItemLink('<ITEMLINK>synthetic</ITEMLINK>', () => ({ name: '天龙之翼 [名弓3]' }));
    expect(item).not.toBeNull();
    links.render(rendered, item, true);
    expect(rendered.querySelector('.item-link')?.textContent).toContain('天龙之翼 [名弓3]');
    links.render(rendered, '<img src=x onerror=alert(1)>', false);
    expect(rendered.querySelector('img')).toBeNull();
    expect(rendered.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders real native guild position selectors and trusted raster emblems', () => {
    const root = document.createElement('div');
    setLastROInnerHTML(root, '<div class="content info"><div class="emblem_container"></div><div class="members"><span class="numMember"></span></div></div><div class="content members"><table><tbody></tbody></table></div>');
    const template = document.createElement('tr');
    template.className = 'MemberView';
    setLastROInnerHTML(template, '<td class="name"><span class="value"></span></td><td class="position"></td><td class="job"></td><td class="level"></td><td class="note"></td><td class="devotion"></td><td class="tax"></td>');
    const member = { AID: 1, GID: 2, GPositionID: 0, CurrentState: 1, CharName: '测试角色', Memo: '一起冒险', Job: 4009, Level: 99, MemberExp: 10, Sex: 1, entity: {} };
    const ctx = context({ Guild: {}, _root$13: () => root, _members: [], _memberViewTemplate: template, _positions: [{ positionID: 0, posName: '会长 & 管理' }],
      _totalExp: 10, _escapeHTML$3: (value: string) => value.replaceAll('&', '&amp;'), MonsterTable_default: { 4009: '超魔导师' }, SessionStorage_default: { isGuildMaster: true } });
    vm.runInContext('Guild.setMember = ' + guildParts('Guild.setMember') + ';\nGuild.setEmblem = ' + guildParts('Guild.setEmblem') + ';', ctx);
    ctx.Guild.setMember(member);
    ctx.Guild.setEmblem({ src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==' });
    expect(root.querySelector('select')?.textContent).toBe('会长 & 管理');
    expect(root.querySelector('.name .value')?.textContent).toBe('测试角色');
    expect(root.querySelector<HTMLElement>('.emblem_container')?.style.backgroundImage).toContain('data:image/gif;base64,');
  });
});
