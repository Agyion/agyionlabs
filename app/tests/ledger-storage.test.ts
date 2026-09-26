// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { clearLog, listEntries, logEntry } from '../app/lib/ledgerLog';
import { rememberReceipt } from '../app/lib/transactionReceipts';
const entry={template:'pod' as const,action:'claim_pod',refId:'18',amount:'1',status:'executed' as const,detail:'Opened',txHash:null,ledger:1};
beforeEach(()=>{vi.restoreAllMocks();clearLog();localStorage.clear()});
it('ignores malformed stored history',()=>{localStorage.setItem('agyion.ledger.v1','{}');expect(listEntries()).toEqual([]);localStorage.setItem('agyion.ledger.v1','[{},null]');expect(listEntries()).toEqual([])});
it('keeps confirmed actions successful even when browser persistence fails',()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')});expect(()=>logEntry(entry)).not.toThrow();expect(listEntries()[0]?.action).toBe('claim_pod')});
it('attaches only the matching confirmed receipt and triggers the scene',()=>{rememberReceipt('claim_pod','18',{hash:'a'.repeat(64),ledger:9});const event=vi.fn();window.addEventListener('agyion:record',event);const saved=logEntry(entry);expect(saved.txHash).toBe('a'.repeat(64));expect(saved.ledger).toBe(9);expect(event).toHaveBeenCalledOnce();window.removeEventListener('agyion:record',event)});
it('never assigns a success receipt to a rejected entry',()=>{rememberReceipt('claim_pod','18',{hash:'b'.repeat(64),ledger:10});expect(logEntry({...entry,status:'rejected'}).txHash).toBeNull()});
it('recovers confirmed IDs without inventing amounts or duplicating the receipt',async()=>{
 const {rememberTransactionAttempt,updateTransactionAttempt}=await import('../app/lib/transactionReceipts');
 const {recoverTransactionEntries,recordHref}=await import('../app/lib/ledgerLog');
 const scope={account:'G'+'A'.repeat(55),network:'test',contractId:'C'+'A'.repeat(55)};
 rememberTransactionAttempt({...scope,hash:'f'.repeat(64),action:'create_pod',refId:null});
 updateTransactionAttempt('f'.repeat(64),scope,{status:'success',refId:'29',ledger:8});
 recoverTransactionEntries(scope);recoverTransactionEntries(scope);
 expect(listEntries()).toHaveLength(1);expect(listEntries()[0]).toMatchObject({refId:'29',status:'recorded',amount:null,ledger:8,txHash:'f'.repeat(64)});
 clearLog();recoverTransactionEntries(scope);expect(listEntries()).toEqual([]);
 expect(recordHref('pod','29')).toBe('/app/?tab=pod&ref=29');
 expect(recordHref('envoy','4→91')).toBe('/app/?tab=envoy&ref=4');
 expect(recordHref('pod','javascript:alert(1)')).toBeNull();
 expect(recordHref('pod','18446744073709551616')).toBeNull();
});
it('never opens an old deployment record ID on the current contract',async()=>{
 const {entryRecordHref}=await import('../app/lib/ledgerLog');
 const row={...logEntry(entry),network:'old-network',contractId:'C'+'A'.repeat(55)};
 expect(entryRecordHref(row,{network:'current-network',contractId:row.contractId,mock:false})).toBeNull();
 expect(entryRecordHref(row,{network:row.network,contractId:row.contractId,mock:false})).toBe('/app/?tab=pod&ref=18');
 localStorage.clear();localStorage.setItem('agyion.ledger.v1',JSON.stringify([{...row,network:{bad:true}}]));expect(listEntries()).toEqual([]);
});
it('keeps both ledger entries when two tabs interleave writes',async()=>{
 const {rememberTransactionAttempt,updateTransactionAttempt,listTransactionAttempts}=await import('../app/lib/transactionReceipts');
 const {recoverTransactionEntries}=await import('../app/lib/ledgerLog');
 const scope={account:'G'+'A'.repeat(55),network:'test',contractId:'C'+'A'.repeat(55)};
 const a='a'.repeat(64),b='b'.repeat(64);
 for(const [hash,refId] of [[a,'17'],[b,'18']]){rememberTransactionAttempt({...scope,hash,action:'create_pod',refId:null});updateTransactionAttempt(hash,scope,{status:'success',ledger:8,refId});}
 const original=Storage.prototype.setItem;let interleaved=false;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
  if(!interleaved && (key==='agyion.ledger.v1'||key.startsWith('agyion.ledger.v2:entry:'))){interleaved=true;logEntry({...entry,...scope,action:'create_pod',refId:'18',txHash:b})}
  original.call(this,key,value);
 });
 logEntry({...entry,...scope,action:'create_pod',refId:'17',txHash:a});
 expect(listEntries().map(e=>e.txHash).sort()).toEqual([a,b]);
 expect(new Set(listEntries().map(e=>e.seq)).size).toBe(2);
 recoverTransactionEntries(scope);
 expect(listEntries()).toHaveLength(2);
 expect(listTransactionAttempts(scope).every(a=>a.recorded)).toBe(true);
});
it('repairs a previously lost recorded entry, but preserves explicit clear across reload',async()=>{
 const {rememberTransactionAttempt,updateTransactionAttempt}=await import('../app/lib/transactionReceipts');
 const {recoverTransactionEntries}=await import('../app/lib/ledgerLog');
 const scope={account:'G'+'A'.repeat(55),network:'test',contractId:'C'+'A'.repeat(55)};
 const hash='c'.repeat(64);
 rememberTransactionAttempt({...scope,hash,action:'create_pod',refId:null});
 updateTransactionAttempt(hash,scope,{status:'success',refId:'17',ledger:8,recorded:true});
 recoverTransactionEntries(scope);expect(listEntries()).toHaveLength(1);
 clearLog();vi.resetModules();const reloaded=await import('../app/lib/ledgerLog');
 reloaded.recoverTransactionEntries(scope);expect(reloaded.listEntries()).toEqual([]);
 const later='d'.repeat(64);rememberTransactionAttempt({...scope,hash:later,action:'create_pod',refId:null});
 updateTransactionAttempt(later,scope,{status:'success',refId:'18',ledger:9});
 reloaded.recoverTransactionEntries(scope);expect(reloaded.listEntries().map(e=>e.txHash)).toEqual([later]);
});
it('does not revive a pre-clear write that completes after another tab clears history',()=>{
 const original=Storage.prototype.setItem;let cleared=false;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
  if(!cleared && (key==='agyion.ledger.v1'||key.startsWith('agyion.ledger.v2:entry:'))){cleared=true;clearLog()}
  original.call(this,key,value);
 });
 logEntry(entry);expect(listEntries()).toEqual([]);
 logEntry({...entry,refId:'19'});expect(listEntries().map(e=>e.refId)).toEqual(['19']);
});
it('retains legacy rows while writing new entries independently',()=>{
 const legacy={...entry,seq:7,ts:'2026-09-25T00:00:00Z'};
 const serialized=JSON.stringify([legacy]);localStorage.setItem('agyion.ledger.v1',serialized);
 logEntry({...entry,refId:'19'});
 expect(localStorage.getItem('agyion.ledger.v1')).toBe(serialized);
 expect(listEntries().map(e=>e.refId)).toEqual(['19','18']);
});
it('does not erase actual action details when a generic recovery row races them',()=>{
 const txHash='e'.repeat(64);
 logEntry({...entry,txHash});
 logEntry({...entry,txHash,status:'recorded',amount:null,detail:'Recovered confirmation'});
 expect(listEntries()).toHaveLength(1);
 expect(listEntries()[0]).toMatchObject({status:'executed',amount:'1',detail:'Opened'});
});
it('keeps history intact when the durable clear marker cannot be saved',()=>{
 logEntry(entry);const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
  if(key.startsWith('agyion.ledger.v2:clear:'))throw new Error('quota');
  original.call(this,key,value);
 });
 expect(()=>clearLog()).toThrow('quota');expect(listEntries()).toHaveLength(1);
});
it('preserves both sets of cleared confirmations when clear operations interleave',async()=>{
 const {rememberTransactionAttempt,updateTransactionAttempt}=await import('../app/lib/transactionReceipts');
 const {recoverTransactionEntries}=await import('../app/lib/ledgerLog');
 const scope={account:'G'+'A'.repeat(55),network:'test',contractId:'C'+'A'.repeat(55)};
 const confirm=(hash:string,refId:string)=>{rememberTransactionAttempt({...scope,hash,action:'create_pod',refId:null});updateTransactionAttempt(hash,scope,{status:'success',ledger:8,refId});logEntry({...entry,...scope,txHash:hash,refId});};
 confirm('a'.repeat(64),'17');const original=Storage.prototype.setItem;let interleaved=false;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
  if(!interleaved&&key.startsWith('agyion.ledger.v2:clear:')){interleaved=true;confirm('b'.repeat(64),'18');clearLog()}
  original.call(this,key,value);
 });
 clearLog();recoverTransactionEntries(scope);expect(listEntries()).toEqual([]);
 confirm('c'.repeat(64),'19');expect(listEntries().map(e=>e.refId)).toEqual(['19']);
});
