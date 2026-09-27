// Explicit encrypted, scope-bound local sharing. No network, implicit storage or
// spending key export. Imported grants must be kept as their separate encrypted files.
import { babyjubjub } from '@noble/curves/misc.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import eddsaPoseidon from './eddsa-poseidon.cjs';
const { derivePublicKey, signMessage } = eddsaPoseidon;
import { exportVaultKeys } from './vault.mjs';
import { encryptBackup, decryptBackup } from './backup.mjs';
import { domainField } from './identity.mjs';
import { FIELD, SCALAR_ORDER, checkedPoint, parseNote24, noteCommitment, podSecretHash, attestationMessage } from './model.mjs';
import { record, list, uint, hex, domain, equal, fail, freeze } from './validation.mjs';
const credentials = new WeakMap(), attesters = new WeakMap();
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
const stringify = value => JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v);
const asHex = n => n.toString(16).padStart(64,'0');
const ensure = (ok,code) => { if(!ok) fail(code,'credential'); };
export function privateScope(value) {
 const s=record(value,['domain','epoch','profileId'],'scope');
 return freeze({domain:domain(s.domain,'domain'),epoch:uint(s.epoch,32,'epoch',1n),profileId:hex(s.profileId,32,'profileId',true)});
}
export function bindPrivateScope(value,expected) { equal(stringify(privateScope(value)),stringify(privateScope(expected)),'scope'); }
export function privateDecimal(value,nonzero=false) {
 const n=BigInt(uint(value,254,'field',nonzero?1n:0n));ensure(n<FIELD,'FIELD_RANGE');return n;
}
export function parseReceiveDescriptor(value,scope) {
 const d=record(value,['version','kind','scope','spendingAuthHash','viewPoint'],'recipient');
 equal(d.version,'1','version');equal(d.kind,'PrivateReceiveDescriptor','kind');bindPrivateScope(d.scope,scope);
 const auth=privateDecimal(d.spendingAuthHash,true),point=list(d.viewPoint,2,'viewPoint').map(x=>privateDecimal(x));checkedPoint(point);
 return freeze({version:'1',kind:'PrivateReceiveDescriptor',scope:privateScope(d.scope),spendingAuthHash:auth.toString(),viewPoint:point.map(String)});
}
export function receiveDescriptor(vault) {
 exportVaultKeys(vault);
 return parseReceiveDescriptor({version:'1',kind:'PrivateReceiveDescriptor',scope:vault.scope,
  spendingAuthHash:vault.public.spendingAuthHash,viewPoint:vault.public.viewPoint},vault.scope);
}
function roleBound(note,role,recipientHash) {
 if(note[4]===1n) ensure(role==='claim'&&note[5]===recipientHash,'POD_RECIPIENT_REQUIRED');
 else if(note[4]===2n) ensure((role==='claim'&&note[5]===recipientHash)||(role==='refund'&&note[6]===recipientHash)||role==='attest','TRIGGER_ROLE_REQUIRED');
 else if(note[4]===3n) ensure((role==='agent'&&note[7]===recipientHash)||(role==='owner'&&note[5]===recipientHash),'ENVOY_ROLE_REQUIRED');
 else ensure(false,'CONDITIONAL_NOTE_REQUIRED');
}
function payloadFor(value) {
 const s=record(value,['vault','grantId','recipient','role','note'],'credentialExport'),keys=exportVaultKeys(s.vault);
 const recipient=parseReceiveDescriptor(s.recipient,s.vault.scope),id=hex(s.grantId,32,'grantId',true);
 const g=keys.grants.find(g=>g.id===id);ensure(g,'VAULT_GRANT_REQUIRED');
 const note=parseNote24(s.note),kind=['cash','pod','trigger','envoy'][Number(note[4])];
 ensure(g.kind===kind&&note[3]>0n&&note[1]===domainField(s.vault.scope.domain),'GRANT_NOTE_MISMATCH');
 const view=babyjubjub.Point.BASE.multiply(g.viewScalar);ensure(note[20]===view.x&&note[21]===view.y,'GRANT_VIEW_MISMATCH');
 if(kind==='pod')ensure(note[8]===podSecretHash(g.podSecret),'GRANT_POD_MISMATCH');
 if(kind==='trigger')ensure(note[6]===BigInt(s.vault.public.spendingAuthHash),'GRANT_FUNDER_MISMATCH');
 if(kind==='envoy')ensure(note[5]===BigInt(s.vault.public.spendingAuthHash),'GRANT_OWNER_MISMATCH');
 roleBound(note,s.role,BigInt(recipient.spendingAuthHash));
 return freeze({version:'1',kind:'PrivateScopedCredential',scope:privateScope(s.vault.scope),recipientOwnerId:asHex(BigInt(recipient.spendingAuthHash)),
  grantId:id,role:s.role,instrument:kind,noteId:noteCommitment(note).toString(),note:note.map(String),viewScalar:asHex(g.viewScalar),
  ...(kind==='pod'?{podSecret:asHex(g.podSecret)}:{})});
}
function validatePayload(value,scope,ownerId) {
 const instrument=Object.getOwnPropertyDescriptor(value??{},'instrument')?.value;
 const p=record(value,['version','kind','scope','recipientOwnerId','grantId','role','instrument','noteId','note','viewScalar',...(instrument==='pod'?['podSecret']:[])],'credential');
 equal(p.version,'1','version');equal(p.kind,'PrivateScopedCredential','kind');bindPrivateScope(p.scope,scope);equal(p.recipientOwnerId,ownerId,'recipient');
 hex(p.grantId,32,'grantId',true);const note=parseNote24(list(p.note,24,'note').map(x=>privateDecimal(x)));
 ensure(note[3]>0n&&note[1]===domainField(scope.domain),'NOTE_SCOPE');equal(['cash','pod','trigger','envoy'][Number(note[4])],instrument,'instrument');
 equal(privateDecimal(p.noteId,true),noteCommitment(note),'commitment');
 const viewScalar=BigInt('0x'+hex(p.viewScalar,32,'viewScalar',true));ensure(viewScalar<SCALAR_ORDER,'VIEW_SCALAR_RANGE');
 const view=babyjubjub.Point.BASE.multiply(viewScalar);ensure(view.x===note[20]&&view.y===note[21],'GRANT_VIEW_MISMATCH');
 let podSecret;
 if(instrument==='pod'){podSecret=BigInt('0x'+hex(p.podSecret,32,'podSecret',true));ensure(podSecret<FIELD&&podSecretHash(podSecret)===note[8],'GRANT_POD_MISMATCH');}
 roleBound(note,p.role,BigInt('0x'+ownerId));
 return freeze({payload:freeze(p),note,viewScalar,...(podSecret===undefined?{}:{podSecret})});
}
async function seal(payload,password) {
 const plain=encoder.encode(stringify(payload));
 try {return await encryptBackup(plain,password,{domain:payload.scope.domain,epoch:payload.scope.epoch,ownerId:payload.recipientOwnerId});}
 finally{plain.fill(0);}
}
async function open(packet,password,scope,ownerId) {
 const p=record(packet,['version','kind','scope','recipientOwnerId','grantId','encrypted'],'credentialPacket');
 equal(p.version,'1','version');equal(p.kind,'EncryptedPrivateCredential','kind');bindPrivateScope(p.scope,scope);equal(p.recipientOwnerId,ownerId,'recipient');hex(p.grantId,32,'grantId',true);
 const plain=await decryptBackup(p.encrypted,password,{domain:scope.domain,epoch:scope.epoch,ownerId});
 try {const result=validatePayload(JSON.parse(decoder.decode(plain)),scope,ownerId);equal(result.payload.grantId,p.grantId,'grantId');return result;}
 catch(error){if(error?.name==='PrivacyValidationError')throw error;fail('INVALID_PRIVATE_CREDENTIAL','credential');}
 finally{plain.fill(0);}
}
export async function exportPrivateCredential(spec,password) {
 const p=payloadFor(spec),encrypted=await seal(p,password);
 return freeze({version:'1',kind:'EncryptedPrivateCredential',scope:p.scope,recipientOwnerId:p.recipientOwnerId,grantId:p.grantId,encrypted});
}
export async function checkExportedPrivateCredential(spec,packet,password) {
 const expected=payloadFor(spec),actual=await open(packet,password,expected.scope,expected.recipientOwnerId);
 equal(stringify(actual.payload),stringify(expected),'exportedCredential');return true;
}
export async function importPrivateCredential(packet,password,vault) {
 exportVaultKeys(vault);const scope=privateScope(vault.scope),ownerId=vault.ownerId;
 const state=await open(packet,password,scope,ownerId);
 const handle=freeze({kind:'PrivateCredential',scope,grantId:state.payload.grantId,role:state.payload.role,noteId:state.payload.noteId});
 credentials.set(handle,state);return handle;
}
export function readPrivateCredential(handle,vault) {
 exportVaultKeys(vault);const state=credentials.get(handle);ensure(state,'PRIVATE_CREDENTIAL_HANDLE_REQUIRED');
 bindPrivateScope(handle.scope,vault.scope);equal(state.payload.recipientOwnerId,vault.ownerId,'recipient');return state;
}
export function credentialViewKeys(handles,vault) {
 return Object.freeze([...new Set(list(handles,64,'credentials').map(h=>readPrivateCredential(h,vault).viewScalar))]);
}
export async function checkPrivateCredential(handle,packet,password,vault) {
 const expected=readPrivateCredential(handle,vault),actual=await open(packet,password,handle.scope,vault.ownerId);
 equal(stringify(actual.payload),stringify(expected.payload),'credential');return true;
}
export function forgetPrivateCredential(handle) {return credentials.delete(handle);}

export function createTriggerAttester(scopeValue) {
 const scope=privateScope(scopeValue),seed=globalThis.crypto.getRandomValues(new Uint8Array(32));
 const publicPoint=derivePublicKey(seed).map(String);checkedPoint(publicPoint.map(BigInt));
 const handle=freeze({kind:'PrivateTriggerAttester',scope,publicPoint});attesters.set(handle,seed);return handle;
}
function attesterState(handle) {const seed=attesters.get(handle);ensure(seed,'PRIVATE_ATTESTER_HANDLE_REQUIRED');return seed;}
function attesterOwner(point){return bytesToHex(sha256(encoder.encode(stringify(point))));}
export async function backupTriggerAttester(handle,password) {
 const seed=attesterState(handle),plain=encoder.encode(stringify({version:'1',scope:handle.scope,seed:bytesToHex(seed)}));
 try{return freeze({version:'1',kind:'EncryptedTriggerAttester',scope:handle.scope,publicPoint:handle.publicPoint,
  encrypted:await encryptBackup(plain,password,{domain:handle.scope.domain,epoch:handle.scope.epoch,ownerId:attesterOwner(handle.publicPoint)})});}
 finally{plain.fill(0);}
}
export async function restoreTriggerAttester(packet,password,scopeValue) {
 const p=record(packet,['version','kind','scope','publicPoint','encrypted'],'attesterBackup'),scope=privateScope(scopeValue);
 equal(p.version,'1','version');equal(p.kind,'EncryptedTriggerAttester','kind');bindPrivateScope(p.scope,scope);
 const point=list(p.publicPoint,2,'point').map(x=>privateDecimal(x));checkedPoint(point);const publicPoint=point.map(String);
 const plain=await decryptBackup(p.encrypted,password,{domain:scope.domain,epoch:scope.epoch,ownerId:attesterOwner(publicPoint)});
 let seed;
 try {let decoded;try{decoded=JSON.parse(decoder.decode(plain));}catch{fail('INVALID_ATTESTER_BACKUP','attester');}
  const data=record(decoded,['version','scope','seed'],'attester');equal(data.version,'1','version');bindPrivateScope(data.scope,scope);
  seed=hexToBytes(hex(data.seed,32,'seed',true));equal(stringify(derivePublicKey(seed).map(String)),stringify(publicPoint),'attesterPublicKey');
  const handle=freeze({kind:'PrivateTriggerAttester',scope,publicPoint});attesters.set(handle,seed);seed=undefined;return handle;
 }finally{plain.fill(0);seed?.fill(0);}
}
export async function checkTriggerAttesterBackup(handle,packet,password) {
 const seed=attesterState(handle),restored=await restoreTriggerAttester(packet,password,handle.scope);
 try{equal(bytesToHex(seed),bytesToHex(attesterState(restored)),'attesterKey');return true;}finally{forgetTriggerAttester(restored);}
}
export function signTriggerAttestation(attester,credential,vault) {
 const seed=attesterState(attester),state=readPrivateCredential(credential,vault);bindPrivateScope(attester.scope,vault.scope);
 ensure(state.payload.role==='attest'&&state.note[4]===2n,'ATTESTER_CREDENTIAL_REQUIRED');
 equal(stringify(state.note.slice(12,14).map(String)),stringify(attester.publicPoint),'attester');
 const sig=signMessage(seed,attestationMessage(state.note));
 return freeze({version:'1',kind:'PrivateTriggerAttestation',scope:privateScope(vault.scope),noteId:state.payload.noteId,attestation:[...sig.R8,sig.S].map(String)});
}
export function forgetTriggerAttester(handle){const seed=attesters.get(handle);if(!seed)return false;seed.fill(0);return attesters.delete(handle);}
