declare module '*privacy/src/identity.mjs' {
 export function domainField(value: {networkId:string;contractId:string}):bigint;
 export function assetField(contractId:string):bigint;
 export function accountField(value:{kind:'account'|'contract';id:string}):bigint;
 export function revocationTag(domain:bigint, publicKey:string):bigint;
}
declare module '*privacy/src/model.mjs' {
 export function parseCore23(value:unknown):readonly bigint[];
 export function fieldElement(value:unknown,path?:string):bigint;
 export class SparseMerkleTree {constructor(depth:number);readonly root:bigint;set(index:bigint,value:bigint):this;}
}
declare module '*privacy/src/threshold.mjs' {
 export const THRESHOLD_SUITE:string;
 export interface ThresholdConfig {version:string;suite:string;domain:{networkId:string;contractId:string};epoch:string;sessionId:string;threshold:string;trustees:readonly {id:string;authPublicKey:string}[];}
 export function parseThresholdConfig(value:unknown):ThresholdConfig;
 export function prepareDkgTranscript(config:unknown,packages:unknown):{transcriptHash:string};
 export function finalizeDkgTranscript(config:unknown,packages:unknown,acceptances:unknown):{transcriptHash:string;publicKey:string};
 export function pointToFieldElements(point:string):readonly [bigint,bigint];
}
declare module '*privacy/src/prover.mjs' {
 export function createLocalGroth16Prover(value:{wasm:Uint8Array;zkey:Uint8Array;verificationKey:Uint8Array;pins:{wasmSha256:string;zkeySha256:string;verificationKeySha256:string};publicCount:157|4}):Promise<{verify(proof:string,signals:readonly string[]):Promise<boolean>}>;
 export function encodeGroth16Proof(value:unknown):string;
}
