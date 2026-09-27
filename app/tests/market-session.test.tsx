// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MarketSession,useMarketSession,marketError} from '../app/components/market/MarketSession';
const mocks=vi.hoisted(()=>({bind:vi.fn(),create:vi.fn(),protocol:null as any,options:null as any}));
vi.mock('../app/lib/private/wallet-session',()=>({bindPrivateWallet:(...args:any[])=>mocks.bind(...args)}));
vi.mock('../app/lib/wallet',()=>({walletSessionVersion:()=>1,onWalletSessionChange:()=>()=>{}}));
vi.mock('../../market/client/protocol',()=>({createMarketProtocol:(options:any)=>{mocks.options=options;return mocks.create(options);}}));
function Probe(){const s=useMarketSession();return <><output>{s.protocol?'ready':'blocked'}</output><button onClick={()=>void s.execute({action:'register_merchant',publicKey:'ab'.repeat(32),expectedEpoch:1})}>Run</button></>;}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
beforeEach(()=>{mocks.protocol={prepare:vi.fn(async()=>({id:'prepared'})),withFeeLimit:vi.fn(x=>x),submit:vi.fn(async()=>({status:'confirmed'})),dispose:vi.fn()};mocks.bind.mockReset().mockResolvedValue({account:'seller',wallet:{}});mocks.create.mockReset().mockResolvedValue(mocks.protocol);mocks.options=null;Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');})});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const view=(active=true)=><MarketSession account="seller" active={active}><Probe/></MarketSession>;
it('does not submit a late preparation after the workspace hides',async()=>{
 const prepare=deferred<any>();mocks.protocol.prepare.mockReturnValueOnce(prepare.promise);const mounted=render(view());await screen.findByText('ready');fireEvent.click(screen.getByRole('button',{name:'Run'}));await waitFor(()=>expect(mocks.protocol.prepare).toHaveBeenCalledTimes(1));mounted.rerender(view(false));
 await act(async()=>{prepare.resolve({id:'prepared'});await prepare.promise;});expect(mocks.protocol.submit).not.toHaveBeenCalled();expect(mocks.protocol.withFeeLimit).not.toHaveBeenCalled();expect(mocks.protocol.dispose).toHaveBeenCalledTimes(1);
});
it('cancels a pending fee confirmation when the session becomes inactive',async()=>{
 const mounted=render(view());await screen.findByText('ready');let result!:Promise<boolean>;const signal=new AbortController().signal;
 await act(async()=>{result=mocks.options.confirmFee({feeStroops:'100',maxFeeStroops:'10000000',source:'seller',action:'create_offer',signal});});expect(screen.getByRole('dialog')).toBeTruthy();mounted.rerender(view(false));expect(await result).toBe(false);expect(screen.queryByRole('dialog')).toBeNull();
});
it('never opens a durable protocol for wallet binding that finishes after unmount',async()=>{
 const bound=deferred<any>();mocks.bind.mockReturnValueOnce(bound.promise);const mounted=render(view());mounted.unmount();await act(async()=>{bound.resolve({account:'seller',wallet:{}});await bound.promise;});expect(mocks.create).not.toHaveBeenCalled();
});

it('distinguishes cancelling a fee review from exceeding the fee budget',()=>{expect(marketError(new Error('MARKET_FEE_CONFIRMATION_CANCELLED'))).toContain('cancelled');expect(marketError(new Error('MARKET_FEE_BUDGET_EXCEEDED'))).toContain('exceeds');});

it.each([
 ['Axios network error',Object.assign(new Error('Network Error'),{code:'ERR_NETWORK'})],
 ['browser fetch error',new TypeError('Failed to fetch')],
 ['Firefox fetch error',new TypeError('NetworkError when attempting to fetch resource.')],
 ['request timeout',new DOMException('The operation timed out.','TimeoutError')],
] as const)('classifies %s as transport failure without asking to reconnect the wallet',(_label,error)=>{
 const message=marketError(error);expect(message).toContain('network request');expect(message).not.toMatch(/wallet|reconnect/i);expect(message).toContain('Recovery');
});
it.each(['WALLET_SESSION_CHANGED','TESTNET_WALLET_REQUIRED','CONNECTED_WALLET_REQUIRED','Wallet is not on Stellar testnet. Switch networks and connect again.'])('keeps real wallet failure %s distinct from transport failure',message=>{
 expect(marketError(new Error(message))).toContain('Reconnect on Stellar testnet');
});
it.each([
 new DOMException('The operation was aborted.','AbortError'),
 Object.assign(new Error('canceled'),{name:'CanceledError',code:'ERR_CANCELED'}),
 new Error('MARKET_SESSION_DISPOSED'),
])('does not infer signing, delivery, or a disconnected wallet from interrupted work',error=>{
 const message=marketError(error);expect(message).toContain('interrupted');expect(message).toContain('Recovery');expect(message).not.toMatch(/signing|reconnect|not sent|submitted successfully/i);
});
it('treats a provider network mismatch as failed verification, not a wallet network selection error',()=>{
 const message=marketError(new Error('MARKET_NETWORK_MISMATCH'));expect(message).toContain('could not be verified');expect(message).not.toContain('Reconnect');
});
