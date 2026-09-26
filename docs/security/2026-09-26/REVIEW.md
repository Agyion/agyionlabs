# Security remediation and privacy status — 2026-09-26

This is an authored-source review, local adversarial testing and remediation of
checkpoint `29db661`, followed by another reviewer pass. It is **not an independent
third-party audit**, a proof that no vulnerabilities remain, or certification of
the old deployed contract. No wallet was connected, no real payment was signed,
and no new contract, committee or private pool was deployed in this work.

## Product and release boundary

- **Fade remains public.** Physical redemption also has its own real-world identity
  exposure; that does not establish privacy for other instrument transactions.
- **Current Pod, Trigger and Envoy remain public too.** The requested confidential
  versions need the separate shielded pool described in
  [private-instruments-design.md](private-instruments-design.md). Existing public
  Envoy-to-Fade settlement cannot acquire anonymity from a private UI.
- **Kernel/client V3 repairs Pod authorization.** It needs a fresh compatible
  deployment and opt-in migration. Existing funded records are unchanged. The
  configured older testnet kernel remains incompatible; the UI closes writes.
- **`privacy/` is an isolated research foundation.** It implements strict statement
  encoding and one-record disclosure-request parsing. Its real-verifier registry
  is empty; every proof/transfer activation rejects. It is not imported by the
  production app. No encryption, private payments or committee is represented as
  operational merely because parsing tests pass.

The current frontend publication is Cloudflare version
`90ff8d23-8b7a-4cc6-b4e3-bf66aebca29a`. The earlier publication,
`dd57d7a0-9ea3-441e-9616-06d34dc89f8c`, is the immediate rollback target.
The source checkpoint was pushed to `codex/orbital-redesign-security`.
Final verification and publication evidence is recorded below. Neither frontend
publication deployed the kernel or a private protocol.

## Reproduced findings and corrections

| Finding | Correction and evidence boundary |
|---|---|
| **High: delayed Pod reveal theft** | A real SDK simulation exposed the raw secret before wallet approval. Native and compiled-WASM local fixtures demonstrated another recipient winning after a delay. V3 replaces reveal/commit endpoints with a random local Ed25519 seed, creation proof of possession, and recipient/Pod/network/deployment-bound claim signature. Actual SDK payload captures contain no seed. |
| **High impact: repeat anchor withdrawal funding after a lost response** | Persist the exact signed hash and public registered-payment terms before sending. Unknown and confirmed attempts block repeat funding; read-only reconciliation is required. Web Locks coordinate same-origin tabs. Clearing browser data or using another device still bypasses this local guard; global idempotency is not claimed. |
| **Recovery records lost between tabs** | Immutable per-hash attempts plus append-only evidence replace shared-array writes. Corrupt recovery fails closed. Ledger rows are immutable too; explicit-clear markers preserve intentional clearing while repairing previously lost confirmed rows. |
| **Confirmation accepted without matching transaction evidence** | Require the locally signed hash to match send/lookup evidence and require a valid terminal ledger. Mismatched, incomplete or ambiguous responses retain uncertainty instead of releasing duplicate protection. Legacy unverified terminal records must be reconciled. |
| **Confirmed creation ID never recovered** | Continue read-only lookups for successful creates whose ID is absent; later metadata can fill the ID without downgrading confirmation. |
| **Known pre-broadcast refusal became permanently unknown** | Wallet/session and missing-intent refusals use an explicit not-broadcast path. Actual transport uncertainty remains blocked. |
| **Amounts below a cent displayed as zero; mock settlement understated seller proceeds** | Preserve all seven decimal places and match the positive-price contract settlement in the local simulation. |
| **Provider-controlled alternate payment URI** | Remove the unchecked alternate link; keep the displayed, validated anchor instructions as the payment path. No CSP bypass was demonstrated. |
| **Origin-prefix spoofing and obsolete signer helper** | Compare parsed origins exactly; remove the unused unscoped credential helper. |
| **Loose standalone proof-artifact encodings** | Reject noncanonical scalars, wrong field bounds, projective shapes and mismatched metadata before conversion. The preimage verifier still authorizes no payment. |
| **Release checker could normalize extra JavaScript or miss unsafe CSP tokens** | Pin the observed Cloudflare injection shape with only its public challenge values variable; record raw injected bytes/hash. Parse CSP directives and reject unsafe script permissions regardless of ordering. Mutation tests cover both prior false acceptances. |
| **Research byte decoder could read caller-substituted bytes** | Take an intrinsic, bounded byte snapshot; reject shared/detached/proxy/disguised views. Accepted cases in a 2,560-bit mutation sweep re-encode byte-identically. This remains parsing, not proof validation. |

See [client-review.md](client-review.md), [recovery-review.md](recovery-review.md),
[landing-review.md](landing-review.md), [tooling-review.md](tooling-review.md) and the kernel's
[V3 protocol](../../../contracts/hak/SECURITY_PROTOCOL.md) for mechanisms and tests.
Historical reproductions under `artifacts/security/2026-09-26/` intentionally
demonstrate the checkpoint's old behavior; they are not tests to run as a green
check against the fixed version. Current regression tests are committed in the
app, contract, privacy and tooling test directories.

## What M-of-N means here

The earlier repository had M-of-N proposals, not implemented trustee keys,
distributed key generation or verifiable decryption shares. Trigger's current
single attester is a separate authorization role.

The proposed private design uses commitments/nullifiers, conservation and
authorization proofs, ciphertexts bound to the same witness, and independently
held disclosure shares. A request identifies one record, allowed field groups,
requester, purpose, epoch and expiration. Structural parsing does not verify a
court order, authorization signature or trustee independence.

Fewer than M trustees should not decrypt under the selected construction. A
colluding quorum of M can potentially decrypt other ciphertexts under its key
epoch; a request-scoping policy cannot make that cryptographically impossible.
Reconstructing a master Shamir secret and calling it transaction-scoped would be
misleading. The design instead requires verifiable partial decryption and records
the collusion limit explicitly. No automatic legal-compliance claim is made.

The existing demo proves only a Poseidon preimage. It lacks payment conservation,
nullifiers, recipient/deployment binding and proof-to-ciphertext consistency. Its
original setup artifacts/provenance are unavailable. Adding it to the current
public contract would not provide the requested public anonymity. Primary-source
research, license constraints and candidate limitations are in
[zk-eerc-review.md](zk-eerc-review.md) and the private-instrument design.

## Coverage and verification limits

The reviewed source inventory includes all 102 frontend TypeScript/TSX runtime
files (including dormant templates and the generated binding), six contract
runtime Rust files, the Circom source, five new privacy modules and authored
tooling. The [complete inventory](coverage.json) and exact scoped manifests distinguish current bytes, historical checkpoint
reviews, generated metadata and static assets. Generated SDK specs were decoded
and regenerated from the compiled V3 WASM; dependencies were not manually audited
as if they were authored source.

Active component, wallet, anchor, client, contract and recovery paths were read;
tests include changed recipients/domains/keys, delayed submissions, rollback,
storage races, corrupt data, session changes and lost responses. Some test files
were read in full; the complete suites were run. This is not a claim that every
historical test, document, binary, dependency or Git-history revision received a
line-by-line manual audit. Pattern-only secret scanning found no matching Stellar
secret, GitHub token, AWS access key or private-key PEM in the candidate; it is
not a comprehensive credential-discovery guarantee.

Dependency results: app **4 low / 5 moderate / 0 high / 0 critical** advisories,
through the wallet kit's transitive HOT/NEAR/Solana dependency tree. The app imports
selected wallet modules rather than the HOT module, but this review does not
claim complete bundle-level unreachability. Do not apply the scanner's suggested
wallet-kit downgrade blindly. Landing and circuit npm scans reported no advisories.
Both Rust scans reported no vulnerable packages and retained the unmaintained
`paste` warning (`RUSTSEC-2024-0436`). Advisory absence is not source security proof.

**GitHub default-branch distinction:** after pushing remediation commit `6e8ee6c`,
GitHub reported **33 open alerts on `main`** (2 critical, 11 high, 17 medium,
3 low). Its fetched head was `08e0311550948114e1fc0f117ac217fc7a1433b6`, still
using Next 14.2.35 and Vitest 3.2.7. The published working branch uses Next
15.5.24 and Vitest 4.1.11. Comparing exact lockfile versions against those
33 alert ranges places 30 outside the reported ranges; `elliptic`, `uuid` and
`stream-json` still match three low/medium alerts. This comparison does not
close GitHub alerts or replace the full branch audit above. The remediation
branch has been pushed, **not merged into `main`**; the old default branch must
not be treated as the source of this release. The exact alert/range snapshot is
recorded in `verification.json`; no alert was dismissed to hide its status.

### Final verification and publication

| Check | Result and scope |
|---|---|
| App / landing / privacy / tooling tests | **467 / 70 / 19 / 6 passed**. Privacy tests validate structural parsing and fail-closed behavior, not cryptographic confidentiality. |
| HAK V3 | **49 passed including compiled WASM**; generated binding byte comparison, Rust formatting and strict lint passed. |
| Standalone preimage verifier | **11 passed including compiled WASM**; committed Groth16 proof verified. This is not a private payment circuit. |
| Deployment helper | **8 passed**, with stubbed external commands; no chain deployment. |
| Production builds | Landing and app passed; app lint/type validation passed. |
| App browser suite | **14 passed** against the final production build; no real wallet connection or signature. |
| Mock instrument flow | Pod lock/unlock/claim/history passed; **37 desktop/mobile panel checks** passed. These exercised local simulated funds. |
| Initial document paint | Four actual built HTML pages, landing/app at 1440/390px, with external CSS/JS blocked: every captured pixel was RGB **7, 9, 13**. |
| Natural landing-to-Pod flight | Passed with an injected 1.5s app-script delay; no console/network/CSP errors in that local run. The sampled video contained no full white frame; startup hold and document/renderer replacement remain. |
| Published frontend | **28 HTTP/artifact checks and 14 UI checks passed**, six panels at desktop/mobile widths; **0 page exceptions**. Older-contract writes remained gated. The strict overall live result was **failed**, as detailed below. |

Cloudflare worker `agyion` was published at `2026-09-26T02:21:00.466169Z`,
deployment `e94ff3be-7063-4af1-82a7-13771f5b6ef7`, with 100% traffic on
version `90ff8d23-8b7a-4cc6-b4e3-bf66aebca29a`. Routes were preserved.
The deployed build uses the real testnet configuration, not mock mode. The
rollback version is `dd57d7a0-9ea3-441e-9616-06d34dc89f8c`.

The final live check retained **4 CSP events** from Cloudflare-injected JSD/analytics
and **2 testnet RPC `ERR_NETWORK_CHANGED` failures** (6 console errors, 4 failed
requests total). These are not waived as a clean end-to-end pass; CSP was not
weakened to suppress them. Artifact comparison permits only the narrowly pinned,
observed Cloudflare JSD bootstrap shape and records its raw bytes separately.
The live protocol status was **incompatible**, displaying “Contract v3 deployment
required. Transactions unavailable.” No old funds or records were moved.

Local raw evidence is under `artifacts/security/2026-09-26/` (ignored to avoid
committing browser videos and build output): `unit-tests-final-verified.log`,
`hak-review/v3-wasm-final.log`, `zk-wasm-final.log`, `browser-tests-final.log`,
`mock-pod-flow-verified.log`, `mock-holographic-ui.log`, `local-flight-recheck/`,
`document-paint-final/`, `cloudflare-deploy.log`, `cloudflare-after.json` and
`live-release/results.json`. The committed tests and verification scripts provide
the reproducible checks; [verification.json](verification.json) records the final
results, artifact digests and evidence-log digests without private configuration.

## Remaining release gates

1. **Actual private protocol:** reviewed value/authority circuits, proof-encryption
   consistency, original setup provenance, pinned artifacts, DKG/share verification,
   durable nullifiers/revocations, relayer/indexer/backup recovery and measured
   Soroban/browser budgets. The foundation supplies none of these by itself.
2. **Legacy custody and operation:** Trigger/Envoy/venue demo keys remain in
   sessionStorage. Masked inputs do not protect against same-origin script access.
   Existing keys must not be silently erased. Long contract locks require TTL
   maintenance/restoration; no keeper is running. Arbitrary token freeze/clawback
   semantics are not removed by the kernel.
3. **Chain release:** deploy/verify V3 to the intended testnet, check host protocol
   imports and actual budgets, exercise real wallet fee/signing UX and recovery,
   then separately plan opt-in migration. No automatic movement of old funds.
4. **Independent review before real funds:** current local tests and second-agent
   source review do not replace independent contract/circuit/operations review.
5. **Visual/network boundaries:** the white flash was not reproduced in the
   production recording. Dark initial-canvas protection passes blocked-resource
   desktop/mobile checks; one natural delayed local flight passed with no errors.
   Document/WebGL replacement and software-renderer startup hold remain. Production
   Cloudflare analytics/JSD CSP diagnostics and testnet RPC failures remain in
   this publication's strict live report; policy was not weakened to hide them.

The intended next privacy implementation is the non-value interoperability
prototype in the design's implementation sequence, before private funds can be
enabled. Choosing a real committee, performing a trusted-setup ceremony and
obtaining independent review require operational evidence outside this code edit.
