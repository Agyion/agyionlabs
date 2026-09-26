import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { deriveContractId, validateDeploymentAuthority, TESTNET } from './prepare-deployment.mjs';
import { THRESHOLD_SUITE, createDealerPackage, deriveTrusteeShare, acceptDkgTranscript, finalizeDkgTranscript, pointToCoordinates } from '../../../privacy/src/threshold.mjs';
const require = createRequire(new URL('../../../privacy/package.json', import.meta.url));
const { ed25519 } = await import(pathToFileURL(require.resolve('@noble/curves/ed25519.js')).href);
const { StrKey } = createRequire(new URL('../client/package.json', import.meta.url))('@stellar/stellar-sdk');
const host = JSON.parse(readFileSync(new URL('../fixtures/host-config.json', import.meta.url), 'utf8'));
const salt = 'ab'.repeat(32);
function example() {
  // Public fixed TEST ONLY authentication seeds; ephemeral dealer shares stay in
  // this test process and are never written to the deployment artifact.
  const seeds = ['01', '02'].map(n => n.repeat(32));
  const intendedContractId = deriveContractId(host.funder, salt);
  const thresholdConfig = { version:'1', suite:THRESHOLD_SUITE,
    domain:{networkId:createHash('sha256').update(TESTNET).digest('hex'), contractId:StrKey.decodeContract(intendedContractId).toString('hex')},
    epoch:'1', sessionId:'73'.repeat(32), threshold:'2',
    trustees:seeds.map((s,i) => ({id:String(i+1),authPublicKey:Buffer.from(ed25519.getPublicKey(Buffer.from(s,'hex'))).toString('hex')})) };
  const dealers = seeds.map((s,i) => createDealerPackage(thresholdConfig,String(i+1),s));
  const packages = dealers.map(d => d.publicPackage);
  const shares = seeds.map((_,i) => deriveTrusteeShare(thresholdConfig,packages,dealers.map(d => d.privateShares[i]),String(i+1)));
  const acceptances = shares.map((s,i) => acceptDkgTranscript(thresholdConfig,packages,s,seeds[i]));
  const epoch = finalizeDkgTranscript(thresholdConfig,packages,acceptances);
  const point = pointToCoordinates(epoch.publicKey);
  return {authority:{sourceAccount:host.funder,salt,intendedContractId,thresholdConfig},
    artifact:{config:thresholdConfig,packages,acceptances},
    config:{assets:[host.asset],disclosure_epoch:1,auditor_x:point.x,auditor_y:point.y,dkg_transcript_hash:epoch.transcriptHash}};
}
test('deployment authority binds the signed DKG roster to the deterministic source and salt address', async () => {
  const {authority,artifact,config} = example();
  const result = await validateDeploymentAuthority(authority,config,artifact);
  assert.equal(result.intendedContractId, authority.intendedContractId);
  assert.equal(result.transcriptHash, config.dkg_transcript_hash);
  for (const changes of [{sourceAccount:host.recipient},{salt:'ac'.repeat(32)},{intendedContractId:host.pool}]) {
    await assert.rejects(validateDeploymentAuthority({...authority,...changes},config,artifact), /contract ID/);
  }
  assert.notEqual(deriveContractId(host.funder,'ac'.repeat(32)),authority.intendedContractId);
});
test('valid DKG from another deployment or epoch cannot be copied into a matching-looking constructor', async () => {
  const {authority,artifact,config} = example();
  const other = {...authority,salt:'ac'.repeat(32),intendedContractId:deriveContractId(host.funder,'ac'.repeat(32))};
  await assert.rejects(validateDeploymentAuthority(other,config,artifact), /DKG domain/);
  await assert.rejects(validateDeploymentAuthority(authority,{...config,disclosure_epoch:2},artifact), /DKG epoch/);
  await assert.rejects(validateDeploymentAuthority(authority,{...config,auditor_x:'01'.padStart(64,'0')},artifact), /auditor key/);
  await assert.rejects(validateDeploymentAuthority(authority,{...config,dkg_transcript_hash:'11'.repeat(32)},artifact), /transcript hash/);
  const changed = structuredClone(artifact); changed.acceptances[0].signature = '00'.repeat(64);
  await assert.rejects(validateDeploymentAuthority(authority,config,changed), /INVALID_SIGNATURE/);
  const missing = {...artifact,acceptances:artifact.acceptances.slice(1)};
  await assert.rejects(validateDeploymentAuthority(authority,config,missing));
  const changedRoster = structuredClone(authority); changedRoster.thresholdConfig.trustees[0].authPublicKey = '77'.repeat(32);
  await assert.rejects(validateDeploymentAuthority(changedRoster,config,artifact), /trusted roster/);
});
