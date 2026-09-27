import type { OfferTerms, Publication } from '../shared/codec.ts';
export interface D1Statement { bind(...values:unknown[]):D1Statement; first<T=Record<string,unknown>>():Promise<T|null>; all<T=Record<string,unknown>>():Promise<{results:T[]}>; run():Promise<unknown> }
export interface D1Database { prepare(sql:string):D1Statement }
export interface RateLimiter { limit(options:{key:string}):Promise<{success:boolean}> }
export interface MarketEnv {
 DB:D1Database; READ_RATE:RateLimiter; WRITE_RATE:RateLimiter;
 MARKET_CONTRACT:string; MARKET_WASM_HASH:string; MARKET_RPC_URL:string; MARKET_ASSETS:string; ALLOWED_ORIGIN:string;
}
export interface ChainObservation {
 ledger:number; ledgerClosedAt:number; seller:string; merchantKey:string; keyEpoch:number;
 offerId:string; terms:OfferTerms; termsHash:string; state:number; startLedger:number; deadlineLedger:number;
}
export interface ChainReader { readOffer(offerId:string,seller:string):Promise<ChainObservation> }
export interface CatalogRecord {
 publication:Publication; signature:string; merchantKey:string; chain:ChainObservation;
 verifiedAt:number; authority:'catalog-only';
}
export class CatalogError extends Error {
 readonly status:number; readonly code:string;
 constructor(status:number,code:string){super(code);this.status=status;this.code=code;}
}
