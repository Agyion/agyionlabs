/** Local protocol tests: actual XDR reader, codec and Ed25519; synthetic RPC/catalog and memory journal. */
import {afterEach,expect,it,vi} from 'vitest';
import {Keypair,xdr} from '@stellar/stellar-sdk';
import {chainFixture} from '../tests/chain-fixture.ts';
import {metadataHash,publicationBytes,scMap,sha256,termsBytes,termsHash,TESTNET_NETWORK_ID} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
import {snapshotMarketAttempt} from '../client/journal.ts';
import type {MarketJournal,MarketJournalEntry,MarketTerminal} from '../client/journal.ts';
import type {PublicationReceipt} from '../client/catalog.ts';

afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});

function memoryJournal() {
  const rows=new Map<string,MarketJournalEntry>();let tail:Promise<unknown>=Promise.resolve();
  const journal:MarketJournal={
    exclusive<T>(run:()=>Promise<T>){const result=tail.then(run);tail=result.catch(()=>{});return result;},
    async pending(){return [...rows.values()].filter(x=>!x.terminal).map(x=>x.attempt);},
    async history(){return [...rows.values()];},async get(hash){return rows.get(hash)??null;},async byIntent(){return null;},
    commit:vi.fn(async value=>{const attempt=snapshotMarketAttempt(value);if(rows.has(attempt.hash))throw Error('duplicate');rows.set(attempt.hash,{attempt,terminal:null});}),
    finish:vi.fn(async(terminal:MarketTerminal)=>{const entry=rows.get(terminal.hash);if(!entry)throw Error('missing');rows.set(terminal.hash,{attempt:entry.attempt,terminal});}),
    close(){},
  };
  return {journal,rows};
}

async function setup(signal?:AbortSignal) {
  const f=await chainFixture();let clock=f.now;let beforeRead:((body:{method:string;params:{keys?:string[]}})=>void)|undefined;
  vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{schema:'agyion-public-fade-market-v1',network:'testnet',contract:f.contract,wasmHash:f.env.MARKET_WASM_HASH,rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[f.asset]}}));
  const {getMarketRelease}=await import('../client/release.ts'),{createMarketReader}=await import('../client/reader.ts'),{createMarketCatalog}=await import('../client/catalog.ts'),{createMarketPublisher}=await import('../client/publication.ts');
  const metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Collect today',shopId:'bakery',shopName:'Local bakery',address:'Market Street 1',latE6:41000000,lonE6:29000000,pickupStart:f.now,pickupEnd:f.now+3600,timezone:'Europe/Istanbul',accessibility:'Ground floor',imageHash:null};
  const mh=await metadataHash(metadata),terms={...f.terms,metadata_hash:mh},th=await termsHash(terms);
  f.offerFields.terms=xdr.ScVal.fromXDR(Buffer.from(termsBytes(terms)));f.offerFields.terms_hash=xdr.ScVal.scvBytes(Buffer.from(th,'hex'));f.data(f.offerKey,scMap(f.offerFields));
  const p:Publication={version:1,action:'publish-offer',networkId:TESTNET_NETWORK_ID,contract:f.contract,offerId:'1',seller:f.seller.publicKey(),keyEpoch:1,revision:1,termsHash:th,metadataHash:mh,issuedAt:f.now,expiresAt:f.now+300,nonce:'12'.repeat(32),metadata};
  const signature=f.seller.sign(Buffer.from(publicationBytes(p))).toString('hex'),digest=await sha256(publicationBytes(p));
  const receipt:PublicationReceipt={authority:'accepted-publication',networkId:TESTNET_NETWORK_ID,contract:f.contract,offerId:'1',seller:p.seller,keyEpoch:1,revision:1,digest,signatureHash:await sha256(Buffer.from(signature,'hex')),expiresAt:p.expiresAt,acceptedAt:f.now};
  let currentReceipt:unknown=null;const posts:string[]=[],gets:string[]=[];const memory=memoryJournal();
  const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
    if(init?.method==='POST'){
      expect(memory.rows.has(digest),'journal commit must precede the POST').toBe(true);posts.push(String(init.body));
      // The server could have accepted this before the connection was lost.
      throw new TypeError('synthetic response lost after request');
    }
    gets.push(String(url));return currentReceipt?Response.json({publicationReceipt:currentReceipt}):new Response('{}',{status:404});
  });
  const release=getMarketRelease(),reader=createMarketReader(release,{fetch:(_url,init)=>{beforeRead?.(JSON.parse(String(init?.body)));return f.fetcher(f.env.MARKET_RPC_URL,init);},now:()=>f.now});
  const catalog=createMarketCatalog(release,{fetch:fetcher,now:()=>clock});
  const publisher=createMarketPublisher({release,reader,journal:memory.journal,catalog,now:()=>clock,signal});
  return {...f,...memory,p,signature,digest,receipt,release,reader,catalog,publisher,posts,gets,fetcher,setClock(n:number){clock=n;},setReceipt(value:unknown){currentReceipt=value;},beforeRead(fn:typeof beforeRead){beforeRead=fn;}};
}

it('recovers an unknown POST through the exact acceptance receipt even after expiry without reposting',async()=>{
  const f=await setup();expect(await f.publisher.publish(f.p,f.signature)).toEqual({digest:f.digest,status:'pending',receipt:null});
  expect(f.posts).toHaveLength(1);expect(await f.journal.pending()).toHaveLength(1);
  f.setClock(f.p.expiresAt+1);f.setReceipt(f.receipt);
  expect(await f.publisher.reconcilePublication(f.digest)).toEqual({digest:f.digest,status:'accepted',receipt:f.receipt});
  expect(f.posts).toHaveLength(1);expect(await f.journal.pending()).toHaveLength(0);
  expect((await f.publisher.retryPublication(f.digest)).status).toBe('accepted');expect(f.posts).toHaveLength(1);
});

it('concurrent and duplicate publication calls query existing evidence and send only once',async()=>{
  const f=await setup();const result=await Promise.all([f.publisher.publish(f.p,f.signature),f.publisher.publish(f.p,f.signature)]);
  expect(result.map(x=>x.status)).toEqual(['pending','pending']);expect(f.posts).toHaveLength(1);expect(f.journal.commit).toHaveBeenCalledTimes(1);
  await f.publisher.publish(f.p,f.signature);expect(f.posts).toHaveLength(1);expect(f.gets).toHaveLength(3);
  await expect(f.publisher.publish(f.p,'00'.repeat(64))).rejects.toThrow('PUBLICATION_SIGNATURE_CHANGED');expect(f.posts).toHaveLength(1);
});

it('explicit retry rechecks current authority and posts only the exact saved body',async()=>{
  const f=await setup();await f.publisher.publish(f.p,f.signature);const saved=f.posts[0];const reads=f.calls.length;
  f.p.metadata.title='Changed in the caller';f.p.nonce='ab'.repeat(32);
  expect((await f.publisher.retryPublication(f.digest)).status).toBe('pending');expect(f.posts).toEqual([saved,saved]);expect(f.calls.length).toBeGreaterThan(reads);
  const body=JSON.parse(f.posts[1]);expect(body.publication.metadata.title).toBe('Bread');expect(body.publication.nonce).toBe('12'.repeat(32));
});

it('mismatching acceptance evidence remains pending and cannot write a terminal record',async()=>{
  const f=await setup();await f.publisher.publish(f.p,f.signature);
  const patches=[{networkId:'ab'.repeat(32)},{contract:f.asset},{digest:'ab'.repeat(32)},{signatureHash:'ab'.repeat(32)},{offerId:'2'},{seller:Keypair.random().publicKey()},{keyEpoch:2},{revision:2},{expiresAt:f.p.expiresAt+1},{authority:'catalog-only'}];
  for(const patch of patches){f.setReceipt({...f.receipt,...patch});expect((await f.publisher.reconcilePublication(f.digest)).status).toBe('pending');}
  expect(f.journal.finish).not.toHaveBeenCalled();expect(f.posts).toHaveLength(1);expect(await f.journal.pending()).toHaveLength(1);
});

it('expiry or rotated merchant key blocks explicit retry without losing the pending request',async()=>{
  for(const kind of ['expiry','key'] as const){const f=await setup();await f.publisher.publish(f.p,f.signature);
    if(kind==='expiry')f.setClock(f.p.expiresAt);else {const row=f.entries.get(f.merchantKey.toXDR('base64'))!,data=xdr.LedgerEntryData.fromXDR(row.xdr,'base64');data.contractData().val().map()!.find(r=>r.key().sym().toString()==='epoch')!.val(xdr.ScVal.scvU32(2));row.xdr=data.toXDR('base64');}
    await expect(f.publisher.retryPublication(f.digest)).rejects.toThrow(kind==='expiry'?'PUBLICATION_EXPIRED':'PUBLICATION_KEY_MISMATCH');
    expect(f.posts).toHaveLength(1);expect(await f.journal.pending()).toHaveLength(1);vi.resetModules();
  }
});

it('wrong chain state, signature and metadata fail before journal commit or catalog transmission',async()=>{
  for(const kind of ['state','terms','metadata','signature','epoch','expiry'] as const){const f=await setup();let signature=f.signature;
    if(kind==='state'){f.offerFields.state=xdr.ScVal.scvU32(1);f.data(f.offerKey,scMap(f.offerFields));}
    if(kind==='terms'){f.p.termsHash='ab'.repeat(32);signature=f.seller.sign(Buffer.from(publicationBytes(f.p))).toString('hex');}
    if(kind==='metadata')f.p.metadata.address='Wrong street';
    if(kind==='signature')signature='00'.repeat(64);
    if(kind==='epoch'){f.p.keyEpoch=2;signature=f.seller.sign(Buffer.from(publicationBytes(f.p))).toString('hex');}
    if(kind==='expiry')f.setClock(f.p.expiresAt);
    const message=kind==='metadata'?'PUBLICATION_METADATA_HASH':kind==='signature'||kind==='epoch'?'PUBLICATION_KEY_MISMATCH':kind==='expiry'?'PUBLICATION_EXPIRED':'PUBLICATION_CHAIN_MISMATCH';
    await expect(f.publisher.publish(f.p,signature)).rejects.toThrow(message);expect(f.posts).toHaveLength(0);expect(f.gets).toHaveLength(0);expect(f.journal.commit).not.toHaveBeenCalled();vi.resetModules();
  }
});

it('a durable-terminal failure remains pending and later reconciliation recovers without POST',async()=>{
  const f=await setup();await f.publisher.publish(f.p,f.signature);f.setReceipt(f.receipt);
  vi.mocked(f.journal.finish).mockRejectedValueOnce(new Error('synthetic disk full'));
  expect((await f.publisher.reconcilePublication(f.digest)).status).toBe('pending');expect(await f.journal.pending()).toHaveLength(1);
  expect((await f.publisher.reconcilePublication(f.digest)).status).toBe('accepted');expect(f.posts).toHaveLength(1);
});

it('expiry during chain checks or a failed initial durable commit cannot send a publication',async()=>{
  const f=await setup();f.beforeRead(body=>{if(body.method==='getLedgerEntries'&&body.params.keys?.includes(f.merchantKey.toXDR('base64')))f.setClock(f.p.expiresAt);});
  await expect(f.publisher.publish(f.p,f.signature)).rejects.toThrow('PUBLICATION_EXPIRED');expect(f.posts).toHaveLength(0);expect(f.journal.commit).not.toHaveBeenCalled();
  vi.resetModules();const g=await setup();vi.mocked(g.journal.commit).mockRejectedValueOnce(new Error('synthetic durable write failed'));
  await expect(g.publisher.publish(g.p,g.signature)).rejects.toThrow('synthetic durable write failed');expect(g.posts).toHaveLength(0);expect(g.gets).toHaveLength(0);
});


it('abort during authority reads refuses before commit; abort after durable commit releases an unposted attempt',async()=>{
 const control=new AbortController(),f=await setup(control.signal);f.beforeRead(()=>control.abort());
 await expect(f.publisher.publish(f.p,f.signature)).rejects.toThrow();expect(f.posts).toHaveLength(0);expect(f.journal.commit).not.toHaveBeenCalled();
 vi.resetModules();const next=new AbortController(),g=await setup(next.signal);const original=vi.mocked(g.journal.commit).getMockImplementation()!;
 vi.mocked(g.journal.commit).mockImplementation(async value=>{await original(value);next.abort();});
 const result=await g.publisher.publish(g.p,g.signature);expect(result.status).toBe('known_not_sent');expect(g.posts).toHaveLength(0);expect(await g.journal.pending()).toHaveLength(0);expect((await g.journal.get(g.digest))?.terminal?.status).toBe('known_not_sent');
});
