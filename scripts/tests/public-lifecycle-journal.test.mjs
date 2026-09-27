import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildPublicLifecyclePlan, hashPublicLifecyclePlan } from '../lib/public-lifecycle-plan.mjs';
import { readPublicLifecycleState, executePublicLifecycleStep, recoverPublicLifecycleStep } from '../lib/public-lifecycle-journal.mjs';
const { Keypair, Address, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const root = fileURLToPath(new URL('../../artifacts/', import.meta.url));
const keys = Array.from({ length: 7 }, (_, i) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, i + 180)));
const plan = buildPublicLifecyclePlan({ preparedAt: '2026-09-27T17:00:00.000Z', recipient: keys[0].publicKey(), relayer: keys[1].publicKey(), credentialKeys: Object.fromEntries(['venue', 'podTimelock', 'podMixed', 'attester', 'agent'].map((role, i) => [role, keys[i + 2].publicKey()])) });
const planSha256 = hashPublicLifecyclePlan(plan), stepId = plan.steps[0].id;
function fixture(t) {
  fs.mkdirSync(root, { recursive: true });
  const home = fs.mkdtempSync(path.join(root, 'journal-test-')); fs.chmodSync(home, 0o700);
  const run = path.join(home, 'run'), lockRoot = path.join(home, 'locks'); fs.mkdirSync(run, { mode: 0o700 }); fs.mkdirSync(lockRoot, { mode: 0o700 });
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { run, lockRoot, plan, planSha256 };
}
const firstArgs = () => [new Address(plan.actors.seller).toScVal(), new Address(plan.assets[0]).toScVal(), ...['10000000', '-1000000', '-1000000', '0', '1'].map(v => nativeToScVal(BigInt(v), { type: 'i128' })), nativeToScVal(120, { type: 'u32' }), nativeToScVal(60, { type: 'u32' }), xdr.ScVal.scvBytes(keys[2].rawPublicKey())].map(v => v.toXDR('base64'));
const binding = () => ({ sequence: '10', headLedger: 5000000, argsXdr: firstArgs() });
const policies = { verifyObservations() { throw Error('test policy refused'); }, verifyStateExpectations() { throw Error('test state refused'); } };

test('immutable journal state binds reviewed plan and one explicit lock namespace', t => {
  const f = fixture(t); const state = readPublicLifecycleState(f);
  assert.equal(state.planSha256, planSha256); assert.equal(state.signedFeesStroops, '0'); assert.deepEqual(state.steps, []);
  const foreign = structuredClone(plan); foreign.steps[0].terms.price = '0';
  assert.throws(() => readPublicLifecycleState({ ...f, plan: foreign }), /LIFECYCLE_PLAN/);
  assert.throws(() => readPublicLifecycleState({ ...f, planSha256: '11'.repeat(32) }), /PLAN_HASH/);
});

test('a permanent exact claim exists before asynchronous work, and refusal never erases it', async t => {
  const f = fixture(t); let prepared = 0;
  await assert.rejects(executePublicLifecycleStep({ ...f, stepId, binding: binding(), evidence: { snapshot: { expected: {}, response: {} }, observations: {} }, ...policies,
    prepare: async () => { prepared++; throw Error('must not reach'); }, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} }), /test policy refused|OBSERVATION|FIELDS/);
  const claim = JSON.parse(fs.readFileSync(path.join(f.run, stepId + '.claim.json'), 'utf8'));
  assert.equal(claim.planSha256, planSha256); assert.deepEqual(claim.binding, binding()); assert.equal(prepared, 0);
  await assert.rejects(executePublicLifecycleStep({ ...f, stepId, binding: binding(), evidence: { snapshot: { expected: {}, response: {} }, observations: {} }, ...policies,
    prepare: async () => { prepared++; }, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} }), /CLAIMED|UNFINISHED/);
  assert.equal(prepared, 0);
});

test('missing predecessor, wrong scheduled args and malformed scope fail without preparation', async t => {
  const f = fixture(t); let calls = 0;
  const options = { ...f, stepId, binding: binding(), evidence: { snapshot: { expected: {}, response: {} }, observations: {} }, ...policies,
    prepare: async () => { calls++; }, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} };
  await assert.rejects(executePublicLifecycleStep({ ...options, stepId: plan.steps[1].id }), /PREDECESSOR/);
  const wrong = binding(); wrong.argsXdr[3] = nativeToScVal(0n, { type: 'i128' }).toXDR('base64');
  await assert.rejects(executePublicLifecycleStep({ ...options, binding: wrong }), /CALL_BINDING/);
  assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(f.run, stepId + '.claim.json')), false);
});

test('an unsigned claimed step offers no replacement transaction through recovery', async t => {
  const f = fixture(t);
  await assert.rejects(executePublicLifecycleStep({ ...f, stepId, binding: binding(), evidence: { snapshot: { expected: {}, response: {} }, observations: {} }, ...policies,
    prepare: async () => {}, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} }));
  let queries = 0;
  const state = await recoverPublicLifecycleStep({ ...f, stepId, getTransaction: async () => { queries++; }, collectEvidence: async () => {}, ...policies });
  assert.equal(state.status, 'claimed'); assert.equal(queries, 0);
});

test('unsafe run modes and symbolic record links are refused without following them', t => {
  const f = fixture(t); fs.chmodSync(f.run, 0o755);
  assert.throws(() => readPublicLifecycleState(f), /PRIVATE_DIRECTORY/);
  fs.chmodSync(f.run, 0o700); fs.symlinkSync(path.join(path.dirname(f.run), 'absent'), path.join(f.run, 'plan.json'));
  assert.throws(() => readPublicLifecycleState(f), /RECORD/);
});

test('historical pre-observations reach the trusted state policy and remain immutable for recovery', async t => {
  const f = fixture(t), observations = Object.fromEntries(plan.preflightObservations.map(name => [name, { earlierLedger: 4999990, prerequisite: 'synthetic-history' }]));
  const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
  const { createHash } = await import('node:crypto');
  const evidence = { snapshot: { expected: {}, response: {} }, observations };
  await assert.rejects(executePublicLifecycleStep({ ...f, stepId, binding: binding(), evidence,
    verifyObservations: ({ phase }) => ({ planSha256, stepId, phase, evidence: plan.preflightObservations.map(observationKind => ({ observationKind, ledger: 4999990, recordRef: plan.steps[0].record, expectedOutcome: 'synthetic specific rejection', evidenceSha256: createHash('sha256').update(canonical(observations[observationKind])).digest('hex') })) }),
    verifyStateExpectations: () => { throw Error('HISTORICAL_REACHED_STATE_POLICY'); }, prepare: async () => {}, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} }), /HISTORICAL_REACHED_STATE_POLICY/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.run, stepId + '.claim.json'), 'utf8')).evidence.observations, observations);
});

// These child processes substitute only the plan's real seller with an unfunded
// synthetic identity, and the snapshot/fee integration modules with explicit
// unit doubles. Real call binding, envelope parsing/signatures, receipt preimage
// and append-only filesystem code remain active. This is NOT chain/accounting
// integration evidence. The separately enabled real-decoder checkpoint is below.
const unitChild = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
const [root, home, mode] = process.argv.slice(2);
const url = name => pathToFileURL(path.join(root, 'scripts/lib', name)).href;
const { Account,Address,Keypair,Networks,Operation,SorobanDataBuilder,TransactionBuilder,nativeToScVal,xdr } = createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');
const roles=['seller','recipient','relayer','venue','podTimelock','podMixed','attester','agent'];
const keys=Object.fromEntries(roles.map((r,i)=>[r,Keypair.fromRawEd25519Seed(Buffer.alloc(32,101+i))]));
const realPlan=await import(url('public-lifecycle-plan.mjs'));
const original=realPlan.buildPublicLifecyclePlan({preparedAt:'2026-09-27T17:00:00.000Z',recipient:keys.recipient.publicKey(),relayer:keys.relayer.publicKey(),credentialKeys:Object.fromEntries(roles.slice(3).map(r=>[r,keys[r].publicKey()]))});
const plan=structuredClone(original); plan.actors.seller=keys.seller.publicKey(); for(const step of plan.steps)if(step.sourceRole==='seller')step.sourceAccount=plan.actors.seller;
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(canonical(v));
const validate=p=>{assert.deepEqual(p,plan);return true;};
mock.module(url('public-lifecycle-plan.mjs'),{namedExports:{validatePublicLifecyclePlan:validate,hashPublicLifecyclePlan:p=>{validate(p);return digest(p);}}});
let snapshots=0,fees=0;
if(mode!=='real-decoders')mock.module(url('public-lifecycle-readback.mjs'),{namedExports:{verifyPublicLifecycleSnapshot:({plan:p,expected},response)=>{validate(p);assert.equal(expected.unitScope,'snapshot-unit-boundary');assert.equal(response.snapshot.ledger,response.latestLedger);snapshots++;return response.snapshot;}}});
if(mode!=='real-decoders')mock.module(url('public-lifecycle-fees.mjs'),{namedExports:{reconcilePublicLifecycleFees:o=>{assert.equal(o.response.status,'SUCCESS');assert.equal(o.transactionHash,o.response.txHash);assert.equal(o.before.ledger<o.inclusionLedger,true);assert.equal(o.after.ledger>=o.inclusionLedger,true);fees++;return {netFee:'100',authorizedFee:'1000'};}}});
const J=await import(url('public-lifecycle-journal.mjs')),C=await import(url('public-lifecycle-call.mjs'));
const planSha256=digest(plan),run=path.join(home,'run'),lockRoot=path.join(home,'locks');for(const dir of [run,lockRoot])if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});
const base={run,lockRoot,plan,planSha256};
const sequences={seller:9,recipient:9,relayer:9};
let sends=0,signs=0,prepares=0,queries=0, latestSigned, result;
const step=plan.steps[0],head=5000000;
function bind(s,index=0){const headLedger=head+index*3;const o={plan,stepId:s.id,headLedger,...(['confirm_handoff','attest','envoy_claim'].includes(s.method)?{timestamp:'1790528400000'}:{})};const intent=C.publicLifecycleCallIntent(o);if(intent.credential)o.signatureHex=keys[intent.credential.role].sign(Buffer.from(intent.credential.payloadHex,'hex')).toString('hex');const derived=C.bindPublicLifecycleCall(o);const {plan:_,stepId:__,...rest}=o;return {sequence:String(sequences[s.sourceRole]+1),...rest,argsXdr:derived.call.argsXdr};}
function observations(s,phase){const index=plan.steps.indexOf(s);return phase==='before'?[...(index===0?plan.preflightObservations:[]),...s.requiredObservations]:[...s.postObservations,...(index===38?plan.finalObservations:[])];}
function evidence(s,phase,b){const ledger=b.headLedger+(phase==='after'?2:0);return {snapshot:{expected:{unitScope:'snapshot-unit-boundary'},response:{latestLedger:ledger,snapshot:{planSha256,ledger,accounts:Object.fromEntries(['seller','recipient','relayer'].map(r=>[r,{address:plan.actors[r],sequence:String(sequences[r]+(phase==='after'&&r===s.sourceRole?1:0)),balance:'1000000000'}]))}}},observations:Object.fromEntries(observations(s,phase).map(n=>[n,{ledger:phase==='before'?b.headLedger-1:ledger,record:s.record,result:'specific synthetic prerequisite'}]))};}
const policy={verifyObservations:({planSha256,stepId,phase,rawEvidence})=>({planSha256,stepId,phase,evidence:observations(plan.steps.find(s=>s.id===stepId),phase).map(observationKind=>{const raw=rawEvidence[observationKind];return {observationKind,ledger:raw.ledger,recordRef:raw.record,expectedOutcome:raw.result,evidenceSha256:digest(raw)};})}),verifyStateExpectations:({planSha256,stepId,phase,expected})=>({planSha256,stepId,phase,expectedSha256:digest(expected)})};
const address=v=>new Address(v).toScVal(),amount=v=>nativeToScVal(BigInt(v),{type:'i128'});
const tree=(target,method,args,children=[])=>new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(target).toScAddress(),functionName:method,args})),subInvocations:children});
function unsigned(claim){const call=claim.derived.call,args=call.argsXdr.map(v=>xdr.ScVal.fromXDR(v,'base64'));let auth=[],children=[];const funding=['create_fade','create_pod','create_trigger'].includes(call.method);const positive=call.method==='confirm_handoff'&&call.handoff.price==='1000000';if(funding)children=[tree(plan.assets[0],'transfer',[address(call.sourceAccount),address(plan.contractId),amount('10000000')])];if(positive)children=[tree(plan.assets[0],'transfer',[address(call.handoff.claimant),address(call.handoff.seller),amount('1000000')])];if(funding||positive||['claim','claim_pod','create_mandate','revoke_mandate','transfer'].includes(call.method))auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(call.target,call.method,args,children)})];return new TransactionBuilder(new Account(call.sourceAccount,String(BigInt(claim.binding.sequence)-1n)),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeContractFunction({contract:call.target,function:call.method,args,auth})).setSorobanData(new SorobanDataBuilder().setResourceFee(mode==='full-order'?'9999900':'900').build()).setTimebounds(0,Math.floor(Date.now()/1000)+80).build().toXDR();}
function receipt(claim,signedXdr){const tx=TransactionBuilder.fromXDR(signedXdr,Networks.TESTNET),rv=claim.derived.expectedCreatedId===null?xdr.ScVal.scvVoid():nativeToScVal(BigInt(claim.derived.expectedCreatedId),{type:'u64'});const preimage=new xdr.InvokeHostFunctionSuccessPreImage({returnValue:rv,events:[]});const meta=new xdr.TransactionMeta(4,new xdr.TransactionMetaV4({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],operations:[new xdr.OperationMetaV2({ext:new xdr.ExtensionPoint(0),changes:[],events:[]})],txChangesAfter:[],sorobanMeta:new xdr.SorobanTransactionMetaV2({ext:new xdr.SorobanTransactionMetaExt(0),returnValue:rv}),events:[],diagnosticEvents:[]}));const tr=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('100'),result:xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.from(sha(preimage.toXDR()),'hex'))))]),ext:new xdr.TransactionResultExt(0)});return {status:'SUCCESS',txHash:tx.hash().toString('hex'),ledger:claim.binding.headLedger+1,latestLedger:claim.binding.headLedger+2,createdAt:String(Math.floor(Date.now()/1000)),feeBump:false,envelopeXdr:signedXdr,resultXdr:tr.toXDR('base64'),resultMetaXdr:meta.toXDR('base64')};}
function opts(s=step,index=0,overrides={}){const b=bind(s,index);let claim;return {...base,stepId:s.id,binding:b,evidence:evidence(s,'before',b),...policy,prepare:async input=>{prepares++;claim=input.claim;assert.ok(fs.existsSync(path.join(run,s.id+'.claim.json')));return {envelopeXdr:unsigned(claim)};},sign:async ({unsignedXdr})=>{signs++;const tx=TransactionBuilder.fromXDR(unsignedXdr,Networks.TESTNET);tx.sign(keys[s.sourceRole]);return tx.toXDR();},sendTransaction:async signed=>{sends++;latestSigned=signed;const attempt=JSON.parse(fs.readFileSync(path.join(run,s.id+'.attempt.json'),'utf8'));assert.equal(attempt.signedXdr,signed);assert.equal(fs.statSync(path.join(run,s.id+'.attempt.json')).mode&0o777,0o600);result=receipt(claim,signed);throw Error('synthetic uncertain send');},getTransaction:async hash=>{queries++;assert.equal(hash,result.txHash);return result;},collectEvidence:async()=>evidence(s,'after',b),...overrides};}
const recovery=(o,override={})=>{const {binding,evidence,prepare,sign,sendTransaction,...r}=o;return {...r,...override};};
if(mode==='parent-fsync'){
 const seen=new Set(),old=fs.fsyncSync;fs.fsyncSync=function(fd){if(fs.fstatSync(fd).isDirectory())seen.add(fs.readlinkSync('/proc/self/fd/'+fd));return old(fd);};const o=opts();o.prepare=async()=>{assert.ok(seen.has(lockRoot),'lockRoot directory must be fsynced before preparation');assert.ok(seen.has(path.dirname(run)),'run and lockRoot parent must be fsynced');throw Error('ORDER_PROVEN');};await assert.rejects(J.executePublicLifecycleStep(o),/ORDER_PROVEN/);assert.equal(signs,0);assert.equal(sends,0);
}else if(mode==='signed-crash'){
 const old=fs.fsyncSync;fs.fsyncSync=function(fd){old(fd);if(fs.existsSync(path.join(run,step.id+'.attempt.json'))&&fs.fstatSync(fd).isDirectory())process.exit(72);};await J.executePublicLifecycleStep(opts());throw Error('crash did not occur');
}else if(mode==='crash-recovery'){
 const o=opts();const saved=JSON.parse(fs.readFileSync(path.join(run,step.id+'.attempt.json'),'utf8'));assert.equal(J.readPublicLifecycleState(base).signedFeesStroops,'1000');const got=await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async hash=>{queries++;assert.equal(hash,saved.hash);return {status:'NOT_FOUND'};}}));assert.equal(got.status,'pending');assert.equal(queries,1);assert.equal(sends,0);assert.equal(signs,0);assert.equal(prepares,0);
}else if(mode==='fee-cap'){
 const o=opts();o.prepare=async({claim})=>{const tx=TransactionBuilder.fromXDR(unsigned(claim),Networks.TESTNET).toEnvelope();tx.v1().tx().fee(10000001);return {envelopeXdr:tx.toXDR('base64')};};await assert.rejects(J.executePublicLifecycleStep(o),/LIFECYCLE_FEE/);assert.equal(signs,0);assert.equal(sends,0);
}else if(mode==='recovery'){
 const o=opts(step,0,{getTransaction:async()=>({status:'NOT_FOUND'})});const pending=await J.executePublicLifecycleStep(o);assert.equal(pending.status,'pending');assert.equal(sends,1);assert.equal(J.readPublicLifecycleState(base).signedFeesStroops,'1000');
 await assert.rejects(J.executePublicLifecycleStep(o),/CLAIMED/);
 const original=Date.now;Date.now=()=>original()+86400000;
 const done=await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async hash=>{queries++;assert.equal(hash,pending.hash);return result;}}));Date.now=original;
 assert.equal(done.status,'complete');assert.equal(done.createdId,'1');assert.equal(sends,1);assert.equal(signs,1);assert.equal(prepares,1);
 const repeated=await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async()=>{throw Error('must not query included');}}));assert.deepEqual(repeated,done);assert.ok(snapshots>2&&fees>0);
 await assert.rejects(J.recoverPublicLifecycleStep({...recovery(o),sendTransaction:()=>{}}),/FIELDS/);
}else if(mode==='full-order'){
 for(let i=0;i<39;i++){const s=plan.steps[i],o=opts(s,i);const done=await J.executePublicLifecycleStep(o);assert.equal(done.status,'complete');if(s.method.startsWith('create_'))assert.equal(done.createdId,C.bindPublicLifecycleCall({...(()=>{const {sequence,argsXdr,...rest}=o.binding;return rest;})(),plan,stepId:s.id}).expectedCreatedId);sequences[s.sourceRole]++;}
 const state=J.readPublicLifecycleState(base);assert.equal(state.steps.length,39);assert.equal(state.signedFeesStroops,'390000000');assert.equal(sends,39);assert.equal(state.steps.every(s=>s.status==='complete'),true);
}else if(mode==='malformed-inclusion'){
 const o=opts(step,0,{getTransaction:async()=>({status:'NOT_FOUND'})});await J.executePublicLifecycleStep(o);
 for(const change of [r=>r.txHash='11'.repeat(32),r=>r.envelopeXdr=r.envelopeXdr+'AAAA',r=>r.ledger=head-1,r=>r.status='FAILED',r=>{const tr=xdr.TransactionResult.fromXDR(r.resultXdr,'base64');tr.result().results()[0]=xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32))));r.resultXdr=tr.toXDR('base64');}]){const bad=structuredClone(result);change(bad);assert.notDeepEqual(bad,result,'each malformed receipt fixture must actually mutate the wire payload');await assert.rejects(J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async()=>bad})),/INCLUSION/);assert.equal(fs.existsSync(path.join(run,step.id+'.inclusion.json')),false);}
 const recovered=await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async()=>result}));assert.equal(recovered.createdId,'1');assert.equal(sends,1);
}else if(mode==='included-failure'){
 const o=opts();o.getTransaction=async hash=>{queries++;assert.equal(hash,result.txHash);const failed=structuredClone(result),tr=xdr.TransactionResult.fromXDR(failed.resultXdr,'base64'),meta=xdr.TransactionMeta.fromXDR(failed.resultMetaXdr,'base64');tr.result(xdr.TransactionResultResult.txFailed([xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()))]));meta.v4().sorobanMeta(null);failed.status='FAILED';failed.resultXdr=tr.toXDR('base64');failed.resultMetaXdr=meta.toXDR('base64');return failed;};const failed=await J.executePublicLifecycleStep(o);assert.equal(failed.status,'failed');assert.equal(failed.ledger,head+1);assert.equal(sends,1);const saved=JSON.parse(fs.readFileSync(path.join(run,step.id+'.inclusion.json'),'utf8'));assert.equal(saved.status,'FAILED');assert.equal(fs.existsSync(path.join(run,step.id+'.completion.json')),false);const sourceDir=path.join(lockRoot,fs.readdirSync(lockRoot)[0]);assert.equal(fs.readdirSync(sourceDir).some(n=>n.includes('.release.')),false);const state=J.readPublicLifecycleState(base);assert.equal(state.steps[0].status,'failed');assert.equal(state.signedFeesStroops,'1000');await assert.rejects(J.executePublicLifecycleStep(opts(plan.steps[1],1)),/PREDECESSOR/);for(let i=0;i<2;i++)assert.deepEqual(await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async()=>{throw Error('stored failure should not query');}})),failed);assert.equal(prepares,1);assert.equal(signs,1);assert.equal(sends,1);assert.equal(queries,1);
}else if(mode==='wrong-sequence'){
 const o=opts();o.binding.sequence='11';await assert.rejects(J.executePublicLifecycleStep(o),/SNAPSHOT_SEQUENCE/);assert.equal(prepares,0);assert.equal(signs,0);assert.equal(sends,0);
}else if(mode==='bad-policy'){
 const o=opts();o.verifyObservations=()=>true;await assert.rejects(J.executePublicLifecycleStep(o),/FIELDS/);assert.equal(prepares,0);
}else if(mode==='source-contention'){
 const o=opts();let resume,entered;const signal=new Promise(r=>entered=r),hold=new Promise(r=>resume=r);o.prepare=async ({claim})=>{prepares++;entered();await hold;return {envelopeXdr:unsigned(claim)};};o.sendTransaction=async()=>{sends++;};o.getTransaction=async()=>({status:'NOT_FOUND'});
 const first=J.executePublicLifecycleStep(o);await signal;const other=path.join(home,'other');fs.mkdirSync(other,{mode:0o700});await assert.rejects(J.executePublicLifecycleStep({...opts(),run:other}),/SOURCE_PENDING/);assert.equal(prepares,1);resume();await first;assert.equal(sends,1);
}else if(mode==='claim-only'){
 const o=opts();o.prepare=async()=>{prepares++;throw Error('interrupted unsigned preparation');};await assert.rejects(J.executePublicLifecycleStep(o),/interrupted/);assert.equal(signs,0);assert.equal(sends,0);const status=await J.recoverPublicLifecycleStep(recovery(o));assert.equal(status.status,'claimed');assert.equal(queries,0);
}else if(mode==='process-hold'){
 const o=opts();o.prepare=async()=>{fs.writeFileSync(path.join(home,'ready'),'ready');setInterval(()=>{},1000);await new Promise(()=>{});};await J.executePublicLifecycleStep(o);
}else if(mode==='process-contender'){
 const other=path.join(home,'other');fs.mkdirSync(other,{mode:0o700});await assert.rejects(J.executePublicLifecycleStep({...opts(),run:other}),/SOURCE_PENDING/);assert.equal(prepares,0);assert.equal(signs,0);assert.equal(sends,0);
}else throw Error('unknown unit child mode');
console.log('journal unit boundary passed '+mode);
`;

for (const mode of ['recovery', 'full-order', 'malformed-inclusion', 'wrong-sequence', 'bad-policy', 'source-contention', 'claim-only', 'fee-cap', 'parent-fsync', 'included-failure']) {
  test(`unit-only synthetic authority and decoder boundary: ${mode}`, async t => {
    const f = fixture(t), home = path.dirname(f.run), file = path.join(home, 'unit.mjs'); fs.writeFileSync(file, unitChild, { mode: 0o600 });
    const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
    const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', file, path.dirname(root), home, mode], { timeout: 60000, maxBuffer: 1024 * 1024 });
    assert.match(result.stdout, /journal unit boundary passed/);
  });
}

test('two actual processes share a source lock before any preparation in the contender', async t => {
  const f = fixture(t), home = path.dirname(f.run), file = path.join(home, 'unit.mjs'); fs.writeFileSync(file, unitChild, { mode: 0o600 });
  const { spawn, execFile } = await import('node:child_process'), { promisify } = await import('node:util');
  const args = mode => ['--experimental-test-module-mocks', file, path.dirname(root), home, mode];
  const holder = spawn(process.execPath, args('process-hold'), { stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise(resolve => holder.once('close', resolve));
  t.after(() => holder.kill('SIGKILL'));
  let errors = ''; holder.stderr.on('data', b => { errors += b; });
  const until = Date.now() + 10000;
  while (!fs.existsSync(path.join(home, 'ready')) && Date.now() < until && holder.exitCode === null) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(path.join(home, 'ready')), errors);
  assert.equal(holder.exitCode, null);
  const result = await promisify(execFile)(process.execPath, args('process-contender'), { timeout: 10000 });
  assert.equal(holder.exitCode, null);
  assert.match(result.stdout, /passed process-contender/); holder.kill('SIGKILL');
  await closed;
});

test('process death after signed file and directory fsync allows query-only recovery with zero sends', async t => {
  const f = fixture(t), home = path.dirname(f.run), file = path.join(home, 'unit.mjs'); fs.writeFileSync(file, unitChild, { mode: 0o600 });
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
  const run = promisify(execFile), args = mode => ['--experimental-test-module-mocks', file, path.dirname(root), home, mode];
  await assert.rejects(run(process.execPath, args('signed-crash'), { timeout: 10000 }), e => e.code === 72);
  const pending = JSON.parse(fs.readFileSync(path.join(f.run, plan.steps[0].id + '.attempt.json'), 'utf8'));
  assert.equal(pending.feeStroops, '1000'); assert.equal(fs.existsSync(path.join(f.run, plan.steps[0].id + '.inclusion.json')), false);
  const result = await run(process.execPath, args('crash-recovery'), { timeout: 10000 }); assert.match(result.stdout, /passed crash-recovery/);
});

const realDecoderChild = String.raw`
// Synthetic ledger envelopes, with REAL pinned bytecode/ABI snapshot and fee
// decoders. Only the fixed seller identity is substituted by test plan authority.
const {Contract,StrKey}=createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');
const closeTime=String(Math.floor(Date.now()/1000)),includedLedger=head+1;
const int=n=>xdr.Int64.fromString(String(n)),en=name=>xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
const map=values=>xdr.ScVal.scvMap(Object.keys(values).sort().map(k=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(k),val:values[k]})));
const dataKey=(id,key)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(id).toScAddress(),key,durability:xdr.ContractDataDurability.persistent()}));
function acct(role,phase){const a=new xdr.AccountEntry({accountId:keys[role].xdrPublicKey(),balance:int(10000000000n-(phase==='after'&&role==='seller'?10000400n:0n)),seqNum:int(phase==='after'&&role==='seller'?10:9),numSubEntries:0,inflationDest:null,flags:0,homeDomain:'',thresholds:Buffer.from([1,0,0,0]),signers:[],ext:new xdr.AccountEntryExt(0)});if(phase==='after'&&role==='seller')stamp(a);return a;}
function stamp(a){a.ext(new xdr.AccountEntryExt(1,new xdr.AccountEntryExtensionV1({liabilities:new xdr.Liabilities({buying:int(0),selling:int(0)}),ext:new xdr.AccountEntryExtensionV1Ext(2,new xdr.AccountEntryExtensionV2({numSponsored:0,numSponsoring:0,signerSponsoringIDs:[],ext:new xdr.AccountEntryExtensionV2Ext(3,new xdr.AccountEntryExtensionV3({ext:new xdr.ExtensionPoint(0),seqLedger:includedLedger,seqTime:xdr.Uint64.fromString(closeTime)}))}))})));return a;}
function realSnapshot(phase){const after=phase==='after',ledger=head+(after?2:0),t=step.terms;
 const value={seller:plan.actors.seller,asset:t.asset,pot:t.amount,start_price:t.price,floor_price:t.price,start_ledger:includedLedger,deadline_ledger:includedLedger+t.durationLedgers,handoff_window:t.handoffWindow,slope_num:'0',slope_den:'1',venue_pubkey:keys.venue.rawPublicKey().toString('hex'),state:0,claimant:null,claimed_at:null};
 const records=after?[{record:step.record,id:'1',creationLedger:includedLedger,preparedLedger:head,value}]:[];
 const expected={minLedger:ledger,maxLedger:ledger,initialSurplusStroops:'0',donationConfirmed:false,fundedHistory:after,records,accounts:Object.fromEntries(['seller','recipient','relayer'].map(r=>[r,{sequence:r==='seller'&&after?'10':'9'}])),zeroBalanceEvidence:null};
 const storage=[new xdr.ScMapEntry({key:en('AccountingVersion'),val:xdr.ScVal.scvU32(4)}),new xdr.ScMapEntry({key:en('Assets'),val:xdr.ScVal.scvVec(plan.assets.map(address))}),...(after?[new xdr.ScMapEntry({key:en('FadeCount'),val:nativeToScVal(1n,{type:'u64'})})]:[])];
 const ledgerKeys=[xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(plan.wasmSha256,'hex')})),new Contract(plan.contractId).getFootprint(),...plan.assets.map(a=>new Contract(a).getFootprint()),...plan.assets.map(a=>dataKey(plan.contractId,xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Liability'),address(a)]))),dataKey(plan.assets[0],xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'),address(plan.contractId)])),...['seller','recipient','relayer'].map(r=>xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:keys[r].xdrPublicKey()}))),...(after?[dataKey(plan.contractId,xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Fade'),nativeToScVal(1n,{type:'u64'})]))]:[])];
 const wasm=fs.readFileSync(path.join(root,'contracts/agyion/target/wasm32v1-none/release/agyion.wasm'));assert.equal(sha(wasm),plan.wasmSha256,'exact compiled candidate required');
 const entries=ledgerKeys.map((key,index)=>{let val;
 if(index===0)val=xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(plan.wasmSha256,'hex'),code:wasm}));
 else if(index>=7&&index<10)val=xdr.LedgerEntryData.account(acct(['seller','recipient','relayer'][index-7],phase));
 else{let v;if(index<4)v=xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:index===1?xdr.ContractExecutable.contractExecutableWasm(Buffer.from(plan.wasmSha256,'hex')):xdr.ContractExecutable.contractExecutableStellarAsset(),storage:index===1?storage:null}));else if(index<6)v=amount(after&&index===4?'10000000':'0');else if(index===6)v=map({amount:amount(after?'10000000':'0'),authorized:xdr.ScVal.scvBool(true),clawback:xdr.ScVal.scvBool(false)});else v=map(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v===null?xdr.ScVal.scvVoid():['seller','asset'].includes(k)?address(v):k==='venue_pubkey'?xdr.ScVal.scvBytes(Buffer.from(v,'hex')):typeof v==='number'?xdr.ScVal.scvU32(v):amount(v)])));val=xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:key.contractData().contract(),key:key.contractData().key(),durability:key.contractData().durability(),val:v}));}
 return {key:key.toXDR('base64'),val:val.toXDR('base64'),lastModifiedLedgerSeq:after&&(index<7||index===7||index===10)?includedLedger:head-1,...(index>=7&&index<10?{}:{liveUntilLedgerSeq:head+1000})};});return {expected,response:{latestLedger:ledger,entries}};
}
function realReceipt(claim,signed){const response=receipt(claim,signed);const entry=(a,last=includedLedger)=>new xdr.LedgerEntry({lastModifiedLedgerSeq:last,data:xdr.LedgerEntryData.account(a),ext:new xdr.LedgerEntryExt(0)});const state=a=>xdr.LedgerEntryChange.ledgerEntryState(entry(a)),update=a=>xdr.LedgerEntryChange.ledgerEntryUpdated(entry(a));
 const charged=acct('seller','before');charged.balance(int(9999999000n));const advanced=stamp(xdr.AccountEntry.fromXDR(charged.toXDR()));advanced.seqNum(int(10));const paid=xdr.AccountEntry.fromXDR(advanced.toXDR());paid.balance(int(9989999000n));
 const event=(n,stage)=>new xdr.TransactionEvent({stage,event:new xdr.ContractEvent({ext:new xdr.ExtensionPoint(0),contractId:StrKey.decodeContract(plan.assets[0]),type:xdr.ContractEventType.contract(),body:new xdr.ContractEventBody(0,new xdr.ContractEventV0({topics:[xdr.ScVal.scvSymbol('fee'),address(plan.actors.seller)],data:amount(String(n))}))})});
 const meta=xdr.TransactionMeta.fromXDR(response.resultMetaXdr,'base64');meta.v4().txChangesBefore([state(charged),update(advanced)]);meta.v4().operations()[0].changes([state(advanced),update(paid)]);meta.v4().sorobanMeta().ext(new xdr.SorobanTransactionMetaExt(1,new xdr.SorobanTransactionMetaExtV1({ext:new xdr.ExtensionPoint(0),totalNonRefundableResourceFeeCharged:int(100),totalRefundableResourceFeeCharged:int(200),rentFeeCharged:int(50)})));meta.v4().events([event(1000,xdr.TransactionEventStage.transactionEventStageBeforeAllTxes()),event(-600,xdr.TransactionEventStage.transactionEventStageAfterAllTxes())]);response.resultMetaXdr=meta.toXDR('base64');const result=xdr.TransactionResult.fromXDR(response.resultXdr,'base64');result.feeCharged(int(400));response.resultXdr=result.toXDR('base64');response.createdAt=closeTime;return response;
}
if(mode==='real-decoders'){
 const o=opts();o.evidence.snapshot=realSnapshot('before');let claimed;
 o.prepare=async({claim})=>{prepares++;claimed=claim;return {envelopeXdr:unsigned(claim)};};
 o.sendTransaction=async signed=>{sends++;result=realReceipt(claimed,signed);};o.getTransaction=async()=>({status:'NOT_FOUND'});
 o.collectEvidence=async()=>{const e=evidence(step,'after',o.binding);e.snapshot=realSnapshot('after');return e;};
 o.verifyStateExpectations=scope=>{assert.deepEqual(scope.expected,realSnapshot(scope.phase).expected);return policy.verifyStateExpectations(scope);};
 const pending=await J.executePublicLifecycleStep(o);assert.equal(pending.status,'pending');assert.equal(sends,1);
 const originalNow=Date.now;Date.now=()=>originalNow()+86400000;
 const done=await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async hash=>{queries++;assert.equal(hash,pending.hash);return result;}}));Date.now=originalNow;
 assert.equal(done.status,'complete');assert.equal(done.createdId,'1');assert.equal(sends,1);assert.equal(signs,1);assert.equal(prepares,1);
 const completion=JSON.parse(fs.readFileSync(path.join(run,step.id+'.completion.json'),'utf8'));assert.equal(completion.verified.fee.netFee,'400');assert.equal(completion.verified.after.snapshot.codeBytesAuthenticated,true);assert.equal(completion.verified.after.snapshot.liabilities[0].amount,'10000000');
 await J.recoverPublicLifecycleStep(recovery(o,{getTransaction:async()=>{throw Error('completed recovery must stay offline');}}));
 console.log('journal actual decoder checkpoint passed; exact local WASM; original create ID1; expired recovery; no real network');process.exit(0);
}
`;

test('local opt-in: genuine pinned WASM snapshot and fee decoder first create plus expired recovery', { skip: process.env.AGYION_LIFECYCLE_REAL_DECODERS !== '1' }, async t => {
  const f = fixture(t), home = path.dirname(f.run), file = path.join(home, 'real.mjs');
  fs.writeFileSync(file, unitChild.replace("if(mode==='parent-fsync'){", realDecoderChild + "\nif(mode==='parent-fsync'){"), { mode: 0o600 });
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
  const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', file, path.dirname(root), home, 'real-decoders'], { timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.match(result.stdout, /journal actual decoder checkpoint passed/);
});

test('corrupt source release cannot traverse outside its original run to a sibling record', async t => {
  const f = fixture(t), options = { ...f, stepId, binding: binding(), evidence: { snapshot: { expected: {}, response: {} }, observations: {} }, ...policies,
    prepare: async () => {}, sign: async () => {}, sendTransaction: async () => {}, getTransaction: async () => {}, collectEvidence: async () => {} };
  await assert.rejects(executePublicLifecycleStep(options));
  const sourceDir = path.join(f.lockRoot, fs.readdirSync(f.lockRoot)[0]), file = path.join(sourceDir, '000001.claim.json');
  const prior = JSON.parse(fs.readFileSync(file, 'utf8')); prior.stepId = '../outside/marker';
  fs.writeFileSync(file, JSON.stringify(prior));
  const { createHash } = await import('node:crypto');
  const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
  const outside = path.join(path.dirname(f.run), 'outside'); fs.mkdirSync(outside, { mode: 0o700 });
  const sentinel = path.join(outside, 'marker.completion.json'); fs.writeFileSync(sentinel, JSON.stringify({ harmless: 'path confinement sentinel only' }), { mode: 0o600 });
  const release = { schema: prior.schema, reservationSha256: createHash('sha256').update(canonical(prior)).digest('hex'), terminalFile: prior.stepId + '.completion.json', terminalSha256: '11'.repeat(32) };
  fs.writeFileSync(path.join(sourceDir, '000001.release.json'), JSON.stringify(release), { mode: 0o600 });
  const other = path.join(path.dirname(f.run), 'other'); fs.mkdirSync(other, { mode: 0o700 });
  const oldOpen = fs.openSync; let escaped = 0; fs.openSync = function (p, ...args) { if (p === sentinel) escaped++; return oldOpen.call(this, p, ...args); };
  try { await assert.rejects(executePublicLifecycleStep({ ...options, run: other }), /SOURCE_STEP|FILENAME/); } finally { fs.openSync = oldOpen; }
  assert.equal(escaped, 0);
});
