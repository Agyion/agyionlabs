// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Networks, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import TransactionActivity from '../app/components/app/TransactionActivity';
import ProtocolStatus from '../app/components/app/ProtocolStatus';
import { rememberTransactionAttempt } from '../app/lib/transactionReceipts';
vi.mock('../app/lib/config',()=>({IS_MOCK:false,CONFIG:{networkPassphrase:'Test SDF Network ; September 2015',contractId:'C'+'A'.repeat(55),rpcUrl:'https://example.com'}}));
const account='G'+'A'.repeat(55);const network=Networks.TESTNET;const contractId='C'+'A'.repeat(55);
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks()});afterEach(cleanup);
it('reconciles a persisted create into an actionable record without wallet signing',async()=>{
 rememberTransactionAttempt({account,network,contractId,action:'create_pod',refId:null,hash:'b'.repeat(64)});
 const read=vi.spyOn(rpc.Server.prototype,'getTransaction').mockResolvedValue({status:'SUCCESS',ledger:23,returnValue:nativeToScVal(9n,{type:'u64'})} as any);
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>{const url=new URL(screen.getByRole('link',{name:/Open record/}).getAttribute('href')!,'https://agyion.test');expect(url.pathname.replace(/\/$/, '')).toBe('/app');expect(url.search).toBe('?tab=pod&ref=9')});
 expect(screen.getByText(/Confirmed/)).toBeTruthy();expect(read).toHaveBeenCalledOnce();
});
it('late old-account reconciliation cannot replace a new account view',async()=>{
 rememberTransactionAttempt({account,network,contractId,action:'claim',refId:'3',hash:'b'.repeat(64)});
 let finish!:(result:any)=>void;vi.spyOn(rpc.Server.prototype,'getTransaction').mockImplementation(()=>new Promise(r=>{finish=r}));
 const {rerender}=render(<TransactionActivity wallet={{address:account}}/>);
 rerender(<TransactionActivity wallet={{address:'G'+'B'.repeat(55)}}/>);
 await act(async()=>{finish({status:'SUCCESS',ledger:23})});
 expect(screen.queryByText(/Transaction activity/)).toBeNull();
});
it('keeps unavailable and incompatible readiness distinct and links disabled actions to status',()=>{
 const retry=vi.fn();const {rerender}=render(<ProtocolStatus readiness={{status:'unavailable',retry}}/>);
 expect(screen.getByRole('status').id).toBe('protocol-availability');expect(screen.getByText(/Network unavailable/)).toBeTruthy();
 rerender(<ProtocolStatus readiness={{status:'incompatible',retry}}/>);expect(screen.getByText(/Contract v2 upgrade/)).toBeTruthy();
 rerender(<ProtocolStatus readiness={{status:'ready',retry}}/>);expect(screen.queryByRole('status')).toBeNull();
});
it('keeps an older unresolved hash visible behind more than20 completed attempts',async()=>{
 const {updateTransactionAttempt}=await import('../app/lib/transactionReceipts');
 for(let n=1;n<=22;n++){
  const hash=n.toString(16).padStart(64,'0');rememberTransactionAttempt({account,network,contractId,action:'claim',refId:String(n),hash});
  if(n>1)updateTransactionAttempt(hash,{account,network,contractId},{status:'success',ledger:20+n});
 }
 vi.spyOn(rpc.Server.prototype,'getTransaction').mockResolvedValue({status:'NOT_FOUND'} as any);
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>expect(screen.getByText('1'.padStart(64,'0'))).toBeTruthy());
 expect(screen.getByText(/1 unresolved/)).toBeTruthy();
});
