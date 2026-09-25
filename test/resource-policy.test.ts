import { describe, expect, it } from 'vitest';
import { classifyResource } from '../src/resources/resource-policy';

describe('resource policy', () => {
  it.each(['runtime/Online.js', 'workers/client.mjs', 'core/lib.wasm', 'data/script.lua', 'data/script.LUB'])('%s is package-only', (path) => {
    expect(classifyResource(path)).toBe('packaged-executable');
  });

  it.each(['data/map/prt.gat', 'data/sprite/player.spr', 'data/model/player.rsm', 'data/texture/item.bmp', 'bgm/theme.mp3'])('%s is passive', (path) => {
    expect(classifyResource(path)).toBe('remote-passive');
  });

  it.each(['../secret.js', '/absolute/path.js', 'data/unknown.exe', 'data/file.json', 'data/file'])('%s is forbidden', (path) => {
    expect(classifyResource(path)).toBe('forbidden');
  });

  it('normalizes separators and extension case without bypassing the policy', () => {
    expect(classifyResource('data\\texture\\item.BMP')).toBe('remote-passive');
    expect(classifyResource('data\\scripts\\worker.JS')).toBe('packaged-executable');
    expect(classifyResource('data\\scripts\\worker.EXE')).toBe('forbidden');
  });
});
