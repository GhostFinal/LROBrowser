import ts from 'typescript';

const versions = [1, 3, 4, 5];

function fail() { throw new Error('anchor:basic-info-layout'); }

function replaceOne(text, pattern, replacement) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) fail();
  return text.replace(pattern, replacement);
}

function compactLevelLine(hasAp) {
  return '<div class="line2">Lv.<span class="blvl_value"></span> <span class="job_value"></span> / Lv.<span class="jlvl_value"></span>'
    + (hasAp ? '' : ' / Exp.<span class="bexp_value"></span>') + '</div>';
}

function layoutCss(version) {
  const id = '#BasicInfoV' + version;
  return `
:host { height: auto; }
${id} { position: relative; font-size: 12px; line-height: 13px; font-weight: 400; }
${id} .large .title { right: 20px; overflow: hidden; white-space: nowrap; }
${id} .large .name, ${id} .large .job { left: 9px; right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${id} .large .blvl, ${id} .large .jlvl { width: 65px; overflow: hidden; white-space: nowrap; }
${id} .large .extra { left: 9px; right: 7px; width: auto; padding: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${id} .small .line1 { right: 20px; overflow: hidden; text-overflow: ellipsis; }
${id} .small .line2, ${id} .small .line3, ${id} .small .line4 { left: 5px; right: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
` + (version === 5 ? `
${id} .small .info-container { height: 53px; }
${id} .small .line3, ${id} .small .line4 { height: 13px; }
${id} .small .line3 .expcontainer, ${id} .small .line4 .apcontainer { left: 130px; right: 0; width: auto; }
${id} .small .line3 .hp_max_value, ${id} .small .line4 .sp_max_value { width: auto; }
` : '');
}

function patchTemplate(source, version, kind, mutate) {
  const path = `BasicInfo/BasicInfoV${version}/BasicInfoV${version}.${kind}?raw`;
  const marker = '//#region src/UI/Components/' + path;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) fail();
  const region = source.slice(start, end);
  const file = ts.createSourceFile(path, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literals = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(file) === `BasicInfoV${version}_default$${kind === 'html' ? 2 : 1}`
      && ts.isStringLiteral(node.right)) literals.push(node.right);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (literals.length !== 1) fail();
  const literal = literals[0];
  if (literal.text.includes('lastro-basic-info-layout')) fail();
  const updated = mutate(literal.text);
  return source.slice(0, start) + region.slice(0, literal.getStart(file)) + JSON.stringify(updated)
    + region.slice(literal.end) + source.slice(end);
}

export function patchRuntimeBasicInfoLayout(source) {
  for (const version of versions) {
    source = patchTemplate(source, version, 'html', html => {
      if (!html.includes(`id="BasicInfoV${version}"`) || !html.includes('class="name_value"')
        || !html.includes('class="hp_value"') || !html.includes('class="sp_value"')
        || (version === 5 && !html.includes('class="ap_value"'))) fail();
      html = replaceOne(html, /<div class="blvl">[\s\S]*?<\/div>/g,
        '<div class="blvl">BaseLv.<span class="blvl_value"></span></div>');
      html = replaceOne(html, /<div class="jlvl">[\s\S]*?<\/div>/g,
        '<div class="jlvl">JobLv.<span class="jlvl_value"></span></div>');
      html = replaceOne(html, /<div class="line2">[\s\S]*?<\/div>/g, compactLevelLine(version === 5));
      html = replaceOne(html, /<div class="extra">[\s\S]*?<\/div>/g,
        '<div class="extra"><span class="weight">负重: <span class="weight_value">0</span> / <span class="weight_total">0</span></span> Zeny: <span class="zeny_value">0</span></div>');
      html = html.replace(/(<span class="(?:hp|sp|ap)_value"\s*>[^<]*<\/span\s*>)\s*\/\s*(<span class="(?:hp|sp|ap)_max_value"\s*>[^<]*<\/span\s*>)/g, '$1/$2')
        .replace(/\b(HP|SP|AP)\.\s*/g, '$1 ').replace(/\bExp\.\s*/g, 'Exp.');
      return '<!-- lastro-basic-info-layout -->\n' + html;
    });
    source = patchTemplate(source, version, 'css', css => {
      if (!css.includes(`#BasicInfoV${version}.small`) || !css.includes(`#BasicInfoV${version} .large .extra`)) fail();
      return css + '\n/* lastro-basic-info-layout */\n' + layoutCss(version);
    });
  }
  return source;
}
