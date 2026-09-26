/** Public archive reconstruction, with no keys, network or persistence.
 * Input records and expected state must come from the pinned pool's accepted
 * ledger data. Root consistency does NOT authenticate an untrusted RPC response
 * or replace proof verification/inclusion evidence. Missing/archived entries
 * must be restored/retrieved; callers must never skip them and call it complete.
 */
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {record,hex,fail,freeze} from './validation.mjs';
import {fieldElement,fieldArray,bounded,checkedPoint,parseCore23,SparseMerkleTree} from './model.mjs';
import {ciphertextBytes,revocationLeaf} from './witness.mjs';
function ensure(value,code){if(!value)fail(code,'archive');}
function nonzero(n){fieldElement(n);ensure(n!==0n,'NONZERO_FIELD');return n;}
export function createArchiveRebuilder(value){
 const p=record(value,['domain','assetPolicyRoot','epoch','auditor'],'profile');
 const profile={domain:nonzero(p.domain),assetPolicyRoot:nonzero(p.assetPolicyRoot),epoch:bounded(p.epoch,32),auditor:fieldArray(p.auditor,2,'auditor')};
 nonzero(profile.epoch);checkedPoint(profile.auditor);
 let notes=new SparseMerkleTree(32),revoked=new SparseMerkleTree(128),index=0n,recordCount=0n,revocationCount=0n;
 const ids=new Set(),spent=new Set(),commitments=new Set();let roots=[notes.root];
 const revocationRoots=new Set([revoked.root]);
 return Object.freeze({
  appendRecord(value){
   const r=record(value,['recordId','publicInputs'],'record'),id=hex(r.recordId,32,'recordId',true);
   const fields=fieldArray(r.publicInputs,157,'publicInputs'),c=parseCore23(fields.slice(0,23));
   ensure(!ids.has(id),'DUPLICATE_RECORD');
   ensure(bytesToHex(sha256(ciphertextBytes(fields.slice(23))))===id,'RECORD_DIGEST');
   ensure(c[0]===profile.domain&&c[1]===profile.assetPolicyRoot&&c[2]===profile.epoch&&c[3]===profile.auditor[0]&&c[4]===profile.auditor[1],'PROFILE_MISMATCH');
   ensure(revocationRoots.has(c[5]),'MISSING_REVOCATION_HISTORY');
   ensure(c[9]===notes.root&&c[11]===index&&roots.includes(c[8]),'MISSING_OR_REORDERED_HISTORY');
   const nfs=c.slice(12,14).filter(n=>n!==0n),cms=c.slice(14,16).filter(n=>n!==0n);
   ensure(new Set(nfs).size===nfs.length&&nfs.every(n=>!spent.has(n)),'REPEATED_NULLIFIER');
   ensure(new Set(cms).size===cms.length&&cms.every(n=>!commitments.has(n)),'REPEATED_COMMITMENT');
   ensure(c[14]!==0n||c[15]===0n,'UNPACKED_OUTPUTS');
   ensure(index+BigInt(cms.length)<=1n<<32n,'TREE_CAPACITY');
   ensure(recordCount<(1n<<64n)-1n,'ARCHIVE_CAPACITY');
   // Work on a clone. A failed final root check must leave no partial entries.
   const next=notes.clone();cms.forEach((cm,i)=>{const at=index+BigInt(i);ensure(next.get(at)===0n,'OCCUPIED_APPEND_SLOT');next.set(at,cm);});
   ensure(next.root===c[10],'APPEND_ROOT_MISMATCH');
   notes=next;index+=BigInt(cms.length);recordCount++;ids.add(id);
   nfs.forEach(n=>spent.add(n));cms.forEach(n=>commitments.add(n));
   if(cms.length)roots=[...roots,next.root].slice(-64);
   return freeze({kind:'RebuiltArchiveRecord',recordId:id,recordCount,nextIndex:index});
  },
  appendRevocation(value){
   const r=record(value,['tag','oldRoot','newRoot'],'revocation');const tag=nonzero(r.tag);
   fieldElement(r.oldRoot);fieldElement(r.newRoot);
   ensure(r.oldRoot===revoked.root&&r.oldRoot!==r.newRoot,'MISSING_OR_REORDERED_REVOCATION');
   const at=tag&((1n<<128n)-1n);ensure(revoked.get(at)===0n,'REPEATED_REVOCATION');
   ensure(revocationCount<(1n<<64n)-1n,'ARCHIVE_CAPACITY');
   const next=revoked.clone();next.set(at,revocationLeaf(profile.domain));
   ensure(next.root===r.newRoot,'REVOCATION_ROOT_MISMATCH');
   revoked=next;revocationCount++;revocationRoots.add(next.root);
  },
  finish(value){
   const e=record(value,['root','nextIndex','recordCount','revocationCount','revocationRoot'],'expectedState');
   fieldElement(e.root);fieldElement(e.revocationRoot);bounded(e.nextIndex,33);bounded(e.recordCount,64);bounded(e.revocationCount,64);
   ensure(e.root===notes.root&&e.nextIndex===index&&e.recordCount===recordCount&&e.revocationCount===revocationCount&&e.revocationRoot===revoked.root,'INCOMPLETE_ARCHIVE');
   const snapshotSpent=new Set(spent);
   return Object.freeze({kind:'RebuiltArchiveSnapshot',noteTree:notes.clone(),revocationTree:revoked.clone(),nextIndex:index,recordCount,revocationCount,
    isSpent(nf){nonzero(nf);return snapshotSpent.has(nf);}});
  },
 });
}
