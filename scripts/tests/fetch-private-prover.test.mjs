import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,rm,writeFile,stat,readdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {privateProverFixture} from './private-prover-fixture.mjs';
import {packagePrivateProver} from '../package-private-prover.mjs';
import {acquirePrivateProver,inspectAcquiredProver} from '../fetch-private-prover.mjs';
async function fixture(t){
 const f=await privateProverFixture(t);await packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true});
 const chunks=new Map();for(const name of await readdir(join(f.root,'app/public/zk/private')))chunks.set(name,await readFile(join(f.root,'app/public/zk/private',name)));
 await rm(f.base,{recursive:true});const target=join(f.root,'artifacts/private-prover-runtime'),requests=[];
 const fetchImpl=async(url,options)=>{requests.push({url,options});const blob=chunks.get(new URL(url).pathname.split('/').pop());const response=new Response(blob??'missing',{status:blob?200:404});Object.defineProperty(response,'url',{value:String(url)});return response};
 return{...f,chunks,target,requests,fetchImpl};
}
test('clean clone acquires six pinned public runtime files atomically without regenerating a ceremony',async t=>{
 const f=await fixture(t),result=await acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl});
 assert.equal(result.artifactCount,6);assert.equal(result.alreadyPresent,false);assert.equal(f.requests.length,6);
 for(const {url,options}of f.requests){assert.match(url,/^https:\/\/agyionlabs\.dev\/zk\/private\/[a-f0-9]{64}\.bin$/);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.method,'GET')}
 assert.deepEqual((await inspectAcquiredProver({root:f.root,artifactRoot:f.target})).releases,result.releases);
 await assert.rejects(stat(join(f.target,'circuit/transition.r1cs')),{code:'ENOENT'});
 const again=await acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:()=>{throw Error('Unexpected refetch')}});assert.equal(again.alreadyPresent,true);
 const packaged=await packagePrivateProver({root:f.root,artifactRoot:f.target,developmentOnly:true,acquiredRuntime:true});assert.equal(packaged.artifactCount,6);
 await inspectAcquiredProver({root:f.root,artifactRoot:f.target});
 await assert.rejects(packagePrivateProver({root:f.root,artifactRoot:f.target,developmentOnly:true}),{code:'ENOENT'});
});
test('wrong chunk bytes, overflow, redirects and missing chunks leave no installed cache',async t=>{
 const f=await fixture(t);
 for(const mode of ['hash','overflow','redirect','missing']){
  const fetchImpl=async(url,options)=>{const response=await f.fetchImpl(url,options),bytes=Buffer.from(await response.arrayBuffer());
   if(mode==='hash')bytes[0]^=1;const result=new Response(mode==='overflow'?Buffer.concat([bytes,Buffer.from([0])]):bytes,{status:mode==='missing'?404:200});Object.defineProperty(result,'url',{value:mode==='redirect'?'https://other.test/chunk':url});return result};
  await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl}),mode==='hash'?/chunk hash/:mode==='overflow'?/Oversized/:/fetch or redirect/);await assert.rejects(stat(f.target),{code:'ENOENT'});
  assert.deepEqual((await readdir(join(f.root,'artifacts'))).filter(name=>name.includes('acquire')),[]);
 }
});
test('reviewed provenance and explicit development mode are mandatory before any network request',async t=>{
 const f=await fixture(t);await assert.rejects(acquirePrivateProver({root:f.root,fetchImpl:f.fetchImpl}),/development/);
 await assert.rejects(acquirePrivateProver({root:f.root,artifactRoot:join(f.root,'..','outside-acquisition'),developmentOnly:true,fetchImpl:f.fetchImpl}),/within the repository/);
 for(const baseUrl of ['http://example.test','https://user:pass@example.test','https://example.test/?query=1','https://example.test/#fragment'])await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,baseUrl,fetchImpl:f.fetchImpl}));
 await f.put('privacy/circuits/transition.circom','modified');await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),/source/i);assert.equal(f.requests.length,0);
});
test('tampered generated pins, verifier digest, receipt and existing cache are never trusted',async t=>{
 const f=await fixture(t),module=join(f.root,'app/app/lib/privateProverAssets.ts'),original=await readFile(module,'utf8');
 await writeFile(module,original.replace(/"sha256": "[a-f0-9]{64}"/,'"sha256": "'+ '0'.repeat(64)+'"'));
 await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),/pin/i);assert.equal(f.requests.length,0);await writeFile(module,original);
 await acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl});
 const receipt=join(f.target,'runtime-acquisition.json'),receiptBytes=await readFile(receipt);await writeFile(receipt,'{}');await assert.rejects(inspectAcquiredProver({root:f.root,artifactRoot:f.target}),/receipt/i);await writeFile(receipt,receiptBytes);
 await writeFile(join(f.target,'keys/transition.zkey'),'corrupt');await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),/artifact/i);
 assert.equal(await readFile(join(f.target,'keys/transition.zkey'),'utf8'),'corrupt');
});
test('HTTP is accepted only for an explicit loopback test server and request timeout is bounded',async t=>{
 const f=await fixture(t),server=createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close()});
 const baseUrl=`http://127.0.0.1:${server.address().port}/`;
 await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,baseUrl}),/HTTPS/);
 const start=Date.now();await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,baseUrl,allowLocalHttpForTests:true,timeoutMs:75}));assert.ok(Date.now()-start<5000);
 await assert.rejects(stat(f.target),{code:'ENOENT'});
});
test('missing cached files, changed VK pin and escaped symlinks fail without replacing local data',async t=>{
 const f=await fixture(t);await acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl});const count=f.requests.length;
 await rm(join(f.target,'keys/transition.zkey'));await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),{code:'ENOENT'});assert.equal(f.requests.length,count);
 await rm(f.target,{recursive:true});const original=await readFile(join(f.root,'contracts/private-pool/src/pins.rs'),'utf8');await f.put('contracts/private-pool/src/pins.rs',original.replace(/0x[0-9a-f]{2}/,'0xff'));
 await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),/verifier digest/);await assert.rejects(stat(f.target),{code:'ENOENT'});
 await f.put('contracts/private-pool/src/pins.rs',original);await symlink(join(f.root,'privacy'),f.target);
 await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:f.fetchImpl}),/ordinary directory/);
 assert.ok(await stat(join(f.root,'privacy/package-lock.json')));
});
test('an explicitly selected HTTPS publication origin still acquires only exact reviewed bytes',async t=>{
 const f=await fixture(t),baseUrl='https://agyion.jasurbek-rustamov.workers.dev/';
 const result=await acquirePrivateProver({root:f.root,developmentOnly:true,baseUrl,fetchImpl:f.fetchImpl});
 assert.equal(result.artifactCount,6);assert.equal(f.requests.length,6);
 for(const {url,options}of f.requests){assert.equal(new URL(url).origin,new URL(baseUrl).origin);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined)}
 assert.deepEqual((await inspectAcquiredProver({root:f.root,artifactRoot:f.target})).releases,result.releases);
});
test('HTTP and redirect diagnostics are precise without logging response bodies, headers or redirect destinations',async t=>{
 const f=await fixture(t),baseUrl='https://agyion.jasurbek-rustamov.workers.dev/';
 for(const [mode,status,urlMatches,redirected]of [['http',403,true,false],['url',200,false,false],['redirect',200,true,true]]){
  let calls=0;const fetchImpl=async url=>{
   calls++;const response=new Response('private-diagnostic-body',{status,headers:{'set-cookie':'private-diagnostic-cookie'}});
   Object.defineProperty(response,'url',{value:urlMatches?String(url):'https://untrusted.invalid/secret-redirect-destination'});
   Object.defineProperty(response,'redirected',{value:redirected});return response;
  };
  await assert.rejects(acquirePrivateProver({root:f.root,developmentOnly:true,baseUrl,fetchImpl}),error=>{
   assert.equal(error.message,`Artifact fetch or redirect refused (HTTP ${status}; origin https://agyion.jasurbek-rustamov.workers.dev; URL matches ${urlMatches}; redirected ${redirected})`);
   assert.doesNotMatch(error.message,/private-diagnostic|untrusted|secret-redirect/);return true;
  },mode);
  assert.equal(calls,1);await assert.rejects(stat(f.target),{code:'ENOENT'});
  assert.deepEqual((await readdir(join(f.root,'artifacts'))).filter(name=>name.includes('acquire')),[]);
 }
});
