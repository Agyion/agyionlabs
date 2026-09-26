# Execution ledger — private instruments v2

2026-09-26. Base: `d1848a8`; branch: `codex/orbital-redesign-security`.
Protocol: [PROTOCOL_V2.md](PROTOCOL_V2.md).

## Implemented and locally verified

- Real proof-to-encryption equality and complete Pod/Trigger/Envoy transition
  constraints: conservation, authority, membership, append and revocation.
- Immutable, testnet-only Soroban pool with pinned 157-input transition and
  four-input revocation Groth16 keys, durable nullifiers/commitments and complete
  indexed encrypted records. Token transfers and all effects are atomic.
- Authenticated threshold DKG, DLEQ share checks, a separate signed decision
  quorum, one-record/field-scoped disclosure, encrypted share delivery and
  durable replay prevention. No persistent master key reconstruction.
- Complete encrypted owner/Pod/Envoy key vaults, draft/note backup, archive
  reconstruction and unspent-note recovery. Missing/changed archives fail closed.
- Actual pinned local proving in one browser worker, exact signal binding,
  bounded pairing verification and real in-flight cancellation.
- Verified release/ledger reader, exact wallet-payload checks, simulation and
  confirmation lifecycle, and a durable cross-tab transaction journal. Uncertain
  submissions are reconciled by the signed hash without an automatic resend.

This is locally verified source, not production activation. The published app
still uses its separate HAK path. No private pool has been deployed and no
private funding UI enabled. The separate release/reader and transaction-lifecycle
SDK are implemented and tested; the published HAK panels do not import them.

## Observed evidence

| Check | Result and boundary |
| --- | --- |
| Compiled circuit witnesses | Eight valid branches plus 33 attacks passed; 41 subcases, 42 TAP results including the parent. These are actual constraint checks, not proof verification. |
| Phase1 | Exact PSE artifact/source pinned; complete upstream transcript/powers/Lagrange verification passed in 453 seconds. Native hash acceleration has parity and tampered-transcript tests. |
| Phase2 | Both freshly contributed keys verified against R1CS and phase1. Explicitly **single-operator development setup**, not an independent Agyion ceremony. |
| Actual proofs | Seventeen genuine proofs cover deposit, Pod, Trigger attest/refund, Envoy payment/exhaustion/revocation/owner recovery and withdrawal. Public fixtures are committed. |
| Native/WASM chain | Both execute all 17 steps with real SAC balances: pool 150, recipient 845, fee 5, funder delta −1000; archive 16 records plus one revocation. |
| WASM attacks | Three added compiled-WASM tests reject unauthorized funding, changed amount/recipient/ciphertext, malformed proof and replay; actual failed deposit and failed fee-after-withdrawal roll back and can retry. Together with the successful chain, 4/4 filtered checks passed. |
| Verifier parity | Seventeen actual proofs agree with snarkjs; both reject 17 changed statements and 17 valid-point mutations. Canonical/subgroup/identity and zero aggregate IC cases have separate tests. |
| Fresh local proofs | Transition and revocation generated again with the final bounded verifier; both pass and reject mutations. |
| Selective disclosure | Actual newly proved ciphertext passes DKG, signed decision quorum, durable replay protection, encrypted share delivery and scoped opening. The accepted-record reader is synthetic local evidence, not live inclusion. |
| Desktop browser | Four real proof flows, complete grant-key recovery, draft/note restore and cancellation: 37 page plus 8 harness checks passed. Exactly one worker, 7 public same-origin GETs, 0 unexpected/POST requests and 0 console/page/HTTP/CSP errors. |
| Final core check | Fresh locked WASM build; 131 privacy tests passed, four artifact-heavy skips; 29 client tests passed, one opt-in browser skip; seven tooling tests and all 27 native/WASM pool tests passed. TypeScript checking, fixture provenance and strict Rust lints passed. |
| Transaction journal browser | 22/22 actual Chromium checks passed on the final source: cross-tab locks/races, immutable retry history, pending recovery after reload and missing/corrupt reservation rejection. This does not establish disk-flush, power-loss or hostile-origin protection. |

The [final core-check report](../docs/security/2026-09-26/private-v2-evidence/core-check.json)
records the fresh build and each command, time, status and log hash. Routine privacy tests deliberately skip four artifact-heavy checks;
their separate executions above cannot be inferred from a routine test pass.
Portable public reports are in
[private-v2-evidence](../docs/security/2026-09-26/private-v2-evidence/README.md).
Per-file review ledgers distinguish inspected authored code and generated data.
Neither the tests nor agent review constitute an independent audit.

## Reproduced defects corrected

- Dummy incoming plaintext disclosed the hidden asset under its public dummy
  view key. All dummy plaintext is now zero, enforced by the actual circuit.
- Envoy agent spending could divert value through a self-selected public fee.
  Delegated spending now forbids pool fees, with a circuit rejection test.
- Operator disclosure previously could rely on caller-supplied archive data.
  It now independently reads the exact accepted record before releasing shares.
- Authorization now binds record identity to the exact ciphertext digest.
- Library verification could silently create a hardware-sized worker pool.
  Bounded Noble verification replaces that path; browser tests use no CPU cap.
- Phase1 tools could incorrectly attribute another valid input to PSE. Exact
  selected length/hash is now required before verification/source attribution.
  Fingerprint matching alone never establishes transcript verification.
- Archive reading now accepts full canonical revocation tags, using low128 bits
  only for their tree positions. The actual revocation proof is its regression.
- Journal consistency audits reject missing reservations; explicit pre-send
  retries retain immutable history. Simulation data is isolated from SDK mutation.
  Fee-bump confirmation verifies the exact inner transaction; an empty failure
  result cannot release a pending reservation.

## Measured limitations and activation work

Full WASM maximum: 89,224,962 CPU instructions and 3,531,897 metered memory bytes.
All 86 local cost-model rows match the read-only testnet snapshot at ledger
4,881,984, protocol 28, with 400M instructions / 40 MiB memory limits. See
[RESOURCE_RESULTS.md](../contracts/private-pool/RESOURCE_RESULTS.md) for full
measurements and the excluded transaction/ledger overhead.

Desktop transition proving took about 60 seconds; renderer high-water RSS was
about 1.20 GiB. Verification alone took 57–58 ms. Real phone performance is untested.
Concurrent appends can stale a proof; this must never trigger automatic signing
or another payment. Complete archive recovery currently rejects histories over
100,000 records/revocations rather than silently truncating them.

Remaining activation work includes the separate application path, actual
testnet deployment/readback/submission/archival restoration, independently held
trustee keys and an operational decision-authority policy. Real funds require
an independently contributed setup and independent cryptographic review.
Disclosed participant identifiers are pseudonyms, not verified civil identities.
A colluding decryption quorum can misuse its own shares. See the concrete
[release sequence](../contracts/private-pool/RELEASE.md).

## Reproduce

Install locked dependencies in `privacy/` and `contracts/private-pool/client/`,
then run `npm run check:private` from the repository root. It rebuilds the real
WASM and tests committed public proofs without signing, funding, deployment or
setup regeneration. Each step's report/log/hash is retained under
`artifacts/private-pool-check/`. Rust, wasm32v1-none and Stellar CLI are required.

Artifact-heavy checks require the generated local artifacts:

```sh
PRIVACY_CIRCUIT_TESTS=1 node --test privacy/test/transition-circuit.test.mjs
PRIVACY_PROVER_TESTS=1 PRIVACY_PROVER_MANIFEST=/absolute/path/prover-cases.json node --test privacy/test/prover-integration.test.mjs privacy/test/prover-verification.test.mjs
PRIVACY_DISCLOSURE_PROOF_TEST=1 PRIVACY_ARTIFACT_DIR=/absolute/path/privacy-v2 node --test privacy/test/disclosure-proof.test.mjs
PRIVACY_PROVER_MANIFEST=/absolute/path/prover-cases.json node privacy/scripts/verify-browser-prover.mjs
```

## Protocol decisions

This is an experimental BabyJub/Poseidon profile, not P-256 HPKE or Avalanche
eERC byte compatibility. Independent composition review remains necessary.
All ciphertext fields are direct proof inputs: hashing 100 limbs natively
already cost 65.8M–105M CPU before verification. Direct inputs preserve exact
encryption equality without assuming a digest-only design is affordable.

DKG is authenticated, all-roster and abort-only. Malicious/unavailable dealers
can prevent completion; no silent exclusion. This preserves agreement while
giving up liveness/unbiased output under selective abort. Local processes do
not establish actual trustee independence. The historical v1 parser registry
remains closed; v2 never relabels a parsed object as a verified proof.
