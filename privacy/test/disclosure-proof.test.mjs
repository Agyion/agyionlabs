/**
 * Opt-in actual Groth16 + threshold disclosure composition test:
 * PRIVACY_DISCLOSURE_PROOF_TEST=1 node --test test/disclosure-proof.test.mjs
 * Optional PRIVACY_ARTIFACT_DIR points at the local development artifact root.
 * Enabling with absent/stale artifacts FAILS; no fake verifier fallback exists.
 * All keys/notes/trees are local TEST material. One process plays every actor;
 * this is neither an independent committee nor a live accepted/funded record.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { poseidon2 } from 'poseidon-lite';
import { THRESHOLD_SUITE, createDealerPackage, deriveTrusteeShare, acceptDkgTranscript,
  finalizeDkgTranscript, pointToFieldElements, pointFromCoordinates, combinePartialDecryptions } from '../src/threshold.mjs';
import { AUDIT_FIELDS, signDisclosureRequest, authorizeDisclosureRequest, createDisclosureOperator,
  openDisclosureDelivery, disclosurePartialContext } from '../src/authorization.mjs';
import { createFileReplayStore } from '../src/operator-store.mjs';
import { createLocalGroth16Prover } from '../src/prover.mjs';
import { createLocalPrivacyClient } from '../src/client.mjs';
import { domainField } from '../src/identity.mjs';
import { decryptEnvelopeWithSharedPoint } from '../src/witness.mjs';
import { noteCommitment, SparseMerkleTree } from '../src/model.mjs';
import { makePolicyConfig } from './model-fixtures.mjs';

const enabled = process.env.PRIVACY_DISCLOSURE_PROOF_TEST === '1';
const root = fileURLToPath(new URL('../../',import.meta.url));
const artifactRoot = resolve(process.env.PRIVACY_ARTIFACT_DIR || join(root,'artifacts/privacy-v2'));
const hash = bytes => bytesToHex(sha256(bytes));
const publicKey = seed => bytesToHex(ed25519.getPublicKey(hexToBytes(seed)));

async function realProver() {
  const manifest = JSON.parse(await readFile(join(artifactRoot,'keys/manifest.json'),'utf8'));
  assert.equal(manifest.schema,'agyion-private-development-artifacts-v2');
  assert.equal(manifest.developmentOnly,true);
  const pins = manifest.circuits.transition;
  assert.equal(pins.publicCount,157);
  // The local manifest is development provenance, not an independently trusted
  // release. Check source freshness so this test cannot silently prove an older
  // circuit while reporting that the currently reviewed constraints passed.
  for (const name of ['transition.circom','revocation.circom','primitives.circom','poseidon-encryption.circom']) {
    assert.equal(hash(await readFile(join(root,'privacy/circuits',name))),manifest.compilation.sources[name],`source ${name}`);
  }
  const [wasm,zkey,verificationKey] = await Promise.all([
    readFile(join(artifactRoot,'circuit/transition_js/transition.wasm')),
    readFile(join(artifactRoot,'keys/transition.zkey')),
    readFile(join(artifactRoot,'keys/transition-vk.json')),
  ]);
  return createLocalGroth16Prover({wasm,zkey,verificationKey,publicCount:157,pins:{
    wasmSha256:pins.wasmSha256,zkeySha256:pins.zkeySha256,verificationKeySha256:pins.verificationKeySha256,
  }});
}

test('actual Pod-to-cash proof composes with authorized assets-only2of3 private disclosure',
  {skip:!enabled,timeout:900000},async t => {
  // This isolated Node process owns snarkjs' cached verification workers.
  // Register cleanup before initialization so failed setup/proof paths exit too.
  t.after(async () => { await globalThis.curve_bn128?.terminate(); });
  const prover = await realProver();
  // Public, disposable test authentication identities; DKG coefficients are
  // generated in memory and never reconstructed into an aggregate master key.
  const seeds = ['01','02','03'].map(n => n.repeat(32));
  const decisionSeeds = ['51','52','53'].map(n => n.repeat(32));
  const {Address,StrKey} = createRequire(new URL('../../contracts/private-pool/client/package.json',import.meta.url))('@stellar/stellar-sdk');
  const domain = {networkId:hash(new TextEncoder().encode('Test SDF Network ; September 2015')),contractId:'22'.repeat(32)};
  const pool = new Address(StrKey.encodeContract(Buffer.from(domain.contractId,'hex')));
  // Same typed-address XDR and SHA256->two128-bit limbs->Poseidon2 as the
  // Soroban host's Poseidon.domain(). This TEST address is not a deployment.
  const domainDigest = hash(Buffer.concat([Buffer.from('AGYION_DOMAIN_V2\0'),Buffer.from(domain.networkId,'hex'),pool.toScVal().toXDR()]));
  const fieldDomain = poseidon2([BigInt('0x'+domainDigest.slice(0,32)),BigInt('0x'+domainDigest.slice(32))]);
  assert.equal(domainField(domain),fieldDomain);
  const config = {version:'1',suite:THRESHOLD_SUITE,domain,epoch:'1',sessionId:'23'.repeat(32),threshold:'2',
    trustees:seeds.map((s,i) => ({id:String(i+1),authPublicKey:publicKey(s)}))};
  const dealers = seeds.map((seed,i) => createDealerPackage(config,String(i+1),seed));
  const packages = dealers.map(d => d.publicPackage);
  const shares = seeds.map((_,i) => deriveTrusteeShare(config,packages,dealers.map(d => d.privateShares[i]),String(i+1)));
  const epoch = finalizeDkgTranscript(config,packages,shares.map((share,i) => acceptDkgTranscript(config,packages,share,seeds[i])));
  const policy = {version:'2',domain,epoch:'1',dkgTranscriptHash:epoch.transcriptHash,policyDigest:'24'.repeat(32),
    threshold:'2',authorities:decisionSeeds.map((seed,i) => ({id:String(i+1),publicKey:publicKey(seed)})),
    trusteeIds:['1','2','3'],trusteeThreshold:'2',allowedFields:AUDIT_FIELDS};
  assert.ok(policy.authorities.every(a => config.trustees.every(t => a.publicKey !== t.authPublicKey)));

  const configuration = makePolicyConfig(1n); // Actual Pod authorization -> cash.
  configuration.domain = fieldDomain;
  for (const key of ['inNotes','outNotes']) configuration[key] = configuration[key].map(note => note.map((v,i) => i===1?fieldDomain:v));
  configuration.inputTree = new SparseMerkleTree(32);
  configuration.inputTree.set(0n,noteCommitment(configuration.inNotes[0]));
  configuration.appendTree = configuration.inputTree.clone();
  configuration.auditor = pointToFieldElements(epoch.publicKey);
  const profile = {domain:configuration.domain,assetPolicyRoot:configuration.assetTree.root,
    epoch:configuration.epoch,auditor:configuration.auditor};
  const client = createLocalPrivacyClient({profile,prove:prover.prove,verify:prover.verify});
  const draft = client.prepare(configuration);
  const candidate = await client.prepareSubmission(draft);
  assert.equal(candidate.kind,'UnsubmittedPrivateTransition');
  assert.equal(await prover.verify(candidate.proof,candidate.publicSignals),true);
  const tampered = candidate.publicSignals.slice(); tampered[156] = ((BigInt(tampered[156])+1n)%21888242871839275222246405745257275088548364400416034343698204186575808495617n).toString();
  assert.equal(await prover.verify(candidate.proof,tampered),false);
  const core = candidate.publicSignals.slice(0,23).map(BigInt), encrypted = candidate.publicSignals.slice(23).map(BigInt);
  assert.deepEqual(core.slice(3,5),pointToFieldElements(epoch.publicKey));
  const archivedRecord = {recordHash:candidate.ciphertextDigest,ciphertexts:encrypted};
  // This injected TEST reader exposes only the exact locally verified proof
  // record. Its synthetic starting root is not a live pool inclusion claim.
  const readAcceptedRecord = async id => id===candidate.ciphertextDigest ?
    {recordId:id,publicInputs:[...core,...encrypted]} : undefined;
  const requesterSecret = '61'.repeat(32);
  const request = {version:'2',domain,epoch:'1',ledger:{from:'100',until:'110'},requestId:'62'.repeat(32),
    recordHash:candidate.ciphertextDigest,ciphertextDigest:candidate.ciphertextDigest,
    requesterPublicKey:bytesToHex(x25519.getPublicKey(hexToBytes(requesterSecret))),policyDigest:policy.policyDigest,
    purposeDigest:'63'.repeat(32),fields:['audit-assets'],trusteeIds:['1','2','3']};
  const approvals = decisionSeeds.slice(0,2).map((seed,i) => signDisclosureRequest(request,String(i+1),seed,policy));
  assert.throws(() => authorizeDisclosureRequest(request,approvals.slice(0,1),policy,'105'));
  const authorized = authorizeDisclosureRequest(request,approvals,policy,'105');

  const directory = await mkdtemp(join(tmpdir(),'agyion-real-disclosure-')); await chmod(directory,0o700);
  const stores = []; t.after(async () => { await Promise.all(stores.map(s => s.close())); await rm(directory,{recursive:true,force:true}); });
  for (const id of ['1','2']) stores.push(await createFileReplayStore({directory:join(directory,`trustee-${id}`)}));
  const operators = stores.map((store,i) => createDisclosureOperator({epoch,trusteeShare:shares[i],policy,profile,
    claimRequest:store.claimRequest,readCurrentLedger:async () => '105',readAcceptedRecord}));
  const deliveries = await Promise.all(operators.map(op => op.disclose(authorized,archivedRecord,'105')));
  for (const delivery of deliveries) {
    assert.equal(delivery.suite,'x25519-hkdf-sha256-aes256gcm-v1');
    assert.equal('partial' in delivery,false); assert.equal(JSON.stringify(delivery).includes('audit-parties'),false);
    assert.equal(JSON.stringify(delivery).includes('audit-terms'),false);
  }
  const replies = await Promise.all(deliveries.map(delivery => openDisclosureDelivery(delivery,authorized,requesterSecret,epoch,archivedRecord,'105')));
  replies.forEach(reply => assert.deepEqual(reply.map(p => p.field),['audit-assets']));
  const partials = replies.map(reply => reply[0].partial);
  const context = disclosurePartialContext(authorized,archivedRecord,'audit-assets','105');
  assert.throws(() => combinePartialDecryptions(epoch,context,partials.slice(0,1)));
  assert.throws(() => combinePartialDecryptions(epoch,context,[partials[0],partials[0]]));
  const shared = combinePartialDecryptions(epoch,context,partials);
  assert.deepEqual(decryptEnvelopeWithSharedPoint(core,encrypted,2,pointToFieldElements(shared)),[
    configuration.inNotes[0][2],100n,0n,100n,0n,noteCommitment(configuration.inNotes[0]),0n,0n,0n,
  ]);
  for (const [field,slot,offset] of [['audit-parties',3,69],['audit-terms',4,85]]) {
    assert.throws(() => disclosurePartialContext(authorized,archivedRecord,field,'105'));
    assert.throws(() => decryptEnvelopeWithSharedPoint(core,encrypted,slot,pointToFieldElements(shared)));
    const otherPoint = pointFromCoordinates({x:encrypted[offset].toString(16).padStart(64,'0'),y:encrypted[offset+1].toString(16).padStart(64,'0')});
    assert.throws(() => combinePartialDecryptions(epoch,{...context,ephemeralPublicKey:otherPoint},partials));
  }
  await assert.rejects(operators[0].disclose(authorized,archivedRecord,'105'),/REPLAY/);
  await stores[0].close();
  const restartedStore = await createFileReplayStore({directory:join(directory,'trustee-1')}); stores.push(restartedStore);
  const restarted = createDisclosureOperator({epoch,trusteeShare:shares[0],policy,profile,claimRequest:restartedStore.claimRequest,readCurrentLedger:async () => '105',readAcceptedRecord});
  await assert.rejects(restarted.disclose(authorized,archivedRecord,'105'),/REPLAY/);
  client.forget(draft);
  t.diagnostic('Verified actual local Groth16 + DKG + signed authorization + durable replay + encrypted DLEQ delivery + selective decryption. No live submission or independent committee.');
});
