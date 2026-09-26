//! Real fixture integration only. Explicit opt-in FAILS if artifacts are absent;
//! there is no verifier substitution or manufactured successful proof.
use super::*;
use crate::{PrivatePool, PrivatePoolClient, VerifyingKey};
use serde_json::{json, Value};
use std::{format, path::PathBuf, string::ToString, vec::Vec as StdVec};

fn artifacts() -> PathBuf {
    std::env::var_os("PRIVATE_POOL_ARTIFACTS")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/verified-v2"))
}
fn results() -> PathBuf {
    std::env::var_os("PRIVATE_POOL_RESULTS")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../artifacts/privacy-v2")
        })
}
fn read(path: &str) -> Value {
    let file = artifacts().join(path);
    serde_json::from_str(
        &std::fs::read_to_string(&file)
            .unwrap_or_else(|e| panic!("Real proof artifact {} unavailable: {e}", file.display())),
    )
    .expect("invalid real proof JSON")
}
fn key(e: &Env, path: &str, count: u64) -> VerifyingKey {
    let v = read(path);
    assert_eq!(v["protocol"], "groth16");
    assert_eq!(v["curve"], "bn128");
    assert_eq!(v["nPublic"], count);
    assert_eq!(v["IC"].as_array().unwrap().len(), count as usize + 1);
    VerifyingKey {
        alpha_g1: g1_json(e, &v["vk_alpha_1"]),
        beta_g2: g2_json(e, &v["vk_beta_2"]),
        gamma_g2: g2_json(e, &v["vk_gamma_2"]),
        delta_g2: g2_json(e, &v["vk_delta_2"]),
        ic: Vec::from_iter(e, v["IC"].as_array().unwrap().iter().map(|p| g1_json(e, p))),
    }
}
fn proof(e: &Env, fixture: &Value) -> Bytes {
    assert_eq!(fixture["testOnly"], true);
    let p = &fixture["proof"];
    assert_eq!(p["protocol"], "groth16");
    assert_eq!(p["curve"], "bn128");
    let mut bytes = Bytes::from(g1_json(e, &p["pi_a"]));
    bytes.append(&g2_json(e, &p["pi_b"]).into());
    bytes.append(&g1_json(e, &p["pi_c"]).into());
    bytes
}
fn field(e: &Env, value: &Value) -> BytesN<32> {
    let bytes = BytesN::from_array(e, &decimal(value.as_str().expect("decimal field")));
    assert!(hash::canonical(&bytes));
    bytes
}
fn inputs(e: &Env, fixture: &Value) -> Vec<BytesN<32>> {
    Vec::from_iter(
        e,
        fixture["publicSignals"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| field(e, n)),
    )
}
fn address(e: &Env, value: &Value) -> Address {
    Address::from_string(&soroban_sdk::String::from_str(e, value.as_str().unwrap()))
}
fn optional_address(e: &Env, value: &Value) -> Option<Address> {
    if value.is_null() {
        None
    } else {
        Some(address(e, value))
    }
}
fn unsigned(f: &Value) -> u64 {
    f.as_str().unwrap().parse().unwrap()
}
fn transition(e: &Env, fixture: &Value, asset: &Address) -> Transition {
    let f = &fixture["publicSignals"];
    assert_eq!(f.as_array().unwrap().len(), 157);
    Transition {
        valid_from: unsigned(&f[6]).try_into().unwrap(),
        valid_until: unsigned(&f[7]).try_into().unwrap(),
        input_root: field(e, &f[8]),
        append_old_root: field(e, &f[9]),
        append_new_root: field(e, &f[10]),
        next_index: unsigned(&f[11]),
        nullifiers: soroban_sdk::vec![e, field(e, &f[12]), field(e, &f[13])],
        commitments: soroban_sdk::vec![e, field(e, &f[14]), field(e, &f[15])],
        bridge_kind: unsigned(&f[16]).try_into().unwrap(),
        asset: if unsigned(&f[16]) != 0 || unsigned(&f[20]) != 0 {
            Some(asset.clone())
        } else {
            None
        },
        bridge_amount: unsigned(&f[18]),
        bridge_account: optional_address(e, &fixture["bridgeAccount"]),
        fee_amount: unsigned(&f[20]),
        fee_account: optional_address(e, &fixture["feeAccount"]),
        ciphertext: Vec::from_iter(
            e,
            f.as_array().unwrap().iter().skip(23).map(|v| field(e, v)),
        ),
    }
}
fn initialized(wasm: bool) -> (Env, Address, Address, Value) {
    let (e, asset) = funded_fixture_env();
    e.cost_estimate().budget().reset_unlimited();
    let host: Value =
        serde_json::from_str(include_str!("../../fixtures/host-config.json")).unwrap();
    let pool = address(&e, &host["pool"]);
    let vk = key(&e, "keys/transition-vk.json", 157);
    let revocation_vk = key(&e, "keys/revocation-vk.json", 4);
    // Missing or incorrect compile-time pins must never be worked around by tests.
    assert!(verifier::key_matches(
        &e,
        &vk,
        157,
        &crate::pins::MAIN_VK_HASH
    ));
    assert!(verifier::key_matches(
        &e,
        &revocation_vk,
        4,
        &crate::pins::REVOCATION_VK_HASH
    ));
    let config = Config {
        assets: soroban_sdk::vec![&e, asset.clone()],
        disclosure_epoch: 1,
        auditor_x: field(&e, &host["auditorX"]),
        auditor_y: field(&e, &host["auditorY"]),
        dkg_transcript_hash: BytesN::from_array(
            &e,
            &hex32(host["dkgTranscriptHash"].as_str().unwrap()),
        ),
    };
    if wasm {
        let path = std::env::var_os("PRIVATE_POOL_WASM")
            .map(PathBuf::from)
            .unwrap_or_else(|| results().join("private_pool.wasm"));
        let bytes = std::fs::read(path).expect("compiled pinned private-pool WASM required");
        e.register_at(&pool, bytes.as_slice(), (config, vk, revocation_vk));
    } else {
        e.register_at(&pool, PrivatePool, (config, vk, revocation_vk));
    }
    let client = PrivatePoolClient::new(&e, &pool);
    let config = client.config();
    assert_eq!(config.domain, field(&e, &host["domain"]));
    assert_eq!(
        config.asset_policy_root,
        field(&e, &host["assetPolicyRoot"])
    );
    assert_eq!(client.state().root, field(&e, &host["emptyNoteRoot"]));
    (e, asset, pool, host)
}
fn balance(e: &Env, asset: &Address, owner: &Address) -> i128 {
    soroban_sdk::token::Client::new(e, asset).balance(owner)
}
fn reset(e: &Env) {
    e.cost_estimate().budget().reset_unlimited();
}
fn submit_fixture(e: &Env, pool: &Address, asset: &Address, fixture: &Value) -> BytesN<32> {
    let t = transition(e, fixture, asset);
    let p = proof(e, fixture);
    reset(e);
    PrivatePoolClient::new(e, pool).submit(&t, &p)
}
fn state_tuple(state: PoolState) -> (BytesN<32>, u64, BytesN<32>, Vec<BytesN<32>>, u64, u64) {
    (
        state.root,
        state.next_index,
        state.revocation_root,
        state.roots,
        state.record_count,
        state.revocation_count,
    )
}
fn hex64(value: &str) -> [u8; 64] {
    let mut b = [0; 64];
    for (i, out) in b.iter_mut().enumerate() {
        *out = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).unwrap();
    }
    b
}
fn measured_cost(e: &Env, step: &Value) -> Value {
    let resources = e.cost_estimate().resources();
    let cpu = e.cost_estimate().budget().cpu_instruction_cost();
    json!({"step":step["name"],"cpu":cpu,"memory":e.cost_estimate().budget().memory_bytes_cost(),
        "belowNativeDefault100M":cpu<=100_000_000,
        "invocation":{"instructions":resources.instructions,"memory":resources.mem_bytes,
            "diskReadEntries":resources.disk_read_entries,"memoryReadEntries":resources.memory_read_entries,
            "writeEntries":resources.write_entries,"diskReadBytes":resources.disk_read_bytes,
            "writeBytes":resources.write_bytes,"contractEventsBytes":resources.contract_events_size_bytes},
        "boundary":"Host invocation estimate; excludes complete transaction envelope and some ledger-apply/XDR overhead."})
}
fn run_chain(wasm: bool) {
    let (e, asset, pool, host) = initialized(wasm);
    let c = PrivatePoolClient::new(&e, &pool);
    let funder = address(&e, &host["funder"]);
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&funder, &1000);
    let chain = read("proofs/chain.json");
    assert_eq!(chain["host"], host);
    assert_eq!(chain["testOnly"], true);
    assert_eq!(chain["steps"].as_array().unwrap().len(), 17);
    let mut costs = StdVec::new();
    let mut record_index = 0;
    let mut revocation_index = 0;
    for step in chain["steps"].as_array().unwrap() {
        let fixture = read(&format!("proofs/{}", step["file"].as_str().unwrap()));
        let f = inputs(&e, &fixture);
        let p = proof(&e, &fixture);
        if step["revocation"] == true {
            assert_eq!(f.len(), 4);
            let owner = BytesN::from_array(&e, &hex32(fixture["ownerKey"].as_str().unwrap()));
            let signature = BytesN::from_array(&e, &hex64(fixture["signature"].as_str().unwrap()));
            let before = state_tuple(c.state());
            let mut wrong = signature.to_array();
            wrong[0] ^= 1;
            reset(&e);
            assert!(c
                .try_revoke(
                    &f.get(3).unwrap(),
                    &f.get(1).unwrap(),
                    &f.get(2).unwrap(),
                    &owner,
                    &BytesN::from_array(&e, &wrong),
                    &p
                )
                .is_err());
            reset(&e);
            assert_eq!(state_tuple(c.state()), before);
            assert_eq!(
                c.try_revoke(
                    &f.get(3).unwrap(),
                    &f.get(1).unwrap(),
                    &f.get(2).unwrap(),
                    &owner,
                    &signature,
                    &p.slice(..255)
                ),
                Err(Ok(Error::InvalidProof))
            );
            reset(&e);
            assert_eq!(state_tuple(c.state()), before);
            reset(&e);
            c.revoke(
                &f.get(3).unwrap(),
                &f.get(1).unwrap(),
                &f.get(2).unwrap(),
                &owner,
                &signature,
                &p,
            );
            let cost = measured_cost(&e, step);
            let saved = c.revocation_at(&revocation_index).unwrap();
            assert_eq!(saved.tag, f.get(3).unwrap());
            assert_eq!(saved.old_root, f.get(1).unwrap());
            assert_eq!(saved.new_root, f.get(2).unwrap());
            assert_eq!(saved.ledger, 1000);
            revocation_index += 1;
            costs.push(cost);
        } else {
            let t = transition(&e, &fixture, &asset);
            // This is the actual deposit authorization requirement; mock auth
            // provides local test account authority, never a bypassed verifier.
            reset(&e);
            let id = c.submit(&t, &p);
            let cost = measured_cost(&e, step);
            assert_eq!(
                id,
                BytesN::from_array(&e, &hex32(fixture["ciphertextDigest"].as_str().unwrap()))
            );
            let stored = c.record(&id).unwrap();
            assert_eq!(stored.ledger, 1000);
            assert_eq!(stored.public_inputs, f);
            assert_eq!(c.record_id_at(&record_index), Some(id));
            record_index += 1;
            for nullifier in t.nullifiers {
                if !hash::is_zero(&nullifier) {
                    assert!(c.spent(&nullifier));
                }
            }
            costs.push(cost);
            continue;
        }
    }
    reset(&e);
    let expected = &chain["expectedBalances"];
    assert_eq!(
        balance(&e, &asset, &pool).to_string(),
        expected["pool"].as_str().unwrap()
    );
    assert_eq!(
        balance(&e, &asset, &address(&e, &host["recipient"])).to_string(),
        expected["recipient"].as_str().unwrap()
    );
    assert_eq!(
        balance(&e, &asset, &address(&e, &host["fee"])).to_string(),
        expected["fee"].as_str().unwrap()
    );
    assert_eq!(
        (balance(&e, &asset, &funder) - 1000).to_string(),
        expected["funderDelta"].as_str().unwrap()
    );
    assert_eq!(c.state().root, field(&e, &chain["finalRoot"]));
    assert_eq!(c.state().next_index, unsigned(&chain["finalIndex"]));
    assert_eq!(
        c.state().revocation_root,
        field(&e, &chain["finalRevocationRoot"])
    );
    assert_eq!(c.state().record_count, 16);
    assert_eq!(c.state().revocation_count, 1);
    assert_eq!(c.record_id_at(&16), None);
    assert!(c.revocation_at(&1).is_none());
    let mode = if wasm { "wasm" } else { "native" };
    std::println!(
        "POOL_CHAIN_{mode} {}",
        serde_json::to_string(&costs).unwrap()
    );
    std::fs::create_dir_all(results()).unwrap();
    std::fs::write(
        results().join(format!("pool-{mode}-costs.json")),
        serde_json::to_string_pretty(&costs).unwrap() + "\n",
    )
    .unwrap();
    std::fs::write(
        results().join(format!("pool-{mode}-host-cost-model.txt")),
        format!("{:?}", e.cost_estimate().budget()),
    )
    .unwrap();
}
#[test]
fn real_native_chain_moves_sac_tokens_and_checks_all_public_records() {
    run_chain(false);
}
#[test]
#[cfg(feature = "wasm-tests")]
fn real_wasm_chain_moves_sac_tokens_and_measures_full_execution() {
    run_chain(true);
}

#[test]
fn real_deposit_rolls_back_every_effect_after_actual_sac_failure_and_can_retry() {
    deposit_failure_rollback(false);
}
#[test]
#[cfg(feature = "wasm-tests")]
fn real_wasm_deposit_failure_rolls_back_every_effect_and_can_retry() {
    deposit_failure_rollback(true);
}
fn deposit_failure_rollback(wasm: bool) {
    let (e, asset, pool, host) = initialized(wasm);
    let c = PrivatePoolClient::new(&e, &pool);
    let fixture = read("proofs/01-deposit.json");
    let t = transition(&e, &fixture, &asset);
    let p = proof(&e, &fixture);
    let id = hash::ciphertext_digest(&e, &t.ciphertext);
    let before = state_tuple(c.state());
    reset(&e);
    assert!(
        c.try_submit(&t, &p).is_err(),
        "unfunded SAC transfer must fail"
    );
    reset(&e);
    assert_eq!(state_tuple(c.state()), before);
    assert!(c.record(&id).is_none());
    assert_eq!(c.record_id_at(&0), None);
    e.as_contract(&pool, || {
        for commitment in t.commitments.iter().filter(|n| !hash::is_zero(n)) {
            assert!(!e.storage().persistent().has(&Key::Commitment(commitment)));
        }
    });
    let funder = address(&e, &host["funder"]);
    assert_eq!(balance(&e, &asset, &funder), 0);
    assert_eq!(balance(&e, &asset, &pool), 0);
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&funder, &1000);
    assert_eq!(submit_fixture(&e, &pool, &asset, &fixture), id);
    assert_eq!(c.record_id_at(&0), Some(id));
    assert_eq!(c.state().record_count, 1);
    assert_eq!(balance(&e, &asset, &pool), 1000);
}

#[test]
fn real_proof_cannot_change_amount_recipient_ciphertext_or_replay_spent_notes() {
    adversarial_public_submission(false);
}
#[test]
#[cfg(feature = "wasm-tests")]
fn real_wasm_rejects_unauthorized_funding_tampered_public_inputs_and_replays() {
    adversarial_public_submission(true);
}
fn adversarial_public_submission(wasm: bool) {
    let (e, asset, pool, host) = initialized(wasm);
    let c = PrivatePoolClient::new(&e, &pool);
    let funder = address(&e, &host["funder"]);
    soroban_sdk::token::StellarAssetClient::new(&e, &asset).mint(&funder, &1000);
    let fixture = read("proofs/01-deposit.json");
    let t = transition(&e, &fixture, &asset);
    let p = proof(&e, &fixture);
    e.set_auths(&[]);
    reset(&e);
    assert!(
        c.try_submit(&t, &p).is_err(),
        "proof possession alone must not debit the funder"
    );
    e.mock_all_auths();
    let mut changed = t.clone();
    changed.bridge_amount += 1;
    reset(&e);
    assert_eq!(c.try_submit(&changed, &p), Err(Ok(Error::InvalidProof)));
    changed = t.clone();
    changed.bridge_account = Some(address(&e, &host["recipient"]));
    reset(&e);
    assert_eq!(c.try_submit(&changed, &p), Err(Ok(Error::InvalidProof)));
    changed = t.clone();
    changed.ciphertext.set(3, hash::u64_field(&e, 1));
    reset(&e);
    assert_eq!(c.try_submit(&changed, &p), Err(Ok(Error::InvalidProof)));
    reset(&e);
    assert_eq!(
        c.try_submit(&t, &p.slice(..255)),
        Err(Ok(Error::InvalidProof))
    );
    submit_fixture(&e, &pool, &asset, &fixture);
    reset(&e);
    assert_eq!(c.try_submit(&t, &p), Err(Ok(Error::StaleRoot)));
    let spend = read("proofs/02-create-pod.json");
    submit_fixture(&e, &pool, &asset, &spend);
    let mut duplicate = transition(&e, &spend, &asset);
    duplicate.append_old_root = c.state().root;
    duplicate.next_index = c.state().next_index;
    reset(&e);
    assert_eq!(
        c.try_submit(&duplicate, &proof(&e, &spend)),
        Err(Ok(Error::Spent))
    );
}

#[test]
fn real_fee_transfer_failure_rolls_back_prior_withdrawal_nullifier_and_archive() {
    fee_failure_rollback(false);
}
#[test]
#[cfg(feature = "wasm-tests")]
fn real_wasm_fee_failure_rolls_back_prior_withdrawal_nullifier_and_archive() {
    fee_failure_rollback(true);
}
fn fee_failure_rollback(wasm: bool) {
    let (e, asset, pool, host) = initialized(wasm);
    let c = PrivatePoolClient::new(&e, &pool);
    let token = soroban_sdk::token::StellarAssetClient::new(&e, &asset);
    let funder = address(&e, &host["funder"]);
    let recipient = address(&e, &host["recipient"]);
    let fee = address(&e, &host["fee"]);
    token.mint(&funder, &1000);
    for name in ["01-deposit", "02-create-pod", "03-claim-pod"] {
        submit_fixture(&e, &pool, &asset, &read(&format!("proofs/{name}.json")));
    }
    let fixture = read("proofs/04-withdraw-pod.json");
    let t = transition(&e, &fixture, &asset);
    let p = proof(&e, &fixture);
    let id = hash::ciphertext_digest(&e, &t.ciphertext);
    let before = state_tuple(c.state());
    token.set_authorized(&fee, &false);
    reset(&e);
    assert!(c.try_submit(&t, &p).is_err());
    reset(&e);
    assert_eq!(state_tuple(c.state()), before);
    assert_eq!(balance(&e, &asset, &pool), 1000);
    assert_eq!(balance(&e, &asset, &recipient), 0);
    assert_eq!(balance(&e, &asset, &fee), 0);
    assert!(c.record(&id).is_none());
    assert_eq!(c.record_id_at(&3), None);
    assert!(!c.spent(&t.nullifiers.get(0).unwrap()));
    token.set_authorized(&fee, &true);
    assert_eq!(submit_fixture(&e, &pool, &asset, &fixture), id);
    assert_eq!(c.record_id_at(&3), Some(id));
    assert_eq!(c.state().record_count, 4);
    assert_eq!(balance(&e, &asset, &pool), 600);
    assert_eq!(balance(&e, &asset, &recipient), 395);
    assert_eq!(balance(&e, &asset, &fee), 5);
}
