# Privacy test-source review

Date: 27 September 2026. All 29 owned `.mjs` files under `privacy/test` and
Circom test fixtures under `privacy/circuits/test` were read completely in this
review, including four files previously represented only by a historical hash
match. The final snapshots total **2,326 lines**. Inclusive ranges and SHA-256
values are recorded in [privacy-test-coverage.json](privacy-test-coverage.json).
This is manual test-source coverage; executed assertions and generated proof
fixtures are different evidence categories.

## Corrected test defects

Three negative fixtures in `privacy/test/model.test.mjs` could remain green if
the particular protection named by the test were removed:

1. The redirected Pod output fixture did not provide its valid Pod secret.
   Removing the destination check still produced `POD_CONDITION`, satisfying
   the generic exception assertion. The corrected fixture supplies the valid
   secret and requires `CASH_DESTINATION`.
2. The Envoy final-remainder recipient fixture reused an input note's rho.
   `REUSED_OUTPUT_RHO` hid omission of the return-to-owner check. It now clones
   the valid baseline, changes only the recipient and corresponding commitment,
   and requires `CASH_DESTINATION`.
3. The Envoy over-cap fixture likewise created reused rho values before it
   reached the cap. It now preserves the valid baseline's fresh output seeds,
   changes the two amounts while conserving value, updates the commitments and
   requires `ENVOY_CAP`.

For each case, an isolated in-memory copy of the actual reference model omitted
only the relevant check. The old test accepted that mutant; the strengthened
test rejects it with a missing-exception assertion while the unchanged real
model passes. The production model, circuits, keys and deployment were never
modified. These are demonstrated **test gaps**, not demonstrated missing
protections in the current production model. The compiled circuit adversarial
suite already uses self-consistent recipient/cap mutations; its evidence is
separate from this reference-model regression.

Reproduction and raw before/after logs live under
`artifacts/security/2026-09-27-compatibility/hak/`:

- `check-pod-test-mutation.mjs`: local trusted-source mutation checker; supports
  `pod`, `cap` and `remainder` scenarios.
- `pod-test-mutation-{before,red,green}.log`.
- `envoy-cap-test-mutation-{red,green}.log`.
- `envoy-remainder-test-mutation-{red,green}.log`.
- `privacy-tests-final.log`: complete default package suite after all three
  fixture corrections, **131 passed, zero failed, four explicitly skipped**.

The four skipped suites are real-proof disclosure composition, prover
roundtrips, the 17-proof differential-verifier test and compiled transition /
revocation adversarial witnesses. They are not counted as passing here. The
root review separately ran the enabled optional suites against source/hash
checked development artifacts; see [PRIVACY_SOURCE_REVIEW.md](PRIVACY_SOURCE_REVIEW.md).
This reviewer did not rerun those expensive proof suites after a test-only
fixture correction or produce a new ceremony.

## What the test sources establish and assume

- Parser/codec tests use hand-described statement bytes, canonical bounds,
  forged typed-array/accessor/proxy inputs and explicit unverified states. The
  old public verifier interface deliberately accepts no installed suite.
- Model and witness tests exercise conservation, spending roles, conditional
  authority, timing, Envoy successors/revocation/fee destinations, append
  membership, fresh encryption material and dummy redaction. Model acceptance
  is not proof acceptance. The sparse-tree helpers and fixture builders are
  shared implementation assumptions; the literal vectors, independently
  compiled constraints and proof checks provide separate comparisons.
- Circuit tests accept honest witnesses before testing mutations. Policy
  mutations rebuild commitments, membership/append roots and encryption so
  unrelated stale bindings do not normally hide a policy failure. Witness
  calculation with assertions enabled is a constraint check, not a Groth16
  proof or live pool execution.
- Real prover suites load explicitly pinned artifacts, assert real proof
  acceptance, and reject altered public statements and changed valid curve
  points. The differential suite compares against snarkjs. The small synthetic
  pairing/codec fixtures explicitly do not claim to be proofs for the pool's
  immutable verification key. Worker unit mocks cover local transport,
  concurrency and cancellation, not successful cryptography.
- Authorization/disclosure tests use real signatures, group operations,
  encrypted deliveries and partial-proof checks. Their accepted-record reader
  and ledger are deliberately local trusted adapters. A successful unit test
  does not authenticate a network archive or prove inclusion. The proof
  composition test also labels its starting root/reader and all actors as
  synthetic local state, not an independent committee or funded deployment.
- Replay-store tests include six independent competing processes, restart,
  private file modes, symlink/corrupt-entry cases, file/directory fsync failure,
  ancestor permissions and directory replacement. These are local filesystem
  cases, not evidence for a shared network filesystem or distributed service.
- Backups use actual Argon2id/AES-GCM, reject malformed metadata and bound work.
  Vault tests reject failed randomness and incomplete/key-mismatched backups.
  Recovery tests rebuild indexed histories, count zero-output exits, reject
  changed snapshots, cancel pending reads and invalidate only new handles.
  Test readers explicitly must not prove or claim ledger acceptance.
- Phase-1 tests compare native hash streams with upstream outputs, exercise a
  small genuine test ceremony, mutate a transcript point and reject a
  different pinned artifact. They do not rerun every contribution in the large
  selected phase-1 transcript or turn test-only entropy into production setup.

## Remaining test limits

The standalone compiled-witness test loads a caller-selected artifact directory
without internally comparing current source hashes; its comment requires
current compilation. The standalone prover differential tests bind supplied
artifact pins but do not independently derive those pins from current source.
Therefore their result must be paired with the separate compile-manifest/source
freshness check performed by the root review. The disclosure-proof composition
suite additionally performs its own circuit source-hash comparison. Enabling
an optional suite with missing artifacts fails rather than using a fake engine.

Some negative parser/shape cases intentionally accept any validation rejection;
this review does not claim mutation testing of every rejection branch. No test
suite enumerates every transaction schedule, CPU side channel, arbitrary
platform fault or cryptographic assumption. Development fixtures and keys,
transitive dependency implementations and generated witness/proof artifacts
are not counted as authored runtime manually audited here. No independence,
production readiness, full privacy or absence-of-exploits guarantee follows
from the passing counts.
