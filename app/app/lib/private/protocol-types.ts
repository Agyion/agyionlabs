import type {PrivateVaultController,PrivacyVaultScope} from '../privateVault';
import type {SubmissionOutcome} from '../../../../contracts/private-pool/client/submission';
import type {RevocationOutcome} from '../../../../contracts/private-pool/client/revocation';
import type {PrivateTriggerAttester,PrivateTriggerAttestation} from '../../../../privacy/src/credentials.mjs';

export type VaultAccess=Pick<PrivateVaultController,'withCheckedVault'|'getSnapshot'|'subscribe'>;
/** The strict planner supplies the closed command union; opaque JSON from the
 * UI must still pass its runtime parser before any proof or signature. */
export type PrivateCommand=Readonly<{action:string;[key:string]:unknown}>;
export type PrivateReceiveDescriptor=Readonly<{version:'1';kind:'PrivateReceiveDescriptor';scope:PrivacyVaultScope;spendingAuthHash:string;viewPoint:readonly [string,string]}>;
export type PrivateNoteAction='pod-claim'|'trigger-claim'|'trigger-refund'|'envoy-claim'|'envoy-reclaim';
export type PrivateNoteSummary=Readonly<{id:string;kind:'cash'|'pod'|'trigger'|'envoy';asset:string;amount:string;notBefore:string;deadline:string;grantId?:string;supportedActions:readonly PrivateNoteAction[]}>;
export type PrivatePendingAttempt=Readonly<{hash:string;operation:'submit'|'revoke';source:string;releaseId:string}>;
export type PrivateProtocolSnapshot=Readonly<{
 status:'idle'|'checking'|'ready'|'unavailable'|'locked';
 phase:'recovering'|'proving'|'confirming-fee'|'signing'|null;
 ledger:number|null;
 balances:readonly Readonly<{asset:string;amount:string}>[];
 notes:readonly PrivateNoteSummary[];
 pending:readonly PrivatePendingAttempt[];
 error:string|null;
 feeQuote:Readonly<{feeStroops:string;maxFeeStroops:string}>|null;
}>;
export type PrivateOperationSummary=Readonly<{action:string;asset:string;amount:string}>;
export type PreparedPrivateOperation=Readonly<{
 id:string;summary:PrivateOperationSummary;publicFeePayer:string;maxFeeStroops:string;
 credentials:readonly Readonly<{id:string;role:string;recipient:string}>[];
}>;
export type PrivateOperationOutcome=SubmissionOutcome|RevocationOutcome;
export type FeeConfirmation=Readonly<{feeStroops:string;maxFeeStroops:string;source:string;action:string;signal:AbortSignal}>;
export type PrivateProtocolOptions=Readonly<{releaseKey?:string;vault:VaultAccess;maxFeeStroops:string;confirmFee(value:FeeConfirmation):Promise<boolean>}>;
export interface PrivateProtocol {
 subscribe(listener:()=>void):()=>void;
 getSnapshot():PrivateProtocolSnapshot;
 refresh():Promise<PrivateProtocolSnapshot>;
 refreshPending():Promise<readonly PrivatePendingAttempt[]>;
 receiveDescriptor():Promise<PrivateReceiveDescriptor>;
 prepare(command:PrivateCommand):Promise<PreparedPrivateOperation>;
 submit(handle:PreparedPrivateOperation):Promise<PrivateOperationOutcome>;
 withFeeLimit(handle:PreparedPrivateOperation,maxFeeStroops:string):PreparedPrivateOperation;
 reconcile(hash:string):Promise<PrivateOperationOutcome>;
 exportCredential(handle:PreparedPrivateOperation,id:string,password:string):Promise<Readonly<{blob:Blob;filename:string}>>;
 checkExportedCredential(handle:PreparedPrivateOperation,id:string,file:File,password:string):Promise<void>;
 importCredential(file:File,password:string):Promise<void>;
 signAttestation(attester:PrivateTriggerAttester,noteId:string):Promise<PrivateTriggerAttestation>;
 dispose():void;
}
