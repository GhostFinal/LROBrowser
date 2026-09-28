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
    expect(buildAutoToggleRequest({ nid: 6, option: "autoLoot", enabled: false })).toEqual({ kind: "update", id: 35, value: 0 });
    expect(buildAutoToggleRequest({ nid: 6, option: "autoFollow", enabled: true })).toEqual({ kind: "update", id: 37, value: 1 });
  });
});
