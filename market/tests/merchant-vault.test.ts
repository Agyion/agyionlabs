import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
import {createMerchantKey,exportMerchantKey,restoreMerchantKey,checkMerchantKeyBackup,forgetMerchantKey,merchantKeyBackupChecked,signPublication,signPickup,MAX_MERCHANT_KEY_FILE_BYTES} from '../client/merchant-vault.ts';
import {TESTNET_NETWORK_ID,metadataHash,publicationBytes,pickupAuthorizationBytes} from '../shared/codec.ts';
import type {Publication,PickupReceipt} from '../shared/codec.ts';
import {encryptBackup} from '../client/backup-bridge.mjs';
const password='local merchant backup password 2026';
const scope={networkId:TESTNET_NETWORK_ID,contract:StrKey.encodeContract(Buffer.alloc(32,21)),seller:Keypair.fromRawEd25519Seed(Buffer.alloc(32,22)).publicKey(),keyEpoch:1};
const file=(packet:unknown)=>new File([JSON.stringify(packet)],'merchant-key.json',{type:'application/json'});
const receipt:PickupReceipt={offer_id:'9',claimant:Keypair.fromRawEd25519Seed(Buffer.alloc(32,23)).publicKey(),terms_hash:'31'.repeat(32),key_epoch:1,sequence:'1',valid_from:100,valid_until:110,max_price:'-150',nonce:'32'.repeat(32)};
async function publication():Promise<Publication>{
 const metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery',shopName:'Bakery',address:'Market Street',latE6:41000000,lonE6:29000000,pickupStart:1790500000,pickupEnd:1790503600,timezone:'Europe/Istanbul',accessibility:'',imageHash:null};
 return {version:1,action:'publish-offer',...scope,offerId:'9',revision:1,termsHash:'31'.repeat(32),metadataHash:await metadataHash(metadata),issuedAt:1790500000,expiresAt:1790500300,nonce:'32'.repeat(32),metadata};
}

test('opaque key requires an actual decrypted backup check, then signs only the scoped catalog and receipt purposes',async()=>{
 const handle=createMerchantKey(scope),p=await publication();
 assert.deepEqual(Object.keys(handle).sort(),['kind','publicKey','scope']);assert.ok(Object.isFrozen(handle)&&Object.isFrozen(handle.scope));
 assert.equal(merchantKeyBackupChecked(handle),false);
 await assert.rejects(()=>signPublication(handle,p),/backup/i);
 await assert.rejects(()=>signPickup(handle,{scope,action:'walk-in',receipt}),/backup/i);
 const packet=await exportMerchantKey(handle,password);assert.equal(merchantKeyBackupChecked(handle),false);
 assert.equal(/"seed"|"privateKey"|"password"/.test(JSON.stringify(packet)),false);
 await assert.rejects(()=>checkMerchantKeyBackup(handle,packet as unknown as File,password),/file/i);
 await checkMerchantKeyBackup(handle,file(packet),password);assert.equal(merchantKeyBackupChecked(handle),true);
 const key=Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(handle.publicKey,'hex')));
 assert.equal(key.verify(Buffer.from(publicationBytes(p)),Buffer.from(await signPublication(handle,p),'hex')),true);
 for(const action of ['walk-in','reserve','reserved'] as const){
  const leaseUntil=action==='reserve'?115:undefined;
  const signature=await signPickup(handle,{scope,action,receipt,...(leaseUntil===undefined?{}:{leaseUntil})});
  assert.equal(key.verify(Buffer.from(pickupAuthorizationBytes(action,scope.contract,receipt,leaseUntil)),Buffer.from(signature,'hex')),true);
  if(action!=='reserve')assert.equal(key.verify(Buffer.from(pickupAuthorizationBytes('reserve',scope.contract,receipt,115)),Buffer.from(signature,'hex')),false);
 }
 await assert.rejects(()=>signPublication(handle,{...p,metadata:{...p.metadata,title:'Changed'}}));
 for(const mismatch of [{seller:Keypair.random().publicKey()},{keyEpoch:2},{contract:StrKey.encodeContract(Buffer.alloc(32,24))},{networkId:'ff'.repeat(32)}]){
  await assert.rejects(()=>signPublication(handle,{...p,...mismatch}));
  await assert.rejects(()=>signPickup(handle,{scope:{...scope,...mismatch},action:'walk-in',receipt}));
 }
 await assert.rejects(()=>signPickup(handle,{scope,action:'walk-in',receipt:{...receipt,key_epoch:2}}));
 await assert.rejects(()=>signPickup({...handle} as typeof handle,{scope,action:'walk-in',receipt}));
 const pendingSignature=signPublication(handle,p);forgetMerchantKey(handle);await assert.rejects(()=>pendingSignature);assert.equal(merchantKeyBackupChecked(handle),false);
 await assert.rejects(()=>signPublication(handle,p));
});

test('restore checks encrypted scope and key material, requires reselection, and never treats wrong password as an empty vault',async()=>{
 const original=createMerchantKey(scope),packet=await exportMerchantKey(original,password),selected=file(packet);
 for(const expected of [{...scope,keyEpoch:2},{...scope,seller:Keypair.random().publicKey()},{...scope,contract:StrKey.encodeContract(Buffer.alloc(32,25))}])await assert.rejects(()=>restoreMerchantKey(selected,password,expected));
 await assert.rejects(()=>restoreMerchantKey(selected,'incorrect but long password',scope));
 const restored=await restoreMerchantKey(selected,password,scope);assert.equal(restored.publicKey,original.publicKey);assert.equal(merchantKeyBackupChecked(restored),false);
 await checkMerchantKeyBackup(restored,selected,password);assert.equal(merchantKeyBackupChecked(restored),true);
 const changed={...packet,encrypted:{...packet.encrypted,ciphertext:(packet.encrypted.ciphertext[0]==='0'?'1':'0')+packet.encrypted.ciphertext.slice(1)}};
 await assert.rejects(()=>checkMerchantKeyBackup(restored,file(changed),password));assert.equal(merchantKeyBackupChecked(restored),false);
 forgetMerchantKey(original);forgetMerchantKey(restored);
});

test('rotation and unrelated backup cannot authorize another handle even under identical scope',async()=>{
 const first=createMerchantKey(scope),second=createMerchantKey(scope),packet=await exportMerchantKey(first,password);
 assert.notEqual(first.publicKey,second.publicKey);await assert.rejects(()=>checkMerchantKeyBackup(second,file(packet),password));assert.equal(merchantKeyBackupChecked(second),false);
 const rotated=createMerchantKey({...scope,keyEpoch:2});await assert.rejects(()=>checkMerchantKeyBackup(rotated,file(packet),password));
 forgetMerchantKey(first);forgetMerchantKey(second);forgetMerchantKey(rotated);
});

test('authenticated imported plaintext cannot impersonate a different public key',async()=>{
 const handle=createMerchantKey(scope),packet=await exportMerchantKey(handle,password);
 const payload=new TextEncoder().encode(JSON.stringify({version:'1',kind:'AgyionMerchantSigningKey',scope,publicKey:handle.publicKey,seed:'01'.repeat(32)}));
 const encrypted=await encryptBackup(payload,password,packet.encrypted.context);payload.fill(0);
 await assert.rejects(()=>restoreMerchantKey(file({...packet,encrypted}),password,scope),/public key|material/i);
 forgetMerchantKey(handle);
});

test('authenticated malformed private plaintext never escapes through a JSON parser error',async()=>{
 const handle=createMerchantKey(scope),packet=await exportMerchantKey(handle,password);
 const marker='LOCAL_KEY_MATERIAL_DO_NOT_ECHO',plain=new TextEncoder().encode(marker+' is not JSON');
 const encrypted=await encryptBackup(plain,password,packet.encrypted.context);plain.fill(0);
 await assert.rejects(()=>restoreMerchantKey(file({...packet,encrypted}),password,scope),error=>error instanceof Error&&!error.message.includes(marker)&&error.message==='Merchant key backup material is invalid.');
 forgetMerchantKey(handle);
});

test('forget during export or check cannot resurrect or return an authorized signing handle',async()=>{
 const h=createMerchantKey(scope);const pending=exportMerchantKey(h,password);forgetMerchantKey(h);await assert.rejects(()=>pending);
 const original=createMerchantKey(scope),packet=await exportMerchantKey(original,password);
 const checking=checkMerchantKeyBackup(original,file(packet),password);forgetMerchantKey(original);await assert.rejects(()=>checking);assert.equal(merchantKeyBackupChecked(original),false);
});

test('an older successful check cannot reopen the key after a newer failed file check',async()=>{
 const handle=createMerchantKey(scope),packet=await exportMerchantKey(handle,password);
 const old=checkMerchantKeyBackup(handle,file(packet),password);
 await assert.rejects(()=>checkMerchantKeyBackup(handle,new File(['{}'],'invalid'),password));
 await assert.rejects(()=>old);assert.equal(merchantKeyBackupChecked(handle),false);forgetMerchantKey(handle);
});

test('bounds genuine File input and rejects malformed packets, accessor objects and weak passwords',async()=>{
 const h=createMerchantKey(scope);
 for(const value of [{size:1,arrayBuffer:async()=>new Uint8Array().buffer},new File(['x'.repeat(MAX_MERCHANT_KEY_FILE_BYTES+1)],'large'),new File([new Uint8Array([255])],'bad-utf8'),new File(['{}'],'empty')])await assert.rejects(()=>restoreMerchantKey(value as File,password,scope));
 await assert.rejects(()=>exportMerchantKey(h,'short'));
 assert.throws(()=>createMerchantKey({...scope,get keyEpoch():number{throw new Error('getter executed');}}),error=>error instanceof Error&&error.message!=='getter executed');
 assert.throws(()=>createMerchantKey({...scope,networkId:'00'.repeat(32)}));forgetMerchantKey(h);
});
