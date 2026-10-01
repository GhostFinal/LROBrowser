import ts from 'typescript';

function patchRegion(source, path, transform) {
  const marker = '//#region ' + path;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:debug-access:region:' + path);
  const region = source.slice(start, end);
  const file = ts.createSourceFile(path, region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return source.slice(0, start) + transform(region, file) + source.slice(end);
}

function replaceNodes(source, file, replacements) {
  for (const [node, replacement] of replacements.sort((a, b) => b[0].getStart(file) - a[0].getStart(file))) {
    source = source.slice(0, node.getStart(file)) + replacement + source.slice(node.end);
  }
  return source;
}

function nativeFunction(file, name, parameters) {
  const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const fn = functions[0];
  if (functions.length !== 1 || !fn.body || fn.parameters.map(parameter => parameter.name.getText(file)).join(',') !== parameters.join(',')) {
    throw new Error('anchor:debug-access:function:' + name);
  }
  return fn;
}

/** Disable the client's own debug paths without relying on mutable page configuration. */
export function patchRuntimeDebugAccess(source) {
  let output = patchRegion(source, 'src/Core/Configs.js', (region, file) => {
    const getters = [];
    function visit(node) {
      if (ts.isPropertyDeclaration(node) && node.name.getText(file) === 'get'
        && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword)) getters.push(node);
      ts.forEachChild(node, visit);
    }
    visit(file);
    const getter = getters[0]?.initializer;
    if (getters.length !== 1 || !getter || !ts.isArrowFunction(getter) || !ts.isBlock(getter.body)
      || getter.parameters.map(parameter => parameter.name.getText(file)).join(',') !== 'key,defaultValue'
      || getter.body.statements.length !== 3 || !ts.isIfStatement(getter.body.statements[0])
      || !ts.isIfStatement(getter.body.statements[1]) || !ts.isReturnStatement(getter.body.statements[2])) {
      throw new Error('anchor:debug-access:configs-get');
    }
    const body = getter.body.getText(file);
    const locked = `{
      switch (key) {
        case "debug": case "debugAI": case "development": case "enableConsole":
        case "debugUseLegacyMapEnter": case "packetDump": return false;
        case "debugEnterUnknown": case "debugEnterSex": return null;
      }
${body.slice(1)}`;
    return replaceNodes(region, file, [[getter.body, locked]]);
  });
  output = patchRegion(output, 'src/UI/Components/WinLogin/WinLoginCommon.js', (region, file) => {
    const markup = nativeFunction(file, 'getDebugLoginPanelMarkup', []);
    const template = nativeFunction(file, 'enhanceWinLoginTemplate', ['name', 'htmlText']);
    const styles = nativeFunction(file, 'enhanceWinLoginStyles', ['name', 'cssText']);
    if (!markup.body.getText(file).includes('data-debug-enter-panel')
      || !template.body.getText(file).includes('getDebugLoginPanelMarkup()')
      || !styles.body.getText(file).includes('debug-enter-panel')) throw new Error('anchor:debug-access:login-panel');
    return replaceNodes(region, file, [[markup.body, '{ return ""; }'], [template.body, '{ return htmlText; }'], [styles.body, '{ return cssText; }']]);
  });
  const navigationMarker = '//#region src/UI/Components/Navigation/Navigation.js';
  if (output.includes(navigationMarker)) {
    const file = ts.createSourceFile('Online.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const imports = file.statements.filter(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.split('?')[0] === './lastro-navigation-debug.mjs');
    const declaration = imports[0];
    const bindings = declaration?.importClause?.namedBindings;
    if (imports.length !== 1 || !bindings || !ts.isNamedImports(bindings) || bindings.elements.length !== 1
      || bindings.elements[0].name.text !== 'installNavigationDebug' || bindings.elements[0].propertyName) {
      throw new Error('anchor:debug-access:navigation-import');
    }
    output = replaceNodes(output, file, [[declaration, '']]);
    output = patchRegion(output, 'src/UI/Components/Navigation/Navigation.js', (region, navigationFile) => {
      const installs = navigationFile.statements.filter(node => ts.isExpressionStatement(node)
        && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'installNavigationDebug');
      if (installs.length !== 1 || installs[0].expression.arguments.length !== 1
        || installs[0].expression.arguments[0].getText(navigationFile) !== 'getNavigationDiagnosticState') {
        throw new Error('anchor:debug-access:navigation-install');
      }
      return replaceNodes(region, navigationFile, [[installs[0], 'void 0; // Navigation diagnostics are not exposed by the game client.']]);
    });
  }
  output = patchRegion(output, 'src/Utils/ConsoleManager.js', (region, file) => {
    const toggle = nativeFunction(file, 'toggleConsole', []);
    if (!toggle.body.getText(file).includes('Configs.get("enableConsole", false)')
      || !toggle.body.getText(file).includes('console = noConsole')) throw new Error('anchor:debug-access:console');
    // Keep native error diagnostics available; disabling developer entry points
    // must not replace the entire console with dummy error/warning handlers.
    return replaceNodes(region, file, [[toggle.body, '{ console = _console; }']]);
  });
  return output;
}
