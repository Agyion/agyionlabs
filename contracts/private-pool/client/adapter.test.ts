import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { scValToNative } from '@stellar/stellar-sdk';
import { Client } from './bindings.ts';
import { fieldBytes, prepareSubmit } from './adapter.ts';
// npm test runs from this package; emitted tests are under ignored target/.
const fixture = JSON.parse(readFileSync('../fixtures/host-config.json', 'utf8'));
function inputs() {
  const fields = Array.from({length:157}, (_, i) => BigInt(i + 100));
  fields[6] = 1000n; fields[7] = 1100n; fields[11] = 0n;
  fields[16] = 1n; fields[17] = BigInt(fixture.assetId); fields[18] = (1n << 64n) - 1n;
  fields[19] = BigInt(fixture.funderId); fields[20] = 0n; fields[21] = 0n; fields[22] = 2n;
  return fields;
}
const addresses = { asset: fixture.asset as string, bridgeAccount: fixture.funder as string, feeAccount: null };
// Encoding fixture only. This deliberately is NOT a valid Groth16 proof.
const proof = '12'.repeat(256);

test('actual WASM ABI encodes the exact public ciphertext and full u64 amount without witness fields', () => {
  const fields = inputs(), prepared = prepareSubmit(fields, proof, addresses);
  const client = new Client({contractId:fixture.pool,networkPassphrase:fixture.networkPassphrase,rpcUrl:'https://unused.invalid'});
  const encoded = client.spec.funcArgsToScVals('submit', prepared);
  const decoded = scValToNative(encoded[0]);
  assert.equal(decoded.bridge_amount, (1n << 64n) - 1n);
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
  assert.deepEqual(decoded.ciphertext.map(hex), fields.slice(23).map(fieldBytes).map(hex));
  assert.deepEqual(decoded.nullifiers.map(hex), fields.slice(12,14).map(fieldBytes).map(hex));
  assert.deepEqual(decoded.commitments.map(hex), fields.slice(14,16).map(fieldBytes).map(hex));
  assert.equal(decoded.bridge_account, fixture.funder);
  assert.equal(decoded.asset, fixture.asset);
  assert.equal(hex(scValToNative(encoded[1])), proof);
  assert.equal(Object.keys(decoded).length, 15);
  fields[23] = 0n;
  assert.notEqual(BigInt(`0x${prepared.transition.ciphertext[0].toString('hex')}`), 0n);
});

test('internal fee binds an explicit asset and account, and rejects unbound or extra addresses', () => {
  const fields = inputs(); fields[16] = 0n; fields[18] = 0n; fields[19] = 0n;
  fields[20] = 9n; fields[21] = BigInt(fixture.feeId);
  const address = {asset:fixture.asset,bridgeAccount:null,feeAccount:fixture.fee};
  assert.equal(prepareSubmit(fields,proof,address).transition.fee_amount,9n);
  assert.throws(() => prepareSubmit(fields,proof,{...address,asset:null}), /Asset presence/);
  assert.throws(() => prepareSubmit(fields,proof,{...address,feeAccount:null}), /Fee account/);
  assert.throws(() => prepareSubmit(fields,proof,{...address, witness:'private'} as typeof address), /Only public/);
  fields[20] = 0n; fields[21] = 0n; fields[17] = 0n;
  const internal = prepareSubmit(fields,proof,{asset:null,bridgeAccount:null,feeAccount:null});
  assert.equal(internal.transition.asset,undefined);
});

test('rejects noncanonical fields, malformed proofs, wrong suite and invalid bounded values', () => {
  for (const value of [-1n,21888242871839275222246405745257275088548364400416034343698204186575808495617n,1 as unknown as bigint]) assert.throws(() => fieldBytes(value), /Noncanonical/);
  for (const hex of [proof.toUpperCase().replace('12','AB'),proof.slice(2),proof+'00']) assert.throws(() => prepareSubmit(inputs(),hex,addresses), /proof/);
  for (const [i,v] of [[7,1121n],[11,(1n<<32n)+1n],[18,1n<<64n],[22,3n],[25,0n],[53,1n<<128n]] as const) {
    const fields = inputs(); fields[i] = v;
    assert.throws(() => prepareSubmit(fields,proof,addresses));
  }
});

test('rejects getter-backed or sparse public data without invoking accessors', () => {
  let invoked = false;
  const fields = inputs(); Object.defineProperty(fields,'23',{get(){invoked=true;return 3n;},enumerable:true});
  assert.throws(() => prepareSubmit(fields,proof,addresses), /data properties/);
  assert.equal(invoked,false);
  const sparse = inputs(); delete sparse[24];
  assert.throws(() => prepareSubmit(sparse,proof,addresses), /Dense/);
  const other = {...addresses}; Object.defineProperty(other,'asset',{get(){invoked=true;return fixture.asset;},enumerable:true});
  assert.throws(() => prepareSubmit(inputs(),proof,other), /data properties/);
  assert.equal(invoked,false);
});
