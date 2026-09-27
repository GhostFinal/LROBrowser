import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const inventory = JSON.parse(await readFile('config/lastro-module-inventory.json', 'utf8')) as {
  testRoot: string;
  regressionTests: string[];
};

describe('LastRO V2 repository regressions', () => {
  it('executes every declared Node-compatible regression without silent skips', () => {
    expect(inventory.regressionTests.length).toBeGreaterThan(0);
    const tests = inventory.regressionTests.map((test) => path.resolve(inventory.testRoot, test));
    const output = execFileSync(process.execPath, ['--test', ...tests], { encoding: 'utf8', cwd: process.cwd() });
    expect(output).toMatch(/pass \d+/);
    expect(output).not.toMatch(/xkore/i);
  }, 120_000);
});
