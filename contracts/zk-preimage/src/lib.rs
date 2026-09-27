#![no_std]
//! # zk-preimage: Groth16 (BN254) preimage-knowledge verifier
//!
//! Verifies Groth16 proofs for the circuit `circuits/preimage.circom`:
//!
//! ```text
//! public output:  hash  = Poseidon(preimage)
//! private input:  preimage
//! ```
//!
//! The verifier uses Soroban's native BN254 host functions (CAP-0074 /
//! CAP-0080: `g1_add`, `g1_mul`, `g1_msm`, `pairing_check`). All curve
//! arithmetic executes at Stellar Core level, so a full Groth16 check fits
//! comfortably in a single transaction budget.
//!
//! ## Byte encoding (snarkjs -> Soroban)
//!
//! * G1 point: 64 bytes, `be(X) || be(Y)` (uncompressed, EIP-196 style).
//! * G2 point: 128 bytes, `be(X) || be(Y)` where each Fq2 element is
//!   `be(c1) || be(c0)`: **imaginary part first** (EIP-197). snarkjs JSON
//!   exports Fq2 coordinates as `[c0, c1]`, so the pair must be swapped.
//! * Field element (Fr): 32-byte big-endian integer.
//! * Proof blob: 256 bytes = `A (64) || B (128) || C (64)`.
//!
//! ## Verification equation
//!
//! ```text
//! e(A, B) == e(alpha, beta) * e(L, gamma) * e(C, delta)
//! L = IC[0] + sum_i public_inputs[i] * IC[i+1]
//! ```
//!
//! evaluated as a single pairing product:
//! `e(A,B) * e(-alpha,beta) * e(-L,gamma) * e(-C,delta) == 1`.

use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};
use soroban_sdk::{contract, contractimpl, contracttype, Bytes, BytesN, Env, Vec};

/// Serialized Groth16 proof size: A (G1) || B (G2) || C (G1).
pub const PROOF_SIZE: u32 = 256;
/// Size of one public input (BN254 scalar field element, big-endian).
pub const FR_SIZE: u32 = 32;

// Exact verification key of the committed preimage circuit, encoded as
// alpha || beta || gamma || delta || IC[0] || IC[1] (host point encoding).
// Pinning the circuit prevents an untrusted first init caller from supplying
// a degenerate key under which every proof, including all zeros, verifies.
const EXPECTED_VK_HASH: [u8; 32] = [
    0x39, 0x66, 0x01, 0x27, 0x57, 0xc5, 0x42, 0x84, 0xdc, 0xf0, 0x7c, 0x3b, 0x2d, 0x02, 0xa9, 0xc2,
    0xc2, 0xa1, 0x36, 0xd0, 0x4e, 0x47, 0x0b, 0x8b, 0xda, 0x75, 0xf4, 0xd3, 0xe8, 0x4a, 0x90, 0x5c,
];
const FR_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND: u32 = 172_800;

const G1_SIZE: u32 = 64;
const G2_SIZE: u32 = 128;

/// BN254 base field modulus p, big-endian.
/// p = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
const FP_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Groth16 verifying key, registered once via [`Groth16PreimageVerifier::init`].
///
/// All points are in the Soroban host encoding described in the crate docs.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    /// IC points; `ic.len() == nPublic + 1`.
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Vk,
}

#[contract]
pub struct Groth16PreimageVerifier;

#[contractimpl]
impl Groth16PreimageVerifier {
    /// Register the pinned preimage-circuit key. Callable exactly once.
    /// Anyone may supply the correct key; no caller can select another circuit.
    pub fn init(env: Env, vk: VerifyingKey) {
        if env.storage().instance().has(&DataKey::Vk) {
            panic!("already initialized");
        }
        if vk.ic.len() != 2 {
            panic!("preimage circuit requires exactly one public input");
        }
        let mut encoded = Bytes::from(vk.alpha_g1.clone());
        encoded.append(&Bytes::from(vk.beta_g2.clone()));
        encoded.append(&Bytes::from(vk.gamma_g2.clone()));
        encoded.append(&Bytes::from(vk.delta_g2.clone()));
        for point in vk.ic.iter() {
            encoded.append(&Bytes::from(point));
        }
        if env.crypto().sha256(&encoded).to_bytes() != BytesN::from_array(&env, &EXPECTED_VK_HASH) {
            panic!("verifying key does not match the preimage circuit");
        }
        env.storage().instance().set(&DataKey::Vk, &vk);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    /// Verify a Groth16 proof against the registered verifying key.
    ///
    /// Returns `true` iff the proof is valid for the given public inputs.
    /// Returns `false` for structurally malformed inputs (wrong proof length,
    /// wrong public-input count/size). Points that are not on the curve are
    /// rejected by the host (transaction traps), which also means rejection.
    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<Bytes>) -> bool {
        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .unwrap_or_else(|| panic!("not initialized"));

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        if proof.len() != PROOF_SIZE {
            return false;
        }
        if vk.ic.len() != public_inputs.len() + 1 {
            return false;
        }

        let bn254 = env.crypto().bn254();

        // Parse public inputs into scalar field elements.
        let mut scalars: Vec<Bn254Fr> = Vec::new(&env);
        for input in public_inputs.iter() {
            if input.len() != FR_SIZE {
                return false;
            }
            let mut arr = [0u8; FR_SIZE as usize];
            input.copy_into_slice(&mut arr);
            // Bn254Fr::from_bytes reduces modulo r. Reject alternate encodings
            // instead of silently treating distinct public statements as equal.
            if arr >= FR_MODULUS_BE {
                return false;
            }
            scalars.push_back(Bn254Fr::from_bytes(BytesN::from_array(&env, &arr)));
        }

        // L = IC[0] + sum_i public_inputs[i] * IC[i+1]  (single MSM + add)
        let mut msm_points: Vec<Bn254G1Affine> = Vec::new(&env);
        for i in 1..vk.ic.len() {
            msm_points.push_back(Bn254G1Affine::from_bytes(vk.ic.get(i).unwrap()));
        }
        let ic0 = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
        let acc = bn254.g1_msm(msm_points, scalars);
        let l = bn254.g1_add(&ic0, &acc);

        // Parse the proof: A (G1) || B (G2) || C (G1)
        let a = g1_at(&env, &proof, 0);
        let b = g2_at(&env, &proof, G1_SIZE);
        let c = g1_at(&env, &proof, G1_SIZE + G2_SIZE);

        // e(A,B) * e(-alpha,beta) * e(-L,gamma) * e(-C,delta) == 1
        let neg_alpha = negate_g1(&env, vk.alpha_g1.to_array());
        let neg_l = negate_g1(&env, l.to_array());
        let neg_c = negate_g1(&env, c.to_array());

        let mut vp1: Vec<Bn254G1Affine> = Vec::new(&env);
        vp1.push_back(a);
        vp1.push_back(neg_alpha);
        vp1.push_back(neg_l);
        vp1.push_back(neg_c);

        let mut vp2: Vec<Bn254G2Affine> = Vec::new(&env);
        vp2.push_back(b);
        vp2.push_back(Bn254G2Affine::from_bytes(vk.beta_g2.clone()));
        vp2.push_back(Bn254G2Affine::from_bytes(vk.gamma_g2.clone()));
        vp2.push_back(Bn254G2Affine::from_bytes(vk.delta_g2.clone()));

        bn254.pairing_check(vp1, vp2)
    }
}

/// Read a G1 point (64 bytes) from a byte blob at `offset`.
fn g1_at(env: &Env, blob: &Bytes, offset: u32) -> Bn254G1Affine {
    let mut arr = [0u8; G1_SIZE as usize];
    blob.slice(offset..offset + G1_SIZE)
        .copy_into_slice(&mut arr);
    Bn254G1Affine::from_bytes(BytesN::from_array(env, &arr))
}

/// Read a G2 point (128 bytes) from a byte blob at `offset`.
fn g2_at(env: &Env, blob: &Bytes, offset: u32) -> Bn254G2Affine {
    let mut arr = [0u8; G2_SIZE as usize];
    blob.slice(offset..offset + G2_SIZE)
        .copy_into_slice(&mut arr);
    Bn254G2Affine::from_bytes(BytesN::from_array(env, &arr))
}

/// Negate a G1 point: (x, y) -> (x, p - y). The point at infinity
/// (all-zero encoding) is returned unchanged.
fn negate_g1(env: &Env, point: [u8; 64]) -> Bn254G1Affine {
    if point.iter().all(|b| *b == 0) {
        return Bn254G1Affine::from_bytes(BytesN::from_array(env, &point));
    }
    let mut out = point;
    // out[32..64] = FP_MODULUS - point[32..64]  (big-endian subtraction)
    let mut borrow: i16 = 0;
    for i in (0..32usize).rev() {
        let d = FP_MODULUS_BE[i] as i16 - point[32 + i] as i16 - borrow;
        if d < 0 {
            out[32 + i] = (d + 256) as u8;
            borrow = 1;
        } else {
            out[32 + i] = d as u8;
            borrow = 0;
        }
    }
    Bn254G1Affine::from_bytes(BytesN::from_array(env, &out))
}

mod test;
