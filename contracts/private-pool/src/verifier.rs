use crate::hash::{canonical, Field};
use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};
use soroban_sdk::{contracttype, Bytes, BytesN, Env, Vec};
const G1_SIZE: u32 = 64;
const G2_SIZE: u32 = 128;
pub const FR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];
const FP_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

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

pub fn key_matches(e: &Env, vk: &VerifyingKey, count: u32, pin: &[u8; 32]) -> bool {
    if *pin == [0; 32] || vk.ic.len() != count + 1 {
        return false;
    }
    let mut bytes = Bytes::from(vk.alpha_g1.clone());
    bytes.append(&vk.beta_g2.clone().into());
    bytes.append(&vk.gamma_g2.clone().into());
    bytes.append(&vk.delta_g2.clone().into());
    for point in vk.ic.iter() {
        bytes.append(&point.into());
    }
    e.crypto().sha256(&bytes).to_bytes().to_array() == *pin
}
pub fn verify(e: &Env, vk: &VerifyingKey, proof: &Bytes, inputs: &Vec<Field>) -> bool {
    if proof.len() != 256 || vk.ic.len() != inputs.len() + 1 {
        return false;
    }
    // Require canonical Fp coordinates at the boundary, before host decoding
    // and manual G1 negation.
    for i in 0..8 {
        let mut coordinate = [0; 32];
        proof
            .slice(i * 32..(i + 1) * 32)
            .copy_into_slice(&mut coordinate);
        if coordinate >= FP_MODULUS_BE {
            return false;
        }
    }
    let mut scalars = Vec::new(e);
    for x in inputs.iter() {
        if !canonical(&x) {
            return false;
        }
        scalars.push_back(Bn254Fr::from_bytes(x));
    }
    let mut points = Vec::new(e);
    for i in 1..vk.ic.len() {
        points.push_back(Bn254G1Affine::from_bytes(vk.ic.get(i).unwrap()));
    }
    let bn = e.crypto().bn254();
    let l = bn.g1_add(
        &Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap()),
        &bn.g1_msm(points, scalars),
    );
    let a = g1_at(e, proof, 0);
    let b = g2_at(e, proof, 64);
    let c = g1_at(e, proof, 192);
    let p = soroban_sdk::vec![
        e,
        a,
        negate_g1(e, vk.alpha_g1.to_array()),
        negate_g1(e, l.to_array()),
        negate_g1(e, c.to_array())
    ];
    let q = soroban_sdk::vec![
        e,
        b,
        Bn254G2Affine::from_bytes(vk.beta_g2.clone()),
        Bn254G2Affine::from_bytes(vk.gamma_g2.clone()),
        Bn254G2Affine::from_bytes(vk.delta_g2.clone())
    ];
    bn.pairing_check(p, q)
}
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
