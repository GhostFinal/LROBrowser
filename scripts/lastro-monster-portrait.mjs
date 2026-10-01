// Render the client's compiled SPR/ACT data without touching the live game's renderer.
// Static idle portraits avoid one animation loop per search result.
export function createMonsterPortraitLoader(Client, pathForId, document) {
  const cache = new Map(), queue = [];
  let active = 0;
  const load = path => new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('Portrait timeout')), 15000);
    const done = value => { globalThis.clearTimeout(timer); resolve(value); };
    const fail = () => { globalThis.clearTimeout(timer); reject(new Error('Portrait unavailable')); };
    try { Client.loadFile(path, done, fail, { to_rgba: true }); } catch { fail(); }
  });
  function compose(spr, act) {
    const layers = (act.actions?.[0]?.animations?.[0]?.layers || []).filter(layer => layer.index >= 0).map(layer => {
      const frame = spr.frames[layer.index + (layer.spr_type === 1 ? spr.old_rgba_index : 0)];
      if (!frame?.width || !frame.height) return null;
      const sx = (layer.scale?.[0] ?? 1) * (layer.is_mirror ? -1 : 1), sy = layer.scale?.[1] ?? 1;
      const angle = (layer.angle || 0) * Math.PI / 180;
      const w = frame.width * Math.abs(sx), h = frame.height * Math.abs(sy);
      const dx = (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2;
      const dy = (Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h) / 2;
      return { layer, frame, sx, sy, angle, dx, dy };
    }).filter(Boolean);
    if (!layers.length) throw new Error('No idle sprite');
    const left = Math.min(...layers.map(p => p.layer.pos[0] - p.dx)), top = Math.min(...layers.map(p => p.layer.pos[1] - p.dy));
    const width = Math.max(...layers.map(p => p.layer.pos[0] + p.dx)) - left;
    const height = Math.max(...layers.map(p => p.layer.pos[1] + p.dy)) - top;
    if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new Error('Invalid sprite bounds');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const scale = Math.min(2, 116 / width, 116 / height);
    ctx.translate((128 - width * scale) / 2 - left * scale, (128 - height * scale) / 2 - top * scale); ctx.scale(scale, scale);
    for (const { layer, frame, sx, sy, angle } of layers) {
      const part = document.createElement('canvas'); part.width = frame.width; part.height = frame.height;
      const context = part.getContext('2d'), pixels = context.createImageData(part.width, part.height);
      const color = layer.color || [1, 1, 1, 1];
      for (let i = 0; i < frame.width * frame.height; i++) {
        const p = i * 4, index = frame.data[i];
        for (let c = 0; c < 4; c++) {
          const value = frame.type === 1 ? frame.data[p + c] : c === 3 ? (index === 0 ? 0 : 255) : spr.palette[index * 4 + c];
          pixels.data[p + c] = value * color[c];
        }
      }
      context.putImageData(pixels, 0, 0);
      ctx.save(); ctx.translate(layer.pos[0], layer.pos[1]); ctx.rotate(angle); ctx.scale(sx, sy);
      ctx.drawImage(part, -frame.width / 2, -frame.height / 2); ctx.restore();
    }
    return canvas.toDataURL('image/png');
  }
  function pump() {
    while (active < 4 && queue.length) {
      const { path, resolve, reject } = queue.shift(); active++;
      Promise.all([load(path + '.spr'), load(path + '.act')]).then(([spr, act]) => compose(spr, act)).then(resolve, reject).finally(() => { active--; pump(); });
    }
  }
  return id => {
    if (cache.has(id)) return cache.get(id);
    const path = pathForId(id);
    if (!path) return Promise.reject(new Error('Unknown monster appearance'));
    const result = new Promise((resolve, reject) => { queue.push({ path, resolve, reject }); pump(); });
    cache.set(id, result);
    // Cache only small composed portraits, not large decoded sprite resources.
    if (cache.size > 128) cache.delete(cache.keys().next().value);
    result.catch(() => { if (cache.get(id) === result) cache.delete(id); });
    return result;
  };
}
