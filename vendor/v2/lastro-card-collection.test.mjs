import assert from "node:assert/strict";
import test from "node:test";
import {
  listCardEntries,
  getCardDeckOverview,
  findCardDefinition,
  getCardLevelCount,
  applyCardConnectionUpdate,
  applyCardConnectionCancelUpdate,
  getCardConnectionRechargeListFrameLength,
  getCardConnectionRechargeListValueSize,
  getCardConnectionRechargeListFrameDisposition,
  isCardConnectionRechargeListCandidate,
  isCardConnectionRechargeListFrame
} from "./lastro-card-collection.mjs";

const cardData = {
  data: {
    0: { data: { 1: { cards: [0], recharge: [0] } } },
    1: { data: { 1: { cards: [4010], recharge: [0] } } },
    2: { data: { 1: { cards: [4020], recharge: [0] } } }
  }
};

test("resolves card names and searches every category", () => {
  const byName = listCardEntries(cardData, {
    tab: 0,
    pageSize: 8,
    search: "红色",
    searchAllTabs: true,
    itemNames: (id) => ({ 4010: "红色蝙蝠卡", 4020: "蓝色蝙蝠卡" }[id])
  });

  assert.deepEqual(byName.entries.map(({ id, tab, name }) => ({ id, tab, name })), [
    { id: 4010, tab: 1, name: "红色蝙蝠卡" }
  ]);

  const byId = listCardEntries(cardData, {
    tab: 0,
    pageSize: 8,
    search: "4020",
    searchAllTabs: true,
    itemNames: {}
  });
  assert.equal(byId.entries[0].tab, 2);
  assert.equal(byId.entries[0].id, 4020);
});

test("keeps the selected category when no search is entered", () => {
  const result = listCardEntries(cardData, { tab: 1, pageSize: 8, searchAllTabs: true });
  assert.deepEqual(result.entries.map((entry) => entry.id), [4010]);
});

test("recognizes a length-prefixed legacy-width card list with a modern packet version", () => {
  const classCount = 8;
  const levelCounts = [1, 10, 15, 23, 30, 30, 30, 26];
  const frameLength = 5 + levelCounts.reduce((total, levels) => total + 2 + levels * 17, 0);
  assert.equal(frameLength, 2826);

  const frame = new Uint8Array(frameLength);
  const view = new DataView(frame.buffer);
  view.setUint16(0, 2774, true);
  view.setUint16(2, frameLength, true);
  frame[4] = classCount;
  let cursor = 5;
  for (const levels of levelCounts) {
    frame[cursor++] = levels;
    frame[cursor++] = 0;
    for (let level = 0; level < levels; level++) {
      frame[cursor++] = 0;
      for (let slot = 0; slot < 8; slot++) {
        view.setUint16(cursor, slot === 0 && level === 0 ? 4040 : 0, true);
        cursor += 2;
      }
    }
  }

  assert.equal(cursor, frameLength);
  assert.equal(isCardConnectionRechargeListCandidate(frame.subarray(0, 5)), true);
  assert.equal(getCardConnectionRechargeListFrameLength(frame.subarray(0, 264)), frameLength);
  assert.equal(isCardConnectionRechargeListFrame(frame.subarray(0, 264), 0, 20211103), false);
  assert.equal(getCardConnectionRechargeListValueSize(frame, 0, 20211103), 2);
  assert.equal(isCardConnectionRechargeListFrame(frame, 0, 20211103), true);

  const modernFrame = new Uint8Array(40);
  const modernView = new DataView(modernFrame.buffer);
  modernView.setUint16(0, 2774, true);
  modernView.setUint16(2, modernFrame.length, true);
  modernFrame[4] = 1;
  modernFrame[5] = 1;
  modernFrame[6] = 0;
  assert.equal(getCardConnectionRechargeListValueSize(modernFrame, 0, 20211103), 4);
});

test("recognizes the captured 2826-byte four-byte card list layout", () => {
  const levelCounts = [1, 11, 16, 22, 7, 9, 7, 12];
  const frameLength = 5 + levelCounts.reduce((total, levels) => total + 2 + levels * 33, 0);
  assert.equal(frameLength, 2826);

  const frame = new Uint8Array(frameLength);
  const view = new DataView(frame.buffer);
  view.setUint16(0, 2774, true);
  view.setUint16(2, frameLength, true);
  frame[4] = levelCounts.length;
  let cursor = 5;
  for (const levels of levelCounts) {
    frame[cursor++] = levels;
    frame[cursor++] = 0;
    for (let level = 0; level < levels; level++) {
      frame[cursor++] = 0;
      for (let slot = 0; slot < 8; slot++) {
        view.setUint32(cursor, slot === 0 && level === 0 ? 4040 : 0, true);
        cursor += 4;
      }
    }
  }

  assert.equal(cursor, frameLength);
  assert.equal(isCardConnectionRechargeListCandidate(frame.subarray(0, 5)), true);
  assert.equal(getCardConnectionRechargeListValueSize(frame, 0, 20211103), 4);
  assert.equal(isCardConnectionRechargeListFrame(frame, 0, 20211103), true);
});

test("does not treat ordinary 0x0ad6 markers before inventory packets as card frames", () => {
  assert.equal(isCardConnectionRechargeListCandidate(new Uint8Array([0xd6, 0x0a, 0x09, 0x0b])), false);
  assert.equal(isCardConnectionRechargeListCandidate(new Uint8Array([0xd6, 0x0a, 0x39, 0x0b])), false);

  const markerAndNormalPacketHeader = new Uint8Array([0xd6, 0x0a, 0x09, 0x0b, 0x11, 0x05]);
  assert.equal(isCardConnectionRechargeListCandidate(markerAndNormalPacketHeader), false);
});

test("keeps a split genuine card frame buffered until its body arrives", () => {
  assert.equal(isCardConnectionRechargeListCandidate(new Uint8Array([0xd6, 0x0a, 0x0a, 0x0b])), true);
  assert.equal(isCardConnectionRechargeListCandidate(new Uint8Array([0xd6, 0x0a, 0x0a, 0x0b, 0x08])), true);
});

test("routes split markers separately from complete card frames", () => {
  assert.deepEqual(
    getCardConnectionRechargeListFrameDisposition(new Uint8Array([0xd6, 0x0a])),
    { kind: "incomplete", frameLength: null }
  );
  assert.deepEqual(
    getCardConnectionRechargeListFrameDisposition(new Uint8Array([0xd6, 0x0a, 0x09, 0x0b])),
    { kind: "marker", frameLength: null }
  );
  assert.deepEqual(
    getCardConnectionRechargeListFrameDisposition(new Uint8Array([0xd6, 0x0a, 0x39, 0x0b])),
    { kind: "marker", frameLength: null }
  );

  const partialCard = new Uint8Array([0xd6, 0x0a, 0x15, 0x00, 0x08]);
  assert.deepEqual(
    getCardConnectionRechargeListFrameDisposition(partialCard),
    { kind: "incomplete", frameLength: 21 }
  );

  const card = new Uint8Array(21);
  const view = new DataView(card.buffer);
  view.setUint16(0, 2774, true);
  view.setUint16(2, card.length, true);
  card[4] = 8;
  assert.deepEqual(
    getCardConnectionRechargeListFrameDisposition(card),
    { kind: "card", frameLength: 21 }
  );
});

const deckFixture = () => ({
  enable: 0,
  data: {
    0: {
      enable: 1,
      data: {
        1: { cards: [4010, 4020, 0, 0, 0, 0, 0, 0], recharge: [0, 0, 0, 0, 0, 0, 0, 0], activate: 1, effect: "" }
      }
    },
    1: {
      enable: 0,
      data: {
        1: { cards: [4010, 4011, 4012], recharge: [2, 1, 0], activate: 0, effect: "" },
        2: { cards: [4013], recharge: [1], activate: 0, effect: "" }
      }
    },
    2: {
      enable: 0,
      data: {
        1: { cards: [4020, 4021], recharge: [2, 1], activate: 0, effect: "" }
      }
    }
  }
});

test("deck overview lists slotted cards and charged-but-inactive cards", () => {
  const overview = getCardDeckOverview(deckFixture(), { itemNames: { 4010: "蝙蝠卡", 4020: "哥布灵卡" } });

  assert.deepEqual(
    overview.deck.map(({ slot, id, tab, level, state }) => ({ slot, id, tab, level, state })),
    [
      { slot: 0, id: 4010, tab: 1, level: 1, state: 2 },
      { slot: 1, id: 4020, tab: 2, level: 1, state: 2 }
    ]
  );
  assert.equal(overview.deck[0].name, "蝙蝠卡");
  assert.equal(overview.deckCount, 2);
  assert.equal(overview.capacity, 8);
  assert.equal(overview.activate, 1);
  assert.equal(overview.enable, 1);

  // state === 1 cards across every category are aggregated, state 0/2 are not.
  assert.deepEqual(
    overview.awaiting.map(({ id, tab, level, state }) => ({ id, tab, level, state })),
    [
      { id: 4011, tab: 1, level: 1, state: 1 },
      { id: 4013, tab: 1, level: 2, state: 1 },
      { id: 4021, tab: 2, level: 1, state: 1 }
    ]
  );
});

test("deck overview never duplicates a card already in a deck slot", () => {
  const data = deckFixture();
  // 4010 is slotted and its category state is 2: it must stay out of awaiting.
  const overview = getCardDeckOverview(data);
  assert.equal(overview.awaiting.some((entry) => entry.id === 4010), false);

  // Even when a slotted card's category row still reports state 1 (server lag),
  // the deck membership wins.
  data.data[1].data[1].recharge[0] = 1;
  const stale = getCardDeckOverview(data);
  assert.equal(stale.awaiting.some((entry) => entry.id === 4010), false);
  assert.equal(stale.deck.some((entry) => entry.id === 4010), true);
});

test("deck overview search only filters the awaiting list", () => {
  const overview = getCardDeckOverview(deckFixture(), { search: "4021" });
  assert.deepEqual(overview.awaiting.map((entry) => entry.id), [4021]);
  assert.equal(overview.deck.length, 2);
});

test("deck overview tolerates slotted cards missing from the static table", () => {
  const data = {
    data: {
      0: { enable: 0, data: { 1: { cards: [4999, 0, 0, 0, 0, 0, 0, 0], recharge: [0, 0, 0, 0, 0, 0, 0, 0] } } },
      1: { data: { 1: { cards: [4010], recharge: [0] } } }
    }
  };
  const overview = getCardDeckOverview(data);
  assert.equal(overview.deck[0].id, 4999);
  assert.equal(overview.deck[0].tab, 0);
  assert.equal(overview.deck[0].level, 1);
  assert.equal(overview.deck[0].state, 2);
});

test("findCardDefinition locates cards by category, level and slot", () => {
  const data = deckFixture();
  assert.deepEqual(findCardDefinition(data, 4013), { tab: 1, level: 2, slot: 0, state: 1 });
  assert.deepEqual(findCardDefinition(data, 4021), { tab: 2, level: 1, slot: 1, state: 1 });
  assert.equal(findCardDefinition(data, 9999), null);
});

test("getCardLevelCount counts level rows per category", () => {
  const data = deckFixture();
  assert.equal(getCardLevelCount(data, 1), 2);
  assert.equal(getCardLevelCount(data, 2), 1);
  assert.equal(getCardLevelCount(data, 7), 0);
});

test("listCardEntries can restrict entries to one level", () => {
  const data = deckFixture();
  assert.deepEqual(listCardEntries(data, { tab: 1, level: 2, pageSize: 8 }).entries.map((entry) => entry.id), [4013]);
  assert.deepEqual(listCardEntries(data, { tab: 1, level: 1, pageSize: 8 }).entries.map((entry) => entry.id), [4010, 4011, 4012]);
  assert.equal(listCardEntries(data, { tab: 1, level: 99, pageSize: 8 }).total, 0);

  const charged = listCardEntries(data, { tab: 1, level: 1, pageSize: 8, filter: "charged" });
  assert.deepEqual(charged.entries.map((entry) => entry.id), [4010, 4011]);
});

test("charged card appears in awaiting after recharge and moves to deck after being added", () => {
  const data = {
    enable: 0,
    data: {
      0: { enable: 0, data: { 1: { cards: [0, 0, 0, 0, 0, 0, 0, 0], recharge: [0, 0, 0, 0, 0, 0, 0, 0] } } },
      1: { data: { 1: { cards: [4010, 4011], recharge: [0, 0] } } }
    }
  };

  // Server confirms recharge: state 0 -> 1. The card must surface on My Deck.
  assert.equal(applyCardConnectionUpdate(data, { tab: 1, level: 1, cardid: 4010, state: 1 }), true);
  let overview = getCardDeckOverview(data);
  assert.equal(overview.deckCount, 0);
  assert.deepEqual(overview.awaiting.map((entry) => entry.id), [4010]);

  // Server confirms add-to-deck: state 1 -> 2 and the deck slot fills.
  assert.equal(applyCardConnectionUpdate(data, { tab: 1, level: 1, cardid: 4010, state: 2 }), true);
  overview = getCardDeckOverview(data);
  assert.deepEqual(overview.deck.map((entry) => entry.id), [4010]);
  assert.equal(overview.awaiting.length, 0);

  // Removing from deck clears the slot and returns the card to awaiting.
  assert.equal(applyCardConnectionCancelUpdate(data, { tab: 1, level: 1, cardid: 4010, state: 1 }), true);
  overview = getCardDeckOverview(data);
  assert.equal(overview.deckCount, 0);
  assert.deepEqual(overview.awaiting.map((entry) => entry.id), [4010]);
});
