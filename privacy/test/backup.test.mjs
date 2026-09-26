import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryptBackup,decryptBackup,parseEncryptedBackup,BACKUP_KDF } from '../src/backup.mjs';
const context={domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},epoch:'1',ownerId:'33'.repeat(32)};
const password='synthetic backup password 2026';
test('actual Argon2id + AES-GCM backup survives JSON and snapshots bytes before awaiting',async()=>{
 const plain=new TextEncoder().encode('synthetic-private-note-and-key');
 const expected=new Uint8Array(plain),pending=encryptBackup(plain,password,context);
 plain.fill(0);
 const blob=await pending;
 assert.deepEqual(blob.kdf,BACKUP_KDF);assert.ok(Object.isFrozen(blob.context.domain));
 assert.ok(!JSON.stringify(blob).includes('synthetic-private'));
 assert.deepEqual(await decryptBackup(JSON.parse(JSON.stringify(blob)),password,context),expected);
 await assert.rejects(decryptBackup(blob,'wrong but sufficiently long password',context),/BACKUP_AUTHENTICATION_FAILED/);
 const corrupt={...blob,ciphertext:(blob.ciphertext.startsWith('00')?'01':'00')+blob.ciphertext.slice(2)};
 await assert.rejects(decryptBackup(corrupt,password,context),/BACKUP_AUTHENTICATION_FAILED/);
 const otherContext={...context,ownerId:'77'.repeat(32)};
 await assert.rejects(decryptBackup({...blob,context:otherContext},password,otherContext),/BACKUP_AUTHENTICATION_FAILED/);
});
test('untrusted import metadata and context are rejected before expensive KDF work',async()=>{
 const shape={version:'1',suite:'argon2id-aes256gcm-v1',context,kdf:{...BACKUP_KDF},salt:'44'.repeat(16),nonce:'55'.repeat(12),ciphertext:'66'.repeat(17)};
 for(const bad of [
  {...shape,version:'2'}, {...shape,kdf:{...BACKUP_KDF,memoryKiB:'1048576'}},
  {...shape,kdf:{...BACKUP_KDF,iterations:'1'}}, {...shape,kdf:{...BACKUP_KDF,parallelism:'0'}},
  {...shape,salt:'00'}, {...shape,nonce:'aa'}, {...shape,ciphertext:'0'.repeat(33)},
  {...shape,ciphertext:'66'.repeat(1048577+16)}, {...shape,extra:true},
 ])assert.throws(()=>parseEncryptedBackup(bad,context));
 assert.throws(()=>parseEncryptedBackup(shape,{...context,ownerId:'77'.repeat(32)}),/BINDING_MISMATCH/);
 assert.throws(()=>parseEncryptedBackup(shape,{...context,epoch:'2'}),/BINDING_MISMATCH/);
 assert.throws(()=>parseEncryptedBackup(shape,{...context,domain:{...context.domain,networkId:'77'.repeat(32)}}));
 const getter={...shape};Object.defineProperty(getter,'ciphertext',{enumerable:true,get(){throw new Error('must not read')}});
 assert.throws(()=>parseEncryptedBackup(getter,context),/DATA_PROPERTY_REQUIRED/);
 await assert.rejects(encryptBackup(new Uint8Array(1),'short',context));
 await assert.rejects(encryptBackup(new Uint8Array(1048577),password,context));
 await assert.rejects(encryptBackup(new Uint8Array(new SharedArrayBuffer(8)),password,context));
});
