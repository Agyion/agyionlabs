import type {PrivacyVaultHandle,PrivacyVaultScope} from './vault.mjs';
import type {PrivateProfile} from './client.mjs';
import type {RecoveredArchive} from './recovery.mjs';
import type {PrivateReceiveDescriptor,PrivateCredentialHandle,CredentialRole} from './credentials.mjs';
export type PrivateAccount=Readonly<{kind:'account'|'contract';id:string}>;
type Money=Readonly<{asset:string;amount:string}>;
export type PrivateCommand=
 | (Money&Readonly<{action:'deposit'}>)
 | (Money&Readonly<{action:'transfer';recipient:PrivateReceiveDescriptor}>)
 | Readonly<{action:'consolidate';asset:string}>
 | (Money&Readonly<{action:'withdraw';recipient:PrivateAccount}>)
 | (Money&Readonly<{action:'pod-create';recipient:PrivateReceiveDescriptor;unlockLedger:string;grantId:string}>)
 | Readonly<{action:'pod-claim';noteId:string;grantId:string}>
 | (Money&Readonly<{action:'trigger-create';recipient:PrivateReceiveDescriptor;deadline:string;condition:string;attester:readonly [string,string];attesterRecipient:PrivateReceiveDescriptor;grantId:string}>)
 | Readonly<{action:'trigger-claim';noteId:string;attestation:readonly [string,string,string]}>
 | Readonly<{action:'trigger-refund';noteId:string}>
 | (Money&Readonly<{action:'envoy-grant';agent:PrivateReceiveDescriptor;recipient:PrivateReceiveDescriptor;validFrom:string;expiresAt:string;maxPerClaim:string;claims:string;grantId:string}>)
 | Readonly<{action:'envoy-claim';noteId:string;amount:string}>
 | Readonly<{action:'envoy-reclaim';noteId:string}>
 | Readonly<{action:'envoy-revoke';grantId:string}>;
export interface RequiredCredentialExport {readonly id:string;readonly grantId:string;readonly recipient:PrivateReceiveDescriptor;readonly role:CredentialRole;readonly note:readonly bigint[]}
export interface PrivatePlanSummary {readonly action:PrivateCommand['action'];readonly asset:string;readonly amount:string}
export type PrivateCommandPlan=Readonly<{kind:'transition';configuration:unknown;addresses:Readonly<{asset:string|null;bridgeAccount:PrivateAccount|null;feeAccount:null}>;summary:PrivatePlanSummary;requiredCredentialExports:readonly RequiredCredentialExport[]}>
 | Readonly<{kind:'revoke';witness:unknown;publicSignals:readonly string[];ownerKey:string;signature:string;summary:PrivatePlanSummary;requiredCredentialExports:readonly RequiredCredentialExport[]}>;
export function parsePrivateCommand(value:unknown,scope:PrivacyVaultScope):PrivateCommand;
export function planPrivateCommand(options:{command:PrivateCommand;profile:PrivateProfile;scope:PrivacyVaultScope;assets:readonly string[];ledger:bigint;source:PrivateAccount;archive:RecoveredArchive['archive'];notes:readonly {id:string;index:bigint;note:readonly bigint[]}[];vault:PrivacyVaultHandle;credentials:readonly PrivateCredentialHandle[];usedGrantIds:readonly string[]}):PrivateCommandPlan;
