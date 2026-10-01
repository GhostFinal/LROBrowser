function patchRegion(source, name, transform) {
  const marker = `//#region ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:frame-timing:' + name);
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
}

function replaceOne(source, anchor, replacement, name) {
  if (source.split(anchor).length !== 2) throw new Error('anchor:frame-timing:' + name);
  return source.replace(anchor, replacement);
}

export function patchRuntimeFrameTiming(source) {
  let output = patchRegion(source, 'src/Core/Events.js', region => {
    if (region.includes('LastROEventDueTick')) throw new Error('anchor:frame-timing:already-installed');
    region = replaceOne(region, 'var _events, _tick$1, _uid, Events;', `let lastroEventDueTick;
function LastROEventDueTick() { return lastroEventDueTick; }
var _events, _tick$1, _uid, Events;`, 'event-context');
    region = replaceOne(region, 'const tick = _tick$1 + delay;', 'const tick = Math.max(_tick$1, Date.now()) + (Number.isFinite(delay) ? Math.max(0, delay) : 0);', 'event-schedule');
    const oldProcess = `      let count = _events.length;
      while (count > 0) {
        if (_events[0].tick > tick) break;
        _events.shift().callback();
        count--;
      }
      _tick$1 = tick;`;
    return replaceOne(region, oldProcess, `      _tick$1 = tick;
      const cutoff = _uid;
      let processed = 0;
      while (_events.length && _events[0].tick <= tick && _events[0].uid < cutoff && processed < 256) {
        const event = _events.shift();
        const previousDueTick = lastroEventDueTick;
        lastroEventDueTick = event.tick;
        try { event.callback(); }
        catch (error) { console.error("[Events] callback failed", error); }
        finally { lastroEventDueTick = previousDueTick; }
        processed++;
      }`, 'event-process');
  });
  output = patchRegion(output, 'src/Renderer/Renderer.js', region => {
    region = replaceOne(region, 'var mat4$9, _requestAnimationFrame, _cancelAnimationFrame, Renderer;', `let lastroServerClockMark;
let lastroHasServerSample = false;
function LastROServerClockNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function LastROResetServerTick(tick) {
  SessionStorage_default.serverTick = tick;
  lastroHasServerSample = true;
  lastroServerClockMark = LastROServerClockNow();
}
function LastROInvalidateServerTick() {
  SessionStorage_default.serverTick = 0;
  lastroHasServerSample = false;
  lastroServerClockMark = undefined;
}
function LastROAdvanceServerTick() {
  const now = LastROServerClockNow();
  if (lastroHasServerSample && lastroServerClockMark !== undefined) SessionStorage_default.serverTick += Math.max(0, now - lastroServerClockMark);
  lastroServerClockMark = now;
  return SessionStorage_default.serverTick;
}
var mat4$9, _requestAnimationFrame, _cancelAnimationFrame, Renderer;`, 'server-clock');
    return replaceOne(region, 'SessionStorage_default.serverTick += newTick - this.tick;', 'LastROAdvanceServerTick();', 'render-clock');
  });
  return patchRegion(output, 'src/Engine/MapEngine.js', region => {
    region = replaceOne(region, `  SP.pongTime = SP.pingTime;
  SP.value = 0;
  SessionStorage_default.serverTick = pkt.time;`, `  SP.pongTime = Date.now();
  SP.value = Number.isFinite(SP.lastroSentAt) ? Math.max(0, SP.pongTime - SP.lastroSentAt) : 0;
  LastROResetServerTick(pkt.time);`, 'pong-clock');
    region = replaceOne(region, '                SP.pingTime = ping.clientTime;', '                SP.pingTime = ping.clientTime;\n                SP.lastroSentAt = Date.now();', 'ping-clock');
    region = replaceOne(region, 'function onConnectionAccepted$2(pkt) {', `function onConnectionAccepted$2(pkt) {
  if (Number.isInteger(pkt.startTime) && pkt.startTime >= 0 && pkt.startTime <= 0xffffffff) LastROResetServerTick(pkt.startTime);`, 'entry-clock-sample');
    region = replaceOne(region, `          if (!success) {
            UIManager.showErrorBox(DB.getMessage(1));
            return;
          }
          let pkt;`, `          if (!success) {
            UIManager.showErrorBox(DB.getMessage(1));
            return;
          }
          LastROInvalidateServerTick();
          let pkt;`, 'zone-clock-reset');
    return replaceOne(region, 'function cleanGameUI() {', 'function cleanGameUI() {\n  LastROInvalidateServerTick();', 'logout-clock-reset');
  });
}
