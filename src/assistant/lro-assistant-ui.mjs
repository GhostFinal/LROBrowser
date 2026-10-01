export function componentRoot(component) {
  return component?.getRoot?.() || component?.ui?.[0]?.shadowRoot || component?.ui?.[0] || null;
}

export function componentVisible(component, page) {
  const root = componentRoot(component);
  const host = root?.host || component?._host || root;
  if (!host?.isConnected || host.hidden) return false;
  const style = page.getComputedStyle(host);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Native windows can begin with a hidden tab/decorative div. Its size is
  // not the window's visibility. GUIComponent owns the active state.
  if (typeof component.__active === 'boolean') return component.__active;
  return [host, ...(root?.querySelectorAll?.('div,section,canvas') || [])].some(content => {
    const rect = content.getBoundingClientRect?.();
    return rect?.width > 0 && rect.height > 0;
  });
}

export function containerItems(component) {
  const items = component?.lroReadItems?.() ?? component?.list;
  return Array.isArray(items) ? items : null;
}

export function vendingRoot(assistant, page) {
  const store = assistant.getAmdModule('UI/Components/NpcStore/NpcStore');
  if (!store || store.Type?.VENDING_STORE === undefined
      || store.getCurrentType?.() !== store.Type.VENDING_STORE
      || !componentVisible(store, page)) return null;
  return componentRoot(store)?.querySelector?.('#NpcStore, .NpcStore') || null;
}
