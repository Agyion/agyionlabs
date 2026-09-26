// Local Groth16 adapter for the pinned v2 circuits. No file/URL loading, network,
// persistence, ceremony or deployment. Artifact pins must come from an
// independently trusted release, not from the same untrusted artifact response.
// snarkjs0.7.6 is GPL-3.0; this composition is GPL-3.0-or-later.
import { bn254 } from '@noble/curves/bn254.js';
import { pippenger } from '@noble/curves/abstract/curve.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { fail, record, list, hex, freeze } from './validation.mjs';

const FR=bn254.G1.Point.Fn.ORDER,FQ=bn254.G1.Point.Fp.ORDER;
const utf8=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const typed=Object.getPrototypeOf(Uint8Array.prototype);
const typeOf=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get;
const byteLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get;
const byteOffset=Object.getOwnPropertyDescriptor(typed,'byteOffset').get;
const bufferOf=Object.getOwnPropertyDescriptor(typed,'buffer').get;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const VK_KEYS=['protocol','curve','nPublic','vk_alpha_1','vk_beta_2','vk_gamma_2','vk_delta_2','vk_alphabeta_12','IC'];
const TRANSITION={core:[23],encrypted:[134],inNotes:[2,24],outNotes:[2,24],inPaths:[2,32],inIndices:[2],
  appendPaths:[2,32],assetPath:[8],assetIndex:[],authSecrets:[2],podSecrets:[2],modes:[2],attestSignatures:[2,3],
  revokePaths:[2,128],pointPreimages:[11,2],encSecrets:[5],encNonces:[5]};
function ensure(ok,code) {if(!ok)fail(code,'prover');}
function decimal(value,modulus,allowBigInt=false) {
  if(allowBigInt&&typeof value==='bigint')value=value.toString();
  ensure(typeof value==='string'&&value.length<=78&&/^(0|[1-9][0-9]*)$/.test(value),'CANONICAL_DECIMAL');
  ensure(BigInt(value)<modulus,'FIELD_RANGE');return value;
}
function exact(value,n,path) {const a=list(value,n,path);ensure(a.length===n,'EXACT_LENGTH');return a;}
function point1(value,allowIdentity=false) {
  const p=exact(value,3,'G1').map(n=>decimal(n,FQ));
  if(allowIdentity&&p[0]==='0'&&p[1]==='1'&&p[2]==='0')return p;
  ensure(p[2]==='1','AFFINE_POINT');
  try {const P=bn254.G1.Point.fromAffine({x:BigInt(p[0]),y:BigInt(p[1])});P.assertValidity();ensure(!P.is0(),'NONZERO_POINT');}
  catch {fail('INVALID_G1_POINT','prover');}return p;
}
function point2(value) {
  const p=exact(value,3,'G2').map(a=>exact(a,2,'Fq2').map(n=>decimal(n,FQ)));
  ensure(p[2][0]==='1'&&p[2][1]==='0','AFFINE_POINT');
  try {const P=bn254.G2.Point.fromAffine({x:{c0:BigInt(p[0][0]),c1:BigInt(p[0][1])},y:{c0:BigInt(p[1][0]),c1:BigInt(p[1][1])}});
    P.assertValidity();ensure(!P.is0()&&P.isTorsionFree(),'NONZERO_SUBGROUP_POINT');}
  catch {fail('INVALID_G2_POINT','prover');}return p;
}
function proofObject(value) {
  const p=record(value,['pi_a','pi_b','pi_c','protocol','curve'],'proof');
  ensure(p.protocol==='groth16'&&p.curve==='bn128','PROOF_SUITE');
  return {pi_a:point1(p.pi_a),pi_b:point2(p.pi_b),pi_c:point1(p.pi_c),protocol:'groth16',curve:'bn128'};
}
export function encodeGroth16Proof(value) {
  const p=proofObject(value);
  return [p.pi_a[0],p.pi_a[1],p.pi_b[0][1],p.pi_b[0][0],p.pi_b[1][1],p.pi_b[1][0],p.pi_c[0],p.pi_c[1]]
    .map(n=>BigInt(n).toString(16).padStart(64,'0')).join('');
}
export function decodeGroth16Proof(value) {
  hex(value,256,'proof');const f=Array.from({length:8},(_,i)=>BigInt('0x'+value.slice(i*64,(i+1)*64)).toString());
  return freeze(proofObject({pi_a:[f[0],f[1],'1'],pi_b:[[f[3],f[2]],[f[5],f[4]],['1','0']],pi_c:[f[6],f[7],'1'],protocol:'groth16',curve:'bn128'}));
}
function count(value) {ensure(value===157||value===4,'PUBLIC_COUNT');return value;}
function verificationKey(value) {
  const k=record(value,VK_KEYS,'verificationKey'),n=count(k.nPublic);
  ensure(k.protocol==='groth16'&&k.curve==='bn128','VERIFICATION_SUITE');
  return {protocol:'groth16',curve:'bn128',nPublic:n,vk_alpha_1:point1(k.vk_alpha_1),vk_beta_2:point2(k.vk_beta_2),
    vk_gamma_2:point2(k.vk_gamma_2),vk_delta_2:point2(k.vk_delta_2),
    vk_alphabeta_12:exact(k.vk_alphabeta_12,2,'Fq12').map(a=>exact(a,3,'Fq6').map(b=>exact(b,2,'Fq2').map(c=>decimal(c,FQ)))),
    IC:exact(k.IC,n+1,'IC').map(p=>point1(p,true))};
}
export function canonicalVerificationKeyBytes(value) {return utf8.encode(JSON.stringify(verificationKey(value)));}
function bytes(value,max) {
  try {
    ensure(typeOf.call(value)==='Uint8Array','ARTIFACT_BYTES');
    const size=byteLength.call(value),buffer=bufferOf.call(value),offset=byteOffset.call(value);
    ensure(size>0&&size<=max,'ARTIFACT_BYTES');bufferLength.call(buffer);
    return new Uint8Array(new Uint8Array(buffer,offset,size));
  } catch {fail('ARTIFACT_BYTES','prover');}
}
function signals(value,n) {return exact(value,n,'publicSignals').map(v=>decimal(v,FR));}
function shaped(value,shape) {
  return shape.length?exact(value,shape[0],'witness').map(v=>shaped(v,shape.slice(1))):decimal(value,FR,true);
}
function snapshotWitness(value,n) {
  const schema=n===157?TRANSITION:{core:[4],path:[128]},v=record(value,Object.keys(schema),'witness');
  return Object.fromEntries(Object.entries(schema).map(([key,shape])=>[key,shaped(v[key],shape)]));
}

function boundedVerifier(vk) {
  const G1=bn254.G1.Point,G2=bn254.G2.Point;
  // These representations have already passed canonical field, point and
  // subgroup validation. Only IC permits the exact [0,1,0] identity encoding.
  const g1=p=>p[2]==='0'?G1.ZERO:G1.fromAffine({x:BigInt(p[0]),y:BigInt(p[1])});
  const g2=p=>G2.fromAffine({x:{c0:BigInt(p[0][0]),c1:BigInt(p[0][1])},y:{c0:BigInt(p[1][0]),c1:BigInt(p[1][1])}});
  const IC=vk.IC.map(g1),alpha=g1(vk.vk_alpha_1).negate(),beta=g2(vk.vk_beta_2),gamma=g2(vk.vk_gamma_2),delta=g2(vk.vk_delta_2);
  return(proof,publicSignals)=>{
    const L=IC[0].add(pippenger(G1,IC.slice(1),publicSignals.map(BigInt)));
    // Exactly the Soroban verifier equation:
    // e(A,B) * e(-alpha,beta) * e(-L,gamma) * e(-C,delta) == 1.
    const pairs=[{g1:g1(proof.pi_a),g2:g2(proof.pi_b)},{g1:alpha,g2:beta},{g1:g1(proof.pi_c).negate(),g2:delta}];
    // Noble rejects ZERO pairing arguments. A valid zero aggregate L is the
    // neutral term, not a malformed proof/VK point and not an early success.
    if(!L.is0())pairs.push({g1:L.negate(),g2:gamma});
    return bn254.fields.Fp12.eql(bn254.pairingBatch(pairs),bn254.fields.Fp12.ONE);
  };
}

export async function createLocalGroth16Prover(value) {
  const v=record(value,['wasm','zkey','verificationKey','pins','publicCount'],'prover');
  const n=count(v.publicCount),pins=record(v.pins,['wasmSha256','zkeySha256','verificationKeySha256'],'pins');
  for(const k of Object.keys(pins))hex(pins[k],32,k);
  // Copy intrinsic backing bytes before the first await. Shared buffers,
  // proxies, filenames and URLs cannot become a proving-engine input.
  const wasm=bytes(v.wasm,32*1024*1024),zkey=bytes(v.zkey,512*1024*1024);
  let vkBytes;
  try {vkBytes=typeOf.call(v.verificationKey)==='Uint8Array'?bytes(v.verificationKey,1024*1024):canonicalVerificationKeyBytes(v.verificationKey);}
  catch {fail('VERIFICATION_KEY_FORMAT','prover');}
  for(const [data,pin] of [[wasm,pins.wasmSha256],[zkey,pins.zkeySha256],[vkBytes,pins.verificationKeySha256]])
    ensure(bytesToHex(sha256(data))===pin,'ARTIFACT_HASH_MISMATCH');
  let vk;
  try {vk=verificationKey(JSON.parse(decoder.decode(vkBytes)));}
  catch {fail('VERIFICATION_KEY_FORMAT','prover');}
  ensure(vk.nPublic===n,'PUBLIC_COUNT');freeze(vk);
  // Verification uses Noble's documented MSM/pairing APIs in this one realm.
  // snarkjs.verify creates an implicit hardware-sized FFjavascript worker pool.
  const verifyEquation=boundedVerifier(vk);
  let busy=false,engine;
  const verify=async(proof,publicSignals)=>{
    try {const p=decodeGroth16Proof(proof),s=signals(publicSignals,n);return verifyEquation(p,s)===true;}
    catch {return false;}
  };
  return Object.freeze({
    async prove(witness) {
      if(busy)throw new Error('LOCAL_PROVER_BUSY');
      busy=true;
      try {
        const input=snapshotWitness(witness,n);
        // ESM resolves the browser build. Import only for real proving, after
        // all pins match; singleThread bypasses FFjavascript's global cache.
        engine??=import('snarkjs').then(module=>module.groth16);
        const groth16=await engine;
        const result=await groth16.fullProve(input,wasm,zkey,undefined,undefined,{singleThread:true});
        const publicSignals=signals(result.publicSignals,n),proof=encodeGroth16Proof(result.proof);
        const expected=n===157?[...input.core,...input.encrypted]:input.core;
        ensure(publicSignals.every((field,i)=>field===expected[i]),'PUBLIC_SIGNAL_BINDING');
        ensure(await verify(proof,publicSignals),'LOCAL_PROOF_VERIFICATION');
        return freeze({proof,publicSignals});
      } catch {throw new Error('LOCAL_PROOF_FAILED');}
      finally {busy=false;}
    },
    verify,
  });
}
