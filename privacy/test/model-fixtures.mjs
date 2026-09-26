// Public deterministic TEST secrets. Never use these notes/keys with funds.
import { createRequire } from 'node:module';
import { babyjubjub } from '@noble/curves/misc.js';
import { BASE8, SparseMerkleTree, dummyNote, ownerHash, podSecretHash, noteCommitment, attestationMessage } from '../src/model.mjs';
const { derivePublicKey, signMessage } = createRequire(import.meta.url)('@zk-kit/eddsa-poseidon');
export const TEST_RANDOMNESS = Object.freeze({ testRandomness: Object.freeze({
  scalars: Object.freeze([1n,2n,3n,4n,5n]), nonces: Object.freeze([6n,7n,8n,9n,10n]) }) });
export function pointFor(scalar) { const p = babyjubjub.Point.BASE.multiply(scalar); return [p.x, p.y]; }
export function makeCashNote(amount = 100n, secret = 11n, rho = 333n, viewSecret = 7n) {
  const n = [...dummyNote(101n, 202n)]; n[3] = amount; n[5] = ownerHash(secret); n[18] = rho; n[19] = 444n;
  [n[20], n[21]] = pointFor(viewSecret); return n;
}
export function makeDepositConfig() {
  const assetTree = new SparseMerkleTree(8); assetTree.set(2n, 202n);
  return { domain: 101n, epoch: 1n, auditor: pointFor(13n), validFrom: 100n, validUntil: 110n,
    inputTree: new SparseMerkleTree(32), appendTree: new SparseMerkleTree(32), assetTree, revocationTree: new SparseMerkleTree(128),
    nextIndex: 0n, assetIndex: 2n, inNotes: [dummyNote(101n,202n),dummyNote(101n,202n)],
    outNotes: [makeCashNote(),dummyNote(101n,202n)], inIndices: [0n,0n], authSecrets: [0n,0n], podSecrets: [0n,0n], modes: [0n,0n],
    attestSignatures: [[...BASE8,0n],[...BASE8,0n]], bridge: { kind:1n,amount:100n,accountId:303n }, fee:{ amount:0n,accountId:0n } };
}
export function makePolicyConfig(mode) {
  if (typeof mode !== 'bigint' || mode < 0n || mode > 5n) throw new Error('Invalid test mode');
  const c = makeDepositConfig(), n = makeCashNote(); c.inNotes[0] = n; c.outNotes[0] = makeCashNote(100n,11n,334n);
  c.modes[0] = mode; c.authSecrets[0] = 11n; c.nextIndex = 1n; c.bridge = { kind:0n,amount:0n,accountId:0n };
  if (mode === 1n) { n[4]=1n; n[8]=podSecretHash(55n); n[9]=90n; c.podSecrets[0]=55n; }
  if (mode === 2n || mode === 3n) {
    n[4]=2n; n[6]=ownerHash(22n); n[10]= mode===2n ? 110n : 99n; n[11]=888n;
    const seed=Buffer.alloc(32,37); [n[12],n[13]]=derivePublicKey(seed);
    if (mode===2n) { const sig=signMessage(seed,attestationMessage(n)); c.attestSignatures[0]=[...sig.R8,sig.S]; }
    else { c.authSecrets[0]=22n; c.outNotes[0]=makeCashNote(100n,22n,334n); }
  }
  if (mode === 4n || mode === 5n) {
    n[4]=3n; n[7]=ownerHash(33n); n[9]=90n; n[10]=120n; n[14]=40n; n[15]=2n;
    n[16]=555n; n[17]=ownerHash(44n); [n[22],n[23]]=pointFor(19n);
    if(mode===4n) {
      c.authSecrets[0]=33n; c.outNotes[0]=makeCashNote(30n,44n,334n,19n);
      const successor=n.slice(); successor[3]=70n; successor[15]=1n; successor[18]=335n; successor[19]=445n;
      c.outNotes[1]=successor;
    }
  }
  c.inputTree.set(0n,noteCommitment(n)); c.appendTree=c.inputTree.clone(); return c;
}
