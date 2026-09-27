# Edge Cases & Real-World Contact Points

This register separates public application behavior from experimental private protocol rules. It does not establish legal compliance. See the [security policy](../SECURITY.md) and [private protocol](../privacy/PROTOCOL_V2.md) for current boundaries.

## EC-1: Physical redemption and public Fade

**Product decision:** Fade remains public. A physical counterparty may recognize the user independently of the ledger. No ZK anonymity is promised for Fade. Private Pod, Trigger and Envoy use a separate experimental testnet pool; earlier public Agyion records keep their original rules and visibility.

The separate marketplace needs a merchant signature and the named collector's wallet approval for settlement. Signed public metadata does not establish that a shop exists or that an item was delivered. Ten simultaneous requests do not acquire ten rights: the first valid included transition wins. A click timestamp or connection speed is not a fairness guarantee. The merchant controls admission; one active reservation per seller and claimant limits an address, not a human with multiple accounts. Expiry requires a submitted cleanup or refund transaction. A no-show receives no reward.

## EC-2: Disputes, deadlines and actual authority

**Original public release:** Trigger pays its recorded beneficiary on one configured attester's valid signature before the deadline; afterwards anyone may submit a refund to the recorded funder. A transaction still needs submission and a fee; expiry alone moves no funds. This does not prove that the attester's real-world assertion is true.

The experimental private Trigger uses its committed claim and refund secrets inside the proof. Its refund is not the original public contract's permissionless refund. Losing the required secret is not repaired by expiry or disclosure authority.

**Proposed:** Loxias M-of-N attestation, an evidence window and mutual-consent resolution. These are not implemented merely because they were named in this register. Any additional outcome branch must be committed at funding and preserve one shared spend state across payout/refund/dispute paths. A disclosure committee cannot acquire spending power by opening evidence.

## EC-3: Attribution without unnecessary public identity

**Current limit:** A muxed address or memo does not conceal public amounts, addresses or transaction links. An encrypted memo alone does not produce an anonymous payment.

**Proposed:** Keep civil-identity records with their authorized provider and use narrowly scoped credentials or encrypted references when required. A proof of a credential establishes its defined statement; it does not independently validate a person's real-world identity or satisfy an unspecified legal requirement.

## EC-4: Agent authority and privacy

**Original public release:** An Envoy mandate records an owner address and agent key, and claims that release's public Fade listings for the owner. It is traceable and limited to nonpositive-price claims, count and expiry; it does not confer arbitrary spending authority or authority over the separate marketplace.

**Experimental private release:** A separate capability operates inside the private pool with constrained claims, owner recovery and revocation. Public marketplace discovery in Envoy grants no payment authority. A future bridge from a private capability into public Fade must explicitly enforce its own recipient, amount and revocation rules; it cannot preserve the same counterparty privacy at a physical pickup.

## EC-5: Offline preparation is not final settlement

An offline artifact does not establish that funds remain unspent. Final acceptance depends on current chain state and transaction inclusion. The private pool checks nullifiers and atomic transitions when submitted; multi-hop offline money and guaranteed offline double-spend prevention are not present capabilities. No legal eligibility is inferred from a fixed denomination or a proof file.

## EC-6: Anonymous internal transfers and scoped opening

**Original public release:** The standalone preimage verifier does not hide Pod amounts/addresses and is not integrated into its public claim path. The public V3 claim-key protocol also does not provide anonymity. Public deposits, withdrawals, fees, timing and submitter accounts remain observable at the private pool boundary.

**Experimental private release:** A shared note pool uses locally generated proofs and threshold disclosure. The development configuration opened an accepted testnet record with three of five locally held trustee shares and rejected insufficient shares and invalid authorization scope. This is a development test, not independent trustee custody. Requests identify records, field scope, requester and authorization policy. Decryption does not permit spending or independently establish a person's civil identity. See [the disclosure boundary](PRIVACY_DISCLOSURE.md).

**Trust limit:** Fewer than M trustees should not decrypt; a colluding quorum can potentially decrypt all records under an epoch key it controls. Shamir-splitting a key or adding multisig does not make bulk opening cryptographically impossible. Request policy is enforced by the committee and its operational controls; software does not autonomously establish the legal validity of a court order. No production committee, ceremony or private-asset migration is deployed by this design.
