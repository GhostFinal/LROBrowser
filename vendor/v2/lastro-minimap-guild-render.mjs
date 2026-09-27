/**
 * Render guild member triangles on a minimap canvas.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {Array<{x: number, y: number}>} guild
 * @param {(x: number) => number} projectX
 * @param {(y: number) => number} projectY
 */
export function renderGuildMemberMarks(context, guild, projectX, projectY) {
  if (!context || !guild?.length) return;

  context.beginPath();
  for (const dot of guild) {
    context.moveTo(projectX(dot.x), projectY(dot.y) - 4);
    context.lineTo(projectX(dot.x) + 4, projectY(dot.y) + 4);
    context.lineTo(projectX(dot.x) - 4, projectY(dot.y) + 4);
    context.lineTo(projectX(dot.x), projectY(dot.y) - 4);
  }

  context.stroke();
  context.fill();
}

/**
 * Keep cached guild markers aligned with the live map entities.
 *
 * @param {Array<{key: number, x: number, y: number}>} guild
 * @param {(key: number) => {position?: ArrayLike<number>}|null|undefined} getEntity
 */
export function syncGuildMemberMarkPositions(guild, getEntity) {
  if (!guild?.length || typeof getEntity !== 'function') return;

  for (const dot of guild) {
    const position = getEntity(dot.key)?.position;
    if (!position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
    dot.x = position[0];
    dot.y = position[1];
  }
}
