/**
 * Experimental, browser-compatible LOCAL coordinator. No fetch, RPC, storage,
 * transaction submission or chain-acceptance path exists in this module.
 * prove/verify are trusted local cryptographic adapters, not security plugins:
 * production callers must pin their actual artifacts/implementation. An injected
 * function returning true cannot establish on-chain acceptance.
 *
 * Witnesses and note openings live only behind per-client WeakMap handles.
 * readNote explicitly reveals an opening for local witness construction.
 * Backups persist only through the existing encrypted-backup helper. Note
 * backups contain openings, NOT spending/view/revocation keys or unspent status.
 * JavaScript garbage collection cannot promise physical secret erasure.
 */
import { babyjubjub } from '@noble/curves/misc.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { buildWitness, decryptEnvelope, ciphertextBytes } from './witness.mjs';
import { encryptBackup, decryptBackup } from './backup.mjs';
import { SCALAR_ORDER, fieldElement, fieldArray, bounded, checkedPoint, parseCore23,
  parseNote24, noteCommitment, evaluateTransition } from './model.mjs';
import { fail, record, list, uint, hex, domain, equal, freeze } from './validation.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const PROFILE_KEYS = ['domain', 'assetPolicyRoot', 'epoch', 'auditor'];
const SHAPES = Object.freeze({ core: [23], encrypted: [134], inNotes: [2,24], outNotes: [2,24],
  inPaths: [2,32], inIndices: [2], appendPaths: [2,32], assetPath: [8], assetIndex: [],
  authSecrets: [2], podSecrets: [2], modes: [2], attestSignatures: [2,3],
  revokePaths: [2,128], pointPreimages: [11,2], encSecrets: [5], encNonces: [5] });
const OFFSETS = [0,28,56,69,85];
function ensure(condition, code, path = 'client') { if (!condition) fail(code, path); }
function decimal(value) { uint(value, 254, 'field'); return fieldElement(BigInt(value)); }
function profileOf(value, encoded = false) {
  const v = record(value, PROFILE_KEYS, 'profile'), parse = encoded ? decimal : fieldElement;
  const p = { domain: parse(v.domain), assetPolicyRoot: parse(v.assetPolicyRoot), epoch: parse(v.epoch),
    auditor: list(v.auditor, 2, 'auditor').map(parse) };
  ensure(p.domain !== 0n && p.assetPolicyRoot !== 0n && p.epoch !== 0n, 'NONZERO_PROFILE');
  bounded(p.epoch, 32); checkedPoint(p.auditor); return freeze(p);
}
function bindProfile(core, p) {
  for (const [actual, expected] of [[core[0],p.domain], [core[1],p.assetPolicyRoot], [core[2],p.epoch],
    [core[3],p.auditor[0]], [core[4],p.auditor[1]]]) equal(actual, expected, 'profile');
}
function sameProfile(value, p) {
  const q = profileOf(value, true);
  equal(q.domain,p.domain,'profile'); equal(q.assetPolicyRoot,p.assetPolicyRoot,'profile');
  equal(q.epoch,p.epoch,'profile'); q.auditor.forEach((n,i) => equal(n,p.auditor[i],'profile'));
}
function shaped(value, shape, encoded) {
  if (!shape.length) return encoded ? decimal(value) : fieldElement(value);
  const values = list(value, shape[0], 'witness'); ensure(values.length === shape[0], 'EXACT_WITNESS_SHAPE');
  return values.map(v => shaped(v, shape.slice(1), encoded));
}
function witnessOf(value, profile, encoded = false) {
  const source = record(value, Object.keys(SHAPES), 'witness'), w = {};
  for (const key of Object.keys(SHAPES)) w[key] = shaped(source[key], SHAPES[key], encoded);
  parseCore23(w.core); bindProfile(w.core, profile);
  // This is local validation only. Membership, appends, ECDH, nonce constraints
  // and exact encrypted-witness equality still require the real proof verifier.
  evaluateTransition({ core:w.core, inNotes:w.inNotes, outNotes:w.outNotes, modes:w.modes,
    authSecrets:w.authSecrets, podSecrets:w.podSecrets, attestSignatures:w.attestSignatures, revokePaths:w.revokePaths });
  return freeze(w);
}
function publicSignals(value) {
  const a = list(value,157,'publicSignals'); ensure(a.length === 157,'EXACT_PUBLIC_SIGNALS');
  a.forEach(decimal); return Object.freeze(a);
}
function digest(encrypted) { return bytesToHex(sha256(ciphertextBytes(encrypted))); }
function proofResult(value, expected) {
  const v = record(value,['proof','publicSignals'],'proofResult');
  // A.x,A.y; B.x.imag,B.x.real,B.y.imag,B.y.real; C.x,C.y, each32-byte BE.
  // Coordinate/on-curve/pairing checks belong to the pinned local verifier.
  const proof = hex(v.proof,256,'proof',true), signals = publicSignals(v.publicSignals);
  signals.forEach((n,i) => equal(n,expected[i],`publicSignals.${i}`));
  return freeze({proof, publicSignals:signals});
}
function backupContext(value, profile) {
  const v = record(value,['domain','epoch','ownerId'],'backupContext');
  const epoch = uint(v.epoch,32,'epoch',1n); equal(BigInt(epoch),profile.epoch,'epoch');
  return freeze({domain:domain(v.domain,'domain'),epoch,ownerId:hex(v.ownerId,32,'ownerId',true)});
}
async function seal(payload,password,context) {
  const plain = encoder.encode(JSON.stringify(payload,(_key,v) => typeof v === 'bigint' ? v.toString() : v));
  try { return await encryptBackup(plain,password,context); } finally { plain.fill(0); }
}
async function unseal(blob,password,context) {
  const plain = await decryptBackup(blob,password,context);
  try { return JSON.parse(decoder.decode(plain)); }
  catch { fail('INVALID_PRIVATE_BACKUP','backup'); }
  finally { plain.fill(0); }
}
function privateBackup(value,kind,profile) {
  const key = kind === 'draft' ? 'witness' : 'notes';
  const v = record(value,['version','kind','profile',key],'privateBackup');
  equal(v.version,'2','version'); equal(v.kind,kind,'kind'); sameProfile(v.profile,profile);
  return v[key];
}
function archiveOf(value, anchorValue, profile) {
  // The anchor MUST come from a separately trusted accepted ledger record.
  // A matching response and caller-supplied copy do not establish authenticity.
  const a = record(anchorValue,['recordId','ciphertextDigest','core'],'anchor');
  const expectedId = hex(a.recordId,32,'recordId',true), expectedDigest = hex(a.ciphertextDigest,32,'ciphertextDigest',true);
  equal(expectedId,expectedDigest,'recordId'); // Pool record IDs are this digest.
  const expectedCore = parseCore23(a.core); bindProfile(expectedCore,profile);
  const v = record(value,['recordId','core','encrypted'],'archive');
  equal(hex(v.recordId,32,'recordId',true),expectedId,'recordId');
  const core = parseCore23(v.core), encrypted = fieldArray(v.encrypted,134,'encrypted');
  core.forEach((n,i) => equal(n,expectedCore[i],`core.${i}`));
  equal(digest(encrypted),expectedDigest,'ciphertextDigest');
  const ephemerals = new Set(), nonces = new Set();
  for (const start of OFFSETS) {
    checkedPoint(encrypted.slice(start,start+2)); bounded(encrypted[start+2],128);
    ensure(encrypted[start+2] !== 0n,'ZERO_NONCE');
    ephemerals.add(`${encrypted[start]},${encrypted[start+1]}`); nonces.add(encrypted[start+2]);
  }
  ensure(ephemerals.size === 5 && nonces.size === 5,'REUSED_ENVELOPE_RANDOMNESS');
  return freeze({recordId:expectedId,core,encrypted});
}
function viewSecrets(value) {
  const keys = list(value,32,'viewSecrets').map(n => {
    fieldElement(n); ensure(n > 0n && n < SCALAR_ORDER,'VIEW_SCALAR_RANGE'); return n;
  });
  ensure(keys.length > 0 && new Set(keys).size === keys.length,'DISTINCT_VIEW_KEYS_REQUIRED'); return keys;
}

export function createLocalPrivacyClient(options) {
  const o = record(options,['profile','prove','verify'],'clientOptions'), profile = profileOf(o.profile);
  ensure(typeof o.prove === 'function' && typeof o.verify === 'function','LOCAL_CRYPTO_ADAPTERS_REQUIRED');
  const drafts = new WeakMap(), notes = new WeakMap();
  const draftState = handle => { const state = drafts.get(handle); ensure(state,'UNKNOWN_PRIVATE_DRAFT'); return state; };
  const noteState = handle => { const state = notes.get(handle); ensure(state,'UNKNOWN_PRIVATE_NOTE'); return state; };
  function draftFrom(witness) {
    const w = witnessOf(witness,profile), signals = Object.freeze([...w.core,...w.encrypted].map(String));
    const handle = freeze({kind:'LocalPrivateDraft',publicSignals:signals,ciphertextDigest:digest(w.encrypted)});
    drafts.set(handle,{witness:w,pending:null,result:null}); return handle;
  }
  function recovered(value, encoded = false) {
    const v = record(value,['recordId','slot','commitment','note'],'noteOpening');
    const recordId = hex(v.recordId,32,'recordId',true);
    ensure(v.slot === 0 || v.slot === 1,'INCOMING_SLOT_REQUIRED');
    const note = parseNote24(encoded ? shaped(v.note,[24],true) : v.note);
    ensure(note[3] > 0n,'REAL_NOTE_REQUIRED'); equal(note[1],profile.domain,'domain');
    const commitment = encoded ? decimal(v.commitment) : fieldElement(v.commitment);
    equal(noteCommitment(note),commitment,'commitment'); ensure(commitment !== 0n,'REAL_COMMITMENT_REQUIRED');
    const handle = freeze({kind:'RecoveredPrivateNote',recordId,slot:v.slot,commitment:commitment.toString()});
    notes.set(handle,freeze({recordId,slot:v.slot,commitment,note})); return handle;
  }
  return Object.freeze({
    prepare(configuration) { return draftFrom(buildWitness(configuration).witness); },
    async prepareSubmission(handle) {
      const state = draftState(handle);
      if (state.result) return state.result;
      if (state.pending) return state.pending;
      state.pending = (async () => {
        let result;
        try { result = await o.prove(state.witness); }
        catch { fail('LOCAL_PROVING_FAILED','proof'); }
        ensure(drafts.get(handle) === state,'DRAFT_FORGOTTEN');
        const checked = proofResult(result,handle.publicSignals);
        let verified;
        try { verified = await o.verify(checked.proof,checked.publicSignals); }
        catch { fail('LOCAL_VERIFICATION_FAILED','proof'); }
        ensure(verified === true,'INVALID_LOCAL_PROOF');
        ensure(drafts.get(handle) === state,'DRAFT_FORGOTTEN');
        state.result = freeze({kind:'UnsubmittedPrivateTransition',...checked,ciphertextDigest:handle.ciphertextDigest});
        return state.result;
      })();
      try { return await state.pending; } finally { state.pending = null; }
    },
    async backupDraft(handle,password,contextValue) {
      const state = draftState(handle), context = backupContext(contextValue,profile);
      return seal({version:'2',kind:'draft',profile,witness:state.witness},password,context);
    },
    async restoreDraft(blob,password,contextValue) {
      const context = backupContext(contextValue,profile);
      const value = privateBackup(await unseal(blob,password,context),'draft',profile);
      return draftFrom(witnessOf(value,profile,true));
    },
    scanRecord(value,anchor,secrets) {
      const archived = archiveOf(value,anchor,profile), keys = viewSecrets(secrets), found = [];
      for (let slot = 0; slot < 2; slot++) {
        const commitment = archived.core[14+slot];
        if (commitment === 0n) {
          const sentinel = decryptEnvelope(archived.core,archived.encrypted,slot,1n);
          ensure(sentinel.every(n => n === 0n),'NONZERO_DUMMY_SENTINEL'); continue;
        }
        for (const key of keys) {
          let plaintext;
          try { plaintext = decryptEnvelope(archived.core,archived.encrypted,slot,key); }
          catch (error) { if (error?.code === 'CIPHERTEXT_AUTHENTICATION_FAILED') continue; throw error; }
          const note = parseNote24(plaintext), view = babyjubjub.Point.BASE.multiply(key);
          equal(note[20],view.x,'view'); equal(note[21],view.y,'view');
          if (archived.core[17] !== 0n) equal(note[2],archived.core[17],'asset');
          found.push(recovered({recordId:archived.recordId,slot,commitment,note})); break;
        }
      }
      return Object.freeze(found);
    },
    readNote(handle) { return noteState(handle).note; },
    async backupNotes(handles,password,contextValue) {
      const selected = list(handles,64,'notes').map(noteState);
      ensure(selected.length > 0 && new Set(selected.map(n => n.commitment)).size === selected.length,'DISTINCT_NOTES_REQUIRED');
      return seal({version:'2',kind:'notes',profile,notes:selected},password,backupContext(contextValue,profile));
    },
    async restoreNotes(blob,password,contextValue) {
      const value = privateBackup(await unseal(blob,password,backupContext(contextValue,profile)),'notes',profile);
      const entries = list(value,64,'notes'); ensure(entries.length > 0,'NOTES_REQUIRED');
      const restored = entries.map(v => recovered(v,true));
      ensure(new Set(restored.map(n => n.commitment)).size === restored.length,'DISTINCT_NOTES_REQUIRED');
      return Object.freeze(restored);
    },
    forget(handle) { return drafts.delete(handle) || notes.delete(handle); },
  });
}
