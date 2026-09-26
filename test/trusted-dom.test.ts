// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

afterEach(() => {
  if (originalInnerHTML) Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
  delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes;
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
