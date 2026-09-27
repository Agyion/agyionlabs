/** Bounded owned testnet catalog probe. No action without --publish or --cleanup.
 * Dedicated identities originate in the completed market live run. No funding,
 * real merchant claim, arbitrary RPC, automatic retry or production wallet.
 * Run with node --experimental-strip-types. Public request bytes are journaled.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {checkConfirmed,checkFailed,checkFee,pickupPayload,safeError} from './verify-testnet-market.mjs';
import {parsePrivateJson} from './lib/private-json.mjs';
import {getMarketRelease} from '../market/client/release.ts';
import {createMarketReader} from '../market/client/reader.ts';
import {createMarketCatalog} from '../market/client/catalog.ts';
import {metadataHash,termsHash,publicationBytes,sha256} from '../market/shared/codec.ts';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {Keypair,Contract,TransactionBuilder,rpc,contract,nativeToScVal,scValToNative}=require('@stellar/stellar-sdk');
const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url))),BASE=path.join(ROOT,'artifacts/security/2026-09-27-compatibility');
const SOURCE=path.join(BASE,'market-live-fixed-quote'),OUTPUT=path.join(BASE,'market-live-catalog');
const CONTRACT='CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ';
const HASH='b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c';
const json=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
const hash=v=>createHash('sha256').update(v).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function secureRead(file){const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o600);return parsePrivateJson(fs.readFileSync(file,'utf8'));}
function writeNew(file,value){fs.writeFileSync(file,json(value),{flag:'wx',mode:0o600});}
export function assertKnownRejectedProbe(previous){
 assert.equal(previous.status,'failed');assert.equal(previous.contract,CONTRACT);assert.equal(previous.wasmHash,HASH);
 assert.equal(previous.transactions.length,1);assert.equal(previous.transactions[0].method,'create_offer');assert.equal(previous.transactions[0].status,'SUCCESS');
 assert.equal(previous.requests.length,1);assert.equal(previous.requests[0].label,'wrong-signature');assert.equal(previous.requests[0].status,503);assert.equal(previous.requests[0].packet.signature,'00'.repeat(64));assert.match(previous.offerId,/^[1-9][0-9]*$/);
}
export async function readBoundedResponse(response){
 assert.ok(response.body);const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;assert.ok(bytes<=65536,'Catalog response exceeds 64KiB');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function main(){
 const mode=process.argv[2];assert.equal(process.argv.length,mode?3:2);
 if(!mode||mode==='--plan'){console.log('No actions. Explicit --publish creates one 0.01-XLM fictional test listing and <=8 signed catalog probes; --cleanup settles/refunds that exact recorded owned offer.');return;}
 assert.ok(mode==='--publish'||mode==='--resume-after-probe'||mode==='--cleanup');
 const release=getMarketRelease();assert.equal(release.contract,CONTRACT);assert.equal(release.wasmHash,HASH);assert.equal(release.catalogUrl,'https://market-testnet.agyionlabs.dev');
 assert.equal(release.rpcUrl,'https://soroban-testnet.stellar.org');assert.equal(release.networkPassphrase,'Test SDF Network ; September 2015');
 const original=secureRead(path.join(SOURCE,'report.json')),cfg=secureRead(path.join(SOURCE,'configuration.json')),secret=secureRead(path.join(SOURCE,'test-only-secrets.json'));
 assert.equal(original.status,'passed');assert.equal(original.contractId,CONTRACT);assert.equal(original.wasmSha256,HASH);assert.equal(secret.testnetOnly,true);assert.deepEqual(cfg.accounts,original.accounts);assert.equal(cfg.network,release.networkPassphrase);assert.equal(cfg.rpc,release.rpcUrl);assert.equal(cfg.wasmSha256,HASH);
 const keys=Object.fromEntries(['seller','buyer','relayer','venue'].map(r=>[r,Keypair.fromSecret(secret.roles[r])]));for(const role of Object.keys(keys))assert.equal(keys[role].publicKey(),cfg.accounts[role]);
 const wasm=fs.readFileSync(path.join(SOURCE,'deployed-market.wasm'));assert.equal(hash(wasm),HASH);
 const spec=contract.Spec.fromWasm(wasm),server=new rpc.Server(release.rpcUrl,{timeout:30}),market=new Contract(CONTRACT),reader=createMarketReader(release),catalog=createMarketCatalog(release);
 const state=await reader.state(),merchant=await reader.merchant(cfg.accounts.seller);assert.ok(merchant.value&&merchant.value.public_key.equals(keys.venue.rawPublicKey()));
 let report,reportFile,previous;
 if(mode==='--publish'){
  fs.mkdirSync(OUTPUT,{mode:0o700});reportFile=path.join(OUTPUT,'report.json');
  report={schema:'agyion-owned-market-catalog-test-v1',contract:CONTRACT,wasmHash:HASH,startedAt:new Date().toISOString(),status:'running',harnessSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),previousCount:state.count.toString(),merchantEpoch:merchant.value.epoch,transactions:[],requests:[],checks:[],boundary:'Fictional Agyion test listing in generic Istanbul. Not a real shop, real product, production merchant or real assets.'};writeNew(reportFile,report);
 }else if(mode==='--resume-after-probe'){
  previous=secureRead(path.join(OUTPUT,'report.json'));
  assertKnownRejectedProbe(previous);
  reportFile=path.join(OUTPUT,'publication-resume.json');report={...previous,status:'running',startedAt:new Date().toISOString(),harnessSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),previousReportSha256:hash(fs.readFileSync(path.join(OUTPUT,'report.json'))),transactions:[],requests:[],checks:[]};delete report.error;delete report.finishedAt;writeNew(reportFile,report);
 }else{
  const s=fs.lstatSync(OUTPUT);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o700&&s.uid===process.getuid());
  const published=secureRead(path.join(OUTPUT,'report.json'));assert.equal(published.contract,CONTRACT);assert.equal(published.wasmHash,HASH);assert.ok(published.offerId);
  reportFile=path.join(OUTPUT,'cleanup.json');report={purpose:'Close exactly the recorded owned test listing',status:'running',contract:CONTRACT,wasmHash:HASH,offerId:published.offerId,metadataHash:published.metadataHash,startedAt:new Date().toISOString(),transactions:[],requests:[],checks:[]};writeNew(reportFile,report);
 }
 const save=()=>fs.writeFileSync(reportFile,json(report),{mode:0o600});const check=(name,data={})=>{report.checks.push({name,...data});save();console.log('Verified: '+name);};
 let signedFees=original.transactions.reduce((s,t)=>s+BigInt(t.maxFee),0n);
 if(mode!=='--publish')signedFees+=secureRead(path.join(OUTPUT,'report.json')).transactions.reduce((s,t)=>s+BigInt(t.maxFee),0n);
 const token=new Contract(release.assets[0]);
 async function read(method,args={},target=market){const op=target.call(method,...(target===market?spec.funcArgsToScVals(method,args):args));const tx=new TransactionBuilder(await server.getAccount(cfg.accounts.relayer),{networkPassphrase:release.networkPassphrase,fee:'100'}).addOperation(op).setTimeout(60).build();const s=await server.simulateTransaction(tx);assert.ok(!rpc.Api.isSimulationError(s)&&s.result,`Read ${method}: ${s.error}`);const result=target===market?spec.funcResToNative(method,s.result.retval):scValToNative(s.result.retval);return typeof result?.unwrap==='function'?result.unwrap():result;}
 const balance=who=>read('balance',[nativeToScVal(who,{type:'address'})],token);
 async function send(method,args,signer){
  const tx=new TransactionBuilder(await server.getAccount(signer.publicKey()),{networkPassphrase:release.networkPassphrase,fee:'100'}).addOperation(market.call(method,...spec.funcArgsToScVals(method,args))).setTimeout(90).build();
  const s=await server.simulateTransaction(tx);assert.ok(!rpc.Api.isSimulationError(s)&&s.result,`Simulation ${method}: ${s.error}`);const ready=rpc.assembleTransaction(tx,s).build();signedFees=checkFee(ready.fee,signedFees);ready.sign(signer);
  const evidence={method,hash:ready.hash().toString('hex'),maxFee:ready.fee,source:signer.publicKey(),status:'prepared',simulationLedger:s.latestLedger};report.transactions.push(evidence);save();
  try{const sent=await server.sendTransaction(ready);evidence.sendStatus=sent.status;save();assert.equal(sent.hash,evidence.hash);assert.ok(['PENDING','DUPLICATE'].includes(sent.status));
   for(let i=0;i<55;i++){const r=await server.getTransaction(evidence.hash);if(r.status==='SUCCESS'){const fee=checkConfirmed(ready,r);Object.assign(evidence,{status:'SUCCESS',ledger:r.ledger,feeCharged:fee.toString()});save();const v=spec.funcResToNative(method,r.returnValue);return {value:typeof v?.unwrap==='function'?v.unwrap():v,evidence};}if(r.status==='FAILED'){const f=checkFailed(ready,r);Object.assign(evidence,{status:'FAILED',ledger:r.ledger,feeCharged:f.fee.toString(),result:f.result});save();throw new Error('Included failed transaction '+evidence.hash);}await sleep(1500);}throw new Error('Unresolved transaction '+evidence.hash);
  }catch(e){if(evidence.status==='prepared')evidence.status='unresolved';save();throw e;}
 }
 async function post(label,packet){assert.ok(report.requests.length<8,'Write probe cap');const e={label,packet,status:'prepared'};report.requests.push(e);save();
  try{const response=await fetch(release.catalogUrl+'/v1/offers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet),redirect:'error',signal:AbortSignal.timeout(20000)});e.status=response.status;e.response=await readBoundedResponse(response);save();return e;}catch(error){e.status='unresolved';save();throw error;}}
 try{
  if(mode==='--publish'||mode==='--resume-after-probe'){
   const now=Math.floor(Date.now()/1000),metadata=previous?.metadata??{title:'Agyion test listing',quantity:'One fictional test pickup. No real product.',allergens:'Test data only',storage:'Not a real food listing',shopId:'agyion-test-listing',shopName:'Agyion test venue',address:'Generic Istanbul test location. No physical collection.',latE6:41008000,lonE6:28978000,pickupStart:now,pickupEnd:now+1200,timezone:'Europe/Istanbul',accessibility:'Fictional integration test only',imageHash:null};
   const md=await metadataHash(metadata),terms={asset:release.assets[0],pot:100000n,start_price:0n,floor_price:0n,slope_num:0n,slope_den:1n,duration_ledgers:180,lease_ledgers:0,metadata_hash:Buffer.from(md,'hex')};
   report.metadata=metadata;report.metadataHash=md;report.terms={...terms,metadata_hash:md};save();
   if(!previous){assert.equal(await read('reserved_balance',{asset:release.assets[0]}),0n);assert.equal(await balance(CONTRACT),0n);
   const sellerBefore=await balance(cfg.accounts.seller),created=await send('create_offer',{seller:cfg.accounts.seller,terms},keys.seller);report.offerId=created.value.toString();save();assert.equal(created.value,state.count+1n);
   assert.equal(await balance(cfg.accounts.seller),sellerBefore-100000n-BigInt(created.evidence.feeCharged));}
   const offerRead=await reader.offer(report.offerId),offer=offerRead.value;report.startLedger=offer.start_ledger;report.deadlineLedger=offer.deadline_ledger;save();assert.equal(offer.seller,cfg.accounts.seller);assert.equal(offer.terms.metadata_hash.toString('hex'),md);assert.equal(offer.terms.pot,100000n);assert.equal(offer.state,0);
   assert.ok(offer.deadline_ledger>offerRead.ledger);assert.ok(metadata.pickupEnd>now+60,'Test metadata pickup window too close to expiry');assert.equal(await balance(CONTRACT),100000n);assert.equal(await read('reserved_balance',{asset:release.assets[0]}),100000n);
   const th=await termsHash({...report.terms,pot:'100000',start_price:'0',floor_price:'0',slope_num:'0',slope_den:'1'});assert.equal(offer.terms_hash.toString('hex'),th);
   const revision=await catalog.currentPublication(report.offerId);assert.equal(revision.revision,0);assert.equal(revision.contract,CONTRACT);
   const make=(rev,delta={})=>({version:1,action:'publish-offer',networkId:release.networkId,contract:CONTRACT,offerId:report.offerId,seller:cfg.accounts.seller,keyEpoch:merchant.value.epoch,revision:rev,termsHash:th,metadataHash:md,issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.min(now+1200,metadata.pickupEnd),nonce:randomBytes(32).toString('hex'),metadata,...delta});
   const packet=p=>({publication:p,signature:keys.venue.sign(Buffer.from(publicationBytes(p))).toString('hex')});const initial=packet(make(1));
   const wrong=await post('wrong-signature',{...initial,signature:'00'.repeat(64)});assert.equal(wrong.status,401);assert.equal(wrong.response.error,'INVALID_SIGNATURE');
   const altered=await post('metadata-substitution',{...initial,publication:{...initial.publication,metadata:{...metadata,title:'Altered test title'}}});assert.equal(altered.status,400);assert.equal(altered.response.error,'METADATA_MISMATCH');
   const accepted=await post('initial-publication',initial);assert.equal(accepted.status,200);assert.equal(accepted.response.idempotent,false);report.publication=initial;save();
   check('Signed fictional listing accepted only after exact on-chain metadata commitment',{offerId:report.offerId,deadlineLedger:report.deadlineLedger});
   const replay=await post('exact-retry',initial);assert.equal(replay.status,200);assert.equal(replay.response.idempotent,true);
   const competitors=[packet(make(2)),packet(make(2))];const race=await Promise.all(competitors.map((p,i)=>post('same-revision-race-'+i,p)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const winner=race.find(r=>r.status===200);report.publication=winner.packet;save();assert.equal(race.find(r=>r.status===409).response.error,'REVISION_OR_NONCE_CONFLICT');
   const stale=await post('old-revision-replay',initial);assert.equal(stale.status,409);assert.equal(stale.response.error,'REVISION_OR_NONCE_CONFLICT');
   const different={...metadata,title:'A different fictional title'},changed=packet(make(3,{metadata:different,metadataHash:await metadataHash(different)}));const mismatch=await post('new-signed-metadata-mismatch',changed);assert.equal(mismatch.status,409);assert.equal(mismatch.response.error,'CHAIN_TERMS_MISMATCH');
   const detail=await catalog.detail(report.offerId),actual=(await reader.offer(report.offerId)).value,key=(await reader.merchant(cfg.accounts.seller)).value;assert.equal(detail.publication.revision,2);assert.equal(detail.publication.metadataHash,actual.terms.metadata_hash.toString('hex'));assert.equal(detail.publication.termsHash,actual.terms_hash.toString('hex'));assert.equal(detail.merchantKey,key.public_key.toString('hex'));assert.equal(detail.publication.keyEpoch,key.epoch);assert.equal(actual.state,0);
   const digest=await sha256(publicationBytes(report.publication.publication)),receipt=await catalog.receipt(digest);assert.equal(receipt.offerId,report.offerId);assert.equal(receipt.revision,2);assert.equal(receipt.signatureHash,hash(Buffer.from(report.publication.signature,'hex')));
   const listed=await catalog.list({shop:{id:metadata.shopId,seller:cfg.accounts.seller}});assert.ok(listed.records.some(x=>x.publication.offerId===report.offerId));
   check('Wrong signature, altered metadata, old revision rejected; exact retry idempotent; one concurrent revision winner; client catalog and pinned chain agree');
   report.status='published-awaiting-browser-and-cleanup';report.receipt=receipt;report.browseUrl=release.catalogUrl+'/v1/offers/'+report.offerId;
  }else{
   const offer=(await reader.offer(report.offerId)).value;assert.equal(offer.seller,cfg.accounts.seller);assert.equal(offer.terms.metadata_hash.toString('hex'),report.metadataHash);assert.equal(offer.terms.pot,100000n);assert.equal(offer.state,0);assert.equal(offer.terms.start_price,0n);assert.equal(offer.terms.floor_price,0n);assert.equal(offer.sequence,0n);
   const sellerBefore=await balance(cfg.accounts.seller);let head=await reader.state();
   if(head.ledger<=offer.deadline_ledger&&head.ledger+12>=offer.deadline_ledger){for(let i=0;i<80&&head.ledger<=offer.deadline_ledger;i++){await sleep(1500);head=await reader.state();}assert.ok(head.ledger>offer.deadline_ledger,'Cleanup deadline wait exceeded before signing');}
   if(head.ledger>offer.deadline_ledger){await send('refund',{offer_id:offer.id},keys.relayer);}
   else{const r={offer_id:offer.id,claimant:cfg.accounts.buyer,terms_hash:offer.terms_hash,key_epoch:merchant.value.epoch,sequence:1n,valid_from:head.ledger,valid_until:head.ledger+12,max_price:0n,nonce:randomBytes(32)};const sc=spec.funcArgsToScVals('settle_walk_in',{receipt:r,signature:Buffer.alloc(64)})[0];const signature=keys.venue.sign(pickupPayload(CONTRACT,'walk-in',sc));await send('settle_walk_in',{receipt:r,signature},keys.buyer);}
   const done=(await reader.offer(report.offerId)).value;assert.ok(done.state===2||done.state===3);assert.equal(await balance(cfg.accounts.seller),sellerBefore+100000n);assert.equal(await balance(CONTRACT),0n);assert.equal(await read('reserved_balance',{asset:release.assets[0]}),0n);assert.equal(await read('reserved_balance',{asset:release.assets[1]}),0n);report.finalState=done.state;report.status='closed-and-zero-reserve';check('Recorded test listing closed normally; seller recovered full pot and market balance/obligations are zero');
  }
 }catch(error){report.status='failed';report.error=safeError(error);throw error;}finally{report.finishedAt=new Date().toISOString();save();console.log(report.status+' '+reportFile);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
