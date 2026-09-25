import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import ts from 'typescript';

function fail(code) { throw new Error(JSON.stringify({ code })); }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function evaluate(node, bindings) {
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, bindings);
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken)) {
    const value = Number(evaluate(node.operand, bindings));
    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (ts.isIdentifier(node) && bindings.has(node.text)) return bindings.get(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(element => evaluate(element, bindings));
  if (ts.isObjectLiteralExpression(node)) {
    const result = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !property.name) fail('unsupported-property');
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
        ? property.name.text : fail('unsupported-property-name');
      result[key] = evaluate(property.initializer, bindings);
    }
    return result;
  }
  fail('unsupported-expression');
}

export function convertAmdData(source) {
  const file = ts.createSourceFile('amd-data.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const definitions = [];
  file.statements.forEach(statement => {
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === 'define') definitions.push(statement.expression);
    else if (!(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression))) fail('unexpected-top-level');
  });
  if (definitions.length !== 1 || definitions[0].arguments.length !== 1) fail('define-contract');
  const factory = definitions[0].arguments[0];
  if (!ts.isFunctionExpression(factory) && !ts.isArrowFunction(factory)) fail('factory-required');
  const body = ts.isBlock(factory.body) ? factory.body : null;
  if (!body) return stable(evaluate(factory.body, new Map()));
  const bindings = new Map();
  let result;
  for (const statement of body.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) fail('unsupported-declaration');
        bindings.set(declaration.name.text, evaluate(declaration.initializer, bindings));
      }
      continue;
    }
    if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)
      && statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(statement.expression.left)) {
      bindings.set(statement.expression.left.text, evaluate(statement.expression.right, bindings));
      continue;
    }
    if (ts.isReturnStatement(statement) && statement.expression) {
      if (result !== undefined) fail('multiple-returns');
      result = evaluate(statement.expression, bindings);
      continue;
    }
    fail('unexpected-factory-code');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('data-object-required');
  return stable(result);
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    world: { type: 'string' }, mobs: { type: 'string' }, out: { type: 'string' },
  } });
  if (!values.world || !values.mobs || !values.out) fail('arguments-required');
  if (![values.world, values.mobs, values.out].every(value => path.isAbsolute(value))) fail('absolute-path-required');
  const world = convertAmdData(await readFile(values.world, 'utf8'));
  const mobs = convertAmdData(await readFile(values.mobs, 'utf8'));
  await mkdir(values.out, { recursive: true });
  await writeFile(path.join(values.out, 'world-data.json'), JSON.stringify(world, null, 2) + '\n');
  await writeFile(path.join(values.out, 'mob-data.json'), JSON.stringify(mobs, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
