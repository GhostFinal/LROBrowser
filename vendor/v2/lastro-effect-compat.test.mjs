import assert from "node:assert/strict";
import test from "node:test";
import { applyLegacyDoramEffects, resolveStrTexturePath } from "./lastro-effect-compat.mjs";

test("rebases legacy STR texture basenames to the STR directory", () => {
  assert.equal(
    resolveStrTexturePath(
      "data\\texture\\effect\\su_cn_meteor\\su_cn_meteor0.str",
      "data\\texture\\effect\\kkee.bmp"
    ),
    "data/texture/effect/su_cn_meteor/kkee.bmp"
  );
  assert.equal(
    resolveStrTexturePath("data/texture/effect/basic.str", "data\\texture\\effect\\foo.bmp"),
    "data\\texture\\effect\\foo.bmp"
  );
  assert.equal(
    resolveStrTexturePath("data/texture/effect/su_cn_meteor/effect.str", "data/texture/effect/kkee.bmp", "su_cn_meteor/"),
    "data/texture/effect/kkee.bmp"
  );
});

test("fills missing Doram skill and ground-unit mappings without replacing existing ones", () => {
  const effectTable = {};
  const skillEffect = { 5028: {}, 5040: { effectId: "server_effect" } };
  const skillUnit = { 262: -1, 263: "server_ground_effect" };
  const result = applyLegacyDoramEffects({
    effectTable,
    skillEffect,
    skillUnit,
    skillConst: { SU_CN_METEOR: 5028, SU_BUNCHOFSHRIMP: 5040 },
    skillUnitConst: { UNT_CATNIPPOWDER: 262, UNT_NYANGGRASS: 263 }
  });

  assert.equal(result.skillCount, 1);
  assert.equal(result.unitCount, 1);
  assert.equal(skillEffect[5028].effectId, "legacy_su_cn_meteor");
  assert.equal(skillEffect[5040].effectId, "server_effect");
  assert.equal(skillUnit[262], "legacy_unt_catnippowder");
  assert.equal(skillUnit[263], "server_ground_effect");
  assert.equal(effectTable.legacy_su_cn_meteor[0].file, "su_cn_meteor/su_cn_meteor0");
  assert.equal(effectTable.legacy_unt_catnippowder[0].file, "effect/catnippowder.tga");
});

test("uses root TGA assets for skills without a matching STR animation", () => {
  const effectTable = {};
  const skillEffect = {};
  const result = applyLegacyDoramEffects({
    effectTable,
    skillEffect,
    skillConst: { SU_STOOP: 5022, SU_TUNAPARTY: 5039 }
  });

  assert.equal(result.skillCount, 2);
  assert.equal(skillEffect[5022].effectId, "legacy_su_stoop");
  assert.equal(skillEffect[5039].effectId, "legacy_su_tunaparty");
  assert.equal(effectTable.legacy_su_stoop[0].file, "effect/su_stoop.tga");
  assert.equal(effectTable.legacy_su_tunaparty[0].file, "effect/tunaparty.tga");
});

test("covers V1 skill-effect aliases used by Doram support skills", () => {
  const effectTable = {};
  const skillEffect = {};
  applyLegacyDoramEffects({
    effectTable,
    skillEffect,
    skillConst: { SU_SHRIMPARTY: 5051, SU_PURRING: 5050, SU_MEOWMEOW: 5053 }
  });

  assert.equal(effectTable.legacy_su_shrimparty[0].file, "su_freshshrimp/su_freshshrimp");
  assert.equal(effectTable.legacy_su_purring[0].file, "su_grooming/su_grooming");
  assert.equal(effectTable.legacy_su_meowmeow[0].file, "su_chattering/su_chattering");
  assert.equal(skillEffect[5051].effectId, "legacy_su_shrimparty");
  assert.equal(skillEffect[5050].effectId, "legacy_su_purring");
  assert.equal(skillEffect[5053].effectId, "legacy_su_meowmeow");
});
