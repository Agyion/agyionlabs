import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519 } from '@noble/curves/ed25519.js';
import { babyjubjub } from '@noble/curves/misc.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  THRESHOLD_SUITE, thresholdParameters, parseThresholdConfig, createDealerPackage,
  verifyDealerShare, deriveTrusteeShare, prepareDkgTranscript, acceptDkgTranscript,
  finalizeDkgTranscript, encapsulateRecord, createPartialDecryption,
  verifyPartialDecryption, combinePartialDecryptions, pointToCoordinates,
  pointFromCoordinates, pointToFieldElements, scalarFromBigInt, scalarToBigInt,
} from '../src/threshold.mjs';

const seeds = ['01','02','03'].map(s => s.repeat(32));
const config = {
  version:'1',suite:THRESHOLD_SUITE,domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},
  epoch:'1',sessionId:'33'.repeat(32),threshold:'2',
  trustees:seeds.map((s,i)=>({id:String(i+1),authPublicKey:bytesToHex(ed25519.getPublicKey(hexToBytes(s)))})),
};
const clone=v=>structuredClone(v);
function setup(c=config) {
  const dealers=c.trustees.map((t,i)=>createDealerPackage(c,t.id,seeds[i]));
  const packages=dealers.map(d=>d.publicPackage);
  const shares=c.trustees.map(t=>deriveTrusteeShare(c,packages,dealers.map(d=>d.privateShares.find(s=>s.recipientId===t.id)),t.id));
  const accepts=shares.map((s,i)=>acceptDkgTranscript(c,packages,s,seeds[i]));
  return {dealers,packages,shares,accepts,epoch:finalizeDkgTranscript(c,packages,accepts)};
}
const ready=()=>{
 const d=setup(),e=encapsulateRecord(d.epoch);
 const request={domain:config.domain,epoch:'1',requestId:'44'.repeat(32),recordHash:'55'.repeat(32),ciphertextDigest:'66'.repeat(32),authorizationDigest:'77'.repeat(32),ephemeralPublicKey:e.ephemeralPublicKey};
 return {...d,e,request};
};

test('uses canonical BabyJub B8 and strict scalar/point codecs',()=>{
 assert.equal(thresholdParameters.base.x,5299619240641551281634865583518297030282874472190772894086521144482721001553n.toString(16).padStart(64,'0'));
 assert.equal(thresholdParameters.base.y,16950150798460657717958625567821834550301663161624707787222815936182638968203n.toString(16).padStart(64,'0'));
 const p=pointFromCoordinates(thresholdParameters.base);
 assert.deepEqual(pointToCoordinates(p),thresholdParameters.base);
 assert.deepEqual(pointToFieldElements(p),[BigInt('0x'+thresholdParameters.base.x),BigInt('0x'+thresholdParameters.base.y)]);
 assert.equal(scalarToBigInt(scalarFromBigInt(17n)),17n);
 for(const s of ['0'.repeat(64),thresholdParameters.scalarOrder, 'A'.repeat(64),'1'])assert.throws(()=>scalarToBigInt(s));
 const torsion=babyjubjub.Point.fromAffine({x:0n,y:babyjubjub.Point.Fp.ORDER-1n});
 for(const p of [babyjubjub.Point.ZERO.toHex(),torsion.toHex(),babyjubjub.Point.BASE.add(torsion).toHex(),'ff'.repeat(32)])assert.throws(()=>pointToCoordinates(p));
 assert.throws(()=>pointFromCoordinates({x:thresholdParameters.fieldOrder,y:'01'.padStart(64,'0')}));
});
test('requires distinct ordered identities and a feasible M-of-N threshold',()=>{
 for(const mutate of [c=>c.threshold='1',c=>c.threshold='4',c=>c.trustees.reverse(),c=>c.trustees[1].id='1',c=>c.trustees[1].authPublicKey=c.trustees[0].authPublicKey,c=>c.epoch='0',c=>c.extra=true]){
  const c=clone(config);mutate(c);assert.throws(()=>parseThresholdConfig(c));
 }
 assert.ok(Object.isFrozen(parseThresholdConfig(config).trustees));
});
test('all dealers verify addressed shares and every threshold subset combines only decryption points',()=>{
 const {dealers,packages,shares,epoch,e,request}=ready();
 for(const d of dealers)for(const s of d.privateShares)assert.equal(verifyDealerShare(config,d.publicPackage,s,s.recipientId),true);
 const partials=shares.map(s=>createPartialDecryption(epoch,s,request));
 for(const p of partials)assert.equal(verifyPartialDecryption(epoch,request,p),true);
 for(const subset of [[0,1],[0,2],[1,2],[0,1,2]])assert.equal(combinePartialDecryptions(epoch,request,subset.map(i=>partials[i])),e.sharedPoint);
 assert.equal(packages[0].commitments.length,2);
 assert.ok(Object.isFrozen(epoch));assert.ok(!('secret' in epoch));
});
test('rejects changed commitments, signed shares addressed elsewhere, and forged authentication',()=>{
 const {dealers,packages}=setup();
 const changed=clone(packages[0]);changed.commitments[0]=packages[1].commitments[0];
 assert.throws(()=>verifyDealerShare(config,changed,dealers[0].privateShares[0],'1'));
 assert.throws(()=>verifyDealerShare(config,packages[0],dealers[0].privateShares[0],'2'));
 const wrong=clone(dealers[0].privateShares[0]);wrong.share=scalarFromBigInt(1n);
 assert.throws(()=>verifyDealerShare(config,packages[0],wrong,'1'));
 assert.throws(()=>createDealerPackage(config,'1',seeds[1]));
 assert.throws(()=>prepareDkgTranscript(config,packages.slice(1)));
 assert.throws(()=>prepareDkgTranscript(config,[packages[0],packages[0],packages[2]]));
});
test('requires all-party agreement to the exact transcript and local share possession',()=>{
 const {packages,shares,accepts}=setup();
 assert.throws(()=>finalizeDkgTranscript(config,packages,accepts.slice(1)));
 const altered=clone(accepts);altered[1].transcriptHash='ff'.repeat(32);
 assert.throws(()=>finalizeDkgTranscript(config,packages,altered));
 assert.throws(()=>finalizeDkgTranscript({...config,epoch:'2'},packages,accepts));
 const wrong=clone(shares[0]);wrong.secretShare=scalarFromBigInt(1n);
 assert.throws(()=>acceptDkgTranscript(config,packages,wrong,seeds[0]));
});
test('rejects mixed epochs, duplicate/insufficient shares, forged DLEQ and every request binding change',()=>{
 const {epoch,shares,request}=ready();
 const partials=shares.map(s=>createPartialDecryption(epoch,s,request));
 assert.throws(()=>combinePartialDecryptions(epoch,request,partials.slice(0,1)));
 assert.throws(()=>combinePartialDecryptions(epoch,request,[partials[0],partials[0]]));
 const bad=clone(partials[0]);bad.proof.response=scalarFromBigInt(1n);
 assert.throws(()=>verifyPartialDecryption(epoch,request,bad));
 for(const key of ['requestId','recordHash','ciphertextDigest','authorizationDigest'])assert.throws(()=>verifyPartialDecryption(epoch,{...request,[key]:'88'.repeat(32)},partials[0]));
 assert.throws(()=>verifyPartialDecryption(epoch,{...request,epoch:'2'},partials[0]));
 assert.throws(()=>verifyPartialDecryption(epoch,{...request,domain:{...request.domain,networkId:'88'.repeat(32)}},partials[0]));
 assert.throws(()=>verifyPartialDecryption(epoch,{...request,ephemeralPublicKey:babyjubjub.Point.BASE.toHex()},partials[0]));
 assert.throws(()=>verifyPartialDecryption(clone(epoch),request,partials[0]));
 const other=setup({...config,epoch:'2'});
 assert.throws(()=>createPartialDecryption(other.epoch,shares[0],{...request,epoch:'2'}));
});
test('refuses identity and non-subgroup ephemerals before applying a secret scalar',()=>{
 const {epoch,shares,request}=ready();
 for(const point of [babyjubjub.Point.ZERO,babyjubjub.Point.fromAffine({x:0n,y:babyjubjub.Point.Fp.ORDER-1n})]){
  assert.throws(()=>createPartialDecryption(epoch,shares[0],{...request,ephemeralPublicKey:point.toHex()}));
 }
});
const signed=(tag,payload,seed)=>({...payload,signature:bytesToHex(ed25519.sign(new TextEncoder().encode(JSON.stringify([THRESHOLD_SUITE,tag,payload])),hexToBytes(seed)))});
function chosenPackage(template,coefficients,seed) {
 const {signature,...payload}=template;
 payload.commitments=coefficients.map(n=>babyjubjub.Point.BASE.multiply(n).toHex());
 return signed('dealer-package',payload,seed);
}
test('checks VSS equations even when a malicious dealer signs an incorrect scalar',()=>{
 const {dealers}=setup(),d=dealers[0],{signature,...body}=clone(d.privateShares[0]);
 body.share=scalarFromBigInt(babyjubjub.Point.Fn.add(scalarToBigInt(body.share,true),1n),true);
 assert.throws(()=>verifyDealerShare(config,d.publicPackage,signed('dealer-share',body,seeds[0]),'1'),/INVALID_VSS_SHARE/);
 body.share=thresholdParameters.scalarOrder;
 assert.throws(()=>verifyDealerShare(config,d.publicPackage,signed('dealer-share',body,seeds[0]),'1'),/SCALAR_OUT_OF_RANGE/);
});
test('rejects authenticated zero aggregate, degree cancellation and zero trustee share',()=>{
 const {packages}=setup(),q=BigInt('0x'+thresholdParameters.scalarOrder);
 for(const coefficients of [
  [[1n,2n],[2n,3n],[q-3n,4n]],
  [[2n,3n],[4n,5n],[6n,q-8n]],
  [[1n,2n],[3n,4n],[5n,q-15n]],
 ]){
  const chosen=packages.map((p,i)=>chosenPackage(p,coefficients[i],seeds[i]));
  assert.throws(()=>prepareDkgTranscript(config,chosen),/ZERO_AGGREGATE_OR_REDUCED_DEGREE|PRIME_SUBGROUP_POINT_REQUIRED/);
 }
 const {signature,...short}=packages[0];short.commitments=short.commitments.slice(0,1);
 assert.throws(()=>prepareDkgTranscript(config,[signed('dealer-package',short,seeds[0]),...packages.slice(1)]),/EXACT_THRESHOLD_DEGREE_REQUIRED/);
});
test('does not accept agreement on a different signed polynomial transcript',()=>{
 const a=setup(),b=setup();
 assert.throws(()=>finalizeDkgTranscript(config,b.packages,a.accepts),/BINDING_MISMATCH/);
 assert.throws(()=>deriveTrusteeShare(config,a.packages,b.dealers.map(d=>d.privateShares[0]),'1'),/BINDING_MISMATCH/);
});
test('round-trips the public epoch through all signature checks after serialization',()=>{
 const {epoch}=setup();const saved=clone(epoch);
 const restored=finalizeDkgTranscript(config,saved.packages,saved.acceptances);
 assert.equal(restored.transcriptHash,epoch.transcriptHash);
 assert.equal(restored.publicKey,epoch.publicKey);
});
test('proves decryptions for encrypted fixed field groups without rebuilding a master scalar',async()=>{
 const {encryptFields,decryptFields}=await import('../src/encryption.mjs');
 const {epoch,shares,e,request}=ready(),plaintext=[17n,23n,42n];
 const ciphertext=encryptFields(plaintext,pointToFieldElements(e.sharedPoint),0n);
 const bound={...request,ciphertextDigest:bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(ciphertext.map(String)))))};
 const partials=shares.slice(0,2).map(s=>createPartialDecryption(epoch,s,bound));
 const shared=combinePartialDecryptions(epoch,bound,partials);
 assert.deepEqual(decryptFields(ciphertext,pointToFieldElements(shared),0n,3),plaintext);
 const damaged=[...ciphertext];damaged[0]=babyjubjub.Point.Fp.add(damaged[0],1n);
 assert.throws(()=>decryptFields(damaged,pointToFieldElements(shared),0n,3));
});
test('uses the configured degree for every 3-of-4 subset',()=>{
 const auth=['01','02','03','04'].map(s=>s.repeat(32));
 const c={...config,threshold:'3',trustees:auth.map((s,i)=>({id:String(i+1),authPublicKey:bytesToHex(ed25519.getPublicKey(hexToBytes(s)))}))};
 const dealers=auth.map((s,i)=>createDealerPackage(c,String(i+1),s)),packages=dealers.map(d=>d.publicPackage);
 const shares=auth.map((_,i)=>deriveTrusteeShare(c,packages,dealers.map(d=>d.privateShares[i]),String(i+1)));
 const epoch=finalizeDkgTranscript(c,packages,shares.map((s,i)=>acceptDkgTranscript(c,packages,s,auth[i])));
 const encrypted=encapsulateRecord(epoch),request={domain:c.domain,epoch:c.epoch,requestId:'44'.repeat(32),recordHash:'55'.repeat(32),ciphertextDigest:'66'.repeat(32),authorizationDigest:'77'.repeat(32),ephemeralPublicKey:encrypted.ephemeralPublicKey};
 const partials=shares.map(s=>createPartialDecryption(epoch,s,request));
 for(const missing of [0,1,2,3])assert.equal(combinePartialDecryptions(epoch,request,partials.filter((_,i)=>i!==missing)),encrypted.sharedPoint);
 assert.throws(()=>combinePartialDecryptions(epoch,request,partials.slice(0,2)));
});
