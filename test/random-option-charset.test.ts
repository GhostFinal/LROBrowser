import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const onlineSource = readFileSync("vendor/v2/Online.js", "utf8");
const optionTable = readFileSync(
  "vendor/core/data/luafiles514/lua files/datainfo/addrandomoptionnametable_f.lub",
);
const damageSkinTable = readFileSync(
  "vendor/core/data/luafiles514/lua files/damageskin/damageskininfo.lub",
);
const npcNavigationTable = readFileSync(
  "vendor/core/data/luafiles514/lua files/worldviewdata/navi_npc_tw.lub",
);

describe("random-option charset", () => {
  it("decodes the GBK-converted option table as GBK at runtime", () => {
    const charsetResolver = onlineSource.match(
      /function getLuaTableValueCharset[\s\S]*?\n}/,
    )?.[0];

    expect(charsetResolver).toContain('? "gbk"');
    expect(new TextDecoder("gbk").decode(optionTable)).toContain(
      "HP 恢復速度增加 %d%%",
    );
    expect(new TextDecoder("gbk").decode(damageSkinTable)).toContain(
      "捞蒲飘\\箭磊",
    );
    expect(new TextDecoder("gbk").decode(npcNavigationTable)).toContain("厚萍");
  });
});
