export function roomElement(entity) {
  const node = entity?.room?.node;
  return node?.getRoot?.()?.querySelector?.('.EntityRoom')
    || node?.ui?.[0] || node?.ui?.get?.(0) || null;
}

export function roomTitle(entity) {
  const room = entity?.room;
  return room?.title || room?.text || room?.name
    || roomElement(entity)?.querySelector?.('.title')?.textContent || '';
}

// Only observe responses to shops the player actually opened. Never request
// shop lists or details, and never infer the seller from a non-unique title.
export function installShopCapture(assistant, subscribePackets) {
  if (assistant.itemListHookInstalled) return true;
  const packets = assistant.getAmdModule('Network/PacketStructure')?.ZC;
  if (!packets) return false;
  const types = new Set(Object.entries(packets)
    .filter(([name]) => /^PC_PURCHASE_ITEMLIST_FROMMC\d*$/.test(name))
    .map(([, value]) => value));
  if (!types.size) return false;
  subscribePackets((type, packet, phase) => {
    if (phase !== 'after' || !types.has(type) || !Array.isArray(packet?.itemList)) return;
    if (!assistant.settings.shopEnabled) return;
    const manager = assistant.getAmdModule('Renderer/EntityManager');
    const entity = manager?.get?.(Number(packet.AID));
    const title = roomTitle(entity);
    if (!entity || !title || Number(entity.GID ?? entity.AID) !== Number(packet.AID)) return;
    const store = assistant.getAmdModule('UI/Components/NpcStore/NpcStore');
    if (!store || store.getCurrentType?.() !== store.Type?.VENDING_STORE) return;
    const position = entity.position;
    assistant.lastClickedShop = {
      title, at: Date.now(), shopId: String(packet.AID), entity,
      seller: entity.display?.name || '', roomElement: roomElement(entity),
      x: Number.isFinite(position?.[0]) ? Math.round(position[0]) : null,
      y: Number.isFinite(position?.[1]) ? Math.round(position[1]) : null
    };
    assistant.currentNativeStoreSnapshot = null;
    assistant.captureIncomingStoreItems(packet.itemList);
    if (assistant.captureOpenedShopFromList(store, packet.itemList)) {
      assistant.markVendingShopViewed(entity);
    }
  });
  assistant.itemListHookInstalled = true;
  return true;
}

export function styleShopMarker(marker) {
  Object.assign(marker.style, {
    position: 'absolute', left: '14px', top: '50%', zIndex: '999',
    display: 'block', width: '18px', height: '18px', margin: '0', padding: '0',
    border: '0', background: 'transparent', color: '#ff2626',
    font: '900 18px/18px Arial, sans-serif', textAlign: 'center',
    pointerEvents: 'none', userSelect: 'none',
    transform: 'translate(-50%, -52%) rotate(-8deg)',
    textShadow: '-1px -1px 0 white,1px -1px 0 white,-1px 1px 0 white,1px 1px 0 white'
  });
}
