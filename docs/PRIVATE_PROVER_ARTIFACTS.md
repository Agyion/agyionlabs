# Obtaining the pinned private prover

The application uses six public runtime files: a WASM witness calculator,
Groth16 proving key and verification key for each of the transition and
revocation circuits. They are large generated files and are not committed to Git.
Downloading them does not perform a new setup, create trustee keys or establish
an independent ceremony. The current pins describe a development setup.

The trusted metadata comes from this reviewed checkout:

* `app/app/lib/privateProverAssets.ts` contains the runtime and chunk pins.
* `contracts/private-pool/fixtures/verified-v2/keys/manifest.json` binds the
  reviewed development provenance and complete artifact hashes.
* `privacy/package-lock.json`, circuit source files and
  `contracts/private-pool/src/pins.rs` must still match those pins.

The acquisition tool never downloads replacement trust metadata or executes the
generated TypeScript. It parses only the expected JSON literals, checks local
provenance, verifies each bounded chunk and complete file, and checks each
verification-key digest against the Rust verifier pins.

From the repository root, with Node's built-in fetch support:

```sh
node scripts/fetch-private-prover.mjs --development
node scripts/package-private-prover.mjs --development --acquired-runtime
```

The default mirror is `https://agyionlabs.dev/`. An alternate HTTPS mirror can be
selected explicitly with `--base https://mirror.example/path/`. It must serve the
same `/zk/private/<sha256>.bin` content under that base. Redirects, credentials,
query strings, changed bytes and excessive responses are rejected. Each request
has a bounded timeout. A missing release chunk is an error, not permission to
generate replacement keys or accept another manifest.

The first command stages all six files and a deterministic receipt, verifies
them again, then installs the complete directory with one atomic rename at
`artifacts/private-prover-runtime`. An existing valid cache is reused after full
verification. A detected corrupt or incomplete cache is refused. Files are never
merged into an existing cache. POSIX rename also protects a nonempty directory
created concurrently, but it can replace an empty directory created between the
last existence check and rename. No atomic no-replace guarantee is claimed for
that empty-directory race.
The second command requires explicit acquired-runtime mode and rechecks the
receipt, source provenance, all bytes, chunk boundaries and verifier pins before
emitting browser assets. It does not claim the research R1CS files are present.

The original `package-private-prover.mjs --development` mode remains available
for the full local research artifact directory. That path still checks both
R1CS files, compilation metadata and prover cases. It does not silently fall back
to downloaded runtime artifacts. Build scripts must deliberately choose the
matching mode; calling the acquired command once does not change a package's
prebuild setting.

Tests use temporary repositories with explicitly synthetic WASM/proving-key
payloads and real committed verification-key encodings. They check strict pins,
stream/timeout/redirect limits, atomic installation, corrupt-cache refusal and
the two distinct packaging paths. A separate local HTTP round-trip checked all
152,403,772 bytes of the actual pinned runtime. That local test does not establish
availability at a public mirror; release publication must check it separately.
