import {expect,it} from 'vitest';
import {createPrivacyVault} from '../../privacy/src/vault.mjs';
import {dummyNote,SparseMerkleTree} from '../../privacy/src/model.mjs';
import {summarizePrivateNote} from '../app/lib/private/note-summary';
const scope={domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},epoch:'1',profileId:'33'.repeat(32)};
it('Pod shows no funder reclaim and only unlocks the claimant with its matching credential',()=>{
 const vault=createPrivacyVault(scope,[{kind:'pod',id:'44'.repeat(32)}]),grant=vault.public.grants[0];
 const n=[...dummyNote(1n,2n)];n[3]=10n;n[4]=1n;n[5]=BigInt(vault.public.spendingAuthHash);n[8]=BigInt('podHash'in grant?grant.podHash:'0');n[9]=100n;[n[20],n[21]]=grant.viewPoint.map(BigInt);
 const tree=new SparseMerkleTree(128),summary=(at:bigint)=>summarizePrivateNote('7',n,'aa',at,vault,[],tree);
 expect(summary(99n).supportedActions).toEqual([]);expect(summary(100n)).toMatchObject({grantId:grant.id,supportedActions:['pod-claim']});
 n[5]=1n;expect(summary(100n).supportedActions).toEqual([]);
 n[5]=BigInt(vault.public.spendingAuthHash);n[8]++;expect(summary(100n).supportedActions).toEqual([]);
});
it('Trigger separates expiry and authority, Envoy revocation blocks only agent claims',()=>{
 const vault=createPrivacyVault(scope),own=BigInt(vault.public.spendingAuthHash),n=[...dummyNote(1n,2n)],tree=new SparseMerkleTree(128);
 n[3]=10n;n[4]=2n;n[5]=own;n[6]=own;n[10]=100n;
 const summary=(at:bigint)=>summarizePrivateNote('7',n,'aa',at,vault,[],tree);
 expect(summary(100n).supportedActions).toEqual(['trigger-claim']);expect(summary(101n).supportedActions).toEqual(['trigger-refund']);
 n[4]=3n;n[7]=own;n[9]=90n;n[14]=5n;n[15]=2n;n[16]=55n;
 expect(summary(89n).supportedActions).toEqual(['envoy-reclaim']);expect(summary(100n).supportedActions).toEqual(['envoy-claim','envoy-reclaim']);
 tree.set(55n,1n);expect(summary(100n).supportedActions).toEqual(['envoy-reclaim']);
 n[5]=1n;expect(summary(100n).supportedActions).toEqual([]);
});
