import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const onlineSource = fs.readFileSync(new URL("./Online.js", import.meta.url), "utf8");

function extractTopLevelFunction(name) {
  const match = onlineSource.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `expected ${name} to exist in Online.js`);
  return match[0];
}

const paletteHelpers = new Function(
  "PalNameTable",
  "SexTable",
  "JobConst_default",
  `${extractTopLevelFunction("usesCostumePalettePath")}\n${extractTopLevelFunction("buildBodyPalettePath")}\n${extractTopLevelFunction("shouldSkipBodyPalette")}\nreturn { buildBodyPalettePath, shouldSkipBodyPalette };`
)({
  100: "regular_job",
  4060: "high_job",
  4065: "high_job_2",
  4079: "shadow_job",
  4080: "baby_job",
  4129: "rebellion_job",
  4132: "fox_sorcerer",
  4133: "fox_warlock",
  4140: "dog_g_cross",
  4148: "ostrich_minstrel",
  4197: "pig_mechanic",
  4198: "ostrich_ranger",
  4199: "lion_knight",
  4201: "lion_royal_guard",
  4202: "lion_rune_knight",
  4332: "rune_knight"
}, { 0: "male" }, {
  RUNE_KNIGHT_H: 4060,
  WARLOCK_H: 4061,
  RANGER_H: 4062,
  ARCHBISHOP_H: 4063,
  MECHANIC_H: 4064,
  GUILLOTINE_CROSS_H: 4065,
  ROYAL_GUARD_H: 4066,
  SORCERER_H: 4067,
  MINSTREL_H: 4068,
  WANDERER_H: 4069,
  SURA_H: 4070,
  GENETIC_H: 4071,
  SHADOW_CHASER_H: 4079,
  RUNE_KNIGHT_2ND: 4332,
  MECHANIC_2ND: 4333,
  GUILLOTINE_CROSS_2ND: 4334,
  WARLOCK_2ND: 4335,
  ARCH_BISHOP_2ND: 4336,
  RANGER_2ND: 4337,
  ROYAL_GUARD_2ND: 4338,
  GENETIC_2ND: 4339,
  SHADOW_CHASER_2ND: 4340,
  SORCERER_2ND: 4341,
  SURA_2ND: 4342,
  MINSTREL_2ND: 4343,
  WANDERER_2ND: 4344,
  RUNE_KNIGHT2_2ND: 4345,
  RANGER2_2ND: 4346,
  MECHANIC2_2ND: 4347,
  ROYAL_GUARD2_2ND: 4348,
  FROG_KAGEROU: 4112,
  FROG_OBORO: 4113,
  REBELLION: 4129,
  FOX_SORCERER: 4132,
  FOX_WARLOCK: 4133,
  DOG_G_CROSS: 4140,
  OSTRICH_MINSTREL: 4148,
  PIG_MECHANIC: 4197,
  OSTRICH_RANGER: 4198,
  LION_KNIGHT: 4199,
  LION_ROYAL_GUARD: 4201,
  LION_RUNE_KNIGHT: 4202,
  COSTUME_SECOND_JOB_START: 4331,
  COSTUME_SECOND_JOB_END: 4350
});

test("v1 costume body palette jobs use the costume folder and suffix", () => {
  const costumeJobs = [
    4060, 4065, 4079,
    4129, 4132, 4133, 4140, 4148, 4197, 4198, 4199, 4201, 4202
  ];

  for (const job of costumeJobs) {
    assert.match(
      paletteHelpers.buildBodyPalettePath(job, 2, 0),
      /^data\/palette\/赂枚\/costume_1\/[^/]+_male_2_1\.pal$/u
    );
  }
});

test("body palette paths avoid duplicating the costume folder", () => {
  assert.equal(
    paletteHelpers.buildBodyPalettePath(4332, 1, 0, true),
    "data/palette/赂枚/costume_1/rune_knight_male_1_1.pal"
  );
  assert.equal(
    paletteHelpers.buildBodyPalettePath(100, 2, 0),
    "data/palette/赂枚/regular_job_male_2.pal"
  );
});

test("v1 high job variants skip body palettes", () => {
  assert.equal(paletteHelpers.shouldSkipBodyPalette(4060), true);
  assert.equal(paletteHelpers.shouldSkipBodyPalette(4079), true);
  assert.equal(paletteHelpers.shouldSkipBodyPalette(4059), false);
  assert.equal(paletteHelpers.shouldSkipBodyPalette(4080), false);
});

test("body palettes use the costume palette suffix for costume body sprites", () => {
  assert.match(
    onlineSource,
    /static getBodyPalPath\(id, pal, sex, isCostume = false\)[\s\S]*?PalNameTable\[id\][\s\S]*?\(isCostume \? "_1" : ""\)/
  );
  assert.match(
    onlineSource,
    /this\.costume \|\| this\._job[\s\S]*?buildBodyPalettePath\([\s\S]*?usesCostumePalettePath\(paletteJob\)/
  );
});
