// Isolated Node ESM hook. Fail closed if the reviewed upstream source changes.
// Only the two hash-function bodies change; npm files remain untouched.
import {createHash} from 'node:crypto';
const sourceRoot=new URL('../node_modules/snarkjs/src/',import.meta.url);
const hashes={
 'powersoftau_utils.js':'a2cf75004f68ed70fbce610521715150da9e82d68f6aed3fb6f091855cb5098d',
 'misc.js':'9f58cbff354c62412a7f0ab9a15f8de0d47b3c7a4602cbc751c98082d58a607b',
 'powersoftau_verify.js':'86abc24cf864c1df608f84b21f7327fd9b5011d3dd863014d616cabfc6213ffa',
};
let binary;
export function initialize(data){if(typeof data?.binary!=='string')throw new Error('Native binary required');binary=data.binary;}
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 const name=Object.keys(hashes).find(name=>url===new URL(name,sourceRoot).href);
 if(!name)return result;
 const source=String(result.source);
 if(createHash('sha256').update(source).digest('hex')!==hashes[name])throw new Error('Unreviewed snarkjs source; native verifier refused');
 if(name==='powersoftau_verify.js')return result;
 const helper=new URL('./phase1-native-hashes.mjs',import.meta.url).href;
 const first=name==='powersoftau_utils.js';
 const start=source.indexOf(first?'export function calculateFirstChallengeHash(':'export async function rngFromBeaconParams(');
 const end=source.indexOf(first?'export async function keyFromBeacon(':'export function hex2ByteArray(',start);
 if(start<0||end<=start)throw new Error('Exact upstream function boundary not found');
 const replacement=first
  ?'export function calculateFirstChallengeHash(curve,power,logger){return __agyionNativeInitial(curve,power,logger);}\n\n'
  :`export async function rngFromBeaconParams(beaconHash,numIterationsExp){return __agyionNativeBeacon(beaconHash,numIterationsExp,${JSON.stringify(binary)});}\n\n`;
 return {...result,source:`import {nativeInitialChallengeHash as __agyionNativeInitial,nativeBeaconRng as __agyionNativeBeacon} from ${JSON.stringify(helper)};\n`+source.slice(0,start)+replacement+source.slice(end)};
}
