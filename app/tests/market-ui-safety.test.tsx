// @vitest-environment node
import {JSDOM} from 'jsdom';
import React from 'react';
import {File as NodeFile,Blob as NodeBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {act,cleanup,fireEvent,render,getQueriesForElement,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import MerchantKeys from '../app/components/market/MerchantKeys';
import MarketSell from '../app/components/market/MarketSell';
import MarketOffer from '../app/components/market/MarketOffer';
import * as vault from '../../market/client/merchant-vault';
import * as codec from '../../market/shared/codec';
import {NATIVE_MARKET_ASSET} from '../app/lib/market/forms';

// Initialize the DOM before ReactDOM chooses its event implementation. Cryptography stays in Node's realm.
await vi.hoisted(async()=>{const {JSDOM}=await import('jsdom');const initial=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});Object.defineProperty(globalThis,'window',{value:initial.window,configurable:true,writable:true});Object.defineProperty(globalThis,'document',{value:initial.window.document,configurable:true,writable:true});});
const mocks=vi.hoisted(()=>({session:{account:'',busy:false,protocol:null as any,execute:vi.fn()},release:{networkId:'',contract:'',assets:[] as string[]},reader:{offer:vi.fn(),merchant:vi.fn()},catalog:{currentPublication:vi.fn()}}));
vi.mock('../app/components/market/MarketSession',()=>({useMarketSession:()=>mocks.session,marketError:()=> 'The action could not be verified.'}));
vi.mock('../../market/client/release',()=>({getMarketRelease:()=>mocks.release}));
vi.mock('../../market/client/reader',()=>({createMarketReader:()=>mocks.reader}));
vi.mock('../../market/client/catalog',()=>({createMarketCatalog:()=>mocks.catalog}));
const account=StrKey.encodeEd25519PublicKey(Buffer.alloc(32,31)),other=StrKey.encodeEd25519PublicKey(Buffer.alloc(32,32));
const password='saved merchant backup password';let downloaded:Blob|undefined;let dom:JSDOM;let screen:ReturnType<typeof getQueriesForElement>;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
beforeEach(()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/app/'});for(const key of ['window','document','navigator','localStorage','HTMLAnchorElement','HTMLElement','HTMLInputElement','Event','MouseEvent'])vi.stubGlobal(key,(dom.window as any)[key]);screen=getQueriesForElement(document.body);
 vi.stubGlobal('File',NodeFile);vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('crypto',webcrypto);downloaded=undefined;localStorage.clear();
 Object.assign(mocks.release,{networkId:codec.TESTNET_NETWORK_ID,contract:StrKey.encodeContract(Buffer.alloc(32,33)),assets:[NATIVE_MARKET_ASSET]});
 Object.assign(mocks.session,{account,busy:false,protocol:null,execute:vi.fn(async()=>({status:'confirmed',offerId:'1'}))});
 mocks.reader.offer.mockReset();mocks.reader.merchant.mockReset();mocks.catalog.currentPublication.mockReset();mocks.catalog.currentPublication.mockResolvedValue({revision:0});
 vi.stubGlobal('URL',class extends URL {static createObjectURL(blob:Blob){downloaded=blob;return 'blob:public-test-download';}static revokeObjectURL(){}});
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
});
afterEach(()=>{cleanup();dom.window.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function checkedKey(epoch=1){const key=vault.createMerchantKey({networkId:mocks.release.networkId,contract:mocks.release.contract,seller:account,keyEpoch:epoch});const packet=await vault.exportMerchantKey(key,password);await vault.checkMerchantKeyBackup(key,new File([JSON.stringify(packet)],'saved.json'),password);return key;}
async function fixture(){
 const key=await checkedKey(),now=Math.floor(Date.now()/1000),metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Dry',shopId:'bakery',shopName:'Bakery',address:'Market Street 1',latE6:41000000,lonE6:29000000,pickupStart:now+60,pickupEnd:now+3600,timezone:'UTC',accessibility:'',imageHash:null};
 const mh=await codec.metadataHash(metadata),terms={asset:NATIVE_MARKET_ASSET,pot:'15000000',start_price:'60000000',floor_price:'-15000000',slope_num:'100000',slope_den:'1',duration_ledgers:1000,lease_ledgers:12,metadata_hash:mh};
 const merchant={seller:account,public_key:Buffer.from(key.publicKey,'hex'),epoch:1};
 const offer={id:1n,seller:account,terms:{...terms,pot:15000000n,start_price:60000000n,floor_price:-15000000n,slope_num:100000n,slope_den:1n,metadata_hash:Buffer.from(mh,'hex')},terms_hash:Buffer.from(await codec.termsHash(terms),'hex'),start_ledger:90,deadline_ledger:1090,state:0,sequence:0n,reservation:{tag:'Empty' as const},settled_to:undefined,settled_price:undefined};
 const record={ledger:100,value:offer,snapshotId:'11'.repeat(32)},draft={version:1 as const,kind:'AgyionPublicListing' as const,metadata,terms};
 mocks.reader.offer.mockResolvedValue(record);mocks.reader.merchant.mockResolvedValue({ledger:100,value:merchant,snapshotId:'22'.repeat(32)});
 return {key,merchant,record,draft};
}

it('requires real encrypted backup reselection and sends the next key epoch for first registration',async()=>{
 render(<MerchantKeys merchant={null} onKey={()=>{}} onRegistered={async()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Create merchant key'}));
 expect(screen.queryByRole('button',{name:'Register merchant key'})).toBeNull();fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:password}});fireEvent.click(screen.getByRole('button',{name:'Save encrypted backup'}));
 await waitFor(()=>expect(downloaded).toBeDefined(),{timeout:30000});expect(screen.queryByRole('button',{name:'Register merchant key'})).toBeNull();
 const saved=new File([await downloaded!.text()],'saved.json');fireEvent.change(screen.getByLabelText('Saved encrypted backup'),{target:{files:[saved]}});fireEvent.click(screen.getByRole('button',{name:'Check saved file'}));
 await screen.findByRole('button',{name:'Register merchant key'}, {timeout:30000});fireEvent.click(screen.getByRole('button',{name:'Register merchant key'}));
 await waitFor(()=>expect(mocks.session.execute).toHaveBeenCalledWith(expect.objectContaining({action:'register_merchant',expectedEpoch:1})));
},60000);

it('clears a revoked key and password when account changes without relying on parent remount',async()=>{
 const onKey=vi.fn(),view=render(<MerchantKeys merchant={null} onKey={onKey} onRegistered={async()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Create merchant key'}));fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:password}});
 mocks.session.account=other;view.rerender(<MerchantKeys merchant={null} onKey={onKey} onRegistered={async()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Lock key'})).toBeNull();expect((screen.getByLabelText('Backup password') as HTMLInputElement).value).toBe('');expect(onKey).toHaveBeenLastCalledWith(null);
});

it('cannot continue funding after unmount while public metadata hashing is pending',async()=>{
 const f=await fixture(),hash=deferred<string>(),onCreated=vi.fn();vi.spyOn(codec,'metadataHash').mockReturnValueOnce(hash.promise);
 const view=render(<MarketSell merchant={f.merchant} signingKey={f.key} onCreated={onCreated}/>);
 for(const [label,value] of Object.entries({'What is available?':'Bread',Quantity:'One bag','Shop name':'Bakery','Shop identifier':'bakery','Pickup address':'Market Street 1',Latitude:'41',Longitude:'29','Pickup starts · your local time':'2026-10-01T10:00','Pickup ends · your local time':'2026-10-01T12:00'}))fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Save listing and fund offer'}));await waitFor(()=>expect(codec.metadataHash).toHaveBeenCalled());view.unmount();
 await act(async()=>{hash.resolve(f.draft.terms.metadata_hash);await hash.promise;});
 expect(mocks.session.execute).not.toHaveBeenCalled();expect(onCreated).not.toHaveBeenCalled();expect(downloaded).toBeUndefined();
});

it('stops a pending publication before local signing or POST when the offer panel becomes inactive',async()=>{
 const f=await fixture(),read=deferred<typeof f.record>(),published=vi.fn();
 const protocol={offer:vi.fn(()=>read.promise),merchant:vi.fn(async()=>({value:f.merchant})),history:vi.fn(async()=>[]),publish:vi.fn(async()=>({status:'accepted'}))};mocks.session.protocol=protocol;
 const props={id:'1',initialDraft:f.draft,signingKey:f.key,active:true,onClose:()=>{},onPublished:published};const view=render(<MarketOffer {...props}/>);
 const button=await screen.findByRole('button',{name:'Publish or renew listing'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);await waitFor(()=>expect(protocol.offer).toHaveBeenCalledTimes(1));
 view.rerender(<MarketOffer {...props} active={false}/>);await act(async()=>{read.resolve(f.record);await read.promise;});
 expect(protocol.merchant).not.toHaveBeenCalled();expect(protocol.publish).not.toHaveBeenCalled();expect(published).not.toHaveBeenCalled();
});

it('reviews the actual fixed positive quote separately from a larger signed ceiling',async()=>{
 const f=await fixture();mocks.session.account=other;mocks.session.protocol={offer:vi.fn(async()=>f.record)};
 render(<MarketOffer id="1" initialDraft={f.draft} signingKey={null} active onClose={()=>{}} onPublished={()=>{}}/>);
 const input=await screen.findByLabelText('Pickup code');const packet={version:1,kind:'AgyionPickup',contract:mocks.release.contract,action:'walk-in',receipt:{offer_id:'1',claimant:other,terms_hash:f.record.value.terms_hash.toString('hex'),key_epoch:1,sequence:'1',valid_from:95,valid_until:107,max_price:'100000000',nonce:'44'.repeat(32)},signature:'ab'.repeat(64)};
 fireEvent.change(input,{target:{value:JSON.stringify(packet)}});fireEvent.click(screen.getByRole('button',{name:'Review code'}));
 expect(await screen.findByText(/Quoted payment 5\.95 XLM/)).toBeTruthy();expect(mocks.session.execute).not.toHaveBeenCalled();
});

it('keeps key creation disabled until merchant registration has actually been checked',()=>{
 const props={merchant:null,onKey:()=>{},onRegistered:async()=>{}};const view=render(<MerchantKeys {...props} merchantKnown={false}/>);
 expect((screen.getByRole('button',{name:'Create merchant key'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Create merchant key'}));expect(screen.queryByRole('button',{name:'Lock key'})).toBeNull();
 view.rerender(<MerchantKeys {...props} merchantKnown/>);expect((screen.getByRole('button',{name:'Create merchant key'}) as HTMLButtonElement).disabled).toBe(false);
});

it('revokes the loaded key and drops an in-flight encrypted export when the workspace hides',async()=>{
 const exported=deferred<any>(),props={merchant:null,onKey:vi.fn(),onRegistered:async()=>{}};vi.spyOn(vault,'exportMerchantKey').mockReturnValueOnce(exported.promise);
 const view=render(<MerchantKeys {...props} active/>);fireEvent.click(screen.getByRole('button',{name:'Create merchant key'}));
 const handle=props.onKey.mock.calls.find(call=>call[0])![0];fireEvent.change(screen.getByLabelText('Backup password'),{target:{value:password}});fireEvent.click(screen.getByRole('button',{name:'Save encrypted backup'}));
 await waitFor(()=>expect(vault.exportMerchantKey).toHaveBeenCalled());view.rerender(<MerchantKeys {...props} active={false}/>);
 await act(async()=>{exported.resolve({fake:'not a key'});await exported.promise;});
 expect(downloaded).toBeUndefined();expect(vault.merchantKeyBackupChecked(handle)).toBe(false);expect(vault.forgetMerchantKey(handle)).toBe(false);expect(props.onKey).toHaveBeenLastCalledWith(null);
});

it.each([{settled:59500000n,label:'Paid 5.95 XLM'},{settled:-5000000n,label:'Received 0.5 XLM'}])('keeps the historical settlement amount when later ledgers change the curve: $label',async({settled,label})=>{
 const f=await fixture();Object.assign(f.record.value,{state:2,settled_price:settled,settled_to:other});f.record.ledger=3000;
 const view=render(<MarketOffer id="1" initialDraft={f.draft} signingKey={null} active onClose={()=>{}} onPublished={()=>{}}/>);
 await screen.findByText('Settled');expect(view.container.querySelector('.market-price-focus strong')?.textContent?.trim()).toBe(label);
 expect(screen.queryByText(/A pickup code fixes/)).toBeNull();expect(mocks.session.execute).not.toHaveBeenCalled();
});
it('shows seller funding returned for a refunded offer instead of quoting the expired curve',async()=>{
 const f=await fixture();Object.assign(f.record.value,{state:3,settled_price:undefined,settled_to:undefined});f.record.ledger=3000;
 const view=render(<MarketOffer id="1" initialDraft={f.draft} signingKey={null} active onClose={()=>{}} onPublished={()=>{}}/>);
 await screen.findByText('Refunded');expect(view.container.querySelector('.market-price-focus strong')?.textContent?.trim()).toBe('Returned funding 1.5 XLM');
 expect(screen.queryByText(/A pickup code fixes/)).toBeNull();expect(mocks.session.execute).not.toHaveBeenCalled();
});
