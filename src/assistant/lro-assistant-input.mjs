const INPUT = /^(?:pointer(?:down|up|move|cancel)|mouse(?:down|up|move)|click|dblclick|contextmenu|touch(?:start|move|end|cancel)|wheel|key(?:down|up|press))$/;
const decisions = new WeakMap();
const states = new WeakMap();
const listeners = new WeakMap();

function isAssistant(node) {
  return Boolean(node?.dataset?.lroAssistantRoot === 'true'
    || node?.id === 'ro-market-assistant' || node?.id === 'ro-dps-meter' || node?.id === 'ro-target-window');
}

export function installAssistantInputTracking(win) {
  if (states.has(win)) return;
  const state = { dragging: false, trailing: false };
  states.set(win, state);
  const track = event => {
    const inside = (event.composedPath?.() ?? []).some(isAssistant);
    const down = /^(pointerdown|mousedown|touchstart)$/.test(event.type);
    if (down) { state.dragging = inside; state.trailing = false; }
    const key = event.type.startsWith('key');
    const focused = key && isAssistant(win.document.activeElement);
    const continuation = /^(pointermove|mousemove|touchmove|pointerup|mouseup|touchend|pointercancel|touchcancel)$/.test(event.type);
    const trailing = /^(click|dblclick|contextmenu)$/.test(event.type);
    const release = /^(pointerup|mouseup|touchend|pointercancel|touchcancel)$/.test(event.type);
    decisions.set(event, inside || focused || continuation && state.dragging || (trailing || release) && state.trailing);
    if (/^(pointerup|mouseup|touchend|pointercancel|touchcancel)$/.test(event.type)) {
      if (state.dragging) state.trailing = true;
      // pointerdown.preventDefault() can suppress compatibility mouse events.
      // End dragging on pointerup itself; only block release/click tails.
      state.dragging = false;
    }
  };
  for (const type of ['pointerdown','pointerup','pointermove','pointercancel','mousedown','mouseup','mousemove',
    'click','dblclick','contextmenu','touchstart','touchmove','touchend','touchcancel','wheel','keydown','keyup','keypress']) {
    win.addEventListener(type, track, { capture: true, passive: true });
  }
  win.addEventListener('blur', () => { state.dragging = false; state.trailing = false; });
}

export function isAssistantInput(event) {
  if (!INPUT.test(event?.type ?? '')) return false;
  return decisions.get(event) ?? (event.composedPath?.() ?? []).some(isAssistant);
}

function wrappedListener(listener) {
  if (!listener || typeof listener !== 'function' && typeof listener !== 'object') return listener;
  let wrapped = listeners.get(listener);
  if (!wrapped) {
    wrapped = function (event, ...args) {
      // Native controls inside an assistant GUIComponent still need their own
      // focus/button handlers. Only gameplay/global bindings are isolated.
      const owner = this?.host ?? this?.getRootNode?.()?.host ?? this;
      if (isAssistantInput(event) && !isAssistant(owner)) return;
      return typeof listener === 'function' ? listener.call(this, event, ...args) : listener.handleEvent(event);
    };
    listeners.set(listener, wrapped);
  }
  return wrapped;
}

// Applied only to native runtime bindings by the build patch. Assistant handlers
// are not wrapped, so inputs/buttons/drag release still receive their events.
export function addAssistantAwareListener(target, type, listener, ...options) {
  return target.addEventListener(type, INPUT.test(String(type)) ? wrappedListener(listener) : listener, ...options);
}
export function removeAssistantAwareListener(target, type, listener, ...options) {
  return target.removeEventListener(type, INPUT.test(String(type)) ? (listeners.get(listener) ?? listener) : listener, ...options);
}
export function guardAssistantInputHandler(listener) { return wrappedListener(listener); }

// Share the native GUI cursor behavior inside the assistant's shadow roots.
// The root is created synchronously just after this binding is scheduled.
export function bindAssistantNativeCursor(host, page, GUIComponent) {
  page.queueMicrotask(() => {
    const root = host.shadowRoot;
    const setup = GUIComponent?.prototype?._setupShadowCursorEvents;
    if (!root || typeof setup !== 'function') return;
    setup.call({ _container: root });
    const style = page.document.createElement('style');
    style.textContent = ':host-context(.custom-cursor),:host-context(.custom-cursor) *{cursor:none!important}';
    root.append(style);
  });
}
