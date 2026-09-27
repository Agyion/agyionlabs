/** Public testnet marketplace UI boundary. Amounts are canonical smallest-unit strings. */
import type {OfferTerms,PickupReceipt,Publication} from '../shared/codec.ts';
import type {MarketAction,MarketJournalEntry,MarketRegistration} from './journal.ts';
import type {MarketQuery,CatalogListing,CurrentPublication} from './catalog.ts';
import type {MarketRead,MarketState} from './reader.ts';
import type {Merchant,Offer,ActiveSlot} from './spec.ts';
import type {PublicationOutcome} from './publication.ts';
export type {MarketRegistration} from './journal.ts';
export interface MarketWalletSession {readonly id:string;readonly account:string;readonly networkPassphrase:string}
export interface MarketWallet {session():MarketWalletSession;signTransaction(xdr:string,networkPassphrase:string,account:string):Promise<string>}
export type MarketCommand=
 |{action:'register_merchant';publicKey:string;expectedEpoch:number}
 |{action:'create_offer';terms:OfferTerms}
 |{action:'settle_walk_in';receipt:PickupReceipt;signature:string}
 |{action:'settle_reserved';receipt:PickupReceipt;signature:string}
 |{action:'reserve';receipt:PickupReceipt;leaseUntil:number;signature:string}
 |{action:'cancel_reservation';offerId:string;sequence:string}
 |{action:'expire_reservation';offerId:string}
 |{action:'refund';offerId:string};
export interface MarketSummary {
 readonly action:MarketAction;readonly source:string;readonly offerId:string|null;
 readonly asset:string|null;readonly amount:string|null;readonly seller:string|null;
 /** Only an estimate at the quoted ledger. The signed receipt bounds payment. */
 readonly price:string|null;readonly observedLedger:number;readonly quoteLedger:number|null;
}
/** Runtime WeakMap identity is required; copying this object cannot authorize submission. */
export interface PreparedMarketOperation {readonly id:string;readonly action:MarketAction;readonly summary:MarketSummary;readonly maxFeeStroops:string}
export interface MarketFeeConfirmation {readonly feeStroops:string;readonly maxFeeStroops:string;readonly source:string;readonly action:MarketAction;readonly signal:AbortSignal}
export interface MarketOutcome {
 readonly hash:string;readonly status:'pending'|'confirmed'|'failed'|'known_not_sent';readonly ledger:number|null;readonly offerId:string|null;
 /** Present only for validated confirmed registration; absent on legacy records. */
 readonly registration?:MarketRegistration;
}
export interface MarketProtocolOptions {wallet:MarketWallet;maxFeeStroops:string;confirmFee(value:MarketFeeConfirmation):Promise<boolean>}
export interface MarketProtocol {
 state():Promise<MarketState>;offer(id:string):Promise<MarketRead<Offer>>;
 merchant(seller:string):Promise<MarketRead<Merchant|null>>;active(seller:string,claimant:string):Promise<MarketRead<ActiveSlot|null>>;
 list(query?:MarketQuery,signal?:AbortSignal):Promise<{readonly records:readonly CatalogListing[];readonly next:string|null}>;
 detail(id:string,signal?:AbortSignal):Promise<CatalogListing>;
 currentPublication(id:string,signal?:AbortSignal):Promise<CurrentPublication>;
 prepare(command:MarketCommand):Promise<PreparedMarketOperation>;
 withFeeLimit(handle:PreparedMarketOperation,maxFeeStroops:string):PreparedMarketOperation;
 submit(handle:PreparedMarketOperation):Promise<MarketOutcome>;
 reconcile(hash:string):Promise<MarketOutcome>;
 /** Public immutable attempts and terminals. Includes accepted publication history for renewal. */
 history():Promise<readonly MarketJournalEntry[]>;
 pending():Promise<readonly MarketJournalEntry[]>;
 publish(publication:Publication,signature:string):Promise<PublicationOutcome>;
 reconcilePublication(digest:string):Promise<PublicationOutcome>;
 retryPublication(digest:string):Promise<PublicationOutcome>;
 dispose():void;
}
