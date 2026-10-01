// Shared RO skin. Read textures through the same Client/DB path as native UI;
// do not infer a close-button image from whichever window happens to be open.
export function createAssistantTheme(page, modules) {
  const roots = new Set();
  const textures = new Map();
  const pending=new Set();
  const retries=new Map();
  // Share the client's actual ui-btn rules, including hover/pressed/disabled.
  // Preserve existing controls and event handlers; only their presentation changes.
  const buttonSelector='button:not([hidden]):not(.close):not([class$="-close"]):not(#close):not(#collapse):not(.collapse):not(.launcher):not(.assistant-launcher):not([data-lro-assistant-entry]):not(.encyclopedia-list-item):not(.encyclopedia-monster)';
  const nativeButtons=String(modules.get('UI/CommonStyles')||'').replace(/\/\*[\s\S]*?\*\//g,'').match(/\.ui-btn[^{}]*\{[^{}]*\}/g)||[];
  // Cursor ownership stays with native Common/custom-cursor rules. Promoting
  // pointer/default to !important would reveal the OS cursor over the game one.
  const buttonCss=nativeButtons.map(rule=>rule.replace(/\.ui-btn/g,buttonSelector).replace(/([\w-]+)\s*:\s*([^;{}]+);/g,(_all,key,value)=>`${key}:${value.replace(/\s*!important/g,'')}${key==='cursor'?'':'!important'};`)).join('\n');
  const css = `
    :host [hidden]{display:none!important}
    :host{font-family:'Source Han Sans CN',sans-serif!important;font-size:13px!important;color:#111!important}
    .window,.panel,.manager-window,.modal-card,section{border-radius:3px;backdrop-filter:none}
    .window{background:#fff;border:1px solid #8e8e8e;box-shadow:1px 2px 2px #0007}
    .window::after,.detail-card::after,.encyclopedia-card::after,.monster-map-card::after{display:none!important}
    .head,.header,header,[class$="-head"]{
      box-sizing:border-box;min-height:18px!important;height:18px!important;padding:0 3px!important;
      background-color:#d9e7f7!important;background-image:var(--ro-titlebar-image,repeating-linear-gradient(to bottom,#edf5ff 0 1px,#c5daf2 1px 3px,#a8c8ea 3px 4px))!important;
      background-repeat:repeat-x!important;background-size:auto 18px!important;
      color:#111!important;text-shadow:1px 1px #fff!important;border-radius:3px 3px 0 0!important}
    .head strong,.header strong,header strong,[class$="-head"] strong{font-family:inherit!important;font-size:13px!important;font-weight:normal!important;height:auto!important;line-height:16px!important}
    .body{background:#fff;color:#111;padding:5px!important;border-top:1px solid #a9b7c7}
    button,input,select,textarea{font-family:inherit!important;font-size:13px!important}
    button:not(.close):not([class$="-close"]):not(#close):not(#collapse):not(.collapse){min-height:20px}
    .close,button[class$="-close"],#close{position:relative;flex:0 0 13px!important;width:13px!important;height:13px!important;min-width:13px!important;
      min-height:13px!important;padding:0!important;border:0!important;border-radius:0!important;
      background:transparent var(--ro-close-image,none) center/13px 13px no-repeat!important;
      color:transparent!important;font-size:0!important;box-shadow:none!important;text-shadow:none!important;transform:none!important}
    .close::after,button[class$="-close"]::after,#close::after{content:'×';position:absolute;inset:0;color:#244768;font:bold 13px/12px sans-serif;text-shadow:1px 1px #fff}
    .close:hover,button[class$="-close"]:hover,#close:hover{background-image:var(--ro-close-hover-image,var(--ro-close-image))!important}
    #collapse,.collapse{width:13px!important;height:13px!important;min-width:13px!important;min-height:13px!important;padding:0!important;border:0!important;box-shadow:none!important;background:transparent var(--ro-mini-image) center/13px 13px no-repeat!important}
    #collapse:hover,.collapse:hover{background-image:var(--ro-mini-hover-image,var(--ro-mini-image))!important}
    :host([data-ro-mini-ready]) #collapse,:host([data-ro-mini-ready]) .collapse{font-size:0!important;color:transparent!important}
    input[type="checkbox"]{accent-color:auto!important}
    :host([data-ro-check-ready]) input[type="checkbox"]{appearance:none!important;width:13px!important;height:13px!important;min-width:13px!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent var(--ro-check-off-image) center/contain no-repeat!important;vertical-align:middle}
    :host([data-ro-check-ready]) input[type="checkbox"]:checked{background-image:var(--ro-check-on-image)!important}
    :host([data-ro-check-ready]) input[type="checkbox"]:disabled{opacity:.5}
    input:focus,textarea:focus,select:focus{outline:none!important}
    .encyclopedia-list-item,.encyclopedia-monster{height:auto!important;min-height:20px!important;border-radius:0!important;box-shadow:none!important;text-shadow:none!important;transform:none!important;background:#fff!important;border:0!important;border-bottom:1px solid #ddd!important;color:#111!important}
    .encyclopedia-list-item:hover,.encyclopedia-monster:hover{background:#d5e2fa!important}
    :host([data-ro-close-ready]) .close::after,:host([data-ro-close-ready]) button[class$="-close"]::after,:host([data-ro-close-ready]) #close::after{content:none}
    .head::before,.header::before,header::before,.manager-head::before{background-image:var(--ro-base-image)!important;background-size:11px 11px!important}
    table{border-collapse:collapse;font-size:12px}th{font-weight:normal;background:#eee;color:#244768;border-bottom:1px solid #bbb}
    td{border-bottom:1px solid #e4e4e4}th,td{padding:3px 5px}
    .member{border:1px solid #9a9a9a!important;border-radius:0!important;background:#fafafa!important;min-height:32px}
    .member .name,.member .hp{font-size:13px!important}.member .meta{font-size:11px!important}
    .member .fill{opacity:.28}.member .healthline{height:3px!important}
    .empty,.muted,.status{font-size:11px!important}
    .client-map-card{display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px;border:1px solid #c1c6c2;background:#fff}
    .client-map-card img{width:240px;height:240px;max-width:100%;object-fit:contain;image-rendering:pixelated}
    .client-map-card span{font-size:11px;color:#555;font-weight:normal}
    .detail-card,.encyclopedia-card,.monster-map-card{display:flex!important;flex-direction:column!important;overflow:hidden!important;max-height:calc(100vh - 40px)!important}
    .detail-head,.encyclopedia-head,.monster-map-head,.detail-window-actions,.encyclopedia-window-actions{flex-shrink:0!important}
    .detail-card>.detail-content,.encyclopedia-content,.monster-map-content,.support-content,.clear-confirm-message{min-height:0!important;overflow:auto;flex:1 1 auto}
    .head,.header,header,[class$="-head"]{flex-shrink:0!important}
  `;
  function applyTexture(root, key, value) {
    root.host.style.setProperty(`--ro-${key}-image`, value);
    if (key === 'close') root.host.dataset.roCloseReady = 'true';
    if (key === 'mini') root.host.dataset.roMiniReady = 'true';
    if (textures.has('check-off') && textures.has('check-on')) root.host.dataset.roCheckReady = 'true';
  }
  function load() {
    const client = modules.get('Core/Client');
    const db = modules.get('DB/DBManager');
    if (!client?.loadFile || !db?.INTERFACE_PATH) return;
    for (const [key, file] of Object.entries({titlebar:'basic_interface/titlebar_mid',base:'basic_interface/sys_base_off',close:'basic_interface/sys_close_off','close-hover':'basic_interface/sys_close_on',mini:'basic_interface/sys_mini_off','mini-hover':'basic_interface/sys_mini_on','check-off':'checkbox_0','check-on':'checkbox_1'})) {
      if (textures.has(key) || pending.has(key) || Date.now()<(retries.get(key) || 0)) continue;
      pending.add(key);
      const failed=()=>{pending.delete(key);retries.set(key,Date.now()+30000);};
      const ready = url => {
        if (typeof url !== 'string' || !url) {failed();return;}
        pending.delete(key);
        const value = `url(${JSON.stringify(url)})`;
        textures.set(key,value);
        for (const root of roots) applyTexture(root,key,value);
      };
      try {
        const result = client.loadFile(`${db.INTERFACE_PATH}${file}.bmp`,ready,failed);
        if (typeof result === 'string') ready(result);
      } catch {failed();}
    }
  }
  return { apply(root) {
    if (!root || roots.has(root)) return;
    roots.add(root);
    const style=page.document.createElement('style');style.dataset.lroTheme='ro-native';style.textContent=css+'\n'+buttonCss;root.append(style);
    for (const [key,value] of textures) applyTexture(root,key,value);
  }, refresh() { load(); for (const root of roots) for (const [key,value] of textures) applyTexture(root,key,value); } };
}
