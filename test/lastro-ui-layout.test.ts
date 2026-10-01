import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { patchRuntimeUiLayout, UI_LAYOUT_CSS } from '../scripts/lastro-ui-layout.mjs';

const native = await readFile('vendor/v2/Online.js', 'utf8');
const cssRegion = /\/\/#region src\/UI\/Components\/([^\n]+)\.css\?raw\r?\n[\s\S]*?\/\/#endregion/g;

function literals(region: string) {
  const file = ts.createSourceFile('component.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes: ts.StringLiteral[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) nodes.push(node.right);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { file, nodes };
}

describe('native UI layout patch', () => {
  it('retains the native CSS before scoped additions', () => {
    const patched = patchRuntimeUiLayout(native);
    for (const [component, extra] of Object.entries(UI_LAYOUT_CSS)) {
      const original = [...native.matchAll(cssRegion)].find(match => match[1] === component)?.[0];
      const final = [...patched.matchAll(cssRegion)].find(match => match[1] === component)?.[0];
      expect(original).toBeDefined(); expect(final).toBeDefined();
      const originalCss = literals(original!).nodes[0]?.text;
      const finalCss = literals(final!).nodes[0]?.text;
      expect(finalCss).toBe(originalCss + '\n/* LASTRO scoped UI layout: ' + component + ' */\n' + extra);
    }
  });

  it('only changes selected CSS literals, preserving templates and native actions', () => {
    const normalize = (source: string) => source.replace(cssRegion, (region: string, component: string) => {
      if (!UI_LAYOUT_CSS[component]) return region;
      const { file, nodes } = literals(region);
      const node = nodes[0]!;
      return region.slice(0, node.getStart(file)) + 'NATIVE_COMPONENT_CSS' + region.slice(node.end);
    });
    expect(normalize(patchRuntimeUiLayout(native))).toBe(normalize(native));
  });

  it('does not append fixes twice', () => {
    const patched = patchRuntimeUiLayout(native);
    expect(patchRuntimeUiLayout(patched)).toBe(patched);
  });

  it('keeps unrelated components byte-for-byte', () => {
    const source = '//#region src/UI/Components/Unknown/Unknown.css?raw\nconst css = "body { color: red; }";\n//#endregion';
    expect(patchRuntimeUiLayout(source)).toBe(source);
  });

  it('rejects a target region whose native literal no longer matches', () => {
    const component = Object.keys(UI_LAYOUT_CSS)[0]!;
    const source = '//#region src/UI/Components/' + component + '.css?raw\nfunction newCss() {}\n//#endregion';
    expect(() => patchRuntimeUiLayout(source)).toThrow('anchor:ui-layout-' + component);
  });
});
