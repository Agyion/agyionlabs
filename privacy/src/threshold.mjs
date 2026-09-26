/**
 * EXPERIMENTAL protocol implementation, not an audited/live committee.
 * Abort-only all-roster Feldman DKG; private shares REQUIRE private authenticated
 * delivery. DLEQ verifies decryption consistency, not disclosure authorization.
 * No master-secret reconstruction, network transport, storage or production import.
 */
import { babyjubjub } from '@noble/curves/misc.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { fail, record, list, uint, hex, domain, bindDomain, equal, freeze } from './validation.mjs';

export const THRESHOLD_SUITE = 'experimental-babyjub-feldman-v1';
const Point = babyjubjub.Point, G = Point.BASE, Fn = Point.Fn;
const encoder = new TextEncoder();
const epochs = new WeakMap();
const fixedHex = n => n.toString(16).padStart(64,'0');
const encode = (tag, value) => encoder.encode(JSON.stringify([THRESHOLD_SUITE,tag,value]));
const digest = (tag, value) => bytesToHex(sha256(encode(tag,value)));

export const thresholdParameters = freeze({
  suite:THRESHOLD_SUITE,fieldOrder:fixedHex(Point.Fp.ORDER),scalarOrder:fixedHex(Fn.ORDER),
  base:{x:fixedHex(G.x),y:fixedHex(G.y)},
});
export function scalarToBigInt(value, allowZero = false) {
  hex(value,32,'scalar');
  const n=BigInt(`0x${value}`);
  if (n>=Fn.ORDER || (!allowZero && n===0n)) fail('SCALAR_OUT_OF_RANGE','scalar');
  return n;
}
export function scalarFromBigInt(value, allowZero = false) {
  if (typeof value!=='bigint' || value<0n || value>=Fn.ORDER || (!allowZero && value===0n)) fail('SCALAR_OUT_OF_RANGE','scalar');
  return fixedHex(value);
}
function randomScalar() {
  for (let i=0;i<256;i++) {
    const bytes=globalThis.crypto.getRandomValues(new Uint8Array(32));
    bytes[0]&=7; // Uniform 251-bit candidate; rejection avoids modular bias.
    const n=BigInt(`0x${bytesToHex(bytes)}`);
    if (n>0n && n<Fn.ORDER) return n;
  }
  fail('RANDOMNESS_FAILURE','scalar');
}
function checkedPoint(point) {
  try { point.assertValidity(); if (point.is0() || !point.isTorsionFree()) throw new Error(); }
  catch { fail('PRIME_SUBGROUP_POINT_REQUIRED','point'); }
  return point;
}
function decodePoint(value) {
  hex(value,32,'point');
  try {
    const point=checkedPoint(Point.fromHex(value,false));
    if (point.toHex()!==value) throw new Error();
    return point;
  } catch { fail('PRIME_SUBGROUP_POINT_REQUIRED','point'); }
}
export function pointToCoordinates(value) {
  const p=decodePoint(value);
  return freeze({x:fixedHex(p.x),y:fixedHex(p.y)});
}
export function pointToFieldElements(value) {
  const p=decodePoint(value);
  return Object.freeze([p.x,p.y]);
}
export function pointFromCoordinates(value) {
  const v=record(value,['x','y'],'point');
  const x=BigInt(`0x${hex(v.x,32,'point.x')}`),y=BigInt(`0x${hex(v.y,32,'point.y')}`);
  if (x>=Point.Fp.ORDER || y>=Point.Fp.ORDER) fail('NONCANONICAL_POINT','point');
  return checkedPoint(Point.fromAffine({x,y})).toHex();
}
function same(actual,expected,path) { equal(actual,expected,path); }
function id(value) { return uint(value,16,'trusteeId',1n); }
export function parseThresholdConfig(value) {
  const v=record(value,['version','suite','domain','epoch','sessionId','threshold','trustees'],'config');
  same(v.version,'1','version');same(v.suite,THRESHOLD_SUITE,'suite');
  const trustees=list(v.trustees,32,'trustees').map(value=>{
    const t=record(value,['id','authPublicKey'],'trustee');
    return {id:id(t.id),authPublicKey:hex(t.authPublicKey,32,'authPublicKey',true)};
  });
  const threshold=uint(v.threshold,16,'threshold',2n);
  if (BigInt(threshold)>BigInt(trustees.length)) fail('INVALID_THRESHOLD','threshold');
  if (trustees.some((t,i)=>i>0 && BigInt(t.id)<=BigInt(trustees[i-1].id)) ||
    new Set(trustees.map(t=>t.authPublicKey)).size!==trustees.length) fail('DISTINCT_ORDERED_TRUSTEES_REQUIRED','trustees');
  return freeze({version:'1',suite:THRESHOLD_SUITE,domain:domain(v.domain,'domain'),epoch:uint(v.epoch,32,'epoch',1n),
    sessionId:hex(v.sessionId,32,'sessionId',true),threshold,trustees});
}
function member(config,trusteeId) {
  const t=config.trustees.find(t=>t.id===id(trusteeId));
  if (!t) fail('UNKNOWN_TRUSTEE','trusteeId');
  return t;
}
function sign(config,trusteeId,seed,tag,value) {
  const key=hexToBytes(hex(seed,32,'authenticationSeed',true));
  same(bytesToHex(ed25519.getPublicKey(key)),member(config,trusteeId).authPublicKey,'authenticationKey');
  return bytesToHex(ed25519.sign(encode(tag,value),key));
}
function verifySignature(config,trusteeId,signature,tag,value) {
  hex(signature,64,'signature');
  if (!ed25519.verify(hexToBytes(signature),encode(tag,value),hexToBytes(member(config,trusteeId).authPublicKey),{zip215:false})) fail('INVALID_SIGNATURE','signature');
}
const configHash = config => digest('config',config);
function polynomial(coefficients,x) {
  return coefficients.reduceRight((sum,a)=>Fn.add(Fn.mul(sum,x),a),0n);
}
function publicPolynomial(commitments,x) {
  let power=1n,result=Point.ZERO;
  for (const c of commitments) { result=result.add(c.multiplyUnsafe(power));power=Fn.mul(power,x); }
  return result;
}
function parsePackage(config,value) {
  const v=record(value,['version','configHash','dealerId','commitments','signature'],'dealerPackage');
  same(v.version,'1','version');same(v.configHash,configHash(config),'configHash');member(config,v.dealerId);
  const commitments=list(v.commitments,32,'commitments').map(p=>decodePoint(p).toHex());
  if (commitments.length!==Number(config.threshold)) fail('EXACT_THRESHOLD_DEGREE_REQUIRED','commitments');
  const payload={version:'1',configHash:v.configHash,dealerId:v.dealerId,commitments};
  verifySignature(config,v.dealerId,v.signature,'dealer-package',payload);
  return {...payload,signature:v.signature};
}
/** privateShares must never be published with publicPackage. No transport is supplied. */
export function createDealerPackage(value,trusteeId,authenticationSeed) {
  const config=parseThresholdConfig(value);member(config,trusteeId);
  const coefficients=Array.from({length:Number(config.threshold)},randomScalar);
  const payload={version:'1',configHash:configHash(config),dealerId:trusteeId,commitments:coefficients.map(a=>G.multiply(a).toHex())};
  const publicPackage={...payload,signature:sign(config,trusteeId,authenticationSeed,'dealer-package',payload)};
  const packageHash=digest('dealer-package-hash',publicPackage);
  const privateShares=config.trustees.map(t=>{
    const share=polynomial(coefficients,BigInt(t.id));
    const body={version:'1',configHash:payload.configHash,dealerId:trusteeId,recipientId:t.id,packageHash,share:scalarFromBigInt(share,true)};
    return {...body,signature:sign(config,trusteeId,authenticationSeed,'dealer-share',body)};
  });
  return freeze({publicPackage,privateShares});
}
function verifiedShare(config,publicPackage,value,recipientId) {
  const p=parsePackage(config,publicPackage);
  const v=record(value,['version','configHash','dealerId','recipientId','packageHash','share','signature'],'dealerShare');
  same(v.version,'1','version');same(v.configHash,configHash(config),'configHash');same(v.dealerId,p.dealerId,'dealerId');
  member(config,recipientId);same(v.recipientId,recipientId,'recipientId');same(v.packageHash,digest('dealer-package-hash',p),'packageHash');
  const scalar=scalarToBigInt(v.share,true);
  const payload={version:'1',configHash:v.configHash,dealerId:v.dealerId,recipientId:v.recipientId,packageHash:v.packageHash,share:v.share};
  verifySignature(config,v.dealerId,v.signature,'dealer-share',payload);
  // An addressed share is secret even though its verification equation is public.
  const sharePoint=scalar===0n ? Point.ZERO : G.multiply(scalar);
  if (!sharePoint.equals(publicPolynomial(p.commitments.map(decodePoint),BigInt(recipientId)))) fail('INVALID_VSS_SHARE','share');
  return scalar;
}
export function verifyDealerShare(value,publicPackage,share,recipientId) {
  verifiedShare(parseThresholdConfig(value),publicPackage,share,recipientId);return true;
}
function prepared(config,values) {
  const packages=list(values,32,'dealerPackages').map(p=>parsePackage(config,p));
  if (packages.length!==config.trustees.length || packages.some((p,i)=>p.dealerId!==config.trustees[i].id)) fail('ALL_DEALERS_REQUIRED','dealerPackages');
  const aggregate=Array.from({length:Number(config.threshold)},(_,j)=>packages.reduce((sum,p)=>sum.add(decodePoint(p.commitments[j])),Point.ZERO));
  if (aggregate[0].is0() || aggregate.at(-1).is0()) fail('ZERO_AGGREGATE_OR_REDUCED_DEGREE','commitments');
  const trusteePublicShares=config.trustees.map(t=>({trusteeId:t.id,publicShare:checkedPoint(publicPolynomial(aggregate,BigInt(t.id))).toHex()}));
  const body={version:'1',config,configHash:configHash(config),packages,aggregateCommitments:aggregate.map(p=>p.toHex()),publicKey:aggregate[0].toHex(),trusteePublicShares};
  return {...body,transcriptHash:digest('dkg-transcript',body)};
}
export function prepareDkgTranscript(value,packages) { return freeze(prepared(parseThresholdConfig(value),packages)); }
export function deriveTrusteeShare(value,packages,values,trusteeId) {
  const config=parseThresholdConfig(value),transcript=prepared(config,packages);member(config,trusteeId);
  const shares=list(values,32,'privateShares');
  if (shares.length!==packages.length) fail('ALL_DEALER_SHARES_REQUIRED','privateShares');
  const scalar=shares.reduce((sum,s,i)=>Fn.add(sum,verifiedShare(config,transcript.packages[i],s,trusteeId)),0n);
  if (scalar===0n) fail('ZERO_TRUSTEE_SHARE','share');
  const publicShare=G.multiply(scalar).toHex();
  same(publicShare,transcript.trusteePublicShares.find(t=>t.trusteeId===trusteeId).publicShare,'publicShare');
  return freeze({version:'1',transcriptHash:transcript.transcriptHash,trusteeId,secretShare:scalarFromBigInt(scalar),publicShare});
}
function localShare(transcript,value) {
  const v=record(value,['version','transcriptHash','trusteeId','secretShare','publicShare'],'trusteeShare');
  same(v.version,'1','version');same(v.transcriptHash,transcript.transcriptHash,'transcriptHash');member(transcript.config,v.trusteeId);
  const expected=transcript.trusteePublicShares.find(t=>t.trusteeId===v.trusteeId).publicShare;
  same(v.publicShare,expected,'publicShare');
  const scalar=scalarToBigInt(v.secretShare);
  same(G.multiply(scalar).toHex(),expected,'secretShare');
  return {...v,scalar};
}
export function acceptDkgTranscript(value,packages,share,authenticationSeed) {
  const config=parseThresholdConfig(value),transcript=prepared(config,packages),s=localShare(transcript,share);
  const payload={version:'1',transcriptHash:transcript.transcriptHash,trusteeId:s.trusteeId};
  return freeze({...payload,signature:sign(config,s.trusteeId,authenticationSeed,'dkg-acceptance',payload)});
}
/** Re-run with trusted config on reload; serialized objects alone are not accepted epochs. */
export function finalizeDkgTranscript(value,packages,values) {
  const config=parseThresholdConfig(value),transcript=prepared(config,packages);
  const acceptances=list(values,32,'acceptances').map((value,i)=>{
    const v=record(value,['version','transcriptHash','trusteeId','signature'],'acceptance');
    same(v.version,'1','version');same(v.transcriptHash,transcript.transcriptHash,'transcriptHash');same(v.trusteeId,config.trustees[i]?.id,'trusteeId');
    const payload={version:'1',transcriptHash:v.transcriptHash,trusteeId:v.trusteeId};
    verifySignature(config,v.trusteeId,v.signature,'dkg-acceptance',payload);
    return {...payload,signature:v.signature};
  });
  if (acceptances.length!==config.trustees.length) fail('ALL_ACCEPTANCES_REQUIRED','acceptances');
  const epoch=freeze({kind:'ExperimentalDkgEpoch',...transcript,acceptances});
  epochs.set(epoch,transcript);return epoch;
}
function epochTranscript(epoch) {
  const transcript=epochs.get(epoch);
  if (!transcript) fail('FINALIZED_EPOCH_REQUIRED','epoch');
  return transcript;
}
export function encapsulateRecord(epoch) {
  const t=epochTranscript(epoch),scalar=randomScalar();
  return freeze({ephemeralScalar:scalarFromBigInt(scalar),ephemeralPublicKey:G.multiply(scalar).toHex(),sharedPoint:decodePoint(t.publicKey).multiply(scalar).toHex()});
}
function requestFor(transcript,value) {
  const v=record(value,['domain','epoch','requestId','recordHash','ciphertextDigest','authorizationDigest','ephemeralPublicKey'],'request');
  const d=domain(v.domain,'domain');bindDomain(d,transcript.config.domain);same(v.epoch,transcript.config.epoch,'epoch');
  return {domain:d,epoch:v.epoch,requestId:hex(v.requestId,32,'requestId',true),recordHash:hex(v.recordHash,32,'recordHash',true),
    ciphertextDigest:hex(v.ciphertextDigest,32,'ciphertextDigest',true),authorizationDigest:hex(v.authorizationDigest,32,'authorizationDigest',true),
    ephemeralPublicKey:decodePoint(v.ephemeralPublicKey).toHex()};
}
function challenge(transcript,request,trusteeId,publicShare,partial,r1,r2) {
  const bytes=sha512(encode('partial-dleq',{transcriptHash:transcript.transcriptHash,request,trusteeId,
    generator:G.toHex(),publicShare,ephemeral:request.ephemeralPublicKey,partial,commitmentBase:r1,commitmentEphemeral:r2}));
  return Fn.create(BigInt(`0x${bytesToHex(bytes)}`));
}
/** Caller MUST authorize the full request matching authorizationDigest before using its secret. */
export function createPartialDecryption(epoch,share,value) {
  const t=epochTranscript(epoch),request=requestFor(t,value),s=localShare(t,share),R=decodePoint(request.ephemeralPublicKey);
  const partial=R.multiply(s.scalar).toHex(),nonce=randomScalar();
  const commitmentBase=G.multiply(nonce).toHex(),commitmentEphemeral=R.multiply(nonce).toHex();
  const c=challenge(t,request,s.trusteeId,s.publicShare,partial,commitmentBase,commitmentEphemeral);
  const response=scalarFromBigInt(Fn.add(nonce,Fn.mul(c,s.scalar)),true);
  return freeze({version:'1',transcriptHash:t.transcriptHash,requestHash:digest('partial-request',request),trusteeId:s.trusteeId,partial,
    proof:{commitmentBase,commitmentEphemeral,response}});
}
function checkedPartial(t,request,value) {
  const v=record(value,['version','transcriptHash','requestHash','trusteeId','partial','proof'],'partial');
  same(v.version,'1','version');same(v.transcriptHash,t.transcriptHash,'transcriptHash');same(v.requestHash,digest('partial-request',request),'requestHash');member(t.config,v.trusteeId);
  const publicShare=t.trusteePublicShares.find(s=>s.trusteeId===v.trusteeId).publicShare;
  const D=decodePoint(v.partial),Y=decodePoint(publicShare),R=decodePoint(request.ephemeralPublicKey);
  const p=record(v.proof,['commitmentBase','commitmentEphemeral','response'],'proof');
  const A=decodePoint(p.commitmentBase),B=decodePoint(p.commitmentEphemeral),z=scalarToBigInt(p.response,true);
  const c=challenge(t,request,v.trusteeId,publicShare,v.partial,p.commitmentBase,p.commitmentEphemeral);
  if (!G.multiplyUnsafe(z).equals(A.add(Y.multiplyUnsafe(c))) || !R.multiplyUnsafe(z).equals(B.add(D.multiplyUnsafe(c)))) fail('INVALID_PARTIAL_PROOF','proof');
  return {trusteeId:v.trusteeId,point:D};
}
export function verifyPartialDecryption(epoch,value,partial) {
  const t=epochTranscript(epoch);checkedPartial(t,requestFor(t,value),partial);return true;
}
export function combinePartialDecryptions(epoch,value,values) {
  const t=epochTranscript(epoch),request=requestFor(t,value),partials=list(values,32,'partials').map(p=>checkedPartial(t,request,p));
  if (partials.length<Number(t.config.threshold) || new Set(partials.map(p=>p.trusteeId)).size!==partials.length) fail('THRESHOLD_DISTINCT_SHARES_REQUIRED','partials');
  let shared=Point.ZERO;
  for (const partial of partials) {
    const xi=BigInt(partial.trusteeId);let lambda=1n;
    for (const other of partials) if (other!==partial) {
      const xj=BigInt(other.trusteeId);lambda=Fn.mul(lambda,Fn.div(Fn.neg(xj),Fn.sub(xi,xj)));
    }
    shared=shared.add(partial.point.multiplyUnsafe(lambda));
  }
  return checkedPoint(shared).toHex();
}
