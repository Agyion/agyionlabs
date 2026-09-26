// Resolve the reviewed development artifacts into the same pinned input format
// used by Node and browser verification. Public artifact paths/hashes only.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const base=resolve(process.argv[2]||fileURLToPath(new URL('../../artifacts/privacy-v2',import.meta.url)));
const manifest=JSON.parse(readFileSync(resolve(base,'keys/manifest.json'),'utf8'));
if(manifest.schema!=='agyion-private-development-artifacts-v2'||manifest.developmentOnly!==true||manifest.phase1?.verified!==true)
 throw new Error('Verified development manifest required');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const result={};
for(const [name,count] of [['transition',157],['revocation',4]]){
 const source=manifest.circuits[name];
 if(source?.publicCount!==count)throw new Error('Circuit public count mismatch');
 const paths={wasm:`circuit/${name}_js/${name}.wasm`,zkey:`keys/${name}.zkey`,verificationKey:`keys/${name}-vk.json`};
 const pins={};
 for(const [key,path] of Object.entries(paths)){
  const expected=source[`${key}Sha256`];
  if(!/^[0-9a-f]{64}$/.test(expected)||hash(resolve(base,path))!==expected)throw new Error('Actual artifact hash mismatch');
  pins[`${key}Sha256`]=expected;
 }
 result[name]={...paths,pins};
}
writeFileSync(resolve(base,'prover-cases.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Pinned development prover cases written; no key generation or activation');
