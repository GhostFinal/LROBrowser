/**
 * LastRO sends a two-byte batch-frame marker before a sequence of ordinary
 * Ragnarok packets. The marker is not a packet with a business payload.
 */
export const LASTRO_PACKET_BATCH_MARKER = 0x0c09;
export const LASTRO_PACKET_CONTROL_MARKER = 0x0ad6;
// LastRO reuses this client packet id as a two-byte stream marker. The next
// bytes are an ordinary Ragnarok packet, not EQUIPWIN_MICROSCOPE_V3 data.
export const LASTRO_PACKET_STREAM_MARKER = 0x0906;
export const LASTRO_PACKET_STREAM_MARKER_ALT = 0x060c;
// Additional marker byte orders observed in LastRO captures.  These are
// stream delimiters, not business packets, and occur immediately before
// otherwise valid movement/entity frames.
export const LASTRO_PACKET_STREAM_MARKER_VARIANTS = Object.freeze([
  0x090c,
  0x0306,
  0x0603,
  0x0903,
  0x0309,
  0x0c03,
  0x030c,
  0x0606,
  0x0609,
  0x0909,
  0x0c06
]);

/**
 * Packet lengths confirmed by the LastRO/OpenKore protocol updates.
 * Values include the two-byte packet ID, as expected by NetworkManager.
 */
export const LASTRO_PACKET_LENGTH_OVERRIDES = Object.freeze({
  0x0075: 11,
  0x0078: 58,
  0x007c: 42,
  0x0096: 4,
  0x009e: 17,
  0x00a0: 23,
  0x00e9: 19,
  0x00f4: 21,
  0x0124: 21,
  0x0191: 86,
  0x01c4: 22,
  0x01c5: 22,
  0x01d8: 54,
  0x01d9: 53,
  0x01da: 60,
  0x0223: 8,
  0x022a: 58,
  0x022b: 57,
  0x022c: 65,
  0x022e: 71,
  0x029a: 27,
  0x02b8: 22,
  0x02d4: 29,
  0x02ec: 67,
  0x02ed: 59,
  0x02ee: 60,
  0x080f: 20,
  0x081b: 10,
  0x084b: 19,
  0x097f: 11,
  0x0990: 31,
  0x09f7: 75,
  0x0a05: 53,
  0x0a09: 45,
  0x0a0a: 47,
  0x0a0b: 47,
  0x0a0c: 56,
  0x0a37: 59,
  0x0ad2: -1,
  // 0x0AD6 is also CARDCONNECTION_RECHARGE_LIST in v1.  The receiver
  // discriminates a complete length-prefixed card frame from the legacy
  // two-byte stream marker before applying this variable length.
  0x0ad6: -1,
  0x0ad8: 9,
  0x0adc: 6,
  0x0ae9: 9,
  0x0af1: 7,
  0x0af8: 7,
  0x0af9: -1,
  0x0afa: 58
});

// Observer traffic has a standalone FRIENDS_STATE frame, while ordinary
// LastRO traffic uses the standard 35-byte packet definition.
export const LASTRO_OBSERVER_PACKET_LENGTH_OVERRIDES = Object.freeze({
  0x0206: 11
});

export function getLastROPacketLengthOverrides(observerMode = false) {
  if (!observerMode) return LASTRO_PACKET_LENGTH_OVERRIDES;
  return Object.assign({}, LASTRO_PACKET_LENGTH_OVERRIDES, LASTRO_OBSERVER_PACKET_LENGTH_OVERRIDES);
}

/**
 * Calculate the four-digit response used by LastRO's SECOND_CHECK packet.
 * This mirrors the legacy v1 Online.js implementation.
 *
 * @param {number} aid
 * @param {number} pincode
 * @returns {string}
 */
export function calculateLastROPinCode(aid, pincode) {
  const permutation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let state = Number(pincode);

  for (let index = 1; index < 10; index++) {
    state = 4 + 2 * state;
    const swap = state % (index + 1);
    if (index !== swap) {
      const value = permutation[index];
      permutation[index] = permutation[swap];
      permutation[swap] = value;
    }
  }

  return String(aid).slice(-4).split("").map((digit) => String(permutation.indexOf(Number(digit)))).join("");
}

function isLastROProtocolEnabled(config) {
  return config === true || config?.lastroProtocol === true;
}

/**
 * Read a LastRO batch-frame header at the current receive offset.
 *
 * @param {Uint8Array|ArrayBuffer} buffer
 * @param {number} offset
 * @param {boolean|object} config
 * @returns {{kind: string, packetId: number, headerLength: number}|null}
 */
export function parseLastROFrameHeader(
  buffer,
  offset = 0,
  config = false,
  getPacketLength = () => false,
  isPacketRegistered = () => false
) {
  if (!isLastROProtocolEnabled(config)) return null;
  if (!buffer || !Number.isInteger(offset) || offset < 0) return null;

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (offset + 2 > bytes.byteLength) return null;

  const packetId = bytes[offset] | bytes[offset + 1] << 8;

  // LastRO reuses the official variable-length 0x0303 slot as a two-byte
  // transport marker before an arbitrary sequence of ordinary packets. The
  // following packet ID is not part of this marker, so never interpret it as
  // the 0x0303 length field while LastRO framing is enabled.
  if (packetId === 0x0303) {
    return {
      kind: 'packet-batch',
      packetId,
      headerLength: 2
    };
  }

  if (packetId === LASTRO_PACKET_BATCH_MARKER || packetId === LASTRO_PACKET_STREAM_MARKER || packetId === LASTRO_PACKET_STREAM_MARKER_ALT || LASTRO_PACKET_STREAM_MARKER_VARIANTS.includes(packetId)) {
    return {
      kind: 'packet-batch',
      packetId,
      headerLength: 2
    };
  }

  if (packetId === LASTRO_PACKET_CONTROL_MARKER) {
    return {
      kind: 'control-marker',
      packetId,
      headerLength: 2
    };
  }

  return null;
}

/**
 * Find a fixed-size SECOND_CHECK frame that was appended to an unknown
 * LastRO buffer. Some LastRO responses arrive split across legacy transport
 * messages; the generic receiver must not discard this 10-byte control frame
 * merely because the preceding custom data block is not registered.
 *
 * @param {Uint8Array|ArrayBuffer} buffer
 * @param {number} offset
 * @param {boolean|object} config
 * @returns {number|null} byte offset of the SECOND_CHECK frame, if present
 */
export function findLastROSecondCheckAtTail(buffer, offset = 0, config = false) {
  if (!isLastROProtocolEnabled(config)) return null;
  if (!buffer || !Number.isInteger(offset) || offset < 0) return null;

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const frameOffset = bytes.byteLength - 10;
  if (frameOffset < offset + 2) return null;

  if (bytes[frameOffset] !== 0xd5 || bytes[frameOffset + 1] !== 0x0a) {
    return null;
  }

  return frameOffset;
}
