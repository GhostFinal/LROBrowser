import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { patchRuntimeCredentialSecurity } from '../scripts/lastro-credential-security.mjs';

let patched: string;
beforeAll(() => {
  patched = patchRuntimeCredentialSecurity(readFileSync('vendor/v2/Online.js', 'utf8').replaceAll('\r\n', '\n'));
}, 30_000);

function setup() {
  const callbacks: Array<(success: boolean) => void> = [];
  const packets: Array<{ ID: string; Passwd: string }> = [];
  const transmitted: Array<{ ID: string; Passwd: string }> = [];
  const send = vi.fn((packet: { ID: string; Passwd: string }) => { packets.push(packet); transmitted.push({ ...packet }); });
  const connect = vi.fn((_host: string, _port: number, callback: (success: boolean) => void) => callbacks.push(callback));
  const context = vm.createContext({
    SoundManager: { play: vi.fn() }, Controller: { getUI: () => ({ remove: vi.fn(), append: vi.fn() }) },
    WinLoading: { append: vi.fn() }, _server: { address: 'fixture.invalid', port: 6900, version: 1, langtype: 1 }, _loginID: '',
    Network: { connect, sendPacket: send }, Configs: { get: (key: string) => key === 'loginMode' ? 'normal' : false },
    PACKET: { CA: { LOGIN: class { ID = ''; Passwd = ''; } } }, UIManager: { showMessageBox: vi.fn(), removeComponents: vi.fn() },
    DB: { getMessage: () => 'fixture message' },
  });
  const start = patched.indexOf('let lastroLoginAttemptSequence = 0;');
  const end = patched.indexOf('/**\n * Go back to intro window', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  vm.runInContext(patched.slice(start, end), context);
  const request = (username: string, password: string) => {
    context.fixtureUsername = username;
    context.fixturePassword = password;
    vm.runInContext('onConnectionRequest(fixtureUsername, fixturePassword)', context);
  };
  return { callbacks, packets, transmitted, send, connect, request };
}

describe('native credential lifetime', () => {
  it('submits the original credentials once, then scrubs the retained packet and callback', () => {
    const fixture = setup();
    fixture.request('fixture-user', 'fixture-secret');
    fixture.callbacks[0]!(true);
    expect(fixture.transmitted).toEqual([expect.objectContaining({ ID: 'fixture-user', Passwd: 'fixture-secret' })]);
    expect(fixture.packets[0]!.Passwd).toBe('');
    fixture.callbacks[0]!(true);
    expect(fixture.transmitted).toHaveLength(1);
  });

  it('cannot send a previous login after a newer account starts connecting', () => {
    const fixture = setup();
    fixture.request('old-user', 'old-fixture');
    fixture.request('new-user', 'new-fixture');
    fixture.callbacks[0]!(true);
    expect(fixture.transmitted).toEqual([]);
    fixture.callbacks[1]!(true);
    expect(fixture.transmitted).toEqual([expect.objectContaining({ ID: 'new-user', Passwd: 'new-fixture' })]);
  });

  it('never revives credentials after connection failure', () => {
    const fixture = setup();
    fixture.request('fixture-user', 'fixture-secret');
    fixture.callbacks[0]!(false);
    fixture.callbacks[0]!(true);
    expect(fixture.transmitted).toEqual([]);
  });

  it('clears the packet even if the transport throws', () => {
    const fixture = setup();
    fixture.send.mockImplementation(packet => { fixture.packets.push(packet); throw new Error('fixture transport error'); });
    fixture.request('fixture-user', 'fixture-secret');
    expect(() => fixture.callbacks[0]!(true)).toThrow('fixture transport error');
    expect(fixture.packets[0]!.Passwd).toBe('');
    fixture.callbacks[0]!(true);
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'bad\u0000password', 'bad\r\npassword', 'x'.repeat(1025)])('rejects an invalid password before opening a socket', password => {
    const fixture = setup();
    fixture.request('fixture-user', password);
    expect(fixture.connect).not.toHaveBeenCalled();
  });

  it('removes the auto-login reference before later setup can fail and disables packet payload dumps', () => {
    expect(patched).toContain('let autoLogin = Configs.get("autoLogin");\n      Configs.set("autoLogin", null);');
    expect(patched).toContain('finally { autoLogin = null; }');
    expect(patched).not.toContain('packetDump = Configs.get("packetDump", false)');
    expect(patched).toContain('packetDump = false; // Never dump authentication/session packet payloads.');
  });
});
