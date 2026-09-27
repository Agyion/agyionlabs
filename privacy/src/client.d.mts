export interface PrivateProfile {readonly domain:bigint;readonly assetPolicyRoot:bigint;readonly epoch:bigint;readonly auditor:readonly [bigint,bigint]}
export interface LocalProof {readonly proof:string;readonly publicSignals:readonly string[]}
declare const draftBrand:unique symbol;
declare const noteBrand:unique symbol;
export interface LocalPrivateDraft {readonly [draftBrand]:true;readonly kind:'LocalPrivateDraft';readonly publicSignals:readonly string[];readonly ciphertextDigest:string}
export interface RecoveredPrivateNote {readonly [noteBrand]:true;readonly kind:'RecoveredPrivateNote';readonly recordId:string;readonly slot:0|1;readonly commitment:string}
export interface LocalPrivacyClient {
 prepare(configuration:unknown):LocalPrivateDraft;
 prepareSubmission(handle:LocalPrivateDraft):Promise<LocalProof&{kind:'UnsubmittedPrivateTransition';ciphertextDigest:string}>;
 scanRecord(value:unknown,anchor:unknown,secrets:readonly bigint[]):readonly RecoveredPrivateNote[];
 readNote(handle:RecoveredPrivateNote):readonly bigint[];
 forget(handle:LocalPrivateDraft|RecoveredPrivateNote):boolean;
}
export function createLocalPrivacyClient(options:{profile:PrivateProfile;prove(witness:unknown):Promise<LocalProof>;verify(proof:string,signals:readonly string[]):Promise<boolean>}):LocalPrivacyClient;
