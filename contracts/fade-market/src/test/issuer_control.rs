//! Synthetic local issuer controls, not mutations of Circle or any network.
use super::*;

fn classic_account_id() -> soroban_sdk::xdr::AccountId {
    use soroban_sdk::xdr;
    xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256([42; 32])))
}

// A real host G-account with native reserve but no trustline for the test SAC.
// Prepare before registration so no native contract-function state is discarded.
pub(super) fn with_classic_account(e: Env) -> Env {
    use soroban_sdk::xdr;
    use std::boxed::Box;
    let mut snapshot = e.to_snapshot();
    let account_id = classic_account_id();
    let key = xdr::LedgerKey::Account(xdr::LedgerKeyAccount {
        account_id: account_id.clone(),
    });
    let entry = xdr::LedgerEntry {
        last_modified_ledger_seq: 0,
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
    Env::from_snapshot(snapshot)
}

#[test]
fn missing_classic_trustline_preserves_reserved_offer_and_requires_opt_in_before_retry() {
    let check = |wasm| {
        use soroban_sdk::{xdr, TryIntoVal};
        let s = setup_with_issuer_and_account(wasm, false, true);
        let buyer: Address = xdr::ScAddress::Account(classic_account_id())
            .try_into_val(&s.e)
            .unwrap();
        let id = s.offer(-25);
        let unrelated = s.offer(0);
        let permit = s.permit(id, &buyer);
        s.reserve(&permit);
        let original = s.client().get_offer(&id);
        let active = s.client().get_active(&s.seller, &buyer);
        let receipt = permit.receipt;
        let signature = s.sign(b"agyion:market-reserved:v1\0", &receipt, &venue());
        // Absence of a trustline is a host error, not a usable zero balance.
        assert!(s.token().try_balance(&buyer).is_err());
        assert!(s
            .client()
            .try_settle_reserved(&receipt, &signature)
            .is_err());
        assert_eq!(s.client().get_offer(&id), original);
        assert_eq!(s.client().get_active(&s.seller, &buyer), active);
        assert_eq!(s.client().get_offer(&unrelated).state, OPEN);
        assert_eq!(s.client().reserved_balance(&s.asset), 200);
        assert_eq!(s.token().balance(&s.market), 200);
        assert_eq!(s.token().balance(&s.seller), 9800);
        s.e.set_auths(&[]);
        assert!(s.admin().try_trust(&buyer).is_err());
        assert!(s.token().try_balance(&buyer).is_err());
        s.e.mock_all_auths();
        s.admin().trust(&buyer);
        assert_eq!(s.token().balance(&buyer), 0);
        s.client().settle_reserved(&receipt, &signature);
        assert_eq!(s.token().balance(&buyer), 25);
        assert_eq!(s.token().balance(&s.seller), 9875);
        assert_eq!(s.token().balance(&s.market), 100);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.client().get_offer(&id).state, SETTLED);
        assert!(s.client().get_active(&s.seller, &buyer).is_none());
        assert_eq!(
            s.client().try_settle_reserved(&receipt, &signature),
            Err(Ok(Error::InvalidState))
        );
        s.e.ledger().set_sequence_number(201);
        s.e.set_auths(&[]);
        s.client().refund(&unrelated);
        assert_eq!(s.token().balance(&s.market), 0);
        assert_eq!(s.client().reserved_balance(&s.asset), 0);
    };
    check(false);
    #[cfg(feature = "wasm-tests")]
    check(true);
}

fn clawback_backends(f: impl Fn(Setup)) {
    f(setup_with_issuer(false, true));
    #[cfg(feature = "wasm-tests")]
    f(setup_with_issuer(true, true));
}

#[test]
fn issuer_clawback_deficit_blocks_existing_payouts_and_new_deposits_until_fully_repaired() {
    clawback_backends(|s| {
        for price in [25, 0, -25] {
            let buyer = s.buyer();
            let seller_before = s.token().balance(&s.seller);
            let id = s.offer(price);
            let other = s.offer(0);
            let receipt = s.receipt(id, &buyer);
            let signature = s.pickup(&receipt);
            let original = s.client().get_offer(&id);
            let other_original = s.client().get_offer(&other);

            // There is enough for either individual 100-unit pot, but not both.
            // This distinguishes aggregate protection from a transfer failure.
            s.admin().clawback(&s.market, &50);
            assert_eq!(s.token().balance(&s.market), 150);
            assert_eq!(s.client().reserved_balance(&s.asset), 200);
            s.admin().set_authorized(&s.market, &false);
            s.admin().set_authorized(&s.market, &true);
            assert_eq!(s.token().balance(&s.market), 150);
            assert_eq!(
                s.client().try_settle_walk_in(&receipt, &signature),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(
                s.client().try_create_offer(&s.seller, &s.terms(0)),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(s.client().get_offer(&id), original);
            assert_eq!(s.client().get_offer(&other), other_original);
            assert_eq!(s.token().balance(&buyer), 500);
            assert_eq!(s.token().balance(&s.seller), seller_before - 200);
            assert_eq!(s.token().balance(&s.market), 150);
            assert_eq!(s.client().reserved_balance(&s.asset), 200);

            // This donation is an explicit external replacement of burned value.
            // It creates no record or claimant right and is not an admin rescue.
            s.token().transfer(&buyer, &s.market, &49);
            assert_eq!(
                s.client().try_settle_walk_in(&receipt, &signature),
                Err(Ok(Error::Accounting))
            );
            assert_eq!(s.token().balance(&s.market), 199);
            s.token().transfer(&buyer, &s.market, &1);
            s.client().settle_walk_in(&receipt, &signature);
            assert_eq!(s.token().balance(&buyer), 450 - price);
            assert_eq!(s.token().balance(&s.seller), seller_before - 100 + price);
            assert_eq!(s.client().get_offer(&id).state, SETTLED);
            assert_eq!(s.client().get_offer(&other), other_original);
            assert_eq!(s.client().reserved_balance(&s.asset), 100);
            assert_eq!(s.token().balance(&s.market), 100);
            assert_eq!(
                s.client().try_settle_walk_in(&receipt, &signature),
                Err(Ok(Error::InvalidState))
            );
            // Rejected funding did not consume an offer ID or increment reserves.
            let next = s.offer(0);
            assert_eq!(next, other + 1);
            s.e.ledger()
                .set_sequence_number(s.e.ledger().sequence() + 101);
            s.e.set_auths(&[]);
            s.client().refund(&other);
            s.client().refund(&next);
            assert_eq!(s.client().reserved_balance(&s.asset), 0);
            assert_eq!(s.token().balance(&s.market), 0);
            assert_eq!(s.token().balance(&s.seller), seller_before + price);
            s.e.mock_all_auths();
        }
    });
}

#[test]
fn issuer_clawback_during_lazy_expired_slot_refund_preserves_both_offers_until_repair() {
    clawback_backends(|s| {
        let buyer = s.buyer();
        let mut short = s.terms(0);
        short.duration_ledgers = 10;
        let old = s.client().create_offer(&s.seller, &short);
        s.reserve(&s.permit(old, &buyer));
        let next = s.offer(0);
        let old_record = s.client().get_offer(&old);
        let next_record = s.client().get_offer(&next);
        let old_slot = s.client().get_active(&s.seller, &buyer);
        s.e.ledger().set_sequence_number(121);
        s.admin().clawback(&s.market, &50);
        let permit = s.permit(next, &buyer);
        let signature = s.sign(b"agyion:market-reserve:v1\0", &permit, &venue());
        assert_eq!(
            s.client().try_reserve(&permit, &signature),
            Err(Ok(Error::Accounting))
        );
        assert_eq!(s.client().get_offer(&old), old_record);
        assert_eq!(s.client().get_offer(&next), next_record);
        assert_eq!(s.client().get_active(&s.seller, &buyer), old_slot);
        assert_eq!(s.client().reserved_balance(&s.asset), 200);
        assert_eq!(s.token().balance(&s.market), 150);
        assert_eq!(s.token().balance(&s.seller), 9800);
        s.e.set_auths(&[]);
        assert_eq!(s.client().try_refund(&old), Err(Ok(Error::Accounting)));
        assert_eq!(
            s.client().try_expire_reservation(&old),
            Err(Ok(Error::Accounting))
        );
        s.e.mock_all_auths();
        assert_eq!(
            s.client().try_cancel_reservation(&old, &buyer, &1),
            Err(Ok(Error::Accounting))
        );
        assert_eq!(s.client().get_active(&s.seller, &buyer), old_slot);

        s.token().transfer(&buyer, &s.market, &50);
        s.client().reserve(&permit, &signature);
        assert_eq!(s.client().get_offer(&old).state, REFUNDED);
        assert_eq!(s.client().get_offer(&next).state, RESERVED);
        assert_eq!(s.client().get_offer(&next).sequence, 1);
        assert_eq!(
            s.client().get_active(&s.seller, &buyer).unwrap().offer_id,
            next
        );
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.token().balance(&s.market), 100);
        assert_eq!(s.token().balance(&s.seller), 9900);
        assert_eq!(
            s.client().try_cancel_reservation(&old, &buyer, &1),
            Err(Ok(Error::InvalidState))
        );
        assert_eq!(
            s.client().get_active(&s.seller, &buyer).unwrap().offer_id,
            next
        );
        s.e.ledger().set_sequence_number(201);
        s.e.set_auths(&[]);
        s.client().expire_reservation(&next);
        assert!(s.client().get_active(&s.seller, &buyer).is_none());
        assert_eq!(s.client().reserved_balance(&s.asset), 0);
        assert_eq!(s.token().balance(&s.market), 0);
        assert_eq!(s.token().balance(&s.seller), 10_000);
        assert_eq!(s.token().balance(&buyer), 450);
    });
}
