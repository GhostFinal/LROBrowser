import { MONSTER_REFERENCE } from './lro-monster-reference.mjs';

const elements = ['无','水','地','火','风','毒','圣','暗','念','不死'];
const races = ['无形','不死','动物','植物','昆虫','鱼贝','恶魔','人形','天使','龙族'];
const sizes = ['小型','中型','大型'];
const number = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
};

export function monsterReference(id) {
  const row = MONSTER_REFERENCE[Number(id)];
  if (!row) return undefined;
  // Static reference facts must never be used as current or maximum live HP.
  return { element: elements[row[0]] + row[1], size: sizes[row[2]], race: races[row[3]], level: row[4] };
}

export function targetTraitText(entity, reference) {
  const property = number(entity?.property,entity?._property,entity?.element,entity?.elementType);
  const type = property === null ? null : Math.trunc(property) % 20;
  const level = number(entity?.propertyLevel,entity?.elementLevel,entity?.elementLv)
    ?? (property === null ? 1 : Math.floor(property / 20) + 1);
  const element = type !== null && elements[type] ? elements[type] + Math.max(1,Math.min(4,Math.trunc(level))) : '';
  const size = sizes[number(entity?.size,entity?._size,entity?.sizeType)] ?? '';
  const race = races[number(entity?.raceType,entity?.race,entity?._race,entity?.raceId)] ?? '';
  const display = (live, fallback) => live || (fallback ? fallback + '*' : '?');
  return `属性 ${display(element,reference?.element)} · ${display(size,reference?.size)} · ${display(race,reference?.race)}`;
}

export function tinyMonsterLife(packet) {
  const gid = packet?.GID ?? packet?.AID;
  const raw = packet?.hp;
  if (gid === undefined || gid === null || raw === null || raw === undefined || raw === '') return null;
  const hp = Number(raw);
  if (!Number.isInteger(hp) || hp < 0 || hp > 20) return null;
  return { gid:String(gid),hp:null,max:null,percent:hp * 5 };
}

const portraits = new WeakMap();
export function monsterPortrait(entity, memory, frameCanvas, document) {
  const files = entity?.files?.body;
  let spr = files?.sprData;
  if (!spr && files?.spr && memory?.exist?.(files.spr)) spr = memory.get(files.spr);
  if (!spr || typeof spr !== 'object' || !spr.frames?.length) return '';
  if (portraits.has(spr)) return portraits.get(spr);
  // Reuse the loaded monster's own sprite, without requesting external images
  // or changing its render state. Use one static body frame and crop whitespace.
  for (let index=0; index<Math.min(spr.frames.length,32); index++) {
    const data = spr.frames[index];
    if (!data || data.width > 2048 || data.height > 2048) continue;
    const frame = frameCanvas(spr,spr,index,false);
    const ctx = frame?.getContext('2d');if (!ctx) continue;
    const pixels = ctx.getImageData(0,0,frame.width,frame.height).data;
    let left=frame.width,top=frame.height,right=-1,bottom=-1;
    for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++) {
      if (!pixels[(y*frame.width+x)*4+3]) continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left || bottom<top)continue;
    const canvas=document.createElement('canvas');canvas.width=50;canvas.height=50;
    const output=canvas.getContext('2d');if(!output)return '';
    const width=right-left+1,height=bottom-top+1,scale=Math.min(48/width,48/height);
    output.imageSmoothingEnabled=false;
    output.drawImage(frame,left,top,width,height,(50-width*scale)/2,(50-height*scale)/2,width*scale,height*scale);
    const url=canvas.toDataURL('image/png');portraits.set(spr,url);return url;
  }
  portraits.set(spr,'');return '';
}
