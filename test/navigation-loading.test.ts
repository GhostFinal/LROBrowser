import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
const loader = runtime.slice(runtime.indexOf('function loadLuaValue('), runtime.indexOf('function loadMapTbl(')).split('/**')[0]!;
const navPath = runtime.indexOf('DB.LUA_PATH + "navigation/"');
const start = runtime.lastIndexOf('if (PacketVerManager_default.value >= 20111010)', navPath);
const navigation = runtime.slice(start, runtime.indexOf('if (PacketVerManager_default.value >= 20150507)', navPath));
const root = 'data/luafiles514/lua files/navigation/';
const manifest = JSON.parse(readFileSync('generated/core/executable-assets.json', 'utf8'));

describe('navigation database loading', () => {
  it('loads all six LastRO tables from executable assets present in the package', () => {
    const requests: string[] = [];
    const completed: string[] = [];
    const context = vm.createContext({
      DB: { LUA_PATH: 'data/luafiles514/lua files/' }, Configs: { get: () => true },
      PacketVerManager_default: { value: 20211103 },
      NaviMapTable: {}, NaviMobTable: [], NaviNpcTable: {}, NaviLinkTable: {}, NaviLinkDistanceTable: {}, NaviNpcDistanceTable: {},
      onLoad: (name: string) => () => completed.push(name),
      loadLuaValue: (path: string, _variable: string, callback: (value: object) => void, done: () => void) => {
        requests.push(path);
        expect(manifest.files.some((file: { path: string }) => file.path === path), path).toBe(true);
        expect(readFileSync('generated/core/' + path).byteLength).toBeGreaterThan(0);
        callback({}); done();
      },
    });
    vm.runInContext(navigation, context);
    expect(requests).toEqual(['map', 'mob', 'npc', 'link', 'linkdistance', 'npcdistance'].map(name => root + 'navi_' + name + '_tw.lub'));
    expect(completed).toEqual(['navigation maps', 'navigation mobs', 'navigation NPCs', 'navigation links', 'navigation distances', 'navigation NPC distances']);
  });

  it('finishes all five failed navigation loads instead of leaving progress at 36/41', async () => {
    let index = 36;
    const pending = new Set(['map', 'npc', 'link', 'linkdistance', 'npcdistance']);
    const callbacks: Array<() => void> = [];
    const context = vm.createContext({
      console: { log() {}, error: vi.fn() },
      Client: { loadFile: (_path: string, _success: unknown, failure?: (error: Error) => void) => {
        callbacks.push(() => failure?.(new Error('missing packaged navigation file')));
      } },
      complete: (name: string) => { pending.delete(name); index++; },
    });
    vm.runInContext(loader, context);
    for (const name of [...pending]) {
      context.name = name;
      vm.runInContext('loadLuaValue("missing.lub", "Navi_Map", () => {}, complete.bind(null, name));', context);
    }
    for (const callback of callbacks) callback();
    expect(index).toBe(41);
    expect(pending.size).toBe(0);
  });

  it('keeps successful Lua extraction and completion intact', async () => {
    let receive!: (bytes: Uint8Array) => Promise<void>;
    const done = vi.fn();
    const loaded = vi.fn();
    const ctx: { extractValue?: (value: string) => void } = {};
    const context = vm.createContext({
      console: { log() {}, error: vi.fn() }, ArrayBuffer, Uint8Array,
      Client: { loadFile: (_path: string, success: typeof receive) => { receive = success; } },
      lua: { ctx, mountFile() {}, doFile: async () => {}, unmountFile() {}, doStringSync: () => ctx.extractValue!('["prontera"]') },
      userStringDecoder: { decode: (value: string) => value }, done, loaded,
    });
    vm.runInContext(loader + '\nloadLuaValue("map.lub", "Navi_Map", loaded, done);', context);
    await receive(new Uint8Array([1]));
    expect(loaded).toHaveBeenCalledWith(['prontera']);
    expect(done).toHaveBeenCalledOnce();
  });
});
