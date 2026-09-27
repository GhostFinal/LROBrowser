import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESOURCE_PATH_SOURCE = readFileSync(join(HERE, "lastro-resource-path.js"), "utf8");
const THREAD_HANDLER_SOURCE = readFileSync(join(HERE, "LastROThreadEventHandler.js"), "utf8");

function buildCandidates(path, primaryCharset = "gbk", fallbackCharset = "euc-kr") {
  const context = { TextDecoder, Uint8Array };
  vm.runInNewContext(RESOURCE_PATH_SOURCE, context, { filename: "lastro-resource-path.js" });
  return Array.from(context.LastROResourcePathEncoding.buildResourcePathCandidates(
    path,
    primaryCharset,
    fallbackCharset
  ));
}

function encodePath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function createResponse(status, contentType = "application/octet-stream") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(2))
  };
}

function createHttpLoader(responses, transport = "fetch") {
  const urls = [];
  const context = {
    ArrayBuffer,
    Promise,
    TextDecoder,
    Uint8Array,
    importScripts: () => {},
    ne: { saveFile: () => {} },
    se: {
      remoteClient: "/ro/client_re/",
      resourcePathCharset: "gbk"
    },
    self: {}
  };
  if (transport === "fetch") {
    context.fetch = (url) => {
      urls.push(url);
      const next = responses.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (!next) return Promise.reject(new Error("Unexpected fetch"));
      return Promise.resolve(next);
    };
  } else {
    context.XMLHttpRequest = class {
      open(_method, url) {
        this.url = url;
      }

      send() {
        urls.push(this.url);
        const next = responses.shift();
        if (next === "error") return this.onerror && this.onerror();
        if (next === "timeout") return this.ontimeout && this.ontimeout();
        if (next === "abort") return this.onabort && this.onabort();
        if (!next) throw new Error("Unexpected XHR");
        this.status = next.status;
        this.response = new ArrayBuffer(2);
        return this.onload && this.onload();
      }
    };
  }

  vm.runInNewContext(RESOURCE_PATH_SOURCE, context, { filename: "lastro-resource-path.js" });
  vm.runInNewContext(THREAD_HANDLER_SOURCE, context, { filename: "LastROThreadEventHandler.js" });

  return {
    load(filename) {
      return new Promise((resolve) => {
        context.se.getHTTP(filename, (data, error) => resolve({ data, error }));
      });
    },
    urls
  };
}

test("resource path candidates preserve the filename while lowercasing its extension", () => {
  const candidates = buildCandidates("Texture/Example.BMP");

  assert.deepEqual(candidates, ["Texture/Example.BMP", "Texture/Example.bmp"]);
});

test("skill icon candidates include lowercase basenames after charset recovery", () => {
  const prefix = `data/texture/${String.fromCharCode(0xc0, 0xaf, 0xc0, 0xfa, 0xc0, 0xce, 0xc5, 0xcd, 0xc6, 0xe4, 0xc0, 0xcc, 0xbd, 0xba)}/item/`;
  const candidates = buildCandidates(prefix + 'AL_HEAL.bmp');
  assert.ok(candidates.includes(encodePath('data/texture/유저인터페이스/item/al_heal.bmp')));
  assert.equal(candidates[0], encodePath(prefix + 'AL_HEAL.bmp'));
});

test("a cold skill icon request reaches the case-sensitive server filename", async () => {
  const loader = createHttpLoader([createResponse(404), createResponse(200)]);
  const result = await loader.load('data/texture/유저인터페이스/item/NV_BASIC.bmp');
  assert.equal(result.error, undefined);
  assert.equal(result.data.byteLength, 2);
  assert.deepEqual(loader.urls, [
    '/ro/client_re/' + encodePath('data/texture/유저인터페이스/item/NV_BASIC.bmp'),
    '/ro/client_re/' + encodePath('data/texture/유저인터페이스/item/nv_basic.bmp')
  ]);
});

test("resource path candidates preserve normal Chinese paths before fallbacks", () => {
  const path = "data/texture/中文/正常.BMP";
  const candidates = buildCandidates(path);

  assert.equal(candidates[0], encodePath(path));
  assert.ok(candidates.includes(encodePath("data/texture/中文/正常.bmp")));
  assert.ok(candidates.length <= 8);
});

test("resource path candidates preserve normal Korean paths before fallbacks", () => {
  const path = "data/sprite/인간족/타조스나이퍼/normal.ACT";
  const candidates = buildCandidates(path);

  assert.equal(candidates[0], encodePath(path));
  assert.ok(candidates.includes(encodePath("data/sprite/인간족/타조스나이퍼/normal.act")));
  assert.ok(candidates.length <= 8);
});

test("resource path candidates try GBK before EUC-KR for single-byte mojibake", () => {
  const path = `data/sprite/${String.fromCharCode(0xb0, 0xa1)}/normal.act`;
  const candidates = buildCandidates(path);

  assert.deepEqual(candidates, [
    encodePath(path),
    encodePath("data/sprite/啊/normal.act"),
    encodePath("data/sprite/가/normal.act")
  ]);
});

test("resource path candidates recover CJK mojibake through GBK then EUC-KR", () => {
  const path = "data/sprite/牢埃练/鸥炼胶唱捞欺/鸥炼胶唱捞欺_巢_劝.act";
  const candidates = buildCandidates(path);

  assert.deepEqual(candidates, [
    encodePath(path),
    encodePath("data/sprite/인간족/타조스나이퍼/타조스나이퍼_남_활.act")
  ]);
});

test("resource path candidates stay deduplicated and bounded across fallbacks", () => {
  const path = `data/sprite/牢埃练/${String.fromCharCode(0xb0, 0xa1)}_검광.SPR`;
  const candidates = buildCandidates(path);

  assert.equal(candidates[0], encodePath(path));
  assert.equal(candidates.length, 12);
  assert.equal(new Set(candidates).size, candidates.length);
});

test("legacy sprite fallback does not rewrite charset-derived paths", () => {
  const path = `data/sprite/牢埃练/${String.fromCharCode(0xb0, 0xa1)}_검광.ACT`;
  const candidates = buildCandidates(path);
  const legacyOnlyCandidates = buildCandidates("data/sprite/normal_검광.ACT");

  assert.ok(legacyOnlyCandidates.includes(encodePath("data/sprite/normal.ACT")));
  assert.ok(!candidates.includes(encodePath("data/sprite/牢埃练/啊.ACT")));
  assert.ok(!candidates.includes(encodePath("data/sprite/牢埃练/가.ACT")));
});

test("resource path candidates combine CJK recovery with EUC-KR byte recovery", () => {
  const path = `data/sprite/牢埃练/${String.fromCharCode(0xb0, 0xa1)}_검광.SPR`;
  const candidates = buildCandidates(path);
  const configuredCandidate = encodePath("data/sprite/인간족/啊_검광.SPR");
  const fallbackCandidate = encodePath("data/sprite/인간족/가_검광.SPR");

  assert.ok(candidates.includes(configuredCandidate));
  assert.ok(candidates.includes(fallbackCandidate));
  assert.ok(candidates.indexOf(configuredCandidate) < candidates.indexOf(fallbackCandidate));
  assert.ok(candidates.includes(encodePath("data/sprite/인간족/가_검광.spr")));
});

test("resource requests try the next path only after a 404", async () => {
  const loader = createHttpLoader([createResponse(404), createResponse(200)]);
  const sourcePath = "data/sprite/牢埃练/鸥炼胶唱捞欺/鸥炼胶唱捞欺_巢_劝.act";
  const result = await loader.load(sourcePath);

  assert.equal(result.error, undefined);
  assert.equal(result.data.byteLength, 2);
  assert.deepEqual(loader.urls, [
    `/ro/client_re/${encodePath(sourcePath)}`,
    "/ro/client_re/data/sprite/%EC%9D%B8%EA%B0%84%EC%A1%B1/%ED%83%80%EC%A1%B0%EC%8A%A4%EB%82%98%EC%9D%B4%ED%8D%BC/%ED%83%80%EC%A1%B0%EC%8A%A4%EB%82%98%EC%9D%B4%ED%8D%BC_%EB%82%A8_%ED%99%9C.act"
  ]);
});

test("resource requests reach the combined CJK and EUC-KR candidate after 404s", async () => {
  const sourcePath = `data/sprite/牢埃练/${String.fromCharCode(0xb0, 0xa1)}_검광.SPR`;
  const loader = createHttpLoader([
    createResponse(404),
    createResponse(404),
    createResponse(404),
    createResponse(404),
    createResponse(404),
    createResponse(200)
  ]);
  const result = await loader.load(sourcePath);

  assert.equal(result.error, undefined);
  assert.equal(result.data.byteLength, 2);
  assert.equal(loader.urls.length, 6);
  assert.equal(loader.urls[0], `/ro/client_re/${encodePath(sourcePath)}`);
  assert.equal(
    loader.urls[5],
    "/ro/client_re/data/sprite/%EC%9D%B8%EA%B0%84%EC%A1%B1/%EA%B0%80_%EA%B2%80%EA%B4%91.SPR"
  );
});

test("resource requests reach the combined lowercase-extension candidate after 404s", async () => {
  const sourcePath = `data/sprite/牢埃练/${String.fromCharCode(0xb0, 0xa1)}_검광.SPR`;
  const loader = createHttpLoader([
    ...Array.from({ length: 11 }, () => createResponse(404)),
    createResponse(200)
  ]);
  const result = await loader.load(sourcePath);

  assert.equal(result.error, undefined);
  assert.equal(result.data.byteLength, 2);
  assert.equal(loader.urls.length, 12);
  assert.equal(
    loader.urls[11],
    "/ro/client_re/data/sprite/%EC%9D%B8%EA%B0%84%EC%A1%B1/%EA%B0%80_%EA%B2%80%EA%B4%91.spr"
  );
});

for (const response of [createResponse(500), createResponse(502), new Error("network timeout")]) {
  const label = response instanceof Error ? "network errors" : `HTTP ${response.status}`;
  test(`resource requests do not treat ${label} as an encoding fallback`, async () => {
    const loader = createHttpLoader([response]);
    const result = await loader.load("Texture/Example.BMP");

    assert.equal(result.data, null);
    assert.equal(result.error, "Can't get file");
    assert.deepEqual(loader.urls, ["/ro/client_re/Texture/Example.BMP"]);
  });
}

test("resource requests do not treat an HTML response as an encoding fallback", async () => {
  const loader = createHttpLoader([createResponse(200, "text/html")]);
  const result = await loader.load("Texture/Example.BMP");

  assert.equal(result.data, null);
  assert.equal(result.error, "Can't get file");
  assert.deepEqual(loader.urls, ["/ro/client_re/Texture/Example.BMP"]);
});

test("XHR resource requests try the next path after a 404", async () => {
  const loader = createHttpLoader([createResponse(404), createResponse(200)], "xhr");
  const result = await loader.load("Texture/Example.BMP");

  assert.equal(result.error, undefined);
  assert.equal(result.data.byteLength, 2);
  assert.deepEqual(loader.urls, [
    "/ro/client_re/Texture/Example.BMP",
    "/ro/client_re/Texture/Example.bmp"
  ]);
});

for (const [label, response] of [
  ["HTTP 500", createResponse(500)],
  ["network errors", "error"],
  ["timeouts", "timeout"]
]) {
  test(`XHR resource requests do not treat ${label} as an encoding fallback`, async () => {
    const loader = createHttpLoader([response], "xhr");
    const result = await loader.load("Texture/Example.BMP");

    assert.equal(result.data, null);
    assert.equal(result.error, "Can't get file");
    assert.deepEqual(loader.urls, ["/ro/client_re/Texture/Example.BMP"]);
  });
}

test("XHR resource requests complete when aborted", async () => {
  const loader = createHttpLoader(["abort"], "xhr");
  const pending = Symbol("pending");
  const result = await Promise.race([
    loader.load("Texture/Example.BMP"),
    new Promise((resolve) => setTimeout(() => resolve(pending), 20))
  ]);

  assert.notEqual(result, pending);
  assert.equal(result.data, null);
  assert.equal(result.error, "Can't get file");
  assert.deepEqual(loader.urls, ["/ro/client_re/Texture/Example.BMP"]);
});
