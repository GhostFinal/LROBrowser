import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bundle = readFileSync(new URL("./Online.js", import.meta.url), "utf8");
const templateStart = bundle.indexOf("LastROTools_default$1 = `") + "LastROTools_default$1 = `".length;
const templateEnd = bundle.indexOf("`;\n\tLastROTools_default$1 = LastROTools_default$1.replace", templateStart);
const template = bundle.slice(templateStart, templateEnd);

test("V2 battle settings keep V1 labels and expose heal-priority toggle", () => {
  const expectedLabels = [
    "被非目标魔物攻击时：",
    "与目标的攻击距离：d >=",
    "与目标的施法距离：d >=",
    "被群殴时数量最少值：",
    "被群殴时数量最大值：",
    "主动技能：",
    "辅助技能：",
    "触发技能：",
    "解围技能：",
    "加血范围：",
    "加气范围：",
    "附近出现BOSS时自动瞬移：",
    "药品设置：",
    "优先使用治愈术：",
    "优先使用HP转换：",
    "自动使用加速药水：",
    "自动使用属性卷轴：",
    "属性卷轴类型：",
    "自动使用保护卷轴：",
    "保护卷轴类型：",
    "自动使用万能药：",
    "自动使用复活之证：",
    "自动使用经验书：",
    "自动使用掉宝：",
    "自动使用料理：",
    "自动使用撒水卷轴："
  ];

  for (const label of expectedLabels) assert.match(template, new RegExp(label));
  assert.match(template, /<input type="checkbox" data-field="usealheal">开启/);
  assert.match(template, /属性卷轴类型： <select data-field="AutoUseItem_Elementalid">/);
  assert.match(template, /保护卷轴类型： <select data-field="AutoUseItem_Protectionid">/);
  assert.match(template, /data-field="AutoUseItem_Elementalid"><option value="0">请选择<\/option>/);
  assert.match(template, /data-field="AutoUseItem_Protectionid"><option value="0">请选择<\/option>/);

  assert.doesNotMatch(template, /自动吃加速药水/);
  assert.doesNotMatch(template, /HP 阈值（百分比）/);
  assert.doesNotMatch(template, /SP 阈值（百分比）/);
});
