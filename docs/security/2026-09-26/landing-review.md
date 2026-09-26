# Landing, shared scene and supporting helper review

Date: 2026-09-26. Defensive source review of the user-owned repository. No browser,
full build, contract test, deployment, external signing or attack action was run
by this review agent. The coordinated release verification belongs to the parent
task. This report does not certify production or the repository as secure.

## Exact coverage and runtime boundaries

`artifacts/security/2026-09-26/landing/coverage.json` records each path, SHA-256,
line count, reviewed line ranges and runtime classification. It covers 83 current
files / 10,195 lines read in full: all 44 authored landing TS/TSX files, eight
landing configuration/document files, four requested site/deployment scripts,
the standalone ZK helper, ten Next landing components, nine shared scene files,
three supporting route/flight files and four new regression test files. The
deleted signing helper has a separate 74-line pre-removal hash record. A partial
contract reference and three fixture hashes are explicitly separate.

Coverage is **not** a total-repository manual audit. Generated bindings/builds,
dependencies/lockfiles, CSS beyond the relevant flight inspection, media/fonts,
other scripts, other application clients/panels, the new privacy workspace and
proof cryptography were not fully reviewed here. Running existing tests does not
count as manually reviewing their source. Those limits are also in the manifest.

The static import graph is recorded in `import-reachability.json`. From
`landing/src/main.tsx`, 19 authored source files are reachable at runtime, 24 are
dormant and one (`types.ts`) supplies erased types. This is a source import graph,
not a deployed bundle trace. The active routes are `/`, the four instruments,
`/ramp`, `/ledger` and the catch-all (`landing/src/App.tsx:111–119`).

Dormant pages are `About`, `Blog`, `BlogPost`, `Contact`, `Lab`, `Work`,
`WorkDetail` and `instruments-data`. Dormant helpers are `api`, `captcha`, `fluid`,
`scramble`, `smoothScroll` and `url`; ten additional dormant components are named
individually in the graph. They were read despite being unreachable. The ten
`app/app/components/landing` components are imported by the legacy Next root
`app/app/page.tsx`, but assembly copies the Vite root and only the Next `/app`
directory; that legacy page is not the assembled production landing. `app/lib/zk`
has no production code importer. No new ZK or privacy UI was introduced.

## Confirmed defects and changes

| ID | Evidence and impact | Remediation and regression |
| --- | --- | --- |
| LND-01 | Dormant `landing/src/lib/url.ts` used a textual origin prefix. `https://agyionlabs.dev.evil.test`, userinfo and non-default ports could be misclassified as the owned origin if the helper were reused. No active authorization or redirect bypass was found. | Parse HTTP(S) URLs and compare exact origins; retain absolute-only semantics for `isOwnOriginHref`. Twelve URL cases pass, including suffix/userinfo/port attacks and normalized hostname/default port. Six cases failed before the fix. These predicates classify links; they are not general href sanitizers. |
| LND-02 | Unused `app/lib/venueSigner.ts` signed only listing ID, claimant and timestamp; it omitted action/network/contract binding and falsely described itself as the matching current contract format. It had no code or test importer, so this was a hazardous dormant API, not evidence of an active signing exploit. | Removed the 74-line helper. Original SHA-256: `11965965c649179d06a21118789ab264e0577801cf1605b76c52137754268690`. The sole remaining name reference is a historical contract-test comment. Active domain-bound signer code belongs to the sibling review and was not edited here. |
| LND-03 | Standalone `app/lib/zk.ts` accepted BigInt spellings beyond canonical decimal, did not distinguish scalar and coordinate fields, ignored projective coordinates/point dimensions, and returned HTTP artifact JSON without checking status or its expected circuit shape. This could silently reinterpret malformed input. It does not establish a verifier bypass: the host/contract independently reject invalid inputs. | Canonical unsigned decimal with separate Fr/Fq bounds; exact affine G1/G2 shapes; Groth16/BN254 metadata; one public input and two IC points; successful HTTP status and validated response structure; redirects rejected. Twenty-eight tests pass. Seven shape/projective regressions were individually observed failing on the old implementation after correcting parameterized test inputs. |
| LND-04 | Dormant `landing/src/lib/scramble.ts` deleted its timer bookkeeping when animation ended without clearing the interval, retaining the element and callback. This is a resource cleanup defect, not secret disclosure. | Clear the interval before deleting the entry. Completion and restart tests both failed before the fix and now leave no pending timer. |

The ZK change preserves the committed encoded VK SHA-256
`3966012757c54284dcf07c3b2d02a9c2c2a136d04e470b8bda75f4d3e84a905c`
and the 256-byte proof / 32-byte public input format. These checks validate
encoding, not point membership, subgroup correctness, soundness, ceremony
integrity or privacy. They do not wire the helper into Pod. No private witness is
accepted or sent by this helper; its RPC call sends a proof and public inputs for
read-only simulation. Its configurable artifact base/RPC remains an explicit
caller-supplied trust boundary, with no production caller in this source graph.

The separate first-paint protection in `app/app/layout.tsx` and
`landing/index.html` uses the existing dark canvas color and early color-scheme
metadata. See `flight-flash.md` for the recording and DOM evidence. The production
recording did **not** reproduce a full white frame; the reported symptom is not
claimed fixed by source review or a DOM test.

## Data, network and lifecycle findings

Landing content comes from authored static configuration/components, not remote
CMS responses. React renders strings as text; no raw-HTML or dynamic-code sink was
found in the 44 authored landing TS/TSX files. Configuration drives some URLs and
CSS properties; `validateConfig` is useful consistency checking, not a sanitizer
for a future untrusted CMS. The current authored values did not establish an
injection path. The route hash goes to `getElementById`, not parsed markup.

Launch interception parses the destination and requires the current origin plus
the exact `/app` path (`OrbitalScene.tsx:132–168`). Modifier clicks, downloads and
other targets keep their usual behavior. Custom exhibit events validate IDs or
booleans. The active landing has no wallet signing, RPC submission, fiat payment
or message delivery operation. Its explicit fetch is `/app-assets.json`; normal
asset loads, app prefetches and user-clicked static links are separate browser
requests. The warmer validates schema, an immutable asset-path allowlist, type,
same origin, traversal segments, duplicates and the 48-entry limit. It requests
prefetch links, never executes Next scripts or applies app styles to the landing.

The unreachable `Contact.tsx:45–60` is a local demo timeout, not a delivered
contact message. Its arithmetic captcha is client-side UI, not server-side bot
protection. The unreachable blog API returns static configuration and a local
error flag. No real form backend should be inferred from their names or success
copy. Landing local storage holds the 404 game's score or the dormant blog error
flag, not signing keys.

The shared renderer constructs textures, geometry and shaders locally. Pointer
input updates camera targets and fixed module IDs. It does not send credentials
or network messages. Normal disposal stops frame/timer work, disconnects
observers/listeners, releases input capture and disposes geometry/materials,
render targets and the renderer. The legacy Next landing uses authored demo
values and cleans up its intervals, observers and motion controls; its ticker is
an illustration, not fetched ledger data.

Flight persistence contains a pose, freshness/pairing markers, a renderer hint
and an optional canvas snapshot. Readers enforce age, numeric bounds, serialized length
and PNG/WebP data-URL syntax. The head script is a fixed authored constant;
storage data is assigned to an image URL only after validation, never interpolated
into HTML or script. The image cannot add an external request or an SVG script.
The bridge uses a timeout and pointer-events none; storage failure is optional.
No additional confirmed security issue was found in these scene/landing paths.
This review does not prove every exceptional GPU initialization path leak-free.

## Assembly and operator scripts

`assemble-site.mjs` deletes only its fixed generated output, copies the Vite
landing and the specified Next output, produces six explicit landing documents,
validates warmup files and hashes inline scripts from trusted generated HTML.
The generated policy denies object embedding, external form actions and framing;
script execution uses self plus hashes, without script `unsafe-inline` or eval.
Styles permit inline values, and image/connect/frame HTTPS destinations remain
broad. This is a policy limitation to retain in the threat model, not a demonstrated
exfiltration route. Build inputs and local output directories are trusted.

`app-asset-manifest.mjs` requires all three intended entry sets, applies the
immutable JS/CSS grammar and traversal check, deduplicates and caps the set.
`preview-site.mjs` binds to loopback, supports GET/HEAD, contains decoded paths
lexically under its configured output directory, returns explicit 404s and reads
the generated headers. It is a local preview over a trusted artifact tree, not
a production-server security model or a symlink-resistant file sandbox.

`deploy_testnet.sh` defaults to plan mode; it pins official testnet RPC/passphrase,
validates identity aliases, clears inherited signer/provider overrides, runs
locked local validation before execution, creates/funds only its dedicated
default identity if absent, preserves contract aliases and checks protocol v3 by
read-only simulation before printing configuration. The execution mode really
can create/fund an identity and deploy a contract; this review did not execute
it. It does not issue assets, add trustlines or transfer user assets. Public
configuration output is not a secret-key export.

## Verification record

- Scoped app flight/backdrop/ZK run: **112/112** across five files at 04:41:58
  local time (`scoped-app-unit-final.txt`).
- Full landing unit run: **70/70** across eight files; landing TypeScript check
  passed (`landing-unit-final.txt`, `landing-typecheck-final.txt`).
- Concurrent whole-app run at 04:40:59: **416/418**, with two failures in newly
  changing recovery tests outside this agent's files (stale v2 copy expectation
  and an old storage-key assertion). Whole-app TypeScript likewise reported two
  untyped `this` uses in `transaction-recovery.test.ts`. The owners were notified;
  these captured logs are a snapshot, not a final release pass.
- Full builds, final whole-app checks, browser navigation/slow CSS, visuals and
  production deployment are deferred to the parent task. No release success is
  claimed here.
