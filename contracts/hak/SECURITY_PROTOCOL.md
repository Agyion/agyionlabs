# Kernel security protocol v2

This local revision adds `protocol_version() == 2`. It supersedes the raw
signature layouts and single-step Pod opening in the historical `SPEC_V2.md`.
It has not been deployed. Existing deployed kernels do not gain these fixes;
clients must refuse v2 operations on a kernel without this version method.
A new deployment and explicit client configuration are required. Old signatures
must be reissued for the new deployment. Existing locked funds remain governed
by the old contract; there is no automatic migration or upgrade entry point.

## Signed credentials

All bytes below are concatenated without separators beyond the explicit NUL
byte at the end of each action tag. Integers are unsigned 64-bit big-endian.
Address encoding is **ScVal XDR**, produced by Rust `Address::to_xdr` and
JavaScript `new Address(value).toScVal().toXDR()`.

```
domain(action) = UTF8("agyion:" + action + ":v2\0")
              || SHA256(UTF8(network_passphrase))
              || ScValXDR(kernel_contract_address)

handoff = domain("handoff") || fade_id || ScValXDR(claimant) || ts
attest  = domain("attest")  || trigger_id || ScValXDR(beneficiary) || ts
envoy   = domain("envoy")   || mandate_id || fade_id || ts
```

The existing method arguments are unchanged. The signatures are not wire
compatible with the earlier protocol. `ts` remains signed metadata, not an
expiry timestamp. State, the on-chain ledger deadline and the handoff window
bound validity. Network, contract, and action separation prevent using a
credential under another deployment or another rule. A completed transition
cannot be executed twice.

## Pod commit and reveal

`create_pod` and its SHA-256 key hash are unchanged. `claim_pod` now requires a
prior hidden commitment. Recipient authorization by itself cannot prevent a
pending-transaction observer from copying a revealed bearer preimage and
signing a claim to their own address.

1. Compute the commitment locally, without sending the preimage in this call:

   ```
   SHA256(domain("pod-claim") || pod_id || ScValXDR(recipient) || preimage_bytes)
   ```

2. Submit `commit_pod_claim(pod_id, recipient, commitment)` with recipient auth.
3. Wait until a **later ledger** than the recorded `committed_at` and until the
   Pod's unlock ledger. Then submit the existing
   `claim_pod(pod_id, preimage, recipient)` with recipient auth.

`get_pod_claim_commitment(pod_id, recipient)` returns
`Option<PodClaimCommitment { commitment: BytesN<32>, committed_at: u32 }>`.
No commitment or same-ledger reveal returns `InvalidInput`; a mismatching
preimage or commitment returns `BadSignature`. Replacing a commitment resets
its maturity delay. A successful reveal consumes that recipient's commitment.
A failed reveal or unauthorized replacement cannot consume the legitimate
recipient's intent. Other recipients may commit without reserving or blocking
the Pod.

Use a fresh, high-entropy secret for each Pod. After a reveal the preimage is
public. Reusing it in another Pod, sharing it, or having it compromised before
commitment permits another bearer to prepare a valid claim. Commit/reveal does
not provide secrecy against censorship that indefinitely excludes the honest
reveal. The two transactions also add fees and a ledger of latency.

## Arithmetic and storage

Fade price uses a 256-bit intermediate for the rational decline, so a valid
`i128` numerator times elapsed ledgers is not incorrectly saturated before
division. Payout remains bounded by the recorded pot and floor. Creation rejects
Fade horizons that cannot represent the eventual refund ledger. Trigger rejects
`u32::MAX` deadlines, for which a later refund ledger cannot exist.

Persistent records and instance state extend TTL on executed reads/writes.
The target is 172,800 ledgers (about ten days at five seconds per ledger).
RPC simulations and view calls alone do not persist TTL extensions on-chain.
Long timelocks therefore still require submitted maintenance transactions or
Soroban restoration when archived. Archival is not authorization to reset
counters or discard obligations. This patch does not claim an autonomous
keeper or restore service.

## Local verification

```
cargo test --manifest-path contracts/hak/Cargo.toml
stellar contract build --manifest-path contracts/hak/Cargo.toml
cargo test --manifest-path contracts/hak/Cargo.toml --features wasm-tests
```

The optional WASM test consumes the local build at
`target/wasm32v1-none/release/hak.wasm`. Native tests also cover missing account
authorization, unauthorized attempts to relock pooled funds, reserve isolation,
failed-payment rollback, cross-template/deployment/network signature reuse,
Pod commitment copying and replacement, and settlement/refund boundaries.

The contract accepts token addresses implementing the expected token interface.
This does not establish the behavior, backing, clawback policy, or safety of an
arbitrary asset contract. Local tests use the Stellar Asset Contract. The ZK
verifier remains an independent proof checker and is not connected to Pod claims.
