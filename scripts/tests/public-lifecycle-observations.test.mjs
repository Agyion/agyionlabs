import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
const SDK = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const { Keypair, xdr } = SDK;
const keys = Array.from({ length: 7 }, (_, i) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71 + i)));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T20:00:00.000Z', recipient: keys[0].publicKey(), relayer: keys[1].publicKey(), credentialKeys: Object.fromEntries(['venue','podTimelock','podMixed','attester','agent'].map((r,i)=>[r,keys[i+2].publicKey()])) });
const M = await import('../lib/public-lifecycle-observations.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const input = (kind,caseId) => ({plan,stepId:plan.steps[0].id,observationKind:kind,caseId,ledger:5000000,timestamp:'1790539200',recordAnchors:[]});
test('finite registry covers every planned family with no caller registry override',()=>{
 assert.equal(typeof M.publicLifecycleObservationCases,'function');
 const names=new Set();for(const step of plan.steps)for(const phase of ['before','after'])for(const row of M.publicLifecycleObservationCases({plan,stepId:step.id,phase}))names.add(row.observationKind);
 const expected=new Set([...plan.preflightObservations,...plan.steps.flatMap(s=>[...s.requiredObservations,...s.postObservations]),...plan.finalObservations]);assert.deepEqual(names,expected);
 assert.throws(()=>M.publicLifecycleObservationCases({plan,stepId:plan.steps[0].id,phase:'before',registry:{}}),/INPUT/);
});
test('preflight amount cases are finite exact i128 mutations',()=>{
 assert.equal(typeof M.publicLifecycleObservationIntent,'function');
 for(const method of ['fade','pod','trigger'])for(const amount of ['zero','negative']){const intent=M.publicLifecycleObservationIntent(input('creation-nonpositive-amount',`${method}-${amount}`));assert.equal(intent.call.method,`create_${method}`);assert.equal(intent.expectedError,'Contract#3');const value=xdr.ScVal.fromXDR(intent.call.argsXdr[2],'base64');assert.equal(SDK.scValToNative(value),amount==='zero'?0n:-1n);}
});
test('Pod unsupported asset requires exact changed-terms proof',()=>{
 assert.equal(typeof M.publicLifecycleObservationIntent,'function');
 const intent=M.publicLifecycleObservationIntent(input('unsupported-asset-valid-creation-proof','pod'));assert.equal(intent.credential.role,'podTimelock');assert.notEqual(intent.call.argsXdr[1],new SDK.Address(plan.assets[0]).toScVal().toXDR('base64'));assert.equal(intent.expectedError,'Contract#14');assert.ok(intent.credential.payloadHex.includes(Buffer.from('agyion:pod-create:v3\0').toString('hex')));
});
test('terminal error parsing cannot match a nested diagnostic or generic failure',()=>{
 assert.equal(typeof M.publicLifecycleSimulationError,'function');
 assert.equal(M.publicLifecycleSimulationError({error:'HostError: Error(Contract, #12)\nEvent log omitted',latestLedger:5000000}),'Contract#12');
 for(const error of ['network failed Error(Contract, #12)','HostError: Error(Storage, MissingValue)\nError(Contract, #12)','Error(Contract, #12) and Error(Auth, InvalidAction)','HostError: Error(Contract, #12junk)'])assert.throws(()=>M.publicLifecycleSimulationError({error,latestLedger:5000000}),/ERROR/);
 assert.throws(()=>M.publicLifecycleSimulationError({error:'HostError: Error(Contract, #12)',latestLedger:5000000,results:[{xdr:xdr.ScVal.scvVoid().toXDR('base64')}]}),/ERROR/);
});
test('full gate rejects fabricated verified booleans without raw evidence',()=>{
 assert.equal(typeof M.verifyPublicLifecycleObservations,'function');
 assert.throws(()=>M.verifyPublicLifecycleObservations({plan,stepId:plan.steps[0].id,phase:'before',state:{passed:true},rawEvidence:{passed:true}}),/LIFECYCLE_OBSERVATION/);
});

// Synthetic public case fixtures. These do not authenticate chain snapshots.
const roleKeys=Object.fromEntries(['venue','podTimelock','podMixed','attester','agent'].map((r,i)=>[r,keys[i+2]]));
const h=5000000;
function anchors(){const counts={};return plan.steps.filter(s=>s.method.startsWith('create_')).map(s=>{const type={create_fade:'Fade',create_pod:'Pod',create_trigger:'Trigger',create_mandate:'Mandate'}[s.method];const id=String(counts[type]=(counts[type]??0)+1);return {record:s.record,id,type,creationLedger:h-1000,preparedLedger:h-1000,lastTransitionLedger:h-1000,value:{state:0,owner:plan.actors.recipient,start_price:s.terms.price??'0',deadline_ledger:h+120,handoff_window:60,claimed_at:h-1,unlock_ledger:h,valid_until:h+1000,revoked:false,claims_used:0,daily_used:'0'}};});}
function caseInput(step,k,c){const rows=anchors(),r=rows.find(r=>r.record===step.record),grant=rows.find(r=>r.record==='grant-capped');
 if(k==='fade-second-claim'||k==='positive-handoff-wrong-source-enforce'||k.includes('fade-claimed')||k.includes('fade-late-handoff'))r.value.state=1;
 if(k==='pod-before-unlock')r.value.unlock_ledger=h+1;
 if(k==='trigger-expired-attest-before-refund'||k==='fade-late-claim-before-refund')r.value.deadline_ledger=h-1;
 if(k==='fade-late-handoff-before-refund')r.value.claimed_at=h-61;
 if(k==='envoy-replay'){r.value.state=1;grant.value.claims_used=1;}
 if(k==='envoy-revoked-before-claim')grant.value.revoked=true;
 if(k==='envoy-expired-before-claim')rows.find(r=>r.record==='grant-expiry').value.valid_until=h-1;
 if(k==='fade-handoff-terminal-replay')r.value.state=2;
 if(k==='pod-claim-terminal-replay'||k==='trigger-attest-terminal-replay')r.value.state=1;
 if(k==='trigger-refund-terminal-replay')r.value.state=2;
 if(k==='fade-refund-terminal-replay')r.value.state=3;
 return {plan,stepId:step.id,observationKind:k,caseId:c,ledger:h,timestamp:'1790539200',recordAnchors:rows};
}
const tree=(target,method,args,children=[])=>new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new SDK.Address(target).toScAddress(),functionName:method,args})),subInvocations:children});
function envelope(intent,control=false){const call=control?intent.control:intent.call,args=call.argsXdr.map(v=>xdr.ScVal.fromXDR(v,'base64'));if(intent.credential){const c=intent.credential,sig=roleKeys[c.role].sign(Buffer.from(c.payloadHex,'hex'));if(c.corruptFirstByte)sig[0]^=1;args[c.argumentIndex]=xdr.ScVal.scvBytes(sig);}
 let auth=[];if(intent.authMode==='enforce'){const children=call.method==='confirm_handoff'?[tree(plan.assets[0],'transfer',[new SDK.Address(plan.actors.recipient).toScVal(),new SDK.Address(plan.actors.seller).toScVal(),SDK.nativeToScVal(1000000n,{type:'i128'})])]:[];auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(call.target,call.method,args,children)})];}
 return new SDK.TransactionBuilder(new SDK.Account(call.sourceAccount,'9'),{fee:'100',networkPassphrase:plan.networkPassphrase}).addOperation(SDK.Operation.invokeContractFunction({contract:call.target,function:call.method,args,auth})).setTimeout(60).build().toXDR();
}
const errorText=e=>e.startsWith('Contract#')?`HostError: Error(Contract, #${e.slice(9)})`:`HostError: Error(${e.replace('/',', ')})`;
function rawCase(i){const intent=M.publicLifecycleObservationIntent(i);return {request:{envelopeXdr:envelope(intent),authMode:intent.authMode},response:{latestLedger:i.ledger,error:errorText(intent.expectedError)},...(intent.control?{control:{request:{envelopeXdr:envelope(intent,true),authMode:'enforce'},response:{latestLedger:i.ledger,results:[{xdr:xdr.ScVal.scvVoid().toXDR('base64')}],transactionData:new SDK.SorobanDataBuilder().setResourceFee('100').build().toXDR('base64'),minResourceFee:'100'}}}:{})};}
for(const step of plan.steps)for(const phase of ['before','after']){
 const families=phase==='before'?[...(step===plan.steps[0]?plan.preflightObservations:[]),...step.requiredObservations]:[...step.postObservations,...(step===plan.steps.at(-1)?plan.finalObservations:[])];
 for(const k of families)test(`all fixed case semantics: ${step.id} ${k}`,()=>{const family=M.publicLifecycleObservationCases({plan,stepId:step.id,phase}).find(r=>r.observationKind===k);for(const c of family.caseIds){const i=caseInput(step,k,c),raw=rawCase(i);assert.equal(M.verifyPublicLifecycleObservationCase(i,raw).caseId,c);}});
}
test('negative simulation cannot smuggle auth trees, signed envelope, source or restoration',()=>{
 const i=input('fade-zero-slope-denominator','denominator'),raw=rawCase(i);
 const mutations=[e=>{const op=e.v1().tx().operations()[0].body().invokeHostFunctionOp();op.auth([new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(plan.assets[0],'transfer',[])})]);},e=>e.v1().tx().sourceAccount(xdr.MuxedAccount.keyTypeEd25519(keys[0].rawPublicKey())),e=>e.v1().signatures([new xdr.DecoratedSignature({hint:Buffer.alloc(4),signature:Buffer.alloc(64)})])];
 for(const change of mutations){const bad=structuredClone(raw),e=xdr.TransactionEnvelope.fromXDR(bad.request.envelopeXdr,'base64');change(e);bad.request.envelopeXdr=e.toXDR('base64');assert.throws(()=>M.verifyPublicLifecycleObservationCase(i,bad),/AUTH|ENVELOPE/);}
 const bad=structuredClone(raw);bad.response.restorePreamble={transactionData:'AA=='};assert.throws(()=>M.verifyPublicLifecycleObservationCase(i,bad),/ERROR/);
});
test('diagnostic error codes are decoded rather than guessed from error type',()=>{
 const event=new xdr.DiagnosticEvent({inSuccessfulContractCall:false,event:new xdr.ContractEvent({ext:new xdr.ExtensionPoint(0),contractId:null,type:xdr.ContractEventType.diagnostic(),body:new xdr.ContractEventBody(0,new xdr.ContractEventV0({topics:[],data:xdr.ScVal.scvError(xdr.ScError.sceCrypto(xdr.ScErrorCode.scecInvalidAction()))}))})});
 assert.throws(()=>M.publicLifecycleSimulationError({latestLedger:h,error:'HostError: Error(Crypto, InvalidInput)',events:[event.toXDR('base64')]}),/ERROR/);
});

// Isolated child keeps the executable-auth-only test double out of production
// imports. All raw XDR, state reducer/branding, header, snapshots, registry and
// observation code remain real; an opt-in repeats with exact compiled bytecode.
const fullGateChild=String.raw`
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire,registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';
const [root,file,mode]=process.argv.slice(2),input=JSON.parse(fs.readFileSync(file,'utf8')),real=mode==='real';
const moduleURL=n=>pathToFileURL(path.join(root,'scripts/lib',n)).href,readbackURL=moduleURL('public-lifecycle-readback.mjs');
const hook=real?null:registerHooks({resolve(s,c,next){if(s==='./public-lifecycle-readback.mjs'&&(/public-lifecycle-(state|observations)\.mjs$/.test(c.parentURL)))return {url:'data:text/javascript,'+encodeURIComponent('import {verifyPublicLifecycleState} from '+JSON.stringify(readbackURL)+';export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:"agyion-public-v4-lifecycle-snapshot-v1",codeBytesAuthenticated:true};}'),shortCircuit:true};return next(s,c);}});
const M=await import(moduleURL('public-lifecycle-observations.mjs')),S=await import(moduleURL('public-lifecycle-state.mjs')),C=await import(moduleURL('public-lifecycle-call.mjs'));hook?.deregister();
const {Address,Contract,nativeToScVal,xdr}=createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');const plan=input.plan,h=5000000,roles=['seller','recipient','relayer'];
const hash=v=>createHash('sha256').update(v).digest('hex'),b64=v=>v.toXDR('base64'),int=n=>nativeToScVal(BigInt(n),{type:'i128'}),sym=n=>xdr.ScVal.scvSymbol(n),en=n=>xdr.ScVal.scvVec([sym(n)]);
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
function header(ledger){const head=new xdr.LedgerHeader({ledgerVersion:28,previousLedgerHash:Buffer.alloc(32),scpValue:new xdr.StellarValue({txSetHash:Buffer.alloc(32),closeTime:xdr.Uint64.fromString('1790539200'),upgrades:[],ext:xdr.StellarValueExt.stellarValueBasic()}),txSetResultHash:Buffer.alloc(32),bucketListHash:Buffer.alloc(32),ledgerSeq:ledger,totalCoins:xdr.Int64.fromString('1000000000000'),feePool:xdr.Int64.fromString('0'),inflationSeq:0,idPool:xdr.Uint64.fromString('0'),baseFee:100,baseReserve:5000000,maxTxSetSize:1000,skipList:Array.from({length:4},()=>Buffer.alloc(32)),ext:new xdr.LedgerHeaderExt(0)});return {kind:'latest',ledger,hash:hash(head.toXDR()),headerXdr:b64(head)};}
const data=(a,k)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(a).toScAddress(),key:k,durability:xdr.ContractDataDurability.persistent()}));
const ks=[xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(plan.wasmSha256,'hex')})),new Contract(plan.contractId).getFootprint(),...plan.assets.map(a=>new Contract(a).getFootprint()),...plan.assets.map(a=>data(plan.contractId,xdr.ScVal.scvVec([sym('Liability'),new Address(a).toScVal()]))),data(plan.assets[0],xdr.ScVal.scvVec([sym('Balance'),new Address(plan.contractId).toScVal()])),...roles.map(r=>xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(plan.actors[r]).toScAddress().accountId()})))];
const map=v=>xdr.ScVal.scvMap(Object.keys(v).sort().map(k=>new xdr.ScMapEntry({key:sym(k),val:v[k]})));
const code=real?fs.readFileSync(path.join(root,'contracts/agyion/target/wasm32v1-none/release/agyion.wasm')):Buffer.from('SYNTHETIC EXECUTABLE-AUTHENTICATION-ONLY DOUBLE');
const response={latestLedger:h,entries:ks.map((k,i)=>{let v;if(i===0)v=xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(plan.wasmSha256,'hex'),code}));else if(i>=7)v=xdr.LedgerEntryData.account(new xdr.AccountEntry({accountId:new Address(plan.actors[roles[i-7]]).toScAddress().accountId(),balance:xdr.Int64.fromString('1000000000'),seqNum:xdr.SequenceNumber.fromString('9'),numSubEntries:0,inflationDest:null,flags:0,homeDomain:'',thresholds:Buffer.from([1,0,0,0]),signers:[],ext:new xdr.AccountEntryExt(0)}));else{const val=i<4?xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:i===1?xdr.ContractExecutable.contractExecutableWasm(Buffer.from(plan.wasmSha256,'hex')):xdr.ContractExecutable.contractExecutableStellarAsset(),storage:i===1?[new xdr.ScMapEntry({key:en('AccountingVersion'),val:xdr.ScVal.scvU32(4)}),new xdr.ScMapEntry({key:en('Assets'),val:xdr.ScVal.scvVec(plan.assets.map(a=>new Address(a).toScVal()))})]:null})):i<6?int(0):map({amount:int(0),authorized:xdr.ScVal.scvBool(true),clawback:xdr.ScVal.scvBool(false)});v=xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:k.contractData().contract(),key:k.contractData().key(),durability:k.contractData().durability(),val}));}return {key:b64(k),val:b64(v),lastModifiedLedgerSeq:h-1,...(i<7?{liveUntilLedgerSeq:h+10000}:{})};})};
const initialEvidence={response,zeroBalanceEvidence:null,headerEvidence:header(h)},initial=S.initialPublicLifecycleState({plan,...initialEvidence}),stepId=plan.steps[0].id,call=C.bindPublicLifecycleCall({plan,stepId,headLedger:h}),binding={sequence:'10',headLedger:h,argsXdr:call.call.argsXdr},state=S.derivePublicLifecycleState({plan,initial,prefix:[],stepId,binding,phase:'before',inclusion:null,response,headerEvidence:header(h)});
const raw=structuredClone(input.raw),batch={response,headerEvidence:header(h),zeroBalanceEvidence:null},id=hash(canonical(batch));raw[plan.preflightObservations[0]].snapshots={[id]:batch};for(const row of Object.values(raw))for(const c of row.cases){c.beforeSnapshot=id;c.afterSnapshot=id;}
const options={plan,planSha256:state.planSha256,stepId,phase:'before',claim:{binding},currentInclusion:null,initialEvidence,state,verifiedPrefix:[],currentFee:null,snapshot:state.snapshot,beforeSnapshot:null,rawEvidence:raw};
const result=M.verifyPublicLifecycleObservations(options);assert.equal(result.evidence.length,11);assert.ok(result.evidence.every(r=>r.evidenceSha256.length===64));
assert.throws(()=>M.verifyPublicLifecycleObservations({...options,state:structuredClone(state)}),/DERIVED_BRAND/);
for(const mutation of [r=>delete r[plan.preflightObservations[2]],r=>r[plan.preflightObservations[2]].cases.pop(),r=>r[plan.preflightObservations[2]].cases.reverse(),r=>r[plan.preflightObservations[2]].cases[0].beforeSnapshot='11'.repeat(32),r=>r[plan.preflightObservations[0]].snapshots[id].response.latestLedger++,r=>r[plan.preflightObservations[2]].cases[0].response.error='transport failed Error(Contract, #3)',r=>r[plan.preflightObservations[2]].cases[0].response.latestLedger--,r=>{const c=r[plan.preflightObservations[2]].cases[0],e=xdr.TransactionEnvelope.fromXDR(c.request.envelopeXdr,'base64');e.v1().tx().seqNum(xdr.SequenceNumber.fromString('999'));c.request.envelopeXdr=b64(e);}]){const bad=structuredClone(raw);mutation(bad);assert.throws(()=>M.verifyPublicLifecycleObservations({...options,rawEvidence:bad}));}
const changed=structuredClone(batch),entry=changed.response.entries[7],a=xdr.LedgerEntryData.fromXDR(entry.val,'base64');a.account().balance(xdr.Int64.fromString('1000000001'));entry.val=b64(a);const changedId=hash(canonical(changed)),bad=structuredClone(raw);bad[plan.preflightObservations[0]].snapshots[changedId]=changed;bad[plan.preflightObservations[2]].cases[0].afterSnapshot=changedId;assert.throws(()=>M.verifyPublicLifecycleObservations({...options,rawEvidence:bad}),/UNCHANGED/);
const P=await import(moduleURL('public-lifecycle-policies.mjs')),policies=P.createPublicLifecyclePolicies();const scope={plan,planSha256:state.planSha256,stepId,phase:'before',claim:{stepId,binding},prefix:[],initialEvidence:{expected:initial.expected,response,headerEvidence:header(h)},currentInclusion:null,snapshotResponse:response,headerEvidence:header(h),beforeSnapshot:null};assert.equal(policies.verifyStateExpectations({...scope,expected:state.expected}).expectedSha256,hash(canonical(state.expected)));assert.deepEqual(policies.verifyObservations({...scope,snapshot:state.snapshot,currentFee:null,rawEvidence:raw}),result);
console.log(real?'actual-pinned-code full-preflight passed':'structural-full-preflight unit passed');
`;
async function fullGateFixture(t,mode){const fs=await import('node:fs'),path=await import('node:path'),{fileURLToPath}=await import('node:url'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');const root=fileURLToPath(new URL('../../',import.meta.url));const base=path.join(root,'artifacts');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'observation-unit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const raw={};for(const family of M.publicLifecycleObservationCases({plan,stepId:plan.steps[0].id,phase:'before'}))raw[family.observationKind]={cases:family.caseIds.map(caseId=>{const i=input(family.observationKind,caseId);return {caseId,ledger:i.ledger,timestamp:i.timestamp,beforeSnapshot:'',afterSnapshot:'',...rawCase(i)};})};const file=path.join(dir,'input.json'),script=path.join(dir,'run.mjs');fs.writeFileSync(file,JSON.stringify({plan,raw}));fs.writeFileSync(script,fullGateChild);return promisify(execFile)(process.execPath,[script,root,file,mode],{timeout:30000,maxBuffer:1024*1024});}
test('full preflight raw snapshots, real state brand/header, all families: unit executable-auth-only double',async t=>{const result=await fullGateFixture(t,'unit');assert.match(result.stdout,/structural-full-preflight unit passed/);});
test('opt-in exact compiled WASM: all initial observations and raw snapshots',{skip:process.env.PUBLIC_LIFECYCLE_OBSERVATIONS_WASM!=='1'},async t=>{const result=await fullGateFixture(t,'real');assert.match(result.stdout,/actual-pinned-code full-preflight passed/);});
test('a future included transition cannot witness an earlier terminal replay',()=>{const step=plan.steps.find(s=>s.method==='confirm_handoff'),i=caseInput(step,'fade-handoff-terminal-replay','replay');i.recordAnchors.find(r=>r.record===step.record).lastTransitionLedger=h+1;assert.throws(()=>M.publicLifecycleObservationIntent(i),/ANCHOR/);});
test('nested structured diagnostics cannot conceal a conflicting error',()=>{const e=new xdr.DiagnosticEvent({inSuccessfulContractCall:false,event:new xdr.ContractEvent({ext:new xdr.ExtensionPoint(0),contractId:null,type:xdr.ContractEventType.diagnostic(),body:new xdr.ContractEventBody(0,new xdr.ContractEventV0({topics:[],data:xdr.ScVal.scvVec([xdr.ScVal.scvError(xdr.ScError.sceContract(2))])}))})});assert.throws(()=>M.publicLifecycleSimulationError({latestLedger:h,error:'HostError: Error(Contract, #12)',events:[e.toXDR('base64')]}),/ERROR/);});
test('specific signature, authorization control and time/state prerequisites cannot be masked',()=>{
 const proof=input('unsupported-asset-valid-creation-proof','pod'),bad=rawCase(proof),e=xdr.TransactionEnvelope.fromXDR(bad.request.envelopeXdr,'base64');const call=e.v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract(),args=[...call.args()];args[5]=xdr.ScVal.scvBytes(Buffer.alloc(64));call.args(args);const original=bad.request.envelopeXdr;bad.request.envelopeXdr=e.toXDR('base64');assert.notEqual(bad.request.envelopeXdr,original);assert.throws(()=>M.verifyPublicLifecycleObservationCase(proof,bad),/SIGNATURE/);
 const step=plan.steps.find(s=>s.requiredObservations.includes('pod-recipient-auth-enforce')),auth=caseInput(step,'pod-recipient-auth-enforce','source');for(const change of [r=>delete r.control,r=>r.request.authMode='record']){const raw=rawCase(auth);change(raw);assert.throws(()=>M.verifyPublicLifecycleObservationCase(auth,raw),/INPUT|MODE/);}
 const crypto=caseInput(step,'pod-crypto-domain','purpose');crypto.recordAnchors.find(r=>r.record===step.record).value.unlock_ledger=h+1;assert.throws(()=>M.publicLifecycleObservationIntent(crypto),/PREREQUISITE/);crypto.recordAnchors.find(r=>r.record===step.record).value.unlock_ledger=h;crypto.recordAnchors.find(r=>r.record===step.record).value.state=1;assert.throws(()=>M.publicLifecycleObservationIntent(crypto),/PREREQUISITE/);
 assert.throws(()=>M.publicLifecycleSimulationError({latestLedger:h,error:'x'.repeat(2*1024*1024+1)}),/DATA/);
});

// Full observation aggregation with real state brands and exact code bytes.
// Fees/inclusions below are synthetic journal-context inputs, NOT raw metadata
// accounting proof. The separate journal integration replays actual V4 XDR.
test('opt-in full39 observation journey, historical windows, final aggregates and exact pins',{skip:process.env.PUBLIC_LIFECYCLE_OBSERVATIONS_WASM!=='1'},async()=>{
 const S=await import('../lib/public-lifecycle-state.mjs'),{createStateFixture}=await import('./helpers/public-lifecycle-state-fixture.mjs'),{createObservationFixture,loadLocalObservationPinFixture}=await import('./helpers/public-lifecycle-observation-fixture.mjs');
 const f=createStateFixture({realWasm:true}),j=f.journey(S),prefix=[],signers=Object.fromEntries(f.credentialRoles.map((r,i)=>[r,f.keys[i+2]]));let finalOptions;
 for(let i=0;i<39;i++){const step=f.plan.steps[i],stage=j.stages[i],inclusion={...stage.after.inclusion,hash:(i+1).toString(16).padStart(64,'0')},fee={schema:'agyion-public-v4-lifecycle-fees-v1',result:'txSuccess',metaVersion:4,sourceAccount:step.sourceAccount,networkPassphrase:f.plan.networkPassphrase,transactionHash:inclusion.hash,inclusionLedger:inclusion.ledger,authorizedFee:'1000',netFee:'100',resourceFeeRefund:'400',initialFeeDebit:'500',resultFeeCharged:'100'},observations={};
  for(const phase of ['before','after']){const state=phase==='before'?stage.pre:stage.post,data=stage[phase],historySnapshots={},record=state.recordAnchors.find(r=>r.record===step.record);
   for(const at of record?[record.value.unlock_ledger-1,record.value.deadline_ledger,record.value.claimed_at+record.value.handoff_window]:[]){if(!Number.isSafeInteger(at)||at<Math.max(1,...state.recordAnchors.map(r=>r.lastTransitionLedger))||at>=state.snapshot.ledger)continue;const response=structuredClone(data.response);response.latestLedger=at;for(const entry of response.entries)entry.lastModifiedLedgerSeq=Math.min(at,entry.lastModifiedLedgerSeq);historySnapshots[String(at)]={response,headerEvidence:f.header(at,'history'),zeroBalanceEvidence:null};}
   const raw=createObservationFixture({plan:f.plan,credentialSigners:signers,stepId:step.id,phase,state,currentSnapshotResponse:data.response,headerEvidence:data.headerEvidence,historySnapshots,...(i===38&&phase==='after'?{pins:loadLocalObservationPinFixture({ledger:state.snapshot.ledger})}:{})});
   const options={plan:f.plan,planSha256:state.planSha256,stepId:step.id,phase,claim:{stepId:step.id,binding:stage.before.binding},currentInclusion:phase==='after'?inclusion:null,initialEvidence:{expected:j.initial.expected,response:j.stages[0].before.response,headerEvidence:j.stages[0].before.headerEvidence},state,verifiedPrefix:structuredClone(prefix),currentFee:phase==='after'?fee:null,snapshot:state.snapshot,beforeSnapshot:phase==='after'?stage.pre.snapshot:null,rawEvidence:raw};
   observations[phase]=M.verifyPublicLifecycleObservations(options);if(i===38&&phase==='after')finalOptions=options;
  }
  prefix.push({stepId:step.id,binding:stage.before.binding,inclusion,fee,before:stage.pre.snapshot,after:stage.post.snapshot,observations});
 }
 assert.equal(prefix.length,39);assert.equal(prefix.at(-1).observations.after.evidence.length,6);assert.equal(prefix.at(-1).after.nativeReserveStroops,'1');
 for(const mutation of [o=>o.currentFee=null,o=>o.verifiedPrefix.pop(),o=>o.verifiedPrefix[0].observations.before.evidence.pop(),o=>o.verifiedPrefix[0].fee.resourceFeeRefund='401',o=>o.verifiedPrefix[1].inclusion.hash=o.verifiedPrefix[0].inclusion.hash,o=>delete o.rawEvidence['original-public-private-and-market-pins-unchanged'].pins,o=>o.rawEvidence['original-public-private-and-market-pins-unchanged'].pins.response.entries[0].liveUntilLedgerSeq=1,o=>o.rawEvidence['original-public-private-and-market-pins-unchanged'].pins.response.entries[0].liveUntilLedgerSeq=4294967296,o=>o.rawEvidence['original-public-private-and-market-pins-unchanged'].pins.releaseFiles['deployments/public-testnet.json']='eA==']){const bad={...finalOptions,verifiedPrefix:structuredClone(finalOptions.verifiedPrefix),rawEvidence:structuredClone(finalOptions.rawEvidence)};mutation(bad);assert.throws(()=>M.verifyPublicLifecycleObservations(bad));}
});

// Actual public protocol28 Testnet response captured 2026-09-27T18:23:16Z.
// One unsigned zero-amount simulation; no submission or lifecycle execution.
// Original HTTP bodies/params remain in lifecycle/observations-wire-real.
test('retained real zero-amount wire response and diagnostic XDR parse without normalization',async()=>{
 const {readFile}=await import('node:fs/promises'),raw=JSON.parse(await readFile(new URL('./fixtures/public-v4-zero-amount-simulation.json',import.meta.url),'utf8'));
 assert.equal(raw.latestLedger,4901961);assert.equal(raw.events.length,2);assert.equal(M.publicLifecycleSimulationError(raw),'Contract#3');
 const wrong=structuredClone(raw);wrong.error=wrong.error.replace('HostError: Error(Contract, #3)','HostError: Error(Contract, #12)');assert.throws(()=>M.publicLifecycleSimulationError(wrong),/ERROR/);
});
