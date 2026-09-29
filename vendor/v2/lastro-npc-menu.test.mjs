import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ONLINE_SOURCE = readFileSync(new URL("./Online.js", import.meta.url), "utf8");
const NPC_MENU_SOURCE = ONLINE_SOURCE.slice(
  ONLINE_SOURCE.indexOf("//#region src/UI/Components/NpcMenu/NpcMenu.js"),
  ONLINE_SOURCE.indexOf("//#region src/Engine/MapEngine/Friends.js"),
);

test("ignores clicks on the NPC menu blank area", () => {
  const handler = NPC_MENU_SOURCE.match(
    /content\.addEventListener\("mousedown", \(e\) => \{([\s\S]*?)\n\s*\}\);/
  )?.[1];

  assert.ok(handler, "NPC menu mousedown handler was not found");
  assert.match(handler, /if \(!div\?\.dataset\?\.index \|\| !content\.contains\(div\)\) return;/);
  assert.match(handler, /selectIndex\(div\)/);

  const doubleClickHandler = NPC_MENU_SOURCE.match(
    /content\.addEventListener\("dblclick", \(e\) => \{([\s\S]*?)\n\s*\}\);/
  )?.[1];
  assert.ok(doubleClickHandler, "NPC menu dblclick handler was not found");
  assert.match(doubleClickHandler, /div\?\.dataset\?\.index && content\.contains\(div\)/);
});
