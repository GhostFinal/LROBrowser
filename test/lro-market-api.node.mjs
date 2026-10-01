import test from 'node:test';
const {URL}=globalThis;
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installMarketApi,marketRecord,marketItemIds,sortMarketRecords,marketQueryIds,matchesMarketTerms,marketOptionFilters} from '../src/assistant/lro-market-api.mjs';

test('market records preserve option text and coordinates but never use website shop IDs as entity IDs',()=>{
 const r=marketRecord({id:1,itemId:501,price:10,quantity:2,mapName:'prontera',x:10,y:20,shopId:'shop_hash',options:[{type:5,value:7,param:0,display:'力量 +7'}],cards:[4001],lastChangedAt:1000},{getItemInfo:id=>({identifiedDisplayName:String(id)})});
 assert.equal(r.shopId,'');assert.equal(r.map,'prontera.gat');assert.equal(r.x,10);assert.deepEqual(r.options,['力量 +7']);
 assert.equal(marketRecord({id:1,itemId:2,price:-1,quantity:2}),null);
});

test('native names resolve exact IDs ahead of partial names; relevance and name sorting work',()=>{
 const table={611:{identifiedDisplayName:'放大镜'},612:{identifiedDisplayName:'高级放大镜'},613:{identifiedDisplayName:'狼卡片'}};
 assert.deepEqual(marketItemIds('放大镜',table),[611,612]);
 assert.deepEqual(marketItemIds('狼',table),[613]);
 const rows=[{itemName:'高级放大镜',price:1},{itemName:'放大镜',price:5},{itemName:'苍蝇翅膀',price:2}];
 assert.equal(sortMarketRecords(rows,'relevance','放大镜')[0].itemName,'放大镜');
 for(const sort of ['price','price-desc','name','recent','relevance'])assert.equal(sortMarketRecords(rows,sort,'',r=>r.itemName==='放大镜')[0].itemName,'放大镜');
 assert.deepEqual(sortMarketRecords(rows,'name',''),[...rows].sort((a,b)=>a.itemName.localeCompare(b.itemName,'zh-CN')));
});

test('API pagination, search reset, anonymous access, errors and local fallback',async()=>{
 const page=new JSDOM('<body></body>',{url:'https://example.test'}).window;
 try{
 const host=page.document.createElement('div');page.document.body.append(host);const root=host.attachShadow({mode:'open'});
 root.innerHTML='<input class="search"><input class="map-only" type="checkbox"><select class="sort"><option value="price">价格</option><option value="recent">时间</option></select><div class="filters"></div><div class="results"></div><div class="summary"></div><button class="market-more"></button>';
 const calls=[];let failure=false;
 page.fetch=async(url,options)=>{calls.push({url,options});if(failure)throw new TypeError('cors');return {ok:true,json:async()=>({items:[{id:url.includes('cursor=')?2:1,itemId:501,price:5,quantity:3,mapName:'prontera',x:1,y:2,options:[]}],nextCursor:url.includes('cursor=')?null:'next'})};};
 const original=[{id:'local'}];let localRenders=0;
 const app={shadow:root,records:original,currentMap:'prontera.gat',marketRenderedLimit:20,render(){localRenders++;},getAmdModule(){return {getItemInfo:()=>({identifiedDisplayName:"卡片"})};},findMarketDisplayRecord(){return null;},openRecordItemDetails(){},showAssistantView(){},showStoredItemDetails(){}};
 const api=installMarketApi(app,page,{queryDelay:0});assert.equal(calls.length,0);
 await api.load();await api.load(true);assert.equal(api.records.length,2);assert.match(calls[1].url,/cursor=next/);assert.equal(calls[0].options.credentials,'omit');
 assert.doesNotMatch(root.textContent,/传送到地图/);
 app.marketShoppingMatches=record=>record.id==='ltsd:2'?['测试清单']:[];app.render();
 assert.equal(root.querySelector('.results .row').dataset.recordId,'ltsd:2');
 assert.match(root.querySelector('.results .row').textContent,/求购.*购物清单匹配：测试清单/s);
 app.marketShoppingMatches=()=>[];app.render();assert.equal(root.querySelectorAll('.row.wanted').length,0);
 root.querySelector('.search').value='卡片';await api.load();assert.equal(api.records.length,1);assert.ok(new URL(calls[2].url).searchParams.get('q')==='卡片');assert.doesNotMatch(calls[2].url,/cursor=/);
 app.getAmdModule=name=>name==='DB/Items/ItemTable'?{611:{identifiedDisplayName:'放大镜'}}:null;
 root.querySelector('.search').value='放大镜';
 root.querySelector('.search').dispatchEvent(new page.Event('input'));
 const interval=page.setInterval(()=>app.render(),30);
 await new Promise(resolve=>page.setTimeout(resolve,550));page.clearInterval(interval);
 const nameRequest=calls.find(c=>new URL(c.url).searchParams.get('item_id')==='611');
 assert.ok(nameRequest,'periodic render must not starve the search debounce');
 assert.equal(new URL(nameRequest.url).searchParams.has('q'),false);
 assert.equal(api.records.length,0,'unrelated API item must not appear in an item ID search');
 failure=true;await api.load(false,true);assert.match(root.textContent,/跨域/);assert.equal(app.records,original);
 const selector=root.querySelector('[aria-label="市场数据来源"]');selector.value='local';selector.dispatchEvent(new page.Event('change'));assert.ok(localRenders>0);assert.match(root.textContent,/本地记录/);
 }finally{page.close();}
});

test('saved shopping list fetches missing items before general results and fuzzy search includes variants',async()=>{
 const page=new JSDOM('<body></body>').window;
 try{
 const host=page.document.createElement('div');page.document.body.append(host);const root=host.attachShadow({mode:'open'});
 root.innerHTML='<input class="search"><input class="map-only" type="checkbox"><select class="sort"><option value="price">价格</option></select><div class="filters"></div><div class="results"></div><div class="summary"></div><button class="market-more"></button>';
 const table={611:{identifiedDisplayName:'放大镜'},612:{identifiedDisplayName:'高级放大镜'},501:{identifiedDisplayName:'红色药水'}};
 const calls=[];
 page.fetch=async url=>{const p=new URL(url).searchParams;calls.push(p);const id=Number(p.get('item_id')||(p.has('option')?612:501));return {ok:true,json:async()=>({items:[{id,itemId:id,price:id===501?1:10000,quantity:1,mapName:'prontera',options:(id===612||id===625)?[{display:'ATK +10'}]:[]}],nextCursor:id===625&&!p.has('cursor')?'more':null})};};
 const app={shadow:root,settings:{shoppingList:[]},records:[],currentMap:'prontera.gat',render(){},findMarketDisplayRecord(){},openRecordItemDetails(){},showAssistantView(){},getAmdModule:name=>name==='DB/Items/ItemTable'?table:name==='DB/DBManager'?{getItemInfo:id=>table[id]}:null,marketShoppingMatches:r=>app.settings.shoppingList.filter(w=>r.itemName.includes(w))};
 const api=installMarketApi(app,page,{queryDelay:0});root.querySelector('.map-only').checked=true;await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['501']);
 app.settings.shoppingList=['放大镜'];app.render();
 await new Promise(resolve=>page.setTimeout(resolve,550));
 assert.deepEqual([...root.querySelectorAll('.row')].map(r=>r.dataset.recordId),['ltsd:611','ltsd:612','ltsd:501']);
 assert.equal(root.querySelectorAll('.row.wanted').length,2);
 assert.ok(calls.every(p=>p.get('map')==='prontera'));
 root.querySelector('.search').value='放大镜';await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['611','612']);
 root.querySelector('.search').value='atk';await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['612'],'single option keyword uses structured option query');
 const beforeRepeat=calls.length;await api.load();assert.equal(calls.length,beforeRepeat,'recent repeated queries use result cache');
 root.querySelector('.search').value='放大镜 atk';await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['612']);
 for(let id=620;id<=625;id++)table[id]={identifiedDisplayName:`测试${id}拳刃`};
 root.querySelector('.search').value='拳刃';const start=calls.length;await api.load();
 assert.equal(api.records.length,6);assert.equal(calls.slice(start).filter(p=>p.has('item_id')).length,6,'single keyword fetches candidate first pages without following cursors');
 root.querySelector('.search').value='拳刃 atk';await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['625']);
 await api.load(true);assert.ok(calls.some(p=>p.get('item_id')==='625'&&p.has('cursor')),'additional pages remain available on demand');
 root.querySelector('.search').value='';app.settings.shoppingList=[];await api.load();
 assert.deepEqual(api.records.map(r=>r.itemId),['501']);assert.equal(root.querySelectorAll('.row.wanted').length,0);
 }finally{page.close();}
});

 test('multi-term AND matches across names and options, case-insensitively, without shop title false positives',()=>{
 const table={1:{identifiedDisplayName:'十字弓'},2:{identifiedDisplayName:'猎人弓'},3:{identifiedDisplayName:'短剑'}};
 assert.deepEqual(marketQueryIds('弓 atk',table),[1,2]);
 const r={itemName:'十字弓',options:['ATK +10','DEX +2'],shop:'弓 atk'};
 assert.equal(matchesMarketTerms(r,' 弓   atk '),true);
 assert.equal(matchesMarketTerms(r,'弓 atk dex'),true);
 assert.equal(matchesMarketTerms(r,'弓 atk str'),false);
 assert.equal(matchesMarketTerms({...r,options:[],shop:'普通店'},'弓 atk'),false);
 assert.equal(matchesMarketTerms({...r,itemName:'短剑',shop:'普通店'},'弓 atk'),false);
 });

 test('option queries and field priority include name then options then shop',()=>{
 const groups=marketOptionFilters('atk');assert.ok(groups.flat().includes('17:neq:0'));assert.ok(groups.every(g=>g.length<=8));
 const rows=[{itemName:'短剑',options:[],shop:'ATK店',price:1},{itemName:'短剑',options:['ATK+10'],shop:'店',price:2},{itemName:'ATK测试装备',options:[],shop:'店',price:99}];
 assert.ok(rows.every(r=>matchesMarketTerms(r,'atk')));
 assert.deepEqual(sortMarketRecords(rows,'relevance','atk'),[rows[2],rows[1],rows[0]]);
 });
