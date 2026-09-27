# Guarded public kernel preparation

The public V4 kernel adds per-asset aggregate backing checks to public Fade,
Pod and Trigger obligations. Its source and deployment tools are ready for a
separate valueless testnet deployment. The application still selects the
original V3 contract. This document does not claim activation, migration or an
independent audit.

## Fixed deployment boundary

| Field | Reviewed value |
| --- | --- |
| Network | Stellar Testnet |
| Protocol | 4 |
| WASM SHA-256 | `d101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186` |
| WASM bytes | 26,696 |
| Constructor | One ordered vector: native XLM, then Circle testnet USDC |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Circle testnet USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

The [deployment entry point](../scripts/deploy-public-testnet.mjs) defaults to an
offline plan. Funding, uploading code and creating the contract each require a
distinct explicit phase and the reviewed manifest hash. The executor validates
the dedicated source, network, operation, constructor, code, signature and fee
before sending. It saves the signed envelope durably before a single submission.
An uncertain result permits lookup of the original hash, never an automatic
second submission. Existing public and private release pins must remain unchanged
at each new execution phase.

The signed fee ceilings are 20 test XLM for upload and 250 test XLM for creation,
with a combined ceiling of 270 test XLM. These are maximum authorized envelope
fees, not actual charged fees or transferred user funds. Friendbot is limited to
one recorded request for the new dedicated account. No mainnet path is exposed.

The [initial readback](../scripts/lib/public-deployment-readback.mjs) requires one
RPC snapshot containing the exact reviewed code, matching instance, canonical
SAC executables and two live zero liability counters created with the instance.
The structural helper alone does not authenticate code and cannot authorize
activation. Missing entries, expiry, changed configuration, mismatched keys,
duplicate rows and nonzero initial liabilities reject the readback. This check
is scoped to initial state, not later custody or future solvency.

## Client compatibility

The public client keeps V3 as its default. Selecting V4 explicitly requires a
reviewed WASM pin, accounting version 4, a live instance and the exact ordered
supported-asset vector. Unknown, sparse or mismatched configuration fails
before signing.

A recovery-only selection blocks new Fade, Pod, Trigger and mandate creation,
as well as new direct or delegated Fade claims. Existing handoff completion,
refunds, Pod claims, Trigger attestation and mandate revocation remain available.
Handoff completion can transfer an existing payment; recovery-only does not mean
that every transfer is disabled. These are client restrictions and cannot change
the immutable original contract's permissionless entry points.

Retiring a client rejects late wallet responses and subsequent submission. If a
transaction was already broadcast, its original hash remains available for
read-only reconciliation. Retirement does not erase journals or cancel a
transaction already submitted to the network.

## Remaining activation gates

1. Deploy the separate candidate and authenticate its included creation and
   initial state against the fixed plan.
2. Exercise actual V4 public lifecycles with exact custody and liability
   reconciliation. Synthetic readback and client tests do not prove inclusion.
3. Integrate a compiled release catalogue and original-contract recovery across
   links, credentials, pending transactions and receipt scopes.
4. Serialize submissions by source account and network across public releases,
   including pending results and transaction preparation.
5. Publish only after the exact source checks and a frozen website build pass.

## Preparation verification

The complete local workspace run passed 1,415 checks with six default optional
skips. This includes 862 application tests and 161 tooling tests. Type checking
passed; lint retained three existing generation-ref cleanup warnings. The new
client tests cover configuration refusal, recovery restrictions and retired
sessions. Deployment tests cover offline behavior, protected files, exact
constructor binding and malformed readbacks. They do not establish a successful
live deployment.

The exact original V3 and candidate V4 binaries contain the same five credential
purpose tags. Their source domain builder binds the network and contract; the
current TypeScript encoders were checked against the exact prefixes and reject
cross-domain equivalence. This byte and source comparison is distinct from
executing each credential against the new deployed contract.

The original V3 conditional issuer-backing limitation remains at its existing
address. Guarded source does not repair deployed immutable code. Issuer freeze
authority, RPC trust, user-key loss and unavailable archived state remain separate
risks. See [issuer control boundaries](TOKEN_ISSUER_RISKS.md),
[verification](VERIFICATION.md) and [security policy](../SECURITY.md).
