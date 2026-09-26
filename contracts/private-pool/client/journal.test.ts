import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';
import {Keypair,hash} from '@stellar/stellar-sdk';
import {snapshotAttempt,reservationKeys,type PublicAttempt} from './journal.ts';
import {fieldBytes} from './adapter.ts';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/verified-v2/proofs/02-create-pod.json',import.meta.url),'utf8'));
const source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,93)).publicKey();
const pool=JSON.parse(readFileSync(new URL('../fixtures/host-config.json',import.meta.url),'utf8')).pool;
function attempt():PublicAttempt{return {version:1,hash:'11'.repeat(32),sequence:'101',callHash:'22'.repeat(32),retryOf:null,releaseId:'33'.repeat(32),pool,source,recordId:fixture.ciphertextDigest,publicSignals:fixture.publicSignals};}

test('public journal snapshots reject secrets, aliases, corruption and getter-backed vectors',()=>{
 const a=snapshotAttempt(attempt());assert.ok(Object.isFrozen(a.publicSignals));
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
 assert.equal(external,0);t.diagnostic('Actual browser IndexedDB/Web Locks; public test metadata only; no external request or transaction submission.');
 });
