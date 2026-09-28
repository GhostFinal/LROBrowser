import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configSource = readFileSync(new URL("../../src/runtime/client-config.ts", import.meta.url), "utf8");
const onlineSource = readFileSync(new URL("./Online.js", import.meta.url), "utf8");

test("v2 decodes state icon descriptions with their GBK source charset", () => {
  assert.match(configSource, /statusDescriptionCharset: ['"]gbk['"]/);
  assert.match(
    onlineSource,
    /const text = userStringDecoder\.decode\(\s*desc,\s*Configs\.get\("statusDescriptionCharset", userCharpage\),?\s*\);/
  );
});

test("state description charset does not replace the general LastRO data charset", () => {
  assert.match(onlineSource, /userCharpage = Configs\.get\("lastroDataCharset", userCharpage\);/);
  assert.match(configSource, /lastroDataCharset: ['"]gbk['"]/);
});
