import { componentRoot, componentVisible } from './lro-assistant-ui.mjs';

const receivedCards = new WeakMap();
export function trackNativeCardState(modules, subscribePackets) {
  const type=modules.get('Network/PacketStructure')?.ZC?.CARDCONNECTION_RECHARGE_LIST;
  if (!type) return;
  subscribePackets((structure, packet, phase)=>{
    if (structure!==type || phase!=='after' || !Array.isArray(packet?.classInfos)) return;
    const component=modules.get('UI/Components/CardConnection/CardConnection2');
    const session=modules.get('Engine/SessionStorage');
    if (component?._data && session?.Entity) receivedCards.set(component,session.Entity);
  });
}
export function nativeCardData(assistant) {
  const component=assistant.getAmdModule('UI/Components/CardConnection/CardConnection2');
  const entity=assistant.getAmdModule('Engine/SessionStorage')?.Entity;
  return entity && receivedCards.get(component)===entity ? component._data : null;
}
export function nativeDeck(assistant) {
  const data=nativeCardData(assistant);
  const cards=data?.data?.[0]?.data?.[1]?.cards;
  if (!Array.isArray(cards)) return null;
  return cards.slice(0,8).filter(id=>Number(id)>0).map(id=>({itid:String(id),name:assistant.cardDeck.itemName(id)}));
}
export function nativeCardSlot(assistant,itid) {
  const data=nativeCardData(assistant);
  if (!data) return {state:'unknown',tab:0,level:0};
  for (const [tab,group] of Object.entries(data.data || {})) {
    if (!Number(tab)) continue;
    for (const [level,row] of Object.entries(group.data || {})) {
      const slot=row.cards?.findIndex(id=>Number(id)===Number(itid));
      if (slot>=0) {
        const state=Number(row.recharge?.[slot]);
        return {tab:Number(tab),level:Number(level),state:state===2?'added':state===1?'ready':state===0?'uncharged':'unknown'};
      }
    }
  }
  return {state:'missing',tab:0,level:0};
}
export async function openNativeAuthorMail(assistant,page) {
  const status=assistant.shadow.querySelector('.support-mail-status');
  const compose=assistant.getAmdModule('UI/Components/Mail/RodexSend');
  const mailbox=assistant.getAmdModule('UI/Components/Mail/Rodex');
  status.hidden=false;
  if (componentVisible(compose,page)) {status.textContent='请先处理当前草稿，再打开给作者的邮件。';return;}
  if (!assistant.gameplayVisible || typeof mailbox?.requestOpenWriteRodex!=='function') {status.textContent='请进入游戏，等待邮箱就绪。';return;}
  mailbox.requestOpenWriteRodex('加藤惠');
  status.textContent='已请求原生写信窗口；请自行填写内容并确认发送。';
}
export function nativeDropRoot(component) {
  const root=componentRoot(component);
  // RodEx and trade bind drop to their item container; other inventory UIs bind
  // on the host. A composed event from the container supports both paths.
  return root?.querySelector?.('.items, .container_item, .container .content, .containerItem, .container-item, .container, .content')
    || component?._host || component?.ui?.[0] || root;
}
