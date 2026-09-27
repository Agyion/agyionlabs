import {afterEach,expect,it,vi} from 'vitest';
import {Account,Networks,SorobanDataBuilder,Transaction,TransactionBuilder,hash,rpc,xdr} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
import type {MarketAttempt,MarketJournal,MarketJournalEntry,MarketTerminal} from '../client/journal.ts';
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});
async function harness(){
 const f=await chainFixture();vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{schema:'agyion-public-fade-market-v1',network:'testnet',contract:f.contract,wasmHash:f.env.MARKET_WASM_HASH,rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[f.asset]}}));
 const {getMarketRelease}=await import('../client/release.ts'),{createMarketReader}=await import('../client/reader.ts'),{createMarketLifecycle}=await import('../client/lifecycle.ts');const release=getMarketRelease(),reader=createMarketReader(release,{fetch:(_u,i)=>f.fetcher(f.env.MARKET_RPC_URL,i),now:()=>f.now});
 const rows=new Map<string,MarketJournalEntry>(),order:string[]=[];let sessionId='one',signs=0,sends=0,confirmation=true,last:Transaction|null=null;
 const journal:MarketJournal={exclusive:async fn=>fn(),history:async()=>[...rows.values()],pending:async()=>[...rows.values()].filter(e=>!e.terminal).map(e=>e.attempt),get:async h=>rows.get(h)??null,byIntent:async id=>[...rows.values()].find(e=>e.attempt.kind==='transaction'&&e.attempt.intentId===id)??null,commit:async(a:MarketAttempt)=>{order.push('commit');rows.set(a.hash,{attempt:a,terminal:null});},finish:async(t:MarketTerminal)=>{const e=rows.get(t.hash)!;rows.set(t.hash,{...e,terminal:t});},close(){}};
 const hooks:{simulation?:(s:rpc.Api.SimulateTransactionSuccessResponse)=>void;sign?:(tx:Transaction)=>Transaction|void;send?:()=>void;fee?:()=>void;get?:(response:rpc.Api.RawGetTransactionResponse)=>rpc.Api.RawGetTransactionResponse;commit?:()=>void}={};
 const originalCommit=journal.commit;journal.commit=async a=>{await originalCommit(a);hooks.commit?.();};
 const wallet={session:()=>({id:sessionId,account:f.seller.publicKey(),networkPassphrase:Networks.TESTNET}),signTransaction:async(encoded:string)=>{signs++;let t=TransactionBuilder.fromXDR(encoded,Networks.TESTNET) as Transaction;t=hooks.sign?.(t)??t;t.sign(f.seller);return t.toXDR();}};
 const transport={getAccount:async()=>new Account(f.seller.publicKey(),'10'),getLatestLedger:async()=>({sequence:100}),simulateTransaction:async(tx:Transaction)=>{
  const op=tx.operations[0];if(op.type!=='invokeHostFunction')throw Error('test invocation');const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.func.invokeContract()),subInvocations:[]});
  const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root})];
  const merchant=xdr.ScVal.scvMap([new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol('epoch'),val:xdr.ScVal.scvU32(2)}),new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol('public_key'),val:xdr.ScVal.scvBytes(Buffer.from('ab'.repeat(32),'hex'))}),new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol('seller'),val:op.func.invokeContract().args()[0]})]);
  const s:rpc.Api.SimulateTransactionSuccessResponse={id:'synthetic',_parsed:true,latestLedger:100,events:[],transactionData:new SorobanDataBuilder().setResources(100,100,100).setResourceFee('300'),minResourceFee:'300',result:{auth,retval:merchant}};hooks.simulation?.(s);return s;
 },sendTransaction:async(tx:Transaction)=>{sends++;order.push('send');expect(rows.has(tx.hash().toString('hex'))).toBe(true);last=tx;hooks.send?.();return{hash:tx.hash().toString('hex'),status:'PENDING'};},getTransaction:async(h:string)=>{const server=new rpc.Server(release.rpcUrl);server._getTransaction=async()=>{const missing={status:'NOT_FOUND' as rpc.Api.GetTransactionStatus,txHash:h,latestLedger:100,latestLedgerCloseTime:1,oldestLedger:1,oldestLedgerCloseTime:1};return hooks.get?hooks.get(missing):missing;};return server.getTransaction(h);}};
 const client=createMarketLifecycle({release,reader,journal,wallet,transport,maxFeeStroops:'10000',confirmFee:async()=>{hooks.fee?.();return confirmation;}});
 return{...f,release,reader,journal,order,rows,hooks,client,transport,get signs(){return signs},get sends(){return sends},get last(){return last},changeSession(){sessionId+='x';},cancelFee(){confirmation=false;},command:{action:'register_merchant' as const,publicKey:'ab'.repeat(32),expectedEpoch:2}};
}
it('opaque draft, exact fee approval and durable commit precede one send; repeat stays query-only',async()=>{
 const h=await harness(),draft=await h.client.prepare(h.command);await expect(h.client.submit({...draft})).rejects.toThrow();const first=await h.client.submit(draft);expect(first.status).toBe('pending');expect(h.order).toEqual(['commit','send']);expect(h.signs).toBe(1);expect((await h.client.submit(draft)).hash).toBe(first.hash);expect(h.sends).toBe(1);
});
it('rejects fee refusal/overflow, extra auth and wallet/session mutation before a broadcast',async()=>{
 for(const kind of ['refusal','fee','auth','wallet','session']as const){const h=await harness();if(kind==='refusal')h.cancelFee();if(kind==='fee')h.hooks.simulation=s=>s.transactionData.setResourceFee('20000');if(kind==='auth')h.hooks.simulation=s=>s.result!.auth.push(s.result!.auth[0]);if(kind==='wallet')h.hooks.sign=t=>{const e=t.toEnvelope();e.v1().tx().operations([...e.v1().tx().operations(),...e.v1().tx().operations()]);return new Transaction(e,Networks.TESTNET);};if(kind==='session')h.hooks.fee=()=>h.changeSession();
 const draft=await h.client.prepare(h.command);await expect(h.client.submit(draft)).rejects.toThrow();expect(h.sends).toBe(0);if(kind!=='wallet')expect(h.signs).toBe(0);vi.resetModules();}
});
it('session loss after durable commit is known not sent; unknown send never creates a new hash',async()=>{
 const h=await harness(),d=await h.client.prepare(h.command);h.hooks.commit=()=>h.changeSession();expect((await h.client.submit(d)).status).toBe('known_not_sent');expect(h.sends).toBe(0);
 const n=await harness(),p=await n.client.prepare(n.command);n.hooks.send=()=>{throw Error('network reply lost');};const result=await n.client.submit(p);expect(result.status).toBe('pending');expect((await n.client.submit(p)).hash).toBe(result.hash);expect(n.signs).toBe(1);expect(n.sends).toBe(1);expect(()=>n.client.withFeeLimit(p,'50000')).toThrow();
});
it('fee budget can change only by a fresh explicit handle before signing; disposal blocks the pending fee approval',async()=>{
 const h=await harness();h.hooks.simulation=s=>s.transactionData.setResourceFee('20000');const draft=await h.client.prepare(h.command);
 await expect(h.client.submit(draft)).rejects.toMatchObject({message:'MARKET_FEE_BUDGET_EXCEEDED',feeStroops:'20100',maxFeeStroops:'10000'});expect(h.signs).toBe(0);
 const repriced=h.client.withFeeLimit(draft,'50000');expect(repriced.maxFeeStroops).toBe('50000');await expect(h.client.submit(draft)).rejects.toThrow('PREPARED_MARKET_OPERATION_REQUIRED');expect((await h.client.submit(repriced)).status).toBe('pending');expect(h.sends).toBe(1);
 const n=await harness(),d=await n.client.prepare(n.command);n.hooks.fee=()=>n.client.dispose();await expect(n.client.submit(d)).rejects.toThrow();expect(n.signs).toBe(0);expect(n.sends).toBe(0);
});
it('a second intent cannot sign around an unresolved source attempt, and storage failure prevents broadcasting',async()=>{
 const h=await harness(),a=await h.client.prepare(h.command),b=await h.client.prepare(h.command);await h.client.submit(a);await expect(h.client.submit(b)).rejects.toThrow('UNRESOLVED_MARKET_TRANSACTION');expect(h.signs).toBe(1);expect(h.sends).toBe(1);
 const n=await harness(),d=await n.client.prepare(n.command);n.journal.commit=async()=>{throw Error('synthetic storage failure');};await expect(n.client.submit(d)).rejects.toThrow('synthetic storage failure');expect(n.signs).toBe(1);expect(n.sends).toBe(0);
});
