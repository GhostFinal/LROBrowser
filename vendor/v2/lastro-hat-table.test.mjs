import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ONLINE_PATH = join(HERE, 'Online.js');

function loadHatTable() {
  const source = readFileSync(ONLINE_PATH, 'utf8');
  const start = source.indexOf('HatTable_default = {');
  const end = source.indexOf('\n\t};', start) + 4;
  const context = {};
  vm.runInNewContext('var ' + source.slice(start, end), context);
  return context.HatTable_default;
}

test('HatTable keeps the reviewed fluffy ponytail costume mappings', () => {
  const table = loadHatTable();
  for (const [classNum, resource] of [[3133, '44503'], [3134, '44504'], [3143, '44565']]) {
    assert.equal(table[classNum], `_${resource}`);
  }
});
