import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const onlineSource = fs.readFileSync(new URL("./Online.js", import.meta.url), "utf8");

test("binds equipment item interactions to the costume page as well as the general page", () => {
  assert.match(
    onlineSource,
    /const contents = root\.querySelectorAll\("\.content"\);\s*contents\.forEach\(\(content\) =>/
  );
});
