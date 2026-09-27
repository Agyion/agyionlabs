import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fragment='synthetic-private-fragment-not-json';
function fixture(t){
 const artifacts=path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
 const base=fs.mkdtempSync(path.join(artifacts,'private-json-test-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const run=path.join(base,'run');fs.mkdirSync(run,{mode:0o700});
 for(const name of ['configuration.json','report.json'])fs.writeFileSync(path.join(run,name),'{}',{mode:0o600});
 fs.writeFileSync(path.join(run,'test-only-secrets.json'),fragment,{mode:0o600});return run;
}
function invoke(script,args,run){
 // Catalog has a fixed historical directory. Redirect only its three input
 // files to real synthetic fixtures, never inspect the operator's saved keys.
 const historical=path.join(root,'artifacts/security/2026-09-27-compatibility/market-live-fixed-quote');
 const redirects=Object.fromEntries(['configuration.json','report.json','test-only-secrets.json'].map(name=>[path.join(historical,name),path.join(run,name)]));
 const loader=`import fs from 'node:fs';import http from 'node:http';import https from 'node:https';
 const redirects=${JSON.stringify(redirects)};
 for(const name of ['lstatSync','readFileSync']){const original=fs[name].bind(fs);fs[name]=(file,...args)=>original(redirects[String(file)]??file,...args);}
 globalThis.fetch=()=>{throw Error('Unexpected network request')};http.request=https.request=()=>{throw Error('Unexpected network request')};`;
 return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(loader),path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',timeout:10000});
}
for(const script of ['verify-testnet-market.mjs','verify-testnet-market-catalog.mjs']){
 test(`${script} rejects malformed private JSON without exposing a fragment or making requests`,t=>{
  const run=fixture(t),before=fs.readdirSync(run).sort();
  const result=invoke(script,script.endsWith('-catalog.mjs')?['--publish']:['--execute',run],run);
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-|Unexpected network request/);
  assert.match(result.stderr,/Invalid local private JSON/);
  assert.deepEqual(fs.readdirSync(run).sort(),before);
  assert.equal(fs.readFileSync(path.join(run,'test-only-secrets.json'),'utf8'),fragment);
  assert.equal(fs.readFileSync(path.join(run,'report.json'),'utf8'),'{}');
 });
}
test('private JSON preserves valid values and never retains the original parser error or input',async()=>{
 const {parsePrivateJson}=await import('../lib/private-json.mjs');
 assert.deepEqual(parsePrivateJson('{"roles":{"seller":"fixture"},"testnetOnly":true}'),{roles:{seller:'fixture'},testnetOnly:true});
 assert.equal(parsePrivateJson('null'),null);
 assert.deepEqual(parsePrivateJson('[1,"two",false]'),[1,'two',false]);
 for(const invalid of [fragment,'{"secret":'+fragment+'}',Buffer.from(fragment)]){
  assert.throws(()=>parsePrivateJson(invalid),error=>{
   assert.equal(error.message,'Invalid local private JSON');
   assert.equal(Object.hasOwn(error,'cause'),false);
   for(const name of Object.getOwnPropertyNames(error))assert.doesNotMatch(String(error[name]),/synthetic-|Unexpected token/);
   return true;
  });
 }
});
