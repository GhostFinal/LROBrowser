const installations = new WeakMap<Window, () => void>();

function isDebugShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.isComposing || event.getModifierState('AltGraph') || !(event.ctrlKey || event.metaKey)) return false;
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : event.key.toUpperCase();
  return event.shiftKey ? ['I', 'J', 'C'].includes(key) : key === 'U';
}

/** Suppress page shortcuts in the game IWA; browser/extension privileges remain outside this boundary. */
export function installDebugAccessGuard(target: Window): () => void {
  if (target.location.protocol !== 'isolated-app:') return () => {};
  const installed = installations.get(target);
  if (installed) return installed;
  const onKeyDown = (event: KeyboardEvent) => {
    // F12 expands the game's skill bar; cancel the browser action while preserving game handlers.
    if (event.key === 'F12' || event.code === 'F12' || event.keyCode === 123) {
      event.preventDefault();
      return;
    }
    if (!isDebugShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // Game menus also use this event: preserve their handlers and all mouse button events.
  const onContextMenu = (event: MouseEvent) => { event.preventDefault(); };
  target.addEventListener('keydown', onKeyDown, { capture: true, passive: false });
  target.addEventListener('contextmenu', onContextMenu, { capture: true, passive: false });
  const dispose = () => {
    target.removeEventListener('keydown', onKeyDown, true);
    target.removeEventListener('contextmenu', onContextMenu, true);
    installations.delete(target);
  };
  installations.set(target, dispose);
  return dispose;
}
