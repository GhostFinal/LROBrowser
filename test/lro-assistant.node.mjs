import { installLastroItemDrag } from '../scripts/lastro-item-drag.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { openAssistantStorage } from '../src/assistant/lro-assistant-storage.mjs';
import { createAssistantPacketBus } from '../src/assistant/lro-assistant-packets.mjs';
import { installAssistantInputTracking, addAssistantAwareListener, removeAssistantAwareListener, guardAssistantInputHandler } from '../src/assistant/lro-assistant-input.mjs';
import { setAssistantInnerHTML } from '../src/assistant/lro-assistant-dom.mjs';
import { createStandardAssistant } from '../src/assistant/lro-assistant-standard.mjs';
import { installLroAssistant } from '../src/assistant/lro-assistant.mjs';
import { monsterReference, targetTraitText, tinyMonsterLife } from '../src/assistant/lro-assistant-target.mjs';
import { assistantIcon } from '../src/assistant/lro-assistant-icon.mjs';
import { nativeCardData } from '../src/assistant/lro-assistant-features.mjs';
import { clientDropSources, findClientMonsters, mapMonsterCount } from '../src/assistant/lro-client-knowledge.mjs';

test('map population matches native packed IDs, ignores other monsters, and never sums duplicate rows',()=>{
  const rows=[['abbey01',1,300,20*65536+1865],['abbey01',2,300,10*65536+1866],['abbey01',1,300,20*65536+1865],['abbey02.gat',3,300,70*65536+1865]];
  assert.equal(mapMonsterCount(rows,'ABBEY01.gat',1865),20);
  assert.equal(mapMonsterCount(rows,'abbey02',1865),70);
  assert.equal(mapMonsterCount(rows,'nameless_n',1865),null);
  assert.equal(mapMonsterCount([['a',1,300,1865]],'a',1865),0);
  assert.equal(mapMonsterCount([['a',1,300,'bad']],'a',1865),null);
});

test('native world map data supplies monster maps and item drops without external references',async()=>{
  const f=fixture();
  try {
    const data={mobData:{1002:{kName:'波利',LV:1,DropsNum:1,Drop0id:501,Drop0per:500,MvpDropsNum:1,MVP0id:502,MVP0per:1000}},worldData:{unknown:{name:'未知数量地图',mobs:[1002]},field:{name:'原野',mobs:[1002]}}};
    assert.equal(clientDropSources(data,501)[0].rate,'5%');
    assert.equal(clientDropSources(data,502)[0].rate,'10%');
    const nativeData={mobData:JSON.parse(fs.readFileSync('vendor/core/data/world/mob-data.json','utf8'))};
    assert.ok(clientDropSources(nativeData,603).some(row=>row.kind==='MVP 奖励'));
    assert.equal(findClientMonsters(data,'','波利')[0][0],'1002');
    assert.equal(findClientMonsters(data,'','波').length,0);
    f.members.set('DB/WorldMapData',{load:async()=>data,navigationMobs:[['field',1,300,45*65536+1002]]});
    const warps=[];f.members.set('UI/WorldMapActions',{teleport:map=>{warps.push(map);return true;}});
    const images=[];f.members.get('DB/DBManager').INTERFACE_PATH='data/texture/ui/';
    f.members.set('Core/Client',{loadFile:(path,ready)=>{images.push(path);ready('data:image/png;base64,AA==');}});
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.encyclopedia.openFor({itemId:'501',itemName:'红色药水'});
    await new Promise(resolve=>f.page.setTimeout(resolve,0));
    assert.match(app.shadow.querySelector('.encyclopedia-content').textContent,/波利/);
    await app.encyclopedia.openMonsterMap('1002','波利');
    assert.match(app.shadow.querySelector('.monster-map-content').textContent,/原野 \(field\)/);
    assert.match(app.shadow.querySelector('.client-map-population').textContent,/45 只/);
    assert.match(app.shadow.querySelectorAll('.client-map-population')[1].textContent,/未提供/);
    assert.match(app.shadow.querySelector('.monster-map-content').textContent,/5%/);
    assert.equal(app.shadow.querySelector('.monster-map-content a'),null);
    assert.ok(images.includes('data/texture/ui/map/field.bmp'));
    assert.equal(warps.length,0);
    const teleport=app.shadow.querySelector('.client-map-card button');teleport.click();teleport.click();
    assert.deepEqual(warps,['field']);
    const source=fs.readFileSync('generated/runtime/Online.js','utf8');
    const parsed=ts.createSourceFile('Online.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(parsed)==='lroAssistantModules');
    const nativeCalls=[];let prepared=0;
    const nativeMap={lroLoadData:async()=>data,lroTeleport:async map=>{nativeCalls.push(map);return false;}};
    const bridge=vm.runInNewContext('('+declaration.initializer.getText(parsed)+')',{
      WorldMap_default:nativeMap,init_WorldMap:()=>prepared++,NaviMobTable:[],
    });
    assert.equal(await bridge.get('DB/WorldMapData').load(),data);
    assert.equal(await bridge.get('UI/WorldMapActions').teleport('field'),false);
    assert.deepEqual(nativeCalls,['field']);assert.equal(prepared,2);
    assert.ok(source.includes('loadData: WorldMap.lroLoadData = async () => {'));
    assert.ok(source.includes('teleport: WorldMap.lroTeleport = mapname => {'));
    assert.ok(source.includes('return lastroWorldMapTeleport.request(mapname);'));
  }finally{f.cleanup();}
});
import { createAssistantTheme } from '../src/assistant/lro-assistant-theme.mjs';
import { createCardCollectionComponent } from '../vendor/v2/lastro-card-collection-ui.mjs';
import * as cardNative from '../vendor/v2/lastro-card-collection.mjs';
import { createAssistantWindows } from '../src/assistant/lro-assistant-windows.mjs';

test('real native GUI owns assistant focus, cursor, visibility and reconnect lifecycle', async () => {
  const dom = new JSDOM('<body></body>', {pretendToBeVisual:true});
  const page = dom.window;
  try {
    installAssistantInputTracking(page);
    const runtime = fs.readFileSync('generated/runtime/Online.js','utf8');
    const start = runtime.indexOf('  GUIComponent = class GUIComponent');
    const end = runtime.indexOf('\n});\n//#endregion',start);
    assert.ok(start>0 && end>start);
    const Mouse = {intersect:true};
    const context = {window:page,document:page.document,Event:page.Event,HTMLElement:page.HTMLElement,
      MutationObserver:page.MutationObserver,setTimeout:page.setTimeout.bind(page),
      Mouse,MouseMode:{STOP:0,FREEZE:1,CROSS:2},SessionStorage_default:{FreezeUI:false},
      _ensureDeps(){},_EntityManager:{setOverEntity(){}},_Cursor:{ACTION:{DEFAULT:0},setType(){}},
      _ScrollBar:null,_Renderer:null,CSS_NUMBER:{zIndex:true},
      addAssistantAwareListener,removeAssistantAwareListener,guardAssistantInputHandler};
    const GUI = vm.runInNewContext(runtime.slice(start,end)+'\nGUIComponent;', context);
    const manager = {components:{},addComponent(c){assert.ok(c instanceof GUI);c.manager=this;this.components[c.name]=c;},
      getComponent(name){return this.components[name];}};
    const modules=new Map([['UI/GUIComponent',GUI],['UI/UIManager',manager]]);
    const windows=createAssistantWindows(page,modules);
    const main=page.document.createElement('div');main.id='ro-market-assistant';
    windows.mark(main).attachShadow({mode:'open'}).innerHTML='<button>Test</button>';
    page.document.body.append(main);
    await Promise.resolve();
    assert.ok(manager.components.LROAssistant instanceof GUI);
    assert.equal(main.isConnected,false,'hidden outside gameplay');
    windows.sync(true);
    assert.equal(main.parentNode,page.document.body);
    const component=manager.components.LROAssistant;
    assert.equal(component.ui[0],main);
    assert.equal(component.__active,true);
    const other=page.document.createElement('div');other.attachShadow({mode:'open'});
    const native=new GUI('InventoryTest').lroAdopt(other);manager.addComponent(native);
    other.style.zIndex='50';native.append();native.focus();
    main.shadowRoot.querySelector('button').dispatchEvent(new page.Event('pointerdown',{bubbles:true,composed:true}));
    assert.ok(Number(main.style.zIndex)>Number(other.style.zIndex));
    main.dispatchEvent(new page.MouseEvent('mouseenter'));
    assert.equal(Mouse.intersect,false);
    main.hidden=true;await Promise.resolve();
    assert.equal(Mouse.intersect,true,'hiding restores native game hit testing');
    assert.equal(component.__active,false);
    main.hidden=false;await Promise.resolve();
    component.remove();assert.equal(main.isConnected,false);
    windows.sync(false);assert.equal(main.isConnected,false);
    windows.sync(true);assert.equal(main.isConnected,true);
    assert.equal(Object.keys(manager.components).filter(k=>k==='LROAssistant').length,1);
    assert.equal(main.shadowRoot.querySelector('button').textContent,'Test');
  } finally {page.close();}
});

function nativeComponent(f, name, html='') {
  const host=f.page.document.createElement('div');f.page.document.body.append(host);
  const root=host.attachShadow({mode:'open'});root.innerHTML=`<div id="${name}">${html}</div>`;
  const rect=()=>({left:20,top:20,right:220,bottom:220,width:200,height:200});
  host.getBoundingClientRect=rect;root.firstElementChild.getBoundingClientRect=rect;
  return {name,_host:host,getRoot:()=>root,ui:{0:host,is:()=>false},remove(){host.style.display='none';}};
}

test('IndexedDB persistence, server isolation and no access to account keys', async () => {
  const indexedDB = new IDBFactory();
  const a = await openAssistantStorage('lastro-2x',{indexedDB});
  a.setItem('ro-market-assistant:settings:v1', JSON.stringify({collapsed:false}));
  await a.flush(); await a.close();
  const again = await openAssistantStorage('lastro-2x',{indexedDB});
  assert.deepEqual(JSON.parse(again.getItem('ro-market-assistant:settings:v1')), {collapsed:false});
  const b = await openAssistantStorage('lastro-3x',{indexedDB});
  assert.equal(b.getItem('ro-market-assistant:settings:v1'),null);
  assert.throws(()=>b.getItem('accounts'),/自己的数据/);
  assert.throws(()=>b.setItem('password','fixture'),/自己的数据/);
  await again.close(); await b.close();
});

test('failed database open rejects instead of starting with empty data',async()=>{
  await assert.rejects(openAssistantStorage('bad/name',{indexedDB:new IDBFactory()}),/无效/);
  await assert.rejects(openAssistantStorage('lastro-2x',{indexedDB:{open(){throw new Error('blocked fixture');}}}),/blocked fixture/);
});

test('packet observation retains callback order and isolates observer exceptions',()=>{
  const bus=createAssistantPacketBus();const order=[];
  bus.subscribe(()=>{throw new Error('observer fixture');});
  const stop=bus.subscribe((_type,_packet,phase)=>order.push(phase));
  bus.emit('damage',{},'before');order.push('native');bus.emit('damage',{},'after');
  assert.deepEqual(order,['before','native','after']);stop();bus.emit('damage',{},'before');assert.equal(order.length,3);
});

test('native input guard leaves assistant controls working and retains outside game events',()=>{
  const dom=new JSDOM('<body><button id="game">Game</button><div id="ro-market-assistant"></div></body>',{pretendToBeVisual:true});
  const w=dom.window;installAssistantInputTracking(w);
  const host=w.document.getElementById('ro-market-assistant');const shadow=host.attachShadow({mode:'open'});
  const button=w.document.createElement('button');button.textContent='close';shadow.append(button);
  let native=0, own=0;const handler=()=>native++;
  for(const type of ['mousedown','mouseup','mousemove','click','wheel','keydown'])addAssistantAwareListener(w,type,handler,true);
  button.addEventListener('click',()=>{own++;host.remove();});
  button.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,composed:true}));
  w.document.getElementById('game').dispatchEvent(new w.MouseEvent('mousemove',{bubbles:true,composed:true}));
  w.document.getElementById('game').dispatchEvent(new w.MouseEvent('mouseup',{bubbles:true,composed:true}));
  button.dispatchEvent(new w.MouseEvent('click',{bubbles:true,composed:true}));
  w.document.getElementById('game').dispatchEvent(new w.MouseEvent('click',{bubbles:true,composed:true}));
  assert.equal(native,0);assert.equal(own,1);
  const game=w.document.getElementById('game');game.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,composed:true}));
  game.dispatchEvent(new w.MouseEvent('click',{bubbles:true,composed:true}));assert.equal(native,2);
  removeAssistantAwareListener(w,'click',handler,true);
  game.dispatchEvent(new w.MouseEvent('click',{bubbles:true,composed:true}));assert.equal(native,2);
  assert.equal(guardAssistantInputHandler(null),null);dom.window.close();
});

test('HTML passes native validation, CSS is preserved, malicious HTML rejected',()=>{
  const d=new JSDOM('<div id="root"></div>');const e=d.window.document.getElementById('root');
  setAssistantInnerHTML(e,'<style>.panel{color:red}</style><div class="panel">测试</div>');
  assert.equal(e.querySelector('style').textContent,'.panel{color:red}');
  assert.equal(e.querySelector('.panel').textContent,'测试');
  assert.throws(()=>setAssistantInnerHTML(e,'<img src=x onerror="steal()">'),/unsafe/);
  assert.throws(()=>setAssistantInnerHTML(e,'<script>steal()</script>'),/unsafe/);
  assert.throws(()=>setAssistantInnerHTML(e,'<style>@import "evil";</style>'),/不允许/);
  d.window.close();
});

function fixture() {
  const dom=new JSDOM('<!doctype html><html><body><canvas id="roRenderer"></canvas></body></html>',{url:'https://assistant.test/',pretendToBeVisual:true});
  const page=dom.window;
  const original=globalThis.MutationObserver;globalThis.MutationObserver=page.MutationObserver;
  const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const session={AID:100,GID:200,Character:{GID:200,name:'测试角色',level:99,job:4012},Entity:{GID:200,display:{name:'测试角色'},position:[50,50],job:4012,life:{hp:100,maxhp:100}},mapName:'prontera'};
  const packet=function(){};
  const equipment={equip(){},unEquip(){},getItems:()=>[],ui:{is:()=>false}};
  const inventory={list:[],ui:{is:()=>false},setItems(){},addItem(){},removeItem(){}};
  const members=new Map([
    ['Engine/SessionStorage',session],['DB/DBManager',{getItemInfo:id=>({identifiedDisplayName:'测试装备'+id}),getMapName:()=> '普隆德拉',getJobName:()=> '神射手'}],
    ['Renderer/EntityManager',{get:()=>null,forEach(){}}],['Renderer/MapRenderer',{currentMap:'prontera'}],
    ['Network/NetworkManager',{sendPacket(){throw new Error('unexpected game request');}}],['Network/PacketStructure',{ZC:{NOTIFY_ACT:packet}}],
    ['UI/Components/Equipment/Equipment',equipment],['UI/Components/Inventory/Inventory',inventory],
    ['Core/Client',{loadFile(_path,_success,fail){fail?.();}}],
  ]);
  const bus=createAssistantPacketBus();
  return {dom,page,session,storage,members,bus,cleanup(){page.queueMicrotask(()=>page.close());globalThis.MutationObserver=original;}};
}

test('standard UI mounts, preserves author, shows adaptation limits, and manual record roundtrip',()=>{
  const f=fixture();
  try{
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    assert.ok(app.host.shadowRoot);assert.ok(app.shadow.textContent.includes('加藤惠'));
    assert.equal(app.shadow.querySelector('.detail-headgear-preview'),null);
    assert.equal(app.shadow.querySelector('.headgear-native-trigger'),null);
    app.encyclopedia.openHeadgearPreview({itemId:1});
    assert.equal(app.encyclopedia.previewWindow,null);
    assert.equal(app.shadow.querySelectorAll('.manager-module input').length,14);
    app.showAssistantView('manager');assert.equal(app.assistantView,'manager');
    app.setModuleEnabled('cardDeckEnabled',true);assert.equal(app.settings.cardDeckEnabled,true);
    app.setModuleEnabled('encyclopediaEnabled',true);assert.equal(app.settings.encyclopediaEnabled,true);
    app.records=[{id:'fixture-record',source:'manual',map:'prontera',name:'测试装备',price:100,quantity:1}];app.save();
    assert.equal(JSON.parse(f.storage.getItem('ro-market-assistant:records:v1'))[0].id,'fixture-record');
    app.itemOverview.ensureWindow();assert.ok(app.itemOverview.window.body.querySelector('.owner'));
    app.partyBars.ensureWindow();assert.ok(app.partyBars.window);
    app.openAuthorMail();assert.match(app.shadow.querySelector('.support-mail-status').textContent,/请进入游戏/);
  }finally{f.cleanup();}
});

test('disabled integration has no effects',async()=>{
  assert.equal(await installLroAssistant({enabled:false}),null);
});

test('original icon and direct native skin assets are reused by every window',async()=>{
  // SHA-256 of the original assistant icon; no external plugin file is needed.
  assert.equal(createHash('sha256').update(assistantIcon).digest('hex'),'2a5e563e6b31e76b0eb2afe367192fdc56ada8b3aef0952adab154f3271eea32');
  const f=fixture();
  try {
    const paths=[];
    f.members.get('DB/DBManager').INTERFACE_PATH='skin/';
    f.members.set('Core/Client',{loadFile(path,ready){paths.push(path);ready('data:image/png;base64,AA==');}});
    const theme=createAssistantTheme(f.page,f.members);
    for(let i=0;i<2;i++){
      const host=f.page.document.createElement('div');const root=host.attachShadow({mode:'open'});theme.apply(root);theme.refresh();
      assert.equal(host.dataset.roCloseReady,'true');assert.match(host.style.getPropertyValue('--ro-close-image'),/^url/);
      assert.ok(root.querySelector('[data-lro-theme]'));
    }
    assert.deepEqual(paths.sort(),['titlebar_mid','sys_base_off','sys_close_off','sys_close_on','sys_mini_off','sys_mini_on'].map(name=>'skin/basic_interface/'+name+'.bmp').concat(['skin/checkbox_0.bmp','skin/checkbox_1.bmp']).sort());
  }finally{f.cleanup();}
});

test('native card data is passive and switching uses real native action without opening collection',async()=>{
  const f=fixture();
  try {
    const structure=function(){};f.members.get('Network/PacketStructure').ZC.CARDCONNECTION_RECHARGE_LIST=structure;
    const sent=[];let opened=0;
    const card=createCardCollectionComponent({...cardNative,
      GUIComponent:class{static MouseMode={STOP:0};getRoot(){return f.page.document.createElement('div');}},
      PACKET:{CZ:{REQUEST_CARDCONNECTION_CANCEL:class{},REQUEST_CARDCONNECTION_ADDMYDECK:class{}}},
      Network:{sendPacket(packet){sent.push(packet); if(packet.cardid===4001)card._data.data[0].data[1].cards=[];
        else {card._data.data[0].data[1].cards=[4002];card._data.data[1].data[1].recharge[1]=2;}}},
      DB:{getItemInfo:()=>({identifiedDisplayName:'卡片'})},Configs:{get:()=>5}
    });
    card._data={data:{0:{data:{1:{cards:[4001]}}},1:{data:{1:{cards:[4001,4002,4003],recharge:[2,1,0]}}}}};
    card.append=()=>opened++;
    f.members.set('UI/Components/CardConnection/CardConnection2',card);
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.gameplayVisible=true;app.cardDeck.setEnabled(true);
    assert.equal(await app.cardDeck.readCurrentDeck(),null,'static defaults are not server-confirmed');
    f.bus.emit(structure,{classInfos:[]},'after');
    assert.equal((await app.cardDeck.readCurrentDeck())[0].itid,'4001');
    const rejected=await app.cardDeck.prepareSwitch({id:'bad',name:'未充能',cards:[{itid:'4003'}]});
    assert.equal(rejected.ok,false);assert.equal(sent.length,0);
    const result=await app.cardDeck.prepareSwitch({id:'good',name:'已充能',cards:[{itid:'4002'}]});
    assert.equal(result.ok,true);assert.equal(sent.length,2);assert.equal(sent[0].tab,0);assert.equal(sent[0].level,1);
    assert.equal(opened,0);assert.equal((await app.cardDeck.readCurrentDeck())[0].itid,'4002');
    f.session.Entity={GID:201};assert.equal(nativeCardData(app),null,'different session cannot use previous cards');
  }finally{f.cleanup();}
});

test('party click uses one selected native skill and costume masking restores real values',()=>{
  const f=fixture();
  try{
    const calls=[];
    const selection={__active:true,TYPE:{PLACE:2},set(){},remove(){this.__active=false;},
      intersectEntityId:id=>calls.push(['id',id]),onUseSkillToPos:(...args)=>calls.push(['pos',...args])};
    f.members.set('UI/Components/SkillTargetSelection/SkillTargetSelection',selection);
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.partyBars.ensureHooks();app.partyBars.members.set('7',{state:0,name:'队友'});
    const event={preventDefault(){},stopImmediatePropagation(){}};
    selection.set({SKID:28,level:3},1);app.partyBars.selectSkillTarget('7',event);
    assert.deepEqual(calls,[['id',7]]);app.partyBars.selectSkillTarget('7',event);assert.equal(calls.length,1);
    selection.__active=true;selection.set({SKID:99,level:3},2);app.partyBars.selectSkillTarget('7',event);
    assert.equal(calls.length,1,'unsupported ground skill is not cast');
    selection.set({SKID:12,useLevel:4},2);app.partyBars.findMemberEntity=()=>({position:[30,40]});app.partyBars.selectSkillTarget('7',event);
    assert.deepEqual(calls[1],['pos',12,4,30,40]);
    const entity=f.session.Entity;entity._accessory2=3015;entity.files={accessory2:{spr:'real.spr'}};
    const original=entity.renderEntity=function(){assert.equal(this._accessory2,100);assert.equal(this.files.accessory2.spr,'normal.spr');};
    app.settings.hiddenCostumeSlots={upper:true};const costume=app.costumeVisibility;costume.enabled=true;costume.patchEntity(entity);
    costume.normalAppearance.upper={viewId:100,files:{spr:'normal.spr'}};entity.renderEntity();
    assert.equal(entity._accessory2,3015);assert.equal(entity.files.accessory2.spr,'real.spr');
    costume.setEnabled(false);assert.equal(entity.renderEntity,original);
  }finally{f.cleanup();}
});

test('local encyclopedia notes and native author draft work without external fetching or sending mail',async()=>{
  const f=fixture();
  try {
    f.page.fetch=()=>{throw new Error('must not fetch external references');};
    let draft='';f.members.set('UI/Components/Mail/Rodex',{requestOpenWriteRodex:name=>{draft=name;}});
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.gameplayVisible=true;app.openAuthorMail();assert.equal(draft,'加藤惠');
    app.encyclopedia.openFor({itemId:'501',itemName:'红色药水'});
    await Promise.resolve();assert.ok(app.shadow.querySelector('.encyclopedia-content a[href^="https://ro.dvg.cn/"]'));
    app.encyclopedia.editCurrent();const form=app.shadow.querySelector('.encyclopedia-form');form.querySelector('[name="notes"]').value='本服备注';
    app.encyclopedia.saveForm(form);assert.ok(app.encyclopedia.entries.some(entry=>String(entry.notes).includes('本服备注')));
    await app.openBountyMonster('冰巨人');assert.equal(app.shadow.querySelector('.monster-map-modal').hidden,false);
  }finally{f.cleanup();}
});

test('V2 ro-scene and shadow MiniMapV2 show the assistant; loading and login still hide it',()=>{
  const f=fixture();
  try {
    const canvas=f.page.document.getElementById('roRenderer');canvas.className='ro-scene';canvas.style.opacity='1';
    canvas.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:1024,bottom:768,width:1024,height:768});
    const host=f.page.document.createElement('div');host.id='MiniMapV2';
    const shadow=host.attachShadow({mode:'open'});const minimap=f.page.document.createElement('div');
    minimap.id='MiniMapV2';minimap.className='MiniMapUI';minimap.style.opacity='1';
    minimap.getBoundingClientRect=()=>({x:880,y:10,left:880,top:10,right:1008,bottom:158,width:128,height:148});
    shadow.append(minimap);f.page.document.body.append(host);
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.updateGameplayVisibility(true);assert.equal(app.host.hidden,false);assert.equal(app.gameplayVisible,true);
    const background=f.page.document.createElement('canvas');background.style.opacity='1';
    background.getBoundingClientRect=canvas.getBoundingClientRect;f.page.document.body.append(background);
    app.updateGameplayVisibility(true);assert.equal(app.host.hidden,true);
    background.remove();app.updateGameplayVisibility(true);assert.equal(app.host.hidden,false);
    const login=f.page.document.createElement('div');login.id='WinLogin';login.style.opacity='1';
    login.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});f.page.document.body.append(login);
    app.updateGameplayVisibility(true);assert.equal(app.host.hidden,true);
  }finally{f.cleanup();}
});

test('repeated installation creates one instance and saves in the real IndexedDB adapter',async()=>{
  const f=fixture();
  try {
    const options={enabled:true,page:f.page,profile:'lastro-2x',indexedDB:new IDBFactory(),modules:f.members,subscribePackets:f.bus.subscribe};
    const first=installLroAssistant(options);
    assert.equal(installLroAssistant(options),first);
    const installed=await first;
    installed.open();await installed.flush();
    assert.equal(f.page.document.querySelectorAll('#ro-market-assistant').length,1);
    assert.equal(installed.storageStatus.failed,false);
  }finally{f.cleanup();}
});

test('write failure is reported and subsequent flush never claims success',async()=>{
  const indexedDB=new IDBFactory();let database;let errors=0;
  const original=indexedDB.open.bind(indexedDB);
  indexedDB.open=(...args)=>{
    const request=original(...args);
    request.addEventListener('success',()=>{database=request.result;});return request;
  };
  const storage=await openAssistantStorage('lastro-2x',{indexedDB,onError:()=>errors++});
  database.transaction=()=>{throw new Error('simulated disk failure');};
  storage.setItem('ro-market-assistant:records:v1','[]');
  await assert.rejects(storage.flush(),/disk failure/);
  assert.equal(errors,1);assert.equal(storage.status.failed,true);
  assert.throws(()=>storage.setItem('ro-market-assistant:records:v1','[1]'),/disk failure/);
  await assert.rejects(storage.close(),/disk failure/);
});

test('real V2 equipment component exposes worn items and original equip/unEquip keep working',()=>{
  const f=fixture();
  try {
    const runtime=fs.readFileSync(new globalThis.URL('../generated/runtime/Online.js',import.meta.url),'utf8');
    const parsed=ts.createSourceFile('Online.js',runtime,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createEquipment');
    assert.ok(fn);
    const inventory={equippedItems:[]};
    const equipment=vm.runInNewContext(fn.getText(parsed)+'\ncreateEquipment({name:"EquipmentV0",htmlText:"",cssText:""})',{
      GUIComponent: class { constructor(name){this.name=name;this.ui={is:()=>false,find:()=>[]};} getRoot(){return f.page.document.createElement('div');}},
      Preferences:{get:()=>({save(){}})},UIManager:{addComponent:x=>x},
      addAssistantAwareListener,removeAssistantAwareListener,guardAssistantInputHandler,
      StatusState_default:{EffectState:{}},
      EquipmentLocation_default:{AMMO:32768},
      DB:{getItemInfo:()=>({identifiedResourceName:'fixture'}),INTERFACE_PATH:'data/'},
      Client:{loadFile(){}},InventoryController:{getUI:()=>inventory},getSelectorFromLocation$1:()=>'.slot',
    });
    f.members.set('UI/Components/Equipment/Equipment',equipment);
    f.members.set('DB/Items/EquipmentLocation',{WEAPON:2,ARMOR:16});
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const weapon={ITID:1701,index:3,location:2,WearState:2,type:4,IsIdentified:1};
    equipment.equip(weapon,2);
    app.gameplayVisible=true;
    assert.equal(app.equipmentOutfit.snapshot().worn[0].item.ITID,1701);
    app.refreshEquippedItemData();
    assert.equal(equipment.getNumber(),1);
    assert.equal(app.equippedItems.get('3').item.ITID,1701);
    assert.equal(equipment.unEquip(3,2).ITID,1701);
    assert.equal(app.equippedItems.has('3'),false);
  } finally {f.cleanup();}
});

test('damage is counted once across before/after notifications',async()=>{
  const f=fixture();
  try{
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    await new Promise(resolve=>globalThis.setTimeout(resolve,120));
    const structure=f.members.get('Network/PacketStructure').ZC.NOTIFY_ACT;
    const damage={GID:100,targetGID:300,damage:123,leftDamage:7,action:0,count:1};
    f.bus.emit(structure,damage,'before');f.bus.emit(structure,damage,'after');
    const report=app.dps.getReport();assert.equal(report.received,1);assert.equal(report.total.damage,130);assert.equal(report.errors,0);
  }finally{f.cleanup();}
});

test('inventory detail state does not treat equipment slots alone as read options',()=>{
  const f=fixture();
  try{
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const missing=app.itemOverview.normalizeItem({ITID:1701,index:3,location:2,type:4},'inventory');
    assert.equal(missing.detailsKnown,false);
    const empty=app.itemOverview.normalizeItem({ITID:1701,index:3,location:2,type:4,detailsKnown:true},'inventory');
    assert.equal(empty.detailsKnown,true);
    const normal=app.itemOverview.normalizeItem({ITID:501,index:4,type:0,count:10},'inventory');
    assert.equal(normal.equipmentLike,false);
    assert.equal(app.itemOverview.captureInventory(),undefined);
  }finally{f.cleanup();}
});

test('converted source has no userscript grants, external resources or dynamic evaluation',()=>{
  const s=fs.readFileSync(new globalThis.URL('../src/assistant/lro-assistant-standard.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/GM_|unsafeWindow|ro\.dvg\.cn|ro\.ro321\.com|latam-tools|\beval\s*\(|new Function\s*\(/);
  assert.match(s,/作者|加藤惠/);
});

test('native vending response records exact seller in shadow UI; duplicate slots and red checks survive',()=>{
  const f=fixture();
  try {
    const ZC=f.members.get('Network/PacketStructure').ZC;
    for(const name of ['PC_PURCHASE_ITEMLIST_FROMMC','PC_PURCHASE_ITEMLIST_FROMMC2','PC_PURCHASE_ITEMLIST_FROMMC3','PC_PURCHASE_ITEMLIST'])ZC[name]=function(){};
    const shops=[501,502].map(GID=>{
      const host=f.page.document.createElement('div');f.page.document.body.append(host);
      const root=host.attachShadow({mode:'open'});
      root.innerHTML='<div class="EntityRoom"><button><span class="title">同名测试店</span></button></div>';
      root.querySelector('.EntityRoom').getBoundingClientRect=()=>({left:GID-300,top:100,width:140,height:26,right:GID-160,bottom:126});
      return {GID,display:{name:'店主'+GID},position:[GID-400,100],onRoomEnter(){},room:{
        title:'',text:'',type:1,constructor:{Type:{BUY_SHOP:1}},node:{ui:[host],getRoot:()=>root}
      }};
    });
    f.members.set('Renderer/EntityManager',{get:id=>shops.find(s=>s.GID===id),forEach:fn=>shops.forEach(fn)});
    let storeType=0, nativeCalls=0;
    const store={Type:{VENDING_STORE:4},getCurrentType:()=>storeType,setType:t=>storeType=t,
      append(){},setList(){nativeCalls++;},ui:{find:()=>({text(){}})}};
    f.members.set('UI/Components/NpcStore/NpcStore',store);
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const runtime=fs.readFileSync(new globalThis.URL('../vendor/v2/Online.js',import.meta.url),'utf8');
    const parsed=ts.createSourceFile('Online.js',runtime,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='onVendingStoreList');
    assert.ok(fn);
    const native=vm.runInNewContext(fn.getText(parsed)+'\nonVendingStoreList',{
      NpcStore_default:store,EntityManager:f.members.get('Renderer/EntityManager'),
      Network:{sendPacket(){throw new Error('unexpected request');}}
    });
    const items=[{ITID:501,index:3,price:100,count:2},{ITID:501,index:4,price:100,count:2}];
    const deliver=(type,AID,list)=>{const packet={AID,itemList:list};f.bus.emit(type,packet,'before');native(packet);f.bus.emit(type,packet,'after');};
    // No DOM click event is needed; seller comes from the real native response.
    deliver(ZC.PC_PURCHASE_ITEMLIST_FROMMC3,502,items);
    assert.equal(nativeCalls,1);assert.equal(app.records.length,2);
    assert.ok(app.records.every(r=>r.shopId==='502'));
    assert.equal(new Set(app.records.map(r=>r.id)).size,2);
    const record=app.records[0], sign=shops[1].room.node.getRoot().querySelector('.EntityRoom');
    assert.equal(app.findRecordShopRoom(record),sign);
    assert.equal(app.findRecordShopRoom({...record,shopId:'999'}),null);
    assert.equal(app.findRecordShopRoom({...record,shopId:'',x:null,y:null}),null);
    assert.equal(app.findRecordShopRoom({...record,shopId:''}),sign);
    assert.equal(app.resolveVendingEntity('',record.shop,sign),shops[1]);
    app.highlightShop(record);
    assert.equal(app.highlightOverlays.length,1);
    assert.equal(app.highlightOverlays[0].target,sign);
    assert.equal(app.highlightOverlays[0].overlay.style.left,'197px');
    assert.equal(app.navigationOverlay,null);
    assert.match(app.lastScanSummary,/已用红框/);
    app.startCoordinateNavigation({...record,shopId:'999',x:900,y:900});
    assert.notEqual(app.navigationOverlay.firstChild.textContent,'?');
    assert.match(app.navigationOverlay.textContent,/约 \d+ 格/);
    app.clearShopHighlight();
    assert.equal(shops[0].room.node.getRoot().querySelector('.ro-shop-viewed-check'),null);
    const marker=shops[1].room.node.getRoot().querySelector('.ro-shop-viewed-check');
    assert.ok(marker);assert.equal(marker.style.color,'rgb(255, 38, 38)');
    f.bus.emit(ZC.PC_PURCHASE_ITEMLIST,{AID:501,itemList:items},'after');
    assert.equal(app.records.length,2);
    deliver(ZC.PC_PURCHASE_ITEMLIST_FROMMC2,501,items.slice(0,1));
    assert.equal(app.records.length,3);
    deliver(ZC.PC_PURCHASE_ITEMLIST_FROMMC,502,[]);
    assert.equal(app.records.length,1);assert.equal(app.records[0].shopId,'501');
    app.settings.viewedMarkersEnabled=false;app.refreshViewedShopMarkers();
    for(const shop of shops)assert.equal(shop.room.node.getRoot().querySelector('.ro-shop-viewed-check'),null);
  } finally {f.cleanup();}
});

test('target static classifications are marked and live fields win; tiny HP stays percentage-only',()=>{
  const reference=monsterReference(1796);
  assert.deepEqual(reference,{element:'无4',size:'中型',race:'人形',level:110});
  assert.equal(targetTraitText({},reference),'属性 无4* · 中型* · 人形*');
  assert.equal(targetTraitText({property:3,propertyLevel:2,size:2,race:6},reference),'属性 火2 · 大型 · 恶魔');
  assert.equal(monsterReference(999999),undefined);
  assert.equal(targetTraitText({property:null,size:null,race:null},undefined),'属性 ? · ? · ?');
  assert.deepEqual(tinyMonsterLife({GID:300,hp:13}),{gid:'300',hp:null,max:null,percent:65});
  assert.equal(tinyMonsterLife({GID:300,hp:21}),null);
});

test('target window receives native tiny HP and later absolute HP without fabricating max HP',async()=>{
  const f=fixture();
  try {
    const entity={GID:300,job:1796,objecttype:5,display:{name:'阿乌奴艾'},life:{},position:[50,50]};
    f.members.set('Renderer/EntityManager',{get:id=>id===300?entity:null,getFocusEntity:()=>entity,forEach(){}});
    const ZC=f.members.get('Network/PacketStructure').ZC;
    ZC.HP_INFO_TINY=function(){};ZC.NOTIFY_MONSTER_HP=function(){};
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    app.updateGameplayVisibility=()=>{};app.gameplayVisible=true;app.settings.targetWindowEnabled=true;
    await new Promise(resolve=>globalThis.setTimeout(resolve,250));
    const target=f.page.document.querySelector('#ro-target-window')?.shadowRoot;
    assert.ok(target);assert.match(target.querySelector('.traits').textContent,/无4\*/);
    assert.equal(target.querySelector('.hp-text').textContent,'血量未提供');
    f.bus.emit(ZC.HP_INFO_TINY,{GID:300,hp:13},'before');entity.life={hp:65,hp_max:100};
    await new Promise(resolve=>globalThis.setTimeout(resolve,200));
    assert.equal(target.querySelector('.hp-text').textContent,'65%');
    f.bus.emit(ZC.NOTIFY_MONSTER_HP,{AID:300,hp:500,maxhp:2000},'before');
    await new Promise(resolve=>globalThis.setTimeout(resolve,200));
    assert.match(target.querySelector('.hp-text').textContent,/500.*2,000.*25%/);
  } finally {f.cleanup();}
});

test('actual native storage, party and minimap factories expose read-only snapshots; late enabling recovers state',()=>{
  const f=fixture();
  try {
    const runtime=fs.readFileSync(new globalThis.URL('../generated/runtime/Online.js',import.meta.url),'utf8');
    const parsed=ts.createSourceFile('Online.js',runtime,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const factory=name=>parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(parsed);
    const cursorSource=factory('bindMouseEvents');
    assert.doesNotMatch(cursorSource,/addAssistantAwareListener|guardAssistantInputHandler/);
    installAssistantInputTracking(f.page);
    vm.runInNewContext(cursorSource+'\nbindMouseEvents();',{
      window:f.page,document:f.page.document,
      installLastroItemDrag,Mouse:{},GraphicsSettings:{cursor:true},
      Cursor:{ACTION:{DEFAULT:0,CLICK:1},setType(){},getActualType:()=>0}
    });
    const control=f.page.document.createElement('div');control.dataset.lroAssistantRoot='true';f.page.document.body.append(control);
    control.addEventListener('pointerdown',e=>e.preventDefault());
    const pointer=(target,type,x)=>target.dispatchEvent(new f.page.MouseEvent(type,{bubbles:true,composed:true,cancelable:true,clientX:x,clientY:20}));
    let gameMoves=0,gameReleases=0;
    addAssistantAwareListener(f.page,'pointermove',()=>gameMoves++,true);
    addAssistantAwareListener(f.page,'mouseup',()=>gameReleases++,true);
    pointer(control,'pointerdown',20);pointer(control,'pointermove',40);
    assert.equal(gameMoves,0);assert.equal(f.page.document.querySelector('.cursor').style.left,'40px');
    pointer(control,'pointerup',40);
    pointer(f.page.document.body,'pointermove',80);
    assert.equal(gameMoves,1);assert.equal(f.page.document.querySelector('.cursor').style.left,'80px');
    pointer(f.page.document.body,'mouseup',80);assert.equal(gameReleases,0);
    pointer(f.page.document.body,'mousedown',90);pointer(f.page.document.body,'mouseup',90);assert.equal(gameReleases,1);
    const prefs=new Map();
    const context={
      GUIComponent: class {static MouseMode={STOP:1};constructor(name){Object.assign(this,nativeComponent(f,name));}},
      Preferences:{get:(name,defaults)=>{if(!prefs.has(name))prefs.set(name,{...defaults,save(){}});return prefs.get(name);}},
      UIManager:{addComponent:x=>x},document:f.page.document,Image:f.page.Image,
      SessionStorage_default:f.session,Client:{loadFile(){}},
      DB:{INTERFACE_PATH:'',getMapName:()=>'',getItemInfo:()=>({}),getItemName:()=>''},
      ItemType_default:{HEALING:0,USABLE:2,DELAYCONSUME:18},
    };
    let opened = 0;
    Object.assign(context, {assistantIcon,ROConfig:{lroAssistantEnabled:true},installLastROCardMenuButton(){},
      addAssistantAwareListener,removeAssistantAwareListener,guardAssistantInputHandler});
    context.UIManager.getComponent=()=>({open(){opened++;}});
    const basic=vm.runInNewContext(factory('createBasicInfo')+'\ncreateBasicInfo({name:"BasicInfoV1",innerId:"#BasicInfoV1"})',context);
    basic.getRoot().querySelector('#BasicInfoV1').innerHTML='<div class="buttons"></div>';
    basic.draggable=()=>{};
    basic.init();basic.init();
    const entries=basic.getRoot().querySelectorAll('[data-lro-assistant-entry]');
    assert.equal(entries.length,1,'native toolbar entry is not duplicated');
    entries[0].dispatchEvent(new f.page.MouseEvent('mousedown',{bubbles:true}));
    entries[0].dispatchEvent(new f.page.MouseEvent('click',{bubbles:true}));
    assert.equal(opened,1,'native toolbar opens the registered assistant');
    const storage=vm.runInNewContext(factory('createStorage')+'\ncreateStorage({name:"StorageV1"})',context);
    storage.setItems([{ITID:501,index:1,count:10,type:0}]);
    assert.equal(storage.list,undefined);assert.equal(storage.lroReadItems()[0].count,10);
    storage.lroReadItems()[0].count=999;assert.equal(storage.lroReadItems()[0].count,10);
    f.members.set('UI/Components/Storage/Storage',storage);
    const party=vm.runInNewContext(factory('createPartyFriends')+'\ncreatePartyFriends({name:"PartyFriendsV1"})',context);
    party.addPartyMember({AID:700,characterName:'已入队',job:4012,state:0,life:{hp:200,hp_max:500}});
    f.members.set('UI/Components/PartyFriends/PartyFriends',party);
    const minimap=vm.runInNewContext(factory('createMiniMap')+'\ncreateMiniMap({name:"MiniMapV2"})',context);
    assert.equal(minimap.lroReadZoom(),0);minimap.updateZoom(2);assert.equal(minimap.lroReadZoom(),2);
    f.members.set('UI/Components/MiniMap/MiniMap',minimap);
    f.members.set('Renderer/Map/Altitude',{width:400,height:400});
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const overview=app.itemOverview;overview.enabled=true;overview.storageExpectedCount=1;
    assert.equal(overview.componentVisible(storage),true);overview.recoverOpenedStorage(storage,true);overview.captureContainer('storage');
    assert.equal(Object.values(overview.data.accounts)[0].storage[0].quantity,10);
    overview.ensureHooks();storage.addItem({ITID:501,index:1,count:3,type:0});overview.captureContainer('storage');
    assert.equal(Object.values(overview.data.accounts)[0].storage[0].quantity,13);
    storage.removeItem(1,4);overview.captureContainer('storage');
    assert.equal(Object.values(overview.data.accounts)[0].storage[0].quantity,9);
    assert.equal(storage.lroReadItems()[0].count,9);
    const source=nativeComponent(f,'InventoryV2','<div class="item" data-index="8"><span class="amount">7</span></div>');
    source.getItemByIndex=()=>({ITID:501,index:8,count:7});
    f.members.set('UI/Components/Inventory/Inventory',source);
    const quantity=nativeComponent(f,'InputBox');quantity._host.hidden=true;
    quantity.append=()=>{quantity._host.hidden=false;};quantity.remove=()=>{quantity._host.hidden=true;};quantity.setType=()=>{};
    f.members.set('UI/Components/InputBox/InputBox',quantity);
    const moves=[];storage.reqAddItem=(...args)=>moves.push(args);
    const decoration=f.page.document.createElement('div');decoration.hidden=true;
    storage.getRoot().prepend(decoration);storage.__active=true;
    const storageFactory=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createStorage');
    const drop=storageFactory.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='onDrop');
    const nativeDrop=vm.runInNewContext(drop.getText(parsed)+'\nonDrop;', {Component:storage,InputBox_default:quantity});
    storage._host.addEventListener('drop',nativeDrop);
    app.quickTransfer.setEnabled(true);
    const itemNode=source.getRoot().querySelector('.item');
    for(const type of ['mousedown','click'])itemNode.dispatchEvent(new f.page.MouseEvent(type,{bubbles:true,composed:true,cancelable:true,shiftKey:true,button:0}));
    assert.deepEqual(moves,[[8,7]],'one shift click moves the full stack exactly once through native drop');
    assert.equal(quantity._host.hidden,true);
    app.partyBars.enabled=true;app.partyBars.refreshEntities();
    assert.equal(app.partyBars.members.get('700').name,'已入队');assert.equal(app.partyBars.members.get('700').hp,200);
    party.setParty('',[]);app.partyBars.refreshEntities();assert.equal(app.partyBars.members.size,0);
    minimap.updateZoom(-2);assert.deepEqual(app.bossAlert.markerPosition({x:200,y:200},128),{x:64,y:64});
    assert.equal(prefs.has('MiniMap'),false);
    storage.remove();assert.equal(overview.componentVisible(storage),false);
  } finally {f.cleanup();}
});

test('shadow shop detail matches exact slot, stays tied to seller after click expires, and excludes NPC stores',()=>{
  const f=fixture();
  try {
    let type=4;
    const store=Object.assign(nativeComponent(f,'NpcStore','<div class="InputWindow"><div class="content"><div class="item" data-index="4" data-itid="501"><span class="name">测试装备501</span></div></div></div>'),{Type:{VENDING_STORE:4},getCurrentType:()=>type});
    const info=nativeComponent(f,'ItemInfo','<div class="optionlist"><div class="border">力量 + 5</div></div>');
    f.members.set('UI/Components/NpcStore/NpcStore',store);f.members.set('UI/Components/ItemInfo/ItemInfo',info);
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const context={map:'prontera',shop:'同名店',shopId:'502',seller:'店主'};
    app.records=[3,4].map(i=>({...context,id:'item-'+i,itemId:'501',itemName:'测试装备501',storeIndex:String(i),price:10,quantity:1,lastSeenAt:new Date().toISOString()}));
    app.currentNativeStoreSnapshot={context,records:app.records,capturedAt:Date.now()};
    app.lastClickedShop={at:0};
    const row=store.getRoot().querySelector('.item');
    assert.equal(app.findRecordForStoreRow(row).id,'item-4');
    assert.equal(app.findOpenStoreRow(app.records[1]),row);
    assert.equal(app.getShopContext(store.getRoot().querySelector('#NpcStore')).shopId,'502');
    app.rememberGameItemDetailRequest({target:store._host,composedPath:()=>[row,store._host]});
    app.captureItemInfoInstance({ITID:501,index:4});
    app.extractVisibleRandomOptions=()=>['力量 + 5'];
    app.captureAnyVisibleItemDetails();
    assert.deepEqual(app.records[1].randomOptions,['力量 + 5']);assert.equal(app.records[0].randomOptions,undefined);
    app.captureItemInfoInstance({ITID:501,index:8});
    assert.equal(app.captureAnyVisibleItemDetails(app.records[0]),null);
    type=0;assert.deepEqual(app.findShopContainers(),[]);assert.equal(app.findOpenStoreRow(app.records[1]),null);
    info.remove();assert.equal(app.findVisibleItemInfo(),null);
  } finally {f.cleanup();}
});

for(const outcome of ['sent','blocked','failed'])test('native async teleport waits for preflight: '+outcome,async()=>{
  const f=fixture();
  try{
    const data={mobData:{1002:{kName:'波利',LV:1}},worldData:{field:{name:'原野',mobs:[1002]}}};
    f.members.set('DB/WorldMapData',{load:async()=>data,navigationMobs:[]});
    let complete,reject,calls=0;
    const pending=new Promise((yes,no)=>{complete=yes;reject=no;});
    f.members.set('UI/WorldMapActions',{teleport:()=>{calls++;return pending;}});
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    await app.encyclopedia.openMonsterMap('1002','波利');
    const button=app.shadow.querySelector('.client-map-card button'),status=app.shadow.querySelector('.client-map-card span');
    button.click();button.click();
    assert.equal(calls,1);assert.equal(button.disabled,true);assert.equal(status.textContent,'正在检查目标地图…');
    if(outcome==='failed')reject(new Error('preflight failed'));else complete(outcome==='sent');
    await new Promise(resolve=>f.page.setTimeout(resolve,0));
    assert.equal(status.textContent,outcome==='sent'?'已提交原生传送请求，结果以游戏提示为准。':outcome==='blocked'?'当前无法使用原生传送。':'原生传送请求失败。');
  }finally{f.cleanup();}
});

for(const source of ['ltsd','manual'])test('detail encyclopedia opens the displayed '+source+' item even after list refresh',async()=>{
  const f=fixture();
  try{
    const app=createStandardAssistant({page:f.page,modules:f.members,storage:f.storage,subscribePackets:f.bus.subscribe});
    const first={id:source+'-901',itemId:'901',itemName:'辫子',source,price:111,quantity:301,shop:'99z平价',map:'morocc.gat',x:158,y:88};
    app.records=source==='manual'?[first]:[];
    app.showStoredItemDetails(first);
    // Website records are separate from local records; a refresh can replace both lists.
    app.records=[];
    app.shadow.querySelector('.detail-encyclopedia').click();
    assert.equal(app.shadow.querySelector('.encyclopedia-modal').hidden,false);
    assert.equal(app.encyclopedia.entries.find(e=>e.key===app.encyclopedia.currentKey).itemId,'901');
    app.encyclopedia.close();
    app.shadow.querySelector('.detail-close').click();
    assert.equal(app.detailRecord,null);
    const next={...first,id:source+'-902',itemId:'902',itemName:'树根'};
    app.showStoredItemDetails(next);app.shadow.querySelector('.detail-encyclopedia').click();
    assert.equal(app.encyclopedia.entries.find(e=>e.key===app.encyclopedia.currentKey).itemId,'902');
    await new Promise(resolve=>f.page.setTimeout(resolve,0));
  }finally{f.cleanup();}
});
