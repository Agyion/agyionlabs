// OFFLINE ONLY. Produces reviewed public constructor arguments/CLI argument arrays
// and validates saved readback. Never spawns CLI, creates a key, calls RPC or sends.
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { keyDigest, encodeVerifyingKey } from './pin-verifiers.mjs';
const require = createRequire(new URL('../client/package.json',import.meta.url));
const {Address,StrKey,xdr} = require('@stellar/stellar-sdk');
const {poseidon2} = createRequire(new URL('../../../privacy/package.json',import.meta.url))('poseidon-lite');
export const TESTNET = 'Test SDF Network ; September 2015';
export const RPC = 'https://soroban-testnet.stellar.org';
const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function ensure(condition,message) { if(!condition)throw new Error(message); }
function exact(value,keys) {
  ensure(value && Object.getPrototypeOf(value)===Object.prototype && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)),'Unexpected manifest fields');
}
function hex32(value,nonzero=true,field=false) {
  ensure(typeof value==='string' && /^[0-9a-f]{64}$/.test(value) && (!nonzero||/[1-9a-f]/.test(value)) && (!field||BigInt('0x'+value)<FR),'Invalid canonical32-byte value'); return value;
}
const fhex = n => n.toString(16).padStart(64,'0');
const raw = hex => xdr.ScVal.scvBytes(Buffer.from(hex,'hex'));
const map = object => xdr.ScVal.scvMap(Object.entries(object).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,val])=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key),val})));
function hashId(bytes) { const h=sha(bytes);return poseidon2([BigInt('0x'+h.slice(0,32)),BigInt('0x'+h.slice(32))]); }
const addressBytes = address => new Address(address).toScVal().toXDR();
function assetIds(assets) { return assets.map(a=>hashId(Buffer.concat([Buffer.from('AGYION_ASSET_V2\0'),addressBytes(a)]))); }
function policyRoot(ids) {
  let nodes=ids, empty=0n;
  for(let depth=0;depth<8;depth++) {
    const next=[];for(let i=0;i<nodes.length;i+=2)next.push(poseidon2([nodes[i],nodes[i+1]??empty]));
    nodes=next;empty=poseidon2([empty,empty]);
  }
  return nodes[0];
}
export function encodeConfig(value) {
  exact(value,['assets','disclosure_epoch','auditor_x','auditor_y','dkg_transcript_hash']);
  ensure(Array.isArray(value.assets)&&value.assets.length>0&&value.assets.length<=8&&new Set(value.assets).size===value.assets.length&&value.assets.every(a=>typeof a==='string'&&StrKey.isValidContract(a)),'Invalid asset allowlist');
  ensure(Number.isSafeInteger(value.disclosure_epoch)&&value.disclosure_epoch>0&&value.disclosure_epoch<=0xffffffff,'Invalid disclosure epoch');
  hex32(value.auditor_x,true,true);hex32(value.auditor_y,false,true);hex32(value.dkg_transcript_hash);
  return map({assets:xdr.ScVal.scvVec(value.assets.map(a=>new Address(a).toScVal())),disclosure_epoch:xdr.ScVal.scvU32(value.disclosure_epoch),auditor_x:raw(value.auditor_x),auditor_y:raw(value.auditor_y),dkg_transcript_hash:raw(value.dkg_transcript_hash)});
}
export function encodeKey(value,count) {
  const key=encodeVerifyingKey(value,count);
  return map(Object.fromEntries(Object.entries(key).map(([k,v])=>[k,k==='ic'?xdr.ScVal.scvVec(v.map(n=>xdr.ScVal.scvBytes(n))):xdr.ScVal.scvBytes(v)])));
}
function pinned(name) {
  const source=readFileSync(new URL('../src/pins.rs',import.meta.url),'utf8');
  const value=source.match(new RegExp(`${name}:[^=]+=[\\s]*\\[([^\\]]+)\\]`))?.[1];
  const bytes=value?.match(/0x[0-9a-f]{2}/g);
  ensure(bytes?.length===32,'Actual verifier pins are not installed');return hex32(bytes.map(x=>x.slice(2)).join(''));
}
function readArtifact(entry,base) {
  exact(entry,['path','sha256']);hex32(entry.sha256);
  ensure(typeof entry.path==='string'&&entry.path.length>0,'Missing artifact path');
  const path=resolve(base,entry.path), stat=lstatSync(path);
  ensure(stat.isFile()&&!stat.isSymbolicLink(),'Regular artifact file required');
  const bytes=readFileSync(path);ensure(sha(bytes)===entry.sha256,'Artifact SHA256 mismatch');return {path,bytes};
}
/** Exact Stellar create-contract-from-address preimage; never queries a network. */
export function deriveContractId(sourceAccount,salt) {
  ensure(typeof sourceAccount==='string'&&StrKey.isValidEd25519PublicKey(sourceAccount),'Public source account required');
  hex32(salt,false);
  const preimage=xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
    networkId:Buffer.from(sha(Buffer.from(TESTNET)),'hex'),
    contractIdPreimage:xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({
      address:new Address(sourceAccount).toScAddress(),salt:Buffer.from(salt,'hex'),
    })),
  }));
  return StrKey.encodeContract(Buffer.from(sha(preimage.toXDR()),'hex'));
}
/** Operator-reviewed roster is an independent trust anchor, not taken from an arbitrary transcript. */
export async function validateDeploymentAuthority(authority,config,artifact) {
  exact(authority,['sourceAccount','salt','intendedContractId','thresholdConfig']);
  ensure(authority.intendedContractId===deriveContractId(authority.sourceAccount,authority.salt),'Intended contract ID differs from source account and salt');
  exact(artifact,['config','packages','acceptances']);
  const {parseThresholdConfig,finalizeDkgTranscript,pointToCoordinates}=await import('../../../privacy/src/threshold.mjs');
  const trusted=parseThresholdConfig(authority.thresholdConfig);
  ensure(isDeepStrictEqual(trusted,parseThresholdConfig(artifact.config)),'DKG config differs from trusted roster');
  ensure(trusted.domain.networkId===sha(Buffer.from(TESTNET))&&trusted.domain.contractId===StrKey.decodeContract(authority.intendedContractId).toString('hex'),'DKG domain differs from intended deployment');
  ensure(trusted.epoch===String(config.disclosure_epoch),'DKG epoch differs from constructor');
  const epoch=finalizeDkgTranscript(trusted,artifact.packages,artifact.acceptances);
  const publicKey=pointToCoordinates(epoch.publicKey);
  ensure(publicKey.x===config.auditor_x&&publicKey.y===config.auditor_y,'DKG auditor key differs from constructor');
  ensure(epoch.transcriptHash===config.dkg_transcript_hash,'DKG transcript hash differs from constructor');
  return {intendedContractId:authority.intendedContractId,transcriptHash:epoch.transcriptHash,thresholdConfig:trusted};
}
export async function prepareDeployment(manifestPath,identityDirectory) {
  ensure(isAbsolute(identityDirectory)&&resolve(identityDirectory)===identityDirectory,'Absolute dedicated identity directory required');
  const identityStat=lstatSync(identityDirectory);
  ensure(identityStat.isDirectory()&&!identityStat.isSymbolicLink()&&realpathSync(identityDirectory)===identityDirectory&&identityStat.uid===process.getuid()&&(identityStat.mode&0o777)===0o700,'Owned 0700 dedicated identity directory required');
  const bytes=readFileSync(manifestPath), m=JSON.parse(bytes), base=dirname(resolve(manifestPath));
  exact(m,['schema','testOnly','networkPassphrase','rpcUrl','wasm','transitionVk','revocationVk','config','sourceAccount','salt','intendedContractId','thresholdConfig','dkg']);
  ensure(m.schema==='agyion-private-pool-testnet-release-v2'&&m.testOnly===true&&m.networkPassphrase===TESTNET&&m.rpcUrl===RPC,'Only the pinned Stellar testnet profile is supported');
  const initialXdr=encodeConfig(m.config);
  const dkg=readArtifact(m.dkg,base);
  const authority=await validateDeploymentAuthority({sourceAccount:m.sourceAccount,salt:m.salt,intendedContractId:m.intendedContractId,thresholdConfig:m.thresholdConfig},m.config,JSON.parse(dkg.bytes));
  const wasm=readArtifact(m.wasm,base), transition=readArtifact(m.transitionVk,base), revoke=readArtifact(m.revocationVk,base);
  ensure(wasm.bytes.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])),'Expected compiled WASM');
  const main=JSON.parse(transition.bytes), revocation=JSON.parse(revoke.bytes);
  ensure(keyDigest(main,157).toString('hex')===pinned('MAIN_VK_HASH'),'Transition VK differs from compiled source pin');
  ensure(keyDigest(revocation,4).toString('hex')===pinned('REVOCATION_VK_HASH'),'Revocation VK differs from compiled source pin');
  const keyJson=(v,count)=>Object.fromEntries(Object.entries(encodeVerifyingKey(v,count)).map(([k,b])=>[k,Array.isArray(b)?b.map(x=>x.toString('hex')):b.toString('hex')]));
  const network=['--rpc-url',RPC,'--network-passphrase',TESTNET];
  const identity=['--config-dir',identityDirectory];
  const alias='agyion-private-testnet';
  return {
    schema:'agyion-private-pool-offline-plan-v2',testOnly:true,manifestSha256:sha(bytes),wasmSha256:m.wasm.sha256,
    config:m.config,networkPassphrase:TESTNET,rpcUrl:RPC,identityDirectory,
    sourceAccount:m.sourceAccount,salt:m.salt,intendedContractId:authority.intendedContractId,
    thresholdConfig:authority.thresholdConfig,dkgArtifactSha256:m.dkg.sha256,
    constructorXdr:[initialXdr,encodeKey(main,157),encodeKey(revocation,4)].map(v=>v.toXDR('base64')),
    prerequisites:['Real native/WASM proof chain and measured resource limits approved','Explicit operator authorization to deploy','Independently reviewed DKG roster; secure private share delivery and recoverable trustee storage are outside this tool','Verify dedicated identity public address equals sourceAccount before signing; never regenerate it after DKG','Owned 0700 identity directory, umask077; clear inherited STELLAR signing/network/header variables','These are argument arrays for direct execution, never shell-eval strings; do not retry an uncertain deployment blindly'],
    commands:{
      verifySource:['stellar','keys','address',alias,...identity],
      deriveAddress:['stellar','contract','id','wasm','--source-account',m.sourceAccount,'--salt',m.salt,...network],
      deploy:['stellar','contract','deploy','--wasm',wasm.path,'--optimize=false','--source-account',m.sourceAccount,'--sign-with-key',alias,'--salt',m.salt,...identity,...network,'--','--initial',JSON.stringify(m.config),'--vk',JSON.stringify(keyJson(main,157)),'--revocation_vk',JSON.stringify(keyJson(revocation,4))],
      fetchReadback:['stellar','contract','fetch','--id',m.intendedContractId,...network,'--out-file','<fresh-readback.wasm>'],
      configReadback:['stellar','contract','invoke','--id',m.intendedContractId,'--source-account',m.sourceAccount,'--send','no',...identity,...network,'--','config'],
    },
  };
}
/** Compare saved readback against the operator's pinned original manifest/plan. */
export function verifyReadback(plan,contractId,wasmBytes,config) {
  ensure(plan.schema==='agyion-private-pool-offline-plan-v2'&&plan.testOnly===true&&plan.networkPassphrase===TESTNET&&plan.rpcUrl===RPC,'Invalid testnet plan');
  ensure(typeof contractId==='string'&&StrKey.isValidContract(contractId),'Invalid deployed contract ID');
  ensure(contractId===plan.intendedContractId&&contractId===deriveContractId(plan.sourceAccount,plan.salt),'Deployed contract ID differs from DKG-bound plan');
  ensure(sha(wasmBytes)===plan.wasmSha256,'Deployed bytecode mismatch');
  encodeConfig(plan.config);encodeConfig(config.config);
  for(const key of Object.keys(plan.config))ensure(JSON.stringify(plan.config[key])===JSON.stringify(config.config[key]),`Immutable config mismatch: ${key}`);
  const ids=assetIds(plan.config.assets);
  const domain=hashId(Buffer.concat([Buffer.from('AGYION_DOMAIN_V2\0'),Buffer.from(sha(Buffer.from(TESTNET)),'hex'),addressBytes(contractId)]));
  ensure(config.domain===fhex(domain),'Deployed domain mismatch');
  ensure(JSON.stringify(config.asset_ids)===JSON.stringify(ids.map(fhex)),'Deployed asset IDs mismatch');
  ensure(config.asset_policy_root===fhex(policyRoot(ids)),'Deployed asset policy mismatch');
  return {matchesReviewedPlan:true,testOnly:true,contractId,wasmSha256:plan.wasmSha256,manifestSha256:plan.manifestSha256,domain:config.domain};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [mode,...args]=process.argv.slice(2);
  if(mode==='prepare'&&args.length===3) {
    const plan=await prepareDeployment(resolve(args[0]),resolve(args[1]));
    writeFileSync(resolve(args[2]),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write('Offline deployment plan written. No key, network or deployment action ran.\n');
  } else if(mode==='verify-readback'&&args.length===4) {
    const result=verifyReadback(JSON.parse(readFileSync(args[0],'utf8')),args[1],readFileSync(args[2]),JSON.parse(readFileSync(args[3],'utf8')));
    process.stdout.write(JSON.stringify(result)+'\n');
  } else throw new Error('Usage: prepare-deployment.mjs prepare manifest.json dedicated-identity-directory new-plan.json | verify-readback plan.json contractId readback.wasm config.json');
}
