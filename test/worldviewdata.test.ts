import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const worldMapDirectory = path.join(
  process.cwd(),
  'vendor/core/data/luafiles514/lua files/worldviewdata',
);
const listSource = readFileSync(path.join(worldMapDirectory, 'worldviewdata_list.lub'), 'utf8');
const tableSource = readFileSync(path.join(worldMapDirectory, 'worldviewdata_table.lub'), 'utf8');
const languageSource = new TextDecoder('gbk').decode(readFileSync(path.join(worldMapDirectory, 'worldviewdata_language.lub')));
const worldData = JSON.parse(readFileSync('vendor/core/data/world/world-data.json', 'utf8')) as Record<string, { name?: string }>;

const categories = [...listSource.matchAll(/\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/gs)]
  .map(([, name, table, dungeonTable]) => ({ name, table, dungeonTable }));
const mapIds = new Set([...tableSource.matchAll(/"([a-z0-9_]+)\.rsw"/gi)].map(([, id]) => id!.toLowerCase()));
const mapRows = [...tableSource.matchAll(/\{\s*\d+\s*,\s*"([a-z0-9_]+)\.rsw"\s*,[\s\S]*?WORLD_MSGID\.(MSI_[A-Za-z0-9_]+)\s*,\s*"[^"]*"\s*\}/g)]
  .map(([, id, key]) => ({ id: id!.toLowerCase(), key: key! }));
const languageNames = new Map([...languageSource.matchAll(/^\s*(MSI_[A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*,?\s*$/gm)]
  .map(([, key, name]) => [key, name]));

describe('world map Lua catalog', () => {
  it('includes all translated world-map categories and their table definitions', () => {
    expect(categories.map(({ name }) => name)).toEqual([
      '中土大陆',
      '中土大陆北部',
      '次元大陆',
      '次元裂隙',
      '局部地图 01',
      '局部地图 02',
      '多兰岛',
      '伊斯加尔特',
    ]);

    for (const { table, dungeonTable } of categories) {
      expect(tableSource).toMatch(new RegExp(`^${table}\\s*=\\s*\\{`, 'm'));
      expect(tableSource).toMatch(new RegExp(`^${dungeonTable}\\s*=\\s*\\{`, 'm'));
    }
  });

  it('includes the Chinese-named Lutie town and field maps in the main world map', () => {
    expect(mapIds.has('xmas')).toBe(true);
    expect(mapIds.has('xmas_fild01')).toBe(true);
    expect(mapIds.has('gef_dun03')).toBe(true);
    expect(worldData.xmas?.name).toBe('白雪村落 姜饼城');
    expect(worldData.xmas_fild01?.name).toBe('姜饼城原野');
    expect(worldData.gef_dun03?.name).toBe('吉芬地下密穴4层');
  });

  it('has a Chinese display name for every map in the merged tables', () => {
    expect(mapRows.length).toBeGreaterThanOrEqual(364);
    for (const { id, key } of mapRows) {
      const name = worldData[id]?.name ?? languageNames.get(key);
      expect(name, `${id} should have a Chinese display name`).toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it('decodes GBK-encoded Lua labels using the client data charset', () => {
    expect(languageNames.get('MSI_16_NIF_FILD01')).toBe('斯凯领顿 (尼芙菲姆 偏远村落)');
  });
});
