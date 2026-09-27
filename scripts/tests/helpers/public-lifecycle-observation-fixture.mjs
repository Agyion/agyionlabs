/** Synthetic observation fixtures only. No network, real wallet keys, submissions
 * or loader hooks. Signers must be explicit synthetic fixture keypairs. The
 * optional local pin fixture reads only public evidence/bytecode and synthesizes
 * ledger metadata; it never proves fresh chain state. Import performs no I/O. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PUBLIC_LIFECYCLE_PINS, publicLifecycleObservationCases, publicLifecycleObservationIntent } from '../../lib/public-lifecycle-observations.mjs';
const { Account, Address, Contract, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } = createRequire(new URL('../../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const tree=(target,method,args,children=[])=>new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(target).toScAddress(),functionName:method,args})),subInvocations:children});
export function createObservationCaseEvidence({plan,stepId,observationKind,caseId,ledger,timestamp='1800000000',recordAnchors,accounts,credentialSigners}) {
 const intent=publicLifecycleObservationIntent({plan,stepId,observationKind,caseId,ledger,timestamp,recordAnchors});
 function envelope(control=false){const call=control?intent.control:intent.call,args=call.argsXdr.map(v=>xdr.ScVal.fromXDR(v,'base64'));
  if(intent.credential){const c=intent.credential,key=credentialSigners[c.role];assert.equal(key.publicKey(),c.publicKey);const signature=key.sign(Buffer.from(c.payloadHex,'hex'));if(c.corruptFirstByte)signature[0]^=1;args[c.argumentIndex]=xdr.ScVal.scvBytes(signature);}
  let auth=[];if(intent.authMode==='enforce'){const children=call.method==='confirm_handoff'?[tree(plan.assets[0],'transfer',[new Address(plan.actors.recipient).toScVal(),new Address(plan.actors.seller).toScVal(),nativeToScVal(1000000n,{type:'i128'})])]:[];auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(call.target,call.method,args,children)})];}
  const source=Object.values(accounts).find(a=>a.address===call.sourceAccount);assert.ok(source);
  return new TransactionBuilder(new Account(call.sourceAccount,source.sequence),{fee:'100',networkPassphrase:plan.networkPassphrase}).addOperation(Operation.invokeContractFunction({contract:call.target,function:call.method,args,auth})).setTimebounds(0,1800000060).build().toXDR();
 }
 const error=intent.expectedError.startsWith('Contract#')?`HostError: Error(Contract, #${intent.expectedError.slice(9)})`:`HostError: Error(${intent.expectedError.replace('/',', ')})`;
 return {request:{envelopeXdr:envelope(),authMode:intent.authMode},response:{latestLedger:ledger,error},...(intent.control?{control:{request:{envelopeXdr:envelope(true),authMode:'enforce'},response:{latestLedger:ledger,results:[{xdr:xdr.ScVal.scvVoid().toXDR('base64')}],transactionData:new SorobanDataBuilder().setResourceFee('100').build().toXDR('base64'),minResourceFee:'100'}}}:{})};
}
export function createObservationFixture({plan,credentialSigners,stepId,phase,state,currentSnapshotResponse,headerEvidence,historySnapshots={},pins,timestamp='1800000000'}) {
 const families=publicLifecycleObservationCases({plan,stepId,phase}),raw={},snapshots={};const current={response:currentSnapshotResponse,headerEvidence,zeroBalanceEvidence:state.expected.zeroBalanceEvidence};
 const record=state.recordAnchors.find(r=>r.record===plan.steps.find(s=>s.id===stepId).record),head=state.snapshot.ledger;
 for(const family of families){const k=family.observationKind;raw[k]={cases:family.caseIds.map(caseId=>{let at=head;
   if(k==='pod-before-unlock')at=Math.min(head,record.value.unlock_ledger-1);
   if(k==='trigger-early-refund'||k==='fade-unclaimed-early-refund')at=Math.min(head,record.value.deadline_ledger);
   if(k==='fade-claimed-early-refund')at=Math.min(head,record.value.claimed_at+record.value.handoff_window);
   const batch=at===head?current:historySnapshots[String(at)];assert.ok(batch,`missing explicit synthetic historical snapshot at ${at} for ${k}`);const id=hash(canonical(batch));snapshots[id]=batch;
   return {caseId,ledger:at,timestamp,beforeSnapshot:id,afterSnapshot:id,...createObservationCaseEvidence({plan,stepId,observationKind:k,caseId,ledger:at,timestamp,recordAnchors:state.recordAnchors,accounts:state.snapshot.accounts,credentialSigners})};
  })};if(k==='original-public-private-and-market-pins-unchanged'){assert.ok(pins,'explicit pin evidence required');raw[k].pins=pins;}}
 if(Object.keys(snapshots).length)raw[families[0].observationKind].snapshots=snapshots;return raw;
}
/** Explicit optional local-artifact fixture. Source code bytes are genuine;
 * account, inclusion, simulation and ledger stamps remain synthetic. */
export function loadLocalObservationPinFixture({ledger}) {
 assert.ok(Number.isSafeInteger(ledger)&&ledger>0);const old=JSON.parse(fs.readFileSync(new URL('../../../artifacts/security/2026-09-27-compatibility/public-v4-deployment/independent-readback/run-2026-09-27T14-58-59-179Z/ledger-response.json',import.meta.url),'utf8'));
 const codes=new Map();for(const row of old.entries){const value=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');if(value.switch().name==='contractCode')codes.set(value.contractCode().hash().toString('hex'),Buffer.from(value.contractCode().code()));}
 const market=fs.readFileSync(new URL('../../../contracts/fade-market/target/wasm32v1-none/release/fade_market.wasm',import.meta.url));codes.set(hash(market),market);
 const entries=[],releaseFiles={};for(const pin of PUBLIC_LIFECYCLE_PINS){const code=codes.get(pin.wasmSha256);assert.ok(code,`missing fixed public code bytes ${pin.role}`);assert.equal(hash(code),pin.wasmSha256);
  const key=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(pin.wasmSha256,'hex')})),instanceKey=new Contract(pin.contractId).getFootprint();
  const values=[xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(pin.wasmSha256,'hex'),code})),xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:instanceKey.contractData().contract(),key:instanceKey.contractData().key(),durability:instanceKey.contractData().durability(),val:xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.from(pin.wasmSha256,'hex')),storage:null}))}))];
  for(const [i,k]of[key,instanceKey].entries())entries.push({key:k.toXDR('base64'),val:values[i].toXDR('base64'),lastModifiedLedgerSeq:ledger,liveUntilLedgerSeq:ledger+5000});
  const bytes=fs.readFileSync(new URL('../../../'+pin.path,import.meta.url));assert.equal(hash(bytes),pin.fileSha256);releaseFiles[pin.path]=bytes.toString('base64');
 }
 return {response:{latestLedger:ledger,entries},releaseFiles};
}
