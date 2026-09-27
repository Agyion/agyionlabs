# Private pool archival and restoration: isolated ledger evidence

On 2026-09-27, a fresh isolated Protocol 28 ledger exercised the exact guarded private-pool WASM, actual persistent-entry eviction, explicit restoration, liability reads and encrypted-backup recovery. This is local ledger evidence. It does not implement an application restoration workflow, restore the public testnet pool, or constitute an independent security/setup/custody audit.

The ignored evidence directory is `artifacts/security/2026-09-27-compatibility/archive-local-ledger-57c6da2/`. Start with `REPORT.md`, `final-evidence.json`, `independent-verification.json` and `value-comparison-summary.json`. These artifacts are local and are not shipped with this document.

## Exact fixture and boundaries

- Image: `stellar/quickstart@sha256:427069406fbbe2ecd091f75d5a9c1e588ac3108875dec6ab6e0e2ac9f76c311e`.
- Core: `v28.0.1`, commit `947aad8413c189d85504acf72207e85eeda9b021`; RPC: `28.0.1`, commit `273f19e4fcb183b568948bd2b810abfe87150a9c`.
- CLI: `28.0.0`, commit `300aaf69ab100536678bdb641428b06f06b318ea`; XDR: `28.0.0`, commit `d0f1330e43c3a2c0c616da30698b24140d4eea72`. Node `22.23.2`, JS SDK `16.3.0`.
- WASM SHA-256: `4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018`, equal to the guarded release bytecode. The constructor, verifier pins and runtime readers were not weakened.
- Local pool: `CB7TNUV2R5VLGEQJXNGF5TGLLFVYBSFBGWGASGTWBRACRIIIBW6QZZBX`. This is not the public deployment.
- The immutable WASM requires `Test SDF Network ; September 2015`. The fixture used that exact phrase behind an internal Docker network, with no external Stellar peers or gateway and loopback-only access. The publicly derived genesis root was used solely on this isolated ledger. Payer, validator, committee and vault were fresh fixture identities. Native SAC identity is protocol-derived; the second SAC used a fresh issuer.
- No host clock/configuration, production runtime, or ledger storage/TTL rows were edited. No transaction was sent to a public Stellar endpoint.

Core enforces a minimum maximum TTL of 1,054,080 ledgers, and the exact WASM extends its entries to the network maximum. This test therefore used Core's supported `RUN_STANDALONE` / `manualclose?ledgerSeq=...` path, followed by real ledger closes and eviction. This jumps the header sequence; it does not execute a million intervening ledgers. Core's virtual clock advanced during this process. A recorded userspace `LD_PRELOAD` clock offset of 7,185,520 seconds was then applied only to fixture Core/RPC child processes so captive Core could follow the resulting timestamps. The host clock and Core binary were unchanged. This acceleration is part of the test boundary.

## Observed state and inclusion

A real local Groth16 deposit was included at ledger 320, transaction `4d947b94182bacff510c20ff5cf524fda5267f6467795d874ebb021cbbfdc1f7`. At RPC head 327, the existing authenticated readers returned a positive liability of **4,000,000** and a separately stored **0** liability. Encrypted saved-file recovery returned the original note.

At ledger **1,054,628**, the same-snapshot Core `getledgerentryraw` result contained **zero** live rows for the pool instance, code, positive counter and zero counter. `getledgerentry` returned all four original entries as archived with TTL zero. This distinguishes hot-archive eviction from expiry alone.

Protocol 28 simulation of `liability(nativeAsset)` then returned **4,000,000**, without a restore preamble. The complete `getLedgerEntries` responses before and after simulation were identical at the same RPC head, with TTL zero. Both existing readers rejected the archived state with `ARCHIVE_UNAVAILABLE`. Simulation had not restored it.

| Included operation | Ledger | Transaction hash |
| --- | ---: | --- |
| Restore code, instance and five other persistent dependencies | 1,054,669 | `8463e63f176c87abba6b6e1d0a64a3576ebf30054e3529f942c3e157cf9ef086` |
| Extend restored dependency TTLs | 1,054,701 | `8c9d181ae4ddd8619d057e33f32f79a247a3846102cd18953d7491f2ad2fd334` |
| Restore positive counter with the already-live instance in the footprint | 1,054,727 | `c8f981cae483a49ea84132f56580f954ed20ee4fcc5e4c687a79999687ac9628` |
| Restore zero counter with the already-live instance in the footprint | 1,054,768 | `918936e4ab96cd3ded5ea4edc39e3cf6ba0b982f7ace64ee54c255a5e1f7fad1` |

| Entry | Original modified / live-until, at head 327 | Restored modified | Accepted reader head / live-until | Value |
| --- | --- | ---: | --- | --- |
| Pool instance | 320 / 1,054,372 | 1,054,669 | 1,054,767 to 1,054,768 / 1,064,701; contents and modified ledger unchanged | unchanged |
| Positive counter | 320 / 1,054,372 | 1,054,727 | 1,054,767 / 1,054,854 | 4,000,000 |
| Zero counter | 293 / 1,054,372 | 1,054,768 | 1,054,768 / 1,054,895 | 0 |

The positive and zero counters retained their exact original `LedgerEntryData` bytes. Their SHA-256 values respectively are `466c9f8774919056afcc2165bbb42ebab6a014dd0388372c36bdce2d3ca8a42c` and `326c2bab7fadf1123aa9c441d08807a96d39776bd107050d93b52dfa7a33b7cb`. The unchanged instance data hash is `f7d5752f3ed774fa5392527d3348839b20393a4e97314f3e32cdc5ab3cfd09f1`. These are data-XDR hashes, not WASM hashes or full ledger-entry hashes including modification metadata.

The existing liability reader accepted both cases with counter modification later than instance modification. Restoration can update a counter's metadata without changing its value or an already-live instance; requiring the counter's modification ledger to precede the instance's is invalid.

## Receipt limitation and independent comparisons

During accelerated manual-close catchup, captive RPC hit a transaction-set/last-closed-ledger hash mismatch. The failure and the positive transaction's earlier `NOT_FOUND` observation are retained. No cause is asserted as proven. A fresh RPC database subsequently read the primary Core checkpoint; previous databases were not deleted by the harness.

The positive restore's successful receipt comes from Core's published `TransactionHistoryResultEntry`, not a successful RPC `getTransaction` response. Its transaction-result-set hash was recomputed and matched ledger 1,054,727's header; the header SHA-256 was independently recomputed as `833c8fe8b685fc4c9421c24f16fabde027326a662b0a89ea37a91a29c82eab67`. Fresh RPC readback confirmed the unchanged counter bytes and modification ledger 1,054,727. Positive transaction metadata from the divergent RPC was unavailable. Base restore, TTL extension and zero restore have successful RPC result/metadata records. This is not an SCP inclusion proof or evidence of uninterrupted RPC replay.

The separate offline verifier passed comparisons of **nine persistent entries**, signed-envelope transaction hashes, available result/metadata XDR and the positive Core-history receipt. The full original and recovered pool snapshot matched, including append root, next index 1, record count 1, revocation count 0 and snapshot ID `92c7c3868d18823c1c5a9ea41284012d1b0112984500a9a85a72762b07c09cc1`. The encrypted vault backup restored and authenticated archive recovery returned the same note at index 0.

This closes a bounded local-ledger compatibility test. Automatic discovery, fee review, signing, recovery restart and safe restoration of a user's archived application state remain an open application workflow. Public-network restoration and independent audit/setup/custody claims remain open.
