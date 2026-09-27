import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createTriggerAttester,restoreTriggerAttester } from '../src/credentials.mjs';
import { encryptBackup } from '../src/backup.mjs';
const scope={domain:{networkId:'1'.repeat(64),contractId:'2'.repeat(64)},epoch:'1',profileId:'3'.repeat(64)};
test('authenticated malformed attester backups produce fixed errors without plaintext snippets',async()=>{
 const attester=createTriggerAttester(scope),password='test malformed credential password';
 const plaintext=new TextEncoder().encode('{"seed":"sensitive-plaintext-marker",');
 const ownerId=bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(attester.publicPoint))));
 const encrypted=await encryptBackup(plaintext,password,{domain:scope.domain,epoch:scope.epoch,ownerId});
 await assert.rejects(restoreTriggerAttester({version:'1',kind:'EncryptedTriggerAttester',scope,publicPoint:attester.publicPoint,encrypted},password,scope),error=>{
  assert.equal(error.code,'INVALID_ATTESTER_BACKUP');assert(!error.message.includes('sensitive-plaintext-marker'));return true;
 });
});
