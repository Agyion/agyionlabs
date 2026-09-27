import {afterEach,expect,it,vi} from 'vitest';
import {Networks,Keypair} from '@stellar/stellar-sdk';
import type {MarketOutcome,PreparedMarketOperation} from '../client/protocol-types.ts';
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/journal.ts');vi.doUnmock('../client/lifecycle.ts');});
it('factory disposal prevents new work but keeps storage open until an in-flight mutation records its outcome',async()=>{
 let complete!:(value:MarketOutcome)=>void;const inFlight=new Promise<MarketOutcome>(resolve=>{complete=resolve;}),close=vi.fn(),dispose=vi.fn();
 vi.doMock('../client/journal.ts',()=>({createMarketJournal:async()=>({close})}));
 vi.doMock('../client/lifecycle.ts',()=>({MarketFeeBudgetExceededError:Error,createMarketLifecycle:()=>({submit:()=>inFlight,dispose,prepare:vi.fn(),withFeeLimit:vi.fn(),reconcile:vi.fn()})}));
 const {createMarketProtocol}=await import('../client/protocol.ts');const account=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)).publicKey();const protocol=await createMarketProtocol({wallet:{session:()=>({id:'fixture',account,networkPassphrase:Networks.TESTNET}),signTransaction:async()=>{throw Error('No wallet allowed in disposal test');}},maxFeeStroops:'10000',confirmFee:async()=>false});
 const task=protocol.submit({} as PreparedMarketOperation);protocol.dispose();expect(dispose).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(()=>protocol.submit({} as PreparedMarketOperation)).toThrow('MARKET_SESSION_DISPOSED');
 complete({hash:'ab'.repeat(32),status:'known_not_sent',offerId:null,ledger:null});expect((await task).status).toBe('known_not_sent');await Promise.resolve();expect(close).toHaveBeenCalledOnce();protocol.dispose();expect(close).toHaveBeenCalledOnce();
});
