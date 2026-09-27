# Application test-source boundary review

Date: 27 September 2026. This review reads the actual test and fixture source;
passing test counts alone are not source-review coverage. The exact files,
inclusive ranges and SHA-256 values are in
[`app-test-source-coverage.json`](app-test-source-coverage.json). It covers the
20 changed/unmatched app test paths requested by the repository inventory, the
standalone artifact test, shared recovery fixture and Vitest configuration,
plus 16 previously unchanged/historical test files now read completely in this
review (1,090 additional lines). Wallet cache and dependency-specific tests
retain their sibling vendor review records.
Inventory totals must deduplicate files also listed in another report.

## What the tests establish

* **Configuration/identity:** real config parsing, Stellar asset derivation and
  exact XDR construction are exercised. Network/ledger responses and the kernel
  version call are fixtures. The new identity fixtures use the installed SDK's
  typed parsed `val` shape, not raw RPC `xdr`. Parent actual-RPC readback remains
  necessary to validate that integration.
* **Wallet/anchor:** envelope and Ed25519 operations use real local SDK crypto
  with generated test identities. Freighter and other wallet transports, TOML,
  anchor HTTP and Horizon submissions are synthetic. The selected-wallet suite
  retains the actual vendor SDK/modal/adapters; its generic three-adapter test
  is separate from the app factory's Freighter-only availability test. A passing
  forwarding test is not evidence that an external wallet reported a trustworthy
  network or that WalletConnect is offered by this app.
* **Recovery:** real SDK envelopes are hashed under the expected network.
  Reconciliation tests challenge wrong/missing envelopes, request-echo hashes,
  missing terminal ledgers and malformed creation IDs. One test retains the
  installed RPC parser to demonstrate that its returned `txHash` can echo the
  request even when raw evidence contains another envelope. Storage/interleaving
  and transport failures are deliberately injected. The Web Locks fixture is
  an in-process model, not proof across real browser processes or devices.
* **Panel state:** actual React components, delayed results and wallet/session
  changes are exercised. Panel crypto, current ledger, client calls and often
  history/anchor helpers are mocked. These tests establish UI validation,
  stale-response handling, secret lifecycle and duplicate-action behavior at
  the given boundary. Their names mentioning testnet do not convert synthetic
  state changes into an on-chain execution result.
* **Readiness diagnostic:** the shell regression retains the real readiness
  hook and status component, including pending resolution and a missing client.
  It proves a stable diagnostic attribute survives a closed panel and an absent
  ready banner. It does not attest RPC responses or activate writes by itself.
* **Flight/input/camera:** actual pose/input/state code is exercised; WebGL
  rendering, compositor drawing, canvas capture or scene handles are replaced
  where needed. Matrix continuity, bounded input, cleanup and malformed saved
  frame tests do not establish shader correctness, real GPU performance,
  decoded-image fidelity or actual mobile gesture behavior.
* **Standalone proof artifacts:** canonical decimal field boundaries, affine
  encoding shapes and exact public-input counts are checked against committed
  artifacts. This is not proof generation, curve-membership verification,
  ceremony security or private instrument integration.

## Corrected assertion gap

The panel cases named “rejects a malformed ID visibly without calling the
client” checked the visible error and released busy state but did not explicitly
assert that the record getter was never called. The cases now name their real
`get_pod` / `get_mandate` spies and assert zero calls. This closes the test's
claim/evidence gap without changing production code or mocking an implementation
detail inside the parser. The strengthened panel suite passes **99 tests**.

## Integration blind spots kept explicit

The client recovery suite replaces assembled transaction/sign-and-send objects
and the generated binding factory. It cannot detect the source-account root
authorization problem that the parent found in actual positive Fade settlement.
The test fixture's manage-data envelope is an identity/hash vehicle, not a real
Fade/Pod transaction. The native/WASM root-authorization regression, generated
ABI parity and actual testnet smoke in the contract/release reports are required
complements. The unit suite must never substitute for those gates.

Some record strings and public keys in component fixtures are intentionally
non-Stellar placeholders because signature/contract validation is outside that
test boundary. Test tokens are provider fixtures, not verifiable JWT signatures.
No loaded user identity, production credential, real wallet connection or real
HTTP submission was found in the reviewed tests. Script evaluation in flight
tests evaluates the fixed owned bridge source; it is not an evaluator for
untrusted network content. The Vitest config discovers all `tests/**/*.test.ts`
and `.tsx` files with automatic mock restoration. No `.only`, `.skip` or `.todo`
case was found in the searched app test source.

The additional complete read covers anchor payment recovery, client confirmation
handling, document first paint, flight path and product exhibit geometry,
ledger clocks/storage, Pod credentials/RPC encoding, pointer aim, protocol
readiness, record recovery controls, domain-separated signing, venue identities
and wallet custody/session hooks. No new reproducible runtime defect or masked
negative test branch was found in these 16 files. Their historical passing
results were not counted as a substitute for this source read.

The Pod wire-payload test keeps real generated bindings and XDR encoding but
stops at a deliberately failing mocked simulation, bypassing protocol readiness;
it proves the tested seed representations are absent from those encoded calls,
not successful chain execution or arbitrary information-flow noninterference.
The credential fixture uses public deterministic test seeds and independent
cross-language expected bytes. Some smaller signing/readiness tests instantiate
the generic SDK without a production deployment pin; the separate factory and
deployment-identity suites establish that the actual public app requires the
pin. A credential-generation test titled “without storing it” checks fresh
outputs and their shape; storage behavior was established by runtime review,
not by a storage spy in that specific test. These limits do not justify
silently broadening their evidence into custody or anonymity guarantees.

## Verification

The final application run before the two getter assertions passed **656 tests
across 39 files**; TypeScript passed. After the test-only strengthening, the
targeted panels run passed **99 tests**. Counts are checkpoints, not additive
test totals. Logs are retained under
`artifacts/security/2026-09-27-compatibility/client/` as
`app-tests-final-readiness.log`, `typecheck-final-readiness.log` and
`panels-final-negative-boundary.log`. No production-source change followed the
already verified one-attribute readiness diagnostic fix.

This read found no additional reproducible production exploit in its assigned
scope. It is not exhaustive scenario execution, independent audit, successful
real-wallet/USDC/fiat settlement evidence or a no-exploit guarantee.
