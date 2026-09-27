use soroban_sdk::{contracterror, contractevent, contracttype, Address, BytesN, Vec};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidState = 2,
    InvalidTerms = 3,
    InvalidWindow = 4,
    BadKey = 5,
    WrongEpoch = 6,
    WrongSequence = 7,
    PriceExceeded = 8,
    ActiveReservation = 9,
    UnknownAsset = 10,
    InvalidDestination = 11,
    Overflow = 12,
    Accounting = 13,
    ArchiveUnavailable = 14,
    WrongNetwork = 15,
    Unauthorized = 16,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketConfig {
    pub assets: Vec<Address>,
    pub max_offer_ledgers: u32,
    pub max_lease_ledgers: u32,
    pub max_receipt_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Merchant {
    pub seller: Address,
    pub public_key: BytesN<32>,
    pub epoch: u32,
}

/// Immutable creation terms. Zero lease_ledgers disables remote reservations.
/// metadata_hash commits the separately signed shop/product/pickup description.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OfferTerms {
    pub asset: Address,
    pub pot: i128,
    pub start_price: i128,
    pub floor_price: i128,
    pub slope_num: i128,
    pub slope_den: i128,
    pub duration_ledgers: u32,
    pub lease_ledgers: u32,
    pub metadata_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reservation {
    pub claimant: Address,
    pub sequence: u64,
    pub price: i128,
    pub claimed_at: u32,
    pub lease_until: u32,
    pub merchant: Merchant,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
// This is the public Soroban wire enum; contracttype fields cannot use Box.
#[allow(clippy::large_enum_variant)]
pub enum ReservationState {
    Empty,
    Active(Reservation),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Offer {
    pub id: u64,
    pub seller: Address,
    pub terms: OfferTerms,
    pub terms_hash: BytesN<32>,
    pub start_ledger: u32,
    pub deadline_ledger: u32,
    /// 0 open, 1 reserved, 2 settled, 3 refunded.
    pub state: u32,
    /// Monotonic across cancellation/expiry; old permits cannot return.
    pub sequence: u64,
    pub reservation: ReservationState,
    pub settled_to: Option<Address>,
    pub settled_price: Option<i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PickupReceipt {
    pub offer_id: u64,
    pub claimant: Address,
    pub terms_hash: BytesN<32>,
    pub key_epoch: u32,
    pub sequence: u64,
    pub valid_from: u32,
    pub valid_until: u32,
    /// price <= max_price; a negative bound requires at least that reward.
    pub max_price: i128,
    pub nonce: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservationPermit {
    pub receipt: PickupReceipt,
    pub lease_until: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveSlot {
    pub offer_id: u64,
    pub sequence: u64,
    pub lease_until: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct MerchantRegistered {
    #[topic]
    pub seller: Address,
    pub public_key: BytesN<32>,
    pub epoch: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct OfferChanged {
    #[topic]
    pub offer_id: u64,
    pub state: u32,
    pub sequence: u64,
    pub ledger: u32,
    pub claimant: Option<Address>,
    pub price: Option<i128>,
}
