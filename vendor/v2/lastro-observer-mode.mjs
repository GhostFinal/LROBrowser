/**
 * legacy transport observer mode keeps the browser client alive when a mirrored stream
 * contains a packet that this client cannot decode safely.
 */
export function isObserverMode(configs) {
  return Boolean(configs && typeof configs.get === "function" && configs.get("observerMode", false) === true);
}

export function runObserverPacketHandler(handler, { observerMode = false, onError } = {}) {
  try {
    handler();
    return true;
  } catch (error) {
    if (!observerMode) throw error;
    if (typeof onError === "function") onError(error);
    return false;
  }
}
