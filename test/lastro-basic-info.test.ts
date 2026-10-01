// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchRuntimeBasicInfoLayout } from '../scripts/lastro-basic-info.mjs';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const patched = patchRuntimeBasicInfoLayout(native);
const versions = [1, 3, 4, 5];
function region(source: string, path: string) {
  const marker = '//#region src/UI/Components/BasicInfo/' + path;
  const start = source.indexOf(marker), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native BasicInfo fixture: ' + path);
  return source.slice(start, end + '//#endregion'.length);
}
function parseRegion(source: string, version: number, kind: string) {
  return ts.createSourceFile('BasicInfo.js', region(source, `BasicInfoV${version}/BasicInfoV${version}.${kind}`), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}
function template(source: string, version: number, kind: 'html' | 'css') {
  const ast = parseRegion(source, version, kind + '?raw');
  const literals: ts.StringLiteral[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === `BasicInfoV${version}_default$${kind === 'html' ? 2 : 1}` && ts.isStringLiteral(node.right)) literals.push(node.right);
    ts.forEachChild(node, visit);
  }
  visit(ast); if (literals.length !== 1) throw new Error('Changed native BasicInfo string');
  return literals[0]!.text;
}
const commonAst = ts.createSourceFile('BasicInfoCommon.js', region(native, 'BasicInfoCommon.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const factory = commonAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createBasicInfo')?.getText(commonAst);
if (!factory) throw new Error('Missing native BasicInfo factory');
function configSource(version: number) {
  const ast = parseRegion(native, version, 'js');
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createBasicInfo') calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast); if (calls.length !== 1 || calls[0]!.arguments.length !== 1) throw new Error('Changed native BasicInfo configuration');
  return calls[0]!.arguments[0]!.getText(ast);
}
const configurations = new Map(versions.map(version => [version, configSource(version)]));
const originalTemplates = new Map(versions.map(version => [version, template(native, version, 'html')]));
const templates = new Map(versions.map(version => [version, template(patched, version, 'html')]));
const styles = new Map(versions.map(version => [version, template(patched, version, 'css')]));
function fragment(html: string) {
  const container = document.createElement('template'); setLastROInnerHTML(container, html); return container.content;
}
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
function declarations(css: string) {
  const rules = new Map<string, Record<string, string>>();
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1]!.split(',')) {
      const values = rules.get(selector.trim()) ?? {};
      for (const declaration of match[2]!.split(';')) {
        const colon = declaration.indexOf(':'); if (colon < 0) continue;
        values[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
      }
      rules.set(selector.trim(), values);
    }
  }
  return rules;
}

interface BasicInfo {
  _host: HTMLElement;
  getRoot(): ShadowRoot;
  render(): string;
  init(): void;
  onAppend(): void;
  onRemove(): void;
  toggleMode(): void;
  update(type: string, value: string | number, maximum?: number): void;
}
function fixture(version: number, reduce = false) {
  const preference = { reduce, save: vi.fn() };
  const preferences = vi.fn((_key: string, defaults: object) => Object.assign({}, defaults, preference));
  const session = { zeny: 0 };
  const assets: string[] = [];
  const windows = Object.fromEntries(['item', 'info', 'equip', 'skill', 'option', 'party', 'guild', 'chat', 'map', 'card', 'bank', 'quest', 'mail', 'navigation', 'attendance', 'achievment', 'repute'].map(name => [name, { toggle: vi.fn() }]));
  class GUIComponent {
    _host = document.createElement('div');
    _root = this._host.attachShadow({ mode: 'open' });
    magnet = { TOP: false, BOTTOM: false, LEFT: false, RIGHT: false };
    draggable = vi.fn();
    constructor(public name: string, public cssText: string) {}
    getRoot() { return this._root; }
  }
  const context = {
    GUIComponent, UIManager: { addComponent: (component: unknown) => component },
    Preferences: { get: preferences }, Renderer: { width: 800, height: 600 }, SessionStorage_default: session,
    DB: { INTERFACE_PATH: '' }, Client: { loadFile: (path: string, done: (url: string) => void) => { assets.push(path); done('data:image/bmp;base64,AA=='); } },
    MonsterTable_default: { 42: '超级魔导师', 43: '骑士' }, installLastROCardMenuButton: vi.fn(),
    InventoryController: { getUI: () => windows.item }, EquipmentController: { getUI: () => windows.equip },
    WinStatsController: { getUI: () => windows.info }, Controller$4: { getUI: () => windows.skill },
    Escape_default: { ui: windows.option }, controller: { ...windows.party, getUI: () => windows.party },
    Guild_default: windows.guild, ChatRoomCreate_default: windows.chat, WorldMap_default: windows.map,
    CardConnection2: windows.card, Bank_default: windows.bank, Controller$3: { getUI: () => windows.quest },
    Rodex_default: windows.mail, Navigation_default: windows.navigation, CheckAttendance_default: windows.attendance,
    Achievement_default: windows.achievment, Reputation_default: windows.repute,
    Configs: { get: () => true }, PacketVerManager_default: { value: 20200101 },
    [`BasicInfoV${version}_default$1`]: styles.get(version), [`BasicInfoV${version}_default$2`]: templates.get(version),
  };
  const result = runInNewContext(`${factory}\nconst config = ${configurations.get(version)};\n({ component: createBasicInfo(config), config });`, context) as {
    component: BasicInfo; config: { buttonsEvent?: string; buttonsSelector?: string; toggleButtonsEvent?: string; hasToolbarToggle?: boolean; topbarDblClick?: boolean; barScale: number };
  };
  const component = result.component, root = component.getRoot();
  root.append(fragment(component.render())); document.body.append(component._host); component.init(); component.onAppend();
  return { component, root, config: result.config, preference, preferences, session, assets, windows };
}
afterEach(() => document.body.replaceChildren());

describe('scoped native BasicInfo layout', () => {
  it('leaves V0 and all executable update, toolbar and event code byte-for-byte', () => {
    for (const kind of ['html?raw', 'css?raw', 'js']) expect(region(patched, `BasicInfoV0/BasicInfoV0.${kind}`)).toBe(region(native, `BasicInfoV0/BasicInfoV0.${kind}`));
    const normalize = (source: string) => source.replace(/\/\/#region src\/UI\/Components\/BasicInfo\/BasicInfoV([1345])\/BasicInfoV\1\.(?:html|css)\?raw\r?\n[\s\S]*?\/\/#endregion/g, (_region, version) => `BASIC_INFO_TEMPLATE_${version}`);
    expect(normalize(patched)).toBe(normalize(native));
  });

  it.each(versions)('preserves every real-time field and original native artwork/control for V%s', version => {
    const before = fragment(originalTemplates.get(version)!), after = fragment(templates.get(version)!);
    const fields = ['name_value', 'job_value', 'blvl_value', 'jlvl_value', 'hp_value', 'hp_max_value', 'hp_perc', 'sp_value', 'sp_max_value', 'sp_perc', 'bexp_value', 'bexp', 'jexp', 'weight_value', 'weight_total', 'weight', 'zeny_value'];
    if (version === 5) fields.push('ap_value', 'ap_max_value', 'ap_perc', 'ap_bar');
    for (const field of fields) expect(after.querySelectorAll('.' + field).length).toBe(before.querySelectorAll('.' + field).length);
    expect(after.querySelector(`#BasicInfoV${version}`)?.getAttribute('data-background')).toBe(before.querySelector(`#BasicInfoV${version}`)?.getAttribute('data-background'));
    expect(after.querySelector('.topbar')?.outerHTML).toBe(before.querySelector('.topbar')?.outerHTML);
    expect(after.querySelector('.buttons')?.outerHTML).toBe(before.querySelector('.buttons')?.outerHTML);
    expect([...after.querySelectorAll('.toggle_btns')].map(node => node.outerHTML)).toEqual([...before.querySelectorAll('.toggle_btns')].map(node => node.outerHTML));
    expect(text(after.querySelector('.large .blvl'))).toBe('BaseLv.'); expect(text(after.querySelector('.large .jlvl'))).toBe('JobLv.');
  });

  it.each(versions)('uses 12px regular text and a flow-sized host with a left-aligned truncating footer for V%s', version => {
    const rules = declarations(styles.get(version)!), id = '#BasicInfoV' + version;
    expect(rules.get(':host')?.height).toBe('auto'); expect(rules.get(id)?.position).toBe('relative');
    expect(rules.get(id)?.['font-size']).toBe('12px'); expect(rules.get(id)?.['font-weight']).toBe('400');
    expect(rules.get(id + '.small .large')?.display).toBe('none'); expect(rules.get(id + '.large .small')?.display).toBe('none');
    const footer = rules.get(id + ' .large .extra');
    expect(footer?.['text-align']).toBe('left'); expect(footer?.overflow).toBe('hidden');
    expect(footer?.['text-overflow']).toBe('ellipsis'); expect(footer?.['white-space']).toBe('nowrap');
    expect(footer?.width).toBe('auto'); expect(footer?.right).not.toMatch(/^-/);
  });
});

describe('real BasicInfo factory updates with the patched markup', () => {
  it.each(versions)('synchronizes expanded and folded identity, gauges, experience, money and dangerous weight in V%s', version => {
    const f = fixture(version);
    for (const [type, value, maximum] of [['name', '长名字角色'], ['job', 42], ['blvl', 99], ['jlvl', 70], ['hp', 55, 100], ['sp', 12, 80], ['bexp', 123, 400], ['jexp', 100, 100], ['weight', 42420, 47090], ['zeny', 60480579]] as const) f.component.update(type, value, maximum);
    for (const [field, expected] of Object.entries({ name_value: '长名字角色', job_value: '超级魔导师', blvl_value: '99', jlvl_value: '70', hp_value: '55', hp_max_value: '100', hp_perc: '55%', sp_value: '12', sp_max_value: '80', sp_perc: '15%', bexp_value: '30.7%', weight_value: '4242', weight_total: '4709', zeny_value: '60,480,579' })) {
      const elements = [...f.root.querySelectorAll('.' + field)]; expect(elements.length).toBeGreaterThan(0);
      elements.forEach(node => expect(text(node)).toBe(expected));
    }
    expect(f.root.querySelector<HTMLElement>('.bexp > div')?.style.width).toBe('30%');
    expect(f.root.querySelector<HTMLElement>('.jexp > div')?.style.width).toBe('100%');
    expect(f.root.querySelector('.bexp')?.getAttribute('title')).toBe('30.8%');
    expect(f.root.querySelector<HTMLElement>('.hp_bar_middle')?.style.width).toBe(Math.floor(55 * f.config.barScale) + 'px');
    expect(f.assets).toContain('basic_interface/gzered_mid.bmp');
    expect(f.root.querySelector<HTMLElement>('.weight')?.style.color).toBe('red');
    expect(f.root.querySelector('.weight')?.getAttribute('title')).toBe('90.1%'); expect(f.session.zeny).toBe(60480579);
    expect(text(f.root.querySelector('.extra'))).toBe('负重: 4242 / 4709 Zeny: 60,480,579');
    f.component.update('weight', 100, 47090); expect(f.root.querySelector<HTMLElement>('.weight')?.style.color).toBe('');
    f.component.update('zeny', 0); expect(text(f.root.querySelector('.zeny_value'))).toBe('0'); expect(f.session.zeny).toBe(0);
    f.component.update('bexp', 0, 0); expect(f.root.querySelector<HTMLElement>('.bexp')?.style.display).toBe('none');
    f.component.update('bexp', 400, 400); expect(f.root.querySelector<HTMLElement>('.bexp')?.style.display).toBe('');
    expect(f.root.querySelector<HTMLElement>('.bexp > div')?.style.width).toBe('100%');
  });

  it.each(versions)('keeps both views current through repeated collapse/expand and native onAppend in V%s', version => {
    const f = fixture(version, true), inner = f.root.querySelector('#BasicInfoV' + version)!;
    expect(inner.classList.contains('small')).toBe(true);
    for (let cycle = 0; cycle < 4; cycle++) {
      f.component.update('hp', 10 + cycle, 100); f.component.update('name', '角色' + cycle); f.component.update('job', 43);
      f.component.toggleMode();
      expect(inner.classList.contains('large')).toBe(cycle % 2 === 0); expect(inner.classList.contains('small')).toBe(cycle % 2 !== 0);
      expect([...f.root.querySelectorAll('.hp_value')].map(text)).toEqual([String(10 + cycle), String(10 + cycle)]);
      expect([...f.root.querySelectorAll('.name_value')].map(text)).toEqual(['角色' + cycle, '角色' + cycle]);
    }
    f.component.onRemove(); expect(f.preference.save).toHaveBeenCalledOnce();
    f.component.onAppend(); expect(inner.classList.contains('small')).toBe(true);
    f.component.update('name', '<img src=x onerror=alert(1)>');
    expect(f.root.querySelector('.name_value img')).toBeNull(); expect(text(f.root.querySelector('.name_value'))).toBe('<img src=x onerror=alert(1)>');
  });

  it.each(versions)('retains the original collapse button and item toolbar event in V%s', version => {
    const f = fixture(version), inner = f.root.querySelector('#BasicInfoV' + version)!;
    f.root.querySelector('.topbar .right')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(inner.classList.contains('small')).toBe(true);
    const item = f.root.querySelector('.buttons .item, .buttons #item')!;
    item.dispatchEvent(new MouseEvent(f.config.buttonsEvent ?? 'mousedown', { bubbles: true }));
    expect(f.windows.item!.toggle).toHaveBeenCalledOnce();
    if (f.config.topbarDblClick) {
      f.root.querySelector('.topbar')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(inner.classList.contains('large')).toBe(true);
    }
    if (f.config.hasToolbarToggle) {
      const open = f.root.querySelector<HTMLElement>('.btn_open')!, close = f.root.querySelector<HTMLElement>('.btn_close')!, buttons = f.root.querySelector<HTMLElement>('.buttons')!;
      close.dispatchEvent(new MouseEvent(f.config.toggleButtonsEvent ?? 'mousedown', { bubbles: true }));
      expect(buttons.style.display).toBe('none'); expect(open.style.display).toBe(''); expect(close.style.display).toBe('none');
      open.dispatchEvent(new MouseEvent(f.config.toggleButtonsEvent ?? 'mousedown', { bubbles: true })); expect(buttons.style.display).toBe('');
    }
  });

  it('renders folded V4 as Lv/base job, Lv/job and Exp without redundant gauge periods', () => {
    const f = fixture(4, true);
    f.component.update('blvl', 99); f.component.update('jlvl', 70); f.component.update('job', 42); f.component.update('bexp', 18, 100);
    expect(text(f.root.querySelector('.small .line2'))).toBe('Lv.99 超级魔导师 / Lv.70 / Exp.18%');
    expect(text(f.root.querySelector('.small .line3'))).toMatch(/^HP /); expect(text(f.root.querySelector('.small'))).not.toMatch(/\b(?:HP|SP|AP)\./);
  });

  it('preserves folded V5 identity/HP+EXP/SP+AP and all AP updates through toggles', () => {
    const f = fixture(5, true);
    f.component.update('name', '角色甲'); f.component.update('job', 42); f.component.update('blvl', 99); f.component.update('jlvl', 70);
    f.component.update('hp', 55, 100); f.component.update('sp', 12, 80); f.component.update('ap', 7, 10); f.component.update('bexp', 18, 100);
    expect(text(f.root.querySelector('.small .line2'))).toBe('Lv.99 超级魔导师 / Lv.70');
    expect(text(f.root.querySelector('.small .line3'))).toContain('HP 55/100'); expect(text(f.root.querySelector('.small .line3'))).toContain('Exp.18%');
    expect(text(f.root.querySelector('.small .line4'))).toContain('SP 12/80'); expect(text(f.root.querySelector('.small .line4'))).toMatch(/AP 7\s*\/\s*10/);
    expect([...f.root.querySelectorAll('.ap_value')].map(text)).toEqual(['7', '7']); expect(text(f.root.querySelector('.ap_perc'))).toBe('70%');
    for (let cycle = 0; cycle < 4; cycle++) { f.component.toggleMode(); f.component.update('ap', cycle + 1, 10); }
    expect([...f.root.querySelectorAll('.ap_value')].map(text)).toEqual(['4', '4']); expect(text(f.root.querySelector('.ap_perc'))).toBe('40%');
    expect(f.root.querySelector<HTMLElement>('.ap_bar_middle')?.style.width).toBe(Math.floor(40 * f.config.barScale) + 'px');
    expect(text(f.root.querySelector('.small'))).not.toMatch(/\b(?:HP|SP|AP)\./);
  });

  it('gives folded V5 gauge rows a computed height that can contain their absolutely positioned text', () => {
    const f = fixture(5, true);
    f.component.update('hp', 55, 100); f.component.update('sp', 12, 80); f.component.update('ap', 7, 10); f.component.update('bexp', 18, 100);
    const inner = f.root.querySelector<HTMLElement>('#BasicInfoV5')!;
    const style = document.createElement('style'); style.textContent = styles.get(5)!;
    // jsdom does not apply shadow styles. Move the actual native DOM into its
    // document stylesheet scope; use the CSS emitted by the production patch.
    document.head.append(style); document.body.append(inner);
    try {
      const base = window.getComputedStyle(inner), fontSize = parseFloat(base.fontSize);
      expect(fontSize).toBe(12); expect(base.lineHeight).toBe('13px');
      for (const selector of ['.small .line3', '.small .line4']) {
        const row = inner.querySelector<HTMLElement>(selector)!, computed = window.getComputedStyle(row);
        expect(computed.height).toBe(base.lineHeight); expect(parseFloat(computed.height)).toBeGreaterThanOrEqual(fontSize);
        expect(computed.overflow).toBe('hidden'); expect(computed.display).not.toBe('none');
        const containers = row.querySelectorAll('.hpcontainer,.expcontainer,.spcontainer,.apcontainer');
        expect(containers).toHaveLength(2);
        containers.forEach(container => expect(window.getComputedStyle(container).position).toBe('absolute'));
      }
      expect(text(inner.querySelector('.small .line3'))).toContain('HP 55/100');
      expect(text(inner.querySelector('.small .line3'))).toContain('Exp.18%');
      expect(text(inner.querySelector('.small .line4'))).toContain('SP 12/80');
      expect(text(inner.querySelector('.small .line4'))).toMatch(/AP 7\s*\/\s*10/);
      expect(window.getComputedStyle(inner.querySelector('.large')!).display).toBe('none');
    } finally { style.remove(); }
  });
});

describe('BasicInfo patch anchor boundaries', () => {
  it('skips fragments without any supported BasicInfo template', () => {
    const other = 'const unrelated = "BasicInfoV4";\n//#region src/UI/Components/Other/Other.html?raw\nconst html = "<div>Other</div>";\n//#endregion';
    expect(patchRuntimeBasicInfoLayout(other)).toBe(other);
  });

  it.each(['html', 'css'])('accepts a valid standalone %s region without requiring other layouts', kind => {
    const source = region(native, `BasicInfoV4/BasicInfoV4.${kind}?raw`);
    const output = patchRuntimeBasicInfoLayout(source); expect(output).not.toBe(source);
    expect(template(output, 4, kind as 'html' | 'css')).toBe(kind === 'html' ? templates.get(4) : styles.get(4));
  });

  it.each(['html', 'css'])('rejects missing, duplicated and changed %s region/literal anchors', kind => {
    const source = region(native, `BasicInfoV4/BasicInfoV4.${kind}?raw`), name = 'BasicInfoV4_default$' + (kind === 'html' ? 2 : 1);
    for (const changed of [
      source.replace('//#endregion', ''), source + '\n' + source,
      source.replace(name + ' =', 'renamed_upstream ='),
      source.replace('//#endregion', `\n${name} = "extra";\n//#endregion`),
    ]) expect(() => patchRuntimeBasicInfoLayout(changed)).toThrow('anchor:basic-info-layout');
  });

  it.each(['blvl', 'jlvl', 'line2', 'extra'])('rejects a changed or duplicated native %s content block', field => {
    const html = originalTemplates.get(4)!;
    const marker = `class="${field}"`;
    for (const changed of [html.replace(marker, 'class="upstream_changed"'), html.replace(marker, marker + '></div><div ' + marker)]) {
      const source = '//#region src/UI/Components/BasicInfo/BasicInfoV4/BasicInfoV4.html?raw\nBasicInfoV4_default$2 = ' + JSON.stringify(changed) + ';\n//#endregion';
      expect(() => patchRuntimeBasicInfoLayout(source)).toThrow('anchor:basic-info-layout');
    }
  });

  it('rejects duplicate application rather than accumulating conflicting CSS or markup', () => {
    expect(() => patchRuntimeBasicInfoLayout(patched)).toThrow('anchor:basic-info-layout');
  });
});
