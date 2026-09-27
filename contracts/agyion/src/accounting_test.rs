//! Fresh-runtime protection; the exact deployed V3 behavior is tested separately.
use super::*;

fn deficient_pool() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let funder = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(funder.clone());
    sac.issuer().set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
    sac.issuer()
        .set_flag(soroban_sdk::testutils::IssuerFlags::ClawbackEnabledFlag);
    let asset = sac.address();
    let contract = register_kernel(&env, &asset, None);
    let c = AgyionClient::new(&env, &contract);
    let admin = token::StellarAssetClient::new(&env, &asset);
    admin.mint(&funder, &300);
    for _ in 0..2 {
        c.create_pod(
            &funder,
            &asset,
            &100,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &contract, &funder, &asset, 100, 0),
        );
    }
    admin.clawback(&contract, &50);
    (env, contract, asset, funder)
}

#[test]
fn accounting_rejects_new_liability_before_deficit_is_repaired() {
    let (env, contract, asset, funder) = deficient_pool();
    let c = AgyionClient::new(&env, &contract);
    let result = c.try_create_pod(
        &funder,
        &asset,
        &100,
        &0,
        &pod_pubkey(&env),
        &pod_create_proof(&env, &contract, &funder, &asset, 100, 0),
    );
    assert!(
        result.is_err(),
        "fresh funds must not enter an already deficient shared reserve"
    );
    assert_eq!(token::Client::new(&env, &asset).balance(&contract), 150);
    assert_eq!(token::Client::new(&env, &asset).balance(&funder), 100);
}

#[test]
fn accounting_rejects_first_payout_even_when_individual_amount_is_available() {
    let (env, contract, asset, _) = deficient_pool();
    let c = AgyionClient::new(&env, &contract);
    let recipient = Address::generate(&env);
    let result = c.try_claim_pod(
        &1,
        &recipient,
        &pod_signature(&env, &contract, 1, &recipient),
    );
    assert!(
        result.is_err(),
        "the first recipient must not drain another outstanding obligation"
    );
    assert_eq!(c.get_pod(&1).state, 0);
    assert_eq!(token::Client::new(&env, &asset).balance(&contract), 150);
    assert_eq!(token::Client::new(&env, &asset).balance(&recipient), 0);
}

fn backends() -> std::vec::Vec<Option<&'static [u8]>> {
    #[cfg(feature = "wasm-tests")]
    {
        std::vec![
            None,
            Some(include_bytes!(
                "../target/wasm32v1-none/release/agyion.wasm"
            ))
        ]
    }
    #[cfg(not(feature = "wasm-tests"))]
    {
        std::vec![None]
    }
}

#[test]
fn accounting_cross_template_deficit_and_full_repair_preserve_all_obligations() {
    for wasm in backends() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(owner.clone());
        sac.issuer().set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
        sac.issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::ClawbackEnabledFlag);
        let asset = sac.address();
        let kernel = register_kernel(&env, &asset, wasm);
        let c = AgyionClient::new(&env, &kernel);
        let admin = token::StellarAssetClient::new(&env, &asset);
        let token = token::Client::new(&env, &asset);
        admin.mint(&owner, &400);
        let fade = c.create_fade(
            &owner,
            &asset,
            &100,
            &-25,
            &-25,
            &0,
            &1,
            &10,
            &10,
            &venue_pubkey(&env),
        );
        let pod = c.create_pod(
            &owner,
            &asset,
            &100,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &kernel, &owner, &asset, 100, 0),
        );
        let trigger = c.create_trigger(
            &owner,
            &asset,
            &100,
            &recipient,
            &attester_pubkey(&env),
            &10,
        );
        c.claim(&fade, &recipient);
        assert_eq!(c.asset_liability(&asset), 300);
        admin.clawback(&kernel, &50);
        for repair in [0, 49] {
            if repair > 0 {
                admin.mint(&kernel, &repair);
            }
            assert_eq!(
                c.try_create_fade(
                    &owner,
                    &asset,
                    &100,
                    &0,
                    &0,
                    &0,
                    &1,
                    &10,
                    &10,
                    &venue_pubkey(&env)
                ),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                c.try_create_trigger(
                    &owner,
                    &asset,
                    &100,
                    &recipient,
                    &attester_pubkey(&env),
                    &10
                ),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                c.try_create_pod(
                    &owner,
                    &asset,
                    &100,
                    &0,
                    &pod_pubkey(&env),
                    &pod_create_proof(&env, &kernel, &owner, &asset, 100, 0)
                ),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                c.try_confirm_handoff(&fade, &7, &sign_handoff(&env, &kernel, fade, &recipient, 7)),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                c.try_claim_pod(
                    &pod,
                    &recipient,
                    &pod_signature(&env, &kernel, pod, &recipient)
                ),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                c.try_attest(
                    &trigger,
                    &7,
                    &sign_attest(&env, &kernel, trigger, &recipient, 7)
                ),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(c.get_fade(&fade).state, 1);
            assert_eq!(c.get_pod(&pod).state, 0);
            assert_eq!(c.get_trigger(&trigger).state, 0);
            assert_eq!(c.asset_liability(&asset), 300);
            assert_eq!(token.balance(&owner), 100);
            assert_eq!(token.balance(&recipient), 0);
        }
        env.ledger().set_sequence_number(11);
        assert_eq!(c.try_refund(&fade), Err(Ok(Error::Accounting)));
        assert_eq!(c.try_refund_trigger(&trigger), Err(Ok(Error::Accounting)));
        admin.mint(&kernel, &1);
        c.refund(&fade);
        c.refund_trigger(&trigger);
        assert_eq!(c.asset_liability(&asset), 100);
        c.claim_pod(
            &pod,
            &recipient,
            &pod_signature(&env, &kernel, pod, &recipient),
        );
        assert_eq!(c.asset_liability(&asset), 0);
        assert_eq!(token.balance(&kernel), 0);
        assert_eq!(token.balance(&owner), 300);
        assert_eq!(token.balance(&recipient), 100);
        assert_eq!(
            c.try_claim_pod(
                &pod,
                &recipient,
                &pod_signature(&env, &kernel, pod, &recipient)
            ),
            Err(Ok(Error::InvalidState))
        );
        // Failed creations did not consume any IDs.
        let next = c.create_pod(
            &owner,
            &asset,
            &100,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &kernel, &owner, &asset, 100, 0),
        );
        assert_eq!(next, 2);
        assert_eq!(c.asset_liability(&asset), 100);
    }
}

#[test]
fn accounting_deficit_is_asset_scoped_and_donations_do_not_create_claims() {
    for wasm in backends() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let first = env.register_stellar_asset_contract_v2(owner.clone());
        first.issuer().set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
        first
            .issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::ClawbackEnabledFlag);
        let a = first.address();
        let b = env
            .register_stellar_asset_contract_v2(owner.clone())
            .address();
        let args = (soroban_sdk::vec![&env, a.clone(), b.clone()],);
        let kernel = match wasm {
            Some(w) => env.register(w, args),
            None => env.register(Agyion, args),
        };
        let c = AgyionClient::new(&env, &kernel);
        for asset in [&a, &b] {
            token::StellarAssetClient::new(&env, asset).mint(&owner, &100);
            c.create_pod(
                &owner,
                asset,
                &100,
                &0,
                &pod_pubkey(&env),
                &pod_create_proof(&env, &kernel, &owner, asset, 100, 0),
            );
        }
        token::StellarAssetClient::new(&env, &a).clawback(&kernel, &50);
        token::StellarAssetClient::new(&env, &b).mint(&kernel, &900);
        assert_eq!(c.asset_liability(&a), 100);
        assert_eq!(c.asset_liability(&b), 100);
        c.claim_pod(&2, &owner, &pod_signature(&env, &kernel, 2, &owner));
        assert_eq!(c.asset_liability(&b), 0);
        assert_eq!(token::Client::new(&env, &b).balance(&kernel), 900);
        assert_eq!(
            c.try_claim_pod(&1, &owner, &pod_signature(&env, &kernel, 1, &owner)),
            Err(Ok(Error::Accounting))
        );
        assert_eq!(c.get_pod(&1).state, 0);
    }
}

#[test]
fn accounting_missing_config_or_counter_never_reinitializes_debt() {
    for wasm in backends() {
        for missing in 0..4 {
            let env = Env::default();
            env.mock_all_auths();
            let owner = Address::generate(&env);
            let asset = env
                .register_stellar_asset_contract_v2(owner.clone())
                .address();
            let kernel = register_kernel(&env, &asset, wasm);
            let c = AgyionClient::new(&env, &kernel);
            token::StellarAssetClient::new(&env, &asset).mint(&owner, &200);
            let create = || {
                c.try_create_pod(
                    &owner,
                    &asset,
                    &100,
                    &0,
                    &pod_pubkey(&env),
                    &pod_create_proof(&env, &kernel, &owner, &asset, 100, 0),
                )
            };
            assert_eq!(create(), Ok(Ok(1)));
            env.as_contract(&kernel, || {
                if missing == 0 || missing == 3 {
                    env.storage()
                        .persistent()
                        .remove(&crate::DataKey::Liability(asset.clone()));
                }
                if missing == 1 || missing == 3 {
                    env.storage()
                        .instance()
                        .remove(&crate::DataKey::AccountingVersion);
                }
                if missing == 2 || missing == 3 {
                    env.storage().instance().remove(&crate::DataKey::Assets);
                }
            });
            assert_eq!(create(), Err(Ok(Error::ArchiveUnavailable)));
            assert_eq!(
                c.try_claim_pod(&1, &owner, &pod_signature(&env, &kernel, 1, &owner)),
                Err(Ok(Error::ArchiveUnavailable))
            );
            assert_eq!(token::Client::new(&env, &asset).balance(&kernel), 100);
            assert_eq!(token::Client::new(&env, &asset).balance(&owner), 100);
            env.as_contract(&kernel, || {
                assert_eq!(
                    env.storage()
                        .persistent()
                        .get::<_, crate::Pod>(&crate::DataKey::Pod(1))
                        .unwrap()
                        .state,
                    0
                );
                assert_eq!(
                    env.storage()
                        .instance()
                        .get::<_, u64>(&crate::DataKey::PodCount),
                    Some(1)
                );
            });
        }
    }
}

#[test]
fn accounting_kernel_and_asset_destinations_cannot_discharge_custody() {
    for wasm in backends() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(owner.clone())
            .address();
        let kernel = register_kernel(&env, &asset, wasm);
        let c = AgyionClient::new(&env, &kernel);
        token::StellarAssetClient::new(&env, &asset).mint(&owner, &300);
        let pod = c.create_pod(
            &owner,
            &asset,
            &100,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &kernel, &owner, &asset, 100, 0),
        );
        let fade = c.create_fade(
            &owner,
            &asset,
            &100,
            &-10,
            &-10,
            &0,
            &1,
            &10,
            &10,
            &venue_pubkey(&env),
        );
        for bad in [&kernel, &asset] {
            assert_eq!(
                c.try_claim_pod(&pod, bad, &pod_signature(&env, &kernel, pod, bad)),
                Err(Ok(Error::InvalidInput))
            );
            assert_eq!(c.try_claim(&fade, bad), Err(Ok(Error::InvalidInput)));
            assert_eq!(
                c.try_create_trigger(&owner, &asset, &100, bad, &attester_pubkey(&env), &10),
                Err(Ok(Error::InvalidInput))
            );
            assert_eq!(
                c.try_create_fade(
                    bad,
                    &asset,
                    &100,
                    &0,
                    &0,
                    &0,
                    &1,
                    &10,
                    &10,
                    &venue_pubkey(&env)
                ),
                Err(Ok(Error::InvalidInput))
            );
            assert_eq!(
                c.try_create_pod(
                    bad,
                    &asset,
                    &100,
                    &0,
                    &pod_pubkey(&env),
                    &pod_create_proof(&env, &kernel, bad, &asset, 100, 0)
                ),
                Err(Ok(Error::InvalidInput))
            );
        }
        assert_eq!(c.get_pod(&pod).state, 0);
        assert_eq!(c.get_fade(&fade).state, 0);
        assert_eq!(c.asset_liability(&asset), 200);
        assert_eq!(token::Client::new(&env, &asset).balance(&kernel), 200);
    }
}

#[test]
fn accounting_positive_self_purchase_retains_sac_balance_and_root_auth_rules() {
    for wasm in backends() {
        for funds in [100, 125] {
            let env = Env::default();
            env.mock_all_auths();
            let seller = Address::generate(&env);
            let asset = env
                .register_stellar_asset_contract_v2(seller.clone())
                .address();
            let kernel = register_kernel(&env, &asset, wasm);
            let c = AgyionClient::new(&env, &kernel);
            token::StellarAssetClient::new(&env, &asset).mint(&seller, &funds);
            let id = c.create_fade(
                &seller,
                &asset,
                &100,
                &25,
                &25,
                &0,
                &1,
                &10,
                &10,
                &venue_pubkey(&env),
            );
            c.claim(&id, &seller);
            let sig = sign_handoff(&env, &kernel, id, &seller, 7);
            env.set_auths(&[]);
            assert!(c.try_confirm_handoff(&id, &7, &sig).is_err());
            env.mock_all_auths();
            let result = c.try_confirm_handoff(&id, &7, &sig);
            if funds == 100 {
                assert!(result.is_err());
                assert_eq!(c.asset_liability(&asset), 100);
                assert_eq!(c.get_fade(&id).state, 1);
                env.ledger().set_sequence_number(11);
                c.refund(&id);
            } else {
                assert_eq!(result, Ok(Ok(())));
                assert_eq!(c.get_fade(&id).state, 2);
            }
            assert_eq!(c.asset_liability(&asset), 0);
            assert_eq!(token::Client::new(&env, &asset).balance(&kernel), 0);
            assert_eq!(token::Client::new(&env, &asset).balance(&seller), funds);
        }
    }
}

#[test]
fn accounting_constructor_is_bounded_canonical_and_not_reinitializable() {
    for wasm in backends() {
        for invalid in 0..5 {
            let env = Env::default();
            let owner = Address::generate(&env);
            let asset = env
                .register_stellar_asset_contract_v2(owner.clone())
                .address();
            let mut assets = soroban_sdk::vec![&env, asset.clone()];
            match invalid {
                0 => assets = soroban_sdk::Vec::new(&env),
                1 => assets.push_back(asset),
                2 => {
                    for _ in 0..8 {
                        assets.push_back(
                            env.register_stellar_asset_contract_v2(owner.clone())
                                .address(),
                        );
                    }
                }
                3 => assets.push_back(Address::generate(&env)),
                _ => assets.push_back(
                    env.register(review::NestedTransferToken, (owner.clone(), asset, owner)),
                ),
            }
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match wasm {
                Some(w) => env.register(w, (assets,)),
                None => env.register(Agyion, (assets,)),
            }));
            assert!(result.is_err(), "invalid constructor allowlist accepted");
        }
        let env = Env::default();
        let owner = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(owner).address();
        let kernel = register_kernel(&env, &asset, wasm);
        let c = AgyionClient::new(&env, &kernel);
        assert_eq!(c.protocol_version(), 4);
        assert_eq!(c.supported_assets(), soroban_sdk::vec![&env, asset.clone()]);
        assert_eq!(c.asset_liability(&asset), 0);
        use soroban_sdk::IntoVal;
        assert!(env
            .try_invoke_contract::<(), Error>(
                &kernel,
                &soroban_sdk::Symbol::new(&env, "__constructor"),
                (soroban_sdk::vec![&env, asset.clone()],).into_val(&env)
            )
            .is_err());
        assert_eq!(c.asset_liability(&asset), 0);
    }
}

#[test]
fn accounting_canonical_issuer_mint_and_burn_use_exact_pool_deltas() {
    for wasm in backends() {
        let env = Env::default();
        env.mock_all_auths();
        let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let issuer = sac.issuer().address();
        let asset = sac.address();
        let kernel = register_kernel(&env, &asset, wasm);
        let c = AgyionClient::new(&env, &kernel);
        let token = token::Client::new(&env, &asset);
        let issuer_before = token.balance(&issuer);
        // SAC transfer from its issuer mints; returning to its issuer burns.
        let id = c.create_pod(
            &issuer,
            &asset,
            &100,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &kernel, &issuer, &asset, 100, 0),
        );
        assert_eq!(token.balance(&issuer), issuer_before);
        assert_eq!(token.balance(&kernel), 100);
        assert_eq!(c.asset_liability(&asset), 100);
        c.claim_pod(&id, &issuer, &pod_signature(&env, &kernel, id, &issuer));
        assert_eq!(token.balance(&issuer), issuer_before);
        assert_eq!(token.balance(&kernel), 0);
        assert_eq!(c.asset_liability(&asset), 0);
    }
}

#[test]
fn accounting_checked_total_overflow_does_not_take_new_funds() {
    for wasm in backends() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(owner.clone())
            .address();
        let kernel = register_kernel(&env, &asset, wasm);
        let c = AgyionClient::new(&env, &kernel);
        let admin = token::StellarAssetClient::new(&env, &asset);
        admin.mint(&owner, &i128::MAX);
        c.create_pod(
            &owner,
            &asset,
            &i128::MAX,
            &0,
            &pod_pubkey(&env),
            &pod_create_proof(&env, &kernel, &owner, &asset, i128::MAX, 0),
        );
        admin.mint(&owner, &1);
        assert_eq!(
            c.try_create_pod(
                &owner,
                &asset,
                &1,
                &0,
                &pod_pubkey(&env),
                &pod_create_proof(&env, &kernel, &owner, &asset, 1, 0)
            ),
            Err(Ok(Error::Accounting))
        );
        assert_eq!(c.asset_liability(&asset), i128::MAX);
        assert_eq!(token::Client::new(&env, &asset).balance(&owner), 1);
        assert_eq!(token::Client::new(&env, &asset).balance(&kernel), i128::MAX);
        assert!(matches!(c.try_get_pod(&2), Err(Ok(Error::NotFound))));
        assert!(c
            .try_claim_pod(&1, &owner, &pod_signature(&env, &kernel, 1, &owner))
            .is_err());
        assert_eq!(c.asset_liability(&asset), i128::MAX);
        assert_eq!(c.get_pod(&1).state, 0);
        // A different empty destination permits exact completion after the failure.
        let recipient = Address::generate(&env);
        c.claim_pod(&1, &recipient, &pod_signature(&env, &kernel, 1, &recipient));
        assert_eq!(c.asset_liability(&asset), 0);
        assert_eq!(
            token::Client::new(&env, &asset).balance(&recipient),
            i128::MAX
        );
    }
}
