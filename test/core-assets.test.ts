import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { importCoreAssets } from '../scripts/import-core-assets.mjs';
import { readFile, readdir } from 'node:fs/promises';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.resolve('.staging/core-fixtures-'));
  roots.push(root);
  const client = path.join(root, 'client');
  const source = path.join(root, 'source');
  const output = path.join(root, 'output');
  await mkdir(path.join(client, 'data/luafiles514/lua files/sub'), { recursive: true });
  await mkdir(path.join(client, 'System'), { recursive: true });
  await mkdir(path.join(source, 'src/DB/Mobs'), { recursive: true });
  await writeFile(path.join(client, 'data/luafiles514/lua files/sub/Case.LUB'), 'lub');
  await writeFile(path.join(client, 'data/luafiles514/lua files/sub/ignored.bmp'), 'passive');
  for (const name of ['Towninfo_cn2_1.lua', 'achievement_list_cn2_06.lua', 'itemInfo_re_59.lua', 'itemInfo_re_61.lua']) await writeFile(path.join(client, 'System', name), name);
  await writeFile(path.join(source, 'src/DB/worldData.js'), 'export const world = true;');
  await writeFile(path.join(source, 'src/DB/Mobs/mob_db.js'), 'export const mobs = true;');
  return { root, client, source, output };
}

describe('core executable asset importer', () => {
  it('preserves Lua/LUB case, ignores passive files, and produces sorted hashes', async () => {
    const f = await fixture();
    const first = await importCoreAssets({ clientRoot: f.client, roSourceRoot: f.source, output: f.output });
    expect(first.files.map(file => file.path)).toEqual([...first.files].map(file => file.path).sort());
    expect(first.files.map(file => file.path)).toContain('data/luafiles514/lua files/sub/Case.LUB');
    expect(first.files.map(file => file.path)).not.toContain('data/luafiles514/lua files/sub/ignored.bmp');
    const second = await importCoreAssets({ clientRoot: f.client, roSourceRoot: f.source, output: f.output });
    expect(second).toEqual(first);
  });

  it('rejects symlinked executable inputs', async () => {
    const f = await fixture();
    await symlink(path.join(f.root, 'outside.lua'), path.join(f.client, 'data/luafiles514/lua files/sub/outside.lua'));
    await expect(importCoreAssets({ clientRoot: f.client, roSourceRoot: f.source, output: f.output })).rejects.toThrow(/symlink/);
  });

  it('rejects missing fixed System files instead of silently changing the baseline', async () => {
    const f = await fixture();
    await rm(path.join(f.client, 'System/itemInfo_re_61.lua'));
    await expect(importCoreAssets({ clientRoot: f.client, roSourceRoot: f.source, output: f.output })).rejects.toThrow();
  });

  it('fails when a required patched worker is missing instead of emitting an incomplete manifest', async () => {
    const f = await fixture();
    const runtime = path.join(f.root, 'runtime');
    await mkdir(runtime);
    await writeFile(path.join(runtime, 'Online.js'), 'export {};');
    await writeFile(path.join(runtime, 'lastro-resource-loader.js'), 'var LastROResources = {};');
    await expect(importCoreAssets({ clientRoot: f.client, roSourceRoot: f.source, output: f.output,
      runtimePath: path.join(runtime, 'Online.js'),
    })).rejects.toThrow(/ENOENT/);
  });

  it('matches the reviewed baseline counts and byte totals', async () => {
    const luaRoot = '/run/media/parker/7A9F-F871/ROWeb/ro/client_re/data/luafiles514/lua files';
    const systemRoot = '/run/media/parker/7A9F-F871/ROWeb/ro/client_re/System';
    const walk = async (root: string, relative = ''): Promise<number[]> => {
      const values: number[] = [];
      for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) values.push(...await walk(root, child));
        else if (entry.isFile() && /\.(?:lua|lub)$/i.test(child)) values.push((await readFile(path.join(root, child))).length);
      }
      return values;
    };
    const lua = await walk(luaRoot);
    const system = await walk(systemRoot);
    expect(lua).toHaveLength(473);
    expect(lua.reduce((sum, bytes) => sum + bytes, 0)).toBe(49723747);
    expect(system).toHaveLength(4);
    expect(system.reduce((sum, bytes) => sum + bytes, 0)).toBe(29899365);
  });
});
