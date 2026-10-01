import { readFile, mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import { TextDecoder } from 'node:util';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { createLastroUiMessages } from './lastro-ui-messages.mjs';

const runtime = await readFile('generated/runtime/Online.js', 'utf8');
const uiMessages = JSON.parse(/const lastroUiMessages = ([^\r\n]+);\r?\n/.exec(runtime)?.[1] || '{}');
const terms = /^(?:HP|SP|AP|EXP|Base|Job|STR|AGI|VIT|INT|DEX|LUK|HIT|FLEE|ATK|MATK|DEF|MDEF|ASPD|Zeny|BOSS|NPC|FPS|RO|Ragnarok|Ragnarok Online|IP|ID|ON|OFF|ATK\/MATK|DEF\/MDEF|MHP|MSP|CRI|Range|Size|Race|Element|Level|Lv\.?|PVP|PvP|PVE|PvE)$/i;
const credits = new Set(['roBrowserLegacy', 'Vincent Thibault', 'robrowser.com', 'github.com/MrAntares/roBrowserLegacy', 'data /']);
function isReviewedUiTerm(text) {
  return terms.test(text) || credits.has(text)
    || /^(?:WOE|BGM|FXAA|JEXP|\d+\s*[zC]|[A-Z]|F\d{1,2}|[LR][12](?:\+[LR][12])?)$/i.test(text)
    || /^\d{3,4}\s*x\s*\d{3,4}$/i.test(text)
    || /^(?:[\s.:/|]*(?:Base|Job|Lv|Exp|HP|SP|AP|Zeny))+[\s.:/|]*$/i.test(text);
}
const candidates = [];
const layouts = [];
const messageUses = new Map();
const templates = [];
for (const match of runtime.matchAll(/\/\/#region (src\/UI\/[^\r\n]+\.(html|css)\?raw)\r?\n([\s\S]*?)\/\/#endregion/g)) {
  const [, component, extension, region] = match;
  const file = ts.createSourceFile('ui.js', region, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literals = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.right)) literals.push(node.right.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (extension === 'css') {
    for (const css of literals) {
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        const width = /(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/.exec(rule[2]);
        if (width && Number(width[1]) < 80 && /text|label|name|title|button|select|span/.test(rule[1])) {
          layouts.push({ component, selector: rule[1].trim(), width: Number(width[1]) });
        }
      }
    }
    continue;
  }
  templates.push(component);
  for (const html of literals) {
    const fragment = JSDOM.fragment(html);
    const walker = fragment.ownerDocument.createTreeWalker(fragment, 4);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (!text || /\$\{|[\u3400-\u9fff]/u.test(text) || isReviewedUiTerm(text) || !/[A-Za-z\uac00-\ud7af]/u.test(text)) continue;
      if (['STYLE', 'SCRIPT'].includes(node.parentElement?.tagName)) continue;
      candidates.push({ component, text, element: node.parentElement?.tagName, type: 'text', message: node.parentElement?.getAttribute('data-text') || node.parentElement?.getAttribute('msg') });
    }
    for (const element of fragment.querySelectorAll('*')) {
      const id = element.getAttribute('data-text') || element.getAttribute('msg');
      if (id && /^\d+$/.test(id)) {
        const uses = messageUses.get(id) || new Set(); uses.add(component); messageUses.set(id, uses);
      }
      for (const attribute of ['placeholder', 'title', 'data-title', 'aria-label', 'alt']) {
        const text = element.getAttribute(attribute)?.trim();
        if (text && !/\$\{|[\u3400-\u9fff]/u.test(text) && !isReviewedUiTerm(text) && /[A-Za-z\uac00-\ud7af]/u.test(text)) {
          candidates.push({ component, text, element: element.tagName, type: attribute });
        }
      }
    }
  }
}
const messageTable = {};
const messageLoader = createLastroUiMessages();
messageLoader.loadCsv(await readFile('generated/core/data/msgstringtable.csv'), messageTable, bytes => new TextDecoder('utf-8').decode(bytes));
const messageCandidates = [...messageUses].flatMap(([id, uses]) => {
  const raw = messageTable[Number(id)] || '';
  const text = messageLoader.resolveMessage(id, raw) ?? uiMessages[raw] ?? raw;
  if (text && (/[\u3400-\u9fff]/u.test(text) || isReviewedUiTerm(text) || !/[A-Za-z\uac00-\ud7af]/u.test(text))) return [];
  return [{ id: Number(id), text, components: [...uses] }];
});
const report = { templateCount: templates.length, templates, textCandidates: candidates, messageCandidates, narrowLayoutCandidates: layouts };
await mkdir('generated', { recursive: true });
await writeFile('generated/ui-review-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ templates: templates.length, textCandidates: candidates.length, messageCandidates: messageCandidates.length, narrowLayoutCandidates: layouts.length }));
