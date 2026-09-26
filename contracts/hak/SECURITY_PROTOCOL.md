# Kernel security protocol v3

This local revision reports `protocol_version() == 3`. It requires a **new
contract deployment** and regenerated bindings. V1/V2 contracts and funded
records do not acquire these properties through a frontend update. There is no
automatic migration or upgrade entry point. The frontend rejects writes when
the deployed version differs. The production domain still uses the older
configured testnet kernel until a separately verified deployment is selected.

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
a separate proposed shielded protocol described in
[the private-instrument design](../../docs/security/2026-09-26/private-instruments-design.md).

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

## Arithmetic, assets and storage

Fade uses an I256 intermediate for rational price decline. Creation rejects
unrepresentable settlement/refund horizons. Persistent records and instance
state extend TTL on executed reads/writes; simulations do not persist TTL.
Long locks require submitted maintenance or Soroban restoration. Archived
state is not permission to reset counters or forget obligations.

The contract accepts token addresses implementing the expected interface.
This does not certify arbitrary tokens' backing, transfer semantics, freeze or
clawback policies. Tests use the Stellar Asset Contract. The standalone ZK
preimage verifier is not used to authorize any kernel payment.

## Local verification

```
cargo test --manifest-path contracts/hak/Cargo.toml --locked
stellar contract build --manifest-path contracts/hak/Cargo.toml --locked
cargo test --manifest-path contracts/hak/Cargo.toml --locked --features wasm-tests
```

`fixtures/pod-v3.json` is a public, deterministic cross-language test vector,
never a usable funded credential. The suite covers recipient substitution after
delay, wrong key/proof, altered funding terms, network/deployment/Pod/action
binding, account authorization, repeated claims and failed asset settlement.
Passing local tests does not certify absence of bugs, audited cryptography,
target-network compatibility or migration of already deployed funds.
