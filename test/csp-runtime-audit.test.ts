import { describe, expect, it } from 'vitest';
import { auditRuntimeSource } from '../scripts/audit-runtime-code.mjs';
import { patchElectronRequireFallbacks, patchRuntimeNavigation, patchRuntimePluginLoader } from '../scripts/patch-csp-runtime.mjs';
import { readFileSync } from 'node:fs';

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
    'globalThis.eval(code);',
    'window["ev" + "al"](code);',
    '(0, eval)(code);',
    'new globalThis["Function"](code);',
    'eval.call(null, code);',
    'const execute = window.eval; execute(code);',
    'const { eval: execute } = globalThis; execute(code);',
    'const execute = (() => {}).constructor(code);',
    'const script = document["createElement"]("scr" + "ipt");',
    'document.createElementNS("http://www.w3.org/2000/svg", "script");',
    'element.setAttribute("on" + "click", code);',
    'element.setAttribute("srcdoc", markup);',
    'document.write(markup);',
    'document["writeln"](markup);',
    'range.createContextualFragment(markup);',
    'setTimeout("execute()", 1);',
    'window.setInterval("execute()", 1);',
    'import(dynamicUrl);',
    'import("https://evil.invalid/plugin.js");',
    'import("//evil.invalid/plugin.js");',
    'importScripts("https://evil.invalid/plugin.js");',
    'importScripts(dynamicUrl);',
    'importScripts(createLastROWorkerScriptUrl("../../other.js"));',
    'element.innerHTML = markup;',
    'element["inner" + "HTML"] += markup;',
    'element.outerHTML = markup;',
    'element.insertAdjacentHTML("beforeend", markup);',
    'new DOMParser().parseFromString(markup, "text/html");',
    'element.setHTMLUnsafe(markup);',
    'Document.parseHTMLUnsafe(markup);',
    'frame.srcdoc = markup;',
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

  it('retains static packaged imports and the two approved worker bootstrap scripts', () => {
    expect(auditRuntimeSource('import("/runtime/Online.js"); import("./part.mjs"); importScripts(createLastROWorkerScriptUrl("ThreadEventHandler.js"), createLastROWorkerScriptUrl("lastro-resource-loader.js")); setTimeout(() => draw(), 100);')).toEqual([]);
  });

  it('limits the raw HTML capability to the reviewed packaged helper', () => {
    const source = readFileSync('src/runtime/lastro-trusted-dom.mjs', 'utf8');
    for (const file of ['runtime/lastro-trusted-dom.mjs', 'core/runtime/lastro-trusted-dom.mjs']) expect(auditRuntimeSource(source, file)).toEqual([]);
    expect(() => auditRuntimeSource(source, 'runtime/lookalike-trusted-dom.mjs')).toThrow('uncontrolled-html');
    expect(() => auditRuntimeSource(source, 'runtime/nested/lastro-trusted-dom.mjs')).toThrow('uncontrolled-html');
  });

  it('routes every native external navigation call through the restricted helper', () => {
    const native = readFileSync('vendor/v2/Online.js', 'utf8');
    const patched = patchRuntimeNavigation(native);
    expect(patched.match(/openLastROExternalURL\(/g)).toHaveLength(3);
    expect(patched).not.toContain('window.open(');
    expect(patchRuntimeNavigation(patched)).toBe(patched);
  });

  it('removes the native config-driven plugin import entry point', () => {
    const native = readFileSync('vendor/v2/Online.js', 'utf8');
    const patched = patchRuntimePluginLoader(native);
    const region = patched.slice(patched.indexOf('//#region src/Plugins/PluginManager.js'), patched.indexOf('//#region src/UI/Components/PvPTimer/'));
    expect(region).toContain('this.list = []');
    expect(region).not.toContain('Configs.get("plugins"');
    expect(region).not.toContain('import(');
    expect(patchRuntimePluginLoader(patched)).toBe(patched);
    expect(() => patchRuntimePluginLoader('const other = {};')).toThrow('plugin-loader-anchor');
    // This integration check parses the complete native bundle twice.
  }, 15_000);
});
