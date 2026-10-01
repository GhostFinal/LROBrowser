import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractWorldMapFixture } from '../scripts/extract-worldmap-fixture.mjs';

const fixture = extractWorldMapFixture(readFileSync('generated/runtime/Online.js', 'utf8'));
function setup(type = 1) {
  const pixels: Uint8ClampedArray[] = [];
  const ctx = { imageSmoothingEnabled: true, translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (p: { data: Uint8ClampedArray }) => pixels.push(p.data) };
  const document = { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,portrait' })) };
  const spr = { frames: [{ type, width: 2, height: 1, data: type ? [200, 100, 50, 255, 40, 80, 120, 128] : [0, 1] }], old_rgba_index: 0, palette: [255, 255, 255, 255, 40, 80, 120, 255] };
  const act = { actions: [{ animations: [{ layers: [{ index: 0, spr_type: 0, is_mirror: 1, pos: [12, -32], scale: [2, 1], color: [0.5, 1, 1, 1], angle: 90 }] }] }] };
  const loadFile = vi.fn((path: string, done: (value: unknown) => void, _fail: () => void, _options: unknown) => { void _fail; void _options; done(path.endsWith('.spr') ? spr : act); });
  const loader = runInNewContext(`(${fixture.createMonsterPortraitLoader})({loadFile}, id=>id>0?'monster/'+id:null, document)`, { loadFile, document, setTimeout, clearTimeout });
  return { loader, loadFile, ctx, pixels, spr, act };
}
afterEach(() => vi.useRealTimers());
describe('packaged monster portrait renderer', () => {
  it('composes native compiled RGBA frames, color, mirror and rotation without a game renderer', async () => {
    const f = setup(); expect(await f.loader(1002)).toContain('data:image/png');
    expect(f.loadFile.mock.calls.map(c => c[0])).toEqual(['monster/1002.spr', 'monster/1002.act']);
    expect(f.loadFile.mock.calls[0]![3]).toEqual({ to_rgba: true });
    expect([...f.pixels[0]!]).toEqual([100, 100, 50, 255, 20, 80, 120, 128]);
    expect(f.ctx.scale).toHaveBeenCalledWith(-2, 1);
    expect(f.ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  });
  it('supports indexed sprites with transparent palette index zero', async () => {
    const f = setup(0); await f.loader(1002);
    expect([...f.pixels[0]!].slice(4)).toEqual([20, 80, 120, 255]); expect(f.pixels[0]![3]).toBe(0);
  });
  it('deduplicates loads and caches the small portrait, not new renderers', async () => {
    const f = setup(); const first = f.loader(1002); expect(f.loader(1002)).toBe(first);
    await first; await f.loader(1002); expect(f.loadFile).toHaveBeenCalledTimes(2);
  });
  it('rejects unmapped appearances instead of substituting a different monster', async () => {
    const f = setup(); await expect(f.loader(0)).rejects.toThrow('Unknown monster'); expect(f.loadFile).not.toHaveBeenCalled();
  });
  it('times out missing callbacks and permits retry', async () => {
    vi.useFakeTimers(); const f = setup(); f.loadFile.mockImplementation(() => {});
    const result = f.loader(1002); const assertion = expect(result).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(15000); await assertion;
    f.loadFile.mockImplementation((path, done) => done(path.endsWith('.spr') ? f.spr : f.act));
    await expect(f.loader(1002)).resolves.toContain('data:image/png');
  });
  it('rejects empty sprites without a broken image or stale failure cache', async () => {
    const f = setup(); f.act.actions[0]!.animations[0]!.layers = [];
    await expect(f.loader(1002)).rejects.toThrow('No idle sprite');
  });
});
