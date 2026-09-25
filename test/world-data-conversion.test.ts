import { describe, expect, it } from 'vitest';
import { convertAmdData } from '../scripts/convert-world-data.mjs';

describe('world data conversion', () => {
  it('converts safe AMD literal factories and preserves nested game fields', () => {
    const source = `define(function() {\n  "use strict";\n  var world = {};\n  world = { "prontera": { name: "普隆德拉", branch: ["prt_dun"], mobs: [1002] } };\n  return world;\n});`;
    expect(convertAmdData(source)).toEqual({ prontera: { name: '普隆德拉', branch: ['prt_dun'], mobs: [1002] } });
    expect(convertAmdData('define(function() { return { "1002": { kName: "波利", LV: "1", DropsNum: 1, Drop0id: 909, Drop0per: 7000 } }; });'))
      .toMatchObject({ '1002': { kName: '波利', LV: '1', Drop0id: 909 } });
  });

  it.each([
    'define(function() { return fetch("https://bad.invalid/x"); });',
    'define(function() { return { value: Function("return 1")() }; });',
    'console.log("side effect"); define(function() { return {}; });',
    'define(function() { return { value: unknownGlobal }; });',
  ])('rejects executable or unexpected AMD code: %s', source => {
    expect(() => convertAmdData(source)).toThrow();
  });
});
