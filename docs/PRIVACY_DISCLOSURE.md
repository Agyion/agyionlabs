# Private transactions and authorized disclosure

Status checked 27 September 2026. This document describes the experimental
Stellar testnet implementation and the operational requirements that remain.
It is not a legal opinion, a license, an independent audit or a claim that a
court service is operating.

Agyion's intended privacy model is confidentiality from public observers with
selective disclosure under an authenticated, narrowly scoped process. We use
that description rather than promising complete anonymity or automatic
identification of offenders. The software cannot determine that a crime occurred
or that a person is guilty.

## What can be opened

Every accepted private transition contains separate encrypted audit envelopes.
The circuit binds those ciphertexts to the same transaction whose value,
authority, membership and instrument conditions it proves.

| Field group | Information in the current v2 envelope | What it does not supply |
| --- | --- | --- |
| `audit-assets` | Asset identifier, both input and output values, input commitments, public bridge amount and protocol fee | Legal names or the other audit envelopes |
| `audit-parties` | Spending, refund and agent authority hashes for input and output notes | A person's name, passport, IP address or an automatic mapping to a Stellar wallet |
| `audit-terms` | Instrument types, Pod hash and unlock, Trigger condition and attester, Envoy limits, expiry, revocation tag and bound recipient authority | Proof of a physical handoff, the truth of an external condition or a criminal finding |

A disclosed authority hash is a protocol identifier. Identity attribution needs
separately established evidence, such as an authenticated relationship or a
lawfully obtained provider record. Agyion must not claim to possess identity
records that it does not collect. The present private format has no identity
registry. Disclosure does not reveal spending secrets or grant the trustees a
normal transaction signing capability.

Fade remains public. Private pool deposits, withdrawals, public fee payers and
transaction timing are also visible and may support correlation. Encryption of
note contents does not hide browser or RPC metadata.

## Two separate authorization boundaries

1. **Decision authority.** A configured quorum signs one exact request. It binds
   the network, pool, epoch, policy, purpose digest, accepted record, requested
   field groups, requester encryption key, trustee roster and ledger validity.
   A purpose digest commits to a reference; it does not validate the underlying
   legal document. Human and institutional validation must occur before signing.
2. **Decryption trustees.** A separate threshold supplies verifiable partial
   decryptions only for the requested ciphertext points. Each operator rereads
   the accepted record through its pinned pool reader and consumes a durable
   first-use marker before releasing an encrypted response to the requester.
   The requester verifies the proofs and combines enough distinct shares.

The application code rejects missing approval signatures, altered scope,
expired requests, incorrect record/profile bindings, repeated trustee IDs and
request replay. The POSIX replay adapter preserves consumption across a normal
operator restart and stops on storage errors. It does not protect against the
same OS owner deliberately deleting or rolling back the journal. Secure backup,
separate custody, operational access controls and immutable audit retention are
additional responsibilities.

The operator checks the trusted current ledger again after encrypting its
response, immediately before returning it. Expiry or an unavailable ledger read
at that boundary prevents release and leaves the request consumed. This does
not retract a response already released, impose a deadline on its later network
delivery, or erase shares or plaintext the requester already obtained.

**A colluding decryption quorum can bypass the application approval workflow.**
The epoch decryption shares are mathematically capable of opening other records
under that epoch. They do not know whether an authorization is lawful. Calling
this a cryptographic guarantee of court-only access would be false. Independent
custody, enforceable duties, monitored use and a reviewed key-management design
are necessary to reduce that risk. No operator should hold a full quorum in a
real-user deployment.

## Verified testnet behavior

The deployed development pool is
`CDSK32ISKXRW6PX3ZMCHLUP4URNQSYNNH2GZU7ZSZJFL4FSEFQM25YHT`.
Its committee uses three of five shares, all presently controlled by one local
development operator. The circuit-specific setup is also a development setup.
These facts do not establish institutional independence.

A real accepted Pod creation was used for a live disclosure test:
`a6110ce6da8c4520db2ac7051083bb23a54fa629f6d4ca9e876bb0198fb87e81`.
The record is
`3f1518c454482521450f6961463a445688b7f61793f5914610ecb9e23bd1fd3b`.
Two simulated decision signers authorized only `audit-assets`. Three actual
trustee shares opened its 0.4 test XLM input, 0.1 test XLM Pod and 0.3 test XLM
change. Two shares and duplicate shares were rejected. The asset response could
not open the parties or terms envelopes. Expanded scope, insufficient decision
signatures, expired approval and replay, including replay after an operator
restart, were rejected. Thirteen checks passed.

This verifies a technical path against an accepted ledger record. The decision
signers represented a test policy, not a prosecutor, court or legal custodian.
It does not establish a production disclosure service or a complete evidence
handling process.

## Operational process required before a real-user release

The chosen operating jurisdictions and the roles of the issuer, app operator,
service providers and trustees must be assessed by qualified local counsel.
Moving the company or choosing another chain does not by itself settle the
applicable obligations. The project has not appointed real decision authorities
or independent trustees.

A real disclosure procedure must specify:

* How the requesting authority, jurisdiction, legal basis and authenticity of
  the demand are checked, and how invalid or excessive requests are challenged.
* The exact record and fields needed, purpose, expiry and named recipient.
  There is no wildcard request in the current v2 request format.
* Separation between legal review, technical approval and decryption custody,
  with declared thresholds and conflict-of-interest rules.
* Protected case storage and signed evidence receipts, disclosure logs, access
  review, retention and deletion policies. Case documents and personal identity
  evidence should remain outside public chain storage.
* Recipient key authentication, encrypted delivery and provenance verification.
  A successful decryption does not establish the truth of offchain facts.
* Notification and challenge rights where applicable, lawful confidentiality
  exceptions, cross-border transfer rules and oversight.
* Loss, compromise, trustee departure, unavailability and historical epoch
  retention. The current pool's committee configuration is fixed; safe key
  rotation and migration require a separately reviewed release. Destroyed or
  unavailable quorum material can make historical disclosure impossible.

Do not advertise that merely receiving an email, prosecutor name or court PDF
causes automatic decryption. No public website form should expose trustee shares
or act as an unrestricted decryption endpoint.

## Regulatory research boundary

The EDPB's final blockchain guidelines, adopted 7 July 2026, state that encrypted
personal data remains personal data. They emphasize data minimization, an
appropriate impact assessment and organizational safeguards alongside technical
measures. This means an audit envelope is not by itself GDPR compliance.
[EDPB Guidelines 02/2025](https://www.edpb.europa.eu/documents/guideline/guidelines-022025-on-processing-of-personal-data-through-blockchain_en).

The FATF's July 2026 DeFi report uses a functional, risk-based analysis of control
and roles. A label such as decentralized or noncustodial does not substitute for
that assessment. FATF guidance is not a project-specific national legal ruling.
[FATF DeFi report](https://www.fatf-gafi.org/en/publications/Virtualassets/targeted-report-decentralised-finance-2026.html).

These sources support the design review questions above. They do not determine
Agyion's licensing, AML, sanctions, consumer-protection or data-transfer status
in any particular country. Those assessments remain open.

## Implementation references

* [Protocol format](../privacy/PROTOCOL_V2.md)
* [Threshold construction and limits](../privacy/THRESHOLD_PROTOCOL.md)
* [Request and operator implementation](../privacy/src/authorization.mjs)
* [Durable replay adapter](../privacy/src/operator-store.mjs)
* [Security boundaries](../SECURITY.md)
