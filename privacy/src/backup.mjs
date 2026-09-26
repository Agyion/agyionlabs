/** Portable encrypted bytes only; this module never logs or persists plaintext. */
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { bytesToHex,hexToBytes } from '@noble/hashes/utils.js';
import { fail,record,uint,hex,domain,bindDomain,equal,freeze } from './validation.mjs';

const MAX_BYTES=1048576,SUITE='argon2id-aes256gcm-v1',encoder=new TextEncoder();
export const BACKUP_KDF=Object.freeze({version:'19',memoryKiB:'65536',iterations:'3',parallelism:'1'});
const typed=Object.getPrototypeOf(Uint8Array.prototype);
const arrayType=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get;
const byteLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get;
const arrayBuffer=Object.getOwnPropertyDescriptor(typed,'buffer').get;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
function bytes(value) {
  try {
    if (arrayType.call(value)!=='Uint8Array' || byteLength.call(value)<1 || byteLength.call(value)>MAX_BYTES) throw new Error();
    bufferLength.call(arrayBuffer.call(value)); // Reject shared mutable storage.
    return new Uint8Array(value);
  } catch { fail('BOUNDED_PRIVATE_BYTES_REQUIRED','backup'); }
}
function contextOf(value) {
  const v=record(value,['domain','epoch','ownerId'],'context');
  return freeze({domain:domain(v.domain,'domain'),epoch:uint(v.epoch,32,'epoch',1n),ownerId:hex(v.ownerId,32,'ownerId',true)});
}
function passwordBytes(value) {
  if (typeof value!=='string' || value.length<12 || value.length>1024) fail('PASSWORD_LENGTH_REQUIRED','password');
  const bytes=encoder.encode(value);
  if (bytes.length>1024) {bytes.fill(0);fail('PASSWORD_LENGTH_REQUIRED','password');}
  return bytes;
}
function aad(header) { return encoder.encode(JSON.stringify(['AGYION_ENCRYPTED_BACKUP_V1',header])); }
export function parseEncryptedBackup(value,expectedContext) {
  const expected=contextOf(expectedContext),v=record(value,['version','suite','context','kdf','salt','nonce','ciphertext'],'backup');
  equal(v.version,'1','version');equal(v.suite,SUITE,'suite');
  const context=contextOf(v.context);bindDomain(context.domain,expected.domain);equal(context.epoch,expected.epoch,'epoch');equal(context.ownerId,expected.ownerId,'ownerId');
  const kdf=record(v.kdf,['version','memoryKiB','iterations','parallelism'],'kdf');
  for(const key of Object.keys(BACKUP_KDF))equal(kdf[key],BACKUP_KDF[key],`kdf.${key}`);
  const header={version:'1',suite:SUITE,context,kdf:{...BACKUP_KDF},salt:hex(v.salt,16,'salt'),nonce:hex(v.nonce,12,'nonce')};
  if (typeof v.ciphertext!=='string' || v.ciphertext.length<34 || v.ciphertext.length>(MAX_BYTES+16)*2 || v.ciphertext.length%2 || !/^[0-9a-f]+$/.test(v.ciphertext)) fail('BOUNDED_CIPHERTEXT_REQUIRED','ciphertext');
  return freeze({...header,ciphertext:v.ciphertext});
}
async function keyFor(password,salt,usage) {
  const input=passwordBytes(password);let derived;
  try {
    derived=await argon2idAsync(input,hexToBytes(salt),{version:19,m:65536,t:3,p:1,dkLen:32,maxmem:80*1024*1024,asyncTick:10});
    return await globalThis.crypto.subtle.importKey('raw',derived,'AES-GCM',false,[usage]);
  } finally { input.fill(0);derived?.fill(0); }
}
export async function encryptBackup(plaintext,password,contextValue) {
  const context=contextOf(contextValue),privateBytes=bytes(plaintext);
  const header={version:'1',suite:SUITE,context,kdf:{...BACKUP_KDF},salt:bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16))),nonce:bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(12)))};
  try {
    const key=await keyFor(password,header.salt,'encrypt');
    const encrypted=await globalThis.crypto.subtle.encrypt({name:'AES-GCM',iv:hexToBytes(header.nonce),additionalData:aad(header),tagLength:128},key,privateBytes);
    return freeze({...header,ciphertext:bytesToHex(new Uint8Array(encrypted))});
  } finally { privateBytes.fill(0); }
}
export async function decryptBackup(value,password,expectedContext) {
  const parsed=parseEncryptedBackup(value,expectedContext),{ciphertext,...header}=parsed;
  // Metadata/profile/context are rejected before a costly password derivation.
  const key=await keyFor(password,header.salt,'decrypt');
  try {
    const plain=await globalThis.crypto.subtle.decrypt({name:'AES-GCM',iv:hexToBytes(header.nonce),additionalData:aad(header),tagLength:128},key,hexToBytes(ciphertext));
    return new Uint8Array(plain);
  } catch { fail('BACKUP_AUTHENTICATION_FAILED','backup'); }
}
