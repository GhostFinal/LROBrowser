// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

// The runtime module is deliberately shipped as an executable MJS asset.
// @ts-expect-error Runtime MJS is validated by the Vite bundle and this focused test.
import { decorateLastROLoginStyles, decorateLastROLoginTemplate } from '../src/runtime/lastro-account-login.mjs';

describe('LastRO native login integration', () => {
  it('replaces the private quick-login panel with the native account panel', () => {
    const html = '<div class="login"><div class="quick-login-panel">private data</div><input class="user" /></div>';
    const decorated = decorateLastROLoginTemplate('WinLogin', html);
    expect(decorated).not.toContain('quick-login-panel');
    expect(decorated).toContain('data-lastro-login-panel');
    expect(decorated).toContain('data-lastro-server-list');
    expect(decorated).toContain('data-lastro-account-password');
  });

  it('leaves unrelated V2 windows unchanged', () => {
    const html = '<div class="window"></div>';
    const css = '.window { color: black; }';
    expect(decorateLastROLoginTemplate('WinInventory', html)).toBe(html);
    expect(decorateLastROLoginStyles('WinInventory', css)).toBe(css);
  });
});
