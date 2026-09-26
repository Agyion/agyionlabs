# Private v2 submission: independent internal peer review

26 September 2026. This was a separate, bounded review of the submission author's
implementation, not an external audit or a claim that every exploit is absent.
The reviewer read the complete `contracts/private-pool/client/submission.ts`, its
tests, relevant installed Stellar SDK 16.3.0 assembly/parsing code, and the journal
interfaces used by the lifecycle. The journal's independent real-browser review
is recorded separately in [private-v2-client-review.md](private-v2-client-review.md).

## Findings resolved before source freeze

1. **A known pre-send refusal blocked an unchanged retry.** The durable base hash
   remained after reservations were released, so signing the identical transaction
   again collided with that base. `retryKnownNotSent` now requires the latest
   matching intent and its definite pre-send outcome, retains immutable ancestry,
   and creates a fresh public CSPRNG memo. Normal submission returns the existing
   result; pending, confirmed and failed attempts are not implicitly resent.
2. **Mutable simulation input was also the comparison reference.** An injected
   transport could mutate the SDK object later used as the expected invocation.
   Simulation now receives a clone; assembly and comparison use separate pristine
   XDR/function snapshots. Normal SDK HTTP does not perform this mutation: this
   was a local adapter aliasing weakness, not a demonstrated remote RPC exploit.
3. **Simulation return identity was not checked.** The contract's return bytes
   must now equal the candidate ciphertext digest before wallet signing.
4. **External fee bumps stayed pending despite valid inner inclusion.** Root
   identified this case; the reviewer confirmed it independently against the
   [official RPC lookup implementation](https://github.com/stellar/stellar-rpc/blob/main/cmd/stellar-rpc/internal/db/transaction.go)
   and a no-network installed-SDK reproduction. RPC indexes inner and outer hashes
   while returning the outer envelope/result. Reconciliation now binds the exact
   signed inner hash, source, sequence, invocation and signature, plus the matching
   inner result-pair hash. Wallet-returned wrappers are still rejected as changed
   signing requests. Unsupported/precondition results remain pending.
5. **Malformed failure results could terminate a pending attempt.** An empty
   `txFailed` operation array was accepted for the owned one-operation transaction.
   Terminal failure now requires one failed operation of the actual invoked type,
   or an actual negative outer operation code. Empty, wrong-type and disguised
   success results remain pending for direct and fee-bumped envelopes.

The final read-through also checked explicit fee bounds, wallet-session checks
across awaits, exact signed payload/signature, current append/revocation
checkpoints, durable public persistence before send, and same-hash reconciliation
against the exact accepted 157-field archive record. No additional concrete issue
was identified in this bounded final snapshot.

## Frozen evidence

| File | SHA-256 |
| --- | --- |
| `client/submission.ts` | `28911d7d91a597b4625f6e76088b9195f36a993677edaab4ac584bcfe85ef38a` |
| `client/reader.ts` | `1abf57da5f376176f7806d587d2f2e4f6efd4c1bae9f184e18b53d5792b424e3` |
| `client/release.ts` | `d7ac7af221798c5727e2cb0347af3b28dda5ee797b65d989a3d8be6c0a399146` |
| `client/journal.ts` | `83fda4955a483f545c2038af22c9b831f0eb23de982423b441eb23f45714473e` |

Paths are relative to `contracts/private-pool`. The latter three hashes identify
the integrated dependencies; they do not imply that this reviewer duplicated the
other peer's entire journal/browser audit.

The reviewer read the retained [author-run client test output](private-v2-evidence/submission-client-tests.tap):
30 tests, 29 passed, 1 explicitly skipped opt-in browser test, 0 failures. The 15
lifecycle tests use genuine committed Groth16 proof/VK verification and actual SDK
XDR, signatures, fee-bump envelopes and its request-hash transformation. RPC,
ledger responses and the lifecycle test journal are explicit local fixtures;
those results are not live transaction or persistence evidence. The separate
browser journal run provides its own limited IndexedDB/Web Locks evidence.

## Release-candidate file check

The candidate inventory (HEAD diff plus nonignored untracked files) was checked
for size, file type, symlinks and bounded secret/private-artifact patterns. The
retained [sanitized scan](private-v2-evidence/release-candidate-scan.json)
contains paths, hashes and match locations, never matched secret values. No
candidate private witness, proving key, ceremony transcript, compiled WASM,
dependency tree, credential literal or symlink was found. The single content
alert was the public 86-entry host resource-cost coefficient table, not secret
polynomial coefficients.
This is the named 163-file review snapshot; documentation/evidence consolidation
continued afterward. It is not a count of the eventual commit's complete files.

The verification fixtures contain 17 public proofs, two public VKs, provenance and
test configuration. The explicitly `testOnly` host configuration also discloses a
synthetic auditor scalar; it is intentionally public disposable test material,
not a production trustee secret. Generated setup/witness artifacts and build/
dependency directories remain ignored. Pattern checks do not prove absence of
every possible secret representation.

## Remaining boundaries

Trusted release/roster distribution, the pinned local verifier, wallet adapter
and configured RPC remain trust boundaries. Matching XDR/hashes are not SCP
inclusion proofs. No live wallet, signing, submission, deployment, restore or
real-funds action occurred during this review. An unsupported or unverifiable
outcome stays pending; no timeout or missing historical RPC record authorizes an
automatic resend. RPC history is bounded, so this source does not promise that a
long-offline pending transaction can always be reconciled from the default RPC.
