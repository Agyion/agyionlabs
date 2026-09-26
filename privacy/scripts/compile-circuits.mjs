import { spawnSync } from 'node:child_process';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]||resolve(root,'../artifacts/privacy-v2/circuit'));
mkdirSync(output,{recursive:true});
const bin=resolve(root,'node_modules/circom2/cli.js');
if(JSON.parse(readFileSync(resolve(root,'node_modules/circom2/package.json'),'utf8')).version!=='0.2.23')throw new Error('Unexpected circom2 package');
const run=args=>{const result=spawnSync(process.execPath,[bin,...args],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error||result.status!==0)throw new Error('Circuit compilation failed');return result.stdout;};
const version=run(['--version']).trim();
if(!version.includes('2.2.3'))throw new Error('Unexpected Circom version');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sources=['transition.circom','revocation.circom','primitives.circom','poseidon-encryption.circom'];
const manifest={compilerPackage:'circom2@0.2.23',version,optimization:'O2',lockSha256:sha(resolve(root,'package-lock.json')),
 sources:Object.fromEntries(sources.map(file=>[file,sha(resolve(root,'circuits',file))])),outputs:{}};
for(const name of ['transition','revocation']){
 run([`circuits/${name}.circom`,'--r1cs','--wasm','--sym','--O2','-o',output]);
 for(const suffix of ['r1cs','sym'])manifest.outputs[`${name}.${suffix}`]=sha(resolve(output,`${name}.${suffix}`));
 manifest.outputs[`${name}_js/${name}.wasm`]=sha(resolve(output,`${name}_js/${name}.wasm`));
}
writeFileSync(resolve(output,'compile-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
