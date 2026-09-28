import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let inputSource: string;
let loopSource: string;
beforeAll(async () => {
  // pnpm test prepares the patched runtime before Vitest starts.
  const patched = await readFile('generated/runtime/Online.js', 'utf8');
  const region = (name: string) => patched.split('//#region src/UI/Components/JoystickUI/' + name + '.js')[1]!.split('//#endregion')[0]!;
  inputSource = region('JoystickInputService');
  loopSource = region('JoystickPollingLoop');
});

function harness(navigator: object, document: object = {}) {
  const hide = vi.fn();
  const buttons = vi.fn(() => false);
  const timers: Array<() => void> = [];
  const context = vm.createContext({
    navigator, document, __esmMin: (fn: () => void) => fn,
    init_JoystickButtonInput() {}, init_JoystickAxisInput() {}, init_JoystickUIRenderer() {}, init_Controls() {},
    Controls_default: { joyDeadline: 0.1 }, ButtonInput: { update: buttons },
    JoystickAxisInput_default: { update: () => false }, JoystickUIRenderer_default: { hide, show() {} },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
  });
  vm.runInContext(inputSource + '\n' + loopSource + '\ninit_JoystickPollingLoop();', context);
  return { context, hide, buttons, timers, run: () => vm.runInContext('JoystickPollingLoop_default.start();', context) };
}

describe('optional gamepad input', () => {
  it.each(['permissionsPolicy', 'featurePolicy'])('skips the native API when %s blocks gamepad', (key) => {
    const getGamepads = vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); });
    const h = harness({ getGamepads }, { [key]: { allowsFeature: (name: string) => name !== 'gamepad' } });
    expect(h.run).not.toThrow();
    expect(getGamepads).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(1);
  });

  it('continues polling and clears active UI if native access throws SecurityError', () => {
    const h = harness({ getGamepads() { throw new DOMException('blocked', 'SecurityError'); } });
    vm.runInContext('JoystickInputService_default.active = true;', h.context);
    expect(h.run).not.toThrow();
    expect(h.hide).toHaveBeenCalledOnce();
    expect(vm.runInContext('JoystickInputService_default.active', h.context)).toBe(false);
    expect(h.timers).toHaveLength(1);
    expect(() => h.timers[0]!()).not.toThrow();
    expect(h.timers).toHaveLength(2);
  });

  it('keeps allowed gamepad input and its navigator receiver', () => {
    const navigator = { getGamepads() {
      expect(this).toBe(navigator);
      return [{ buttons: [{ pressed: true }], axes: [0, 0] }];
    } };
    const h = harness(navigator, { permissionsPolicy: { allowsFeature: () => true } });
    h.run();
    expect(h.buttons).toHaveBeenCalledWith(['pressed']);
    expect(h.timers).toHaveLength(1);
  });

  it('continues without the Gamepad API', () => {
    const h = harness({});
    expect(h.run).not.toThrow();
    expect(h.timers).toHaveLength(1);
  });

  it('does not hide unrelated runtime errors', () => {
    const h = harness({ getGamepads() { throw new TypeError('unexpected bug'); } });
    expect(h.run).toThrow('unexpected bug');
  });
});
