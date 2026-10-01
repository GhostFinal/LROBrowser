// Sound effects belong to an action, so their deadline includes file loading and decoding.
export function createLastroSoundTiming({ now, wallNow, available }) {
  const records = new WeakMap(), pending = new Set(), files = new Map();
  let generation = 0, voices = 0;
  const maxAge = 500, minGap = 100;

  function current(token) {
    const record = token && records.get(token);
    return !!record && record.phase === 'pending' && record.generation === generation
      && record.file.generation === record.fileGeneration && available()
      && now() - record.started <= maxAge;
  }

  function release(token) {
    const record = token && records.get(token);
    if (!record || record.phase === 'ended') return;
    pending.delete(token);
    if (record.phase === 'playing') { voices--; record.file.voices--; }
    record.phase = 'ended';
  }

  function capture(filename, dueTick) {
    if (!available() || typeof filename !== 'string' || !filename) return null;
    const overdue = Number.isFinite(dueTick) ? Math.max(0, wallNow() - dueTick) : 0;
    if (overdue > maxAge) return null;
    for (const token of pending) if (!current(token)) release(token);
    if (pending.size >= 32) return null;
    const stamp = now();
    let file = files.get(filename);
    if (!file) { file = { generation: 0, requested: -Infinity, played: -Infinity, voices: 0 }; files.set(filename, file); }
    if (stamp - file.requested < minGap) return null;
    file.requested = stamp;
    const token = Object.freeze({ filename });
    records.set(token, { file, generation, fileGeneration: file.generation, started: stamp - overdue, phase: 'pending' });
    pending.add(token);
    return token;
  }

  function start(token) {
    if (!current(token)) { release(token); return false; }
    const record = records.get(token), stamp = now();
    if (voices >= 32 || record.file.voices >= 10 || stamp - record.file.played < minGap) {
      release(token); return false;
    }
    pending.delete(token);
    record.file.played = stamp;
    record.phase = 'playing'; record.file.voices++; voices++;
    return true;
  }

  function cancel(filename) {
    if (filename) { const file = files.get(filename); if (file) { file.generation++; file.requested = -Infinity; file.played = -Infinity; } }
    else { generation++; files.clear(); }
    for (const token of pending) if (!filename || token.filename === filename) release(token);
  }

  return { capture, current, start, release, cancel };
}

function installLastroTimedWebAudio({ timingFactory, AudioContextCtor, registerContext, fetchAudio, document, host, now, wallNow, soundEnabled }) {
  const stateKey = '__lastroWebAudio';
  if (host[stateKey]) return host[stateKey];
  let context, unlocked = false, bgm = null, bgmGeneration = 0, bgmVolume = 1;
  const buffers = new Map(), bgmPositions = new Map(), activeSounds = new Map();
  const timing = timingFactory({ now, wallNow, available: () => !document.hidden && context?.state === 'running' && soundEnabled() });

  const getContext = () => {
    if (!AudioContextCtor) throw new Error('Web Audio API is unavailable');
    if (!context) {
      context = registerContext(new AudioContextCtor());
      context.addEventListener?.('statechange', () => { if (context.state !== 'running') stopSound(); });
      if (unlocked && context.state === 'suspended') void context.resume().catch(() => {});
    }
    return context;
  };
  const resume = () => {
    unlocked = true;
    if (context?.state === 'suspended') void context.resume().catch(() => {});
  };
  const decode = (key, url) => {
    const existing = buffers.get(key);
    if (existing) return existing;
    const promise = fetchAudio(url).then(response => {
      if (!response.ok) throw new Error('Audio request failed: ' + response.status);
      return response.arrayBuffer();
    }).then(bytes => getContext().decodeAudioData(bytes));
    buffers.set(key, promise);
    void promise.catch(() => { if (buffers.get(key) === promise) buffers.delete(key); });
    return promise;
  };
  const disconnect = node => {
    try { node.stop(); } catch { /* It may have already ended. */ }
    try { node.disconnect(); } catch { /* A stopped node may already be disconnected. */ }
  };
  const stopBgm = () => {
    bgmGeneration++;
    if (!bgm) return 0;
    const ctx = getContext(), elapsed = Math.max(0, ctx.currentTime - bgm.startedAt);
    const offset = bgm.buffer.duration ? (bgm.offset + elapsed) % bgm.buffer.duration : 0;
    bgmPositions.set(bgm.filename, offset); disconnect(bgm.source);
    try { bgm.gain.disconnect(); } catch { /* Preserve saved position. */ }
    bgm = null;
    return offset;
  };
  const playBgm = async (filename, url, volume, requestedOffset = 0) => {
    bgmVolume = Math.max(0, Math.min(1, volume));
    const generation = ++bgmGeneration, buffer = await decode('bgm:' + filename, url);
    if (generation !== bgmGeneration || bgm?.filename === filename) return;
    stopBgm();
    const ctx = getContext(), source = ctx.createBufferSource(), gain = ctx.createGain();
    const offset = bgmPositions.get(filename) ?? requestedOffset;
    source.buffer = buffer; source.loop = true; source.connect(gain); gain.connect(ctx.destination);
    gain.gain.value = bgmVolume; source.start(0, offset);
    bgm = { filename, source, gain, buffer, offset, startedAt: ctx.currentTime };
  };
  const requestSound = (filename, dueTick) => {
    if (document.hidden || !soundEnabled()) return null;
    getContext();
    return timing.capture(filename, dueTick);
  };
  const playSound = async (filename, url, volume, request = requestSound(filename)) => {
    if (!request || request.filename !== filename || !timing.current(request)) { timing.release(request); return; }
    let buffer;
    try { buffer = await decode('sound:' + filename, url); }
    catch (error) { timing.release(request); throw error; }
    if (!timing.start(request)) return;
    const ctx = getContext();
    let source, gain, item, entry;
    const finish = () => {
      if (item?.ended) return;
      if (item) item.ended = true;
      timing.release(request);
      if (entry && item) {
        entry.delete(item);
        if (!entry.size && activeSounds.get(filename) === entry) activeSounds.delete(filename);
      }
      try { source?.disconnect(); gain?.disconnect(); } catch { /* Keep other voices usable. */ }
    };
    try {
      source = ctx.createBufferSource(); gain = ctx.createGain();
      entry = activeSounds.get(filename) || new Set(); activeSounds.set(filename, entry);
      item = { source, gain, baseVolume: volume, finish, ended: false }; entry.add(item);
      source.buffer = buffer; source.connect(gain); gain.connect(ctx.destination);
      gain.gain.value = Math.max(0, Math.min(1, volume));
      source.addEventListener('ended', finish, { once: true }); source.start();
    } catch (error) { finish(); throw error; }
  };
  const stopSound = filename => {
    timing.cancel(filename);
    const entries = filename ? [activeSounds.get(filename)] : [...activeSounds.values()];
    for (const entry of entries) {
      if (!entry) continue;
      for (const item of [...entry]) { disconnect(item.source); item.finish(); }
    }
  };
  const setBgmVolume = volume => {
    bgmVolume = Math.max(0, Math.min(1, volume));
    if (bgm) bgm.gain.gain.value = bgmVolume;
  };
  const setSoundVolume = volume => {
    for (const entry of activeSounds.values()) for (const item of entry) item.gain.gain.value = Math.max(0, Math.min(1, item.baseVolume * volume));
  };
  const state = { getContext, decode, playBgm, stopBgm, requestSound, isSoundCurrent: timing.current,
    playSound, stopSound, setBgmVolume, setSoundVolume };
  for (const event of ['pointerdown', 'keydown', 'touchstart', 'click']) document.addEventListener(event, resume, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSound(); });
  document.defaultView?.addEventListener('pagehide', () => stopSound());
  host[stateKey] = state;
  return state;
}

function replaceOne(source, needle, replacement, name) {
  if (source.split(needle).length !== 2) throw new Error('anchor:audio-timing:' + name);
  return source.replace(needle, replacement);
}

function patchRegion(source, name, transform) {
  const marker = '//#region ' + name, start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:audio-timing:' + name);
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
}

export function patchRuntimeAudioTiming(source) {
  const startMarker = 'function installLastROWebAudio() {', endMarker = 'const LastROWebAudio = installLastROWebAudio();';
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + startMarker.length) >= 0
    || source.indexOf(endMarker, end + endMarker.length) >= 0) throw new Error('anchor:audio-timing:web-audio');
  const installer = source.slice(start, end);
  for (const anchor of ['const stateKey = "__lastroWebAudio";', 'const playSound = async (filename, url, volume) => {',
    'const buffer = await decode("sound:" + filename, url);', 'source.start();']) {
    if (!installer.includes(anchor)) throw new Error('anchor:audio-timing:installer-drift');
  }
  let output = source.slice(0, start) + `${startMarker}
  return (${installLastroTimedWebAudio.toString()})({
    timingFactory: (${createLastroSoundTiming.toString()}),
    AudioContextCtor: globalThis.AudioContext || globalThis.webkitAudioContext,
    registerContext: LastROAudioRegisterContext,
    fetchAudio: url => fetch(url), document, host: globalThis,
    now: () => performance.now(), wallNow: () => Date.now(),
    soundEnabled: () => typeof Audio_default === "undefined" || !Audio_default?.Sound
      || (Audio_default.Sound.play !== false && Audio_default.Sound.volume > 0),
  });
}
` + source.slice(end);
  output = patchRegion(output, 'src/Audio/SoundManager.js', region => {
    const marker = 'Client.loadFile("data/wav/" + filename, (url) => {';
    region = replaceOne(region, marker, `const eventDueTick = typeof LastROEventDueTick === "function" ? LastROEventDueTick() : undefined;
        const renderTick = typeof Renderer !== "undefined" ? Renderer?.tick : undefined;
        const overdueRender = SessionStorage_default.Playing && Number.isFinite(renderTick) && Date.now() - renderTick > 500;
        const request = LastROWebAudio.requestSound(filename, overdueRender ? renderTick : eventDueTick);
        if (!request) return;
        ${marker}
          if (!LastROWebAudio.isSoundCurrent(request)) return;`, 'sound-load');
    return replaceOne(region, 'LastROWebAudio.playSound(filename, url, volume)', 'LastROWebAudio.playSound(filename, url, volume, request)', 'sound-play');
  });
  output = patchRegion(output, 'src/Audio/BGM.js', region => {
    region = replaceOne(region, 'if (BGM.filename === filename) BGM.load(url);', 'if (BGM.filename === filename && !BGM.stopped) BGM.load(url);', 'bgm-load-callback');
    return replaceOne(region, 'if (!Audio_default.BGM.play || !BGM.filename) return;', 'if (!Audio_default.BGM.play || !BGM.filename || BGM.stopped) return;', 'bgm-stopped');
  });
  return output;
}
