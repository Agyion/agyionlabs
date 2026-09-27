import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { checkFee, pickupPayload, checkConfirmed, checkFailed, safeError, retryBeforeSigningAllowed } from '../verify-testnet-market.mjs';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { Keypair, StrKey, xdr } = require('@stellar/stellar-sdk');

test('each market transaction and aggregate signed fee obey explicit testnet caps', () => {
  assert.equal(checkFee('10000000', 290000000n), 300000000n);
  for (const fee of ['10000001', '-1', '0', '1.5', 'NaN', '0100']) assert.throws(() => checkFee(fee, 0n));
  assert.throws(() => checkFee('100', 299999950n));
  assert.equal(checkFee('71378571',0n,'upload'),71378571n);
  assert.throws(()=>checkFee('100000001',0n,'upload'));
  assert.throws(()=>checkFee('100',0n,'unbounded'));
});
test('pre-signing retry excludes every signed, unresolved or deployed run',()=>{
 const previous={status:'failed',transactions:[],checks:[{name:'Three distinct dedicated testnet accounts funded by Friendbot'}]};
 assert.equal(retryBeforeSigningAllowed(previous),true);
 for(const bad of [{status:'running'},{contractId:'C-deployed'},{transactions:[{status:'prepared'}]},{transactions:[{status:'unresolved'}]},{checks:[]}])assert.throws(()=>retryBeforeSigningAllowed({...previous,...bad}));
});
test('market harness receipt bytes match independent JavaScript signing fixture', () => {
  const f = JSON.parse(fs.readFileSync(new URL('../../market/fixtures/pickup-signatures.json', import.meta.url)));
  const receipt = xdr.ScVal.fromXDR(f.receiptXdr, 'base64');
  const bytes = pickupPayload(f.contract, 'walk-in', receipt);
  assert.equal(bytes.toString('hex'), f.cases[0].payloadHex);
  const key = Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(f.publicKey, 'hex')));
  assert.ok(key.verify(bytes, Buffer.from(f.cases[0].signature, 'hex')));
  assert.throws(() => pickupPayload(f.contract, 'login', receipt));
});
test('confirmation requires exact submitted envelope, success, ledger and bounded charged fee', () => {
  const submitted = {fee:'1000', toXDR:()=> 'expected'};
  const result = {status:'SUCCESS', ledger:23, envelopeXdr:{toXDR:()=> 'expected'},resultXdr:{result:()=>({switch:()=>({name:'txSuccess'})}),feeCharged:()=> '99'}};
  assert.equal(checkConfirmed(submitted,result),99n);
  for (const mutation of [{status:'NOT_FOUND'},{ledger:0},{envelopeXdr:{toXDR:()=> 'other'}},{resultXdr:{result:()=>({switch:()=>({name:'txFailed'})}),feeCharged:()=> '99'}},{resultXdr:{result:()=>({switch:()=>({name:'txSuccess'})}),feeCharged:()=> '1001'}}]) assert.throws(()=>checkConfirmed(submitted,{...result,...mutation}));
});
test('error evidence removes Stellar secret-seed shaped content', () => {
  const secret = Keypair.random().secret();
  assert.equal(safeError(new Error(`failed ${secret}`)), 'failed [redacted-secret]');
});
test('failed inclusion is terminal only after exact envelope, failed result and fee validation',()=>{
 const submitted={fee:'1000',toXDR:()=> 'expected'};
 const failed={status:'FAILED',ledger:24,envelopeXdr:{toXDR:()=> 'expected'},resultXdr:{result:()=>({switch:()=>({name:'txFailed',value:-1})}),feeCharged:()=> '99'}};
 assert.deepEqual(checkFailed(submitted,failed),{fee:99n,result:'txFailed'});
 for(const mutation of [{ledger:0},{envelopeXdr:{toXDR:()=> 'different'}},{resultXdr:{result:()=>({switch:()=>({name:'txSuccess',value:0})}),feeCharged:()=> '99'}},{resultXdr:{result:()=>({switch:()=>({name:'txFeeBumpInnerSuccess',value:1})}),feeCharged:()=> '99'}},{resultXdr:{result:()=>({switch:()=>({name:'txFailed',value:-1})}),feeCharged:()=> '1001'}}])assert.throws(()=>checkFailed(submitted,{...failed,...mutation}));
});
