//! Additional fund-safety evidence for the September 27 source review.
//! All keys, accounts, assets and contracts are local deterministic fixtures.

use super::*;
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

/// Match the public RPC's default recording mode: authorization must be rooted
/// at confirm_handoff, with the positive token payment below that root. Global
/// non-root auth mocks conceal this integration failure.
fn assert_positive_handoff_records_root_authorization(env: &Env, wasm: Option<&[u8]>) {
    use soroban_sdk::testutils::{AuthorizedFunction, AuthorizedInvocation};
    env.mock_all_auths();
    let seller = Address::generate(env);
    let claimant = Address::generate(env);
    let asset = env
        .register_stellar_asset_contract_v2(seller.clone())
        .address();
    let contract_id = register_kernel(env, &asset, wasm);
    let contract = &contract_id;
    let token = token::Client::new(env, &asset);
    let admin = token::StellarAssetClient::new(env, &asset);
    let client = AgyionClient::new(env, contract);
    admin.mint(&seller, &100);
    admin.mint(&claimant, &50);
    let fade = client.create_fade(
        &seller,
        &asset,
        &100,
        &10,
        &10,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(env),
    );
    client.claim(&fade, &claimant);
    let ts = 7;
    let signature = sign_handoff(env, contract, fade, &claimant, ts);
    assert_eq!(
        client.try_confirm_handoff(&fade, &ts, &signature),
        Ok(Ok(())),
        "positive handoff must work with the default root-only RPC auth recording mode",
    );
    assert_eq!(
        env.auths(),
        std::vec![(
            claimant.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract.clone(),
                    soroban_sdk::Symbol::new(env, "confirm_handoff"),
                    (fade, ts, signature).into_val(env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        asset,
                        soroban_sdk::Symbol::new(env, "transfer"),
                        (claimant.clone(), seller.clone(), 10_i128).into_val(env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
    assert_eq!(client.get_fade(&fade).state, 2);
    assert_eq!(token.balance(&seller), 110);
    assert_eq!(token.balance(&claimant), 40);
    assert_eq!(token.balance(contract), 0);
}

fn assert_trigger_failed_payments_preserve_reserves(env: &Env, wasm: Option<&[u8]>) {
    env.mock_all_auths_allowing_non_root_auth();
    let funder = Address::generate(env);
    let beneficiary = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(funder.clone());
    sac.issuer()
        .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
    let asset = sac.address();
    let contract_id = register_kernel(env, &asset, wasm);
    let contract = &contract_id;
    let token = token::Client::new(env, &asset);
    let admin = token::StellarAssetClient::new(env, &asset);
    let client = AgyionClient::new(env, contract);
    admin.mint(&funder, &300);
    let start = env.ledger().sequence();
    let pod = client.create_pod(
        &funder,
        &asset,
        &100,
        &start,
        &pod_pubkey(env),
        &pod_create_proof(env, contract, &funder, &asset, 100, start),
    );
    let paid = client.create_trigger(
        &funder,
        &asset,
        &100,
        &beneficiary,
        &attester_pubkey(env),
        &(start + 10),
    );
    let refunded = client.create_trigger(
        &funder,
        &asset,
        &100,
        &beneficiary,
        &attester_pubkey(env),
        &(start + 10),
    );

    admin.set_authorized(&beneficiary, &false);
    env.set_auths(&[]);
    let signature = sign_attest(env, contract, paid, &beneficiary, 7);
    env.ledger().set_sequence_number(start + 10);
    assert!(client.try_attest(&paid, &7, &signature).is_err());
    assert_eq!(client.get_trigger(&paid).state, 0);
    assert_eq!(client.get_trigger(&refunded).state, 0);
    assert_eq!(client.get_pod(&pod).state, 0);
    assert_eq!(token.balance(contract), 300);
    assert_eq!(token.balance(&funder), 0);
    assert_eq!(token.balance(&beneficiary), 0);

    // The same valid signature can complete at the exact deadline after the
    // recipient becomes receivable. No funder or beneficiary account auth is
    // needed on this relayed path.
    env.mock_all_auths_allowing_non_root_auth();
    admin.set_authorized(&beneficiary, &true);
    admin.set_authorized(&funder, &false);
    env.set_auths(&[]);
    client.attest(&paid, &7, &signature);
    assert_eq!(client.get_trigger(&paid).state, 1);
    assert_eq!(token.balance(&beneficiary), 100);

    env.ledger().set_sequence_number(start + 11);
    assert!(client.try_refund_trigger(&refunded).is_err());
    assert_eq!(client.get_trigger(&refunded).state, 0);
    assert_eq!(client.get_pod(&pod).state, 0);
    assert_eq!(token.balance(contract), 200);
    assert_eq!(token.balance(&funder), 0);
    env.mock_all_auths_allowing_non_root_auth();
    admin.set_authorized(&funder, &true);
    env.set_auths(&[]);
    client.refund_trigger(&refunded);
    assert_eq!(client.get_trigger(&refunded).state, 2);
    assert_eq!(token.balance(&funder), 100);
    assert_eq!(token.balance(contract), 100);

    // Neither the successful payout nor the refund can be replayed to consume
    // the remaining Pod's reserve.
    assert_eq!(
        client.try_attest(&paid, &7, &signature),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        client.try_refund_trigger(&paid),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        client.try_refund_trigger(&refunded),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(token.balance(contract), 100);
}

fn assert_envoy_without_owner_auth_and_failed_claim_accounting(env: &Env, wasm: Option<&[u8]>) {
    env.mock_all_auths_allowing_non_root_auth();
    let owner = Address::generate(env);
    let seller = Address::generate(env);
    let asset = env
        .register_stellar_asset_contract_v2(seller.clone())
        .address();
    let contract_id = register_kernel(env, &asset, wasm);
    let contract = &contract_id;
    let token = token::Client::new(env, &asset);
    token::StellarAssetClient::new(env, &asset).mint(&seller, &300);
    let client = AgyionClient::new(env, contract);
    let start = env.ledger().sequence();
    let mandate = client.create_mandate(&owner, &agent_pubkey(env), &1, &1, &(start + 10));
    let second_mandate = client.create_mandate(&owner, &agent_pubkey(env), &1, &1, &(start + 20));
    let mut fades = std::vec::Vec::new();
    for _ in 0..3 {
        fades.push(client.create_fade(
            &seller,
            &asset,
            &100,
            &-20,
            &-20,
            &0,
            &1,
            &100,
            &10,
            &venue_pubkey(env),
        ));
    }
    let first = fades[0];
    let sig = sign_envoy(env, contract, mandate, first, 7);
    env.set_auths(&[]);
    // Credential fields, network and account authorization are independent.
    assert!(client
        .try_envoy_claim(&mandate, &fades[1], &7, &sig)
        .is_err());
    assert!(client
        .try_envoy_claim(&second_mandate, &first, &7, &sig)
        .is_err());
    assert!(client.try_envoy_claim(&mandate, &first, &8, &sig).is_err());
    let original_network = env.ledger().network_id().to_array();
    env.ledger().with_mut(|ledger| ledger.network_id = [99; 32]);
    assert!(client.try_envoy_claim(&mandate, &first, &7, &sig).is_err());
    env.ledger()
        .with_mut(|ledger| ledger.network_id = original_network);
    assert_eq!(client.get_mandate(&mandate).claims_used, 0);
    assert_eq!(client.get_mandate(&second_mandate).claims_used, 0);
    for id in &fades {
        assert_eq!(client.get_fade(id).state, 0);
    }

    // Exact last usable ledger, with no mocked owner authorization.
    env.ledger().set_sequence_number(start + 10);
    client.envoy_claim(&mandate, &first, &7, &sig);
    assert_eq!(client.get_fade(&first).claimant, Some(owner.clone()));
    assert_eq!(client.get_mandate(&mandate).claims_used, 1);
    assert_eq!(
        client.try_envoy_claim(&mandate, &first, &7, &sig),
        Err(Ok(Error::InvalidState))
    );
    let missing = 999;
    assert_eq!(
        client.try_envoy_claim(
            &mandate,
            &missing,
            &7,
            &sign_envoy(env, contract, mandate, missing, 7),
        ),
        Err(Ok(Error::NotFound)),
    );
    assert_eq!(client.get_mandate(&mandate).claims_used, 1);
    assert_eq!(client.get_mandate(&mandate).daily_used, 0);
    client.confirm_handoff(&first, &8, &sign_handoff(env, contract, first, &owner, 8));
    assert_eq!(token.balance(&owner), 20);
    assert_eq!(token.balance(&seller), 80);
    assert_eq!(token.balance(contract), 200);

    env.ledger().set_sequence_number(start + 11);
    assert_eq!(
        client.try_envoy_claim(
            &mandate,
            &fades[1],
            &9,
            &sign_envoy(env, contract, mandate, fades[1], 9),
        ),
        Err(Ok(Error::MandateExpired)),
    );
    let signed_before_revoke = sign_envoy(env, contract, second_mandate, fades[2], 9);
    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract,
            fn_name: "revoke_mandate",
            args: (owner.clone(), second_mandate).into_val(env),
            sub_invokes: &[],
        },
    }]);
    client.revoke_mandate(&owner, &second_mandate);
    env.set_auths(&[]);
    assert_eq!(
        client.try_envoy_claim(&second_mandate, &fades[2], &9, &signed_before_revoke),
        Err(Ok(Error::Unauthorized)),
    );
    assert_eq!(client.get_fade(&fades[1]).state, 0);
    assert_eq!(client.get_fade(&fades[2]).state, 0);
    assert_eq!(client.get_mandate(&second_mandate).claims_used, 0);
    assert_eq!(token.balance(contract), 200);
}

/// A deliberately nonstandard local token attempts to propagate the kernel's
/// direct-call authority to a different token contract. It never reaches a real
/// network. The nested call must fail rather than spend an unrelated reserve.
#[contract]
pub(super) struct NestedTransferToken;

#[contractimpl]
impl NestedTransferToken {
    pub fn __constructor(env: Env, kernel: Address, asset: Address, recipient: Address) {
        env.storage()
            .instance()
            .set(&symbol_short!("params"), &(kernel, asset, recipient));
    }

    pub fn transfer(env: Env, from: Address, _to: Address, amount: i128) {
        let (kernel, asset, recipient): (Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("params"))
            .unwrap();
        if from == kernel {
            token::Client::new(&env, &asset).transfer(&kernel, &recipient, &amount);
        }
    }
}

fn assert_nested_token_cannot_spend_other_asset(env: &Env, wasm: Option<&[u8]>) {
    env.mock_all_auths_allowing_non_root_auth();
    let funder = Address::generate(env);
    let recipient = Address::generate(env);
    let foreign_recipient = Address::generate(env);
    let asset = env
        .register_stellar_asset_contract_v2(funder.clone())
        .address();
    let contract_id = register_kernel(env, &asset, wasm);
    let contract = &contract_id;
    token::StellarAssetClient::new(env, &asset).mint(&funder, &100);
    let token = token::Client::new(env, &asset);
    let client = AgyionClient::new(env, contract);
    let pod = client.create_pod(
        &funder,
        &asset,
        &100,
        &0,
        &pod_pubkey(env),
        &pod_create_proof(env, contract, &funder, &asset, 100, 0),
    );
    let foreign_asset = env.register(
        NestedTransferToken,
        (contract.clone(), asset.clone(), foreign_recipient.clone()),
    );
    assert_eq!(client.try_create_trigger(
        &funder, &foreign_asset, &100, &recipient, &attester_pubkey(env), &100,
    ), Err(Ok(Error::UnsupportedAsset)));
    assert!(matches!(client.try_get_trigger(&1), Err(Ok(Error::NotFound))));
    assert_eq!(client.get_pod(&pod).state, 0);
    assert_eq!(token.balance(contract), 100);
    assert_eq!(token.balance(&foreign_recipient), 0);

    // Demonstrate that the independent standard-token obligation remains
    // spendable, using authorization for only the intended Pod recipient.
    let signature = pod_signature(env, contract, pod, &recipient);
    env.mock_auths(&[MockAuth {
        address: &recipient,
        invoke: &MockAuthInvoke {
            contract,
            fn_name: "claim_pod",
            args: (pod, recipient.clone(), signature.clone()).into_val(env),
            sub_invokes: &[],
        },
    }]);
    client.claim_pod(&pod, &recipient, &signature);
    assert_eq!(token.balance(&recipient), 100);
    assert_eq!(token.balance(contract), 0);
    assert_eq!(token.balance(&foreign_recipient), 0);
}

fn assert_reads_maintain_records_and_counters(env: &Env, wasm: Option<&[u8]>) {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
    env.mock_all_auths_allowing_non_root_auth();
    let funder = Address::generate(env);
    let recipient = Address::generate(env);
    let asset = env
        .register_stellar_asset_contract_v2(funder.clone())
        .address();
    let contract_id = register_kernel(env, &asset, wasm);
    let contract = &contract_id;
    token::StellarAssetClient::new(env, &asset).mint(&funder, &600);
    let client = AgyionClient::new(env, contract);
    let start = env.ledger().sequence();
    let create_all = || {
        let fade = client.create_fade(
            &funder,
            &asset,
            &100,
            &0,
            &0,
            &0,
            &1,
            &500_000,
            &10,
            &venue_pubkey(env),
        );
        let pod = client.create_pod(
            &funder,
            &asset,
            &100,
            &500_000,
            &pod_pubkey(env),
            &pod_create_proof(env, contract, &funder, &asset, 100, 500_000),
        );
        let trigger = client.create_trigger(
            &funder,
            &asset,
            &100,
            &recipient,
            &attester_pubkey(env),
            &500_000,
        );
        let mandate = client.create_mandate(&funder, &agent_pubkey(env), &1, &1, &500_000);
        (fade, pod, trigger, mandate)
    };
    assert_eq!(create_all(), (1, 1, 1, 1));
    let keys = [
        crate::DataKey::Fade(1),
        crate::DataKey::Pod(1),
        crate::DataKey::Trigger(1),
        crate::DataKey::Mandate(1),
        crate::DataKey::Liability(asset.clone()),
    ];
    env.as_contract(contract, || {
        for key in &keys {
            assert_eq!(env.storage().persistent().get_ttl(key), crate::TTL_EXTEND);
        }
        assert_eq!(env.storage().instance().get_ttl(), crate::TTL_EXTEND);
    });
    // This is a persisted local invocation, not an RPC simulation and not a
    // network restoration test. It proves the renewal branch before archive.
    env.ledger()
        .set_sequence_number(start + crate::TTL_EXTEND - crate::TTL_THRESHOLD + 1);
    env.as_contract(contract, || {
        assert_eq!(env.storage().instance().get_ttl(), crate::TTL_THRESHOLD - 1);
        for key in &keys {
            assert_eq!(
                env.storage().persistent().get_ttl(key),
                crate::TTL_THRESHOLD - 1
            );
        }
    });
    client.get_fade(&1);
    client.get_pod(&1);
    client.get_trigger(&1);
    client.get_mandate(&1);
    env.as_contract(contract, || {
        assert_eq!(env.storage().instance().get_ttl(), crate::TTL_EXTEND);
        for key in &keys {
            assert_eq!(env.storage().persistent().get_ttl(key), crate::TTL_EXTEND);
        }
    });
    assert_eq!(create_all(), (2, 2, 2, 2));
    assert_eq!(token::Client::new(env, &asset).balance(contract), 600);
    assert_eq!(client.get_pod(&1).amount, 100);
    assert_eq!(client.get_pod(&2).amount, 100);
}

macro_rules! contract_review_case {
    ($native:ident, $wasm:ident, $assertion:ident) => {
        #[test]
        fn $native() {
            let env = Env::default();
            $assertion(&env, None);
        }

        #[test]
        #[cfg(feature = "wasm-tests")]
        fn $wasm() {
            const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/agyion.wasm");
            let env = Env::default();
            $assertion(&env, Some(WASM));
        }
    };
}

contract_review_case!(
    positive_handoff_uses_default_root_auth_recording,
    wasm_positive_handoff_uses_default_root_auth_recording,
    assert_positive_handoff_records_root_authorization
);
contract_review_case!(
    trigger_failed_payout_and_refund_preserve_reserves,
    wasm_trigger_failed_payout_and_refund_preserve_reserves,
    assert_trigger_failed_payments_preserve_reserves
);
contract_review_case!(
    envoy_auth_domains_failures_expiry_and_revocation,
    wasm_envoy_auth_domains_failures_expiry_and_revocation,
    assert_envoy_without_owner_auth_and_failed_claim_accounting
);
contract_review_case!(
    nested_token_call_cannot_spend_other_asset_reserve,
    wasm_nested_token_call_cannot_spend_other_asset_reserve,
    assert_nested_token_cannot_spend_other_asset
);
contract_review_case!(
    reads_renew_all_record_types_without_reusing_ids,
    wasm_reads_renew_all_record_types_without_reusing_ids,
    assert_reads_maintain_records_and_counters
);

// Characterization of the current issuer-trust boundary, not a passing solvency
// guarantee. A local clawback-enabled SAC is deliberately not Circle testnet USDC.
#[cfg(feature = "legacy-wasm-tests")]
fn assert_issuer_clawback_can_leave_later_public_claims_underfunded(env: &Env, contract: &Address) {
    env.mock_all_auths();
    let funder = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(funder.clone());
    sac.issuer().set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
    sac.issuer().set_flag(soroban_sdk::testutils::IssuerFlags::ClawbackEnabledFlag);
    let asset = sac.address();
    let admin = token::StellarAssetClient::new(env, &asset);
    let token = token::Client::new(env, &asset);
    let c = AgyionClient::new(env, contract);
    admin.mint(&funder, &300);
    let create = || c.create_pod(
        &funder, &asset, &100, &0, &pod_pubkey(env),
        &pod_create_proof(env, contract, &funder, &asset, 100, 0),
    );
    let first = create();
    let second = create();
    admin.clawback(contract, &50);
    assert_eq!(token.balance(contract), 150); // Two unpaid 100-unit claims.
    let third = create(); // Current kernel accepts fresh value into deficient backing.
    assert_eq!(token.balance(contract), 250); // Three unpaid 100-unit claims.
    assert_eq!(token.balance(&funder), 0);
    for id in [first, second] {
        let recipient = Address::generate(env);
        c.claim_pod(&id, &recipient, &pod_signature(env, contract, id, &recipient));
        assert_eq!(token.balance(&recipient), 100);
        assert_eq!(c.get_pod(&id).state, 1);
    }
    let last_recipient = Address::generate(env);
    let sig = pod_signature(env, contract, third, &last_recipient);
    assert_eq!(token.balance(contract), 50);
    assert!(c.try_claim_pod(&third, &last_recipient, &sig).is_err());
    assert_eq!(c.get_pod(&third).state, 0);
    assert_eq!(token.balance(contract), 50);
    assert_eq!(token.balance(&last_recipient), 0);
    // Re-authorizing is not recapitalization. Only replacing the burned value
    // enables this later legitimate claim; this is an external issuer action.
    admin.set_authorized(contract, &false);
    admin.set_authorized(contract, &true);
    assert!(c.try_claim_pod(&third, &last_recipient, &sig).is_err());
    admin.mint(contract, &50);
    c.claim_pod(&third, &last_recipient, &sig);
    assert_eq!(token.balance(&last_recipient), 100);
    assert_eq!(token.balance(contract), 0);
    assert_eq!(c.get_pod(&third).state, 1);
    assert!(c.try_claim_pod(&third, &last_recipient, &sig).is_err());
}

/// Explicit legacy proof, never a prevention test of the fresh V4 runtime.
#[test]
#[cfg(feature = "legacy-wasm-tests")]
fn legacy_active_wasm_issuer_clawback_characterization() {
    let path = std::env::var_os("AGYION_ISSUER_REVIEW_WASM")
        .expect("legacy characterization requires exact active V3 WASM path");
    let bytes = std::fs::read(path).expect("explicit public WASM unavailable");
    let expected = "1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378";
    assert_eq!(std::format!("{:x}", Sha256::digest(&bytes)), expected);
    let env = Env::default();
    let contract = env.register(bytes.as_slice(), ());
    assert_eq!(AgyionClient::new(&env, &contract).protocol_version(), 3);
    assert_issuer_clawback_can_leave_later_public_claims_underfunded(&env, &contract);
}
