import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configSource = readFileSync(new URL("../../src/runtime/client-config.ts", import.meta.url), "utf8");
const onlineSource = readFileSync(new URL("./Online.js", import.meta.url), "utf8");

test("v2 decodes state icon descriptions with their Big5 source charset", () => {
  assert.match(configSource, /statusDescriptionCharset: ['"]big5['"]/);
  assert.match(
    onlineSource,
    /const text = userStringDecoder\.decode\(desc, Configs\.get\("statusDescriptionCharset", userCharpage\)\);/
  );
});

test("state description charset does not replace the general LastRO data charset", () => {
  assert.match(onlineSource, /userCharpage = Configs\.get\("lastroDataCharset", userCharpage\);/);
  assert.match(configSource, /lastroDataCharset: ['"]gbk['"]/);
});
