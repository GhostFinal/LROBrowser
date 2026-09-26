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
${normalizedSource}`;
  output = output.replace(/\?build=[A-Za-z0-9._-]+/g, '');
  output = replaceOnce(output, '\troInitSpinner.add();\n\tPlugins.init();\n\tGameEngine.init();',
    '\troInitSpinner.add();\n\ttry {\n\t\tPlugins.init();\n\t\tGameEngine.init();\n\t} catch (error) {\n\t\troInitSpinner.remove();\n\t\tthrow error;\n\t}');
  output = replaceOnce(output, 'if (_source instanceof Worker) _source.addEventListener("message", Thread.receive, false);',
    'if (_source instanceof Worker) {\n\t\t\t\tconsole.info("[LastRO IWA] waiting for resource worker");\n\t\t\t\t_source.addEventListener("error", (event) => console.error("[LastRO IWA] resource worker failed", event.message));\n\t\t\t\t_source.addEventListener("message", Thread.receive, false);\n\t\t\t}');
  output = replaceOnce(output, '_thread_ready = true;', '_thread_ready = true;\n\t\t\t\t\t\tconsole.info("[LastRO IWA] resource worker ready; initializing renderer");');
  output = replaceOnce(output, 'savingFiles(files);', 'console.info("[LastRO IWA] initializing remote client resources");\n\t\t\tThread.send("CLIENT_INIT", { files: [], save: false }, (...args) => Client.onFilesLoaded(...args));');
  output = replaceFunctionBody(output, 'defaultSocketFactory', '{\n\tif (typeof globalThis.LastRODirectSocketFactory !== "function") throw new Error("Direct TCP factory unavailable");\n\treturn globalThis.LastRODirectSocketFactory(host, port);\n}');
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
