/** Action-bound public intents. A catalog response is never the authority here. */
import {Address,StrKey,hash,xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {address,decimal,exact,hex32,pickupAuthorizationBytes,receiptBytes,requireValue,termsBytes,uint32} from '../shared/codec.ts';
import type {OfferTerms as PublicTerms,PickupReceipt as PublicReceipt} from '../shared/codec.ts';
import type {MarketCommand,MarketSummary} from './protocol-types.ts';
import type {MarketRelease} from './release.ts';
import type {MarketReader} from './reader.ts';
import type {Merchant,Offer,OfferTerms} from './spec.ts';
import {marketSpec} from './spec.ts';
const id=(value:unknown)=>{const n=decimal(value);requireValue(BigInt(n)>0n,'INVALID_OFFER_ID');return n;};
const nonzero=(value:unknown)=>{const h=hex32(value);requireValue(h!=='00'.repeat(32));return h;};
function own(value:unknown,keys:readonly string[]){requireValue(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length);return exact(value,keys);}
function terms(value:unknown):PublicTerms {
 const t=own(value,['asset','pot','start_price','floor_price','slope_num','slope_den','duration_ledgers','lease_ledgers','metadata_hash']);
 const r={asset:address(t.asset,true),pot:decimal(t.pot,128,true),start_price:decimal(t.start_price,128,true),floor_price:decimal(t.floor_price,128,true),slope_num:decimal(t.slope_num,128,true),slope_den:decimal(t.slope_den,128,true),duration_ledgers:uint32(t.duration_ledgers,1),lease_ledgers:uint32(t.lease_ledgers),metadata_hash:nonzero(t.metadata_hash)};
 requireValue(BigInt(r.pot)>0n&&BigInt(r.start_price)>=BigInt(r.floor_price)&&BigInt(r.floor_price)>=-BigInt(r.pot)&&BigInt(r.slope_num)>=0n&&BigInt(r.slope_den)>0n&&r.duration_ledgers<=1000000&&r.lease_ledgers<=720,'INVALID_OFFER_TERMS');return Object.freeze(r);
}
function receipt(value:unknown):PublicReceipt {
 const v=own(value,['offer_id','claimant','terms_hash','key_epoch','sequence','valid_from','valid_until','max_price','nonce']);
 const r={offer_id:id(v.offer_id),claimant:address(v.claimant),terms_hash:hex32(v.terms_hash),key_epoch:uint32(v.key_epoch,1),sequence:decimal(v.sequence),valid_from:uint32(v.valid_from,1),valid_until:uint32(v.valid_until,1),max_price:decimal(v.max_price,128,true),nonce:nonzero(v.nonce)};
 receiptBytes(r);return Object.freeze(r);
}
export function snapshotCommand(value:unknown):MarketCommand {
 requireValue(value&&typeof value==='object');const action=Object.getOwnPropertyDescriptor(value,'action')?.value;
 if(action==='register_merchant'){const v=own(value,['action','publicKey','expectedEpoch']);return Object.freeze({action,publicKey:nonzero(v.publicKey),expectedEpoch:uint32(v.expectedEpoch,1)});}
 if(action==='create_offer'){const v=own(value,['action','terms']);return Object.freeze({action,terms:terms(v.terms)});}
 if(action==='settle_walk_in'||action==='settle_reserved'||action==='reserve'){
  const v=own(value,['action','receipt','signature',...(action==='reserve'?['leaseUntil']:[])]);requireValue(typeof v.signature==='string'&&/^[0-9a-f]{128}$/.test(v.signature));
  return Object.freeze(action==='reserve'?{action,receipt:receipt(v.receipt),signature:v.signature,leaseUntil:uint32(v.leaseUntil,1)}:{action,receipt:receipt(v.receipt),signature:v.signature});
 }
 if(action==='cancel_reservation'){const v=own(value,['action','offerId','sequence']);return Object.freeze({action,offerId:id(v.offerId),sequence:decimal(v.sequence)});}
 requireValue(action==='expire_reservation'||action==='refund','INVALID_MARKET_ACTION');const v=own(value,['action','offerId']);return Object.freeze({action,offerId:id(v.offerId)});
}
export function marketPrice(o:{terms:Pick<OfferTerms,'start_price'|'floor_price'|'slope_num'|'slope_den'>;start_ledger:number},ledger:number):bigint {
 uint32(ledger,1);const p=o.terms.start_price-o.terms.slope_num*BigInt(Math.max(0,ledger-o.start_ledger))/o.terms.slope_den;return p<o.terms.floor_price?o.terms.floor_price:p;
}
export interface MarketPlan {command:MarketCommand;args:xdr.ScVal[];summary:MarketSummary;snapshotId:string;offer:Offer|null;merchant:Merchant|null;minLedger:number;maxLedger:number}
export async function planCommand(command:MarketCommand,source:string,release:MarketRelease,reader:MarketReader):Promise<MarketPlan>{
 requireValue(StrKey.isValidEd25519PublicKey(source),'STANDARD_TESTNET_ACCOUNT_REQUIRED');const c=command,checkpoints:string[]=[];let ledger=0,offer:Offer|null=null,merchant:Merchant|null=null,args:Record<string,unknown>,amount:string|null=null,price:string|null=null,asset:string|null=null,seller:string|null=null,offerId:string|null=null,minLedger=0,maxLedger=0xfffffffe,quoteLedger:number|null=null;
 const readMerchant=async(who:string)=>{const r=await reader.merchant(who);checkpoints.push(r.snapshotId);ledger=Math.max(ledger,r.ledger);return r.value;};
 if(c.action==='register_merchant'){
  merchant=await readMerchant(source);requireValue((merchant?.epoch??0)+1===c.expectedEpoch,'MERCHANT_EPOCH_CHANGED');args={seller:source,public_key:Buffer.from(c.publicKey,'hex')};seller=source;
 }else if(c.action==='create_offer'){
  requireValue(release.assets.includes(c.terms.asset),'UNKNOWN_MARKET_ASSET');merchant=await readMerchant(source);requireValue(merchant,'MERCHANT_REGISTRATION_REQUIRED');
  requireValue(ledger+c.terms.duration_ledgers+c.terms.lease_ledgers+1<=0xffffffff,'OFFER_WINDOW_OVERFLOW');
  args={seller:source,terms:marketSpec.scValToNative(xdr.ScVal.fromXDR(Buffer.from(termsBytes(c.terms))),xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'OfferTerms'})))};amount=c.terms.pot;asset=c.terms.asset;seller=source;
 }else{
  offerId='receipt'in c?c.receipt.offer_id:c.offerId;const read=await reader.offer(offerId);offer=read.value;ledger=read.ledger;checkpoints.push(read.snapshotId);asset=offer.terms.asset;seller=offer.seller;price=marketPrice(offer,ledger).toString();
  if(c.action==='refund'){
   requireValue((offer.state===0||offer.state===1)&&ledger>offer.deadline_ledger&&(offer.reservation.tag==='Empty'||ledger>offer.reservation.values[0].lease_until),'OFFER_NOT_REFUNDABLE');args={offer_id:BigInt(offerId)};amount=offer.terms.pot.toString();
  }else if(c.action==='expire_reservation'){
   requireValue(offer.state===1&&offer.reservation.tag==='Active'&&ledger>offer.reservation.values[0].lease_until,'RESERVATION_NOT_EXPIRED');args={offer_id:BigInt(offerId)};
  }else if(c.action==='cancel_reservation'){
   requireValue(offer.state===1&&offer.reservation.tag==='Active'&&offer.reservation.values[0].claimant===source&&offer.reservation.values[0].sequence===BigInt(c.sequence),'RESERVATION_OWNER_OR_SEQUENCE_CHANGED');args={offer_id:BigInt(offerId),claimant:source,sequence:BigInt(c.sequence)};
  }else{
   const r=c.receipt;requireValue(r.claimant===source&&source!==seller&&source!==release.contract&&source!==asset,'RECEIPT_OWNER_MISMATCH');requireValue(r.terms_hash===offer.terms_hash.toString('hex'),'RECEIPT_TERMS_MISMATCH');requireValue(r.valid_from>=offer.start_ledger,'RECEIPT_PREDATES_OFFER');minLedger=r.valid_from;maxLedger=r.valid_until;
   let sequence=BigInt(offer.sequence)+1n,currentPrice=marketPrice(offer,c.action==='settle_walk_in'?r.valid_from:ledger);quoteLedger=c.action==='settle_walk_in'?r.valid_from:ledger;
   if(c.action==='settle_reserved'){
    requireValue(offer.state===1&&offer.reservation.tag==='Active','RESERVATION_REQUIRED');const reservation=offer.reservation.values[0];requireValue(reservation.claimant===source&&ledger<=reservation.lease_until,'RESERVATION_OWNER_OR_WINDOW');merchant=reservation.merchant;sequence=reservation.sequence;currentPrice=reservation.price;quoteLedger=reservation.claimed_at;maxLedger=Math.min(maxLedger,reservation.lease_until);
   }else{
    requireValue(offer.state===0&&ledger<=offer.deadline_ledger,'OFFER_NOT_OPEN');merchant=await readMerchant(seller);requireValue(merchant,'MERCHANT_REGISTRATION_REQUIRED');maxLedger=Math.min(maxLedger,offer.deadline_ledger);
   }
   requireValue(merchant.epoch===r.key_epoch&&sequence===BigInt(r.sequence),'RECEIPT_KEY_OR_SEQUENCE_CHANGED');requireValue(ledger>=minLedger&&ledger<=maxLedger,'RECEIPT_EXPIRED');requireValue(currentPrice<=BigInt(r.max_price),'PRICE_EXCEEDS_RECEIPT');price=currentPrice.toString();amount=price;
   const action=c.action==='reserve'?'reserve':c.action==='settle_reserved'?'reserved':'walk-in';const publicKey=await crypto.subtle.importKey('raw',Uint8Array.from(merchant.public_key),'Ed25519',false,['verify']);
   requireValue(await crypto.subtle.verify('Ed25519',publicKey,Uint8Array.from(Buffer.from(c.signature,'hex')),Uint8Array.from(pickupAuthorizationBytes(action,release.contract,r,c.action==='reserve'?c.leaseUntil:undefined))),'INVALID_MERCHANT_SIGNATURE');
   const receiptValue=marketSpec.scValToNative(xdr.ScVal.fromXDR(Buffer.from(receiptBytes(r))),xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'PickupReceipt'})));
   if(c.action==='reserve'){
    requireValue(offer.terms.lease_ledgers>0&&c.leaseUntil>ledger&&c.leaseUntil<=ledger+offer.terms.lease_ledgers,'INVALID_LEASE_WINDOW');const slot=await reader.active(seller,source);checkpoints.push(slot.snapshotId);requireValue(!slot.value||slot.ledger>slot.value.lease_until,'ACTIVE_MERCHANT_RESERVATION');
    args={permit:{receipt:receiptValue,lease_until:c.leaseUntil},signature:Buffer.from(c.signature,'hex')};amount=null;
   }else args={receipt:receiptValue,signature:Buffer.from(c.signature,'hex')};
  }
 }
 const summary=Object.freeze({action:c.action,source,offerId,asset,amount,seller,price,observedLedger:ledger,quoteLedger});
 return {command:c,args:marketSpec.funcArgsToScVals(c.action,args),summary,snapshotId:hash(Buffer.from(checkpoints.join('|'))).toString('hex'),offer,merchant,minLedger:Math.max(minLedger,ledger),maxLedger:Math.min(maxLedger,ledger+24)};
}
