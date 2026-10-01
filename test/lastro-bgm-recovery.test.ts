import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { patchWebAudioPlayback } from '../scripts/patch-v2-runtime.mjs';
import { patchRuntimeAudioTiming } from '../scripts/lastro-audio-timing.mjs';

const native = readFileSync('vendor/v2/Online.js', 'utf8');
const base = patchWebAudioPlayback(native), final = patchRuntimeAudioTiming(base);
function region(source: string, name: string) {
  const start = source.indexOf('//#region ' + name), end = source.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + name);
  return source.slice(start, end);
}
function method(source: string, className: string, name: string) {
  const file = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isClassExpression(node) && node.name?.text === className) {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name.getText(file) === name) matches.push(member.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) throw new Error('Missing unique native method: ' + className + '.' + name);
  return matches[0]!;
}
function mapComplete(source: string) {
  const file = ts.createSourceFile('native-map.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'onMapComplete');
  if (nodes.length !== 1) throw new Error('Missing unique native map completion');
  return nodes[0]!.getText(file);
}
const clientLoad = method(region(native, 'src/Core/Client.js'), 'Client', 'loadFile').replace(/^static\s+/, '');
const mapSource = region(native, 'src/Renderer/MapRenderer.js');
const mapRuntime = mapComplete(mapSource) + '\nvar MapRenderer = class MapRenderer {\n'
  + 'static currentMap = "old.gat"; static loading = false; static fog = {}; static onLoad() {} static onRender() {}\n'
  + method(mapSource, 'MapRenderer', 'setMap') + '\n' + method(mapSource, 'MapRenderer', 'free') + '\n};';

interface AudioBufferValue { duration: number; url: string }
interface BgmApi { filename: string | null; stopped: boolean; play(filename: string): void; stop(): void; setVolume(volume: number): void }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let index = 0; index < 16; index++) await Promise.resolve(); }

function fixture(options: { base?: boolean; manualClient?: boolean; suspended?: boolean } = {}) {
  const document = new EventTarget() as EventTarget & { hidden: boolean; defaultView: EventTarget };
  document.hidden = false; document.defaultView = new EventTarget();
  const preferences = { BGM: { play: true, volume: 0.4 }, Sound: { play: true, volume: 0.7 }, save: vi.fn() };
  const audioJobs: Array<{ path: string; url: string; complete(): void; fail(error?: Error): void; failWithoutError(): void }> = [];
  const mapJobs: Array<{ complete(): void }> = [];
  const decodes: Array<ReturnType<typeof deferred<AudioBufferValue>> & { url: string }> = [];
  const sources: Source[] = [], gains: Array<{ gain: { value: number } }> = [];
  const contexts: AudioContextMock[] = [];
  const warnings = vi.fn(), revokeObjectURL = vi.fn();
  class Source extends EventTarget {
    buffer: AudioBufferValue | null = null; loop = false;
    connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
  }
  class AudioContextMock extends EventTarget {
    state = options.suspended ? 'suspended' : 'running'; currentTime = 0; destination = {};
    resume = vi.fn(async () => { this.state = 'running'; this.dispatchEvent(new Event('statechange')); });
    decodeAudioData = vi.fn((bytes: ArrayBuffer) => {
      const pending = { ...deferred<AudioBufferValue>(), url: new TextDecoder().decode(bytes) };
      decodes.push(pending); return pending.promise;
    });
    createBufferSource = vi.fn(() => { const source = new Source(); sources.push(source); return source; });
    createGain = vi.fn(() => {
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain;
    });
  }
  const fetchAudio = vi.fn(async (url: string) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  let currentMusic = '01.mp3';
  const noop = () => {};
  const renderer = { stop: noop, remove: noop, getContext: () => ({}), init: noop, show: noop, render: noop };
  const frees = Object.fromEntries(['EntityManager', 'Damage', 'EffectManager', 'GridSelector_default', 'Sounds_default', 'Effects_default',
    'Ground_default', 'Water_default', 'Models_default', 'AnimatedModels_default', 'GR2ModelRenderer_default', 'SignboardManager']
    .map(name => [name, { free: noop, clearLifeCache: noop, init: noop }]));
  const context = vm.createContext({ document, Event, EventTarget, performance: { now: () => 0 }, Date,
    AudioContext: AudioContextMock, LastROAudioRegisterContext: (audio: AudioContextMock) => { contexts.push(audio); return audio; },
    fetch: fetchAudio, Audio_default: preferences, URL: { revokeObjectURL }, console: { warn: warnings },
    init_Client: noop, init_Audio: noop, __esmMin: (fn: () => void) => fn,
    Renderer: renderer, SoundManager: { stop: noop }, UIManager: { removeComponents: noop },
    Cursor: { ACTION: { DEFAULT: 0 }, setType: noop }, Mouse: { intersect: false }, ...frees,
    Background: { setLoading: (callback: () => void) => callback(), remove: (callback: () => void) => callback() },
    Sky_default: { init: noop, setUpCloudData: noop }, SpriteRenderer: { init: noop },
    ScreenEffectManager: { init: noop, startMapflagEffect: noop }, PostProcess: { clean: noop },
    JoystickUI_default: { onRestore: noop }, registerPostProcessModules: noop,
    onProgressUpdate: noop, onWorldComplete: noop, onGroundComplete: noop, onAltitudeComplete: noop,
    onModelsComplete: noop, onAnimatedModelComplete: noop,
    stripMapExtension: (name: string) => name.replace(/\.(gat|rsw)$/i, ''),
    DB: { getMap: () => ({ mp3: currentMusic }) },
  });
  const Thread = { hook: noop, send: vi.fn((event: string, input: { filename: string }, callback: (...args: unknown[]) => void) => {
    if (event === 'LOAD_MAP') { mapJobs.push({ complete: () => callback(true) }); return; }
    if (event !== 'LOAD_FILE') throw new Error('Unexpected native client event');
    const url = 'blob:isolated-app://test/' + audioJobs.length;
    const job = { path: input.filename, url, complete: () => callback(url, null, input),
      fail: (error = new Error('Synthetic music resource failure')) => callback(null, error, input),
      failWithoutError: () => callback(null, undefined, input) };
    audioJobs.push(job); if (!options.manualClient) job.complete();
  }) };
  context.Thread = Thread;
  const source = options.base ? base : final;
  const start = source.indexOf('function installLastROWebAudio() {');
  const marker = 'const LastROWebAudio = installLastROWebAudio();', end = source.indexOf(marker, start);
  if (start < 0 || end < start) throw new Error('Missing actual Web Audio installer');
  vm.runInContext(region(source, 'src/Core/MemoryItem.js') + '\n' + region(source, 'src/Core/MemoryManager.js')
    + '\ninit_MemoryManager();\nfunction onFileLoaded(data, error, input) { MemoryManager.set(input.filename, data, error); }\n'
    + 'var Client = {' + clientLoad + '};\n' + source.slice(start, end + marker.length) + '\n'
    + region(source, 'src/Audio/BGM.js') + '\ninit_BGM();\n' + mapRuntime, context);
  const bgm = context.BGM as BgmApi;
  const memory = context.MemoryManager as { exist(path: string): boolean; get(path: string): unknown };
  const maps = context.MapRenderer as { setMap(name: string): void };
  return { bgm, memory, contexts, sources, gains, decodes, audioJobs, mapJobs, fetchAudio, preferences, warnings, document, revokeObjectURL,
    primeFailureReplacement(path: string, mode: 'pending' | 'success') {
      context.primePath = path;
      vm.runInContext('Client.loadFile(primePath, () => {}, () => { MemoryManager.remove(null, primePath); '
        + (mode === 'pending' ? 'Client.loadFile(primePath, () => {});' : 'MemoryManager.set(primePath, "blob:isolated-app://test/recovered");')
        + ' });', context);
    },
    async decode(index = 0) {
      await settle(); const pending = decodes[index]; if (!pending) throw new Error('Missing actual decode');
      pending.resolve({ duration: 10, url: pending.url }); await settle();
    },
    async map(name: string, music: string) { currentMusic = music; maps.setMap(name); mapJobs.at(-1)!.complete(); await settle(); },
  };
}

describe('BGM recovery through native Client cache and final Web Audio patches', () => {
  it.each([false, true])('enables the same remembered song after muted loading (base = %s)', async useBase => {
    const f = fixture({ base: useBase }); f.preferences.BGM.play = false; f.bgm.play('01.mp3');
    expect(f.audioJobs).toHaveLength(0); expect(f.bgm.stopped).toBe(true);
    f.preferences.BGM.play = true; f.bgm.play('01.mp3'); await f.decode();
    expect(f.sources).toHaveLength(1); expect(f.sources[0]!.loop).toBe(true);
  });

  it.each(['fetch', 'decode'] as const)('retries the same song after a %s failure without removing a successful Client cache entry', async stage => {
    const f = fixture();
    if (stage === 'fetch') f.fetchAudio.mockRejectedValueOnce(new Error('Synthetic audio fetch failure'));
    f.bgm.play('01.mp3'); await settle();
    if (stage === 'decode') { f.decodes[0]!.reject(new Error('Synthetic decode failure')); await settle(); }
    expect(f.bgm.stopped).toBe(true); expect(f.memory.get('BGM/01.mp3')).toBe(f.audioJobs[0]!.url);
    expect(f.revokeObjectURL).not.toHaveBeenCalled();
    f.bgm.play('01.mp3'); await f.decode(stage === 'decode' ? 1 : 0);
    expect(f.audioJobs).toHaveLength(1); expect(f.fetchAudio).toHaveBeenCalledTimes(2); expect(f.sources).toHaveLength(1);
    expect(f.warnings).toHaveBeenCalledWith('Failed to play BGM:', '01.mp3', expect.any(Error));
  });

  it('clears only the failed music resource item and retries using the native Client loader', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.audioJobs[0]!.complete(); await f.decode();
    f.bgm.play('02.mp3'); f.audioJobs[1]!.fail();
    expect(f.bgm.stopped).toBe(true); expect(f.memory.exist('BGM/02.mp3')).toBe(false);
    expect(f.memory.get('BGM/01.mp3')).toBe(f.audioJobs[0]!.url); expect(f.revokeObjectURL).not.toHaveBeenCalled();
    f.bgm.play('02.mp3'); f.audioJobs[2]!.complete(); await f.decode(1);
    expect(f.sources).toHaveLength(2); expect(f.sources[1]!.buffer!.url).toBe(f.audioJobs[2]!.url);
  });

  it('deduplicates both pending and already playing requests for the same music', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.play('01.mp3');
    expect(f.audioJobs).toHaveLength(1); f.audioJobs[0]!.complete(); await f.decode();
    f.bgm.play('01.mp3'); await settle(); expect(f.audioJobs).toHaveLength(1); expect(f.sources).toHaveLength(1);
  });

  it('passes the worker music blob URL unchanged to fetch in the packaged app', async () => {
    const f = fixture(); f.bgm.play('01.mp3'); await f.decode();
    expect(f.fetchAudio).toHaveBeenCalledWith(f.audioJobs[0]!.url);
    expect(f.sources[0]!.buffer!.url).toBe(f.audioJobs[0]!.url);
  });

  it('ignores an obsolete resource error without stopping the newer song', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.play('02.mp3');
    f.audioJobs[1]!.complete(); await f.decode(); f.audioJobs[0]!.fail();
    expect(f.bgm.filename).toBe('02.mp3'); expect(f.bgm.stopped).toBe(false); expect(f.warnings).not.toHaveBeenCalled();
    expect(f.sources[0]!.stop).not.toHaveBeenCalled();
  });

  it('retries obsolete failed music on the first revisit while preserving the newer playing song', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.play('02.mp3');
    f.audioJobs[1]!.complete(); await f.decode(); f.audioJobs[0]!.fail();
    expect(f.bgm.filename).toBe('02.mp3'); expect(f.bgm.stopped).toBe(false); expect(f.warnings).not.toHaveBeenCalled();
    expect(f.memory.exist('BGM/01.mp3')).toBe(false);
    expect(f.memory.get('BGM/02.mp3')).toBe(f.audioJobs[1]!.url); expect(f.revokeObjectURL).not.toHaveBeenCalled();
    f.bgm.play('01.mp3'); expect(f.audioJobs).toHaveLength(3);
    f.audioJobs[2]!.complete(); await f.decode(1); expect(f.sources).toHaveLength(2);
  });

  it('clears a completed obsolete failure even when the native loader provides no error value', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.play('02.mp3');
    f.audioJobs[1]!.complete(); await f.decode(); f.audioJobs[0]!.failWithoutError();
    expect(f.memory.exist('BGM/01.mp3')).toBe(false); expect(f.bgm.stopped).toBe(false);
    f.bgm.play('01.mp3'); expect(f.audioJobs).toHaveLength(3); f.audioJobs[2]!.complete(); await f.decode(1);
    expect(f.sources).toHaveLength(2);
  });

  it.each(['pending', 'success'] as const)('preserves a newer shared %s cache item when an old failure callback runs', async mode => {
    const f = fixture({ manualClient: true }); f.primeFailureReplacement('BGM/01.mp3', mode);
    f.bgm.play('01.mp3'); f.bgm.play('02.mp3'); f.audioJobs[1]!.complete(); await f.decode();
    f.audioJobs[0]!.fail(); expect(f.memory.exist('BGM/01.mp3')).toBe(true);
    expect(f.bgm.filename).toBe('02.mp3'); expect(f.bgm.stopped).toBe(false); expect(f.revokeObjectURL).not.toHaveBeenCalled();
    f.bgm.play('01.mp3');
    if (mode === 'pending') f.audioJobs[2]!.complete();
    await f.decode(1);
    expect(f.sources[1]!.buffer!.url).toBe(mode === 'pending' ? f.audioJobs[2]!.url : 'blob:isolated-app://test/recovered');
  });

  it('ignores an obsolete decode rejection without marking the newer song stopped', async () => {
    const f = fixture(); f.bgm.play('01.mp3'); await settle(); f.bgm.play('02.mp3'); await f.decode(1);
    f.decodes[0]!.reject(new Error('Synthetic obsolete decode failure')); await settle();
    expect(f.bgm.stopped).toBe(false); expect(f.warnings).not.toHaveBeenCalled();
  });

  it('does not start an older decode while the next map music resource is still loading', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.audioJobs[0]!.complete(); await settle();
    f.bgm.play('02.mp3'); await f.decode(0); expect(f.sources).toHaveLength(0);
    f.audioJobs[1]!.complete(); await f.decode(1); expect(f.sources[0]!.buffer!.url).toBe(f.audioJobs[1]!.url);
  });

  it('handles returning to the same song before old resource callbacks finish', async () => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3'); f.bgm.play('02.mp3'); f.bgm.play('01.mp3');
    f.audioJobs[0]!.complete(); await f.decode(); f.audioJobs[1]!.complete(); await settle();
    expect(f.sources).toHaveLength(1); expect(f.fetchAudio).toHaveBeenCalledOnce(); expect(f.bgm.filename).toBe('01.mp3');
    expect(f.bgm.stopped).toBe(false);
  });

  it.each(['resource', 'decode'] as const)('does not resurrect stopped music after delayed %s completes', async stage => {
    const f = fixture({ manualClient: true }); f.bgm.play('01.mp3');
    if (stage === 'decode') { f.audioJobs[0]!.complete(); await settle(); }
    f.bgm.stop();
    if (stage === 'resource') { f.audioJobs[0]!.complete(); await settle(); } else await f.decode();
    expect(f.sources).toHaveLength(0); expect(f.bgm.stopped).toBe(true);
  });

  it.each(['01.mp3', '02.mp3'])('survives native map setMap/free double stop before onMapComplete (%s)', async music => {
    const f = fixture(); f.bgm.play('01.mp3'); await f.decode(); f.contexts[0]!.currentTime = 1.25;
    await f.map('new.gat', music); if (music === '02.mp3') await f.decode(1); else await settle();
    expect(f.sources).toHaveLength(2); expect(f.sources[0]!.stop).toHaveBeenCalledOnce();
    expect(f.sources[1]!.start).toHaveBeenCalledWith(0, music === '01.mp3' ? 1.25 : 0);
    expect(f.bgm.stopped).toBe(false);
  });

  it('retries map music after the previous map resource failed', async () => {
    const f = fixture({ manualClient: true }); await f.map('first.gat', '02.mp3'); f.audioJobs[0]!.fail();
    await f.map('second.gat', '02.mp3'); expect(f.audioJobs).toHaveLength(2);
    f.audioJobs[1]!.complete(); await f.decode(); expect(f.sources).toHaveLength(1); expect(f.bgm.stopped).toBe(false);
  });

  it('uses the latest volume after a delayed map music decode', async () => {
    const f = fixture(); await f.map('new.gat', '02.mp3'); f.bgm.setVolume(0.2); await f.decode();
    expect(f.gains[0]!.gain.value).toBe(0.2);
  });

  it.each(['click', 'pointerdown', 'keydown', 'touchstart'])('resumes suspended background music after a user %s', async event => {
    const f = fixture({ suspended: true }); f.bgm.play('01.mp3'); await f.decode();
    expect(f.contexts[0]!.state).toBe('suspended'); expect(f.sources).toHaveLength(1);
    f.document.dispatchEvent(new Event(event)); await settle();
    expect(f.contexts[0]!.state).toBe('running'); expect(f.contexts[0]!.resume).toHaveBeenCalledOnce();
    expect(f.sources).toHaveLength(1);
  });

  it('remembers an earlier user gesture when AudioContext is created only after music loads', async () => {
    const f = fixture({ suspended: true }); f.document.dispatchEvent(new Event('click')); f.bgm.play('01.mp3'); await f.decode();
    expect(f.contexts[0]!.state).toBe('running'); expect(f.contexts[0]!.resume).toHaveBeenCalledOnce();
  });

  it('allows re-enabling music muted while decode was pending', async () => {
    const f = fixture(); f.bgm.play('01.mp3'); await settle(); f.preferences.BGM.play = false; await f.decode();
    expect(f.sources).toHaveLength(0); expect(f.bgm.stopped).toBe(true);
    f.preferences.BGM.play = true; f.bgm.play('01.mp3'); await settle(); expect(f.sources).toHaveLength(1);
  });
});

describe('BGM failed cache patch anchors', () => {
  it.each([
    ['src/Core/MemoryItem.js', '_data = null;'],
    ['src/Core/MemoryItem.js', 'complete = false;'],
    ['src/Core/MemoryItem.js', 'return this._data;'],
    ['src/Core/MemoryItem.js', 'this._error = error;'],
    ['src/Core/MemoryManager.js', 'const item = _memory[filename];'],
    ['src/Core/MemoryManager.js', 'return item.data;'],
    ['src/Core/MemoryManager.js', 'return !!_memory[filename];'],
  ])('rejects native cache structure drift in %s at %s', (name, anchor) => {
    const previous = region(native, name);
    expect(() => patchWebAudioPlayback(native.replace(previous, previous.replace(anchor, 'changedNativeCache;'))))
      .toThrow('anchor:bgm:failed-cache');
  });
});
