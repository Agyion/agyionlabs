import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chunkPinnedArtifact, inspectDevelopmentProver, packagePrivateProver } from '../package-private-prover.mjs';
import { loadPinnedProverArtifacts } from '../../privacy/src/prover-assets.mjs';
import { privateProverFixture as fixture } from './private-prover-fixture.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://example.test';
const asset = value => chunkPinnedArtifact(Buffer.from(value), sha(Buffer.from(value)), { chunkBytes: 5 });

test('packaged chunks round trip through the bounded browser loader', async () => {
  const parts = { wasm: asset('wasm-bytes'), zkey: asset('a-public-proving-key'), verificationKey: asset('{"key":1}') };
  const release = { publicCount: 157, ...Object.fromEntries(Object.entries(parts).map(([k,v]) => [k,v.manifest])) };
  const blobs = new Map(Object.values(parts).flatMap(part => [...part.blobs]));
  const fetchImpl = async url => {
    const hash = url.split('/').pop().replace('.bin','');
    const response = new Response(blobs.get(hash), { status: blobs.has(hash) ? 200 : 404 });
    Object.defineProperty(response,'url',{value:url});
    return response;
  };
  assert.equal(Buffer.from((await loadPinnedProverArtifacts(release,{origin,fetchImpl})).zkey).toString(),'a-public-proving-key');
  const reordered = structuredClone(release); reordered.zkey.chunks.reverse();
  await assert.rejects(loadPinnedProverArtifacts(reordered,{origin,fetchImpl}),/artifact hash mismatch/);
  const hash = release.wasm.chunks[0].sha256;
  blobs.set(hash, Buffer.concat([blobs.get(hash), Buffer.from('x')]));
  await assert.rejects(loadPinnedProverArtifacts(release,{origin,fetchImpl}),/Oversized/);
});

test('splitter rejects changed pins, empty input and unsafe chunk sizes', () => {
  const bytes = Buffer.from('verified public artifact');
  assert.throws(()=>chunkPinnedArtifact(bytes,'0'.repeat(64)),/hash mismatch/);
  assert.throws(()=>chunkPinnedArtifact(Buffer.alloc(0),sha(Buffer.alloc(0))),/size/);
  for(const chunkBytes of [0,-1,1.5,16*1024*1024+1])
    assert.throws(()=>chunkPinnedArtifact(bytes,sha(bytes),{chunkBytes}),/chunk size/);
  const large = Buffer.alloc(16*1024*1024+1,7);
  const result = chunkPinnedArtifact(large,sha(large));
  assert.deepEqual(result.manifest.chunks.map(c=>c.bytes),[16*1024*1024,1]);
  assert.equal(result.manifest.bytes,large.length);
});


test('packaging requires explicit development mode and current source provenance', async t => {
  const f=await fixture(t);
  await assert.rejects(packagePrivateProver({root:f.root,artifactRoot:f.base}),/explicit development/);
  const ready=await inspectDevelopmentProver({root:f.root,artifactRoot:f.base});
  assert.deepEqual(Object.values(ready.releases).map(x=>x.publicCount),[157,4]);
  await f.put('privacy/circuits/transition.circom','changed source');
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}),/Circuit source differs/);
});

test('tampered bytes, metadata pins, paths and private verifier pins are rejected', async t => {
  const f=await fixture(t);
  const original=await readFile(join(f.base,'keys/transition.zkey'));
  await f.put('artifacts/privacy-v2/keys/transition.zkey','altered');
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}),/artifact hash mismatch/);
  await f.put('artifacts/privacy-v2/keys/transition.zkey',original);
  const cases=structuredClone(f.cases);cases.transition.zkey='../secret';
  await f.put('artifacts/privacy-v2/prover-cases.json',JSON.stringify(cases));
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}),/artifact path/);
  await f.put('artifacts/privacy-v2/prover-cases.json',JSON.stringify(f.cases));
  await f.put('contracts/private-pool/src/pins.rs','pub const MAIN_VK_HASH: [u8;32] = [0];');
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}),/verifier pin/);
});

test('a deterministic package contains only six public artifact descriptions and immutable hash chunks', async t => {
  const f=await fixture(t);
  const result=await packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true});
  assert.equal(result.artifactCount,6);
  const code=await readFile(join(f.root,'app/app/lib/privateProverAssets.ts'),'utf8');
  assert.match(code,/PRIVATE_PROVER_DEVELOPMENT_ONLY = true/);
  assert.match(code,/PRIVATE_PROVER_ASSETS/);
  assert.doesNotMatch(code,/privateKey|witness|secret|initial\.zkey|file:\/\//);
  assert.equal((await packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true})).manifestSha256,result.manifestSha256);
  const hash=result.releases.transition.wasm.chunks[0].sha256;
  await f.put(`app/public/zk/private/${hash}.bin`,'corrupt output');
  await assert.rejects(packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true}),/Existing chunk differs/);
});

test('missing artifacts and mismatched release metadata never create an output package', async t => {
  const f = await fixture(t);
  const cases = structuredClone(f.cases); cases.revocation.pins.zkeySha256 = '0'.repeat(64);
  await f.put('artifacts/privacy-v2/prover-cases.json', JSON.stringify(cases));
  await assert.rejects(packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true}), /reviewed pins/);
  await assert.rejects(readFile(join(f.root,'app/app/lib/privateProverAssets.ts')), {code:'ENOENT'});
  await f.put('artifacts/privacy-v2/prover-cases.json', JSON.stringify(f.cases));
  const altered = structuredClone(f.development); altered.phase1.verified = false;
  await f.put('artifacts/privacy-v2/keys/manifest.json', JSON.stringify(altered));
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}), /reviewed fixture provenance/);
  await f.put('artifacts/privacy-v2/keys/manifest.json', JSON.stringify(f.development));
  await rm(join(f.base,'keys/revocation.zkey'));
  await assert.rejects(inspectDevelopmentProver({root:f.root,artifactRoot:f.base}), {code:'ENOENT'});
});
