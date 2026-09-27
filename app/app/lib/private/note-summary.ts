import type {PrivacyVaultHandle} from '../../../../privacy/src/vault.mjs';
import type {PrivateCredentialHandle} from '../../../../privacy/src/credentials.mjs';
import type {SparseMerkleTree} from '../../../../privacy/src/model.mjs';
import type {PrivateNoteSummary,PrivateNoteAction} from './protocol-types';
/** Display capabilities only. The strict planner and on-chain proof enforce
 * all actual permissions again on the fresh submission checkpoint. */
export function summarizePrivateNote(id:string,n:readonly bigint[],asset:string,ledger:bigint,vault:PrivacyVaultHandle,credentials:readonly PrivateCredentialHandle[],revocations:SparseMerkleTree):PrivateNoteSummary {
 const kind=(['cash','pod','trigger','envoy'] as const)[Number(n[4])];
 if(!kind||n.length!==24||n[3]<=0n)throw new Error('PRIVATE_NOTE_KIND_INVALID');
 const own=BigInt(vault.public.spendingAuthHash),actions:PrivateNoteAction[]=[];
 const local=vault.public.grants.find(g=>g.kind===kind&&g.viewPoint[0]===n[20].toString()&&g.viewPoint[1]===n[21].toString()
  &&(g.kind!=='pod'||g.podHash===n[8].toString()));
 const incoming=credentials.find(c=>c.noteId===id&&c.role==='claim');
 const grantId=local?.id??incoming?.grantId;
 if(kind==='pod'&&n[5]===own&&ledger>=n[9]&&grantId)actions.push('pod-claim');
 if(kind==='trigger'){
  if(n[5]===own&&ledger<=n[10])actions.push('trigger-claim');
  if(n[6]===own&&ledger>n[10])actions.push('trigger-refund');
 }
 if(kind==='envoy'){
  if(n[7]===own&&ledger>=n[9]&&ledger<=n[10]&&n[14]>0n&&n[15]>0n&&revocations.get(n[16]&((1n<<128n)-1n))===0n)actions.push('envoy-claim');
  if(n[5]===own)actions.push('envoy-reclaim');
 }
 return Object.freeze({id,kind,asset,amount:n[3].toString(),notBefore:n[9].toString(),deadline:n[10].toString(),
  ...(grantId?{grantId}:{}),supportedActions:Object.freeze(actions)});
}
