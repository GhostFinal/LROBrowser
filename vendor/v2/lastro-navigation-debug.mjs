export const NAVI_DEBUG_BUILD = "20260924-v2-navigation-log-2";

// Keep diagnostics out of gameplay state. Capture strings immediately so DevTools
// cannot display a later, mutated version of a position or target.
export function createNavigationDebug({ snapshot = () => ({}), output = console.info,
  now = Date.now, capacity = 1000, schedule = setInterval, cancel = clearInterval } = {}) {
  const entries = [];
  const last = new Map();
  let active = false;
  let session = 0;
  let timer = null;
  let startedAt = 0;
  const api = {
    get active() { return active; },
    log(event, details = {}, throttleMs = 0) {
      if (!active) return;
      try {
        const tick = now();
        if (throttleMs && last.has(event) && tick - last.get(event) < throttleMs) return;
        last.set(event, tick);
        const line = "[NAVI] " + JSON.stringify({ time: new Date(tick).toISOString(), session,
          event, data: typeof details === "function" ? details() : details });
        entries.push(line);
        if (entries.length > capacity) entries.splice(0, entries.length - capacity);
        output(line);
      } catch { /* Logging must never interrupt movement or packet handling. */ }
    },
    begin(source, details = {}) {
      try {
        active = true;
        session++;
        startedAt = now();
        last.clear();
        api.log("begin", { build: NAVI_DEBUG_BUILD, source, ...details });
        api.log("snapshot", snapshot);
        if (timer === null) timer = schedule(() => {
          api.log("watchdog", snapshot);
          if (now() - startedAt >= 120000) api.stop("two-minute-limit");
        }, 3000);
      } catch { /* Diagnostics are optional. */ }
    },
    stop(reason = "manual") {
      api.log("stop", { reason });
      active = false;
      if (timer !== null) cancel(timer);
      timer = null;
    },
    dump() { return [`[NAVI] build=${NAVI_DEBUG_BUILD}`, ...entries].join("\n"); }
  };
  return api;
}

export function installNavigationDebug(snapshot) {
  const api = createNavigationDebug({ snapshot });
  globalThis.roNaviDebug = api;
  globalThis.addEventListener("error", (event) => api.log("javascript-error", {
    message: event.message, line: event.lineno, column: event.colno,
    stack: String(event.error?.stack || "").slice(0, 2000)
  }));
  globalThis.addEventListener("unhandledrejection", (event) => api.log("unhandled-rejection", {
    message: String(event.reason?.message || event.reason),
    stack: String(event.reason?.stack || "").slice(0, 2000)
  }));
  console.info(`[NAVI] diagnostics ready: ${NAVI_DEBUG_BUILD}; export: copy(roNaviDebug.dump())`);
  return api;
}
