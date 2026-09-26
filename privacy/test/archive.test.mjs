import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveRebuilder} from '../src/archive.mjs';
import {buildWitness,buildRevocationWitness} from '../src/witness.mjs';
import {makeDepositConfig,makeCashNote,TEST_RANDOMNESS} from './model-fixtures.mjs';
import {SparseMerkleTree,dummyNote} from '../src/model.mjs';
const c=makeDepositConfig(),deposit=buildWitness(c,TEST_RANDOMNESS);
const profile={domain:c.domain,assetPolicyRoot:c.assetTree.root,epoch:c.epoch,auditor:c.auditor};
const record=b=>({recordId:b.ciphertextDigest,publicInputs:b.publicInputs});
function spend(){const x=makeDepositConfig();x.inputTree=deposit.nextTree;x.appendTree=deposit.nextTree;x.inNotes=[c.outNotes[0],dummyNote(101n,202n)];x.inIndices=[0n,0n];x.nextIndex=1n;x.authSecrets=[11n,0n];x.outNotes=[makeCashNote(100n,11n,800n),dummyNote(101n,202n)];x.bridge={kind:0n,amount:0n,accountId:0n};return buildWitness(x,TEST_RANDOMNESS);}
const next=spend();
function expected(root=next.nextTree.root,count=2n){return {root,nextIndex:count,recordCount:count,revocationCount:0n,revocationRoot:c.revocationTree.root};}
test('reconstructs exact trees and durable spent state from encrypted public records',()=>{
 const r=createArchiveRebuilder(profile);r.appendRecord(record(deposit));r.appendRecord(record(next));
 const state=r.finish(expected());assert.equal(state.noteTree.root,next.nextTree.root);assert.equal(state.nextIndex,2n);
 assert.equal(state.isSpent(next.publicInputs[12]),true);assert.equal(state.isSpent(1n),false);
 state.noteTree.set(0n,999n);assert.equal(r.finish(expected()).noteTree.root,next.nextTree.root);
});
test('gaps, reordering, forged IDs and tampering cannot be accepted as complete history',()=>{
 const r=createArchiveRebuilder(profile);assert.throws(()=>r.appendRecord(record(next)));
 assert.throws(()=>r.appendRecord({...record(deposit),recordId:'22'.repeat(32)}));
 const altered=structuredClone(record(deposit));altered.publicInputs[14]+=1n;assert.throws(()=>r.appendRecord(altered));
 r.appendRecord(record(deposit));assert.throws(()=>r.finish(expected()));assert.throws(()=>r.appendRecord(record(deposit)));
 r.appendRecord(record(next));assert.equal(r.finish(expected()).nextIndex,2n);
});
test('rejected records do not partly alter root, index or spent set',()=>{
 const r=createArchiveRebuilder(profile);r.appendRecord(record(deposit));
 const bad=structuredClone(record(next));bad.publicInputs[10]+=1n;assert.throws(()=>r.appendRecord(bad));
 assert.equal(r.finish(expected(deposit.nextTree.root,1n)).isSpent(next.publicInputs[12]),false);
 r.appendRecord(record(next));r.finish(expected());
});
test('revocation history is independently replayed and checked against final state',()=>{
 const r=createArchiveRebuilder(profile),v=buildRevocationWitness({domain:101n,tree:new SparseMerkleTree(128),tag:99n});
 const item={tag:99n,oldRoot:v.publicInputs[1],newRoot:v.publicInputs[2]};
 assert.throws(()=>r.appendRevocation({...item,newRoot:item.newRoot+1n}));r.appendRevocation(item);assert.throws(()=>r.appendRevocation(item));
 const final={root:c.inputTree.root,nextIndex:0n,recordCount:0n,revocationCount:1n,revocationRoot:v.nextTree.root};
 assert.equal(r.finish(final).revocationTree.get(99n),v.nextTree.get(99n));
 assert.throws(()=>r.finish({...final,revocationCount:0n}));
});
test('a complete exit counts as a record without increasing the append index',()=>{
 const x=makeDepositConfig();x.inputTree=deposit.nextTree;x.appendTree=deposit.nextTree;x.inNotes=[c.outNotes[0],dummyNote(101n,202n)];x.authSecrets=[11n,0n];x.nextIndex=1n;
 x.outNotes=[dummyNote(101n,202n),dummyNote(101n,202n)];x.bridge={kind:2n,amount:100n,accountId:303n};
 const exit=buildWitness(x,TEST_RANDOMNESS),r=createArchiveRebuilder(profile);r.appendRecord(record(deposit));r.appendRecord(record(exit));
 assert.equal(r.finish({...expected(deposit.nextTree.root),nextIndex:1n}).recordCount,2n);
});
test('a consistent new append cannot spend the same input a second time',()=>{
 const x=makeDepositConfig();x.inputTree=deposit.nextTree;x.appendTree=next.nextTree;x.inNotes=[c.outNotes[0],dummyNote(101n,202n)];x.authSecrets=[11n,0n];x.nextIndex=2n;
 x.outNotes=[makeCashNote(100n,11n,900n),dummyNote(101n,202n)];x.bridge={kind:0n,amount:0n,accountId:0n};
 const repeat=buildWitness(x,TEST_RANDOMNESS),r=createArchiveRebuilder(profile);r.appendRecord(record(deposit));r.appendRecord(record(next));
 assert.throws(()=>r.appendRecord(record(repeat)),/REPEATED_NULLIFIER/);r.finish(expected());
});
