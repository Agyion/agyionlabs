# zk-preimage — Groth16 Preimage-Knowledge Verifier (BN254)

A working zero-knowledge proof layer for Agyion: a Soroban contract that
verifies **Groth16 proofs over BN254** for the statement

> *"I know a `preimage` such that `Poseidon(preimage) == hash`"*

using Soroban's native BN254 host functions (CAP-0074 pairing/G1 ops,
CAP-0080 MSM). No curve arithmetic runs in WASM — the heavy math executes
at Stellar Core level.

For the hackathon this ships as an **independent, self-contained proof
module**: its own circuit, its own trusted setup, its own verifier contract,
its own tests. It does not modify `pod.rs` (see *Pod integration roadmap*
below).

## Layout

| Path | What |
|---|---|
| `../../circuits/preimage.circom` | Circom circuit: `Poseidon(preimage) == hash` (circomlib Poseidon, BN254 scalar field) |
| `../../circuits/build/` | Compiled R1CS, witness-gen WASM, ptau, zkey |
| `../../circuits/{vk,proof,public,input}.json` | snarkjs artifacts (sample proof for `preimage = 20260919`) |
| `artifacts/` | Copies of `vk.json`, `proof.json`, `public.json` consumed by tests |
| `src/lib.rs` | `Groth16PreimageVerifier` contract: `init(vk)` + `verify(proof, public_inputs) -> bool` |
| `src/test.rs` | On-chain verification of the real artifacts + rejection tests |
| `wasm/zk_preimage.wasm` | Local build output (generated, not committed) |

## Contract API

```rust
pub fn init(env: Env, vk: VerifyingKey)            // one-time pinned VK registration
pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<Bytes>) -> bool
```

* `proof`: 256 bytes = `pi_a (G1, 64B) || pi_b (G2, 128B) || pi_c (G1, 64B)`.
* `public_inputs`: one 32-byte big-endian BN254 scalar per public signal
  (this circuit has exactly one: `hash`).
* `init` accepts only the exact committed preimage-circuit key, with two IC
  points. Its host-encoded SHA-256 is
  `3966012757c54284dcf07c3b2d02a9c2c2a136d04e470b8bda75f4d3e84a905c`.
  An untrusted first caller cannot install an arbitrary or all-zero key.
* Public field elements must be canonical integers strictly below the BN254
  scalar modulus. Alternate encodings such as `hash + modulus` return `false`.
* Returns `false` for malformed blobs / wrong input counts; off-curve points
  are rejected by the host (tx traps — also rejection).

### Encoding gotcha (documented so nobody else trips on it)

snarkjs JSON exports Fq2 coordinates **real-first** `[c0, c1]`; the Soroban
host expects EIP-197 **imaginary-first** `be(c1) || be(c0)`. The swap lives
in the artifact encoder (`src/test.rs::encode_g2`, mirrored in
`app/lib/zk.ts`). G1 is plain `be(X) || be(Y)`.

## Verification math

```text
e(A, B) == e(alpha, beta) * e(L, gamma) * e(C, delta)
L = IC[0] + Σ_i public[i] · IC[i+1]          (single g1_msm + g1_add)
```

evaluated as one host pairing product:
`e(A,B) · e(−alpha,beta) · e(−L,gamma) · e(−C,delta) == 1`.

## Measured cost (test host budget, equivalent to simulateTransaction metering)

| Metric | Value |
|---|---|
| Groth16 `verify` — CPU instructions (WASM contract) | **~26.4M** |
| Groth16 `verify` — CPU instructions (native test host) | ~26.0M |
| Memory bytes (WASM) | ~1.5 MB |
| Proof size on-chain | **256 bytes** |
| Verifying key size | 576 bytes (4 points + 2 IC points) |
| Contract WASM | ~5.2 KB |

~26M instructions ≈ 26% of the classic 100M/tx budget (and ~7% of the
newer 400M limit) — a single transaction has ample headroom.

## Reproducing the artifacts

```bash
cd ../../circuits
npm i                                   # circomlib + snarkjs
circom preimage.circom --r1cs --wasm -l node_modules/circomlib/circuits -o build
snarkjs powersoftau new bn128 10 build/pot.ptau
snarkjs powersoftau contribute build/pot.ptau build/pot_c.ptau -e="<entropy>"
snarkjs powersoftau prepare phase2 build/pot_c.ptau build/pot_final.ptau
snarkjs groth16 setup build/preimage.r1cs build/pot_final.ptau build/circuit_0.zkey
snarkjs zkey contribute build/circuit_0.zkey build/circuit_final.zkey -e="<entropy>"
snarkjs zkey export verificationkey build/circuit_final.zkey vk.json
node build/preimage_js/generate_witness.js build/preimage_js/preimage.wasm input.json build/w.wtns
snarkjs groth16 prove build/circuit_final.zkey build/w.wtns proof.json public.json
snarkjs groth16 verify vk.json public.json proof.json   # off-chain sanity check
```

> **Trusted setup caveat:** the ceremony above uses throwaway local entropy —
> fine for a demo, **not** for production. A real deployment needs a
> multi-party ceremony (or a reused, well-attested per-circuit setup).

## Tests

```bash
cargo test          # native tests; no prebuilt WASM needed
stellar contract build --out-dir wasm
cargo test --features wasm-tests # includes fresh WASM verification/security checks
cd ../../circuits && npm ci --ignore-scripts && npm test
```

* `valid_proof_verifies_on_chain` — the committed snarkjs proof verifies `true`
* `wasm_verify_instruction_measurement` — same, against the compiled WASM, prints cost
* `corrupted_proof_is_rejected` — swapped/truncated/bit-flipped proofs → `false`/trap
* `wrong_public_input_is_rejected` — `hash+1`, wrong arity → `false`
* `init_twice_panics`, `proof_and_key_sizes`

## Pod integration roadmap (bridge notes)

The current Pod opens with a SHA-256 bearer preimage plus the v2 hidden
recipient-bound commit/reveal flow. This independent circuit proves only
`Poseidon(preimage) == hash`; it does **not** bind a recipient, Pod ID, contract,
network, or nullifier, and it does not produce an unlinkable payment protocol.

An eventual ZK claim circuit must include the claim's recipient and domain as
constrained public inputs, compare its hash against the recorded Pod, and let
the caller's state machine consume the claim exactly once. A copied proof must
not be usable with a substituted recipient. That is a circuit/storage/API
change with a new setup, verification key, pinned hash, proof artifacts and
verifier deployment. The current verifier is intentionally pinned to **one**
public signal and must not be presented as a generic arbitrary-circuit verifier.

## Known limitations

* Demo-grade trusted setup (see above).
* No replay/nullifier protection at the verifier level — it answers "is this
  proof valid for this hash", nothing more. Replay protection belongs to the
  calling contract (Pod state machine already closes replays for claims).
* VK is pinned and write-once (`init` panics on second call); key rotation
  requires changing the compiled pin and redeploying. Existing verifier
  deployments do not gain these local fixes automatically.
* Instance TTL is extended on executed init/verify calls; simulated RPC reads
  do not persist extensions. Archived contract state requires restoration.
* The checked-in proof is a demonstration with a publicly known sample input.
  Source inspection and proof verification do not establish a production-safe
  trusted setup. R1CS, witness WASM and zkey build outputs are not committed;
  the current checkout does not reconstruct the original setup ceremony.
