import { describe, expect, it } from 'vitest';
import { auditRuntimeSource } from '../scripts/audit-runtime-code.mjs';
import { patchElectronRequireFallbacks, patchRuntimeNavigation, patchRuntimePluginLoader } from '../scripts/patch-csp-runtime.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const pluginInitFixture = `Plugins.init = function init(context) {
  if (_initialized) return;
  _initialized = true;
  this.list = Configs.get("plugins", {});
  for (const value of Object.values(this.list)) import("./" + value);
};`;

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
    expect(patched.match(/import \{ openLastROExternalURL \}/g)).toHaveLength(1);
    expect(patched.match(/openLastROExternalURL\(url\)/g)).toHaveLength(2);
    expect(patched).toContain('openLastROExternalURL(DB.getMessage(3301))');
    expect(patched).not.toContain('window.open(');
    // Parse the full native bundle once; exercise idempotency on small fixtures below.
  }, 15_000);

  it.each(['window', 'globalThis', 'self'])('rewrites %s.open with only its URL argument', receiver => {
    const source = `const opened = ${receiver}.open(makeURL(path), "_blank", "popup");`;
    const patched = patchRuntimeNavigation(source);
    expect(patched).toBe('import { openLastROExternalURL } from "./lastro-trusted-dom.mjs";\nconst opened = openLastROExternalURL(makeURL(path));');
    expect(patchRuntimeNavigation(patched)).toBe(patched);
  });

  it('rewrites calls inside different scopes while preserving unrelated methods, comments and strings', () => {
    const source = `// window.open(commentURL)
const text = "self.open(stringURL)";
const untouched = widget.open(localURL);
window.open(firstURL);
if (ready) globalThis.open(secondURL, "named");
const navigate = () => self.open(thirdURL, "_self");`;
    const expected = `import { openLastROExternalURL } from "./lastro-trusted-dom.mjs";
// window.open(commentURL)
const text = "self.open(stringURL)";
const untouched = widget.open(localURL);
openLastROExternalURL(firstURL);
if (ready) openLastROExternalURL(secondURL);
const navigate = () => openLastROExternalURL(thirdURL);`;
    const patched = patchRuntimeNavigation(source);
    expect(patched).toBe(expected);
    expect(patchRuntimeNavigation(patched)).toBe(patched);
  });

  it('leaves source without native global navigation unchanged and adds no helper import', () => {
    const source = '// globalThis.open(url)\nconst text = "window.open(url)";\nwidget.open(url);';
    expect(patchRuntimeNavigation(source)).toBe(source);
  });

  it.each(['window', 'globalThis', 'self'])('rejects %s.open without a URL', receiver => {
    expect(() => patchRuntimeNavigation(`${receiver}.open();`)).toThrow('navigation-missing-url');
  });

  it('removes the native config-driven plugin import entry point', () => {
    const native = readFileSync('vendor/v2/Online.js', 'utf8');
    const patched = patchRuntimePluginLoader(native);
    const start = patched.indexOf('//#region src/Plugins/PluginManager.js');
    const end = patched.indexOf('//#region src/UI/Components/PvPTimer/');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const region = patched.slice(start, end);
    expect(region).toContain('this.list = []');
    expect(region).not.toContain('Configs.get("plugins"');
    expect(region).not.toContain('import(');
    // Check the real patched region's idempotency without parsing unrelated native modules again.
    expect(patchRuntimePluginLoader(region)).toBe(region);
  }, 15_000);

  it('replaces only the unique plugin initialization body and remains idempotent', () => {
    const source = `const before = 1;\n${pluginInitFixture}\nconst after = 2;`;
    const patched = patchRuntimePluginLoader(source);
    expect(patched).toBe(`const before = 1;
Plugins.init = function init(context) {
    if (_initialized) return;
    _initialized = true;
    this.list = [];
    // IWA features are statically imported from the verified package.
  };
const after = 2;`);
    expect(patchRuntimePluginLoader(patched)).toBe(patched);
  });

  it.each([
    undefined,
    {},
    { unsafe: 'https://evil.invalid/plugin.mjs' },
    { unsafe: { path: 'plugin.mjs', pars: { enabled: true } } },
  ])('initializes without consulting plugin configuration: %j', configured => {
    let configReads = 0;
    const plugins: { list: unknown[]; init?: (context: unknown) => void } = { list: ['stale'] };
    const context = {
      _initialized: false,
      Plugins: plugins,
      Configs: { get: () => { configReads++; return configured; } },
    };
    runInNewContext(patchRuntimePluginLoader(pluginInitFixture), context);
    expect(typeof plugins.init).toBe('function');
    plugins.init!({});
    expect(configReads).toBe(0);
    expect(context._initialized).toBe(true);
    expect(plugins.list).toEqual([]);
    const registered = [{ name: 'packaged-feature' }];
    plugins.list = registered;
    plugins.init!({});
    expect(configReads).toBe(0);
    expect(plugins.list).toBe(registered);
  });

  it.each([
    'const other = {};',
    'Other.init = function init() {};',
    'Plugins.init = () => {};',
    `${pluginInitFixture}\n${pluginInitFixture}`,
  ])('rejects a missing or ambiguous plugin function anchor: %s', source => {
    expect(() => patchRuntimePluginLoader(source)).toThrow('plugin-loader-anchor');
  });
});
