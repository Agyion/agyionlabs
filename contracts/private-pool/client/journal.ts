/** Same-origin durable public transaction recovery. No secrets, proofs or XDR.
 * IndexedDB atomic unique reservations + Web Locks coordinate this application
 * across tabs. They do not protect against hostile same-origin code, profile
 * deletion, another browser/device or storage rollback. Keep the default name
 * stable. Unknown attempts never expire or release reservations automatically.
 */
import {Buffer} from 'buffer';
import {hash,Networks,StrKey} from '@stellar/stellar-sdk';
import {fieldBytes} from './adapter.ts';

export interface PendingIntent {
  releaseId:string; pool:string; source:string; recordId:string; publicSignals:readonly string[];
}
export interface PublicAttempt extends PendingIntent {
  version:1; hash:string; sequence:string; callHash:string; retryOf:string|null;
}
export type TerminalEvidence = {hash:string;status:'confirmed'|'failed';ledger:number} |
  {hash:string;status:'known_not_sent';reason:'session_changed'|'checkpoint_changed'|'read_failed'|'cancelled'};
export interface JournalEntry {attempt:PublicAttempt;terminal:TerminalEvidence|null}
export interface SubmissionJournal {
  exclusive<T>(operation:()=>Promise<T>):Promise<T>;
  conflicts(intent:PendingIntent):Promise<readonly PublicAttempt[]>;
  find(intent:PendingIntent):Promise<JournalEntry|null>;
  pending():Promise<readonly PublicAttempt[]>;
  commit(attempt:PublicAttempt):Promise<void>;
  get(hash:string):Promise<JournalEntry|null>;
  terminal(evidence:TerminalEvidence):Promise<void>;
}
function ensure(ok:unknown,code:string):asserts ok {if(!ok)throw new Error(code);}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
 ensure(!!value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype,'JOURNAL_INVALID_RECORD');
 ensure(Reflect.ownKeys(value).length===keys.length,'JOURNAL_INVALID_RECORD');const copy:Record<string,unknown>={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);ensure(d&&'value'in d&&d.enumerable,'JOURNAL_INVALID_RECORD');copy[key]=d.value;}
 return copy;
}
function h(value:unknown):string{ensure(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)&&!/^0+$/.test(value),'JOURNAL_INVALID_HASH');return value;}
export function snapshotIntent(value:PendingIntent):PendingIntent {
 const v=exact(value,['releaseId','pool','source','recordId','publicSignals']);
 ensure(typeof v.pool==='string'&&StrKey.isValidContract(v.pool)&&typeof v.source==='string'&&StrKey.isValidEd25519PublicKey(v.source),'JOURNAL_INVALID_ADDRESS');
 ensure(Array.isArray(v.publicSignals)&&v.publicSignals.length===157&&Reflect.ownKeys(v.publicSignals).length===158,'JOURNAL_INVALID_SIGNALS');
 const fields=Array.from({length:157},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v.publicSignals,String(i));
  ensure(d&&'value'in d&&d.enumerable&&typeof d.value==='string'&&/^(0|[1-9][0-9]*)$/.test(d.value)&&d.value.length<=77,'JOURNAL_INVALID_SIGNALS');
  fieldBytes(BigInt(d.value));return d.value as string;});
 const recordId=h(v.recordId);ensure(hash(Buffer.concat(fields.slice(23).map(n=>fieldBytes(BigInt(n))))).toString('hex')===recordId,'JOURNAL_RECORD_DIGEST');
 return Object.freeze({releaseId:h(v.releaseId),pool:v.pool,source:v.source,recordId,publicSignals:Object.freeze(fields)});
}
export function snapshotAttempt(value:PublicAttempt):PublicAttempt {
 const v=exact(value,['version','hash','sequence','callHash','retryOf','releaseId','pool','source','recordId','publicSignals']);
 ensure(v.version===1&&typeof v.sequence==='string'&&/^[1-9][0-9]{0,18}$/.test(v.sequence)&&BigInt(v.sequence)<1n<<63n,'JOURNAL_INVALID_SEQUENCE');
 const intent=snapshotIntent({releaseId:v.releaseId,pool:v.pool,source:v.source,recordId:v.recordId,publicSignals:v.publicSignals} as PendingIntent);
 return Object.freeze({version:1,hash:h(v.hash),sequence:v.sequence,callHash:h(v.callHash),retryOf:v.retryOf===null?null:h(v.retryOf),...intent});
}
export function reservationKeys(value:PendingIntent):readonly string[]{
 const v=snapshotIntent(value),scope=Networks.TESTNET+'|'+v.pool;
 return Object.freeze([Networks.TESTNET+'|source|'+v.source,scope+'|record|'+v.recordId,
  ...v.publicSignals.slice(12,14).filter(n=>n!=='0').map(n=>scope+'|nf|'+n),
  ...v.publicSignals.slice(14,16).filter(n=>n!=='0').map(n=>scope+'|cm|'+n)]);
}
function terminalOf(value:TerminalEvidence):TerminalEvidence {
 const keys=value?.status==='known_not_sent'?['hash','status','reason']:['hash','status','ledger'];const v=exact(value,keys),id=h(v.hash);
 if(v.status==='known_not_sent'){
  ensure(['session_changed','checkpoint_changed','read_failed','cancelled'].includes(String(v.reason)),'JOURNAL_INVALID_TERMINAL');
  return Object.freeze({hash:id,status:v.status,reason:v.reason as Extract<TerminalEvidence,{status:'known_not_sent'}>['reason']});
 }
 ensure((v.status==='confirmed'||v.status==='failed')&&Number.isInteger(v.ledger)&&Number(v.ledger)>0&&Number(v.ledger)<2**32,'JOURNAL_INVALID_TERMINAL');
 return Object.freeze({hash:id,status:v.status,ledger:v.ledger as number});
}
const digest=(attempt:PublicAttempt)=>hash(Buffer.from(JSON.stringify(attempt))).toString('hex');
function stored(value:unknown):PublicAttempt {
 const v=exact(value,['hash','attempt','digest']),a=snapshotAttempt(v.attempt as PublicAttempt);
 ensure(v.hash===a.hash&&v.digest===digest(a),'JOURNAL_CORRUPT_RECORD');return a;
}
function req<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('JOURNAL_STORAGE_FAILED'));});}
function complete(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('JOURNAL_STORAGE_FAILED'));});}
function intentOf(a:PendingIntent):PendingIntent{return {releaseId:a.releaseId,pool:a.pool,source:a.source,recordId:a.recordId,publicSignals:a.publicSignals};}
const intentKey=(a:PendingIntent)=>JSON.stringify(snapshotIntent(intentOf(a)));
const MAX_ATTEMPTS=10_000,MAX_RESERVATIONS=60_000;

export async function createIndexedDbSubmissionJournal(options:{name?:string;factory?:IDBFactory;locks?:LockManager}={}):Promise<SubmissionJournal&{close():void}>{
 const name=options.name??'agyion.private-pool.public-attempts.v2';
 ensure(/^[a-zA-Z0-9._-]{1,100}$/.test(name),'JOURNAL_INVALID_NAME');
 const factory=options.factory??globalThis.indexedDB,locks=options.locks??globalThis.navigator?.locks;
 ensure(factory&&locks&&typeof locks.request==='function','DURABLE_BROWSER_STORAGE_REQUIRED');
 const open=factory.open(name,1);
 open.onupgradeneeded=()=>{for(const [store,keyPath] of [['attempts','hash'],['terminals','hash'],['reservations','key']])open.result.createObjectStore(store,{keyPath});};
 const db=await req(open);let closed=false;db.onversionchange=()=>{closed=true;db.close();};
 function transaction(mode:IDBTransactionMode){ensure(!closed,'JOURNAL_CLOSED');
  // strict durability requests that completion follow durable flush where the
  // browser implements it; no localStorage fallback is provided.
  return db.transaction(['attempts','terminals','reservations'],mode,{durability:'strict'});
 }
 // Cross-check all three stores within the SAME transaction. Atomic writes
 // prevent partial crash commits; this additionally detects missing/corrupt
 // links that could otherwise silently remove a pending NF/source reservation.
 // Bound the retained history explicitly; never truncate a safety audit.
 async function audit(tx:IDBTransaction){
  const names=['attempts','terminals','reservations'],limits=[MAX_ATTEMPTS,MAX_ATTEMPTS,MAX_RESERVATIONS];
  const counts=await Promise.all(names.map(name=>req(tx.objectStore(name).count())));
  ensure(counts.every((n,i)=>n<=limits[i]),'JOURNAL_CAPACITY_REQUIRES_RECOVERY');
  const [bases,terminals,reservations]=await Promise.all(names.map(name=>req(tx.objectStore(name).getAll())));
  const outcomes=new Map<string,TerminalEvidence>();for(const raw of terminals){const e=terminalOf(raw);ensure(!outcomes.has(e.hash),'JOURNAL_CORRUPT_RECORD');outcomes.set(e.hash,e);}
  const entries=new Map<string,JournalEntry>(),expected=new Map<string,string>();
  for(const raw of bases){const a=stored(raw),terminal=outcomes.get(a.hash)??null;ensure(!entries.has(a.hash),'JOURNAL_CORRUPT_RECORD');entries.set(a.hash,Object.freeze({attempt:a,terminal}));
   if(!terminal)for(const key of reservationKeys(intentOf(a))){ensure(!expected.has(key),'JOURNAL_CORRUPT_RESERVATION');expected.set(key,a.hash);}}
  ensure([...outcomes.keys()].every(id=>entries.has(id)),'JOURNAL_ORPHAN_TERMINAL');
  ensure(reservations.length===expected.size,'JOURNAL_CORRUPT_RESERVATION');
  for(const raw of reservations){const r=exact(raw,['key','hash']);ensure(typeof r.key==='string'&&expected.get(r.key)===h(r.hash),'JOURNAL_CORRUPT_RESERVATION');expected.delete(r.key);}
  ensure(expected.size===0,'JOURNAL_CORRUPT_RESERVATION');
  const children=new Map<string,string>(),roots=new Set<string>();
  for(const {attempt:a} of entries.values()){
   if(a.retryOf===null){const key=intentKey(a);ensure(!roots.has(key),'JOURNAL_DUPLICATE_INTENT');roots.add(key);continue;}
   const previous=entries.get(a.retryOf);ensure(previous&&previous.terminal?.status==='known_not_sent'&&intentKey(a)===intentKey(previous.attempt)&&!children.has(a.retryOf),'JOURNAL_INVALID_RETRY');children.set(a.retryOf,a.hash);
  }
  // Prevent a corrupted cyclic ancestry from hiding a missing first attempt.
  for(const {attempt:a} of entries.values()){let current=a;const seen=new Set<string>();while(current.retryOf!==null){ensure(!seen.has(current.hash),'JOURNAL_INVALID_RETRY');seen.add(current.hash);current=entries.get(current.retryOf)!.attempt;}}
  const latest=new Map<string,JournalEntry>();for(const entry of entries.values())if(!children.has(entry.attempt.hash)){const key=intentKey(entry.attempt);ensure(!latest.has(key),'JOURNAL_DUPLICATE_INTENT');latest.set(key,entry);}
  return {entries,latest};
 }
 return Object.freeze({
  async exclusive<T>(operation:()=>Promise<T>):Promise<T>{ensure(!closed,'JOURNAL_CLOSED');return locks.request('agyion.private-pool.submit|'+name,{mode:'exclusive'},operation);},
  async conflicts(intent:PendingIntent){
   const keys=new Set(reservationKeys(intent)),tx=transaction('readonly'),done=complete(tx);
   try{
    const state=await audit(tx);await done;
    return Object.freeze([...state.entries.values()].filter(e=>!e.terminal&&reservationKeys(intentOf(e.attempt)).some(k=>keys.has(k))).map(e=>e.attempt));
   }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  },
  async find(intent:PendingIntent){const key=intentKey(intent),tx=transaction('readonly'),done=complete(tx);
   try{const state=await audit(tx);await done;return state.latest.get(key)??null;}catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  },
  async pending(){const tx=transaction('readonly'),done=complete(tx);
   try{const state=await audit(tx);await done;return Object.freeze([...state.entries.values()].filter(e=>!e.terminal).map(e=>e.attempt));}catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  },
  async commit(value:PublicAttempt){
   const attempt=snapshotAttempt(value),keys=reservationKeys(snapshotIntent({releaseId:attempt.releaseId,pool:attempt.pool,source:attempt.source,recordId:attempt.recordId,publicSignals:attempt.publicSignals}));
   ensure(new Set(keys).size===keys.length,'JOURNAL_DUPLICATE_RESERVATION');const tx=transaction('readwrite'),done=complete(tx);
   try{
    const state=await audit(tx),previous=state.latest.get(intentKey(attempt));ensure(state.entries.size<MAX_ATTEMPTS,'JOURNAL_CAPACITY_REQUIRES_RECOVERY');
    ensure(attempt.retryOf===null?!previous:previous?.attempt.hash===attempt.retryOf&&previous.terminal?.status==='known_not_sent','JOURNAL_INVALID_RETRY');
    tx.objectStore('attempts').add({hash:attempt.hash,attempt,digest:digest(attempt)});
    for(const key of keys)tx.objectStore('reservations').add({key,hash:attempt.hash});
    await done;
   }catch{try{tx.abort();}catch{}await done.catch(()=>{});throw new Error('JOURNAL_PENDING_CONFLICT_OR_FAILURE');}
  },
  async get(value:string){const id=h(value),tx=transaction('readonly'),done=complete(tx);
   try{const state=await audit(tx);await done;return state.entries.get(id)??null;}catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  },
  async terminal(value:TerminalEvidence){
   const evidence=terminalOf(value),tx=transaction('readwrite'),done=complete(tx);
   try{
    const state=await audit(tx),entry=state.entries.get(evidence.hash);ensure(entry,'JOURNAL_ATTEMPT_REQUIRED');
    if(entry.terminal){ensure(JSON.stringify(entry.terminal)===JSON.stringify(evidence),'JOURNAL_TERMINAL_CONFLICT');await done;return;}
    tx.objectStore('terminals').add(evidence);
    const a=entry.attempt,keys=reservationKeys({releaseId:a.releaseId,pool:a.pool,source:a.source,recordId:a.recordId,publicSignals:a.publicSignals});
    const reservations=tx.objectStore('reservations');
    const rows=await Promise.all(keys.map(key=>req(reservations.get(key))));
    rows.forEach((row,i)=>{const r=exact(row,['key','hash']);ensure(r.key===keys[i]&&r.hash===evidence.hash,'JOURNAL_CORRUPT_RESERVATION');reservations.delete(keys[i]);});
    await done;
   }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  },
  close(){closed=true;db.close();},
 });
}
