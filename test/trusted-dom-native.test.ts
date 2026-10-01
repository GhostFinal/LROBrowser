// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { setLastROInnerHTML } from '../src/runtime/lastro-trusted-dom.mjs';
import { patchRuntimePlainTextSinks } from '../scripts/patch-csp-runtime.mjs';
import vm from 'node:vm';

describe('native UI HTML compatibility with the injection boundary', () => {
  it('accepts every complete static UI fragment in the actual generated runtime', () => {
    const source = readFileSync('generated/runtime/Online.js', 'utf8');
    const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const pending: ts.Node[] = [file];
    const rejected: Array<{ line: number; message: string }> = [];
    let count = 0;
    while (pending.length) {
      const node = pending.pop()!;
      if (ts.isStringLiteralLike(node) && /^\s*<(?:div|form|nav|section|table|ul|span|ui-)/.test(node.text) && node.text.includes('</')) {
        count++;
        try { setLastROInnerHTML(document.createElement('div'), node.text); }
        catch (error) { rejected.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, message: String(error) }); }
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
    expect(count).toBeGreaterThanOrEqual(150);
    expect(rejected).toEqual([]);
  }, 20_000);

  it('renders server character and item names as literal text in all five native sinks', () => {
    const native = readFileSync('vendor/v2/Online.js', 'utf8');
    const source = patchRuntimePlainTextSinks(native);
    expect(patchRuntimePlainTextSinks(source)).toBe(source);
    const parsed = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const pending: ts.Node[] = [parsed];
    const assignments: string[] = [];
    while (pending.length) {
      const node = pending.pop()!;
      if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'textContent') {
        const target = node.left.expression.getText(parsed);
        const value = node.right.getText(parsed);
        const regionStart = source.lastIndexOf('//#region', node.getStart(parsed));
        const region = source.slice(regionStart, source.indexOf('\n', regionStart));
        if (target.startsWith('charCanvases[') || region.includes('src/UI/Components/Storage/') && ['overlay', 'nameSpan'].includes(target) && value.includes('DB.getItemName(item)')) assignments.push(node.getText(parsed));
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
    expect(assignments).toHaveLength(5);
    const name = '<b>冒充窗口</b><input name="password">';
    for (const assignment of assignments) {
      const slot = document.createElement('div');
      const text = document.createElement('span'); text.className = 'name'; slot.append(text);
      vm.runInNewContext(assignment, { charCanvases: [slot], i: 0, _slots: [{ name }], nameSpan: text, overlay: text,
        item: { count: 3 }, DB: { getItemName: () => name }, getItemCountUnit: () => '个' });
      expect(text.textContent).toContain(name);
      expect(text.children).toHaveLength(0);
    }
  }, 20_000);
});
