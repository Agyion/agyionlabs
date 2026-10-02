# Experimental private pool

Implements the separate testnet profile in `privacy/PROTOCOL_V2.md`. The published
app uses this pool for experimental private instruments. It does not migrate or
hide existing public Agyion balances.

The source now includes an additional backing guard for a new immutable
deployment. The currently pinned app deployment remains the earlier release:
new source does not upgrade its existing notes or custody. The candidate
initializes per asset liabilities, verifies canonical SAC identity through the
host, and rejects deficient backing before deposits, withdrawals or public fees.
Fee-free private transitions conserve hidden value without revealing the asset
or querying every allowed asset. See [issuer control findings](../../docs/TOKEN_ISSUER_RISKS.md)
for the active release limitation and the required compatibility checks.

Actual development Groth16 verifying-key hashes are installed in `src/pins.rs`.
Construction requires those exact 157-input and 4-input keys. Zero pins explicitly
reject construction; there is
no accepting fake verifier, arbitrary-key initializer, admin bypass, key rotation
or upgrade method. The testnet network ID is checked at construction and on
writes. A future mainnet system requires a separate release and review.

`submit` builds all 157 public inputs from typed configuration/transition values,
validates canonical fields, ledger window, accepted input root and current append
root/index, checks durable nullifiers and previously inserted commitments, verifies
the proof, then atomically transfers tokens and records state. Internal fees
expose and bind their token ID. Ciphertext is stored exactly as 134 canonical
32-byte big-endian fields; its SHA256 digest identifies the record. Public bridge
amounts/accounts, fees, roots, nullifiers and ciphertext remain public.

The root history holds 64 entries in instance storage. Spent nullifiers, inserted
commitments and records use persistent storage. They are never deleted by the
contract. `state.record_count` / `state.revocation_count` enumerate durable
`record_id_at(index)` / `revocation_at(index)` entries, allowing a new client to
backfill both trees without relying on short-lived events or an external indexer.
Index entries and counts commit atomically with the transition. An out-of-range
index returns absent; an in-range missing entry returns `ArchiveUnavailable`.
Archived persistent entries must restore or the invocation fails;
expired nullifiers do not become unspent. TTL extends on creation; historical
record restoration has normal network costs. Clients must preserve encrypted
backups and reconstruct append paths from the ordered stored records. A concurrent
append requires a fresh proof; stale submission is never silently resubmitted.

`revoke` requires a fresh key-derived tag, an Ed25519 signature over
`AGYION_REVOKE_V2\0 || domain32 || oldRoot32 || newRoot32 || tag32`, and the
separate 4-input revocation proof. It only updates the current sparse root. The
private circuit preserves Envoy owner recovery after revocation.

The actual 17-step proof chain passes in both native and WASM execution, including
deposit, Pod claim, Trigger attest/refund, Envoy count exhaustion/revocation/owner
recovery, and withdrawals. The initial 27-test checkpoint included proof-bound amount/account/
ciphertext tampering, replay, unauthorized funding and real SAC failure rollback
(both failed deposit and failed fee after an earlier withdrawal). Durable archive
enumeration matches all 16 transition records and the revocation; final public
balances match pool 150 / recipient 845 / fee 5 in test units. Scalar/coordinate,
capacity and independent address-vector tests also pass. The generic preimage key
is never accepted as the pool key.

The pinned-key build and unchanged ABI are recorded in
`artifacts/privacy-v2/pool-build.json`. Full WASM's maximum observed local cost is
89,224,962 CPU / 3,531,897 memory bytes. All 86 host CPU/memory cost-model rows match
the read-only testnet snapshot at ledger 4,881,984, protocol 28; that snapshot permits
400M instructions / 40 MiB memory per transaction. See [the release requirements](RELEASE.md)
for operational gates and resource limits. Subsequent testnet deployment,
simulation and inclusion checks completed 15 transactions covering private Pod,
Trigger and Envoy lifecycles, including withdrawals and a zero final pool XLM
balance. The live run and browser fee measurements are described in [BUDGET.md](BUDGET.md).
Actual archival restoration remains unverified. Neither local proof execution nor
testnet inclusion establishes independent audit, trustee custody or mainnet readiness.

## Reproduction and dependencies

- Soroban Rust SDK 28.0.0, host 28.0.2 (locked); `stellar contract build` for WASM.
- `cargo test --manifest-path contracts/private-pool/Cargo.toml`.
- `--features proof-tests` additionally requires actual pinned public keys and the
  generated 17-step proof chain under `fixtures/verified-v2/{keys,proofs}`.
  `PRIVATE_POOL_ARTIFACTS` can override this for local generation outputs.
  Missing artifacts
  fail these tests; they are never replaced by fake successful verification.
- `--features wasm-tests` also runs the chain against the compiled WASM selected
  by `PRIVATE_POOL_WASM` (default
  `contracts/private-pool/target/wasm32v1-none/release/private_pool.wasm`).
  Build the current source first with
  `stellar contract build --locked --manifest-path contracts/private-pool/Cargo.toml --optimize=false`.
  Historical reporting directories do not select the default code under test.
  Full measured costs are written per step; the native default 100M comparison
  is a local reference, not a claim about current network resource settings.
  Reports go to ignored `artifacts/privacy-v2` (`PRIVATE_POOL_RESULTS` overrides
  that output directory); tests never write reports into committed proof inputs.
- `src/poseidon_t3.bin`: RC 195 then row-major MDS 9, each 32-byte big-endian.
  Extracted from `poseidon-lite` 0.3.0 (MIT), independently compared with
  circomlib 2.0.5 reference and native/WASM outputs. SHA256:
  `d580f0ebf5aec8825a0212c9db8fd20135155e1352e68809e2d7f2bc5440b86f`.
- Existing project Groth16 verifier arithmetic adapted with an additional
  canonical coordinate check before manual G1 negation.
- `address_fixture.json` uses fixed public test identities only, not credentials.

Local profiling of 157 valid curve points in an MSM plus a deliberately failing
four-pair check used 79,721,142 WASM CPU and 2,523,705 memory bytes. That measures the
cryptographic core, not complete successful pool execution or a live fee quote.
No native-hardware performance, production security, independent setup ceremony,
legal authorization or real trustee deployment is claimed.
