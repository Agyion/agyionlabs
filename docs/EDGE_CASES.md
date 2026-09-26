# Edge Cases & Real-World Contact Points

Status corrected 2026-09-26. This register separates present behavior from proposed protocol rules. It does not establish legal compliance. The current ZK module and proposed private system are documented in the [source review](security/2026-09-26/zk-eerc-review.md) and [private instrument design](security/2026-09-26/private-instruments-design.md).

## EC-1 — Physical redemption and public Fade

**Product decision:** Fade remains public. A physical counterparty may recognize the user independently of the ledger. No ZK anonymity is promised for Fade. Private Pod, Trigger and Envoy are a separate proposed subsystem, not a property of current HAK records.

## EC-2 — Disputes, deadlines and actual authority

**Current:** Trigger pays its recorded beneficiary on one configured attester's valid signature before the deadline; afterwards anyone may submit a refund to the recorded funder. A transaction still needs submission and a fee; expiry alone moves no funds. This does not prove that the attester's real-world assertion is true.

**Proposed:** Loxias M-of-N attestation, an evidence window and mutual-consent resolution. These are not implemented merely because they were named in this register. Any additional outcome branch must be committed at funding and preserve one shared spend state across payout/refund/dispute paths. A disclosure committee cannot acquire spending power by opening evidence.

## EC-3 — Attribution without unnecessary public identity

**Current limit:** A muxed address or memo does not conceal public amounts, addresses or transaction links. An encrypted memo alone does not produce an anonymous payment.

**Proposed:** Keep civil-identity records with their authorized provider and use narrowly scoped credentials or encrypted references when required. A proof of a credential establishes its defined statement; it does not independently validate a person's real-world identity or satisfy an unspecified legal requirement.

## EC-4 — Agent authority and privacy

**Current:** An Envoy mandate records an owner address and agent key, and claims public Fade listings for that owner. It is traceable and limited to nonpositive-price claims, count and expiry; it does not confer arbitrary spending authority.

**Proposed:** A separate private capability can operate inside a shielded pool. Its limits, recipients and revocation must be enforced cryptographically. Using it to interact with public Fade crosses a public boundary; it cannot preserve the same counterparty privacy there.

## EC-5 — Offline preparation is not final settlement

An offline artifact does not establish that funds remain unspent. Final acceptance depends on current chain state and transaction inclusion. A future private system needs durable nullifiers and atomic transitions; multi-hop offline money and guaranteed offline double-spend prevention are not present capabilities. No legal eligibility is inferred from a fixed denomination or a proof file.

## EC-6 — Anonymous internal transfers and scoped opening

**Current:** The standalone preimage verifier does not hide Pod amounts/addresses and is not integrated into its claim path. The proposed public claim-key safety repair also does not provide anonymity. Public deposits and withdrawals remain observable even if a future internal pool transfer is private.

**Proposed:** A shared shielded note pool with locally generated proofs and M-of-N selective disclosure. Trustees should issue verifiable, per-ciphertext partial decryptions without reconstructing a global private key. The request must identify records, field scope, requester and authorization policy. Decryption does not permit spending.

**Trust limit:** Fewer than M trustees should not decrypt; a colluding quorum can potentially decrypt all records under an epoch key it controls. Shamir-splitting a key or adding multisig does not make bulk opening cryptographically impossible. Request policy is enforced by the committee and its operational controls; software does not autonomously establish the legal validity of a court order. No production committee, ceremony or private-asset migration is deployed by this design.
