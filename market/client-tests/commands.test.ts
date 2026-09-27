import {afterEach,expect,it,vi} from 'vitest';
import {Keypair} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
import {snapshotCommand,marketPrice} from '../client/commands.ts';
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});
it('snapshots exact public commands before asynchronous work and never executes getters',async()=>{
 const f=await chainFixture(),command={action:'create_offer' as const,terms:f.terms};const copy=snapshotCommand(command);command.terms.pot='9';expect(copy.action==='create_offer'&&copy.terms.pot).toBe('15000000');
 for(const bad of [{...command,seed:'x'},{action:'refund',offerId:'01'},{action:'register_merchant',publicKey:'00'.repeat(32),expectedEpoch:1},{action:'unknown'}])expect(()=>snapshotCommand(bad)).toThrow();
 let accessed=false;const value={action:'refund',offerId:'1'};Object.defineProperty(value,'offerId',{get(){accessed=true;return'1';},enumerable:true});expect(()=>snapshotCommand(value)).toThrow();expect(accessed).toBe(false);
});
it('uses exact bigint declining price and floors without floating-point loss',()=>{
 const terms={start_price:600n,floor_price:-150n,slope_num:3n,slope_den:2n};expect(marketPrice({terms,start_ledger:100},101)).toBe(599n);expect(marketPrice({terms,start_ledger:100},10000)).toBe(-150n);
});
it('requires actual registered epoch, eligible state and receipt owner before a draft',async()=>{
 const f=await chainFixture();vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{schema:'agyion-public-fade-market-v1',network:'testnet',contract:f.contract,wasmHash:f.env.MARKET_WASM_HASH,rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[f.asset]}}));
 const {getMarketRelease}=await import('../client/release.ts'),{createMarketReader}=await import('../client/reader.ts'),{planCommand}=await import('../client/commands.ts');const release=getMarketRelease(),reader=createMarketReader(release,{fetch:(_url,init)=>f.fetcher(f.env.MARKET_RPC_URL,init),now:()=>f.now});
 await expect(planCommand(snapshotCommand({action:'register_merchant',publicKey:'ab'.repeat(32),expectedEpoch:1}),f.seller.publicKey(),release,reader)).rejects.toThrow('MERCHANT_EPOCH_CHANGED');
 const draft=await planCommand(snapshotCommand({action:'create_offer',terms:f.terms}),f.seller.publicKey(),release,reader);expect(draft.summary.amount).toBe('15000000');expect(draft.summary.source).toBe(f.seller.publicKey());
 await expect(planCommand(snapshotCommand({action:'refund',offerId:'1'}),Keypair.random().publicKey(),release,reader)).rejects.toThrow('OFFER_NOT_REFUNDABLE');
});
