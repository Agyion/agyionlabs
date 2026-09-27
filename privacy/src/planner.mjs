// Local-only command planning over a separately authenticated archive snapshot.
// Returned configuration/openings are private coordinator data, never UI/RPC data.
import { babyjubjub } from '@noble/curves/misc.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex,hexToBytes,concatBytes } from '@noble/hashes/utils.js';
import { exportVaultKeys } from './vault.mjs';
import { domainField,assetField,accountField,revocationTag } from './identity.mjs';
import { privateScope,bindPrivateScope,privateDecimal,parseReceiveDescriptor,receiveDescriptor,readPrivateCredential } from './credentials.mjs';
import { BASE8,bounded,checkedPoint,parseNote24,dummyNote,podSecretHash,noteCommitment,nullifier,SparseMerkleTree,evaluateTransition } from './model.mjs';
import { createNote24,buildRevocationWitness } from './witness.mjs';
import { record,list,uint,hex,equal,fail,freeze } from './validation.mjs';
const FIELDS={deposit:['asset','amount'],transfer:['asset','amount','recipient'],consolidate:['asset'],withdraw:['asset','amount','recipient'],
 'pod-create':['asset','amount','recipient','unlockLedger','grantId'],'pod-claim':['noteId','grantId'],
 'trigger-create':['asset','amount','recipient','deadline','condition','attester','attesterRecipient','grantId'],
 'trigger-claim':['noteId','attestation'],'trigger-refund':['noteId'],
 'envoy-grant':['asset','amount','agent','recipient','validFrom','expiresAt','maxPerClaim','claims','grantId'],
 'envoy-claim':['noteId','amount'],'envoy-reclaim':['noteId'],'envoy-revoke':['grantId']};
const ensure=(ok,code)=>{if(!ok)fail(code,'planner');};
const amount=(value)=>BigInt(uint(value,64,'amount',1n));
const ledgerOf=(value)=>BigInt(uint(value,32,'ledger'));
function account(value){const a=record(value,['kind','id'],'account');ensure(a.kind==='account'||a.kind==='contract','ADDRESS_KIND');return freeze({kind:a.kind,id:hex(a.id,32,'accountId',true)});}
export function parsePrivateCommand(value,scope) {
 const action=Object.getOwnPropertyDescriptor(value??{},'action')?.value;
 ensure(typeof action==='string'&&Object.hasOwn(FIELDS,action),'PRIVATE_COMMAND_REQUIRED');
 const c=record(value,['action',...FIELDS[action]],'command'),out={action};
 for(const [key,v]of Object.entries(c)) {
  if(key==='action')continue;
  if(['asset','grantId'].includes(key))out[key]=hex(v,32,key,true);
  else if(['amount','maxPerClaim'].includes(key))out[key]=amount(v).toString();
  else if(key==='claims')out[key]=uint(v,32,key,1n);
  else if(['unlockLedger','deadline','validFrom','expiresAt'].includes(key))out[key]=ledgerOf(v).toString();
  else if(['noteId','condition'].includes(key))out[key]=privateDecimal(v,key==='noteId').toString();
  else if(key==='recipient'&&action==='withdraw')out[key]=account(v);
  else if(['recipient','agent','attesterRecipient'].includes(key))out[key]=parseReceiveDescriptor(v,scope);
  else if(key==='attester'||key==='attestation') {
   const n=key==='attester'?2:3,values=list(v,n,key).map(x=>privateDecimal(x));ensure(values.length===n,'EXACT_SIGNATURE_OR_POINT');checkedPoint(values.slice(0,2));out[key]=values.map(String);
  }
 }
 return freeze(out);
}
function fresh(template){const copy=template.slice();copy[18]=0n;copy[19]=0n;return createNote24(copy);}
function cash(domain,asset,value,recipient){const n=[...dummyNote(domain,asset)];n[3]=value;n[5]=BigInt(recipient.spendingAuthHash);[n[20],n[21]]=recipient.viewPoint.map(BigInt);return fresh(n);}
function viewFor(grant){const p=babyjubjub.Point.BASE.multiply(grant.viewScalar);return[p.x,p.y];}
function policyCheck(c){
 const next=c.appendTree.clone();let at=c.nextIndex;
 for(const n of c.outNotes)if(n[3]){ensure(at<1n<<32n&&next.get(at)===0n,'TREE_CAPACITY_OR_SLOT');next.set(at++,noteCommitment(n));}
 const core=[c.domain,c.assetTree.root,c.epoch,...c.auditor,c.revocationTree.root,c.validFrom,c.validUntil,c.inputTree.root,c.appendTree.root,next.root,c.nextIndex,
  ...c.inNotes.map(nullifier),...c.outNotes.map(noteCommitment),c.bridge.kind,c.bridge.kind===0n?0n:c.inNotes[0][2],c.bridge.amount,c.bridge.accountId,0n,0n,2n];
 evaluateTransition({core,inNotes:c.inNotes,outNotes:c.outNotes,modes:c.modes,authSecrets:c.authSecrets,podSecrets:c.podSecrets,attestSignatures:c.attestSignatures,
  revokePaths:c.inNotes.map((n,i)=>c.modes[i]===4n?c.revocationTree.path(n[16]&((1n<<128n)-1n)):Array(128).fill(0n))});
}
export function planPrivateCommand(value) {
 const o=record(value,['command','profile','scope','assets','ledger','source','archive','notes','vault','credentials','usedGrantIds'],'planning');
 const scope=privateScope(o.scope),keys=exportVaultKeys(o.vault);bindPrivateScope(o.vault.scope,scope);
 const profile=record(o.profile,['domain','assetPolicyRoot','epoch','auditor'],'profile');
 equal(profile.domain,domainField(scope.domain),'domain');equal(profile.epoch,BigInt(scope.epoch),'epoch');checkedPoint(profile.auditor);
 const now=bounded(o.ledger,32),own=receiveDescriptor(o.vault),auth=BigInt(own.spendingAuthHash),source=account(o.source);ensure(source.kind==='account','WALLET_ACCOUNT_REQUIRED');
 const imported=list(o.credentials,64,'credentials').map(h=>readPrivateCredential(h,o.vault));
 const usedGrantIds=new Set(list(o.usedGrantIds,64,'usedGrantIds').map(id=>hex(id,32,'grantId',true)));
 ensure([...usedGrantIds].every(id=>keys.grants.some(g=>g.id===id)),'VAULT_GRANT_REQUIRED');
 const assets=list(o.assets,8,'assets').map(id=>hex(id,32,'asset',true));ensure(assets.length>0&&new Set(assets).size===assets.length,'DISTINCT_ASSETS');
 const assetTree=new SparseMerkleTree(8);assets.forEach((id,i)=>assetTree.set(BigInt(i),assetField(id)));equal(assetTree.root,profile.assetPolicyRoot,'assetPolicy');
 const a=o.archive;ensure(a?.kind==='RebuiltArchiveSnapshot'&&a.noteTree instanceof SparseMerkleTree&&a.noteTree.depth===32&&a.revocationTree instanceof SparseMerkleTree&&a.revocationTree.depth===128&&typeof a.isSpent==='function','REBUILT_ARCHIVE_REQUIRED');
 const inputTree=a.noteTree.clone(),revocationTree=a.revocationTree.clone(),nextIndex=bounded(a.nextIndex,33);ensure(nextIndex<=1n<<32n,'TREE_CAPACITY');
 const notes=list(o.notes,100000,'notes').map(v=>{const entry=record(v,['id','index','note'],'note'),note=parseNote24(entry.note),cm=privateDecimal(entry.id,true),index=bounded(entry.index,32);
  ensure(note[3]>0n&&note[1]===profile.domain&&cm===noteCommitment(note)&&inputTree.get(index)===cm,'NOTE_ARCHIVE_BINDING');return {id:entry.id,index,note,spent:a.isSpent(nullifier(note))};});
 ensure(new Set(notes.map(n=>n.id)).size===notes.length,'DUPLICATE_NOTE');
 const c=parsePrivateCommand(o.command,scope),requiredCredentialExports=[];
 if(c.action==='withdraw')ensure(c.recipient.kind!=='contract'||c.recipient.id!==scope.domain.contractId,'POOL_SELF_PAYMENT_FORBIDDEN');
 const grant=(id,kind)=>{const g=keys.grants.find(g=>g.id===id&&g.kind===kind);ensure(g,'VAULT_GRANT_REQUIRED');return g;};
 if(c.action==='envoy-revoke') {
  const g=grant(c.grantId,'envoy'),seed=hexToBytes(g.revocationSeed);
  try{const ownerKey=bytesToHex(ed25519.getPublicKey(seed)),tag=revocationTag(profile.domain,ownerKey);
   const built=buildRevocationWitness({domain:profile.domain,tree:revocationTree,tag});
   const message=concatBytes(new TextEncoder().encode('AGYION_REVOKE_V2\0'),...built.publicInputs.map(n=>hexToBytes(n.toString(16).padStart(64,'0'))));
   return Object.freeze({kind:'revoke',witness:built.witness,publicSignals:built.publicInputs.map(String),ownerKey,signature:bytesToHex(ed25519.sign(message,seed)),
    summary:freeze({action:c.action,asset:'',amount:'0'}),requiredCredentialExports:Object.freeze([])});
  }finally{seed.fill(0);}
 }
 let selected=[],target,asset=c.asset;
 if('noteId'in c){target=notes.find(n=>n.id===c.noteId&&!n.spent);ensure(target,'UNSPENT_NOTE_REQUIRED');selected=[target];asset=assets.find(id=>assetField(id)===target.note[2]);}
 ensure(asset!==undefined&&assets.includes(asset),'ASSET_NOT_ALLOWLISTED');const assetId=assetField(asset),dummy=dummyNote(profile.domain,assetId);
 let validUntil=now+120n;if(validUntil>=1n<<32n)validUntil=(1n<<32n)-1n;
 const configuration={domain:profile.domain,epoch:profile.epoch,auditor:profile.auditor.slice(),validFrom:now,validUntil,inputTree,appendTree:inputTree.clone(),assetTree,revocationTree,nextIndex,assetIndex:BigInt(assets.indexOf(asset)),
  inNotes:[dummy,dummy],outNotes:[dummy,dummy],inIndices:[0n,0n],authSecrets:[0n,0n],podSecrets:[0n,0n],modes:[0n,0n],attestSignatures:[[...BASE8,0n],[...BASE8,0n]],bridge:{kind:0n,amount:0n,accountId:0n},fee:{amount:0n,accountId:0n}};
 let total=0n,requested=c.amount?amount(c.amount):0n;
 if(!target&&c.action!=='deposit') {
  const available=notes.filter(n=>!n.spent&&n.note[2]===assetId&&n.note[4]===0n&&n.note[5]===auth).sort((x,y)=>x.note[3]===y.note[3]?(x.index<y.index?-1:1):x.note[3]>y.note[3]?-1:1);
  if(c.action==='consolidate'){ensure(available.length>=2,'TWO_CASH_NOTES_REQUIRED');selected=available.slice(0,2);}
  else {const one=available.filter(n=>n.note[3]>=requested).at(-1);selected=one?[one]:available.slice(0,2);const sum=selected.reduce((n,x)=>n+x.note[3],0n);
   ensure(sum>=requested,available.reduce((n,x)=>n+x.note[3],0n)>=requested?'CONSOLIDATION_REQUIRED':'INSUFFICIENT_PRIVATE_BALANCE');}
 }
 selected.forEach((entry,i)=>{configuration.inNotes[i]=entry.note;configuration.inIndices[i]=entry.index;configuration.authSecrets[i]=keys.spendingSecret;total+=entry.note[3];});
 const putCash=(index,value,recipient=own)=>{if(value>0n)configuration.outNotes[index]=cash(profile.domain,assetId,value,recipient);};
 const exportTo=(grantId,recipient,role,note)=>{if(role==='attest'||recipient.spendingAuthHash!==own.spendingAuthHash)requiredCredentialExports.push(freeze({id:grantId+':'+role,grantId,recipient,role,note}));};
 if(c.action==='deposit'){configuration.bridge={kind:1n,amount:requested,accountId:accountField(source)};putCash(0,requested);}
 else if(c.action==='withdraw'){configuration.bridge={kind:2n,amount:requested,accountId:accountField(c.recipient)};putCash(0,total-requested);}
 else if(c.action==='transfer'){putCash(0,requested,c.recipient);putCash(1,total-requested);}
 else if(c.action==='consolidate'){ensure(total<1n<<64n,'CONSOLIDATED_AMOUNT_OVERFLOW');requested=total;putCash(0,total);}
 else if(c.action==='pod-create'||c.action==='trigger-create'||c.action==='envoy-grant') {
  const kind=c.action==='pod-create'?'pod':c.action==='trigger-create'?'trigger':'envoy',g=grant(c.grantId,kind);
  ensure(!usedGrantIds.has(g.id),'UNUSED_GRANT_REQUIRED');
  const note=[...dummy];note[3]=requested;note[4]=BigInt(['cash','pod','trigger','envoy'].indexOf(kind));[note[20],note[21]]=viewFor(g);
  if(kind==='pod'){note[5]=BigInt(c.recipient.spendingAuthHash);note[8]=podSecretHash(g.podSecret);note[9]=ledgerOf(c.unlockLedger);ensure(note[9]>now,'FUTURE_UNLOCK_REQUIRED');}
  if(kind==='trigger'){note[5]=BigInt(c.recipient.spendingAuthHash);note[6]=auth;note[10]=ledgerOf(c.deadline);ensure(note[10]>now,'FUTURE_DEADLINE_REQUIRED');note[11]=BigInt(c.condition);[note[12],note[13]]=c.attester.map(BigInt);}
  if(kind==='envoy'){note[5]=auth;note[7]=BigInt(c.agent.spendingAuthHash);note[9]=ledgerOf(c.validFrom);note[10]=ledgerOf(c.expiresAt);ensure(note[10]>now&&note[10]>note[9],'FUTURE_EXPIRY_REQUIRED');note[14]=amount(c.maxPerClaim);note[15]=BigInt(c.claims);note[16]=revocationTag(profile.domain,bytesToHex(ed25519.getPublicKey(hexToBytes(g.revocationSeed))));note[17]=BigInt(c.recipient.spendingAuthHash);[note[22],note[23]]=c.recipient.viewPoint.map(BigInt);}
  const output=fresh(note);configuration.outNotes[0]=output;putCash(1,total-requested);
  if(kind==='pod'||kind==='trigger')exportTo(c.grantId,c.recipient,'claim',output);
  if(kind==='trigger')exportTo(c.grantId,c.attesterRecipient,'attest',output);
  if(kind==='envoy')exportTo(c.grantId,c.agent,'agent',output);
 } else {
  const n=target.note;requested=n[3];
  if(c.action==='pod-claim'){ensure(n[4]===1n,'POD_NOTE_REQUIRED');configuration.modes[0]=1n;
   const local=keys.grants.find(g=>g.kind==='pod'&&g.id===c.grantId&&podSecretHash(g.podSecret)===n[8]);
   const received=imported.find(g=>g.payload.instrument==='pod'&&g.payload.grantId===c.grantId&&g.payload.noteId===c.noteId&&g.payload.role==='claim');
   ensure(local||received,'POD_CREDENTIAL_REQUIRED');configuration.podSecrets[0]=local?local.podSecret:received.podSecret;putCash(0,n[3]);}
  else if(c.action==='trigger-claim'){ensure(n[4]===2n,'TRIGGER_NOTE_REQUIRED');configuration.modes[0]=2n;configuration.validUntil=configuration.validUntil<n[10]?configuration.validUntil:n[10];configuration.attestSignatures[0]=c.attestation.map(BigInt);putCash(0,n[3]);}
  else if(c.action==='trigger-refund'){ensure(n[4]===2n,'TRIGGER_NOTE_REQUIRED');configuration.modes[0]=3n;putCash(0,n[3]);}
  else if(c.action==='envoy-reclaim'){ensure(n[4]===3n,'ENVOY_NOTE_REQUIRED');configuration.modes[0]=5n;putCash(0,n[3]);}
  else if(c.action==='envoy-claim'){ensure(n[4]===3n,'ENVOY_NOTE_REQUIRED');requested=amount(c.amount);ensure(requested<=n[3],'INSUFFICIENT_MANDATE_BALANCE');configuration.modes[0]=4n;configuration.validUntil=configuration.validUntil<n[10]?configuration.validUntil:n[10];
   putCash(0,requested,{spendingAuthHash:n[17].toString(),viewPoint:n.slice(22,24).map(String)});
   const remaining=n[3]-requested;if(remaining>0n){if(n[15]>1n){const successor=n.slice();successor[3]=remaining;successor[15]--;configuration.outNotes[1]=fresh(successor);}
    else putCash(1,remaining,{spendingAuthHash:n[5].toString(),viewPoint:n.slice(20,22).map(String)});}}
 }
 policyCheck(configuration);
 return Object.freeze({kind:'transition',configuration,addresses:freeze({asset:configuration.bridge.kind===0n?null:asset,bridgeAccount:c.action==='deposit'?source:c.action==='withdraw'?c.recipient:null,feeAccount:null}),
  summary:freeze({action:c.action,asset,amount:requested.toString()}),requiredCredentialExports:Object.freeze(requiredCredentialExports)});
}
