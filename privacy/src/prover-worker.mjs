// Dedicated module worker entry. The bundler must resolve local ESM imports;
// this module never fetches artifacts or forwards witness data to a server.
import { createLocalGroth16Prover } from './prover.mjs';
import { record } from './validation.mjs';

export function installLocalProverWorker(scope) {
  let adapter, busy=false;
  scope.addEventListener('message',async event=>{
    let id=0,locked=false;
    try {
      const message=record(event.data,['id','type','payload'],'worker');
      if(!Number.isSafeInteger(message.id)||message.id<1)throw new Error();
      id=message.id;
      if(busy) {scope.postMessage({id,ok:false,error:'LOCAL_PROVER_BUSY'});return;}
      busy=true;locked=true;
      let result;
      if(message.type==='init') {
        if(adapter)throw new Error();
        adapter=await createLocalGroth16Prover(message.payload);result={ready:true};
      } else if(message.type==='prove') {
        if(!adapter)throw new Error();result=await adapter.prove(message.payload);
      } else if(message.type==='verify') {
        if(!adapter)throw new Error();
        const p=record(message.payload,['proof','publicSignals'],'verification');
        result=await adapter.verify(p.proof,p.publicSignals);
      } else throw new Error();
      scope.postMessage({id,ok:true,result});
    } catch {scope.postMessage({id,ok:false,error:'LOCAL_PROVER_FAILED'});}
    finally {if(locked)busy=false;}
  });
}
if(typeof DedicatedWorkerGlobalScope!=='undefined'&&globalThis instanceof DedicatedWorkerGlobalScope)installLocalProverWorker(globalThis);
