/** Fixed public V4 simulation observations. Pure public data only: no signing,
 * transport or submission. Case verification is NOT a snapshot/completion gate.
 * The full gate consumes journal-replayed context and authenticated snapshots. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validatePublicLifecyclePlan, hashPublicLifecyclePlan } from './public-lifecycle-plan.mjs';
import { verifyPublicLifecycleSnapshot } from './public-lifecycle-readback.mjs';
import { assertPublicLifecycleDerivedState, verifyPublicLifecycleHeader } from './public-lifecycle-state.mjs';
const { Address, Keypair, StrKey, nativeToScVal, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const OLD = 'CBIIHFELPAKC2KJD4NCJSB32BQO5QUBNEKHBMISFB4MVDKBVM6AJSRXT';
const MAX = 2 * 1024 * 1024;
const ensure = (ok, code) => { if (!ok) throw Error(`LIFECYCLE_OBSERVATION_${code}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(v, seen = new Set(), depth = 0) {
  ensure(depth <= 32, 'DATA');
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') { ensure(Buffer.byteLength(v) <= MAX, 'DATA'); return JSON.stringify(v); }
  if (typeof v === 'number') { ensure(Number.isSafeInteger(v) && !Object.is(v, -0), 'DATA'); return String(v); }
  const array = Array.isArray(v); ensure(v && typeof v === 'object' && !seen.has(v) && Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype), 'DATA');
  const d = Object.getOwnPropertyDescriptors(v), names = Reflect.ownKeys(d); ensure(names.length <= 10000 && names.every(k => typeof k === 'string'), 'DATA'); seen.add(v);
  let out;
  if (array) { ensure(names.length === v.length + 1, 'DATA'); out = '[' + Array.from({ length: v.length }, (_, i) => { ensure(d[i] && d[i].enumerable && Object.hasOwn(d[i], 'value'), 'DATA'); return canonical(d[i].value, seen, depth + 1); }).join(',') + ']'; }
  else out = '{' + names.sort().map(k => { ensure(d[k].enumerable && Object.hasOwn(d[k], 'value'), 'DATA'); return JSON.stringify(k) + ':' + canonical(d[k].value, seen, depth + 1); }).join(',') + '}';
  seen.delete(v); ensure(Buffer.byteLength(out) <= MAX, 'DATA'); return out;
}
const digest = value => sha(canonical(value));
const copy = value => JSON.parse(canonical(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function exact(value, required, optional = []) { ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'INPUT'); const keys = Reflect.ownKeys(value); ensure(required.every(k => Object.hasOwn(value, k)) && keys.every(k => typeof k === 'string' && [...required, ...optional].includes(k)), 'INPUT'); canonical(value); }
const same = (a, b, code) => ensure(canonical(a) === canonical(b), code);
const ledger = v => ensure(Number.isSafeInteger(v) && v > 0 && v < 0xffffffff, 'LEDGER');
const decimal = v => { ensure(typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v) && BigInt(v) < (1n << 64n), 'INTEGER'); return BigInt(v); };
const R = {
 'initial-reviewed-code-and-empty-accounting': [], 'distinct-actor-authority-and-remaining-funds': [],
 'creation-nonpositive-amount': ['fade-zero','fade-negative','pod-zero','pod-negative','trigger-zero','trigger-negative'],
 'fade-floor-below-pot':['floor'], 'fade-zero-slope-denominator':['denominator'], 'fade-zero-duration-or-handoff':['duration','handoff'], 'fade-excessive-span':['duration','handoff'],
 'zero-credential-key':['fade','pod','trigger','mandate'], 'trigger-current-past-or-max-deadline':['current','past','max'], 'trigger-kernel-or-asset-beneficiary':['kernel','asset'],
 'unsupported-asset-valid-creation-proof':['fade','pod','trigger'], 'fade-kernel-or-asset-claimant-record-mode':['kernel','asset'], 'fade-claim-wrong-source-enforce':['source'], 'fade-second-claim':['replay'],
 'envoy-capped-positive-price':['capped'], 'envoy-permissive-positive-price':['permissive'], 'positive-handoff-wrong-source-enforce':['source'],
 'pod-before-unlock':['locked'], 'pod-crypto-domain':['recipient','purpose','deployment','legacy'], 'pod-recipient-auth-enforce':['source'], 'pod-destination-resigned-after-unlock':['kernel','asset'],
 'trigger-crypto-before-attest':['beneficiary','deployment'], 'trigger-early-refund':['early'], 'trigger-expired-attest-before-refund':['expired'],
 'fade-unclaimed-early-refund':['early'], 'fade-late-claim-before-refund':['late'], 'fade-claimed-early-refund':['early'], 'fade-late-handoff-before-refund':['late'],
 'envoy-invalid-signature-before-claim':['signature'], 'envoy-replay':['replay'], 'envoy-owner-mismatch-relayer-authorized':['owner'], 'envoy-revoked-before-claim':['revoked'], 'envoy-expired-before-claim':['expired'],
 'mixed-three-obligations-backed':[], 'fade-handoff-terminal-replay':['replay'], 'pod-claim-terminal-replay':['replay'], 'trigger-attest-terminal-replay':['replay'], 'trigger-refund-terminal-replay':['replay'], 'fade-refund-terminal-replay':['replay'],
 'all-required-simulations-have-matching-errors-and-prerequisites':[], 'all-39-original-inclusions-and-fee-metadata-reconciled':[], 'all-final-records-counters-and-live-ttls':[], 'both-liabilities-zero-and-native-surplus-increased-by-one':[], 'original-public-private-and-market-pins-unchanged':[],
};
freeze(R);
function schedule(plan, stepId, phase) {
 validatePublicLifecyclePlan(plan); const i = plan.steps.findIndex(s => s.id === stepId); ensure(i >= 0 && ['before','after'].includes(phase), 'SCOPE'); const s = plan.steps[i];
 return phase === 'before' ? [...(i === 0 ? plan.preflightObservations : []), ...s.requiredObservations] : [...s.postObservations, ...(i === 38 ? plan.finalObservations : [])];
}
export function publicLifecycleObservationCases(input) {
 exact(input,['plan','stepId','phase']); return freeze(schedule(input.plan,input.stepId,input.phase).map(observationKind=>({observationKind,caseIds:[...R[observationKind]]})));
}
const addr = a => new Address(a).toScVal();
const n = (v, type = 'i128') => nativeToScVal(type === 'u32' ? Number(v) : BigInt(v), {type});
const key = (p,r) => xdr.ScVal.scvBytes(StrKey.decodeEd25519PublicKey(p.credentialKeys[r]));
const be = (v,size) => { const b = Buffer.alloc(size); let value=BigInt(v); if(value<0n)value+=(1n<<BigInt(size*8)); for(let i=size-1;i>=0;i--){b[i]=Number(value&255n);value>>=8n;} ensure(value===0n,'INTEGER'); return b; };
const zeroSig = () => xdr.ScVal.scvBytes(Buffer.alloc(64));
function anchored(input, name) {
 const rows=input.recordAnchors.filter(r=>r.record===name); ensure(rows.length===1,'ANCHOR'); const r=rows[0]; decimal(r.id); ledger(r.creationLedger); ledger(r.lastTransitionLedger); ensure(r.creationLedger<=r.lastTransitionLedger&&r.lastTransitionLedger<=input.ledger && r.value && r.type,'ANCHOR');
 const create=input.plan.steps.find(s=>s.record===name && s.method.startsWith('create_')); ensure(create,'ANCHOR'); const id=String(input.plan.steps.slice(0,input.plan.steps.indexOf(create)+1).filter(s=>s.method===create.method).length); ensure(r.id===id,'ANCHOR'); return r;
}
/** Simulation-only public intent; placeholders never authorize a submission.
 * Credentials bind exact public payloads. For corrupted signatures, sign the
 * payload then flip its first byte; the verifier checks both relationships. */
export function publicLifecycleObservationIntent(raw) {
 exact(raw,['plan','stepId','observationKind','caseId','ledger','timestamp','recordAnchors']); const input=copy(raw),{plan,stepId,observationKind:k,caseId:c,ledger:h,timestamp}=input;
 validatePublicLifecyclePlan(plan); ledger(h); decimal(timestamp); ensure(Array.isArray(input.recordAnchors),'ANCHOR');
 const step=plan.steps.find(s=>s.id===stepId); ensure(step && [...schedule(plan,stepId,'before'),...schedule(plan,stepId,'after')].includes(k) && R[k]?.includes(c),'CASE');
 const A=plan.actors,asset=plan.assets[0]; let method,args,source=A.seller,mode='record',error,controlSource=null,credential=null,role,purpose,payloadParts,actualParts,domain=plan.contractId,actualPurpose,corrupt=false;
 const prefix=(tag,deployment=plan.contractId)=>Buffer.concat([Buffer.from(`agyion:${tag}\0`),Buffer.from(sha(plan.networkPassphrase),'hex'),addr(deployment).toXDR()]);
 const creation = type => {
  method='create_'+type;
  if(type==='fade')args=[addr(A.seller),addr(asset),n('10000000'),n('0'),n('0'),n('0'),n('1'),n(120,'u32'),n(60,'u32'),key(plan,'venue')];
  if(type==='pod'){role='podTimelock';purpose='pod-create:v3';args=[addr(A.seller),addr(asset),n('10000000'),n(h+30,'u32'),key(plan,role),zeroSig()];}
  if(type==='trigger')args=[addr(A.seller),addr(asset),n('10000000'),addr(A.recipient),key(plan,'attester'),n(h+120,'u32')];
  if(type==='mandate'){source=A.recipient;args=[addr(A.recipient),key(plan,'agent'),n('500000'),n('500000'),n(h+1000,'u32')];}
 };
 const r=()=>anchored(input,step.record), check=(condition)=>ensure(condition,'PREREQUISITE');
 const claim = () => { method='claim';source=A.recipient;args=[n(r().id,'u64'),addr(A.recipient)]; };
 const pod = () => {const x=r();method='claim_pod';source=A.recipient;role=plan.steps.find(s=>s.record===step.record&&s.method==='create_pod').terms.credentialRole;purpose='pod-claim:v3';args=[n(x.id,'u64'),addr(A.recipient),zeroSig()];payloadParts=[be(x.id,8),addr(A.recipient).toXDR()];};
 const handoff = () => {method='confirm_handoff';source=r().value.start_price==='1000000'?A.recipient:A.relayer;role='venue';purpose='handoff:v2';args=[n(r().id,'u64'),n(timestamp,'u64'),zeroSig()];payloadParts=[be(r().id,8),addr(A.recipient).toXDR(),be(timestamp,8)];};
 const attest = () => {method='attest';source=A.relayer;role='attester';purpose='attest:v2';args=[n(r().id,'u64'),n(timestamp,'u64'),zeroSig()];payloadParts=[be(r().id,8),addr(A.recipient).toXDR(),be(timestamp,8)];};
 const refund = type => {method=type;source=A.relayer;args=[n(r().id,'u64')];};
 const envoy = grant => {const g=anchored(input,grant);method='envoy_claim';source=A.relayer;role='agent';purpose='envoy:v2';args=[n(g.id,'u64'),n(r().id,'u64'),n(timestamp,'u64'),zeroSig()];payloadParts=[be(g.id,8),be(r().id,8),be(timestamp,8)];return g;};
 if(k==='creation-nonpositive-amount'){const [type,value]=c.split('-');creation(type);args[2]=n(value==='zero'?'0':'-1');role=null;error='Contract#3';}
 else if(k==='fade-floor-below-pot'){creation('fade');args[4]=n('-10000001');error='Contract#3';}
 else if(k==='fade-zero-slope-denominator'){creation('fade');args[6]=n('0');error='Contract#4';}
 else if(k==='fade-zero-duration-or-handoff'||k==='fade-excessive-span'){creation('fade');args[c==='duration'?7:8]=n(k==='fade-excessive-span'?1000001:0,'u32');error=k==='fade-excessive-span'?'Contract#12':'Contract#4';}
 else if(k==='zero-credential-key'){creation(c);args[{fade:9,pod:4,trigger:4,mandate:1}[c]]=xdr.ScVal.scvBytes(Buffer.alloc(32));role=null;error='Contract#7';}
 else if(k==='trigger-current-past-or-max-deadline'){creation('trigger');args[5]=n(c==='current'?h:c==='past'?h-1:0xffffffff,'u32');error='Contract#12';}
 else if(k==='trigger-kernel-or-asset-beneficiary'){creation('trigger');args[3]=addr(c==='kernel'?plan.contractId:asset);error='Contract#12';}
 else if(k==='unsupported-asset-valid-creation-proof'){creation(c);args[1]=addr(OLD);error='Contract#14';}
 else if(k==='fade-kernel-or-asset-claimant-record-mode'||k==='fade-claim-wrong-source-enforce'){check(r().value.state===0&&h<=r().value.deadline_ledger);claim();if(k.includes('record-mode')){args[1]=addr(c==='kernel'?plan.contractId:asset);error='Contract#12';}else{source=A.relayer;mode='enforce';controlSource=A.recipient;error='Auth/InvalidAction';}}
 else if(k==='fade-second-claim'){check(r().value.state===1);claim();error='Contract#2';}
 else if(k==='envoy-capped-positive-price'||k==='envoy-permissive-positive-price'){check(r().value.state===0&&r().value.start_price==='1000000'&&h<=r().value.deadline_ledger);const g=envoy(k.includes('capped')?'grant-capped':'grant-permissive');check(!g.value.revoked&&h<=g.value.valid_until&&g.value.claims_used===0);error=k.includes('capped')?'Contract#9':'Contract#12';}
 else if(k==='positive-handoff-wrong-source-enforce'){check(r().value.state===1&&r().value.start_price==='1000000'&&h<=r().value.claimed_at+r().value.handoff_window);handoff();source=A.relayer;mode='enforce';controlSource=A.recipient;error='Auth/InvalidAction';}
 else if(k==='pod-before-unlock'){check(r().value.state===0&&h<r().value.unlock_ledger);pod();error='Contract#6';}
 else if(['pod-crypto-domain','pod-recipient-auth-enforce','pod-destination-resigned-after-unlock'].includes(k)){
  check(r().value.state===0&&h>=r().value.unlock_ledger);pod();error='Crypto/InvalidInput';
  if(k==='pod-crypto-domain'){if(c==='recipient'){args[1]=addr(A.relayer);source=A.relayer;actualParts=[be(r().id,8),addr(A.relayer).toXDR()];}if(c==='purpose'){actualPurpose=purpose;purpose='handoff:v2';}if(c==='deployment')domain=OLD;if(c==='legacy'){actualPurpose=purpose;purpose='pod-claim:v2';}}
  else if(k==='pod-recipient-auth-enforce'){source=A.relayer;mode='enforce';controlSource=A.recipient;error='Auth/InvalidAction';}
  else {args[1]=addr(c==='kernel'?plan.contractId:asset);payloadParts=[be(r().id,8),args[1].toXDR()];error='Contract#12';}
 }
 else if(k==='trigger-crypto-before-attest'){check(r().value.state===0&&h<=r().value.deadline_ledger);attest();if(c==='beneficiary'){actualParts=payloadParts;payloadParts=[be(r().id,8),addr(A.relayer).toXDR(),be(timestamp,8)];}else domain=OLD;error='Crypto/InvalidInput';}
 else if(k==='trigger-early-refund'){check(r().value.state===0&&h<=r().value.deadline_ledger);refund('refund_trigger');error='Contract#5';}
 else if(k==='trigger-expired-attest-before-refund'){check(r().value.state===0&&h>r().value.deadline_ledger);attest();error='Contract#5';}
 else if(k==='fade-unclaimed-early-refund'){check(r().value.state===0&&h<=r().value.deadline_ledger);refund('refund');error='Contract#5';}
 else if(k==='fade-late-claim-before-refund'){check(r().value.state===0&&h>r().value.deadline_ledger);claim();error='Contract#2';}
 else if(k==='fade-claimed-early-refund'){check(r().value.state===1&&h<=r().value.claimed_at+r().value.handoff_window);refund('refund');error='Contract#5';}
 else if(k==='fade-late-handoff-before-refund'){check(r().value.state===1&&h>r().value.claimed_at+r().value.handoff_window);handoff();error='Contract#2';}
 else if(['envoy-invalid-signature-before-claim','envoy-replay','envoy-revoked-before-claim','envoy-expired-before-claim'].includes(k)){
  const g=envoy(k==='envoy-expired-before-claim'?'grant-expiry':'grant-capped');
  if(k==='envoy-revoked-before-claim'){check(r().value.state===0&&g.value.revoked);error='Contract#11';}
  else if(k==='envoy-expired-before-claim'){check(r().value.state===0&&!g.value.revoked&&h>g.value.valid_until);error='Contract#10';}
  else {check(!g.value.revoked&&h<=g.value.valid_until&&h<=r().value.deadline_ledger);if(k==='envoy-replay'){check(r().value.state===1&&g.value.claims_used===1&&g.value.daily_used==='0');error='Contract#2';}else{check(r().value.state===0&&g.value.claims_used===0);corrupt=true;error='Crypto/InvalidInput';}}
 }
 else if(k==='envoy-owner-mismatch-relayer-authorized'){const g=r();check(g.value.owner===A.recipient&&!g.value.revoked);method='revoke_mandate';source=A.relayer;mode='enforce';controlSource=A.recipient;args=[addr(A.relayer),n(g.id,'u64')];error='Contract#11';}
 else if(k==='fade-handoff-terminal-replay'){check(r().value.state===2);handoff();error='Contract#2';}
 else if(k==='pod-claim-terminal-replay'){check(r().value.state===1);pod();error='Contract#2';}
 else if(k==='trigger-attest-terminal-replay'){check(r().value.state===1);attest();error='Contract#2';}
 else if(k==='trigger-refund-terminal-replay'){check(r().value.state===2);refund('refund_trigger');error='Contract#2';}
 else if(k==='fade-refund-terminal-replay'){check(r().value.state===3);refund('refund');error='Contract#5';}
 else throw Error('LIFECYCLE_OBSERVATION_CASE');
 if(role){
  if(method==='create_pod')payloadParts=[args[0].toXDR(),args[1].toXDR(),be(BigInt(args[2].i128().hi().toBigInt()<<64n)+args[2].i128().lo().toBigInt(),16),be(args[3].u32(),4),args[4].bytes()];
  const payload=Buffer.concat([prefix(purpose,domain),...payloadParts]),actual=Buffer.concat([prefix(actualPurpose??(method==='claim_pod'?'pod-claim:v3':purpose)),...(actualParts??payloadParts)]);
  credential={role,publicKey:plan.credentialKeys[role],payloadHex:payload.toString('hex'),actualPayloadHex:actual.toString('hex'),corruptFirstByte:corrupt,argumentIndex:args.length-1};
 }
 const call={target:plan.contractId,method,sourceAccount:source,argsXdr:args.map(a=>a.toXDR('base64'))};
 let control=null;if(controlSource){control={...call,sourceAccount:controlSource,argsXdr:[...call.argsXdr]};if(method==='revoke_mandate')control.argsXdr[0]=addr(A.recipient).toXDR('base64');}
 return freeze({observationKind:k,caseId:c,ledger:h,timestamp,authMode:mode,expectedError:error,call,credential,control});
}
/** Supported terminal wire grammar only; a trace substring cannot count. */
export function publicLifecycleSimulationError(raw) {
 const response=copy(raw);ensure(typeof response.error==='string'&&response.error.length<=65536&&!response.results&&!response.restorePreamble,'ERROR');ledger(response.latestLedger);
 const first=response.error.split('\n')[0],m=/^(?:HostError: )?Error\((Contract), #(2|3|4|5|6|7|9|10|11|12|14)\)$|^(?:HostError: )?Error\((Crypto|Auth), (InvalidInput|InvalidAction)\)$/.exec(first);
 ensure(m,'ERROR');const value=m[1]?`Contract#${m[2]}`:`${m[3]}/${m[4]}`;ensure(value!=='Crypto/InvalidAction'&&value!=='Auth/InvalidInput','ERROR');
 ensure(!response.transactionData&&!response.minResourceFee,'ERROR');
 if(response.events!==undefined){ensure(Array.isArray(response.events)&&response.events.length<=100,'ERROR');for(const item of response.events){ensure(typeof item==='string'&&item.length<=65536,'ERROR');let event;try{event=xdr.DiagnosticEvent.fromXDR(item,'base64');}catch{throw Error('LIFECYCLE_OBSERVATION_ERROR');}ensure(event.toXDR('base64')===item,'ERROR');const body=event.event().body().v0();const visit=(v,depth=0)=>{ensure(depth<=10,'ERROR');const type=v.switch().name;if(type==='scvError'){const e=v.error(),kind=e.switch().name;const decoded=kind==='sceContract'?`Contract#${e.contractCode()}`:kind==='sceCrypto'&&e.code().name==='scecInvalidInput'?'Crypto/InvalidInput':kind==='sceAuth'&&e.code().name==='scecInvalidAction'?'Auth/InvalidAction':null;ensure(decoded===value,'ERROR');}else if(type==='scvVec')for(const child of v.vec()??[])visit(child,depth+1);else if(type==='scvMap')for(const row of v.map()??[]){visit(row.key(),depth+1);visit(row.val(),depth+1);}};for(const v of [...body.topics(),body.data()])visit(v);}}
 return value;
}
function decode(Type, value, max=65536){ensure(typeof value==='string'&&value.length>0&&value.length<=max,'XDR');let out;try{out=Type.fromXDR(value,'base64');}catch{throw Error('LIFECYCLE_OBSERVATION_XDR');}ensure(out.toXDR('base64')===value,'XDR');return out;}
function invocation(raw, call, credential, mode, plan) {
 const envelope=decode(xdr.TransactionEnvelope,raw,131072);ensure(envelope.switch().name==='envelopeTypeTx'&&envelope.v1().signatures().length===0,'ENVELOPE');const tx=envelope.v1().tx();
 ensure(tx.sourceAccount().switch().name==='keyTypeEd25519'&&StrKey.encodeEd25519PublicKey(tx.sourceAccount().ed25519())===call.sourceAccount&&tx.memo().switch().name==='memoNone'&&tx.operations().length===1,'ENVELOPE');
 const op=tx.operations()[0];ensure(op.sourceAccount()==null&&op.body().switch().name==='invokeHostFunction','ENVELOPE');const host=op.body().invokeHostFunctionOp();ensure(host.hostFunction().switch().name==='hostFunctionTypeInvokeContract','ENVELOPE');const f=host.hostFunction().invokeContract();
 ensure(f.contractAddress().toXDR('base64')===new Address(call.target).toScAddress().toXDR('base64')&&f.functionName().toString()===call.method,'CALL');const args=[...call.argsXdr];
 if(credential){const val=f.args()[credential.argumentIndex];ensure(val?.switch().name==='scvBytes'&&val.bytes().length===64,'SIGNATURE');const signature=Buffer.from(val.bytes()),original=Buffer.from(signature);if(credential.corruptFirstByte)original[0]^=1;
  const signer=Keypair.fromPublicKey(credential.publicKey);ensure(signer.verify(Buffer.from(credential.payloadHex,'hex'),original),'SIGNATURE');const actualValid=signer.verify(Buffer.from(credential.actualPayloadHex,'hex'),signature);ensure(actualValid===(!credential.corruptFirstByte&&credential.payloadHex===credential.actualPayloadHex),'SIGNATURE');args[credential.argumentIndex]=val.toXDR('base64');}
 same(f.args().map(a=>a.toXDR('base64')),args,'CALL');
 const tree=(target,method,values,children=[])=>new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(target).toScAddress(),functionName:method,args:values})),subInvocations:children});
 if(mode==='record')ensure(host.auth().length===0,'AUTH');
 else {const children=call.method==='confirm_handoff'?[tree(plan.assets[0],'transfer',[addr(plan.actors.recipient),addr(plan.actors.seller),n('1000000')])]:[];const auth=host.auth();ensure(auth.length===1&&auth[0].credentials().switch().name==='sorobanCredentialsSourceAccount'&&auth[0].rootInvocation().toXDR('base64')===tree(call.target,call.method,f.args(),children).toXDR('base64'),'AUTH');}
 if(tx.ext().switch()===1){const ext=tx.ext().sorobanData().ext();ensure(ext.switch()===0||(ext.switch()===1&&ext.resourceExt().archivedSorobanEntries().length===0),'RESTORE');}else ensure(tx.ext().switch()===0,'RESTORE');
 return envelope;
}
/** Case semantics only. Does not authenticate snapshots, RPC transport, history,
 * funds or final aggregates; never use this export to release journal work. */
export function verifyPublicLifecycleObservationCase(input, raw) {
 const evidence=copy(raw);exact(evidence,['request','response'],['control']);exact(evidence.request,['envelopeXdr','authMode']);const intent=publicLifecycleObservationIntent(input);ensure(evidence.request.authMode===intent.authMode,'MODE');invocation(evidence.request.envelopeXdr,intent.call,intent.credential,intent.authMode,input.plan);
 ensure(evidence.response.latestLedger===input.ledger,'LEDGER');ensure(publicLifecycleSimulationError(evidence.response)===intent.expectedError,'ERROR');
 if(intent.control){exact(evidence.control,['request','response']);exact(evidence.control.request,['envelopeXdr','authMode']);ensure(evidence.control.request.authMode==='enforce','CONTROL');invocation(evidence.control.request.envelopeXdr,intent.control,intent.credential,'enforce',input.plan);const r=evidence.control.response;ensure(!r.error&&!r.restorePreamble&&r.latestLedger===input.ledger&&Array.isArray(r.results)&&r.results.length===1&&r.results[0].xdr===xdr.ScVal.scvVoid().toXDR('base64'),'CONTROL');const data=decode(xdr.SorobanTransactionData,r.transactionData);const ext=data.ext();ensure(ext.switch()===0||(ext.switch()===1&&ext.resourceExt().archivedSorobanEntries().length===0),'RESTORE');ensure(typeof r.minResourceFee==='string'&&/^(0|[1-9][0-9]*)$/.test(r.minResourceFee),'CONTROL');}
 else ensure(evidence.control===undefined,'CONTROL');
 return freeze({caseId:intent.caseId,ledger:input.ledger,result:`simulation-only:${intent.expectedError}`,evidenceSha256:digest(evidence)});
}

/** Fixed public release bytes, checked without filesystem access. */
export const PUBLIC_LIFECYCLE_PINS = freeze([
 {role:'public',contractId:OLD,wasmSha256:'1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378',path:'deployments/public-testnet.json',fileSha256:'9401031958e828761a3d13b3a0fe696b9da460a052d0812b848e2945fde0087e',fileBytes:1174},
 {role:'private-original',contractId:'CDSK32ISKXRW6PX3ZMCHLUP4URNQSYNNH2GZU7ZSZJFL4FSEFQM25YHT',wasmSha256:'103f46d4eb97b021f2618e307970ce49993417901789e03760a4af512b7fee6e',path:'app/app/lib/private/release.json',fileSha256:'4944e60b435b6f0f943b90690d53ff0ca4492b678b296c9a3c12ac3bcbcf5b1e',fileBytes:1925},
 {role:'private-guarded',contractId:'CAI6HUPV6VLXRKJKSCANRM4YP7W6ZNLBUZFK4GEUG5O3OB4X43RBE2ZB',wasmSha256:'4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018',path:'app/app/lib/private/guarded-release.json',fileSha256:'4883e3a9dda52b552b873d138c1d255e3235fed3ddcc02ac9f17b5ec89d9dd62',fileBytes:1924},
 {role:'market',contractId:'CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ',wasmSha256:'b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c',path:'deployments/market-testnet.json',fileSha256:'02c1f19579d6cafafe3ed657ffb748c88726b0ea03a8a18d9502483fd6aa64aa',fileBytes:5317},
]);
function pinEvidence(raw, head) {
 exact(raw,['response','releaseFiles']);exact(raw.response,['latestLedger','entries']);exact(raw.releaseFiles,PUBLIC_LIFECYCLE_PINS.map(p=>p.path));
 const observed=raw.response.latestLedger;ledger(observed);ensure(observed<=head&&head-observed<=2,'PIN_LEDGER');ensure(Array.isArray(raw.response.entries)&&raw.response.entries.length===8,'PIN_ROWS');
 const rows=new Map();for(const row of raw.response.entries){exact(row,['key','val','lastModifiedLedgerSeq','liveUntilLedgerSeq']);const key=decode(xdr.LedgerKey,row.key,1024),value=decode(xdr.LedgerEntryData,row.val,1024*1024);ensure(!rows.has(row.key),'PIN_ROWS');ledger(row.lastModifiedLedgerSeq);ensure(row.lastModifiedLedgerSeq<=observed&&Number.isSafeInteger(row.liveUntilLedgerSeq)&&row.liveUntilLedgerSeq<=0xffffffff&&row.liveUntilLedgerSeq>=observed,'PIN_TTL');rows.set(row.key,{key,value});}
 for(const p of PUBLIC_LIFECYCLE_PINS){
  const codeKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(p.wasmSha256,'hex')})).toXDR('base64');const instanceKey=xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(p.contractId).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent()})).toXDR('base64');
  const code=rows.get(codeKey),instance=rows.get(instanceKey);ensure(code?.value.switch().name==='contractCode'&&instance?.value.switch().name==='contractData','PIN_KEY');
  ensure(code.value.contractCode().hash().toString('hex')===p.wasmSha256&&sha(code.value.contractCode().code())===p.wasmSha256,'PIN_CODE');
  const d=instance.value.contractData(),k=instance.key.contractData();ensure(d.ext().switch()===0&&d.contract().toXDR('base64')===k.contract().toXDR('base64')&&d.key().toXDR('base64')===k.key().toXDR('base64')&&d.durability().name==='persistent'&&d.val().switch().name==='scvContractInstance','PIN_INSTANCE');const executable=d.val().instance().executable();ensure(executable.switch().name==='contractExecutableWasm'&&executable.wasmHash().toString('hex')===p.wasmSha256,'PIN_INSTANCE');
  const encoded=raw.releaseFiles[p.path];ensure(typeof encoded==='string'&&encoded.length<=16000,'PIN_FILE');const bytes=Buffer.from(encoded,'base64');ensure(bytes.toString('base64')===encoded&&bytes.length===p.fileBytes&&sha(bytes)===p.fileSha256,'PIN_FILE');
 }
 return observed;
}
const observationOutcome=(kind)=>R[kind].length?`simulation-only:${kind}:${R[kind].length}-fixed-cases`:`derived:${kind}`;
function snapshotSequence(request, snapshot) {
 const tx=decode(xdr.TransactionEnvelope,request.envelopeXdr,131072).v1().tx(),source=StrKey.encodeEd25519PublicKey(tx.sourceAccount().ed25519());
 const account=Object.values(snapshot.accounts).find(row=>row.address===source);ensure(account&&tx.seqNum().toString()===String(decimal(account.sequence)+1n),'SEQUENCE');
}
function fieldsOfSnapshot(s){return {counters:s.counters,records:s.records.map(r=>({record:r.record,id:r.id,creationLedger:r.creationLedger,preparedLedger:r.preparedLedger,value:r.value})),liabilities:s.liabilities.map(r=>({asset:r.asset,amount:r.amount})),reserve:s.nativeReserveStroops,principal:s.openPrincipalStroops,accounts:s.accounts};}
function currentFunds(options){
 const {plan,state,phase,stepId}=options,index=plan.steps.findIndex(s=>s.id===stepId),remaining=plan.steps.slice(index+(phase==='after'?1:0));const needed={seller:0n,recipient:0n,relayer:0n};
 for(const step of remaining){needed[step.sourceRole]+=BigInt(plan.limits.perTransactionFeeStroops);if(['create_fade','create_pod','create_trigger'].includes(step.method))needed.seller+=10000000n;if(step.method==='confirm_handoff'&&step.terms.price==='1000000')needed.recipient+=1000000n;if(step.kind==='donation')needed.seller+=1n;}
 const reserve=decimal(state.reserve.minimumBalanceStroops);for(const role of Object.keys(needed))ensure(BigInt(state.snapshot.accounts[role].balance)>=reserve+needed[role],'FUNDS');
}
function feePrefix(options){
 const {plan,verifiedPrefix,currentFee,currentInclusion}=options;ensure(verifiedPrefix.length===38&&currentInclusion?.status==='SUCCESS'&&currentFee,'FINAL_PREFIX');
 const rows=[...verifiedPrefix,{stepId:options.stepId,inclusion:currentInclusion,fee:currentFee}],hashes=new Set();let total=0n;
 for(let i=0;i<rows.length;i++){const row=rows[i],fee=row.fee;ensure(row.stepId===plan.steps[i].id&&row.inclusion.status==='SUCCESS'&&fee.schema==='agyion-public-v4-lifecycle-fees-v1'&&fee.result==='txSuccess'&&fee.metaVersion===4&&fee.sourceAccount===plan.steps[i].sourceAccount&&fee.networkPassphrase===plan.networkPassphrase&&fee.transactionHash===row.inclusion.hash&&fee.inclusionLedger===row.inclusion.ledger&&!hashes.has(fee.transactionHash),'FINAL_FEE');hashes.add(fee.transactionHash);const authorized=decimal(fee.authorizedFee),net=decimal(fee.netFee),refund=decimal(fee.resourceFeeRefund);ensure(authorized<=BigInt(plan.limits.perTransactionFeeStroops)&&net+refund===decimal(fee.initialFeeDebit)&&net===decimal(fee.resultFeeCharged),'FINAL_FEE');total+=authorized;}
 ensure(total<=BigInt(plan.limits.aggregateFeeStroops)&&rows.filter((r,i)=>plan.steps[i].method.startsWith('create_')).length===16,'FINAL_FEE');
}
function historyObservations(options,current){
 for(const row of options.verifiedPrefix)for(const phase of ['before','after']){
  const result=row.observations?.[phase],names=schedule(options.plan,row.stepId,phase);ensure(result?.planSha256===options.planSha256&&result.stepId===row.stepId&&result.phase===phase&&result.evidence.length===names.length,'FINAL_OBSERVATIONS');
  for(let i=0;i<names.length;i++){const e=result.evidence[i];ensure(e.observationKind===names[i]&&e.expectedOutcome===observationOutcome(names[i])&&/^[0-9a-f]{64}$/.test(e.evidenceSha256),'FINAL_OBSERVATIONS');}
 }
 const last=options.plan.steps.at(-1);ensure(options.stepId===last.id&&last.requiredObservations.length===0&&last.postObservations.every(name=>current.some(r=>r.observationKind===name)),'FINAL_OBSERVATIONS');
}
function finalRecords(snapshot){
 const records=snapshot.records;ensure(records.length===16,'FINAL_RECORDS');same(snapshot.counters,{Fade:'8',Pod:'2',Trigger:'3',Mandate:'3'},'FINAL_RECORDS');const count=(type,state)=>records.filter(r=>r.type===type&&r.value.state===state).length;
 ensure(count('Fade',2)===6&&count('Fade',3)===2&&count('Pod',1)===2&&count('Trigger',1)===2&&count('Trigger',2)===1,'FINAL_RECORDS');const grants=records.filter(r=>r.type==='Mandate');ensure(grants.filter(r=>r.value.revoked).length===2&&grants.every(r=>r.value.daily_used==='0'),'FINAL_RECORDS');const expiry=grants.find(r=>r.record==='grant-expiry'),capped=grants.find(r=>r.record==='grant-capped');ensure(expiry&&!expiry.value.revoked&&expiry.value.claims_used===0&&snapshot.ledger>expiry.value.valid_until&&capped?.value.claims_used===1,'FINAL_RECORDS');
 ensure(snapshot.entryMetadata.every(r=>r.present&&(r.liveUntilLedgerSeq===undefined||r.liveUntilLedgerSeq>=snapshot.ledger)),'FINAL_TTL');
}
/** Sole observation gate. `state` must be a live branded reducer output and the
 * compact prefix must come from the journal's same-call raw evidence replay.
 * This authenticates fixed code/bytes and semantics under trusted RPC capture;
 * it does not independently authenticate a remote node or execute a lifecycle. */
export function verifyPublicLifecycleObservations(options) {
 exact(options,['plan','planSha256','stepId','phase','claim','currentInclusion','initialEvidence','state','verifiedPrefix','currentFee','snapshot','beforeSnapshot','rawEvidence']);
 const {plan,planSha256,stepId,phase,state,verifiedPrefix,snapshot}=options;validatePublicLifecyclePlan(plan);ensure(planSha256===hashPublicLifecyclePlan(plan),'CONTEXT');ensure(assertPublicLifecycleDerivedState(state)===state,'CONTEXT');
 const index=plan.steps.findIndex(s=>s.id===stepId),names=schedule(plan,stepId,phase);ensure(state.planSha256===planSha256&&state.stepId===stepId&&state.phase===phase&&state.prefixLength===index&&Array.isArray(verifiedPrefix)&&verifiedPrefix.length===index,'CONTEXT');same(state.snapshot,snapshot,'CONTEXT');
 ensure(snapshot.codeBytesAuthenticated===true&&snapshot.planSha256===planSha256,'CONTEXT');if(phase==='before')ensure(options.currentFee===null&&options.currentInclusion===null,'CONTEXT');else ensure(options.currentInclusion?.status==='SUCCESS'&&options.currentFee?.schema==='agyion-public-v4-lifecycle-fees-v1'&&options.currentFee.result==='txSuccess'&&options.currentFee.sourceAccount===plan.steps[index].sourceAccount&&options.currentFee.transactionHash===options.currentInclusion.hash&&options.currentFee.inclusionLedger===options.currentInclusion.ledger,'CONTEXT');
 // All phases recheck conservative remaining funds from the actual header reserve.
 currentFunds(options);const raw=copy(options.rawEvidence);exact(raw,names);const batches=new Map(),used=new Set();
 for(const kind of names){const row=raw[kind];exact(row,['cases'],['snapshots','pins']);ensure(Array.isArray(row.cases)&&row.cases.length===R[kind].length,'CASES');if(row.snapshots!==undefined){ensure(row.snapshots&&Object.getPrototypeOf(row.snapshots)===Object.prototype,'SNAPSHOT_BATCH');for(const [id,value] of Object.entries(row.snapshots)){ensure(/^[0-9a-f]{64}$/.test(id)&&digest(value)===id&&!batches.has(id),'SNAPSHOT_BATCH');batches.set(id,value);}}ensure(kind==='original-public-private-and-market-pins-unchanged'||row.pins===undefined,'PIN_SCOPE');}
 const decoded=new Map();
 const readSnapshot=id=>{
  ensure(typeof id==='string'&&batches.has(id),'SNAPSHOT_REF');used.add(id);if(decoded.has(id))return decoded.get(id);const batch=batches.get(id);exact(batch,['response','headerEvidence','zeroBalanceEvidence']);const head=batch.response.latestLedger;ledger(head);ensure(head<=snapshot.ledger&&head>=Math.max(1,...state.recordAnchors.map(r=>r.lastTransitionLedger)),'SNAPSHOT_LEDGER');verifyPublicLifecycleHeader({headerEvidence:batch.headerEvidence,ledger:head});
  const expected={...state.expected,minLedger:head,maxLedger:head,zeroBalanceEvidence:batch.zeroBalanceEvidence};const result=verifyPublicLifecycleSnapshot({plan,expected},batch.response);same(fieldsOfSnapshot(result),fieldsOfSnapshot(snapshot),'UNCHANGED');decoded.set(id,result);return result;
 };
 const out=[];
 for(const kind of names){const row=raw[kind];let observed=snapshot.ledger;
  for(let i=0;i<R[kind].length;i++){const c=row.cases[i];exact(c,['caseId','ledger','timestamp','beforeSnapshot','afterSnapshot','request','response'],['control']);ensure(c.caseId===R[kind][i],'CASES');const before=readSnapshot(c.beforeSnapshot),after=readSnapshot(c.afterSnapshot);ensure(before.ledger<=c.ledger&&c.ledger<=after.ledger&&after.ledger-before.ledger<=2,'BRACKET');const input={plan,stepId,observationKind:kind,caseId:c.caseId,ledger:c.ledger,timestamp:c.timestamp,recordAnchors:state.recordAnchors};verifyPublicLifecycleObservationCase(input,{request:c.request,response:c.response,...(c.control?{control:c.control}:{})});snapshotSequence(c.request,before);if(c.control)snapshotSequence(c.control.request,before);observed=Math.min(observed,c.ledger);}
  if(kind==='initial-reviewed-code-and-empty-accounting'){ensure(index===0&&phase==='before'&&snapshot.records.length===0&&snapshot.liabilities.every(r=>r.amount==='0')&&Object.values(snapshot.counters).every(v=>v==='0'),'INITIAL');}
  if(kind==='mixed-three-obligations-backed'){ensure(snapshot.openPrincipalStroops==='30000000'&&snapshot.nativeReserveStroops===String(BigInt(snapshot.initialSurplusStroops)+30000000n)&&snapshot.liabilities[1].amount==='0','MIXED');for(const record of ['fade-mixed','pod-mixed','trigger-mixed'])ensure(snapshot.records.find(r=>r.record===record)?.value.state===0,'MIXED');}
  if(kind==='all-required-simulations-have-matching-errors-and-prerequisites')historyObservations(options,out);
  if(kind==='all-39-original-inclusions-and-fee-metadata-reconciled')feePrefix(options);
  if(kind==='all-final-records-counters-and-live-ttls')finalRecords(snapshot);
  if(kind==='both-liabilities-zero-and-native-surplus-increased-by-one'){ensure(snapshot.liabilities.every(r=>r.amount==='0')&&snapshot.openPrincipalStroops==='0'&&snapshot.donationStroops==='1'&&snapshot.nativeReserveStroops===String(BigInt(snapshot.initialSurplusStroops)+1n)&&verifiedPrefix.some(r=>r.stepId===plan.steps.find(s=>s.kind==='donation').id&&r.inclusion.status==='SUCCESS'),'FINAL_SURPLUS');}
  if(kind==='original-public-private-and-market-pins-unchanged')observed=pinEvidence(row.pins,snapshot.ledger);
  out.push({observationKind:kind,ledger:observed,recordRef:plan.steps[index].record,expectedOutcome:observationOutcome(kind),evidenceSha256:digest(row)});
 }
 ensure(used.size===batches.size,'SNAPSHOT_UNUSED');return freeze({planSha256,stepId,phase,evidence:out});
}
