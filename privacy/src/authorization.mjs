/** Experimental portable decision-authority / trustee boundary. Not legal adjudication. */
import { ed25519,x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { bytesToHex,hexToBytes } from '@noble/hashes/utils.js';
import { fail,record,list,uint,hex,domain,interval,bindDomain,equal,freeze } from './validation.mjs';
import { finalizeDkgTranscript,pointFromCoordinates,pointToFieldElements,createPartialDecryption,verifyPartialDecryption } from './threshold.mjs';
import { domainField } from './identity.mjs';
import { fieldElement,fieldArray,parseCore23 } from './model.mjs';

export const AUDIT_FIELDS=Object.freeze(['audit-assets','audit-parties','audit-terms']);
const OFFSETS=[56,69,85],FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SUITE='x25519-hkdf-sha256-aes256gcm-v1',authorizedRequests=new WeakMap();
const text=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const encode=(tag,value)=>text.encode(JSON.stringify(['AGYION_DISCLOSURE_V2',tag,value]));
const digest=(tag,value)=>bytesToHex(sha256(encode(tag,value)));
const scalarHex=n=>n.toString(16).padStart(64,'0');
const REQUEST_KEYS=['version','domain','epoch','ledger','requestId','recordHash','ciphertextDigest','requesterPublicKey','policyDigest','purposeDigest','fields','trusteeIds'];
function ids(value) {
  const result=list(value,32,'ids').map(v=>uint(v,16,'id',1n));
  if (!result.length || result.some((v,i)=>i>0 && BigInt(v)<=BigInt(result[i-1]))) fail('ORDERED_DISTINCT_IDS_REQUIRED','ids');
  return result;
}
function fields(value) {
  const result=list(value,3,'fields');
  if (!result.length || result.some((v,i)=>!AUDIT_FIELDS.includes(v) || (i>0 && AUDIT_FIELDS.indexOf(v)<=AUDIT_FIELDS.indexOf(result[i-1])))) fail('AUDIT_FIELD_SCOPE_REQUIRED','fields');
  return result;
}
function xPublic(value) {
  const bytes=hexToBytes(hex(value,32,'requesterPublicKey',true));
  const u=BigInt('0x'+bytesToHex(new Uint8Array(bytes).reverse()));
  if (u>=(1n<<255n)-19n) fail('NONCANONICAL_X25519_KEY','requesterPublicKey');
  try { x25519.getSharedSecret(new Uint8Array(32).fill(9),bytes); }
  catch { fail('INVALID_X25519_KEY','requesterPublicKey'); }
  return value;
}
function policyOf(value) {
  const v=record(value,['version','domain','epoch','dkgTranscriptHash','policyDigest','threshold','authorities','trusteeIds','trusteeThreshold','allowedFields'],'policy');
  equal(v.version,'2','version');
  const authorities=list(v.authorities,32,'authorities').map(a=>{
    const t=record(a,['id','publicKey'],'authority');return {id:uint(t.id,16,'authorityId',1n),publicKey:hex(t.publicKey,32,'authorityPublicKey',true)};
  });
  ids(authorities.map(a=>a.id));
  if (new Set(authorities.map(a=>a.publicKey)).size!==authorities.length) fail('DISTINCT_AUTHORITY_KEYS_REQUIRED','authorities');
  const threshold=uint(v.threshold,16,'authorityThreshold',1n),trusteeIds=ids(v.trusteeIds),trusteeThreshold=uint(v.trusteeThreshold,16,'trusteeThreshold',2n);
  if (BigInt(threshold)>BigInt(authorities.length) || BigInt(trusteeThreshold)>BigInt(trusteeIds.length)) fail('INVALID_THRESHOLD','policy');
  return freeze({version:'2',domain:domain(v.domain,'domain'),epoch:uint(v.epoch,32,'epoch',1n),dkgTranscriptHash:hex(v.dkgTranscriptHash,32,'dkgTranscriptHash',true),policyDigest:hex(v.policyDigest,32,'policyDigest',true),threshold,authorities,trusteeIds,trusteeThreshold,allowedFields:fields(v.allowedFields)});
}
function requestOf(value,policy,now) {
  const v=record(value,REQUEST_KEYS,'request');equal(v.version,'2','version');
  const d=domain(v.domain,'domain');bindDomain(d,policy.domain);equal(v.epoch,policy.epoch,'epoch');equal(v.policyDigest,policy.policyDigest,'policyDigest');
  const requested=fields(v.fields),trusteeIds=ids(v.trusteeIds);
  if (requested.some(f=>!policy.allowedFields.includes(f)) || trusteeIds.some(id=>!policy.trusteeIds.includes(id)) || BigInt(trusteeIds.length)<BigInt(policy.trusteeThreshold)) fail('REQUEST_SCOPE_MISMATCH','request');
  const l=record(v.ledger,['from','until'],'ledger');
  const from=uint(l.from,32,'from'),until=uint(l.until,32,'until');
  const ledger=interval({from,until},now===undefined ? from : uint(now,32,'currentLedger'),17280n,'ledger');
  // In the v2 pool, record identity IS the digest of the exact134 ciphertext
  // fields. Authorities must not sign a request that names another identity.
  const recordHash=hex(v.recordHash,32,'recordHash',true),ciphertextDigest=hex(v.ciphertextDigest,32,'ciphertextDigest',true);
  equal(recordHash,ciphertextDigest,'recordHash');
  return freeze({version:'2',domain:d,epoch:v.epoch,ledger,requestId:hex(v.requestId,32,'requestId',true),recordHash,ciphertextDigest,requesterPublicKey:xPublic(v.requesterPublicKey),policyDigest:v.policyDigest,purposeDigest:hex(v.purposeDigest,32,'purposeDigest',true),fields:requested,trusteeIds});
}
export function signDisclosureRequest(value,authorityId,authenticationSeed,policyValue) {
  const policy=policyOf(policyValue),request=requestOf(value,policy),authority=policy.authorities.find(a=>a.id===authorityId);
  if (!authority) fail('UNKNOWN_DECISION_AUTHORITY','authorityId');
  const secret=hexToBytes(hex(authenticationSeed,32,'authenticationSeed',true));
  equal(bytesToHex(ed25519.getPublicKey(secret)),authority.publicKey,'authorityKey');
  return freeze({authorityId,signature:bytesToHex(ed25519.sign(encode('signed-request',request),secret))});
}
export function authorizeDisclosureRequest(value,approvalValues,policyValue,currentLedger) {
  const policy=policyOf(policyValue),request=requestOf(value,policy,uint(currentLedger,32,'currentLedger'));
  const approvals=list(approvalValues,32,'approvals').map(value=>{
    const v=record(value,['authorityId','signature'],'approval');
    const authority=policy.authorities.find(a=>a.id===v.authorityId);
    if (!authority) fail('UNKNOWN_DECISION_AUTHORITY','authorityId');
    const signature=hex(v.signature,64,'signature');
    if (!ed25519.verify(hexToBytes(signature),encode('signed-request',request),hexToBytes(authority.publicKey),{zip215:false})) fail('INVALID_AUTHORIZATION_SIGNATURE','signature');
    return {authorityId:v.authorityId,signature};
  });
  ids(approvals.map(a=>a.authorityId));
  if (BigInt(approvals.length)<BigInt(policy.threshold)) fail('AUTHORITY_QUORUM_REQUIRED','approvals');
  const policyHash=digest('policy',policy),authorizationDigest=digest('authorized-request',{policyHash,request,approvals});
  const result=freeze({kind:'AuthorizedDisclosureRequest',request,digest:authorizationDigest,approvals});
  authorizedRequests.set(result,{policy,policyHash,request,digest:authorizationDigest});return result;
}
function authorized(value,now) {
  const a=authorizedRequests.get(value);
  if (!a) fail('AUTHORIZED_REQUEST_REQUIRED','request');
  requestOf(a.request,a.policy,uint(now,32,'currentLedger'));return a;
}
function archived(value) {
  const values=list(value,134,'archive').map(n=>{
    if (typeof n!=='bigint' || n<0n || n>=FIELD) fail('CANONICAL_FIELD_REQUIRED','archive');return n;
  });
  if (values.length!==134) fail('EXACT_ARCHIVE_LENGTH_REQUIRED','archive');
  return values;
}
export function archiveCiphertextDigest(value) {
  const values=archived(value),bytes=new Uint8Array(134*32);
  values.forEach((v,i)=>bytes.set(hexToBytes(scalarHex(v)),i*32));
  return bytesToHex(sha256(bytes));
}
function recordPoints(a,value) {
  const source=record(value,['recordHash','ciphertexts'],'archivedRecord');
  equal(hex(source.recordHash,32,'recordHash',true),a.request.recordHash,'recordHash');
  const values=archived(source.ciphertexts);equal(archiveCiphertextDigest(values),a.request.ciphertextDigest,'ciphertextDigest');
  return OFFSETS.map(i=>pointFromCoordinates({x:scalarHex(values[i]),y:scalarHex(values[i+1])}));
}
function partialContext(a,points,field) {
  if (!a.request.fields.includes(field)) fail('FIELD_NOT_AUTHORIZED','field');
  const r=a.request;return freeze({domain:r.domain,epoch:r.epoch,requestId:r.requestId,recordHash:r.recordHash,ciphertextDigest:r.ciphertextDigest,authorizationDigest:a.digest,ephemeralPublicKey:points[AUDIT_FIELDS.indexOf(field)]});
}
export function disclosurePartialContext(value,archive,field,currentLedger) {
  const a=authorized(value,currentLedger);return partialContext(a,recordPoints(a,archive),field);
}
function assertEpoch(a,epoch) {
  equal(epoch.transcriptHash,a.policy.dkgTranscriptHash,'dkgTranscriptHash');bindDomain(epoch.config.domain,a.policy.domain);equal(epoch.config.epoch,a.policy.epoch,'epoch');
  equal(epoch.config.threshold,a.policy.trusteeThreshold,'trusteeThreshold');equal(JSON.stringify(epoch.config.trustees.map(t=>t.id)),JSON.stringify(a.policy.trusteeIds),'trusteeIds');
}
function headerOf(value,a) {
  const v=record(value,['version','suite','authorizationDigest','requestId','recordHash','ciphertextDigest','trusteeId','recipientPublicKey','ephemeralPublicKey','nonce','ciphertext'],'delivery');
  equal(v.version,'1','version');equal(v.suite,SUITE,'suite');equal(v.authorizationDigest,a.digest,'authorizationDigest');
  for(const key of ['requestId','recordHash','ciphertextDigest'])equal(v[key],a.request[key],key);
  if (!a.request.trusteeIds.includes(v.trusteeId)) fail('TRUSTEE_NOT_AUTHORIZED','trusteeId');
  equal(v.recipientPublicKey,a.request.requesterPublicKey,'recipientPublicKey');
  const header={version:'1',suite:SUITE,authorizationDigest:a.digest,requestId:v.requestId,recordHash:v.recordHash,ciphertextDigest:v.ciphertextDigest,trusteeId:v.trusteeId,recipientPublicKey:xPublic(v.recipientPublicKey),ephemeralPublicKey:xPublic(v.ephemeralPublicKey),nonce:hex(v.nonce,12,'nonce')};
  if (typeof v.ciphertext!=='string' || v.ciphertext.length<32 || v.ciphertext.length>65536 || v.ciphertext.length%2 || !/^[0-9a-f]+$/.test(v.ciphertext)) fail('BOUNDED_CIPHERTEXT_REQUIRED','ciphertext');
  return {header,ciphertext:hexToBytes(v.ciphertext)};
}
async function deliveryKey(secret,peer,header,usage) {
  let shared,keyBytes;
  try {
    shared=x25519.getSharedSecret(secret,hexToBytes(xPublic(peer)));
    keyBytes=hkdf(sha256,shared,sha256(encode('delivery-salt',header)),encode('delivery-key',header),32);
    return await globalThis.crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,[usage]);
  } finally { shared?.fill(0);keyBytes?.fill(0); }
}
async function sealDelivery(a,trusteeId,partials) {
  const pair=x25519.keygen();
  const header={version:'1',suite:SUITE,authorizationDigest:a.digest,requestId:a.request.requestId,recordHash:a.request.recordHash,ciphertextDigest:a.request.ciphertextDigest,trusteeId,recipientPublicKey:a.request.requesterPublicKey,ephemeralPublicKey:bytesToHex(pair.publicKey),nonce:bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(12)))};
  const plaintext=encode('partial-delivery',partials);
  try {
    const key=await deliveryKey(pair.secretKey,header.recipientPublicKey,header,'encrypt');
    const cipher=await globalThis.crypto.subtle.encrypt({name:'AES-GCM',iv:hexToBytes(header.nonce),additionalData:encode('delivery-header',header),tagLength:128},key,plaintext);
    return freeze({...header,ciphertext:bytesToHex(new Uint8Array(cipher))});
  } finally { pair.secretKey.fill(0);plaintext.fill(0); }
}
function operatorProfile(value,policy,epoch) {
  const p=record(value,['domain','assetPolicyRoot','epoch','auditor'],'profile');
  const profile={domain:fieldElement(p.domain),assetPolicyRoot:fieldElement(p.assetPolicyRoot),epoch:fieldElement(p.epoch),auditor:fieldArray(p.auditor,2,'auditor')};
  equal(profile.domain,domainField(policy.domain),'domain');equal(profile.epoch,BigInt(policy.epoch),'epoch');
  if (profile.assetPolicyRoot===0n) fail('NONZERO_ASSET_POLICY_REQUIRED','profile');
  const auditor=pointToFieldElements(epoch.publicKey);profile.auditor.forEach((n,i)=>equal(n,auditor[i],'auditor'));
  return freeze(profile);
}
function acceptedPoints(value,a,profile,expectedCiphertexts) {
  if (value===undefined || value===null) fail('ACCEPTED_RECORD_UNAVAILABLE','record');
  const r=record(value,['recordId','publicInputs'],'acceptedRecord');equal(r.recordId,a.request.recordHash,'recordId');
  const values=fieldArray(r.publicInputs,157,'publicInputs'),core=parseCore23(values.slice(0,23)),ciphertexts=values.slice(23);
  for (const [actual,expected,key] of [[core[0],profile.domain,'domain'],[core[1],profile.assetPolicyRoot,'assetPolicyRoot'],
    [core[2],profile.epoch,'epoch'],[core[3],profile.auditor[0],'auditor'],[core[4],profile.auditor[1],'auditor']]) equal(actual,expected,key);
  // Historical accepted records need not have a current transaction window.
  // Only the separately signed disclosure request must still be current.
  ciphertexts.forEach((n,i)=>equal(n,expectedCiphertexts[i],'ciphertext'));
  return recordPoints(a,{recordHash:r.recordId,ciphertexts});
}
/**
 * claimRequest MUST atomically persist first-use before returning true; never
 * auto-release it. readAcceptedRecord MUST be the operator's own trusted pinned
 * pool adapter returning {recordId,publicInputs:bigint[157]}, not a requester
 * callback. It authenticates accepted ledger provenance; this helper checks
 * identity/profile but does not cryptographically authenticate an RPC provider.
 */
export function createDisclosureOperator(value) {
  const v=record(value,['epoch','trusteeShare','policy','profile','claimRequest','readCurrentLedger','readAcceptedRecord'],'operator');
  const policy=policyOf(v.policy);
  if (typeof v.claimRequest!=='function' || typeof v.readCurrentLedger!=='function' || typeof v.readAcceptedRecord!=='function') fail('TRUSTED_OPERATOR_ADAPTERS_REQUIRED','operator');
  // Recheck public DKG signatures, including after an operator reload.
  const epoch=finalizeDkgTranscript(v.epoch.config,v.epoch.packages,v.epoch.acceptances);
  const share=freeze(record(v.trusteeShare,['version','transcriptHash','trusteeId','secretShare','publicShare'],'trusteeShare'));
  const expectedPolicy=digest('policy',policy),claim=v.claimRequest,readCurrentLedger=v.readCurrentLedger,readAcceptedRecord=v.readAcceptedRecord;
  const profile=operatorProfile(v.profile,policy,epoch);
  return Object.freeze({async disclose(value,archive,currentLedger) {
    const a=authorized(value,currentLedger);equal(a.policyHash,expectedPolicy,'operatorPolicy');assertEpoch(a,epoch);
    if (!a.request.trusteeIds.includes(share.trusteeId)) fail('TRUSTEE_NOT_AUTHORIZED','trusteeId');
    // Snapshot caller bytes before awaiting the independent accepted-record
    // read. A valid authority signature alone does not turn chosen U points
    // into an accepted pool record or authorize a decryption oracle.
    const source=record(archive,['recordHash','ciphertexts'],'archivedRecord');
    const supplied={recordHash:source.recordHash,ciphertexts:archived(source.ciphertexts)};recordPoints(a,supplied);
    let accepted;
    try { accepted=await readAcceptedRecord(a.request.recordHash); }
    catch { fail('ACCEPTED_RECORD_UNAVAILABLE','record'); }
    const points=acceptedPoints(accepted,a,profile,supplied.ciphertexts);
    authorized(value,await readCurrentLedger());
    const replayKey=digest('replay-key',{domain:policy.domain,epoch:policy.epoch,policyDigest:policy.policyDigest,requestId:a.request.requestId,trusteeId:share.trusteeId});
    if (await claim(replayKey,a.digest)!==true) fail('REQUEST_REPLAY_OR_CLAIM_FAILURE','requestId');
    // A failure from here consumes the claim. A new signed request is required.
    authorized(value,await readCurrentLedger());
    const partials=a.request.fields.map(field=>({field,partial:createPartialDecryption(epoch,share,partialContext(a,points,field))}));
    return sealDelivery(a,share.trusteeId,partials);
  }});
}
export async function openDisclosureDelivery(value,requestValue,requesterSecret,epochValue,archive,currentLedger) {
  const a=authorized(requestValue,currentLedger),points=recordPoints(a,archive),{header,ciphertext}=headerOf(value,a);
  const epoch=finalizeDkgTranscript(epochValue.config,epochValue.packages,epochValue.acceptances);assertEpoch(a,epoch);
  const secret=hexToBytes(hex(requesterSecret,32,'requesterSecret',true));
  equal(bytesToHex(x25519.getPublicKey(secret)),header.recipientPublicKey,'requesterSecret');
  let plaintext;
  try {
    const key=await deliveryKey(secret,header.ephemeralPublicKey,header,'decrypt');
    plaintext=new Uint8Array(await globalThis.crypto.subtle.decrypt({name:'AES-GCM',iv:hexToBytes(header.nonce),additionalData:encode('delivery-header',header),tagLength:128},key,ciphertext));
    const decoded=JSON.parse(decoder.decode(plaintext));
    if (!Array.isArray(decoded) || decoded.length!==3 || decoded[0]!=='AGYION_DISCLOSURE_V2' || decoded[1]!=='partial-delivery') fail('INVALID_DELIVERY','delivery');
    const partials=list(decoded[2],3,'partials').map((value,i)=>{
      const p=record(value,['field','partial'],'partial');equal(p.field,a.request.fields[i],'field');
      equal(p.partial.trusteeId,header.trusteeId,'trusteeId');verifyPartialDecryption(epoch,partialContext(a,points,p.field),p.partial);
      return p;
    });
    if (partials.length!==a.request.fields.length) fail('EXACT_DISCLOSURE_SCOPE_REQUIRED','partials');
    return freeze(partials);
  } catch { fail('DELIVERY_AUTHENTICATION_FAILED','delivery'); }
  finally { secret.fill(0);plaintext?.fill(0); }
}
