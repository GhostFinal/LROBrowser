// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLastroItemDrag } from '../scripts/lastro-item-drag.mjs';

type DragWindow = Window & typeof globalThis & { _OBJ_DRAG_?: unknown };
const frames: HTMLIFrameElement[] = [];
const bridges: Array<{ destroy(): void }> = [];
afterEach(() => {
  bridges.splice(0).forEach(bridge => bridge.destroy());
  frames.splice(0).forEach(frame => frame.remove());
  vi.restoreAllMocks();
});

function fixture(options: { enabled?: boolean; accept?: boolean; type?: string; draggable?: string; plain?: string; dragImage?: boolean } = {}) {
  const frame = document.createElement('iframe');
  document.body.append(frame); frames.push(frame);
  const win = frame.contentWindow as DragWindow, doc = win.document;
  const sourceHost = doc.createElement('div'), targetHost = doc.createElement('div');
  sourceHost.id = 'Inventory'; targetHost.id = 'Storage';
  doc.body.append(sourceHost, targetHost);
  const sourceRoot = sourceHost.attachShadow({ mode: 'open' });
  sourceRoot.innerHTML = '<div class="item" draggable="true"><span class="icon"></span></div>';
  const source = sourceRoot.querySelector<HTMLElement>('.item')!, icon = source.querySelector<HTMLElement>('.icon')!;
  if (options.draggable !== undefined) source.setAttribute('draggable', options.draggable);
  const targetRoot = targetHost.attachShadow({ mode: 'open' });
  targetRoot.innerHTML = '<div class="drop-target"><span class="slot"></span></div>';
  const target = targetRoot.querySelector<HTMLElement>('.drop-target')!, slot = target.querySelector<HTMLElement>('.slot')!;
  const mouse = { screen: { x: 0, y: 0, width: 800, height: 600 }, state: 2, MOUSE_STATE: { NORMAL: 0, DRAGGING: 1, USESKILL: 2 } };
  const cursor = { x: 0, y: 0 };
  const payload: { type: string; from: string; data?: { index: number; ITID: number; count: number } } = {
    type: options.type ?? 'item', from: 'Inventory', data: { index: 7, ITID: 501, count: 18 },
  };
  const events: Array<{ type: string; event: Event; data: string; target: EventTarget | null }> = [];
  const drops: unknown[] = [];
  let enabled = options.enabled ?? true, hit: Element | null = sourceHost;
  Object.defineProperty(doc, 'elementFromPoint', { configurable: true, value: () => hit });
  Object.defineProperty(sourceRoot, 'elementFromPoint', { configurable: true, value: () => icon });
  Object.defineProperty(targetRoot, 'elementFromPoint', { configurable: true, value: () => slot });
  source.addEventListener('dragstart', event => {
    const transfer = (event as DragEvent).dataTransfer!;
    const image = doc.createElement('img'); image.src = '/item/501.png';
    if (options.dragImage ?? true) transfer.setDragImage(image, 12, 12);
    transfer.setData('Text', options.plain ?? JSON.stringify(win._OBJ_DRAG_ = payload));
    events.push({ type: 'dragstart', event, data: transfer.getData('Text'), target: event.target });
  });
  source.addEventListener('dragend', event => {
    events.push({ type: 'dragend', event, data: (event as DragEvent).dataTransfer!.getData('Text'), target: event.target });
    delete win._OBJ_DRAG_;
  });
  for (const type of ['dragenter', 'dragleave', 'dragover', 'drop']) {
    target.addEventListener(type, event => {
      const transfer = (event as DragEvent).dataTransfer!;
      events.push({ type, event, data: transfer.getData('Text'), target: event.target });
      if (type === 'dragover' && (options.accept ?? true)) event.preventDefault();
      if (type === 'drop') { event.preventDefault(); drops.push(options.plain !== undefined ? transfer.getData('Text') : JSON.parse(transfer.getData('Text'))); }
    });
  }
  const bridge = installLastroItemDrag({ document: doc, mouse, cursor, isEnabled: () => enabled });
  bridges.push(bridge);
  const dispatch = (element: EventTarget, type: string, x: number, y: number, button = 0, buttons = type === 'mouseup' ? 0 : 1) => {
    const event = new win.MouseEvent(type, { clientX: x, clientY: y, button, buttons, bubbles: true, composed: true, cancelable: true });
    element.dispatchEvent(event); return event;
  };
  const start = () => dispatch(icon, 'mousedown', 20, 30);
  const move = (x = 90, y = 100) => { hit = targetHost; return dispatch(slot, 'mousemove', x, y); };
  const release = (x = 90, y = 100) => dispatch(slot, 'mouseup', x, y);
  const key = (type: string, value = 'Escape') => {
    const event = new win.KeyboardEvent(type, { key: value, code: value, bubbles: true, composed: true, cancelable: true });
    doc.dispatchEvent(event); return event;
  };
  return { win, doc, source, sourceHost, sourceRoot, icon, target, targetHost, targetRoot, slot, mouse, cursor, events, drops, payload, bridge, dispatch, start, move, release, key,
    setHit: (element: Element | null) => { hit = element; }, setEnabled: (value: boolean) => { enabled = value; } };
}

describe('item dragging without the browser drag cursor', () => {
  it('runs native item handlers and delivers their unchanged payload to an accepted shadow slot', () => {
    const f = fixture(); f.start();
    expect(f.source.getAttribute('draggable')).toBe('false');
    f.move(); expect(f.bridge.active()).toBe(true); expect(f.win._OBJ_DRAG_).toEqual(f.payload);
    f.release();
    expect(f.drops).toEqual([f.payload]);
    const types = f.events.map(event => event.type);
    expect(types[0]).toBe('dragstart'); expect(types.at(-1)).toBe('dragend');
    expect(types.filter(type => type === 'drop')).toHaveLength(1);
    expect(types.indexOf('dragenter')).toBeLessThan(types.indexOf('dragover'));
    expect(types.indexOf('dragover')).toBeLessThan(types.indexOf('drop'));
    expect(f.events.every(event => event.data === JSON.stringify(f.payload))).toBe(true);
    expect(f.events.filter(event => ['dragenter', 'dragover', 'drop'].includes(event.type)).every(event => event.target === f.slot)).toBe(true);
    expect(f.events.every(event => event.event.composed)).toBe(true);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.bridge.active()).toBe(false);
    expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it.each(['item', 'skill'])('supports native %s payloads without a browser-owned drag operation', type => {
    const f = fixture({ type }); f.start(); f.move();
    const native = new f.win.MouseEvent('dragstart', { bubbles: true, composed: true, cancelable: true });
    expect(f.source.dispatchEvent(native)).toBe(false); expect(native.defaultPrevented).toBe(true);
    expect(f.events.filter(event => event.type === 'dragstart')).toHaveLength(1);
    f.release(); expect(f.drops).toEqual([f.payload]);
  });

  it('keeps the game cursor tracking movement and allows ordinary mousemove listeners to run', () => {
    const f = fixture(), seen = vi.fn(); f.win.addEventListener('mousemove', seen);
    f.start(); f.move(140, 170);
    expect(f.mouse.screen.x).toBe(140); expect(f.mouse.screen.y).toBe(170);
    expect(f.cursor.x).toBe(140); expect(f.cursor.y).toBe(170);
    expect(f.mouse.state).toBe(2); expect(seen).toHaveBeenCalledOnce(); f.release(140, 170);
  });

  it('keeps the drag image at the native hotspot without creating an interactive second pointer', () => {
    const f = fixture(); f.start(); f.move(90, 100);
    const ghost = f.doc.querySelector<HTMLElement>('[data-lastro-item-drag-image]')!;
    expect(ghost).not.toBeNull(); expect(ghost.style.left).toBe('78px'); expect(ghost.style.top).toBe('88px');
    expect(ghost.style.pointerEvents).toBe('none'); expect(ghost.style.cursor).toBe('none');
    expect(ghost.querySelector('img')!.src).toContain('/item/501.png');
    f.release(); expect(f.doc.querySelector('[data-lastro-item-drag-image]')).toBeNull();
  });

  it('keeps the visible child item art when a staged Refine item has no custom drag image', () => {
    const f = fixture({ plain: '', dragImage: false }); f.sourceHost.id = 'Refine';
    const probe = f.doc.createElement('div');
    Object.assign(probe.style, { backgroundImage: 'url("/item/501.png")', width: '24px', height: '24px', display: 'block' });
    f.doc.body.append(probe);
    const computed = f.win.getComputedStyle.bind(f.win);
    // jsdom has no Shadow DOM stylesheet cascade; emulate the icon's resolved shadow styles.
    vi.spyOn(f.win, 'getComputedStyle').mockImplementation(element => computed(element === f.icon ? probe : element));
    expect(f.icon.style.backgroundImage).toBe('');
    f.start(); f.move();
    const child = f.doc.querySelector<HTMLElement>('[data-lastro-item-drag-image] .icon')!;
    expect(child.style.backgroundImage).toContain('/item/501.png');
    expect(child.style.width).toBe('24px'); expect(child.style.height).toBe('24px');
    expect(child.style.display).toBe('block');
    f.bridge.cancel(); expect(f.doc.querySelector('[data-lastro-item-drag-image]')).toBeNull();
  });

  it.each([{ mode: 2, restored: 7 }, { mode: 0, restored: 0 }])('restores the appropriate cursor for mouse mode $mode after dropping', ({ mode, restored }) => {
    const f = fixture(), setType = vi.fn();
    const cursor = Object.assign(f.cursor, { ACTION: { DEFAULT: 0 }, getActualType: () => 7, setType, freeze: false, blockMagnetism: false });
    f.mouse.state = mode; f.start(); f.move(); expect(setType).toHaveBeenLastCalledWith(0);
    f.release(); expect(setType).toHaveBeenLastCalledWith(restored);
    expect(f.mouse.state).toBe(mode);
    expect(cursor.freeze).toBe(false); expect(cursor.blockMagnetism).toBe(false);
  });

  it('tracks game page coordinates while the fixed cursor and item image use viewport coordinates', () => {
    const f = fixture(), pointer = f.doc.createElement('div'); pointer.className = 'cursor'; f.doc.body.append(pointer);
    Object.defineProperties(f.win, { scrollX: { configurable: true, value: 11 }, scrollY: { configurable: true, value: 17 } });
    f.start(); f.move(90, 100);
    expect(f.mouse.screen.x).toBe(101); expect(f.mouse.screen.y).toBe(117);
    expect(f.cursor.x).toBe(101); expect(f.cursor.y).toBe(117);
    expect(pointer.style.left).toBe('90px'); expect(pointer.style.top).toBe('100px'); f.release();
  });

  it('does not drop onto a target that has not accepted dragover', () => {
    const f = fixture({ accept: false }); f.start(); f.move(); f.release();
    expect(f.drops).toEqual([]); expect(f.events.filter(event => event.type === 'drop')).toHaveLength(0);
    expect(f.events.filter(event => event.type === 'dragend')).toHaveLength(1);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('retains native NPC shop items whose payload does not include a nested data field', () => {
    const f = fixture(); f.payload.from = 'NpcStore'; delete f.payload.data;
    f.start(); f.move(); f.release(); expect(f.drops).toEqual([f.payload]);
  });

  it('hits the deepest nested shadow element while retaining composed drop delivery', () => {
    const f = fixture(), nested = f.doc.createElement('div'); f.slot.append(nested);
    const nestedRoot = nested.attachShadow({ mode: 'open' }), nestedSlot = f.doc.createElement('span'); nestedRoot.append(nestedSlot);
    Object.defineProperty(f.targetRoot, 'elementFromPoint', { configurable: true, value: () => nested });
    Object.defineProperty(nestedRoot, 'elementFromPoint', { configurable: true, value: () => nestedSlot });
    const received = vi.fn(); let path: EventTarget[] = [];
    nestedSlot.addEventListener('drop', event => { path = event.composedPath(); received(event.target); });
    f.start(); f.move(); f.release();
    expect(received).toHaveBeenCalledOnce(); expect(f.drops).toEqual([f.payload]);
    expect(received).toHaveBeenCalledWith(nestedSlot);
    expect(path).toContain(nestedSlot); expect(path).toContain(f.targetHost); expect(path).toContain(f.doc);
  });

  it('retains native equipment targets that accept by stopping dragover propagation', () => {
    const f = fixture({ accept: false });
    f.slot.addEventListener('dragover', event => event.stopImmediatePropagation());
    const received = vi.fn(); f.slot.addEventListener('drop', received);
    f.start(); f.move(); f.release();
    expect(received).toHaveBeenCalledOnce(); expect(f.drops).toEqual([f.payload]);
  });

  it('accepts native dragstart listeners that stop propagation after setting the item payload', () => {
    const f = fixture(); f.source.addEventListener('dragstart', event => event.stopImmediatePropagation());
    f.start(); f.move(); expect(f.bridge.active()).toBe(true); f.release(); expect(f.drops).toEqual([f.payload]);
  });

  it('recognizes draggable items inside an unnamed nested custom element of the game UI', () => {
    const f = fixture(), nested = f.doc.createElement('ui-image'); f.sourceRoot.append(nested);
    const inner = nested.attachShadow({ mode: 'open' }); inner.append(f.source);
    f.start(); f.move(); expect(f.bridge.active()).toBe(true); f.release(); expect(f.drops).toEqual([f.payload]);
  });

  it('transitions hover events between targets and drops only on the final accepted target', () => {
    const f = fixture(), secondHost = f.doc.createElement('div'); secondHost.id = 'Cart'; f.doc.body.append(secondHost);
    const secondRoot = secondHost.attachShadow({ mode: 'open' }), second = f.doc.createElement('div'); secondRoot.append(second);
    Object.defineProperty(secondRoot, 'elementFromPoint', { configurable: true, value: () => second });
    const order: string[] = [];
    f.target.addEventListener('dragleave', () => order.push('leave'));
    second.addEventListener('dragenter', () => order.push('enter'));
    second.addEventListener('dragover', event => event.preventDefault());
    const secondDrop = vi.fn(); second.addEventListener('drop', secondDrop);
    f.start(); f.move(); f.setHit(secondHost); f.dispatch(second, 'mousemove', 190, 200); f.dispatch(second, 'mouseup', 190, 200);
    expect(order).toContain('leave'); expect(order).toContain('enter');
    expect(f.drops).toEqual([]); expect(secondDrop).toHaveBeenCalledOnce();
  });

  it('rechecks acceptance at mouse release instead of dropping on the last hovered slot', () => {
    const f = fixture(); f.start(); f.move(); f.setHit(f.doc.body); f.release();
    expect(f.drops).toEqual([]); expect(f.events.some(event => event.type === 'dragleave')).toBe(true);
    expect(f.bridge.active()).toBe(false);
  });

  it('retains game canvas drops with the same item payload', () => {
    const f = fixture(), canvas = f.doc.createElement('canvas'); f.doc.body.append(canvas);
    const received: unknown[] = [];
    canvas.addEventListener('dragover', event => event.preventDefault());
    canvas.addEventListener('drop', event => received.push(JSON.parse((event as DragEvent).dataTransfer!.getData('Text'))));
    f.start(); f.setHit(canvas); f.dispatch(canvas, 'mousemove', 180, 200); f.dispatch(canvas, 'mouseup', 180, 200);
    expect(received).toEqual([f.payload]); expect(f.drops).toEqual([]);
  });

  it('preserves an ordinary click when movement stays below the drag threshold', () => {
    const f = fixture(), clicked = vi.fn(); f.source.addEventListener('click', clicked);
    f.start(); f.dispatch(f.icon, 'mousemove', 22, 33); f.dispatch(f.icon, 'mouseup', 22, 33);
    const click = f.dispatch(f.icon, 'click', 22, 33);
    expect(f.events).toEqual([]); expect(f.bridge.active()).toBe(false);
    expect(click.defaultPrevented).toBe(false); expect(clicked).toHaveBeenCalledOnce(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('starts at a five pixel movement and consumes the click generated after dropping', () => {
    const f = fixture(), clicked = vi.fn(); f.doc.addEventListener('click', clicked);
    f.start(); f.move(23, 34); expect(f.bridge.active()).toBe(true); f.release(23, 34);
    const click = f.dispatch(f.slot, 'click', 23, 34);
    expect(click.defaultPrevented).toBe(true); expect(clicked).not.toHaveBeenCalled();
    f.start(); f.dispatch(f.icon, 'mouseup', 20, 30); f.dispatch(f.icon, 'click', 20, 30);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it.each(['Escape', 'blur', 'hidden', 'cancel', 'destroy'])('cancels on %s without triggering a drop or leaving the source disabled', reason => {
    const f = fixture(), keyboard = vi.fn(); f.doc.addEventListener('keydown', keyboard);
    f.start(); f.move();
    if (reason === 'Escape') { const event = f.key('keydown'); expect(event.defaultPrevented).toBe(true); expect(keyboard).not.toHaveBeenCalled(); }
    if (reason === 'blur') f.win.dispatchEvent(new f.win.Event('blur'));
    if (reason === 'hidden') {
      Object.defineProperty(f.doc, 'hidden', { configurable: true, value: true });
      f.doc.dispatchEvent(new f.win.Event('visibilitychange'));
    }
    if (reason === 'cancel') f.bridge.cancel();
    if (reason === 'destroy') f.bridge.destroy();
    f.release(); expect(f.drops).toEqual([]); expect(f.bridge.active()).toBe(false);
    expect(f.events.filter(event => event.type === 'dragend')).toHaveLength(1);
    const dragend = f.events.find(event => event.type === 'dragend')!.event as MouseEvent;
    expect(dragend.clientX).toBe(20); expect(dragend.clientY).toBe(30);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('cancels a drag whose source UI is removed while the button remains held', async () => {
    const f = fixture(); f.start(); f.move(); f.sourceHost.remove();
    await new Promise(resolve => f.win.setTimeout(resolve, 0));
    expect(f.bridge.active()).toBe(false); expect(f.drops).toEqual([]);
    expect(f.events.filter(event => event.type === 'dragend')).toHaveLength(1);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('cleans up a pending candidate without synthesizing a dragend before dragstart', () => {
    const f = fixture(); f.start(); f.bridge.cancel(); f.move(); f.release();
    expect(f.events).toEqual([]); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('cancels safely if mousemove reveals that the button was released outside the window', () => {
    const f = fixture(); f.start(); f.move(); f.dispatch(f.slot, 'mousemove', 120, 130, 0, 0);
    expect(f.bridge.active()).toBe(false); expect(f.drops).toEqual([]);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('cancels an active custom drag if the game cursor mode is switched off', () => {
    const f = fixture(); f.start(); f.move(); f.setEnabled(false); f.move(120, 130); f.release(120, 130);
    expect(f.bridge.active()).toBe(false); expect(f.drops).toEqual([]);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('consumes the mouse release and click after Escape cancels a drag over the game canvas', () => {
    const f = fixture(), canvas = f.doc.createElement('canvas'), released = vi.fn(), clicked = vi.fn();
    f.doc.body.append(canvas); canvas.addEventListener('mouseup', released); canvas.addEventListener('click', clicked);
    f.start(); f.move(); f.key('keydown');
    const mouseup = f.dispatch(canvas, 'mouseup', 180, 200), click = f.dispatch(canvas, 'click', 180, 200);
    expect(mouseup.defaultPrevented).toBe(true); expect(click.defaultPrevented).toBe(true);
    expect(released).not.toHaveBeenCalled(); expect(clicked).not.toHaveBeenCalled(); expect(f.drops).toEqual([]);
    f.dispatch(canvas, 'mousedown', 180, 200); f.dispatch(canvas, 'mouseup', 180, 200); f.dispatch(canvas, 'click', 180, 200);
    expect(released).toHaveBeenCalledOnce(); expect(clicked).toHaveBeenCalledOnce();
  });

  it('leaves normal browser dragging untouched when the custom game cursor is disabled', () => {
    const f = fixture({ enabled: false }); f.start(); f.move(); f.release();
    expect(f.events).toEqual([]); expect(f.source.getAttribute('draggable')).toBe('true');
    const native = new f.win.Event('dragstart', { bubbles: true, composed: true, cancelable: true });
    Object.defineProperty(native, 'dataTransfer', { value: { setDragImage: vi.fn(), setData: vi.fn(), getData: () => '' } });
    expect(f.source.dispatchEvent(native)).toBe(true); expect(native.defaultPrevented).toBe(false);
  });

  it('keeps Intro file handling and unrelated browser drag sources outside game dragging', () => {
    const f = fixture(); f.sourceHost.id = 'Intro'; f.start(); f.move(); f.release();
    expect(f.events).toEqual([]); expect(f.source.getAttribute('draggable')).toBe('true');
    const unrelated = f.doc.createElement('div'); unrelated.setAttribute('draggable', 'true'); f.doc.body.append(unrelated);
    f.dispatch(unrelated, 'mousedown', 20, 30); f.dispatch(unrelated, 'mousemove', 90, 100);
    expect(unrelated.getAttribute('draggable')).toBe('true'); expect(f.bridge.active()).toBe(false);
    const native = new f.win.Event('dragstart', { bubbles: true, composed: true, cancelable: true });
    expect(unrelated.dispatchEvent(native)).toBe(true); expect(native.defaultPrevented).toBe(false);
  });

  it('does not hijack right clicks, implicit image dragging, or disabled item drag sources', () => {
    const f = fixture(); f.dispatch(f.icon, 'mousedown', 20, 30, 2, 2); f.move(); f.release(); expect(f.events).toEqual([]);
    f.source.setAttribute('draggable', 'false'); f.start(); f.move(); f.release(); expect(f.events).toEqual([]);
    const image = f.doc.createElement('img'); image.src = '/item/501.png'; f.doc.body.append(image);
    const native = new f.win.Event('dragstart', { bubbles: true, cancelable: true });
    expect(image.dispatchEvent(native)).toBe(true); expect(native.defaultPrevented).toBe(false);
    expect(f.bridge.active()).toBe(false);
  });

  it('honors a native dragstart handler that rejects the operation', () => {
    const f = fixture(); f.source.addEventListener('dragstart', event => event.preventDefault());
    f.start(); f.move(); f.release(); expect(f.drops).toEqual([]); expect(f.bridge.active()).toBe(false);
    expect(f.source.getAttribute('draggable')).toBe('true'); expect(f.win._OBJ_DRAG_).toBeUndefined();
  });

  it('clears native dragstart side effects when its payload is not a supported game item', () => {
    const f = fixture();
    f.source.addEventListener('dragstart', event => (event as DragEvent).dataTransfer!.setData('Text', '{invalid-json'));
    f.start(); f.move(); f.release();
    expect(f.bridge.active()).toBe(false); expect(f.drops).toEqual([]);
    expect(f.events.filter(event => event.type === 'dragend')).toHaveLength(1);
    expect(f.win._OBJ_DRAG_).toBeUndefined(); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it.each(['Refine', 'EnchantGrade'])('retains plain staged item ids used by %s and cancels at the original position', id => {
    const f = fixture({ plain: 'staged-item-7' }); f.sourceHost.id = id;
    f.start(); f.move(); expect(f.bridge.active()).toBe(true); f.bridge.cancel();
    expect(f.drops).toEqual([]);
    const dragend = f.events.find(event => event.type === 'dragend')!;
    expect(dragend.data).toBe('staged-item-7'); expect((dragend.event as MouseEvent).clientX).toBe(20);
    expect((dragend.event as MouseEvent).clientY).toBe(30);
    f.start(); f.move(); f.release(); expect(f.drops).toEqual(['staged-item-7']);
  });

  it('retains native staged Refine items whose draggable element has an empty id', () => {
    const f = fixture({ plain: '' }); f.sourceHost.id = 'Refine';
    f.start(); f.move(); expect(f.bridge.active()).toBe(true); f.bridge.cancel();
    expect(f.events.filter(event => event.type === 'dragend')).toHaveLength(1);
    expect(f.drops).toEqual([]); expect(f.source.getAttribute('draggable')).toBe('true');
  });

  it('restores normal mouse input after destroy removes all bridge handlers', () => {
    const f = fixture(), clicked = vi.fn(); f.bridge.destroy(); f.doc.addEventListener('click', clicked);
    f.start(); f.move(); f.release(); f.dispatch(f.slot, 'click', 90, 100);
    expect(f.events).toEqual([]); expect(clicked).toHaveBeenCalledOnce();
    expect(f.source.getAttribute('draggable')).toBe('true');
  });
});
