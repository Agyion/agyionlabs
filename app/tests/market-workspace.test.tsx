// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import FadeMarketPanel from '../app/components/market/FadeMarketPanel';
const mocks=vi.hoisted(()=>({params:'',session:{account:'seller',protocol:null as any,busy:false,error:null,feeLimit:'1',setFeeLimit:vi.fn()}}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(mocks.params)}));
vi.mock('../app/lib/config',()=>({IS_MOCK:false}));
vi.mock('../../market/client/release',()=>({getMarketRelease:()=>({contract:'test-scope'})}));
vi.mock('../app/components/market/MarketSession',()=>({MarketSession:({children}:any)=>children,useMarketSession:()=>mocks.session,marketError:()=> 'Unavailable'}));
vi.mock('../app/components/market/MarketBrowse',()=>({default:()=> <div>Catalog</div>}));
vi.mock('../app/components/market/MarketSell',()=>({default:()=> <div>Sell form</div>}));
vi.mock('../app/components/market/MerchantKeys',()=>({default:({merchantKnown,merchant}:any)=> <><output aria-label="Merchant known">{String(merchantKnown)}</output><output aria-label="Merchant epoch">{merchant?.epoch ?? 'unregistered'}</output></>}));
vi.mock('../app/components/market/MarketOffer',()=>({default:({id}:any)=> <output aria-label="Selected offer">{id}</output>}));
const wallet={address:'seller',connecting:false,connectKit:vi.fn()} as any;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
beforeEach(()=>{mocks.params='';mocks.session.protocol={merchant:vi.fn(async()=>({value:null})),history:vi.fn(async()=>[])};});afterEach(cleanup);
const panel=(active=true)=><FadeMarketPanel wallet={wallet} active={active} publicRecordRequested={false} legacy={<p>Legacy</p>}/>;
it('reacts to a new positive u64 offer query while already mounted and never confuses legacy refs',()=>{
 mocks.params='tab=fade&marketOffer=1';const view=render(panel());expect(screen.getByLabelText('Selected offer').textContent).toBe('1');
 mocks.params='tab=fade&marketOffer=22';view.rerender(panel());expect(screen.getByLabelText('Selected offer').textContent).toBe('22');
 for(const params of ['tab=fade&ref=23','marketOffer=0','marketOffer=01','marketOffer=18446744073709551616','marketOffer=-2']){mocks.params=params;view.rerender(panel());expect(screen.queryByLabelText('Selected offer')).toBeNull();}
});
it('distinguishes pending and failed merchant reads from a verified missing registration',async()=>{
 const check=deferred<any>();mocks.session.protocol.merchant.mockReturnValueOnce(check.promise);render(panel());expect(screen.getByLabelText('Merchant known').textContent).toBe('false');
 await act(async()=>{check.resolve({value:null});await check.promise;});expect(screen.getByLabelText('Merchant known').textContent).toBe('true');
 cleanup();mocks.session.protocol.merchant.mockRejectedValueOnce(new Error('rpc unavailable'));render(panel());await screen.findByText('Unavailable');expect(screen.getByLabelText('Merchant known').textContent).toBe('false');
});
it('cannot navigate to a recovered offer after the workspace becomes inactive',async()=>{
 const result=deferred<any>(),entry={attempt:{kind:'transaction',source:'seller',action:'create_offer',hash:'aa'.repeat(32)},terminal:null};
 mocks.session.protocol.history.mockResolvedValue([entry]);mocks.session.protocol.reconcile=vi.fn(()=>result.promise);
 const view=render(panel());fireEvent.click(screen.getByRole('button',{name:'Recovery'}));fireEvent.click(await screen.findByRole('button',{name:'Check result'}));
 await waitFor(()=>expect(mocks.session.protocol.reconcile).toHaveBeenCalledTimes(1));view.rerender(panel(false));
 await act(async()=>{result.resolve({status:'confirmed',offerId:'19'});await result.promise;});
 expect(screen.queryByLabelText('Selected offer')).toBeNull();expect(screen.getByRole('button',{name:'Recovery'}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByText(/Transaction result/)).toBeNull();
});


it.each(['confirmed','pending'])('refreshes merchant registration only after an explicitly reconciled confirmed result: %s',async status=>{
 const entry={attempt:{kind:'transaction',source:'seller',action:'register_merchant',hash:'bb'.repeat(32)},terminal:null};
 mocks.session.protocol.history.mockResolvedValue([entry]);mocks.session.protocol.reconcile=vi.fn(async()=>({status,offerId:null}));
 mocks.session.protocol.prepare=vi.fn();mocks.session.protocol.submit=vi.fn();
 mocks.session.protocol.merchant.mockResolvedValueOnce({value:null}).mockResolvedValue({value:{epoch:1}});
 render(panel());await waitFor(()=>expect(screen.getByLabelText('Merchant known').textContent).toBe('true'));
 expect(screen.getByLabelText('Merchant epoch').textContent).toBe('unregistered');
 fireEvent.click(screen.getByRole('button',{name:'Recovery'}));fireEvent.click(await screen.findByRole('button',{name:'Check result'}));
 await screen.findByText(`Transaction result: ${status}.`);
 await waitFor(()=>expect(mocks.session.protocol.merchant).toHaveBeenCalledTimes(status==='confirmed'?2:1));
 fireEvent.click(screen.getByRole('button',{name:'Sell'}));
 expect(screen.getByLabelText('Merchant epoch').textContent).toBe(status==='confirmed'?'1':'unregistered');
 expect(mocks.session.protocol.reconcile).toHaveBeenCalledTimes(1);expect(mocks.session.protocol.prepare).not.toHaveBeenCalled();expect(mocks.session.protocol.submit).not.toHaveBeenCalled();
});
