import type {PrivacyVaultHandle,PrivacyVaultScope,CompletePrivacyKeyBackup} from './vault.mjs';
export type CredentialRole='claim'|'refund'|'attest'|'agent'|'owner';
export interface PrivateReceiveDescriptor {readonly version:'1';readonly kind:'PrivateReceiveDescriptor';readonly scope:PrivacyVaultScope;readonly spendingAuthHash:string;readonly viewPoint:readonly [string,string]}
declare const credentialBrand:unique symbol;
declare const attesterBrand:unique symbol;
export interface PrivateCredentialHandle {readonly [credentialBrand]:true;readonly kind:'PrivateCredential';readonly scope:PrivacyVaultScope;readonly grantId:string;readonly role:CredentialRole;readonly noteId:string}
export interface PrivateCredentialExport {readonly vault:PrivacyVaultHandle;readonly grantId:string;readonly recipient:PrivateReceiveDescriptor;readonly role:CredentialRole;readonly note:readonly bigint[]}
export interface EncryptedPrivateCredential {readonly version:'1';readonly kind:'EncryptedPrivateCredential';readonly scope:PrivacyVaultScope;readonly recipientOwnerId:string;readonly grantId:string;readonly encrypted:CompletePrivacyKeyBackup['encrypted']}
export interface PrivateTriggerAttester {readonly [attesterBrand]:true;readonly kind:'PrivateTriggerAttester';readonly scope:PrivacyVaultScope;readonly publicPoint:readonly [string,string]}
export interface EncryptedTriggerAttester {readonly version:'1';readonly kind:'EncryptedTriggerAttester';readonly scope:PrivacyVaultScope;readonly publicPoint:readonly [string,string];readonly encrypted:CompletePrivacyKeyBackup['encrypted']}
export interface PrivateTriggerAttestation {readonly version:'1';readonly kind:'PrivateTriggerAttestation';readonly scope:PrivacyVaultScope;readonly noteId:string;readonly attestation:readonly [string,string,string]}
export function privateScope(value:unknown):PrivacyVaultScope;
export function bindPrivateScope(value:unknown,expected:unknown):void;
export function privateDecimal(value:unknown,nonzero?:boolean):bigint;
export function parseReceiveDescriptor(value:unknown,scope:PrivacyVaultScope):PrivateReceiveDescriptor;
export function receiveDescriptor(vault:PrivacyVaultHandle):PrivateReceiveDescriptor;
export function exportPrivateCredential(spec:PrivateCredentialExport,password:string):Promise<EncryptedPrivateCredential>;
export function checkExportedPrivateCredential(spec:PrivateCredentialExport,packet:unknown,password:string):Promise<true>;
export function importPrivateCredential(packet:unknown,password:string,vault:PrivacyVaultHandle):Promise<PrivateCredentialHandle>;
export function checkPrivateCredential(handle:PrivateCredentialHandle,packet:unknown,password:string,vault:PrivacyVaultHandle):Promise<true>;
export function forgetPrivateCredential(handle:PrivateCredentialHandle):boolean;
export function credentialViewKeys(handles:readonly PrivateCredentialHandle[],vault:PrivacyVaultHandle):readonly bigint[];
/** Explicit private opening access for the local coordinator only. Never serialize to UI/RPC. */
export function readPrivateCredential(handle:PrivateCredentialHandle,vault:PrivacyVaultHandle):Readonly<{payload:Readonly<{instrument:'pod'|'trigger'|'envoy';grantId:string;noteId:string;role:CredentialRole}>;note:readonly bigint[];viewScalar:bigint;podSecret?:bigint}>;
export function createTriggerAttester(scope:PrivacyVaultScope):PrivateTriggerAttester;
export function backupTriggerAttester(handle:PrivateTriggerAttester,password:string):Promise<EncryptedTriggerAttester>;
export function restoreTriggerAttester(packet:unknown,password:string,scope:PrivacyVaultScope):Promise<PrivateTriggerAttester>;
export function checkTriggerAttesterBackup(handle:PrivateTriggerAttester,packet:unknown,password:string):Promise<true>;
export function signTriggerAttestation(attester:PrivateTriggerAttester,credential:PrivateCredentialHandle,vault:PrivacyVaultHandle):PrivateTriggerAttestation;
export function forgetTriggerAttester(handle:PrivateTriggerAttester):boolean;
