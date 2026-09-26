// GPL-3.0-or-later. Node-only exact hash acceleration for public PPoT transcript
// verification. Curve operations, pairings and transcript checks stay upstream.
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {ChaCha} from 'ffjavascript';

export function compileNativeHashHelper(directory){
 const binary=join(directory,'phase1-sha256-chain');
 execFileSync('cc',['-O3','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations',fileURLToPath(new URL('./phase1-sha256-chain.c',import.meta.url)),'-lcrypto','-o',binary],{stdio:'pipe'});
 return binary;
}
export function nativeInitialChallengeHash(curve,power,logger){
 if(!Number.isInteger(power)||power<0||power>28)throw new Error('Unsupported ceremony power');
 const hasher=createHash('blake2b512'),g1=new Uint8Array(curve.G1.F.n8*2),g2=new Uint8Array(curve.G2.F.n8*2);
 curve.G1.toRprUncompressed(g1,0,curve.G1.g);curve.G2.toRprUncompressed(g2,0,curve.G2.g);
 hasher.update(createHash('blake2b512').digest());
 const repeat=(point,n,label)=>{
  logger?.info?.(`Native initial hash: ${label}, ${n} exact points`);
  const pointsPerBlock=Math.min(n,262144),block=new Uint8Array(pointsPerBlock*point.length);
  for(let i=0;i<pointsPerBlock;i++)block.set(point,i*point.length);
  while(n>=pointsPerBlock){hasher.update(block);n-=pointsPerBlock;}
  if(n)hasher.update(block.subarray(0,n*point.length));
 };
 const n=2**power;repeat(g1,n*2-1,'tauG1');repeat(g2,n,'tauG2');repeat(g1,n,'alphaTauG1');repeat(g1,n,'betaTauG1');
 hasher.update(g2);return new Uint8Array(hasher.digest());
}
export async function nativeBeaconRng(beaconHash,exponent,binary){
 if(!(beaconHash instanceof Uint8Array)||beaconHash.length<1||beaconHash.length>255||!Number.isInteger(exponent)||exponent<0||exponent>31)throw new Error('Unsupported beacon parameters');
 const rounds=(1n<<BigInt(exponent)).toString(),hex=Buffer.from(beaconHash).toString('hex');
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(binary,[hex,rounds],{stdio:['ignore','pipe','inherit']});let text='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{text+=part;if(text.length>65){child.kill();reject(new Error('Malformed native hash result'));}});
  child.once('error',reject);child.once('close',code=>code===0?resolve(text.trim()):reject(new Error('Native hash process failed')));
 });
 if(!/^[0-9a-f]{64}$/.test(output))throw new Error('Malformed native hash result');
 const hash=Buffer.from(output,'hex'),seed=Array.from({length:8},(_,i)=>hash.readUInt32BE(i*4));
 return new ChaCha(seed);
}
