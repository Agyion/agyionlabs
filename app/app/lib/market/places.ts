/** Local discovery only. City labels and coordinates never authorize payments. */
export type PickupArea=[west:number,south:number,east:number,north:number];
export type PickupPlace=Readonly<{id:number;name:string;region:string;country:string;latE6:number;lonE6:number;aliases:string}>;
const MAX_BYTES=12_000_000;
const INDEX='/places/cities-20260927.json';
function invalid():never{throw Error('PLACE_INDEX_INVALID');}
function normalize(value:string){return value.toLowerCase().replaceAll('ı','i').replaceAll('ß','ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[\s,]+/g,' ').trim();}

/** A neighborhood box, rounded to about 100m before use. No exact GPS point is
 * stored or sent to the catalog. Clamp at projection/date-line boundaries. */
export function pickupArea(latitude:number,longitude:number):PickupArea{
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>85.051128||Math.abs(longitude)>180)throw Error('LOCATION_UNAVAILABLE');
 const lat=Math.round(latitude*1000)/1000,lon=Math.round(longitude*1000)/1000;
 const dx=Math.min(1,0.045/Math.cos(lat*Math.PI/180));
 return [Math.max(-180e6,Math.floor((lon-dx)*1e6)),Math.max(-85051128,Math.floor((lat-0.045)*1e6)),Math.min(180e6,Math.ceil((lon+dx)*1e6)),Math.min(85051128,Math.ceil((lat+0.045)*1e6))];
}
export function parsePlaceIndex(value:unknown):readonly PickupPlace[]{
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='cities,version')invalid();
  const v=value as {version:unknown;cities:unknown};
  if(v.version!==1||!Array.isArray(v.cities)||v.cities.length>50000)invalid();
  const ids=new Set<number>();
  return Object.freeze(v.cities.map(row=>{
   if(!Array.isArray(row)||row.length!==7)invalid();const [id,name,region,country,latE6,lonE6,aliases]=row;
   if(!Number.isSafeInteger(id)||id<=0||ids.has(id)||typeof name!=='string'||!name.trim()||name.length>200||typeof region!=='string'||region.length>200||typeof country!=='string'||! /^[A-Z]{2}$/.test(country)||!Number.isSafeInteger(latE6)||Math.abs(latE6)>85051128||!Number.isSafeInteger(lonE6)||Math.abs(lonE6)>180e6||typeof aliases!=='string'||aliases.length>3000)invalid();
   ids.add(id);return Object.freeze({id,name,region,country,latE6,lonE6,aliases});
  }));
 }catch{invalid();}
}
export function searchPlaces(places:readonly PickupPlace[],input:string):readonly PickupPlace[]{
 if(typeof input!=='string'||input.length>120)return [];
 const query=normalize(input);if(query.length<2)return [];
 const tokens=query.split(' '),matches:{place:PickupPlace;rank:number}[]=[];
 for(const place of places){
  const name=normalize(place.name),text=`${place.aliases}|${normalize(place.region)}|${place.country.toLowerCase()}`;
  if(tokens.every(token=>text.includes(token)))matches.push({place,rank:name===query?0:name.startsWith(query)?1:2});
 }
 return matches.sort((a,b)=>a.rank-b.rank).slice(0,8).map(m=>m.place);
}
export async function loadPlaceIndex(options:{signal?:AbortSignal;fetch?:typeof fetch}={}):Promise<readonly PickupPlace[]>{
 options.signal?.throwIfAborted();
 const control=new AbortController(),cancel=()=>control.abort(options.signal?.reason),timer=setTimeout(()=>control.abort(),15000);
 options.signal?.addEventListener('abort',cancel,{once:true});
 try{
  const response=await (options.fetch??globalThis.fetch)(INDEX,{credentials:'omit',redirect:'error',signal:control.signal});
  if(!response.ok||!response.body)invalid();
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))invalid();
  const stream=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)invalid();chunks.push(value);}}
  catch(error){await stream.cancel().catch(()=>{});throw error;}finally{stream.releaseLock();}
  control.signal.throwIfAborted();const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return parsePlaceIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{return invalid();}
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
