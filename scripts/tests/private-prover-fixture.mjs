import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {keyDigest} from '../../contracts/private-pool/tools/pin-verifiers.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function privateProverFixture(t) {
  const root=await mkdtemp(join(tmpdir(),'agyion-prover-package-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const base=join(root,'artifacts/privacy-v2');
  const put=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),value);};
  const sources={};
  for(const name of ['transition.circom','revocation.circom','primitives.circom','poseidon-encryption.circom']) {
    const bytes=Buffer.from(`source ${name}`);sources[name]=sha(bytes);await put(`privacy/circuits/${name}`,bytes);
  }
  const lock='{"lockfileVersion":3}\n';await put('privacy/package-lock.json',lock);
  const compilation={compilerPackage:'circom2@0.2.23',version:'circom2 npm package 0.2.23\ncircom compiler 2.2.3',optimization:'O2',lockSha256:sha(lock),sources,outputs:{}};
  const development={schema:'agyion-private-development-artifacts-v2',developmentOnly:true,phase1:{verified:true},compilation,circuits:{}};
  const cases={};let pins='';
  for(const [name,publicCount,pinName] of [['transition',157,'MAIN_VK_HASH'],['revocation',4,'REVOCATION_VK_HASH']]) {
    const vk=await readFile(resolve(`contracts/private-pool/fixtures/verified-v2/keys/${name}-vk.json`));
    const buffers={wasm:Buffer.from(`${name} wasm`),zkey:Buffer.from(`${name} public zkey`),verificationKey:vk};
    const paths={wasm:`circuit/${name}_js/${name}.wasm`,zkey:`keys/${name}.zkey`,verificationKey:`keys/${name}-vk.json`};
    const entry={publicCount};cases[name]={...paths,pins:{}};
    for(const kind of Object.keys(buffers)) {
      const hash=sha(buffers[kind]);entry[`${kind}Sha256`]=hash;cases[name].pins[`${kind}Sha256`]=hash;
      await put(`artifacts/privacy-v2/${paths[kind]}`,buffers[kind]);
    }
    const r1cs=Buffer.from(`${name} r1cs`);await put(`artifacts/privacy-v2/circuit/${name}.r1cs`,r1cs);
    entry.r1csSha256=sha(r1cs);compilation.outputs[`${name}.r1cs`]=sha(r1cs);
    compilation.outputs[`${name}_js/${name}.wasm`]=entry.wasmSha256;
    development.circuits[name]=entry;
    const digest=keyDigest(JSON.parse(vk),publicCount);
    pins+=`pub const ${pinName}: [u8; 32] = [${[...digest].map(x=>'0x'+x.toString(16).padStart(2,'0')).join(',')}];\n`;
  }
  await put('contracts/private-pool/src/pins.rs',pins);
  await put('contracts/private-pool/fixtures/verified-v2/keys/manifest.json',JSON.stringify(development));
  await put('artifacts/privacy-v2/keys/manifest.json',JSON.stringify(development));
  await put('artifacts/privacy-v2/circuit/compile-manifest.json',JSON.stringify(compilation));
  await put('artifacts/privacy-v2/prover-cases.json',JSON.stringify(cases));
  return {root,base,put,cases,development};
}
