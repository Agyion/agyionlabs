export const FIELD:bigint;
export const SCALAR_ORDER:bigint;
export const BASE8:readonly [bigint,bigint];
export const TAGS:Readonly<{NOTE:bigint;NULLIFIER:bigint;CONTEXT:bigint;POD:bigint}>;
export function fieldElement(value:unknown,path?:string):bigint;
export function fieldArray(value:unknown,count:number,path?:string):readonly bigint[];
export function bounded(value:unknown,bits:number,path?:string):bigint;
export function parseCore23(value:unknown):readonly bigint[];
export function parseNote24(value:unknown):readonly bigint[];
export function noteCommitment(note:readonly bigint[]):bigint;
export function nullifier(note:readonly bigint[]):bigint;
export function ownerHash(secret:bigint):bigint;
export function podSecretHash(secret:bigint):bigint;
export function attestationMessage(note:readonly bigint[]):bigint;
export function dummyNote(domain:bigint,asset:bigint):readonly bigint[];
export class SparseMerkleTree {
 constructor(depth:number);readonly depth:number;readonly root:bigint;
 get(index:bigint):bigint;path(index:bigint):readonly bigint[];set(index:bigint,value:bigint):this;clone():SparseMerkleTree;
}
