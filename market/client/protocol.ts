/** App entrypoint: compiled release only, actual durable storage, no caller-supplied URL or pin. */
import {rpc} from '@stellar/stellar-sdk';
import {requireValue} from '../shared/codec.ts';
import {getMarketRelease} from './release.ts';
import {createMarketReader} from './reader.ts';
import {createMarketCatalog} from './catalog.ts';
import {createMarketJournal} from './journal.ts';
import {createMarketPublisher} from './publication.ts';
import {createMarketLifecycle} from './lifecycle.ts';
import type {MarketProtocolOptions,MarketProtocol} from './protocol-types.ts';
export type * from './protocol-types.ts';
export {MarketFeeBudgetExceededError} from './lifecycle.ts';
export async function createMarketProtocol(options:MarketProtocolOptions):Promise<MarketProtocol>{
 const release=getMarketRelease(),reader=createMarketReader(release),catalog=createMarketCatalog(release),journal=await createMarketJournal();
 try{
  const server=new rpc.Server(release.rpcUrl,{allowHttp:false,timeout:15000});
  const lifecycle=createMarketLifecycle({...options,release,reader,journal,transport:server});
  const control=new AbortController(),publisher=createMarketPublisher({release,reader,journal,catalog,signal:control.signal});let disposed=false;const running=new Set<Promise<unknown>>();
  const alive=()=>requireValue(!disposed,'MARKET_SESSION_DISPOSED');
  function track<T>(run:()=>Promise<T>):Promise<T>{alive();const job=run();running.add(job);return job.finally(()=>running.delete(job));}
  return Object.freeze({
   state:()=>{alive();return reader.state();},offer:(id)=>{alive();return reader.offer(id);},merchant:(seller)=>{alive();return reader.merchant(seller);},active:(seller,claimant)=>{alive();return reader.active(seller,claimant);},
   list:(query,signal)=>{alive();return catalog.list(query,signal);},detail:(id,signal)=>{alive();return catalog.detail(id,signal);},
   currentPublication:(id,signal)=>{alive();return catalog.currentPublication(id,signal);},
   prepare:(command)=>track(()=>lifecycle.prepare(command)),submit:(handle)=>track(()=>lifecycle.submit(handle)),withFeeLimit:lifecycle.withFeeLimit,
   reconcile:(hash)=>track(()=>lifecycle.reconcile(hash)),
   history:()=>{alive();return journal.history();},pending:async()=>{alive();return Object.freeze((await journal.history()).filter(entry=>entry.terminal===null));},
   publish:(value,signature)=>track(()=>publisher.publish(value,signature)),reconcilePublication:(digest)=>track(()=>publisher.reconcilePublication(digest)),retryPublication:(digest)=>track(()=>publisher.retryPublication(digest)),
   dispose(){if(disposed)return;disposed=true;control.abort();lifecycle.dispose();void Promise.allSettled([...running]).then(()=>journal.close());},
  } satisfies MarketProtocol);
 }catch(error){journal.close();throw error;}
}
