import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {encodeConfig,encodeKey,prepareDeployment,verifyReadback,TESTNET,RPC} from './prepare-deployment.mjs';
const {scValToNative}=createRequire(new URL('../client/package.json',import.meta.url))('@stellar/stellar-sdk');
const host=JSON.parse(readFileSync(new URL('../fixtures/host-config.json',import.meta.url),'utf8'));
const field=n=>BigInt(n).toString(16).padStart(64,'0');
const config={assets:[host.asset],disclosure_epoch:1,auditor_x:field(host.auditorX),auditor_y:field(host.auditorY),dkg_transcript_hash:host.dkgTranscriptHash};
const hash=data=>createHash('sha256').update(data).digest('hex');

test('constructor XDR preserves fixed native config and actual known verifier byte order',()=>{
  const decoded=scValToNative(encodeConfig(config));
  assert.deepEqual(decoded.assets,config.assets);assert.equal(decoded.disclosure_epoch,1);
  for(const key of ['auditor_x','auditor_y','dkg_transcript_hash'])assert.equal(Buffer.from(decoded[key]).toString('hex'),config[key]);
  const vk=JSON.parse(readFileSync(new URL('../../zk-preimage/artifacts/vk.json',import.meta.url),'utf8'));
  const key=scValToNative(encodeKey(vk,1));
  assert.equal(Buffer.from(key.alpha_g1).toString('hex'),field(vk.vk_alpha_1[0])+field(vk.vk_alpha_1[1]));
  assert.equal(Buffer.from(key.beta_g2).toString('hex'),[vk.vk_beta_2[0][1],vk.vk_beta_2[0][0],vk.vk_beta_2[1][1],vk.vk_beta_2[1][0]].map(field).join(''));
  assert.equal(key.ic.length,2);
  assert.throws(()=>encodeKey(vk,157),/verifier shape/);
});
test('saved readback binds bytecode, config, actual contract domain and computed asset policy',()=>{
  // Equality-check fixture only; it is not deployed code or an accepting proof.
  const bytes=Buffer.from('offline comparison fixture');
  const intendedContractId='CB7UCCOKZZZR5BRM3XNTXS3NRSEFKYT2INAL74MEWIW3XLCRH37LFTVG';
  const plan={schema:'agyion-private-pool-offline-plan-v2',testOnly:true,networkPassphrase:TESTNET,rpcUrl:RPC,config,wasmSha256:hash(bytes),manifestSha256:'ab'.repeat(32),sourceAccount:host.funder,salt:'ab'.repeat(32),intendedContractId};
  const readback={config,domain:'024228d847c64600881b9f3e2006886031107153430cedd2a5a52799c79dacb8',asset_ids:[field(host.assetId)],asset_policy_root:field(host.assetPolicyRoot)};
  assert.equal(verifyReadback(plan,intendedContractId,bytes,readback).matchesReviewedPlan,true);
  assert.throws(()=>verifyReadback(plan,host.asset,bytes,readback),/contract ID/);
  assert.throws(()=>verifyReadback(plan,intendedContractId,Buffer.from('different'),readback),/bytecode mismatch/);
  assert.throws(()=>verifyReadback(plan,intendedContractId,bytes,{...readback,config:{...config,disclosure_epoch:2}}),/Immutable config/);
  assert.throws(()=>verifyReadback(plan,intendedContractId,bytes,{...readback,asset_policy_root:'12'.repeat(32)}),/policy mismatch/);
  assert.throws(()=>verifyReadback(plan,intendedContractId,bytes,{...readback,domain:field(host.domain)}),/domain mismatch/);
});
test('offline preparation refuses mainnet and unprotected or missing identity directories',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'agyion-pool-plan-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const manifest=join(dir,'manifest.json');
  const data={schema:'agyion-private-pool-testnet-release-v2',testOnly:true,networkPassphrase:'Public Global Stellar Network ; September 2015',rpcUrl:RPC,wasm:{},transitionVk:{},revocationVk:{},config,sourceAccount:host.funder,salt:'ab'.repeat(32),intendedContractId:host.pool,thresholdConfig:{},dkg:{}};
  writeFileSync(manifest,JSON.stringify(data));
  await assert.rejects(prepareDeployment(manifest,dir),/testnet/);
  await assert.rejects(prepareDeployment(manifest,join(dir,'not-created')),/ENOENT/);
  chmodSync(dir,0o755);
  await assert.rejects(prepareDeployment(manifest,dir),/Owned 0700/);
  assert.throws(()=>encodeConfig({...config,assets:[host.funder]}),/asset allowlist/);
  assert.throws(()=>encodeConfig({...config,disclosure_epoch:0}),/epoch/);
});
