import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildClientConfig } from '../src/runtime/client-config';
import { getAvailableServerProfile } from '../src/servers/server-profiles';

const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
const configsRegion = runtime.split('//#region src/Core/Configs.js')[1]!.split('//#endregion')[0]!;

describe('renewal refine runtime configuration', () => {
  it('enables the refine UI for the supported LastRO packet version', () => {
    const config = buildClientConfig(getAvailableServerProfile('lastro-2x'), { username: '', password: '' });
    const context = vm.createContext({ window: { ROConfig: config }, __esmMin: (init: () => void) => init });

    vm.runInContext(`${configsRegion}\ninit_Configs();`, context);

    expect(vm.runInContext('Configs.get("enableRefineUI")', context)).toBe(true);
    expect(vm.runInContext('Configs.get("enableMapName")', context)).toBe(true);
    expect(config.development).toBe(import.meta.env.DEV);
  });
});
