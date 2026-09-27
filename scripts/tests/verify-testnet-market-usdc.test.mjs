import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decimalUnits,decimalString,acquisitionLimit,feeLimit} from '../verify-testnet-market-usdc.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const script=path.join(root,'scripts/verify-testnet-market-usdc.mjs');
const denyNetwork='data:text/javascript,'+encodeURIComponent("import http from 'node:http';import https from 'node:https';globalThis.fetch=()=>{throw Error('Unexpected network request')};http.request=https.request=()=>{throw Error('Unexpected network request')};");
function fixture(t){fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});const base=fs.mkdtempSync(path.join(root,'artifacts/usdc-cli-test-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));return base;}
function run(args,cwd=root){return spawnSync(process.execPath,['--import',denyNetwork,script,...args],{cwd,encoding:'utf8',timeout:10000});}

test('prepare writes fresh private files only to its explicit output and refuses overwriting them',t=>{
 const base=fixture(t),output=path.join(base,'fresh');const prepared=run(['--prepare',output]);
 assert.equal(prepared.status,0,prepared.stderr);assert.match(prepared.stdout,/no network or funding/i);
 assert.equal(fs.statSync(output).mode&0o777,0o700);
 assert.deepEqual(fs.readdirSync(output).sort(),['config.json','report.json','secrets.json']);
 for(const name of fs.readdirSync(output))assert.equal(fs.statSync(path.join(output,name)).mode&0o777,0o600);
 const before=fs.readFileSync(path.join(output,'secrets.json'));assert.doesNotMatch(prepared.stdout+prepared.stderr,/\bS[A-Z2-7]{55}\b/);
 assert.notEqual(run(['--prepare',output]).status,0);assert.deepEqual(fs.readFileSync(path.join(output,'secrets.json')),before);
});
test('default and explicit plan have no file or network side effects',t=>{
 const base=fixture(t);for(const args of [[],['--plan']]){const result=run(args,base);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/plan only/i);assert.deepEqual(fs.readdirSync(base),[]);}
});
test('CLI requires an output only for explicit prepare, fund and exercise actions',t=>{
 const base=fixture(t);for(const args of [['--prepare'],['--fund'],['--exercise'],['--plan',base],['--prepare',base,'extra'],['--retry',base],['--prepare','']]){const result=run(args,base);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/Unexpected network request/);assert.deepEqual(fs.readdirSync(base),[]);}
});
test('output cannot escape ignored artifacts or create missing ancestor paths',t=>{
 const base=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'agyion-usdc-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 for(const output of [path.join(outside,'fresh'),path.join(root,'artifacts','..','unapproved-usdc-run'),path.join(base,'missing','fresh'),path.join(root,'artifacts')]){assert.notEqual(run(['--prepare',output]).status,0);}
 assert.deepEqual(fs.readdirSync(base),[]);assert.deepEqual(fs.readdirSync(outside),[]);assert.equal(fs.existsSync(path.join(root,'unapproved-usdc-run')),false);
});
test('symbolic link targets and ancestors are rejected without creating data',t=>{
 const base=fixture(t),target=path.join(base,'target');fs.mkdirSync(target,{mode:0o700});const linked=path.join(base,'linked');fs.symlinkSync(target,linked,'dir');
 for(const output of [linked,path.join(linked,'fresh')])for(const mode of ['--prepare','--fund','--exercise']){const result=run([mode,output]);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/Unexpected network request/);}
 assert.deepEqual(fs.readdirSync(target),[]);
});
test('an existing run must remain private before any read or network operation',t=>{
 const base=fixture(t),output=path.join(base,'run');assert.equal(run(['--prepare',output]).status,0);fs.chmodSync(output,0o755);
 let result=run(['--fund',output]);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/Unexpected network request/);fs.chmodSync(output,0o700);
 fs.chmodSync(path.join(output,'secrets.json'),0o644);result=run(['--fund',output]);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/Unexpected network request/);assert.equal(JSON.parse(fs.readFileSync(path.join(output,'report.json'))).status,'prepared');
});
test('completed, failed and uncertain phases cannot trigger an automatic retry',t=>{
 const base=fixture(t),output=path.join(base,'run');assert.equal(run(['--prepare',output]).status,0);const reportPath=path.join(output,'report.json'),original=JSON.parse(fs.readFileSync(reportPath));
 for(const status of ['passed','fund-running','fund-failed','exercise-running','exercise-failed']){const text=JSON.stringify({...original,status,transactions:[{status:'unresolved',hash:'a'.repeat(64),maxFee:'100'}]});fs.writeFileSync(reportPath,text);
  for(const mode of ['--fund','--exercise']){const result=run([mode,output]);assert.notEqual(result.status,0);assert.match(result.stderr,/No implicit resume or resubmission/);assert.equal(fs.readFileSync(reportPath,'utf8'),text);}
 }
});
test('decimal acquisition caps include rounded slippage without floating point errors',()=>{
 assert.equal(decimalUnits('4.8106973'),48106973n);assert.equal(acquisitionLimit('4.8106973'),50512322n);assert.equal(decimalString(50512322n),'5.0512322');assert.equal(acquisitionLimit('0.0000001'),2n);
 for(const value of ['9.5238096','10.0000000','0.0000000','1e1','1','-1.0000000','1.00000000',' 1.0000000'])assert.throws(()=>acquisitionLimit(value));
});
test('individual and aggregate signed fees remain bounded',()=>{
 assert.equal(feeLimit('100',0n),100n);assert.equal(feeLimit('10000000',90000000n),100000000n);
 for(const [fee,previous]of [['10000001',0n],['100',100000000n],['100',-1n],['0',0n],['0100',0n]])assert.throws(()=>feeLimit(fee,previous));
});
test('two processes reading the same prepared phase allow only one to cross the RPC boundary',async t=>{
 const base=fixture(t),output=path.join(base,'run');assert.equal(run(['--prepare',output]).status,0);
 const reportPath=path.join(output,'report.json'),observed=path.join(base,'rpc-boundary.txt');
 // Hold each real report read until both processes have the same snapshot.
 // Only the external RPC call is stopped; key/config/phase/file operations run.
 const loader='data:text/javascript,'+encodeURIComponent(`
 import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
 const originalRead=fs.readFileSync,base=${JSON.stringify(base)},report=${JSON.stringify(reportPath)};
 const {rpc}=createRequire(${JSON.stringify(path.join(root,'app/package.json'))})('@stellar/stellar-sdk');
 rpc.Server.prototype.getNetwork=async()=>{fs.appendFileSync(${JSON.stringify(observed)},process.pid+'\\n');throw Error('Synthetic RPC boundary stop');};
 fs.readFileSync=(file,...args)=>{const value=originalRead(file,...args);if(file===report){fs.writeFileSync(path.join(base,'ready-'+process.pid),'ready');const started=Date.now();while(fs.readdirSync(base).filter(n=>n.startsWith('ready-')).length<2){if(Date.now()-started>5000)throw Error('Test barrier timed out');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}return value;};`);
 const launch=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import',denyNetwork,'--import',loader,script,'--fund',output],{cwd:root,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>{stderr+=b});const timer=setTimeout(()=>child.kill('SIGKILL'),10000);child.once('error',reject);child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stderr})});});
 const results=await Promise.all([launch(),launch()]);assert.ok(results.every(r=>r.code===1&&!r.signal),JSON.stringify(results));
 assert.equal(fs.readFileSync(observed,'utf8').trim().split('\n').length,1,'Only the winner may reach even the first RPC read');
 assert.equal(fs.statSync(path.join(output,'fund.claim')).mode&0o777,0o600);
 // Simulate interruption before the normal running/failed state was recorded.
 const report=JSON.parse(fs.readFileSync(reportPath));report.status='prepared';fs.writeFileSync(reportPath,JSON.stringify(report));
 const denied=run(['--fund',output]);assert.notEqual(denied.status,0);assert.doesNotMatch(denied.stderr,/Unexpected network request/);assert.equal(JSON.parse(fs.readFileSync(reportPath)).status,'prepared');
 // A completed fund marker must not prevent claiming the separate exercise phase.
 report.status='funded';fs.writeFileSync(reportPath,JSON.stringify(report));const exercise=run(['--exercise',output]);assert.notEqual(exercise.status,0);assert.match(exercise.stderr,/Unexpected network request/);assert.equal(fs.statSync(path.join(output,'exercise.claim')).mode&0o777,0o600);
});
test('malformed local JSON and key material never expose input fragments in diagnostics',t=>{
 const base=fixture(t),output=path.join(base,'run');assert.equal(run(['--prepare',output]).status,0);const secrets=path.join(output,'secrets.json'),valid=fs.readFileSync(secrets,'utf8');
 fs.writeFileSync(secrets,'synthetic-private-fragment-not-a-real-secret');const invalidJson=run(['--fund',output]);assert.notEqual(invalidJson.status,0);assert.doesNotMatch(invalidJson.stderr,/synthetic-|Unexpected network request/);
 const data=JSON.parse(valid);data.roles.seller='synthetic-private-fragment-not-a-real-secret';fs.writeFileSync(secrets,JSON.stringify(data));const invalidKey=run(['--fund',output]);assert.notEqual(invalidKey.status,0);assert.doesNotMatch(invalidKey.stderr,/synthetic-|Unexpected network request/);
 assert.equal(fs.existsSync(path.join(output,'fund.claim')),false);
});
test('abrupt process termination preserves the phase claim and rejects replay',async t=>{
 const base=fixture(t),output=path.join(base,'run'),reached=path.join(base,'reached');assert.equal(run(['--prepare',output]).status,0);
 const loader='data:text/javascript,'+encodeURIComponent(`import fs from 'node:fs';import {createRequire} from 'node:module';const {rpc}=createRequire(${JSON.stringify(path.join(root,'app/package.json'))})('@stellar/stellar-sdk');rpc.Server.prototype.getNetwork=async()=>{fs.writeFileSync(${JSON.stringify(reached)},'stopped before network');setInterval(()=>{},100);await new Promise(()=>{});};`);
 const child=spawn(process.execPath,['--import',denyNetwork,'--import',loader,script,'--fund',output],{cwd:root,stdio:'ignore'});t.after(()=>child.kill('SIGKILL'));
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 for(let n=0;n<200&&!fs.existsSync(reached);n++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(fs.existsSync(reached),'Child never reached the intercepted first RPC call');
 child.kill('SIGKILL');assert.equal((await exited).signal,'SIGKILL');assert.equal(fs.statSync(path.join(output,'fund.claim')).mode&0o777,0o600);
 const result=run(['--fund',output]);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/Unexpected network request/);assert.equal(JSON.parse(fs.readFileSync(path.join(output,'report.json'))).status,'fund-running');
});
