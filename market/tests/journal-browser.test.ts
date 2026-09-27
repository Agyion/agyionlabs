import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
import {metadataHash,publicationBytes,sha256,TESTNET_NETWORK_ID} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
import type {MarketJournal,MarketTransactionAttempt,MarketPublicationAttempt} from '../client/journal.ts';
type Factory=(options:{name:string})=>Promise<MarketJournal>;
declare global {interface Window {marketJournalFactory:Factory}}
test('real browser IndexedDB preserves atomic source reservations, reload and terminal/corruption guards',
 {skip:process.env.MARKET_JOURNAL_BROWSER_TEST!=='1',timeout:90000},async t=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(new URL('../../package.json',import.meta.url));
 const {chromium}=require('@playwright/test') as typeof import('@playwright/test');
 const path=[join(root,'node_modules/esbuild/lib/main.js'),join(root,'landing/node_modules/esbuild/lib/main.js')].find(existsSync);assert.ok(path);
 const {build}=require(path) as {build(options:Record<string,unknown>):Promise<unknown>};const dir=mkdtempSync(join(tmpdir(),'agyion-market-journal-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bundle=join(dir,'journal.js');await build({stdin:{contents:`import {createMarketJournal} from ${JSON.stringify(fileURLToPath(new URL('../client/journal.ts',import.meta.url)))}; globalThis.marketJournalFactory=createMarketJournal;`,resolveDir:root},bundle:true,format:'esm',platform:'browser',target:'chrome120',define:{'process.browser':'true'},outfile:bundle,logLevel:'silent'});
 const bytes=readFileSync(bundle),server=http.createServer((request,response)=>{if(request.url==='/journal.js'){response.setHeader('Content-Type','text/javascript');response.end(bytes);}else if(request.url==='/favicon.ico'){response.writeHead(204);response.end();}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Local market journal test</title><script type="module" src="/journal.js"></script>');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const executablePath=['/opt/google/chrome/chrome',chromium.executablePath(),'/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-background-networking']});t.after(()=>browser.close());const context=await browser.newContext();let external=0;
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(external++,route.abort()));const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>typeof window.marketJournalFactory==='function');
 const source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)).publicKey(),contract=StrKey.encodeContract(Buffer.alloc(32,9));
 const a:MarketTransactionAttempt={version:1,kind:'transaction',intentId:'11'.repeat(32),releaseId:'22'.repeat(32),contract,source,action:'create_offer',hash:'33'.repeat(32),sequence:'101',callHash:'44'.repeat(32)};
 const metadata={title:'Local test listing',quantity:'One item',allergens:'',storage:'',shopId:'test-shop',shopName:'Test shop',address:'Test Street 1',latE6:0,lonE6:0,pickupStart:1790500000,pickupEnd:1790503600,timezone:'UTC',accessibility:'',imageHash:null};
 const publication:Publication={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract,offerId:'1',seller:source,keyEpoch:1,revision:1,termsHash:'ab'.repeat(32),metadataHash:await metadataHash(metadata),issuedAt:1790500000,expiresAt:1790500300,nonce:'01'.repeat(32),metadata};
 const pub:MarketPublicationAttempt={version:1,kind:'publication',releaseId:a.releaseId,contract,source,hash:await sha256(publicationBytes(publication)),publication,signature:Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)).sign(Buffer.from(publicationBytes(publication))).toString('hex')};
 const result=await page.evaluate(async({name,a,pub})=>{
  const factory=window.marketJournalFactory,j1=await factory({name}),j2=await factory({name});
  const b={...a,hash:'55'.repeat(32),intentId:'66'.repeat(32),sequence:'102'};
  const outcomes=await Promise.allSettled([j1.commit(a),j2.commit(b)]);const winner=outcomes[0].status==='fulfilled'?a:b,loser=winner===a?b:a;
  const rollback=(await j1.get(loser.hash))===null;let invalid=false;try{await j1.finish({hash:winner.hash,status:'confirmed',ledger:0,offerId:'1'});}catch{invalid=true;}
  const pending=await j1.pending();j1.close();j2.close();const reopened=await factory({name});const preserved=(await reopened.pending())[0].hash===winner.hash;
  await reopened.finish({hash:winner.hash,status:'confirmed',ledger:105,offerId:'1'});let conflict=false;try{await reopened.finish({hash:winner.hash,status:'failed',ledger:105,offerId:null});}catch{conflict=true;}
  await reopened.commit(loser);const secondPending=(await reopened.pending()).map(v=>v.hash);await reopened.commit(pub);await reopened.finish({hash:pub.hash,status:'known_not_sent',reason:'cancelled'});const cancelledPublication=(await reopened.get(pub.hash))?.terminal?.status==='known_not_sent'&&!(await reopened.pending()).some(a=>a.hash===pub.hash);reopened.close();
  // Corrupt an immutable public row through raw IDB to check that recovery blocks.
  const open=indexedDB.open(name,1),db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  const tx=db.transaction('attempts','readwrite'),read=tx.objectStore('attempts').get(winner.hash);read.onsuccess=()=>{const row=read.result;row.attempt.sequence='999';tx.objectStore('attempts').put(row);};await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  const corrupt=await factory({name});let guarded=false;try{await corrupt.pending();}catch{guarded=true;}corrupt.close();
  return {fulfilled:outcomes.filter(v=>v.status==='fulfilled').length,rollback,invalid,pending:pending.length,preserved,conflict,secondPending:secondPending.length===1&&secondPending[0]===loser.hash,cancelledPublication,guarded};
 },{name:'agyion.market.test.'+Date.now(),a,pub});
 assert.deepEqual(result,{fulfilled:1,rollback:true,invalid:true,pending:1,preserved:true,conflict:true,secondPending:true,cancelledPublication:true,guarded:true});assert.equal(external,0);
});
