import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { classifyResource } from '../src/resources/resource-policy';

describe('resource policy', () => {
  it.each(['runtime/Online.js', 'workers/client.mjs', 'core/lib.wasm', 'data/script.lua', 'data/script.LUB'])('%s is package-only', (path) => {
    expect(classifyResource(path)).toBe('packaged-executable');
  });

  it.each(['data/map/prt.gat', 'data/sprite/player.spr', 'data/model/player.rsm', 'data/model/player.RSM2', 'data/texture/item.bmp', 'bgm/theme.mp3'])('%s is passive', (path) => {
    expect(classifyResource(path)).toBe('remote-passive');
  });

  it('classifies every extension handled by the actual native worker without allowing remote executable files', () => {
    const source = ts.createSourceFile('ThreadEventHandler.js', readFileSync('vendor/v2/ThreadEventHandler.js', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const loaders: ts.MethodDeclaration[] = [];
    function findLoader(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'se'
        && node.initializer && ts.isClassExpression(node.initializer)) {
        for (const member of node.initializer.members) {
          if (ts.isMethodDeclaration(member) && member.name.getText(source) === 'load') loaders.push(member);
        }
      }
      ts.forEachChild(node, findLoader);
    }
    findLoader(source);
    expect(loaders).toHaveLength(1);
    const extensions = new Set<string>();
    function findExtension(node: ts.Node) {
      if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) extensions.add(node.expression.text);
      ts.forEachChild(node, findExtension);
    }
    findExtension(loaders[0]!);
    expect(extensions.has('rsm2')).toBe(true);
    for (const extension of extensions) {
      expect(classifyResource(`data/native.${extension}`), extension).toBe(
        extension === 'lua' || extension === 'lub' ? 'packaged-executable' : 'remote-passive',
      );
    }
  });

  it.each(['../secret.js', '/absolute/path.js', 'data/unknown.exe', 'data/file.json', 'data/file'])('%s is forbidden', (path) => {
    expect(classifyResource(path)).toBe('forbidden');
  });

  it('normalizes separators and extension case without bypassing the policy', () => {
    expect(classifyResource('data\\texture\\item.BMP')).toBe('remote-passive');
    expect(classifyResource('data\\scripts\\worker.JS')).toBe('packaged-executable');
    expect(classifyResource('data\\scripts\\worker.EXE')).toBe('forbidden');
  });
});
