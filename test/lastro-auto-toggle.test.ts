import { describe, expect, it } from "vitest";
// @ts-expect-error The vendored runtime module intentionally has no declaration file.
import { buildAutoToggleRequest } from "../vendor/v2/lastro-v1-migration.mjs";

describe("auto toggle packet selection", () => {
  it("uses the official whisper commands for 3x", () => {
    expect(buildAutoToggleRequest({ nid: 3, option: "autoAttack", enabled: true })).toEqual({
      kind: "whisper", receiver: "NPC:setautoattack", msg: "0"
    });
    expect(buildAutoToggleRequest({ nid: 3, option: "autoLoot", enabled: false })).toEqual({
      kind: "whisper", receiver: "NPC:setautopick", msg: "0"
    });
    expect(buildAutoToggleRequest({ nid: 3, option: "autoFollow", enabled: true })).toEqual({
      kind: "whisper", receiver: "NPC:setfollow", msg: "0"
    });
  });

  it("uses scalar update ids for 2x and App", () => {
    expect(buildAutoToggleRequest({ nid: 5, option: "autoAttack", enabled: true })).toEqual({ kind: "update", id: 34, value: 1 });
    expect(buildAutoToggleRequest({ nid: 6, option: "autoLoot", enabled: false })).toEqual({ kind: "update", id: 35, value: 1 });
    expect(buildAutoToggleRequest({ nid: 6, option: "autoLoot", enabled: true })).toEqual({ kind: "update", id: 35, value: 1 });
    expect(buildAutoToggleRequest({ nid: 6, option: "autoPots", enabled: false })).toEqual({ kind: "update", id: 36, value: 1 });
    expect(buildAutoToggleRequest({ nid: 6, option: "autoFollow", enabled: true })).toEqual({ kind: "update", id: 37, value: 1 });
  });
});

// Exercise the actual runtime handlers so both packet paths stay consistent.
import { readFileSync } from "node:fs";
const runtime = readFileSync(new URL("../vendor/v2/Online.js", import.meta.url), "utf8");
function receiveState(nid: number, method: string, packet: object) {
  const match = runtime.match(new RegExp(`LastROTools\\.${method} = function ${method}\\(pkt\\) \\{([\\s\\S]*?)\\n  \\};`));
  if (!match?.[1]) throw new Error(`Missing runtime handler ${method}`);
  let state: Record<string, unknown> = {};
  const handler = new Function("Configs", "mapLoadInfoPayload", "mapReloadInfoPacket", "SCALAR_FIELD_BY_ID", "pkt", match[1]);
  handler.call({ applyState: (value: Record<string, unknown>) => { state = value; } },
    { get: () => nid }, (value: object) => value, (value: object) => value,
    { 34: "startAutoAtk", 35: "startAutoLoot", 36: "startAutopots", 37: "startAutofollow" }, packet);
  return state;
}

describe("server auto-loot state polarity", () => {
  for (const nid of [3, 5, 6]) {
    for (const value of [0, 1]) {
      it(`maps load and reload consistently for nid=${nid}, value=${value}`, () => {
        const enabled = nid === 3 ? Boolean(value) : value === 0;
        const loaded = receiveState(nid, "setLoadInfo", {
          startAutoLoot: value, startAutoAtk: value, startAutopots: value, startAutofollow: value,
        });
        expect(loaded.autoLoot).toBe(enabled);
        for (const option of ["autoAttack", "autoPots", "autoFollow"]) expect(loaded[option]).toBe(Boolean(value));
        expect(receiveState(nid, "setReloadInfo", { id: 35, value }).autoLoot).toBe(enabled);
        for (const [id, option] of [[34, "autoAttack"], [36, "autoPots"], [37, "autoFollow"]] as const)
          expect(receiveState(nid, "setReloadInfo", { id, value })[option]).toBe(Boolean(value));
      });
    }
  }
});
