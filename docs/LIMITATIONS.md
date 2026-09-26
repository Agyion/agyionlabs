# Current limitations — 26 September 2026

This describes the current **local source**, not an upgrade of historical deployments. The [release record](verification/2026-09-26-cloudflare-release.md) identifies the earlier published frontend; [kernel V3](../contracts/hak/SECURITY_PROTOCOL.md) requires a fresh deployment. Old funds do not migrate automatically. This review used local files, not a live provider/network check.

## 1. Public chain data; no private-instrument protocol

Amounts, assets, funders, recipients and timing are public. Generic instrument labels do not make accounts anonymous. Fade remains public by product decision. Current Pod V3 removes raw-secret disclosure from the claim path; it does not hide payment data.

The independent zk-preimage module proves only knowledge of a Poseidon preimage under a pinned demo verification key. It does not bind Pod, recipient, network, contract or a spent nullifier and authorizes no kernel payment. Local fixtures do not establish setup provenance, a production ceremony, an audit or target-network costs.

The isolated privacy package validates research data shapes and canonical bytes. Its installed-verifier registry is empty and all proof acceptance/activation fails closed. Shielded assets, encryption, DKG, verifiable decryption shares and M-of-N disclosure remain proposed work. A colluding threshold quorum may decrypt other records under its epoch key; a request-scope validator cannot make that impossible. See the [design](security/2026-09-26/private-instruments-design.md) and [ZK review](security/2026-09-26/zk-eerc-review.md).

## 2. Attesters are trusted keys, not verified real-world facts

Fade handoff and Trigger attestation use Ed25519 signatures. The demo generates local venue/attester keys; it has no independent attester network, M-of-N attestation, dispute adjudicator or implemented compliance freeze. The contract checks authorization, not whether food was delivered or a real-world condition occurred. A compromised/colluding signer can make a false assertion.

## 3. Credential custody and Pod recovery

New Pod seeds use browser randomness, are not persisted by the current flow, and sign locally. The user must save the seed before funding. Leaving the Pod panel or changing wallet session clears UI-held seeds. This does not guarantee memory erasure or cancel an operation already handed to the transaction client. Anyone retaining the seed, including the creator, can authorize a recipient after unlock. **There is no Pod refund, rotation or admin key recovery.**

Test-wallet signer keys are memory-only and testnet-restricted. Other demo credentials differ: Trigger/Envoy and saved venue identities use sessionStorage. Trigger's password-style input masks its appearance; it does not encrypt the value or storage. Same-origin scripts and a compromised page can access these secrets. Do not delete existing keys silently: active records may still depend on them. Explicit backup and migration remain necessary.

## 4. Claim limits are not identity or sybil protection

A Fade record permits one successful claim transition; a mandate allows at most 50 successful Envoy claims. There is no identity-level uniqueness or shared quota across accounts or newly created mandates. These bounds must not be described as protection against an attacker controlling many identities.

## 5. Envoy's actual authority

Public Envoy only claims Fade records priced **zero or below**, for the recorded owner, before expiry and confirmed revocation. Positive-price purchases are rejected. Its monetary cap fields are checked but do not grant spending authority or measure a worst-case debit: allowed claims add zero to daily_used. The active quantity bound is 50 claims per mandate.

The runner is a local interval while Envoy is open; leaving stops new local attempts, not the on-chain mandate. Revocation needs an owner-authorized confirmed transaction and does not reverse an existing Fade claim. No hosted AI runner or positive-price delegated purchase service is included.

## 6. No offline settlement or automatic execution

Local preparation/signing does not reserve funds or provide offline finality. Current UI actions use a ledger/RPC connection; no complete offline or multi-hop transfer protocol is established. Transactions must be submitted and confirmed. A deadline alone does not transfer assets.

Fade and Trigger provide particular refund paths; Pod does not. No keeper submits maintenance, settlements or refunds automatically. Proof Packs are editable local history plus a checksum; a signature is optional and currently available only through a test-secret signer. A checksum or local signature is not proof of on-chain settlement or legal evidentiary sufficiency.

## 7. Anchor sandbox and external dependencies

The configured TR mock anchor integration uses SEP-6/10/12/38 against test assets. The bank leg is simulated; no real TRY or FAST/EFT movement is established. The app does not operate that provider. Supported assets, fees and availability must come from current provider responses; a historical fee is not a guaranteed quote. The SEP-24 anchor/assets.yaml is an unprovisioned self-host example with public placeholder accounts, not a running fallback.

PII submitted to the anchor stays outside kernel records, but the anchor can correlate its own customer/rail records with public wallet activity. There is no verified production licensing or universal 72-hour legal rule implemented here.

## 8. Contract and deployment limits

- Persistent records and instance state extend TTL on **executed** reads/writes. RPC simulations do not persist extensions. Long locks need submitted maintenance or Soroban restoration; no app restore/keeper flow exists.
- Invalid Ed25519 signatures/points can trap the host call; rejection is atomic rather than always a contract error code.
- Fade/Trigger/Envoy sign ts as metadata, but the kernel does not enforce timestamp freshness. State, ledger deadlines and handoff windows bound acceptance. Pod V3 uses a recipient/domain-bound claim signature without a timestamp.
- First valid competing transition wins. Retaining a bearer key means retaining claim authority; the UI cannot enforce physical uniqueness of a printed secret.
- Token-interface compatibility does not certify backing, transfer behavior, freeze or clawback policy. No-admin kernel logic cannot override asset-issuer restrictions.
- Testnet resets can erase demo state. A reset does not authorize redeployment; use the deployment helper's default read-only plan and separately authorize external changes.

Passing tests reduces known defects; it is not an exhaustive security audit, a no-bug guarantee or proof that the current source is deployed.
