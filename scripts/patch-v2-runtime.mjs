import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import ts from 'typescript';

const repo = fileURLToPath(new URL('../', import.meta.url));

function fail(code) {
  throw new Error(JSON.stringify({ code }));
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function replaceOnce(source, needle, replacement) {
  if (count(source, needle) !== 1) fail(`anchor:${needle}`);
  return source.replace(needle, replacement);
}

function removeRegion(source, names) {
  const pattern = new RegExp(`//#region src/Network/SocketHelpers/(?:${names.join('|')})\\.js\\r?\\n[\\s\\S]*?//#endregion`, 'g');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) fail(`region:${names.join('|')}`);
  const match = matches[0];
  return source.slice(0, match.index) + source.slice(match.index + match[0].length);
}

function replaceFunctionBody(source, name, body) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) fail(`function:${name}`);
  const node = matches[0];
  const start = node.body.getStart(file);
  return source.slice(0, start) + body + source.slice(node.body.end);
}

function patchLoginRegistrationHook(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'onConnectionRequest') matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) fail('function:onConnectionRequest');
  const node = matches[0];
  let body = source.slice(node.body.getStart(file), node.body.end);
  const hook = '\n\t\t\t\tif (typeof globalThis.LastROLoginAfterPassword === "function") globalThis.LastROLoginAfterPassword(username, password);';
  const hanMarker = '\t\t\t\tNetwork.sendPacket(pkt);\n\t\t\t} else {';
  const normalMarker = '\t\t\t\tNetwork.sendPacket(pkt);\n\t\t\t}\n\t\t}\n\t});\n}';
  if (count(body, hanMarker) !== 1) fail('anchor:login-han-send');
  if (count(body, normalMarker) !== 1) fail('anchor:login-send');
  body = body.replace(hanMarker, `\t\t\t\tNetwork.sendPacket(pkt);${hook}\n\t\t\t} else {`);
  body = body.replace(normalMarker, `\t\t\t\tNetwork.sendPacket(pkt);${hook}\n\t\t\t}\n\t\t}\n\t});\n}`);
  return source.slice(0, node.body.getStart(file)) + body + source.slice(node.body.end);
}

function patchRuntimeTypography(source) {
  const commonPattern = /(Common_default\$1\s*=\s*)("(?:\\.|[^"\\])*")/;
  const match = source.match(commonPattern);
  if (!match) fail('anchor:common-css');
  let commonCss;
  try {
    const escapeMap = { '\\r': '\r', '\\n': '\n', '\\t': '\t', '\\b': '\b', '\\f': '\f', '\\v': '\v', '\\\\': '\\', '\\"': '"' };
    commonCss = match[2].slice(1, -1).replace(/\\(?:r|n|t|b|f|v|\\|")/g, (escape) => escapeMap[escape]);
  } catch {
    fail('anchor:common-css-json');
  }
  commonCss = commonCss
    .replaceAll('font-size-adjust: 0.5186', 'font-size-adjust: none')
    .replaceAll('SCDream', 'Source Han Sans CN')
    .replaceAll('Arial', "'Source Han Sans CN'")
    + '\r\n\r\n/* LastRO IWA bundled Chinese typography */\r\n'
    + ':host, body {\r\n'
    + '\tfont-family: \'Source Han Sans CN\', sans-serif;\r\n'
    + '\tfont-size-adjust: none;\r\n'
    + '}\r\n'
    + 'body, .title, .ui-btn {\r\n'
    + '\tfont-size: 13px;\r\n'
    + '}\r\n';
  return source.replace(match[0], `${match[1]}${JSON.stringify(commonCss)}`)
    .replaceAll('SCDream', 'Source Han Sans CN')
    .replaceAll('Arial', "'Source Han Sans CN'");
}

function replaceWorkerCreation(source) {
  const pattern = /if \(!_source\) _source = new Worker\(new URL\(\s*\/\* @vite-ignore \*\/\s*"" \+ new URL\("LastROThreadEventHandler\.js", import\.meta\.url\)\.href,\s*"" \+ import\.meta\.url\s*\), \{ type: "classic" \}\);/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) fail('anchor:trusted-worker-url');
  const replacement = [
    'if (!_source) _source = new Worker(createLastROWorkerScriptUrl("LastROThreadEventHandler.js"), { type: "classic" });',
  ].join('\n');
  return source.replace(pattern, replacement);
}

function replacePathFindingWorkerCreation(source) {
  return replaceOnce(source,
    'const workerUrl = new URL("PathFindingWorker.js", import.meta.url).href;',
    'const workerUrl = createLastROWorkerScriptUrl("PathFindingWorker.js");');
}

const webAudioRuntime = String.raw`
function installLastROWebAudio() {
	const stateKey = "__lastroWebAudio";
	if (globalThis[stateKey]) return globalThis[stateKey];
	const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
	let context;
	let unlocked = false;
	const buffers = new Map();
	const bgmPositions = new Map();
	const activeSounds = new Map();
	let bgm = null;
	let bgmGeneration = 0;
	const getContext = () => {
		if (!AudioContextCtor) throw new Error("Web Audio API is unavailable");
		if (!context) {
			context = LastROAudioRegisterContext(new AudioContextCtor());
			if (unlocked && context.state === "suspended") void context.resume().catch(() => {});
		}
		return context;
	};
	const resume = () => {
		unlocked = true;
		if (context?.state === "suspended") void context.resume().catch(() => {});
	};
	const decode = (key, url) => {
		const existing = buffers.get(key);
		if (existing) return existing;
		const promise = fetch(url).then((response) => {
			if (!response.ok) throw new Error("Audio request failed: " + response.status);
			return response.arrayBuffer();
		}).then((bytes) => getContext().decodeAudioData(bytes));
		buffers.set(key, promise);
		promise.catch(() => { if (buffers.get(key) === promise) buffers.delete(key); });
		return promise;
	};
	const disconnect = (node) => {
		try { node.stop(); } catch {}
		try { node.disconnect(); } catch {}
	};
	const stopBgm = () => {
		bgmGeneration++;
		if (!bgm) return 0;
		const ctx = getContext();
		const elapsed = Math.max(0, ctx.currentTime - bgm.startedAt);
		const offset = bgm.buffer.duration ? (bgm.offset + elapsed) % bgm.buffer.duration : 0;
		bgmPositions.set(bgm.filename, offset);
		disconnect(bgm.source);
		try { bgm.gain.disconnect(); } catch {}
		bgm = null;
		return offset;
	};
	const playBgm = async (filename, url, volume, requestedOffset = 0) => {
		const generation = ++bgmGeneration;
		const buffer = await decode("bgm:" + filename, url);
		if (generation !== bgmGeneration) return;
		if (bgm?.filename === filename) return;
		stopBgm();
		const ctx = getContext();
		const source = ctx.createBufferSource();
		const gain = ctx.createGain();
		const offset = bgmPositions.get(filename) ?? requestedOffset;
		source.buffer = buffer;
		source.loop = true;
		source.connect(gain);
		gain.connect(ctx.destination);
		gain.gain.value = Math.max(0, Math.min(1, volume));
		source.start(0, offset);
		bgm = { filename, source, gain, buffer, offset, startedAt: ctx.currentTime };
	};
	const playSound = async (filename, url, volume) => {
		const buffer = await decode("sound:" + filename, url);
		const ctx = getContext();
		const source = ctx.createBufferSource();
		const gain = ctx.createGain();
		const entry = activeSounds.get(filename) || new Set();
		activeSounds.set(filename, entry);
		const item = { source, gain, baseVolume: volume };
		entry.add(item);
		source.buffer = buffer;
		source.connect(gain);
		gain.connect(ctx.destination);
		gain.gain.value = Math.max(0, Math.min(1, volume));
		source.addEventListener("ended", () => {
			entry.delete(item);
			if (!entry.size) activeSounds.delete(filename);
			try { source.disconnect(); gain.disconnect(); } catch {}
		}, { once: true });
		source.start();
	};
	const stopSound = (filename) => {
		const entries = filename ? [activeSounds.get(filename)] : [...activeSounds.values()];
		for (const entry of entries) {
			if (!entry) continue;
			for (const item of entry) disconnect(item.source);
		}
		if (filename) activeSounds.delete(filename); else activeSounds.clear();
	};
	const setBgmVolume = (volume) => { if (bgm) bgm.gain.gain.value = Math.max(0, Math.min(1, volume)); };
	const setSoundVolume = (volume) => {
		for (const entry of activeSounds.values()) for (const item of entry)
			item.gain.gain.value = Math.max(0, Math.min(1, item.baseVolume * volume));
	};
	const state = { getContext, decode, playBgm, stopBgm, playSound, stopSound, setBgmVolume, setSoundVolume };
	for (const event of ["pointerdown", "keydown", "touchstart", "click"]) document.addEventListener(event, resume, { capture: true, passive: true });
	globalThis[stateKey] = state;
	return state;
}
const LastROWebAudio = installLastROWebAudio();
`;

function replaceClassExpression(source, className, replacement) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(file) === className && ts.isClassExpression(node.right)) matches.push(node.right);
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === className
      && node.initializer && ts.isClassExpression(node.initializer)) matches.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1) fail(`class:${className}`);
  return source.slice(0, matches[0].getStart(file)) + replacement + source.slice(matches[0].end);
}

export function patchWebAudioPlayback(source) {
  let output = source;
  output = replaceClassExpression(output, 'BGM', `class BGM {
		static filename = null;
		static volume = Audio_default.BGM.volume;
		static extension = "mp3";
		static isInit = false;
		static stopped = true;
		static cache = { filename: null, currentTime: 0 };
		static init() { BGM.isInit = true; }
		static setAvailableExtensions(extensions) {
			if (extensions?.length) BGM.extension = extensions[0];
			BGM.init();
		}
		static play(filename) {
			if (!filename) return;
			if (filename.match(/bgm/i)) {
				filename = filename.match(/\\w+\\.mp3/i)?.toString();
				if (!filename) return;
			}
			if (BGM.filename === filename && !BGM.stopped) return;
			if (BGM.filename && !BGM.stopped) BGM.cache.filename = BGM.filename;
			BGM.filename = filename;
			BGM.stopped = false;
			if (Audio_default.BGM.play) Client.loadFile("BGM/" + filename, (url) => {
				if (BGM.filename === filename) BGM.load(url);
			});
		}
		static load(url) {
			if (!Audio_default.BGM.play || !BGM.filename) return;
			const filename = BGM.filename;
			const targetTime = BGM.cache.filename === filename ? BGM.cache.currentTime : 0;
			void LastROWebAudio.playBgm(filename, url, BGM.volume, targetTime).catch((error) => console.warn("Failed to play BGM:", error));
		}
		static stop() {
			BGM.cache.filename = BGM.filename;
			BGM.cache.currentTime = LastROWebAudio.stopBgm();
			BGM.stopped = true;
		}
		static setVolume(volume) {
			BGM.volume = Math.max(0, Math.min(1, volume));
			Audio_default.BGM.volume = BGM.volume;
			Audio_default.save();
			LastROWebAudio.setBgmVolume(BGM.volume);
		}
	}`,);
  output = replaceClassExpression(output, 'SoundManager', `class SoundManager {
		static volume = Audio_default.Sound.volume;
		static play(filename, vol) {
			const volume = (vol === undefined ? 1 : vol) * this.volume;
			if (volume <= 0 || !Audio_default.Sound.play || !filename) return;
			Client.loadFile("data/wav/" + filename, (url) => {
				void LastROWebAudio.playSound(filename, url, volume).catch((error) => console.warn("Failed to play sound:", error));
			});
		}
		static playPosition(filename, srcPosition) {
			const dist = Math.floor(gl_matrix_default.vec2.dist(srcPosition, SessionStorage_default.Entity.position));
			const vol = Math.max(1 - Math.abs((dist - 1) * .99 / 24 + .01), .1);
			SoundManager.play(filename, vol);
		}
		static stop(filename) { LastROWebAudio.stopSound(filename); }
		static setVolume(volume) {
			this.volume = Math.max(0, Math.min(1, volume));
			Audio_default.Sound.volume = this.volume;
			Audio_default.save();
			LastROWebAudio.setSoundVolume(this.volume);
		}
	}`,);
  output = replaceOnce(
    output,
    'this.audioCtx = new AudioContext();',
    'this.audioCtx = LastROAudioRegisterContext(new AudioContext());',
  );
  return webAudioRuntime + output;
}

/**
 * Remove legacy html2canvas script injection paths. IWA Trusted Types blocks
 * dynamic TrustedScriptURL assignments, and these proxy/FlashCanvas branches
 * are obsolete in the canvas-capable browser runtime.
 */
export function patchLegacyScriptSinks(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const proxyFunctions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'proxyGetImage') proxyFunctions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (proxyFunctions.length === 1) {
    const node = proxyFunctions[0];
    const bodyStart = node.body.getStart(file);
    source = source.slice(0, bodyStart) + `{
    imageObj.succeeded = false;
    images.numLoaded++;
    images.numFailed++;
    start();
  }` + source.slice(node.body.end);
  } else if (proxyFunctions.length > 1) {
    fail('function:proxyGetImage');
  }
  const branch = /}\s*else if \(options\.flashcanvas !== undefined\) \{[\s\S]*?(?=\n\s*methods = \{)/;
  if (branch.test(source)) {
    source = source.replace(branch, '} else {\n\t\t\t\tcanvasReadyToDraw = false;\n\t\t\t}');
  }
  if (/createElement\(\s*["']script["']\s*\)/.test(source)
    || /(?:\.src|setAttribute\(\s*["']src["'])\s*=?.*(?:proxy|flashcanvas)/i.test(source)) {
    fail('legacy-script-sink');
  }
  return source;
}

export function patchGuildEmblemRequestCallbacks(source) {
  const callback = 'this.onSuccess(entry.guildId, entry.version, entry.image, entry.gif);';
  const replacement = 'this.onSuccess(entry.guildId, entry.image, entry.gif);';
  const count = source.split(callback).length - 1;
  if (count === 0) return source;
  if (count !== 1) fail('anchor:guild-emblem-onSuccess');
  return source.replace(callback, replacement);
}

export function patchTrustedTypesDomWrites(source) {
  const file = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
      && node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken
      && node.left.name.text === 'innerHTML') {
      edits.push({
        start: node.getStart(file),
        end: node.end,
        text: `setLastROAdjacentHTML(${node.left.expression.getText(file)}, "beforeend", ${node.right.getText(file)})`,
      });
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)) {
      const property = node.left.name.text;
      const helper = property === 'innerHTML' ? 'setLastROInnerHTML'
        : property === 'outerHTML' ? 'setLastROOuterHTML' : undefined;
      if (helper) edits.push({
        start: node.getStart(file),
        end: node.end,
        text: `${helper}(${node.left.expression.getText(file)}, ${node.right.getText(file)})`,
      });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'insertAdjacentHTML' && node.arguments.length === 2) {
      edits.push({
        start: node.getStart(file),
        end: node.end,
        text: `setLastROAdjacentHTML(${node.expression.expression.getText(file)}, ${node.arguments[0].getText(file)}, ${node.arguments[1].getText(file)})`,
      });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'parseFromString' && node.arguments.length === 2
      && ts.isStringLiteral(node.arguments[1]) && node.arguments[1].text === 'application/xml') {
      edits.push({
        start: node.getStart(file),
        end: node.end,
        text: `parseLastROXML(${node.expression.expression.getText(file)}, ${node.arguments[0].getText(file)})`,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!edits.length) return source;
  edits.sort((left, right) => right.start - left.start);
  let output = source;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  if (!/from ["']\.\/lastro-trusted-dom\.mjs["']/.test(output)) {
    output = `import { setLastROAdjacentHTML, setLastROInnerHTML, setLastROOuterHTML } from "./lastro-trusted-dom.mjs";\n${output}`;
  }
  if (edits.some(edit => edit.text.startsWith('parseLastROXML('))
    && !/import\s*\{[^}]*\bparseLastROXML\b[^}]*\}\s*from ["']\.\/lastro-trusted-dom\.mjs["']/.test(output)) {
    output = `import { parseLastROXML } from "./lastro-trusted-dom.mjs";\n${output}`;
  }
  return output;
}

function patchLuaValueFailure(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const loader = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadLuaValue');
  if (loader.length !== 1) fail('function:loadLuaValue');
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.getText(file) === 'Client.loadFile' && node.arguments.length === 2) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(loader[0]);
  if (calls.length !== 1) fail('anchor:loadLuaValue-loadFile');
  const end = calls[0].arguments.end;
  return source.slice(0, end) + `, function(error) {
      console.error("[loadLuaValue] Failed to load " + file_path, error);
      if (onEnd) onEnd.call();
    }` + source.slice(end);
}

export function patchV2Runtime(source) {
  if (!source.startsWith('import ')) fail('anchor:runtime-imports');
  const normalizedSource = source.replace(/\r\n/g, '\n');
  let output = `import { decorateLastROLoginTemplate, decorateLastROLoginStyles, installLastROLogin } from "./lastro-account-login.mjs";
function createLastROWorkerScriptUrl(relativePath) {
	if (relativePath !== "LastROThreadEventHandler.js" && relativePath !== "PathFindingWorker.js") {
		throw new TypeError("Unexpected worker path");
	}
	const workerUrl = new URL(relativePath, import.meta.url);
	const trustedTypes = globalThis.trustedTypes;
	if (!trustedTypes) return workerUrl.href;
	const allowedWorkerUrls = ["LastROThreadEventHandler.js", "PathFindingWorker.js"]
		.map(path => new URL(path, import.meta.url).href);
	const policyKey = "__lastroIwaWorkerPolicy";
	const policy = globalThis[policyKey] ?? (globalThis[policyKey] = trustedTypes.createPolicy("lastro-iwa-worker", {
		createScriptURL: (value) => {
			const candidate = new URL(value, import.meta.url);
			if (!allowedWorkerUrls.includes(candidate.href)) {
				throw new TypeError("Unexpected worker URL");
			}
			return candidate.href;
		},
	}));
	return policy.createScriptURL(workerUrl.href);
}
function installLastROAudioUnlock() {
	const stateKey = "__lastroAudioUnlock";
	if (globalThis[stateKey]) return globalThis[stateKey];
	let unlocked = false;
	let pendingBgm;
	const audioContexts = new Set();
	const resumeAudioContexts = () => {
		for (const context of audioContexts) {
			if (!context || typeof context.resume !== "function") continue;
			const promise = context.resume();
			if (promise && typeof promise.catch === "function") promise.catch(() => {});
		}
	};
	const retryBgm = () => {
		const audio = pendingBgm;
		pendingBgm = undefined;
		if (!audio || typeof audio.play !== "function") return;
		const promise = audio.play();
		if (promise && typeof promise.catch === "function") promise.catch((error) => {
			if (error?.name === "NotAllowedError") pendingBgm = audio;
		});
	};
	const unlock = () => {
		unlocked = true;
		resumeAudioContexts();
		retryBgm();
	};
	const registerContext = (context) => {
		if (!context || typeof context.resume !== "function") return context;
		audioContexts.add(context);
		if (unlocked && context.state === "suspended") {
			const promise = context.resume();
			if (promise && typeof promise.catch === "function") promise.catch(() => {});
		}
		return context;
	};
	const state = {
		unlock,
		registerContext,
		play(audio, retryOnUnlock = false) {
			const promise = audio.play();
			if (promise && typeof promise.catch === "function") promise.catch((error) => {
				if (error?.name === "NotAllowedError" && retryOnUnlock && !unlocked) pendingBgm = audio;
			});
			return promise;
		},
	};
	for (const event of ["pointerdown", "keydown", "touchstart", "click"])
		document.addEventListener(event, unlock, { capture: true, passive: true });
	globalThis[stateKey] = state;
	return state;
}
function LastROAudioPlay(audio, retryOnUnlock) {
	return installLastROAudioUnlock().play(audio, retryOnUnlock);
}
function LastROAudioUnlock() {
	installLastROAudioUnlock().unlock();
}
function LastROAudioRegisterContext(context) {
	return installLastROAudioUnlock().registerContext(context);
}
installLastROAudioUnlock();
${normalizedSource}`;
  output = output.replace(/\?build=[A-Za-z0-9._-]+/g, '');
  output = replaceOnce(output, '\troInitSpinner.add();\n\tPlugins.init();\n\tGameEngine.init();',
    '\troInitSpinner.add();\n\ttry {\n\t\tPlugins.init();\n\t\tGameEngine.init();\n\t} catch (error) {\n\t\troInitSpinner.remove();\n\t\tthrow error;\n\t}');
  output = replaceOnce(output, 'if (_source instanceof Worker) _source.addEventListener("message", Thread.receive, false);',
    'if (_source instanceof Worker) {\n\t\t\t\tconsole.info("[LastRO IWA] waiting for resource worker");\n\t\t\t\t_source.addEventListener("error", (event) => console.error("[LastRO IWA] resource worker failed", event.message));\n\t\t\t\t_source.addEventListener("message", Thread.receive, false);\n\t\t\t}');
  output = replaceOnce(output, '_thread_ready = true;', '_thread_ready = true;\n\t\t\t\t\t\tconsole.info("[LastRO IWA] resource worker ready; initializing renderer");');
  output = replaceOnce(output, 'savingFiles(files);', 'console.info("[LastRO IWA] initializing remote client resources");\n\t\t\tThread.send("CLIENT_INIT", { files: [], save: false }, (...args) => Client.onFilesLoaded(...args));');
  output = replaceFunctionBody(output, 'defaultSocketFactory', '{\n\tif (typeof globalThis.LastRODirectSocketFactory !== "function") throw new Error("Direct TCP factory unavailable");\n\treturn globalThis.LastRODirectSocketFactory(host, port);\n}');
  output = patchLoginRegistrationHook(output);
  output = patchWebAudioPlayback(output);
  output = replaceOnce(output, 'init_WebSocket();', '');
  output = replaceOnce(output, 'init_NodeSocket();', '');
  output = replaceWorkerCreation(output);
  output = replacePathFindingWorkerCreation(output);
  output = patchLegacyScriptSinks(output);
  output = patchLuaValueFailure(output);
  for (const table of ['map', 'npc', 'link', 'linkdistance', 'npcdistance']) {
    output = replaceOnce(output, `DB.LUA_PATH + "navigation/navi_${table}_krpri.lub"`,
      `DB.LUA_PATH + "navigation/" + (Configs.get("lastroProtocol", false) ? "navi_${table}_tw.lub" : "navi_${table}_krpri.lub")`);
  }
  output = replaceFunctionBody(output, 'loadXMLFile', `{
  Client.loadFile(filename, function(file) {
    try {
      console.log('Loading file "' + filename + '"...');
      let xml = file instanceof ArrayBuffer ? new Uint8Array(file) : file;
      xml = CodepageManager.decode(xml, userCharpage);
      xml = xml.replace(/^.*<\\?xml/, "<?xml");
      const parsedXML = new DOMParser().parseFromString(xml, "application/xml");
      callback.call(null, xmlparse_default.xml2json(parsedXML));
    } catch (error) {
      console.error("[loadXMLFile] Failed to load " + filename, error);
    } finally {
      onEnd();
    }
  }, onEnd);
}`);
  output = replaceOnce(output, 'const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];', [
    'let gamepads = [];',
    '// Gamepad input is optional; denied IWA permissions must not interrupt login.',
    'const gamepadPolicy = document.permissionsPolicy ?? document.featurePolicy;',
    'try {',
    '  if (typeof navigator.getGamepads === "function" && gamepadPolicy?.allowsFeature?.("gamepad") !== false) {',
    '    gamepads = navigator.getGamepads();',
    '  }',
    '} catch (error) {',
    '  if (error?.name !== "SecurityError") throw error;',
    '}',
  ].join('\n\t\t\t'));

  output = replaceOnce(output, 'if (!Configs.get("remoteClient") && !count && !window.electronAPI?.isElectron) {', 'if (!Configs.get("remoteClient") && !count) {');
  output = replaceOnce(output, 'el.innerHTML = PRELOADER_INNER_HTML;', [
    'const spinner = document.createElement("div");',
    'spinner.className = "pre-spinner";',
    'const text = document.createElement("p");',
    'text.className = "pre-text";',
    'for (const [index, character] of Array.from("Loading...").entries()) {',
    'const span = document.createElement("span");',
    'span.style.setProperty("--i", String(index));',
    'span.textContent = character;',
    'text.appendChild(span);',
    '}',
    'el.append(spinner, text);',
  ].join('\n\t\t\t\t'));
  for (const anchor of ['if (remoteClient) Thread.send("SET_HOST", remoteClient);', '\t\t\t\tThread.send("SET_HOST", remoteClient);']) {
    output = replaceOnce(output, anchor, anchor + '\n\t\t\tThread.send("SET_EXECUTABLE_MANIFEST", globalThis.LastROExecutableManifest);');
  }
  output = replaceOnce(output, 'var root = freeGlobal || freeSelf || Function("return this")();', 'var root = freeGlobal || freeSelf || globalThis;');
  output = replaceOnce(output, 'return Function(importsKeys, sourceURL + "return " + source).apply(undefined, importsValues);',
    'throw new Error("Dynamic templates are disabled in the IWA runtime");');
  output = removeRegion(output, ['legacy transport', 'WebSocket']);
  output = removeRegion(output, ['NodeSocket']);
  output = output.replace(/\/\*\*(?:(?!\*\/)[\s\S])*?Default socket factory(?:(?!\*\/)[\s\S])*?\*\/\r?\nfunction defaultSocketFactory/, 'function defaultSocketFactory');
  output = replaceOnce(output, 'new GUIComponent(name, enhanceWinLoginStyles(name, cssText))',
    'new GUIComponent(name, decorateLastROLoginStyles(name, enhanceWinLoginStyles(name, cssText)))');
  output = replaceOnce(output, 'const renderedHtmlText = enhanceWinLoginTemplate(name, htmlText);',
    'const renderedHtmlText = decorateLastROLoginTemplate(name, enhanceWinLoginTemplate(name, htmlText));');
  output = replaceOnce(output,
    '\t\tvoid 0;\n\t\tpopulateLoginServerButtons(root, Configs.get("loginServerProfiles", []), Configs.getServer?.().id || "lastro", (profile) => Component.onServerSelect(profile));',
    '\t\tinstallLastROLogin({ root, component: Component, configs: Configs });');
  output = replaceOnce(output, '\t\tconst pass = _inputPassword.value;\n\t\tapplyDebugLoginFields();',
    '\t\tconst pass = _inputPassword.value;\n\t\tconst beforeConnect = globalThis.LastROLoginBeforeConnect;\n\t\tif (typeof beforeConnect === "function" && beforeConnect(user, pass) === false) return false;\n\t\tapplyDebugLoginFields();');
  output = patchRuntimeTypography(output);
  if (/new WebSocket|wss?:\/\/|socketProxy|electronAPI|NodeSocket/i.test(output)) fail('legacy-transport');
  return patchTrustedTypesDomWrites(output);
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    input: { type: 'string' }, output: { type: 'string' }, manifest: { type: 'string' },
  } });
  if (!values.input || !values.output || !values.manifest || !path.isAbsolute(values.input)
    || !path.isAbsolute(values.output) || !path.isAbsolute(values.manifest)) fail('absolute-path-required');
  const input = await readFile(values.input);
  const output = Buffer.from(patchV2Runtime(input.toString('utf8')));
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, output);
  const manifest = {
    source: path.relative(repo, values.input),
    output: path.relative(repo, values.output),
    preSha256: createHash('sha256').update(input).digest('hex'),
    postSha256: createHash('sha256').update(output).digest('hex'),
    anchors: ['defaultSocketFactory', 'init_WebSocket', 'init_NodeSocket', 'electronAPI', 'legacy transport regions', 'Client.init resource manifest', 'LoginEngine.init resource manifest'],
  };
  await writeFile(values.manifest, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ bytes: output.length, ...manifest }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
