// Explicit maintainer tool: extract passive layout data, never execute the upstream bundle.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import console from 'node:console';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const sourceUrl = 'https://game.lastro.cn/ro/Online.js?71.9';
const response = await globalThis.fetch(sourceUrl);
if (!response.ok) throw new Error(`Official layout HTTP ${response.status}`);
const source = await response.text();
const ast = ts.createSourceFile('official.js', source, ts.ScriptTarget.Latest, true);
let html;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'define' &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'text!UI/Components/WorldMap/WorldMap.html') {
    const value = node.arguments[2]?.body?.statements.find(ts.isReturnStatement)?.expression;
    if (!value || !ts.isStringLiteral(value)) throw new Error('Official map template changed');
    html = value.text;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!html) throw new Error('Official map template missing');
const document = new JSDOM(html).window.document;
const names = [...document.querySelectorAll('.mapblock option')].map(el => el.textContent);
const backgrounds = ['worldmap_n.jpg', 'worldmap_dimension_n.jpg', 'worldmap_localizing1_n.jpg', 'worldmap_localizing2_n.jpg'];
const regions = [...document.querySelectorAll('table.bigworld')].map((table, index) => {
  const cells = [];
  let columns = 0;
  [...table.rows].forEach((row, y) => {
    let x = 0;
    for (const cell of row.cells) {
      if (cell.rowSpan !== 1) throw new Error('Review new rowspan layout');
      const image = cell.getAttribute('data-background');
      const id = cell.getAttribute('data-map');
      if (image) {
        if (!/^map\/s\/[a-z0-9_]+\.png$/i.test(image)) throw new Error(`Unexpected image ${image}`);
        cells.push({ id: cell.classList.contains('Mhtmltip') ? id : null, image: image.slice(6), x, y, span: cell.colSpan, boss: !!cell.querySelector('.mvpMap') });
      }
      x += cell.colSpan;
    }
    columns = Math.max(columns, x);
  });
  return { name: names[index], background: backgrounds[index], columns, rows: table.rows.length, cells };
});
if (regions.length !== 4 || regions[0].cells.length < 100) throw new Error('Review official layout change');
await writeFile(new URL('./lastro-worldmap-layout.json', import.meta.url), JSON.stringify({ sourceUrl, sha256: createHash('sha256').update(source).digest('hex'), regions }, null, 2) + '\n');
console.log(regions.map(r => ({ name: r.name, cells: r.cells.length, columns: r.columns, rows: r.rows })));
