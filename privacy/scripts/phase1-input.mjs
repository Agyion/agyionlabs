// Fixed-source selection, not transcript verification. A matching fingerprint
// must still pass the full powersOfTau.verify call before verified:true is set.
import {createReadStream,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

const BYTES=302083218;
const SHA256='9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711';
const SOURCE=Object.freeze({
 source:'https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_18.ptau',
 sourceRepository:'https://github.com/privacy-ethereum/perpetualpowersoftau',
 sourceCommit:'b077232729db7c9eb65b63c4aaaa0ac4a1b0bba2',
});
export function selectedPhase1Source({bytes,sha256}){
 if(bytes!==BYTES||sha256!==SHA256)throw new Error('UNEXPECTED_PHASE1_ARTIFACT');
 return SOURCE;
}
export function checkSelectedPhase1Provenance(provenance){
 const source=selectedPhase1Source(provenance);
 if(provenance.verified!==true||Object.entries(source).some(([key,value])=>provenance[key]!==value))
  throw new Error('UNEXPECTED_PHASE1_PROVENANCE');
 // This validates local metadata only, not the full transcript or its history.
 return source;
}
export async function checkSelectedPhase1Input(file){
 const stat=statSync(file);
 if(!stat.isFile()||stat.size!==BYTES)throw new Error('UNEXPECTED_PHASE1_ARTIFACT');
 const sha=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(file)){bytes+=chunk.length;sha.update(chunk);}
 return selectedPhase1Source({bytes,sha256:sha.digest('hex')});
}
