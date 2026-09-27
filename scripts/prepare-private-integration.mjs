// Reconstructs local DEVELOPMENT test inputs from reviewed public artifacts.
// No network, setup generation, private witness input or publication occurs here.
import {readFile,writeFile,lstat,realpath,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual} from 'node:util';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectAcquiredProver} from './fetch-private-prover.mjs';
import {inspectDevelopmentProver} from './package-private-prover.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const execute=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ensure=(ok,message)=>{if(!ok)throw Error(message)};
const names=['transition','revocation'];
const compiledPaths=names.flatMap(name=>[`${name}.r1cs`,`${name}.sym`,`${name}_js/${name}.wasm`]);
async function ordinaryPath(root,path,{directory=false}={}){
 const base=resolve(root),target=resolve(path);
 ensure(target===base||target.startsWith(base+sep),'Path escapes its source directory');
 ensure(await realpath(base)===base,'Source directory must be canonical');
 const parts=relative(base,target).split(sep).filter(Boolean);let current=base;
 for(const part of parts){current=join(current,part);const info=await lstat(current);
  ensure(!info.isSymbolicLink(),'Symlink paths are not accepted');
  ensure(current===target?(directory?info.isDirectory():info.isFile()):info.isDirectory(),'Expected an ordinary file or directory');
 }
 if(parts.length===0)ensure(directory&&(await lstat(base)).isDirectory(),'Expected ordinary directory');
 return target;
}
async function boundedFile(root,path,maximum=1024*1024){
 const file=await ordinaryPath(root,resolve(root,path)),info=await lstat(file);
 ensure(info.size>0&&info.size<=maximum,'Invalid public input size');const bytes=await readFile(file);
 ensure(bytes.length===info.size&&bytes.length<=maximum,'Public input changed during read');return bytes;
}
async function preflightOutput(root,output,acquired){
 ensure(typeof output==='string'&&output.length>0,'Explicit output path is required');
 const target=resolve(root,output),artifacts=join(root,'artifacts');
 ensure(target.startsWith(artifacts+sep),'Output must be a fresh directory inside artifacts');
 ensure(target!==acquired&&!target.startsWith(acquired+sep)&&!acquired.startsWith(target+sep),'Output must not overlap acquired artifacts');
 await ordinaryPath(root,dirname(target),{directory:true});
 try{await lstat(target);throw Error('Output already exists')}catch(error){if(error.code!=='ENOENT')throw error}
 return target;
}
async function publicFixtures(root){
 const base=join(root,'contracts/private-pool/fixtures/verified-v2/proofs');
 await ordinaryPath(root,base,{directory:true});
 const chainBytes=await boundedFile(base,'chain.json'),chain=JSON.parse(chainBytes);
 ensure(chain.testOnly===true&&Array.isArray(chain.steps)&&chain.steps.length===17,'Expected 17 public development proof fixtures');
 const files=new Map([['chain.json',chainBytes]]);
 for(const step of chain.steps){
  ensure(typeof step.file==='string'&&/^[0-9]{2}-[a-z-]+\.json$/.test(step.file)&&step.file===`${step.name}.json`&&!files.has(step.file),'Invalid public proof fixture path');
  const bytes=await boundedFile(base,step.file),proof=JSON.parse(bytes);
  ensure(proof.testOnly===true&&Array.isArray(proof.publicSignals)&&proof.publicSignals.length===(step.revocation===true?4:157)&&proof.proof?.protocol==='groth16','Invalid public proof fixture');
  files.set(step.file,bytes);
 }
 return files;
}
async function runTool(root,script,args,log){
 await ordinaryPath(root,join(root,script));
 let result;
 try{
  result=await execute(process.execPath,[join(root,script),...args],{cwd:root,timeout:510_000,maxBuffer:8*1024*1024,encoding:'utf8'});
 }catch(error){
  await writeFile(log,String(error.stdout??'')+String(error.stderr??''),{flag:'wx'});
  throw Error(`Preparation tool failed: ${script}`);
 }
 await writeFile(log,result.stdout+result.stderr,{flag:'wx'});
}
export async function preparePrivateIntegration({root=ROOT,output,acquiredRoot=resolve(root,'artifacts/private-prover-runtime'),developmentOnly=false}={}){
 ensure(developmentOnly===true,'Preparation requires explicit development mode');
 root=resolve(root);const acquired=resolve(root,acquiredRoot),target=await preflightOutput(root,output,acquired);
 await ordinaryPath(root,acquired,{directory:true});
 const checked=await inspectAcquiredProver({root,artifactRoot:acquired});
 const manifestBytes=await boundedFile(root,'contracts/private-pool/fixtures/verified-v2/keys/manifest.json'),manifest=JSON.parse(manifestBytes);
 const expected=manifest.compilation;
 ensure(isDeepStrictEqual(Object.keys(expected.outputs).sort(),[...compiledPaths].sort()),'Unexpected compiled output paths');
 const proofs=await publicFixtures(root),keys=new Map();
 for(const name of names)for(const [kind,path]of [['zkey',`keys/${name}.zkey`],['verificationKey',`keys/${name}-vk.json`]]){
  const bytes=await boundedFile(acquired,path,kind==='zkey'?512*1024*1024:1024*1024);
  ensure(sha(bytes)===checked.releases[name][kind].sha256,'Public artifact changed before staging');keys.set(path,bytes);
 }
 // Atomic exclusive directory creation also prevents concurrent helper runs
 // from merging partial outputs. Failed staging remains visible for diagnosis.
 await mkdir(target,{mode:0o700});
 await runTool(root,'privacy/scripts/compile-circuits.mjs',[join(target,'circuit')],join(target,'compile.log'));
 const compilation=JSON.parse(await boundedFile(target,'circuit/compile-manifest.json'));
 ensure(isDeepStrictEqual(compilation,expected),'Compiled metadata differs from reviewed source and compiler pins');
 for(const path of compiledPaths)ensure(sha(await boundedFile(target,`circuit/${path}`,256*1024*1024))===expected.outputs[path],`Compiled artifact hash differs: ${path}`);
 const calculators={};for(const name of names){const path=`circuit/${name}_js/witness_calculator.js`;calculators[path]=sha(await boundedFile(target,path));}
 await mkdir(join(target,'keys'));await mkdir(join(target,'proofs'));
 for(const [path,bytes]of keys)await writeFile(join(target,path),bytes,{flag:'wx'});
 await writeFile(join(target,'keys/manifest.json'),manifestBytes,{flag:'wx'});
 for(const [path,bytes]of proofs)await writeFile(join(target,'proofs',path),bytes,{flag:'wx'});
 await runTool(root,'privacy/scripts/write-prover-manifest.mjs',[target],join(target,'prover-manifest.log'));
 const verified=await inspectDevelopmentProver({root,artifactRoot:target});
 const receipt={schema:'agyion-private-integration-preparation-v1',status:'prepared',developmentOnly:true,ceremonyGenerated:false,
  proofFixtures:proofs.size-1,provenance:verified.provenance,compiledOutputs:expected.outputs,generatedCalculators:calculators,
  proofSha256:Object.fromEntries([...proofs].map(([name,bytes])=>[name,sha(bytes)]))};
 await writeFile(join(target,'preparation.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length===0||(args.length===1&&args[0]==='--plan'))process.stdout.write('Plan only: compile locked public circuit sources, verify every output pin, and stage fetched development keys plus committed test proofs in a fresh artifacts directory. No setup or network.\n');
 else{
  ensure(args.length===2&&args[0]==='--development'&&!args[1].startsWith('--'),'Usage: prepare-private-integration.mjs --development artifacts/fresh-directory');
  process.stdout.write(JSON.stringify(await preparePrivateIntegration({developmentOnly:true,output:args[1]}),null,2)+'\n');
 }
}
