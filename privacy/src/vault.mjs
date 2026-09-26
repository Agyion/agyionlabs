/**
 * Experimental complete PRIVATE KEY recovery, portable and local only.
 * Keys are independent CSPRNG samples; no HD derivation, wallet signatures,
 * networking or plaintext persistence occurs here. Public handles are safe to
 * stringify; exportVaultKeys explicitly reveals material for LOCAL use only.
 *
 * Before any real deposit or new grant, the application must require the user
 * to save the encrypted backup, reselect that saved file, restore it and compare
 * all keys. checkPrivacyVaultBackup checks the supplied bytes' full material;
 * it does NOT prove a download happened or automatically enable funding.
 * Notes/draft backups do not replace this complete key backup. Losing both keys
 * and the backup/password loses recovery. JavaScript cannot guarantee physical
 * memory erasure; forgetting a handle removes access, not a GC guarantee.
 */
import { babyjubjub } from '@noble/curves/misc.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { FIELD, SCALAR_ORDER, ownerHash, podSecretHash } from './model.mjs';
import { encryptBackup, decryptBackup } from './backup.mjs';
import { fail, record, list, uint, hex, field, domain, bindDomain, equal, freeze } from './validation.mjs';

const vaults = new WeakMap(), encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
const asHex = n => n.toString(16).padStart(64,'0');
function ensure(condition,code) { if (!condition) fail(code,'vault'); }
function scopeOf(value) {
  const v = record(value,['domain','epoch','profileId'],'scope');
  return freeze({domain:domain(v.domain,'domain'),epoch:uint(v.epoch,32,'epoch',1n),profileId:hex(v.profileId,32,'profileId',true)});
}
function bindScope(actual,expected) {
  bindDomain(actual.domain,expected.domain); equal(actual.epoch,expected.epoch,'epoch'); equal(actual.profileId,expected.profileId,'profileId');
}
function specification(value) {
  const v = record(value,['id','kind'],'grant');
  ensure(v.kind === 'pod' || v.kind === 'envoy','GRANT_KIND_REQUIRED');
  return {id:hex(v.id,32,'grantId',true),kind:v.kind};
}
function specifications(value) {
  const specs = list(value,64,'grants').map(specification);
  ensure(specs.every((v,i) => i === 0 || specs[i-1].id < v.id),'ORDERED_DISTINCT_GRANTS_REQUIRED'); return specs;
}
function scalar(value,order,name) {
  hex(value,32,name,true); const n = BigInt('0x'+value);
  ensure(n < order,'KEY_OUT_OF_RANGE'); return n;
}
function keysOf(value) {
  const v = record(value,['spendingSecret','viewScalar','grants'],'keys');
  const spendingSecret = scalar(v.spendingSecret,FIELD,'spendingSecret'), viewScalar = scalar(v.viewScalar,SCALAR_ORDER,'viewScalar');
  const grants = list(v.grants,64,'grants').map(value => {
    const kind = Object.getOwnPropertyDescriptor(value ?? {},'kind')?.value;
    ensure(kind === 'pod' || kind === 'envoy','GRANT_KIND_REQUIRED');
    const g = record(value,['id','kind','viewScalar',kind === 'pod'?'podSecret':'revocationSeed'],'grantKeys');
    const common = {id:hex(g.id,32,'grantId',true),kind,viewScalar:scalar(g.viewScalar,SCALAR_ORDER,'grantViewScalar')};
    return kind === 'pod' ? {...common,podSecret:scalar(g.podSecret,FIELD,'podSecret')}
      : {...common,revocationSeed:hex(g.revocationSeed,32,'revocationSeed',true)};
  });
  specifications(grants.map(({id,kind}) => ({id,kind})));
  const values = [asHex(spendingSecret),asHex(viewScalar),...grants.flatMap(g => [asHex(g.viewScalar),g.kind === 'pod'?asHex(g.podSecret):g.revocationSeed])];
  ensure(new Set(values).size === values.length,'INDEPENDENT_KEY_MATERIAL_REQUIRED');
  return freeze({spendingSecret,viewScalar,grants});
}
function encodeKeys(keys) {
  return {spendingSecret:asHex(keys.spendingSecret),viewScalar:asHex(keys.viewScalar),grants:keys.grants.map(g => {
    const common = {id:g.id,kind:g.kind,viewScalar:asHex(g.viewScalar)};
    return g.kind === 'pod'?{...common,podSecret:asHex(g.podSecret)}:{...common,revocationSeed:g.revocationSeed};
  })};
}
function usedKeys(keys) {
  const encoded = encodeKeys(keys);
  return new Set([encoded.spendingSecret,encoded.viewScalar,...encoded.grants.flatMap(g => [g.viewScalar,g.kind === 'pod'?g.podSecret:g.revocationSeed])]);
}
function randomValue(order,mask,used) {
  for (let i = 0; i < 256; i++) {
    const bytes = new Uint8Array(32);
    try { globalThis.crypto.getRandomValues(bytes); } catch { fail('SECURE_RANDOMNESS_UNAVAILABLE','vault'); }
    bytes[0] &= mask; const text = bytesToHex(bytes); bytes.fill(0);
    const value = BigInt('0x'+text);
    if (value > 0n && value < order && !used.has(text)) { used.add(text); return value; }
  }
  fail('SECURE_RANDOMNESS_FAILURE','vault');
}
function grantKeys(spec,used) {
  const common = {...spec,viewScalar:randomValue(SCALAR_ORDER,7,used)};
  return spec.kind === 'pod' ? {...common,podSecret:randomValue(FIELD,63,used)}
    : {...common,revocationSeed:asHex(randomValue(1n<<256n,255,used))};
}
function point(scalar) { const p = babyjubjub.Point.BASE.multiply(scalar); return [p.x.toString(),p.y.toString()]; }
function state(handle) { const v = vaults.get(handle); ensure(v,'PRIVATE_VAULT_HANDLE_REQUIRED'); return v; }
function make(scope,material) {
  // Revalidate secret encodings/ranges/role separation and recompute every
  // public fact. No imported public key, auth hash or backup claim is trusted.
  const keys = keysOf(encodeKeys(material)), auth = ownerHash(keys.spendingSecret);
  ensure(auth !== 0n,'NONZERO_AUTH_HASH_REQUIRED');
  const publicFacts = {spendingAuthHash:auth.toString(),viewPoint:point(keys.viewScalar),grants:keys.grants.map(g => {
    const common = {id:g.id,kind:g.kind,viewPoint:point(g.viewScalar)};
    if (g.kind === 'pod') {
      const podHash = podSecretHash(g.podSecret); ensure(podHash !== 0n,'NONZERO_POD_HASH_REQUIRED');
      return {...common,podHash:podHash.toString()};
    }
    const seed = hexToBytes(g.revocationSeed);
    try { return {...common,revocationPublicKey:bytesToHex(ed25519.getPublicKey(seed))}; } finally { seed.fill(0); }
  })};
  const handle = freeze({kind:'PrivateKeyVault',scope,ownerId:asHex(auth),public:publicFacts});
  vaults.set(handle,{scope,keys}); return handle;
}

export function createPrivacyVault(scopeValue,grantSpecs = []) {
  const scope = scopeOf(scopeValue), specs = specifications(grantSpecs), used = new Set();
  const spendingSecret = randomValue(FIELD,63,used), viewScalar = randomValue(SCALAR_ORDER,7,used);
  return make(scope,{spendingSecret,viewScalar,grants:specs.map(spec => grantKeys(spec,used))});
}
export function addVaultGrant(handle,value) {
  const v = state(handle), spec = specification(value);
  ensure(v.keys.grants.length < 64 && !v.keys.grants.some(g => g.id === spec.id),'NEW_GRANT_REQUIRED');
  const grants = [...v.keys.grants,grantKeys(spec,usedKeys(v.keys))].sort((a,b) => a.id < b.id?-1:1);
  return make(v.scope,{...v.keys,grants});
}
/** Explicit plaintext exposure for local witness/key operations, never RPC or storage. */
export function exportVaultKeys(handle) { return state(handle).keys; }
export function forgetPrivacyVault(handle) { return vaults.delete(handle); }
export async function backupPrivacyVault(handle,password) {
  const v = state(handle);
  const plain = encoder.encode(JSON.stringify({version:'2',kind:'PrivacyKeyMaterial',scope:v.scope,keys:encodeKeys(v.keys)}));
  try {
    const encrypted = await encryptBackup(plain,password,{domain:v.scope.domain,epoch:v.scope.epoch,ownerId:handle.ownerId});
    return freeze({version:'2',kind:'CompletePrivacyKeyBackup',scope:v.scope,ownerId:handle.ownerId,encrypted});
  } finally { plain.fill(0); }
}
export async function restorePrivacyVault(value,password,scopeValue,expectedOwnerId) {
  const expected = scopeOf(scopeValue), v = record(value,['version','kind','scope','ownerId','encrypted'],'keyBackup');
  equal(v.version,'2','version'); equal(v.kind,'CompletePrivacyKeyBackup','kind');
  const scope = scopeOf(v.scope); bindScope(scope,expected);
  const ownerId = field(v.ownerId,'ownerId',true);
  if (expectedOwnerId !== undefined) equal(ownerId,field(expectedOwnerId,'expectedOwnerId',true),'ownerId');
  const plain = await decryptBackup(v.encrypted,password,{domain:scope.domain,epoch:scope.epoch,ownerId});
  let restored;
  try {
    let decoded;
    try { decoded = JSON.parse(decoder.decode(plain)); } catch { fail('INVALID_KEY_BACKUP','backup'); }
    const payload = record(decoded,['version','kind','scope','keys'],'keyMaterial');
    equal(payload.version,'2','version'); equal(payload.kind,'PrivacyKeyMaterial','kind'); bindScope(scopeOf(payload.scope),scope);
    restored = make(scope,keysOf(payload.keys)); equal(restored.ownerId,ownerId,'ownerId');
    return restored;
  } catch (error) { if (restored) forgetPrivacyVault(restored); throw error; }
  finally { plain.fill(0); }
}
export async function checkPrivacyVaultBackup(handle,backup,password) {
  const original = state(handle), restored = await restorePrivacyVault(backup,password,original.scope,handle.ownerId);
  try {
    ensure(JSON.stringify(encodeKeys(original.keys)) === JSON.stringify(encodeKeys(state(restored).keys)),'INCOMPLETE_OR_DIFFERENT_KEY_BACKUP');
    return freeze({kind:'LocallyCheckedKeyBackup',scope:original.scope,ownerId:handle.ownerId,grantIds:original.keys.grants.map(g => g.id)});
  } finally { forgetPrivacyVault(restored); }
}
