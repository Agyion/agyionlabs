import {afterEach,expect,it,vi} from 'vitest';
import {Keypair,xdr} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
import {pickupAuthorizationBytes} from '../shared/codec.ts';
import type {PickupReceipt} from '../shared/codec.ts';
import type {Offer} from '../client/spec.ts';
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});
async function setup(){
 const f=await chainFixture();let ledger=100;vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{schema:'agyion-public-fade-market-v1',network:'testnet',contract:f.contract,wasmHash:f.env.MARKET_WASM_HASH,rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[f.asset]}}));
 const {getMarketRelease}=await import('../client/release.ts'),{createMarketReader}=await import('../client/reader.ts'),{marketSpec}=await import('../client/spec.ts'),{planCommand,snapshotCommand}=await import('../client/commands.ts');const release=getMarketRelease();
 const fetcher:typeof fetch=async(_u,i)=>{const response=await f.fetcher(f.env.MARKET_RPC_URL,i),json=await response.json(),method=JSON.parse(String(i?.body)).method;if(method==='getLatestLedger')json.result.sequence=ledger;if(method==='getLedgerEntries')json.result.latestLedger=ledger;return Response.json(json);};
 const reader=createMarketReader(release,{fetch:fetcher,now:()=>f.now}),buyer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,8)),type=xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'Offer'}));
 const offer=(await reader.offer('1')).value;function save(){f.data(f.offerKey,marketSpec.nativeToScVal(offer,type));for(const row of f.entries.values())row.liveUntilLedgerSeq=2000;}
 const receipt:PickupReceipt={offer_id:'1',claimant:buyer.publicKey(),terms_hash:offer.terms_hash.toString('hex'),key_epoch:1,sequence:'1',valid_from:100,valid_until:112,max_price:'60000000',nonce:'ab'.repeat(32)};
 const sign=(action:'walk-in'|'reserve'|'reserved',r=receipt)=>f.seller.sign(Buffer.from(pickupAuthorizationBytes(action,f.contract,r,action==='reserve'?110:undefined))).toString('hex');
 const plan=(command:unknown,source=buyer.publicKey())=>planCommand(snapshotCommand(command),source,release,reader);
 return{...f,reader,offer,save,buyer,receipt,sign,plan,setLedger(n:number){ledger=n;for(const row of f.entries.values())row.liveUntilLedgerSeq=2000;}};
}
it('walk-in keeps the signed quote price across ledger movement and rejects before-start/expired/wrong-owner receipts',async()=>{
 const f=await setup(),command={action:'settle_walk_in',receipt:f.receipt,signature:f.sign('walk-in')};const first=await f.plan(command);f.setLedger(102);const later=await f.plan(command);expect(first.summary.price).toBe('59000000');expect(later.summary.price).toBe(first.summary.price);expect(later.summary.quoteLedger).toBe(100);expect(later.summary.observedLedger).toBe(102);
 await expect(f.plan(command,f.seller.publicKey())).rejects.toThrow('RECEIPT_OWNER_MISMATCH');
 const before={...f.receipt,valid_from:89,valid_until:101};await expect(f.plan({...command,receipt:before,signature:f.sign('walk-in',before)})).rejects.toThrow('RECEIPT_PREDATES_OFFER');f.setLedger(113);await expect(f.plan(command)).rejects.toThrow('RECEIPT_EXPIRED');
});
it('reserve authorizes a bounded lease without token payment; reserved settlement and cancel bind the exact claimant and stored key',async()=>{
 const f=await setup();const reserved=await f.plan({action:'reserve',receipt:f.receipt,leaseUntil:110,signature:f.sign('reserve')});expect(reserved.summary.amount).toBeNull();
 f.offer.state=1;f.offer.sequence=1n;f.offer.reservation={tag:'Active',values:[{claimant:f.buyer.publicKey(),claimed_at:100,lease_until:110,merchant:{seller:f.seller.publicKey(),public_key:f.seller.rawPublicKey(),epoch:1},price:59000000n,sequence:1n}]};f.save();
 // Rotation does not replace the authenticated key embedded in an existing lease.
 const row=f.entries.get(f.merchantKey.toXDR('base64'))!,data=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');data.contractData().val().map()!.find(r=>r.key().sym().toString()==='epoch')!.val(xdr.ScVal.scvU32(2));row.xdr=data.toXDR('base64');f.setLedger(105);
 expect((await f.plan({action:'settle_reserved',receipt:f.receipt,signature:f.sign('reserved')})).summary.price).toBe('59000000');
 expect((await f.plan({action:'cancel_reservation',offerId:'1',sequence:'1'})).command.action).toBe('cancel_reservation');await expect(f.plan({action:'cancel_reservation',offerId:'1',sequence:'0'})).rejects.toThrow('RESERVATION_OWNER_OR_SEQUENCE_CHANGED');
 f.setLedger(111);expect((await f.plan({action:'expire_reservation',offerId:'1'})).command.action).toBe('expire_reservation');await expect(f.plan({action:'settle_reserved',receipt:f.receipt,signature:f.sign('reserved')})).rejects.toThrow('RESERVATION_OWNER_OR_WINDOW');
});
it('refund is permissionless only after the offer and any active lease have both ended',async()=>{
 const f=await setup();await expect(f.plan({action:'refund',offerId:'1'})).rejects.toThrow('OFFER_NOT_REFUNDABLE');f.setLedger(1091);expect((await f.plan({action:'refund',offerId:'1'})).summary.amount).toBe('15000000');
 f.offer.state=1;f.offer.reservation={tag:'Active',values:[{claimant:f.buyer.publicKey(),claimed_at:1089,lease_until:1100,merchant:{seller:f.seller.publicKey(),public_key:f.seller.rawPublicKey(),epoch:1},price:0n,sequence:1n}]};f.save();await expect(f.plan({action:'refund',offerId:'1'})).rejects.toThrow('OFFER_NOT_REFUNDABLE');f.setLedger(1101);expect((await f.plan({action:'refund',offerId:'1'})).command.action).toBe('refund');
});
