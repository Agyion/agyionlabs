import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createStateFixture } from './helpers/public-lifecycle-state-fixture.mjs';
import { createPublicLifecycleRpc } from '../lib/public-lifecycle-rpc.mjs';
import { acquirePublicLifecycleSnapshot, acquirePublicLifecycleFundingAccount } from '../lib/public-lifecycle-acquisition.mjs';
const { Address, Account, Contract, TransactionBuilder, xdr } = createRequire(new URL('../../app/package.json',import.meta.url))('@stellar/stellar-sdk');
const f=createStateFixture({realWasm:false}), {plan,b64}=f, clone=structuredClone;
const sha=v=>createHash('sha256').update(v).digest('hex');
const errorIs=code=>e=>{assert.equal(e.message,`LIFECYCLE_ACQUISITION_${code}`);assert.equal(e.cause,undefined);return true;};
function headerReply(head=1000,{history=false,transactions=0}={}) {
  const h=f.header(head), decoded=xdr.LedgerHeader.fromXDR(h.headerXdr,'base64');
  const wrapper=new xdr.LedgerHeaderHistoryEntry({hash:Buffer.from(h.hash,'hex'),header:decoded,ext:new xdr.LedgerHeaderHistoryEntryExt(0)});
  const tx=new TransactionBuilder(new Account(plan.actors.seller,'10'),{fee:'100',networkPassphrase:plan.networkPassphrase}).addOperation(new Contract(plan.contractId).call('protocol_version')).setTimebounds(0,1800000000).build().toEnvelope();
  const meta=new xdr.LedgerCloseMeta(0,new xdr.LedgerCloseMetaV0({ledgerHeader:wrapper,txSet:new xdr.TransactionSet({previousLedgerHash:Buffer.alloc(32),txes:Array(transactions).fill(tx)}),txProcessing:[],upgradesProcessing:[],scpInfo:[]}));
  const raw={id:h.hash,sequence:head,protocolVersion:decoded.ledgerVersion(),closeTime:decoded.scpValue().closeTime().toString(),headerXdr:h.headerXdr,metadataXdr:b64(meta)};
  if(!history)return raw;
  return {ledgers:[{hash:raw.id,sequence:head,ledgerCloseTime:raw.closeTime,headerXdr:b64(wrapper),metadataXdr:raw.metadataXdr}],latestLedger:head+1,latestLedgerCloseTime:Number(raw.closeTime)+1,oldestLedger:1,oldestLedgerCloseTime:1,cursor:String(head)};
}
function fixture({latest=1000}={}) {
  const projected=f.snapshot(), entries={latestLedger:1000,entries:projected.entries.map(({val,...r})=>({...r,xdr:val,extXdr:'AAAAAA=='}))};
  const values={getNetwork:{passphrase:plan.networkPassphrase,protocolVersion:25,friendbotUrl:plan.friendbotUrl},getLedgerEntries:entries,getLatestLedger:headerReply(latest),getLedgers:headerReply(1000,{history:true})};
  const calls=[];
  const rpc=createPublicLifecycleRpc({fetch:async(url,init)=>{assert.equal(url,'https://soroban-testnet.stellar.org');assert.equal(init.redirect,'manual');const q=JSON.parse(init.body);calls.push(q);assert.ok(Object.hasOwn(values,q.method));return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result:values[q.method]}));}});
  return {values,calls,rpc,projected};
}

test('exact current head returns frozen raw capture and replay projection without inventing state authority',async()=>{
  const t=fixture(),result=await acquirePublicLifecycleSnapshot({plan,rpc:t.rpc});
  assert.deepEqual(t.calls.map(q=>q.method),['getNetwork','getLedgerEntries','getLatestLedger']);
  const keys=t.calls[1].params.keys.map(k=>xdr.LedgerKey.fromXDR(k,'base64'));
  assert.equal(keys.length,26);assert.equal(new Set(t.calls[1].params.keys).size,26);
  assert.deepEqual(new Set(keys.slice(10).map(k=>{const v=k.contractData().key().vec();return v[0].sym().toString()+':'+v[1].u64().toString();})),new Set(['Fade:1','Fade:2','Fade:3','Fade:4','Fade:5','Fade:6','Fade:7','Fade:8','Pod:1','Pod:2','Trigger:1','Trigger:2','Trigger:3','Mandate:1','Mandate:2','Mandate:3']));
  assert.deepEqual(result.response,t.projected);assert.deepEqual(result.headerEvidence,f.header());
  assert.deepEqual(result.raw,{network:t.values.getNetwork,entries:t.values.getLedgerEntries,latest:t.values.getLatestLedger,history:null});
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.raw.entries.entries[0]));assert.equal(result.expected,undefined);assert.equal(result.zeroBalanceEvidence,undefined);assert.equal(result.codeBytesAuthenticated,undefined);
  assert.throws(()=>{result.response.entries[0].val='changed';},TypeError);
});
test('newer latest head fetches exactly one original snapshot history header without relabeling entries',async()=>{
  const t=fixture({latest:1001}),result=await acquirePublicLifecycleSnapshot({plan,rpc:t.rpc});
  assert.deepEqual(t.calls.map(q=>q.method),['getNetwork','getLedgerEntries','getLatestLedger','getLedgers']);assert.deepEqual(t.calls[3].params,{startLedger:1000,pagination:{limit:1}});
  assert.equal(result.response.latestLedger,1000);assert.deepEqual(result.headerEvidence,f.header(1000,'history'));assert.deepEqual(result.raw.history,t.values.getLedgers);
});
test('wrong network refuses before ledger entry acquisition',async()=>{const t=fixture();t.values.getNetwork.passphrase='Public Global Stellar Network ; September 2015';await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs('NETWORK'));assert.deepEqual(t.calls.map(q=>q.method),['getNetwork']);});

const rowCases=[
 ['foreign requested key',r=>{r.entries[7].key=b64(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(plan.credentialKeys.venue).toScAddress().accountId()})));},'KEY'],
 ['duplicate row',r=>r.entries.push(clone(r.entries[0])),'KEY'],
 ['missing account',r=>r.entries.splice(7,1),'MISSING'],
 ['missing liability',r=>r.entries.splice(4,1),'MISSING'],
 ['missing code',r=>r.entries.shift(),'MISSING'],
 ['missing rows array',r=>delete r.entries,'ROWS'],
 ['wrong union',r=>r.entries[7].xdr=r.entries[1].xdr,'KEY'],
 ['wrong embedded account',r=>r.entries[7].xdr=r.entries[8].xdr,'KEY'],
 ['wrong embedded data key',r=>r.entries[4].xdr=r.entries[5].xdr,'KEY'],
 ['noncanonical XDR',r=>r.entries[0].xdr+='\n','XDR'],
 ['future modified ledger',r=>r.entries[1].lastModifiedLedgerSeq=1001,'METADATA'],
 ['zero modified ledger',r=>r.entries[1].lastModifiedLedgerSeq=0,'METADATA'],
 ['missing modified ledger',r=>delete r.entries[1].lastModifiedLedgerSeq,'ROWS'],
 ['expired live TTL',r=>r.entries[1].liveUntilLedgerSeq=999,'METADATA'],
 ['missing live TTL',r=>delete r.entries[1].liveUntilLedgerSeq,'METADATA'],
 ['overflow live TTL',r=>r.entries[1].liveUntilLedgerSeq=0x100000000,'METADATA'],
 ['unknown row property',r=>r.entries[1].verified=true,'ROWS'],
 ['zero head',r=>r.latestLedger=0,'METADATA'],
 ['unknown response property',r=>r.verified=true,'ROWS'],
 ['malformed extension',r=>r.entries[1].extXdr='AAAA','XDR'],
 ['unsupported sponsoring extension',r=>{const ext=new xdr.LedgerEntryExt(1,new xdr.LedgerEntryExtensionV1({sponsoringId:new Address(plan.actors.seller).toScAddress().accountId(),ext:new xdr.LedgerEntryExtensionV1Ext(0)}));r.entries[1].extXdr=b64(ext);},'ROWS'],
];
for(const[name,mutate,code]of rowCases)test(`raw rows reject ${name} before header lookup`,async()=>{const t=fixture();mutate(t.values.getLedgerEntries);await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs(code));assert.equal(t.calls.length,2);});
test('missing native balance and never-created rows remain omitted, never implicit zero/absence proof',async()=>{const t=fixture();t.values.getLedgerEntries.entries.splice(6,1);const r=await acquirePublicLifecycleSnapshot({plan,rpc:t.rpc});assert.equal(r.response.entries.length,9);assert.equal(r.zeroBalanceEvidence,undefined);assert.equal(r.expected,undefined);assert.equal(r.response.entries.some(e=>e.key===t.projected.entries[6].key),false);});
const headerCases=[
 ['latest behind snapshot',t=>t.values.getLatestLedger=headerReply(999),'DRIFT',3],
 ['wrong latest header hash',t=>t.values.getLatestLedger.id='00'.repeat(32),'HEADER',3],
 ['latest claimed different sequence',t=>t.values.getLatestLedger.sequence=1002,'HEADER',3],
 ['wrong latest protocol',t=>t.values.getLatestLedger.protocolVersion=28,'HEADER',3],
 ['wrong latest close time',t=>t.values.getLatestLedger.closeTime='1','HEADER',3],
 ['wrong metadata header',t=>t.values.getLatestLedger.metadataXdr=headerReply(999).metadataXdr,'HEADER',3],
 ['invalid metadata XDR',t=>t.values.getLatestLedger.metadataXdr='AAAA','XDR',3],
 ['parsed metadata',t=>t.values.getLatestLedger.metadataXdr={parsed:true},'XDR',3],
 ['history absent',t=>t.values.getLedgers.ledgers=[],'HEADER',4],
 ['history duplicate',t=>t.values.getLedgers.ledgers.push(clone(t.values.getLedgers.ledgers[0])),'HEADER',4],
 ['history wrong requested ledger',t=>t.values.getLedgers=headerReply(999,{history:true}),'HEADER',4],
 ['history is latest XDR arm',t=>t.values.getLedgers.ledgers[0].headerXdr=f.header().headerXdr,'HEADER',4],
 ['history retention excludes target',t=>t.values.getLedgers.oldestLedger=1001,'HEADER',4],
 ['history latest regresses',t=>t.values.getLedgers.latestLedger=999,'HEADER',4],
 ['history cursor is wrong',t=>t.values.getLedgers.cursor='999','HEADER',4],
 ['unknown history property',t=>t.values.getLedgers.passed=true,'HEADER',4],
];
for(const[name,mutate,code,count]of headerCases)test(`header acquisition rejects ${name} without polling or retry`,async()=>{const t=fixture({latest:1001});mutate(t);await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs(code));assert.equal(t.calls.length,count);});
for(const [name,mutate]of [['wrong friendbot',n=>n.friendbotUrl='https://other.example/'],['string protocol coercion',n=>n.protocolVersion='25'],['unknown network field',n=>n.authenticated=true]])test(`network rejects ${name}`,async()=>{const t=fixture();mutate(t.values.getNetwork);await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs('NETWORK'));assert.equal(t.calls.length,1);});
test('public configuration has no URL/limits or untrusted adapter authority override',async()=>{
 const t=fixture();for(const extra of [{url:'https://other.example/'},{timeout:1},{keys:[]},{verified:true},{signal:{}},{rpc:{request:1}}])await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc,...extra}),errorIs('INPUT'));
 const altered=clone(plan);altered.contractId=plan.assets[0];await assert.rejects(acquirePublicLifecycleSnapshot({plan:altered,rpc:t.rpc}),errorIs('INPUT'));assert.equal(t.calls.length,0);
});
test('descriptors reject getters, toJSON, symbols, sparse arrays and hostile proxies without leaking thrown text',async()=>{
 let invoked=0;const accessor=Object.defineProperty({},'plan',{enumerable:true,get(){invoked++;return plan;}});await assert.rejects(acquirePublicLifecycleSnapshot(accessor),errorIs('INPUT'));
 const adapter=Object.defineProperty({},'request',{enumerable:true,get(){invoked++;return ()=>{};}});await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:adapter}),errorIs('INPUT'));
 for(const value of [Object.defineProperty({},'passphrase',{enumerable:true,get(){invoked++;return plan.networkPassphrase;}}),{toJSON(){invoked++;return {};}},Object.assign({},{[Symbol('bad')]:true}),{bad:new Array(1)},new Proxy({},{ownKeys(){throw Error('LIFECYCLE_ACQUISITION_secret-looking-content');}})])await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:{request:async()=>value}}),e=>{assert.match(e.message,/^LIFECYCLE_ACQUISITION_(DATA|INPUT)$/);assert.equal(e.cause,undefined);return true;});
 assert.equal(invoked,0);
});
test('plan and raw replies are detached before later asynchronous work can mutate their caller-owned values',async()=>{
 const t=fixture(),localPlan=clone(plan);let networkRef;
 const rpc={async request(method){if(method==='getNetwork'){networkRef=clone(t.values.getNetwork);return networkRef;}if(method==='getLedgerEntries'){networkRef.passphrase='changed';localPlan.actors.seller=plan.actors.recipient;}return clone(t.values[method]);}};
 const r=await acquirePublicLifecycleSnapshot({plan:localPlan,rpc});assert.equal(r.raw.network.passphrase,plan.networkPassphrase);assert.equal(r.response.entries[7].key,t.projected.entries[7].key);
});
test('already cancelled signal performs no request',async()=>{const t=fixture(),c=new AbortController();c.abort();await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc,signal:c.signal}),errorIs('ABORTED'));assert.equal(t.calls.length,0);});
test('cancellation races a trusted injected adapter that never settles and prevents later requests',async()=>{const c=new AbortController();let calls=0;const p=acquirePublicLifecycleSnapshot({plan,signal:c.signal,rpc:{request(){calls++;return new Promise(()=>{});}}});await new Promise(r=>setImmediate(r));c.abort('untrusted reason');await assert.rejects(p,errorIs('ABORTED'));assert.equal(calls,1);});
test('production RPC controlled fetch propagates abort and normalizes transport errors without retry',async()=>{
 const c=new AbortController();let called=0,seen;const rpc=createPublicLifecycleRpc({signal:c.signal,fetch:async(_url,init)=>{called++;seen=init.signal;return new Promise(()=>{});}});
 const p=acquirePublicLifecycleSnapshot({plan,rpc,signal:c.signal});await new Promise(r=>setImmediate(r));c.abort();await assert.rejects(p,errorIs('ABORTED'));assert.equal(seen.aborted,true);assert.equal(called,1);
 let failedCalls=0;await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:{async request(){failedCalls++;throw Error('private raw message');}}}),errorIs('RPC'));assert.equal(failedCalls,1);
});
test('production default constructs fixed transport only inside acquisition and makes only three read requests',async()=>{
 const t=fixture(),original=globalThis.fetch;globalThis.fetch=async(url,init)=>{assert.equal(url,'https://soroban-testnet.stellar.org');const q=JSON.parse(init.body);t.calls.push(q);return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result:t.values[q.method]}));};
 try{await acquirePublicLifecycleSnapshot({plan});assert.deepEqual(t.calls.map(q=>q.method),['getNetwork','getLedgerEntries','getLatestLedger']);}finally{globalThis.fetch=original;}
});
test('bounded raw copies reject giant/deep/node-heavy replies before interpreting them',async()=>{
 for(const value of [{s:'x'.repeat(2097153)},{x:Array.from({length:10001},()=>0)},Array.from({length:30}).reduce(v=>({nested:v}),{})])await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:{request:async()=>value}}),errorIs('BOUNDS'));
});
test('individually bounded valid header metadata cannot exceed the combined two MiB result budget',async()=>{
 const t=fixture({latest:1001});t.values.getLatestLedger=headerReply(1001,{transactions:6000});t.values.getLedgers=headerReply(1000,{history:true,transactions:6000});
 assert.ok(Buffer.byteLength(JSON.stringify(t.values.getLatestLedger))<2097152);assert.ok(Buffer.byteLength(JSON.stringify(t.values.getLedgers))<2097152);
 await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs('BOUNDS'));assert.equal(t.calls.length,4);
});

test('explicit null adapter rejects without silently constructing a production transport',async()=>{
 const original=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw Error('no network allowed');};
 try{await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:null}),errorIs('INPUT'));assert.equal(fetches,0);}finally{globalThis.fetch=original;}
});
test('combined return bound also includes the duplicated canonical replay projection',async()=>{
 const t=fixture();t.values.getLatestLedger=headerReply(1000,{transactions:9100});
 const size=Buffer.byteLength(JSON.stringify(t.values.getLatestLedger));assert.ok(size<2097152&&size>1800000);
 // Canonical extra known future rows are transport data, never inferred state.
 const base=t.values.getLedgerEntries.entries[4],value=xdr.LedgerEntryData.fromXDR(base.xdr,'base64');
 for(let id=1;id<=8;id++){const key=xdr.LedgerKey.fromXDR(base.key,'base64');key.contractData().key(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Fade'),xdr.ScVal.scvU64(xdr.Uint64.fromString(String(id)))]));const val=xdr.LedgerEntryData.fromXDR(b64(value),'base64');val.contractData().key(key.contractData().key());val.contractData().val(xdr.ScVal.scvBytes(Buffer.alloc(5500)));t.values.getLedgerEntries.entries.push({...clone(base),key:b64(key),xdr:b64(val)});}
 assert.ok(Object.values(t.values).slice(0,3).reduce((n,v)=>n+Buffer.byteLength(JSON.stringify(v)),0)<2097152);
 await assert.rejects(acquirePublicLifecycleSnapshot({plan,rpc:t.rpc}),errorIs('BOUNDS'));
});

test('funding acquisition accepts an absent recipient using exactly its one canonical key',async()=>{
 const t=fixture();t.values.getLedgerEntries.entries=[];const r=await acquirePublicLifecycleFundingAccount({plan,role:'recipient',rpc:t.rpc});
 assert.equal(r.role,'recipient');assert.deepEqual(r.response,{latestLedger:1000,entries:[]});assert.deepEqual(t.calls[1].params,{keys:[t.projected.entries[8].key]});assert.equal(r.funded,undefined);assert.equal(r.expected,undefined);
});
for(const[role,index]of [['recipient',8],['relayer',9]])test(`funding acquisition preserves canonical ${role} account data and exact historical head`,async()=>{
 const t=fixture({latest:1001});t.values.getLedgerEntries.entries=[t.values.getLedgerEntries.entries[index]];const r=await acquirePublicLifecycleFundingAccount({plan,role,rpc:t.rpc});
 assert.deepEqual(r.response.entries,[t.projected.entries[index]]);assert.equal(r.headerEvidence.kind,'history');assert.deepEqual(t.calls[1].params,{keys:[t.projected.entries[index].key]});assert.deepEqual(r.raw.entries,t.values.getLedgerEntries);
});
for(const role of ['seller','venue','podTimelock','attester','agent','other',null])test(`funding acquisition refuses unauthorized role ${role} before RPC`,async()=>{const t=fixture();await assert.rejects(acquirePublicLifecycleFundingAccount({plan,role,rpc:t.rpc}),errorIs('INPUT'));assert.equal(t.calls.length,0);});
test('funding acquisition rejects caller source/key overrides and extra or foreign account rows',async()=>{
 const t=fixture();for(const extra of [{sourceAccount:plan.actors.recipient},{keys:[t.projected.entries[8].key]},{expected:{balance:'1'}}])await assert.rejects(acquirePublicLifecycleFundingAccount({plan,role:'recipient',rpc:t.rpc,...extra}),errorIs('INPUT'));assert.equal(t.calls.length,0);
 t.values.getLedgerEntries.entries=t.values.getLedgerEntries.entries.slice(8,10);await assert.rejects(acquirePublicLifecycleFundingAccount({plan,role:'recipient',rpc:t.rpc}),errorIs('ROWS'));
 t.values.getLedgerEntries.entries=[t.values.getLedgerEntries.entries[1]];await assert.rejects(acquirePublicLifecycleFundingAccount({plan,role:'recipient',rpc:t.rpc}),errorIs('KEY'));
});

test('funding role is captured before an asynchronous response can mutate caller options',async()=>{
 const t=fixture();t.values.getLedgerEntries.entries=[t.values.getLedgerEntries.entries[8]];let options;
 const rpc={async request(method){if(method==='getNetwork')options.role='relayer';return clone(t.values[method]);}};
 options={plan,role:'recipient',rpc};const r=await acquirePublicLifecycleFundingAccount(options);assert.equal(r.role,'recipient');assert.equal(r.response.entries[0].key,t.projected.entries[8].key);
});

// Exact retained PUBLIC header bytes (4902649) and seller Account wire row
// (snapshot4902687). Other rows and metadata below are explicitly synthetic;
// this checks acquired wire representations, not a new real acquisition.
const capturedHeader={"id":"c40463b67a641ef6d35e306309c50992f91aa23d6e5bc360d2068543a8c2bc23","sequence":4902649,"protocolVersion":28,"closeTime":"1790536832","headerXdr":"AAAAHOy9Clkg40MjTk9zMF6RX2H60zHMzUuZ4CP1KDTgc9FCFxDkxDlfiSz5AJI9Blsfl3VAkDfEQvv3GX0RyCSLJZcAAAAAarlsgAAAAAAAAAABAAAAANVyadliUPdJbQeb4ug1Ejbv/+jTnC4Gv6uxQh8X/GccAAAAQGEq5qGroHlo53q3hBEUczse1gaCk3A8jqYSKrcLhX0fudUTEz3FxJoe2lxPbMjK59xmide4erjr6/tJsGrCmgaKGHeixJFtRR+CtPB0AtUi1cigCN4qEK7TS22MKF+aDIMWC4GhfFA1LnquE2Ct4XUSFI7iItKkHBIXCn8scqssAErO+Q3gtrOnZAAAAAAGEOCdtS8AAAAAAAAAAAAMoxwAAABkAExLQAAAAMgxmTGhOOO7HrdrJW5KctHZpKRHswWHrcPBkhz81X5gbEu817cyaSsq+PfyH5FiLopbSFfFb7rOdcw+Cc7Pk97ktRat3cS1yF5r6FWZkvgSMpIKbC1WA8Iw4rwa+UDCQH8AfbRzTOUFrgCd0a1NWFFVuKGt8FhQJ3iV3juXCzeRGwAAAAA="};
const capturedHistoryXdr="xARjtnpkHvbTXjBjCcUJkvkaoj1uW8Ng0gaFQ6jCvCMAAAAc7L0KWSDjQyNOT3MwXpFfYfrTMczNS5ngI/UoNOBz0UIXEOTEOV+JLPkAkj0GWx+XdUCQN8RC+/cZfRHIJIsllwAAAABquWyAAAAAAAAAAAEAAAAA1XJp2WJQ90ltB5vi6DUSNu//6NOcLga/q7FCHxf8ZxwAAABAYSrmoaugeWjnereEERRzOx7WBoKTcDyOphIqtwuFfR+51RMTPcXEmh7aXE9syMrn3GaJ17h6uOvr+0mwasKaBooYd6LEkW1FH4K08HQC1SLVyKAI3ioQrtNLbYwoX5oMgxYLgaF8UDUueq4TYK3hdRIUjuIi0qQcEhcKfyxyqywASs75DeC2s6dkAAAAAAYQ4J21LwAAAAAAAAAAAAyjHAAAAGQATEtAAAAAyDGZMaE447set2slbkpy0dmkpEezBYetw8GSHPzVfmBsS7zXtzJpKyr49/IfkWIuiltIV8Vvus51zD4Jzs+T3uS1Fq3dxLXIXmvoVZmS+BIykgpsLVYDwjDivBr5QMJAfwB9tHNM5QWuAJ3RrU1YUVW4oa3wWFAneJXeO5cLN5EbAAAAAAAAAAA=";
const capturedSellerRow={"key":"AAAAAAAAAABGhrWPOD67JGC8tm22wnLwuTxEjrPDkaXSSbyo/51WXw==","xdr":"AAAAAAAAAABGhrWPOD67JGC8tm22wnLwuTxEjrPDkaXSSbyo/51WXwAAABdEx7sBAErClgAAAAIAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAABKwqMAAAAAarku0g==","lastModifiedLedgerSeq":4899491,"extXdr":"AAAAAA=="};

function capturedHeaderReply(history=false){
 const wrapper=xdr.LedgerHeaderHistoryEntry.fromXDR(capturedHistoryXdr,'base64');
 const meta=new xdr.LedgerCloseMeta(0,new xdr.LedgerCloseMetaV0({ledgerHeader:wrapper,txSet:new xdr.TransactionSet({previousLedgerHash:Buffer.alloc(32),txes:[]}),txProcessing:[],upgradesProcessing:[],scpInfo:[]}));
 if(!history)return {...capturedHeader,metadataXdr:b64(meta)};
 return {ledgers:[{hash:capturedHeader.id,sequence:capturedHeader.sequence,ledgerCloseTime:capturedHeader.closeTime,headerXdr:capturedHistoryXdr,metadataXdr:b64(meta)}],latestLedger:capturedHeader.sequence+1,latestLedgerCloseTime:Number(capturedHeader.closeTime)+1,oldestLedger:4781690,oldestLedgerCloseTime:1789932037,cursor:String(capturedHeader.sequence)};
}
test('acquired exact latest/history header bytes pass both paths with unchanged canonical values',async()=>{
 assert.equal(sha(xdr.LedgerHeader.fromXDR(capturedHeader.headerXdr,'base64').toXDR()),'c40463b67a641ef6d35e306309c50992f91aa23d6e5bc360d2068543a8c2bc23');
 for(const history of [false,true]){
  const t=fixture(),head=capturedHeader.sequence;t.values.getNetwork.protocolVersion=28;t.values.getLedgerEntries.latestLedger=head;
  for(const row of t.values.getLedgerEntries.entries)if(Object.hasOwn(row,'liveUntilLedgerSeq'))row.liveUntilLedgerSeq=head+100;
  t.values.getLatestLedger=capturedHeaderReply();
  if(history){const h=xdr.LedgerHeader.fromXDR(capturedHeader.headerXdr,'base64');h.ledgerSeq(head+1);h.scpValue().closeTime(xdr.Uint64.fromString(String(Number(capturedHeader.closeTime)+1)));const w=new xdr.LedgerHeaderHistoryEntry({hash:Buffer.from(sha(h.toXDR()),'hex'),header:h,ext:new xdr.LedgerHeaderHistoryEntryExt(0)}),meta=xdr.LedgerCloseMeta.fromXDR(t.values.getLatestLedger.metadataXdr,'base64');meta.v0().ledgerHeader(w);t.values.getLatestLedger={...t.values.getLatestLedger,id:sha(h.toXDR()),sequence:head+1,closeTime:String(Number(capturedHeader.closeTime)+1),headerXdr:b64(h),metadataXdr:b64(meta)};t.values.getLedgers=capturedHeaderReply(true);}
  const r=await acquirePublicLifecycleSnapshot({plan,rpc:t.rpc});assert.equal(r.headerEvidence.headerXdr,history?capturedHistoryXdr:capturedHeader.headerXdr);assert.equal(r.headerEvidence.ledger,4902649);assert.equal(r.headerEvidence.hash,capturedHeader.id);
 }
});
test('actual retained account wire extension survives snapshot projection; seller row cannot substitute for funding actor',async()=>{
 const t=fixture();t.values.getLedgerEntries.latestLedger=4902687;t.values.getLedgerEntries.entries[7]=clone(capturedSellerRow);
 for(const row of t.values.getLedgerEntries.entries)if(Object.hasOwn(row,'liveUntilLedgerSeq'))row.liveUntilLedgerSeq=4902787;
 t.values.getLatestLedger=headerReply(4902687);const r=await acquirePublicLifecycleSnapshot({plan,rpc:t.rpc});
 assert.deepEqual(r.raw.entries.entries[7],capturedSellerRow);assert.equal(r.response.entries[7].val,capturedSellerRow.xdr);assert.equal(r.response.entries[7].lastModifiedLedgerSeq,4899491);assert.equal(Object.hasOwn(r.response.entries[7],'liveUntilLedgerSeq'),false);
 const u=fixture();u.values.getLedgerEntries.entries=[clone(capturedSellerRow)];await assert.rejects(acquirePublicLifecycleFundingAccount({plan,role:'recipient',rpc:u.rpc}),errorIs('KEY'));
});
