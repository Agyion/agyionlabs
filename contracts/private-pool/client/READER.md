# Pinned testnet archive reader

The private application uses this reader with its pinned testnet release.
Deployment and integration evidence is recorded separately in the
[verification record](../../../docs/VERIFICATION.md). The reader itself makes
only `getNetwork` and `getLedgerEntries` RPC calls. It never simulates, signs,
submits, connects a wallet, or restores archived storage.

`verifyPoolRelease(manifest, signedDkg)` verifies the all-member signed DKG against
the release's pinned roster, raw Testnet/pool domain, disclosure epoch, public
auditor point and transcript hash. It independently computes the contract domain,
asset identifiers, depth-eight asset-policy root and canonical `PoolConfig` XDR.
The returned `PoolRelease` is deeply frozen and branded. Copies cannot stand in
for verified handles. **The caller must obtain the manifest and roster pins from
a trusted release channel**, not from the same RPC being checked. This verifier
does not certify an independent ceremony, audit, or deployed contract.

The manifest is a strict local data object with these fields:

```
schema: 'agyion-private-pool-release-v2'
testOnly: true
networkPassphrase: 'Test SDF Network ; September 2015'
rpcUrl: 'https://soroban-testnet.stellar.org'
protocolVersion: 28
pool: canonical C-address
wasmHash: lowercase 32-byte SHA-256 hex
config: {assets: C-address[], disclosureEpoch: positive u32 number,
         auditor: [bigint, bigint], dkgTranscriptHash: lowercase 32-byte hex}
thresholdConfig: the pinned public threshold configuration
```

`signedDkg` has exactly `{config, packages, acceptances}`. It contains public
packages/signatures only. The offline deployment helper's manifest includes
filesystem/prover/deployment fields; it is a different schema. Release tooling
must derive this browser profile from reviewed deployment/readback pins, rather
than treating any downloaded deployment-plan file as an active release. Auditor
coordinates in this in-memory API are bigint values, not lossy JSON numbers.

`createPoolReader(release, {fetch?})` returns the four recovery methods:

- `readState({signal}?)` returns roots, counts, append index and `snapshotId`.
- `readRecordIdAt(index, {snapshotId, signal?})` reads the persistent index.
- `readRecord(id, {snapshotId, signal?})` reads and validates all157 public fields.
- `readRevocationAt(index, {snapshotId, signal?})` reads the persistent revocation.

Every state read checks the network/protocol, the instance's executable hash,
the SHA-256 of the **actual code bytes**, and exact immutable configuration.
It validates returned ledger keys, storage identity/durability, canonical XDR,
bounded counters, root history and live TTL metadata. Unknown/missing advertised
entries fail with `ARCHIVE_UNAVAILABLE`; they never mean an empty archive or an
unspent note. Restoration is a separate explicit operator/wallet action.

The checkpoint hashes the pinned release and complete instance content. It
excludes the advancing head ledger and TTL, so unrelated chain progress does not
invalidate recovery. Archive reads reject older RPC heads or entries written
after the snapshot. The recovery coordinator must finish with a fresh identical
checkpoint. `readAcceptedPoolRecord(reader, id, options?)` performs this
before/read/after check for an operator's accepted-record callback. Both this
helper and `assertPoolReader(reader, release?)` require the branded real reader.

**RPC trust remains explicit.** HTTPS, matching code/configuration and canonical
records are not Stellar consensus or inclusion proofs. A dishonest pinned RPC
can fabricate internally consistent ledger data. These APIs do not solve that
trust boundary; they prevent accidental scope mixing, malformed data, missing
history, stale checkpoints and hash-label substitution. Injected `fetch` is a
trusted transport/test dependency, never an untrusted plugin.

Tests use actual generated-SDK XDR and a genuine public deposit proof's fields,
plus a locally signed deterministic TEST ONLY DKG. The tiny test WASM byte array
is solely a hash/encoding fixture; it is never executed or accepted as a proof
verifier. No live RPC, wallet, deployment or on-chain restoration is tested here.
