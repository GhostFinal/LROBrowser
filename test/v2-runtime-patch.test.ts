import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { patchGuildEmblemRequestCallbacks, patchLegacyScriptSinks, patchTrustedTypesDomWrites, patchV2Runtime, patchWebAudioPlayback } from '../scripts/patch-v2-runtime.mjs';
import { buildClientConfig } from '../src/runtime/client-config';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

const profile = LASTRO_SERVER_PROFILES[0];
if (!profile || profile.availability !== 'available') throw new Error('missing fixture profile');

describe('V2 runtime patch', () => {
  it('routes BGM and sound effects through decoded Web Audio buffers', () => {
    const source = [
      'var BGM = class BGM {',
      '  static audio = document.createElement("audio");',
      '  static load(url) { BGM.audio.src = url; BGM.audio.play(); }',
      '  static stop() { BGM.audio.pause(); }',
      '};',
      'var SoundManager = class SoundManager {',
      '  static play(filename, vol) { const audio = document.createElement("audio"); audio.src = filename; audio.play(); }',
      '  static stop(filename) { return filename; }',
      '};',
      'function createRainAudio() { this.audioCtx = new AudioContext(); }',
    ].join('\n');
    const patched = patchWebAudioPlayback(source);
    expect(patched).toContain('LastROWebAudio.playBgm');
    expect(patched).toContain('LastROWebAudio.playSound');
    expect(patched).not.toContain('document.createElement("audio")');
    expect(patched).not.toContain('BGM.audio.play()');
    expect(patched).not.toContain('audio.play().catch');
    expect(patched).toContain('decodeAudioData');
    expect(patched).toContain('source.loop = true');
  });

  it('keeps guild emblem callback arguments image-first', () => {
    const source = 'this.onSuccess(entry.guildId, entry.version, entry.image, entry.gif);';
    expect(patchGuildEmblemRequestCallbacks(source)).toBe('this.onSuccess(entry.guildId, entry.image, entry.gif);');
  });

  it('removes legacy html2canvas proxy and FlashCanvas script sinks', () => {
    const source = [
      'function proxyGetImage(url, img, imageObj) {',
      '  let script = document.createElement("script");',
      '  script.setAttribute("src", options.proxy);',
      '  document.body.appendChild(script);',
      '}',
      '_html2canvas.Renderer.Canvas = function(options) {',
      '  let canvas = document.createElement("canvas");',
      '  if (canvas.getContext) { canvasReadyToDraw = true; }',
      '  else if (options.flashcanvas !== undefined) {',
      '    let script = document.createElement("script");',
      '    script.src = options.flashcanvas;',
      '    document.body.appendChild(script);',
      '  }',
      '  methods = { _create() {} };',
      '};',
    ].join('\n');
    const patched = patchLegacyScriptSinks(source);
    expect(patched).not.toContain('createElement("script")');
    expect(patched).not.toContain('options.proxy');
    expect(patched).not.toContain('options.flashcanvas');
  });

  it('rewrites executable DOM HTML sinks, including Background.setImage', () => {
    const source = [
      'class Background {',
      '  static setImage() { _container.innerHTML = ""; }',
      '  static replace() { node.outerHTML = html; }',
      '  static append() { node.insertAdjacentHTML("beforeend", html); }',
      '  static appendText() { node.innerHTML += html; }',
      '}',
    ].join('\n');
    const patched = patchTrustedTypesDomWrites(source);
    expect(patched).toContain('setLastROInnerHTML(_container, "")');
    expect(patched).toContain('setLastROOuterHTML(node, html)');
    expect(patched).toContain('setLastROAdjacentHTML(node, "beforeend", html)');
    expect(patched).not.toContain('_container.innerHTML =');
    expect(patched).not.toContain('node.outerHTML =');
    expect(patched).not.toContain('node.insertAdjacentHTML(');
    expect(patched).not.toContain('node.innerHTML +=');
  });

  it('replaces the factory and removes legacy initialization regions', () => {
    const fixture = [
      'import { existing } from "./existing.mjs?build=fixture-1";',
      'var root = freeGlobal || freeSelf || Function("return this")();',
      'var Common_default$1 = "body {\\r\\n\\tfont-size: 12px;\\r\\n\\tfont-family: \'SCDream\', Arial, sans-serif;\\r\\n\\tfont-size-adjust: 0.5186;\\r\\n}\\r\\n:host {\\r\\n\\ttouch-action: manipulation;\\r\\n}";',
      'function drawLabel(ctx) { ctx.font = "10px Arial"; }',
      'var BGM = class BGM { static audio = document.createElement("audio"); static load(url) { BGM.audio.src = url; BGM.audio.play(); } };',
      'var SoundManager = class SoundManager { static play() { const audio = document.createElement("audio"); audio.play(); } };',
      'function createRainAudio() {',
      '\tconst AudioContext = window.AudioContext || window.webkitAudioContext;',
      '\tthis.audioCtx = new AudioContext();',
      '}',
      'function compileTemplate(importsKeys, sourceURL, source, importsValues) { return Function(importsKeys, sourceURL + "return " + source).apply(undefined, importsValues); }',
      'function addPreloader(el) { el.innerHTML = PRELOADER_INNER_HTML; }',
      '/** Earlier runtime documentation */\nconst retainedRuntime = 1;',
      '//#region src/Network/SocketHelpers/WebSocket.js\nfunction Socket$1() {}\n//#endregion',
      '//#region src/Network/SocketHelpers/NodeSocket.js\nvar Socket;\n//#endregion',
      'function defaultSocketFactory(host, port) { return new Socket(host, port); }',
      'function onConnectionRequest(username, password) {',
      '\tNetwork.connect(_server.address, _server.port, (success) => {',
      '\t\tif (!success) return;',
      '\t\tlet pkt;',
      '\t\tfunction sendLogin() {',
      '\t\t\tif (Configs.get("loginMode") == "han") {',
      '\t\t\t\tpkt = new PACKET.CA.LOGIN_HAN();',
      '\t\t\t\tNetwork.sendPacket(pkt);',
      '\t\t\t} else {',
      '\t\t\t\tpkt = new PACKET.CA.LOGIN();',
      '\t\t\t\tNetwork.sendPacket(pkt);',
      '\t\t\t}',
      '\t\t}',
      '\t});',
      '}',
      'function init_NetworkManager() { init_WebSocket(); init_NodeSocket(); }',
      'function init() {\n\troInitSpinner.add();\n\tPlugins.init();\n\tGameEngine.init();\n}',
      'function initThread() {\n\tif (!_source) _source = new Worker(new URL(\n\t\t/* @vite-ignore */\n\t\t"" + new URL("LastROThreadEventHandler.js", import.meta.url).href,\n\t\t"" + import.meta.url\n\t), { type: "classic" });\n\tif (_source instanceof Worker) _source.addEventListener("message", Thread.receive, false);\n}',
      'function initializePathFindingWorker() { const workerUrl = new URL("PathFindingWorker.js", import.meta.url).href; return new Worker(workerUrl); }',
      'function loadXMLFile(filename, callback, onEnd) {}',
      'function loadLuaValue(file_path, variable_name, callback, onEnd) { Client.loadFile(file_path, function(file) {}); }',
      ...['map', 'npc', 'link', 'linkdistance', 'npcdistance'].map(table => `loadLuaValue(DB.LUA_PATH + "navigation/navi_${table}_krpri.lub", "Navi_Table", callback, onEnd);`),
      'function onReady() { _thread_ready = true; savingFiles(files); }',
      'function updateGamepads() { const gamepads = navigator.getGamepads ? navigator.getGamepads() : []; }',
      'function clientInit() { if (remoteClient) Thread.send("SET_HOST", remoteClient); }',
      'function loginInit() {\n\t\t\t\tThread.send("SET_HOST", remoteClient);\n}',
      'function loadFiles() { if (!Configs.get("remoteClient") && !count && !window.electronAPI?.isElectron) { alert("x"); } }',
      'function createWinLogin({ name, htmlText, cssText }) {',
      '\t\tconst Component = new GUIComponent(name, enhanceWinLoginStyles(name, cssText));',
      '\t\tconst renderedHtmlText = enhanceWinLoginTemplate(name, htmlText);',
      '\t\tvoid 0;',
      '\t\tpopulateLoginServerButtons(root, Configs.get("loginServerProfiles", []), Configs.getServer?.().id || "lastro", (profile) => Component.onServerSelect(profile));',
      '\t\tconst user = _inputUsername.value;',
      '\t\tconst pass = _inputPassword.value;',
      '\t\tapplyDebugLoginFields();',
      '\t}',
    ].join('\n');
    const patched = patchV2Runtime(fixture);
    const transpiled = ts.transpileModule(patched, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
      reportDiagnostics: true,
    });
    expect(transpiled.diagnostics ?? []).toEqual([]);
    expect(patched).toContain('globalThis.LastRODirectSocketFactory(host, port)');
    expect(patched).toContain("font-family: 'Source Han Sans CN', sans-serif");
    expect(patched).toContain('font-size: 13px');
    expect(patched).toContain('font-size-adjust: none');
    expect(patched).toContain('ctx.font = "10px \'Source Han Sans CN\'"');
    expect(patched).not.toContain('Arial');
    expect(patched).toContain('function installLastROAudioUnlock()');
    expect(patched).toContain('installLastROAudioUnlock();\nimport { existing }');
    expect(patched).toContain('LastROWebAudio.playBgm');
    expect(patched).toContain('LastROWebAudio.playSound');
    expect(patched).not.toContain('document.createElement("audio")');
    expect(patched).not.toContain('BGM.audio.play()');
    expect(patched).not.toContain('audio.play().catch');
    expect(patched).toContain('this.audioCtx = LastROAudioRegisterContext(new AudioContext());');
    expect(patched).toContain('const resumeAudioContexts = () => {');
    expect(patched).toContain('lastro-account-login.mjs');
    expect(patched).toContain('installLastROLogin({ root, component: Component, configs: Configs })');
    expect(patched).toContain('LastROLoginBeforeConnect');
    expect(patched).toContain('LastROLoginAfterPassword');
    expect(patched).toContain('Network.sendPacket(pkt);\n\t\t\t\tif (typeof globalThis.LastROLoginAfterPassword');
    expect(patched).toContain('globalThis;');
    expect(patched).toContain('Dynamic templates are disabled in the IWA runtime');
    expect(patched).toContain('trustedTypes.createPolicy("lastro-iwa-worker"');
    expect(patched).toContain('return policy.createScriptURL(workerUrl.href);');
    expect(patched).toContain('Unexpected worker URL');
    expect(patched).not.toContain('"" + new URL("LastROThreadEventHandler.js"');
    expect(patched).toContain('createLastROWorkerScriptUrl("LastROThreadEventHandler.js")');
    expect(patched).toContain('createLastROWorkerScriptUrl("PathFindingWorker.js")');
    expect(patched).not.toContain('new URL("PathFindingWorker.js", import.meta.url).href');
    expect(patched).toContain('span.textContent = character');
    expect(patched).toContain('el.append(spinner, text)');
    expect(patched).not.toContain('el.innerHTML = PRELOADER_INNER_HTML');
    expect(patched).toContain('const retainedRuntime = 1;');
    expect(patched).not.toContain('?build=');
    expect(patched).not.toMatch(/WebSocket|wss?:\/\/|socketProxy|electronAPI|NodeSocket/i);
  });

  it('fails closed when an anchored region drifts', () => {
    expect(() => patchV2Runtime('function defaultSocketFactory(host, port) {}')).toThrow(/anchor|function/);
  });

  it('maps available profiles to one server and only selected credentials', () => {
    for (const candidate of LASTRO_SERVER_PROFILES.slice(0, 2)) {
      if (candidate.availability !== 'available') throw new Error('unexpected unavailable profile');
      const config = buildClientConfig(candidate, { username: 'user', password: 'pass' });
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0]).toMatchObject({ address: candidate.loginAddress, port: candidate.loginPort,
        version: candidate.version, langtype: candidate.langtype, packetver: candidate.packetver });
      expect(config.autoLogin).toEqual(['user', 'pass']);
      expect(JSON.stringify(config)).not.toMatch(/wss?:\/\/|XKore|quickLogin|socketProxy/i);
      expect(Object.isFrozen(config)).toBe(true);
    }
  });

  it('keeps the real imported runtime source available for the next patch step', async () => {
    await expect(readFile('vendor/v2/Online.js', 'utf8')).resolves.toContain('defaultSocketFactory');
  });

  it('keeps the built-in vertical flip disabled for the ILLUSION status', async () => {
    const runtime = await readFile('vendor/v2/Online.js', 'utf8');
    expect(runtime).toMatch(/static setActive\(bool\)\s*\{\s*_active\$3 = false;\s*\}/);
    expect(runtime).toContain('if (efstConst == StatusConst_default.ILLUSION) VerticalFlip.setActive(true);');
  });

  it('applies bundled Chinese typography to the generated runtime', async () => {
    const runtime = await readFile('generated/runtime/Online.js', 'utf8');
    expect(runtime).toContain("font-family: 'Source Han Sans CN'");
    expect(runtime).toContain('font-size: 13px');
    expect(runtime).not.toContain('SCDream');
    expect(runtime).not.toContain('Arial');
  });

  it('registers Web Audio contexts in the generated runtime for activation resume', async () => {
    const runtime = await readFile('generated/runtime/Online.js', 'utf8');
    expect(runtime).toContain('this.audioCtx = LastROAudioRegisterContext(new AudioContext());');
    expect(runtime).toContain('const resumeAudioContexts = () => {');
  });

  it('sets skipIntro to bypass local GRF file picker', () => {
    const config = buildClientConfig(profile, { username: 'test', password: 'pass' });
    expect(config.skipIntro).toBe(true);
  });
});
