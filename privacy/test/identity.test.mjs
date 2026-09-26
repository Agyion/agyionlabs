import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {domainField,assetField,accountField,revocationTag} from '../src/identity.mjs';

// Independent Stellar SDK / actual native+WASM host vectors committed with the
// contract. Address raw bytes here are public fixed TEST values, not credentials.
const vector=JSON.parse(readFileSync(new URL('../../contracts/private-pool/src/address_fixture.json',import.meta.url),'utf8'));
test('portable identities match independent typed Stellar address / host vectors',()=>{
 assert.equal(domainField({networkId:vector.network,contractId:'01'.repeat(32)}),BigInt('0x'+vector.domain));
 assert.equal(assetField('02'.repeat(32)),BigInt('0x'+vector.assetId));
 assert.equal(accountField({kind:'account',id:'03'.repeat(32)}),BigInt('0x'+vector.accountId));
 assert.notEqual(accountField({kind:'contract',id:'03'.repeat(32)}),BigInt('0x'+vector.accountId));
 assert.notEqual(accountField({kind:'contract',id:'02'.repeat(32)}),assetField('02'.repeat(32)));
 assert.notEqual(domainField({networkId:'04'.repeat(32),contractId:'01'.repeat(32)}),BigInt('0x'+vector.domain));
 assert.notEqual(domainField({networkId:vector.network,contractId:'02'.repeat(32)}),BigInt('0x'+vector.domain));
});
test('identity helpers reject ambiguous bytes, kinds and noncanonical domains',()=>{
 for(const value of ['01','0x'+'01'.repeat(32),'AB'.repeat(32),'00'.repeat(32)])assert.throws(()=>assetField(value));
 assert.throws(()=>accountField({kind:'muxed',id:'03'.repeat(32)}));
 assert.throws(()=>domainField({networkId:vector.network,contractId:'01'.repeat(32),extra:true}));
 for(const domain of [0n,-1n,21888242871839275222246405745257275088548364400416034343698204186575808495617n,1])assert.throws(()=>revocationTag(domain,'23'.repeat(32)));
 const tag=revocationTag(101n,'23'.repeat(32));assert.ok(tag>0n);
 assert.notEqual(tag,revocationTag(102n,'23'.repeat(32)));
 assert.notEqual(tag,revocationTag(101n,'24'.repeat(32)));
});
