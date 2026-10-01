// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeMail } from '../scripts/lastro-mail.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
function region(source: string, path: string) {
  const marker = `//#region ${path}`;
  const start = source.indexOf(marker), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0 || source.lastIndexOf(marker) !== start) throw new Error(`Missing unique ${path}`);
  return source.slice(start, end + '//#endregion'.length);
}
// Parse only the nine native mail regions; do not initialize the bundled game.
const source = ['Rodex', 'WriteRodex', 'ReadRodex'].flatMap(name =>
  ['html?raw', 'css?raw', 'js'].map(extension => region(vendor, `src/UI/Components/Rodex/${name}.${extension}`)),
).join('\n');
const patched = patchRuntimeMail(source);
function ast(source: string) { return ts.createSourceFile('mail.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
function find(source: string, predicate: (node: ts.Node) => boolean) {
  const file = ast(source), found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(file);
  if (found.length !== 1) throw new Error('Missing unique native mail fixture');
  return found[0]!.getText(file);
}
function declaration(component: string, name: string) {
  return find(region(patched, `src/UI/Components/Rodex/${component}.js`), node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
}
function assignment(component: string, name: string) {
  return find(region(patched, `src/UI/Components/Rodex/${component}.js`), node =>
    ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
      && ts.isIdentifier(node.left.expression) && node.left.expression.text === component && node.left.name.text === name);
}
function template(component: string, extension = 'html?raw') {
  const file = ast(region(patched, `src/UI/Components/Rodex/${component}.${extension}`));
  let value: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) value = node.right.text;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (value === undefined) throw new Error('Missing native template');
  return value;
}
function mount(component: string) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = template(component);
  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing ${component} ${selector}`);
    return node;
  }
  return { host, root, element };
}

interface Writer {
  _host: HTMLElement; _shadow: ShadowRoot; receiver: string | null; CharID: number; tax: number; list: unknown[];
  initData: (packet: { receiveName: string }) => void; onAppend: () => void;
  updateWeight: (weight: number) => void; updateTax: () => void;
  characterInfo: (packet: { level: number; Job: number; CharID: number; name?: string }) => void;
}
function writer() {
  const dom = mount('WriteRodex');
  const sent = vi.fn(), cancel = vi.fn(), validate = vi.fn(), messages = vi.fn();
  const native = {
    _host: dom.host, _shadow: dom.root, receiver: null, CharID: 0, tax: 0, list: [],
    requestSendRodex: sent, requestCancelWriteRodex: cancel, validateName: validate,
    focus: vi.fn(), draggable: vi.fn(),
  };
  const names = ['_root$8', 'onClickClose$1', 'onClickSend', 'onClickValidateName', 'prettifyZeny$3'];
  const handlers = names.map(name => declaration('WriteRodex', name)).join('\n');
  const methods = ['initData', 'onAppend', 'updateWeight', 'updateTax', 'characterInfo']
    .map(name => assignment('WriteRodex', name)).join(';\n');
  runInNewContext(`${handlers}\n${methods};`, {
    WriteRodex: native,
    DB: { getMessage: (id: number) => id === 3575 ? 'TITLE' : `message-${id}` },
    SessionStorage_default: { Entity: { display: { name: '寄件角色' } }, zeny: 100000 },
    ChatBox_default: { addText: messages, TYPE: { INFO_MAIL: 1 }, FILTER: { PUBLIC_LOG: 0 } },
    Rodex_default: { _host: { style: { top: '0px', left: '0px' } } },
    Renderer: { width: 1200, height: 800 }, MonsterTable_default: { 1: '剑士' },
    onDrop$10: vi.fn(), stopPropagation$8: vi.fn(),
  });
  const api = native as unknown as Writer;
  api.onAppend();
  api.initData({ receiveName: '收件角色' });
  return { ...dom, api, sent, cancel, validate, messages };
}

function reader() {
  const dom = mount('ReadRodex');
  const items = vi.fn(), zeny = vi.fn(), remove = vi.fn(), reply = vi.fn(), prompt = vi.fn();
  const native = { _host: dom.host, _shadow: dom.root, focus: vi.fn() };
  const names = ['_root', 'onClickGetItems', 'onClickGetZeny', 'onClickDelete', 'onClickReply', 'prettifyZeny'];
  runInNewContext(names.map(name => declaration('ReadRodex', name)).join('\n') + '\n' + assignment('ReadRodex', 'initData'), {
    ReadRodex: native, UIManager: { showPromptBox: prompt },
    Rodex_default: { requestItemsFromRodex: items, requestZenyFromRodex: zeny, requestDeleteRodex: remove, requestOpenWriteRodex: reply },
    DB: { getMessage: (id: number) => `message-${id}`, getItemInfo: () => ({ identifiedResourceName: 'red_potion' }), INTERFACE_PATH: 'data/texture/' },
    Client: { loadFile: (_path: string, callback: (uri: string) => void) => callback('data:image/bmp;base64,AA==') },
  });
  const api = native as unknown as { initData: (data: { zeny: number; Textcontent: string; ItemList: { ITID: number; count: number }[] }, mail: { MailID: number; openType: number; SenderName: string; title: string }) => void };
  const init = (attachments = true) => api.initData({ zeny: attachments ? 15000 : 0, Textcontent: '<b>普通文字</b>\n第二行', ItemList: attachments ? [{ ITID: 501, count: 2 }] : [] }, { MailID: 17, openType: 2, SenderName: '寄件人', title: '中文标题' });
  return { ...dom, init, items, zeny, remove, reply, prompt };
}

function inbox(name: string, title: string) {
  const dom = mount('Rodex'), read = vi.fn(), reply = vi.fn();
  const native = {
    _host: dom.host, _shadow: dom.root, page: 0, pageSize: 6,
    list: [{ MailID: 23, openType: 1, title, SenderName: name, Isread: false, type: 6, expireDateTime: 259200 }],
    attachmentType: { 6: 'basic_interface/rodexsystem/renewal/icon_zeny_n_item.bmp' },
    requestReadRodex: read, requestOpenWriteRodex: reply,
  };
  const methods = ['createRodexList', 'getMailsByTabID'].map(name => assignment('Rodex', name)).join(';\n');
  runInNewContext(['_root$16', 'onClickReadMail', 'onClickReplyMail'].map(name => declaration('Rodex', name)).join('\n') + '\n' + methods, {
    Rodex: native, GUIComponent: { processDataAttrs: vi.fn() },
  });
  (native as unknown as { createRodexList: (tab: number) => void }).createRodexList(1);
  return { ...dom, read, reply };
}

describe('native mail localization and behavior', () => {
  it('keeps Chinese labels after actual GUIComponent message-table processing', () => {
    const gui = region(vendor, 'src/UI/GUIComponent.js');
    const method = find(gui, node => ts.isMethodDeclaration(node) && node.name.getText() === 'processDataAttrs');
    const getMessage = vi.fn(() => 'ENGLISH_FROM_MESSAGE_TABLE');
    const process = runInNewContext(`class GUIComponent { ${method} }; GUIComponent.processDataAttrs;`, {
      _DB: { getMessage, INTERFACE_PATH: 'data/texture/' },
      _Client: { loadFile: (_path: string, callback: (uri: string) => void) => callback('data:image/bmp;base64,AA==') },
    }) as (node: HTMLElement) => void;
    for (const component of ['Rodex', 'WriteRodex', 'ReadRodex']) {
      const f = mount(component), before = f.root.textContent;
      f.root.querySelectorAll<HTMLElement>('[data-background],[data-hover],[data-down],[data-text]').forEach(process);
      expect(f.root.textContent).toBe(before);
      expect(f.root.querySelector('[data-text]')).toBeNull();
    }
    expect(getMessage).not.toHaveBeenCalled();
  });

  it('removes foreign action and TAX bitmaps while retaining the native shell and generic button states', () => {
    const html = ['Rodex', 'WriteRodex', 'ReadRodex'].map(name => template(name)).join('');
    expect(html).not.toMatch(/rodexsystem\/renewal\/(?:btn_(?:reply|delete|receive|confirm_id_empty)\w*|bg_tax)\.bmp/);
    for (const [component, selectors] of [
      ['WriteRodex', ['.validate-name', '.send']],
      ['ReadRodex', ['.get-content', '.get-zeny', '.delete', '.reply']],
    ] as const) {
      const f = mount(component);
      for (const selector of selectors) {
        const button = f.element(selector);
        expect(button.textContent).toMatch(/确认名字|发送|领取|删除|回复/);
        expect(button.dataset.background).toBe('navigation_interface3/btn_normal.bmp');
        expect(button.dataset.hover).toBe('navigation_interface3/btn_over.bmp');
        expect(button.dataset.down).toBe('navigation_interface3/btn_press.bmp');
      }
      expect(f.element('.body').dataset.background).toBe('basic_interface/rodexsystem/renewal/bg_rodex_read.bmp');
      expect(f.element('.close').dataset.background).toBe('basic_interface/sys_close_off.bmp');
    }
  });

  it('keeps inbox tooltips outside the clipped Chinese label and retains row read/reply actions', () => {
    const name = '寄件角色姓名'.repeat(4), title = '很长的中文邮件标题'.repeat(4);
    const f = inbox(name, title);
    const readLink = f.element('#mail_23'), replyLink = f.element('#sender_23');
    expect(readLink.querySelector('span:not(.mail-label)')?.textContent).toBe('读取');
    expect(replyLink.querySelector('span:not(.mail-label)')?.textContent).toBe('回复');
    expect(readLink.querySelector('.mail-label')?.textContent).toBe(title.slice(0, 18) + '...');
    expect(replyLink.querySelector('.mail-label')?.textContent).toBe(name.slice(0, 18) + '...');
    expect(f.element('.expire-days').textContent).toBe('3 天');
    expect(f.root.querySelector('[data-text]')).toBeNull();
    readLink.click(); replyLink.click();
    expect(f.read).toHaveBeenCalledExactlyOnceWith('1', '23');
    expect(replyLink.getAttribute('sender')).toBe(name);
    expect(f.reply).toHaveBeenCalledExactlyOnceWith(name);
    const style = document.createElement('style'); style.textContent = template('Rodex', 'css?raw');
    document.head.append(style);
    try {
      const rules = [...style.sheet!.cssRules].filter((rule): rule is CSSStyleRule => 'selectorText' in rule);
      const label = rules.find(rule => rule.selectorText.includes('.text .mail-label'))!;
      expect(label.style.position).toBe('static');
      expect(label.style.display).toBe('block');
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.getPropertyValue('text-overflow')).toBe('ellipsis');
      const container = rules.find(rule => rule.selectorText.endsWith('.mail-text .text'))!;
      expect(container.style.overflow).not.toBe('hidden');
    } finally { style.remove(); }
  });

  it.each([
    { name: `收件"'&<>人`, title: `标题"'&<>文本` },
    { name: `"'><img src=x>&` + '完整姓名'.repeat(5), title: '<img src=x>"\'&' },
  ])('renders special mail text literally and replies to the full escaped sender: $title', ({ name, title }) => {
    const f = inbox(name, title), replyLink = f.element('#sender_23');
    const display = (text: string) => text.length > 18 ? text.slice(0, 18) + '...' : text;
    expect(f.element('#mail_23 .mail-label').textContent).toBe(display(title));
    expect(f.element('#sender_23 .mail-label').textContent).toBe(display(name));
    expect(replyLink.getAttribute('sender')).toBe(name);
    expect(f.root.querySelector('img, script, iframe')).toBeNull();
    expect(f.root.querySelectorAll('.mail-item')).toHaveLength(1);
    expect(f.root.querySelectorAll('.mail-label')).toHaveLength(2);
    replyLink.click();
    expect(f.reply).toHaveBeenCalledExactlyOnceWith(name);
  });

  it('initializes a blank title with a Chinese placeholder and does not send TITLE', () => {
    const f = writer();
    expect(f.element<HTMLInputElement>('.title-text').value).toBe('');
    expect(f.element<HTMLInputElement>('.title-text').placeholder).toBe('标题');
    expect(f.element('.character-zeny').textContent).toBe('100,000 金币');
    f.api.receiver = '收件角色'; f.api.CharID = 42;
    f.element('.send').click();
    expect(f.sent).toHaveBeenCalledExactlyOnceWith('收件角色', '寄件角色', 0, 1, 1, 42, '\0', '\0');
    expect(f.cancel).toHaveBeenCalledOnce();
  });

  it('preserves native sanitized send arguments and binds only one send when reopened', () => {
    const f = writer();
    f.api.onAppend();
    f.api.initData({ receiveName: '收件角色' });
    f.api.receiver = '已确认收件人'; f.api.CharID = 900;
    f.element<HTMLInputElement>('.title-text').value = '$\t' + '中'.repeat(30);
    f.element<HTMLTextAreaElement>('.content-text').value = '%\t' + '文'.repeat(510);
    f.element<HTMLInputElement>('.value').value = '1200';
    f.api.updateTax(); f.element('.send').click();
    expect(f.sent).toHaveBeenCalledExactlyOnceWith('已确认收件人', '寄件角色', 1200, 24, 500, 900, '中'.repeat(23) + '\0', '文'.repeat(499) + '\0');
  });

  it('keeps receiver verification and insufficient-funds rejection before sending', () => {
    const f = writer();
    f.element('.send').click();
    expect(f.sent).not.toHaveBeenCalled();
    expect(f.messages).toHaveBeenLastCalledWith('message-2611', 1, 0);
    f.element<HTMLInputElement>('.name').value = '%\t姓名';
    f.element('.validate-name').click();
    expect(f.validate).toHaveBeenCalledExactlyOnceWith('姓名');
    f.api.characterInfo({ name: '服务器确认姓名', level: 10, Job: 1, CharID: 101 });
    expect(f.api.receiver).toBe('服务器确认姓名');
    f.element<HTMLInputElement>('.value').value = '100000'; f.api.updateTax();
    f.element('.send').click();
    expect(f.sent).not.toHaveBeenCalled();
    expect(f.messages).toHaveBeenLastCalledWith('message-2643', 1, 0);
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it('keeps weight, tax, red balance warning and close/reset behavior', () => {
    const f = writer();
    expect(f.element('.weigth-text').textContent).toBe('0 / 2000');
    f.api.updateWeight(1500);
    expect(f.element('.weigth-text').textContent).toBe('1500 / 2000');
    f.api.list = [{ index: 1 }, { index: 2 }];
    const value = f.element<HTMLInputElement>('.value'); value.value = '100000';
    value.dispatchEvent(new Event('input'));
    expect(f.api.tax).toBe(7000);
    expect(f.element('.tax-text').textContent).toBe('7000');
    expect(value.classList.contains('red')).toBe(true);
    value.value = '1200'; value.dispatchEvent(new Event('input'));
    expect(f.api.tax).toBe(5024);
    expect(value.classList.contains('red')).toBe(false);
    f.element('.close').click();
    expect(f.element('.weigth-text').textContent).toBe('0 / 2000');
    expect(f.api.list).toEqual([]); expect(f.api.receiver).toBeNull();
    expect(f.api.CharID).toBe(0); expect(f.api.tax).toBe(0);
    expect(f.host.style.display).toBe('none'); expect(f.cancel).toHaveBeenCalledOnce();
  });

  it('keeps the compose window within the top edge next to an inbox at zero', () => {
    expect(writer().host.style.top).toBe('0px');
  });

  it('keeps read attachments, reply and native delete confirmation using current mail identifiers', () => {
    const f = reader(); f.init(); f.init();
    expect(f.element('.name').textContent).toBe('寄件人');
    expect(f.element('.value').textContent).toBe('15,000');
    expect(f.element('.content-text').textContent).toBe('<b>普通文字</b>\n第二行');
    expect(f.root.querySelector('.content-text b')).toBeNull();
    f.element('.get-content').click(); f.element('.get-zeny').click(); f.element('.reply').click();
    expect(f.items).toHaveBeenCalledExactlyOnceWith(2, 17);
    expect(f.zeny).toHaveBeenCalledExactlyOnceWith(2, 17);
    expect(f.reply).toHaveBeenCalledExactlyOnceWith('寄件人');
    f.element('.delete').click();
    expect(f.prompt).toHaveBeenCalledExactlyOnceWith('message-356', 'ok', 'cancel', expect.any(Function));
    expect(f.remove).not.toHaveBeenCalled();
    const confirm = f.prompt.mock.calls[0]![3] as () => void;
    confirm(); expect(f.remove).toHaveBeenCalledExactlyOnceWith(2, 17);
    f.init(false);
    expect(f.element('.get-content').style.display).toBe('none');
    expect(f.element('.get-zeny').style.display).toBe('none');
  });

  it('fails on native anchor drift instead of partially changing an unknown layout', () => {
    expect(() => patchRuntimeMail(source.replace('Rodex/ReadRodex.css?raw', 'Rodex/Missing.css?raw'))).toThrow('anchor:mail-templates');
    expect(() => patchRuntimeMail(source.replace('DB.getMessage(3575)', 'DB.getMessage(3576)'))).toThrow('anchor:mail-title');
    expect(patchRuntimeMail('const unrelated = true;')).toBe('const unrelated = true;');
  });
});
