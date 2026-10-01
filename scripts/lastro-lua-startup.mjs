import ts from 'typescript';

/** Keep Lua's startup fetch within the packaged executable resource origin. */
export function patchRuntimeLuaStartup(source) {
  const marker = '//#region src/DB/DBManager.js';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error('anchor:lua-startup:region');
  }
  const region = source.slice(start, end);
  const file = ts.createSourceFile('DBManager.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'startLua');
  if (functions.length !== 1 || !functions[0].body || functions[0].parameters.length !== 0
    || !functions[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
    throw new Error('anchor:lua-startup:function');
  }
  const declarations = functions[0].body.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'wasmUrl');
  if (declarations.length !== 1 || !declarations[0].initializer) {
    throw new Error('anchor:lua-startup:wasm-url');
  }
  const initializer = declarations[0].initializer;
  if (ts.isStringLiteralLike(initializer) && initializer.text === '/core/wasm/liblua5.1.wasm') {
    throw new Error('anchor:lua-startup:already-patched');
  }
  const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const value = unwrap(initializer);
  const awaited = ts.isPropertyAccessExpression(value) && value.name.text === 'default' ? unwrap(value.expression) : null;
  if (!awaited || !ts.isAwaitExpression(awaited) || !ts.isCallExpression(awaited.expression)
    || !ts.isIdentifier(awaited.expression.expression) || awaited.expression.expression.text !== '__vitePreload') {
    throw new Error('anchor:lua-startup:wasm-import');
  }
  let initializerCalls = 0, initializerExports = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'init_liblua5_1') initializerCalls++;
    if (ts.isIdentifier(node) && node.text === 'liblua5_1_exports') initializerExports++;
    ts.forEachChild(node, visit);
  }
  visit(initializer);
  if (initializerCalls !== 1 || initializerExports !== 1) throw new Error('anchor:lua-startup:wasm-import');
  // Preserve the inline reviewed binary: import-core-assets also uses it when
  // extracting the packaged WASM. Only the actual startup URL needs replacing.
  const patched = region.slice(0, initializer.getStart(file)) + '"/core/wasm/liblua5.1.wasm"' + region.slice(initializer.end);
  return source.slice(0, start) + patched + source.slice(end);
}
