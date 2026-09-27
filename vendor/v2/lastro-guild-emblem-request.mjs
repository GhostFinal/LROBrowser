export function loadGuildEmblemForPacketVersion(_packetver, guildId, version, { loadLegacyPacket }) {
  return loadLegacyPacket(guildId, version);
}

export function applyAcceptedGuildEmblem({
  accepted,
  wasPending,
  guildId,
  localGuildId,
  image,
  gif,
  refreshLocalGuild,
  applyToEntities
}) {
  if (!accepted) return;
  if (guildId === localGuildId) refreshLocalGuild(image);
  if (!wasPending) applyToEntities(guildId, image, gif);
}

export class GuildEmblemPacketLoader {
  constructor(request, {
    timeoutMs = 5_000,
    setTimeoutFn = globalThis.setTimeout.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)
  } = {}) {
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.setTimeout = (...args) => setTimeoutFn(...args);
    this.clearTimeout = (...args) => clearTimeoutFn(...args);
    this.pending = new Map();
    this.cached = new Map();
  }

  load(guildId, version) {
    const cached = this.cached.get(guildId);
    if (cached && version <= cached.version) return Promise.resolve(cached.result);

    const existing = this.pending.get(guildId);
    if (existing) return existing.promise;

    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const entry = { version, promise, resolve, reject, timer: null };
    this.pending.set(guildId, entry);
    entry.timer = this.setTimeout(() => {
      if (this.pending.get(guildId) !== entry) return;
      this.pending.delete(guildId);
      reject(new Error(`Guild emblem packet ${guildId} version ${version} timed out`));
    }, this.timeoutMs);

    try {
      this.request(guildId);
    } catch (error) {
      this.pending.delete(guildId);
      this.clearTimeout(entry.timer);
      reject(error);
    }
    return promise;
  }

  complete(guildId, version, result) {
    const cached = this.cached.get(guildId);
    if (cached && version < cached.version) return false;
    const entry = this.pending.get(guildId);
    if (entry && version < entry.version) return false;

    this.cached.set(guildId, { version, result });
    if (!entry) return true;
    this.pending.delete(guildId);
    this.clearTimeout(entry.timer);
    entry.resolve(result);
    return true;
  }
}

export class GuildEmblemRequestQueue {
  constructor(load, {
    maxRetries = 2,
    retryDelayMs = 750,
    cooldownMs = 15_000,
    now = () => Date.now(),
    onFailure = () => {},
    onSuccess = () => {},
    setTimeoutFn = globalThis.setTimeout.bind(globalThis)
  } = {}) {
    this.load = load;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.onFailure = onFailure;
    this.onSuccess = onSuccess;
    this.setTimeout = (...args) => setTimeoutFn(...args);
    this.entries = new Map();
  }

  get(guildId) {
    let entry = this.entries.get(guildId);
    if (!entry) {
      entry = {
        guildId,
        version: -1,
        image: null,
        gif: null,
        requestedVersion: -1,
        pending: false,
        retries: 0,
        retryTimer: null,
        blockedUntil: 0,
        cooldownTimer: null,
        resumeAfterCooldown: false,
        callbacks: []
      };
      this.entries.set(guildId, entry);
    }
    return entry;
  }

  request(guildId, version, callback) {
    const entry = this.get(guildId);
    if (version <= entry.version) {
      if (typeof callback === "function") callback(entry.image, entry.gif);
      return entry;
    }

    entry.requestedVersion = Math.max(entry.requestedVersion, version);
    if (typeof callback === "function") entry.callbacks.push({ version, callback });
    if (entry.blockedUntil > this.now()) {
      entry.resumeAfterCooldown = true;
      this.scheduleCooldownResume(entry);
      return entry;
    }
    this.start(entry);
    return entry;
  }

  scheduleCooldownResume(entry) {
    if (entry.cooldownTimer) return;
    const delay = Math.max(0, entry.blockedUntil - this.now());
    entry.cooldownTimer = this.setTimeout(() => {
      entry.cooldownTimer = null;
      if (entry.blockedUntil > this.now()) {
        this.scheduleCooldownResume(entry);
        return;
      }
      if (!entry.resumeAfterCooldown) return;
      entry.resumeAfterCooldown = false;
      entry.blockedUntil = 0;
      this.start(entry);
    }, delay);
  }

  start(entry) {
    if (entry.requestedVersion <= entry.version || entry.pending || entry.retryTimer || entry.blockedUntil > this.now()) return;

    const version = entry.requestedVersion;
    entry.pending = true;
    let download;
    try {
      download = this.load(entry.guildId, version);
    } catch (error) {
      this.fail(entry, version, error);
      return;
    }

    Promise.resolve(download).then((result) => {
      entry.pending = false;
      entry.retries = 0;
      entry.blockedUntil = 0;
      entry.resumeAfterCooldown = false;
      entry.version = version;
      entry.image = result.image;
      entry.gif = result.gif || null;
      this.onSuccess(entry.guildId, entry.image, entry.gif);

      const callbacks = entry.callbacks;
      entry.callbacks = [];
      for (const queued of callbacks) {
        if (queued.version <= entry.version) queued.callback(entry.image, entry.gif);
        else entry.callbacks.push(queued);
      }

      if (entry.requestedVersion > entry.version) this.start(entry);
    }, (error) => this.fail(entry, version, error));
  }

  fail(entry, version, error) {
    entry.pending = false;
    if (entry.requestedVersion > version) {
      entry.retries = 0;
      this.start(entry);
      return;
    }
    if (entry.retries < this.maxRetries) {
      entry.retries++;
      const delay = this.retryDelayMs * 2 ** (entry.retries - 1);
      entry.retryTimer = this.setTimeout(() => {
        entry.retryTimer = null;
        this.start(entry);
      }, delay);
      return;
    }

    entry.retries = 0;
    entry.blockedUntil = this.now() + this.cooldownMs;
    entry.resumeAfterCooldown = false;
    entry.callbacks.length = 0;
    entry.requestedVersion = entry.version;
    this.onFailure(entry.guildId, version, error);
  }
}
