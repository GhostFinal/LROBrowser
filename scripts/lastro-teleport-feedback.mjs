// LastRO's original client handles only these explicit rejection responses.
export function createLastroTeleportFeedback({ showNotice, writeChat, onRejected, onError }) {
  if (typeof showNotice !== 'function' || typeof writeChat !== 'function') {
    throw new TypeError('Teleport feedback requires native notice and chat callbacks');
  }

  function report(error) {
    try { onError?.(error); } catch { /* Do not interrupt the remaining receive batch. */ }
  }

  return function onPrivateAirshipResponse(packet) {
    let message;
    switch (packet?.response) {
      case 2: message = '传送失败：背包中没有 VIP 卡或传送券。'; break;
      case 3: message = '传送失败：该地图不支持传送。'; break;
      case 4: message = '传送失败：未知地图。'; break;
      default: return false;
    }
    for (const callback of [showNotice, writeChat, onRejected]) {
      try { callback?.(message, packet.response); } catch (error) { report(error); }
    }
    return true;
  };
}

function patchRegion(source, name, transform) {
  const marker = `//#region ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf('//#endregion', start);
  if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error('anchor:teleport-feedback:' + name);
  }
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
}

function replaceOne(region, needle, replacement, name) {
  if (region.split(needle).length !== 2) throw new Error('anchor:teleport-feedback:' + name);
  return region.replace(needle, replacement);
}

export function patchRuntimeTeleportFeedback(source) {
  let output = patchRegion(source, 'src/Network/PacketStructure.js', region => {
    if (region.includes('PRIVATE_AIRSHIP_RESPONSE')) throw new Error('anchor:teleport-feedback:already-installed');
    const anchor = '  PACKET.ZC.CHECK_RECEIVE_CHARACTER_NAME2.size = 34;';
    return replaceOne(region, anchor, `${anchor}
  PACKET.ZC.PRIVATE_AIRSHIP_RESPONSE = function PACKET_ZC_PRIVATE_AIRSHIP_RESPONSE(fp, end) {
    this.response = fp.readLong();
  };
  PACKET.ZC.PRIVATE_AIRSHIP_RESPONSE.size = 6;`, 'packet-structure');
  });
  output = patchRegion(output, 'src/Network/PacketRegister.js', region => {
    if (region.includes('PRIVATE_AIRSHIP_RESPONSE')) throw new Error('anchor:teleport-feedback:already-installed');
    const anchor = '    2638: PACKET.ZC.RANDOM_COMBINE_ITEM_UI_OPEN,';
    return replaceOne(region, anchor, '    2634: PACKET.ZC.PRIVATE_AIRSHIP_RESPONSE,\n' + anchor, 'packet-register');
  });
  output = patchRegion(output, 'src/Engine/MapEngine/Main.js', region => {
    if (region.includes('showLastroTeleportNotice') || region.includes('PRIVATE_AIRSHIP_RESPONSE')) {
      throw new Error('anchor:teleport-feedback:already-installed');
    }
    const anchor = 'function MainEngine$11() {';
    return replaceOne(region, anchor, `function showLastroTeleportNotice(message) {
  init_Announce();
  Announce_default.append();
  Announce_default.set(message, "#FFFF00", { life: 5000 });
}
${anchor}
  const lastroPrivateAirshipFeedback = (${createLastroTeleportFeedback.toString()})({
    showNotice: showLastroTeleportNotice,
    writeChat: message => ChatBox_default.addText(message, ChatBox_default.TYPE.ERROR, ChatBox_default.FILTER.PUBLIC_LOG),
    onRejected: (message, response) => {
      if (typeof LastROTools !== "undefined") LastROTools?._lastroTeleportRejected?.(message, response);
    },
    onError: error => console.warn("[LastRO] Teleport rejection feedback failed", error),
  });
  Network.hookPacket(PACKET.ZC.PRIVATE_AIRSHIP_RESPONSE, lastroPrivateAirshipFeedback);`, 'main-hook');
  });
  return output;
}
