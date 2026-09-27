import test from 'node:test';
import assert from 'node:assert/strict';
import { installLocalProverWorker } from '../src/prover-worker.mjs';
import { createLocalGroth16WorkerProver } from '../src/prover-worker-host.mjs';

test('worker refuses uninitialized proof requests, unknown commands and arbitrary artifact URLs without echoing witness secrets',async()=>{
  let receive;const replies=[];
  installLocalProverWorker({addEventListener(type,handler){assert.equal(type,'message');receive=handler;},postMessage(value){replies.push(value);}});
  await receive({data:{id:1,type:'prove',payload:{secret:'DO_NOT_ECHO'}}});
  await receive({data:{id:2,type:'unknown',payload:null}});
  await receive({data:{id:3,type:'init',payload:{wasm:'https://invalid.example/private'}}});
  assert.deepEqual(replies,[1,2,3].map(id=>({id,ok:false,error:'LOCAL_PROVER_FAILED'})));
});

test('worker host preserves local proof payload, rejects concurrent work and terminates pending calls explicitly',async()=>{
  const previous=globalThis.Worker;let instance;
  class FakeWorker {
    listeners={};sent=[];terminated=false;
    constructor(url,options){assert.ok(url.href.endsWith('/prover-worker.mjs'));assert.equal(options.type,'module');instance=this;}
    addEventListener(type,handler){this.listeners[type]=handler;}
    postMessage(message){this.sent.push(structuredClone(message));if(message.type==='init')queueMicrotask(()=>this.reply({ready:true}));}
    reply(result){this.listeners.message({data:{id:this.sent.at(-1).id,ok:true,result}});}
    terminate(){this.terminated=true;}
  }
  globalThis.Worker=FakeWorker;
  try {
    const adapter=await createLocalGroth16WorkerProver({test:'transport only; no successful cryptographic engine'});
    const witness={privateField:123n},pending=adapter.prove(witness);witness.privateField=999n;
    assert.equal(instance.sent.at(-1).payload.privateField,123n);
    await assert.rejects(adapter.prove({}),/LOCAL_PROVER_BUSY/);
    adapter.dispose();await assert.rejects(pending,/LOCAL_WORKER_CLOSED/);assert.equal(instance.terminated,true);
    assert.equal(await adapter.verify('bad',[]),false);
  } finally {if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});

test('abort terminates initialization and removes its cancellation listener',{timeout:1500},async()=>{
  const previous=globalThis.Worker;let instance,removed=0;
  class WaitingWorker {
    constructor(){instance=this;}
    addEventListener(){}
    postMessage(){}
    terminate(){this.terminated=true;}
  }
  globalThis.Worker=WaitingWorker;
  const controller=new AbortController();
  const originalRemove=controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener=(...args)=>{removed++;originalRemove(...args);};
  try {
    const initialization=createLocalGroth16WorkerProver({}, {signal:controller.signal});
    controller.abort();
    await assert.rejects(initialization,/LOCAL_PROVER_FAILED/);
    assert.equal(instance.terminated,true);
    assert.equal(removed,1);
    instance=undefined;
    await assert.rejects(createLocalGroth16WorkerProver({}, {signal:controller.signal}),/LOCAL_WORKER_CLOSED/);
    assert.equal(instance,undefined,'already cancelled operations must not create another worker');
  } finally {if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});

test('abort after initialization closes an in-flight proof without returning a late success',{timeout:1500},async()=>{
  const previous=globalThis.Worker;let instance;
  class ControlledWorker {
    listeners={};sent=[];
    constructor(){instance=this;}
    addEventListener(type,handler){this.listeners[type]=handler;}
    postMessage(message){this.sent.push(message);if(message.type==='init')queueMicrotask(()=>this.reply({ready:true}));}
    reply(result){this.listeners.message({data:{id:this.sent.at(-1).id,ok:true,result}});}
    terminate(){this.terminated=true;}
  }
  globalThis.Worker=ControlledWorker;
  try {
    const controller=new AbortController();
    const adapter=await createLocalGroth16WorkerProver({}, {signal:controller.signal});
    const pending=adapter.prove({privateField:123n});
    controller.abort();
    instance.reply({proof:'late result',publicSignals:[]});
    await assert.rejects(pending,/LOCAL_WORKER_CLOSED/);
    assert.equal(instance.terminated,true);
    await assert.rejects(adapter.prove({}),/LOCAL_WORKER_CLOSED/);
  } finally {if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
