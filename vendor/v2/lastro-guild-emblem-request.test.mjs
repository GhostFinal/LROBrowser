import assert from "node:assert/strict";
import test from "node:test";

import * as guildEmblemRequest from "./lastro-guild-emblem-request.mjs";

const { GuildEmblemPacketLoader, GuildEmblemRequestQueue, loadGuildEmblemForPacketVersion } = guildEmblemRequest;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("loads guild emblems through packets for every LastRO packet version", async () => {
  const calls = [];
  const loadLegacyPacket = (guildId, version) => {
    calls.push(["packet", guildId, version]);
    return Promise.resolve("packet-result");
  };

  assert.equal(await loadGuildEmblemForPacketVersion(20211103, 7, 3, { loadLegacyPacket }), "packet-result");
  assert.equal(await loadGuildEmblemForPacketVersion(20170314, 7, 3, { loadLegacyPacket }), "packet-result");
  assert.deepEqual(calls, [
    ["packet", 7, 3],
    ["packet", 7, 3]
  ]);
});

test("schedules packet-loader timers without assigning the loader as the timer receiver", async () => {
  let timeoutReceiver;
  let clearReceiver;
  const loader = new GuildEmblemPacketLoader(
    () => {},
    {
      setTimeoutFn: function setTimeoutFn() {
        timeoutReceiver = this;
        return 1;
      },
      clearTimeoutFn: function clearTimeoutFn() {
        clearReceiver = this;
      }
    }
  );

  const result = loader.load(7, 3);
  assert.equal(timeoutReceiver, undefined);
  assert.equal(loader.complete(7, 3, { image: { id: "emblem-7" }, gif: null }), true);
  assert.equal(clearReceiver, undefined);
  await result;
});

test("schedules retry timers without assigning the queue as the timer receiver", () => {
  let timeoutReceiver;
  const queue = new GuildEmblemRequestQueue(
    () => Promise.resolve(),
    {
      setTimeoutFn: function setTimeoutFn() {
        timeoutReceiver = this;
        return 1;
      }
    }
  );
  const entry = queue.get(7);
  entry.requestedVersion = 3;

  queue.fail(entry, 3, new Error("upstream unavailable"));

  assert.equal(timeoutReceiver, undefined);
});

test("refreshes the local guild window for an accepted emblem packet while its request is pending", () => {
  const refreshed = [];
  const appliedToEntities = [];
  const image = { id: "emblem-7" };

  assert.equal(typeof guildEmblemRequest.applyAcceptedGuildEmblem, "function");
  guildEmblemRequest.applyAcceptedGuildEmblem({
    accepted: true,
    wasPending: true,
    guildId: 7,
    localGuildId: 7,
    image,
    gif: null,
    refreshLocalGuild: (nextImage) => refreshed.push(nextImage),
    applyToEntities: (...args) => appliedToEntities.push(args)
  });

  assert.deepEqual(refreshed, [image]);
  assert.deepEqual(appliedToEntities, []);
});

test("applies an accepted unsolicited local-guild emblem packet to both the window and entities", () => {
  const refreshed = [];
  const appliedToEntities = [];
  const image = { id: "emblem-7" };
  const gif = { id: "emblem-7-animation" };

  guildEmblemRequest.applyAcceptedGuildEmblem({
    accepted: true,
    wasPending: false,
    guildId: 7,
    localGuildId: 7,
    image,
    gif,
    refreshLocalGuild: (nextImage) => refreshed.push(nextImage),
    applyToEntities: (...args) => appliedToEntities.push(args)
  });

  assert.deepEqual(refreshed, [image]);
  assert.deepEqual(appliedToEntities, [[7, image, gif]]);
});

test("packet loader ignores an older emblem response before resolving the requested version", async () => {
  const requestedGuilds = [];
  const loader = new GuildEmblemPacketLoader((guildId) => requestedGuilds.push(guildId));
  const result = loader.load(7, 9);

  assert.deepEqual(requestedGuilds, [7]);
  assert.equal(loader.complete(7, 8, { image: { id: "stale" }, gif: null }), false);

  const expected = { image: { id: "emblem-9" }, gif: null };
  assert.equal(loader.complete(7, 9, expected), true);
  assert.deepEqual(await result, expected);
});

test("packet loader rejects a request with no response after its timeout", async () => {
  const timers = [];
  const loader = new GuildEmblemPacketLoader(
    () => {},
    {
      timeoutMs: 500,
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      }
    }
  );

  const result = loader.load(7, 9);
  assert.deepEqual(timers.map(({ delay }) => delay), [500]);

  timers.shift().callback();
  await assert.rejects(result, /Guild emblem packet 7 version 9 timed out/);
});

test("packet loader sends a new request after a timed-out request", async () => {
  const timers = [];
  const requestedGuilds = [];
  const loader = new GuildEmblemPacketLoader(
    (guildId) => requestedGuilds.push(guildId),
    {
      timeoutMs: 500,
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      }
    }
  );

  const first = loader.load(7, 9);
  timers.shift().callback();
  await assert.rejects(first, /Guild emblem packet 7 version 9 timed out/);

  const second = loader.load(7, 9);
  const expected = { image: { id: "emblem-9" }, gif: null };
  assert.deepEqual(requestedGuilds, [7, 7]);
  assert.equal(loader.complete(7, 9, expected), true);
  assert.deepEqual(await second, expected);
});

test("packet loader reuses an unsolicited current emblem response", async () => {
  const requestedGuilds = [];
  const loader = new GuildEmblemPacketLoader((guildId) => requestedGuilds.push(guildId));
  const expected = { image: { id: "emblem-9" }, gif: null };

  assert.equal(loader.complete(7, 9, expected), true);
  assert.deepEqual(await loader.load(7, 9), expected);
  assert.deepEqual(requestedGuilds, []);
});

test("coalesces concurrent requests for the same guild emblem version", async () => {
  const download = deferred();
  const calls = [];
  const results = [];
  const queue = new GuildEmblemRequestQueue((guildId, version) => {
    calls.push([guildId, version]);
    return download.promise;
  });

  queue.request(42, 9, (image, gif) => results.push(["first", image.id, gif]));
  queue.request(42, 9, (image, gif) => results.push(["second", image.id, gif]));

  assert.deepEqual(calls, [[42, 9]]);

  download.resolve({ image: { id: "emblem-42" }, gif: null });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(results, [
    ["first", "emblem-42", null],
    ["second", "emblem-42", null]
  ]);
  assert.equal(queue.get(42).version, 9);
});

test("limits failed emblem downloads before allowing another request burst", async () => {
  const timers = [];
  const calls = [];
  const failures = [];
  let now = 0;
  const queue = new GuildEmblemRequestQueue(
    (guildId, version) => {
      calls.push([guildId, version]);
      return Promise.reject(new Error("upstream unavailable"));
    },
    {
      maxRetries: 2,
      retryDelayMs: 100,
      cooldownMs: 1_000,
      now: () => now,
      onFailure: (guildId, version, error) => failures.push([guildId, version, error.message]),
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      }
    }
  );

  queue.request(7, 3);
  await flushPromises();
  assert.deepEqual(calls, [[7, 3]]);
  assert.deepEqual(timers.map(({ delay }) => delay), [100]);

  timers.shift().callback();
  await flushPromises();
  assert.deepEqual(calls, [[7, 3], [7, 3]]);
  assert.deepEqual(timers.map(({ delay }) => delay), [200]);

  timers.shift().callback();
  await flushPromises();
  assert.deepEqual(calls, [[7, 3], [7, 3], [7, 3]]);
  assert.equal(timers.length, 0);
  assert.deepEqual(failures, [[7, 3, "upstream unavailable"]]);

  queue.request(7, 3);
  assert.equal(calls.length, 3);

  now = 1_000;
  queue.request(7, 3);
  assert.equal(calls.length, 4);
});

test("retries a new emblem version requested during cooldown", async () => {
  const timers = [];
  const calls = [];
  const results = [];
  let now = 0;
  const queue = new GuildEmblemRequestQueue(
    (guildId, version) => {
      calls.push([guildId, version]);
      if (version === 3) return Promise.reject(new Error("old emblem unavailable"));
      return Promise.resolve({ image: { id: "emblem-4" }, gif: null });
    },
    {
      maxRetries: 0,
      cooldownMs: 1_000,
      now: () => now,
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      }
    }
  );

  queue.request(7, 3);
  await flushPromises();
  assert.deepEqual(calls, [[7, 3]]);

  queue.request(7, 4, (image) => results.push(image.id));
  assert.deepEqual(timers.map(({ delay }) => delay), [1_000]);

  now = 1_000;
  timers.shift().callback();
  await flushPromises();

  assert.deepEqual(calls, [[7, 3], [7, 4]]);
  assert.deepEqual(results, ["emblem-4"]);
});

test("continues with a newer emblem version after an older in-flight request fails", async () => {
  const oldDownload = deferred();
  const calls = [];
  const results = [];
  const queue = new GuildEmblemRequestQueue(
    (guildId, version) => {
      calls.push([guildId, version]);
      if (version === 3) return oldDownload.promise;
      return Promise.resolve({ image: { id: "emblem-4" }, gif: null });
    },
    { maxRetries: 0 }
  );

  queue.request(7, 3);
  queue.request(7, 4, (image) => results.push(image.id));
  assert.deepEqual(calls, [[7, 3]]);

  oldDownload.reject(new Error("old emblem unavailable"));
  await flushPromises();

  assert.deepEqual(calls, [[7, 3], [7, 4]]);
  assert.deepEqual(results, ["emblem-4"]);
});

test("does not repeat a download when a stale cooldown timer runs after success", async () => {
  const timers = [];
  const calls = [];
  let now = 0;
  const queue = new GuildEmblemRequestQueue(
    (guildId, version) => {
      calls.push([guildId, version]);
      if (version === 3) return Promise.reject(new Error("old emblem unavailable"));
      return Promise.resolve({ image: { id: "emblem-4" }, gif: null });
    },
    {
      maxRetries: 0,
      cooldownMs: 1_000,
      now: () => now,
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      }
    }
  );

  queue.request(7, 3);
  await flushPromises();
  queue.request(7, 4);
  assert.equal(timers.length, 1);

  now = 1_000;
  queue.request(7, 4);
  await flushPromises();
  assert.deepEqual(calls, [[7, 3], [7, 4]]);

  timers.shift().callback();
  await flushPromises();
  assert.deepEqual(calls, [[7, 3], [7, 4]]);
});
