# Public kernel security protocol

The active application uses the pinned V3 deployment listed in
[public releases](../../deployments/public-testnet.json). The current source
contains a V4 accounting candidate that requires a fresh deployment with an
immutable allowlist of one to eight existing Stellar Asset Contracts. It has not
replaced the active V3 deployment. The active bindings, record IDs and recovery
remain tied to V3; the current client rejects another version or code hash.
There is no automatic migration or upgrade entry point.

V4 retains the credential layouts below and their network and contract binding.
Its fresh contract address prevents an old authorization from being reused there.
It adds per asset liabilities, backing checks before deposits and payouts,
exact custody balance checks, and rejection of destinations that would strand
funds in the kernel or its asset contract. Missing accounting state is an error,
never a zero balance. See [issuer control findings](../../docs/TOKEN_ISSUER_RISKS.md)
for the active release limitation and the new release requirements.

## Why Pod changed

The V2 preimage commit/reveal scheme is unsafe against delayed submission:
simulation reveals the raw bearer secret before wallet approval. A different
recipient can prepare their own commitment and claim in a later ledger before
the original claim is included. A finite waiting period is not a remedy.

V3 removes the plaintext reveal and both commitment endpoints. A fresh,
unpredictable 32-byte Ed25519 seed remains on the holder's device. The contract
stores `claim_pubkey`. Signatures authorize exact creation terms and the chosen
claim recipient. A copied signature cannot authorize another recipient, Pod,
network, deployment or operation, even after a long submission delay.

## Canonical Pod credentials

Concatenation is exact, with no implicit separator. The action labels include
one trailing NUL. Addresses use **ScVal XDR**, produced by Rust
`Address::to_xdr` / JavaScript `new Address(value).toScVal().toXDR()`.

```
domain(action) = UTF8("agyion:" + action + ":v3\0")
              || SHA256(UTF8(network_passphrase))
              || ScValXDR(kernel_contract_address)

creation = domain("pod-create")
         || ScValXDR(funder) || ScValXDR(asset)
         || amount_i128_BE_16 || unlock_ledger_u32_BE_4 || claim_pubkey_32

claim    = domain("pod-claim") || pod_id_u64_BE_8 || ScValXDR(recipient)
```

`create_pod(funder, asset, amount, unlock_ledger, claim_pubkey, key_proof)`
requires funder account authorization, positive amount, nonzero public key and
a valid Ed25519 signature over `creation` under that key **before** the token
transfer. Proof of possession rejects unusable/mistyped key/proof pairs before
funds are locked. The Soroban host uses strict Ed25519 verification; invalid
signatures/points trap and roll back atomically.

`claim_pod(pod_id, recipient, signature)` requires recipient account
authorization, open state, the unlock ledger and a valid signature over `claim`.
Account authorization uses Soroban `require_auth`; the separate bearer key is
not treated as the recipient account's master signer. Successful payment marks
the Pod opened once. Failed asset payment preserves the Pod and its reserve.

The frontend generates seeds with a CSPRNG, validates the saved 64-hex seed,
produces signatures locally and never passes the seed to the generated SDK,
RPC, transaction journal or URL. It asks the user to save the seed before
funding. Anyone retaining that seed, including the funder, can authorize a
recipient. Key loss has no admin recovery. Never reuse a seed across Pods.

**This is authorization safety, not anonymous money.** Amounts, assets,
funders, recipient wallets and timing are public. ZK plus M-of-N disclosure is
a separate experimental shielded protocol described in
[the private-instrument protocol](../../privacy/PROTOCOL_V2.md).

## Other signed credentials

Fade, Trigger and existing public Envoy keep their V2 domain tags and layouts:

```
v2domain(action) = UTF8("agyion:" + action + ":v2\0")
                 || network_hash_32 || ScValXDR(kernel_contract_address)
handoff = v2domain("handoff") || fade_id_u64_BE || ScValXDR(claimant) || ts_u64_BE
attest  = v2domain("attest") || trigger_id_u64_BE || ScValXDR(beneficiary) || ts_u64_BE
envoy   = v2domain("envoy") || mandate_id_u64_BE || fade_id_u64_BE || ts_u64_BE
```

These credentials still cannot cross deployments, networks or actions. `ts` is
signed metadata, not an independently enforced expiration. The contract state,
ledger deadline and handoff window bound validity. Trigger currently trusts
**one attester**. Public Envoy only claims nonpositive-price Fade listings for
the fixed owner, at most 50 claims; its monetary caps do not authorize spending.
Neither attestation nor disclosure M-of-N is implemented in this kernel.

Positive-price Fade handoff explicitly requires the claimant's authorization at
the root `confirm_handoff` call before its nested token transfer. This makes the
authorization tree compatible with the RPC's default recording mode and binds
the claimant's approval to this exact handoff. The venue signature alone cannot
spend claimant funds. Negative/zero-price handoff and Envoy settlement do not add
claimant authorization. The earlier V3 artifact omitted the root requirement;
deploy the reviewed replacement bytes, not only any contract returning version 3.

Trigger creation rejects the kernel's own address as beneficiary, before the
token deposit or record allocation. A self-transfer would otherwise leave the
reserve in the kernel while marking the escrow executed, with no later withdrawal
path. This check uses the existing `InvalidInput` error and leaves the V3 ABI
unchanged. It does not repair existing records or deploy the revised code.

## Arithmetic, assets and storage

Fade uses an I256 intermediate for rational price decline. Creation rejects
unrepresentable settlement/refund horizons. Persistent records and instance
state extend TTL on executed reads/writes; simulations do not persist TTL.
Long locks require submitted maintenance or Soroban restoration. Archived
state is not permission to reset counters or forget obligations.

The active V3 contract accepts token addresses implementing the expected
interface. The V4 constructor instead checks the host's built-in Stellar Asset
executable type and fixes a bounded allowlist. Metadata returned by a custom
token cannot satisfy that host check. Authentic SAC identity does not remove an
issuer's freeze or clawback powers. The standalone ZK preimage verifier is not
used to authorize any kernel payment.

## Local verification

```
cargo test --manifest-path contracts/agyion/Cargo.toml --locked
stellar contract build --manifest-path contracts/agyion/Cargo.toml --locked
cargo test --manifest-path contracts/agyion/Cargo.toml --locked --features wasm-tests
```

`fixtures/pod-v3.json` is a public, deterministic cross-language test vector,
never a usable funded credential. The suite covers recipient substitution after
delay, wrong key/proof, altered funding terms, network/deployment/Pod/action
binding, account authorization, repeated claims and failed asset settlement.
Native and compiled-WASM destination regressions also require a rejected Trigger
to preserve the funder's balance and next ID, followed by a normal successful
attested payment.
Passing local tests does not certify absence of bugs, audited cryptography,
target-network compatibility or migration of already deployed funds.
