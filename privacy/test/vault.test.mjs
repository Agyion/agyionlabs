import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { babyjubjub } from '@noble/curves/misc.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { FIELD, SCALAR_ORDER, ownerHash, podSecretHash } from '../src/model.mjs';
import { encryptBackup } from '../src/backup.mjs';
import { createPrivacyVault, addVaultGrant, exportVaultKeys, backupPrivacyVault, restorePrivacyVault,
  checkPrivacyVaultBackup, forgetPrivacyVault } from '../src/vault.mjs';

const scope = {domain:{networkId:'11'.repeat(32),contractId:'22'.repeat(32)},epoch:'1',profileId:'33'.repeat(32)};
const specs = [{id:'41'.repeat(32),kind:'pod'},{id:'42'.repeat(32),kind:'envoy'}];
const password = 'local test full key recovery password';

test('generates independent nonzero full key material and exposes derived public facts only',() => {
  const vault = createPrivacyVault(scope,specs), keys = exportVaultKeys(vault);
  assert.equal(vault.kind,'PrivateKeyVault'); assert.equal(keys.spendingSecret > 0n && keys.spendingSecret < FIELD,true);
  assert.equal(keys.viewScalar > 0n && keys.viewScalar < SCALAR_ORDER,true);
  assert.equal(vault.public.spendingAuthHash,ownerHash(keys.spendingSecret).toString());
  assert.equal(vault.ownerId,ownerHash(keys.spendingSecret).toString(16).padStart(64,'0'));
  const view = babyjubjub.Point.BASE.multiply(keys.viewScalar);
  assert.deepEqual(vault.public.viewPoint,[view.x.toString(),view.y.toString()]);
  assert.equal(vault.public.grants[0].podHash,podSecretHash(keys.grants[0].podSecret).toString());
  assert.equal(vault.public.grants[1].revocationPublicKey,bytesToHex(ed25519.getPublicKey(hexToBytes(keys.grants[1].revocationSeed))));
  const material = [keys.spendingSecret,keys.viewScalar,...keys.grants.flatMap(g => [g.viewScalar,g.kind==='pod'?g.podSecret:BigInt('0x'+g.revocationSeed)])];
  assert.equal(new Set(material).size,material.length);
  const serialized = JSON.stringify(vault);
  for(const n of material) assert.equal(serialized.includes(n.toString(16).padStart(64,'0')),false);
  assert.equal(serialized.includes('spendingSecret'),false); assert.equal(serialized.includes('viewScalar'),false);
  assert.throws(() => JSON.stringify(keys));
  assert.ok(Object.isFrozen(keys.grants)); assert.ok(Object.isFrozen(vault.public.grants));
  assert.throws(() => exportVaultKeys({...vault}));
});

test('adding a grant preserves existing complete keys and requires using a newly backed-up handle',() => {
  const first = createPrivacyVault(scope), before = exportVaultKeys(first);
  const second = addVaultGrant(first,specs[0]), after = exportVaultKeys(second);
  assert.equal(after.spendingSecret,before.spendingSecret); assert.equal(after.viewScalar,before.viewScalar);
  assert.equal(second.ownerId,first.ownerId); assert.equal(after.grants.length,1);
  assert.equal(exportVaultKeys(first).grants.length,0);
  assert.throws(() => addVaultGrant(second,specs[0]));
  assert.throws(() => createPrivacyVault(scope,[specs[1],specs[0]]));
  assert.throws(() => createPrivacyVault(scope,[{...specs[0],kind:'unknown'}]));
  assert.throws(() => createPrivacyVault({...scope,epoch:'0'}));
  assert.equal(forgetPrivacyVault(first),true); assert.throws(() => exportVaultKeys(first));
  assert.equal(forgetPrivacyVault(first),false); assert.equal(exportVaultKeys(second).grants.length,1);
});

test('a failed random source cannot silently create zero or predictable fallback keys',t => {
  t.mock.method(globalThis.crypto,'getRandomValues',value => { value.fill(0); return value; });
  assert.throws(() => createPrivacyVault(scope),{code:'SECURE_RANDOMNESS_FAILURE'});
});

test('encrypted full-material roundtrip restores spending, viewing, Pod and revocation keys and recomputes public facts',async() => {
  const original = createPrivacyVault(scope,specs), keys = exportVaultKeys(original);
  const backup = await backupPrivacyVault(original,password);
  assert.equal(backup.kind,'CompletePrivacyKeyBackup'); assert.equal(JSON.stringify(backup).includes('spendingSecret'),false);
  const restored = await restorePrivacyVault(JSON.parse(JSON.stringify(backup)),password,scope,original.ownerId);
  assert.deepEqual(exportVaultKeys(restored),keys); assert.deepEqual(restored.public,original.public);
  const checked = await checkPrivacyVaultBackup(original,backup,password);
  assert.equal(checked.kind,'LocallyCheckedKeyBackup'); assert.equal(checked.ownerId,original.ownerId);
  assert.equal('downloaded' in checked,false); assert.equal('depositEnabled' in checked,false);
  const newer = addVaultGrant(original,{id:'43'.repeat(32),kind:'envoy'});
  await assert.rejects(checkPrivacyVaultBackup(newer,backup,password),{code:'INCOMPLETE_OR_DIFFERENT_KEY_BACKUP'});
});

test('wrong password, modified ciphertext and wrong network/contract/profile/epoch/owner fail closed',async() => {
  const vault = createPrivacyVault(scope,specs), backup = await backupPrivacyVault(vault,password);
  await assert.rejects(restorePrivacyVault(backup,'wrong local test recovery password',scope),{code:'BACKUP_AUTHENTICATION_FAILED'});
  const changed = structuredClone(backup); changed.encrypted.ciphertext = (changed.encrypted.ciphertext.startsWith('00')?'01':'00')+changed.encrypted.ciphertext.slice(2);
  await assert.rejects(restorePrivacyVault(changed,password,scope),{code:'BACKUP_AUTHENTICATION_FAILED'});
  for(const different of [{...scope,domain:{...scope.domain,networkId:'55'.repeat(32)}},
    {...scope,domain:{...scope.domain,contractId:'55'.repeat(32)}}, {...scope,profileId:'55'.repeat(32)}, {...scope,epoch:'2'}]) {
    await assert.rejects(restorePrivacyVault(backup,password,different));
  }
  await assert.rejects(restorePrivacyVault(backup,password,scope,'66'.repeat(32)));
  const forged = structuredClone(backup); forged.public = vault.public;
  await assert.rejects(restorePrivacyVault(forged,password,scope));
  const rebound = structuredClone(backup); rebound.scope.profileId = '55'.repeat(32);
  await assert.rejects(restorePrivacyVault(rebound,password,rebound.scope));
});

test('even authenticated private payloads cannot import out-of-range secret material',async() => {
  const vault = createPrivacyVault(scope), keys = exportVaultKeys(vault);
  const payload = {version:'2',kind:'PrivacyKeyMaterial',scope,keys:{spendingSecret:keys.spendingSecret.toString(16).padStart(64,'0'),
    viewScalar:SCALAR_ORDER.toString(16).padStart(64,'0'),grants:[]}};
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  let encrypted;
  try { encrypted = await encryptBackup(plaintext,password,{domain:scope.domain,epoch:scope.epoch,ownerId:vault.ownerId}); }
  finally { plaintext.fill(0); }
  await assert.rejects(restorePrivacyVault({version:'2',kind:'CompletePrivacyKeyBackup',scope,ownerId:vault.ownerId,encrypted},password,scope),{code:'KEY_OUT_OF_RANGE'});
});
