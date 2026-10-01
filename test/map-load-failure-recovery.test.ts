import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLastroMapLoadFailure } from '../scripts/lastro-map-load-diagnostic.mjs';
import { patchMapLoadFailureRecovery } from '../scripts/patch-v2-runtime.mjs';

const source = readFileSync('vendor/v2/Online.js', 'utf8');
const runtime = patchMapLoadFailureRecovery(source);
const file = ts.createSourceFile('Online.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let callback = '';
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'onMapComplete') callback = node.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);

function fixture() {
  const state = { currentMap: 'prontera.gat', loading: true, fog: { exist: true } };
  const cancel = vi.fn(), close = vi.fn(), error = vi.fn(), popup = vi.fn(() => ({ ui: { css: vi.fn() } }));
  const mouse = { intersect: true };
  const bgm = vi.fn();
  const finish = vi.fn();
  const onMapComplete = new Function('DB', 'LastROTools', 'Network', 'console', 'UIManager', 'Mouse', 'BGM', `
    const Renderer = {init:()=>{}, getContext:()=>({}), show:()=>{}, render:()=>{}};
    const SpriteRenderer = {init:()=>{}}, Sky_default = {init:()=>{},setUpCloudData:()=>{}};
    const Damage = {init:()=>{}}, EffectManager = {init:()=>{}};
    const ScreenEffectManager = {init:()=>{},startMapflagEffect:()=>{}};
    const registerPostProcessModules = ()=>{}, JoystickUI_default = {onRestore:()=>{}};
    const Background = {remove: callback=>callback()};
    let MapRenderer;
    ${describeLastroMapLoadFailure.toString()}
    ${callback}
    return (state,success,error)=>{MapRenderer=state;return onMapComplete.call(state,success,error)};
  `)({ getMap: () => null }, { _lastroPanels: { cancelRoute: cancel } }, { close }, { error }, { showErrorBox: popup }, mouse, { play: bgm });
  return { state: Object.assign(state, { onLoad: finish, onRender: () => {} }), cancel, close, error, popup, mouse, bgm, finish, onMapComplete };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as typeof globalThis & { LastROMapLoadFailure?: unknown }).LastROMapLoadFailure;
});

describe('map load failure recovery', () => {
  it('unlocks loading, clears the failed map and stops navigation before the native error popup', () => {
    const f = fixture();
    f.onMapComplete(f.state, false, 'Invalid GND header');
    expect(f.state).toMatchObject({ loading: false, currentMap: '' });
    expect(f.mouse.intersect).toBe(false);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.error).toHaveBeenCalledWith('[LastRO] Map load failed', 'prontera.gat', 'Invalid GND header');
    expect(f.popup).toHaveBeenCalledWith('地图加载失败：prontera。\n原因：地图文件不完整或格式异常\n确认后返回登录，请重新尝试。');
    expect(f.finish).not.toHaveBeenCalled();
  });

  it('keeps the resource and reason available after restarting the client', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const f = fixture();
    f.state.currentMap = 'ein_fild04.gat';
    f.onMapComplete(f.state, false, 'Unable to resolve resource (logical path): data/ein_fild04.gnd [download-timeout-60000ms]');
    const saved = JSON.parse(setItem.mock.calls[0]![1]);
    expect(saved).toMatchObject({ map: 'ein_fild04', resource: 'data/ein_fild04.gnd', category: 'timeout' });
    expect(f.popup).toHaveBeenCalledWith(expect.stringContaining('文件：data/ein_fild04.gnd'));
  });

  it('still shows the native error when diagnostic storage is unavailable', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('unavailable'); } });
    const f = fixture();
    expect(() => f.onMapComplete(f.state, false, 'http-503')).not.toThrow();
    expect(f.popup).toHaveBeenCalledWith(expect.stringContaining('地图资源下载失败'));
  });

  it('preserves successful loading and the native render completion', () => {
    const f = fixture();
    f.onMapComplete(f.state, true);
    expect(f.state).toMatchObject({ loading: false, currentMap: 'prontera.gat', fog: { exist: false } });
    expect(f.finish).toHaveBeenCalledOnce();
    expect(f.bgm).toHaveBeenCalledWith('01.mp3');
    expect(f.close).not.toHaveBeenCalled();
    expect(f.popup).not.toHaveBeenCalled();
    expect(f.mouse.intersect).toBe(true);
  });

  it.each(['', 'function onMapComplete(success,error){}', 'function onMapComplete(success,error){if(!success){return;}}',
    'function onMapComplete(success,error){if(!success){UIManager.showErrorBox(error)}}function onMapComplete(success,error){}'])('rejects changed or missing anchors', input => {
    expect(() => patchMapLoadFailureRecovery(input)).toThrow('anchor:map-load-failure');
  });

  it('rejects applying recovery twice', () => {
    expect(() => patchMapLoadFailureRecovery(runtime)).toThrow('anchor:map-load-failure');
  });
});
