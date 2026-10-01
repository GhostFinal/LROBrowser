// Reuse the same packaged JSON loader as the native world map. No external
// reference sites, requests to game servers, or inferred spawn quantities.
export async function clientKnowledge(assistant) {
  const loader=assistant.getAmdModule('DB/WorldMapData');
  if (!loader?.load) throw new Error('客户端资料尚未就绪');
  return loader.load();
}

export function findClientMonsters(data, id, name) {
  const direct=data.mobData?.[id];
  if (direct) return [[String(id),direct]];
  const wanted=String(name || id || '').trim();
  return Object.entries(data.mobData || {}).filter(([,mob])=>String(mob.kName || '').trim()===wanted);
}

export function clientDropSources(data, itemId) {
  const results=[];
  for (const [id,mob] of Object.entries(data.mobData || {})) {
    for (const [prefix,countKey] of [['Drop','DropsNum'],['MVP','MvpDropsNum']]) {
      for (let index=0;index<(Number(mob[countKey]) || 0);index++) {
        if (Number(mob[`${prefix}${index}id`])!==Number(itemId)) continue;
        const name=mob.kName || `怪物 #${id}`,rate=`${Number(mob[`${prefix}${index}per`])/100}%`,kind=prefix==='Drop'?'普通掉落':'MVP 奖励';
        results.push({monsterId:id,name,rate,kind,label:`${name}（${rate}，${kind}）`});
      }
    }
  }
  return results;
}

export function mapMonsterCount(rows,mapId,mobId) {
  const normalize=value=>String(value || '').toLowerCase().replace(/\.(gat|rsw)$/,'');
  for(const row of Array.isArray(rows)?rows:Object.values(rows || {})) {
    if(!Array.isArray(row)||normalize(row[0])!==normalize(mapId))continue;
    if(row[3]===null || row[3]==='' || !Number.isInteger(Number(row[3])))continue;
    const packed=Number(row[3])>>>0;
    // Match the world's native navigation encoding: low 16 bits = monster,
    // high 16 bits = map population. Repeated rows must not inflate totals.
    if((packed&65535)===Number(mobId))return packed>>>16;
  }
  return null;
}

function mapCard(assistant,page,key,map,current,count) {
  const card=page.document.createElement('div');card.className='client-map-card';
  const title=page.document.createElement('strong');title.textContent=`${map.name || key} (${key})`;
  const population=page.document.createElement('div');population.className='client-map-population';
  population.textContent=count===null?'出没数量：未提供':`出没数量：${count} 只`;
  const image=page.document.createElement('img');image.alt=`${map.name || key} 地图`;image.hidden=true;
  const status=page.document.createElement('span');status.textContent='正在读取地图图像…';
  const button=page.document.createElement('button');button.type='button';button.textContent='传送';
  const actions=assistant.getAmdModule('UI/WorldMapActions');
  button.disabled=typeof actions?.teleport!=='function';
  if(button.disabled)button.title='原生传送功能尚未就绪';
  button.addEventListener('click',async()=>{
    if(button.disabled || !current())return;
    if(!assistant.getAmdModule('Engine/SessionStorage')?.Entity){status.textContent='请先进入游戏';return;}
    button.disabled=true;
    status.textContent='正在检查目标地图…';
    try{
      const sent=await actions.teleport(key);
      if(current())status.textContent=sent ? '已提交原生传送请求，结果以游戏提示为准。' : '当前无法使用原生传送。';
    }catch{if(current())status.textContent='原生传送请求失败。';}
    page.setTimeout(()=>{button.disabled=false;},1000);
  });
  card.append(title,population,image,status,button);
  const client=assistant.getAmdModule('Core/Client'),db=assistant.getAmdModule('DB/DBManager');
  let finished=false;
  const fail=()=>{if(!finished&&current()){finished=true;if(status.textContent==='正在读取地图图像…')status.textContent='客户端未提供这张地图的图像';}};
  const timeout=page.setTimeout(fail,8000);
  image.onload=()=>{if(current()){image.hidden=false;if(status.textContent==='正在读取地图图像…')status.textContent='';}};
  image.onerror=()=>{image.hidden=true;if(status.textContent==='正在读取地图图像…')status.textContent='地图图像加载失败';};
  try{
    if(!client?.loadFile || !db?.INTERFACE_PATH)fail();
    else client.loadFile(`${db.INTERFACE_PATH}map/${key}.bmp`,url=>{
      if(finished || !current())return;
      finished=true;page.clearTimeout(timeout);
      if(typeof url==='string'&&url)image.src=url;else{finished=false;fail();}
    },fail);
  }catch{fail();}
  return card;
}

export async function showClientMonster(encyclopedia,id,name,page) {
  const assistant=encyclopedia.assistant, shadow=assistant.shadow;
  const modal=shadow.querySelector('.monster-map-modal');
  const root=shadow.querySelector('.monster-map-content');
  const token={};encyclopedia.localMonsterRequest=token;
  shadow.querySelector('.monster-map-title').textContent=`${name || id} · 客户端资料`;
  modal.hidden=false;root.textContent='正在读取客户端世界地图资料…';
  const add=(tag,text)=>{const node=page.document.createElement(tag);node.textContent=text;root.append(node);return node;};
  try {
    const data=await clientKnowledge(assistant);
    if(encyclopedia.localMonsterRequest!==token) return;
    root.replaceChildren();
    const matches=findClientMonsters(data,id,name);
    if(!matches.length){add('p','客户端资料未收录该怪物。');return;}
    const db=assistant.getAmdModule('DB/DBManager');
    for(const [mobId,mob] of matches){
      add('strong',`${mob.kName || name} · #${mobId} · Lv.${mob.LV || '?'}`);
      const navigation=assistant.getAmdModule('DB/WorldMapData')?.navigationMobs;
      const maps=Object.entries(data.worldData || {}).filter(([,map])=>Array.isArray(map.mobs)&&map.mobs.some(value=>Number(value)===Number(mobId)))
        .map(([key,map])=>[key,map,mapMonsterCount(navigation,key,mobId)])
        .sort((a,b)=>(b[2]??-1)-(a[2]??-1)||a[0].localeCompare(b[0]));
      add('p',maps.length ? '出现地图' : '客户端未收录出现地图。');
      for(const [key,map,count] of maps)root.append(mapCard(assistant,page,key,map,()=>encyclopedia.localMonsterRequest===token&&!modal.hidden,count));
      const list=add('ul','');let count=0;
      for(const [prefix,countKey] of [['Drop','DropsNum'],['MVP','MvpDropsNum']]){
        for(let i=0;i<(Number(mob[countKey])||0);i++){
          const itemId=Number(mob[`${prefix}${i}id`]);if(!itemId)continue;
          const item=db?.getItemInfo?.(itemId);
          const row=page.document.createElement('li');
          row.textContent=`${item?.identifiedDisplayName || '物品 #'+itemId} · ${Number(mob[`${prefix}${i}per`])/100}%${prefix==='Drop'?'':' · MVP 奖励'}`;
          list.append(row);count++;
        }
      }
      if(!count)add('p','客户端未收录掉落资料。');
    }
    add('p','来源：客户端世界地图与导航资料。出没数量是资料表数量，不是当前存活数量；按数量由多到少排列，未提供数量的地图置后。');
  }catch(error){if(encyclopedia.localMonsterRequest===token)root.textContent=error.message || '客户端资料读取失败';}
}

export async function fillClientItemReference(encyclopedia,entry) {
  if(!entry)return;
  entry.referenceStatus='loading';
  try{
    const data=await clientKnowledge(encyclopedia.assistant);
    entry.referenceMonsterDropDetails=clientDropSources(data,entry.itemId);
    entry.referenceMonsterDrops=entry.referenceMonsterDropDetails.map(row=>row.label);
    // Discard old external reference fields, but preserve user's server notes.
    entry.referenceNpcSources=[];entry.referenceOtherSources=[];entry.referenceSuitableJobs=[];
    entry.referenceSourceNames=['客户端世界地图'];entry.referenceStatus='local';
  }catch{entry.referenceStatus='error';}
  if(encyclopedia.currentKey===entry.key&&!encyclopedia.editing)encyclopedia.renderCurrent();
}
