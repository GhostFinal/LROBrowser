import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const inventory = JSON.parse(await readFile('config/lastro-module-inventory.json', 'utf8')) as {
  sourceRoot: string;
  testRoot: string;
  entries: Array<{ module: string; tests: string[] }>;
  regressionTests: string[];
};

describe('LastRO V2 source ownership', () => {
  it('keeps every production module and regression test inside the repository', async () => {
    expect(path.isAbsolute(inventory.sourceRoot)).toBe(false);
    expect(path.isAbsolute(inventory.testRoot)).toBe(false);
    expect(inventory.sourceRoot).not.toMatch(/ROWeb|run\/media/);
    expect(inventory.testRoot).not.toMatch(/ROWeb|run\/media/);

    const modules = inventory.entries.map((entry) => entry.module);
    const tests = [...new Set(inventory.entries.flatMap((entry) => entry.tests))];
    expect(tests.sort()).toEqual([...inventory.regressionTests].sort());

    for (const module of modules) await expect(access(path.join(inventory.sourceRoot, module))).resolves.toBeUndefined();
    for (const test of tests) await expect(access(path.join(inventory.testRoot, test))).resolves.toBeUndefined();
  });
});
