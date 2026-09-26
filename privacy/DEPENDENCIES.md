# Cryptographic dependencies and provenance

Exact versions are locked in `package-lock.json`; install using `npm ci`.

| Component | Pinned version | Published license | Role |
| --- | --- | --- | --- |
| @noble/curves | 2.4.0 | MIT | BabyJub arithmetic, Ed25519, X25519 |
| @noble/hashes | 2.4.0 | MIT | SHA-256, HKDF, Argon2id |
| poseidon-lite | 0.3.0 | MIT | circomlib-compatible Poseidon(n) |
| @zk-kit/poseidon-cipher | 0.3.2 | MIT | fixed-field Poseidon encryption |
| @zk-kit/eddsa-poseidon | 1.1.0 | MIT | independent test signing reference |
| circomlib | 2.0.5 | GPL-3.0 | circuit hash, curve, signature and range gadgets |
| circom2 | 0.2.23 | GPL-3.0 | WebAssembly distribution of Circom 2.2.3 |
| snarkjs | 0.7.6 | GPL-3.0 | Groth16 setup, proving and verification |

The root MIT notice does not replace third-party terms. The circuit composition
under `circuits/` is GPL-3.0-or-later and its included upstream notices remain.
`LICENSE-CIRCUITS` contains GPLv3 copied from the pinned snarkjs distribution.
The Poseidon encryption circuit specifies the upstream algorithm; it does not
use the upstream decrypt gadget's ambiguous padding branch. Messages are fixed
multiples of three and include the full authentication tag. Source and required
GPL notices must accompany any distribution of the composed prover bundle.

The npm compiler package describes itself as experimental; the locked package
version and reported compiler version are recorded separately. Rebuilding with
another compiler requires new artifact hashes and verification, not silently
reusing the pinned verification key. Setup scripts generate entropy in-process;
neither a local phase1 nor phase2 contribution is an independent ceremony.

`@zk-kit/eddsa-poseidon` has broken Node ESM packaging in this pinned release.
The test fixtures use its working CommonJS entry. Runtime verification uses
the actual EdDSA-Poseidon equation with noble curve validation and the circuit
checks the same equation. There is no accepting signature stub.

Avalanche's [eERC documentation](https://docs.avax.network/integrations/encrypted-erc)
describes confidential amounts with public senders/receivers and a rotatable
auditor. Agyion's v2 note pool is a separate Stellar implementation inspired by
proof-bound encryption, with scoped threshold disclosure. It is not eERC
compatibility and does not inherit an eERC audit.

Neither the custom composition nor Poseidon encryption has an independent audit
covering this system. Public bridge accounts/amounts, submission metadata,
timing, output counts and anonymity-set size remain observable. A colluding
decryption quorum can open other records in its epoch; software authorization
checks cannot cryptographically prevent that quorum from colluding offline.
