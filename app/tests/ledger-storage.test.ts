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
 localStorage.setItem('agyion.ledger.v1',JSON.stringify([{...row,network:{bad:true}}]));expect(listEntries()).toEqual([]);
});
