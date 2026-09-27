import {expect,it} from 'vitest';
import {Keypair,StrKey,hash} from '@stellar/stellar-sdk';
import {snapshotMarketAttempt,marketReservationKeys,createMarketJournal} from '../client/journal.ts';
import type {MarketTransactionAttempt} from '../client/journal.ts';
const source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)).publicKey(),contract=StrKey.encodeContract(Buffer.alloc(32,9));
const attempt:MarketTransactionAttempt={version:1,kind:'transaction',intentId:'11'.repeat(32),releaseId:'22'.repeat(32),contract,source,action:'create_offer',hash:'33'.repeat(32),sequence:'101',callHash:'44'.repeat(32)};
it('immutable public journal records reject extra secrets, malformed sequence and incompatible methods',()=>{
 const copy=snapshotMarketAttempt(attempt);expect(copy).toEqual(attempt);expect(Object.isFrozen(copy)).toBe(true);
 for(const patch of [{seed:'secret'},{sequence:'01'},{sequence:'9223372036854775808'},{action:'submit'},{source:contract},{hash:'00'.repeat(32)}])expect(()=>snapshotMarketAttempt({...attempt,...patch})).toThrow();
 let invoked=false;const poison={...attempt};Object.defineProperty(poison,'hash',{enumerable:true,get(){invoked=true;return attempt.hash;}});expect(()=>snapshotMarketAttempt(poison)).toThrow();expect(invoked).toBe(false);
});
it('all pending market operations for the same source conflict across releases and contracts',()=>{
 const keys=marketReservationKeys(attempt),other=marketReservationKeys({...attempt,releaseId:'55'.repeat(32),contract:StrKey.encodeContract(Buffer.alloc(32,10)),intentId:'66'.repeat(32),hash:'77'.repeat(32)});
 expect(keys.filter(k=>other.includes(k))).toEqual([`testnet:source:${source}`]);
});
it('durable storage and cross-tab lock support are mandatory, without localStorage or memory fallback',async()=>{
 await expect(createMarketJournal()).rejects.toThrow('DURABLE_MARKET_STORAGE_REQUIRED');
 await expect(createMarketJournal({name:'../bad'})).rejects.toThrow();
});
