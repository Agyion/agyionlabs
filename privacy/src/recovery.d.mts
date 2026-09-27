import type {PrivateCredentialHandle} from './credentials.mjs';
import type {PrivateProfile,LocalPrivacyClient,RecoveredPrivateNote} from './client.mjs';
import type {PrivacyVaultHandle,PrivacyVaultScope} from './vault.mjs';
import type {SparseMerkleTree} from './model.mjs';
export const RECOVERY_ARCHIVE_LIMIT:bigint;
export interface RecoveryState {readonly root:bigint;readonly nextIndex:bigint;readonly recordCount:bigint;readonly revocationCount:bigint;readonly revocationRoot:bigint;readonly snapshotId:string}
export interface RecoveryReader {
 readState(options?:{signal?:AbortSignal}):Promise<RecoveryState>;
 readRecordIdAt(index:bigint,options:{snapshotId:string;signal?:AbortSignal}):Promise<string>;
 readRecord(id:string,options:{snapshotId:string;signal?:AbortSignal}):Promise<{recordId:string;publicInputs:readonly bigint[]}>;
 readRevocationAt(index:bigint,options:{snapshotId:string;signal?:AbortSignal}):Promise<{tag:bigint;oldRoot:bigint;newRoot:bigint}>;
}
export interface RecoveredArchive {
 readonly kind:'RecoveredPrivateArchive';readonly state:RecoveryState;
 readonly archive:Readonly<{kind:'RebuiltArchiveSnapshot';noteTree:SparseMerkleTree;revocationTree:SparseMerkleTree;nextIndex:bigint;recordCount:bigint;revocationCount:bigint;isSpent(nullifier:bigint):boolean}>;
 readonly notes:readonly {readonly note:RecoveredPrivateNote;readonly index:bigint}[];
 readonly usedGrantIds:readonly string[];
}
export function recoverPrivateArchive(options:{profile:PrivateProfile;scope:PrivacyVaultScope;vault:PrivacyVaultHandle;client:LocalPrivacyClient;reader:RecoveryReader;credentials?:readonly PrivateCredentialHandle[]},signal?:AbortSignal):Promise<RecoveredArchive>;
