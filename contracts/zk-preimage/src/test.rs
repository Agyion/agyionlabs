#![cfg(test)]
//! End-to-end tests: the real snarkjs artifacts committed under
//! `artifacts/` (proof.json / public.json / vk.json) are verified on-chain
//! (Soroban host, native BN254 pairing).

extern crate std;

use super::*;
use serde_json::Value;
use soroban_sdk::{vec, Bytes, BytesN, Env, Vec};

// ---------------------------------------------------------------------------
// snarkjs JSON -> Soroban host byte encoding helpers
// ---------------------------------------------------------------------------

/// Decimal string -> 32-byte big-endian array.
fn dec_to_be32(s: &str) -> [u8; 32] {
    let mut out = [0u8; 32];
    for ch in s.bytes() {
        let digit = (ch - b'0') as u64;
        let mut carry = digit;
        for byte in out.iter_mut().rev() {
            let v = (*byte as u64) * 10 + carry;
            *byte = (v & 0xff) as u8;
            carry = v >> 8;
        }
        assert_eq!(carry, 0, "field element overflow");
    }
    out
}

fn json_str(v: &Value) -> &str {
    v.as_str()
        .expect("expected decimal string in artifact json")
}

/// snarkjs G1 [x, y, 1] -> 64 bytes be(X)||be(Y).
fn encode_g1(p: &Value) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&dec_to_be32(json_str(&p[0])));
    out[32..].copy_from_slice(&dec_to_be32(json_str(&p[1])));
    out
}

/// snarkjs G2 [[x0, x1], [y0, y1], [1, 0]] -> 128 bytes.
///
/// snarkjs exports Fq2 coordinates real-first (`[c0, c1]`); the Soroban host
/// expects EIP-197 encoding, imaginary-first: `be(c1) || be(c0)`.
fn encode_g2(p: &Value) -> [u8; 128] {
    let mut out = [0u8; 128];
    let x = &p[0];
    let y = &p[1];
    out[0..32].copy_from_slice(&dec_to_be32(json_str(&x[1]))); // X.c1
    out[32..64].copy_from_slice(&dec_to_be32(json_str(&x[0]))); // X.c0
    out[64..96].copy_from_slice(&dec_to_be32(json_str(&y[1]))); // Y.c1
    out[96..128].copy_from_slice(&dec_to_be32(json_str(&y[0]))); // Y.c0
    out
}

fn load_vk(env: &Env) -> VerifyingKey {
    let vk_json: Value =
        serde_json::from_str(include_str!("../artifacts/vk.json")).expect("valid vk.json");
    let mut ic: Vec<BytesN<64>> = Vec::new(env);
    for point in vk_json["IC"].as_array().expect("IC array") {
        ic.push_back(BytesN::from_array(env, &encode_g1(point)));
    }
    VerifyingKey {
        alpha_g1: BytesN::from_array(env, &encode_g1(&vk_json["vk_alpha_1"])),
        beta_g2: BytesN::from_array(env, &encode_g2(&vk_json["vk_beta_2"])),
        gamma_g2: BytesN::from_array(env, &encode_g2(&vk_json["vk_gamma_2"])),
        delta_g2: BytesN::from_array(env, &encode_g2(&vk_json["vk_delta_2"])),
        ic,
    }
}

/// proof.json -> 256-byte blob A || B || C (Soroban host encoding).
fn load_proof(env: &Env) -> Bytes {
    let proof_json: Value =
        serde_json::from_str(include_str!("../artifacts/proof.json")).expect("valid proof.json");
    let a = encode_g1(&proof_json["pi_a"]);
    let b = encode_g2(&proof_json["pi_b"]);
    let c = encode_g1(&proof_json["pi_c"]);
    let mut blob = [0u8; 256];
    blob[0..64].copy_from_slice(&a);
    blob[64..192].copy_from_slice(&b);
    blob[192..256].copy_from_slice(&c);
    Bytes::from_array(env, &blob)
}

/// public.json -> Vec of 32-byte BE field elements.
fn load_public(env: &Env) -> Vec<Bytes> {
    let public_json: Value =
        serde_json::from_str(include_str!("../artifacts/public.json")).expect("valid public.json");
    let mut out: Vec<Bytes> = Vec::new(env);
    for signal in public_json.as_array().expect("public signals array") {
        out.push_back(Bytes::from_array(env, &dec_to_be32(json_str(signal))));
    }
    out
}

struct Setup<'a> {
    env: &'a Env,
    client: Groth16PreimageVerifierClient<'a>,
}

fn setup(env: &Env) -> Setup<'_> {
    let id = env.register(Groth16PreimageVerifier, ());
    let client = Groth16PreimageVerifierClient::new(env, &id);
    client.init(&load_vk(env));
    Setup { env, client }
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

#[test]
fn valid_proof_verifies_on_chain() {
    let env = Env::default();
    let s = setup(&env);
    let proof = load_proof(&env);
    let public = load_public(&env);
    assert_eq!(proof.len(), 256, "proof blob must be 256 bytes");

    s.env.cost_estimate().budget().reset_default();
    let ok = s.client.verify(&proof, &public);
    let cpu = s.env.cost_estimate().budget().cpu_instruction_cost();

    assert!(ok, "valid Groth16 proof must verify");
    std::println!(
        "groth16 verify cpu instructions: {} (proof: {} bytes)",
        cpu,
        proof.len()
    );
}

#[test]
fn corrupted_proof_is_rejected() {
    let env = Env::default();
    let s = setup(&env);
    let proof = load_proof(&env);
    let public = load_public(&env);

    // Swap pi_a and pi_c: both remain valid on-curve G1 points, so the host
    // accepts the encoding but the pairing equation fails -> false.
    let mut tampered = [0u8; 256];
    proof.copy_into_slice(&mut tampered);
    let a = tampered[0..64].to_vec();
    tampered.copy_within(192..256, 0);
    tampered[192..256].copy_from_slice(&a);
    let bad_proof = Bytes::from_array(&env, &tampered);
    assert!(!s.client.verify(&bad_proof, &public));

    // Flip a bit inside pi_a's X coordinate (encoding stays well-formed).
    let mut tampered2 = [0u8; 256];
    proof.copy_into_slice(&mut tampered2);
    tampered2[31] ^= 1;
    let bad_proof2 = Bytes::from_array(&env, &tampered2);
    assert!(
        !matches!(s.client.try_verify(&bad_proof2, &public), Ok(Ok(true))),
        "a corrupted point must not be accepted"
    );

    // Truncated proof is structurally malformed -> false (no trap).
    let short = proof.slice(0..255);
    assert!(!s.client.verify(&short, &public));
}

#[test]
fn wrong_public_input_is_rejected() {
    let env = Env::default();
    let s = setup(&env);
    let proof = load_proof(&env);
    let public = load_public(&env);

    // hash + 1 (still a valid BN254 scalar, just the wrong statement).
    let mut wrong = [0u8; 32];
    public.get(0).unwrap().copy_into_slice(&mut wrong);
    let mut carry = 1u16;
    for byte in wrong.iter_mut().rev() {
        let v = *byte as u16 + carry;
        *byte = (v & 0xff) as u8;
        carry = v >> 8;
    }
    let wrong_public: Vec<Bytes> = vec![&env, Bytes::from_array(&env, &wrong)];
    assert!(!s.client.verify(&proof, &wrong_public));

    // Wrong number of public inputs -> false.
    let empty_public: Vec<Bytes> = vec![&env];
    assert!(!s.client.verify(&proof, &empty_public));
}

#[test]
#[should_panic(expected = "already initialized")]
fn init_twice_panics() {
    let env = Env::default();
    let s = setup(&env);
    s.client.init(&load_vk(&env));
}

/// Measures the verification cost with the *compiled WASM* contract
/// (closest in-repo equivalent of a `simulateTransaction` measurement).
/// Requires `wasm/zk_preimage.wasm` (build: `stellar contract build`).
#[test]
#[cfg(feature = "wasm-tests")]
fn wasm_verify_instruction_measurement() {
    const WASM: &[u8] = include_bytes!("../wasm/zk_preimage.wasm");

    let env = Env::default();
    let id = env.register(WASM, ());
    let client = Groth16PreimageVerifierClient::new(&env, &id);
    let mut invalid_key = load_vk(&env);
    invalid_key.alpha_g1 = BytesN::from_array(&env, &[0; 64]);
    assert!(client.try_init(&invalid_key).is_err());
    client.init(&load_vk(&env));

    let proof = load_proof(&env);
    let public = load_public(&env);

    env.cost_estimate().budget().reset_default();
    let ok = client.verify(&proof, &public);
    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    assert!(ok, "valid Groth16 proof must verify under WASM");
    assert!(!client.verify(&proof, &vec![&env, Bytes::from_array(&env, &FR_MODULUS_BE)]));
    assert!(!client.verify(&Bytes::from_array(&env, &[0; 256]), &public));
    std::println!(
        "wasm groth16 verify: cpu_instructions={} mem_bytes={} proof_bytes={}",
        cpu,
        mem,
        proof.len()
    );
}

#[test]
fn proof_and_key_sizes() {
    // Document on-chain sizes for the demo/report.
    let vk_json: Value =
        serde_json::from_str(include_str!("../artifacts/vk.json")).expect("valid vk.json");
    let n_public = vk_json["nPublic"].as_u64().unwrap();
    assert_eq!(n_public, 1);
    std::println!(
        "artifacts: proof=256B on-chain, vk.json={}B, nPublic={}",
        include_str!("../artifacts/vk.json").len(),
        n_public
    );
}

#[test]
fn security_attacker_cannot_install_degenerate_verifying_key() {
    let env = Env::default();
    let id = env.register(Groth16PreimageVerifier, ());
    let client = Groth16PreimageVerifierClient::new(&env, &id);
    let zero_key = VerifyingKey {
        alpha_g1: BytesN::from_array(&env, &[0; 64]),
        beta_g2: BytesN::from_array(&env, &[0; 128]),
        gamma_g2: BytesN::from_array(&env, &[0; 128]),
        delta_g2: BytesN::from_array(&env, &[0; 128]),
        ic: vec![
            &env,
            BytesN::from_array(&env, &[0; 64]),
            BytesN::from_array(&env, &[0; 64]),
        ],
    };
    let rejected = client.try_init(&zero_key).is_err();
    if !rejected {
        assert!(
            client.verify(
                &Bytes::from_array(&env, &[0; 256]),
                &vec![&env, Bytes::from_array(&env, &[0; 32])]
            ),
            "degenerate key makes the empty proof pass"
        );
    }
    assert!(
        rejected,
        "an arbitrary caller must not replace the intended circuit key"
    );
}

#[test]
fn security_noncanonical_public_input_is_rejected() {
    let env = Env::default();
    let s = setup(&env);
    let proof = load_proof(&env);
    let public = load_public(&env);
    let modulus = dec_to_be32(
        "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    );
    let mut noncanonical = [0u8; 32];
    public.get(0).unwrap().copy_into_slice(&mut noncanonical);
    let mut carry = 0u16;
    for i in (0..32).rev() {
        let sum = noncanonical[i] as u16 + modulus[i] as u16 + carry;
        noncanonical[i] = sum as u8;
        carry = sum >> 8;
    }
    assert_eq!(carry, 0);
    assert!(
        !s.client
            .verify(&proof, &vec![&env, Bytes::from_array(&env, &noncanonical)]),
        "input + Fr modulus is a different serialized claim and must be rejected"
    );
}

#[test]
fn security_zero_proof_is_rejected_under_pinned_key() {
    let env = Env::default();
    let s = setup(&env);
    assert!(!s
        .client
        .verify(&Bytes::from_array(&env, &[0; 256]), &load_public(&env)));
}

#[test]
fn security_public_input_size_and_modulus_are_rejected() {
    let env = Env::default();
    let s = setup(&env);
    let proof = load_proof(&env);
    for size in [0, 31, 33] {
        let bytes = std::vec![0u8; size];
        assert!(!s
            .client
            .verify(&proof, &vec![&env, Bytes::from_slice(&env, &bytes)]));
    }
    assert!(!s
        .client
        .verify(&proof, &vec![&env, Bytes::from_array(&env, &FR_MODULUS_BE)]));
    assert!(!s
        .client
        .verify(&proof, &vec![&env, Bytes::from_array(&env, &[255; 32])]));
}

#[test]
fn security_different_nonzero_circuit_key_is_rejected() {
    let env = Env::default();
    let id = env.register(Groth16PreimageVerifier, ());
    let client = Groth16PreimageVerifierClient::new(&env, &id);
    let mut changed = load_vk(&env);
    let first = changed.ic.get(0).unwrap();
    let second = changed.ic.get(1).unwrap();
    changed.ic.set(0, second);
    changed.ic.set(1, first);
    assert!(client.try_init(&changed).is_err());
    client.init(&load_vk(&env));
    assert!(client.verify(&load_proof(&env), &load_public(&env)));
}
