import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchRuntimeDebugAccess } from '../scripts/lastro-debug-access.mjs';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
function region(path: string, source = native) {
  const start = source.indexOf('//#region ' + path), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + path);
  return source.slice(start, end + '//#endregion'.length);
}
function functions(source: string, names: string[]) {
  const file = ts.createSourceFile('fixture.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names.map(name => {
    const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!fn) throw new Error('Missing native function: ' + name);
    return fn.getText(file);
  }).join('\n');
}
const configs = region('src/Core/Configs.js');
const login = region('src/UI/Components/WinLogin/WinLoginCommon.js');
const navigation = region('src/UI/Components/Navigation/Navigation.js');
const consoleManager = region('src/Utils/ConsoleManager.js');
const navigationImport = native.slice(0, native.indexOf('\n'));
const input = [navigationImport, configs, login, navigation, consoleManager].join('\n');
const patched = patchRuntimeDebugAccess(input);

describe('native developer entry points', () => {
  it('closes debug configuration and navigation exposure in the prepared game entry', () => {
    const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
    const context = vm.createContext({ window: { ROConfig: { debug: true, development: true } }, __esmMin: (fn: () => void) => fn });
    vm.runInContext(region('src/Core/Configs.js', runtime) + '\ninit_Configs(); Configs.setServer({ debug: true, debugUseLegacyMapEnter: true });', context);
    expect(vm.runInContext('Configs.get("debug", true)', context)).toBe(false);
    expect(vm.runInContext('Configs.get("debugUseLegacyMapEnter", true)', context)).toBe(false);
    expect(vm.runInContext('Configs.get("development", true)', context)).toBe(false);
    expect(runtime).not.toMatch(/import\s*\{\s*installNavigationDebug\s*\}/);
    expect(runtime).not.toContain('installNavigationDebug(getNavigationDiagnosticState)');
  });

  it('locks debug settings even when mutable server/global configuration requests them', () => {
    const context = vm.createContext({ window: { ROConfig: { debug: true, development: true } }, __esmMin: (fn: () => void) => fn });
    vm.runInContext(region('src/Core/Configs.js', patched) + '\ninit_Configs();', context);
    for (const key of ['debug', 'debugAI', 'development', 'enableConsole', 'packetDump', 'debugUseLegacyMapEnter']) {
      context.setting = key;
      vm.runInContext('Configs.set(setting, true); Configs.setServer({ [setting]: true }); Configs.getServer()[setting] = true;', context);
      expect(vm.runInContext('Configs.get(setting, true)', context)).toBe(false);
    }
    for (const key of ['debugEnterUnknown', 'debugEnterSex']) {
      context.setting = key;
      vm.runInContext('Configs.set(setting, "0xdeadbeef"); Configs.setServer({ [setting]: "0xdeadbeef" });', context);
      expect(vm.runInContext('Configs.get(setting)', context)).toBeNull();
    }
    vm.runInContext('Configs.setServer({ packetver: 20211103 }); Configs.set("enableRefineUI", true);', context);
    expect(vm.runInContext('Configs.get("packetver")', context)).toBe(20211103);
    expect(vm.runInContext('Configs.get("enableRefineUI")', context)).toBe(true);
  });

  it('keeps all login skins and styles intact without constructing a debug panel', () => {
    const context = vm.createContext({ window: { ROConfig: { debug: true } } });
    vm.runInContext(functions(region('src/UI/Components/WinLogin/WinLoginCommon.js', patched),
      ['getDebugLoginPanelMarkup', 'enhanceWinLoginTemplate', 'enhanceWinLoginStyles']), context);
    expect(vm.runInContext('getDebugLoginPanelMarkup()', context)).toBe('');
    for (const name of ['WinLogin', 'WinLoginV2', 'WinLoginV3']) {
      context.name = name; context.html = '<div><input class="user"><input class="pass"></div>'; context.css = '#WinLogin { color:white; }';
      expect(vm.runInContext('enhanceWinLoginTemplate(name, html)', context)).toBe(context.html);
      expect(vm.runInContext('enhanceWinLoginStyles(name, css)', context)).toBe(context.css);
    }
  });

  it('does not install the public navigation debug API or import its module', () => {
    const install = vi.fn();
    const context = vm.createContext({ installNavigationDebug: install, __esmMin: (fn: () => void) => fn });
    vm.runInContext(region('src/UI/Components/Navigation/Navigation.js', patched)
      .replaceAll('import.meta.url', '"isolated-app://synthetic/runtime/Online.js"'), context);
    expect(install).not.toHaveBeenCalled(); expect(context.roNaviDebug).toBeUndefined();
    expect(patched).not.toContain('from "./lastro-navigation-debug.mjs');
  });

  it('keeps console error and warning diagnostics after disabling debug flags', () => {
    const output = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const context = vm.createContext({ console: output, _console: output });
    vm.runInContext(functions(region('src/Utils/ConsoleManager.js', patched), ['toggleConsole'])
      + '\ntoggleConsole(); console.error("fixture failure"); console.warn("fixture warning");', context);
    expect(output.error).toHaveBeenCalledExactlyOnceWith('fixture failure');
    expect(output.warn).toHaveBeenCalledExactlyOnceWith('fixture warning');
    expect(output.log).not.toHaveBeenCalled();
  });

  it.each(['lastro-2x', 'lastro-3x'])('keeps the actual configured %s login hash and does not recalculate it', id => {
    const config = buildClientConfig(getAvailableServerProfile(id), { username: '', password: '' });
    expect(Object.isFrozen(config)).toBe(true); expect(config.development).toBe(false); expect(config.debug).toBe(false);
    const packets: Array<{ HashValue?: string; ID?: string }> = [], recompute = vi.fn(() => { throw new Error('unexpected hash recalculation'); });
    const context = vm.createContext({
      window: { ROConfig: config }, __esmMin: (fn: () => void) => fn,
      SoundManager: { play() {} }, Controller: { getUI: () => ({ remove() {} }) }, WinLoading: { append() {} },
      _server: config.servers[0], _loginID: '',
      Network: { connect: (_host: string, _port: number, callback: (success: boolean) => void) => callback(true),
        sendPacket: (packet: { HashValue?: string; ID?: string }) => packets.push(packet) },
      PACKET: { CA: { EXE_HASHCHECK: class { HashValue = ''; }, LOGIN: class { ID = ''; } } },
      XMLHttpRequest: recompute, SparkMD5: { hash: recompute },
    });
    vm.runInContext(region('src/Core/Configs.js', patched) + '\ninit_Configs(); Configs.setServer(window.ROConfig.servers[0]);\n'
      + functions(region('src/Engine/LoginEngine.js'), ['onConnectionRequest'])
      + '\nonConnectionRequest("fixture-user", "fixture-password");', context);
    expect(packets).toHaveLength(2);
    expect(packets[0]!.HashValue).toBe(Buffer.from(config.clientHash, 'hex').toString('latin1'));
    expect(packets[1]!.ID).toBe('fixture-user'); expect(recompute).not.toHaveBeenCalled();
  });

  it('skips unrelated modules and rejects double patching', () => {
    expect(patchRuntimeDebugAccess('export const unrelated = true;')).toBe('export const unrelated = true;');
    expect(() => patchRuntimeDebugAccess(patched)).toThrow('anchor:debug-access');
  });

  it.each([
    input.replace('static get = (key, defaultValue)', 'static get = (changed, defaultValue)'),
    input.replace('function enhanceWinLoginTemplate(name, htmlText)', 'function renamedTemplate(name, htmlText)'),
    input.replace('installNavigationDebug(getNavigationDiagnosticState)', 'installNavigationDebug(changedSnapshot)'),
    input.replace(navigationImport, ''),
    input.replace('Configs.get("enableConsole", false)', 'Configs.get("changedConsole", false)'),
    configs.slice(0, configs.indexOf('//#endregion')),
    configs + '\n' + configs,
  ])('fails safely when a native debug entry-point anchor drifts', source => {
    expect(() => patchRuntimeDebugAccess(source)).toThrow('anchor:debug-access');
  });
});
