import { readFile, writeFile } from 'node:fs/promises';
import console from 'node:console';
import ts from 'typescript';

const runtime = await readFile('generated/runtime/Online.js', 'utf8');
const file = ts.createSourceFile('Online.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = file.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => declaration.name.getText(file) === 'LastROTeleportFade'));
if (declarations.length !== 1) throw new Error('Missing packaged teleport fade');
function nativeFunction(name) {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (nodes.length !== 1) throw new Error('Missing native fade function ' + name);
  return nodes[0].getText(file);
}
const bgStart = runtime.indexOf('//#region src/UI/Background.js'), bgEnd = runtime.indexOf('//#endregion', bgStart);
const bgFile = ts.createSourceFile('Background.js', runtime.slice(bgStart, bgEnd), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const removes = [];
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(bgFile) === 'remove') removes.push(node.getText(bgFile));
  ts.forEachChild(node, visit);
}
visit(bgFile);
if (removes.length !== 1) throw new Error('Missing native Background.remove');
await writeFile('generated/teleport-fade-trusted-dom.mjs', await readFile('src/runtime/lastro-trusted-dom.mjs', 'utf8'));
await writeFile('generated/teleport-fade-preview.js', `
import { setLastROInnerHTML } from './teleport-fade-trusted-dom.mjs';
const _overlay = document.createElement('div'), _container = document.createElement('div'), _canvas = document.createElement('canvas');
Object.assign(_overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', zIndex: '1000', backgroundColor: 'black', opacity: '0' });
Object.assign(_container.style, { position: 'absolute', inset: '0', zIndex: '1', backgroundColor: 'black' });
let _overlayAnim;
const Configs = { get: () => 500 }, _pixelProps = new Set();
${nativeFunction('animateElement')}
${nativeFunction('transition')}
class Background { ${removes[0]} }
${declarations[0].getText(file)}
const player = document.getElementById('player'), state = document.getElementById('state');
let side = false, clicks = 0, sequence = 0, positionTimer;
function report() {
  const overlay = document.querySelector('[data-lastro-teleport-fade]');
  document.body.dataset.opacity = overlay ? getComputedStyle(overlay).opacity : '0';
  document.body.dataset.layers = document.querySelectorAll('[data-lastro-teleport-fade]').length;
  document.body.dataset.nativeCover = String(_overlay.isConnected);
  document.body.dataset.nativeOpacity = _overlay.isConnected ? _overlay.style.opacity : '0';
  document.body.dataset.playerPosition = player.style.left || '35%';
  document.body.dataset.animating = String(Boolean(overlay?.getAnimations().length));
  state.textContent = (_overlay.isConnected ? '原生过渡中' : overlay ? '轻微过渡中' : '画面已恢复') + ' · 地面点击 ' + clicks;
}
function teleport() {
  sequence++; clearTimeout(positionTimer);
  side = !side; player.style.left = side ? '70%' : '35%';
  LastROTeleportFade.play();
  requestAnimationFrame(() => { LastROTeleportFade.reveal(); report(); });
}
document.getElementById('teleport').addEventListener('click', teleport);
document.getElementById('repeat').addEventListener('click', () => { teleport(); teleport(); teleport(); });
document.getElementById('notify').addEventListener('click', () => {
  const current = ++sequence; clearTimeout(positionTimer);
  LastROTeleportFade.arm(); requestAnimationFrame(() => LastROTeleportFade.reveal());
  positionTimer = setTimeout(() => { if (current === sequence) teleport(); }, 250);
  report();
});
document.getElementById('native').addEventListener('click', () => {
  const current = ++sequence; clearTimeout(positionTimer);
  LastROTeleportFade.reset(); document.body.append(_container);
  Background.remove(() => { if (current === sequence) teleport(); }); report();
});
document.getElementById('cover').addEventListener('click', () => {
  _overlayAnim?.stop(); _overlay.style.opacity = '0.65'; document.body.append(_overlay);
  teleport(); report();
});
document.getElementById('uncover').addEventListener('click', () => { _overlayAnim?.stop(); _overlay.remove(); report(); });
document.getElementById('reset').addEventListener('click', () => {
  sequence++; clearTimeout(positionTimer); _overlayAnim?.stop(); _overlay.remove(); _container.remove();
  LastROTeleportFade.reset(); report();
});
document.getElementById('scene').addEventListener('click', () => { clicks++; report(); });
setInterval(report, 40); report();
`);
await writeFile('generated/teleport-fade-preview.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同地图瞬移过渡验证</title>
<style>html,body{margin:0;height:100%;font:14px Arial,'Microsoft YaHei',sans-serif;background:#536946;color:#fff}header{position:relative;z-index:1100;padding:16px;background:#23352b}h1{font-size:17px;font-weight:400;margin:0 0 10px}button{font:inherit;margin-right:8px;padding:5px 12px}#state{margin-left:8px}#scene{position:relative;height:430px;background:repeating-linear-gradient(32deg,#5e714b 0 22px,#6c7c55 22px 44px);overflow:hidden}#scene::before{content:'';position:absolute;inset:20% -20%;transform:rotate(-12deg);background:repeating-linear-gradient(90deg,#8b7c60 0 48px,#94846a 48px 50px);border:5px solid #57634e}#player{position:absolute;left:35%;top:46%;font-size:34px;filter:drop-shadow(0 5px 2px #30382b)}footer{position:relative;z-index:50;padding:12px;background:#23352b;color:#bacdbb}</style>
<header><h1>同地图瞬移 · 原生过渡优先</h1><button id="teleport">模拟瞬移</button><button id="repeat">连续瞬移</button><button id="notify">先通知后更新位置</button><button id="native">原生加载过渡</button><button id="cover">保留原生遮罩并瞬移</button><button id="uncover">移除原生遮罩</button><button id="reset">清除过渡</button><span id="state"></span></header>
<div id="scene" aria-label="可点击的地图预览"><span id="player">♟</span></div><footer>使用当前打包客户端的过渡函数。可点击地面验证动画期间仍能操作。</footer>
<script type="module" src="./teleport-fade-preview.js"></script></html>`);
console.log('Preview: /generated/teleport-fade-preview.html');
