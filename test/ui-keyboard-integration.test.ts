import { assistantInput } from './assistant-runtime-fixture';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractWorldMapFixture } from '../scripts/extract-worldmap-fixture.mjs';

const runtime = readFileSync('generated/runtime/Online.js', 'utf8');
const world = extractWorldMapFixture(runtime);
function region(name: string) {
  const start = runtime.indexOf('//#region ' + name), end = runtime.indexOf('//#endregion', start);
  if (start < 0 || end < start) throw new Error('Missing native region: ' + name);
  return runtime.slice(start, end);
}
function assignment(name: string, path: string) {
  const source = ts.createSourceFile(path, region(path), ts.ScriptTarget.Latest, true);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(source) === name) result = node.getText(source) + ';';
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!result) throw new Error('Missing native assignment: ' + name);
  return result;
}
function guiMethod(name: string) {
  const source = ts.createSourceFile('GUI.js', region('src/UI/GUIComponent.js'), ts.ScriptTarget.Latest, true);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(source) === 'GUIComponent' && ts.isClassExpression(node.right)) {
      const matches = node.right.members.filter(member => ts.isMethodDeclaration(member) && member.name.getText(source) === name);
      if (matches.length !== 1) throw new Error('Ambiguous native GUI method: ' + name);
      result = matches[0]!.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!result) throw new Error('Missing native GUI method: ' + name);
  return result;
}
const frames: HTMLIFrameElement[] = [];
afterEach(() => { frames.splice(0).forEach(frame => frame.remove()); });
function mount() {
  const frame = document.createElement('iframe'); document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as Window & typeof globalThis, doc = win.document;
  const next = vi.fn(), close = vi.fn();
  // jsdom caches computed display for shadow descendants after inline style
  // changes. Honor that explicit value while exercising the native predicate.
  const getComputedStyle = (element: Element) => ({
    display: (element as HTMLElement).style.display || win.getComputedStyle(element).display,
  });
  const context = vm.createContext({ ...assistantInput, window: win, document: doc, Event: win.Event, getComputedStyle,
    console, next, close, world, KEYS: { SPACE: 32, ENTER: 13, ESCAPE: 27, getDeepActiveElement: () => {
      let active = doc.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active;
    } },
    MouseMode: { FREEZE: 2 }, Mouse: {}, SessionStorage_default: {}, _Cursor: null,
    UIManager: { components: {} } });
  const helperStart = runtime.indexOf('function lastroHotkeyId(');
  const helpers = helperStart < 0 ? '' : runtime.slice(helperStart, runtime.indexOf('//#region src/Controls/KeyEventHandler.js', helperStart));
  vm.runInContext(`
    ${helpers}
    class NativeGUI {
      constructor(name, html) {
        this._host = document.createElement('div'); this._host.id = name;
        this.root = this._host.attachShadow({mode:'open'}); this.root.innerHTML = html;
        this.__loaded = true; this.__active = false; this.mouseMode = 1;
      }
      getRoot() { return this.root; }
      focus() {} _setupScrollbars() {} _fixPositionOverflow() {}
      ${guiMethod('append')}
      ${guiMethod('_bindKeyDown')}
      ${guiMethod('_unbindKeyDown')}
    }
    const Escape = new NativeGUI('Escape','<button>设置</button>');
    ${assignment('Escape.onAppend', 'src/UI/Components/Escape/Escape.js')}
    ${assignment('Escape.onKeyDown', 'src/UI/Components/Escape/Escape.js')}
    Escape.append(); UIManager.components.Escape = Escape;
    const NpcMenu_default = { __active:false }, InputBox_default = { __active:false };
    const NpcBox = new NativeGUI('NpcBox','<div class="content"></div><button class="next" style="display:none">下一步</button><button class="close" style="display:none">关闭</button>');
    let _needCleanUp = false;
    function _isVisible$1(el) { return !!el && getComputedStyle(el).display !== 'none'; }
    ${['onKeyDown', 'addNext', 'addClose', 'next', 'close'].map(name => assignment('NpcBox.' + name, 'src/UI/Components/NpcBox/NpcBox.js')).join('\n')}
    NpcBox.onNextPressed = next; NpcBox.onClosePressed = close;
    UIManager.components.NpcBox = NpcBox;
    const WorldMap = new NativeGUI('WorldMap',world.html);
    (${world.installLastroWorldMap})(WorldMap,{
      document, DB:{INTERFACE_PATH:'',getItemInfo:()=>({})}, Client:{loadFile:(_path,_done,fail)=>fail?.()},
      loadData:async()=>({worldData:{},mobData:{}}), itemTable:()=>({}), currentMap:()=>'',accountId:()=>0,
    },world.regions,(${world.createWorldMapIndex}));
    WorldMap.init(); WorldMap.append();
    globalThis.native = {Escape,NpcBox,WorldMap};
  `, context);
  const native = context.native as {
    Escape: { _host: HTMLElement };
    NpcBox: { _host: HTMLElement; append(): void; addNext(id: number): void; addClose(id: number): void; getRoot(): ShadowRoot };
    WorldMap: { _host: HTMLElement; toggle(): void; onKeyDown(event: KeyboardEvent): unknown };
  };
  const key = (value: string, options: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true, ...options });
    win.dispatchEvent(event); return event;
  };
  return { native, key, next, close };
}

describe('packaged native keyboard routing after world-map use', () => {
  it('lets Escape open and close the settings menu while the appended world map is hidden', () => {
    const f = mount();
    expect(f.native.WorldMap._host.style.display).toBe('none');
    f.key('Escape'); expect(f.native.Escape._host.style.display).toBe('');
    f.key('Escape'); expect(f.native.Escape._host.style.display).toBe('none');
  });

  it('uses Escape to close the visible map before opening settings on the next press', () => {
    const f = mount();
    f.native.WorldMap.toggle();
    expect(f.native.WorldMap._host.style.display).toBe('');
    f.key('Escape'); expect(f.native.WorldMap._host.style.display).toBe('none');
    expect(f.native.Escape._host.style.display).toBe('none');
    f.key('Escape'); expect(f.native.Escape._host.style.display).toBe('');
  });

  it('advances the current NPC once after world-map hide, preserving modern Enter and repeat guards', () => {
    const f = mount();
    f.native.NpcBox.append(); f.native.NpcBox.addNext(1234);
    f.key('Enter'); expect(f.next).toHaveBeenCalledExactlyOnceWith(1234);
    f.key('Enter'); expect(f.next).toHaveBeenCalledTimes(1);
    f.native.NpcBox.addNext(1234);
    f.key('Enter', { repeat: true }); expect(f.next).toHaveBeenCalledTimes(1);
    f.key('Enter', { isComposing: true }); expect(f.next).toHaveBeenCalledTimes(1);
    f.key('Enter'); expect(f.next).toHaveBeenCalledTimes(2);
  });

  it('closes the final NPC step through its native callback without re-sending it', () => {
    const f = mount();
    f.native.NpcBox.append(); f.native.NpcBox.addClose(5678);
    f.key('Enter'); expect(f.close).toHaveBeenCalledExactlyOnceWith(5678);
    f.key('Enter'); expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.next).not.toHaveBeenCalled();
  });
});
