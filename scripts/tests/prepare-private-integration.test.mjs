import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,rm,stat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {privateProverFixture} from './private-prover-fixture.mjs';
import {packagePrivateProver} from '../package-private-prover.mjs';
import {acquirePrivateProver} from '../fetch-private-prover.mjs';
import {preparePrivateIntegration} from '../prepare-private-integration.mjs';

const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const f=await privateProverFixture(t);
 for(const name of ['transition','revocation']){
  const bytes=Buffer.from(`${name} public symbols`);
  f.development.compilation.outputs[`${name}.sym`]=hash(bytes);
  await f.put(`artifacts/privacy-v2/circuit/${name}.sym`,bytes);
 }
 for(const name of ['contracts/private-pool/fixtures/verified-v2/keys/manifest.json','artifacts/privacy-v2/keys/manifest.json'])await f.put(name,JSON.stringify(f.development));
 await f.put('artifacts/privacy-v2/circuit/compile-manifest.json',JSON.stringify(f.development.compilation));
 const compiled={};for(const name of Object.keys(f.development.compilation.outputs))compiled[name]=(await readFile(join(f.base,'circuit',name))).toString('base64');
 for(const name of ['transition','revocation'])compiled[`${name}_js/witness_calculator.js`]=Buffer.from('// Synthetic compiler fixture only.\nmodule.exports=()=>{};\n').toString('base64');
 const writeCompiler=async(mutation='')=>f.put('privacy/scripts/compile-circuits.mjs',`import fs from 'node:fs';import path from 'node:path';const out=process.argv[2];fs.mkdirSync(out,{recursive:true});const files=${JSON.stringify(compiled)};for(const [name,data]of Object.entries(files)){const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(data,'base64'));}fs.writeFileSync(path.join(out,'compile-manifest.json'),${JSON.stringify(JSON.stringify(f.development.compilation))});${mutation}`);
 await writeCompiler();await f.put('privacy/scripts/write-prover-manifest.mjs',await readFile(join(sourceRoot,'privacy/scripts/write-prover-manifest.mjs')));
 const proofs=join(sourceRoot,'contracts/private-pool/fixtures/verified-v2/proofs');for(const name of await readdir(proofs))await f.put(`contracts/private-pool/fixtures/verified-v2/proofs/${name}`,await readFile(join(proofs,name)));
 await packagePrivateProver({root:f.root,artifactRoot:f.base,developmentOnly:true});
 const chunks=new Map();for(const name of await readdir(join(f.root,'app/public/zk/private')))chunks.set(name,await readFile(join(f.root,'app/public/zk/private',name)));
 await rm(f.base,{recursive:true});
 await acquirePrivateProver({root:f.root,developmentOnly:true,fetchImpl:async url=>{const response=new Response(chunks.get(new URL(url).pathname.split('/').pop()));Object.defineProperty(response,'url',{value:String(url)});return response;}});
 return {...f,output:join(f.root,'artifacts/integration'),acquired:join(f.root,'artifacts/private-prover-runtime'),writeCompiler};
}

test('fresh staging combines only acquired public keys, committed proofs and verified compiler output',async t=>{
 const f=await fixture(t),result=await preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true});
 assert.equal(result.status,'prepared');assert.equal(result.proofFixtures,17);assert.equal(result.ceremonyGenerated,false);
 const cases=JSON.parse(await readFile(join(f.output,'prover-cases.json'),'utf8'));assert.equal(cases.transition.pins.zkeySha256,f.cases.transition.pins.zkeySha256);
 assert.equal((await readdir(join(f.output,'proofs'))).length,18);
 assert.match(await readFile(join(f.output,'circuit/transition_js/witness_calculator.js'),'utf8'),/Synthetic compiler fixture/);
 assert.deepEqual(await readFile(join(f.output,'keys/transition.zkey')),await readFile(join(f.acquired,'keys/transition.zkey')));
 await assert.rejects(stat(f.base),{code:'ENOENT'});
 const before=await readFile(join(f.output,'preparation.json'));await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/exists|EEXIST/);assert.deepEqual(await readFile(join(f.output,'preparation.json')),before);
});
test('explicit development mode, output confinement and ordinary directories are required',async t=>{
 const f=await fixture(t);
 await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output}),/development/);
 for(const output of [f.root,join(f.root,'outside'),join(f.root,'artifacts'),f.acquired,join(f.acquired,'nested')])await assert.rejects(preparePrivateIntegration({root:f.root,output,developmentOnly:true}));
 const linked=join(f.root,'artifacts/linked');await symlink(join(f.root,'privacy'),linked);
 await assert.rejects(preparePrivateIntegration({root:f.root,output:join(linked,'fresh'),developmentOnly:true}),/symlink|canonical|ordinary/i);
 await assert.rejects(stat(f.output),{code:'ENOENT'});
});
test('modified source, acquired bytes or receipt fail before output creation',async t=>{
 const f=await fixture(t),source=join(f.root,'privacy/circuits/transition.circom'),original=await readFile(source);
 await writeFile(source,'changed');await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/source/i);await writeFile(source,original);
 const receipt=join(f.acquired,'runtime-acquisition.json'),saved=await readFile(receipt);await writeFile(receipt,'{}');await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/receipt/);await writeFile(receipt,saved);
 await writeFile(join(f.acquired,'keys/transition.zkey'),'tampered');await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/artifact/i);
 await assert.rejects(stat(f.output),{code:'ENOENT'});
});
test('compiler output tampering fails despite unchanged compiler metadata',async t=>{
 const f=await fixture(t);await f.writeCompiler("fs.writeFileSync(path.join(out,'transition.r1cs'),'tampered constraints');");
 await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/compiled|constraint|hash/i);
 await assert.rejects(stat(join(f.output,'preparation.json')),{code:'ENOENT'});
 assert.equal(await readFile(join(f.output,'circuit/transition.r1cs'),'utf8'),'tampered constraints');
});
test('proof paths cannot escape the committed fixture directory',async t=>{
 const f=await fixture(t),chain=join(f.root,'contracts/private-pool/fixtures/verified-v2/proofs/chain.json'),value=JSON.parse(await readFile(chain,'utf8'));
 value.steps[0].file='../../private.json';await writeFile(chain,JSON.stringify(value));
 await assert.rejects(preparePrivateIntegration({root:f.root,output:f.output,developmentOnly:true}),/proof.*path/i);
 await assert.rejects(stat(f.output),{code:'ENOENT'});
});
test('default plan and invalid CLI arguments never create output or request network access',()=>{
 const deny='data:text/javascript,'+encodeURIComponent("globalThis.fetch=()=>{throw Error('Unexpected network')};");
 for(const args of [[],['--plan'],['--development'],['--development','artifacts/unused','extra']]){
  const result=spawnSync(process.execPath,['--import',deny,join(sourceRoot,'scripts/prepare-private-integration.mjs'),...args],{cwd:sourceRoot,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,args.length===0||args[0]==='--plan'?0:1);assert.doesNotMatch(result.stderr,/Unexpected network/);
 }
});
