import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { patchNavigationPendingTargets } from '../scripts/patch-v2-runtime.mjs';

let source: string;
let runtime: string;
let createHarness: () => Harness;
beforeAll(async () => {
  source = await readFile(new URL('../vendor/v2/Online.js', import.meta.url), 'utf8');
  runtime = patchNavigationPendingTargets(source);
  createHarness = harnessFactory(runtime);
});

interface Target { map: string; x: number; y: number; }
interface Harness {
  request: (map: string, x: number, y: number) => void;
  show: () => void;
  clear: () => void;
  tick: () => void;
  pending: () => number;
  ready: () => void;
  paths: number[][];
  state: () => { finalTarget: Target | null; target: Target | null };
}

function harnessFactory(runtime: string): () => Harness {
  const marker = '//#region src/UI/Components/Navigation/Navigation.js';
  const start = runtime.indexOf(marker), end = runtime.indexOf('//#endregion', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(runtime.lastIndexOf(marker)).toBe(start);
  expect(end).toBeGreaterThan(start);
  const file = ts.createSourceFile('Navigation.js', runtime.slice(start, end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['Navigation.navigateTo', 'Navigation.waitForMapData', 'Navigation.show', 'Navigation.clear']);
  const functions: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
        && ts.isIdentifier(node.left.expression) && node.left.expression.text === 'Navigation'
        && names.has('Navigation.' + node.left.name.text)) functions.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(functions).toHaveLength(4);
  // Execute only these pinned native functions with local stubs: no GUI, worker or Network exists.
  return new Function(`
    let _finalTargetData = null, _targetData = null, _mapData = null, _isMapClickTarget = false, locked = false;
    const scheduled = [], paths = [];
    const setTimeout = callback => scheduled.push(callback);
    const getCurrentMap = () => 'izlude_in';
    const getPlayerPosition = () => ({x:48, y:114});
    const normalizeMapName = x => x.replace(/\\.gat$/i, '');
    const initializePathFindingWorker = () => {};
    const resetPathFindingWorker = () => { locked = false; };
    const MapPathFinder = {findPathBetweenMaps: (_s,_x,_y,endMap,endX,endY) => [{map:'izlude_in', x:endMap==='izlude'?48:endX, y:endMap==='izlude'?114:endY}]};
    const Navigation = {
      getRoot: () => ({querySelector: () => null}), clearPath: () => { locked = false; },
      setTargetCoordinatesText: () => {}, setTargetCoordinatesBlinking: () => {},
      setMapNameText: () => {}, setLocationTitle: () => {}, ui:{show:()=>{}},
      findClosestWalkableCell: (x,y) => ({x,y}),
      findPath: (_sx,_sy,x,y) => { if (!locked) { paths.push([x,y]); locked = true; } }
    };
    ${functions.join(';\n')};
    return {
      request: (endMap,endX,endY) => Navigation.navigateTo({startMap:'izlude_in', startX:48, startY:114, endMap,endX,endY}),
      show: () => Navigation.show(), clear: () => Navigation.clear(), paths,
      tick: () => { const pending = scheduled.splice(0); for (const callback of pending) callback(); },
      pending: () => scheduled.length,
      ready: () => { _mapData = {map:'izlude_in'}; const pending = scheduled.splice(0); for (const callback of pending) callback(); },
      state: () => ({finalTarget:_finalTargetData, target:_targetData})
    };
  `) as () => Harness;
}

describe('native Navigation pending target guard', () => {
  it('prevents an old target replayed by show from occupying the worker before the current request', () => {
    const f = createHarness();
    f.request('izlude', 110, 180);
    f.show();
    f.request('izlude_in', 60, 123);
    f.ready();
    expect(f.paths).toEqual([[60, 123]]);
    expect(f.state().target).toMatchObject({ map: 'izlude_in', x: 60, y: 123 });
  });

  it('does not revive a cleared or logged-out target when its map wait completes', () => {
    const f = createHarness();
    f.request('izlude_in', 60, 123);
    f.clear();
    f.ready();
    expect(f.paths).toEqual([]);
    expect(f.state()).toEqual({ finalTarget: null, target: null });
  });

  it('stops the next waiting tick after cancellation even while the map remains unavailable', () => {
    const f = createHarness();
    f.request('izlude_in', 60, 123);
    expect(f.pending()).toBe(1);
    f.tick();
    expect(f.pending()).toBe(1);
    f.clear();
    f.tick();
    expect(f.pending()).toBe(0);
    expect(f.paths).toEqual([]);
    expect(f.state()).toEqual({ finalTarget: null, target: null });
  });

  it('allows the latest request after clearing an older pending target', () => {
    const f = createHarness();
    f.request('izlude', 110, 180);
    f.clear();
    f.request('izlude_in', 60, 123);
    f.ready();
    expect(f.paths).toEqual([[60, 123]]);
  });

  it('keeps normal current-target navigation working', () => {
    const f = createHarness();
    f.request('izlude_in', 60, 123);
    f.ready();
    expect(f.paths).toEqual([[60, 123]]);
    expect(f.state().finalTarget).toMatchObject({ map: 'izlude_in', x: 60, y: 123 });
  });

  it.each([
    '',
    'Navigation.navigateTo = function() { this.waitForMapData(function() {}); };',
    'Navigation.navigateTo = function() { _finalTargetData = {}; _finalTargetData = {}; this.waitForMapData(function() {}); };',
    'Navigation.navigateTo = function() { _finalTargetData = {}; };',
    'Navigation.navigateTo = function() { _finalTargetData = {}; this.waitForMapData(function() {}); this.waitForMapData(function() {}); };',
    'Navigation.navigateTo = function() { _finalTargetData = {}; this.waitForMapData(() => {}); };',
    'Navigation.navigateTo = function() { _finalTargetData = {}; this.waitForMapData(function() {}); }; Navigation.navigateTo = function() {};',
  ])('rejects missing or ambiguous pinned navigation anchors', runtime => {
    const waiter = 'Navigation.waitForMapData = function(callback) { setTimeout(() => Navigation.waitForMapData(callback), 100); };';
    expect(() => patchNavigationPendingTargets(waiter + runtime)).toThrow('anchor:navigation-pending-targets');
  });

  it('rejects a missing or changed native waiter recursion anchor', () => {
    const navigation = 'Navigation.navigateTo = function() { _finalTargetData = {}; this.waitForMapData(function() {}); };';
    expect(() => patchNavigationPendingTargets(navigation)).toThrow('anchor:navigation-pending-targets');
    expect(() => patchNavigationPendingTargets(navigation + 'Navigation.waitForMapData = function(callback) { callback(); };')).toThrow('anchor:navigation-pending-targets');
  });

  it('rejects applying the guard twice', () => {
    expect(() => patchNavigationPendingTargets(runtime)).toThrow('anchor:navigation-pending-targets');
  });
});
