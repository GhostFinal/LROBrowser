// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { patchPetDialogueDecoding } from '../scripts/patch-pet-dialogue.mjs';
import { createLastroChatMapLinks } from '../scripts/lastro-chat-map-links.mjs';

const source = readFileSync('vendor/v2/Online.js', 'utf8');
const start = source.indexOf('    static getPetTalk(data) {');
const end = source.indexOf('    static getPetHungryState(', start);
if (start < 0 || end < start) throw new Error('Missing native pet dialogue fixture');
const nativeMethod = source.slice(start, end);
const nativeClass = `class DB { ${nativeMethod} }`;
const patchedClass = patchPetDialogueDecoding(nativeClass);
const xmlLoader = source.slice(source.indexOf('function loadXMLFile('), source.indexOf('function loadBSONFile(')).split('/**')[0]!;
const petTalk = source.slice(source.indexOf('function petTalk(GID, msg) {'), source.indexOf('function onPetInformationUpdate(')).split('/**')[0]!;
const require = createRequire(import.meta.url);
const iconv = createRequire(require.resolve('jsdom/package.json'))('iconv-lite') as {
  encode(text: string, charset: string): Uint8Array;
  decode(bytes: Uint8Array, charset: string): string;
};

interface NativeDb { getPetTalk(data: number): string | false; }
function fixture(patched = true) {
  let success!: (bytes: Uint8Array) => Promise<void>;
  const completed = vi.fn();
  const decode = vi.fn((bytes: Uint8Array, charset: string) => iconv.decode(bytes, charset));
  const decodeString = vi.fn((text: string) => {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
    return iconv.decode(bytes, 'gbk');
  });
  const content = document.createElement('div');
  const mapLinks = createLastroChatMapLinks({ setHtml: (node, text) => { node.innerHTML = text; }, showPrompt: () => undefined, teleport() {} });
  const displayed = vi.fn((text: string) => mapLinks.render(content, text)), dialog = vi.fn();
  const context = vm.createContext({
    Array, ArrayBuffer, Uint8Array, DOMParser, parseInt, Math,
    console: { log() {} },
    CodepageManager: { decode, decodeString }, userCharpage: 'gbk',
    Client: { loadFile: (_filename: string, callback: typeof success) => { success = callback; } },
    xmlparse_default: { xml2json: (doc: Document) => {
      const messages = [...doc.querySelectorAll('message')].map(node => node.textContent ?? '');
      return { monster_talk_table: { pet_cat: { hungry: { idle: messages.length === 1 ? messages[0] : messages } } } };
    } },
    PetTalkTable: {},
    PetHungryState_default: { HUNGRY: 0 }, PetMessageConst_default: { IDLE: 0 },
    MonsterTable_default: { 1021: 'PET_CAT' },
    EntityManager: { get: () => ({ display: { name: '公主喵' }, dialog: { set: dialog } }) },
    ChatBox_default: { addText: displayed, TYPE: { PUBLIC: 1 }, FILTER: { PUBLIC_CHAT: 2 } },
    onEnd: completed,
  });
  vm.runInContext(`${patched ? patchedClass : nativeClass};
    DB.getPetHungryText = () => 'hungry'; DB.getPetActText = () => 'idle';
    ${xmlLoader}
    ${petTalk}
    loadXMLFile('data/pettalktable.xml', json => { PetTalkTable = json.monster_talk_table; }, onEnd);
    globalThis.nativeDB = DB;
  `, context);
  return {
    decode, decodeString, displayed, dialog, completed, content,
    load: (xml: string) => success(Uint8Array.from(iconv.encode(xml, 'gbk'))),
    getText: () => (context.nativeDB as NativeDb).getPetTalk(1021000),
    talk: (text: string) => vm.runInContext('petTalk(7, text);', Object.assign(context, { text })),
    setTable: (value: unknown) => { context.PetTalkTable = { pet_cat: { hungry: { idle: value } } }; },
  };
}

describe('Unicode pet dialogue from XML through the native chat path', () => {
  it('reproduces native low-byte corruption after the XML has already decoded Chinese', async () => {
    const f = fixture(false);
    await f.load('<?xml version="1.0"?><monster_talk_table><message>请给我一点吃的</message></monster_talk_table>');
    expect(f.getText()).not.toBe('请给我一点吃的');
    expect(f.decodeString).toHaveBeenCalledWith('请给我一点吃的');
    expect(f.decode).toHaveBeenCalledExactlyOnceWith(expect.any(Uint8Array), 'gbk');
  });

  it.each(['请给我一点吃的', 'w’&', "w'&", 'Hello & welcome <3', 'Café déjà vu'])('preserves XML dialogue %s through getPetTalk and petTalk', async text => {
    const f = fixture();
    const encoded = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await f.load(`<?xml version="1.0"?><monster_talk_table><message>${encoded}</message></monster_talk_table>`);
    // GBK cannot represent every accented character. Compare with the actual first decode.
    const decoded = iconv.decode(iconv.encode(text, 'gbk'), 'gbk');
    expect(f.getText()).toBe(decoded);
    f.talk(decoded);
    expect(f.displayed).toHaveBeenCalledExactlyOnceWith('公主喵 : ' + decoded, 1, 2);
    expect(f.dialog).toHaveBeenCalledExactlyOnceWith(decoded);
    expect(f.decodeString).not.toHaveBeenCalled();
    expect(f.completed).toHaveBeenCalledOnce();
  });

  it('renders a Chinese XML sentence as Chinese instead of the ASCII remnant produced by the old path', async () => {
    const text = '一起吃吧？';
    const xml = `<?xml version="1.0"?><monster_talk_table><message>${text}</message></monster_talk_table>`;
    const old = fixture(false);
    await old.load(xml); old.talk(old.getText() as string);
    expect(old.content.textContent).toBe("公主喵 : w'");
    const fixed = fixture();
    await fixed.load(xml); fixed.talk(fixed.getText() as string);
    expect(fixed.content.textContent).toBe('公主喵 : 一起吃吧？');
  });

  it('preserves already decoded emoji, accents, and multiline text in either XML table branch', () => {
    const f = fixture();
    for (const text of ['你好 🐱👨‍👩‍👧‍👦', 'Café résumé', '第一行\n第二行', "w'& <3"]) {
      f.setTable(text); expect(f.getText()).toBe(text);
      f.setTable([text]); expect(f.getText()).toBe(text);
    }
    expect(f.decodeString).not.toHaveBeenCalled();
  });

  it.each([null, {}, 7, [null]])('does not coerce or decode non-text XML entries %s', value => {
    const f = fixture(); f.setTable(value);
    expect(f.getText()).toBe(false);
    expect(f.decodeString).not.toHaveBeenCalled();
  });

  it('limits the patch to the two pet XML return values', () => {
    const input = nativeClass + '\nfunction playerMessage(text) { return CodepageManager.decodeString(text); }';
    const patched = patchPetDialogueDecoding(input);
    expect(patched).toContain('function playerMessage(text) { return CodepageManager.decodeString(text); }');
    expect(() => patchPetDialogueDecoding(patched)).toThrow('anchor:pet-dialogue');
    expect(patchPetDialogueDecoding('const fixture = true;')).toBe('const fixture = true;');
  });

  it('rejects missing, changed, or duplicate native pet decoder anchors', () => {
    expect(() => patchPetDialogueDecoding(nativeClass.replaceAll('CodepageManager.decodeString', 'CodepageManager.decode'))).toThrow('anchor:pet-dialogue');
    expect(() => patchPetDialogueDecoding(nativeClass + nativeClass)).toThrow('anchor:pet-dialogue');
    expect(() => patchPetDialogueDecoding(nativeClass.replace('getPetTalk(data)', 'changedPetTalk(data)') + '\nDB.getPetTalk(1021000);')).toThrow('anchor:pet-dialogue');
  });
});
