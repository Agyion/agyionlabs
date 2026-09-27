import {afterEach,expect,it,vi} from 'vitest';
import {xdr} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
const opened:unknown[]=[];
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');opened.length=0;});
async function setup(){const f=await chainFixture();vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{schema:'agyion-public-fade-market-v1',network:'testnet',contract:f.contract,wasmHash:f.env.MARKET_WASM_HASH,rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[f.asset]}}));
 const {getMarketRelease}=await import('../client/release.ts'),{createMarketReader,assertMarketReader}=await import('../client/reader.ts');
 const fetcher:typeof fetch=(_url,init)=>{expect(init?.redirect).toBe('error');return f.fetcher(f.env.MARKET_RPC_URL,init);};const release=getMarketRelease(),reader=createMarketReader(release,{fetch:fetcher,now:()=>f.now});return {...f,release,reader,createMarketReader,assertMarketReader};
}
it('decodes actual contract spec and branded release; exposes no fake default for missing funded offers',async()=>{
 const f=await setup();expect(()=>f.assertMarketReader(f.reader,f.release)).not.toThrow();expect(()=>f.assertMarketReader({...f.reader},f.release)).toThrow();
 const state=await f.reader.state();expect(state.count).toBe(1n);expect(state.config.assets).toEqual([f.asset]);expect(Object.isFrozen(state.config.assets)).toBe(true);
 const offer=await f.reader.offer('1');expect(offer.value.terms.floor_price).toBe(-15000000n);expect(offer.value.reservation.tag).toBe('Empty');expect((await f.reader.merchant(f.seller.publicKey())).value?.epoch).toBe(1);
 f.entries.delete(f.offerKey.toXDR('base64'));await expect(f.reader.offer('1')).rejects.toThrow('MARKET_OFFER_UNAVAILABLE');
});
it('stable selected-record checkpoint ignores unrelated creation count but changes when the offer changes',async()=>{
 const f=await setup(),first=await f.reader.offer('1');const row=f.entries.get(f.instanceKey.toXDR('base64'))!,value=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');
 value.contractData().val().instance().storage()![1].val(xdr.ScVal.scvU64(xdr.Uint64.fromString('2')));row.xdr=value.toXDR('base64');expect((await f.reader.offer('1')).snapshotId).toBe(first.snapshotId);
 const offer=f.entries.get(f.offerKey.toXDR('base64'))!,o=xdr.LedgerEntryData.fromXDR(offer.xdr,'base64');o.contractData().val().map()!.find(row=>row.key().sym().toString()==='sequence')!.val(xdr.ScVal.scvU64(xdr.Uint64.fromString('1')));offer.xdr=o.toXDR('base64');expect((await f.reader.offer('1')).snapshotId).not.toBe(first.snapshotId);
});
it('reader never treats altered code, returned key or expired TTL as a valid release',async()=>{
 for(const kind of ['code','key','ttl'] as const){const f=await setup();
  const row=f.entries.get((kind==='code'?f.codeKey:f.instanceKey).toXDR('base64'))!;
  if(kind==='key')row.key=f.offerKey.toXDR('base64');if(kind==='ttl')row.liveUntilLedgerSeq=99;if(kind==='code'){const data=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');data.contractCode().code(Buffer.from([1]));row.xdr=data.toXDR('base64');}
  await expect(f.reader.state()).rejects.toThrow();vi.resetModules();
 }
});
it('retries only a failed read fetch twice with the same request and signal',async()=>{
 const f=await setup();vi.useFakeTimers();const attempts:{body:string;signal:AbortSignal}[]=[];
 try{
  const fetcher:typeof fetch=async(url,init)=>{const body=JSON.parse(String(init?.body));if(body.method==='getLedgerEntries'){attempts.push({body:String(init?.body),signal:init!.signal as AbortSignal});if(attempts.length<3)throw new TypeError('Failed to fetch');}return f.fetcher(f.env.MARKET_RPC_URL,init);};
  const result=f.createMarketReader(f.release,{fetch:fetcher,now:()=>f.now}).offer('1').then(value=>({value,error:null}),error=>({value:null,error}));
  await vi.advanceTimersByTimeAsync(199);expect(attempts).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);expect(attempts).toHaveLength(2);await vi.advanceTimersByTimeAsync(599);expect(attempts).toHaveLength(2);await vi.advanceTimersByTimeAsync(1);const outcome=await result;expect(outcome.error).toBeNull();expect(outcome.value).toMatchObject({value:{id:1n}});expect(attempts).toHaveLength(3);
  expect(new Set(attempts.map(a=>a.body)).size).toBe(1);expect(new Set(attempts.map(a=>a.signal)).size).toBe(1);expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it('stops after three failed fetches and does not retry HTTP, JSON, RPC or pin validation',async()=>{
 const f=await setup();vi.useFakeTimers();let calls=0;
 try{const reader=f.createMarketReader(f.release,{fetch:async()=>{calls++;throw new TypeError('offline');},now:()=>f.now});const result=reader.state().then(()=>null,error=>error);await vi.advanceTimersByTimeAsync(800);expect(await result).toMatchObject({message:'offline'});expect(calls).toBe(3);expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}
 for(const kind of ['http','json','utf8','rpc','error','pin'] as const){calls=0;let entries=0;
  const fetcher:typeof fetch=async(url,init)=>{calls++;const body=JSON.parse(String(init?.body));if(body.method==='getLedgerEntries')entries++;
   if(kind==='http')return new Response('{}',{status:503});if(kind==='json')return new Response('{');if(kind==='utf8')return new Response(new Uint8Array([255]));if(kind==='rpc')return Response.json({jsonrpc:'2.0',id:body.id,error:{code:-1}});if(kind==='error')throw new Error('not a fetch TypeError');
   const response=await f.fetcher(f.env.MARKET_RPC_URL,init);if(body.method==='getLedgerEntries'){const value=await response.json();value.result.entries[0].liveUntilLedgerSeq=1;return Response.json(value);}return response;
  };
  await expect(f.createMarketReader(f.release,{fetch:fetcher,now:()=>f.now}).state()).rejects.toThrow();expect(calls).toBe(kind==='pin'?3:1);if(kind==='pin')expect(entries).toBe(1);
 }
});
it('the original ten-second deadline aborts a retry backoff without a new fetch',async()=>{
 const f=await setup();vi.useFakeTimers();let calls=0;let signal:AbortSignal|undefined;
 try{
  const fetcher:typeof fetch=async(_url,init)=>{calls++;signal=init!.signal as AbortSignal;await new Promise(resolve=>setTimeout(resolve,9900));throw new TypeError('interrupted near deadline');};
  const result=f.createMarketReader(f.release,{fetch:fetcher,now:()=>f.now}).state().then(()=>null,error=>error);
  await vi.advanceTimersByTimeAsync(9900);expect(calls).toBe(1);expect(signal?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(100);expect(await result).toMatchObject({name:'AbortError'});expect(signal?.aborted).toBe(true);expect(calls).toBe(1);expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
