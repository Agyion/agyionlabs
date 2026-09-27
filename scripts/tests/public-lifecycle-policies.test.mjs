import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Adapter wiring only: child mocks the separately tested state/observation gates.
// It cannot establish real snapshots, signatures, contract execution or privacy.
const root = fileURLToPath(new URL('../../', import.meta.url));
const child = String.raw`
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mock} from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [root,mode]=process.argv.slice(2),url=name=>pathToFileURL(path.join(root,'scripts/lib',name)).href;
const {Keypair}=createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');
const P=await import(url('public-lifecycle-plan.mjs'));
const keys=Array.from({length:7},(_,i)=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,i+11)).publicKey());
const plan=P.buildPublicLifecyclePlan({preparedAt:'2026-09-27T18:00:00.000Z',recipient:keys[0],relayer:keys[1],credentialKeys:Object.fromEntries(['venue','podTimelock','podMixed','attester','agent'].map((r,i)=>[r,keys[i+2]]))});
const planSha256=P.hashPublicLifecyclePlan(plan),stepId=plan.steps[1].id;
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const expected={independentlyDerived:'exact'},snapshot={ledger:5000005,planSha256},initial=Object.freeze({opaqueInitial:true}),state=Object.freeze({expected,snapshot});
let initialized=0,derived=0,observed=0;
const initialEvidence={expected:{zeroBalanceEvidence:null},response:{latestLedger:5000000},headerEvidence:{headerXdr:'initial-header'}};
const prefix=[{stepId:plan.steps[0].id,binding:{headLedger:5000000},inclusion:{status:'SUCCESS',ledger:5000001,createdId:'1',hash:'11'.repeat(32)},fee:{authorizedFee:'1000',netFee:'100',rawDoNotCopy:'unused'},before:{ledger:5000000},after:{ledger:5000002,accounts:{seller:{sequence:'10'}},records:[]},observations:{before:{evidence:[]},after:{evidence:[]}},completionSha256:'22'.repeat(32),evidenceSha256:{before:'33'.repeat(32),after:'44'.repeat(32)}}];
const scope={plan,planSha256,stepId,phase:'after',claim:{stepId,binding:{headLedger:5000003}},prefix,initialEvidence,currentInclusion:{status:'SUCCESS',ledger:5000004,createdId:null,hash:'55'.repeat(32)},snapshotResponse:{latestLedger:5000005},headerEvidence:{headerXdr:'current-header'},beforeSnapshot:{ledger:5000003}};
mock.module(url('public-lifecycle-state.mjs'),{namedExports:{initialPublicLifecycleState:options=>{initialized++;assert.deepEqual(options,{plan,response:initialEvidence.response,zeroBalanceEvidence:null,headerEvidence:initialEvidence.headerEvidence});return initial;},derivePublicLifecycleState:options=>{derived++;if(mode==='state-rejected')throw Error('STATE_REJECTED');assert.deepEqual(options,{plan,initial,prefix:[{stepId:prefix[0].stepId,binding:prefix[0].binding,inclusion:{status:'SUCCESS',ledger:5000001,createdId:'1'},fee:{authorizedFee:'1000',netFee:'100'},after:{ledger:5000002,accounts:prefix[0].after.accounts}}],stepId,binding:scope.claim.binding,phase:scope.phase,inclusion:{status:'SUCCESS',ledger:5000004,createdId:null},response:scope.snapshotResponse,headerEvidence:scope.headerEvidence});return state;}}});
mock.module(url('public-lifecycle-observations.mjs'),{namedExports:{verifyPublicLifecycleObservations:options=>{observed++;assert.deepEqual(options,{plan,planSha256,stepId,phase:'after',claim:scope.claim,currentInclusion:scope.currentInclusion,initialEvidence,state,verifiedPrefix:prefix,currentFee:{netFee:'100'},snapshot,beforeSnapshot:scope.beforeSnapshot,rawEvidence:{family:'unchanged'}});return {planSha256,stepId,phase:'after',evidence:[]};}}});
const {createPublicLifecyclePolicies}=await import(url('public-lifecycle-policies.mjs'));
const policies=createPublicLifecyclePolicies();assert.equal(initialized,0);assert.equal(derived,0);assert.equal(observed,0);assert.equal(Object.isFrozen(policies),true);
if(mode==='state-ack'){
 assert.deepEqual(policies.verifyStateExpectations({...scope,expected}),{planSha256,stepId,phase:'after',expectedSha256:digest(expected)});assert.equal(initialized,1);assert.equal(derived,1);assert.equal(observed,0);
}else if(mode==='expected-tamper'){
 assert.throws(()=>policies.verifyStateExpectations({...scope,expected:{independentlyDerived:'forged'}}),/EXPECTED/);assert.equal(observed,0);
}else if(mode==='observation-gate'){
 assert.deepEqual(policies.verifyObservations({...scope,snapshot,currentFee:{netFee:'100'},rawEvidence:{family:'unchanged'}}),{planSha256,stepId,phase:'after',evidence:[]});assert.equal(initialized,1);assert.equal(derived,1);assert.equal(observed,1);
}else if(mode==='snapshot-tamper'){
 assert.throws(()=>policies.verifyObservations({...scope,snapshot:{...snapshot,ledger:5000006},currentFee:{netFee:'100'},rawEvidence:{family:'unchanged'}}),/SNAPSHOT/);assert.equal(observed,0);
}else if(mode==='state-rejected'){
 assert.throws(()=>policies.verifyObservations({...scope,snapshot,currentFee:{netFee:'100'},rawEvidence:{family:'unchanged'}}),/STATE_REJECTED/);assert.equal(observed,0);
}else if(['state-observation-once','state-observation-mutated','state-observation-consumed'].includes(mode)){
 policies.verifyStateExpectations({...scope,expected});
 if(mode==='state-observation-mutated')scope.headerEvidence={headerXdr:'changed raw header'};
 const observe=()=>policies.verifyObservations({...scope,snapshot,currentFee:{netFee:'100'},rawEvidence:{family:'unchanged'}});
 observe();
 if(mode==='state-observation-consumed')observe();
 const derivations=mode==='state-observation-once'?1:2;
 assert.equal(initialized,derivations,'derive once for one identical state/observation pair; changed input and later replay must rederive');
 assert.equal(derived,derivations);assert.equal(observed,mode==='state-observation-consumed'?2:1);
}else if(mode==='untrusted-input'){
 let accessed=0;const input={...scope,expected};Object.defineProperty(input,'headerEvidence',{enumerable:true,get(){accessed++;throw Error('accessed');}});assert.throws(()=>policies.verifyStateExpectations(input),/DATA|FIELDS/);assert.equal(accessed,0);assert.equal(initialized,0);
 assert.throws(()=>createPublicLifecyclePolicies({verifyState:()=>true}),/OPTIONS/);
 assert.throws(()=>policies.verifyStateExpectations({...scope,planSha256:'99'.repeat(32),expected}),/PLAN/);assert.equal(initialized,0);
}else throw Error('unknown case');
console.log('adapter case passed '+mode);
`;

for (const mode of ['state-ack', 'expected-tamper', 'observation-gate', 'snapshot-tamper', 'state-rejected', 'untrusted-input', 'state-observation-once', 'state-observation-mutated', 'state-observation-consumed']) {
  test(`policy adapter rejects alternate authority and preserves exact gate context: ${mode}`, async t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agyion-policy-test-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const file = path.join(home, 'case.mjs'); fs.writeFileSync(file, child);
    const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', file, root, mode], { timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.match(result.stdout, new RegExp('adapter case passed ' + mode));
  });
}
