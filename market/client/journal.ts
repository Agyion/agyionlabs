/** Durable public recovery metadata. No seed, password, wallet signature or signed envelope.
 * IndexedDB + Web Locks protect this origin's tabs, not hostile same-origin code,
 * another browser, deleted storage, profile rollback or a malicious RPC provider. */
import {hash} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {address,decimal,exact,hex32,metadataBytes,parsePublication,publicationBytes,requireValue,TESTNET_NETWORK_ID,uint32} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
import type {PublicationReceipt} from './catalog.ts';
export const MARKET_ACTIONS=['register_merchant','create_offer','settle_walk_in','reserve','settle_reserved','cancel_reservation','expire_reservation','refund'] as const;
export type MarketAction=typeof MARKET_ACTIONS[number];
export interface MarketTransactionAttempt {version:1;kind:'transaction';intentId:string;releaseId:string;contract:string;source:string;action:MarketAction;hash:string;sequence:string;callHash:string}
export interface MarketPublicationAttempt {version:1;kind:'publication';releaseId:string;contract:string;source:string;hash:string;publication:Publication;signature:string}
export type MarketAttempt=MarketTransactionAttempt|MarketPublicationAttempt;
export type MarketRegistration=Readonly<{seller:string;publicKey:string;epoch:number}>;
export type MarketTerminal={hash:string;status:'confirmed';ledger:number;offerId:string|null;registration?:MarketRegistration}|{hash:string;status:'failed';ledger:number;offerId:null}|{hash:string;status:'known_not_sent';reason:'session_changed'|'state_changed'|'cancelled'|'read_failed'}|{hash:string;status:'accepted';receipt:PublicationReceipt};
export interface MarketJournalEntry {attempt:MarketAttempt;terminal:MarketTerminal|null}
export interface MarketJournal {
 exclusive<T>(run:()=>Promise<T>):Promise<T>;pending():Promise<readonly MarketAttempt[]>;
 history():Promise<readonly MarketJournalEntry[]>;get(hash:string):Promise<MarketJournalEntry|null>;byIntent(intentId:string):Promise<MarketJournalEntry|null>;
 commit(value:MarketAttempt):Promise<void>;finish(value:MarketTerminal):Promise<void>;close():void;
}
const digest=(v:unknown)=>hash(Buffer.from(JSON.stringify(v))).toString('hex');
function nonzero(v:unknown):string{const n=hex32(v);requireValue(n!=='00'.repeat(32),'INVALID_JOURNAL_HASH');return n;}
export function snapshotMarketAttempt(value:unknown):MarketAttempt {
 requireValue(value&&typeof value==='object');const kind=Object.getOwnPropertyDescriptor(value,'kind')?.value;
 const v=exact(value,['version','kind','releaseId','contract','source','hash',...(kind==='transaction'?['intentId','action','sequence','callHash']:['publication','signature'])]);requireValue(v.version===1);
 const base={version:1 as const,releaseId:nonzero(v.releaseId),contract:address(v.contract,true),source:address(v.source),hash:nonzero(v.hash)};
 if(kind==='transaction'){
  requireValue(base.source.startsWith('G')&&MARKET_ACTIONS.includes(v.action as MarketAction));const sequence=decimal(v.sequence,63);requireValue(BigInt(sequence)>0n);
  return Object.freeze({...base,kind:'transaction',intentId:nonzero(v.intentId),action:v.action as MarketAction,sequence,callHash:nonzero(v.callHash)});
 }
 requireValue(kind==='publication');const p=parsePublication(v.publication);requireValue(p.contract===base.contract&&p.seller===base.source&&typeof v.signature==='string'&&/^[0-9a-f]{128}$/.test(v.signature));
 requireValue(hash(Buffer.from(publicationBytes(p))).toString('hex')===base.hash&&hash(Buffer.from(metadataBytes(p.metadata))).toString('hex')===p.metadataHash,'JOURNAL_PUBLICATION_DIGEST');
 return Object.freeze({...base,kind:'publication',publication:Object.freeze({...p,metadata:Object.freeze(p.metadata)}),signature:v.signature});
}
export function marketReservationKeys(value:MarketAttempt):readonly string[]{
 const a=snapshotMarketAttempt(value);return Object.freeze(a.kind==='transaction'?[`testnet:source:${a.source}`,`testnet:${a.contract}:intent:${a.intentId}`]:[`testnet:${a.contract}:publication:${a.publication.offerId}`]);
}
function registration(value:unknown):MarketRegistration {
 requireValue(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===3,'INVALID_JOURNAL_REGISTRATION');
 const v=exact(value,['seller','publicKey','epoch']);
 return Object.freeze({seller:address(v.seller),publicKey:nonzero(v.publicKey),epoch:uint32(v.epoch,1)});
}
function terminal(value:unknown):MarketTerminal {
 requireValue(value&&typeof value==='object'&&Reflect.ownKeys(value).length===Object.keys(value).length);const status=Object.getOwnPropertyDescriptor(value,'status')?.value;
 if(status==='accepted'){
  const v=exact(value,['hash','status','receipt']),r=exact(v.receipt,['authority','networkId','contract','offerId','seller','keyEpoch','revision','digest','signatureHash','expiresAt','acceptedAt']),h=nonzero(v.hash);
  requireValue(r.authority==='accepted-publication'&&r.networkId===TESTNET_NETWORK_ID&&r.digest===h);
  const receipt:PublicationReceipt=Object.freeze({authority:'accepted-publication',networkId:TESTNET_NETWORK_ID,contract:address(r.contract,true),offerId:decimal(r.offerId),seller:address(r.seller),keyEpoch:uint32(r.keyEpoch,1),revision:uint32(r.revision,1),digest:h,signatureHash:hex32(r.signatureHash),expiresAt:uint32(r.expiresAt,1),acceptedAt:uint32(r.acceptedAt,1)});
  return Object.freeze({hash:h,status:'accepted',receipt});
 }
 if(status==='known_not_sent'){const v=exact(value,['hash','status','reason']);requireValue(['session_changed','state_changed','cancelled','read_failed'].includes(String(v.reason)));return Object.freeze({hash:nonzero(v.hash),status,reason:v.reason as Extract<MarketTerminal,{status:'known_not_sent'}>['reason']});}
 const hasRegistration=Object.hasOwn(value,'registration'),v=exact(value,['hash','status','ledger','offerId',...(hasRegistration?['registration']:[])]);requireValue(status==='confirmed'||status==='failed');const offerId=v.offerId===null?null:decimal(v.offerId);requireValue(offerId===null||BigInt(offerId)>0n);
 const common={hash:nonzero(v.hash),ledger:uint32(v.ledger,1)};
 if(status==='failed'){requireValue(offerId===null&&!hasRegistration,'JOURNAL_TERMINAL_REGISTRATION');return Object.freeze({...common,status,offerId:null});}
 return Object.freeze({...common,status,offerId,...(hasRegistration?{registration:registration(v.registration)}:{})});
}
function bindTerminal(a:MarketAttempt,t:MarketTerminal):void {
 requireValue(a.hash===t.hash,'JOURNAL_TERMINAL_HASH');
 if(a.kind==='transaction'){requireValue(t.status!=='accepted','JOURNAL_TERMINAL_KIND');if(t.status==='confirmed'){
  if(a.action==='create_offer')requireValue(t.offerId!==null,'JOURNAL_CREATED_OFFER_REQUIRED');
  if(t.registration)requireValue(a.action==='register_merchant'&&t.offerId===null&&t.registration.seller===a.source,'JOURNAL_TERMINAL_REGISTRATION');
 }return;}
 if(t.status==='known_not_sent'){requireValue(t.reason==='cancelled','JOURNAL_TERMINAL_KIND');return;}
 requireValue(t.status==='accepted','JOURNAL_TERMINAL_KIND');const p=a.publication,r=t.receipt;
 requireValue(r.contract===p.contract&&r.seller===p.seller&&r.offerId===p.offerId&&r.keyEpoch===p.keyEpoch&&r.revision===p.revision&&r.expiresAt===p.expiresAt&&r.signatureHash===hash(Buffer.from(a.signature,'hex')).toString('hex'),'JOURNAL_PUBLICATION_RECEIPT');
}
const req=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('MARKET_JOURNAL_STORAGE_FAILED'));});
const done=(t:IDBTransaction)=>new Promise<void>((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=t.onerror=()=>reject(new Error('MARKET_JOURNAL_STORAGE_FAILED'));});
export async function createMarketJournal(options:{name?:string;factory?:IDBFactory;locks?:LockManager}={}):Promise<MarketJournal>{
 const name=options.name??'agyion.market.public-attempts.v1';requireValue(/^[a-zA-Z0-9._-]{1,100}$/.test(name));
 const factory=options.factory??globalThis.indexedDB,locks=options.locks??globalThis.navigator?.locks;requireValue(factory&&locks&&typeof locks.request==='function','DURABLE_MARKET_STORAGE_REQUIRED');
 const open=factory.open(name,1);open.onupgradeneeded=()=>{for(const [store,keyPath]of [['attempts','hash'],['terminals','hash'],['reservations','key']])open.result.createObjectStore(store,{keyPath});};
 const db=await req(open);let closed=false;db.onversionchange=()=>{closed=true;db.close();};
 function tx(mode:IDBTransactionMode){requireValue(!closed,'MARKET_JOURNAL_CLOSED');return db.transaction(['attempts','terminals','reservations'],mode,{durability:'strict'});}
 async function audit(t:IDBTransaction){
  const stores=['attempts','terminals','reservations'];const counts=await Promise.all(stores.map(s=>req(t.objectStore(s).count())));requireValue(counts.every(n=>n<=2000),'MARKET_JOURNAL_CAPACITY');
  const [attempts,terminals,reservations]=await Promise.all(stores.map(s=>req(t.objectStore(s).getAll())));const rows=new Map<string,MarketJournalEntry>(),states=new Map<string,MarketTerminal>(),keys=new Map<string,string>(),intents=new Set<string>();
  for(const raw of terminals){const t=terminal(raw);requireValue(!states.has(t.hash));states.set(t.hash,t);}
  for(const raw of attempts){const stored=exact(raw,['hash','attempt','digest']),a=snapshotMarketAttempt(stored.attempt);requireValue(stored.hash===a.hash&&stored.digest===digest(a)&&!rows.has(a.hash),'MARKET_JOURNAL_CORRUPT');
   const state=states.get(a.hash)??null;if(state)bindTerminal(a,state);rows.set(a.hash,Object.freeze({attempt:a,terminal:state}));
   if(a.kind==='transaction'){const intent=a.intentId;requireValue(!intents.has(intent),'MARKET_JOURNAL_DUPLICATE_INTENT');intents.add(intent);}
   if(!state)for(const key of marketReservationKeys(a)){requireValue(!keys.has(key),'MARKET_JOURNAL_CONFLICT');keys.set(key,a.hash);}
  }
  requireValue([...states.keys()].every(h=>rows.has(h))&&reservations.length===keys.size,'MARKET_JOURNAL_ORPHAN');
  for(const raw of reservations){const r=exact(raw,['key','hash']);requireValue(typeof r.key==='string'&&keys.get(r.key)===r.hash,'MARKET_JOURNAL_RESERVATION');keys.delete(r.key);}requireValue(keys.size===0);return rows;
 }
 async function read<T>(extract:(rows:Map<string,MarketJournalEntry>)=>T):Promise<T>{const t=tx('readonly'),completed=done(t);try{const rows=await audit(t);await completed;return extract(rows);}catch(error){try{t.abort();}catch{}await completed.catch(()=>{});throw error;}}
 return Object.freeze({
  async exclusive<T>(run:()=>Promise<T>):Promise<T>{requireValue(!closed,'MARKET_JOURNAL_CLOSED');return locks.request('agyion:market:journal:'+name,{mode:'exclusive'},run);},
  history(){return read(rows=>Object.freeze([...rows.values()]));},
  pending(){return read(rows=>Object.freeze([...rows.values()].filter(r=>!r.terminal).map(r=>r.attempt)));},
  get(value:string){const h=nonzero(value);return read(rows=>rows.get(h)??null);},
  byIntent(value:string){const id=nonzero(value);return read(rows=>[...rows.values()].find(r=>r.attempt.kind==='transaction'&&r.attempt.intentId===id)??null);},
  async commit(value:MarketAttempt){const a=snapshotMarketAttempt(value),t=tx('readwrite'),completed=done(t);try{const rows=await audit(t);requireValue(rows.size<1000&&!rows.has(a.hash),'MARKET_JOURNAL_CAPACITY_OR_DUPLICATE');
   requireValue(a.kind!=='transaction'||![...rows.values()].some(r=>r.attempt.kind==='transaction'&&r.attempt.intentId===a.intentId),'MARKET_JOURNAL_DUPLICATE_INTENT');
   t.objectStore('attempts').add({hash:a.hash,attempt:a,digest:digest(a)});for(const key of marketReservationKeys(a))t.objectStore('reservations').add({key,hash:a.hash});await completed;
  }catch(error){try{t.abort();}catch{}await completed.catch(()=>{});throw error;}},
  async finish(value:MarketTerminal){const evidence=terminal(value),t=tx('readwrite'),completed=done(t);try{const rows=await audit(t),entry=rows.get(evidence.hash);requireValue(entry,'MARKET_ATTEMPT_REQUIRED');bindTerminal(entry.attempt,evidence);
   if(entry.terminal){requireValue(JSON.stringify(entry.terminal)===JSON.stringify(evidence),'MARKET_TERMINAL_CONFLICT');await completed;return;}
   t.objectStore('terminals').add(evidence);for(const key of marketReservationKeys(entry.attempt))t.objectStore('reservations').delete(key);await completed;
  }catch(error){try{t.abort();}catch{}await completed.catch(()=>{});throw error;}},
  close(){closed=true;db.close();},
 });
}
