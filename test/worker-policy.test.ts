import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
const start = runtime.indexOf('function createLastROWorkerScriptUrl(');
const helper = runtime.slice(start, runtime.indexOf('\n}', start) + 2);
const base = 'isolated-app://test-app/runtime/Online.js?import';

function harness(trusted = true) {
  let rule!: (value: string) => string;
  const createPolicy = vi.fn((_name: string, rules: { createScriptURL: typeof rule }) => {
    rule = rules.createScriptURL;
    return { createScriptURL: (value: string) => ({ toString: () => rule(value), value: rule(value) }) };
  });
  const context = vm.createContext({ URL, trustedTypes: trusted ? { createPolicy } : undefined });
  vm.runInContext(helper.replaceAll('import.meta.url', JSON.stringify(base)), context);
  return { create: (name: string) => context.createLastROWorkerScriptUrl(name),
    validate: (value: string) => rule(value), createPolicy };
}

describe('packaged Worker Trusted Types policy', () => {
  it.each([
    ['LastROThreadEventHandler.js', 'PathFindingWorker.js'],
    ['PathFindingWorker.js', 'LastROThreadEventHandler.js'],
  ])('reuses the policy for %s followed by %s', (first, second) => {
    const h = harness();
    for (const name of [first, second, first, second]) {
      expect(String(h.create(name))).toBe('isolated-app://test-app/runtime/' + name);
    }
    expect(h.createPolicy).toHaveBeenCalledOnce();
  });

  it('rejects other origins, scripts, query strings and fragments through the cached policy', () => {
    const h = harness();
    h.create('LastROThreadEventHandler.js');
    for (const value of [
      'isolated-app://other-app/runtime/LastROThreadEventHandler.js',
      'https://test-app/runtime/LastROThreadEventHandler.js',
      'isolated-app://test-app/other/PathFindingWorker.js',
      'isolated-app://test-app/runtime/other.js',
      'isolated-app://test-app/runtime/LastROThreadEventHandler.js?code=other',
      'isolated-app://test-app/runtime/LastROThreadEventHandler.js#other',
    ]) expect(() => h.validate(value), value).toThrow('Unexpected worker URL');
  });

  it('rejects unapproved paths before creating a policy', () => {
    const h = harness();
    for (const value of ['other.js', '../PathFindingWorker.js', 'https://example.com/PathFindingWorker.js']) {
      expect(() => h.create(value)).toThrow('Unexpected worker path');
    }
    expect(h.createPolicy).not.toHaveBeenCalled();
  });

  it('supports environments without Trusted Types for both approved workers', () => {
    const h = harness(false);
    for (const name of ['LastROThreadEventHandler.js', 'PathFindingWorker.js']) {
      expect(h.create(name)).toBe('isolated-app://test-app/runtime/' + name);
    }
  });
});
