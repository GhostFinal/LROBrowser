import { describe, expect, it } from 'vitest';
import { auditRuntimeSource } from '../scripts/audit-runtime-code.mjs';
import { patchElectronRequireFallbacks } from '../scripts/patch-csp-runtime.mjs';

describe('isolated app CSP audit', () => {
  it.each([
    'const value = Function("return this")();',
    'const value = new Function("return 1");',
    'const value = Function(importsKeys, source);',
    'eval(code);',
    'const script = document.createElement("script"); script.src = "https://bad.invalid/app.js";',
    'fetch("/core/data.lua");',
    'const script = document.createElement("script"); script.src = dynamicUrl;',
    'const script = document.createElement("script"); script.setAttribute("src", dynamicUrl);',
  ])('rejects executable construction or executable network loading: %s', source => {
    expect(() => auditRuntimeSource(source, 'fixture.js')).toThrow();
  });

  it('ignores comments and strings that only mention restricted APIs', () => {
    expect(auditRuntimeSource('// Function("return this")\nconst text = "eval(code) /core/a.lua";', 'fixture.js')).toEqual([]);
  });

  it('audits deeply nested expressions without exhausting the call stack', () => {
    const source = `const value = ${Array(8_000).fill('1').join('+')};`;
    expect(auditRuntimeSource(source, 'deep-expression.js')).toEqual([]);
  });

  it('removes Electron-only require fallbacks from vendored workers', () => {
    const source = 'var fs=null;if("undefined"!=typeof process&&process.versions?.electron)try{fs=Function("return require")()("fs")}catch{}';
    const patched = patchElectronRequireFallbacks(source);
    expect(patched).toBe('var fs=null;');
    expect(auditRuntimeSource(patched, 'worker.js')).toEqual([]);
  });
});
