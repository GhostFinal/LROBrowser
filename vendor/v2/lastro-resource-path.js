(function attachLastROResourcePathEncoding(root) {
  'use strict';

  function hasSingleByteMojibake(segment) {
    let hasHighByte = false;
    for (const character of segment) {
      const code = character.charCodeAt(0);
      if (code > 255) return false;
      hasHighByte ||= code >= 128;
    }
    return hasHighByte && segment.length > 1;
  }

  function encodeResourcePath(path) {
    return path.replace(/[^/]+/g, (segment) => encodeURIComponent(segment));
  }

  function decodeSegment(segment, charset) {
    if (!charset || !hasSingleByteMojibake(segment)) return segment;
    try {
      const bytes = Uint8Array.from(segment, (character) => character.charCodeAt(0));
      const decoded = new TextDecoder(charset).decode(bytes);
      if (!decoded.includes('\ufffd')) return decoded;
    } catch (_error) {}
    return segment;
  }

  function decodeMixedSegment(segment, charset) {
    if (!charset) return segment;
    return segment.replace(/[\u0080-\u00ff]+/g, (run) => decodeSegment(run, charset));
  }

  const legacyEncoderCache = new Map();
  const maxResourcePathCandidates = 12;

  function getLegacyEncoder(charset) {
    if (legacyEncoderCache.has(charset)) return legacyEncoderCache.get(charset);

    let decoder;
    try {
      decoder = new TextDecoder(charset);
    } catch (_error) {
      legacyEncoderCache.set(charset, null);
      return null;
    }

    const encoder = new Map();
    const bytes = new Uint8Array(2);
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      bytes[0] = lead;
      for (let trail = 0x41; trail <= 0xfe; trail++) {
        bytes[1] = trail;
        const decoded = decoder.decode(bytes);
        if (decoded.length === 1 && !decoded.includes('\ufffd') && !encoder.has(decoded)) {
          encoder.set(decoded, [lead, trail]);
        }
      }
    }
    legacyEncoderCache.set(charset, encoder);
    return encoder;
  }

  function transcodeCjkRuns(segment, sourceCharset, targetCharset) {
    if (!sourceCharset || !targetCharset || !/[\u3400-\u9fff\uf900-\ufaff]/.test(segment)) {
      return segment;
    }

    const encoder = getLegacyEncoder(sourceCharset);
    if (!encoder) return segment;

    let decoder;
    try {
      decoder = new TextDecoder(targetCharset);
    } catch (_error) {
      return segment;
    }

    return segment.replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, (run) => {
      const bytes = [];
      for (const character of run) {
        const encoded = encoder.get(character);
        if (!encoded) return run;
        bytes.push(...encoded);
      }
      const decoded = decoder.decode(Uint8Array.from(bytes));
      return decoded.includes('\ufffd') || !/[\u3131-\u318e\uac00-\ud7a3]/.test(decoded)
        ? run
        : decoded;
    });
  }

  function addLegacySpriteFallbacks(path) {
    const baseWeaponPath = path.replace(/_(?:검광|八堡)\.(spr|act)$/i, '.$1');
    return baseWeaponPath === path ? [path] : [path, baseWeaponPath];
  }

  function buildResourcePathCandidates(path, primaryCharset, fallbackCharset) {
    const normalizedPath = String(path).replace(/\\/g, '/');
    const decodedWithPrimary = normalizedPath.split('/').map((segment) =>
      decodeMixedSegment(segment, primaryCharset)
    ).join('/');
    const decodedWithFallback = normalizedPath.split('/').map((segment) =>
      decodeMixedSegment(segment, fallbackCharset)
    ).join('/');
    const restoredCjkPath = normalizedPath.split('/').map((segment) =>
      transcodeCjkRuns(segment, primaryCharset, fallbackCharset)
    ).join('/');
    const restoredPrimaryPath = restoredCjkPath.split('/').map((segment) =>
      decodeMixedSegment(segment, primaryCharset)
    ).join('/');
    const restoredFallbackPath = restoredCjkPath.split('/').map((segment) =>
      decodeMixedSegment(segment, fallbackCharset)
    ).join('/');
    const variants = [
      normalizedPath,
      decodedWithPrimary,
      decodedWithFallback,
      restoredCjkPath,
      restoredPrimaryPath,
      restoredFallbackPath
    ];
    const legacySpriteFallbacks = addLegacySpriteFallbacks(normalizedPath).slice(1);
    const candidates = [];
    const addCandidate = (value) => {
      if (candidates.length >= maxResourcePathCandidates) return;
      const encoded = encodeResourcePath(value);
      if (!candidates.includes(encoded)) candidates.push(encoded);
    };
    const lowercaseExtension = (value) => value.replace(
      /([^/]+\.)([^/.]+)$/i,
      (_match, base, extension) => base + extension.toLowerCase()
    );

    for (const variant of variants) addCandidate(variant);
    for (const variant of variants) addCandidate(lowercaseExtension(variant));
    // SkillInfo uses uppercase names; the extracted item icon files are lowercase.
    // Preserve exact paths first, then combine this fallback with charset recovery.
    if (/^data\/texture\/[^/]+\/item\/[a-z0-9_]+\.bmp$/i.test(normalizedPath)) {
      for (const variant of variants) {
        addCandidate(variant.replace(/[^/]+$/, (filename) => filename.toLowerCase()));
      }
    }
    for (const fallback of legacySpriteFallbacks) addCandidate(fallback);
    for (const fallback of legacySpriteFallbacks) addCandidate(lowercaseExtension(fallback));
    return candidates;
  }

  root.LastROResourcePathEncoding = Object.freeze({
    buildResourcePathCandidates
  });
})(typeof self !== 'undefined' ? self : globalThis);
