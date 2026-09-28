/** Synthetic early observation chronology and independent boundary regressions.
 * The real reducer supplies brands; scripted RPC does not execute a host.
 * Prefix inclusions/netFee100 are fixture inputs, NOT journal-authenticated fees.
 * No sidecar writer/replay validator, signing adapter or live RPC is exercised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
const { Account, Address, Operation, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const real = process.env.PUBLIC_LIFECYCLE_OBSERVATION_ACQUISITION_WASM === '1';
const readbackURL = new URL('../lib/public-lifecycle-readback.mjs', import.meta.url).href;
// Same explicit executable-auth-only double as the maintained acquisition tests.
// Opt-in requires the real fixed artifact; neither mode executes a host.
const hook = registerHooks({ resolve(specifier, context, next) {
  if (!real && specifier === './public-lifecycle-readback.mjs' && /public-lifecycle-(state|observations|policies|observation-acquisition)\.mjs$/.test(context.parentURL ?? '')) return { url: 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(readbackURL)}; import {verifyPublicLifecycleState} from ${JSON.stringify(readbackURL)}; export function verifyPublicLifecycleSnapshot(a,b){return {...verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true};}`), shortCircuit: true };
  return next(specifier, context);
} });
const A = await import('../lib/public-lifecycle-observation-acquisition.mjs');
const S = await import('../lib/public-lifecycle-state.mjs');
const O = await import('../lib/public-lifecycle-observations.mjs');
const { acquirePublicLifecycleSnapshot } = await import('../lib/public-lifecycle-acquisition.mjs');
const { createPublicLifecyclePolicies } = await import('../lib/public-lifecycle-policies.mjs');
const { createPublicLifecycleRpc } = await import('../lib/public-lifecycle-rpc.mjs');
hook.deregister();
const f = createStateFixture({ realWasm: real }), { plan } = f, MAX = 2 * 1024 * 1024;
const D = 'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ';
const NETWORK = 'Test SDF Network ; September 2015', roles = ['seller', 'recipient', 'relayer'];
const b64 = value => value.toXDR('base64'), sha = value => createHash('sha256').update(value).digest('hex');
const seconds = ledger => 1800001000 + (ledger - 1000) * 5;
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const address = v => new Address(v).toScVal(), u64 = v => nativeToScVal(BigInt(v), { type: 'u64' });
const be64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v)); return b; };
const refusal = code => e => { assert.equal(e.message, 'LIFECYCLE_OBSERVATION_ACQUISITION_' + code); assert.equal(e.cause, undefined); return true; };
// Independent fixed calls, Rust cutoffs and fixture economics, not intent output.
const ROWS = [
  { origin:12, originId:'12-pod-timelock-create_pod', targetId:'13-pod-timelock-claim_pod', record:'pod-timelock', id:1, state:0, kind:'pod-before-unlock', caseId:'locked', method:'claim_pod', source:'recipient', role:'podTimelock', code:6, prepared:1022, included:1023, cutoff:1052, lastEarly:1051, late:1052, balances:['989999600','999999400','999999800'], sequences:['14','16','12'], counters:{Fade:'3',Pod:'1',Trigger:'0',Mandate:'2'} },
  { origin:16, originId:'16-trigger-timeout-create_trigger', targetId:'17-trigger-timeout-refund_trigger', record:'trigger-timeout', id:2, state:0, kind:'trigger-early-refund', caseId:'early', method:'refund_trigger', source:'relayer', role:null, code:5, prepared:1058, included:1059, cutoff:1070, lastEarly:1070, late:1071, balances:['969999400','1019999300','999999700'], sequences:['16','17','13'], counters:{Fade:'3',Pod:'1',Trigger:'2',Mandate:'2'}, partner:{kind:'trigger-expired-attest-before-refund',caseId:'expired',method:'attest',source:'relayer',role:'attester',code:5} },
  { origin:18, originId:'18-fade-unclaimed-create_fade', targetId:'19-fade-unclaimed-refund', record:'fade-unclaimed', id:4, state:0, kind:'fade-unclaimed-early-refund', caseId:'early', method:'refund', source:'relayer', role:null, code:5, prepared:1073, included:1074, cutoff:1086, lastEarly:1086, late:1087, balances:['969999300','1019999300','999999600'], sequences:['17','17','14'], counters:{Fade:'4',Pod:'1',Trigger:'2',Mandate:'2'}, partner:{kind:'fade-late-claim-before-refund',caseId:'late',method:'claim',source:'recipient',role:null,code:2} },
  { origin:21, originId:'21-fade-no-show-claim', targetId:'22-fade-no-show-refund', record:'fade-no-show', id:5, state:1, kind:'fade-claimed-early-refund', caseId:'early', method:'refund', source:'relayer', role:null, code:5, prepared:1091, included:1092, cutoff:1104, lastEarly:1104, late:1105, balances:['969999200','1019999200','999999500'], sequences:['18','18','15'], counters:{Fade:'5',Pod:'1',Trigger:'2',Mandate:'2'}, partner:{kind:'fade-late-handoff-before-refund',caseId:'late',method:'confirm_handoff',source:'relayer',role:'venue',code:2} },
];
function wireHeader(head) {
  const h = xdr.LedgerHeader.fromXDR(f.header(head).headerXdr, 'base64'); h.ledgerVersion(28); h.scpValue().closeTime(xdr.Uint64.fromString(String(seconds(head))));
  const hash = sha(h.toXDR()), history = new xdr.LedgerHeaderHistoryEntry({ hash:Buffer.from(hash,'hex'), header:h, ext:new xdr.LedgerHeaderHistoryEntryExt(0) });
  const meta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({ ledgerHeader:history, txSet:new xdr.TransactionSet({previousLedgerHash:Buffer.alloc(32),txes:[]}), txProcessing:[], upgradesProcessing:[], scpInfo:[] }));
  return { id:hash,sequence:head,protocolVersion:28,closeTime:String(seconds(head)),headerXdr:b64(h),metadataXdr:b64(meta) };
}
function headerEvidence(head) { const h = wireHeader(head); return {kind:'latest',ledger:head,hash:h.id,headerXdr:h.headerXdr}; }
// Only representations are converted to protocol28. Every brand comes from S.
const state28 = {
  initialPublicLifecycleState: input => S.initialPublicLifecycleState({...input,headerEvidence:headerEvidence(input.response.latestLedger)}),
  derivePublicLifecycleState: input => S.derivePublicLifecycleState({...input,headerEvidence:headerEvidence(input.response.latestLedger)}),
};
function assertEconomics(state, row) {
  assert.deepEqual(state.snapshot.counters,row.counters);
  assert.deepEqual(roles.map(r=>state.snapshot.accounts[r].balance),row.balances);
  assert.deepEqual(roles.map(r=>state.snapshot.accounts[r].sequence),row.sequences);
  assert.equal(state.snapshot.nativeReserveStroops,'10000000'); assert.equal(state.snapshot.openPrincipalStroops,'10000000');
  assert.deepEqual(state.snapshot.liabilities.map(r=>r.amount),['10000000','0']);
  const record=state.recordAnchors.find(r=>r.record===row.record); assert.equal(record.id,String(row.id)); assert.equal(record.value.state,row.state);
  const cutoff=row.origin===12?record.value.unlock_ledger:row.origin===21?record.value.claimed_at+record.value.handoff_window:record.value.deadline_ledger;
  assert.equal(cutoff,row.cutoff); assert.equal(record.lastTransitionLedger,row.included);
}
function oracle(row, state, head, partner=false) {
  const spec=partner?{...row,...row.partner}:row, stamp=String(seconds(head)), role=spec.role;
  const purpose=role==='podTimelock'?'pod-claim:v3':role==='attester'?'attest:v2':'handoff:v2';
  const payload=role?Buffer.concat([Buffer.from('agyion:'+purpose+'\0'),Buffer.from(sha(NETWORK),'hex'),address(D).toXDR(),be64(row.id),address(plan.actors.recipient).toXDR(),...(role==='podTimelock'?[]:[be64(stamp)])]):null;
  const keyIndex={podTimelock:3,attester:5,venue:2}[role], key=role?f.keys[keyIndex]:null;
  if(key)assert.equal(key.publicKey(),plan.credentialKeys[role]); const signature=key?.sign(payload);
  const args=spec.method==='claim_pod'?[u64(row.id),address(plan.actors.recipient),xdr.ScVal.scvBytes(signature)]:spec.method==='claim'?[u64(row.id),address(plan.actors.recipient)]:['attest','confirm_handoff'].includes(spec.method)?[u64(row.id),u64(stamp),xdr.ScVal.scvBytes(signature)]:[u64(row.id)];
  const source=plan.actors[spec.source], account=state.snapshot.accounts[spec.source];
  const transaction=new TransactionBuilder(new Account(source,account.sequence),{fee:'100',networkPassphrase:NETWORK}).addOperation(Operation.invokeContractFunction({contract:D,function:spec.method,args,auth:[]})).setTimebounds(0,Number(stamp)+90).build().toXDR();
  let credentials=0;
  return { spec, params:{transaction,authMode:'record'}, get credentials(){return credentials;}, async credential(v){
    credentials++; assert.ok(role,'refund cases must never ask for a credential'); assert.equal(v.state,state); assert.equal(v.stepId,row.targetId); assert.equal(v.phase,'before'); assert.equal(v.observationKind,spec.kind); assert.equal(v.caseId,spec.caseId); assert.equal(v.ledger,head); assert.equal(v.timestamp,stamp);
    return {role,publicKey:key.publicKey(),payloadSha256:sha(payload),signatureHex:signature.toString('hex')};
  } };
}
function transport(chain, head, clock) {
  const cursor={head,simulation:null}, calls=[], fetched=[];
  const rpc=createPublicLifecycleRpc({fetch:async(url,init)=>{
    assert.equal(url,'https://soroban-testnet.stellar.org'); const q=JSON.parse(init.body); calls.push(q.method); let result;
    if(q.method==='getNetwork')result={passphrase:NETWORK,protocolVersion:28};
    else if(q.method==='getLedgerEntries'){
      assert.deepEqual(Object.keys(q.params),['keys']); // No historical-ledger entry selector.
      const fresh=f.snapshot(cursor.head,chain.records,chain.as,'0',false); fetched.push(cursor.head);
      result={latestLedger:cursor.head,entries:fresh.entries.map(({val,...entry})=>({...entry,xdr:val}))};
    } else if(q.method==='getLatestLedger')result=wireHeader(cursor.head);
    else if(q.method==='simulateTransaction'){
      const expected=cursor.simulation; assert.ok(expected,'no unplanned getter/duplicate simulation'); cursor.simulation=null;
      assert.deepEqual(q.params,expected.oracle.params); result={latestLedger:expected.ledger,error:'HostError: Error(Contract, #'+expected.oracle.spec.code+')'};
      cursor.head=expected.after;clock.value=seconds(cursor.head);
    } else assert.fail('Unexpected RPC method '+q.method);
    return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }});
  return {rpc,cursor,calls,fetched};
}
async function capture(plan,rpc) { return {acquisition:await acquirePublicLifecycleSnapshot({plan,rpc}),zeroBalanceEvidence:null,zeroRead:null}; }
function projectedAfter(out) { const b=out.snapshots[out.case.afterSnapshot];return {acquisition:{schema:'agyion-public-lifecycle-acquisition-v1',planSha256:out.planSha256,response:b.response,headerEvidence:b.headerEvidence,raw:out.captures.after.raw},zeroBalanceEvidence:b.zeroBalanceEvidence,zeroRead:out.captures.after.zeroRead}; }
async function setup(row, head, clock) {
  // Deliberately stop here: no target transition or future historical fixture is built.
  const chain=f.journey(state28,row.origin), stage=chain.stages.at(-1); assert.equal(chain.stages.length,row.origin);
  assert.equal(stage.after.stepId,row.originId);assert.equal(stage.after.binding.headLedger,row.prepared);assert.equal(stage.after.inclusion.ledger,row.included);
  assert.equal(plan.steps[row.origin].id,row.targetId); assert.equal(plan.contractId,D);assert.equal(plan.networkPassphrase,NETWORK);
  clock.value=seconds(head);const fx=transport(chain,head,clock),before=await capture(plan,fx.rpc);
  const state=S.derivePublicLifecycleState({...stage.after,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence});
  assert.equal(state.phase,'after');assert.equal(state.prefixLength,row.origin-1);assertEconomics(state,row);
  assert.deepEqual(state.snapshot.accounts,chain.prefix.at(-1).after.accounts); // Synthetic fee100 continuity only.
  return {chain,stage,fx,before,state};
}
function deriveTarget(row, boot, before) {
  const head=before.acquisition.response.latestLedger,binding=f.binding(row.origin,head,boot.chain.as);
  const input={plan,initial:boot.chain.initial,prefix:boot.chain.prefix,stepId:row.targetId,binding,phase:'before',inclusion:null,response:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence};
  const state=S.derivePublicLifecycleState(input); assert.equal(state.prefixLength,row.origin);assertEconomics(state,row);return {state,binding,input};
}
function phaseGate(row,boot,before,target,rawEvidence) {
  const initialResponse=f.snapshot(1000), initialEvidence={expected:boot.chain.initial.expected,response:initialResponse,headerEvidence:headerEvidence(1000)};
  const scope={plan,planSha256:target.state.planSha256,stepId:row.targetId,phase:'before',claim:{stepId:row.targetId,binding:target.binding},prefix:boot.chain.prefix,initialEvidence,currentInclusion:null,snapshotResponse:before.acquisition.response,headerEvidence:before.acquisition.headerEvidence,beforeSnapshot:null};
  const policies=createPublicLifecyclePolicies();policies.verifyStateExpectations({...scope,expected:target.state.expected});
  return policies.verifyObservations({...scope,snapshot:target.state.snapshot,currentFee:null,rawEvidence});
}
function rawCases(row,staged,late) {
  const kinds=row.origin===12?['pod-before-unlock','pod-crypto-domain','pod-recipient-auth-enforce','pod-destination-resigned-after-unlock']:[row.kind,row.partner.kind];
  const raw=Object.fromEntries(kinds.map(k=>[k,{cases:[]}]));raw[row.kind].cases=[staged.case];
  if(late)raw[row.partner.kind].cases=[late.case];raw[row.kind].snapshots={...staged.snapshots,...(late?.snapshots??{})};return raw;
}

test('proposed fixed early alias must exist; no fallback to generic overrides',()=>assert.equal(typeof A.acquirePublicLifecycleEarlyObservationCase,'function'));
for(const row of ROWS)for(const mode of ['at-inclusion','forward-two','cross-cutoff'])test(`early ${row.origin}->${row.origin+1}: ${mode}, then actual later fixture read`,async t=>{
  const clock={value:0};t.mock.method(Date,'now',()=>clock.value*1000);
  const head=mode==='cross-cutoff'?row.lastEarly:row.included,simHead=mode==='forward-two'?head+1:head,afterHead=mode==='forward-two'?head+2:mode==='cross-cutoff'?head+1:head;
  const boot=await setup(row,head,clock),or=oracle(row,boot.state,head),seenBefore=boot.fx.calls.length;
  await assert.rejects(A.acquirePublicLifecycleObservationCase({plan,state:boot.state,before:boot.before,observationKind:row.kind,caseId:row.caseId,observationCredential:or.credential,rpc:boot.fx.rpc}),refusal('SCOPE'));
  assert.equal(boot.fx.calls.length,seenBefore);assert.equal(or.credentials,0);
  boot.fx.cursor.simulation={oracle:or,ledger:simHead,after:afterHead};
  const wrapper=await A.acquirePublicLifecycleEarlyObservationCase({plan,state:boot.state,before:boot.before,observationCredential:or.credential,rpc:boot.fx.rpc});
  assert.deepEqual(wrapper.origin,{stepId:row.originId,phase:'after',prefixLength:row.origin-1,snapshotLedger:head});
  assert.equal(wrapper.schema,'agyion-public-lifecycle-early-acquisition-v1');assert.equal(wrapper.planSha256,boot.state.planSha256);
  const staged=wrapper.observation;assert.equal(staged.stepId,row.targetId);assert.equal(staged.phase,'before');assert.equal(staged.observationKind,row.kind);assert.equal(staged.case.caseId,row.caseId);assert.equal(staged.case.ledger,simHead);
  assert.deepEqual(staged.case.request,{envelopeXdr:or.params.transaction,authMode:'record'});assert.equal(or.credentials,row.role?1:0);
  assert.deepEqual(boot.fx.calls.slice(seenBefore),['simulateTransaction','getNetwork','getLedgerEntries','getLatestLedger']);
  assert.equal(projectedAfter(staged).acquisition.response.latestLedger,afterHead);assert.equal(staged.captures.after.zeroRead,null);
  assert.ok(Object.isFrozen(wrapper)&&Object.isFrozen(wrapper.origin));assert.ok(Buffer.byteLength(canonical(wrapper))<=MAX);
  const preserved=canonical(wrapper); // Capture is complete before any late head exists.
  const later=Math.max(row.late,afterHead);boot.fx.cursor.head=later;clock.value=seconds(later);
  let before=await capture(plan,boot.fx.rpc),target=deriveTarget(row,boot,before);
  assert.equal(boot.fx.fetched.at(-1),later);assert.equal(canonical(wrapper),preserved);
  assert.equal(staged.case.ledger,simHead);assert.equal(staged.snapshots[staged.case.beforeSnapshot].response.latestLedger,head);
  O.verifyPublicLifecycleObservationCase({plan,stepId:row.targetId,observationKind:row.kind,caseId:row.caseId,ledger:simHead,timestamp:staged.case.timestamp,recordAnchors:target.state.recordAnchors},{request:staged.case.request,response:staged.case.response});
  if(row.partner){
    const lateOracle=oracle(row,target.state,later,true);boot.fx.cursor.simulation={oracle:lateOracle,ledger:later,after:later};
    const late=await A.acquirePublicLifecycleObservationCase({plan,state:target.state,before,observationKind:row.partner.kind,caseId:row.partner.caseId,observationCredential:lateOracle.credential,rpc:boot.fx.rpc});
    assert.equal(lateOracle.credentials,row.partner.role?1:0);before=projectedAfter(late);target=deriveTarget(row,boot,before);
    assert.equal(phaseGate(row,boot,before,target,rawCases(row,staged,late)).evidence.length,2);
    const altered=rawCases(row,staged,late);altered[row.kind].cases[0]={...altered[row.kind].cases[0],ledger:later};
    assert.throws(()=>phaseGate(row,boot,before,target,altered),/LIFECYCLE_OBSERVATION_/);
  }else{
    // These chronological cases do not compose six ordinary Pod cases or its ENFORCE pair.
    assert.throws(()=>phaseGate(row,boot,before,target,rawCases(row,staged,null)),/LIFECYCLE_OBSERVATION_CASES/);
    if(mode==='at-inclusion')assert.ok(clock.value>seconds(head)+90,'old unsigned request is now expired and remains simulation-only');
  }
  assert.equal(canonical(wrapper),preserved);assert.deepEqual(boot.chain.as,boot.state.snapshot.accounts);
  t.diagnostic(JSON.stringify({origin:row.origin,mode,earlyBefore:head,simulation:simHead,earlyAfter:afterHead,later,syntheticPrefixFees:true,journalFeeReconciliation:false,sidecarPersistence:false,hostExecution:false}));
});

for(const row of ROWS)test(`early ${row.origin}: first late ledger must stop before after-read`,async t=>{
  const clock={value:0};t.mock.method(Date,'now',()=>clock.value*1000);const boot=await setup(row,row.lastEarly,clock),or=oracle(row,boot.state,row.lastEarly),n=boot.fx.calls.length;
  boot.fx.cursor.simulation={oracle:or,ledger:row.lastEarly+1,after:row.lastEarly+1};
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({plan,state:boot.state,before:boot.before,observationCredential:or.credential,rpc:boot.fx.rpc}),refusal('CASE'));
  assert.deepEqual(boot.fx.calls.slice(n),['simulateTransaction']);
});

test('serialized source state and caller target overrides cannot grant alias authority',async t=>{
  const row=ROWS[0],clock={value:0};t.mock.method(Date,'now',()=>clock.value*1000);const boot=await setup(row,row.included,clock),or=oracle(row,boot.state,row.included),n=boot.fx.calls.length;
  for(const extra of [{state:structuredClone(boot.state)},{stepId:row.targetId},{phase:'before'},{origin:{stepId:row.originId,phase:'after',prefixLength:11,snapshotLedger:row.included}}]){
    await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({plan,state:boot.state,before:boot.before,observationCredential:or.credential,rpc:boot.fx.rpc,...extra}),e=>{assert.match(e.message,/^LIFECYCLE_OBSERVATION_ACQUISITION_(STATE|INPUT)$/);return true;});
    assert.equal(or.credentials,0);assert.equal(boot.fx.calls.length,n);
  }
});

// Additional boundary regressions. Trusted capabilities below return synthetic
// raw data; they do not assert operator-signing or persisted-sidecar provenance.
const { buildPublicLifecyclePlan, hashPublicLifecyclePlan } = await import('../lib/public-lifecycle-plan.mjs');
const extraJourneys = new Map(), clone = value => structuredClone(value), measure = value => Buffer.byteLength(canonical(value));
async function extraBoot(t, row = ROWS[1]) {
  const clock = { value: seconds(row.included) }; t.mock.method(Date, 'now', () => clock.value * 1000);
  if (!extraJourneys.has(row.origin)) extraJourneys.set(row.origin, f.journey(state28, row.origin));
  const chain = extraJourneys.get(row.origin), stage = chain.stages.at(-1), fx = transport(chain, row.included, clock), before = await capture(plan, fx.rpc);
  const state = S.derivePublicLifecycleState({ ...stage.after, response: before.acquisition.response, headerEvidence: before.acquisition.headerEvidence }); assertEconomics(state, row);
  return { row, clock, chain, stage, fx, before, state };
}
function rawTransport(boot, edit = async () => {}) {
  const { row, state, before } = boot, or = oracle(row, state, state.snapshot.ledger), calls = [];
  const rpc = { async request(method, params) {
    calls.push(method); let result;
    if (method === 'simulateTransaction') { assert.deepEqual(params, or.params); result = { latestLedger: state.snapshot.ledger, error: `HostError: Error(Contract, #${row.code})` }; }
    else if (method === 'getNetwork') result = clone(before.acquisition.raw.network);
    else if (method === 'getLedgerEntries') { assert.deepEqual(Object.keys(params), ['keys']); result = clone(before.acquisition.raw.entries); }
    else if (method === 'getLatestLedger') result = clone(before.acquisition.raw.latest);
    else assert.fail('Unexpected trusted capability method ' + method);
    await edit(method, result, calls); return result;
  } };
  return { rpc, or, calls, input: { plan, state, before, rpc, observationCredential: or.credential } };
}
function editEntry(entries, index, field, edit) {
  const old = entries[index][field], value = xdr.LedgerEntryData.fromXDR(old, 'base64'); edit(value);
  entries[index][field] = b64(value); assert.notEqual(entries[index][field], old, 'mutation must change encoded ledger bytes');
}
function diagnostic(length) { return b64(new xdr.DiagnosticEvent({ inSuccessfulContractCall: false, event: new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: null, type: xdr.ContractEventType.diagnostic(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [], data: xdr.ScVal.scvString('x'.repeat(length)) })) }) })); }

test('early genuine wrong after origin, source-before and target-before brands cannot select an alias', async t => {
  const b = await extraBoot(t), fx = rawTransport(b), previous = b.chain.stages.at(-2).post;
  const sourceBefore = S.derivePublicLifecycleState({ ...b.stage.before, headerEvidence: headerEvidence(b.stage.before.response.latestLedger) });
  const targetBefore = deriveTarget(b.row, b, b.before).state;
  for (const state of [previous, sourceBefore, targetBefore]) {
    assert.equal(S.assertPublicLifecycleDerivedState(state), state);
    await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, state }), refusal('SCOPE'));
  }
  assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
});
test('early genuine brand cannot cross a separately valid immutable plan', async t => {
  const b = await extraBoot(t), fx = rawTransport(b);
  const variants = [
    ['preparation', { preparedAt: '2026-09-28T00:00:00.000Z' }],
    ['actors', { recipient: plan.actors.relayer, relayer: plan.actors.recipient }],
    ['credentials', { credentialKeys: { ...plan.credentialKeys, venue: plan.credentialKeys.agent, agent: plan.credentialKeys.venue } }],
  ];
  for (const [kind, override] of variants) {
    const otherPlan = buildPublicLifecyclePlan({ preparedAt: plan.preparedAt, recipient: plan.actors.recipient, relayer: plan.actors.relayer, credentialKeys: plan.credentialKeys, ...override });
    assert.notEqual(hashPublicLifecyclePlan(otherPlan), b.state.planSha256); assert.equal(S.assertPublicLifecycleDerivedState(b.state), b.state);
    if (kind === 'actors') { assert.equal(otherPlan.actors.recipient, plan.actors.relayer); assert.equal(otherPlan.actors.relayer, plan.actors.recipient); }
    if (kind === 'credentials') { assert.equal(otherPlan.credentialKeys.venue, plan.credentialKeys.agent); assert.equal(otherPlan.credentialKeys.agent, plan.credentialKeys.venue); }
    await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, plan: otherPlan }), refusal('STATE')); assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
  }
});
test('early exact options refuse every caller scope override and accessors without capability calls', async t => {
  const b = await extraBoot(t, ROWS[0]), fx = rawTransport(b);
  for (const extra of [{ stepId: b.row.targetId }, { phase: 'before' }, { observationKind: b.row.kind }, { caseId: 'locked' }, { origin: {} }, { sourceAccount: plan.actors.recipient }, { authMode: 'record' }, { early: true }])
    await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, ...extra }), refusal('INPUT'));
  let getters = 0; const accessor = { ...fx.input }; Object.defineProperty(accessor, 'before', { enumerable: true, get() { getters++; throw Error('SYNTHETIC_PRIVATE'); } });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(accessor), refusal('INPUT')); assert.equal(getters, 0); assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
});
test('early errors do not inspect thrown proxies or reuse exposed mutable errors', async t => {
  let prior; try { await A.acquirePublicLifecycleEarlyObservationCase({}); } catch (e) { prior = e; }
  prior.message = 'SYNTHETIC_PRIVATE'; prior.cause = Error('SYNTHETIC_PRIVATE');
  const poison = new Proxy({}, { getPrototypeOf() { throw Error('SYNTHETIC_PRIVATE'); } });
  for (const thrown of [prior, poison]) {
    const options = new Proxy({}, { getPrototypeOf() { return Object.prototype; }, ownKeys() { throw thrown; } });
    await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(options), e => { assert.notEqual(e, thrown); return refusal('INPUT')(e); });
  }
});
test('early complete wrapper refuses overflow while the same valid ordinary inner result fits', async t => {
  const b = await extraBoot(t), initial = rawTransport(b), reference = await A.acquirePublicLifecycleEarlyObservationCase(initial.input);
  const inner = clone(reference.observation); inner.case.response.events = [];
  const overhead = measure({ ...reference, observation: inner }) - measure(inner), goal = MAX - Math.ceil(overhead / 2), events = inner.case.response.events, large = diagnostic(44000);
  while (true) { events.push(large); if (measure(inner) > goal) { events.pop(); break; } }
  let low = 0, high = 44000;
  while (low < high) { const mid = Math.ceil((low + high) / 2); events.push(diagnostic(mid)); const fits = measure(inner) <= goal; events.pop(); if (fits) low = mid; else high = mid - 1; }
  events.push(diagnostic(low)); assert.ok(events.length <= 100 && events.every(e => e.length <= 65536));
  assert.ok(measure(inner) <= MAX); assert.ok(measure({ ...reference, observation: inner }) > MAX);
  O.verifyPublicLifecycleObservationCase({ plan, stepId: b.row.targetId, observationKind: b.row.kind, caseId: b.row.caseId, ledger: inner.case.ledger, timestamp: inner.case.timestamp, recordAnchors: b.state.recordAnchors }, { request: inner.case.request, response: inner.case.response });
  const target = deriveTarget(b.row, b, b.before), ordinary = rawTransport(b, async (method, result) => { if (method === 'simulateTransaction') result.events = [...events]; });
  const accepted = await A.acquirePublicLifecycleObservationCase({ ...ordinary.input, state: target.state, observationKind: b.row.kind, caseId: b.row.caseId });
  assert.deepEqual(accepted, inner); assert.ok(measure(accepted) <= MAX);
  const tooLarge = rawTransport(b, async (method, result) => { if (method === 'simulateTransaction') result.events = [...events]; });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(tooLarge.input), refusal('BOUNDS')); assert.deepEqual(tooLarge.calls, ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']);
  t.diagnostic(JSON.stringify({ validInnerBytes: measure(accepted), combinedWrapperBytes: measure({ ...reference, observation: accepted }), maxBytes: MAX, events: events.length }));
});
test('early pre-aborted native signal refuses without capability calls', async t => {
  const b = await extraBoot(t, ROWS[0]), fx = rawTransport(b), controller = new AbortController(); controller.abort();
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, signal: controller.signal }), refusal('ABORTED')); assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
});
test('early pending Pod credential abort cannot simulate even after late resolution', async t => {
  const b = await extraBoot(t, ROWS[0]), fx = rawTransport(b), controller = new AbortController(); let entered, release;
  const started = new Promise(r => { entered = r; });
  const pending = A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, signal: controller.signal, observationCredential: async value => { const signed = await fx.or.credential(value); entered(); await new Promise(r => { release = r; }); return signed; } });
  await started; controller.abort(); await assert.rejects(pending, refusal('ABORTED')); release(); await Promise.resolve(); await Promise.resolve();
  assert.equal(fx.or.credentials, 1); assert.deepEqual(fx.calls, []);
});
test('early abort while simulation is pending prevents every after-read', async t => {
  const b = await extraBoot(t), controller = new AbortController(); let entered, release; const started = new Promise(r => { entered = r; });
  const fx = rawTransport(b, async method => { if (method === 'simulateTransaction') { entered(); await new Promise(r => { release = r; }); } });
  const pending = A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, signal: controller.signal }); await started; controller.abort(); await assert.rejects(pending, refusal('ABORTED')); release(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(fx.calls, ['simulateTransaction']);
});
test('early abort immediately after negative resolution prevents the first after-read', async t => {
  const b = await extraBoot(t), controller = new AbortController(), fx = rawTransport(b, async method => { if (method === 'simulateTransaction') controller.abort(); });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, signal: controller.signal }), refusal('ABORTED')); assert.deepEqual(fx.calls, ['simulateTransaction']);
});
for (const kind of ['credential', 'simulation']) for (const interruption of ['deadline', 'abort']) test(`early queued ${kind} ${interruption} refuses before callback initiation`, async t => {
  const b = await extraBoot(t, kind === 'credential' ? ROWS[0] : ROWS[1]), fx = rawTransport(b), start = b.clock.value, controller = new AbortController(); let clocks = 0;
  t.mock.method(Date, 'now', () => { if (++clocks === (kind === 'credential' ? 1 : 2)) queueMicrotask(() => { if (interruption === 'abort') controller.abort(); else b.clock.value = start + 90; }); return b.clock.value * 1000; });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, signal: controller.signal }), refusal(interruption === 'abort' ? 'ABORTED' : 'TIME')); assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
});
for (const method of ['getNetwork', 'getLedgerEntries', 'getLatestLedger']) test(`early observed deadline at ${method} stops the next read`, async t => {
  const b = await extraBoot(t), start = b.clock.value, fx = rawTransport(b, async m => { if (m === method) b.clock.value = start + 90; });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(fx.input), refusal('TIME')); const all = ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']; assert.deepEqual(fx.calls, all.slice(0, all.indexOf(method) + 1));
});
test('early clock rollback after simulation refuses before readback', async t => {
  const b = await extraBoot(t), start = b.clock.value, fx = rawTransport(b, async method => { if (method === 'simulateTransaction') b.clock.value = start - 1; });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(fx.input), refusal('TIME')); assert.deepEqual(fx.calls, ['simulateTransaction']);
});
for (const part of ['network', 'entries', 'header']) test(`early before raw ${part} mismatch cannot rely on normalized branded rows`, async t => {
  const b = await extraBoot(t, ROWS[0]), fx = rawTransport(b), before = clone(b.before);
  if (part === 'network') before.acquisition.raw.network.passphrase = 'SYNTHETIC_OTHER_NETWORK';
  else if (part === 'entries') editEntry(before.acquisition.raw.entries.entries, 7, 'xdr', d => d.account().balance(xdr.Int64.fromString(String(BigInt(d.account().balance().toString()) + 1n))));
  else before.acquisition.raw.latest.protocolVersion = 27;
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, before }), refusal('BEFORE')); assert.deepEqual(fx.calls, []); assert.equal(fx.or.credentials, 0);
});
for (const row of ROWS) for (const phase of ['before', 'after']) test(`early ${row.origin} funded Balance omission ${phase} refuses without a zero getter`, async t => {
  const b = await extraBoot(t, row), fx = rawTransport(b, async (method, result) => { if (phase === 'after' && method === 'getLedgerEntries') result.entries.splice(6, 1); }), before = clone(b.before);
  if (phase === 'before') { before.acquisition.response.entries.splice(6, 1); before.acquisition.raw.entries.entries.splice(6, 1); }
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase({ ...fx.input, before }), refusal('ZERO'));
  assert.deepEqual(fx.calls, phase === 'before' ? [] : ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']); assert.equal(fx.or.credentials, row.role && phase === 'after' ? 1 : 0);
});
const economicMutations = [
  ['account balance', 'UNCHANGED', rows => editEntry(rows, 7, 'xdr', d => d.account().balance(xdr.Int64.fromString(String(BigInt(d.account().balance().toString()) + 1n))))],
  ['account sequence', 'SNAPSHOT', rows => editEntry(rows, 7, 'xdr', d => d.account().seqNum(xdr.SequenceNumber.fromString(String(BigInt(d.account().seqNum().toString()) + 1n))))],
  ['liability', 'SNAPSHOT', rows => editEntry(rows, 4, 'xdr', d => d.contractData().val(nativeToScVal(10000001n, { type: 'i128' })))],
  ['counter', 'SNAPSHOT', rows => editEntry(rows, 1, 'xdr', d => { const map = d.contractData().val().instance().storage(), entry = map.find(v => v.key().vec()?.[0]?.sym().toString() === 'FadeCount'); assert.ok(entry); entry.val(nativeToScVal(4n, { type: 'u64' })); })],
  ['record', 'SNAPSHOT', rows => editEntry(rows, rows.length - 1, 'xdr', d => { const entry = d.contractData().val().map().find(v => v.key().sym().toString() === 'deadline_ledger'); assert.ok(entry); entry.val(xdr.ScVal.scvU32(entry.val().u32() + 1)); })],
];
for (const [name, code, change] of economicMutations) test(`early canonical after ${name} mutation refuses`, async t => {
  const b = await extraBoot(t), fx = rawTransport(b, async (method, result) => { if (method === 'getLedgerEntries') change(result.entries); });
  await assert.rejects(A.acquirePublicLifecycleEarlyObservationCase(fx.input), refusal(code)); assert.deepEqual(fx.calls, ['simulateTransaction', 'getNetwork', 'getLedgerEntries', 'getLatestLedger']);
});
test('early retained historical case and snapshot mutations fail the real later before gate', async t => {
  const b = await extraBoot(t), row = b.row, fx = rawTransport(b), wrapper = await A.acquirePublicLifecycleEarlyObservationCase(fx.input), staged = wrapper.observation;
  b.fx.cursor.head = row.late; b.clock.value = seconds(row.late); const before = await capture(plan, b.fx.rpc), target = deriveTarget(row, b, before), lateOracle = oracle(row, target.state, row.late, true);
  b.fx.cursor.simulation = { oracle: lateOracle, ledger: row.late, after: row.late };
  const late = await A.acquirePublicLifecycleObservationCase({ plan, state: target.state, before, observationKind: row.partner.kind, caseId: row.partner.caseId, rpc: b.fx.rpc, observationCredential: lateOracle.credential });
  const raw = rawCases(row, staged, late); assert.equal(phaseGate(row, b, before, target, raw).evidence.length, 2);
  for (const change of [
    v => { v[row.kind].cases[0].ledger = row.late; },
    v => { const q = v[row.kind].cases[0].request, tx = xdr.TransactionEnvelope.fromXDR(q.envelopeXdr, 'base64'); tx.v1().tx().seqNum(xdr.SequenceNumber.fromString('999')); q.envelopeXdr = b64(tx); },
    v => { v[row.kind].cases[0].response.error = 'HostError: Error(Contract, #2)'; },
    v => { const batches = v[row.kind].snapshots, id = staged.case.beforeSnapshot, batch = batches[id]; editEntry(batch.response.entries, 7, 'val', d => d.account().balance(xdr.Int64.fromString(String(BigInt(d.account().balance().toString()) + 1n)))); const fresh = sha(canonical(batch)); batches[fresh] = batch; delete batches[id]; for (const family of Object.values(v)) for (const c of family.cases) for (const k of ['beforeSnapshot', 'afterSnapshot']) if (c[k] === id) c[k] = fresh; },
  ]) { const bad = clone(raw); change(bad); assert.notDeepEqual(bad, raw); assert.throws(() => phaseGate(row, b, before, target, bad), /LIFECYCLE_OBSERVATION_/); }
  // Raw sidecar is outside the pure phase schema; do not claim this gate secures it.
  const sidecarOnly = clone(wrapper); sidecarOnly.observation.captures.before.raw.network.passphrase = 'UNVERIFIED_SIDECAR_ONLY';
  assert.equal(phaseGate(row, b, before, target, rawCases(row, sidecarOnly.observation, late)).evidence.length, 2);
});
