import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Only isolated roots, original deployment authority and the external CLI are
// substituted. All custody I/O, actor/credential crypto and envelope gates are
// real. Observations additionally disclose the existing executable-auth double.
const child = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as realUrl from 'node:url';
import * as processes from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
const [root,home,mode] = process.argv.slice(2);
const url = name => realUrl.pathToFileURL(path.join(root,'scripts/lib',name)).href;
const {Account,Address,Keypair,Networks,Operation,SorobanDataBuilder,TransactionBuilder,nativeToScVal,xdr} = createRequire(path.join(root,'app/package.json'))('@stellar/stellar-sdk');
const seller='GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
const manifestSha256='e3094fa5482fef6b6efb986d54d2540dcbd5a426c65fc856c1b9565825d0f5fc';
const originalPlanHash='21fb2aebbebd48c5802e89dadba72a2aaceb3d58642dda2d24bd28ae4471b6b7';
const roles=['recipient','relayer','venue','podTimelock','podMixed','attester','agent'];
const keys=Object.fromEntries(roles.map((r,i)=>[r,Keypair.fromRawEd25519Seed(Buffer.alloc(32,i+70))]));
const originalRun=path.join(home,'artifacts/original');
const base=path.join(home,'artifacts/public-v4-lifecycle'),run='signing-fixture',dir=path.join(base,'runs',run);
let now=1800001000, randoms=0,signs=0,cliCalls=[],network=0,cliMode='wrong-signature',onAuthority=null,onSign=null,wrongAuthority=false;
const RealDate=Date;
globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:['2026-09-27T00:00:00.000Z']));} static now(){return now*1000;} };
globalThis.fetch=()=>{network++;throw Error('network forbidden');};
Keypair.random=()=>keys[roles[randoms++]];
const realSign=Keypair.prototype.sign;
Keypair.prototype.sign=function(bytes){signs++;if(onSign)onSign();return realSign.call(this,bytes);};
mock.module('node:url',{namedExports:{...realUrl,fileURLToPath:value=>{const p=realUrl.fileURLToPath(value);return path.resolve(p)===path.resolve(root)?home:p;}}});
mock.module('node:child_process',{namedExports:{...processes,spawnSync:(command,args,options)=>{
 cliCalls.push({command,args,options});assert.equal(command,'stellar');assert.equal(options.shell,undefined);
 assert.equal(options.timeout,20000);assert.equal(options.maxBuffer,1048576);assert.equal(options.encoding,'utf8');assert.deepEqual(options.stdio,['pipe','pipe','pipe']);
 assert.equal(Object.keys(options.env).some(k=>k.startsWith('STELLAR_')||k.startsWith('SOROBAN_')),false);
 if(args[0]==='keys'){
  assert.deepEqual(args,['keys','address','agyion-public-v4-testnet','--config-dir',path.join(originalRun,'identity')]);
  if(cliMode==='alias-expiry')now+=90;
  if(cliMode==='alias-tamper')fs.chmodSync(path.join(originalRun,'identity'),0o755);
  return {status:0,stdout:(cliMode==='wrong-alias'?keys.recipient.publicKey():seller)+'\n'};
 }
 assert.deepEqual(args,['tx','sign','--sign-with-key','agyion-public-v4-testnet','--config-dir',path.join(originalRun,'identity'),'--rpc-url','https://soroban-testnet.stellar.org','--network-passphrase',Networks.TESTNET,'--quiet']);
 assert.equal(typeof options.input,'string');
 if(cliMode==='throw')throw Error(keys.recipient.secret());
 if(cliMode==='timeout')return {status:null,signal:'SIGTERM',error:Error(keys.recipient.secret()),stderr:keys.recipient.secret()};
 if(cliMode==='nonzero')return {status:1,stdout:keys.recipient.secret(),stderr:keys.recipient.secret()};
 if(cliMode==='oversize')return {status:0,stdout:'A'.repeat(1048577)};
 if(cliMode==='junk')return {status:0,stdout:'not an envelope '+keys.recipient.secret()};
 if(cliMode==='unsigned')return {status:0,stdout:options.input};
 if(cliMode==='sign-expiry')now+=90;
 if(cliMode==='sign-tamper')fs.chmodSync(path.join(originalRun,'identity'),0o755);
 const tx=TransactionBuilder.fromXDR(options.input,Networks.TESTNET);tx.sign(keys.recipient);
 return {status:0,stdout:'\n'+tx.toXDR()+'\n'};
}}});
for(const p of ['artifacts','artifacts/original','artifacts/original/identity','deployments'])fs.mkdirSync(path.join(home,p),{mode:0o700});
fs.copyFileSync(path.join(root,'deployments/public-v4-testnet.json'),path.join(home,'deployments/public-v4-testnet.json'));
const originalPlan={schema:'agyion-public-kernel-offline-plan-v1',testOnly:true,manifestSha256,wasmSha256:'d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186',networkPassphrase:Networks.TESTNET,rpcUrl:'https://soroban-testnet.stellar.org',identityDirectory:path.join(originalRun,'identity'),sourceAccount:seller,intendedContractId:'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ',assets:['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC','CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA']};
mock.module(realUrl.pathToFileURL(path.join(root,'scripts/deploy-public-testnet.mjs')).href,{namedExports:{loadDeploymentPlan:async(run,hash)=>{
 assert.equal(run,originalRun);assert.equal(hash,manifestSha256);if(onAuthority)await onAuthority();
 return {run,manifestSha256:hash,planSha256:wrongAuthority?'11'.repeat(32):originalPlanHash,plan:structuredClone(originalPlan)};
}}});
if(mode==='observations'){
 const readback=await import(url('public-lifecycle-readback.mjs'));
 mock.module(url('public-lifecycle-readback.mjs'),{namedExports:{...readback,verifyPublicLifecycleSnapshot:(a,b)=>({...readback.verifyPublicLifecycleState(a,b),schema:'agyion-public-v4-lifecycle-snapshot-v1',codeBytesAuthenticated:true})}});
}
const api=await import(url('public-lifecycle-run.mjs'));
assert.equal(typeof api.createPublicLifecycleSigning,'function','protected signing factory must be exported');
const {publicLifecycleCallIntent,bindPublicLifecycleCall}=await import(url('public-lifecycle-call.mjs'));
const {validateSignedPublicLifecycleEnvelope}=await import(url('public-lifecycle-envelope.mjs'));
const context=await api.preparePublicLifecycleRun({run,originalRun,manifestSha256}),{plan,planSha256}=context;
const scope={run,planSha256};
process.env.STELLAR_SECRET=keys.recipient.secret();process.env.SOROBAN_RPC_URL='https://wrong.invalid';
cliCalls=[];signs=0;
const signing=await api.createPublicLifecycleSigning(scope);
assert.equal(cliCalls.length,0);assert.equal(signs,0);assert.equal(randoms,7);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const addr=a=>new Address(a).toScVal(),int=n=>nativeToScVal(BigInt(n),{type:'i128'}),wire=a=>a.map(v=>v.toXDR('base64'));
const tree=(target,method,args,children=[])=>new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(target).toScAddress(),functionName:method,args})),subInvocations:children});
function callInput(index,headLedger=1000){return {stepId:plan.steps[index].id,headLedger,...(['confirm_handoff','attest','envoy_claim'].includes(plan.steps[index].method)?{timestamp:'1800000000'}:{})};}
function bound(index){const input=callInput(index),intent=publicLifecycleCallIntent({plan,...input});if(intent.credential)input.signatureHex=keys[intent.credential.role].sign(Buffer.from(intent.credential.payloadHex,'hex')).toString('hex');const derived=bindPublicLifecycleCall({plan,...input});return {stepId:input.stepId,binding:{sequence:'11',headLedger:input.headLedger,argsXdr:derived.call.argsXdr,...(input.timestamp?{timestamp:input.timestamp}:{}),...(input.signatureHex?{signatureHex:input.signatureHex}:{})},call:derived.call};}
function unsigned(b,maxTime=now+80){const c=b.call,args=c.argsXdr.map(v=>xdr.ScVal.fromXDR(v,'base64'));const funding=['create_fade','create_pod','create_trigger'].includes(c.method),positive=c.method==='confirm_handoff'&&c.handoff.price==='1000000';const children=funding?[tree(plan.assets[0],'transfer',[addr(seller),addr(plan.contractId),int(10000000)])]:positive?[tree(plan.assets[0],'transfer',[addr(plan.actors.recipient),addr(seller),int(1000000)])]:[];const auth=funding||positive||['claim','claim_pod','create_mandate','revoke_mandate','transfer'].includes(c.method)?[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:tree(c.target,c.method,args,children)})]:[];return new TransactionBuilder(new Account(c.sourceAccount,'10'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeContractFunction({contract:c.target,function:c.method,args,auth})).setSorobanData(new SorobanDataBuilder().setResourceFee('900').build()).setTimebounds(0,maxTime).build().toXDR();}
const callbackInput=(b,unsignedXdr=unsigned(b))=>({unsignedXdr,sourceAccount:b.call.sourceAccount,hash:TransactionBuilder.fromXDR(unsignedXdr,Networks.TESTNET).hash().toString('hex')});
const signer=b=>signing.envelopeSigner({stepId:b.stepId,binding:b.binding});
function safe(e){assert.match(e.message,/^LIFECYCLE_RUN_[A-Z_]+$/);for(const key of Object.values(keys))assert.equal(String(e.stack).includes(key.secret()),false);assert.equal(e.cause,undefined);return true;}
function noSecrets(value){for(const k of Object.values(keys))assert.equal(JSON.stringify(value).includes(k.secret()),false);}
async function readonly(action){const names=['writeFileSync','writeSync','mkdirSync','fsyncSync','fdatasyncSync','renameSync','unlinkSync','chmodSync'];const old=Object.fromEntries(names.map(n=>[n,fs[n]])),open=fs.openSync;try{for(const n of names)fs[n]=()=>{throw Error('unexpected write');};fs.openSync=(p,flags,...a)=>{assert.equal(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND),0);return open(p,flags,...a);};return await action();}finally{Object.assign(fs,old);fs.openSync=open;}}
if(mode==='factory'){
 assert.deepEqual(Object.keys(signing).sort(),['callCredential','envelopeSigner','observationCredential']);assert.ok(Object.isFrozen(signing));
 const loaded=await readonly(()=>api.loadPublicLifecycleRun(scope));assert.deepEqual(loaded,context);
 await readonly(()=>api.createPublicLifecycleSigning(scope));assert.equal(cliCalls.length,0);assert.equal(signs,0);noSecrets(loaded);noSecrets(signing);
 for(const input of [{...scope,seed:keys.recipient.secret()},{...scope,source:seller},{...scope,fetch:()=>{}},{...scope,nowSeconds:now},{...scope,plan},{...scope,run:'../escape'},{...scope,planSha256:'12'.repeat(32)}])await assert.rejects(()=>api.createPublicLifecycleSigning(input),safe);
 const hostile={...scope};let invoked=0;Object.defineProperty(hostile,'run',{enumerable:true,get(){invoked++;throw Error(keys.recipient.secret());}});await assert.rejects(()=>api.createPublicLifecycleSigning(hostile),safe);assert.equal(invoked,0);
}else if(mode==='nested-input'){
 let invoked=0;const bad={get hidden(){invoked++;throw Error(keys.recipient.secret());}};
 for(const input of [{run:bad,planSha256},{run,planSha256:bad}])await assert.rejects(()=>api.createPublicLifecycleSigning(input),safe);
 assert.equal(invoked,0,'invalid scalar input must not evaluate nested getters');assert.equal(signs,0);assert.equal(cliCalls.length,0);
}else if(mode==='error-boundary'){
 const thrown=new Proxy({},{getPrototypeOf(){throw Error('untrusted callback diagnostic');}});
 const hostile=new Proxy({},{getPrototypeOf(){throw thrown;}});
 await assert.rejects(()=>api.createPublicLifecycleSigning(hostile),safe);
 await assert.rejects(()=>signing.callCredential(hostile),safe);
 assert.throws(()=>signing.envelopeSigner(hostile),safe);
 const b=bound(1),before=signs,sign=signer(b);await assert.rejects(()=>sign(hostile),safe);await assert.rejects(()=>sign(callbackInput(b)),safe);assert.equal(signs,before);
 let exposed;try{await api.createPublicLifecycleSigning({});}catch(e){exposed=e;}
 exposed.message='untrusted callback diagnostic';
 for(const thrown of [exposed,new exposed.constructor('untrusted callback diagnostic')])await assert.rejects(()=>api.createPublicLifecycleSigning(new Proxy({},{getPrototypeOf(){throw thrown;}})),safe);
}else if(mode==='credentials'){
 const be=(n,size)=>{const b=Buffer.alloc(size);let v=BigInt(n);for(let i=size-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}return b;};
 const prefix=p=>Buffer.concat([Buffer.from('agyion:'+p+'\0'),Buffer.from(sha(Networks.TESTNET),'hex'),addr(plan.contractId).toXDR()]);
 // Independent literal schedule IDs/roles and contract byte layout.
 const cases={2:['venue','handoff:v2',1],5:['venue','handoff:v2',2],10:['venue','handoff:v2',3],11:['podTimelock','pod-create:v3',1030],12:['podTimelock','pod-claim:v3',1],14:['attester','attest:v2',1],23:['agent','envoy:v2',6],24:['venue','handoff:v2',6],30:['venue','handoff:v2',7],32:['podMixed','pod-create:v3',1000],36:['venue','handoff:v2',8],37:['podMixed','pod-claim:v3',2],38:['attester','attest:v2',3]};
 for(let index=0;index<39;index++){
  const before=signs,result=await readonly(()=>signing.callCredential(callInput(index))),spec=cases[index];
  if(!spec){assert.equal(result,null);assert.equal(signs,before);continue;}
  const [role,purpose,id]=spec;let fields;
  if(purpose==='pod-create:v3')fields=[addr(seller).toXDR(),addr(plan.assets[0]).toXDR(),be(10000000,16),be(id,4),keys[role].rawPublicKey()];
  else if(purpose==='envoy:v2')fields=[be(1,8),be(id,8),be(1800000000,8)];
  else fields=[be(id,8),addr(plan.actors.recipient).toXDR(),...(purpose==='pod-claim:v3'?[]:[be(1800000000,8)])];
  const payload=Buffer.concat([prefix(purpose),...fields]);
  assert.deepEqual(Object.keys(result).sort(),['role','publicKey','payloadSha256','signatureHex'].sort());assert.equal(result.role,role);assert.equal(result.publicKey,keys[role].publicKey());assert.equal(result.payloadSha256,sha(payload));
  assert.equal(keys[role].verify(payload,Buffer.from(result.signatureHex,'hex')),true);assert.equal(keys[role].verify(Buffer.from(sha(payload),'hex'),Buffer.from(result.signatureHex,'hex')),false);assert.equal(signs,before+1);assert.ok(Object.isFrozen(result));noSecrets(result);
  for(const actor of ['recipient','relayer'])assert.equal(keys[actor].verify(payload,Buffer.from(result.signatureHex,'hex')),false);
 }
 assert.equal(cliCalls.length,0);
}else if(mode==='credential-inputs'){
 const input=callInput(11),before=signs;
 for(const extra of [{role:'recipient'},{payloadHex:'00'},{publicKey:seller},{signatureHex:'00'.repeat(64)},{timestamp:'1'},{sourceAccount:seller},{plan},{key:keys.podTimelock},{network:Networks.PUBLIC}])await assert.rejects(()=>signing.callCredential({...input,...extra}),safe);
 for(const changes of [{stepId:'not-a-step'},{headLedger:0},{headLedger:0xffffffff},{headLedger:0xfffffffe}])await assert.rejects(()=>signing.callCredential({...input,...changes}),safe);
 for(const timestamp of ['0','01',1,'18446744073709551616'])await assert.rejects(()=>signing.callCredential({...callInput(2),timestamp}),safe);
 let invoked=0;const hostile={...input};Object.defineProperty(hostile,'stepId',{enumerable:true,get(){invoked++;throw Error(keys.recipient.secret());}});await assert.rejects(()=>signing.callCredential(hostile),safe);assert.equal(invoked,0);assert.equal(signs,before);
}else if(mode==='actors'){
 for(const index of [1,2,6,10,12,14,16,23,25,37,38]){
  const b=bound(index),input=callbackInput(b),before=signs,signedXdr=await readonly(()=>signer(b)(input));
  const result=validateSignedPublicLifecycleEnvelope({step:b.call,sequence:'11',unsignedXdr:input.unsignedXdr,signedXdr,nowSeconds:now});assert.equal(result.hash,input.hash);assert.equal(signs,before+1);
  const tx=TransactionBuilder.fromXDR(signedXdr,Networks.TESTNET),source=plan.steps[index].sourceRole;
  assert.ok(keys[source].verify(tx.hash(),tx.signatures[0].signature()));assert.equal(tx.signatures.length,1);
  assert.equal(xdr.TransactionEnvelope.fromXDR(input.unsignedXdr,'base64').v1().tx().toXDR('hex'),tx.toEnvelope().v1().tx().toXDR('hex'));noSecrets(signedXdr);
 }
 assert.equal(cliCalls.length,0);
}else if(mode==='binding-inputs'){
 const b=bound(1),before=signs;
 for(const patch of [{sourceAccount:seller},{payloadHex:'00'},{sequence:'01'},{headLedger:0},{argsXdr:[]},{argsXdr:[...b.binding.argsXdr,'AAAA']},{timestamp:'1'}])assert.throws(()=>signer({...b,binding:{...b.binding,...patch}}),safe);
 for(const extra of [{source:seller},{key:keys.recipient},{plan},{nowSeconds:now}])assert.throws(()=>signing.envelopeSigner({stepId:b.stepId,binding:b.binding,...extra}),safe);
 const a=[...b.binding.argsXdr];let invoked=0;Object.defineProperty(a,'0',{enumerable:true,get(){invoked++;throw Error(keys.recipient.secret());}});assert.throws(()=>signer({...b,binding:{...b.binding,argsXdr:a}}),safe);assert.equal(invoked,0);assert.equal(signs,before);
}else if(mode==='envelope-inputs'){
 const b=bound(1),input=callbackInput(b),before=signs;
 for(const patch of [{sourceAccount:seller},{hash:'11'.repeat(32)},{key:keys.recipient},{nowSeconds:now},{unsignedXdr:input.unsignedXdr+'\n'},{unsignedXdr:'A'.repeat(1048577)},{unsignedXdr:undefined}])await assert.rejects(()=>signer(b)({...input,...patch}),safe);
 const changes=[body=>body.fee(10000001),body=>body.seqNum(xdr.SequenceNumber.fromString('12')),body=>body.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(keys.relayer.rawPublicKey())),body=>body.memo(xdr.Memo.memoText('other')),body=>body.operations()[0].body().invokeHostFunctionOp().auth([]),body=>body.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName('refund'),body=>body.operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().args([nativeToScVal(2n,{type:'u64'}),addr(plan.actors.recipient)]),body=>body.ext().sorobanData().resourceFee(xdr.Int64.fromString('1001'))];
 for(const change of changes){const e=xdr.TransactionEnvelope.fromXDR(input.unsignedXdr,'base64');change(e.v1().tx());await assert.rejects(()=>signer(b)(callbackInput(b,e.toXDR('base64'))),safe);}
 assert.equal(signs,before);
 const pre=TransactionBuilder.fromXDR(input.unsignedXdr,Networks.TESTNET);pre.sign(keys.recipient);const count=signs;await assert.rejects(()=>signer(b)(callbackInput(b,pre.toXDR())),safe);assert.equal(signs,count);
}else if(mode==='signed-output'){
 const b=bound(1),input=callbackInput(b),prototype=Object.getPrototypeOf(TransactionBuilder.fromXDR(input.unsignedXdr,Networks.TESTNET)),original=prototype.sign;
 const changes=[['fee',body=>body.fee(1001)],['resource',body=>body.ext().sorobanData().resourceFee(xdr.Int64.fromString('899'))],['auth',body=>body.operations()[0].body().invokeHostFunctionOp().auth([])],['time',body=>body.cond().timeBounds().maxTime(xdr.TimePoint.fromString(String(now+79)))]];
 for(const [name,change]of [...changes,['mainnet'],['wrong-key'],['duplicate'],['bad-hint']]){
  const before=signs;
  prototype.sign=function(key){
   original.call(this,key);const envelope=this.toEnvelope();
   if(change)change(envelope.v1().tx());
   envelope.v1().signatures([]);const tx=TransactionBuilder.fromXDR(envelope.toXDR('base64'),name==='mainnet'?Networks.PUBLIC:Networks.TESTNET);
   original.call(tx,name==='wrong-key'?keys.relayer:key);
   const output=tx.toEnvelope();if(name==='duplicate')output.v1().signatures().push(...output.v1().signatures());if(name==='bad-hint')output.v1().signatures()[0].hint(Buffer.alloc(4));
   this.toXDR=()=>output.toXDR('base64');
  };
  try{await assert.rejects(()=>signer(b)(input),safe);assert.equal(signs,before+2);}finally{prototype.sign=original;}
 }
 assert.equal(cliCalls.length,0);
}else if(mode==='one-use'){
 const b=bound(1),input=callbackInput(b),sign=signer(b),before=signs;
 const results=await Promise.allSettled([sign(input),sign(input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);safe(results.find(r=>r.status==='rejected').reason);assert.equal(signs,before+1);await assert.rejects(()=>sign(input),safe);
 const failed=signer(b);await assert.rejects(()=>failed({...input,hash:'11'.repeat(32)}),safe);await assert.rejects(()=>failed(input),safe);assert.equal(signs,before+1);
 // Separate capabilities are deliberately not durable journal claims.
 await signer(b)(input);assert.equal(signs,before+2);
}else if(mode==='mutation'){
 const b=bound(1),input=callbackInput(b),copy={...b,binding:{...b.binding,argsXdr:[...b.binding.argsXdr]}},sign=signer(copy);
 copy.binding.argsXdr[0]='AAAA';copy.binding.sequence='12';
 let release;onAuthority=()=>new Promise(r=>{release=r;});const pending=sign(input);
 input.unsignedXdr='AAAA';input.sourceAccount=seller;input.hash='22'.repeat(32);assert.equal(typeof release,'function');release();
 const signed=await pending;assert.equal(TransactionBuilder.fromXDR(signed,Networks.TESTNET).source,plan.actors.recipient);
 onAuthority=null;const request=callInput(11),expected={...request};let resume;onAuthority=()=>new Promise(r=>{resume=r;});const credential=signing.callCredential(request);request.stepId=plan.steps[32].id;request.headLedger=7;resume();assert.equal((await credential).role,'podTimelock');assert.equal(expected.headLedger,1000);
}else if(mode==='expiry'){
 const b=bound(1),before=signs;
 for(const expiry of [now,now+91])await assert.rejects(()=>signer(b)(callbackInput(b,unsigned(b,expiry))),safe);assert.equal(signs,before);
 const input=callbackInput(b);onAuthority=()=>{now+=80;};await assert.rejects(()=>signer(b)(input),safe);assert.equal(signs,before);onAuthority=null;
 const after=callbackInput(b),sign=signer(b);onSign=()=>{now+=80;};await assert.rejects(()=>sign(after),safe);onSign=null;assert.equal(signs,before+1);await assert.rejects(()=>sign(callbackInput(b)),safe);assert.equal(signs,before+1);
}else if(mode==='custody'){
 const b=bound(1),input=callbackInput(b),before=signs;
 const keyFile=path.join(dir,'identity/keys.json'),bytes=fs.readFileSync(keyFile);
 fs.chmodSync(keyFile,0o644);await assert.rejects(()=>signer(b)(input),safe);fs.chmodSync(keyFile,0o600);
 const value=JSON.parse(bytes);value.secrets.recipient=value.secrets.relayer;fs.writeFileSync(keyFile,JSON.stringify(value,null,2)+'\n');await assert.rejects(()=>signer(b)(input),safe);fs.writeFileSync(keyFile,bytes);
 wrongAuthority=true;await assert.rejects(()=>signer(b)(input),safe);wrongAuthority=false;
 onAuthority=()=>{fs.renameSync(path.join(dir,'identity'),path.join(dir,'identity-old'));fs.mkdirSync(path.join(dir,'identity'),{mode:0o700});for(const file of ['keys.json','public.json'])fs.copyFileSync(path.join(dir,'identity-old',file),path.join(dir,'identity',file));};await assert.rejects(()=>signer(b)(input),safe);assert.equal(signs,before);assert.equal(cliCalls.length,0);
}else if(mode.startsWith('seller-')){
 cliMode=mode.slice(7);const b=bound(0),input=callbackInput(b),sign=signer(b);await assert.rejects(()=>sign(input),safe);
 assert.equal(cliCalls.filter(c=>c.args[0]==='keys').length,1);
 const txCalls=cliCalls.filter(c=>c.args[0]==='tx');assert.equal(txCalls.length,['wrong-alias','alias-expiry','alias-tamper'].includes(cliMode)?0:1);
 if(txCalls.length)assert.equal(txCalls[0].options.input,input.unsignedXdr);
 await assert.rejects(()=>sign(input),safe);assert.equal(cliCalls.filter(c=>c.args[0]==='tx').length,txCalls.length);
}else if(mode==='observations'){
 const S=await import(url('public-lifecycle-state.mjs')),O=await import(url('public-lifecycle-observations.mjs'));
 const {createStateFixture}=await import(realUrl.pathToFileURL(path.join(root,'scripts/tests/helpers/public-lifecycle-state-fixture.mjs')).href);
 const f=createStateFixture({realWasm:false});assert.deepEqual(f.plan,plan);const journey=f.journey(S);
 let credentialCount=0,corruptCount=0;
 for(let index=0;index<39;index++)for(const [phase,state]of [['before',journey.stages[index].pre],['after',journey.stages[index].post]]){
  for(const family of O.publicLifecycleObservationCases({plan,stepId:plan.steps[index].id,phase}))for(const caseId of family.caseIds){
   const k=family.observationKind;if(['pod-before-unlock','trigger-early-refund','fade-unclaimed-early-refund','fade-claimed-early-refund'].includes(k))continue;
   const input={stepId:plan.steps[index].id,phase,observationKind:k,caseId,ledger:state.snapshot.ledger,timestamp:'1800000000',state};
   const intent=O.publicLifecycleObservationIntent({plan,...Object.fromEntries(Object.entries(input).filter(([k])=>!['phase','state'].includes(k))),recordAnchors:state.recordAnchors});
   const before=signs,result=await signing.observationCredential(input);
   if(!intent.credential){assert.equal(result,null);assert.equal(signs,before);continue;}
   credentialCount++;const c=intent.credential,bytes=Buffer.from(result.signatureHex,'hex'),original=Buffer.from(bytes);if(c.corruptFirstByte){original[0]^=1;corruptCount++;assert.equal(keys[c.role].verify(Buffer.from(c.payloadHex,'hex'),bytes),false);}
   assert.equal(keys[c.role].verify(Buffer.from(c.payloadHex,'hex'),original),true);assert.equal(result.payloadSha256,sha(Buffer.from(c.payloadHex,'hex')));assert.equal(result.role,c.role);assert.equal(signs,before+1);noSecrets(result);
  }
 }
 assert.ok(credentialCount>15);assert.equal(corruptCount,1);
 for(const [prior,next,k,c]of [[11,12,'pod-before-unlock','locked'],[15,16,'trigger-early-refund','early'],[17,18,'fade-unclaimed-early-refund','early'],[20,21,'fade-claimed-early-refund','early']]){
  const state=journey.stages[prior].post,input={stepId:plan.steps[next].id,phase:'before',observationKind:k,caseId:c,ledger:state.snapshot.ledger,timestamp:'1800000000',state};
  const result=await signing.observationCredential(input);assert.equal(result?.role??null,prior===11?'podTimelock':null);
  for(const change of [{state:structuredClone(state)},{ledger:input.ledger-1},{phase:'after'},{stepId:plan.steps[next+1].id},{recordAnchors:state.recordAnchors},{state:journey.stages[prior].pre}])await assert.rejects(()=>signing.observationCredential({...input,...change}),safe);
 }
 assert.equal(cliCalls.length,0);
}else throw Error('unknown fixture mode');
assert.equal(network,0);assert.equal(randoms,7);
console.log(JSON.stringify({mode,network,signs,cliCalls:cliCalls.length,actualOperatorOpened:false}));
`;

const modes=['factory','nested-input','error-boundary','credentials','credential-inputs','actors','binding-inputs','envelope-inputs','signed-output','one-use','mutation','expiry','custody',
  ...['wrong-alias','alias-expiry','alias-tamper','throw','timeout','nonzero','oversize','junk','unsigned','wrong-signature','sign-expiry','sign-tamper'].map(s=>'seller-'+s),'observations'];
for(const mode of modes)test(`protected lifecycle signing: ${mode}`,async t=>{
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  const home=fs.mkdtempSync(path.join(root,'artifacts/lifecycle-signing-test-'));fs.chmodSync(home,0o700);
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const fixtureRoot=path.join(home,'repo');fs.mkdirSync(fixtureRoot,{mode:0o700});
  const script=path.join(home,'test.mjs');fs.writeFileSync(script,child,{mode:0o600});
  const {stdout}=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks',script,root,fixtureRoot,mode],{timeout:60000,maxBuffer:1048576});
  const result=JSON.parse(stdout.trim());assert.equal(result.mode,mode);assert.equal(result.network,0);assert.equal(result.actualOperatorOpened,false);
});
