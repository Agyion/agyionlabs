# Current limitations

These are source and operational boundaries. [Kernel V3](../contracts/agyion/SECURITY_PROTOCOL.md) requires a compatible deployment; old funds do not migrate through a frontend update. Source checks alone do not establish the state of a live deployment. See the [security policy](../SECURITY.md).

## 1. Public application data and the separate experimental pool

In the retained public payment contract, amounts, assets, funders, recipients and timing are public. Generic instrument labels do not make accounts anonymous. Fade remains public by product decision. Public Pod V3 removes raw-secret disclosure from the claim path; it does not hide payment data. The separate private pool is now integrated into the testnet app for Pod, Trigger and Envoy. Its deposits, withdrawals, fee payer and timing remain observable.

The independent zk-preimage module proves only knowledge of a Poseidon preimage under a pinned demo verification key. It does not bind Pod, recipient, network, contract or a spent nullifier and authorizes no kernel payment. Local fixtures do not establish setup provenance, a production ceremony, an audit or target-network costs.

The legacy privacy v1 parser has an empty installed-verifier registry and rejects proof acceptance. The separate experimental v2 package implements circuits, encryption and threshold disclosure; it does not make public application records private. Independent setup and trustee custody remain production release gates. A colluding threshold quorum may decrypt other records under its epoch key; request-scope validation cannot make that impossible. See [PROTOCOL_V2](../privacy/PROTOCOL_V2.md) and the [private-pool release requirements](../contracts/private-pool/RELEASE.md).

## 2. Attesters are trusted keys, not verified real-world facts

Fade handoff and Trigger attestation use Ed25519 signatures. The demo generates local venue/attester keys; it has no independent attester network, M-of-N attestation, dispute adjudicator or implemented compliance freeze. The contract checks authorization, not whether food was delivered or a real-world condition occurred. A compromised/colluding signer can make a false assertion.

## 3. Credential custody and Pod recovery

In the retained public Pod flow, new seeds use browser randomness, are not persisted by the flow, and sign locally. The user must save the seed before funding. Leaving the public Pod panel or changing wallet session clears UI-held seeds. This does not guarantee memory erasure or cancel an operation already handed to the transaction client. Anyone retaining the seed, including the creator, can authorize a recipient after unlock. **There is no public Pod refund, rotation or admin key recovery.** Private instruments use a separately scoped encrypted vault and require an actual saved backup to be checked before funding. Losing the private vault credentials can still make funds inaccessible; threshold disclosure does not recover spending keys.

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
