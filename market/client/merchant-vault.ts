/** Local merchant authorization keys. No wallet access, network, or plaintext storage.
 * Saved-file verification checks decrypted material; JavaScript cannot establish
 * that a File came from an OS picker or guarantee erasure of SDK/GC copies.
 */
import {Keypair,StrKey,hash} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {address,exact,hex32,metadataHash,parsePublication,pickupAuthorizationBytes,publicationBytes,requireValue,TESTNET_NETWORK_ID,uint32} from '../shared/codec.ts';
import type {PickupAction,PickupReceipt,Publication} from '../shared/codec.ts';
import {encryptBackup,decryptBackup,parseEncryptedBackup} from './backup-bridge.mjs';
import type {BackupContext,EncryptedBackup} from './backup-bridge.mjs';

export const MAX_MERCHANT_KEY_FILE_BYTES=16*1024;
export interface MerchantKeyScope {readonly networkId:string;readonly contract:string;readonly seller:string;readonly keyEpoch:number}
declare const merchantKeyBrand:unique symbol;
export type MerchantKeyHandle=Readonly<{[merchantKeyBrand]:true;kind:'MerchantSigningKey';scope:MerchantKeyScope;publicKey:string}>;
export type MerchantKeyBackup=Readonly<{version:'1';kind:'AgyionMerchantKeyBackup';scope:MerchantKeyScope;publicKey:string;encrypted:EncryptedBackup}>;
export interface MerchantPickupRequest {scope:MerchantKeyScope;action:PickupAction;receipt:PickupReceipt;leaseUntil?:number}
type Material={seed:Uint8Array;checked:boolean;verification:object};
const keys=new WeakMap<MerchantKeyHandle,Material>();
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

function parseScope(value:unknown):MerchantKeyScope {
 const v=exact(value,['networkId','contract','seller','keyEpoch']);requireValue(v.networkId===TESTNET_NETWORK_ID,'Only the reviewed testnet scope is supported.');
 return Object.freeze({networkId:TESTNET_NETWORK_ID,contract:address(v.contract,true),seller:address(v.seller),keyEpoch:uint32(v.keyEpoch,1)});
}
function sameScope(a:MerchantKeyScope,b:MerchantKeyScope){requireValue(a.networkId===b.networkId&&a.contract===b.contract&&a.seller===b.seller&&a.keyEpoch===b.keyEpoch,'Merchant key scope or epoch differs.');}
function material(handle:MerchantKeyHandle):Material {const value=keys.get(handle);requireValue(value,'Merchant key handle is locked or unavailable.');return value;}
function current(handle:MerchantKeyHandle,value:Material){requireValue(keys.get(handle)===value,'Merchant key handle was locked during the operation.');}
function signingMaterial(handle:MerchantKeyHandle):Material {const value=material(handle);requireValue(value.checked,'Select and check the saved merchant key backup before signing.');return value;}
function publicKey(seed:Uint8Array){return Keypair.fromRawEd25519Seed(Buffer.from(seed)).rawPublicKey().toString('hex');}
function make(scope:MerchantKeyScope,seed:Uint8Array):MerchantKeyHandle {
 requireValue(seed.byteLength===32);const handle=Object.freeze({kind:'MerchantSigningKey' as const,scope,publicKey:publicKey(seed)}) as MerchantKeyHandle;
 keys.set(handle,{seed:Uint8Array.from(seed),checked:false,verification:{}});return handle;
}
function context(scope:MerchantKeyScope,publicKey:string):BackupContext {
 const ownerId=hash(Buffer.from(JSON.stringify(['AGYION_MERCHANT_KEY_BACKUP_V1',scope.networkId,scope.contract,scope.seller,scope.keyEpoch,publicKey]))).toString('hex');
 return {domain:{networkId:scope.networkId,contractId:Buffer.from(StrKey.decodeContract(scope.contract)).toString('hex')},epoch:String(scope.keyEpoch),ownerId};
}
function packet(value:unknown,expected:MerchantKeyScope):MerchantKeyBackup {
 const p=exact(value,['version','kind','scope','publicKey','encrypted']);requireValue(p.version==='1'&&p.kind==='AgyionMerchantKeyBackup');
 const scope=parseScope(p.scope);sameScope(scope,expected);const key=hex32(p.publicKey);
 return Object.freeze({version:'1',kind:'AgyionMerchantKeyBackup',scope,publicKey:key,encrypted:parseEncryptedBackup(p.encrypted,context(scope,key))});
}
async function selectedPacket(file:File,scope:MerchantKeyScope):Promise<MerchantKeyBackup> {
 // Native accessors/methods bypass a forged size/arrayBuffer property. The File
 // is still public input and all encrypted/plaintext fields are validated below.
 let size:number;
 try {
  requireValue(typeof File!=='undefined'&&typeof Blob!=='undefined');
  Object.getOwnPropertyDescriptor(File.prototype,'name')!.get!.call(file);
  size=Object.getOwnPropertyDescriptor(Blob.prototype,'size')!.get!.call(file) as number;
  requireValue(size>0&&size<=MAX_MERCHANT_KEY_FILE_BYTES);
 }catch{throw new Error('Select a bounded merchant key backup file.');}
 const bytes=await Blob.prototype.arrayBuffer.call(file) as ArrayBuffer;
 requireValue(bytes.byteLength===size&&bytes.byteLength<=MAX_MERCHANT_KEY_FILE_BYTES,'Backup file size differs.');
 let parsed:unknown;try{parsed=JSON.parse(decoder.decode(bytes));}catch{throw new Error('The merchant key backup file is invalid.');}
 return packet(parsed,scope);
}
async function decode(p:MerchantKeyBackup,password:string):Promise<Uint8Array> {
 const plain=await decryptBackup(p.encrypted,password,context(p.scope,p.publicKey));let seed:Uint8Array|undefined;
 try {
  const value=exact(JSON.parse(decoder.decode(plain)),['version','kind','scope','publicKey','seed']);
  requireValue(value.version==='1'&&value.kind==='AgyionMerchantSigningKey');sameScope(parseScope(value.scope),p.scope);
  requireValue(hex32(value.publicKey)===p.publicKey);seed=Uint8Array.from(Buffer.from(hex32(value.seed),'hex'));
  requireValue(publicKey(seed)===p.publicKey,'Backup public key does not match its private material.');return seed;
 }catch{seed?.fill(0);throw new Error('Merchant key backup material is invalid.');}finally{plain.fill(0);}
}

export function createMerchantKey(value:MerchantKeyScope):MerchantKeyHandle {
 const scope=parseScope(value),seed=crypto.getRandomValues(new Uint8Array(32));try{return make(scope,seed);}finally{seed.fill(0);}
}
export function merchantKeyBackupChecked(handle:MerchantKeyHandle):boolean{return keys.get(handle)?.checked===true;}
export function forgetMerchantKey(handle:MerchantKeyHandle):boolean {
 const value=keys.get(handle);if(!value)return false;value.checked=false;value.seed.fill(0);return keys.delete(handle);
}
export async function exportMerchantKey(handle:MerchantKeyHandle,password:string):Promise<MerchantKeyBackup> {
 const value=material(handle),plain=encoder.encode(JSON.stringify({version:'1',kind:'AgyionMerchantSigningKey',scope:handle.scope,publicKey:handle.publicKey,seed:Buffer.from(value.seed).toString('hex')}));
 try {
  const encrypted=await encryptBackup(plain,password,context(handle.scope,handle.publicKey));current(handle,value);
  return Object.freeze({version:'1',kind:'AgyionMerchantKeyBackup',scope:handle.scope,publicKey:handle.publicKey,encrypted});
 }finally{plain.fill(0);}
}
export async function restoreMerchantKey(file:File,password:string,scopeValue:MerchantKeyScope):Promise<MerchantKeyHandle> {
 const scope=parseScope(scopeValue),p=await selectedPacket(file,scope),seed=await decode(p,password);
 try{return make(scope,seed);}finally{seed.fill(0);}
}
export async function checkMerchantKeyBackup(handle:MerchantKeyHandle,file:File,password:string):Promise<true> {
 const value=material(handle),verification={};value.checked=false;value.verification=verification;
 const stillCurrent=()=>{current(handle,value);requireValue(value.verification===verification,'A newer merchant key backup check replaced this one.');};
 const p=await selectedPacket(file,handle.scope);stillCurrent();requireValue(p.publicKey===handle.publicKey,'This backup belongs to another merchant key.');
 const seed=await decode(p,password);
 try {stillCurrent();requireValue(Buffer.from(seed).equals(Buffer.from(value.seed)),'This backup has different key material.');value.checked=true;return true;}
 finally{seed.fill(0);}
}
/** No arbitrary-byte signing API: catalog metadata and scope are revalidated. */
export async function signPublication(handle:MerchantKeyHandle,value:Publication):Promise<string> {
 const material=signingMaterial(handle),verification=material.verification,p=parsePublication(value);sameScope(parseScope({networkId:p.networkId,contract:p.contract,seller:p.seller,keyEpoch:p.keyEpoch}),handle.scope);
 requireValue(await metadataHash(p.metadata)===p.metadataHash,'Publication metadata commitment differs.');current(handle,material);requireValue(material.checked&&material.verification===verification,'Merchant key backup verification changed.');
 return Keypair.fromRawEd25519Seed(Buffer.from(material.seed)).sign(Buffer.from(publicationBytes(p))).toString('hex');
}
/** The caller separately verifies the offer and merchant key against pinned RPC. */
export async function signPickup(handle:MerchantKeyHandle,value:MerchantPickupRequest):Promise<string> {
 const material=signingMaterial(handle),v=exact(value,Object.hasOwn(value,'leaseUntil')?['scope','action','receipt','leaseUntil']:['scope','action','receipt']);
 sameScope(parseScope(v.scope),handle.scope);requireValue(v.action==='walk-in'||v.action==='reserve'||v.action==='reserved');
 const receipt=v.receipt as PickupReceipt,bytes=pickupAuthorizationBytes(v.action,handle.scope.contract,receipt,v.leaseUntil as number|undefined);
 requireValue(receipt.key_epoch===handle.scope.keyEpoch,'Pickup merchant key epoch differs.');current(handle,material);
 return Keypair.fromRawEd25519Seed(Buffer.from(material.seed)).sign(Buffer.from(bytes)).toString('hex');
}
