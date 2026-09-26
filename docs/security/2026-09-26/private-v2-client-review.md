# Private v2 client peer review — 26 September 2026

This bounded pass covered release pins, read-only ledger identity/checkpoints, the public ABI adapter and the IndexedDB submission journal. It is not an external cryptographic audit or an independent review of the entire repository. Exact files, line coverage, SHA-256 hashes and retained evidence are in [the review ledger](private-v2-client-review.json).

## Corrected findings

- **PV2-CLIENT-001 — missing journal reservations.** With the pending base still present, deleted reservation rows allowed a conflicting second attempt. This was reproduced in real Chromium; normal IndexedDB atomicity was not claimed to fail. The owner added a bounded whole-store consistency audit and immutable retry history. Five related fault-injection failures are retained in the before report.
- **PV2-CLIENT-002 — full revocation tag rejected.** Root found that the reader incorrectly limited the Poseidon tag to128 bits. Only its sparse-tree index is128 bits. The owner corrected the field check and used the actual generated revocation record in the regression. The final source/test was peer-reviewed here; the author reported13 focused checks passing.

No additional exploitable identity or journal bypass was identified in this snapshot. That statement does not establish absence of defects.

## Actual browser evidence

The final independent run passed **22/22** checks using real IndexedDB and Web Locks: two-page commit races, overlapping locks, reload recovery, unique nullifier reservations, immutable terminal history, explicit retry races, pending-hash discovery after reload, and missing/corrupt storage. There were no console, page, CSP or external-request failures. The browser is closed.

[Before, expanded: 12/17](private-v2-evidence/journal-before-expanded.json) · [After: 22/22](private-v2-evidence/journal-final.json)

These tests cover two pages and reload, **not** OS power loss, browser-process restart, quota exhaustion, hostile same-origin code or whole-profile rollback. The journal's strict durability request is not a measurement of physical disk flush. Its10000-attempt/60000-reservation bounds fail closed; large-history and real-phone performance remain unmeasured.

The release manifest/roster and configured RPC remain trust boundaries. Canonical ScVal/XDR, matching bytecode/configuration and stable checkpoints do not replace independent consensus verification. No live signing, RPC or transaction submission occurred in this pass. Submission lifecycle source has a separate peer reviewer.
