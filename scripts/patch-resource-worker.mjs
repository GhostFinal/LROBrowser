import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const [workerPath = '.staging/v2/ThreadEventHandler.js', handlerPath = '.staging/v2/LastROThreadEventHandler.js', runtimePath = '.staging/runtime/Online.js'] = process.argv.slice(2);
const roots = 'https://game.lastro.cn/ro/client_re/,https://clientdata.ltsd.ro/ro/client_re/';

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}:${count}`);
  return source.replace(needle, replacement);
}

let worker = await readFile(workerPath, 'utf8');
worker = replaceOnce(
  worker,
  'case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;',
  `case"SET_HOST":"/"!==e.data.substr(-1)&&(e.data+="/"),se.remoteClient=e.data;break;case"SET_RESOURCE_ROOTS":se.lastroResourceRoots=Array.isArray(e.data)?e.data.filter((t)=>typeof t==="string"):[];break;case"SET_EXECUTABLE_MANIFEST":se.lastroExecutableManifest=e.data&&Array.isArray(e.data.files)?e.data.files:[];break;`,
  'worker-init-anchors',
);
await writeFile(workerPath, worker);

let handler = await readFile(handlerPath, 'utf8');
const handlerStart = handler.indexOf('  se.getHTTP = function getLastROHTTP(filename, callback) {');
const handlerEnd = handler.indexOf('\n  };\n})();', handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error('handler-anchor');
const replacement = `  se.getHTTP = function getLastROHTTP(filename, callback) {
    const sourcePath = filename.replace(/\\\\/g, "/").replace(/^\\/+/, "");
    const classification = /\\.(?:js|mjs|cjs|wasm|lua|lub)$/i.test(sourcePath) ? "packaged-executable" : "remote-passive";
    const manifest = new Set((se.lastroExecutableManifest || []).map((entry) => typeof entry === "string" ? entry : entry.path).filter(Boolean));
    const encodedPaths = self.LastROResourcePathEncoding
      ? self.LastROResourcePathEncoding.buildResourcePathCandidates(sourcePath, se.resourcePathCharset, "euc-kr")
      : [sourcePath.replace(/[^/]+/g, (segment) => encodeURIComponent(segment))];
    const configuredRoots = Array.isArray(se.lastroResourceRoots) && se.lastroResourceRoots.length
      ? se.lastroResourceRoots.filter((root) => root === "${roots.split(',')[0]}" || root === "${roots.split(',')[1]}")
      : ["${roots.split(',')[0]}", "${roots.split(',')[1]}"];
    const roots = orderResourceRoots(sourcePath, configuredRoots);
    const finish = (data, error) => {
      if (data) ne.saveFile(sourcePath, data);
      callback(data, error);
    };
    if (classification === "packaged-executable") {
      if (!manifest.has(sourcePath)) {
        finish(null, "Package-only resource is missing from the executable manifest");
        return;
      }
      const packageUrl = new URL("../core/" + sourcePath, self.location.href).toString();
      fetch(packageUrl).then((response) => {
        if (!response.ok) throw new Error("package-http-" + response.status);
        return response.arrayBuffer();
      }).then((data) => finish(data)).catch(() => finish(null, "Can't get package file"));
      return;
    }
    if (!/\\.(?:gat|gnd|rsw|rsm|str|spr|act|gr2|bmp|tga|png|jpg|jpeg|gif|webp|dds|mp3|wav|ogg|opus|flac)$/i.test(sourcePath)) {
      finish(null, "Forbidden remote resource");
      return;
    }
    let rootIndex = 0;
    let candidateIndex = 0;
    const fail = () => finish(null, "Can't get file");
    const load = () => {
      if (rootIndex >= roots.length) { fail(); return; }
      if (candidateIndex >= encodedPaths.length) { rootIndex++; candidateIndex = 0; load(); return; }
      const url = roots[rootIndex] + encodedPaths[candidateIndex];
      const retry = (status) => {
        if (status === 404) candidateIndex++;
        else { rootIndex++; candidateIndex = 0; }
        load();
      };
      if (typeof fetch !== "undefined") {
        fetch(url).then((response) => {
          if (!response.ok) { retry(response.status); return null; }
          if ((response.headers.get("content-type") || "").toLowerCase().includes("text/html")) { retry(200); return null; }
          return response.arrayBuffer();
        }).then((data) => { if (data && data.byteLength) finish(data); }).catch(() => retry(0));
        return;
      }
      const request = new XMLHttpRequest();
      request.open("GET", url, true);
      request.responseType = "arraybuffer";
      request.onload = () => request.status === 200 && request.response?.byteLength ? finish(request.response) : retry(request.status);
      request.onerror = () => retry(0);
      request.ontimeout = () => retry(0);
      request.onabort = () => retry(0);
      try { request.send(null); } catch (_error) { retry(0); }
    };
    load();
  };`;
handler = handler.slice(0, handlerStart) + replacement + handler.slice(handlerEnd + '\n  };'.length);
await writeFile(handlerPath, handler);

let runtime = await readFile(runtimePath, 'utf8');
const runtimeAnchor = 'Thread.send("SET_HOST", remoteClient);';
const runtimeCount = runtime.split(runtimeAnchor).length - 1;
if (runtimeCount !== 2) throw new Error(`runtime-init-anchors:${runtimeCount}`);
runtime = runtime.replaceAll(runtimeAnchor, `${runtimeAnchor}\n\t\t\t\tif (globalThis.LastROResourceRoots) Thread.send("SET_RESOURCE_ROOTS", globalThis.LastROResourceRoots);\n\t\t\t\tif (globalThis.LastROExecutableManifest) Thread.send("SET_EXECUTABLE_MANIFEST", globalThis.LastROExecutableManifest);`);
await writeFile(runtimePath, runtime);
process.stdout.write(JSON.stringify({ workerPath, handlerPath, runtimePath }) + '\n');
