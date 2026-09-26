# Research fixes — implementation and evidence

Derived from docs/research/2026-09-25-crypto-design. User authorized continuing fixes on 2026-09-25. Local work only, preserving the existing dirty tree.

1. Reproduce draft loss, Fade recovery/key rotation, Ramp quote races, and Envoy runner/scope bugs with focused tests.
2. Preserve visited instrument drafts in memory, clear on established account changes, show help in place, and recover records from history links.
3. Persist only public transaction recovery metadata before broadcast, reconcile hashes read-only, distinguish protocol incompatibility from RPC unavailability, block unsafe retries.
4. Correct quotes and effective Envoy authority. Stop local runner on instrument close/switch.
5. Make Pod a working vertical slice: independent landing conditions, continuous existing launch, readable app surfaces, actual claim readiness instead of invented depth/progress.
6. Run targeted and full tests/builds, then browser desktop/mobile/keyboard and journey checks. Inspect rendered images and record limitations separately from passing checks.

Not a claim of complete security audit, mainnet readiness, native GPU performance, or live deployment.
