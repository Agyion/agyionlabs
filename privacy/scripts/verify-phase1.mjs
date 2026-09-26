// Verify a downloaded public prepared transcript before circuit-specific setup.
// A valid transcript does not attest to any contributor's real-world identity.
import os from 'node:os';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {powersOfTau} from 'snarkjs';
import {checkSelectedPhase1Input,selectedPhase1Source} from './phase1-input.mjs';
const cpus=os.cpus();os.cpus=()=>cpus.slice(0,8);
const file=resolve(process.argv[2]||fileURLToPath(new URL('../../artifacts/privacy-v2/ppot_0080_18.ptau',import.meta.url)));
await checkSelectedPhase1Input(file);
const logger={log:console.log,info:console.log,warn:console.warn,error:console.error,debug:()=>{}};
try{
 if(!await powersOfTau.verify(file,logger))throw new Error('Phase1 verification failed');
 const data=readFileSync(file);
 const bytes=data.length,sha256=createHash('sha256').update(data).digest('hex');
 const provenance={...selectedPhase1Source({bytes,sha256}),
  bytes,sha256,blake2b512:createHash('blake2b512').update(data).digest('hex'),
  verifiedBy:'snarkjs0.7.6 powersOfTau.verify',verified:true,
  boundary:'Published prepared phase1 only. Agyion circuit-specific phase2 remains a single-operator DEVELOPMENT contribution.'};
 writeFileSync(file+'.provenance.json',JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
 console.log('Prepared public phase1 VERIFIED',new Date().toISOString());
}finally{await globalThis.curve_bn128?.terminate();}
