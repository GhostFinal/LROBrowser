import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { TextDecoder } from 'node:util';

// These bundled LastRO tables are GBK text, not UTF-8 and not Lua bytecode.
const root = new URL('../vendor/core/data/luafiles514/lua files/skillinfoz/', import.meta.url);
export function readSkillSource(filename) {
  return new TextDecoder('gb18030', { fatal: true }).decode(readFileSync(new URL(filename, root)));
}

export function readSkillNames(source) {
  const result = {};
  for (const match of source.matchAll(/\[SKID\.([A-Z0-9_]+)\]\s*=\s*\{[\s\S]*?SkillName\s*=\s*"([^"\r\n]*)"/g)) {
    // Lua table literals retain the last entry for a repeated key.
    result[match[1]] = match[2];
  }
  if (!Object.keys(result).length) throw new Error('Skill name table format changed');
  return result;
}

export const BUNDLED_SKILL_NAMES = readSkillNames(readSkillSource('skillinfolist_re_06.lua'));
