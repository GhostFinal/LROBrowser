import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchTrustedTypesDomWrites } from '../scripts/patch-v2-runtime.mjs';
import * as trustedDom from '../src/runtime/lastro-trusted-dom.mjs';

const source = readFileSync('generated/runtime/Online.js', 'utf8');
const loader = source.slice(source.indexOf('function loadXMLFile('), source.indexOf('function loadBSONFile(')).split('/**')[0]!;
const xml = '<?xml version="1.0"?><monster_talk_table><message>你好 &amp; welcome</message></monster_talk_table>';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const DOMParser: typeof globalThis.DOMParser = new JSDOM('').window.DOMParser;
const nativeParse = DOMParser.prototype.parseFromString;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__lastroIwaHtmlPolicy');
});

function requireTrustedTypes() {
  vi.stubGlobal('trustedTypes', {
    createPolicy: (_name: string, rules: { createHTML(value: string): string }) => ({
      createHTML: (value: string) => ({ __trustedHTML: true, toString: () => rules.createHTML(value) }),
    }),
  });
  vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(function (this: DOMParser, value, type) {
    if (!(value as unknown as { __trustedHTML?: boolean })?.__trustedHTML) throw new TypeError('TrustedHTML required');
    return nativeParse.call(this, String(value), type);
  });
}

function runLoader(text: string) {
  let load: ((value: string) => Promise<void>) | undefined;
  const onEnd = vi.fn();
  const callback = vi.fn();
  const error = vi.fn();
  const context = vm.createContext({
    ...trustedDom, DOMParser, ArrayBuffer, Uint8Array,
    Client: { loadFile: (_name: string, success: (value: string) => Promise<void>) => { load = success; } },
    CodepageManager: { decode: (value: string) => value }, userCharpage: 'gbk',
    xmlparse_default: { xml2json: (doc: Document) => ({ message: doc.querySelector('message')?.textContent }) },
    console: { log() {}, error }, callback, onEnd,
  });
  vm.runInContext(loader + '\nloadXMLFile("data/pettalktable.xml", callback, onEnd);', context);
  return { result: Promise.resolve().then(() => load!(text)), callback, onEnd, error };
}

describe('XML database loading under Trusted Types', () => {
  it('parses pet dialogue and completes the pending database task', async () => {
    requireTrustedTypes();
    const h = runLoader(xml);
    await expect(h.result).resolves.toBeUndefined();
    expect(h.callback).toHaveBeenCalledWith({ message: '你好 & welcome' });
    expect(h.onEnd).toHaveBeenCalledOnce();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('reports parser failure and releases the pending task without unhandled rejection', async () => {
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => { throw new Error('parse failed'); });
    const h = runLoader(xml);
    await expect(h.result).resolves.toBeUndefined();
    expect(h.callback).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledOnce();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it.each([
    '<monster_talk_table><message>broken</monster_talk_table>',
    '<monster_talk_table><script>alert(1)</script></monster_talk_table>',
  ])('reports invalid or unsafe XML and completes without publishing partial data: %s', async (text) => {
    requireTrustedTypes();
    const h = runLoader(text);
    await expect(h.result).resolves.toBeUndefined();
    expect(h.callback).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledOnce();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it('patches XML parsing on both new and existing parser instances', () => {
    requireTrustedTypes();
    const input = 'const parser = new DOMParser(); result = [new DOMParser().parseFromString(xml, "application/xml"), parser.parseFromString(xml, "application/xml")];';
    const patched = patchTrustedTypesDomWrites(input);
    const context = vm.createContext({ ...trustedDom, DOMParser, xml });
    vm.runInContext(patched.replace(/^import .*;\n/gm, ''), context);
    expect(context.result.map((doc: Document) => doc.querySelector('message')?.textContent)).toEqual(['你好 & welcome', '你好 & welcome']);
    expect(patchTrustedTypesDomWrites(patched)).toBe(patched);
  });
});
