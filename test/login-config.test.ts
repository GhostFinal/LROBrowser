import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';

const runtime = readFileSync('.staging/runtime/Online.js', 'utf8');
const configsRegion = runtime.split('//#region src/Core/Configs.js')[1]!.split('//#endregion')[0]!;
const selectLogin = runtime.slice(runtime.indexOf('function selectLoginUIVersion('), runtime.indexOf('var publicName, versionInfo, Controller;'));

describe('native login startup configuration', () => {
  it.each(['lastro-2x', 'lastro-3x'])('initializes renewal before server selection and selects the reference login skin for %s', (id) => {
    const config = buildClientConfig(getAvailableServerProfile(id), { username: '', password: '' });
    const context = vm.createContext({ window: { ROConfig: config }, __esmMin: (init: () => void) => init });
    vm.runInContext(`${configsRegion}\ninit_Configs();`, context);
    // PacketStructure snapshots this flag before LoginEngine sets the server.
    expect(vm.runInContext('Configs.get("renewal") || false', context)).toBe(true);
    vm.runInContext('Configs.setServer(window.ROConfig.servers[0]);', context);
    expect(vm.runInContext('Configs.get("renewal", false)', context)).toBe(true);
    expect(vm.runInContext('Configs.get("packetver")', context)).toBe(20211103);
    expect(config.autoLogin).toBeNull();
    expect(vm.runInContext('Configs.get("disableKorean")', context)).toBe(true);
    expect(vm.runInContext('Configs.get("forceUseAddress")', context)).toBe(true);
    expect(vm.runInContext('Configs.get("networkCharset")', context)).toBe('gbk');
    for (const profile of config.loginServerProfiles.filter(profile => profile.availability === 'available')) {
      context.selectedProfile = profile;
      vm.runInContext('Configs.setServer(selectedProfile);', context);
      expect(vm.runInContext('Configs.get("disableKorean")', context)).toBe(true);
      expect(vm.runInContext('Configs.get("forceUseAddress")', context)).toBe(true);
    }
    context.controller = {
      selectSpecificUIVersion: (version: unknown) => { context.selected = version === null ? 'WinLogin' : version; },
      selectUIVersion: () => { context.selected = 'WinLoginV2'; },
    };
    vm.runInContext(`${selectLogin}\nselectLoginUIVersion(controller, Configs.get("forceLegacyLoginSkin"));`, context);
    expect(context.selected).toBe('WinLogin');
  });
});

// Run the staged engine initialization up to its actual transport call.
// No credentials or real network connections are used.
describe('remote server handoff', () => {
  it.each(['CharEngine', 'MapEngine'])('%s uses the configured public host with the advertised port', (engine) => {
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const region = runtime.split(engine + ' = class ' + engine + ' {')[1]!;
    const start = region.indexOf('static init(');
    const end = region.indexOf('\n\t\t}', start) + '\n\t\t}'.length;
    const init = region.slice(start, end).replace('static init(', 'function init(');
    const connections: unknown[] = [];
    const stop = new Error('transport reached');
    const context = vm.createContext({
      window: { ROConfig: config }, __esmMin: (fn: () => void) => fn,
      BGM: { play() {} }, MapEngine: {}, _server$1: null,
      _mapName: '', _exiting: false, _exitTimer: null,
      Network: {
        utils: { longToIP: () => '127.0.0.1' },
        connect: (host: string, port: number) => { connections.push([host, port]); throw stop; },
      },
    });
    vm.runInContext(configsRegion + '\ninit_Configs(); Configs.setServer(window.ROConfig.servers[0]);', context);
    vm.runInContext(init, context);
    const invocation = engine === 'CharEngine' ? 'init({ ip: 16777343, port: 26570 })' : 'init(16777343, 26571, "prontera")';
    expect(() => vm.runInContext(invocation, context)).toThrow(stop);
    expect(connections).toEqual([['45.248.8.68', engine === 'CharEngine' ? 26570 : 26571]]);
  });
});
