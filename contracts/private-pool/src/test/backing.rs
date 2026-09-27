//! Isolated accounting predicate/storage tests. Actual proof composition and
//! constructor initialization are additionally exercised by integration.rs.
use super::*;
use crate::backing;
use soroban_sdk::testutils::storage::{Instance, Persistent};

fn frame() -> (Env, Address, Address) {
    let e = Env::default();
    e.ledger().set_network_id(
        e.crypto()
            .sha256(&Bytes::from_slice(&e, crate::TESTNET))
            .to_bytes()
            .to_array(),
    );
    e.mock_all_auths();
    let asset = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    let frame = e.register(StorageFrame, ());
    e.as_contract(&frame, || {
        let c = PoolConfig {
            domain: hash::u64_field(&e, 1),
            asset_ids: soroban_sdk::vec![&e, hash::u64_field(&e, 2)],
            asset_policy_root: hash::u64_field(&e, 3),
            config: Config {
                assets: soroban_sdk::vec![&e, asset.clone()],
                disclosure_epoch: 1,
                auditor_x: hash::u64_field(&e, 1),
                auditor_y: hash::u64_field(&e, 2),
                dkg_transcript_hash: hash::u64_field(&e, 4),
            },
        };
        e.storage().instance().set(&Key::Config, &c);
        crate::persist(&e, &Key::Liability(asset.clone()), &1000i128);
    });
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&frame, &1000);
    (e, asset, frame)
}

#[test]
fn backing_public_flow_equations_and_donations_do_not_change_liabilities() {
    for (kind, amount, fee, expected) in [
        (1, 200, 7, 1193),
        (2, 200, 7, 793),
        (0, 0, 7, 993),
        (1, 200, 0, 1200),
    ] {
        let (e, asset, frame) = frame();
        soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&frame, &500);
        e.as_contract(&frame, || {
            let (_, mut t) = sample(&e);
            t.asset = Some(asset.clone());
            t.bridge_kind = kind;
            t.bridge_amount = amount;
            t.fee_amount = fee;
            backing::prepare(&e, &t)
                .unwrap()
                .unwrap()
                .persist_liability(&e);
            assert_eq!(backing::liability(&e, &asset), Ok(expected));
        });
    }
}

#[test]
fn backing_new_deposits_cannot_conceal_old_deficit_and_hidden_flows_remain_private() {
    let (e, asset, frame) = frame();
    e.as_contract(&frame, || {
        crate::persist(&e, &Key::Liability(asset.clone()), &1500i128);
        let (_, mut t) = sample(&e);
        assert!(backing::prepare(&e, &t).unwrap().is_none());
        t.asset = Some(asset.clone());
        t.bridge_kind = 1;
        t.bridge_amount = 2000;
        assert_eq!(
            backing::prepare(&e, &t).err(),
            Some(Error::InsufficientBacking)
        );
        assert_eq!(backing::liability(&e, &asset), Ok(1500));
        t.bridge_kind = 0;
        t.bridge_amount = 0;
        t.fee_amount = 1;
        assert_eq!(
            backing::prepare(&e, &t).err(),
            Some(Error::InsufficientBacking)
        );
    });
    assert_eq!(
        soroban_sdk::token::Client::new(&e, &asset).balance(&frame),
        1000
    );
}

#[test]
fn backing_missing_negative_underflow_and_overflow_never_default_to_zero() {
    let (e, asset, frame) = frame();
    e.as_contract(&frame, || {
        let key = Key::Liability(asset.clone());
        let (_, mut t) = sample(&e);
        t.asset = Some(asset.clone());
        t.bridge_kind = 2;
        t.bridge_amount = 1001;
        assert_eq!(
            backing::prepare(&e, &t).err(),
            Some(Error::InvalidAccounting)
        );
        e.storage().persistent().remove(&key);
        assert_eq!(
            backing::liability(&e, &asset),
            Err(Error::LiabilityUnavailable)
        );
        t.bridge_kind = 1;
        assert_eq!(
            backing::prepare(&e, &t).err(),
            Some(Error::LiabilityUnavailable)
        );
        crate::persist(&e, &key, &-1i128);
        assert_eq!(
            backing::liability(&e, &asset),
            Err(Error::InvalidAccounting)
        );
        crate::persist(&e, &key, &i128::MAX);
    });
    // Preserve enough real SAC balance for overflow to reach its arithmetic guard.
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&frame, &(i128::MAX - 1000));
    e.as_contract(&frame, || {
        let (_, mut t) = sample(&e);
        t.asset = Some(asset);
        t.bridge_kind = 1;
        t.bridge_amount = 1;
        assert_eq!(
            backing::prepare(&e, &t).err(),
            Some(Error::InvalidAccounting)
        );
    });
}

#[test]
fn backing_getter_refreshes_counter_and_instance_ttl_but_unknown_asset_rejects() {
    let (e, asset, frame) = frame();
    let ttl = e.as_contract(&frame, || {
        e.storage()
            .persistent()
            .get_ttl(&Key::Liability(asset.clone()))
    });
    e.ledger()
        .with_mut(|info| info.sequence_number += ttl / 2 + 1);
    e.as_contract(&frame, || {
        assert_eq!(
            crate::PrivatePool::liability(e.clone(), asset.clone()),
            Ok(1000)
        );
        assert_eq!(
            e.storage().persistent().get_ttl(&Key::Liability(asset)),
            e.storage().max_ttl()
        );
        assert_eq!(e.storage().instance().get_ttl(), e.storage().max_ttl());
        assert_eq!(
            backing::liability(&e, &Address::generate(&e)),
            Err(Error::UnknownAsset)
        );
    });
}

#[test]
fn backing_asset_identity_is_host_attested_not_a_token_metadata_claim() {
    let (e, asset, frame) = frame();
    assert_eq!(backing::stellar_asset(&asset), Ok(()));
    assert_eq!(backing::stellar_asset(&frame), Err(Error::UnknownAsset));
    assert_eq!(
        backing::stellar_asset(&Address::generate(&e)),
        Err(Error::UnknownAsset)
    );
    let account = Address::from_string(&soroban_sdk::String::from_str(
        &e,
        "GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA",
    ));
    assert_eq!(backing::stellar_asset(&account), Err(Error::UnknownAsset));
}

#[test]
fn backing_detects_an_unexpected_pool_balance_delta() {
    let (e, asset, frame) = frame();
    let recipient = e.register(StorageFrame, ());
    let mut plan = e.as_contract(&frame, || {
        let (_, mut t) = sample(&e);
        t.asset = Some(asset.clone());
        t.bridge_kind = 2;
        t.bridge_amount = 10;
        backing::prepare(&e, &t).unwrap().unwrap()
    });
    // Deliberate test-only interposition between snapshot and transfer. A
    // normal SAC transfer does not mint this extra token.
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&frame, &1);
    e.as_contract(&frame, || {
        assert_eq!(
            plan.transfer(&e, &frame, &recipient, 10, false),
            Err(Error::UnexpectedBalance)
        );
    });
}

#[test]
fn backing_asset_contract_cannot_receive_bridge_or_fee_value() {
    let (e, asset, frame) = frame();
    e.ledger().set_sequence_number(110);
    e.as_contract(&frame, || {
        let (state, mut t) = sample(&e);
        t.asset = Some(asset.clone());
        t.bridge_kind = 2;
        t.bridge_amount = 1;
        t.bridge_account = Some(asset.clone());
        assert_eq!(
            crate::state_checks(&e, &state, &t),
            Err(Error::InvalidBridge)
        );
        t.bridge_kind = 0;
        t.bridge_amount = 0;
        t.bridge_account = None;
        t.fee_amount = 1;
        t.fee_account = Some(asset);
        assert_eq!(crate::state_checks(&e, &state, &t), Err(Error::InvalidFee));
    });
}

#[test]
fn backing_deficit_in_another_asset_cannot_block_a_backed_asset() {
    let (e, asset, frame) = frame();
    let other = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    e.as_contract(&frame, || {
        let mut config = crate::config(&e);
        config.config.assets.push_back(other.clone());
        e.storage().instance().set(&Key::Config, &config);
        crate::persist(&e, &Key::Liability(other.clone()), &500i128);
        let (_, mut t) = sample(&e);
        t.asset = Some(asset.clone());
        t.bridge_kind = 2;
        t.bridge_amount = 100;
        backing::prepare(&e, &t)
            .unwrap()
            .unwrap()
            .persist_liability(&e);
        assert_eq!(backing::liability(&e, &asset), Ok(900));
        assert_eq!(backing::liability(&e, &other), Ok(500));
    });
    assert_eq!(
        soroban_sdk::token::Client::new(&e, &other).balance(&frame),
        0
    );
}

#[test]
fn backing_actual_sac_transfers_preserve_surplus_with_inbound_and_self_returned_fee() {
    let (e, asset, frame) = frame();
    // This isolated plumbing test supplies authorization only; the integration
    // suite separately enforces the public proof and deposit source boundary.
    e.mock_all_auths_allowing_non_root_auth();
    let funder = e.register(StorageFrame, ());
    let issuer = soroban_sdk::token::StellarAssetClient::new(&e, &asset);
    issuer.mint(&funder, &200);
    issuer.mint(&frame, &500);
    e.as_contract(&frame, || {
        for (kind, amount, fee, expected) in
            [(1, 200, 7, 1193), (2, 100, 3, 1090), (0, 0, 13, 1077)]
        {
            let (_, mut t) = sample(&e);
            t.asset = Some(asset.clone());
            t.bridge_kind = kind;
            t.bridge_amount = amount;
            t.fee_amount = fee;
            let mut plan = backing::prepare(&e, &t).unwrap().unwrap();
            plan.persist_liability(&e);
            if kind == 1 {
                plan.transfer(&e, &funder, &frame, amount, true).unwrap();
            }
            if kind == 2 {
                plan.transfer(&e, &frame, &funder, amount, false).unwrap();
            }
            plan.transfer(&e, &frame, &funder, fee, false).unwrap();
            assert_eq!(backing::liability(&e, &asset), Ok(expected));
            assert_eq!(
                soroban_sdk::token::Client::new(&e, &asset).balance(&frame),
                expected + 500
            );
        }
    });
}
