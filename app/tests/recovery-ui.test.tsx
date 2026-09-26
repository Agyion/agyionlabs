// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Networks, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import TransactionActivity from '../app/components/app/TransactionActivity';
import ProtocolStatus from '../app/components/app/ProtocolStatus';
import { rememberTransactionAttempt } from '../app/lib/transactionReceipts';
import { recoveryTransactionFixture } from './recovery-fixture';
vi.mock('../app/lib/config',()=>({IS_MOCK:false,CONFIG:{networkPassphrase:'Test SDF Network ; September 2015',contractId:'C'+'A'.repeat(55),rpcUrl:'https://example.com'}}));
const account='G'+'A'.repeat(55);const network=Networks.TESTNET;const contractId='C'+'A'.repeat(55);
const {hash,envelopeXdr}=recoveryTransactionFixture('recovery-ui');
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks()});afterEach(cleanup);
it('reconciles a persisted create into an actionable record without wallet signing',async()=>{
 rememberTransactionAttempt({account,network,contractId,action:'create_pod',refId:null,hash});
 const read=vi.spyOn(rpc.Server.prototype,'getTransaction').mockResolvedValue({txHash:hash,envelopeXdr,status:'SUCCESS',ledger:23,returnValue:nativeToScVal(9n,{type:'u64'})} as any);
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>{const url=new URL(screen.getByRole('link',{name:/Open record/}).getAttribute('href')!,'https://agyion.test');expect(url.pathname.replace(/\/$/, '')).toBe('/app');expect(url.search).toBe('?tab=pod&ref=9')});
 expect(screen.getByText(/Confirmed/)).toBeTruthy();expect(read).toHaveBeenCalledOnce();
});
it('late old-account reconciliation cannot replace a new account view',async()=>{
 rememberTransactionAttempt({account,network,contractId,action:'claim',refId:'3',hash});
 let finish!:(result:any)=>void;vi.spyOn(rpc.Server.prototype,'getTransaction').mockImplementation(()=>new Promise(r=>{finish=r}));
 const {rerender}=render(<TransactionActivity wallet={{address:account}}/>);
 rerender(<TransactionActivity wallet={{address:'G'+'B'.repeat(55)}}/>);
 await act(async()=>{finish({txHash:hash,envelopeXdr,status:'SUCCESS',ledger:23})});
 expect(screen.queryByText(/Transaction activity/)).toBeNull();
});
it('keeps unavailable and incompatible readiness distinct and links disabled actions to status',()=>{
 const retry=vi.fn();const {rerender}=render(<ProtocolStatus readiness={{status:'unavailable',retry}}/>);
 expect(screen.getByRole('status').id).toBe('protocol-availability');expect(screen.getByText(/Network unavailable/)).toBeTruthy();
 rerender(<ProtocolStatus readiness={{status:'incompatible',retry}}/>);expect(screen.getByText(/Contract v3 deployment/)).toBeTruthy();
 rerender(<ProtocolStatus readiness={{status:'ready',retry}}/>);expect(screen.queryByRole('status')).toBeNull();
});
it('keeps a recovery warning and a read-only retry visible when stored attempts are unreadable',async()=>{
 localStorage.setItem('agyion.transactions.v1','not-json');
 const read=vi.spyOn(rpc.Server.prototype,'getTransaction');
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Recovery storage unavailable'));
 expect(screen.getByRole('button',{name:'Check transaction status'})).toBeTruthy();
 expect(read).not.toHaveBeenCalled();
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
it('keeps an older confirmed creation awaiting its ID visible with a retry guard notice',async()=>{
 const {updateTransactionAttempt}=await import('../app/lib/transactionReceipts');
 for(let n=1;n<=22;n++){
  const hash=n.toString(16).padStart(64,'0');
  rememberTransactionAttempt({account,network,contractId,action:n===1?'create_pod':'claim',refId:n===1?null:String(n),hash});
  updateTransactionAttempt(hash,{account,network,contractId},{status:'success',ledger:20+n});
 }
 vi.spyOn(rpc.Server.prototype,'getTransaction').mockResolvedValue({status:'NOT_FOUND'} as any);
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>expect(screen.getByText('1'.padStart(64,'0'))).toBeTruthy());
 expect(screen.getByText(/create pod · Confirmed/)).toBeTruthy();
 expect(screen.getByText(/1 unresolved/)).toBeTruthy();
 expect(screen.getByText(/record ID.*recovered.*do not create|do not create.*record ID/i)).toBeTruthy();
});
