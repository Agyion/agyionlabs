# Experimental BabyJub threshold protocol

This is implemented local cryptographic research, separate from the installed
proof-suite registry and the public application. It is not a deployed committee,
an audited threshold-encryption composition, a disclosure authorization service,
or a guarantee of constant-time JavaScript execution.

`src/threshold.mjs` uses pinned MIT-licensed `@noble/curves` 2.4.0 and
`@noble/hashes` 2.4.0. Curve operations come from `babyjubjub.Point`; this module
does not implement its own curve arithmetic. Noble 2.4.0 uses the prime-subgroup
B8 generator matching circomlib, with field modulus equal to BN254 Fr and a
distinct scalar order. The generic noble BabyJub EdDSA wrapper is not used for
signatures: authenticated trustee messages use its ordinary Ed25519 implementation.

References: [pinned BabyJub parameters](https://github.com/paulmillr/noble-curves/blob/2.4.0/src/misc.ts),
[Feldman VSS](https://www.zkdocs.com/docs/zkdocs/protocol-primitives/verifiable-secret-sharing/).
No Avalanche eERC source was incorporated.

## Construction and trust boundaries

The trusted configuration fixes a domain (`networkId`, `contractId`), positive
epoch, unique session ID, threshold 2 through N, and an ordered roster of at most
32 distinct nonzero uint16 trustee IDs with distinct Ed25519 authentication keys.
All integers in the configuration are canonical decimal strings. Authentication
keys, hashes, and point/scalar encodings are fixed-width lowercase hex.

Each dealer independently samples a degree M−1 polynomial over the BabyJub
scalar field with nonzero coefficients, publishes signed B8 coefficient
commitments, and privately delivers a separately signed addressed scalar share
to each trustee. Each recipient verifies the authentication, configuration,
dealer package hash, recipient ID and Feldman equation before summing only its
own N received shares. Signing provides authenticity, **not confidentiality**:
`privateShares` must never accompany `publicPackage` in a public transcript.
An authenticated confidential transport and separate trustee hosts remain
operator requirements; neither is supplied here.

Every dealer must participate. There are no complaint/disqualification rounds.
Any missing or invalid message aborts the ceremony. Aggregate constant and
highest-degree commitments must both be nonidentity, and every aggregate
trustee verification point must be nonidentity. These checks reject a zero key,
degree cancellation and zero trustee shares. Each trustee signs acceptance of
the same canonical configuration, complete signed dealer packages, aggregate
commitments and derived public-share transcript. An epoch is finalized only
after all N roster signatures verify.

All-party acceptance prevents an accepted transcript from silently omitting a
party or mixing signed views. This abort-only protocol does not provide robust
liveness, guaranteed completion against malicious trustees, or unbiased output
under selective abort/restart. It is not a proof of a stronger DKG construction.

For each record, fresh nonzero r produces R = [r]B8 and ECDH point K = [r]Y.
The caller converts K's affine coordinates into the two field elements accepted
by `encryption.mjs`; that module provides the circuit-compatible Poseidon cipher.
This module does not add another payload cipher.

A trustee produces D_i = [s_i]R and a Chaum and Pedersen proof that its discrete log
relative to the transcript-derived public share Y_i is the same. Its challenge
binds the suite, complete epoch transcript hash, domain, epoch, trustee ID,
request ID, record hash, ciphertext digest, authorization digest, R, Y_i, D_i,
B8 and both proof commitments. All external points must be canonical,
nonidentity and in the prime subgroup; scalars are canonical and strictly below
the scalar order. At least M distinct valid partials combine via public Lagrange
coefficients. The combiner adds points; it never reconstructs a master scalar.

The authorization digest must commit to the fully authenticated and authorized
disclosure request, including its requester, policy, allowed fields and validity
window. **A DLEQ proof does not authorize disclosure.** The operator must perform
that independent authorization before calling `createPartialDecryption` with its
private share. These local functions are not a ready-to-expose HTTP endpoint.

## API and wire details

- `parseThresholdConfig(config)` validates and freezes a copied configuration.
- `createDealerPackage(config, id, authSeedHex)` returns `{publicPackage,
  privateShares}`. Only `publicPackage` is public.
- `verifyDealerShare(config, package, share, recipientId)` verifies one addressed
  share and returns true or throws.
- `prepareDkgTranscript(config, packages)` constructs the common public
  transcript from all N ordered packages.
- `deriveTrusteeShare(config, packages, receivedShares, id)` returns that
  trustee's secret share and public-share metadata. It accepts only the N
  shares addressed to this ID in dealer order.
- `acceptDkgTranscript(config, packages, trusteeShare, authSeedHex)` checks local
  share possession and signs the common transcript.
- `finalizeDkgTranscript(config, packages, acceptances)` verifies all N ordered
  acceptances and returns an immutable `ExperimentalDkgEpoch`. It is branded
  within the module instance. On reload, supply the trusted config and saved
  public packages/acceptances to this function again; a parsed JSON object is
  never treated as already verified.
- `encapsulateRecord(epoch)` returns `{ephemeralScalar, ephemeralPublicKey,
  sharedPoint}`. The scalar and shared point are sensitive encryption inputs.
- `createPartialDecryption(epoch, trusteeShare, request)` and
  `verifyPartialDecryption(epoch, request, partial)` produce/check the scoped
  proof. `combinePartialDecryptions(epoch, request, partials)` returns the shared
  point after checking every supplied proof and rejecting duplicate IDs.

The partial request has exactly these fields:

```text
{ domain: {networkId, contractId}, epoch, requestId, recordHash,
  ciphertextDigest, authorizationDigest, ephemeralPublicKey }
```

Points use noble's strict compressed 32-byte Edwards encoding as lowercase hex.
`pointToCoordinates` / `pointFromCoordinates` use `{x,y}` with 32-byte
**big-endian field hex**. `pointToFieldElements` returns `[xBigInt,yBigInt]` for
the Poseidon cipher. Scalar helpers `scalarFromBigInt` and `scalarToBigInt` use
32-byte big-endian scalar hex; they reject zero unless explicitly allowed for a
public proof response or dealer evaluation. No codec silently reduces inputs.
`thresholdParameters` exports the exact field order, scalar order and B8 affine
coordinates, all as big-endian hex.

Message bytes are UTF-8 JSON of `[suite, tag, payload]` with payload fields
recreated in their declared order after exact-field validation. Separate tags
cover the configuration, signed packages, package hashes, signed addressed
shares, transcript hash, acceptances, request hash and DLEQ challenge. Hashes use
SHA-256; the challenge uses SHA-512 reduced in the scalar field. Secrets and
nonces come from `crypto.getRandomValues` with rejection sampling. No optional
test RNG, environment override or master-key reconstruction API is provided.

## Local verification

The tests exercise every 2-of-3 subset and all-three combination, an encrypted
three-field record, VSS failures signed by a malicious dealer, authenticated
aggregate/degree cancellation, transcript disagreement, missing participants,
mixed epochs/requests, forged proofs, invalid scalars, identity/small-order and
mixed-torsion points, and revalidation after public serialization. All trustee
keys and secrets in the tests are synthetic local fixtures.

JavaScript bigint timing, memory lifetime/zeroization, endpoint authorization,
private transport, durable key custody/backup, operator independence, rotation,
deployment and full circuit/contract composition remain separate review and
operational work. The module does not change `installedSuites()` or activate
private transfers.
