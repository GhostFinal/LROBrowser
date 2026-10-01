// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLastROExternalURL, parseLastROXML, setLastROAdjacentHTML, setLastROInnerHTML, setLastROOuterHTML } from '../src/runtime/lastro-trusted-dom.mjs';

const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

afterEach(() => {
  if (originalInnerHTML) Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
  delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes;
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, '__lastroIwaHtmlPolicy');
});

describe('basic HTML injection prevention', () => {
  it.each([
    '<a href="java&#115;cript:alert(1)">link</a>',
    '<a href="java&#x09;script:alert(1)">link</a>',
    '<a href="&#10;javascript:alert(1)">link</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">link</a>',
    '<img src="/safe.png" oNlOaD="alert(1)">',
    '<svg><a xlink:href="javascript:alert(1)">link</a></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '<input formaction="javascript:alert(1)" type="submit">',
    '<meta http-equiv="refresh" content="0;url=https://evil.invalid/">',
    '<base href="https://evil.invalid/">',
    '<link rel="stylesheet" href="https://evil.invalid/">',
    '<style>body{display:none}</style>',
    '<template><img src=x onerror=alert(1)></template>',
    '<div is="untrusted-component">text</div>',
    '<!DOCTYPE html><p>text</p>',
  ])('rejects unsafe markup before changing the live DOM: %s', html => {
    const host = document.createElement('div');
    host.textContent = 'kept';
    expect(() => setLastROInnerHTML(host, html)).toThrow('unsafe HTML');
    expect(host.textContent).toBe('kept');
  });

  it('retains native forms, packaged custom widgets, formatting and resource URLs', () => {
    const host = document.createElement('div');
    setLastROInnerHTML(host, '<form><label for="user">账户</label><input id="user" autocomplete="username"><ui-button bg="basic_interface/button.bmp" data-action="login">登录</ui-button></form><span style="color:#f80;background-image:url(https://game.lastro.cn/pic.png)">说明 &amp; 属性</span><img src="data:image/png;base64,aGVsbG8=">');
    expect(host.querySelector('label')?.textContent).toBe('账户');
    expect(host.querySelector('ui-button')?.getAttribute('bg')).toBe('basic_interface/button.bmp');
    expect(host.querySelector('span')?.textContent).toBe('说明 & 属性');
  });

  it('applies the same policy to outerHTML and insertAdjacentHTML', () => {
    const host = document.createElement('div');
    const child = document.createElement('span'); host.append(child);
    expect(() => setLastROOuterHTML(child, '<svg onload=alert(1)>')).toThrow('unsafe HTML');
    expect(() => setLastROAdjacentHTML(host, 'beforeend', '<a href="java&#x73;cript:alert(1)">bad</a>')).toThrow('unsafe HTML');
    expect(host.children).toHaveLength(1);
  });

  it('cannot use a script or foreign-namespace target to reinterpret approved HTML', () => {
    expect(() => setLastROInnerHTML(document.createElement('script'), 'alert(1)')).toThrow('unsafe HTML');
    expect(() => setLastROInnerHTML(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), '<a>text</a>')).toThrow('unsafe HTML');
  });

  it('isolates permitted links from the opener and preserves tab anchors', () => {
    const host = document.createElement('div');
    setLastROInnerHTML(host, '<a href="https://game.lastro.cn/register" target="_blank" rel="opener">注册</a><a href="#costume">时装</a>');
    expect(host.firstElementChild?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(host.firstElementChild?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(host.lastElementChild?.getAttribute('href')).toBe('#costume');
    expect(() => setLastROInnerHTML(host, host.innerHTML)).not.toThrow();
  });

  it('does not trust or expose the old writable global policy', () => {
    const fake = vi.fn(() => '<img src=x onerror=alert(1)>');
    Object.assign(globalThis, { __lastroIwaHtmlPolicy: { createHTML: fake } });
    const host = document.createElement('div'); setLastROInnerHTML(host, '<span>safe</span>');
    expect(fake).not.toHaveBeenCalled(); expect(host.textContent).toBe('safe');
  });

  it('does not restrict ordinary UI tags, attributes or resource styles', () => {
    const host = document.createElement('div');
    setLastROInnerHTML(host, '<aside><article><details><summary>卡片</summary><main><span style="background-image:url(https://resource.example/pic.png)" custom-layout="wide">内容</span></main></details></article></aside><footer>状态</footer>');
    expect(host.querySelector('footer')?.textContent).toBe('状态');
    expect(host.querySelector('span')?.getAttribute('custom-layout')).toBe('wide');
    expect(host.querySelector('span')?.style.backgroundImage).toContain('https://resource.example/pic.png');
  });

  it('does not upgrade custom UI widgets until all attributes have passed validation', () => {
    const upgraded = vi.fn();
    customElements.define('ui-image', class extends HTMLElement { constructor() { super(); upgraded(); } });
    const host = document.createElement('div');
    expect(() => setLastROInnerHTML(host, '<ui-image src="/safe.png"></ui-image><img src=x onerror=alert(1)>')).toThrow('unsafe HTML');
    expect(upgraded).not.toHaveBeenCalled();
    setLastROInnerHTML(host, '<ui-image src="/safe.png"></ui-image>');
    expect(upgraded).toHaveBeenCalledOnce();
  });
});

describe('XML and navigation boundaries', () => {
  it.each([
    '<!DOCTYPE x [<!ENTITY payload "injected">]><x>&payload;</x>',
    '<!DOCTYPE x SYSTEM "https://evil.invalid/x.dtd"><x/>',
    '<?xml-stylesheet type="text/xsl" href="https://evil.invalid/a.xsl"?><x/>',
    '<x><script>alert(1)</script></x>',
    '<x onclick="bad()"/>',
    '<x href="java&#x09;script:bad()"/>',
  ])('rejects active XML data: %s', xml => {
    expect(() => parseLastROXML(new DOMParser(), xml)).toThrow('unsafe HTML');
  });

  it('keeps XML tables as data with ordinary text and attributes', () => {
    expect(parseLastROXML(new DOMParser(), '<?xml version="1.0"?><table><entry id="2">你好 &amp; welcome</entry></table>').querySelector('entry')?.textContent).toBe('你好 & welcome');
  });

  it('only opens approved HTTPS destinations without opener privileges', () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//game.lastro.cn/', 'http://game.lastro.cn/', 'https://evil.invalid/', 'https://game.lastro.cn.evil.invalid/', 'https://user:password@game.lastro.cn/']) {
      expect(openLastROExternalURL(url)).toBeNull();
    }
    expect(open).not.toHaveBeenCalled();
    openLastROExternalURL('https://game.lastro.cn/register');
    expect(open).toHaveBeenCalledWith('https://game.lastro.cn/register', '_blank', 'noopener,noreferrer');
  });
});

describe('Trusted Types DOM writes', () => {
  it('reproduces the browser failure and permits only the controlled HTML helper', async () => {
    const trustedTypes = {
      createPolicy: (_name: string, rules: { createHTML(value: string): string }) => ({
        createHTML: (value: string) => ({
          __trustedHTML: true,
          toString: () => rules.createHTML(value),
        }),
      }),
    };
    Object.defineProperty(globalThis, 'trustedTypes', { configurable: true, value: trustedTypes });
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: originalInnerHTML?.get,
      set(value: unknown) {
        if (!value || typeof value !== 'object' || !(value as { __trustedHTML?: boolean }).__trustedHTML) {
          throw new TypeError("This document requires 'TrustedHTML' assignment.");
        }
        originalInnerHTML?.set?.call(this, String(value));
      },
    });

    const element = document.createElement('div');
    expect(() => { element.innerHTML = '<span>blocked</span>'; }).toThrow('TrustedHTML');

    const { setLastROInnerHTML } = await import('../src/runtime/lastro-trusted-dom.mjs');
    setLastROInnerHTML(element, '<span>allowed</span>');
    expect(element.innerHTML).toBe('<span>allowed</span>');
    expect(() => setLastROInnerHTML(element, '<script>alert(1)</script>')).toThrow('unsafe HTML');
  });
});
