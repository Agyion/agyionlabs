# Activation boundary for the experimental private pool

The source implements and locally verifies a separate private-note system.
It does not upgrade the existing Agyion deployment, migrate existing balances,
turn the current public Pod/Trigger/Envoy into private records, or enable
deposits in the published application. Fade remains public.

The verified development keys are useful for repeatable tests. Their public
PSE phase1 was fully checked; the circuit-specific phase2 was contributed by
one local operator. Independent setup security cannot be obtained by running
that operator's script again or labeling local test processes as trustees.

## Facts that a funding release must bind

1. Freeze the exact circuits, dependency locks, reviewed cryptographic profile
   and externally contributed phase2 transcript. Reverify the resulting keys
   against the compiled constraints. New keys require new source pins, WASM,
   full proof tests and a new reviewed release.
2. Select actual independent decryption trustees and a separately authorized
   decision roster. Keep each trustee's secret share in that trustee's custody.
   The legal meaning of an approval is an operational policy, not a property
   that an Ed25519 signature can establish.
3. Derive the intended testnet contract address from the deployer's public
   account and deployment salt before DKG. Authenticate the complete DKG
   transcript and roster for that exact network, contract and epoch. A transcript
   for a synthetic local fixture is not a deployment transcript.
4. Use `tools/prepare-deployment.mjs` to construct the concrete deployment plan.
   It reads a dedicated pre-existing identity directory and emits commands; it
   does not create keys, sign, contact RPC or deploy. The release must fix the
   allowlisted asset contracts and their exact transfer semantics, installed
   code hash, both key hashes, prover hashes, epoch and transcript hash.
5. After deployment, verify the actual code bytes/hash and immutable state from
   the pinned testnet RPC. The client reader requires signed DKG validation and
   exact profile agreement; it does not claim independent SCP verification.
6. Connect the private client to its own application balance and recovery flow.
   Before funding, require a complete encrypted key backup, saving it and
   reselecting/checking the actual file. Keep proving local. Show the public
   deposit/withdrawal/fee facts before signing. Preserve pending transaction
   hashes and reconcile uncertain inclusion without another automatic payment.
7. Exercise the deployed testnet flow, expired-state restoration, interruption,
   recovery on another browser and realistic target devices before activation.
   Independent cryptographic/security review remains required for real funds.

The contract itself rejects mainnet. Changing that restriction is a new release,
not a deployment flag. The current approved Cloudflare frontend is not silently
replaced with an unconfigured private funding path.

## Privacy and usability limits

Public observers can see pool transactions, timing, submitter addresses, roots,
nullifiers, ciphertext sizes and all bridge/fee amounts and accounts. A small
anonymity set, publicly linked deposits and withdrawals, network metadata or
off-chain disclosures can identify activity. ZK does not remove these facts.

The selected M-of-N trustees can open the approved audit field groups without
reconstructing a persistent master key in the implementation. A colluding quorum
can nevertheless cooperate outside the authorization service and decrypt other
records under its epoch. Signed requests and durable replay controls cannot
cryptographically stop that quorum from misusing its own shares.

The disclosed participant fields are pseudonymous authorization identifiers.
They are not verified civil identities. Producing a person's legal identity
requires a separately established, access-controlled off-chain association.
The implementation neither invents that registry nor silently collects it.

On the measured desktop browser, a transition proof took about one minute; the
prover renderer reached about 1.20 GiB high-water RSS. Real phone performance has
not been measured. There is one worker and actual cancellation, but JavaScript
cannot promise physical memory erasure. Every append changes the shared root:
concurrent activity can stale a prepared proof and require explicit preparation
again. This is a material throughput/UX limit, not an automatically retried
wallet operation.

Backup recovery reads and validates the complete ordered archive. The current
100,000-record/revocation bounds reject larger histories rather than truncating
them. Missing/archived state fails closed and may require separately signed
network restoration with its normal fees. Neither an empty response nor a
restored key file establishes a spendable balance by itself.
