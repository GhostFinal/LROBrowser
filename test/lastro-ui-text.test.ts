// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { patchRuntimeUiText } from '../scripts/lastro-ui-text.mjs';
import { createLastroUiMessages } from '../scripts/lastro-ui-messages.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
let patched: string;
beforeAll(() => { patched = patchRuntimeUiText(native); });

function region(path: string, body: string) {
  return `//#region src/UI/Components/${path}\n${body}\n//#endregion`;
}

function bodyOf(source: string, path: string) {
  const prefix = `//#region src/UI/Components/${path}`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Missing UI fixture ${path}`);
  const bodyStart = source.indexOf('\n', start) + 1;
  const end = source.indexOf('//#endregion', bodyStart);
  return source.slice(bodyStart, end);
}

function htmlOf(source: string, path: string) {
  const file = ts.createSourceFile('fixture.js', bodyOf(source, path), ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && (node.text.includes('<') || node.text === '')) values.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!values.length) throw new Error(`Unexpected template fixture ${path}`);
  return values.join('');
}

function fragment(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function structuralAttributes(html: string, path = '') {
  return [...fragment(html).querySelectorAll('*')].map(element => ({
    tag: element.tagName,
    attrs: [...element.attributes]
      .filter(attr => !['title', 'placeholder', 'alt', 'aria-label', 'data-title'].includes(attr.name))
      // Only QuestV1's empty title has a reviewed display-binding repair.
      // Normalize its data-text=1317 to the original invalid msgid=1317;
      // every other binding, control value and resource attribute stays exact.
      .map(attr => [path === 'Quest/QuestV1/QuestV1.html?raw' && element.tagName === 'UI-TEXT'
        && element.getAttribute('class') === 'title' && attr.name === 'data-text' && attr.value === '1317'
        ? 'msgid' : attr.name, attr.value]),
  }));
}

function codeShape(body: string) {
  const file = ts.createSourceFile('fixture.js', body, ts.ScriptTarget.Latest, true);
  expect((file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics).toHaveLength(0);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) result.push('static-text');
    else if ([ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) result.push(`template-${node.kind}`);
    else {
      result.push(ts.isIdentifier(node) || ts.isNumericLiteral(node) ? `${node.kind}:${node.text}` : String(node.kind));
      ts.forEachChild(node, visit);
    }
  }
  visit(file);
  return result;
}

describe('scoped UI text localization', () => {
  it('localizes parsed whitespace and escaped text without changing values or resources', () => {
    const html = `<div class='filters'>\n <label><input type='checkbox' value='Public Log' data-action='Public Log'/>\n Public&#32;Log \n</label><input placeholder='Search...' title='Force nearest neighbor filtering for pixel-perfect sprite rendering' data-background='Public Log.bmp'/><script>Public Log</script><style>.Public Log {}</style></div>`;
    const source = region('ChatBoxSettings/ChatBoxSettings.html?raw', `var template = ${JSON.stringify(html)};`);
    const output = htmlOf(patchRuntimeUiText(source), 'ChatBoxSettings/ChatBoxSettings.html?raw');
    const dom = fragment(output);
    expect(dom.querySelector('label')?.textContent?.trim()).toBe('公共记录');
    expect(dom.querySelector('input[placeholder]')?.getAttribute('placeholder')).toBe('搜索……');
    expect(dom.querySelector('input[title]')?.getAttribute('title')).toContain('最近邻过滤');
    expect(dom.querySelector('script')?.textContent).toBe('Public Log');
    expect(dom.querySelector('style')?.textContent).toBe('.Public Log {}');
    expect(structuralAttributes(output)).toEqual(structuralAttributes(html));
  });

  it('leaves unknown labels, prototype names, RO stats and player-like sample content unchanged', () => {
    const html = '<div>constructor</div><div>__proto__</div><div>HP SP EXP STR DEX Base Job Zeny</div><div>玩家 w’&amp;👩‍👩‍👧‍👦</div>';
    const source = region('BasicInfo/BasicInfoV5/BasicInfoV5.html?raw', `const template = ${JSON.stringify(html)};`);
    expect(patchRuntimeUiText(source)).toBe(source);
  });

  it('preserves all native template element and control attributes', () => {
    let inspected = 0;
    for (const match of native.matchAll(/\/\/#region src\/UI\/Components\/([^\r\n]+\.html\?raw)\r?\n/g)) {
      const path = match[1]!;
      expect(structuralAttributes(htmlOf(patched, path), path), path).toEqual(structuralAttributes(htmlOf(native, path), path));
      inspected++;
    }
    expect(inspected).toBeGreaterThan(80);
  });

  it('keeps native JS AST behavior, identifiers and numeric packet arguments unchanged', () => {
    let changed = 0;
    for (const match of native.matchAll(/\/\/#region src\/UI\/Components\/([^\r\n]+\.js)\r?\n/g)) {
      const path = match[1]!;
      const before = bodyOf(native, path), after = bodyOf(patched, path);
      if (before === after) continue;
      expect(codeShape(after), path).toEqual(codeShape(before));
      changed++;
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('keeps component codes, lookup keys, event names and comparisons unchanged', () => {
    const body = `const codes = { 'Unknown': 7 }; const value = codes['Unknown'];
      if (state === 'Unknown') data('Inventory', 'Storage', 'MOB');
      switch (state) { case 'Unknown': break; }
      view.addEventListener('Unknown', callback); view.querySelector('Unknown');
      view.textContent = input || 'Unknown';`;
    const source = region('PartyFriends/PartyFriendsCommon.js', body);
    const output = patchRuntimeUiText(source);
    expect(output).toContain("{ 'Unknown': 7 }");
    expect(output).toContain("codes['Unknown']");
    expect(output).toContain("state === 'Unknown'");
    expect(output).toContain("case 'Unknown'");
    expect(output).toContain("addEventListener('Unknown', callback)");
    expect(output).toContain("querySelector('Unknown')");
    expect(output).toContain("data('Inventory', 'Storage', 'MOB')");
    expect(output).toContain('view.textContent = input || "未知"');
    expect(patchRuntimeUiText(region('Inventory/InventoryCommon.js', `view.textContent = 'Input Price';`)))
      .toBe(region('Inventory/InventoryCommon.js', `view.textContent = 'Input Price';`));
  });

  it('keeps dynamic native whisper nicknames as plain text through translated template literals', () => {
    const body = bodyOf(patched, 'WhisperBox/WhisperBox.js');
    const file = ts.createSourceFile('whisper.js', body, ts.ScriptTarget.Latest, true);
    let assignment = '';
    function visit(node: ts.Node) {
      if (ts.isBinaryExpression(node) && node.left.getText(file) === 'titleEl.textContent' && ts.isTemplateExpression(node.right)) assignment = node.getText(file);
      ts.forEachChild(node, visit);
    }
    visit(file);
    expect(assignment).not.toBe('');
    const titleEl = document.createElement('span');
    const nickname = '测试 w’& 👩‍👩‍👧‍👦 <img src=x onerror=boom()>';
    vm.runInNewContext(assignment, { titleEl, nickname, isFriend: true });
    expect(titleEl.textContent).toBe(`与 ${nickname}（好友）`);
    expect(titleEl.querySelector('img')).toBeNull();
    vm.runInNewContext(assignment, { titleEl, nickname, isFriend: false });
    expect(titleEl.textContent).toBe(`与 ${nickname}`);
  });

  it('describes actual native alphabetical storage modes while preserving their values', () => {
    const html = htmlOf(patched, 'Storage/StorageV3/Storage.html?raw');
    const modes = [...fragment(html).querySelectorAll('.storage-order-by option')];
    expect(modes.map(option => [option.getAttribute('value'), option.textContent])).toEqual([
      ['BASE', '默认顺序'], ['UPGRADE', '名称升序'], ['DOWNGRADE', '名称降序'],
    ]);
    const before = bodyOf(native, 'Storage/StorageCommon.js'), after = bodyOf(patched, 'Storage/StorageCommon.js');
    const sortBlock = (text: string) => text.slice(text.indexOf('if (orderBy ==='), text.indexOf('list.sort', text.indexOf('if (orderBy ===')) + 300);
    expect(sortBlock(after)).toBe(sortBlock(before));
  });

  it('retains graph labels and resource data separately from guild job labels', () => {
    const guild = fragment(htmlOf(patched, 'Guild/Guild.html?raw'));
    expect(guild.querySelector('.righteous')?.textContent).toBe('正');
    expect(guild.querySelector('.wiked')?.textContent).toBe('邪');
    expect(guild.querySelector('.vulgar')?.textContent).toBe('俗');
    expect(guild.querySelector('.famed')?.textContent).toBe('誉');
    const source = region('BasicInfo/BasicInfoV5/BasicInfoV5.html?raw', 'const template = "<div>Job</div>";');
    expect(patchRuntimeUiText(source)).toBe(source);
  });

  it('retains loading animation elements and project attribution in the native intro', () => {
    const before = fragment(htmlOf(native, 'Intro/Intro.html?raw'));
    const after = fragment(htmlOf(patched, 'Intro/Intro.html?raw'));
    expect(after.querySelectorAll('.loading-text span')).toHaveLength(before.querySelectorAll('.loading-text span').length);
    expect(after.querySelector('.loading-text')?.textContent?.trim()).toBe('正在加载中...');
    expect(after.textContent).toContain('Vincent Thibault');
    expect(after.textContent).toContain('Gravity');
    expect(after.querySelectorAll('a').length).toBe(before.querySelectorAll('a').length);
  });

  it('is repeatable, leaves absent optional UI unchanged and detects malformed owned regions', () => {
    expect(patchRuntimeUiText(patched)).toBe(patched);
    const unrelated = 'const title = "Input Price"; // Not a UI component\n';
    expect(patchRuntimeUiText(unrelated)).toBe(unrelated);
    expect(() => patchRuntimeUiText(region('InputBox/InputBox.js', 'const broken = ;'))).toThrow('anchor:ui-text:InputBox/InputBox');
  });

  it('repairs only the empty QuestV1 title binding and preserves other msgid attributes', () => {
    const html = `<ui-text class="title" msgid="1317"></ui-text><ui-text class="other" msgid="1317"></ui-text><ui-text class="title" msgid="1318"></ui-text><ui-text class="title" msgid="1317">既有标题</ui-text>`;
    const source = region('Quest/QuestV1/QuestV1.html?raw', `const template = ${JSON.stringify(html)};`);
    const dom = fragment(htmlOf(patchRuntimeUiText(source), 'Quest/QuestV1/QuestV1.html?raw'));
    expect(dom.querySelectorAll('[data-text="1317"]')).toHaveLength(1);
    expect(dom.querySelector('[data-text="1317"]')?.textContent).toBe('任务目录');
    expect(dom.querySelectorAll('[msgid]')).toHaveLength(3);
    expect(dom.querySelectorAll('[msg]')).toHaveLength(0);
    expect(patchRuntimeUiText(region('Other/Other.html?raw', `const template = ${JSON.stringify(html)};`)))
      .toBe(region('Other/Other.html?raw', `const template = ${JSON.stringify(html)};`));
  });
});

describe('native QuestV1 title mount with UIText and GUI data binding', () => {
  let context: vm.Context;
  let gui: { _host?: HTMLElement; _processAllDataAttrs(): void };
  const csvTable: Record<number, string> = {};
  beforeAll(() => {
    expect(createLastroUiMessages({}).loadCsv(readFileSync('vendor/core/data/msgstringtable.csv'), csvTable,
      bytes => new TextDecoder('utf-8').decode(bytes))).toBe(true);
    expect(csvTable[1317]).toBe('任务目录');
    const section = (name: string) => {
      const start = native.indexOf(`//#region ${name}`);
      if (start < 0) throw new Error(`Missing native binding fixture ${name}`);
      return native.slice(native.indexOf('\n', start) + 1, native.indexOf('//#endregion', start));
    };
    const guiMarker = native.lastIndexOf('//#region', native.indexOf('static processDataAttrs('));
    const guiPath = native.slice(guiMarker + '//#region '.length, native.indexOf('\n', guiMarker)).trim();
    const file = ts.createSourceFile('GUIComponent.js', section(guiPath), ts.ScriptTarget.Latest, true);
    const methods: Record<string, string> = {};
    function visit(node: ts.Node) {
      if (ts.isMethodDeclaration(node) && ['processDataAttrs', '_processAllDataAttrs'].includes(node.name.getText(file))) methods[node.name.getText(file)] = node.getText(file);
      ts.forEachChild(node, visit);
    }
    visit(file);
    expect(Object.keys(methods).sort()).toEqual(['_processAllDataAttrs', 'processDataAttrs']);
    const messageStart = native.indexOf('    static getMessage(id, defaultText)');
    const messageMethod = native.slice(messageStart, native.indexOf('    /**', messageStart));
    context = vm.createContext({ HTMLElement, customElements, MsgStringTable: {}, init_DBManager() {}, __esmMin: (callback: () => void) => callback() });
    vm.runInContext(`class DB { ${messageMethod} }; const _DB = DB; const _Client = { loadFile() {}, loadFiles() {} };
      ${section('src/UI/Elements/UIText.js')}
      class GUIComponent { ${methods.processDataAttrs} ${methods._processAllDataAttrs} }
      globalThis.gui = new GUIComponent();`, context);
    gui = context.gui as typeof gui;
  });

  it.each([
    { name: 'packaged CSV message', table: () => csvTable, expected: '任务目录' },
    { name: 'missing message table', table: () => ({}), expected: '任务目录' },
    { name: 'server-provided Chinese caption', table: () => ({ 1317: '当前任务列表' }), expected: '当前任务列表' },
  ])('retains a visible title with $name through the native mount hooks', ({ table, expected }) => {
    context.MsgStringTable = table();
    const original = document.createElement('div');
    original.append(fragment(htmlOf(native, 'Quest/QuestV1/QuestV1.html?raw')));
    document.body.append(original);
    gui._host = original;
    gui._processAllDataAttrs();
    expect(original.querySelector('.header ui-text.title')?.textContent).toBe('');
    original.remove();
    const fixed = document.createElement('div');
    fixed.append(fragment(htmlOf(patched, 'Quest/QuestV1/QuestV1.html?raw')));
    document.body.append(fixed);
    gui._host = fixed;
    gui._processAllDataAttrs();
    expect(fixed.querySelector('.header ui-text.title')?.textContent).toBe(expected);
    fixed.remove();
  });
});
