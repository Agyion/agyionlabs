import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';
import {Keypair,StrKey,hash} from '@stellar/stellar-sdk';
import {snapshotAttempt,reservationKeys,type PublicAttempt} from './journal.ts';
import {fieldBytes} from './adapter.ts';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/02-create-pod.json',import.meta.url),'utf8'));
const source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,93)).publicKey();
const pool=JSON.parse(readFileSync(new URL('../fixtures/host-config.json',import.meta.url),'utf8')).pool;
function attempt():PublicAttempt{return {version:1,hash:'11'.repeat(32),sequence:'101',callHash:'22'.repeat(32),retryOf:null,releaseId:'33'.repeat(32),pool,source,recordId:fixture.ciphertextDigest,publicSignals:fixture.publicSignals};}

const revoked=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/13-revoke-envoy.json',import.meta.url),'utf8'));
const revocationId=hash(Buffer.concat([Buffer.from('AGYION_REVOKE_INTENT_V2\0'),...revoked.publicSignals.map((n:string)=>fieldBytes(BigInt(n))),Buffer.from(revoked.ownerKey,'hex')])).toString('hex');
function revokeAttempt(){return {version:2,operation:'revoke',hash:'66'.repeat(32),sequence:'102',callHash:'77'.repeat(32),retryOf:null,releaseId:'33'.repeat(32),pool,source,recordId:revocationId,publicSignals:revoked.publicSignals,ownerKey:revoked.ownerKey,revocationIndex:'0'};}
test('typed revocation journal preserves four-input intent and blocks a submit using the same source',()=>{
 const a=snapshotAttempt(revokeAttempt() as unknown as PublicAttempt);
 assert.equal(a.publicSignals.length,4);assert.equal(a.recordId,revocationId);
 const {version,hash,sequence,callHash,retryOf,revocationIndex,...intent}=a as any;
 const submit=attempt(),{version:sv,hash:sh,sequence:ss,callHash:sc,retryOf:sr,...submitIntent}=submit;
 const keys=reservationKeys(intent),submitKeys=reservationKeys(submitIntent);
 assert.equal(keys.filter(k=>submitKeys.includes(k)).length,1);
 assert.throws(()=>snapshotAttempt({...revokeAttempt(),ownerKey:'12'.repeat(32)} as unknown as PublicAttempt));
 assert.throws(()=>snapshotAttempt({...revokeAttempt(),revocationIndex:'18446744073709551615'} as unknown as PublicAttempt));
 assert.throws(()=>snapshotAttempt({...revokeAttempt(),signature:revoked.signature} as unknown as PublicAttempt));
});

test('public journal snapshots reject secrets, aliases, corruption and getter-backed vectors',()=>{
 const a=snapshotAttempt(attempt());assert.ok(Object.isFrozen(a.publicSignals));
 assert.equal(hash(Buffer.from(JSON.stringify(a))).toString('hex'),'b817a712d12bacd9034c070847c4ef1bf6b42b7781ef8372aead13401f293b7e');
 assert.throws(()=>snapshotAttempt({...attempt(),privateKey:'secret'} as PublicAttempt));
 assert.throws(()=>snapshotAttempt({...attempt(),sequence:'01'}));
 assert.throws(()=>snapshotAttempt({...attempt(),recordId:'44'.repeat(32)}));
 let invoked=false;const fields=[...fixture.publicSignals];Object.defineProperty(fields,'4',{enumerable:true,get(){invoked=true;return '1'}});
 assert.throws(()=>snapshotAttempt({...attempt(),publicSignals:fields}));assert.equal(invoked,false);
 const {releaseId,pool,source,recordId,publicSignals}=a;
 assert.ok(reservationKeys({releaseId,pool,source,recordId,publicSignals}).some(key=>key.includes('|nf|')));
});

test('real browser IndexedDB keeps atomic reservations across connections/reload and immutable terminal evidence',
 {skip:process.env.PRIVATE_JOURNAL_BROWSER_TEST!=='1',timeout:90_000},async t=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../../package.json',import.meta.url));
 const {chromium}=require('@playwright/test');
 const esbuildPath=[join(root,'node_modules/esbuild/lib/main.js'),join(root,'landing/node_modules/esbuild/lib/main.js')].find(existsSync);assert.ok(esbuildPath);
 const {build}=require(esbuildPath);const directory=mkdtempSync(join(tmpdir(),'agyion-journal-browser-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const bundle=join(directory,'journal.js');await build({stdin:{contents:`import {createIndexedDbSubmissionJournal} from ${JSON.stringify(fileURLToPath(new URL('./journal.ts',import.meta.url)))}; globalThis.journalFactory=createIndexedDbSubmissionJournal;`,resolveDir:root},bundle:true,format:'esm',platform:'browser',target:'chrome120',define:{'process.browser':'true'},outfile:bundle,logLevel:'silent'});
 const js=readFileSync(bundle),server=http.createServer((req,res)=>{
  if(req.url==='/journal.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local public journal test</title><script type="module" src="/journal.js"></script>');}
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const executablePath=['/opt/google/chrome/chrome',chromium.executablePath(),'/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-background-networking']});t.after(()=>browser.close());
 const context=await browser.newContext();let external=0;await context.route('**/*',(route:any)=>new URL(route.request().url()).origin===base?route.continue():(external++,route.abort()));
 const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>typeof (globalThis as any).journalFactory==='function');
 const name='agyion.journal.test.'+Date.now(),a=attempt();
 // Construct a genuine schema-v1 database before opening the current journal.
 // Its old serialized bytes/hash must survive an upgrade without a rewrite.
 const legacy=snapshotAttempt(a),legacyDigest=hash(Buffer.from(JSON.stringify(legacy))).toString('hex');
 const {version:lv,hash:lh,sequence:ls,callHash:lc,retryOf:lr,...legacyIntent}=legacy;
 const migration=await page.evaluate(async({name,legacy,digest,keys,revoke}:any)=>{
  const open=indexedDB.open(name,1);open.onupgradeneeded=()=>{for(const [store,keyPath] of [['attempts','hash'],['terminals','hash'],['reservations','key']])open.result.createObjectStore(store,{keyPath});};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
  const tx=db.transaction(['attempts','reservations'],'readwrite');tx.objectStore('attempts').add({hash:legacy.hash,attempt:legacy,digest});
  for(const key of keys)tx.objectStore('reservations').add({key,hash:legacy.hash});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});let oldClosed=false;
  db.onversionchange=()=>{oldClosed=true;db.close()};
  const f=(globalThis as any).journalFactory,j=await f({name});
  const saved=await j.get(legacy.hash);let conflict=false;try{await j.commit(revoke)}catch{conflict=true}
  const rollback=await j.get(revoke.hash)===null;
  await j.terminal({hash:legacy.hash,status:'known_not_sent',reason:'cancelled'});await j.commit(revoke);j.close();
  const reload=await f({name}),pending=await reload.pending();const revSaved=await reload.get(revoke.hash);reload.close();
  const verify=indexedDB.open(name,2);const read=await new Promise<IDBDatabase>((resolve,reject)=>{verify.onsuccess=()=>resolve(verify.result);verify.onerror=()=>reject(verify.error)});
  const req=read.transaction('attempts').objectStore('attempts').get(legacy.hash);const raw:any=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});read.close();
  return {oldClosed,preserved:JSON.stringify(saved.attempt)===JSON.stringify(legacy)&&raw.digest===digest&&JSON.stringify(raw.attempt)===JSON.stringify(legacy),conflict,rollback,pending:pending.length===1&&pending[0].hash===revoke.hash,typed:revSaved.attempt.version===2&&revSaved.attempt.publicSignals.length===4};
 },{name:name+'.migration',legacy,digest:legacyDigest,keys:reservationKeys(legacyIntent),revoke:revokeAttempt()});
 assert.deepEqual(migration,{oldClosed:true,preserved:true,conflict:true,rollback:true,pending:true,typed:true});
 const first=await page.evaluate(async({name,a}:any)=>{
  const f=(globalThis as any).journalFactory,j1=await f({name}),j2=await f({name});
  const results=await Promise.allSettled([j1.commit(a),j2.commit(a)]);
  const {releaseId,pool,source,recordId,publicSignals}=a;
  const conflicts=await j2.conflicts({releaseId,pool,source,recordId,publicSignals});
  j1.close();j2.close();return {wins:results.filter(r=>r.status==='fulfilled').length,conflicts:conflicts.length};
 },{name,a});assert.deepEqual(first,{wins:1,conflicts:1});
 await page.close();const next=await context.newPage();await next.goto(base);await next.waitForFunction(()=>typeof (globalThis as any).journalFactory==='function');
 const changed=structuredClone(a);changed.hash='55'.repeat(32);changed.source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,94)).publicKey();changed.publicSignals=[...a.publicSignals];(changed.publicSignals as string[])[23]=(BigInt(changed.publicSignals[23])+1n).toString();changed.recordId=hash(Buffer.concat(changed.publicSignals.slice(23).map(n=>fieldBytes(BigInt(n))))).toString('hex');
 const result=await next.evaluate(async({name,a,changed}:any)=>{
  const f=(globalThis as any).journalFactory,j=await f({name}),saved=await j.get(a.hash);
  const pending=await j.pending();if(pending.length!==1||pending[0].hash!==a.hash)throw Error('Pending discovery lost after reload');
  let duplicateRejected=false,conflictRejected=false;
  try{await j.commit(changed)}catch{duplicateRejected=true}
  const rolledBack=await j.get(changed.hash)===null;
  await j.terminal({hash:a.hash,status:'known_not_sent',reason:'session_changed'});
  try{await j.terminal({hash:a.hash,status:'confirmed',ledger:1001})}catch{conflictRejected=true}
  const closed=await j.get(a.hash),{releaseId,pool,source,recordId,publicSignals}=a;
  const freed=(await j.conflicts({releaseId,pool,source,recordId,publicSignals})).length===0;
  await j.commit(changed);
  let active=0,maximum=0;await Promise.all(Array.from({length:8},()=>j.exclusive(async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;})));
  j.close();return {restored:saved.attempt.hash===a.hash&&saved.terminal===null,duplicateRejected,rolledBack,conflictRejected,freed,immutable:JSON.stringify(saved.attempt)===JSON.stringify(closed.attempt),maximum};
 },{name,a,changed});assert.deepEqual(result,{restored:true,duplicateRejected:true,rolledBack:true,conflictRejected:true,freed:true,immutable:true,maximum:1});
 // Use the actual DEFAULT database, not a per-profile database. A new pool and
 // profile must still contend for the original account's shared reservation.
 const nextProfile={...revokeAttempt(),pool:StrKey.encodeContract(Buffer.alloc(32,97)),releaseId:'98'.repeat(32)};
 const crossProfile=await next.evaluate(async({old,nextProfile}:any)=>{
  const f=(globalThis as any).journalFactory,j1=await f(),j2=await f();await j1.commit(old);
  const {version,hash,sequence,callHash,retryOf,revocationIndex,...intent}=nextProfile;
  const conflict=await j2.conflicts(intent);let active=0,maximum=0,rejected=false;
  await Promise.all([j1.exclusive(async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,25));active--;}),
   j2.exclusive(async()=>{active++;maximum=Math.max(maximum,active);try{await j2.commit(nextProfile)}catch{rejected=true}finally{active--;}})]);
  const retained=(await j2.pending()).map((a:any)=>a.hash);const absent=await j2.get(nextProfile.hash)===null;j1.close();j2.close();
  const reload=await f(),pending=await reload.pending();
  // Synthetic terminal evidence exercises journal mechanics only. The app
  // recovery tests separately require the actual signed envelope/archive gates.
  await reload.terminal({hash:old.hash,status:'failed',ledger:1011});await reload.commit(nextProfile);
  const remaining=await reload.pending();reload.close();
  return {oldVisible:pending.length===1&&pending[0].hash===old.hash,conflicts:conflict.map((a:any)=>a.hash),rejected,absent,maximum,retained,
   nextOnly:remaining.length===1&&remaining[0].hash===nextProfile.hash};
 },{old:a,nextProfile});
 assert.deepEqual(crossProfile,{oldVisible:true,conflicts:[a.hash],rejected:true,absent:true,maximum:1,retained:[a.hash],nextOnly:true});
 assert.equal(external,0);t.diagnostic('Actual browser IndexedDB/Web Locks; public test metadata only; no external request or transaction submission.');
 });
