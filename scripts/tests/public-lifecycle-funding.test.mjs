import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = fileURLToPath(new URL('../../', import.meta.url));
// Real exclusive 0600 files/fsync and real account/header validation. Only run
// custody and network transports are substituted; no original operator is read.
const child = String.raw`
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {mock} from 'node:test';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const[root,home,mode]=process.argv.slice(2),url=n=>pathToFileURL(path.join(root,'scripts/lib',n)).href;
const {xdr}=createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');
const {createStateFixture}=await import(pathToFileURL(path.join(root,'scripts/tests/helpers/public-lifecycle-state-fixture.mjs')));
const {hashPublicLifecyclePlan}=await import(url('public-lifecycle-plan.mjs'));
const f=createStateFixture({realWasm:false}),{plan}=f,planSha256=hashPublicLifecyclePlan(plan),sha=b=>createHash('sha256').update(b).digest('hex');
const dirs={recipient:path.join(home,'recipient'),relayer:path.join(home,'relayer')},journalRun=path.join(home,'journal');
for(const p of [...Object.values(dirs),journalRun])fs.mkdirSync(p,{mode:0o700});
let loads=0,reads=0,requests=0,factories=0,present=false,invalidHeader=false,lowBalance=false;
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
mock.module(url('public-lifecycle-run.mjs'),{namedExports:{loadPublicLifecycleRun:async input=>{loads++;assert.deepEqual(input,{run:'fixture',planSha256});return {plan,planSha256,run:home,journalRun,fundingDirectories:dirs};}}});
function acquisition(role){let rows=[];if(present){const row=structuredClone(f.snapshot().entries[role==='recipient'?8:9]);if(lowBalance)row.val=xdr.LedgerEntryData.account(f.account(role,'1','4294967296000')).toXDR('base64');
rows=[row];}return {schema:'agyion-public-lifecycle-acquisition-v1',planSha256,role,response:{latestLedger:1000,entries:rows},headerEvidence:invalidHeader?{...f.header(),hash:'00'.repeat(32)}:f.header(),raw:{network:{passphrase:plan.networkPassphrase},entries:{},latest:{},history:null}};}
mock.module(url('public-lifecycle-acquisition.mjs'),{namedExports:{acquirePublicLifecycleFundingAccount:async({plan:p,role})=>{reads++;assert.deepEqual(p,plan);if(mode==='acquisition-failure')throw Error('PRIVATE_FAILURE');return acquisition(role);}}});
function response(role){const bytes=Buffer.from('{"some":"opaque response"}');return {schema:'agyion-public-lifecycle-friendbot-response-v1',provider:plan.friendbotUrl,planSha256,role,address:plan.actors[role],request:{method:'GET',url:plan.friendbotUrl+'?addr='+plan.actors[role]},httpStatus:200,bodyBase64:bytes.toString('base64'),bodySha256:sha(bytes),bodyBytes:bytes.length,bodyComplete:true,bodyTruncated:false,chainOutcome:'unknown'};}
mock.module(url('public-lifecycle-friendbot.mjs'),{namedExports:{createPublicLifecycleFriendbot:()=>{factories++;return {request:async({plan:p,role})=>{requests++;assert.deepEqual(p,plan);const d=dirs[role];assert.ok(fs.existsSync(path.join(d,'fund.claim')));assert.ok(fs.existsSync(path.join(d,'fund.attempt.json')));for(const name of ['fund.claim','fund.attempt.json'])assert.equal(fs.statSync(path.join(d,name)).mode&0o777,0o600);
if(mode==='unknown-error')throw Error('PRIVATE_FAILURE');if(mode==='timeout'){const e=Error('LIFECYCLE_FRIENDBOT_TIMEOUT');e.evidence={...response(role),httpStatus:null,bodyComplete:false};throw e;}if(mode==='bad-response')return {...response(role),address:plan.actors.seller};return response(role);}};}}});
let api;try{api=await import(url('public-lifecycle-funding.mjs'));}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;api={};}
assert.equal(typeof api.fundPublicLifecycleAccount,'function');assert.equal(typeof api.recoverPublicLifecycleFunding,'function');
const input={run:'fixture',planSha256,role:'recipient'},fund=()=>api.fundPublicLifecycleAccount(input),recover=()=>api.recoverPublicLifecycleFunding(input);
const record=(name,role='recipient')=>JSON.parse(fs.readFileSync(path.join(dirs[role],name),'utf8'));
const safe=e=>{assert.match(e.message,/^LIFECYCLE_FUNDING_[A-Z_]+$/);assert.ok(!e.message.includes('PRIVATE'));return true;};
if(mode==='invalid-input'){for(const value of [{...input,role:'seller'},{...input,role:'venue'},{...input,run:'../x'},{...input,planSha256:'a'},{...input,rpc:{}},{...input,force:true}])await assert.rejects(api.fundPublicLifecycleAccount(value),safe);let invoked=0;const value={...input};Object.defineProperty(value,'role',{enumerable:true,get(){invoked++;return 'recipient';}});await assert.rejects(api.fundPublicLifecycleAccount(value),safe);assert.equal(invoked,0);assert.equal(loads,0);}
else if(mode==='journal-started'){fs.writeFileSync(path.join(journalRun,'already-started'),'x');await assert.rejects(fund(),safe);assert.equal(reads,0);assert.deepEqual(fs.readdirSync(dirs.recipient),[]);}
else if(mode==='present-before'){present=true;await assert.rejects(fund(),safe);assert.ok(fs.existsSync(path.join(dirs.recipient,'fund.claim')));assert.equal(requests,0);await assert.rejects(fund(),safe);assert.equal(reads,1);}
else if(mode==='bad-header'){invalidHeader=true;await assert.rejects(fund(),safe);assert.equal(requests,0);assert.equal(fs.existsSync(path.join(dirs.recipient,'fund.attempt.json')),false);}
else if(mode==='acquisition-failure'){await assert.rejects(fund(),safe);await assert.rejects(fund(),safe);assert.equal(reads,1);assert.equal(requests,0);}
else if(mode==='concurrent'){const r=await Promise.allSettled([fund(),fund(),fund()]);assert.equal(r.filter(v=>v.status==='fulfilled').length,1);assert.equal(requests,1);assert.equal(reads,1);}
else if(mode==='claim-only'){const {claimDeploymentPhase}=await import(url('private-deployment.mjs'));claimDeploymentPhase(dirs.recipient,'fund',planSha256);const r=await recover();assert.equal(r.attemptRecorded,false);assert.equal(r.responseRecorded,false);assert.equal(r.status,'account-absent');assert.equal(factories,0);await assert.rejects(fund(),safe);}
else if(mode==='receipt-write-failure'){const open=fs.openSync;fs.openSync=function(p,...args){if(String(p)===path.join(dirs.recipient,'fund.receipt.json'))throw Error('PRIVATE_FAILURE');return open.call(this,p,...args);};await assert.rejects(fund(),safe);fs.openSync=open;assert.equal(requests,1);const r=await recover();assert.equal(r.attemptRecorded,true);assert.equal(r.responseRecorded,false);await assert.rejects(fund(),safe);assert.equal(requests,1);}
else if(mode==='attempt-write-failure'){const open=fs.openSync;fs.openSync=function(p,...args){if(String(p)===path.join(dirs.recipient,'fund.attempt.json'))throw Error('PRIVATE_FAILURE');return open.call(this,p,...args);};await assert.rejects(fund(),safe);fs.openSync=open;assert.equal(requests,0);await assert.rejects(fund(),safe);assert.equal(requests,0);assert.equal((await recover()).attemptRecorded,false);}
else if(mode==='no-claim'){await assert.rejects(recover(),safe);assert.equal(reads,0);assert.equal(factories,0);}
else {const r=await fund();assert.equal(r.status,'outcome-unknown');assert.equal(r.chainOutcome,'unknown');assert.equal(requests,1);assert.equal(record('fund.receipt.json').chainOutcome,'unknown');assert.ok(Object.isFrozen(r));
if(mode==='two-roles'){await api.fundPublicLifecycleAccount({...input,role:'relayer'});assert.equal(requests,2);assert.equal(record('fund.attempt.json','relayer').address,plan.actors.relayer);}
else if(mode==='tampered-attempt'){const file=path.join(dirs.recipient,'fund.attempt.json'),a=record('fund.attempt.json');a.address=plan.actors.seller;fs.writeFileSync(file,JSON.stringify(a,null,2)+'\n');await assert.rejects(recover(),safe);assert.equal(reads,1);}
else if(mode==='low-reserve'){present=true;lowBalance=true;await assert.rejects(recover(),safe);assert.equal(requests,1);}
else if(mode==='tampered-accepted'){const file=path.join(dirs.recipient,'fund.receipt.json'),a=record('fund.receipt.json');a.response.httpStatus=503;fs.writeFileSync(file,JSON.stringify(a,null,2)+'\n');await assert.rejects(recover(),safe);assert.equal(reads,1);}
else if(mode==='tampered-incomplete'){const file=path.join(dirs.recipient,'fund.receipt.json'),a=record('fund.receipt.json');a.response.bodyComplete=false;fs.writeFileSync(file,JSON.stringify(a,null,2)+'\n');await assert.rejects(recover(),safe);assert.equal(reads,1);}
else if(mode==='tampered-receipt'){const file=path.join(dirs.recipient,'fund.receipt.json'),a=record('fund.receipt.json');a.response.bodySha256='00'.repeat(32);fs.writeFileSync(file,JSON.stringify(a,null,2)+'\n');await assert.rejects(recover(),safe);assert.equal(reads,1);}
else {present=mode==='observed';const before=Object.fromEntries(fs.readdirSync(dirs.recipient).map(n=>[n,fs.readFileSync(path.join(dirs.recipient,n),'hex')]));const recovered=await recover();assert.equal(recovered.status,present?'account-observed':'account-absent');assert.equal(recovered.fundingTransactionAuthenticated,false);assert.equal(recovered.attemptRecorded,true);assert.equal(recovered.responseRecorded,true);assert.equal(requests,1);assert.equal(factories,1);assert.deepEqual(Object.fromEntries(fs.readdirSync(dirs.recipient).map(n=>[n,fs.readFileSync(path.join(dirs.recipient,n),'hex')])),before);await assert.rejects(fund(),safe);assert.equal(requests,1);}}
assert.equal(globalThis.fetch.toString().includes('NETWORK_FORBIDDEN'),true);process.stdout.write(JSON.stringify({mode,loads,reads,requests}));
`;
for(const mode of ['invalid-input','journal-started','present-before','bad-header','acquisition-failure','concurrent','claim-only','receipt-write-failure','no-claim','observed','absent','timeout','unknown-error','bad-response','two-roles','tampered-attempt','tampered-receipt','attempt-write-failure','low-reserve','tampered-accepted','tampered-incomplete'])test(`durable funding ${mode}`,async()=>{
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  const home=fs.mkdtempSync(path.join(root,'artifacts/.funding-test-'));
  try{const script=path.join(home,'fixture.mjs');fs.writeFileSync(script,child);const result=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks',script,root,home,mode],{cwd:root,timeout:20000,maxBuffer:65536});assert.equal(JSON.parse(result.stdout).mode,mode);}
  finally{fs.rmSync(home,{recursive:true,force:true});}
});
