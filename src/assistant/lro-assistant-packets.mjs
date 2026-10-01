// A passive tap around decoded packets. Never replaces game callbacks or sends.
export function createAssistantPacketBus() {
  const listeners = new Set();
  return Object.freeze({
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener required');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(name, packet, phase) {
      for (const listener of listeners) {
        try { listener(name, packet, phase); } catch { /* Assistant observers cannot interrupt the game. */ }
      }
    },
  });
}
