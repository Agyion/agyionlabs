# Private instruments v2 implementation profile

This is the executable testnet development profile being implemented after the
user requested completion. It is not an audited production protocol or an
independently contributed ceremony. Existing public HAK funds are not migrated.
The older `IMPLEMENTATION_PLAN.md` describes the completed parser-only package.

## Fixed interfaces

- BN254 Groth16, Circom 2.2.3; one common circuit for cash, Pod, Trigger, Envoy.
- Field `F` is the BN254 scalar field. Values are unsigned 64-bit integers.
- BabyJub prime-order Base8, scalar in `[1,q)`. Curve arithmetic uses noble.
- Poseidon encryption uses exact messages of 24, 9, 12 or 45 field elements,
  a 128-bit nonce, full tag checking and a checked ECDH key.
- All **134 ciphertext fields are public proof inputs**, passed unchanged to the
  verifier and stored by the pool. This avoids a costly on-chain Poseidon digest
  or an unverified ciphertext-availability shortcut. No plaintext is public.
- Fixed note tree depth **32**, asset allowlist depth **8**, revocation tree depth
  **128**. Note leaves are packed, nonzero outputs only; zero outputs never enter
  the tree and never create a spendable note. Fully spent withdrawals need no
  new leaves, including at capacity. Every proof has two fixed input/output slots.
- A root history accepts past input roots; append oldRoot must be current.
- Domain/address IDs = Poseidon2 of the two big-endian 128-bit limbs of SHA256
  of a tagged canonical encoding, never integer reduction of arbitrary bytes.
  Tags: `AGYION_DOMAIN_V2\0` + networkID32 + contract Address.to_xdr();
  `AGYION_ASSET_V2\0` + asset Address.to_xdr();
  `AGYION_ACCOUNT_V2\0` + account Address.to_xdr().
- The initial asset allowlist and disclosure epoch/key are immutable per pool.
  Rotation uses a new explicitly selected profile/pool; it does not rewrite old
  ciphertext or change a funded note's spending rules.

### Public inputs (157 fields, in order)

| Index | Meaning |
|---|---|
| 0 | domain |
| 1 | assetPolicyRoot |
| 2 | disclosureEpoch |
| 3,4 | auditor public x,y |
| 5 | current revocationRoot |
| 6,7 | validFrom, validUntil (u32, inclusive; window <=120) |
| 8 | accepted inputRoot |
| 9,10 | append oldRoot, newRoot |
| 11 | nextIndex (u33; capacity 2^32) |
| 12,13 | input nullifiers, zero for dummy input |
| 14,15 | output commitments, zero for dummy output |
| 16 | bridge kind: 0 internal,1 deposit,2 withdrawal |
| 17 | public asset ID if bridge!=0 OR fee>0; otherwise zero |
| 18 | public bridge amount (u64), zero internally |
| 19 | public bridge account ID, zero internally |
| 20,21 | fee amount (u64), fee account ID; both zero iff no fee |
| 22 | reserved suite marker, exactly 2 |
| 23..156 | ciphertext fields below |

The contract computes these fields from typed arguments/configuration; callers
cannot replace expected network, account, epoch, roots or asset identifiers.
Groth16 proof is canonical A64 || B128 || C64, existing Soroban host encoding.
The verifier key is compile-time pinned to generated development artifacts.
Mainnet must be rejected by this development contract.

### Notes (24 private fields)

| Index | Meaning |
|---|---|
| 0,1,2,3 | version=2, domain, asset, amount |
| 4 | kind: cash0, Pod1, Trigger2, Envoy3 |
| 5,6,7 | beneficiary/owner auth hash, refund auth hash, agent auth hash |
| 8 | Pod secret hash |
| 9,10 | start/unlock, deadline/expiry (u32) |
| 11 | terms digest |
| 12,13 | Trigger attester BabyJub x,y |
| 14,15 | Envoy per-action cap(u64), remaining count(u32) |
| 16,17 | Envoy revocation tag, allowed recipient auth hash |
| 18,19 | random nullifier seed, blinding (never auditor plaintext) |
| 20,21 | incoming view x,y |
| 22,23 | Envoy allowed recipient view x,y |

Auth hash = Poseidon1(independent random spending secret). Pod secret hash is
Poseidon2(1004, independent Pod secret). Hash chaining starts at its tag and
updates state=Poseidon2(state,nextField). Note commitment uses tag1001 over all
24 fields; transition context tag1003 over core23. Nullifier is
Poseidon4(1002, domain, nullifierSeed, noteCommitment), identical across all
spending branches. Knowledge of a note opening never replaces spending authority.
Real output seeds differ from current real input seeds and each other. The pool
rejects previously inserted commitments, including exact reissuance of a note.

Each Envoy grant has a dedicated view key shared only with its owner/agent;
this is separate from both spending keys and from the wallet's other view keys.
Trigger's funder keeps its original encrypted opening for refund. Private
delivery and encrypted backups are required; no spending secret enters a record.

## Policies

Input mode: cash0, Pod1, Trigger attest2, Trigger refund3, Envoy spend4,
Envoy owner reclaim5. An input with zero amount is dummy and has nullifier0.
At most one non-cash input per transition and no other real input alongside it.
Cash inputs may merge/split or create new conditional notes.

- Pod: correct beneficiary secret + Pod preimage, validFrom>=unlock. Output0
  cash for that beneficiary, output1 dummy. No invented expiry/refund.
- Trigger attest: beneficiary secret and EdDSA-Poseidon attester signature of
  Poseidon6(domain,inputCommitment,terms,beneficiary,deadline,decision=1);
  validUntil<=deadline. Output0 cash beneficiary, output1 dummy.
- Trigger refund: refund secret, validFrom>deadline. Same nullifier as attest;
  output0 cash refund beneficiary, output1 dummy.
- Envoy spend: agent secret, interval within start/expiry, current-root proof
  that revocation tag is not revoked, remaining count>0. Payment plus fee <=cap.
  Output0 cash for allowed recipient and its committed view key. Output1 is
  exactly one successor with amount/count reduced and unchanged policy, or cash
  for owner if count is exhausted. No forked capability or arbitrary destination.
- Envoy owner reclaim: owner's secret; output0 cash owner, output1 dummy.
  Revocation does not disable owner recovery. The public Fade adapter stays public.

Revocation tag is Poseidon2(SHA256(`AGYION_REVOKE_KEY_V2\0` + domain32 +
fresh Ed25519 publicKey32) split into128-bit limbs). The owner stores its separate
revocation key. A signed domain/tag/root revocation plus a separate four-input
Groth16 insertion proof [domain,oldRoot,newRoot,tag] inserts the nonzero leaf
Poseidon2(1005,domain) at the low128
tag bits into the persistent sparse tree. Targeted index collision requires a
128-bit preimage search; collisions conservatively revoke both tags. The circuit
uses only the current revocation root. Existing spent/nullifier state is durable.

## Ciphertexts and selective disclosure

Five envelopes always exist, with independent nonzero ephemeral scalars/nonces.
Each header is ephemeral BabyJub x,y, nonce; then N+1 ciphertext/tag fields.

1. output0 full24-field note to its view key (28 fields)
2. output1 full24-field note to its view key (28 fields)
3. audit asset facts9 (13 fields)
4. audit parties12 (16 fields)
5. audit terms45 (49 fields)

A dummy output encrypts **24 zero fields**, not its canonical internal dummy
note. Its fixed Base8 view point has the publicly known scalar1; encrypting the
internal dummy note would expose the otherwise hidden asset. The all-zero
decrypted sentinel is an absent slot and must never be parsed as a real note.

Envoy agent spending (mode4) forbids pool-paid fees until a future grant schema
commits a fee recipient and limit. The agent pays ordinary network fees outside
the grant. Otherwise an agent could bypass its recipient restriction by
labeling a payment to itself as a fee. Other authorized owner modes may pay fees.

Asset facts = asset, in0 amount,in1 amount,out0 amount,out1 amount,
in0 commitment,in1 commitment,bridge amount,fee amount.
Parties = [owner,refund,agent] for in0,in1,out0,out1.
Terms = [kind,secretHash,start,deadline,terms,attesterX,attesterY,cap,count,
revocationTag,allowedRecipient] for those four notes, then padding0.
Dummy input commitment is0 in the audit record. No note blinding/nullifier seed,
spending secret, revocation secret or master trustee key enters audit envelopes.

Context = domain-separated Poseidon chaining over public fields0..22.
Envelope key[j] = Poseidon3(sharedPoint[j],context,envelopeSlot+1), j=0,1.
The circuit computes ECDH and ciphertext from the SAME witness facts used for
membership/conservation/policies. The contract stores exact public ciphertext
fields plus their SHA256 byte digest for archive/disclosure identification.

M-of-N: authenticated all-roster abort-only Feldman DKG, signed common transcript,
verified per-ciphertext Chaum-Pedersen decryption shares, public interpolation of
points only. A full signed authorized request binds record, selected field groups,
requester, epoch, purpose, expiry and policy. Trustee shares travel privately to
that requester. Fewer than M shares do not decrypt; a colluding M may decrypt other
records of the epoch. No program can establish legal validity of a court order.

## Completion evidence and non-negotiable limits

Real proofs, malformed witness rejection, all M-subsets, wrong epoch/context/share
rejection, double spends, races, changed amount/recipient/ciphertext, failed token
rollback, archival restore, encrypted backup and native/WASM budgets must run.
Record exact compiler/dependencies/licenses, setup provenance and artifact hashes.
Single-operator development setup and local trustee processes do not count as an
independent ceremony, real committee, third-party audit or safe mainnet release.
