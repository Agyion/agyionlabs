# Retained public local verification evidence

These copied reports preserve the original timestamps, source hashes and scope.
`index.json` records each original path and exact SHA256. References inside a
copied original report retain their original artifact-directory meaning.

- `core-check.json` and `core-*.txt`: the final fresh WASM build and all seven
  sequential check steps. Original `.log` bytes are retained with `.txt` names;
  their hashes match the report. Privacy: 131 passed/four skipped; client: 29
  passed/one skipped; tooling: seven passed; native/WASM: 27 passed. TypeScript,
  fixture provenance and strict Rust lints passed.
- `journal-final.json`: 22/22 real Chromium journal checks on the final source,
  including reload discovery of pending attempts. `journal-before-expanded.json`
  preserves the five reproduced corruption failures before the fix.
- `submission-review.json` and `submission-client-tests.tap`: final source hashes,
  actual SDK signing and genuine proof verification with explicitly synthetic
  RPC. The positive lifecycle fixture is an internal Pod creation; no live
  deposit/withdrawal signing is claimed.
- `browser.json`: four actual locally generated proof flows, complete vault
  recovery, note scanning and in-flight worker termination. Eight harness checks
  and 37 page checks passed. No wallet or accepted chain transaction is claimed.
- `actual-node-proofs.tap`: real transition/revocation proof generation and
  altered-statement/point rejection. The parent plus two subtests account for
  the three TAP results.
- `verifier-differential.tap`: both actual verification implementations agree
  on 17 proofs and reject 17 statement plus 17 valid-point mutations.
- `actual-selective-disclosure.tap`: actual locally proved ciphertext, signed
  DKG/decision authorization, independent share checks, encrypted delivery and
  scoped opening. Synthetic accepted-record transport; no live court/committee.
- `compiled-pool.json`: pinned production-format WASM build at its earlier
  24-test checkpoint. Later native/WASM adversarial coverage and client additions
  are recorded by the final local-check report; this original is not relabeled.
- Resource reports compare actual local host invocation costs with a read-only
  testnet snapshot. They do not include live simulation, signing, fees or ledger
  inclusion. Dependency reports are dated advisory scans, not dependency audits.
  `app-dependencies.json` was captured directly in this folder and retains the
  nine open low/moderate advisories; it is not a clean scan.

Proving keys, private witnesses, vault contents, trustee secret shares, operator
credentials and signed live transactions are not included. Committed public
Groth16 proof fixtures and key/source provenance are under
`contracts/private-pool/fixtures/verified-v2/`.
