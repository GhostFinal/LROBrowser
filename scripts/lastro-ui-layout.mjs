import ts from 'typescript';

// Scoped fixes for native UI layout and hit testing.
export const UI_LAYOUT_CSS = {
  'CashShop/CashShop': `
#CashShop { position: relative; }
#CashShop .panel-cart-charge-btn { display: none; }
#CashShop .panel-cart-charging-view { min-height: 20px; }
#CashShop::after {
  content: ''; position: absolute; left: 653px; top: 45px; width: 66px; height: 22px;
  background-image: inherit; background-size: 723px 540px; background-position: -550px -45px; background-repeat: no-repeat;
  pointer-events: none;
}
`,
  'EntityRoom/EntityRoom': `
.EntityRoom .overlay { pointer-events: none; }
`,
  'EntitySignboard/EntitySignboard': `
.EntitySignboard .overlay { pointer-events: none; }
`,
  'ChatRoomCreate/ChatRoomCreate': `
#ChatRoomCreate input, #ChatRoomCreate select { font: inherit; }
#ChatRoomCreate .container { display: table; width: 100%; box-sizing: border-box; table-layout: fixed; padding-right: 7px; }
#ChatRoomCreate .container td { padding: 0; }
#ChatRoomCreate .container tr > .head:first-child { width: 60px; }
#ChatRoomCreate .container tr:nth-child(2) > td:nth-child(2) { width: 58px; }
#ChatRoomCreate .container tr:nth-child(2) > td:nth-child(3) { width: 36px; }
#ChatRoomCreate .container .title { width: 100%; height: 20px; box-sizing: border-box; }
#ChatRoomCreate .container .type { width: 100%; }
#ChatRoomCreate .container .password { height: 20px; box-sizing: border-box; }
`,
  'CartItems/CartItems': `
#cartitems .footer .cnt, #cartitems .footer .wt { position: static; display: inline-block; margin-top: 7px; white-space: nowrap; }
#cartitems .footer .cnt { margin-left: 10px; }
#cartitems .footer .wt { margin-left: 12px; }
`,
  'Storage/StorageV3/Storage': `
#Storage .footer .search-input, #Storage .footer .storage-order-by { font: inherit; }
#Storage .footer .search-input { box-sizing: border-box; width: 136px; height: 20px; padding: 2px 24px 2px 2px; }
`,
  'SkillList/SkillListV2/SkillListV2': `
#SkillListV2 .content div.name { overflow: hidden; text-overflow: ellipsis; }
#SkillListV2 .tab-label, #SkillListV2 .tab-label-mini {
  display: flex; align-items: center; justify-content: center;
  box-sizing: content-box; height: 34px; padding: 4px 0; margin: 0 0 6px;
  letter-spacing: 2px; white-space: nowrap;
}
#SkillListV2 .tab:last-child > .tab-label, #SkillListV2 .tab-mini:last-child > .tab-label-mini { margin-bottom: 0; }
#SkillListV2 .content, #SkillListV2 .tab-content-mini { min-height: 244px; }
#SkillListV2 .contentbig .skillCol .name, #SkillListV2 .contentbig .skillCol .selectable {
  left: 50%; transform: translateX(-50%);
}
#SkillListV2 .contentbig .skillCol .name { height: 18px; line-height: 18px; }
#SkillListV2 .contentbig .skillCol .icon { height: 24px; line-height: 0; }
#SkillListV2 .contentbig .skillCol .icon img { display: block; margin: 0 auto; }
#SkillListV2 .contentbig .skillCol .selectable { position: absolute; top: 44px; height: 16px; line-height: 16px; }
#SkillListV2 .contentbig .skillCol .skill:not(.disabled) .level {
  display: inline-flex; align-items: center; justify-content: center; height: 16px; line-height: 16px; vertical-align: top;
}
#SkillListV2 .contentbig .skillCol .currentDown, #SkillListV2 .contentbig .skillCol .currentUp { margin: 0; padding: 0; }
`,
};

export function patchRuntimeUiLayout(source) {
  return source.replace(/\/\/#region src\/UI\/Components\/([^\n]+)\.css\?raw\r?\n[\s\S]*?\/\/#endregion/g, (region, component) => {
    const extra = UI_LAYOUT_CSS[component];
    if (!extra || region.includes('LASTRO scoped UI layout: ' + component)) return region;
    const file = ts.createSourceFile('ui-layout.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let literal;
    function visit(node) {
      if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) {
        if (literal) throw new Error('anchor:ui-layout-' + component);
        literal = node.right;
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    if (!literal) throw new Error('anchor:ui-layout-' + component);
    const css = literal.text + '\n/* LASTRO scoped UI layout: ' + component + ' */\n' + extra;
    return region.slice(0, literal.getStart(file)) + JSON.stringify(css) + region.slice(literal.end);
  });
}
