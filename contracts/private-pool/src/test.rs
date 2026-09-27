extern crate std;
mod backing;
#[cfg(feature = "proof-tests")]
mod integration;
use crate::{hash, verifier};
use soroban_sdk::{Bytes, BytesN, Env};
#[test]
fn field_encoding_rejects_alternate_representations() {
    let e = Env::default();
    assert!(hash::canonical(&hash::u64_field(&e, 0)));
    assert!(!hash::canonical(&BytesN::from_array(
        &e,
        &verifier::FR_MODULUS
    )));
    assert!(!hash::canonical(&BytesN::from_array(&e, &[255; 32])));
}
#[test]
fn native_poseidon_matches_independent_circomlib_vector() {
    let e = Env::default();
    let mut p = hash::Poseidon::new(&e);
    let actual = p.pair(&hash::u64_field(&e, 1), &hash::u64_field(&e, 2));
    // Independently computed by poseidon-lite0.3.0, also circomlib reference.
    let expected = BytesN::from_array(
        &e,
        &[
            17, 92, 192, 245, 231, 214, 144, 65, 61, 246, 76, 107, 150, 98, 233, 207, 42, 54, 23,
            242, 116, 50, 69, 81, 158, 25, 96, 122, 68, 23, 24, 154,
        ],
    );
    assert_eq!(actual, expected);
}
#[test]
fn arbitrary_digest_is_split_losslessly_before_poseidon() {
    let e = Env::default();
    let mut p = hash::Poseidon::new(&e);
    let a = BytesN::from_array(&e, &[255; 32]);
    let mut different = [255; 32];
    different[0] = 0;
    assert_ne!(
        p.digest_id(&a),
        p.digest_id(&BytesN::from_array(&e, &different))
    );
    assert_eq!(
        hash::ciphertext_digest(&e, &soroban_sdk::vec![&e, hash::u64_field(&e, 1)]),
        e.crypto()
            .sha256(&Bytes::from_array(&e, &hash::u64_field(&e, 1).to_array()))
            .to_bytes()
    );
}
use crate::{Config, Error, Key, PoolConfig, PoolState, Transition};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Vec,
};
// Only a real storage frame for isolated predicates; no verifier or submit stub.
#[soroban_sdk::contract]
struct StorageFrame;
#[soroban_sdk::contractimpl]
impl StorageFrame {
    pub fn noop() {}
}

fn sample(e: &Env) -> (PoolState, Transition) {
    let old = hash::u64_field(e, 11);
    let s = PoolState {
        root: old.clone(),
        next_index: 0,
        revocation_root: hash::u64_field(e, 12),
        roots: soroban_sdk::vec![e, old.clone()],
        record_count: 0,
        revocation_count: 0,
    };
    let mut t = Transition {
        valid_from: 100,
        valid_until: 120,
        input_root: old.clone(),
        append_old_root: old,
        append_new_root: hash::u64_field(e, 13),
        next_index: 0,
        nullifiers: soroban_sdk::vec![e, hash::u64_field(e, 3), hash::zero(e)],
        commitments: soroban_sdk::vec![e, hash::u64_field(e, 5), hash::zero(e)],
        bridge_kind: 0,
        asset: None,
        bridge_amount: 0,
        bridge_account: None,
        fee_amount: 0,
        fee_account: None,
        ciphertext: Vec::from_array(e, core::array::from_fn::<_, 134, _>(|_| hash::zero(e))),
    };
    for (i, offset) in [2u32, 30, 58, 71, 87].iter().enumerate() {
        t.ciphertext.set(*offset, hash::u64_field(e, i as u64 + 1));
    }
    (s, t)
}
#[test]
fn state_predicates_reject_stale_append_expiry_duplicate_and_spent_notes() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, t) = sample(&e);
        assert_eq!(crate::state_checks(&e, &s, &t), Ok(1));
        let mut changed = t.clone();
        changed.append_old_root = hash::u64_field(&e, 999);
        assert_eq!(crate::state_checks(&e, &s, &changed), Err(Error::StaleRoot));
        changed = t.clone();
        changed.next_index = 1;
        assert_eq!(crate::state_checks(&e, &s, &changed), Err(Error::StaleRoot));
        changed = t.clone();
        changed.valid_until = 109;
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidWindow)
        );
        changed = t.clone();
        changed
            .nullifiers
            .set(1, changed.nullifiers.get(0).unwrap());
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidShape)
        );
        e.storage()
            .persistent()
            .set(&Key::Nullifier(t.nullifiers.get(0).unwrap()), &true);
        assert_eq!(crate::state_checks(&e, &s, &t), Err(Error::Spent));
    });
}
#[test]
fn full_tree_allows_complete_withdrawal_but_no_new_leaf() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (mut s, mut t) = sample(&e);
        s.next_index = crate::TREE_CAPACITY;
        t.next_index = s.next_index;
        assert_eq!(crate::state_checks(&e, &s, &t), Err(Error::TreeFull));
        t.commitments = soroban_sdk::vec![&e, hash::zero(&e), hash::zero(&e)];
        t.append_new_root = t.append_old_root.clone();
        t.bridge_kind = 2;
        assert_eq!(crate::state_checks(&e, &s, &t), Ok(0));
    });
}
#[test]
fn canonical_cipher_and_packed_outputs_are_required() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, t) = sample(&e);
        let mut changed = t.clone();
        changed
            .ciphertext
            .set(100, BytesN::from_array(&e, &verifier::FR_MODULUS));
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidField)
        );
        changed = t.clone();
        let mut nonce = [0; 32];
        nonce[15] = 1;
        changed.ciphertext.set(2, BytesN::from_array(&e, &nonce));
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidField)
        );
        changed = t;
        changed.commitments = soroban_sdk::vec![&e, hash::zero(&e), hash::u64_field(&e, 4)];
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidShape)
        );
    });
}
#[test]
fn pool_itself_cannot_be_a_bridge_or_fee_destination() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let pool = e.register(StorageFrame, ());
    e.as_contract(&pool, || {
        let (s, t) = sample(&e);
        for kind in [1, 2] {
            let mut changed = t.clone();
            changed.bridge_kind = kind;
            changed.bridge_account = Some(pool.clone());
            if kind == 1 {
                changed.nullifiers = soroban_sdk::vec![&e, hash::zero(&e), hash::zero(&e)];
            }
            assert_eq!(
                crate::state_checks(&e, &s, &changed),
                Err(Error::InvalidBridge)
            );
        }
        let mut changed = t;
        changed.fee_amount = 1;
        changed.fee_account = Some(pool.clone());
        assert_eq!(
            crate::state_checks(&e, &s, &changed),
            Err(Error::InvalidFee)
        );
    });
}
#[test]
fn internal_fee_asset_and_addresses_are_bound_into_the_exact_vector() {
    let e = Env::default();
    let asset = Address::generate(&e);
    let recipient = Address::generate(&e);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, mut t) = sample(&e);
        let c = PoolConfig {
            domain: hash::u64_field(&e, 33),
            asset_policy_root: hash::u64_field(&e, 34),
            asset_ids: soroban_sdk::vec![&e, hash::u64_field(&e, 35)],
            config: Config {
                assets: soroban_sdk::vec![&e, asset.clone()],
                disclosure_epoch: 1,
                auditor_x: hash::u64_field(&e, 1),
                auditor_y: hash::u64_field(&e, 2),
                dkg_transcript_hash: hash::u64_field(&e, 99),
            },
        };
        let plain = crate::public_inputs(&e, &c, &s, &t).unwrap();
        assert_eq!(plain.len(), 157);
        assert_eq!(plain.get(17).unwrap(), hash::zero(&e));
        t.fee_amount = 7;
        t.fee_account = Some(recipient.clone());
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &t),
            Err(Error::UnknownAsset)
        );
        t.asset = Some(asset.clone());
        let input = crate::public_inputs(&e, &c, &s, &t).unwrap();
        assert_eq!(input.get(17).unwrap(), c.asset_ids.get(0).unwrap());
        assert_eq!(input.get(18).unwrap(), hash::zero(&e));
        assert_eq!(input.get(19).unwrap(), hash::zero(&e));
        assert_eq!(input.get(20).unwrap(), hash::u64_field(&e, 7));
        assert_ne!(input.get(21).unwrap(), hash::zero(&e));
        t.fee_account = Some(Address::generate(&e));
        let changed = crate::public_inputs(&e, &c, &s, &t).unwrap();
        assert_ne!(input.get(21), changed.get(21));
        assert_eq!(input.get(17), changed.get(17));
        t.asset = Some(Address::generate(&e));
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &t),
            Err(Error::UnknownAsset)
        );
    });
}
#[test]
fn bridge_and_fee_require_exact_optional_accounts_and_an_allowlisted_asset() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let asset = Address::generate(&e);
    let account = Address::generate(&e);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, t) = sample(&e);
        let c = PoolConfig {
            domain: hash::u64_field(&e, 33),
            asset_policy_root: hash::u64_field(&e, 34),
            asset_ids: soroban_sdk::vec![&e, hash::u64_field(&e, 35)],
            config: Config {
                assets: soroban_sdk::vec![&e, asset.clone()],
                disclosure_epoch: 1,
                auditor_x: hash::u64_field(&e, 1),
                auditor_y: hash::u64_field(&e, 2),
                dkg_transcript_hash: hash::u64_field(&e, 99),
            },
        };
        let mut changed = t.clone();
        changed.asset = Some(asset.clone());
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &changed),
            Err(Error::InvalidBridge)
        );
        changed = t.clone();
        changed.bridge_amount = 1;
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &changed),
            Err(Error::InvalidBridge)
        );
        changed = t.clone();
        changed.bridge_account = Some(account.clone());
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &changed),
            Err(Error::InvalidBridge)
        );
        changed = t.clone();
        changed.fee_account = Some(account.clone());
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &changed),
            Err(Error::InvalidFee)
        );
        changed = t.clone();
        changed.asset = Some(asset.clone());
        changed.fee_amount = 1;
        assert_eq!(
            crate::public_inputs(&e, &c, &s, &changed),
            Err(Error::InvalidFee)
        );
        for kind in [1, 2] {
            changed = t.clone();
            changed.bridge_kind = kind;
            changed.asset = Some(asset.clone());
            changed.bridge_account = Some(account.clone());
            assert_eq!(
                crate::public_inputs(&e, &c, &s, &changed),
                Err(Error::InvalidBridge)
            );
            changed.bridge_amount = 1;
            changed.bridge_account = None;
            assert_eq!(
                crate::public_inputs(&e, &c, &s, &changed),
                Err(Error::InvalidBridge)
            );
            changed.bridge_account = Some(account.clone());
            changed.asset = Some(Address::generate(&e));
            assert_eq!(
                crate::public_inputs(&e, &c, &s, &changed),
                Err(Error::UnknownAsset)
            );
        }
        // No verifier is installed in this frame: an unknown token must reject
        // before proof work, authorization, external calls or durable effects.
        e.ledger().set_network_id(
            e.crypto()
                .sha256(&Bytes::from_slice(&e, crate::TESTNET))
                .to_bytes()
                .to_array(),
        );
        e.storage().instance().set(&Key::Config, &c);
        e.storage().instance().set(&Key::State, &s);
        assert_eq!(
            crate::PrivatePool::submit(e.clone(), changed, Bytes::new(&e)),
            Err(Error::UnknownAsset)
        );
        assert!(!e
            .storage()
            .persistent()
            .has(&Key::Nullifier(t.nullifiers.get(0).unwrap())));
        assert_eq!(crate::PrivatePool::state(e.clone()).record_count, 0);
    });
}

#[test]
fn public_vector_preserves_u64_maxima_every_cipher_field_and_config_context() {
    let e = Env::default();
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/host-config.json")).unwrap();
    let address = |key: &str| {
        Address::from_string(&soroban_sdk::String::from_str(
            &e,
            fixture[key].as_str().unwrap(),
        ))
    };
    let f = |key: &str| BytesN::from_array(&e, &decimal(fixture[key].as_str().unwrap()));
    let c = PoolConfig {
        domain: f("domain"),
        asset_policy_root: f("assetPolicyRoot"),
        asset_ids: soroban_sdk::vec![&e, f("assetId")],
        config: Config {
            assets: soroban_sdk::vec![&e, address("asset")],
            disclosure_epoch: u32::MAX,
            auditor_x: f("auditorX"),
            auditor_y: f("auditorY"),
            dkg_transcript_hash: hash::u64_field(&e, 99),
        },
    };
    let (s, mut t) = sample(&e);
    t.bridge_kind = 2;
    t.asset = Some(address("asset"));
    t.bridge_account = Some(address("recipient"));
    t.bridge_amount = u64::MAX;
    t.fee_account = Some(address("fee"));
    t.fee_amount = u64::MAX;
    t.ciphertext = Vec::from_iter(&e, (0..134).map(|i| hash::u64_field(&e, 1000 + i)));
    let actual = crate::public_inputs(&e, &c, &s, &t).unwrap();
    let expected = soroban_sdk::vec![
        &e,
        f("domain"),
        f("assetPolicyRoot"),
        hash::u64_field(&e, u32::MAX as u64),
        f("auditorX"),
        f("auditorY"),
        hash::u64_field(&e, 12),
        hash::u64_field(&e, 100),
        hash::u64_field(&e, 120),
        hash::u64_field(&e, 11),
        hash::u64_field(&e, 11),
        hash::u64_field(&e, 13),
        hash::zero(&e),
        hash::u64_field(&e, 3),
        hash::zero(&e),
        hash::u64_field(&e, 5),
        hash::zero(&e),
        hash::u64_field(&e, 2),
        f("assetId"),
        hash::u64_field(&e, u64::MAX),
        f("recipientId"),
        hash::u64_field(&e, u64::MAX),
        f("feeId"),
        hash::u64_field(&e, 2)
    ];
    assert_eq!(actual.len(), 157);
    for (i, value) in expected.iter().enumerate() {
        assert_eq!(actual.get(i as u32).unwrap(), value);
    }
    for i in 0..134 {
        assert_eq!(
            actual.get(23 + i).unwrap(),
            hash::u64_field(&e, 1000 + i as u64)
        );
    }
    // This checks encoding, not a valid/conserved transfer at both maxima.
}

#[test]
fn ledger_window_is_inclusive_and_every_envelope_nonce_has_exact_u128_bounds() {
    let e = Env::default();
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, mut t) = sample(&e);
        for (from, until, now, valid) in [
            (100, 220, 100, true),
            (100, 220, 220, true),
            (100, 221, 110, false),
            (100, 99, 100, false),
            (100, 120, 99, false),
            (100, 120, 121, false),
            (u32::MAX - 120, u32::MAX, u32::MAX, true),
        ] {
            t.valid_from = from;
            t.valid_until = until;
            e.ledger().set_sequence_number(now);
            assert_eq!(
                crate::state_checks(&e, &s, &t),
                if valid {
                    Ok(1)
                } else {
                    Err(Error::InvalidWindow)
                }
            );
        }
        e.ledger().set_sequence_number(110);
        t.valid_from = 100;
        t.valid_until = 120;
        let mut max = [0u8; 32];
        max[16..].fill(255);
        let mut overflow = [0u8; 32];
        overflow[15] = 1;
        for offset in [2, 30, 58, 71, 87] {
            let original = t.ciphertext.get(offset).unwrap();
            t.ciphertext.set(offset, hash::zero(&e));
            assert_eq!(crate::state_checks(&e, &s, &t), Err(Error::InvalidField));
            t.ciphertext.set(offset, BytesN::from_array(&e, &overflow));
            assert_eq!(crate::state_checks(&e, &s, &t), Err(Error::InvalidField));
            t.ciphertext.set(offset, BytesN::from_array(&e, &max));
            assert_eq!(crate::state_checks(&e, &s, &t), Ok(1));
            t.ciphertext.set(offset, original);
        }
    });
}

#[test]
fn domain_and_revocation_tag_change_across_network_deployment_and_address_roles() {
    let e = Env::default();
    let id = e.register(StorageFrame, ());
    let other = e.register(StorageFrame, ());
    let key = BytesN::from_array(&e, &[7; 32]);
    let initial = e.as_contract(&id, || hash::Poseidon::new(&e).domain());
    let different_pool = e.as_contract(&other, || hash::Poseidon::new(&e).domain());
    assert_ne!(initial, different_pool);
    e.ledger().set_network_id([42; 32]);
    let different_network = e.as_contract(&id, || hash::Poseidon::new(&e).domain());
    assert_ne!(initial, different_network);
    let mut p = hash::Poseidon::new(&e);
    assert_ne!(
        p.revocation_tag(&initial, &key),
        p.revocation_tag(&different_pool, &key)
    );
    assert_ne!(
        p.revocation_tag(&initial, &key),
        p.revocation_tag(&different_network, &key)
    );
    assert_ne!(
        p.tagged_address(b"AGYION_ASSET_V2\0", &id),
        p.tagged_address(b"AGYION_ACCOUNT_V2\0", &id)
    );
}
#[test]
fn constructor_never_accepts_mainnet_or_caller_selected_verifier() {
    let e = Env::default();
    let id = e.register(StorageFrame, ());
    let config = Config {
        assets: soroban_sdk::vec![&e, Address::generate(&e)],
        disclosure_epoch: 1,
        auditor_x: hash::u64_field(&e, 1),
        auditor_y: hash::u64_field(&e, 2),
        dkg_transcript_hash: hash::u64_field(&e, 3),
    };
    let vk = verifier::VerifyingKey {
        alpha_g1: BytesN::from_array(&e, &[0; 64]),
        beta_g2: BytesN::from_array(&e, &[0; 128]),
        gamma_g2: BytesN::from_array(&e, &[0; 128]),
        delta_g2: BytesN::from_array(&e, &[0; 128]),
        ic: Vec::new(&e),
    };
    e.as_contract(&id, || {
        assert_eq!(
            crate::PrivatePool::__constructor(e.clone(), config.clone(), vk.clone(), vk.clone()),
            Err(Error::WrongNetwork)
        )
    });
    e.ledger().set_network_id(
        e.crypto()
            .sha256(&Bytes::from_slice(&e, crate::TESTNET))
            .to_bytes()
            .to_array(),
    );
    e.as_contract(&id, || {
        assert!(matches!(
            crate::PrivatePool::__constructor(e.clone(), config.clone(), vk.clone(), vk.clone()),
            Err(Error::ArtifactsUnavailable | Error::WrongKey)
        ))
    });
}
#[test]
fn repeated_output_commitment_is_rejected_before_verification() {
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (s, t) = sample(&e);
        e.storage()
            .persistent()
            .set(&Key::Commitment(t.commitments.get(0).unwrap()), &true);
        assert_eq!(
            crate::state_checks(&e, &s, &t),
            Err(Error::DuplicateCommitment)
        );
    });
}
fn decimal(value: &str) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    for digit in value.bytes() {
        let mut carry = (digit - b'0') as u16;
        for v in bytes.iter_mut().rev() {
            let n = *v as u16 * 10 + carry;
            *v = n as u8;
            carry = n >> 8;
        }
        assert_eq!(carry, 0);
    }
    bytes
}
fn g1_json(e: &Env, value: &serde_json::Value) -> BytesN<64> {
    let mut b = [0; 64];
    b[..32].copy_from_slice(&decimal(value[0].as_str().unwrap()));
    b[32..].copy_from_slice(&decimal(value[1].as_str().unwrap()));
    BytesN::from_array(e, &b)
}
fn g2_json(e: &Env, value: &serde_json::Value) -> BytesN<128> {
    let mut b = [0; 128];
    for (i, (a, c)) in [(0, 1), (0, 0), (1, 1), (1, 0)].iter().enumerate() {
        b[i * 32..(i + 1) * 32].copy_from_slice(&decimal(value[*a][*c].as_str().unwrap()));
    }
    BytesN::from_array(e, &b)
}
#[test]
fn generic_pairing_verifier_uses_real_existing_proof_and_rejects_changed_statement() {
    // This authentic one-input preimage fixture tests only the generic verifier.
    // It is NEVER installable as the pool's required157-input pinned key.
    let e = Env::default();
    let json: serde_json::Value =
        serde_json::from_str(include_str!("../../zk-preimage/artifacts/vk.json")).unwrap();
    let proof_json: serde_json::Value =
        serde_json::from_str(include_str!("../../zk-preimage/artifacts/proof.json")).unwrap();
    let public: serde_json::Value =
        serde_json::from_str(include_str!("../../zk-preimage/artifacts/public.json")).unwrap();
    let vk = verifier::VerifyingKey {
        alpha_g1: g1_json(&e, &json["vk_alpha_1"]),
        beta_g2: g2_json(&e, &json["vk_beta_2"]),
        gamma_g2: g2_json(&e, &json["vk_gamma_2"]),
        delta_g2: g2_json(&e, &json["vk_delta_2"]),
        ic: soroban_sdk::vec![&e, g1_json(&e, &json["IC"][0]), g1_json(&e, &json["IC"][1])],
    };
    let mut proof = Bytes::from(g1_json(&e, &proof_json["pi_a"]));
    proof.append(&g2_json(&e, &proof_json["pi_b"]).into());
    proof.append(&g1_json(&e, &proof_json["pi_c"]).into());
    let input = soroban_sdk::vec![
        &e,
        BytesN::from_array(&e, &decimal(public[0].as_str().unwrap()))
    ];
    assert!(verifier::verify(&e, &vk, &proof, &input));
    assert!(!verifier::key_matches(
        &e,
        &vk,
        157,
        &crate::pins::MAIN_VK_HASH
    ));
    e.cost_estimate().budget().reset_default();
    assert!(!verifier::verify(
        &e,
        &vk,
        &proof,
        &soroban_sdk::vec![&e, hash::u64_field(&e, 1)]
    ));
    let mut changed = proof.clone();
    for (i, v) in verifier::FR_MODULUS.iter().enumerate() {
        changed.set(i as u32, *v);
    }
    assert!(!verifier::verify(&e, &vk, &changed.slice(..255), &input));
    // A noncanonical C coordinate must reject before modular negation/host checks.
    for i in 224..256 {
        changed.set(i, 255);
    }
    assert!(!verifier::verify(&e, &vk, &changed, &input));
}
fn hex32(value: &str) -> [u8; 32] {
    let mut b = [0; 32];
    for i in 0..32 {
        b[i] = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).unwrap();
    }
    b
}
#[test]
fn typed_domain_asset_and_account_hashes_match_stellar_sdk_and_poseidon_lite() {
    let e = Env::default();
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("address_fixture.json")).unwrap();
    let address = |name: &str| {
        Address::from_string(&soroban_sdk::String::from_str(
            &e,
            fixture[name].as_str().unwrap(),
        ))
    };
    e.ledger()
        .set_network_id(hex32(fixture["network"].as_str().unwrap()));
    let id = e.register_at(&address("pool"), StorageFrame, ());
    e.as_contract(&id, || {
        let mut p = hash::Poseidon::new(&e);
        assert_eq!(
            p.domain().to_array(),
            hex32(fixture["domain"].as_str().unwrap())
        );
        assert_eq!(
            p.tagged_address(b"AGYION_ASSET_V2\0", &address("asset"))
                .to_array(),
            hex32(fixture["assetId"].as_str().unwrap())
        );
        assert_eq!(
            p.tagged_address(b"AGYION_ACCOUNT_V2\0", &address("account"))
                .to_array(),
            hex32(fixture["accountId"].as_str().unwrap())
        );
    });
}
fn field_decimal(field: &BytesN<32>) -> std::string::String {
    let mut digits = std::vec![0u16];
    for b in field.to_array() {
        let mut carry = b as u16;
        for digit in digits.iter_mut() {
            let n = *digit * 256 + carry;
            *digit = n % 10;
            carry = n / 10;
        }
        while carry != 0 {
            digits.push(carry % 10);
            carry /= 10;
        }
    }
    digits
        .iter()
        .rev()
        .map(|d| char::from(b'0' + *d as u8))
        .collect()
}
fn address_text(address: &Address) -> std::string::String {
    let s = address.to_string();
    let mut bytes = std::vec![0u8;s.len() as usize];
    s.copy_into_slice(&mut bytes);
    std::string::String::from_utf8(bytes).unwrap()
}
#[test]
fn export_stable_native_host_configuration() {
    let identity: serde_json::Value =
        serde_json::from_str(include_str!("host_identity_fixture.json")).unwrap();
    let e = Env::default();
    e.ledger().set_sequence_number(1000);
    e.ledger().set_network_id(
        e.crypto()
            .sha256(&Bytes::from_slice(&e, crate::TESTNET))
            .to_bytes()
            .to_array(),
    );
    let address = |name: &str| {
        Address::from_string(&soroban_sdk::String::from_str(
            &e,
            identity[name].as_str().unwrap(),
        ))
    };
    // SAC MUST be the first generator-consuming registration on this fresh Env.
    let asset = e
        .register_stellar_asset_contract_v2(address("admin"))
        .address();
    let id = e.register_at(&address("pool"), StorageFrame, ());
    let fixture=e.as_contract(&id,||{let mut p=hash::Poseidon::new(&e);let asset_id=p.tagged_address(b"AGYION_ASSET_V2\0",&asset);let root=p.policy_root(&soroban_sdk::vec![&e,asset_id.clone()]);serde_json::json!({
 "schema":"agyion-private-pool-native-fixture-v2","testOnly":true,"ledger":1000,"networkPassphrase":"Test SDF Network ; September 2015","pool":identity["pool"],"asset":address_text(&asset),"admin":identity["admin"],"funder":identity["funder"],"recipient":identity["recipient"],"fee":identity["fee"],"domain":field_decimal(&p.domain()),"assetId":field_decimal(&asset_id),"funderId":field_decimal(&p.tagged_address(b"AGYION_ACCOUNT_V2\0",&address("funder"))),"recipientId":field_decimal(&p.tagged_address(b"AGYION_ACCOUNT_V2\0",&address("recipient"))),"feeId":field_decimal(&p.tagged_address(b"AGYION_ACCOUNT_V2\0",&address("fee"))),"assetPolicyRoot":field_decimal(&root),"disclosureEpoch":1,"auditorX":identity["auditorX"],"auditorY":identity["auditorY"],"auditorTestScalar":"7","dkgTranscriptHash":"7777777777777777777777777777777777777777777777777777777777777777","emptyNoteRoot":field_decimal(&BytesN::from_array(&e,&crate::tree_zeros::EMPTY_32)),"emptyRevocationRoot":field_decimal(&BytesN::from_array(&e,&crate::tree_zeros::EMPTY_128))
 })});
    let committed: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/host-config.json")).unwrap();
    assert_eq!(
        fixture, committed,
        "native config must match the committed proof context"
    );
    let expected_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../artifacts/privacy-v2/host-config.json");
    if std::env::var_os("EXPORT_POOL_HOST_CONFIG").is_some() {
        std::fs::create_dir_all(expected_path.parent().unwrap()).unwrap();
        std::fs::write(
            &expected_path,
            serde_json::to_string_pretty(&fixture).unwrap() + "\n",
        )
        .unwrap();
    }
    if expected_path.exists() {
        let old: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(expected_path).unwrap()).unwrap();
        assert_eq!(fixture, old);
    }
}
#[test]
fn expired_nullifier_is_still_rejected_in_native_storage() {
    use soroban_sdk::testutils::storage::Persistent;
    let e = Env::default();
    e.ledger().set_sequence_number(110);
    let id = e.register(StorageFrame, ());
    let (s, mut t) = sample(&e);
    let key = Key::Nullifier(t.nullifiers.get(0).unwrap());
    let ttl = e.as_contract(&id, || {
        let max = e.storage().max_ttl();
        e.storage().instance().extend_ttl(max / 2, max);
        e.storage().persistent().set(&key, &true);
        e.storage().persistent().get_ttl(&key)
    });
    let now = 110 + ttl + 1;
    e.ledger().set_sequence_number(now);
    t.valid_from = now;
    t.valid_until = now + 20;
    let result =
        e.try_as_contract::<_, soroban_sdk::Error>(&id, || crate::state_checks(&e, &s, &t));
    // The native test host keeps this known persistent entry readable after
    // its TTL. Assert the concrete observed guard, not a simulated restore.
    // Ledger-apply archival/restoration requires separate integration evidence.
    assert_eq!(result, Ok(Err(Error::Spent)));
}
fn funded_fixture_env() -> (Env, Address) {
    funded_fixture_env_with_clawback(false)
}
fn funded_fixture_env_with_clawback(clawback: bool) -> (Env, Address) {
    use soroban_sdk::xdr;
    use std::boxed::Box;
    let identity: serde_json::Value =
        serde_json::from_str(include_str!("host_identity_fixture.json")).unwrap();
    let e = Env::default();
    e.ledger().set_sequence_number(1000);
    e.ledger().set_network_id(
        e.crypto()
            .sha256(&Bytes::from_slice(&e, crate::TESTNET))
            .to_bytes()
            .to_array(),
    );
    let admin = Address::from_string(&soroban_sdk::String::from_str(
        &e,
        identity["admin"].as_str().unwrap(),
    ));
    let asset = e.register_stellar_asset_contract_v2(admin).address();
    let asset_text = address_text(&asset);
    let mut snapshot = e.to_snapshot();
    // The fixture issuer permits freezing a trustline, so the integration can
    // exercise an actual outbound SAC failure AFTER an earlier transfer.
    for (_, (entry, _)) in snapshot.ledger.ledger_entries.iter_mut() {
        if let xdr::LedgerEntryData::Account(account) = &mut entry.data {
            account.flags |= 2; // Stellar AUTH_REVOCABLE_FLAG.
            if clawback {
                account.flags |= 8; // Synthetic AUTH_CLAWBACK_ENABLED_FLAG, not Circle USDC.
            }
        }
    }
    // Actual native SAC with funded classic test accounts. These synthetic
    // ledger entries establish reserves; the SAC creates real trustline entries.
    for byte in [3u8, 4, 5] {
        let account_id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
            [byte; 32],
        )));
        let key = xdr::LedgerKey::Account(xdr::LedgerKeyAccount {
            account_id: account_id.clone(),
        });
        let entry = xdr::LedgerEntry {
            last_modified_ledger_seq: 1000,
            ext: xdr::LedgerEntryExt::V0,
            data: xdr::LedgerEntryData::Account(xdr::AccountEntry {
                account_id,
                balance: 1_000_000_000,
                seq_num: xdr::SequenceNumber(0),
                num_sub_entries: 0,
                inflation_dest: None,
                flags: 0,
                home_domain: Default::default(),
                thresholds: xdr::Thresholds([1; 4]),
                signers: Default::default(),
                ext: xdr::AccountEntryExt::V0,
            }),
        };
        snapshot
            .ledger
            .ledger_entries
            .push((Box::new(key), (Box::new(entry), None)));
    }
    let e = Env::from_snapshot(snapshot);
    let asset = Address::from_string(&soroban_sdk::String::from_str(&e, &asset_text));
    e.mock_all_auths();
    let token = soroban_sdk::token::StellarAssetClient::new(&e, &asset);
    for name in ["funder", "recipient", "fee"] {
        let address = Address::from_string(&soroban_sdk::String::from_str(
            &e,
            identity[name].as_str().unwrap(),
        ));
        token.trust(&address);
    }
    (e, asset)
}
#[test]
fn deterministic_fixture_sac_can_fund_the_test_sender() {
    let (e, asset) = funded_fixture_env();
    let identity: serde_json::Value =
        serde_json::from_str(include_str!("host_identity_fixture.json")).unwrap();
    let funder = Address::from_string(&soroban_sdk::String::from_str(
        &e,
        identity["funder"].as_str().unwrap(),
    ));
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&funder, &1000);
    assert_eq!(
        soroban_sdk::token::Client::new(&e, &asset).balance(&funder),
        1000
    );
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/host-config.json")).unwrap();
    assert_eq!(address_text(&asset), expected["asset"].as_str().unwrap());
    let token = soroban_sdk::token::StellarAssetClient::new(&e, &asset);
    token.set_authorized(&funder, &false);
    assert!(!token.authorized(&funder));
    token.set_authorized(&funder, &true);
    assert!(token.authorized(&funder));
}

#[test]
fn enumerable_archive_distinguishes_missing_index_from_end_of_history() {
    let e = Env::default();
    let id = e.register(StorageFrame, ());
    e.as_contract(&id, || {
        let (mut state, _) = sample(&e);
        state.record_count = 2;
        state.revocation_count = 2;
        e.storage().instance().set(&Key::State, &state);
        let record = hash::u64_field(&e, 123);
        crate::persist(&e, &Key::RecordIndex(0), &record);
        let revoked = crate::StoredRevocation {
            ledger: 110,
            tag: hash::u64_field(&e, 456),
            old_root: hash::u64_field(&e, 11),
            new_root: hash::u64_field(&e, 12),
        };
        crate::persist(&e, &Key::RevocationIndex(0), &revoked);
        assert_eq!(
            crate::PrivatePool::record_id_at(e.clone(), 0),
            Ok(Some(record))
        );
        assert_eq!(
            crate::PrivatePool::record_id_at(e.clone(), 1),
            Err(Error::ArchiveUnavailable)
        );
        assert_eq!(crate::PrivatePool::record_id_at(e.clone(), 2), Ok(None));
        assert_eq!(
            crate::PrivatePool::revocation_at(e.clone(), 0)
                .unwrap()
                .unwrap()
                .tag,
            revoked.tag
        );
        assert!(matches!(
            crate::PrivatePool::revocation_at(e.clone(), 1),
            Err(Error::ArchiveUnavailable)
        ));
        assert!(crate::PrivatePool::revocation_at(e.clone(), 2)
            .unwrap()
            .is_none());
    });
}
