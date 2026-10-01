import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeLuaStartup } from '../scripts/lastro-lua-startup.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const marker = '//#region src/DB/DBManager.js';
const start = native.indexOf(marker);
const region = native.slice(start, native.indexOf('//#endregion', start) + '//#endregion'.length);
const patched = patchRuntimeLuaStartup(region);

function startup(source: string) {
  const file = ts.createSourceFile('DBManager.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'startLua');
  if (found.length !== 1) throw new Error('missing native Lua startup');
  return found[0]!.getText(file);
}

function harness(create: (options: { customWasmUri: string }) => Promise<object>, source = patched) {
  const calls: Array<{ customWasmUri: string }> = [];
  const preloads = vi.fn(async (callback: () => Promise<unknown>) => callback());
  const context = vm.createContext({
    Promise,
    __vitePreload: preloads,
    init_wasmoon_lua5_1: vi.fn(),
    wasmoon_lua5_1_exports: { default: { Lua: { create: (options: { customWasmUri: string }) => {
      calls.push(options);
      return create(options);
    } } } },
    lua: null, HO_AI: null, MER_AI: null, default_HO_AI: null, default_MER_AI: null,
  });
  // The preload URL is metadata for this offline native-function extraction.
  vm.runInContext(startup(source).replaceAll('import.meta.url', '"isolated-app://synthetic/runtime/Online.js"'), context);
  return { context, calls, preloads, start: () => context.startLua() as Promise<void> };
}

describe('native Lua startup under the IWA resource policy', () => {
  it('keeps the actual generated startup entry on the packaged WASM path', async () => {
    const h = harness(async () => ({}), readFileSync('generated/runtime/Online.js', 'utf8'));
    await h.start();
    expect(h.calls).toEqual(Array.from({ length: 5 }, () => ({ customWasmUri: '/core/wasm/liblua5.1.wasm' })));
  });

  it('uses the packaged WASM for all five Lua contexts and preserves their assignments', async () => {
    const instances = Array.from({ length: 5 }, (_, index) => ({ index }));
    let index = 0;
    const h = harness(async () => instances[index++]!);
    await h.start();
    expect(h.calls).toEqual(Array.from({ length: 5 }, () => ({ customWasmUri: '/core/wasm/liblua5.1.wasm' })));
    expect(h.preloads).toHaveBeenCalledOnce();
    expect([h.context.lua, h.context.HO_AI, h.context.MER_AI, h.context.default_HO_AI, h.context.default_MER_AI]).toEqual(instances);
  });

  it('propagates WASM initialization failures without publishing partial Lua contexts', async () => {
    const error = new Error('synthetic packaged WASM failure');
    let index = 0;
    const h = harness(async () => {
      if (index++ === 2) throw error;
      return { index };
    });
    await expect(h.start()).rejects.toBe(error);
    expect(h.calls).toHaveLength(5);
    expect([h.context.lua, h.context.HO_AI, h.context.MER_AI, h.context.default_HO_AI, h.context.default_MER_AI]).toEqual([null, null, null, null, null]);
  });

  it('changes only the startup initializer and preserves the inline binary used by asset extraction', () => {
    const output = patchRuntimeLuaStartup(native);
    const originalStartup = startup(region);
    const patchedStartup = startup(patched);
    const file = ts.createSourceFile('startup.js', originalStartup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const fn = file.statements[0] as ts.FunctionDeclaration;
    const declarations = fn.body!.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
    const initializer = declarations.find(declaration => declaration.name.getText(file) === 'wasmUrl')!.initializer!;
    const expected = originalStartup.slice(0, initializer.getStart(file)) + '"/core/wasm/liblua5.1.wasm"' + originalStartup.slice(initializer.end);
    expect(patchedStartup).toBe(expected);
    expect(output).toBe(native.replace(originalStartup, expected));
    const inlineWasm = native.match(/data:application\/wasm;base64,[a-z\d+/=]+/i)?.[0];
    expect(inlineWasm).toBeDefined();
    expect(output.match(/data:application\/wasm;base64,[a-z\d+/=]+/i)?.[0]).toBe(inlineWasm);
  });

  it('skips modules with no DBManager region', () => {
    expect(patchRuntimeLuaStartup('export const unrelated = true;')).toBe('export const unrelated = true;');
  });

  it.each([
    region.slice(0, region.indexOf('//#endregion')),
    region + '\n' + region,
    region.replace('async function startLua()', 'async function changedLua()'),
    region.replace('async function startLua()', 'function startLua()'),
    region.replace('async function startLua()', 'async function startLua(options)'),
    region.replace('const wasmUrl =', 'const wasmSource ='),
    region.replace('init_liblua5_1()', 'init_other_wasm()'),
    region.replace('liblua5_1_exports', 'other_wasm_exports'),
    region.replace('const wasmUrl = (', 'const extra = 1; const wasmUrl = (').replace('  const CLua = (', '  const wasmUrl = "duplicate"; const CLua = ('),
  ])('fails closed if the native patch anchor drifts', source => {
    expect(() => patchRuntimeLuaStartup(source)).toThrow('anchor:lua-startup:');
  });

  it('rejects applying the patch twice', () => {
    expect(() => patchRuntimeLuaStartup(patched)).toThrow('anchor:lua-startup:already-patched');
  });
});
