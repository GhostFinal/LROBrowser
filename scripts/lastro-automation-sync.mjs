export function installLastroAutomationSync(tools, deps) {
  if (tools._lastroAutomationSync) return tools._lastroAutomationSync;
  const clock = deps.clock || globalThis;
  const now = deps.now || (() => Date.now());
  const scalarIds = deps.scalarIds || {};
  const fieldsById = Object.fromEntries(Object.entries(scalarIds).map(([field, id]) => [id, field]));
  const slots = deps.itemSlots || {};
  const slotsById = Object.fromEntries(Object.entries(slots).map(([field, id]) => [id, field]));
  const toggles = { startAutoAtk: 'autoAttack', startAutoLoot: 'autoLoot', startAutopots: 'autoPots', startAutofollow: 'autoFollow' };
  const pending = new Map();
  const timedOut = new Set();
  const targetKnown = new Set();
  let identity = deps.getIdentity?.() ?? null;
  let session = deps.getSession?.();
  let confirmed = {}, snapshot = false, requestTimer = null, lastRequest = -Infinity, slotCursor = null;
  let mapReady = deps.canRequest?.() !== false;
  let sessionReadRequested = false;
  let refreshing = false;
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const bool = value => Number(value) !== 0;

  function root() { return tools.getRoot?.(); }
  function finish(key) {
    const entry = pending.get(key);
    if (entry) clock.clearTimeout(entry.timer);
    pending.delete(key);
    timedOut.delete(key);
  }
  function clearRequest() {
    if (requestTimer !== null) clock.clearTimeout(requestTimer);
    requestTimer = null;
  }
  function reset() {
    clearRequest();
    for (const key of pending.keys()) finish(key);
    timedOut.clear();
    confirmed = {}; snapshot = false; lastRequest = -Infinity; slotCursor = null;
    mapReady = deps.canRequest?.() !== false;
    sessionReadRequested = false;
    targetKnown.clear(); tools._onlyTargets = []; tools._assistSkills = [];
    tools._targetRequestId = (tools._targetRequestId || 0) + 1;
    tools._settingState = confirmed;
    identity = deps.getIdentity?.() ?? null;
    session = deps.getSession?.();
    tools.setStatus?.('');
    render();
  }
  function checkIdentity() {
    const current = deps.getIdentity?.() ?? null;
    if (current !== identity || deps.getSession?.() !== session) reset();
    return current !== null;
  }
  function renderControl(input, key) {
    const known = owns(confirmed, key);
    const entry = pending.get(key);
    const value = entry && owns(entry, 'draft') ? entry.draft : known ? confirmed[key] : undefined;
    input.disabled = !mapReady || !snapshot || requestTimer !== null || Boolean(entry);
    input.dataset.automationState = entry ? 'pending' : known ? 'confirmed' : 'unknown';
    if (input.type === 'checkbox') {
      input.indeterminate = value === undefined;
      input.checked = value === undefined ? false : bool(value);
      return;
    }
    if (input.tagName === 'SELECT') {
      for (const option of Array.from(input.options)) {
        if (option.dataset.automationPlaceholder || option.dataset.automationFallback) option.remove();
      }
      if (value === undefined) {
        const placeholder = input.ownerDocument.createElement('option');
        placeholder.value = ''; placeholder.textContent = '未返回';
        placeholder.disabled = true; placeholder.dataset.automationPlaceholder = '1';
        input.prepend(placeholder); input.value = '';
      } else {
        const text = String(value);
        if (!Array.from(input.options).some(option => option.value === text)) {
          const fallback = input.ownerDocument.createElement('option');
          fallback.value = text; fallback.dataset.automationFallback = '1';
          fallback.textContent = input.hasAttribute('data-item-select') ? `道具 ${text}（未在背包中）`
            : input.hasAttribute('data-skill-select') ? `技能 ${text}（未在技能列表中）` : text;
          input.append(fallback);
        }
        input.value = text;
      }
    } else {
      input.value = value === undefined ? '' : String(key === 'autoloot' ? Number(value) / 100 : value);
      if (!known && !entry) input.placeholder = '未返回';
      else if (input.placeholder === '未返回') input.removeAttribute('placeholder');
    }
  }
  function render() {
    if (refreshing) return;
    refreshing = true;
    try {
      checkIdentity();
      tools._settingState = confirmed;
      const ui = root();
      if (!ui) return;
      ui.querySelectorAll('[data-field], [data-option]').forEach(input => {
        renderControl(input, input.dataset.field || input.dataset.option);
      });
      ui.querySelectorAll('[data-target-id]').forEach(input => {
        const id = Number(input.dataset.targetId), entry = pending.get(`target:${id}`);
        input.disabled = !mapReady || !snapshot || requestTimer !== null || Boolean(entry);
        input.indeterminate = !targetKnown.has(id) && !entry;
        input.checked = entry ? Boolean(entry.draft) : (tools._onlyTargets || []).includes(id);
      });
      ui.querySelectorAll('.lastro-help').forEach(node => node.remove());
      tools.renderAssistSkillList?.();
      const status = ui.querySelector('[data-compact-status-text]');
      if (status && (!owns(confirmed, 'autoAttack') || !owns(confirmed, 'autoLoot'))) status.textContent = '挂机设置未返回';
      else tools.renderCompactStatus?.();
    } finally { refreshing = false; }
  }
  function request() {
    if (!checkIdentity() || !mapReady || deps.canRequest?.() === false) { render(); return false; }
    if (requestTimer !== null || now() - lastRequest < 500) return false;
    sessionReadRequested = true;
    lastRequest = now();
    requestTimer = clock.setTimeout(() => {
      requestTimer = null;
      if (!checkIdentity()) return;
      tools.setStatus?.('未收到服务端挂机设置，请重新登录后重试');
      render();
    }, 5000);
    try {
      if (deps.requestSettings?.() === false) throw new Error('unavailable');
    } catch {
      clearRequest(); tools.setStatus?.('暂时无法读取服务端挂机设置'); render(); return false;
    }
    if (requestTimer !== null) tools.setStatus?.('正在读取挂机设置');
    render();
    return true;
  }
  function merge(state) {
    const waiting = pending.size + timedOut.size;
    for (const [field, value] of Object.entries(state || {})) {
      if (!(owns(scalarIds, field) || owns(slots, field) || Object.values(toggles).includes(field))) continue;
      if (!Number.isFinite(Number(value))) continue;
      confirmed[field] = typeof value === 'boolean' ? value : Number(value);
      finish(field);
      const option = toggles[field];
      if (option) {
        confirmed[option] = option === 'autoLoot' && [5, 6].includes(Number(deps.getNid?.())) ? !bool(value) : bool(value);
        finish(option);
      }
    }
    if (waiting && !pending.size && !timedOut.size && requestTimer === null) tools.setStatus?.('');
    render();
  }
  tools.applyState = function (state) { if (checkIdentity()) merge(state); };
  tools.setLoadInfo = function (packet) {
    if (!checkIdentity()) return;
    clearRequest(); slotCursor = null; confirmed = {}; snapshot = true; sessionReadRequested = true;
    tools._assistSkills = [];
    merge(packet);
    tools.setStatus?.('');
  };
  tools.setReloadInfo = function (packet) {
    if (!checkIdentity()) return;
    const id = Number(packet?.id), value = Number(packet?.value);
    if (!Number.isInteger(id) || !Number.isFinite(value)) return;
    if (id === 57) slotCursor = owns(slotsById, value) ? value : null;
    const state = owns(fieldsById, id) ? { [fieldsById[id]]: value } : {};
    if (id === 58 && slotCursor !== null) state[slotsById[slotCursor]] = value;
    merge(state);
  };
  tools.setOnlyTargetState = function (packet) {
    if (!checkIdentity()) return;
    const id = Number(packet?.mobid ?? packet?.mobId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(Number(packet?.value))) return;
    const enabled = bool(packet.value);
    tools._onlyTargets = enabled ? Array.from(new Set([...(tools._onlyTargets || []), id]))
      : (tools._onlyTargets || []).filter(target => target !== id);
    const waiting = pending.has(`target:${id}`) || timedOut.has(`target:${id}`);
    targetKnown.add(id); finish(`target:${id}`);
    if (waiting && !pending.size && !timedOut.size && requestTimer === null) tools.setStatus?.('');
    render();
  };
  function send(keys, drafts, action) {
    if (!checkIdentity() || !mapReady || !snapshot || requestTimer !== null || deps.canRequest?.() === false) {
      tools.setStatus?.('请先读取服务端挂机设置'); render(); return false;
    }
    if (keys.some(key => pending.has(key))) { render(); return false; }
    for (const key of keys) {
      timedOut.delete(key);
      const entry = { timer: clock.setTimeout(() => {
        finish(key);
        if (!checkIdentity()) return;
        timedOut.add(key);
        tools.setStatus?.('服务端未确认修改，请检查后重试'); render();
      }, 5000) };
      if (owns(drafts, key)) entry.draft = drafts[key];
      pending.set(key, entry);
    }
    try {
      if (action() === false) throw new Error('unavailable');
    } catch {
      for (const key of keys) finish(key);
      tools.setStatus?.('挂机设置发送失败'); render(); return false;
    }
    if (keys.some(key => pending.has(key))) tools.setStatus?.('等待服务端确认');
    render();
    return true;
  }
  tools.updateField = function (field, input) {
    if (!input || !(owns(scalarIds, field) || owns(slots, field))) return false;
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    const number = Number(raw);
    if (raw === '' || !Number.isFinite(number) || number < 0 || number > 2147483647
      || (field !== 'autoloot' && !Number.isInteger(number))
      || (field === 'autoloot' && (number > 100 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-7))
      || (number !== 0 && input.min !== '' && input.min !== undefined && number < Number(input.min))
      || (input.max !== '' && input.max !== undefined && number > Number(input.max))) {
      tools.setStatus?.('请输入有效的设置值'); render(); return false;
    }
    const updates = deps.buildFieldUpdates?.(field, raw, input.type) || [];
    if (!updates.length) return false;
    const wireValue = field === 'autoloot' ? Math.round(number * 100) : number;
    return send([field], { [field]: wireValue }, () => deps.sendUpdates?.(updates));
  };
  tools.setAutomationOption = function (option, enabled) {
    if (!Object.values(toggles).includes(option) || !owns(confirmed, option)) { render(); return false; }
    if (Boolean(enabled) === bool(confirmed[option])) { render(); return false; }
    return send([option], { [option]: Boolean(enabled) }, () => deps.sendToggle?.(option, Boolean(enabled)));
  };
  tools.submitAssistSkill = function (values = null) {
    const ui = root();
    const skillId = Number(values?.skillId ?? ui?.querySelector('[data-field="addiskillid"]')?.value);
    const level = Number(values?.level ?? ui?.querySelector('[data-field="addiskilllv"]')?.value);
    const enabled = values?.enabled ?? Boolean(ui?.querySelector('[data-field="addiskillop"]')?.checked);
    if (!Number.isInteger(skillId) || skillId <= 0 || skillId > 65535 || !Number.isInteger(level) || level < 1 || level > 10) {
      tools.setStatus?.('请选择辅助技能和有效等级'); return false;
    }
    const updates = deps.buildAssistUpdates?.({ skillId, level, enabled }) || [];
    if (!updates.length) return false;
    return send(['addiskillid', 'addiskilllv', 'addiskillop'], { addiskillid: skillId, addiskilllv: level, addiskillop: enabled }, () => deps.sendUpdates?.(updates));
  };
  tools.toggleOnlyTarget = function (mobId, enabled) {
    const id = Number(mobId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const selected = new Set(tools._onlyTargets || []);
    for (const [key, entry] of pending) if (key.startsWith('target:')) {
      const target = Number(key.slice(7));
      if (entry.draft) selected.add(target); else selected.delete(target);
    }
    if (enabled && !selected.has(id) && selected.size >= 20) {
      tools.setStatus?.('只攻击目标最多选择 20 个魔物'); render(); return false;
    }
    return send([`target:${id}`], { [`target:${id}`]: Boolean(enabled) }, () => deps.sendTarget?.(id, Boolean(enabled)));
  };
  for (const method of ['populateSkillSelects', 'populateItemSelects', 'setOnlyTargetOptions']) {
    const previous = tools[method];
    tools[method] = function (...args) { const result = previous?.apply(this, args); render(); return result; };
  }
  const previousInit = tools.init;
  tools.init = function (...args) { const result = previousInit?.apply(this, args); render(); return result; };
  const previousRestore = tools.restorePanel;
  tools.restorePanel = function (...args) { checkIdentity(); const result = previousRestore?.apply(this, args); render(); return result; };
  const previousMapChanged = tools.onMapChanged;
  tools.onMapChanged = function (...args) {
    checkIdentity();
    mapReady = false;
    render();
    return previousMapChanged?.apply(this, args);
  };
  function onMapReady() {
    if (!checkIdentity()) return false;
    mapReady = true;
    if (sessionReadRequested) { render(); return false; }
    return request();
  }
  const api = { request, reset, render, onMapReady };
  tools._lastroAutomationSync = api;
  tools._settingState = confirmed;
  return api;
}

export function patchRuntimeAutomationSync(source) {
  function replaceOne(region, needle, replacement, name) {
    if (region.split(needle).length !== 2) throw new Error('anchor:automation-sync:' + name);
    return region.replace(needle, replacement);
  }
  function region(name, transform) {
    const marker = `//#region ${name}`, start = source.indexOf(marker);
    if (start < 0) return;
    const end = source.indexOf('//#endregion', start);
    if (end < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('anchor:automation-sync:' + name);
    source = source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
  }
  if (source.includes('//#region src/UI/Components/LastROTools/LastROTools.js')) {
    source = replaceOne(source, '  AUTO_BATTLE_SCALAR_IDS,', '  AUTO_BATTLE_SCALAR_IDS,\n  AUTO_BATTLE_ITEM_SLOT_FIELDS,', 'slot-import');
  }
  region('src/Network/PacketStructure.js', text => {
    const start = text.indexOf('  PACKET.ZC.NOTIFY_LOADINFO = function');
    if (start < 0) throw new Error('anchor:automation-sync:loadinfo');
    const end = text.indexOf('  PACKET.ZC.NOTIFY_LOADINFO.size = 58;', start);
    if (end < 0) throw new Error('anchor:automation-sync:loadinfo-size');
    let packet = text.slice(start, end);
    packet = replaceOne(packet, '    this.onlynoattack = readByte();', '    this.onlynoattack = readByte();\n    this.AutoUseItem_Protection = readByte();', 'protection-offset');
    packet = replaceOne(packet, '    this.reserved = readByte();', '', 'reserved-byte');
    return text.slice(0, start) + packet + text.slice(end);
  });
  region('src/UI/Components/LastROTools/LastROTools.js', text => {
    if (text.includes('_lastroAutomationSync')) throw new Error('anchor:automation-sync:already-installed');
    return replaceOne(text, '  UIManager.addComponent(LastROTools);', `  (${installLastroAutomationSync.toString()})(LastROTools, {
    clock: globalThis,
    getIdentity: () => SessionStorage_default?.Playing && Number(SessionStorage_default.GID) > 0
      ? Configs.get("lastroNid", 0) + ":" + Configs.get("clientVer", 0) + ":" + SessionStorage_default.GID : null,
    getSession: () => SessionStorage_default?.Entity,
    getNid: () => Configs.get("lastroNid", 0),
    canRequest: () => Configs.get("lastroCustomPackets", false) && Boolean(SessionStorage_default?.Playing)
      && Boolean(SessionStorage_default.Entity) && !MapRenderer.loading && Boolean(PACKET.CZ.NOTIFY_LOADINFO),
    requestSettings: () => { Network.sendPacket(new PACKET.CZ.NOTIFY_LOADINFO()); },
    scalarIds: AUTO_BATTLE_SCALAR_IDS,
    itemSlots: AUTO_BATTLE_ITEM_SLOT_FIELDS,
    buildFieldUpdates: buildAutoBattleFieldUpdates,
    buildAssistUpdates: buildAssistSkillUpdates,
    sendUpdates: updates => {
      if (!PACKET.CZ.NOTIFY_UPDATEINFO) return false;
      for (const update of updates) {
        const packet = new PACKET.CZ.NOTIFY_UPDATEINFO();
        Object.assign(packet, mapScalarUpdate(update)); Network.sendPacket(packet);
      }
    },
    sendToggle: (option, enabled) => {
      const request = buildAutoToggleRequest({ nid: Configs.get("lastroNid", 0), option, enabled });
      if (request?.kind === "whisper" && PACKET.CZ.WHISPER) {
        const packet = new PACKET.CZ.WHISPER(); Object.assign(packet, { receiver: request.receiver, msg: request.msg }); Network.sendPacket(packet);
      } else if (request?.kind === "update" && PACKET.CZ.NOTIFY_UPDATEINFO) {
        const packet = new PACKET.CZ.NOTIFY_UPDATEINFO(); Object.assign(packet, mapScalarUpdate(request)); Network.sendPacket(packet);
      } else return false;
      if (option === "autoAttack" && enabled && PACKET.CZ.WHISPER) {
        const packet = new PACKET.CZ.WHISPER(); packet.receiver = "NPC:setoffline"; packet.msg = "0"; Network.sendPacket(packet);
      }
    },
    sendTarget: (mobId, enabled) => {
      if (!PACKET.CZ.NOTIFY_ONLYTARGET) return false;
      const packet = new PACKET.CZ.NOTIFY_ONLYTARGET(); Object.assign(packet, mapOnlyTargetUpdate({ mobId, enabled })); Network.sendPacket(packet);
    },
  });
  UIManager.addComponent(LastROTools);`, 'installer');
  });
  region('src/Engine/MapEngine.js', text => {
    text = replaceOne(text, 'function cleanGameUI() {', `function cleanGameUI() {
  if (typeof LastROTools !== "undefined") LastROTools?._lastroAutomationSync?.reset();`, 'logout-reset');
    return replaceOne(text, '    Network.sendPacket(new PACKET.CZ.NOTIFY_ACTORINIT());', `    Network.sendPacket(new PACKET.CZ.NOTIFY_ACTORINIT());
    if (Configs.get("lastroCustomPackets", false)) LastROTools?._lastroAutomationSync?.onMapReady();`, 'map-ready');
  });
  return source;
}
