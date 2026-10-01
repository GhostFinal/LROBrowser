import { bindAssistantNativeCursor } from './lro-assistant-input.mjs';
import { createAssistantTheme } from './lro-assistant-theme.mjs';

// Existing assistant views become real native GUIComponents. Business logic and
// saved coordinates remain independent of the client's internal UI version.
export function createAssistantWindows(page, modules) {
  const GUIComponent = modules.get('UI/GUIComponent');
  const manager = modules.get('UI/UIManager');
  const windows = [];
  const theme = createAssistantTheme(page, modules);
  let gameplay = false;
  let sequence = 0;
  const native = typeof GUIComponent?.prototype?.lroAdopt === 'function' && manager?.addComponent;
  const release = host => host.dispatchEvent(new page.Event('x_remove'));
  function attach(record) {
    const { host, component } = record;
    if (!host.isConnected) {
      const focus = component.needFocus;
      component.needFocus = false;
      component.append(page.document.body);
      component.needFocus = focus;
    }
    component.__active = !host.hidden;
    if (component.__active && !record.visible) component.focus();
    record.visible=component.__active;
  }
  function sync(visible) {
    gameplay = Boolean(visible);
    if (gameplay) theme.refresh();
    for (const record of windows) {
      if (gameplay) attach(record);
      else { if (record.host.isConnected) record.component.remove(); record.visible=false; }
    }
  }
  function mark(host) {
    host.dataset.lroAssistantRoot = 'true';
    // Cancel only the browser menu. Capture also covers empty window areas
    // and native scrollbars that stop bubbling; item right-click handlers run.
    host.addEventListener('contextmenu', event => event.preventDefault(), { capture: true });
    page.queueMicrotask(() => theme.apply(host.shadowRoot));
    if (!native) {
      // Unit fixtures and standalone previews may have no native window system.
      bindAssistantNativeCursor(host, page, GUIComponent);
      return host;
    }
    page.queueMicrotask(() => {
      const name = host.id === 'ro-market-assistant' ? 'LROAssistant'
        : host.id === 'ro-target-window' ? 'LROAssistantTarget'
          : host.id === 'ro-dps-meter' ? 'LROAssistantDamage' : `LROAssistantWindow${++sequence}`;
      const component = new GUIComponent(name).lroAdopt(host);
      // Adopted views are already attached: append() will not run its native
      // scrollbar discovery. Use the same observer as every built-in window.
      if (host.isConnected) component._setupScrollbars();
      manager.addComponent(component);
      host.dataset.lroNativeComponent = name;
      host.style.zIndex = '50';
      const style = page.document.createElement('style');
      style.textContent = ':host-context(.custom-cursor),:host-context(.custom-cursor) *{cursor:none!important}'
        + (name === 'LROAssistant' ? '.assistant-launcher{display:none!important}' : '');
      host.shadowRoot.append(style);
      // Capture precedes the view's propagation guards; native focus owns z-order.
      host.shadowRoot.addEventListener('pointerdown', () => component.focus(), true);
      const observer = new page.MutationObserver(() => {
        component.__active = gameplay && host.isConnected && !host.hidden;
        if (component.__active && !record.visible) component.focus();
        record.visible=component.__active;
        if (host.hidden) release(host);
      });
      observer.observe(host, { attributes: true, attributeFilter: ['hidden'] });
      const record = { host, component, observer, visible:false };
      windows.push(record);
      if (gameplay) attach(record);
      else component.remove();
    });
    return host;
  }
  function copyAssets() { if (gameplay) theme.refresh(); }
  function focusHost(host) {
    page.queueMicrotask(()=>{const record=windows.find(entry=>entry.host===host);if(record?.component.__active)record.component.focus();});
  }
  return { mark, sync, copyAssets, focusHost };
}
