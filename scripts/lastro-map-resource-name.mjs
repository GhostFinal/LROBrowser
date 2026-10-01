export function resolveLastroMapResourceName(filename, aliases = {}) {
  if (typeof filename !== 'string' || !/^data[\\/]/.test(filename)) throw new Error('地图资源路径无效');
  const logicalName = filename.slice(5);
  const extension = /\.(gat|gnd|rsw)$/i.exec(logicalName)?.[1]?.toLowerCase();
  if (!extension) throw new Error('地图资源路径无效');
  const mapped = aliases && typeof aliases === 'object' && logicalName in aliases ? aliases[logicalName] : logicalName;
  if (typeof mapped !== 'string' || !mapped || mapped.includes(':') || [...mapped].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      || mapped.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
      || /\.(gat|gnd|rsw)$/i.exec(mapped)?.[1]?.toLowerCase() !== extension) {
    throw new Error('地图资源别名无效');
  }
  return 'data/' + mapped;
}
