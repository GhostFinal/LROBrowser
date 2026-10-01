import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createLastroUiMessages, patchRuntimeUiMessages, UI_MESSAGE_OVERRIDES } from '../scripts/lastro-ui-messages.mjs';

const vendor = readFileSync('vendor/v2/Online.js', 'utf8');
const marker = '//#region src/DB/DBManager.js';
const start = vendor.indexOf(marker), end = vendor.indexOf('//#endregion', start);
if (start < 0 || end < 0) throw new Error('Missing native DBManager fixture');
const file = ts.createSourceFile('DBManager.js', vendor.slice(start, end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = ['loadTable', 'loadCSV', 'base64DecodeUtf8'].map(name => {
  const node = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing native ${name}`);
  return node.getText(file);
});
let getMessage: string | undefined;
function findMethod(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'getMessage') {
    if (getMessage) throw new Error('Duplicate native getMessage');
    getMessage = node.getText(file);
  }
  ts.forEachChild(node, findMethod);
}
findMethod(file);
if (!getMessage) throw new Error('Missing native getMessage');
const nativeFixture = `${marker}\n${functions.join('\n')}\nclass DB { ${getMessage} }\n//#endregion`;
const patchedFixture = patchRuntimeUiMessages(nativeFixture);
const csv = new Uint8Array(readFileSync('generated/core/data/msgstringtable.csv'));
const utf8 = (text: string) => new TextEncoder().encode(text);

interface NativeApi {
  DB: { getMessage: (id: number | string, fallback?: string) => string };
  loadCSV: (name: string, table: Record<number, string>, keyIndex: number, valueIndex: number, done: () => void) => void;
  loadTable: (name: string, separator: string, size: number, value: (index: number, value: string) => void, done: () => void, useCharPage: boolean) => void;
}
function harness(source = patchedFixture, buffers: Record<string, Uint8Array | undefined> = { 'data/msgstringtable.csv': csv }) {
  const table: Record<number, string> = {};
  const reads: string[] = [], done = vi.fn();
  const decode = vi.fn((bytes: Uint8Array, charset?: string) => new TextDecoder(charset || 'gbk').decode(bytes));
  const api = runInNewContext(`${source}\n({DB, loadCSV, loadTable});`, {
    MsgStringTable: table, userCharpage: 'gbk', atob,
    Client: { loadFile: (name: string, ok: (bytes: Uint8Array) => void, failure: () => void) => {
      reads.push(name);
      const buffer = buffers[name]; if (buffer) ok(buffer); else failure();
    } },
    CodepageManager: { decode }, console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }) as NativeApi;
  const loadCsv = () => api.loadCSV('data/msgstringtable.csv', table, 0, 1, done);
  const loadAll = () => api.loadTable('data/msgstringtable.txt', '#', 1, (index, value) => { table[index] = value; }, loadCsv, true);
  return { api, table, reads, done, decode, loadCsv, loadAll };
}

describe('packaged UI message table loading', () => {
  it('reproduces zero loaded messages with the actual native loader and UTF-8 comma CSV', () => {
    expect(csv.byteLength).toBe(232728);
    const f = harness(nativeFixture); f.loadCsv();
    expect(f.table).toEqual({}); expect(f.done).toHaveBeenCalledOnce();
  });

  it('loads all actual 4385 rows at native zero-based IDs using explicit UTF-8 despite a GBK user charset', () => {
    const f = harness(); f.loadCsv();
    expect(Object.keys(f.table)).toHaveLength(4385);
    expect(f.api.DB.getMessage(0)).toBe('请问是否同意？');
    expect(f.api.DB.getMessage(1)).toBe('与伺服器连结失败');
    expect(f.api.DB.getMessage(99)).toBe('1：1对话');
    expect(f.api.DB.getMessage(3231)).toBe('队员');
    expect(f.api.DB.getMessage(3575)).toBe('TITLE');
    expect(f.api.DB.getMessage(4384)).toBe('4384');
    // This packaged table has one CSV record per physical line, including ten
    // explicit empty values and four original MIS_ keys. Check every ID, not a
    // few translated buttons that could mask an offset in later records.
    const records = new TextDecoder().decode(csv).split(/\r?\n/);
    for (let id = 0; id < records.length; id++) {
      const record = records[id]!;
      let value = record.slice(record.indexOf(',') + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replaceAll('""', '"');
      expect(f.table[id], `original message ID ${id}`).toBe(value);
    }
    expect(Object.values(f.table).join('')).not.toContain('\uFFFD');
    expect(f.decode).toHaveBeenCalledExactlyOnceWith(expect.any(Uint8Array), 'utf-8');
    expect(f.done).toHaveBeenCalledOnce();
  });

  it('loads CSV after successful native TXT loading and keeps the correctly decoded Chinese TXT value', () => {
    // GBK bytes for 中文, followed by ASCII TXT#; no external resource access.
    const txt = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x54, 0x58, 0x54, 0x23]);
    const f = harness(patchedFixture, { 'data/msgstringtable.txt': txt, 'data/msgstringtable.csv': csv });
    f.loadAll();
    expect(f.reads).toEqual(['data/msgstringtable.txt', 'data/msgstringtable.csv']);
    expect(f.api.DB.getMessage(0)).toBe('中文TXT');
    expect(Object.keys(f.table)).toHaveLength(4385);
    expect(f.decode.mock.calls.map(call => call[1])).toEqual(['gbk', 'utf-8']);
    expect(f.done).toHaveBeenCalledOnce();
  });

  it('runs the CSV fallback and completion once when the native TXT read fails', () => {
    const f = harness(); f.loadAll();
    expect(f.reads).toEqual(['data/msgstringtable.txt', 'data/msgstringtable.csv']);
    expect(f.api.DB.getMessage(0)).toBe('请问是否同意？');
    expect(f.done).toHaveBeenCalledOnce();
  });

  it('replaces unlocalized TXT text with Chinese CSV while preserving existing Chinese over English CSV', () => {
    const f = harness();
    f.table[0] = 'English agreement'; f.table[3111] = '自定义切换'; f.table[1259] = '自定义数值';
    f.loadCsv();
    expect(f.api.DB.getMessage(0)).toBe('请问是否同意？');
    expect(f.api.DB.getMessage(3111)).toBe('自定义切换');
    expect(f.api.DB.getMessage(1259)).toBe('自定义数值');
  });

  it('keeps nonempty TXT text when its original CSV record deliberately has an empty value', () => {
    const f = harness(); f.table[484] = 'Existing maintenance message'; f.loadCsv();
    expect(f.api.DB.getMessage(484)).toBe('Existing maintenance message');
    expect(f.api.DB.getMessage(485)).toBeDefined();
  });

  it('parses quoted commas and escaped quotes without shifting IDs across blank records or a BOM', () => {
    const content = '\uFEFFMSI_ZERO,"第一,条""引号"""\r\n\r\nMSI_TWO,"第三行\n第二段"\r\nMSI_THREE,末项';
    const f = harness(patchedFixture, { 'data/msgstringtable.csv': utf8(content) }); f.loadCsv();
    expect(f.table).toEqual({ 0: '第一,条"引号"', 2: '第三行\n第二段', 3: '末项' });
    expect(f.api.DB.getMessage(1, '原生缺失回退')).toBe('原生缺失回退');
  });

  it('keeps native Base64 and UTF-8 TAB message formats working', () => {
    const encoded = `MSI_ZERO,${Buffer.from('确定!').toString('base64')}`;
    const base64 = harness(patchedFixture, { 'data/msgstringtable.csv': utf8(encoded) }); base64.loadCsv();
    expect(base64.api.DB.getMessage(0)).toBe('确定!');
    const tab = harness(patchedFixture, { 'data/msgstringtable.csv': utf8('MSI_ZERO\t中文Tab\nMSI_ONE\t第二项') }); tab.loadCsv();
    expect(tab.table).toEqual({ 0: '中文Tab', 1: '第二项' });
  });

  it('leaves other native CSV decoding and indexing unchanged', () => {
    const bytes = utf8('key0\t第一条\n\nkey1\t第二条');
    const before = harness(nativeFixture, { 'data/other.csv': bytes }), after = harness(patchedFixture, { 'data/other.csv': bytes });
    before.api.loadCSV('data/other.csv', before.table, 0, 1, before.done);
    after.api.loadCSV('data/other.csv', after.table, 0, 1, after.done);
    expect(after.table).toEqual(before.table);
    expect(after.table).toEqual({ 0: '第一条', 1: '第二条' });
    expect(after.decode.mock.calls.map(call => call[1])).toEqual(before.decode.mock.calls.map(call => call[1]));
    const unrelatedComma = harness(patchedFixture, { 'data/other.csv': csv });
    unrelatedComma.api.loadCSV('data/other.csv', unrelatedComma.table, 0, 1, unrelatedComma.done);
    expect(unrelatedComma.table).toEqual({});
  });

  it.each(Object.entries(UI_MESSAGE_OVERRIDES))('translates only the known English or absent UI label at ID %s', (id, entry) => {
    const f = harness();
    expect(f.api.DB.getMessage(id)).toBe(entry.label);
    f.table[Number(id)] = entry.source;
    expect(f.api.DB.getMessage(id)).toBe(entry.label);
    f.table[Number(id)] = '保留已有中文';
    expect(f.api.DB.getMessage(id)).toBe('保留已有中文');
    f.table[Number(id)] = 'Unknown custom English';
    expect(f.api.DB.getMessage(id)).toBe('Unknown custom English');
  });

  it('retains native unknown-message fallbacks and legal RO abbreviations', () => {
    const f = harness(); f.loadCsv();
    expect(f.api.DB.getMessage(99999, 'fallback')).toBe('fallback');
    expect(f.api.DB.getMessage(99999)).toBe('NO MSG 99999');
    expect(f.api.DB.getMessage(2464)).toBe('Zeny');
    expect(f.api.DB.getMessage(2672)).toBe('EP');
    expect(f.api.DB.getMessage(412)).toBe('MDEF');
    expect(f.api.DB.getMessage(3991)).toBe('↖');
    expect(f.api.DB.getMessage(3301)).toBe('https://payment.gnjoy.com/bill/login.grv');
  });

  it('keeps explicit localized defaults while filling a blank or confirmed English UI fallback', () => {
    const f = harness();
    expect(f.api.DB.getMessage(99, '缺省中文')).toBe('缺省中文');
    expect(f.api.DB.getMessage(99, 'Unknown custom default')).toBe('Unknown custom default');
    expect(f.api.DB.getMessage(99, '')).toBe('私聊');
    expect(f.api.DB.getMessage(99, '1:1 Chat')).toBe('私聊');
    expect(f.api.DB.getMessage(99999, '')).toBe('');
    expect(f.api.DB.getMessage(99999, '缺省中文')).toBe('缺省中文');
  });

  it('preserves an existing value overlay in native getMessage', () => {
    const fixture = nativeFixture.replace('return MsgStringTable[id];', 'const value = MsgStringTable[id]; return value === "Default" ? "默认" : value;');
    const f = harness(patchRuntimeUiMessages(fixture)); f.loadCsv();
    expect(f.api.DB.getMessage(3994)).toBe('默认');
    expect(f.api.DB.getMessage(3111)).toBe('切换');
  });

  it('does not replace a valid loaded table with corrupted UTF-8 CSV', () => {
    const messages = createLastroUiMessages(), table = { 0: '有效中文' };
    expect(messages.loadCsv(utf8('MSI_ZERO,损坏\uFFFD'), table, bytes => new TextDecoder().decode(bytes))).toBe(false);
    expect(table[0]).toBe('有效中文');
  });

  it.each([
    nativeFixture.replace('function loadCSV(filename,', 'function loadCSV(path,'),
    nativeFixture.replace('function (data)', 'function (buffer)'),
    nativeFixture.replace('if (!(id in MsgStringTable))', 'if (id === 0)'),
  ])('rejects changed native loading or lookup anchors', source => {
    expect(() => patchRuntimeUiMessages(source)).toThrow(/anchor:ui-message/);
  });

  it('rejects double application and leaves unrelated bundles alone', () => {
    expect(() => patchRuntimeUiMessages(patchedFixture)).toThrow('anchor:ui-message-region');
    expect(patchRuntimeUiMessages('const other = true;')).toBe('const other = true;');
  });
});
