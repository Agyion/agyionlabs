# Private statement foundations implementation plan

> For agentic workers: implement this assigned bounded task in place, using test-first steps. No deployment, funds, network calls, production UI import or commit is authorized by this plan.

**Goal:** Strictly parse and canonically encode research public statements and scoped disclosure requests while every proof/activation attempt fails closed.

**Architecture:** Dependency-free Node ES modules with immutable parsed snapshots. Caller-supplied trusted context is compared against untrusted data; parsing is never proof or authorization verification. No verifier is installed and there is no installer/plugin/environment override.

**Tech stack:** Plain `.mjs`, `node:test`, Node built-ins only.

**Spec:** `../docs/security/2026-09-26/private-instruments-design.md`, section 9.

## Global constraints

- Only `privacy/` and the specifically authorized README status corrections are edited.
- Return names are `ParsedStatement` and `UnverifiedDisclosureRequest`; neither represents cryptographic verification.
- Object fields are exact. Values use lowercase fixed-width hex or canonical decimal strings, never coercion/unsafe JS numbers.
- Schema version `1`, research suite `research-groth16-bn254-v1`; no installed verifier for it.
- At most two real input nullifiers/two output commitments; distinct nonzero canonical BN254 field encodings. Roots are canonical field encodings. The codec does not model circuit dummy notes.
- Statement ledger endpoints differ by at most 120; request endpoints by at most 17,280. Endpoints are inclusive. These are prototype schema bounds, not promised wall-clock intervals or a production policy.
- Disclosure requests select exactly one record and a sorted nonempty subset of four named field groups. Trustee IDs are sorted distinct uint16 decimal strings; a supplied trusted roster/threshold must match.
- All parsed results are deeply frozen copies. Error text excludes supplied values.

## Review focus

- Accessors, sparse arrays, prototype-inherited fields and symbol keys must not silently enter a canonical encoding.
- Decoder must reject truncation, extra bytes, bad magic/suite/counts and noncanonical field integers.
- Binding checks must reject other domains/epochs/ciphertexts/requester keys and stale/future intervals.
- Public bridge shape/counts/uint64 amounts and fee recipient must not be ambiguous.
- Caller manifests, callbacks, plausible proofs and environment flags must not create a successful verifier path.

## Files and interfaces

- `package.json`: independent private package; `npm --prefix privacy test` runs its entire suite.
- `src/validation.mjs`: bounded scalar/hex/plain-data checks and `PrivacyValidationError`.
- `src/statement.mjs`: `parseStatement(value, context)`, `encodeStatement(value, context)`, `decodeStatement(bytes, context)`.
- `src/disclosure.mjs`: `parseDisclosureRequest(value, context)`.
- `src/verifier.mjs`: `installedSuites()`, `activatePrivateTransfers(...)`, `verifyPrivateProof(...)`; installed registry permanently empty in this release.
- `src/index.mjs`: explicit public exports.
- `test/{fixtures,statement,disclosure,verifier}.mjs`: independent fixtures and malformed/mutation vectors.
- `README.md`: exact schema/wire format, context trust boundary, examples and exclusions.
- Repository `README.md`: correct public visibility, threshold/court-order/bulk-access assurances and explicitly historical compliance proposals.

## Task 1 — canonical statement

- [x] Write tests: literal big-endian fixture, decoding that fixture, byte mutation/truncation/trailing data, unknown/accessor/symbol fields, decimal/field boundaries, duplicate/count errors, bridge invariants, frozen copies and trusted-context mismatch.
- [x] Run tests and record expected failures before implementation.
- [x] Implement bounded validation and parser/codec. Wire: ASCII `AGYPS001`, suite byte 1, domain 2×32 bytes, epoch/from/until u32 BE, three roots, counted nullifiers/commitments, ciphertext digest, bridge tag with optional fixed asset/amount/account, fee amount/recipient.
- [x] Run the complete independent package suite.

## Task 2 — scoped request

- [x] Write tests for one-record scope, ordered field slots, trustee roster/threshold, requester/ciphertext/domain/epoch/policy binding, bounded freshness and immutable snapshots.
- [x] Observe expected failures, then implement parsing only. Public-key byte shape is checked; point membership, signatures and DKG are not claimed.
- [x] Run the complete independent package suite.

## Task 3 — fail-closed boundary and documentation

- [x] Write tests that plausible and malformed proof/manifests, injected callbacks and environment flags all fail; installed-suite results cannot be mutated to install a verifier.
- [x] Observe expected failures, implement a closed registry with no registration API and no successful proof return.
- [x] Document actual versus future behavior and correct root README claims.
- [x] Run all package tests and `git diff --check`; inspect exports/imports to confirm no production wiring. No broad app build/browser or unrelated tests.

No commits: parent owns integration. The user requested privacy work, and the parent assigned this bounded local research task; this plan does not assert separate user design approval or introduce another approval gate.

## Execution record

- Initial test-first run: 16 failures against explicit unimplemented stubs; raw output retained at `/tmp/agyion-privacy-foundations-red.log`.
- Allowed field-scope extension: 3 expected failures before adding trusted `allowedFields`; raw output at `/tmp/agyion-privacy-scope-red.log`.
- Completed package suite: 17 tests. Includes all 320 truncated prefixes of the independent statement vector, byte mutations, scalar/integer bounds, domain/epoch/ciphertext/requester scope and closed activation.
- No production imports found under app/landing/contracts/scripts. No crypto dependencies, contracts, browser runs, build, network calls, deployment or commit.
- Disclosure public-key validation is byte-shape only; actual curve membership, authorization signatures and threshold shares remain explicitly unverified.

## Independent bounded review — 2026-09-26

- Read every package source, test, fixture and package document. Initial suite passed 17/17.
- Reproduced a canonical decoding failure: a `Uint8Array` with invalid actual magic could override `subarray()` to return a different valid buffer and be accepted. Shadowing `byteLength` could also hide an oversized view. These are in-process byte-object boundary issues, not a demonstrated remote exploit or fund loss; this package has no production wiring or successful verifier.
- Added two regressions before the fix; both failed as expected. An additional disguised `Uint16Array` case also failed before the intrinsic type check. The decoder now checks intrinsic view type/length, rejects shared/detached/proxy storage, and copies actual bytes without invoking supplied properties. Tests also preserve Buffer and nonzero-offset view behavior while supplied getters throw if called.
- Final suite: 19/19 passing, including existing scope, canonical scalar, truncation and permanently closed verifier checks. No production imports found in app, landing, contracts, shared or scripts.
- A separate deterministic single-bit mutation sweep covered all 2,560 bits of the 320-byte fixture: 1,286 mutations were rejected; all 1,274 structurally accepted mutations re-encoded to exactly their supplied bytes. Acceptance here says nothing about cryptographic validity or existing roots/notes.
- Clarified inclusive ledger endpoint bounds and the data-only API boundary. Caller-created object Proxy traps or mutated JavaScript intrinsics are not sandboxed. Trusted context provenance, actual requester curve membership, signatures, ciphertext hashing, root/nullifier state, purpose authorization, request replay prevention and threshold shares remain outside this package. Parsing never grants a transfer or disclosure.
- No client/product changes, builds, browser sessions, chain/network calls, deployment or commits in this review.
