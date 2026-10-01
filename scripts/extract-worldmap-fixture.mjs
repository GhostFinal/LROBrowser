import ts from 'typescript';

export function extractWorldMapFixture(source) {
  const ast = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const result = {};
  function visit(node) {
    if (ts.isFunctionExpression(node) && ['installLastroWorldMap', 'createWorldMapIndex', 'createMonsterPortraitLoader'].includes(node.name?.text)) result[node.name.text] = node.getText(ast);
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'GUIComponent' && node.arguments?.[0]?.text === 'WorldMap') result.css = node.arguments[1].text;
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'WorldMap.render') result.html = node.right.body.text;
    if (ts.isCallExpression(node) && ts.isParenthesizedExpression(node.expression) && node.expression.expression.name?.text === 'installLastroWorldMap') result.regions = JSON.parse(node.arguments[2].getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const key of ['installLastroWorldMap', 'createWorldMapIndex', 'createMonsterPortraitLoader', 'html', 'css', 'regions']) if (!result[key]) throw new Error(`Missing packaged world map ${key}`);
  return result;
}
