import assert from 'node:assert/strict';
import test from 'node:test';

import { isObserverMode, runObserverPacketHandler } from './lastro-observer-mode.mjs';

test('only suppresses disconnect UI for observer-mode configuration', () => {
  assert.equal(isObserverMode({ get: (key, fallback) => key === 'observerMode' ? true : fallback }), true);
  assert.equal(isObserverMode({ get: () => false }), false);
  assert.equal(isObserverMode(null), false);
});

test('observer packet handler reports and absorbs malformed packet errors', () => {
  const errors = [];
  const result = runObserverPacketHandler(() => {
    throw new TypeError('malformed packet');
  }, {
    observerMode: true,
    onError: (error) => errors.push(error)
  });

  assert.equal(result, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'malformed packet');
});

test('normal packet handling still propagates errors', () => {
  assert.throws(() => runObserverPacketHandler(() => {
    throw new TypeError('malformed packet');
  }, { observerMode: false }), /malformed packet/);
});
