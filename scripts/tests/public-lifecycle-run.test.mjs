import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Child-only fixed-root, original-authority and alias-process substitutions.
// Fixture filesystem I/O, seven secret/public derivations and plan checks are
// real; selected failure/ancestor metadata is substituted. No operator is opened.
const child = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as realUrl from 'node:url';
import * as processes from 'node:child_process';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
const [root, home, mode] = process.argv.slice(2);
const moduleUrl = name => realUrl.pathToFileURL(path.join(root, 'scripts/lib', name)).href;
const { Keypair } = createRequire(path.join(root, 'app/package.json'))('@stellar/stellar-sdk');
const seller = 'GBDINNMPHA7LWJDAXS3G3NWCOLYLSPCER2Z4HENF2JE3ZKH7TVLF7PBF';
const manifestSha256 = 'e3094fa5482fef6b6efb986d54d2540dcbd5a426c65fc856c1b9565825d0f5fc';
const planHash = '21fb2aebbebd48c5802e89dadba72a2aaceb3d58642dda2d24bd28ae4471b6b7';
const secrets = Array.from({length:7}, (_,i) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, i+150)));
const roles = ['recipient','relayer','venue','podTimelock','podMixed','attester','agent'];
let randoms=0, cliCalls=0, authorityCalls=0, networkCalls=0, wrongAuthority=false, wrongAlias=false;
globalThis.fetch=()=>{networkCalls++;throw Error('network forbidden');};
Keypair.random = () => { const i=randoms++; if(mode==='random-failure')throw Error(secrets[0].secret()); return secrets[mode==='duplicate' ? 0 : i%7]; };
mock.module('node:url', { namedExports: {...realUrl, fileURLToPath: value => {
  const result=realUrl.fileURLToPath(value);return path.resolve(result)===path.resolve(root) ? home : result;
}} });
mock.module('node:child_process', { namedExports: {...processes, spawnSync: (cmd,args,options) => {
  cliCalls++; assert.equal(cmd,'stellar');
  assert.deepEqual(args,['keys','address','agyion-public-v4-testnet','--config-dir',path.join(originalRun,'identity')]);
  assert.equal(options.timeout,20000);assert.equal(options.maxBuffer,1048576);assert.equal(options.shell,undefined);
  assert.deepEqual(options.stdio,['pipe','pipe','pipe']);assert.equal(options.encoding,'utf8');
  assert.equal(Object.keys(options.env).some(k=>k.startsWith('STELLAR_')||k.startsWith('SOROBAN_')),false);
  if(mode==='cli-failure')return {status:1,stderr:secrets[0].secret(),stdout:secrets[0].secret()};
  return {status:0,stdout:(wrongAlias?secrets[0].publicKey():seller)+'\n'};
}} });
const originalRun=path.join(home,'artifacts/original');
if(mode!=='process-race'){
 for(const p of [path.join(home,'artifacts'),originalRun,path.join(originalRun,'identity'),path.join(home,'deployments')])fs.mkdirSync(p,{mode:0o700});
 fs.copyFileSync(path.join(root,'deployments/public-v4-testnet.json'),path.join(home,'deployments/public-v4-testnet.json'));
}
const originalPlan={schema:'agyion-public-kernel-offline-plan-v1',testOnly:true,manifestSha256,wasmSha256:'d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186',
  networkPassphrase:'Test SDF Network ; September 2015',rpcUrl:'https://soroban-testnet.stellar.org',identityDirectory:path.join(originalRun,'identity'),sourceAccount:seller,
  intendedContractId:'CA3QJJNHN3TDSU3MYWVLO5N2NGFUBY4AO2J77TRPNHFI5VB5P26USEMZ',assets:['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC','CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA']};
mock.module(realUrl.pathToFileURL(path.join(root,'scripts/deploy-public-testnet.mjs')).href,{namedExports:{loadDeploymentPlan:async(run,hash)=>{
  authorityCalls++;assert.equal(run,originalRun);assert.equal(hash,manifestSha256);
  return {run,manifestSha256:hash,planSha256:wrongAuthority?'11'.repeat(32):planHash,plan:structuredClone(originalPlan)};
}}});
let api;try{api=await import(moduleUrl('public-lifecycle-run.mjs'));}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;api={};}
assert.equal(typeof api.preparePublicLifecycleRun,'function');assert.equal(typeof api.loadPublicLifecycleRun,'function');
const run='fixture-run', base=path.join(home,'artifacts/public-v4-lifecycle'), dir=path.join(base,'runs',run);
const options={originalRun,manifestSha256,run};
const prepare=()=>api.preparePublicLifecycleRun(options);
const originalMkdir=fs.mkdirSync;
fs.mkdirSync=(p,...a)=>{
 assert.ok(!String(p).startsWith(path.join(root,'artifacts/public-v4-lifecycle')),'must never touch real operator root');
 if(mode==='process-race'&&String(p)===dir){
  // Both independent processes reach the real exclusive mkdir before either
  // proceeds. Only these fixture children block; no production clock is changed.
  fs.writeFileSync(path.join(home,'racer-'+process.pid+'.ready'),'',{flag:'wx',mode:0o600});
  const deadline=Date.now()+10000,wait=new Int32Array(new SharedArrayBuffer(4));
  while(fs.readdirSync(home).filter(n=>/^racer-[0-9]+\.ready$/.test(n)).length!==2){assert.ok(Date.now()<deadline,'both racers reached mkdir');Atomics.wait(wait,0,0,5);}
 }
 return originalMkdir(p,...a);
};
process.env.STELLAR_SECRET=secrets[0].secret();process.env.SOROBAN_RPC_URL='https://wrong.invalid';
function safeError(e){assert.match(e.message,/^LIFECYCLE_RUN_[A-Z_]+$/);assert.ok(!e.message.includes(secrets[0].secret()));return true;}
function disk(){const output={};function visit(p){for(const n of fs.readdirSync(p)){const f=path.join(p,n),s=fs.lstatSync(f);output[f]={mode:s.mode,ino:s.ino,...(s.isFile()?{bytes:fs.readFileSync(f).toString('hex')}:{})};if(s.isDirectory())visit(f);}}visit(base);return output;}
async function readOnly(fn){const names=['writeFileSync','writeSync','mkdirSync','fsyncSync','fdatasyncSync','renameSync','unlinkSync','chmodSync'];const old=Object.fromEntries(names.map(n=>[n,fs[n]])),open=fs.openSync,fetch=globalThis.fetch;
 try{for(const n of names)fs[n]=()=>{throw Error('unexpected '+n);};fs.openSync=(p,flags,...a)=>{assert.equal(typeof flags,'number');assert.equal(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND),0);return open(p,flags,...a);};globalThis.fetch=()=>{throw Error('unexpected network');};return await fn();}
 finally{Object.assign(fs,old);fs.openSync=open;globalThis.fetch=fetch;}}
if(mode==='success'){
 const context=await prepare();assert.equal(randoms,7);assert.equal(cliCalls,1);assert.equal(context.run,dir);assert.equal(context.journalRun,path.join(dir,'journal'));assert.equal(context.lockRoot,path.join(base,'source-locks'));
 assert.deepEqual(context.fundingDirectories,{recipient:path.join(dir,'funding/recipient'),relayer:path.join(dir,'funding/relayer')});
 assert.deepEqual(Object.keys(context).sort(),['schema','run','plan','planSha256','journalRun','lockRoot','fundingDirectories'].sort());
 assert.equal(context.plan.actors.seller,seller);assert.equal(new Set([seller,...roles.map(r=>r==='recipient'||r==='relayer'?context.plan.actors[r]:context.plan.credentialKeys[r])]).size,8);
 for(const p of [base,path.join(base,'runs'),context.lockRoot,dir,path.join(dir,'identity'),path.join(dir,'funding'),...Object.values(context.fundingDirectories),context.journalRun,path.join(dir,'acquisition')])assert.equal(fs.statSync(p).mode&0o7777,0o700);
 assert.deepEqual(fs.readdirSync(context.journalRun),[]);for(const p of Object.values(context.fundingDirectories))assert.deepEqual(fs.readdirSync(p),[]);
 const stored=fs.readFileSync(path.join(dir,'identity/keys.json'),'utf8');for(const key of secrets)assert.ok(stored.includes(key.secret()));
 assert.equal(fs.statSync(path.join(dir,'identity/keys.json')).mode&0o7777,0o600);for(const key of secrets)assert.equal(JSON.stringify(context).includes(key.secret()),false);
 assert.throws(()=>{context.plan.actors.recipient=seller;},TypeError);assert.throws(()=>{context.fundingDirectories.recipient='elsewhere';},TypeError);
 const before=disk(), loaded=await readOnly(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}));assert.deepEqual(loaded,context);assert.deepEqual(disk(),before);assert.equal(cliCalls,1);assert.equal(randoms,7);
 await assert.rejects(prepare,safeError);assert.equal(randoms,7);assert.deepEqual(disk(),before);
}else if(mode==='inputs'){
 for(const value of ['','..','a/b','../other','/tmp/run','a\\b','a b','Upper','a\n','a'.repeat(65),'.hidden'])await assert.rejects(()=>api.preparePublicLifecycleRun({...options,run:value}),safeError);
 for(const extra of [{lockRoot:home},{random:()=>secrets[0]},{verified:true}])await assert.rejects(()=>api.preparePublicLifecycleRun({...options,...extra}),safeError);
 await assert.rejects(()=>api.preparePublicLifecycleRun({...options,manifestSha256:'11'.repeat(32)}),safeError);
 await assert.rejects(()=>api.preparePublicLifecycleRun({...options,originalRun:originalRun+'/../original'}),safeError);
 let getters=0;const accessor={...options};Object.defineProperty(accessor,'run',{enumerable:true,get(){getters++;return run;}});
 await assert.rejects(()=>api.preparePublicLifecycleRun(accessor),safeError);assert.equal(getters,0);
 await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:'0'.repeat(64)}),safeError);
 assert.equal(randoms,0);assert.equal(cliCalls,0);assert.equal(authorityCalls,0);assert.equal(fs.existsSync(base),false);
}else if(mode==='authority'||mode==='alias'||mode==='receipt'||mode==='cli-failure'){
 wrongAuthority=mode==='authority';wrongAlias=mode==='alias';if(mode==='receipt')fs.appendFileSync(path.join(home,'deployments/public-v4-testnet.json'),' ');
 await assert.rejects(prepare,safeError);assert.equal(randoms,0);assert.equal(fs.existsSync(base),false);
}else if(mode==='duplicate'||mode==='random-failure'){
 await assert.rejects(prepare,safeError);assert.equal(fs.existsSync(dir),true);const before=randoms;
 await assert.rejects(prepare,safeError);assert.equal(randoms,before);await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:'11'.repeat(32)}),safeError);
}else if(mode==='partial-write'){
 const write=fs.writeFileSync;fs.writeFileSync=(fd,...a)=>{const target=typeof fd==='number'?fs.readlinkSync('/proc/self/fd/'+fd):String(fd);write(fd,...a);if(target.endsWith('/identity/keys.json'))throw Error(secrets[0].secret());};
 await assert.rejects(prepare,safeError);fs.writeFileSync=write;assert.equal(randoms,7);assert.equal(fs.existsSync(path.join(dir,'identity/keys.json')),true);
 const before=disk();await assert.rejects(prepare,safeError);assert.deepEqual(disk(),before);assert.equal(randoms,7);
}else if(mode==='tamper'){
 const context=await prepare(),file=path.join(dir,'identity/keys.json'),original=fs.readFileSync(file),mapping=path.join(dir,'identity/public.json');
 const keys=JSON.parse(original);keys.secrets.recipient=secrets[1].secret();fs.writeFileSync(file,JSON.stringify(keys,null,2)+'\n');
 await assert.rejects(()=>readOnly(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256})),safeError);fs.writeFileSync(file,original);
 const mb=fs.readFileSync(mapping),m=JSON.parse(mb);m.publicKeys.recipient=seller;fs.writeFileSync(mapping,JSON.stringify(m,null,2)+'\n');
 await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}),safeError);fs.writeFileSync(mapping,mb);
 const planFile=path.join(dir,'lifecycle-plan.json'),pb=fs.readFileSync(planFile),plan=JSON.parse(pb);plan.steps[0].terms.amount='1';fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
 await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}),safeError);fs.writeFileSync(planFile,pb);
 fs.chmodSync(file,0o644);await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}),safeError);fs.chmodSync(file,0o600);
 fs.unlinkSync(file);fs.symlinkSync(path.join(home,'not-a-key'),file);await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}),safeError);assert.equal(cliCalls,1);
}else if(mode==='unsafe-root'){
 fs.mkdirSync(base,{mode:0o755});await assert.rejects(prepare,safeError);assert.equal(randoms,0);
}else if(mode==='symlink-root'){
 fs.symlinkSync(originalRun,base);await assert.rejects(prepare,safeError);assert.equal(randoms,0);
}else if(mode==='record-adversaries'){
 const context=await prepare(),file=path.join(dir,'identity/keys.json'),bytes=fs.readFileSync(file);
 const load=()=>readOnly(()=>api.loadPublicLifecycleRun({run,planSha256:context.planSha256}));
 fs.writeFileSync(file,bytes.toString().replace('"secrets": {','"schema": "duplicate",\n  "secrets": {'));
 await assert.rejects(load,safeError);fs.writeFileSync(file,bytes);
 const extra=JSON.parse(bytes);extra.secrets.seller=secrets[0].secret();fs.writeFileSync(file,JSON.stringify(extra,null,2)+'\n');
 await assert.rejects(load,safeError);fs.writeFileSync(file,bytes);
 const linked=path.join(dir,'identity/linked.json');fs.linkSync(file,linked);await assert.rejects(load,safeError);fs.unlinkSync(linked);
 const calls=authorityCalls;await assert.rejects(()=>api.loadPublicLifecycleRun({run,planSha256:'22'.repeat(32)}),safeError);assert.equal(authorityCalls,calls);
 const claim=path.join(dir,'prepare.claim.json'),claimBytes=fs.readFileSync(claim);fs.writeFileSync(claim,claimBytes.toString()+' ');
 await assert.rejects(load,safeError);fs.writeFileSync(claim,claimBytes);assert.equal(cliCalls,1);assert.equal(randoms,7);
}else if(mode==='authority-fields'){
 for(const [field,value] of [['sourceAccount',secrets[0].publicKey()],['networkPassphrase','Public Global Stellar Network ; September 2015'],['rpcUrl','http://localhost'],['identityDirectory',home],['intendedContractId','C'.repeat(56)],['assets',[...originalPlan.assets].reverse()],['testOnly',false],['wasmSha256','22'.repeat(32)]]){
  const old=originalPlan[field];originalPlan[field]=value;await assert.rejects(prepare,safeError);originalPlan[field]=old;
 }
 assert.equal(randoms,0);assert.equal(cliCalls,0);assert.equal(fs.existsSync(base),false);
}else if(mode==='process-race'){
 let outcome;try{const context=await prepare();outcome={status:'prepared',planSha256:context.planSha256};}
 catch(e){safeError(e);assert.equal(e.message,'LIFECYCLE_RUN_EXISTS');outcome={status:'refused',error:e.message};}
 assert.equal(randoms,outcome.status==='prepared'?7:0);assert.equal(networkCalls,0);
 console.log(JSON.stringify({mode,pid:process.pid,randoms,cliCalls,network:networkCalls,actualOperatorOpened:false,...outcome}));
 process.exit(0);
}else if(mode==='race'){
 const results=await Promise.allSettled([prepare(),prepare()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(randoms,7);safeError(results.find(r=>r.status==='rejected').reason);
}else if(mode==='durability'){
 const events=[],sync=fs.fsyncSync,write=fs.writeFileSync,random=Keypair.random;
 const fdPath=fd=>fs.readlinkSync('/proc/self/fd/'+fd);
 fs.fsyncSync=fd=>{events.push(['sync',fdPath(fd)]);return sync(fd);};
 fs.writeFileSync=(fd,...a)=>{events.push(['write',typeof fd==='number'?fdPath(fd):String(fd)]);return write(fd,...a);};
 Keypair.random=()=>{events.push(['random','']);return random();};await prepare();
 const index=(op,suffix)=>events.findIndex(r=>r[0]===op&&r[1].endsWith(suffix));
 assert.ok(index('sync','/prepare.claim.json')>=0&&index('sync','/prepare.claim.json')<index('random',''));
 assert.ok(index('sync','/identity/keys.json')<index('write','/identity/public.json'));
 assert.ok(index('sync','/prepared.json')>index('sync','/lifecycle-plan.json'));
 for(const p of [base,path.dirname(base),path.join(base,'runs'),dir,path.join(dir,'identity'),path.join(dir,'funding'),path.join(dir,'journal'),path.join(base,'source-locks')])assert.ok(events.some(r=>r[0]==='sync'&&r[1]===p),p);
}else if(mode==='barrier-stable'||mode==='barrier-absent'){
 // Model the same stat metadata through path and descriptor APIs. The ONLY
 // difference between these cases is home's 0700 versus 0755 mode; all earlier
 // ancestors are 0755 and the real fixture artifacts child is group-writable.
 fs.chmodSync(path.join(home,'artifacts'),0o775);
 const lstat=fs.lstatSync,fstat=fs.fstatSync,open=fs.openSync;let opened=0,checked=0,writableSeen=0;
 const modeled=(value,s)=>{
  const p=String(value);if(p===path.join(home,'artifacts'))writableSeen++;
  const mode=p===home?(modeName==='barrier-stable'?0o700:0o755):(home.startsWith(p.endsWith('/')?p:p+'/')?0o755:null);
  return mode===null?s:new Proxy(s,{get:(t,k)=>k==='mode'?((t.mode&~0o7777)|mode):Reflect.get(t,k)});
 },modeName=mode;
 fs.lstatSync=(p,...a)=>modeled(p,lstat(p,...a));
 fs.fstatSync=(fd,...a)=>{const p=fs.readlinkSync('/proc/self/fd/'+fd),s=modeled(p,fstat(fd,...a)),named=modeled(p,lstat(p));assert.equal(s.mode,named.mode);checked++;return s;};
 fs.openSync=(...args)=>{opened++;return open(...args);};
 if(mode==='barrier-absent'){
  await assert.rejects(prepare,e=>{safeError(e);assert.equal(e.message,'LIFECYCLE_RUN_PATH');return true;});
  assert.ok(writableSeen>0);assert.equal(opened,0);assert.equal(checked,0);assert.equal(authorityCalls,0);assert.equal(cliCalls,0);assert.equal(randoms,0);assert.equal(fs.existsSync(base),false);
 }else{
  const c=await prepare();assert.ok(opened>0&&checked>0&&writableSeen>0);assert.equal(randoms,7);
  assert.deepEqual(await readOnly(()=>api.loadPublicLifecycleRun({run,planSha256:c.planSha256})),c);assert.equal(cliCalls,1);
 }
 fs.lstatSync=lstat;fs.fstatSync=fstat;fs.openSync=open;
}else if(mode==='ancestor'){
 // Mock metadata ONLY to exercise ownership/traversal policies without changing
 // repository/host ancestors; fixed lifecycle directories still use real modes.
 const lstat=fs.lstatSync;let scenario='barrier', barrier=path.join(home,'artifacts');
 fs.chmodSync(barrier,0o700);
 fs.lstatSync=(p,...a)=>{const s=lstat(p,...a),pstr=String(p);if(!home.startsWith(pstr)||pstr==='/')return s;
  if(pstr==='/home'&&scenario==='unsafe-above')return new Proxy(s,{get:(t,k)=>k==='mode'?((t.mode&~0o777)|0o777):Reflect.get(t,k)});
  if(pstr===home&&scenario==='world-write')return new Proxy(s,{get:(t,k)=>k==='mode'?((t.mode&~0o777)|0o702):Reflect.get(t,k)});
  if(pstr===home&&scenario==='foreign-owner')return new Proxy(s,{get:(t,k)=>k==='uid'?process.getuid()+1:Reflect.get(t,k)});
  return s;
 };
 for(scenario of ['unsafe-above','foreign-owner','world-write'])await assert.rejects(prepare,safeError);assert.equal(randoms,0);
 fs.lstatSync=lstat;fs.chmodSync(path.join(home,'artifacts'),0o775);const c=await prepare();assert.equal(c.plan.actors.seller,seller);
}else throw Error('unknown test mode');
console.log(JSON.stringify({mode,randoms,cliCalls,network:networkCalls,actualOperatorOpened:false}));
`;

for (const mode of ['success','inputs','authority','alias','receipt','cli-failure','duplicate','random-failure','partial-write','tamper','unsafe-root','symlink-root','record-adversaries','authority-fields','ancestor','barrier-stable','barrier-absent','race','process-race','durability']) {
  test(`protected lifecycle preparation/load: ${mode}`, async t => {
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    const home=fs.mkdtempSync(path.join(root,'artifacts/lifecycle-run-test-'));fs.chmodSync(home,0o700);
    t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
    const fixtureRoot=path.join(home,'repo');fs.mkdirSync(fixtureRoot,{mode:0o700});
    const script=path.join(home,'test.mjs');fs.writeFileSync(script,child,{mode:0o600});
    if(mode==='process-race'){
      for(const p of ['artifacts','artifacts/original','artifacts/original/identity','deployments'])fs.mkdirSync(path.join(fixtureRoot,p),{mode:0o700});
      fs.copyFileSync(path.join(root,'deployments/public-v4-testnet.json'),path.join(fixtureRoot,'deployments/public-v4-testnet.json'));
      const results=await Promise.all([0,1].map(async()=>{
        const {stdout}=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks',script,root,fixtureRoot,mode],{timeout:20000,maxBuffer:1024*1024});
        return JSON.parse(stdout.trim());
      }));
      assert.equal(new Set(results.map(r=>r.pid)).size,2);assert.deepEqual(results.map(r=>r.status).sort(),['prepared','refused']);
      for(const r of results){assert.equal(r.network,0);assert.equal(r.actualOperatorOpened,false);assert.equal(r.randoms,r.status==='prepared'?7:0);}
      assert.equal(results.reduce((sum,r)=>sum+r.randoms,0),7);assert.equal(results.find(r=>r.status==='refused').error,'LIFECYCLE_RUN_EXISTS');
      const runDir=path.join(fixtureRoot,'artifacts/public-v4-lifecycle/runs/fixture-run');
      const completion=JSON.parse(fs.readFileSync(path.join(runDir,'prepared.json'))),mapping=JSON.parse(fs.readFileSync(path.join(runDir,'identity/public.json')));
      assert.equal(completion.planSha256,results.find(r=>r.status==='prepared').planSha256);assert.equal(mapping.planSha256,completion.planSha256);
      assert.equal(Object.keys(mapping.publicKeys).length,7);assert.equal(new Set(Object.values(mapping.publicKeys)).size,7);
      assert.deepEqual(fs.readdirSync(path.dirname(runDir)),['fixture-run']);
      t.diagnostic(JSON.stringify({distinctProcesses:2,outcomes:results.map(({pid,status,randoms,error})=>({pid,status,randoms,error})),totalGeneratedRoles:7}));
      return;
    }
    const {stdout}=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks',script,root,fixtureRoot,mode],{timeout:20000,maxBuffer:1024*1024});
    const result=JSON.parse(stdout.trim());assert.equal(result.mode,mode);assert.equal(result.network,0);assert.equal(result.actualOperatorOpened,false);
  });
}
