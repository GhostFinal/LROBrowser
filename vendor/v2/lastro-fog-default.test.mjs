import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('./Online.js', import.meta.url), 'utf8');
const mapRegionStart = bundle.indexOf('//#region src/Preferences/Map.js');
const mapEnd = bundle.indexOf('//#endregion', mapRegionStart);
assert.notEqual(mapRegionStart, -1, 'Map preference region should exist in the bundle');
assert.notEqual(mapEnd, -1, 'Map preference region should have an end marker');
const mapModule = bundle.slice(mapRegionStart, mapEnd);

test('V2 defaults map fog off and migrates the previous default once', () => {
  assert.match(mapModule, /fog:\s*false,/);
  assert.match(mapModule, /_fogRevision:\s*0,/);
  assert.match(
    mapModule,
    /if \(Map_default\._fogRevision !== 1\) \{\s*if \(Map_default\.fog === true\) Map_default\.fog = false;\s*Map_default\._fogRevision = 1;\s*Map_default\.save\(\);\s*\}/s
  );
});

test('/fog remains a persistent toggle after the default changes', () => {
  const command = bundle.slice(bundle.indexOf('fog: {', mapEnd));
  assert.match(command, /Map_default\.fog = !Map_default\.fog;/);
  assert.match(command, /Map_default\.save\(\);/);
});
