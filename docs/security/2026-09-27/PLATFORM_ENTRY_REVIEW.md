# Static platform and application entry review

Date: 27 September 2026. This supplements the public-client, wallet-vendor,
HAK, privacy and tooling reviews. It is an owned-source inspection, not an
independent audit or an absence-of-exploits guarantee.

## Scope and evidence

Every line of the snapshots listed in
[`platform-entry-coverage.json`](platform-entry-coverage.json) was read:
application entry/layout and shared UI, generated public ABI and standalone
preimage helper, landing entry and navigation/data helpers, flight handoff and
preference storage, static platform/build configuration, package manifests,
deployment helper and the named documentation/test files. Some build files
overlap the tooling review; repository totals must deduplicate paths.

The coverage file records exact SHA-256, line count and inclusive read ranges.
The local `artifacts/security/2026-09-27-compatibility/client/platform-inventory.json`
records the tracked route/workflow inventory and coverage hash. No build, site
assembly, browser, signing or network action was executed by this supplemental
review. A subsequent bounded diagnostic change and its fresh 656-test app suite
are recorded in [PUBLIC_CLIENT_FULL_REVIEW.md](PUBLIC_CLIENT_FULL_REVIEW.md).
Tests were not rerun solely for the documentation edits.

## Platform and network boundaries

* Next uses `output: "export"`; the deployed Worker configuration serves only
  generated static assets. No tracked API route, route handler, middleware,
  server action or Worker request function was found in the application source.
  The landing router lists only the public product routes. Its old blog helper
  returns local configuration data; it is not an HTTP backend. Contact/blog
  pages are not registered in the active router.
* There is no `.github` directory or tracked GitHub workflow in this checkout.
  Local build commands are not evidence of an enforced hosted CI gate. The
  build script runs landing/app checks and builds, then assembles fixed paths;
  it does not run the Rust/private-protocol suites or verify a live deployment.
* The build script does not force Soroban mode despite its descriptive header.
  With no mode, the app deliberately builds a labelled mock. A Soroban build
  without a valid reviewed hash cannot obtain a writable public client. Release
  operators must still verify the intended mode and both pins in the final
  bundle, using the separate [tooling verification](TOOLING_REVIEW.md).
* Public browser wallet integration and test-secret signing enforce Stellar
  testnet; account funding, trustline and anchor-payment operations also reject
  another configured network. The asset code/issuer/network must derive to the
  configured SAC. The generic generated SDK is network-agnostic and does not
  independently impose these application restrictions. Its direct use is not
  a mainnet-ready product or an application-policy bypass exposed to a user.
* Public configuration is compiled into the frontend. Changing an environment
  variable after a static build cannot change the published bundle. Final
  `.env.local`, generated release output, actual chain evidence and publication
  are owned by the parent release task; this review did not inspect secret
  configuration or certify an old generated directory as the new release.

## Input, navigation and artifact boundaries

The inline layout bridge is a fixed source string, not HTML interpolated from
user text. The stored flight frame must be recent, paired with its marker,
bounded to 2 MiB and a PNG/WebP base64 data URI. It is assigned to an image
element's `src`, never inserted as HTML. Invalid/expired storage is ignored;
the bridge has an eight-second removal limit. Pose numbers are finite and
bounded. Flight IDs use `Math.random` only for animation pairing, not key or
authorization material. Preferences are nonsecret booleans.

The app asset warmup accepts at most 48 entries, requires same-origin immutable
Next paths with matching JS/CSS kinds, rejects traversal and treats a malformed
manifest as an optional optimization failure. It prefetches assets without
executing scripts or applying app styles to the landing. The build counterpart
also constrains paths and requires copied assets to exist.

Product links use repository-owned instrument identifiers. Landing config is
compiled trusted content; URL helpers classify links and explicitly do not
sanitize arbitrary hrefs. The validation rules are not a security boundary for
a remote CMS. The demo math captcha runs only in the browser and cannot be
claimed as server anti-abuse protection. No remote config/CMS input was found
feeding these helpers.

The public generated binding has explicit caller-supplied network/contract/RPC
and delegates encoding to the Stellar SDK. The embedded specification is an
opaque generated ABI; the 23-entry semantic parity result against final HAK
WASM belongs to [HAK_FULL_REVIEW.md](HAK_FULL_REVIEW.md), rather than to visual
inspection of base64 strings.

`app/lib/zk.ts` is a standalone read-only preimage verification helper with no
active app/landing caller. It validates canonical field/point encoding, one
public signal and the expected Groth16/BN254 shape before simulation. It does
not prove curve membership itself, generate instrument privacy, authorize a
Pod claim or submit a signed transaction. Its mode flag treats any non-mock
string as enabled, unlike the strict public config parser; because it is unused
and read-only, this is not a public-write bypass. Future integration must align
the mode policy and pin the verifier/network explicitly.

## Header and build trust

Assembly derives hashes from controlled generated inline scripts. CSP denies
JavaScript string evaluation, arbitrary inline JavaScript, objects and framing;
fixed security headers and immutable asset caching are generated alongside the
site. `connect-src https: wss:`, `frame-src https:` and remote HTTPS images remain
broad compatibility allowances. They are not an outbound exfiltration firewall
against already executing same-origin code. Existing same-origin demo secrets
and external wallet/anchor trust retain the limits in the client review.

The build and generated headers assume a trusted checkout, dependencies and
toolchain. Hashing build output does not authenticate malicious build inputs.
The source inspection did not find a new reproducible funds-exposure defect in
this supplemental scope; that is not a claim of exhaustive possible scenarios.

## Documentation corrections

* `app/.env.example` now contains the required Soroban WASM hash field with
  blank safe/mock defaults. Its WalletConnect comment accurately states that
  the app offers only the network-verifiable Freighter adapter.
* The old Turkish wallet guide now has a dated current-status note rather than
  presenting its planned mobile WalletConnect/LOBSTR routes as working support.
* Root quickstart now includes the WASM pin and explicit network passphrase.
  Deployment instructions describe unoptimized exact-byte deployment, uncached
  readback hash verification and V3 validation before configuration is emitted.
  Current contract identity and smoke scope link to the final compatibility
  report; earlier deployment records remain historical.
* The generated binding README now documents the real `Client` export and
  source import boundary. The nonexistent network presets and generic
  postinstall/network-regeneration publishing example were removed.

These documentation/config-template changes were followed by one diagnostic
attribute on the existing AppShell main: `data-protocol-readiness` mirrors the
real readiness hook even when its ready warning banner is absent. There is no
visible layout/text or transaction-permission change. Four new regressions
failed first, then all 18 targeted and all 656 app tests passed; TypeScript also
passed. The root-selector fix and raw logs are detailed in the client review.
Scoped whitespace verification passed. The final compatibility report supplies the actual
deployment and testnet transaction results; this document does not turn the
native-XLM smoke into proof of funded public-USDC, external-wallet or bank flows.
