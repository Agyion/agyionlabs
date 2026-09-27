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
 rerender(<ProtocolStatus readiness={{status:'incompatible',retry}}/>);expect(screen.getByText(/Read only\. Deployment verification failed\./)).toBeTruthy();
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

it('shows another public contract unresolved hash without querying it or linking to the active record',async()=>{
 const otherContract='C'+'B'.repeat(55),otherHash='b'.repeat(64);
 rememberTransactionAttempt({account,network,contractId:otherContract,action:'claim',refId:'9',hash:otherHash});
 const read=vi.spyOn(rpc.Server.prototype,'getTransaction');
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>expect(screen.getByText(otherHash)).toBeTruthy());
 expect(screen.getByText(otherContract)).toBeTruthy();
 expect(screen.getByText(/another public deployment/i)).toBeTruthy();
 expect(screen.queryByRole('link',{name:/Open record/})).toBeNull();
 expect(screen.getByRole('link',{name:/View transaction/}).getAttribute('href')).toContain(otherHash);
 expect(read).not.toHaveBeenCalled();
});

it('checks only the configured contract while retaining other contracts for the same source',async()=>{
 const otherHash='c'.repeat(64),otherContract='C'+'B'.repeat(55);
 rememberTransactionAttempt({account,network,contractId,action:'claim',refId:'9',hash});
 rememberTransactionAttempt({account,network,contractId:otherContract,action:'claim',refId:'9',hash:otherHash});
 rememberTransactionAttempt({account:'G'+'B'.repeat(55),network,contractId:otherContract,action:'claim',refId:'9',hash:'d'.repeat(64)});
 rememberTransactionAttempt({account,network:Networks.PUBLIC,contractId:otherContract,action:'claim',refId:'9',hash:'e'.repeat(64)});
 const read=vi.spyOn(rpc.Server.prototype,'getTransaction').mockResolvedValue({txHash:hash,envelopeXdr,status:'SUCCESS',ledger:23} as any);
 render(<TransactionActivity wallet={{address:account}}/>);
 await waitFor(()=>expect(screen.getByText(/Confirmed/)).toBeTruthy());
 expect(screen.getByText(otherHash)).toBeTruthy();
 expect(screen.queryByText('d'.repeat(64))).toBeNull();expect(screen.queryByText('e'.repeat(64))).toBeNull();
 expect(screen.getAllByRole('link',{name:/Open record/})).toHaveLength(1);
 expect(read).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledWith(hash);
 expect(screen.getByText(/1 unresolved/)).toBeTruthy();
});
