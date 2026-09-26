//! Unit tests for SPEC_V2: the 16 v1 scenarios (translated to EN) plus
//! Trigger x4 (attest success / bad sig / refund after deadline / early
//! refund reject), Envoy x5 (claim in cap / cap exceeded / expired / revoked
//! / recipient binding) and one cross-template test (mandate claim settles
//! into the owner's fade claim correctly).
//!
//! Tests use soroban_sdk::testutils::StellarAssetContract as the token.

extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env,
};

use crate::{Agyion, AgyionClient, Error};

struct Setup {
    env: Env,
    client: AgyionClient<'static>,
    asset: Address,
    token: token::Client<'static>,
    token_admin: token::StellarAssetClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    // The claimant->seller payment inside confirm_handoff needs non-root SAC
    // auth; in production the wallet signs the whole auth tree.
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let asset = sac.address();
    let token = token::Client::new(&env, &asset);
    let token_admin = token::StellarAssetClient::new(&env, &asset);

    let contract_id = env.register(Agyion, ());
    let client = AgyionClient::new(&env, &contract_id);

    Setup {
        env,
        client,
        asset,
        token,
        token_admin,
    }
}

/// Test venue key (fixed — deterministic tests).
fn venue() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

fn venue_pubkey(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &venue().verifying_key().to_bytes())
}

/// Test attester key for Trigger.
fn attester() -> SigningKey {
    SigningKey::from_bytes(&[11u8; 32])
}

fn attester_pubkey(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &attester().verifying_key().to_bytes())
}

/// Test agent key for Envoy.
fn agent() -> SigningKey {
    SigningKey::from_bytes(&[21u8; 32])
}

fn agent_pubkey(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &agent().verifying_key().to_bytes())
}

/// Identical to the payload built in the contract:
/// fade_id(8B BE) || claimant(XDR) || ts(8B BE)
fn sign_handoff(
    env: &Env,
    contract: &Address,
    fade_id: u64,
    claimant: &Address,
    ts: u64,
) -> BytesN<64> {
    let mut payload = Bytes::from_slice(env, b"agyion:handoff:v2\0");
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&contract.to_xdr(env));
    payload.append(&Bytes::from_array(env, &fade_id.to_be_bytes()));
    payload.append(&claimant.to_xdr(env));
    payload.append(&Bytes::from_array(env, &ts.to_be_bytes()));

    let msg: std::vec::Vec<u8> = payload.iter().collect();
    let sig = venue().sign(&msg);
    BytesN::from_array(env, &sig.to_bytes())
}

/// Trigger attestation payload: trigger_id(8B BE) || beneficiary(XDR) || ts(8B BE)
fn sign_attest(
    env: &Env,
    contract: &Address,
    trigger_id: u64,
    beneficiary: &Address,
    ts: u64,
) -> BytesN<64> {
    let mut payload = Bytes::from_slice(env, b"agyion:attest:v2\0");
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&contract.to_xdr(env));
    payload.append(&Bytes::from_array(env, &trigger_id.to_be_bytes()));
    payload.append(&beneficiary.to_xdr(env));
    payload.append(&Bytes::from_array(env, &ts.to_be_bytes()));

    let msg: std::vec::Vec<u8> = payload.iter().collect();
    let sig = attester().sign(&msg);
    BytesN::from_array(env, &sig.to_bytes())
}

/// Envoy agent payload: mandate_id(8B BE) || fade_id(8B BE) || ts(8B BE)
fn sign_envoy(env: &Env, contract: &Address, mandate_id: u64, fade_id: u64, ts: u64) -> BytesN<64> {
    let mut payload = Bytes::from_slice(env, b"agyion:envoy:v2\0");
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&contract.to_xdr(env));
    payload.append(&Bytes::from_array(env, &mandate_id.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &fade_id.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &ts.to_be_bytes()));

    let msg: std::vec::Vec<u8> = payload.iter().collect();
    let sig = agent().sign(&msg);
    BytesN::from_array(env, &sig.to_bytes())
}

fn pod_key() -> SigningKey {
    SigningKey::from_bytes(&[37; 32])
}
fn pod_pubkey(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &pod_key().verifying_key().to_bytes())
}
fn pod_create_proof(
    env: &Env,
    contract: &Address,
    funder: &Address,
    asset: &Address,
    amount: i128,
    unlock: u32,
) -> BytesN<64> {
    let mut payload = Bytes::from_slice(env, b"agyion:pod-create:v3\0");
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&contract.to_xdr(env));
    payload.append(&funder.to_xdr(env));
    payload.append(&asset.to_xdr(env));
    payload.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &unlock.to_be_bytes()));
    payload.append(&Bytes::from(pod_pubkey(env)));
    BytesN::from_array(
        env,
        &pod_key()
            .sign(&payload.iter().collect::<std::vec::Vec<u8>>())
            .to_bytes(),
    )
}
fn pod_signature(env: &Env, contract: &Address, pod_id: u64, recipient: &Address) -> BytesN<64> {
    let mut payload = Bytes::from_slice(env, b"agyion:pod-claim:v3\0");
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&contract.to_xdr(env));
    payload.append(&Bytes::from_array(env, &pod_id.to_be_bytes()));
    payload.append(&recipient.to_xdr(env));
    BytesN::from_array(
        env,
        &pod_key()
            .sign(&payload.iter().collect::<std::vec::Vec<u8>>())
            .to_bytes(),
    )
}
fn create_test_pod(s: &Setup, funder: &Address, amount: i128, unlock: u32) -> u64 {
    s.client.create_pod(
        funder,
        &s.asset,
        &amount,
        &unlock,
        &pod_pubkey(&s.env),
        &pod_create_proof(&s.env, &s.client.address, funder, &s.asset, amount, unlock),
    )
}

fn start_ledger(env: &Env) -> u32 {
    env.ledger().sequence()
}

// ---- Scenario 1: happy path (positive price settle) ----
#[test]
fn happy_path_positive_price_settle() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);

    s.token_admin.mint(&seller, &1000);
    s.token_admin.mint(&claimant, &500);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &1000, // pot
        &200,  // start_price
        &0,    // floor_price
        &1,    // slope_num
        &1,    // slope_den: 1 decline per ledger
        &100,  // duration_ledgers
        &10,   // handoff_window
        &venue_pubkey(&s.env),
    );
    assert_eq!(id, 1);
    assert_eq!(s.token.balance(&seller), 0); // pot moved to the contract
    assert_eq!(s.token.balance(&s.client.address), 1000);

    // Claim 10 ledgers later: price = 200 - 10 = 190
    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 10);
    assert_eq!(s.client.fade_price(&id), 190);

    s.client.claim(&id, &claimant);

    s.client.confirm_handoff(
        &id,
        &12345,
        &sign_handoff(&s.env, &s.client.address, id, &claimant, 12345),
    );

    // Settle: claimant pays 190 to the seller; the pot (1000) also returns to the seller.
    assert_eq!(s.token.balance(&seller), 1000 + 190);
    assert_eq!(s.token.balance(&claimant), 500 - 190);
    assert_eq!(s.token.balance(&s.client.address), 0);
}

// ---- Scenario 2: negative price settle (pot -> claimant) ----
#[test]
fn negative_price_settle_pot_to_claimant() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);

    s.token_admin.mint(&seller, &1000);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &1000,
        &100, // start_price
        &-50, // floor_price (negative: the campaign pool pays)
        &2,   // slope_num: 2 decline per ledger
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    // 80 ledgers later: 100 - 160 = -60, stops at the floor -> -50
    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 80);
    assert_eq!(s.client.fade_price(&id), -50);

    s.client.claim(&id, &claimant);
    s.client.confirm_handoff(
        &id,
        &999,
        &sign_handoff(&s.env, &s.client.address, id, &claimant, 999),
    );

    // The claimant receives 50 compensation from the pot, the remaining 950 goes to the seller.
    assert_eq!(s.token.balance(&claimant), 50);
    assert_eq!(s.token.balance(&seller), 950);
    assert_eq!(s.token.balance(&s.client.address), 0);
}

// ---- Scenario 3: refund (deadline passed, no claim) ----
#[test]
fn refund_after_deadline() {
    let s = setup();
    let seller = Address::generate(&s.env);

    s.token_admin.mint(&seller, &700);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &700,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    assert_eq!(s.token.balance(&seller), 0);

    let start = start_ledger(&s.env);

    // Refund rejected before the deadline.
    s.env.ledger().set_sequence_number(start + 100);
    assert_eq!(s.client.try_refund(&id), Err(Ok(Error::DeadlinePassed)));

    // Deadline passed: nobody claimed, the pot returns to the seller.
    s.env.ledger().set_sequence_number(start + 101);
    s.client.refund(&id);
    assert_eq!(s.token.balance(&seller), 700);
    assert_eq!(s.token.balance(&s.client.address), 0);

    // Second refund: the state machine is single-direction, rejected.
    assert_eq!(s.client.try_refund(&id), Err(Ok(Error::DeadlinePassed)));
}

// ---- Scenario 4: no-show refund (handoff_window elapsed, no handoff) ----
#[test]
fn no_show_refund_after_handoff_window() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);

    s.token_admin.mint(&seller, &400);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &400,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 5);
    s.client.claim(&id, &claimant);

    // Refund rejected within the handoff_window (10).
    s.env.ledger().set_sequence_number(start + 15);
    assert_eq!(s.client.try_refund(&id), Err(Ok(Error::DeadlinePassed)));

    // Window elapsed: claimed_at + handoff_window passed -> refund.
    s.env.ledger().set_sequence_number(start + 16);
    s.client.refund(&id);
    assert_eq!(s.token.balance(&seller), 400);
}

// ---- Scenario 5: pod (early claim reject + timely open + wrong preimage reject) ----
#[test]
fn pod_early_wrong_and_timely_claim() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &800);
    let unlock = start_ledger(&s.env) + 50;
    let id = create_test_pod(&s, &funder, 800, unlock);
    let signature = pod_signature(&s.env, &s.client.address, id, &recipient);
    assert_eq!(s.token.balance(&funder), 0);
    assert_eq!(
        s.client.try_claim_pod(&id, &recipient, &signature),
        Err(Ok(Error::Locked))
    );
    s.env.ledger().set_sequence_number(unlock);
    let wrong = BytesN::from_array(&s.env, &[1; 64]);
    assert!(s.client.try_claim_pod(&id, &recipient, &wrong).is_err());
    assert_eq!(s.client.get_pod(&id).state, 0);
    s.client.claim_pod(&id, &recipient, &signature);
    assert_eq!(s.token.balance(&recipient), 800);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(
        s.client.try_claim_pod(&id, &recipient, &signature),
        Err(Ok(Error::InvalidState))
    );
}

// ---- Views: get_fade / get_pod ----
#[test]
fn get_fade_view_record_and_missing() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &1000);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &1000,
        &200,
        &-50,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    let f = s.client.get_fade(&id);
    assert_eq!(f.seller, seller);
    assert_eq!(f.asset, s.asset);
    assert_eq!(f.pot, 1000);
    assert_eq!(f.start_price, 200);
    assert_eq!(f.floor_price, -50);
    assert_eq!(f.state, 0);
    assert_eq!(f.claimant, None);
    assert_eq!(f.claimed_at, None);
    assert_eq!(f.venue_pubkey, venue_pubkey(&s.env));
    assert_eq!(f.deadline_ledger, f.start_ledger + 100);

    // The record reflects the claim.
    let claimant = Address::generate(&s.env);
    s.client.claim(&id, &claimant);
    let f2 = s.client.get_fade(&id);
    assert_eq!(f2.state, 1);
    assert_eq!(f2.claimant, Some(claimant));

    // Missing fade: defined error, no panic.
    assert_eq!(
        s.client.try_get_fade(&999).unwrap_err(),
        Ok(Error::NotFound)
    );
}

#[test]
fn get_pod_view_record_and_missing() {
    let s = setup();
    let funder = Address::generate(&s.env);
    s.token_admin.mint(&funder, &800);
    let id = create_test_pod(&s, &funder, 800, 500);
    let p = s.client.get_pod(&id);
    assert_eq!(p.funder, funder);
    assert_eq!(p.amount, 800);
    assert_eq!(p.unlock_ledger, 500);
    assert_eq!(p.claim_pubkey, pod_pubkey(&s.env));
    assert_eq!(p.state, 0);
    assert_eq!(s.client.try_get_pod(&999).unwrap_err(), Ok(Error::NotFound));
}

// Cross-language fixture generated with @stellar/stellar-sdk 16.3.0:
// venue seed [7;32], testnet passphrase, contract/claimant below, id=1, ts=12345.
#[test]
fn venue_sig_ts_parity() {
    let env = Env::default();
    let contract = Address::from_string(&soroban_sdk::String::from_str(
        &env,
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    ));
    let claimant = Address::from_string(&soroban_sdk::String::from_str(
        &env,
        "GD6ROJBYLKQMOW3E7N4M2YBPUHMZD7PL65VRHRMO24BOVSBV5H3BQRSL",
    ));
    let network: [u8; 32] = Sha256::digest(b"Test SDF Network ; September 2015").into();
    env.ledger().with_mut(|ledger| ledger.network_id = network);
    env.register_at(&contract, Agyion, ());
    // Use the production domain builder, then the public credential fields.
    let mut payload = env.as_contract(&contract, || {
        crate::credential_payload(&env, b"agyion:handoff:v2\0")
    });
    payload.append(&Bytes::from_array(&env, &1u64.to_be_bytes()));
    payload.append(&claimant.to_xdr(&env));
    payload.append(&Bytes::from_array(&env, &12345u64.to_be_bytes()));
    let expected_hex = "616779696f6e3a68616e646f66663a763200cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472000000120000000100000000000000000000000000000000000000000000000000000000000000010000000000000001000000120000000000000000fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f6180000000000003039";
    let expected: std::vec::Vec<u8> = (0..expected_hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&expected_hex[i..i + 2], 16).unwrap())
        .collect();
    assert_eq!(payload.iter().collect::<std::vec::Vec<u8>>(), expected);
    let sig_hex = "769c3fdc5da46c4b4cd4f9320fb4a6433175c1e045e2855facc7caa5884200f985682bd387cfc000377ab4856893cb560efc94486116b4c6a5c1fbf969d09609";
    let mut sig_bytes = [0u8; 64];
    for i in 0..64 {
        sig_bytes[i] = u8::from_str_radix(&sig_hex[i * 2..i * 2 + 2], 16).unwrap();
    }
    env.crypto().ed25519_verify(
        &venue_pubkey(&env),
        &payload,
        &BytesN::from_array(&env, &sig_bytes),
    );
}

// ---- Scenario 6: same-ledger double claim (second is rejected) ----
#[test]
fn same_ledger_double_claim() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let c1 = Address::generate(&s.env);
    let c2 = Address::generate(&s.env);

    s.token_admin.mint(&seller, &300);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &300,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    // Two claims in the same ledger: the first valid transition wins.
    s.client.claim(&id, &c1);
    assert_eq!(s.client.try_claim(&id, &c2), Err(Ok(Error::InvalidState)));

    // Winner c1: the handoff settle runs over c1.
    s.token_admin.mint(&c1, &500);
    s.client.confirm_handoff(
        &id,
        &77,
        &sign_handoff(&s.env, &s.client.address, id, &c1, 77),
    );
    assert_eq!(s.token.balance(&s.client.address), 0);
}

// ---- floor_price lower-bound validation + settle cap ----
#[test]
fn excessive_negative_floor_rejected() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &1000);

    // floor < -pot: the negative payout could exceed the pot -> InvalidAmount.
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &-101,
            &1,
            &1,
            &100,
            &10,
            &venue_pubkey(&s.env),
        ),
        Err(Ok(Error::InvalidAmount))
    );
    // Extreme values are rejected too (i128 negation overflow vector closed).
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &i128::MIN,
            &1,
            &1,
            &100,
            &10,
            &venue_pubkey(&s.env),
        ),
        Err(Ok(Error::InvalidAmount))
    );
    // Boundary value floor == -pot is accepted.
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &50,
        &-100,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    assert_eq!(id, 1);
}

#[test]
fn negative_price_pot_cap_settle() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &500);

    // floor == -pot: when the price hits the floor the negative payout sits
    // exactly on the pot (cap boundary). |price| > pot is closed by create
    // validation.
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &500,
        &0,    // start_price
        &-500, // floor_price == -pot
        &10,   // slope_num
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 60);
    assert_eq!(s.client.fade_price(&id), -500); // stopped at the floor

    s.client.claim(&id, &claimant);
    s.client.confirm_handoff(
        &id,
        &42,
        &sign_handoff(&s.env, &s.client.address, id, &claimant, 42),
    );

    // Cap: the claimant receives the full pot (500), the seller gets 0.
    assert_eq!(s.token.balance(&claimant), 500);
    assert_eq!(s.token.balance(&seller), 0);
    assert_eq!(s.token.balance(&s.client.address), 0);
}

// ---- signature errors ----
#[test]
fn zero_venue_pubkey_rejected() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);

    // Zero pubkey: no signature can ever verify, the confirm path would be locked.
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &0,
            &1,
            &1,
            &100,
            &10,
            &BytesN::from_array(&s.env, &[0u8; 32]),
        ),
        Err(Ok(Error::BadSignature))
    );
}

/// Invalid (signed with a different key) signature: the soroban host
/// `ed25519_verify` produces a host trap (panic) on failed verification, not
/// a Result; that branch cannot be converted into an in-contract Error code.
/// The test documents the trap behavior with should_panic. No funds are lost:
/// the tx rolls back atomically and the seller can fall back to refund.
/// (The frontend venueSigner.ts pre-verifies before submitting — defense in
/// depth.)
#[test]
#[should_panic]
fn invalid_sig_host_trap() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &400);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &400,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    s.client.claim(&id, &claimant);

    // Well-formed 64B signature produced with a different key -> host trap.
    let other = SigningKey::from_bytes(&[13u8; 32]);
    let mut payload = Bytes::from_slice(&s.env, b"agyion:handoff:v2\0");
    payload.append(&Bytes::from(s.env.ledger().network_id()));
    payload.append(&s.client.address.clone().to_xdr(&s.env));
    payload.append(&Bytes::from_array(&s.env, &id.to_be_bytes()));
    payload.append(&claimant.to_xdr(&s.env));
    payload.append(&Bytes::from_array(&s.env, &55u64.to_be_bytes()));
    let msg: std::vec::Vec<u8> = payload.iter().collect();
    let sig = other.sign(&msg);

    s.client
        .confirm_handoff(&id, &55, &BytesN::from_array(&s.env, &sig.to_bytes()));
}

// ---- confirm/refund window race closed ----
#[test]
fn confirm_after_window_rejected_refund_wins() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &400);
    s.token_admin.mint(&claimant, &500);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &400,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 5);
    s.client.claim(&id, &claimant); // claimed_at = start + 5, window = 10

    // Window elapsed (start+16 > start+5+10): even with a valid signature,
    // confirm is now InvalidState — on a no-show, refund wins.
    s.env.ledger().set_sequence_number(start + 16);
    assert_eq!(
        s.client.try_confirm_handoff(
            &id,
            &88,
            &sign_handoff(&s.env, &s.client.address, id, &claimant, 88)
        ),
        Err(Ok(Error::InvalidState))
    );

    // Refund now returns the pot to the seller.
    s.client.refund(&id);
    assert_eq!(s.token.balance(&seller), 400);
    assert_eq!(s.token.balance(&claimant), 500); // nothing moved to the claimant
}

#[test]
fn confirm_valid_at_window_boundary() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &400);
    s.token_admin.mint(&claimant, &500);

    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &400,
        &100,
        &0,
        &1,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );

    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 5);
    s.client.claim(&id, &claimant);

    // Exact boundary: now == claimed_at + handoff_window -> confirm is still
    // allowed (the refund condition is `>`, so confirm has priority at the
    // boundary ledger).
    s.env.ledger().set_sequence_number(start + 15);
    s.client.confirm_handoff(
        &id,
        &91,
        &sign_handoff(&s.env, &s.client.address, id, &claimant, 91),
    );
    assert_eq!(s.token.balance(&s.client.address), 0);
}

// ---- handoff_window=0 rejection ----
#[test]
fn zero_handoff_window_rejected() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);

    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &0,
            &1,
            &1,
            &100,
            &0,
            &venue_pubkey(&s.env),
        ),
        Err(Ok(Error::InvalidCurve))
    );
}

// =====================================================================
// TRIGGER (SPEC_V2): attest success / bad sig / refund after deadline /
// early refund reject
// =====================================================================

#[test]
fn trigger_attest_success() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let beneficiary = Address::generate(&s.env);
    s.token_admin.mint(&funder, &500);

    let deadline = start_ledger(&s.env) + 50;
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &500,
        &beneficiary,
        &attester_pubkey(&s.env),
        &deadline,
    );
    assert_eq!(id, 1);
    assert_eq!(s.token.balance(&funder), 0);
    assert_eq!(s.token.balance(&s.client.address), 500);

    let t = s.client.get_trigger(&id);
    assert_eq!(t.funder, funder);
    assert_eq!(t.beneficiary, beneficiary);
    assert_eq!(t.amount, 500);
    assert_eq!(t.deadline_ledger, deadline);
    assert_eq!(t.state, 0);

    // Valid attestation within the deadline pays the beneficiary.
    s.client.attest(
        &id,
        &777,
        &sign_attest(&s.env, &s.client.address, id, &beneficiary, 777),
    );
    assert_eq!(s.token.balance(&beneficiary), 500);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(s.client.get_trigger(&id).state, 1);

    // Single-direction: a second attest and a refund are both rejected.
    assert_eq!(
        s.client.try_attest(
            &id,
            &778,
            &sign_attest(&s.env, &s.client.address, id, &beneficiary, 778)
        ),
        Err(Ok(Error::InvalidState))
    );
    s.env.ledger().set_sequence_number(deadline + 1);
    assert_eq!(
        s.client.try_refund_trigger(&id),
        Err(Ok(Error::InvalidState))
    );
}

/// Attestation signed by the wrong key: host trap (same documented
/// `ed25519_verify` behavior as confirm_handoff).
#[test]
#[should_panic]
fn trigger_attest_bad_sig_host_trap() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let beneficiary = Address::generate(&s.env);
    s.token_admin.mint(&funder, &500);

    let deadline = start_ledger(&s.env) + 50;
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &500,
        &beneficiary,
        &attester_pubkey(&s.env),
        &deadline,
    );

    let other = SigningKey::from_bytes(&[13u8; 32]);
    let mut payload = Bytes::from_slice(&s.env, b"agyion:attest:v2\0");
    payload.append(&Bytes::from(s.env.ledger().network_id()));
    payload.append(&s.client.address.clone().to_xdr(&s.env));
    payload.append(&Bytes::from_array(&s.env, &id.to_be_bytes()));
    payload.append(&beneficiary.to_xdr(&s.env));
    payload.append(&Bytes::from_array(&s.env, &1u64.to_be_bytes()));
    let msg: std::vec::Vec<u8> = payload.iter().collect();
    let sig = other.sign(&msg);

    s.client
        .attest(&id, &1, &BytesN::from_array(&s.env, &sig.to_bytes()));
}

#[test]
fn trigger_refund_after_deadline() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let beneficiary = Address::generate(&s.env);
    s.token_admin.mint(&funder, &500);

    let deadline = start_ledger(&s.env) + 50;
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &500,
        &beneficiary,
        &attester_pubkey(&s.env),
        &deadline,
    );

    // After the deadline the attestation window is closed...
    s.env.ledger().set_sequence_number(deadline + 1);
    assert_eq!(
        s.client.try_attest(
            &id,
            &5,
            &sign_attest(&s.env, &s.client.address, id, &beneficiary, 5)
        ),
        Err(Ok(Error::DeadlinePassed))
    );

    // ...and the rule-based refund returns the funds to the funder. No
    // discretion, anyone may call.
    s.client.refund_trigger(&id);
    assert_eq!(s.token.balance(&funder), 500);
    assert_eq!(s.token.balance(&beneficiary), 0);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(s.client.get_trigger(&id).state, 2);

    // Double refund rejected (single-direction state machine).
    assert_eq!(
        s.client.try_refund_trigger(&id),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn trigger_early_refund_rejected() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let beneficiary = Address::generate(&s.env);
    s.token_admin.mint(&funder, &500);

    let deadline = start_ledger(&s.env) + 50;
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &500,
        &beneficiary,
        &attester_pubkey(&s.env),
        &deadline,
    );

    // Refund before the deadline: rejected — the attestation path is still open.
    assert_eq!(
        s.client.try_refund_trigger(&id),
        Err(Ok(Error::DeadlinePassed))
    );
    // Also rejected exactly at the deadline ledger (refund needs `>` deadline).
    s.env.ledger().set_sequence_number(deadline);
    assert_eq!(
        s.client.try_refund_trigger(&id),
        Err(Ok(Error::DeadlinePassed))
    );

    // State untouched: attestation still executes afterwards.
    s.client.attest(
        &id,
        &42,
        &sign_attest(&s.env, &s.client.address, id, &beneficiary, 42),
    );
    assert_eq!(s.token.balance(&beneficiary), 500);
}

// =====================================================================
// ENVOY (SPEC_V2): claim in cap / cap exceeded / expired / revoked /
// recipient binding
// =====================================================================

/// Creates a negative-price fade (campaign fade): price falls to floor=-50.
/// Returns (fade_id, owner).
fn setup_campaign_fade(s: &Setup, seller: &Address) -> u64 {
    s.token_admin.mint(seller, &1000);
    s.client.create_fade(
        seller,
        &s.asset,
        &1000,
        &100, // start_price
        &-50, // floor_price
        &2,   // slope: 2 per ledger -> hits the floor after 75 ledgers
        &1,
        &200,
        &10,
        &venue_pubkey(&s.env),
    )
}

#[test]
fn envoy_claim_within_cap() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id = s.client.create_mandate(
        &owner,
        &agent_pubkey(&s.env),
        &100,            // max_per_tx
        &1000,           // daily_cap
        &(start + 1000), // valid_until
    );
    assert_eq!(mandate_id, 1);

    let fade_id = setup_campaign_fade(&s, &seller);

    // Price at floor: -50 (campaign hunting — the agent catches negative prices).
    s.env.ledger().set_sequence_number(start + 80);
    assert_eq!(s.client.fade_price(&fade_id), -50);

    s.client.envoy_claim(
        &mandate_id,
        &fade_id,
        &11,
        &sign_envoy(&s.env, &s.client.address, mandate_id, fade_id, 11),
    );

    let f = s.client.get_fade(&fade_id);
    assert_eq!(f.state, 1);
    assert_eq!(f.claimant, Some(owner.clone()));

    // Negative price is free: no budget was consumed.
    let m = s.client.get_mandate(&mandate_id);
    assert_eq!(m.daily_used, 0);
    // ...but the claim-count cap (audit v2 finding 2) did tick.
    assert_eq!(m.claims_used, 1);
    assert!(!m.revoked);
}

#[test]
fn envoy_claim_cap_exceeded() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &2000);

    let start = start_ledger(&s.env);
    let mandate_id = s.client.create_mandate(
        &owner,
        &agent_pubkey(&s.env),
        &100, // max_per_tx
        &120, // daily_cap
        &(start + 1000),
    );

    // Constant positive price 150 (slope_num=0): above max_per_tx -> CapExceeded.
    let fade_over_cap = s.client.create_fade(
        &seller,
        &s.asset,
        &1000,
        &150,
        &0,
        &0,
        &1,
        &200,
        &10,
        &venue_pubkey(&s.env),
    );
    assert_eq!(
        s.client.try_envoy_claim(
            &mandate_id,
            &fade_over_cap,
            &1,
            &sign_envoy(&s.env, &s.client.address, mandate_id, fade_over_cap, 1),
        ),
        Err(Ok(Error::CapExceeded))
    );

    // Positive price within both caps: passes the cap checks but is rejected
    // by the Envoy design restriction (no owner auth possible) -> InvalidInput.
    let fade_in_cap = s.client.create_fade(
        &seller,
        &s.asset,
        &1000,
        &50,
        &0,
        &0,
        &1,
        &200,
        &10,
        &venue_pubkey(&s.env),
    );
    assert_eq!(
        s.client.try_envoy_claim(
            &mandate_id,
            &fade_in_cap,
            &2,
            &sign_envoy(&s.env, &s.client.address, mandate_id, fade_in_cap, 2),
        ),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn envoy_claim_expired_mandate() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id = s.client.create_mandate(
        &owner,
        &agent_pubkey(&s.env),
        &100,
        &1000,
        &(start + 10), // short-lived mandate
    );
    let fade_id = setup_campaign_fade(&s, &seller);

    s.env.ledger().set_sequence_number(start + 11); // past valid_until
    assert_eq!(s.client.fade_price(&fade_id), 78); // price still positive, but
                                                   // expiry is checked first
    assert_eq!(
        s.client.try_envoy_claim(
            &mandate_id,
            &fade_id,
            &3,
            &sign_envoy(&s.env, &s.client.address, mandate_id, fade_id, 3),
        ),
        Err(Ok(Error::MandateExpired))
    );
}

#[test]
fn envoy_claim_revoked_mandate() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id =
        s.client
            .create_mandate(&owner, &agent_pubkey(&s.env), &100, &1000, &(start + 1000));
    let fade_id = setup_campaign_fade(&s, &seller);

    // A non-owner cannot revoke (param/caller mismatch -> Unauthorized).
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_revoke_mandate(&stranger, &mandate_id),
        Err(Ok(Error::Unauthorized))
    );

    // Instant revocation by the owner.
    s.client.revoke_mandate(&owner, &mandate_id);
    assert!(s.client.get_mandate(&mandate_id).revoked);

    s.env.ledger().set_sequence_number(start + 80); // price at floor (-50)
    assert_eq!(
        s.client.try_envoy_claim(
            &mandate_id,
            &fade_id,
            &4,
            &sign_envoy(&s.env, &s.client.address, mandate_id, fade_id, 4),
        ),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn envoy_claim_recipient_binding() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id =
        s.client
            .create_mandate(&owner, &agent_pubkey(&s.env), &100, &1000, &(start + 1000));
    let fade_id = setup_campaign_fade(&s, &seller);

    s.env.ledger().set_sequence_number(start + 80);
    s.client.envoy_claim(
        &mandate_id,
        &fade_id,
        &5,
        &sign_envoy(&s.env, &s.client.address, mandate_id, fade_id, 5),
    );

    // Recipient binding is structural: the claim lands on the mandate owner,
    // never on the agent (the agent has only a pubkey, no address param).
    let f = s.client.get_fade(&fade_id);
    assert_eq!(f.claimant, Some(owner));
    assert_eq!(f.claimed_at, Some(start + 80));
}

// ---- Audit v2 FIX 1 PoC: refund does not overflow with a huge
// handoff_window; the seller gets the pot back ----
#[test]
fn refund_no_overflow_huge_handoff_window() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &400);

    // Largest allowed window (MAX_LEDGER_SPAN = 1_000_000). Before the fix,
    // `claimed_at + handoff_window` in refund was an unchecked u32 add — with
    // an unbounded window this could overflow-panic and lock the pot forever.
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &400,
        &100,
        &0,
        &1,
        &1,
        &100,
        &1_000_000,
        &venue_pubkey(&s.env),
    );

    let start = start_ledger(&s.env);
    s.env.ledger().set_sequence_number(start + 5);
    s.client.claim(&id, &claimant); // claimed_at = start + 5

    // Within the window: refund still rejected (no trap, defined error).
    s.env.ledger().set_sequence_number(start + 100);
    assert_eq!(s.client.try_refund(&id), Err(Ok(Error::DeadlinePassed)));

    // Window elapsed (start+5+1_000_000 < start+1_000_006): saturating_add
    // keeps the comparison safe and the seller recovers the pot.
    s.env.ledger().set_sequence_number(start + 1_000_006);
    s.client.refund(&id);
    assert_eq!(s.token.balance(&seller), 400);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(s.client.get_fade(&id).state, 3);
}

// ---- Audit v2 FIX 1: absurd duration/handoff_window rejected at create ----
#[test]
fn oversized_duration_or_window_rejected() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);

    // duration_ledgers above the 1_000_000 ledger bound -> InvalidInput.
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &0,
            &1,
            &1,
            &1_000_001,
            &10,
            &venue_pubkey(&s.env),
        ),
        Err(Ok(Error::InvalidInput))
    );
    // handoff_window near u32::MAX (the audit's overflow vector) -> InvalidInput.
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &50,
            &0,
            &1,
            &1,
            &100,
            &u32::MAX,
            &venue_pubkey(&s.env),
        ),
        Err(Ok(Error::InvalidInput))
    );
    // Boundary value exactly at the bound is accepted.
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &50,
        &0,
        &1,
        &1,
        &1_000_000,
        &1_000_000,
        &venue_pubkey(&s.env),
    );
    assert_eq!(id, 1);
}

// ---- Audit v2 FIX 3: create_trigger rejects a past/current deadline ----
#[test]
fn create_trigger_past_deadline_rejected() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let beneficiary = Address::generate(&s.env);
    s.token_admin.mint(&funder, &500);

    // Move the ledger forward so "past" deadlines exist.
    s.env.ledger().set_sequence_number(100);
    let now = start_ledger(&s.env);

    // Deadline in the past -> InvalidInput (consistent with create_mandate).
    assert_eq!(
        s.client.try_create_trigger(
            &funder,
            &s.asset,
            &500,
            &beneficiary,
            &attester_pubkey(&s.env),
            &(now - 1),
        ),
        Err(Ok(Error::InvalidInput))
    );
    // Deadline exactly at the current ledger -> also InvalidInput.
    assert_eq!(
        s.client.try_create_trigger(
            &funder,
            &s.asset,
            &500,
            &beneficiary,
            &attester_pubkey(&s.env),
            &now,
        ),
        Err(Ok(Error::InvalidInput))
    );
    // A future deadline still works; funds moved only for the valid create.
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &500,
        &beneficiary,
        &attester_pubkey(&s.env),
        &(now + 50),
    );
    assert_eq!(id, 1);
    assert_eq!(s.token.balance(&funder), 0);
}

// ---- Audit v2 FIX 2: per-mandate claim-count cap (MAX_CLAIMS_PER_MANDATE=50) ----
#[test]
fn envoy_claim_count_cap() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id =
        s.client
            .create_mandate(&owner, &agent_pubkey(&s.env), &100, &1000, &(start + 1000));

    // 51 campaign fades (each is claimable exactly once).
    let mut fades = std::vec::Vec::new();
    for _ in 0..51 {
        fades.push(setup_campaign_fade(&s, &seller));
    }

    // 80 ledgers later every fade sits at the floor price (-50), so each
    // claim is a valid price<=0 campaign claim; the monetary caps never
    // engage (daily_used stays 0) — only the claim-count cap bounds the agent.
    s.env.ledger().set_sequence_number(start + 80);

    // 50 claims succeed; the counter tracks them.
    for (i, fade_id) in fades.iter().take(50).enumerate() {
        let ts = 100 + i as u64;
        s.client.envoy_claim(
            &mandate_id,
            fade_id,
            &ts,
            &sign_envoy(&s.env, &s.client.address, mandate_id, *fade_id, ts),
        );
    }
    let m = s.client.get_mandate(&mandate_id);
    assert_eq!(m.claims_used, 50);
    assert_eq!(m.daily_used, 0); // monetary cap still untouched (documented dead cap)

    // The 51st claim is rejected with CapExceeded even though price <= 0 and
    // every other check would pass.
    let fade_51 = fades[50];
    assert_eq!(s.client.fade_price(&fade_51), -50);
    assert_eq!(
        s.client.try_envoy_claim(
            &mandate_id,
            &fade_51,
            &999,
            &sign_envoy(&s.env, &s.client.address, mandate_id, fade_51, 999),
        ),
        Err(Ok(Error::CapExceeded))
    );
    // The rejected attempt did not consume anything.
    assert_eq!(s.client.get_mandate(&mandate_id).claims_used, 50);
    assert_eq!(s.client.get_fade(&fade_51).state, 0);
}

// ---- Cross-template: a mandate claim settles into the owner's fade claim ----
#[test]
fn cross_template_mandate_claim_settles_owner_fade() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let seller = Address::generate(&s.env);

    let start = start_ledger(&s.env);
    let mandate_id =
        s.client
            .create_mandate(&owner, &agent_pubkey(&s.env), &100, &1000, &(start + 1000));
    let fade_id = setup_campaign_fade(&s, &seller);

    // Agent claims at the floor price (-50) on behalf of the owner.
    s.env.ledger().set_sequence_number(start + 80);
    s.client.envoy_claim(
        &mandate_id,
        &fade_id,
        &6,
        &sign_envoy(&s.env, &s.client.address, mandate_id, fade_id, 6),
    );

    // The venue confirms the handoff; settle runs with claimant = owner:
    // the pot compensates the owner with 50, the remaining 950 goes to the seller.
    s.client.confirm_handoff(
        &fade_id,
        &60,
        &sign_handoff(
            &s.env,
            &s.client.address,
            fade_id,
            &s.client.get_fade(&fade_id).claimant.unwrap(),
            60,
        ),
    );

    assert_eq!(s.token.balance(&owner), 50);
    assert_eq!(s.token.balance(&seller), 950);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(s.client.get_fade(&fade_id).state, 2);
}

// Security regressions: each test failed against the pre-audit contract.
#[test]
fn security_handoff_signature_cannot_execute_trigger() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&seller, &200);
    let fade_id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &0,
        &0,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    s.client.claim(&fade_id, &recipient);
    let trigger_id = s.client.create_trigger(
        &seller,
        &s.asset,
        &100,
        &recipient,
        &venue_pubkey(&s.env),
        &100,
    );
    assert_eq!(fade_id, trigger_id);
    let sig = sign_handoff(&s.env, &s.client.address, fade_id, &recipient, 7);
    assert!(
        s.client.try_attest(&trigger_id, &7, &sig).is_err(),
        "a venue handoff must not authorize escrow payment"
    );
    assert_eq!(s.token.balance(&recipient), 0);
}

#[test]
fn security_trigger_signature_cannot_cross_contracts() {
    let s = setup();
    let other_id = s.env.register(Agyion, ());
    let other = AgyionClient::new(&s.env, &other_id);
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &200);
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &100,
        &recipient,
        &attester_pubkey(&s.env),
        &100,
    );
    let id2 = other.create_trigger(
        &funder,
        &s.asset,
        &100,
        &recipient,
        &attester_pubkey(&s.env),
        &100,
    );
    assert_eq!(id, id2);
    let sig = sign_attest(&s.env, &s.client.address, id, &recipient, 9);
    assert!(
        other.try_attest(&id2, &9, &sig).is_err(),
        "signature for another deployment must not release escrow"
    );
    assert_eq!(s.token.balance(&recipient), 0);
}

#[test]
fn security_handoff_signature_cannot_cross_contracts() {
    let s = setup();
    let other_id = s.env.register(Agyion, ());
    let other = AgyionClient::new(&s.env, &other_id);
    let seller = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&seller, &200);
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &-10,
        &-10,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    let id2 = other.create_fade(
        &seller,
        &s.asset,
        &100,
        &-10,
        &-10,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    s.client.claim(&id, &recipient);
    other.claim(&id2, &recipient);
    let sig = sign_handoff(&s.env, &s.client.address, id, &recipient, 9);
    assert!(
        other.try_confirm_handoff(&id2, &9, &sig).is_err(),
        "handoff for another deployment must not spend the pot"
    );
    assert_eq!(s.token.balance(&recipient), 0);
}

#[test]
fn security_envoy_signature_cannot_cross_contracts() {
    let s = setup();
    let other_id = s.env.register(Agyion, ());
    let other = AgyionClient::new(&s.env, &other_id);
    let seller = Address::generate(&s.env);
    let owner = Address::generate(&s.env);
    s.token_admin.mint(&seller, &200);
    let mandate = s
        .client
        .create_mandate(&owner, &agent_pubkey(&s.env), &1, &1, &100);
    let mandate2 = other.create_mandate(&owner, &agent_pubkey(&s.env), &1, &1, &100);
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &0,
        &0,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    let id2 = other.create_fade(
        &seller,
        &s.asset,
        &100,
        &0,
        &0,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    let sig = sign_envoy(&s.env, &s.client.address, mandate, id, 9);
    assert!(
        other.try_envoy_claim(&mandate2, &id2, &9, &sig).is_err(),
        "agent authorization is deployment-specific"
    );
    assert_eq!(other.get_fade(&id2).state, 0);
}

#[test]
fn security_observed_pod_signature_cannot_redirect_after_delayed_submission() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    let observer = Address::generate(&s.env);
    s.token_admin.mint(&funder, &100);
    s.env.ledger().set_sequence_number(100);
    let id = create_test_pod(&s, &funder, 100, 101);
    let observed_signature = pod_signature(&s.env, &s.client.address, id, &recipient);
    // Even after arbitrary simulation/submission delay, an observed signature
    // authorizes only the original recipient, not the observer's own wallet.
    for ledger in [101, 102, 120, 1000] {
        s.env.ledger().set_sequence_number(ledger);
        assert!(s
            .client
            .try_claim_pod(&id, &observer, &observed_signature)
            .is_err());
        assert_eq!(s.token.balance(&observer), 0);
        assert_eq!(s.client.get_pod(&id).state, 0);
    }
    s.client.claim_pod(&id, &recipient, &observed_signature);
    assert_eq!(s.token.balance(&recipient), 100);
}

#[test]
fn security_large_rational_slope_keeps_exact_price() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &10,
        &0,
        &i128::MAX,
        &i128::MAX,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    s.env.ledger().set_sequence_number(start_ledger(&s.env) + 2);
    assert_eq!(
        s.client.fade_price(&id),
        8,
        "MAX/MAX is a decline of one per ledger, even when the intermediate product exceeds i128"
    );
}

#[test]
fn security_trigger_requires_reachable_refund_ledger() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &100);
    assert_eq!(
        s.client.try_create_trigger(
            &funder,
            &s.asset,
            &100,
            &recipient,
            &attester_pubkey(&s.env),
            &u32::MAX
        ),
        Err(Ok(Error::InvalidInput))
    );
    assert_eq!(s.token.balance(&funder), 100);
}

#[test]
fn security_fade_deadline_overflow_returns_defined_error() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);
    s.env.ledger().with_mut(|ledger| {
        ledger.sequence_number = u32::MAX - 100;
        ledger.min_persistent_entry_ttl = 1;
        ledger.min_temp_entry_ttl = 1;
        ledger.max_entry_ttl = 50;
    });
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &0,
            &0,
            &0,
            &1,
            &200,
            &10,
            &venue_pubkey(&s.env)
        ),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn security_fade_handoff_refund_must_fit_ledger_range() {
    let s = setup();
    let seller = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);
    s.env.ledger().with_mut(|ledger| {
        ledger.sequence_number = u32::MAX - 100;
        ledger.min_persistent_entry_ttl = 1;
        ledger.min_temp_entry_ttl = 1;
        ledger.max_entry_ttl = 50;
    });
    assert_eq!(
        s.client.try_create_fade(
            &seller,
            &s.asset,
            &100,
            &0,
            &0,
            &0,
            &1,
            &50,
            &100,
            &venue_pubkey(&s.env)
        ),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn security_pod_funding_requires_key_possession_for_exact_terms() {
    let s = setup();
    let funder = Address::generate(&s.env);
    s.token_admin.mint(&funder, &200);
    let proof = pod_create_proof(&s.env, &s.client.address, &funder, &s.asset, 100, 50);
    for (amount, unlock) in [(101, 50), (100, 51)] {
        assert!(s
            .client
            .try_create_pod(
                &funder,
                &s.asset,
                &amount,
                &unlock,
                &pod_pubkey(&s.env),
                &proof
            )
            .is_err());
    }
    assert_eq!(
        s.client.try_create_pod(
            &funder,
            &s.asset,
            &100,
            &50,
            &BytesN::from_array(&s.env, &[0; 32]),
            &proof
        ),
        Err(Ok(Error::BadSignature))
    );
    assert!(s
        .client
        .try_create_pod(
            &funder,
            &s.asset,
            &100,
            &50,
            &BytesN::from_array(&s.env, &[1; 32]),
            &proof
        )
        .is_err());
    let different_funder = Address::generate(&s.env);
    assert!(s
        .client
        .try_create_pod(
            &different_funder,
            &s.asset,
            &100,
            &50,
            &pod_pubkey(&s.env),
            &proof
        )
        .is_err());
    assert_eq!(s.token.balance(&funder), 200);
    assert_eq!(s.token.balance(&s.client.address), 0);
    assert_eq!(
        s.client
            .create_pod(&funder, &s.asset, &100, &50, &pod_pubkey(&s.env), &proof),
        1
    );
}

#[test]
fn security_pod_signature_is_bound_to_pod_contract_and_network() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &200);
    let first = create_test_pod(&s, &funder, 100, 0);
    let second = create_test_pod(&s, &funder, 100, 0);
    let first_signature = pod_signature(&s.env, &s.client.address, first, &recipient);
    assert!(s
        .client
        .try_claim_pod(&second, &recipient, &first_signature)
        .is_err());
    let other_contract = Address::generate(&s.env);
    let wrong_contract = pod_signature(&s.env, &other_contract, second, &recipient);
    assert!(s
        .client
        .try_claim_pod(&second, &recipient, &wrong_contract)
        .is_err());
    let correct_signature = pod_signature(&s.env, &s.client.address, second, &recipient);
    let original_network = s.env.ledger().network_id().to_array();
    s.env.ledger().with_mut(|l| l.network_id = [42; 32]);
    assert!(s
        .client
        .try_claim_pod(&second, &recipient, &correct_signature)
        .is_err());
    s.env.ledger().with_mut(|l| l.network_id = original_network);
    let funding_proof = pod_create_proof(&s.env, &s.client.address, &funder, &s.asset, 100, 0);
    assert!(s
        .client
        .try_claim_pod(&second, &recipient, &funding_proof)
        .is_err());
    assert_eq!(s.token.balance(&s.client.address), 200);
    s.client.claim_pod(&second, &recipient, &correct_signature);
    assert_eq!(s.token.balance(&recipient), 100);
}

#[test]
fn security_trigger_signature_cannot_cross_networks() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &100);
    let id = s.client.create_trigger(
        &funder,
        &s.asset,
        &100,
        &recipient,
        &attester_pubkey(&s.env),
        &100,
    );
    let sig = sign_attest(&s.env, &s.client.address, id, &recipient, 9);
    s.env
        .ledger()
        .with_mut(|ledger| ledger.network_id = [42; 32]);
    assert!(s.client.try_attest(&id, &9, &sig).is_err());
    assert_eq!(s.client.get_trigger(&id).state, 0);
    assert_eq!(s.token.balance(&recipient), 0);
}

#[test]
fn security_owner_operations_reject_missing_auth() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &400);
    let pod = create_test_pod(&s, &funder, 100, 0);
    let proof = pod_create_proof(&s.env, &s.client.address, &funder, &s.asset, 100, 0);
    let fade = s.client.create_fade(
        &funder,
        &s.asset,
        &100,
        &0,
        &0,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    let mandate = s
        .client
        .create_mandate(&funder, &agent_pubkey(&s.env), &1, &1, &100);
    let signature = pod_signature(&s.env, &s.client.address, pod, &recipient);
    s.env.ledger().set_sequence_number(start_ledger(&s.env) + 1);
    s.env.set_auths(&[]);
    assert!(s
        .client
        .try_create_pod(&funder, &s.asset, &100, &0, &pod_pubkey(&s.env), &proof)
        .is_err());
    assert!(s
        .client
        .try_create_fade(
            &funder,
            &s.asset,
            &100,
            &0,
            &0,
            &0,
            &1,
            &100,
            &10,
            &venue_pubkey(&s.env)
        )
        .is_err());
    assert!(s
        .client
        .try_create_trigger(
            &funder,
            &s.asset,
            &100,
            &recipient,
            &attester_pubkey(&s.env),
            &100
        )
        .is_err());
    assert!(s
        .client
        .try_create_mandate(&funder, &agent_pubkey(&s.env), &1, &1, &100)
        .is_err());
    assert!(s.client.try_claim(&fade, &recipient).is_err());
    assert!(s.client.try_revoke_mandate(&funder, &mandate).is_err());
    assert!(s
        .client
        .try_claim_pod(&pod, &recipient, &signature)
        .is_err());
    assert_eq!(s.token.balance(&funder), 200);
    assert_eq!(s.token.balance(&s.client.address), 200);
    assert!(!s.client.get_mandate(&mandate).revoked);
    assert_eq!(s.client.get_fade(&fade).state, 0);
}

#[test]
fn security_contract_balance_cannot_be_relocked_without_owner_auth() {
    let s = setup();
    let funder = Address::generate(&s.env);
    s.token_admin.mint(&funder, &100);
    create_test_pod(&s, &funder, 100, 100);
    s.env.set_auths(&[]);
    assert!(s
        .client
        .try_create_pod(
            &s.client.address,
            &s.asset,
            &100,
            &0,
            &pod_pubkey(&s.env),
            &pod_create_proof(
                &s.env,
                &s.client.address,
                &s.client.address,
                &s.asset,
                100,
                0
            )
        )
        .is_err());
    assert_eq!(s.token.balance(&s.client.address), 100);
}

#[test]
fn security_refunds_need_no_auth_and_preserve_other_reserves() {
    let s = setup();
    let funder = Address::generate(&s.env);
    let recipient = Address::generate(&s.env);
    s.token_admin.mint(&funder, &300);
    create_test_pod(&s, &funder, 100, 100);
    let fade = s.client.create_fade(
        &funder,
        &s.asset,
        &100,
        &0,
        &0,
        &0,
        &1,
        &10,
        &10,
        &venue_pubkey(&s.env),
    );
    let trigger = s.client.create_trigger(
        &funder,
        &s.asset,
        &100,
        &recipient,
        &attester_pubkey(&s.env),
        &10,
    );
    s.env.set_auths(&[]);
    s.env.ledger().set_sequence_number(11);
    s.client.refund(&fade);
    s.client.refund_trigger(&trigger);
    assert_eq!(s.token.balance(&funder), 200);
    assert_eq!(s.token.balance(&s.client.address), 100);
    assert_eq!(s.token.balance(&recipient), 0);
}

#[test]
fn security_failed_positive_payment_rolls_back_handoff_and_pot() {
    let s = setup();
    let seller = Address::generate(&s.env);
    let claimant = Address::generate(&s.env);
    s.token_admin.mint(&seller, &100);
    s.token_admin.mint(&claimant, &100);
    let id = s.client.create_fade(
        &seller,
        &s.asset,
        &100,
        &10,
        &10,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&s.env),
    );
    s.client.claim(&id, &claimant);
    let sig = sign_handoff(&s.env, &s.client.address, id, &claimant, 1);
    // Venue authorization cannot substitute for claimant SAC transfer auth.
    s.env.set_auths(&[]);
    assert!(s.client.try_confirm_handoff(&id, &1, &sig).is_err());
    assert_eq!(s.client.get_fade(&id).state, 1);
    assert_eq!(s.token.balance(&seller), 0);
    assert_eq!(s.token.balance(&claimant), 100);
    assert_eq!(s.token.balance(&s.client.address), 100);
    s.env
        .ledger()
        .set_sequence_number(start_ledger(&s.env) + 11);
    s.client.refund(&id);
    assert_eq!(s.token.balance(&seller), 100);
}

/// Exercise deployment bytes in the real WASM host, including v2 ABI and domains.
/// Build first with `stellar contract build`; opt in with `--features wasm-tests`.
#[test]
#[cfg(feature = "wasm-tests")]
fn security_wasm_pod_signature_and_domain_bound_settlement() {
    const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/hak.wasm");
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let contract_id = env.register(WASM, ());
    let client = AgyionClient::new(&env, &contract_id);
    assert_eq!(client.protocol_version(), 3);
    let funder = Address::generate(&env);
    let recipient = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(funder.clone());
    let asset = sac.address();
    let token = token::Client::new(&env, &asset);
    token::StellarAssetClient::new(&env, &asset).mint(&funder, &300);
    let proof = pod_create_proof(&env, &contract_id, &funder, &asset, 100, 0);
    let pod = client.create_pod(&funder, &asset, &100, &0, &pod_pubkey(&env), &proof);
    let signature = pod_signature(&env, &contract_id, pod, &recipient);
    let observer = Address::generate(&env);
    env.ledger().set_sequence_number(100);
    assert!(client.try_claim_pod(&pod, &observer, &signature).is_err());
    assert_eq!(token.balance(&observer), 0);
    client.claim_pod(&pod, &recipient, &signature);
    assert_eq!(token.balance(&recipient), 100);
    let fade = client.create_fade(
        &funder,
        &asset,
        &100,
        &-10,
        &-10,
        &0,
        &1,
        &100,
        &10,
        &venue_pubkey(&env),
    );
    client.claim(&fade, &recipient);
    let trigger =
        client.create_trigger(&funder, &asset, &100, &recipient, &venue_pubkey(&env), &200);
    let sig = sign_handoff(&env, &contract_id, fade, &recipient, 7);
    assert!(client.try_attest(&trigger, &7, &sig).is_err());
    client.confirm_handoff(&fade, &7, &sig);
    assert_eq!(token.balance(&recipient), 110);
    assert_eq!(token.balance(&funder), 90);
    assert_eq!(token.balance(&contract_id), 100);
}

// Independently generated SDK fixture: fixtures/pod-v3.json. Public test keys only.
#[test]
fn pod_v3_cross_language_signatures() {
    let env = Env::default();
    let addr = |s: &str| Address::from_string(&soroban_sdk::String::from_str(&env, s));
    let contract = addr("CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526");
    let funder = addr("GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA");
    let asset = addr("CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3");
    let recipient = addr("GACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAJJHP");
    let network: [u8; 32] = Sha256::digest(b"Test SDF Network ; September 2015").into();
    env.ledger().with_mut(|l| l.network_id = network);
    let expected_create = BytesN::from_array(
        &env,
        &[
            56, 9, 104, 116, 12, 27, 131, 36, 220, 186, 111, 225, 88, 221, 127, 89, 100, 190, 237,
            149, 214, 192, 99, 101, 202, 17, 2, 32, 135, 155, 126, 221, 26, 185, 183, 116, 99, 107,
            157, 68, 145, 126, 253, 61, 116, 157, 202, 73, 96, 170, 250, 97, 159, 92, 175, 168,
            210, 9, 145, 24, 35, 251, 52, 2,
        ],
    );
    let expected_claim = BytesN::from_array(
        &env,
        &[
            123, 236, 59, 183, 107, 80, 251, 88, 37, 78, 102, 95, 17, 100, 33, 250, 47, 249, 239,
            133, 110, 182, 80, 58, 39, 35, 208, 99, 201, 158, 13, 9, 179, 190, 20, 251, 140, 176,
            105, 64, 16, 211, 34, 81, 33, 134, 109, 124, 105, 207, 22, 106, 156, 53, 174, 188, 203,
            83, 172, 139, 75, 97, 62, 11,
        ],
    );
    assert_eq!(
        pod_create_proof(&env, &contract, &funder, &asset, 100_000_007, 654321),
        expected_create
    );
    assert_eq!(
        pod_signature(&env, &contract, 42, &recipient),
        expected_claim
    );
}

#[test]
fn pod_failed_asset_payment_preserves_claim_and_reserve() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let funder = Address::generate(&env);
    let recipient = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(funder.clone());
    sac.issuer()
        .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
    let asset = sac.address();
    let admin = token::StellarAssetClient::new(&env, &asset);
    let token = token::Client::new(&env, &asset);
    admin.mint(&funder, &100);
    let contract = env.register(Agyion, ());
    let client = AgyionClient::new(&env, &contract);
    let proof = pod_create_proof(&env, &contract, &funder, &asset, 100, 0);
    let id = client.create_pod(&funder, &asset, &100, &0, &pod_pubkey(&env), &proof);
    let signature = pod_signature(&env, &contract, id, &recipient);
    admin.set_authorized(&recipient, &false);
    assert!(client.try_claim_pod(&id, &recipient, &signature).is_err());
    assert_eq!(client.get_pod(&id).state, 0);
    assert_eq!(token.balance(&contract), 100);
    assert_eq!(token.balance(&recipient), 0);
    admin.set_authorized(&recipient, &true);
    client.claim_pod(&id, &recipient, &signature);
    assert_eq!(token.balance(&recipient), 100);
    assert_eq!(client.get_pod(&id).state, 1);
}

fn assert_trigger_destination_validation(env: &Env, contract: &Address) {
    env.mock_all_auths_allowing_non_root_auth();
    let client = AgyionClient::new(env, contract);
    let funder = Address::generate(env);
    let beneficiary = Address::generate(env);
    let asset = env.register_stellar_asset_contract_v2(funder.clone()).address();
    let token = token::Client::new(env, &asset);
    token::StellarAssetClient::new(env, &asset).mint(&funder, &100);
    assert_eq!(
        client.try_create_trigger(
            &funder,
            &asset,
            &100,
            contract,
            &attester_pubkey(env),
            &100,
        ),
        Err(Ok(Error::InvalidInput)),
    );
    assert_eq!(token.balance(&funder), 100);
    assert_eq!(token.balance(contract), 0);
    assert!(matches!(client.try_get_trigger(&1), Err(Ok(Error::NotFound))));

    // A rejected destination must not consume an ID or impede a later payment.
    let id = client.create_trigger(
        &funder,
        &asset,
        &100,
        &beneficiary,
        &attester_pubkey(env),
        &100,
    );
    assert_eq!(id, 1);
    assert_eq!(token.balance(&funder), 0);
    assert_eq!(token.balance(contract), 100);
    let sig = sign_attest(env, contract, id, &beneficiary, 7);
    env.set_auths(&[]);
    client.attest(&id, &7, &sig);
    assert_eq!(client.get_trigger(&id).state, 1);
    assert_eq!(token.balance(&beneficiary), 100);
    assert_eq!(token.balance(contract), 0);
}

#[test]
fn security_trigger_rejects_kernel_as_beneficiary_before_funding() {
    let env = Env::default();
    let contract = env.register(Agyion, ());
    assert_trigger_destination_validation(&env, &contract);
}

#[test]
#[cfg(feature = "wasm-tests")]
fn security_wasm_trigger_rejects_kernel_as_beneficiary_before_funding() {
    const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/hak.wasm");
    let env = Env::default();
    let contract = env.register(WASM, ());
    assert_trigger_destination_validation(&env, &contract);
}

/// A settlement's second transfer can fail after its first transfer succeeds.
/// Exercise actual SAC authorization freezes so neither partial payment nor a
/// terminal Fade state can survive; a later retry must settle the frozen price.
fn assert_fade_second_transfer_rollback(env: &Env, contract: &Address, positive: bool) {
    env.mock_all_auths_allowing_non_root_auth();
    let seller = Address::generate(env);
    let claimant = Address::generate(env);
    let issuer = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    sac.issuer()
        .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
    let asset = sac.address();
    let token = token::Client::new(env, &asset);
    let admin = token::StellarAssetClient::new(env, &asset);
    let client = AgyionClient::new(env, contract);
    admin.mint(&seller, &300);
    admin.mint(&claimant, &50);
    let start = env.ledger().sequence();
    let pod = client.create_pod(
        &seller, &asset, &100, &start, &pod_pubkey(env),
        &pod_create_proof(env, contract, &seller, &asset, 100, start),
    );
    let fade = client.create_fade(
        &seller, &asset, &100, &25, &-25, &1, &1, &100, &50, &venue_pubkey(env),
    );
    let claimed_at = start + if positive { 10 } else { 40 };
    env.ledger().set_sequence_number(claimed_at);
    client.claim(&fade, &claimant);
    let signature = sign_handoff(env, contract, fade, &claimant, 7);

    // Positive: buyer->seller works, but returning the pot from the frozen
    // kernel fails. Negative: compensation works, but the seller cannot receive
    // the remainder. Mock authorization cannot bypass either asset freeze.
    let blocked = if positive { contract } else { &seller };
    admin.set_authorized(blocked, &false);
    if !positive {
        env.set_auths(&[]); // negative settlement needs no claimant signature
    }
    env.ledger().set_sequence_number(claimed_at + 10);
    assert!(client.try_confirm_handoff(&fade, &7, &signature).is_err());
    let record = client.get_fade(&fade);
    assert_eq!(record.state, 1);
    assert_eq!(record.claimed_at, Some(claimed_at));
    assert_eq!(token.balance(&seller), 100);
    assert_eq!(token.balance(&claimant), 50);
    assert_eq!(token.balance(contract), 200);
    assert_eq!(client.get_pod(&pod).state, 0);

    env.mock_all_auths_allowing_non_root_auth();
    admin.set_authorized(blocked, &true);
    if !positive {
        env.set_auths(&[]);
    }
    client.confirm_handoff(&fade, &7, &signature);
    assert_eq!(client.get_fade(&fade).state, 2);
    assert_eq!(token.balance(&seller), if positive { 215 } else { 185 });
    assert_eq!(token.balance(&claimant), if positive { 35 } else { 65 });
    assert_eq!(token.balance(contract), 100); // the unrelated Pod is preserved
    assert_eq!(client.get_pod(&pod).state, 0);
    assert_eq!(client.try_confirm_handoff(&fade, &7, &signature), Err(Ok(Error::InvalidState)));
    assert_eq!(client.try_refund(&fade), Err(Ok(Error::DeadlinePassed)));
    assert_eq!(token.balance(contract), 100);
}

#[test]
fn fade_second_transfer_failure_preserves_all_reserves_and_frozen_price() {
    for positive in [true, false] {
        let env = Env::default();
        let contract = env.register(Agyion, ());
        assert_fade_second_transfer_rollback(&env, &contract, positive);
    }
}

#[test]
#[cfg(feature = "wasm-tests")]
fn wasm_fade_second_transfer_failure_preserves_all_reserves_and_frozen_price() {
    const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/hak.wasm");
    for positive in [true, false] {
        let env = Env::default();
        let contract = env.register(WASM, ());
        assert_fade_second_transfer_rollback(&env, &contract, positive);
    }
}
