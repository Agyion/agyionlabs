# Public development verification fixtures

These are actual Groth16 proofs for the current v2 circuits, produced after full
PSE phase1 verification and one local **development** phase2 contribution.
`keys/manifest.json` records exact source/artifact hashes and ceremony provenance.
All chain accounts, secrets and ledger windows are disposable test fixtures.
No private witness, proving key, operator key or real-user data is committed here.

The chain has16 transitions and1 revocation. It covers deposit, Pod creation and
claim, Trigger attestation and refund, Envoy delegated payments/count exhaustion,
revocation and owner reclaim, cash merging, fees and public withdrawal. Expected
final token balances are pool150, recipient845, fee5 from a1000-unit deposit.
These are local test units, not actual funds or network transactions.

Run from the repository root:

```sh
node contracts/private-pool/tools/verify-fixture-provenance.mjs
cargo test --manifest-path contracts/private-pool/Cargo.toml --features proof-tests
```

The WASM tests additionally require a current compiled contract (see the pool
README). They execute these real proofs in the Soroban host and test denied
authority, modified public data, replay and atomic token-transfer rollback.
The fixture-provenance check alone does not verify proof equations.

Regenerating the development ceremony produces different keys; replace the
entire verified fixture set and contract pins together after fresh verification.
Never update hashes to make stale or unverified artifacts appear current.
