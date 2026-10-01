import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { patchWebAudioPlayback } from '../scripts/patch-v2-runtime.mjs';
import { patchRuntimeAudioTiming } from '../scripts/lastro-audio-timing.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const original = patchWebAudioPlayback(native), patched = patchRuntimeAudioTiming(original);
function region(source: string, name: string) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native audio region: ' + name);
  return source.slice(start, end);
}
function installer(source: string) {
  const start = source.indexOf('function installLastROWebAudio() {');
  const marker = 'const LastROWebAudio = installLastROWebAudio();', end = source.indexOf(marker, start);
  if (start < 0 || end < start) throw new Error('Missing actual Web Audio installer');
  return source.slice(start, end + marker.length);
}

interface BufferValue { duration: number; }
interface SoundManagerApi { play(filename: string, volume?: number): void; stop(filename?: string): void; }
interface BgmApi { play(filename: string): void; stop(): void; setVolume(volume: number): void; cache: { currentTime: number }; }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let index = 0; index < 14; index++) await Promise.resolve(); }

function fixture(options: { old?: boolean; manualClient?: boolean; suspended?: boolean; playing?: boolean } = {}) {
  let time = 0, wall = 100000, due: number | undefined;
  const document = new EventTarget() as EventTarget & { hidden: boolean; defaultView: EventTarget };
  document.hidden = false; document.defaultView = new EventTarget();
  const clientJobs: Array<{ path: string; complete(): void }> = [];
  const decodes: Array<ReturnType<typeof deferred<BufferValue>>> = [];
  const sources: Source[] = [], gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class Source extends EventTarget {
    buffer: BufferValue | null = null;
    loop = false;
    connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
  }
  class AudioContextMock extends EventTarget {
    state = options.suspended ? 'suspended' : 'running';
    currentTime = 0; destination = {};
    resume = vi.fn(async () => this.changeState('running'));
    decodeAudioData = vi.fn(() => { const pending = deferred<BufferValue>(); decodes.push(pending); return pending.promise; });
    createBufferSource = vi.fn(() => { const source = new Source(); sources.push(source); return source; });
    createGain = vi.fn(() => { const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; });
    changeState(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
  }
  const contexts: AudioContextMock[] = [];
  const Client = { loadFile: vi.fn((path: string, callback: (url: string) => void) => {
    const job = { path, complete: () => callback('data:audio/' + path) }; clientJobs.push(job);
    if (!options.manualClient) job.complete();
  }) };
  const fetchAudio = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }));
  const preferences = { Sound: { play: true, volume: 0.7 }, BGM: { play: true, volume: 0.4 }, save: vi.fn() };
  const warnings = vi.fn();
  const renderer = { tick: wall };
  const session = { Playing: options.playing ?? false, Entity: { position: [0, 0] } };
  const context = vm.createContext({ document, Event, EventTarget, performance: { now: () => time }, Date: { now: () => wall },
    AudioContext: AudioContextMock, LastROAudioRegisterContext: (audio: AudioContextMock) => { contexts.push(audio); return audio; },
    fetch: fetchAudio, Client, Audio_default: preferences,
    LastROEventDueTick: () => due,
    console: { warn: warnings },
    init_Client() {}, init_Audio() {}, init_MemoryManager() {}, init_gl_matrix() {}, init_SessionStorage() {},
    __esmMin: (fn: () => void) => fn,
    gl_matrix_default: { vec2: { dist: () => 0 } }, SessionStorage_default: session, Renderer: renderer,
  });
  const source = options.old ? original : patched;
  vm.runInContext(installer(source) + '\n' + region(source, 'src/Audio/SoundManager.js') + '\n'
    + region(source, 'src/Audio/BGM.js') + '\ninit_SoundManager(); init_BGM();', context);
  const sound = context.SoundManager as SoundManagerApi, bgm = context.BGM as BgmApi;
  return { sound, bgm, document, contexts, decodes, clientJobs, Client, fetchAudio, preferences, sources, gains, warnings, renderer, session,
    advance: (delta: number) => { time += delta; wall += delta; }, setWall: (value: number) => { wall = value; },
    setDue: (value: number | undefined) => { due = value; }, wall: () => wall,
    async decode(index = 0) { await settle(); const pending = decodes[index]; if (!pending) throw new Error('Missing actual decode'); pending.resolve({ duration: 2 }); await settle(); },
  };
}

describe('action sound timing through real patched SoundManager and Web Audio', () => {
  it('reproduces old cold-decode playback piling up and coalesces it after the fix', async () => {
    const old = fixture({ old: true });
    for (let index = 0; index < 5; index++) old.sound.play('hit.wav');
    await old.decode(); expect(old.sources).toHaveLength(5);
    const fixed = fixture(); for (let index = 0; index < 5; index++) fixed.sound.play('hit.wav');
    await fixed.decode(); expect(fixed.sources).toHaveLength(1); expect(fixed.fetchAudio).toHaveBeenCalledOnce();
    expect(fixed.gains[0]?.gain.value).toBe(0.7); expect(fixed.sources[0]?.start).toHaveBeenCalledOnce();
  });

  it('starts the deadline before Client.loadFile rather than when its late callback returns', async () => {
    const f = fixture({ manualClient: true }); f.sound.play('skill.wav'); f.advance(501); f.clientJobs[0]!.complete(); await settle();
    expect(f.fetchAudio).not.toHaveBeenCalled(); expect(f.sources).toHaveLength(0);
    f.sound.play('skill.wav'); f.clientJobs[1]!.complete(); await f.decode(); expect(f.sources).toHaveLength(1);
  });

  it('drops late decoded sounds while retaining their decoded buffer for the next fresh action', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.advance(501); await f.decode();
    expect(f.sources).toHaveLength(0);
    f.sound.play('hit.wav'); await settle(); expect(f.sources).toHaveLength(1);
    expect(f.fetchAudio).toHaveBeenCalledOnce(); expect(f.contexts[0]?.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('counts file loading and decoding against one deadline', async () => {
    const f = fixture({ manualClient: true }); f.sound.play('hit.wav'); f.advance(300); f.clientJobs[0]!.complete(); await settle();
    f.advance(201); await f.decode(); expect(f.sources).toHaveLength(0);
  });

  it.each([499, 500])('allows a still-current effect at %s ms', async age => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.advance(age); await f.decode(); expect(f.sources).toHaveLength(1);
  });

  it('keeps async expiration monotonic when the system wall clock jumps', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.advance(50); f.setWall(90000000); await f.decode();
    expect(f.sources).toHaveLength(1);
  });

  it('rejects overdue Events audio before loading but allows fresh direct input after a stall', async () => {
    const f = fixture(); f.setDue(f.wall() - 2000); f.sound.play('skill.wav');
    expect(f.Client.loadFile).not.toHaveBeenCalled(); f.setDue(undefined); f.sound.play('button.wav'); await f.decode();
    expect(f.sources).toHaveLength(1);
  });

  it('retains the original event due time throughout subsequent decoding', async () => {
    const f = fixture(); f.setDue(f.wall() - 200); f.sound.play('skill.wav'); await settle(); f.setDue(undefined); f.advance(301); await f.decode();
    expect(f.sources).toHaveLength(0);
  });

  it('drops freshly received game sounds before the first recovered render instead of queuing their loads', async () => {
    const f = fixture({ playing: true }); f.advance(1500);
    for (let index = 0; index < 8; index++) f.sound.play('backlog' + index + '.wav');
    expect(f.Client.loadFile).not.toHaveBeenCalled(); expect(f.sources).toHaveLength(0);
    f.renderer.tick = f.wall(); f.sound.play('current.wav'); await f.decode();
    expect(f.sources).toHaveLength(1); expect(f.Client.loadFile).toHaveBeenCalledOnce();
  });

  it.each([499, 500])('keeps game sounds with a render only %s ms old', async age => {
    const f = fixture({ playing: true }); f.advance(age); f.sound.play('current.wav'); await f.decode();
    expect(f.sources).toHaveLength(1);
  });

  it('keeps login interface sounds and BGM when the game render is stopped', async () => {
    const f = fixture(); f.advance(1500); f.sound.play('login.wav'); await f.decode();
    expect(f.sources).toHaveLength(1); f.session.Playing = true;
    f.bgm.play('01.mp3'); await f.decode(1); expect(f.sources).toHaveLength(2);
    expect(f.sources[1]?.loop).toBe(true);
  });

  it.each(['specific', 'all'] as const)('cancels pending Client.loadFile callbacks on %s stop', async mode => {
    const f = fixture({ manualClient: true }); f.sound.play('old.wav'); f.sound.stop(mode === 'specific' ? 'old.wav' : undefined);
    f.clientJobs[0]!.complete(); await settle(); expect(f.fetchAudio).not.toHaveBeenCalled(); expect(f.sources).toHaveLength(0);
  });

  it('cancels already-decoding old sound without canceling a different current sound', async () => {
    const f = fixture(); f.sound.play('old.wav'); f.sound.play('current.wav'); await settle(); f.sound.stop('old.wav');
    await f.decode(0); expect(f.sources).toHaveLength(0); await f.decode(1); expect(f.sources).toHaveLength(1);
  });

  it('keeps a new same-file request when a canceled old decode finally completes', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.sound.stop('hit.wav'); f.sound.play('hit.wav'); await f.decode();
    expect(f.sources).toHaveLength(1); expect(f.contexts[0]?.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('does not queue effects on a suspended audio context for the next unlock gesture', async () => {
    const f = fixture({ suspended: true }); f.sound.play('hit.wav'); expect(f.Client.loadFile).not.toHaveBeenCalled();
    f.document.dispatchEvent(new Event('pointerdown')); await settle(); expect(f.sources).toHaveLength(0);
    f.sound.play('hit.wav'); await f.decode(); expect(f.sources).toHaveLength(1);
  });

  it('invalidates pending effects when a running context becomes suspended and later resumes', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.contexts[0]!.changeState('suspended');
    f.contexts[0]!.changeState('running'); await f.decode(); expect(f.sources).toHaveLength(0);
  });

  it.each(['hidden', 'pagehide'] as const)('cancels pending effects across %s and accepts new foreground audio', async event => {
    const f = fixture(); f.sound.play('hit.wav'); await settle();
    if (event === 'hidden') { f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange')); }
    else f.document.defaultView.dispatchEvent(new Event('pagehide'));
    f.document.hidden = false; await f.decode(); expect(f.sources).toHaveLength(0);
    f.sound.play('hit.wav'); await settle(); expect(f.sources).toHaveLength(1);
  });

  it('stops active sources and disconnects gains when the context suspends', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await f.decode(); f.contexts[0]!.changeState('suspended');
    expect(f.sources[0]?.stop).toHaveBeenCalledOnce(); expect(f.gains[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('does not let a delayed ended event from an old voice remove a newer same-file voice', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await f.decode(); f.sound.stop('hit.wav');
    f.sound.play('hit.wav'); await settle(); f.sources[0]!.dispatchEvent(new Event('ended')); f.sound.stop('hit.wav');
    expect(f.sources).toHaveLength(2); expect(f.sources[1]?.stop).toHaveBeenCalledOnce(); expect(f.gains[1]?.disconnect).toHaveBeenCalledOnce();
  });

  it('caps total pending requests and playing voices, then recovers capacity after ended', async () => {
    const f = fixture(); for (let index = 0; index < 40; index++) f.sound.play('effect' + index + '.wav');
    await settle(); expect(f.Client.loadFile).toHaveBeenCalledTimes(32);
    for (const pending of f.decodes) pending.resolve({ duration: 2 }); await settle(); expect(f.sources).toHaveLength(32);
    f.advance(100); f.sound.play('extra.wav'); await f.decode(32); expect(f.sources).toHaveLength(32);
    f.sources[0]!.dispatchEvent(new Event('ended')); f.advance(100); f.sound.play('extra.wav'); await settle(); expect(f.sources).toHaveLength(33);
  });

  it('restores the native ten-voice ceiling for one sound while allowing spaced playback', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await f.decode();
    for (let index = 0; index < 10; index++) { f.advance(100); f.sound.play('hit.wav'); await settle(); }
    expect(f.sources).toHaveLength(10);
    f.sources[0]!.dispatchEvent(new Event('ended')); f.advance(100); f.sound.play('hit.wav'); await settle(); expect(f.sources).toHaveLength(11);
  });

  it('does not play a pending effect after its sound preference is disabled or muted', async () => {
    for (const kind of ['disabled', 'muted']) {
      const f = fixture(); f.sound.play('hit.wav'); await settle();
      if (kind === 'disabled') f.preferences.Sound.play = false; else f.preferences.Sound.volume = 0;
      await f.decode(); expect(f.sources).toHaveLength(0);
    }
  });

  it('evicts failed decode promises so a later action can retry', async () => {
    const f = fixture(); f.sound.play('hit.wav'); await settle(); f.decodes[0]!.reject(new Error('decode failure')); await settle();
    expect(f.warnings).toHaveBeenCalledOnce(); f.advance(100); f.sound.play('hit.wav'); await f.decode(1);
    expect(f.sources).toHaveLength(1); expect(f.fetchAudio).toHaveBeenCalledTimes(2);
  });
});

describe('BGM remains music rather than an expiring effect', () => {
  it.each([0, 0.2, 1])('uses the latest music volume %s after a cold decode finishes', async volume => {
    const f = fixture(); f.bgm.play('01.mp3'); await settle();
    f.bgm.setVolume(volume); await f.decode();
    expect(f.preferences.BGM.volume).toBe(volume);
    expect(f.sources).toHaveLength(1); expect(f.gains[0]?.gain.value).toBe(volume);
    f.bgm.setVolume(0.6); expect(f.gains[0]?.gain.value).toBe(0.6);
  });

  it('preserves long-load music playback and its requested resume position', async () => {
    const f = fixture(); f.bgm.play('01.mp3'); await settle(); f.advance(2000); await f.decode();
    expect(f.sources[0]?.loop).toBe(true); expect(f.sources[0]?.start).toHaveBeenCalledWith(0, 0);
    f.contexts[0]!.currentTime = 1.25; f.bgm.stop(); expect(f.bgm.cache.currentTime).toBe(1.25);
    f.bgm.play('01.mp3'); await settle(); expect(f.sources[1]?.start).toHaveBeenCalledWith(0, 1.25);
  });

  it('does not resurrect stopped BGM when its Client.loadFile callback finally returns', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.stop(); f.clientJobs[0]!.complete(); await settle();
    expect(f.fetchAudio).not.toHaveBeenCalled(); expect(f.sources).toHaveLength(0);
  });

  it('preserves generation protection when newer map music finishes decoding first', async () => {
    const f = fixture(); f.bgm.play('01.mp3'); await settle(); f.bgm.play('02.mp3'); await settle();
    await f.decode(1); await f.decode(0); expect(f.sources).toHaveLength(1); expect(f.sources[0]?.loop).toBe(true);
  });
});

describe('actual runtime audio patch anchors', () => {
  it('keeps Renderer, Events, effect scheduling and sound position formulas untouched', () => {
    for (const name of ['src/Core/Events.js', 'src/Renderer/Renderer.js', 'src/Renderer/EffectManager.js']) {
      expect(region(patched, name)).toBe(region(original, name));
    }
    expect(region(patched, 'src/Audio/SoundManager.js')).toContain('gl_matrix_default.vec2.dist(srcPosition, SessionStorage_default.Entity.position)');
  });

  it('requires the Web Audio patch first and rejects double installation', () => {
    expect(() => patchRuntimeAudioTiming(native)).toThrow('anchor:audio-timing:web-audio');
    expect(() => patchRuntimeAudioTiming(patched)).toThrow('anchor:audio-timing:installer-drift');
  });

  it.each([
    ['const buffer = await decode("sound:" + filename, url);', 'installer-drift'],
    ['Client.loadFile("data/wav/" + filename, (url) => {', 'sound-load'],
    ['if (BGM.filename === filename) BGM.load(url);', 'bgm-load-callback'],
  ])('rejects drift at %s', (anchor, error) => {
    expect(() => patchRuntimeAudioTiming(original.replace(anchor, ''))).toThrow('anchor:audio-timing:' + error);
  });
});
