// Browser-only local worker transport. A bundler must resolve the worker entry;
// no HTTP prover, storage, wallet or production UI is installed here.
export async function createLocalGroth16WorkerProver(config, {signal} = {}) {
  if(signal?.aborted)throw new Error('LOCAL_WORKER_CLOSED');
  if(typeof Worker!=='function')throw new Error('LOCAL_WORKER_UNAVAILABLE');
  const worker=new Worker(new URL('./prover-worker.mjs',import.meta.url),{type:'module',name:'agyion-local-prover'});
  let pending=null,sequence=0,closed=false;
  const dispose=()=>{
    if(closed)return;closed=true;worker.terminate();
    signal?.removeEventListener('abort',dispose);
    if(pending){clearTimeout(pending.timer);pending.reject(new Error('LOCAL_WORKER_CLOSED'));pending=null;}
  };
  signal?.addEventListener('abort',dispose,{once:true});
  worker.addEventListener('message',event=>{
    const reply=event.data,current=pending;
    if(!current||!reply||reply.id!==current.id)return;
    clearTimeout(current.timer);pending=null;
    if(reply.ok===true)current.resolve(reply.result);
    else current.reject(new Error(reply.error==='LOCAL_PROVER_BUSY'?'LOCAL_PROVER_BUSY':'LOCAL_PROVER_FAILED'));
  });
  worker.addEventListener('error',event=>{event.preventDefault();dispose();});
  worker.addEventListener('messageerror',dispose);
  const request=(type,payload)=>new Promise((resolve,reject)=>{
    if(closed){reject(new Error('LOCAL_WORKER_CLOSED'));return;}
    if(pending){reject(new Error('LOCAL_PROVER_BUSY'));return;}
    const id=++sequence;
    const timer=setTimeout(dispose,300_000);
    pending={id,resolve,reject,timer};
    try {worker.postMessage({id,type,payload});}
    catch {clearTimeout(timer);pending=null;reject(new Error('LOCAL_PROVER_FAILED'));}
  });
  try {
    const ready=await request('init',config);
    if(!ready||ready.ready!==true)throw new Error('LOCAL_PROVER_FAILED');
  } catch {dispose();throw new Error('LOCAL_PROVER_FAILED');}
  return Object.freeze({
    prove:witness=>request('prove',witness),
    verify:async(proof,publicSignals)=>{try{return await request('verify',{proof,publicSignals})===true;}catch{return false;}},
    dispose,
  });
}
