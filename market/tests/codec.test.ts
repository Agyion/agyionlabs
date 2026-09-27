import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { parseMetadata, parsePublication, metadataHash, termsHash, publicationBytes, verifyPublication, TESTNET_NETWORK_ID } from '../shared/codec.ts';
const seller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
export const contract = StrKey.encodeContract(Buffer.alloc(32, 9));
export const metadata = {title:'Bread pickup',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery-01',shopName:'Local bakery',address:'Market Street 1',latE6:41000000,lonE6:29000000,pickupStart:1790500000,pickupEnd:1790503600,timezone:'Europe/Istanbul',accessibility:'Ground floor',imageHash:null};
export const terms = {asset:StrKey.encodeContract(Buffer.alloc(32,10)),pot:'15000000',start_price:'60000000',floor_price:'-15000000',slope_num:'100000',slope_den:'1',duration_ledgers:1000,lease_ledgers:12,metadata_hash:'00'.repeat(32)};
test('canonical XDR ignores object insertion order and binds metadata, signed scope and economics', async()=>{
 const mh=await metadataHash(metadata); const th=await termsHash({...terms,metadata_hash:mh});
 const p={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract,offerId:'1',seller:seller.publicKey(),keyEpoch:1,revision:1,termsHash:th,metadataHash:mh,issuedAt:1790500000,expiresAt:1790500300,nonce:'01'.repeat(32),metadata};
 const sig=seller.sign(Buffer.from(publicationBytes(parsePublication(p)))).toString('hex');
 assert.equal(await verifyPublication(parsePublication(p),sig,seller.rawPublicKey().toString('hex')),true);
 assert.equal(await verifyPublication(parsePublication({...p,offerId:'2'}),sig,seller.rawPublicKey().toString('hex')),false);
 assert.equal(await metadataHash(Object.fromEntries(Object.entries(metadata).reverse())),mh);
 assert.notEqual(await termsHash({...terms,metadata_hash:mh,start_price:'60000001'}),th);
 assert.notEqual(await metadataHash({...metadata,latE6:41000001}),mh);
});
test('rejects hidden private fields, HTML, control text, floats, geographic overflow and URL image references',()=>{
 for(const value of [{...metadata,credential:'secret'},{...metadata,title:'<script>boom</script>'},{...metadata,address:'a\u202eb'},{...metadata,latE6:41.1},{...metadata,lonE6:180000001},{...metadata,imageHash:'https://example.test/image'},{...metadata,pickupEnd:metadata.pickupStart},{...metadata,title:'a'.repeat(121)}]) assert.throws(()=>parseMetadata(value));
});
test('exact publication rejects unsafe numbers, alternate decimal/hex, foreign network and extra fields',async()=>{
 const p={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract,offerId:'1',seller:seller.publicKey(),keyEpoch:1,revision:1,termsHash:'11'.repeat(32),metadataHash:await metadataHash(metadata),issuedAt:1790500000,expiresAt:1790500300,nonce:'01'.repeat(32),metadata};
 for(const value of [{...p,privateKey:'no'},{...p,networkId:'ff'.repeat(32)},{...p,offerId:'01'},{...p,offerId:'18446744073709551616'},{...p,keyEpoch:0},{...p,revision:1.1},{...p,nonce:'AA'.repeat(32)},{...p,nonce:'00'.repeat(32)},{...p,expiresAt:p.issuedAt+3601}]) assert.throws(()=>parsePublication(value));
});
test('pickup receipt, reservation permit and reserved settlement have distinct purpose and exact domain binding',async()=>{
 const {pickupAuthorizationBytes,receiptBytes}=await import('../shared/codec.ts');
 const receipt={offer_id:'1',claimant:seller.publicKey(),terms_hash:'2b'.repeat(32),key_epoch:1,sequence:'1',valid_from:100,valid_until:112,max_price:'-15000000',nonce:'03'.repeat(32)};
 const walk=pickupAuthorizationBytes('walk-in',contract,receipt),reserved=pickupAuthorizationBytes('reserved',contract,receipt),permit=pickupAuthorizationBytes('reserve',contract,receipt,120);
 const signature=seller.sign(Buffer.from(walk));assert.equal(seller.verify(Buffer.from(walk),signature),true);
 for(const value of [reserved,permit,pickupAuthorizationBytes('walk-in',StrKey.encodeContract(Buffer.alloc(32,8)),receipt),pickupAuthorizationBytes('walk-in',contract,{...receipt,sequence:'2'}),pickupAuthorizationBytes('walk-in',contract,{...receipt,max_price:'0'})])assert.equal(seller.verify(Buffer.from(value),signature),false);
 assert.throws(()=>receiptBytes({...receipt,valid_until:113}));assert.throws(()=>pickupAuthorizationBytes('reserved',contract,receipt,120));assert.throws(()=>receiptBytes({...receipt,nonce:'00'.repeat(32)}));
});
