#![no_std]
//! Public, testnet-only merchant market. No private-pool or legacy record access.
mod types;
use soroban_sdk::{
    contract, contractimpl, contracttype, token, xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal,
    Val, Vec, I256,
};
pub use types::*;

const MAX_OFFER: u32 = 1_000_000;
const MAX_LEASE: u32 = 720;
const MAX_RECEIPT: u32 = 12;
const COMMON_TTL: u32 = 172_800;
const TTL_THRESHOLD: u32 = 86_400;
const REFUND_MARGIN: u64 = 17_280;
const OPEN: u32 = 0;
const RESERVED: u32 = 1;
const SETTLED: u32 = 2;
const REFUNDED: u32 = 3;

#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Count,
    Merchant(Address),
    Offer(u64),
    Reserve(Address),
    Slot(Address, Address),
}

fn common_ttl(e: &Env) -> u32 {
    COMMON_TTL.min(e.storage().max_ttl())
}
fn threshold(target: u32) -> u32 {
    TTL_THRESHOLD.min(target / 2)
}
fn bump(e: &Env) {
    let target = common_ttl(e);
    e.storage().instance().extend_ttl(threshold(target), target);
}
fn extend(e: &Env, key: &Key, target: u32) {
    e.storage()
        .persistent()
        .extend_ttl(key, threshold(target), target);
}
fn persist_with_ttl<T: IntoVal<Env, Val>>(e: &Env, key: &Key, value: &T, target: u32) {
    e.storage().persistent().set(key, value);
    // A newly written long offer must reach its required lifetime even when
    // the network's initial TTL is already above our normal refresh threshold.
    e.storage().persistent().extend_ttl(key, target, target);
}
fn persist<T: IntoVal<Env, Val>>(e: &Env, key: &Key, value: &T) {
    persist_with_ttl(e, key, value, common_ttl(e));
}
fn touch(e: &Env, key: &Key) {
    extend(e, key, common_ttl(e));
    bump(e);
}
fn offer_ttl(e: &Env, o: &Offer) -> u32 {
    // u64 keeps the retention margin safe even for a valid u32-edge deadline.
    let last_refund =
        u64::from(o.deadline_ledger) + u64::from(o.terms.lease_ledgers) + 1 + REFUND_MARGIN;
    let requested = last_refund
        .saturating_sub(u64::from(e.ledger().sequence()))
        .max(u64::from(COMMON_TTL));
    requested.min(u64::from(e.storage().max_ttl())) as u32
}
fn config(e: &Env) -> Result<MarketConfig, Error> {
    bump(e);
    e.storage()
        .instance()
        .get(&Key::Config)
        .ok_or(Error::ArchiveUnavailable)
}
fn supported(e: &Env, asset: &Address) -> Result<(), Error> {
    if !config(e)?.assets.contains(asset) {
        return Err(Error::UnknownAsset);
    }
    Ok(())
}
fn merchant(e: &Env, seller: &Address) -> Result<Merchant, Error> {
    let key = Key::Merchant(seller.clone());
    let value = e.storage().persistent().get(&key).ok_or(Error::NotFound)?;
    touch(e, &key);
    Ok(value)
}
fn offer(e: &Env, id: u64) -> Result<Offer, Error> {
    let key = Key::Offer(id);
    let value: Offer = e.storage().persistent().get(&key).ok_or(Error::NotFound)?;
    extend(e, &key, offer_ttl(e, &value));
    bump(e);
    Ok(value)
}
fn reserve_balance(e: &Env, asset: &Address) -> Result<i128, Error> {
    supported(e, asset)?;
    let key = Key::Reserve(asset.clone());
    // Initialized for every allowed asset in the constructor. Missing is not zero.
    let value = e
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ArchiveUnavailable)?;
    touch(e, &key);
    Ok(value)
}
fn slot(e: &Env, seller: &Address, claimant: &Address) -> Option<ActiveSlot> {
    let key = Key::Slot(seller.clone(), claimant.clone());
    let value = e.storage().persistent().get(&key);
    if value.is_some() {
        touch(e, &key);
    }
    value
}
fn price_at(e: &Env, o: &Offer, ledger: u32) -> i128 {
    let elapsed = I256::from_i128(e, ledger.saturating_sub(o.start_ledger) as i128);
    let decline = I256::from_i128(e, o.terms.slope_num)
        .mul(&elapsed)
        .div(&I256::from_i128(e, o.terms.slope_den));
    let price = I256::from_i128(e, o.terms.start_price).sub(&decline);
    if price < I256::from_i128(e, o.terms.floor_price) {
        o.terms.floor_price
    } else {
        price.to_i128().unwrap()
    }
}
fn save_offer(e: &Env, o: &Offer) {
    persist_with_ttl(e, &Key::Offer(o.id), o, offer_ttl(e, o));
    let (claimant, price) = match &o.reservation {
        ReservationState::Active(r) => (Some(r.claimant.clone()), Some(r.price)),
        ReservationState::Empty => (o.settled_to.clone(), o.settled_price),
    };
    OfferChanged {
        offer_id: o.id,
        state: o.state,
        sequence: o.sequence,
        ledger: e.ledger().sequence(),
        claimant,
        price,
    }
    .publish(e);
}
fn destination(e: &Env, o: &Offer, claimant: &Address) -> Result<(), Error> {
    if claimant == &e.current_contract_address()
        || claimant == &o.terms.asset
        || claimant == &o.seller
    {
        return Err(Error::InvalidDestination);
    }
    Ok(())
}
fn check_receipt(
    e: &Env,
    o: &Offer,
    r: &PickupReceipt,
    m: &Merchant,
    sequence: u64,
    price: i128,
) -> Result<(), Error> {
    destination(e, o, &r.claimant)?;
    if r.sequence != sequence {
        return Err(Error::WrongSequence);
    }
    if r.key_epoch != m.epoch {
        return Err(Error::WrongEpoch);
    }
    if r.offer_id != o.id
        || r.terms_hash != o.terms_hash
        || r.nonce == BytesN::from_array(e, &[0; 32])
    {
        return Err(Error::InvalidTerms);
    }
    let now = e.ledger().sequence();
    if r.valid_from < o.start_ledger
        || r.valid_until < r.valid_from
        || r.valid_until - r.valid_from > MAX_RECEIPT
        || now < r.valid_from
        || now > r.valid_until
    {
        return Err(Error::InvalidWindow);
    }
    if price > r.max_price {
        return Err(Error::PriceExceeded);
    }
    Ok(())
}
fn verify<T: ToXdr + Clone>(
    e: &Env,
    purpose: &[u8],
    value: &T,
    key: &BytesN<32>,
    signature: &BytesN<64>,
) {
    let mut payload = Bytes::from_slice(e, purpose);
    payload.append(&Bytes::from(e.ledger().network_id()));
    payload.append(&e.current_contract_address().to_xdr(e));
    payload.append(&value.clone().to_xdr(e));
    e.crypto().ed25519_verify(key, &payload, signature);
}
fn exact_transfer(
    e: &Env,
    asset: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), Error> {
    if amount == 0 {
        return Ok(());
    }
    if amount < 0 || from == to {
        return Err(Error::Accounting);
    }
    let t = token::Client::new(e, asset);
    let from_before = t.balance(from);
    let to_before = t.balance(to);
    let expected_from = from_before
        .checked_sub(amount)
        .filter(|v| *v >= 0)
        .ok_or(Error::Accounting)?;
    let expected_to = to_before.checked_add(amount).ok_or(Error::Overflow)?;
    t.transfer(from, to, &amount);
    if t.balance(from) != expected_from || t.balance(to) != expected_to {
        return Err(Error::Accounting);
    }
    Ok(())
}
fn clear_slot(e: &Env, o: &Offer) -> Result<(), Error> {
    if let ReservationState::Active(r) = &o.reservation {
        let active = slot(e, &o.seller, &r.claimant).ok_or(Error::ArchiveUnavailable)?;
        if active.offer_id != o.id
            || active.sequence != r.sequence
            || active.lease_until != r.lease_until
        {
            return Err(Error::InvalidState);
        }
        e.storage()
            .persistent()
            .remove(&Key::Slot(o.seller.clone(), r.claimant.clone()));
    }
    Ok(())
}
fn reduce_obligation(e: &Env, o: &Offer) -> Result<i128, Error> {
    let old = reserve_balance(e, &o.terms.asset)?;
    if token::Client::new(e, &o.terms.asset).balance(&e.current_contract_address()) < old {
        return Err(Error::Accounting);
    }
    let new = old
        .checked_sub(o.terms.pot)
        .filter(|v| *v >= 0)
        .ok_or(Error::Accounting)?;
    persist(e, &Key::Reserve(o.terms.asset.clone()), &new);
    Ok(new)
}
fn settle(e: &Env, o: &mut Offer, claimant: &Address, price: i128) -> Result<(), Error> {
    let remaining = reduce_obligation(e, o)?;
    clear_slot(e, o)?;
    o.state = SETTLED;
    o.reservation = ReservationState::Empty;
    o.settled_to = Some(claimant.clone());
    o.settled_price = Some(price);
    save_offer(e, o);
    let own = e.current_contract_address();
    if price > 0 {
        exact_transfer(e, &o.terms.asset, claimant, &o.seller, price)?;
        exact_transfer(e, &o.terms.asset, &own, &o.seller, o.terms.pot)?;
    } else {
        let payout = price
            .checked_neg()
            .filter(|p| *p <= o.terms.pot)
            .ok_or(Error::Accounting)?;
        exact_transfer(e, &o.terms.asset, &own, claimant, payout)?;
        exact_transfer(e, &o.terms.asset, &own, &o.seller, o.terms.pot - payout)?;
    }
    if token::Client::new(e, &o.terms.asset).balance(&own) < remaining {
        return Err(Error::Accounting);
    }
    Ok(())
}
fn refund_offer(e: &Env, o: &mut Offer) -> Result<(), Error> {
    let remaining = reduce_obligation(e, o)?;
    clear_slot(e, o)?;
    o.state = REFUNDED;
    o.reservation = ReservationState::Empty;
    save_offer(e, o);
    exact_transfer(
        e,
        &o.terms.asset,
        &e.current_contract_address(),
        &o.seller,
        o.terms.pot,
    )?;
    if token::Client::new(e, &o.terms.asset).balance(&e.current_contract_address()) < remaining {
        return Err(Error::Accounting);
    }
    Ok(())
}
fn release(e: &Env, o: &mut Offer) -> Result<(), Error> {
    if e.ledger().sequence() > o.deadline_ledger {
        return refund_offer(e, o);
    }
    clear_slot(e, o)?;
    o.state = OPEN;
    o.reservation = ReservationState::Empty;
    save_offer(e, o);
    Ok(())
}
fn expire(e: &Env, o: &mut Offer) -> Result<(), Error> {
    let r = match &o.reservation {
        ReservationState::Active(r) if o.state == RESERVED => r,
        _ => return Err(Error::InvalidState),
    };
    if e.ledger().sequence() <= r.lease_until {
        return Err(Error::InvalidWindow);
    }
    release(e, o)
}

#[contract]
pub struct AgyionFadeMarket;
#[contractimpl]
impl AgyionFadeMarket {
    pub fn __constructor(env: Env, asset_xdrs: Vec<Bytes>) -> Result<(), Error> {
        if env.ledger().network_id()
            != env
                .crypto()
                .sha256(&Bytes::from_slice(
                    &env,
                    b"Test SDF Network ; September 2015",
                ))
                .to_bytes()
        {
            return Err(Error::WrongNetwork);
        }
        if asset_xdrs.is_empty()
            || asset_xdrs.len() > 8
            || env.storage().max_ttl() <= MAX_LEASE + MAX_RECEIPT + 1
        {
            return Err(Error::InvalidTerms);
        }
        let mut assets = Vec::new(&env);
        for serialized in asset_xdrs {
            if serialized.is_empty() || serialized.len() > 64 {
                return Err(Error::InvalidTerms);
            }
            // The host decodes canonical Stellar Asset XDR and derives its SAC
            // address for this network. Caller-supplied arbitrary tokens cannot enter.
            let address = env
                .deployer()
                .with_stellar_asset(serialized)
                .deployed_address();
            if address == env.current_contract_address() || assets.contains(&address) {
                return Err(Error::InvalidTerms);
            }
            assets.push_back(address.clone());
            persist(&env, &Key::Reserve(address), &0_i128);
        }
        env.storage().instance().set(
            &Key::Config,
            &MarketConfig {
                assets,
                max_offer_ledgers: MAX_OFFER,
                max_lease_ledgers: MAX_LEASE,
                max_receipt_ledgers: MAX_RECEIPT,
            },
        );
        env.storage().instance().set(&Key::Count, &0_u64);
        bump(&env);
        Ok(())
    }
    pub fn protocol_version() -> u32 {
        1
    }
    pub fn get_config(env: Env) -> Result<MarketConfig, Error> {
        config(&env)
    }
    pub fn get_merchant(env: Env, seller: Address) -> Result<Merchant, Error> {
        merchant(&env, &seller)
    }
    pub fn register_merchant(
        env: Env,
        seller: Address,
        public_key: BytesN<32>,
    ) -> Result<Merchant, Error> {
        seller.require_auth();
        if seller == env.current_contract_address() || config(&env)?.assets.contains(&seller) {
            return Err(Error::InvalidDestination);
        }
        if public_key == BytesN::from_array(&env, &[0; 32]) {
            return Err(Error::BadKey);
        }
        let key = Key::Merchant(seller.clone());
        let old: Option<Merchant> = env.storage().persistent().get(&key);
        let epoch = old
            .map_or(Some(1), |m| m.epoch.checked_add(1))
            .ok_or(Error::Overflow)?;
        let m = Merchant {
            seller: seller.clone(),
            public_key: public_key.clone(),
            epoch,
        };
        persist(&env, &key, &m);
        MerchantRegistered {
            seller,
            public_key,
            epoch,
        }
        .publish(&env);
        Ok(m)
    }
    pub fn create_offer(env: Env, seller: Address, terms: OfferTerms) -> Result<u64, Error> {
        seller.require_auth();
        merchant(&env, &seller)?;
        supported(&env, &terms.asset)?;
        if seller == env.current_contract_address() || seller == terms.asset {
            return Err(Error::InvalidDestination);
        }
        if terms.pot <= 0
            || terms.start_price < terms.floor_price
            || terms.floor_price < -terms.pot
            || terms.slope_num < 0
            || terms.slope_den <= 0
            || terms.duration_ledgers == 0
            || terms.duration_ledgers > MAX_OFFER
            || terms.lease_ledgers > MAX_LEASE
            || terms.metadata_hash == BytesN::from_array(&env, &[0; 32])
        {
            return Err(Error::InvalidTerms);
        }
        let start = env.ledger().sequence();
        let deadline = start
            .checked_add(terms.duration_ledgers)
            .ok_or(Error::Overflow)?;
        deadline
            .checked_add(terms.lease_ledgers)
            .and_then(|n| n.checked_add(1))
            .ok_or(Error::Overflow)?;
        let required_ttl = u64::from(terms.duration_ledgers)
            + u64::from(terms.lease_ledgers)
            + 1
            + REFUND_MARGIN;
        if required_ttl > u64::from(env.storage().max_ttl()) {
            // Never accept funds for an offer whose final lease/refund state
            // cannot remain live through the network's maximum entry TTL.
            return Err(Error::InvalidTerms);
        }
        let count: u64 = env
            .storage()
            .instance()
            .get(&Key::Count)
            .ok_or(Error::ArchiveUnavailable)?;
        let id = count.checked_add(1).ok_or(Error::Overflow)?;
        let previous = reserve_balance(&env, &terms.asset)?;
        let next = previous.checked_add(terms.pot).ok_or(Error::Overflow)?;
        let own = env.current_contract_address();
        if token::Client::new(&env, &terms.asset).balance(&own) < previous {
            return Err(Error::Accounting);
        }
        exact_transfer(&env, &terms.asset, &seller, &own, terms.pot)?;
        if token::Client::new(&env, &terms.asset).balance(&own) < next {
            return Err(Error::Accounting);
        }
        persist(&env, &Key::Reserve(terms.asset.clone()), &next);
        env.storage().instance().set(&Key::Count, &id);
        let terms_hash = env.crypto().sha256(&terms.clone().to_xdr(&env)).to_bytes();
        let o = Offer {
            id,
            seller,
            terms,
            terms_hash,
            start_ledger: start,
            deadline_ledger: deadline,
            state: OPEN,
            sequence: 0,
            reservation: ReservationState::Empty,
            settled_to: None,
            settled_price: None,
        };
        save_offer(&env, &o);
        Ok(id)
    }
    pub fn get_offer(env: Env, offer_id: u64) -> Result<Offer, Error> {
        offer(&env, offer_id)
    }
    pub fn price(env: Env, offer_id: u64) -> Result<i128, Error> {
        Ok(price_at(
            &env,
            &offer(&env, offer_id)?,
            env.ledger().sequence(),
        ))
    }
    pub fn reserved_balance(env: Env, asset: Address) -> Result<i128, Error> {
        reserve_balance(&env, &asset)
    }
    pub fn get_active(env: Env, seller: Address, claimant: Address) -> Option<ActiveSlot> {
        slot(&env, &seller, &claimant)
    }
    pub fn settle_walk_in(
        env: Env,
        receipt: PickupReceipt,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        let mut o = offer(&env, receipt.offer_id)?;
        if o.state != OPEN {
            return Err(Error::InvalidState);
        }
        if env.ledger().sequence() > o.deadline_ledger {
            return Err(Error::InvalidWindow);
        }
        let m = merchant(&env, &o.seller)?;
        let next = o.sequence.checked_add(1).ok_or(Error::Overflow)?;
        // A short signed quote must authorize a stable SAC debit. Recomputing
        // the debit at inclusion would invalidate the simulated auth subtree.
        let price = price_at(&env, &o, receipt.valid_from);
        check_receipt(&env, &o, &receipt, &m, next, price)?;
        receipt.claimant.require_auth();
        verify(
            &env,
            b"agyion:market-walk-in:v1\0",
            &receipt,
            &m.public_key,
            &signature,
        );
        o.sequence = next;
        settle(&env, &mut o, &receipt.claimant, price)
    }
    pub fn reserve(
        env: Env,
        permit: ReservationPermit,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        let r = &permit.receipt;
        let mut o = offer(&env, r.offer_id)?;
        if o.state != OPEN {
            return Err(Error::InvalidState);
        }
        if o.terms.lease_ledgers == 0 {
            return Err(Error::InvalidTerms);
        }
        let now = env.ledger().sequence();
        let max_until = now
            .checked_add(o.terms.lease_ledgers)
            .ok_or(Error::Overflow)?;
        if now > o.deadline_ledger || permit.lease_until <= now || permit.lease_until > max_until {
            return Err(Error::InvalidWindow);
        }
        let m = merchant(&env, &o.seller)?;
        let sequence = o.sequence.checked_add(1).ok_or(Error::Overflow)?;
        let price = price_at(&env, &o, now);
        check_receipt(&env, &o, r, &m, sequence, price)?;
        r.claimant.require_auth();
        verify(
            &env,
            b"agyion:market-reserve:v1\0",
            &permit,
            &m.public_key,
            &signature,
        );
        if let Some(active) = slot(&env, &o.seller, &r.claimant) {
            if now <= active.lease_until {
                return Err(Error::ActiveReservation);
            }
            let mut prior = offer(&env, active.offer_id)?;
            if prior.seller != o.seller || prior.sequence != active.sequence {
                return Err(Error::InvalidState);
            }
            expire(&env, &mut prior)?;
        }
        o.state = RESERVED;
        o.sequence = sequence;
        o.reservation = ReservationState::Active(Reservation {
            claimant: r.claimant.clone(),
            sequence,
            price,
            claimed_at: now,
            lease_until: permit.lease_until,
            merchant: m,
        });
        persist(
            &env,
            &Key::Slot(o.seller.clone(), r.claimant.clone()),
            &ActiveSlot {
                offer_id: o.id,
                sequence,
                lease_until: permit.lease_until,
            },
        );
        save_offer(&env, &o);
        Ok(())
    }
    pub fn settle_reserved(
        env: Env,
        receipt: PickupReceipt,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        let mut o = offer(&env, receipt.offer_id)?;
        let reserved = match &o.reservation {
            ReservationState::Active(r) if o.state == RESERVED => r.clone(),
            _ => return Err(Error::InvalidState),
        };
        if receipt.claimant != reserved.claimant {
            return Err(Error::Unauthorized);
        }
        if env.ledger().sequence() > reserved.lease_until {
            return Err(Error::InvalidWindow);
        }
        check_receipt(
            &env,
            &o,
            &receipt,
            &reserved.merchant,
            reserved.sequence,
            reserved.price,
        )?;
        receipt.claimant.require_auth();
        verify(
            &env,
            b"agyion:market-reserved:v1\0",
            &receipt,
            &reserved.merchant.public_key,
            &signature,
        );
        settle(&env, &mut o, &receipt.claimant, reserved.price)
    }
    pub fn cancel_reservation(
        env: Env,
        offer_id: u64,
        claimant: Address,
        sequence: u64,
    ) -> Result<(), Error> {
        let mut o = offer(&env, offer_id)?;
        let r = match &o.reservation {
            ReservationState::Active(r) if o.state == RESERVED => r,
            _ => return Err(Error::InvalidState),
        };
        if r.claimant != claimant {
            return Err(Error::Unauthorized);
        }
        if r.sequence != sequence {
            return Err(Error::WrongSequence);
        }
        claimant.require_auth();
        release(&env, &mut o)
    }
    pub fn expire_reservation(env: Env, offer_id: u64) -> Result<(), Error> {
        expire(&env, &mut offer(&env, offer_id)?)
    }
    pub fn refund(env: Env, offer_id: u64) -> Result<(), Error> {
        let mut o = offer(&env, offer_id)?;
        if o.state != OPEN && o.state != RESERVED {
            return Err(Error::InvalidState);
        }
        if env.ledger().sequence() <= o.deadline_ledger {
            return Err(Error::InvalidWindow);
        }
        if let ReservationState::Active(r) = &o.reservation {
            if env.ledger().sequence() <= r.lease_until {
                return Err(Error::InvalidWindow);
            }
        }
        refund_offer(&env, &mut o)
    }
}

#[cfg(test)]
mod test;
