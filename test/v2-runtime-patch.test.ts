import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { patchLegacyScriptSinks, patchTrustedTypesDomWrites, patchV2Runtime } from '../scripts/patch-v2-runtime.mjs';
import { buildClientConfig } from '../src/runtime/client-config';
import { LASTRO_SERVER_PROFILES } from '../src/servers/server-profiles';

const profile = LASTRO_SERVER_PROFILES[0];
if (!profile || profile.availability !== 'available') throw new Error('missing fixture profile');

describe('V2 runtime patch', () => {
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
      'function compileTemplate(importsKeys, sourceURL, source, importsValues) { return Function(importsKeys, sourceURL + "return " + source).apply(undefined, importsValues); }',
      'function addPreloader(el) { el.innerHTML = PRELOADER_INNER_HTML; }',
      '/** Earlier runtime documentation */\nconst retainedRuntime = 1;',
      '//#region src/Network/SocketHelpers/WebSocket.js\nfunction Socket$1() {}\n//#endregion',
      '//#region src/Network/SocketHelpers/NodeSocket.js\nvar Socket;\n//#endregion',
      'function defaultSocketFactory(host, port) { return new Socket(host, port); }',
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
    expect(patched).toContain('globalThis.LastRODirectSocketFactory(host, port)');
    expect(patched).toContain('lastro-account-login.mjs');
    expect(patched).toContain('installLastROLogin({ root, component: Component, configs: Configs })');
    expect(patched).toContain('LastROLoginBeforeConnect');
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
    await expect(readFile('.staging/v2/Online.js', 'utf8')).resolves.toContain('defaultSocketFactory');
  });

  it('sets skipIntro to bypass local GRF file picker', () => {
    const config = buildClientConfig(profile, { username: 'test', password: 'pass' });
    expect(config.skipIntro).toBe(true);
  });
});
