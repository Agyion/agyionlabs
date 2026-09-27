# Agyion private instruments: experimental v2

`src/model.mjs`, `witness.mjs`, `encryption.mjs`, `threshold.mjs`,
`authorization.mjs` and `backup.mjs` implement the new v2 protocol in
[PROTOCOL_V2.md](PROTOCOL_V2.md). The Circom circuits bind value conservation,
instrument authority, Merkle membership/append, revocation and all five encrypted
envelopes. The separate [Soroban pool](../contracts/private-pool/README.md)
verifies the exact public vector and stores full encrypted records. Fade stays
public. The public Agyion adapter is a separate protocol. The private application
coordinator uses this v2 pool, with its own pinned deployment and encrypted vault.
See [authorized disclosure](../docs/PRIVACY_DISCLOSURE.md) for the actual opening
capability, the live testnet evidence and the legal/operational boundaries.

This is an **experimental development profile**, not an independently audited
release or Avalanche eERC bytecode. The public PSE phase1 transcript was fully
verified; Agyion's circuit-specific development phase2 is single-operator;
independent ceremony, independent trustee custody and operational recovery remain
requirements for a production release. The published testnet app now integrates
the actual pool, prover, vault and transaction coordinator. A test count or
local proof must never enable real-user deposits by itself. The current format and trust boundaries are documented in
[PROTOCOL_V2.md](PROTOCOL_V2.md) and the [security policy](../SECURITY.md).

`npm run check:private` from the repository root rebuilds the pool and checks the
committed real public proofs in native and WASM execution, client boundaries,
local units, fixture provenance and strict Rust lints. It writes a dated report
under `artifacts/private-pool-check/`. Install both `privacy/` and
`contracts/private-pool/client/` locked Node dependencies first; Rust, the
`wasm32v1-none` target and Stellar CLI are required. This command uses no signing
key or network account and does not generate a setup or enable funding. Actual
fresh proving/browser/disclosure checks have separate development scripts; routine unit skips must not be mistaken for those checks.

Install pinned dependencies with `npm --prefix privacy ci`, then run
`npm --prefix privacy test`. Real full-circuit witness checks are separate:

```sh
PRIVACY_CIRCUIT_TESTS=1 node --test privacy/test/transition-circuit.test.mjs
```

That command requires already compiled current artifacts; a routine test run
explicitly skips it. Full Groth16/contract checks are separate from witness
assertions. See the development scripts and artifact manifests for provenance.
Never send a private witness to RPC, a hosted prover, logs or analytics.

To reproduce all four optional cryptographic suites from a clean checkout,
install the locked dependencies, acquire the reviewed public proving files and
prepare a new output directory:

```sh
node scripts/fetch-private-prover.mjs --development
node scripts/prepare-private-integration.mjs --development artifacts/privacy-ci
PRIVACY_ARTIFACT_DIR="$PWD/artifacts/privacy-ci" \
PRIVACY_CIRCUIT_DIR="$PWD/artifacts/privacy-ci/circuit" \
PRIVACY_PROVER_MANIFEST="$PWD/artifacts/privacy-ci/prover-cases.json" \
PRIVACY_DISCLOSURE_PROOF_TEST=1 PRIVACY_PROVER_TESTS=1 PRIVACY_CIRCUIT_TESTS=1 \
node --test --test-concurrency=1 privacy/test/disclosure-proof.test.mjs privacy/test/prover-integration.test.mjs privacy/test/prover-verification.test.mjs privacy/test/transition-circuit.test.mjs
```

Preparation uses the locked local compiler, verifies the exact compiled output
hashes, and combines the downloaded public keys with committed test proofs. It
does not generate a setup, read trustee shares or accept an existing output
directory. A failed preparation leaves its output for diagnosis; use a different
fresh directory after fixing the cause. The workflow runs these suites separately
from ordinary unit tests, together with the private browser journal checks.
Fresh local preparation and all 47 checks passed on 27 September 2026. This
reproduces development artifacts and proofs, not an independent setup ceremony.

The v2 JS modules use the root MIT license except where their dependency or
composition requires otherwise. Circuit composition is GPL-3.0-or-later; see
[LICENSE-CIRCUITS](LICENSE-CIRCUITS) and [DEPENDENCIES.md](DEPENDENCIES.md).

## Historical v1 parser API: remains permanently closed

The older `src/index.mjs` API below implements **structural validation and
canonical serialization only**. Its recognized v1 suite remains permanently
closed. The new v2 implementation does not relabel v1 parsing as proof acceptance.

The parser-only checkpoint has a narrower scope than v2. Use
[PROTOCOL_V2.md](PROTOCOL_V2.md) for the current private-instrument format;
its circuits and cryptographic dependencies are separate from this legacy API.

## Public API

Import from `privacy/src/index.mjs`:

- `parseStatement(value, context)` → deeply frozen `{ kind: 'ParsedStatement', value }`.
- `encodeStatement(value, context)` → canonical `Uint8Array`.
- `decodeStatement(bytes, context)` → `ParsedStatement`; rejects trailing/truncated bytes.
- `parseDisclosureRequest(value, context)` → deeply frozen `{ kind: 'UnverifiedDisclosureRequest', value }`.
- `installedSuites()` → frozen empty array.
- `activatePrivateTransfers(...)` → always throws `PrivacyUnavailableError`, code `NO_INSTALLED_VERIFIER`.
- `verifyPrivateProof(...)` → always rejects with the same error. There is no installer or caller-provided verifier hook. Manifests and environment flags cannot enable it.

Data validation failures throw `PrivacyValidationError` with a code and fixed field path, excluding supplied values. Object schemas accept only plain own-data objects and dense arrays. Unknown keys, non-enumerable properties, symbols, accessors and custom prototypes are rejected. Inputs are copied; mutating the original object cannot widen a parsed result. These are in-process value APIs, not a JavaScript sandbox: caller-created Proxy traps and modified runtime intrinsics are outside the data-only trust boundary. They are also not a JSON-text parser: duplicate textual JSON keys must be rejected by a future transport parser before it constructs an object.

## Research statement version 1

The exact fields are:

```js
{
  version: '1',
  suiteId: 'research-groth16-bn254-v1',
  domain: { networkId: '<32-byte hex>', contractId: '<32-byte hex>' },
  epoch: '<uint32 decimal string, nonzero>',
  ledger: { from: '<uint32 decimal string>', until: '<uint32 decimal string>' },
  root: '<canonical BN254 Fr hex>',
  policyRoot: '<canonical BN254 Fr hex>',
  revocationRoot: '<canonical BN254 Fr hex>',
  nullifiers: ['<nonzero canonical Fr hex>'],
  commitments: ['<nonzero canonical Fr hex>'],
  ciphertextDigest: '<nonzero 32-byte hex>',
  bridge: { kind: 'none' },
  fee: { amount: '0', recipient: '<32 zero bytes as hex>' }
}
```

Hex is lowercase, fixed-width, without `0x` or whitespace. Decimal integers are strings with no sign, leading zeros, whitespace, exponent or fractional notation. No values are coerced through JavaScript `Number`. Fr encodings must be strictly below `21888242871839275222246405745257275088548364400416034343698204186575808495617`; there is no modulo reduction.

Each note list has at most two entries and no duplicates within itself. With `bridge.kind='none'`, both have at least one. Deposit has zero nullifiers and at least one commitment. Withdrawal has at least one nullifier and zero to two commitments. This codec represents real notes only, not a circuit's future dummy-note padding. It does not check whether roots exist or notes are unspent.

Deposit/withdrawal bridge objects have exactly `{ kind, assetId, amount, accountId }`. Identifiers are nonzero 32-byte hex, amount is positive uint64. Kind is `deposit` or `withdrawal`; mint is not represented. Fee amount is uint64; zero requires a zero recipient, positive requires a nonzero recipient. This encodes public bridge/fee facts; it does not enforce hidden value conservation or transfer assets.

Statement context is exactly `{ domain, epoch, currentLedger, ciphertextDigest }`. Domain, epoch and digest must match. The caller must derive that context from a trusted chain/policy source and compute the expected digest from the intended canonical ciphertext bytes. Supplying the same attacker-controlled object as both input and context provides no security. This package **compares but does not compute ciphertext digests**, validate accepted roots, authenticate the caller, verify encryption or fetch the ledger.

`currentLedger` must fall inside the inclusive interval, with `until - from <= 120` (up to 121 included ledger heights); all ledger/epoch fields are uint32. This is a prototype bound, not an estimate in seconds. Freshness is checked at parsing time only; future execution must check current state again.

### Exact wire format

All integers use unsigned big-endian fixed width. No JSON key ordering enters the wire.

| Order | Encoding |
|---|---|
| Magic/version | Eight ASCII bytes `AGYPS001` |
| Research suite | One byte `01` |
| Domain | Network ID 32 bytes, contract ID 32 bytes |
| Epoch and interval | Epoch u32, from u32, until u32 |
| Roots | Root, policy root, revocation root: 32 bytes each |
| Nullifiers | Count u8, then count × 32 bytes |
| Commitments | Count u8, then count × 32 bytes |
| Ciphertext | Digest 32 bytes |
| Bridge | Tag u8: 0 none, 1 deposit, 2 withdrawal; for 1/2 append asset 32 bytes, amount u64, account 32 bytes |
| Fee | Amount u64, recipient 32 bytes |

Input byte arrays larger than 1,024 bytes are rejected before copying or decoding. The decoder copies the actual `Uint8Array` view (including Node `Buffer` views), ignoring supplied length, iterator and method overrides. Shared backing buffers, detached views and proxy wrappers are rejected. Unsupported magic/suite/tags/counts, short inputs and extra bytes fail. The 320-byte literal fixture in `test/fixtures.mjs` is hand-specified and independent of the production encoder. No Rust codec or circuit has yet been conformance-tested against this research format; changing it requires a new version/vector.

## Historical v1 one-record disclosure parser

Exact fields: `version`, `domain`, `epoch`, `ledger`, `requestId`, `recordHash`, `ciphertextDigest`, `requesterPublicKey`, `policyDigest`, `purposeDigest`, `fields`, `trusteeIds`.

Version is `'1'`. Domain/epoch/ledger encodings follow the statement. IDs/digests are nonzero 32-byte hex. There is one `recordHash`, no records array or wildcard. `requesterPublicKey` has the 65-byte uncompressed P-256 shape beginning `04`; this parser does **not** prove curve membership, private-key possession or security of that key.

Field groups, in this canonical order, are `asset-amount`, `participants`, `terms-outcome`, `identity-reference`. Requests select a nonempty ordered subset without duplicates. Trustee IDs are canonical nonzero uint16 decimal strings in ascending numeric order, at most 32, without duplicates.

Context has exactly `{ domain, epoch, currentLedger, recordHash, ciphertextDigest, requesterPublicKey, policyDigest, trusteeIds, threshold, allowedFields }`. Expected domain/epoch/record/digest/requester/policy must match. The requested field groups must be a subset of the trusted allowed scope. Selected trustee IDs must belong to the supplied ordered roster and meet its threshold, which is between 2 and the roster size. The request ledger interval includes now and requires `until - from <= 17280` (up to 17,281 included ledger heights).

Context must come from the caller's authenticated policy/authorization processing. This package does not verify those signatures or authorization, does not consume request IDs to prevent repeated processing, and does not establish that trustees control shares or represent independent parties. Re-check current ledger/epoch/policy before any future share release. A parsed request never authorizes disclosure by itself.

## Historical v1 activation remains absent

There is no verifier installed for the legacy parser suite described above. It
remains closed and is not the v2 proof or disclosure implementation. Current v2
uses real circuits, pool verification, signed decision requests, verifiable
threshold replies and durable replay checks. Its remaining independent setup,
trustee custody, legal process and audit requirements are described in the
[disclosure model](../docs/PRIVACY_DISCLOSURE.md). A colluding decryption quorum
can bypass the application policy for records under its epoch.
