extern crate std;
use crate::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, IssuerFlags, Ledger as _, MockAuth, MockAuthInvoke},
    token,
    xdr::{ToXdr, WriteXdr},
    Address, Bytes, BytesN, Env, IntoVal, Vec,
};

struct Setup {
    e: Env,
    market: Address,
    seller: Address,
    asset: Address,
}
impl Setup {
    fn client(&self) -> AgyionFadeMarketClient<'_> {
        AgyionFadeMarketClient::new(&self.e, &self.market)
    }
    fn token(&self) -> token::Client<'_> {
        token::Client::new(&self.e, &self.asset)
    }
    fn admin(&self) -> token::StellarAssetClient<'_> {
        token::StellarAssetClient::new(&self.e, &self.asset)
    }
    fn buyer(&self) -> Address {
        let a = Address::generate(&self.e);
        self.admin().mint(&a, &500);
        a
    }
    fn terms(&self, price: i128) -> OfferTerms {
        OfferTerms {
            asset: self.asset.clone(),
            pot: 100,
            start_price: price,
            floor_price: price,
            slope_num: 0,
            slope_den: 1,
            duration_ledgers: 100,
            lease_ledgers: 20,
            metadata_hash: BytesN::from_array(&self.e, &[1; 32]),
        }
    }
    fn offer(&self, price: i128) -> u64 {
        self.client().create_offer(&self.seller, &self.terms(price))
    }
    fn receipt(&self, id: u64, buyer: &Address) -> PickupReceipt {
        let o = self.client().get_offer(&id);
        let now = self.e.ledger().sequence();
        PickupReceipt {
            offer_id: id,
            claimant: buyer.clone(),
            terms_hash: o.terms_hash,
            key_epoch: self.client().get_merchant(&self.seller).epoch,
            sequence: o.sequence + 1,
            valid_from: now,
            valid_until: now + 6,
            max_price: 100,
            nonce: BytesN::from_array(&self.e, &[9; 32]),
        }
    }
    fn sign<T: ToXdr + Clone>(&self, purpose: &[u8], value: &T, key: &SigningKey) -> BytesN<64> {
        let mut b = Bytes::from_slice(&self.e, purpose);
        b.append(&Bytes::from(self.e.ledger().network_id()));
        b.append(&self.market.clone().to_xdr(&self.e));
        b.append(&value.clone().to_xdr(&self.e));
        BytesN::from_array(
            &self.e,
            &key.sign(&b.iter().collect::<std::vec::Vec<u8>>())
                .to_bytes(),
        )
    }
    fn pickup(&self, r: &PickupReceipt) -> BytesN<64> {
        self.sign(b"agyion:market-walk-in:v1\0", r, &venue())
    }
    fn permit(&self, id: u64, buyer: &Address) -> ReservationPermit {
        let r = self.receipt(id, buyer);
        ReservationPermit {
            receipt: r,
            lease_until: self.e.ledger().sequence() + 20,
        }
    }
    fn reserve(&self, p: &ReservationPermit) {
        self.client()
            .reserve(p, &self.sign(b"agyion:market-reserve:v1\0", p, &venue()));
    }
}
fn venue() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}
fn public(e: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(e, &k.verifying_key().to_bytes())
}
fn setup(wasm: bool) -> Setup {
    setup_with_issuer(wasm, false)
}
fn setup_with_issuer(wasm: bool, clawback: bool) -> Setup {
    setup_with_issuer_and_account(wasm, clawback, false)
}
fn setup_with_issuer_and_account(wasm: bool, clawback: bool, classic_account: bool) -> Setup {
    let mut e = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    if classic_account {
        e = issuer_control::with_classic_account(e);
    }
    e.mock_all_auths();
    let network = e
        .crypto()
        .sha256(&Bytes::from_slice(&e, b"Test SDF Network ; September 2015"))
        .to_bytes()
        .to_array();
    e.ledger().with_mut(|l| {
        l.network_id = network;
        l.sequence_number = 100;
    });
    let seller = Address::generate(&e);
    let issuer = Address::generate(&e);
    let sac = e.register_stellar_asset_contract_v2(issuer);
    sac.issuer().set_flag(IssuerFlags::RevocableFlag);
    if clawback {
        sac.issuer().set_flag(IssuerFlags::ClawbackEnabledFlag);
    }
    let asset_xdr = Bytes::from_slice(
        &e,
        &sac.asset()
            .to_xdr(soroban_sdk::xdr::Limits::none())
            .unwrap(),
    );
    let args = (Vec::from_array(&e, [asset_xdr]),);
    let market = if wasm {
        #[cfg(feature = "wasm-tests")]
        {
            e.register(
                include_bytes!("../target/wasm32v1-none/release/fade_market.wasm").as_slice(),
                args,
            )
        }
        #[cfg(not(feature = "wasm-tests"))]
        {
            panic!("WASM feature must be enabled")
        }
    } else {
        e.register(AgyionFadeMarket, args)
    };
    let s = Setup {
        e,
        market,
        seller,
        asset: sac.address(),
    };
    s.admin().mint(&s.seller, &10_000);
    s.client()
        .register_merchant(&s.seller, &public(&s.e, &venue()));
    s
}
fn backends(f: impl Fn(Setup)) {
    f(setup(false));
    #[cfg(feature = "wasm-tests")]
    f(setup(true));
}

mod issuer_control;

#[test]
fn seller_auth_registration_and_immutable_funding() {
    backends(|s| {
        let c = s.client();
        assert_eq!(c.protocol_version(), 1);
        assert_eq!(c.get_merchant(&s.seller).epoch, 1);
        s.e.set_auths(&[]);
        assert!(c
            .try_register_merchant(&s.seller, &public(&s.e, &SigningKey::from_bytes(&[8; 32])))
            .is_err());
        assert!(c.try_create_offer(&s.seller, &s.terms(20)).is_err());
        assert_eq!(s.token().balance(&s.seller), 10_000);
        s.e.mock_all_auths();
        let id = s.offer(20);
        let o = c.get_offer(&id);
        assert_eq!(id, 1);
        assert_eq!(o.terms, s.terms(20));
        assert_eq!(o.state, 0);
        assert_eq!(o.sequence, 0);
        assert_eq!(
            o.terms_hash,
            s.e.crypto().sha256(&o.terms.to_xdr(&s.e)).to_bytes()
        );
        assert_eq!(c.reserved_balance(&s.asset), 100);
        assert_eq!(s.token().balance(&s.market), 100);
        let auths = s.e.auths();
        assert!(auths.is_empty()); // last operation above was a view
    });
}

#[test]
fn atomic_walk_in_positive_zero_negative_and_replay() {
    backends(|s| {
        for price in [30, 0, -40] {
            let b = s.buyer();
            let before = s.token().balance(&s.seller);
            let id = s.offer(price);
            let r = s.receipt(id, &b);
            let sig = s.pickup(&r);
            s.e.set_auths(&[]);
            assert!(s.client().try_settle_walk_in(&r, &sig).is_err());
            assert_eq!(s.client().get_offer(&id).state, 0);
            assert_eq!(s.token().balance(&b), 500);
            let transfers = if price > 0 {
                std::vec![MockAuthInvoke {
                    contract: &s.asset,
                    fn_name: "transfer",
                    args: (b.clone(), s.seller.clone(), price).into_val(&s.e),
                    sub_invokes: &[]
                }]
            } else {
                std::vec![]
            };
            s.e.mock_auths(&[MockAuth {
                address: &b,
                invoke: &MockAuthInvoke {
                    contract: &s.market,
                    fn_name: "settle_walk_in",
                    args: (r.clone(), sig.clone()).into_val(&s.e),
                    sub_invokes: &transfers,
                },
            }]);
            s.client().settle_walk_in(&r, &sig);
            assert_eq!(s.token().balance(&b), 500 - price);
            assert_eq!(s.token().balance(&s.seller), before + price);
            assert_eq!(s.client().reserved_balance(&s.asset), 0);
            assert_eq!(s.token().balance(&s.market), 0);
            assert_eq!(s.client().get_offer(&id).settled_price, Some(price));
            assert_eq!(s.client().get_offer(&id).settled_to, Some(b));
            s.e.mock_all_auths();
            assert_eq!(
                s.client().try_settle_walk_in(&r, &sig),
                Err(Ok(Error::InvalidState))
            );
        }
    });
}

#[test]
fn signed_walk_in_quote_and_exact_debit_auth_survive_ledger_advancement() {
    backends(|s| {
        for (quoted, floor) in [(200, 100), (10, -100), (-10, -100)] {
            s.e.mock_all_auths();
            let b = s.buyer();
            let before_seller = s.token().balance(&s.seller);
            let mut t = s.terms(quoted);
            t.floor_price = floor;
            t.slope_num = 10;
            let id = s.client().create_offer(&s.seller, &t);
            let mut r = s.receipt(id, &b);
            r.max_price = quoted;
            let sig = s.pickup(&r);
            let child = if quoted > 0 {
                std::vec![MockAuthInvoke {
                    contract: &s.asset,
                    fn_name: "transfer",
                    args: (b.clone(), s.seller.clone(), quoted).into_val(&s.e),
                    sub_invokes: &[],
                }]
            } else {
                std::vec![]
            };
            s.e.mock_auths(&[MockAuth {
                address: &b,
                invoke: &MockAuthInvoke {
                    contract: &s.market,
                    fn_name: "settle_walk_in",
                    args: (r.clone(), sig.clone()).into_val(&s.e),
                    sub_invokes: &child,
                },
            }]);
            s.e.ledger().set_sequence_number(r.valid_from + 2);
            assert_eq!(s.client().price(&id), quoted - 20);
            assert_eq!(s.client().try_settle_walk_in(&r, &sig), Ok(Ok(())));
            assert_eq!(s.token().balance(&b), 500 - quoted);
            assert_eq!(s.token().balance(&s.seller), before_seller + quoted);
            assert_eq!(s.client().get_offer(&id).settled_price, Some(quoted));
            assert_eq!(s.client().reserved_balance(&s.asset), 0);
        }
    });
}

#[test]
fn walk_in_quote_cannot_predate_its_offer_or_reuse_an_expired_price() {
    backends(|s| {
        let b = s.buyer();
        let id = s.offer(20);
        let mut r = s.receipt(id, &b);
        r.valid_from -= 1;
        assert_eq!(
            s.client().try_settle_walk_in(&r, &s.pickup(&r)),
            Err(Ok(Error::InvalidWindow))
        );
        r.valid_from += 1;
        s.e.ledger().set_sequence_number(r.valid_until + 1);
        assert_eq!(
            s.client().try_settle_walk_in(&r, &s.pickup(&r)),
            Err(Ok(Error::InvalidWindow))
        );
        assert_eq!(s.client().get_offer(&id).state, OPEN);
        assert_eq!(s.token().balance(&b), 500);
    });
}

#[test]
fn receipts_bind_claimant_terms_epoch_sequence_purpose_and_price() {
    backends(|s| {
        let b = s.buyer();
        let other = s.buyer();
        let id = s.offer(-10);
        let r = s.receipt(id, &b);
        let sig = s.pickup(&r);
        let mut changed = r.clone();
        changed.claimant = other.clone();
        assert!(s.client().try_settle_walk_in(&changed, &sig).is_err());
        changed = r.clone();
        changed.terms_hash = BytesN::from_array(&s.e, &[3; 32]);
        assert!(s.client().try_settle_walk_in(&changed, &sig).is_err());
        changed = r.clone();
        changed.sequence += 1;
        assert_eq!(
            s.client().try_settle_walk_in(&changed, &s.pickup(&changed)),
            Err(Ok(Error::WrongSequence))
        );
        changed = r.clone();
        changed.key_epoch += 1;
        assert_eq!(
            s.client().try_settle_walk_in(&changed, &s.pickup(&changed)),
            Err(Ok(Error::WrongEpoch))
        );
        changed = r.clone();
        changed.max_price = -11;
        assert_eq!(
            s.client().try_settle_walk_in(&changed, &s.pickup(&changed)),
            Err(Ok(Error::PriceExceeded))
        );
        let foreign = s.sign(b"agyion:market-reserved:v1\0", &r, &venue());
        assert!(s.client().try_settle_walk_in(&r, &foreign).is_err());
        assert_eq!(s.client().get_offer(&id).state, 0);
        assert_eq!(s.token().balance(&other), 500);
        changed = r.clone();
        changed.max_price = -10;
        s.client().settle_walk_in(&changed, &s.pickup(&changed));
        assert_eq!(s.token().balance(&b), 510);
    });
}

#[test]
fn receipt_windows_and_deadline_are_enforced() {
    backends(|s| {
        let b = s.buyer();
        let id = s.offer(0);
        let mut r = s.receipt(id, &b);
        r.valid_from = 101;
        assert_eq!(
            s.client().try_settle_walk_in(&r, &s.pickup(&r)),
            Err(Ok(Error::InvalidWindow))
        );
        r.valid_from = 100;
        r.valid_until = 113;
        assert_eq!(
            s.client().try_settle_walk_in(&r, &s.pickup(&r)),
            Err(Ok(Error::InvalidWindow))
        );
        r.valid_until = 106;
        let sig = s.pickup(&r);
        s.e.ledger().set_sequence_number(107);
        assert_eq!(
            s.client().try_settle_walk_in(&r, &sig),
            Err(Ok(Error::InvalidWindow))
        );
        s.e.ledger().set_sequence_number(200);
        assert_eq!(s.client().try_refund(&id), Err(Ok(Error::InvalidWindow)));
        s.e.ledger().set_sequence_number(201);
        s.e.set_auths(&[]);
        s.client().refund(&id);
        assert_eq!(s.client().get_offer(&id).state, 3);
        assert_eq!(s.client().reserved_balance(&s.asset), 0);
        assert_eq!(s.token().balance(&s.seller), 10_000);
    });
}

#[test]
fn lease_reopens_without_refunding_and_old_receipt_cannot_return() {
    backends(|s| {
        let b = s.buyer();
        let id = s.offer(-20);
        let p = s.permit(id, &b);
        s.reserve(&p);
        let mut old = p.receipt.clone();
        old.valid_from = 119;
        old.valid_until = 125;
        let oldsig = s.sign(b"agyion:market-reserved:v1\0", &old, &venue());
        s.e.ledger().set_sequence_number(120);
        assert_eq!(
            s.client().try_expire_reservation(&id),
            Err(Ok(Error::InvalidWindow))
        );
        s.e.ledger().set_sequence_number(121);
        s.e.set_auths(&[]);
        s.client().expire_reservation(&id);
        assert_eq!(s.client().get_offer(&id).state, 0);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.token().balance(&s.seller), 9900);
        assert!(s.client().get_active(&s.seller, &b).is_none());
        s.e.mock_all_auths();
        let next = s.permit(id, &b);
        assert_eq!(next.receipt.sequence, 2);
        s.reserve(&next);
        assert_eq!(
            s.client().try_settle_reserved(&old, &oldsig),
            Err(Ok(Error::WrongSequence))
        );
        let mut r = next.receipt.clone();
        r.valid_from = 121;
        r.valid_until = 127;
        s.client()
            .settle_reserved(&r, &s.sign(b"agyion:market-reserved:v1\0", &r, &venue()));
        assert_eq!(s.token().balance(&b), 520);
        assert!(s.client().get_active(&s.seller, &b).is_none());
    });
}

#[test]
fn reservation_is_merchant_admitted_buyer_authorized_and_one_slot_per_shop() {
    backends(|s| {
        let b = s.buyer();
        let other = s.buyer();
        let a = s.offer(0);
        let second = s.offer(0);
        let p = s.permit(a, &b);
        let wrong = s.sign(
            b"agyion:market-reserve:v1\0",
            &p,
            &SigningKey::from_bytes(&[19; 32]),
        );
        assert!(s.client().try_reserve(&p, &wrong).is_err());
        let sig = s.sign(b"agyion:market-reserve:v1\0", &p, &venue());
        s.e.set_auths(&[]);
        assert!(s.client().try_reserve(&p, &sig).is_err());
        s.e.mock_all_auths();
        s.reserve(&p);
        let p2 = s.permit(second, &b);
        assert_eq!(
            s.client()
                .try_reserve(&p2, &s.sign(b"agyion:market-reserve:v1\0", &p2, &venue())),
            Err(Ok(Error::ActiveReservation))
        );
        assert_eq!(
            s.client().try_cancel_reservation(&a, &other, &1),
            Err(Ok(Error::Unauthorized))
        );
        s.e.set_auths(&[]);
        assert!(s.client().try_cancel_reservation(&a, &b, &1).is_err());
        s.e.mock_all_auths();
        s.client().cancel_reservation(&a, &b, &1);
        s.reserve(&p2);
        assert_eq!(
            s.client().get_active(&s.seller, &b).unwrap().offer_id,
            second
        );
        assert_eq!(
            s.client().try_expire_reservation(&a),
            Err(Ok(Error::InvalidState))
        );
        assert_eq!(
            s.client().get_active(&s.seller, &b).unwrap().offer_id,
            second
        );
    });
}

#[test]
fn expired_slot_is_lazily_released_and_final_deadline_refunds() {
    backends(|s| {
        let b = s.buyer();
        let a = s.offer(-5);
        let p = s.permit(a, &b);
        s.reserve(&p);
        s.e.ledger().set_sequence_number(121);
        let second = s.offer(-5);
        let p2 = s.permit(second, &b);
        s.reserve(&p2);
        assert_eq!(s.client().get_offer(&a).state, 0);
        assert_eq!(s.client().reserved_balance(&s.asset), 200);
        s.e.ledger().set_sequence_number(142);
        s.client().expire_reservation(&second);
        s.e.ledger().set_sequence_number(199);
        let mut last = s.permit(a, &b);
        last.lease_until = 219;
        s.reserve(&last);
        s.e.ledger().set_sequence_number(220);
        s.e.set_auths(&[]);
        s.client().expire_reservation(&a);
        assert_eq!(s.client().get_offer(&a).state, 3);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        s.e.ledger().set_sequence_number(222);
        s.client().refund(&second);
        assert_eq!(s.token().balance(&s.seller), 10_000);
    });
}

#[test]
fn merchant_rotation_changes_new_permits_but_keeps_existing_lease_key() {
    backends(|s| {
        let b = s.buyer();
        let a = s.offer(0);
        let p = s.permit(a, &b);
        s.reserve(&p);
        let nextkey = SigningKey::from_bytes(&[8; 32]);
        let m = s
            .client()
            .register_merchant(&s.seller, &public(&s.e, &nextkey));
        assert_eq!(m.epoch, 2);
        let r = p.receipt;
        s.client()
            .settle_reserved(&r, &s.sign(b"agyion:market-reserved:v1\0", &r, &venue()));
        let next = s.offer(0);
        let r = s.receipt(next, &b);
        assert_eq!(r.key_epoch, 2);
        assert!(s.client().try_settle_walk_in(&r, &s.pickup(&r)).is_err());
        s.client()
            .settle_walk_in(&r, &s.sign(b"agyion:market-walk-in:v1\0", &r, &nextkey));
    });
}

#[test]
fn second_token_transfer_failure_rolls_back_every_obligation_and_auth_tree() {
    backends(|s| {
        for positive in [true, false] {
            let b = s.buyer();
            let baseline = s.token().balance(&s.seller);
            let unrelated = s.offer(0);
            let a = s.offer(if positive { 25 } else { -25 });
            let r = s.receipt(a, &b);
            let sig = s.pickup(&r);
            let blocked = if positive { &s.market } else { &s.seller };
            s.admin().set_authorized(blocked, &false);
            assert!(s.client().try_settle_walk_in(&r, &sig).is_err());
            assert_eq!(s.token().balance(&b), 500);
            assert_eq!(s.token().balance(&s.seller), baseline - 200);
            assert_eq!(s.token().balance(&s.market), 200);
            assert_eq!(s.client().reserved_balance(&s.asset), 200);
            assert_eq!(s.client().get_offer(&a).state, 0);
            assert_eq!(s.client().get_offer(&a).sequence, 0);
            s.admin().set_authorized(blocked, &true);
            s.client().settle_walk_in(&r, &sig);
            assert_eq!(s.client().reserved_balance(&s.asset), 100);
            assert_eq!(s.client().get_offer(&unrelated).state, 0);
            s.e.ledger()
                .set_sequence_number(s.e.ledger().sequence() + 101);
            s.client().refund(&unrelated);
        }
    });
}

#[test]
fn ten_claimants_only_one_success_without_browser_order_claim() {
    backends(|s| {
        let a = s.offer(-10);
        let buyers: std::vec::Vec<_> = (0..10).map(|_| s.buyer()).collect();
        let mut count = 0;
        for offset in 0..10 {
            let b = &buyers[(offset + 7) % 10];
            let mut r = s.receipt(a, b);
            r.sequence = 1;
            let sig = s.pickup(&r);
            let result = s.client().try_settle_walk_in(&r, &sig);
            if offset == 0 {
                assert_eq!(result, Ok(Ok(())));
                count += 1;
            } else {
                assert_eq!(result, Err(Ok(Error::InvalidState)));
            }
        }
        assert_eq!(count, 1);
        assert_eq!(s.client().get_offer(&a).settled_to, Some(buyers[7].clone()));
        for (index, b) in buyers.iter().enumerate() {
            assert_eq!(s.token().balance(b), if index == 7 { 510 } else { 500 });
        }
        assert_eq!(s.token().balance(&s.market), 0);
    });
}

#[test]
fn bad_terms_self_destinations_unknown_tokens_and_overflow_never_take_funds() {
    backends(|s| {
        for change in 0..6 {
            let mut t = s.terms(0);
            match change {
                0 => t.floor_price = -101,
                1 => t.slope_den = 0,
                2 => t.duration_ledgers = u32::MAX,
                3 => t.lease_ledgers = 721,
                4 => t.asset = s.market.clone(),
                _ => t.asset = Address::generate(&s.e),
            };
            assert!(s.client().try_create_offer(&s.seller, &t).is_err());
            assert_eq!(s.token().balance(&s.seller), 10_000);
        }
        let a = s.offer(0);
        assert_eq!(a, 1);
        for target in [&s.market, &s.asset, &s.seller] {
            let r = s.receipt(a, target);
            assert_eq!(
                s.client().try_settle_walk_in(&r, &s.pickup(&r)),
                Err(Ok(Error::InvalidDestination))
            );
        }
        let saved_ledger = s.e.ledger().get();
        s.e.ledger().with_mut(|l| {
            l.sequence_number = u32::MAX - 50;
            l.min_persistent_entry_ttl = 1;
            l.min_temp_entry_ttl = 1;
            l.max_entry_ttl = 25;
        });
        assert_eq!(
            s.client().try_create_offer(&s.seller, &s.terms(0)),
            Err(Ok(Error::Overflow))
        );
        // Restore a realistic ledger for the SAC's own TTL/balance operations.
        s.e.ledger().set(saved_ledger);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.token().balance(&s.seller), 9900);
    });
}

#[test]
fn wide_price_arithmetic_and_no_reservations_when_disabled() {
    backends(|s| {
        let mut t = s.terms(i128::MAX);
        t.floor_price = -100;
        t.slope_num = i128::MAX;
        t.slope_den = 1;
        t.lease_ledgers = 0;
        let a = s.client().create_offer(&s.seller, &t);
        assert_eq!(s.client().price(&a), i128::MAX);
        s.e.ledger().set_sequence_number(102);
        assert_eq!(s.client().price(&a), -100);
        let b = s.buyer();
        let p = s.permit(a, &b);
        assert_eq!(
            s.client()
                .try_reserve(&p, &s.sign(b"agyion:market-reserve:v1\0", &p, &venue())),
            Err(Ok(Error::InvalidTerms))
        );
        let r = s.receipt(a, &b);
        s.client().settle_walk_in(&r, &s.pickup(&r));
        assert_eq!(s.token().balance(&b), 600);
    });
}

#[test]
fn independent_javascript_terms_hash_matches_rust_scval_encoding() {
    let e = Env::default();
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../market/fixtures/offer-terms.json")).unwrap();
    let v = &fixture["terms"];
    let t = OfferTerms {
        asset: Address::from_str(&e, v["asset"].as_str().unwrap()),
        pot: v["pot"].as_str().unwrap().parse().unwrap(),
        start_price: v["start_price"].as_str().unwrap().parse().unwrap(),
        floor_price: v["floor_price"].as_str().unwrap().parse().unwrap(),
        slope_num: v["slope_num"].as_str().unwrap().parse().unwrap(),
        slope_den: v["slope_den"].as_str().unwrap().parse().unwrap(),
        duration_ledgers: v["duration_ledgers"].as_u64().unwrap() as u32,
        lease_ledgers: v["lease_ledgers"].as_u64().unwrap() as u32,
        metadata_hash: BytesN::from_array(&e, &[0x2b; 32]),
    };
    let digest = e.crypto().sha256(&t.to_xdr(&e)).to_bytes();
    let hex: std::string::String = digest.iter().map(|n| std::format!("{n:02x}")).collect();
    assert_eq!(hex, fixture["sha256"].as_str().unwrap());
}

fn fixture_bytes<const N: usize>(value: &serde_json::Value) -> [u8; N] {
    let value = value.as_str().unwrap();
    assert_eq!(value.len(), N * 2);
    core::array::from_fn(|i| u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).unwrap())
}

#[test]
fn independent_javascript_pickup_signatures_match_rust_production_verifier() {
    let e = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../market/fixtures/pickup-signatures.json"
    ))
    .unwrap();
    assert_eq!(fixture["testOnly"], true);
    e.ledger()
        .with_mut(|l| l.network_id = fixture_bytes(&fixture["networkId"]));
    let contract = Address::from_str(&e, fixture["contract"].as_str().unwrap());
    e.register_at(
        &contract,
        AgyionFadeMarket,
        (Vec::from_array(&e, [Bytes::from_array(&e, &[0, 0, 0, 0])]),),
    );
    let v = &fixture["receipt"];
    let r = PickupReceipt {
        offer_id: v["offer_id"].as_str().unwrap().parse().unwrap(),
        claimant: Address::from_str(&e, v["claimant"].as_str().unwrap()),
        terms_hash: BytesN::from_array(&e, &fixture_bytes(&v["terms_hash"])),
        key_epoch: v["key_epoch"].as_u64().unwrap().try_into().unwrap(),
        sequence: v["sequence"].as_str().unwrap().parse().unwrap(),
        valid_from: v["valid_from"].as_u64().unwrap().try_into().unwrap(),
        valid_until: v["valid_until"].as_u64().unwrap().try_into().unwrap(),
        max_price: v["max_price"].as_str().unwrap().parse().unwrap(),
        nonce: BytesN::from_array(&e, &fixture_bytes(&v["nonce"])),
    };
    let key = BytesN::from_array(&e, &fixture_bytes(&fixture["publicKey"]));
    for case in fixture["cases"].as_array().unwrap() {
        let action = case["action"].as_str().unwrap();
        let purpose = std::format!("agyion:market-{action}:v1\0");
        let signature = BytesN::from_array(&e, &fixture_bytes(&case["signature"]));
        let permit = ReservationPermit {
            receipt: r.clone(),
            lease_until: case["leaseUntil"].as_u64().unwrap_or(0).try_into().unwrap(),
        };
        let value = if action == "reserve" {
            permit.clone().to_xdr(&e)
        } else {
            r.clone().to_xdr(&e)
        };
        let mut payload = Bytes::from_slice(&e, purpose.as_bytes());
        payload.append(&Bytes::from(e.ledger().network_id()));
        payload.append(&contract.clone().to_xdr(&e));
        payload.append(&value);
        let hex: std::string::String = payload.iter().map(|n| std::format!("{n:02x}")).collect();
        assert_eq!(hex, case["payloadHex"].as_str().unwrap());
        e.as_contract(&contract, || {
            if action == "reserve" {
                verify(&e, purpose.as_bytes(), &permit, &key, &signature);
            } else {
                verify(&e, purpose.as_bytes(), &r, &key, &signature);
            }
        });
    }
}

#[test]
fn signatures_from_other_contracts_or_networks_cannot_settle_funded_offers() {
    backends(|s| {
        let b = s.buyer();
        let id = s.offer(-40);
        let r = s.receipt(id, &b);
        let correct = s.pickup(&r);
        let other_contract = Address::generate(&s.e);
        for (network, contract) in [
            (s.e.ledger().network_id(), other_contract),
            (BytesN::from_array(&s.e, &[0x42; 32]), s.market.clone()),
        ] {
            let mut payload = Bytes::from_slice(&s.e, b"agyion:market-walk-in:v1\0");
            payload.append(&Bytes::from(network));
            payload.append(&contract.to_xdr(&s.e));
            payload.append(&r.clone().to_xdr(&s.e));
            let sig = BytesN::from_array(
                &s.e,
                &venue()
                    .sign(&payload.iter().collect::<std::vec::Vec<u8>>())
                    .to_bytes(),
            );
            assert!(s.client().try_settle_walk_in(&r, &sig).is_err());
            assert_eq!(s.client().get_offer(&id).state, OPEN);
            assert_eq!(s.client().reserved_balance(&s.asset), 100);
            assert_eq!(s.token().balance(&b), 500);
        }
        // The exact same receipt succeeds once its network and contract domain match.
        s.client().settle_walk_in(&r, &correct);
        assert_eq!(s.token().balance(&b), 540);
    });
}

#[test]
fn counter_epoch_and_sequence_overflow_fail_before_value_or_authority_changes() {
    backends(|s| {
        let c = s.client();
        let a = s.offer(0);
        let b = s.buyer();
        let r = s.receipt(a, &b);
        s.e.as_contract(&s.market, || {
            s.e.storage().instance().set(&Key::Count, &u64::MAX);
        });
        assert_eq!(
            c.try_create_offer(&s.seller, &s.terms(0)),
            Err(Ok(Error::Overflow))
        );
        let mut m = c.get_merchant(&s.seller);
        m.epoch = u32::MAX;
        s.e.as_contract(&s.market, || {
            s.e.storage()
                .persistent()
                .set(&Key::Merchant(s.seller.clone()), &m);
        });
        assert_eq!(
            c.try_register_merchant(&s.seller, &public(&s.e, &venue())),
            Err(Ok(Error::Overflow))
        );
        assert_eq!(c.get_merchant(&s.seller), m);
        let mut o = c.get_offer(&a);
        o.sequence = u64::MAX;
        s.e.as_contract(&s.market, || {
            s.e.storage().persistent().set(&Key::Offer(a), &o);
        });
        assert_eq!(
            c.try_settle_walk_in(&r, &s.pickup(&r)),
            Err(Ok(Error::Overflow))
        );
        assert_eq!(s.token().balance(&s.seller), 9900);
        assert_eq!(s.token().balance(&s.market), 100);
        assert_eq!(c.get_offer(&a).state, 0);
    });
}

#[test]
fn failed_reserved_settlement_and_refund_preserve_slot_sequence_and_other_pots() {
    backends(|s| {
        let b = s.buyer();
        let a = s.offer(-25);
        let other = s.offer(0);
        let p = s.permit(a, &b);
        s.reserve(&p);
        let r = p.receipt;
        let sig = s.sign(b"agyion:market-reserved:v1\0", &r, &venue());
        s.admin().set_authorized(&s.seller, &false);
        assert!(s.client().try_settle_reserved(&r, &sig).is_err());
        assert_eq!(s.client().get_offer(&a).state, 1);
        assert_eq!(s.client().get_offer(&a).sequence, 1);
        assert_eq!(s.client().get_active(&s.seller, &b).unwrap().offer_id, a);
        assert_eq!(s.client().reserved_balance(&s.asset), 200);
        assert_eq!(s.token().balance(&b), 500);
        s.e.ledger().set_sequence_number(201);
        s.e.set_auths(&[]);
        assert!(s.client().try_expire_reservation(&a).is_err());
        assert_eq!(s.client().get_offer(&a).state, 1);
        assert!(s.client().get_active(&s.seller, &b).is_some());
        assert_eq!(s.client().get_offer(&other).state, 0);
        s.e.mock_all_auths();
        s.admin().set_authorized(&s.seller, &true);
        s.e.set_auths(&[]);
        s.client().expire_reservation(&a);
        s.client().refund(&other);
        assert_eq!(s.client().reserved_balance(&s.asset), 0);
        assert_eq!(s.token().balance(&s.seller), 10_000);
    });
}

#[test]
fn expired_handoff_and_frozen_reservation_price_are_independent_of_the_live_curve() {
    backends(|s| {
        let mut t = s.terms(20);
        t.floor_price = -20;
        t.slope_num = 1;
        let a = s.client().create_offer(&s.seller, &t);
        let b = s.buyer();
        let p = s.permit(a, &b);
        s.reserve(&p);
        s.e.ledger().set_sequence_number(110);
        assert_eq!(s.client().price(&a), 10);
        let mut r = p.receipt;
        r.valid_from = 110;
        r.valid_until = 116;
        let sig = s.sign(b"agyion:market-reserved:v1\0", &r, &venue());
        s.client().settle_reserved(&r, &sig);
        assert_eq!(s.token().balance(&b), 480);
        assert_eq!(s.client().get_offer(&a).settled_price, Some(20));
        let second = s.offer(0);
        let p = s.permit(second, &b);
        s.reserve(&p);
        s.e.ledger().set_sequence_number(131);
        let mut r = p.receipt;
        r.valid_from = 131;
        r.valid_until = 137;
        assert_eq!(
            s.client()
                .try_settle_reserved(&r, &s.sign(b"agyion:market-reserved:v1\0", &r, &venue())),
            Err(Ok(Error::InvalidWindow))
        );
    });
}

#[test]
fn missing_reserve_blocks_funding_and_missing_active_slot_blocks_settlement() {
    backends(|s| {
        let b = s.buyer();
        let a = s.offer(0);
        let p = s.permit(a, &b);
        s.reserve(&p);
        s.e.as_contract(&s.market, || {
            s.e.storage()
                .persistent()
                .remove(&Key::Slot(s.seller.clone(), b.clone()));
        });
        let r = p.receipt;
        let sig = s.sign(b"agyion:market-reserved:v1\0", &r, &venue());
        assert_eq!(
            s.client().try_settle_reserved(&r, &sig),
            Err(Ok(Error::ArchiveUnavailable))
        );
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.client().get_offer(&a).state, 1);
        s.e.as_contract(&s.market, || {
            s.e.storage()
                .persistent()
                .remove(&Key::Reserve(s.asset.clone()));
        });
        assert_eq!(
            s.client().try_reserved_balance(&s.asset),
            Err(Ok(Error::ArchiveUnavailable))
        );
        assert!(s.client().try_create_offer(&s.seller, &s.terms(0)).is_err());
        assert_eq!(s.token().balance(&s.market), 100);
    });
}

#[test]
fn storage_reads_keep_live_records_and_obligations_available() {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
    backends(|s| {
        let a = s.offer(0);
        let target = 172_800.min(s.e.storage().max_ttl());
        s.e.as_contract(&s.market, || {
            assert_eq!(s.e.storage().persistent().get_ttl(&Key::Offer(a)), target);
            assert_eq!(
                s.e.storage()
                    .persistent()
                    .get_ttl(&Key::Reserve(s.asset.clone())),
                target
            );
        });
        s.e.ledger().set_sequence_number(100 + target / 2 + 1);
        // A long-expired commercial offer remains refundable; a keeper is not
        // permitted to turn an unknown/expired record into a successful sale.
        s.client().get_offer(&a);
        s.client().reserved_balance(&s.asset);
        s.e.as_contract(&s.market, || {
            assert_eq!(s.e.storage().persistent().get_ttl(&Key::Offer(a)), target);
            assert_eq!(
                s.e.storage()
                    .persistent()
                    .get_ttl(&Key::Reserve(s.asset.clone())),
                target
            );
            assert_eq!(s.e.storage().instance().get_ttl(), target);
        });
        s.e.set_auths(&[]);
        s.client().refund(&a);
        assert_eq!(s.token().balance(&s.seller), 10_000);
    });
}

#[test]
fn long_offer_retention_covers_final_lease_and_refund_margin_without_renting_all_code_to_network_max(
) {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
    backends(|s| {
        let mut terms = s.terms(0);
        terms.duration_ledgers = 1_000_000;
        terms.lease_ledgers = 720;
        let id = s.client().create_offer(&s.seller, &terms);
        let common = 172_800.min(s.e.storage().max_ttl());
        let until_refund_margin = (1_000_000 + 720 + 1 + 17_280).min(s.e.storage().max_ttl());
        s.e.as_contract(&s.market, || {
            assert_eq!(
                s.e.storage().persistent().get_ttl(&Key::Offer(id)),
                until_refund_margin
            );
            assert_eq!(
                s.e.storage()
                    .persistent()
                    .get_ttl(&Key::Reserve(s.asset.clone())),
                common
            );
            assert_eq!(
                s.e.storage()
                    .persistent()
                    .get_ttl(&Key::Merchant(s.seller.clone())),
                common
            );
            assert_eq!(s.e.storage().instance().get_ttl(), common);
        });
        assert!(until_refund_margin < s.e.storage().max_ttl());
    });
}

#[test]
fn offer_retention_must_fit_network_ttl_before_funding() {
    use soroban_sdk::testutils::storage::Persistent as _;
    backends(|s| {
        let required = MAX_OFFER as u64 + MAX_LEASE as u64 + 1 + REFUND_MARGIN;
        assert!(required <= u64::from(u32::MAX));
        let set_max_ttl = |max: u32| {
            s.e.ledger().with_mut(|ledger| {
                ledger.min_persistent_entry_ttl = 1;
                ledger.min_temp_entry_ttl = 1;
                ledger.max_entry_ttl = max;
            });
        };
        let mut terms = s.terms(0);
        terms.duration_ledgers = MAX_OFFER;
        terms.lease_ledgers = MAX_LEASE;

        // Soroban max_ttl is max_entry_ttl minus the current ledger.
        set_max_ttl(required as u32);
        assert_eq!(s.e.storage().max_ttl(), required as u32 - 1);
        assert_eq!(
            s.client().try_create_offer(&s.seller, &terms),
            Err(Ok(Error::InvalidTerms))
        );
        assert_eq!(s.token().balance(&s.seller), 10_000);
        assert_eq!(s.token().balance(&s.market), 0);
        assert_eq!(s.client().reserved_balance(&s.asset), 0);

        set_max_ttl(required as u32 + 1);
        assert_eq!(s.e.storage().max_ttl(), required as u32);
        let id = s.client().create_offer(&s.seller, &terms);
        assert_eq!(id, 1);
        s.e.as_contract(&s.market, || {
            assert_eq!(
                s.e.storage().persistent().get_ttl(&Key::Offer(id)),
                required as u32
            );
        });
    });
}

#[cfg(feature = "wasm-tests")]
#[test]
fn actual_wasm_code_rent_is_bounded_to_common_retention() {
    use soroban_sdk::testutils::Deployer as _;
    let s = setup(true);
    s.offer(0);
    assert_eq!(
        s.e.deployer().get_contract_code_ttl(&s.market),
        172_800.min(s.e.storage().max_ttl())
    );
}

#[test]
fn retention_margin_clamps_at_network_and_u32_ledger_boundary() {
    let s = setup(false);
    let id = s.offer(0);
    let mut o = s.client().get_offer(&id);
    o.deadline_ledger = u32::MAX - 1;
    o.terms.lease_ledgers = 0;
    s.e.ledger().with_mut(|l| {
        l.sequence_number = u32::MAX - 2;
        l.min_persistent_entry_ttl = 1;
        l.min_temp_entry_ttl = 1;
        l.max_entry_ttl = 3;
    });
    // A refund margin beyond the u32 ledger horizon must not wrap or demand
    // an impossible TTL. This is the pure retention calculation, not a claim
    // that the ledger network will advance past its representable horizon.
    assert_eq!(offer_ttl(&s.e, &o), s.e.storage().max_ttl());
    assert_eq!(common_ttl(&s.e), s.e.storage().max_ttl());
}

#[test]
fn reservation_slot_retention_covers_the_offer_refund_window() {
    use soroban_sdk::testutils::storage::Persistent as _;
    backends(|s| {
        let mut terms = s.terms(0);
        terms.duration_ledgers = MAX_OFFER;
        terms.lease_ledgers = MAX_LEASE;
        let id = s.client().create_offer(&s.seller, &terms);
        let buyer = s.buyer();
        let permit = s.permit(id, &buyer);
        s.reserve(&permit);

        let active_ttl = s.e.as_contract(&s.market, || {
            s.e.storage()
                .persistent()
                .get_ttl(&Key::Slot(s.seller.clone(), buyer.clone()))
        });
        let required_ttl = (u64::from(MAX_OFFER)
            + u64::from(MAX_LEASE)
            + 1
            + REFUND_MARGIN) as u32;
        assert_eq!(active_ttl, required_ttl);

        // The slot must outlive the reservation lease and remain present while
        // the offer is still eligible for final cleanup.
        s.e.ledger()
            .set_sequence_number(permit.lease_until + 1);
        s.client().expire_reservation(&id);
        assert_eq!(s.client().get_offer(&id).state, OPEN);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.token().balance(&s.market), 100);
        assert!(s.client().get_active(&s.seller, &buyer).is_none());
    });
}

#[test]
fn network_minimum_record_ttl_cannot_suppress_a_long_offer_retention_target() {
    use soroban_sdk::testutils::storage::Persistent as _;
    backends(|s| {
        // Matches the observed public testnet minimum, which is above the
        // common refresh threshold. New long offers must still reach target.
        s.e.ledger()
            .with_mut(|l| l.min_persistent_entry_ttl = 120_960);
        let mut terms = s.terms(0);
        terms.duration_ledgers = 1_000_000;
        terms.lease_ledgers = 720;
        let id = s.client().create_offer(&s.seller, &terms);
        s.e.as_contract(&s.market, || {
            assert_eq!(
                s.e.storage().persistent().get_ttl(&Key::Offer(id)),
                1_018_001
            );
        });
    });
}

#[soroban_sdk::contract]
struct HostileToken;
#[soroban_sdk::contractimpl]
impl HostileToken {
    pub fn balance(_env: Env, _id: Address) -> i128 {
        panic!("Arbitrary token code must never be called")
    }
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        panic!("Arbitrary token code must never be called")
    }
}
#[test]
fn hostile_token_is_not_called_and_constructor_cannot_reset_funded_policy() {
    backends(|s| {
        let id = s.offer(0);
        let before = s.client().get_config();
        let hostile = s.e.register(HostileToken, ());
        let mut t = s.terms(0);
        t.asset = hostile;
        assert_eq!(
            s.client().try_create_offer(&s.seller, &t),
            Err(Ok(Error::UnknownAsset))
        );
        let args = (Vec::from_array(
            &s.e,
            [Bytes::from_array(&s.e, &[0, 0, 0, 0])],
        ),)
            .into_val(&s.e);
        let attempt = s.e.try_invoke_contract::<(), Error>(
            &s.market,
            &soroban_sdk::Symbol::new(&s.e, "__constructor"),
            args,
        );
        assert!(attempt.is_err());
        assert_eq!(s.client().get_config(), before);
        assert_eq!(s.client().reserved_balance(&s.asset), 100);
        assert_eq!(s.client().get_offer(&id).state, 0);
        assert_eq!(
            s.client()
                .try_register_merchant(&s.seller, &BytesN::from_array(&s.e, &[0; 32])),
            Err(Ok(Error::BadKey))
        );
        assert_eq!(s.client().get_merchant(&s.seller).epoch, 1);
    });
}

#[soroban_sdk::contract]
struct ConstructorHarness;
#[soroban_sdk::contractimpl]
impl ConstructorHarness {
    pub fn deploy(env: Env, wasm_hash: BytesN<32>, assets: Vec<Bytes>) -> Result<Address, Error> {
        Ok(env
            .deployer()
            .with_current_contract([0; 32])
            .deploy_contract(soroban_sdk::ContractExecutable::Wasm(wasm_hash), (assets,)))
    }
}

#[test]
fn constructor_rejects_bad_network_and_asset_policy_before_installing_a_market() {
    let s = setup(false);
    let e = &s.e;
    let hashes = std::vec![e.upload(AgyionFadeMarket)];
    #[cfg(feature = "wasm-tests")]
    let hashes = {
        let mut hashes = hashes;
        hashes.push(e.deployer().upload_contract_wasm(
            include_bytes!("../target/wasm32v1-none/release/fade_market.wasm").as_slice(),
        ));
        hashes
    };
    for hash in hashes {
        let factory = e.register(ConstructorHarness, ());
        let f = ConstructorHarnessClient::new(e, &factory);
        let native = Bytes::from_array(e, &[0, 0, 0, 0]);
        let good = Vec::from_array(e, [native.clone()]);
        let original_network = e.ledger().network_id().to_array();
        e.ledger().with_mut(|l| l.network_id = [0x42; 32]);
        // A failed nested constructor is surfaced by deployment as Abort,
        // rather than exposing the constructor's own contract error enum.
        assert_eq!(
            f.try_deploy(&hash, &good),
            Err(Err(soroban_sdk::InvokeError::Abort))
        );
        e.ledger().with_mut(|l| l.network_id = original_network);
        for assets in [
            Vec::new(e),
            Vec::from_array(e, [native.clone(), native.clone()]),
            Vec::from_array(e, core::array::from_fn::<_, 9, _>(|_| native.clone())),
            Vec::from_array(e, [Bytes::new(e)]),
            Vec::from_array(e, [Bytes::from_array(e, &[0; 65])]),
        ] {
            assert_eq!(
                f.try_deploy(&hash, &assets),
                Err(Err(soroban_sdk::InvokeError::Abort))
            );
        }
        assert!(f
            .try_deploy(
                &hash,
                &Vec::from_array(e, [Bytes::from_array(e, &[0xff; 4])])
            )
            .is_err());
        // The same address can now be deployed successfully: every rejected
        // constructor rolled back its instance and any partially written reserves.
        let market = f.deploy(&hash, &good);
        let c = AgyionFadeMarketClient::new(e, &market);
        let config = c.get_config();
        assert_eq!(config.assets.len(), 1);
        assert_eq!(c.reserved_balance(&config.assets.get(0).unwrap()), 0);
    }
}
