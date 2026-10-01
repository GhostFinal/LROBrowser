import { describe, expect, it } from 'vitest';
import { resolveLastroMapResourceName } from '../scripts/lastro-map-resource-name.mjs';

describe('native map resource aliases', () => {
  it('applies the same one-step alias as the map loader without changing the packet map name', () => {
    expect(resolveLastroMapResourceName('data/prt_evt.gnd', { 'prt_evt.gnd': 'prontera.gnd', 'prontera.gnd': 'another.gnd' })).toBe('data/prontera.gnd');
    expect(resolveLastroMapResourceName('data/prontera.gnd')).toBe('data/prontera.gnd');
  });
  it('preserves the exact case and directory key from the RSW header', () => {
    expect(resolveLastroMapResourceName('data/MAP\\Ground.GND', { 'MAP\\Ground.GND': 'actual.gnd', 'map\\ground.gnd': 'wrong.gnd' })).toBe('data/actual.gnd');
    expect(resolveLastroMapResourceName('data/PRONTERA.gnd', { 'prontera.gnd': 'another.gnd' })).toBe('data/PRONTERA.gnd');
  });
  it.each(['', '../prontera.gnd', 'nested/../prontera.gnd', '/prontera.gnd', 'https://example.com/prontera.gnd', 'prontera\0.gnd', 'prontera.rsw', 3, null])('rejects unsafe or wrong-type aliases: %s', mapped => {
    expect(() => resolveLastroMapResourceName('data/prontera.gnd', { 'prontera.gnd': mapped })).toThrow('地图资源别名无效');
  });
  it('requires a relative map resource input', () => {
    expect(() => resolveLastroMapResourceName('prontera.gnd')).toThrow('地图资源路径无效');
  });
});
