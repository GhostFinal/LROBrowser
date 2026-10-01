// Animated accessories sometimes repeat one visual loop across character poses.
// Their ACT anchors still belong to the current pose, while the visual loop has
// its own clock. Keep this function self-contained for runtime serialization.
export function sampleLastroCostumeLoop(entity, act, currentAction, direction, tick) {
  const composite = entity?._lastroEquipmentFrame;
  const action = composite?.action ?? entity?.action;
  const animation = composite?.animation ?? entity?.animation;
  const actions = entity?.ACTION;
  if (!entity || !act || !actions || !animation || !Number.isFinite(tick) ||
      action === actions.DIE || (animation.play === false && !animation._lastroEquipmentFinished) ||
      !Array.isArray(act.actions) || !act.actions.length || !Number.isInteger(direction) || direction < 0 || direction > 7) return null;

  const cache = sampleLastroCostumeLoop.cache || (sampleLastroCostumeLoop.cache = {
    acts: new WeakMap(), entities: new WeakMap(),
  });
  let metadata = cache.acts.get(act);
  if (!metadata) {
    metadata = { groups: new WeakMap(), matches: new WeakMap() };
    cache.acts.set(act, metadata);
  }

  function groups(entry, split) {
    if (!entry || !Array.isArray(entry.animations) || !Number.isFinite(entry.delay) || entry.delay <= 0) return null;
    let cached = metadata.groups.get(entry);
    if (!cached) { cached = new Map(); metadata.groups.set(entry, cached); }
    if (cached.has(split)) return cached.get(split);
    const count = entry.animations.length / split;
    let result = null;
    if (Number.isInteger(count) && count >= 2) {
      result = [];
      for (let group = 0; group < split; group++) {
        const frames = entry.animations.slice(group * count, (group + 1) * count);
        const anchor = frames[0]?.pos;
        const validAnchor = Array.isArray(anchor) && anchor.length && anchor.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
        const anchorKey = validAnchor ? JSON.stringify(anchor) : null;
        const signatures = [];
        let valid = !!validAnchor;
        for (const frame of frames) {
          // Animation sound events belong to the original action timeline. Only
          // silent loops can be sampled independently without inventing events.
          if (frame?.sound !== -1 || !Array.isArray(frame.layers) || !frame.layers.length ||
              !frame.layers.every(layer => Number.isInteger(layer?.index) && Array.isArray(layer.pos) && layer.pos.length >= 2 && layer.pos.every(Number.isFinite)) ||
              JSON.stringify(frame.pos) !== anchorKey) { valid = false; break; }
          signatures.push(JSON.stringify(frame.layers));
        }
        result.push(valid && new Set(signatures).size >= 2 ? { frames, anchor, signatures, keys: new Set(signatures) } : null);
      }
    }
    cached.set(split, result);
    return result;
  }

  const idle = act.actions[(actions.IDLE * 8 + direction) % act.actions.length];
  const canonical = groups(idle, 3);
  const isHeadTurn = action === actions.IDLE || action === actions.SIT;
  const candidates = groups(currentAction, isHeadTurn ? 3 : 1);
  const head = Math.max(0, Math.min(2, Number.isInteger(entity.headDir) ? entity.headDir : 0));
  const current = candidates?.[isHeadTurn ? head : 0];
  if (!canonical || !current || currentAction.delay !== idle.delay) return null;

  let matches = metadata.matches.get(currentAction);
  if (!matches) { matches = new Map(); metadata.matches.set(currentAction, matches); }
  const key = direction * 4 + (isHeadTurn ? head : 3);
  let match = matches.get(key);
  if (match === undefined) {
    const choices = isHeadTurn ? [canonical[head]] : canonical;
    const loop = choices.find(candidate => candidate && current.signatures.every(signature => candidate.keys.has(signature)));
    match = loop ? loop.frames.map(frame => ({ ...frame, pos: current.anchor })) : null;
    matches.set(key, match);
  }
  if (!match) return null;

  let clocks = cache.entities.get(entity);
  if (!clocks) { clocks = new WeakMap(); cache.entities.set(entity, clocks); }
  let start = clocks.get(act);
  if (start === undefined) { start = tick; clocks.set(act, start); }
  const index = Math.floor(Math.max(0, tick - start) / idle.delay) % match.length;
  return { animation: match[index], index };
}
