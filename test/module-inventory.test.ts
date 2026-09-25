import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const inventory = JSON.parse(await readFile('config/lastro-module-inventory.json', 'utf8')) as {
  baselineRoot: string;
  entries: Array<{ module: string; tests: string[]; capability: string; required: boolean }>;
  regressionTests: string[];
};

describe('LastRO V2 module inventory', () => {
  it('contains every required staged module and declared baseline test', async () => {
    const stagedManifest = JSON.parse(await readFile('.staging/v2-manifest.json', 'utf8')) as { files: Array<{ path: string }> };
    const staged = new Set(stagedManifest.files.map((file) => file.path));
    for (const entry of inventory.entries) {
      expect(entry.required, `${entry.module} must remain required`).toBe(true);
      expect(staged.has(entry.module), `missing staged module ${entry.module}`).toBe(true);
      for (const test of entry.tests) await expect(readFile(path.join(inventory.baselineRoot, test))).resolves.toBeTruthy();
    }
  });

  it('keeps LastRO module imports referenced by the production bundle', async () => {
    const source = await readFile('.staging/v2/Online.js', 'utf8');
    const workerSource = await readFile('.staging/v2/LastROThreadEventHandler.js', 'utf8');
    for (const entry of inventory.entries.filter((candidate) => candidate.module.startsWith('lastro-'))) {
      expect(source.includes(entry.module) || workerSource.includes(entry.module), `production runtime no longer references ${entry.module}`).toBe(true);
    }
  });

  it('does not advertise XKore-only regressions', () => {
    expect(inventory.regressionTests.some((test) => /xkore/i.test(test))).toBe(false);
  });
});
