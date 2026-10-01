import ts from 'typescript';
import { sampleLastroCostumeLoop } from './lastro-costume-loop.mjs';

function replaceExact(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error('anchor:equipment-animation:' + label);
  return source.replace(needle, replacement);
}

// Body and equipment are separate ACTs. Keep their own frame counts while
// sampling the same action and clock for one composite draw. Pose-linked gear
// follows the body's walking phase; head accessories retain their ACT timing.
function lastroBeginEquipmentFrame(entity, tick, client, camera, calculate) {
  const previous = entity._lastroEquipmentFrame;
  const frame = { previous, tick, action: entity.action, animation: { ...entity.animation }, bodyAction: null, bodyFrame: null, anchor: [0, 0], completed: null };
  entity._lastroEquipmentFrame = frame;
  try {
    const body = entity.files.body;
    const act = body?.act && client.loadFile(body.act);
    if (body?.spr && client.loadFile(body.spr) && act?.actions?.length) {
      const direction = (camera.direction + entity.direction + 8) % 8;
      frame.bodyAction = act.actions[(frame.action * 8 + direction) % act.actions.length];
      if (frame.bodyAction?.animations?.length) {
        frame.bodyFrame = calculate(entity, frame.bodyAction, 'body', tick - frame.animation.tick);
        const anchor = frame.bodyAction.animations[frame.bodyFrame]?.pos?.[0];
        if (anchor) frame.anchor = [anchor.x, anchor.y];
      }
    }
    return frame;
  } catch (error) {
    entity._lastroEquipmentFrame = previous;
    throw error;
  }
}

function lastroEndEquipmentFrame(entity, frame) {
  entity._lastroEquipmentFrame = frame.previous;
  if (frame.completed && entity.action === frame.action && entity.animation.tick === frame.animation.tick) {
    entity.animation.frame = frame.completed.frame;
    entity.animation.play = false;
    entity.animation._lastroEquipmentFinished = true;
    if (frame.completed.next) entity.setAction(frame.completed.next);
  }
}

export function patchRuntimeEquipmentAnimation(source) {
  const marker = '//#region src/Renderer/Entity/EntityRender.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:equipment-animation:region');
  const region = source.slice(start, end).replace(/\r\n/g, '\n');
  const file = ts.createSourceFile('EntityRender.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function one(predicate, label) {
    const nodes = [];
    function visit(node) { if (predicate(node)) nodes.push(node); ts.forEachChild(node, visit); }
    visit(file);
    if (nodes.length !== 1) throw new Error('anchor:equipment-animation:' + label);
    return nodes[0];
  }
  function change(node, update) {
    edits.push({ start: node.getStart(file), end: node.end, text: update(node.getText(file)) });
  }
  const delay = one(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getAnimationDelay', 'delay');
  change(delay.body, original => replaceExact(original, '{', '{\n  const action = entity._lastroEquipmentFrame?.action ?? entity.action;', 'delay-body').replaceAll('entity.action ===', 'action ==='));
  const calculate = one(node => ts.isFunctionDeclaration(node) && node.name?.text === 'calcAnimation', 'calculate');
  change(calculate.body, original => {
    let output = replaceExact(original, 'const action = entity.action;', 'const frame = entity._lastroEquipmentFrame;\n  const action = frame?.action ?? entity.action;', 'action');
    output = replaceExact(output, 'const animation = entity.animation;', 'const animation = frame?.animation ?? entity.animation;', 'animation');
    output = replaceExact(output, '  if (animation.play === false) {', '  if (animation.play === false) {\n    if (animation._lastroEquipmentFinished) return Math.max(animSize - 1, 0);', 'finished-frame');
    output = replaceExact(output, '    action === ACTION.WALK &&\n    entity.walk &&',
      '    action === ACTION.WALK &&\n    type !== "head" &&\n    entity.walk &&', 'walk-parts');
    const phaseStart = output.indexOf('    const motionSpeed = Math.max(act.delay || 1, 1);');
    const phaseEnd = output.indexOf('    let motion = Math.floor(phase);', phaseStart);
    if (phaseStart < 0 || phaseEnd < 0 || !output.slice(phaseStart, phaseEnd).includes('entity.walk._motionPhaseTick')) throw new Error('anchor:equipment-animation:walk-phase');
    output = output.slice(0, phaseStart) + `    const motionSpeed = Math.max((frame?.bodyAction || act).delay || 1, 1);
    const phase = (entity.walk.dist * WALK_DIST_TO_MOTION) / motionSpeed;
` + output.slice(phaseEnd);
    output = replaceExact(output, 'Math.min((tick / delay) | 0, animCount || animCount - 1)', 'Math.min(Math.max((tick / delay) | 0, 0), Math.max(animCount - 1, 0))', 'last-frame');
    return replaceExact(output, `    animation.frame = anim = lastFrame;
    animation.play = false;
    if (animation.next) entity.setAction(animation.next);`, `    anim = lastFrame;
    if (frame) frame.completed = { frame: lastFrame, next: animation.next };
    else {
      animation.frame = lastFrame;
      animation.play = false;
      animation._lastroEquipmentFinished = true;
      if (animation.next) entity.setAction(animation.next);
    }`, 'complete');
  });
  const render = one(node => ts.isFunctionExpression(node) && node.name?.text === '_renderEntity', 'render');
  change(render.body, original => {
    let output = replaceExact(original, '      if (this.gr2) return;', `      if (this.gr2) return;
      const lastroFrame = lastroBeginEquipmentFrame(this, Date.now(), Client, Camera, calcAnimation);
      try {`, 'begin');
    const finish = '      SpriteRenderer.zIndex = 1;\n    }';
    return replaceExact(output, finish, `      SpriteRenderer.zIndex = 1;
      } finally { lastroEndEquipmentFrame(this, lastroFrame); }
    }`, 'end');
  });
  const element = one(node => ts.isFunctionExpression(node) && node.name?.text === '_renderElement', 'element');
  change(element.body, original => {
    let output = replaceExact(original, '      const action =\n', '      const frame = entity._lastroEquipmentFrame;\n      const action =\n', 'element-frame');
    output = replaceExact(output, 'entity.action * 8 +', '(frame?.action ?? entity.action) * 8 +', 'element-action');
    output = replaceExact(output, 'const animation_id = calcAnimation(', `const costumeLoop = type === "head" && files !== entity.files.head
        ? sampleLastroCostumeLoop(entity, act, action, (Camera.direction + entity.direction + 8) % 8, frame?.tick ?? Date.now())
        : null;
      const animation_id = costumeLoop ? costumeLoop.index : type === "body" && frame?.bodyFrame !== null && frame?.bodyFrame !== undefined ? frame.bodyFrame : calcAnimation(`, 'body-frame');
    output = replaceExact(output, 'const animation = action.animations[animation_id];', 'const animation = costumeLoop?.animation || action.animations[animation_id];', 'costume-frame');
    output = replaceExact(output, 'Date.now() - entity.animation.tick,', '(frame?.tick ?? Date.now()) - (frame?.animation ?? entity.animation).tick,', 'element-clock');
    output = replaceExact(output, '          entity.action,', '          frame?.action ?? entity.action,', 'sound-action');
    output = replaceExact(output, '_position[0] = position[0] - animation.pos[0].x;', '_position[0] = (frame?.anchor[0] ?? position[0]) - animation.pos[0].x;', 'anchor-x');
    output = replaceExact(output, '_position[1] = position[1] - animation.pos[0].y;', '_position[1] = (frame?.anchor[1] ?? position[1]) - animation.pos[0].y;', 'anchor-y');
    // Robe/weapon ACTs use their own absolute layer positions and must not
    // replace the body attachment anchor used by head and accessory layers.
    return replaceExact(output, 'if (is_main && animation.pos.length)', 'if (type === "body" && animation.pos.length)', 'anchor-owner');
  });
  let output = region;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const helpers = '\n' + lastroBeginEquipmentFrame.toString() + '\n' + lastroEndEquipmentFrame.toString() + '\n' + sampleLastroCostumeLoop.toString();
  const rendererPatched = source.slice(0, start) + output.replace(marker, marker + helpers) + source.slice(end);
  // A natural completion freezes each ACT at its own last frame. Explicit
  // setAction requests still select their supplied frame, even in the same tick.
  const actionMarker = '//#region src/Renderer/Entity/EntityAction.js';
  const actionStart = rendererPatched.indexOf(actionMarker);
  const actionEnd = rendererPatched.indexOf('//#endregion', actionStart);
  if (actionStart < 0 || actionEnd < 0 || rendererPatched.indexOf(actionMarker, actionStart + actionMarker.length) >= 0) throw new Error('anchor:equipment-animation:action-region');
  const actionRegion = rendererPatched.slice(actionStart, actionEnd);
  const actionOutput = replaceExact(actionRegion, 'anim.tick = Date.now() + 0;', 'anim.tick = Date.now() + 0;\n    anim._lastroEquipmentFinished = false;', 'reset-finished');
  return rendererPatched.slice(0, actionStart) + actionOutput + rendererPatched.slice(actionEnd);
}
