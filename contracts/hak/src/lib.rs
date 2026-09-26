#![no_std]
// Keep the published contract ABI; Soroban also generates matching client methods.
#![allow(clippy::too_many_arguments)]
//! Agyion kernel contract (v2).
//!
//! Single contract, four templates:
//! - **Fade** (was Son Saat): declining price clock + venue-signed handoff.
//! - **Pod** (was Kapsul): time-locked + preimage-keyed fund.
//! - **Trigger**: event escrow executed by an independent attester's ed25519 signature.
//! - **Envoy**: on-chain limited mandate — an agent key may claim Fade listings for the owner.
//!
//! Protocol v2 adds deployment-bound signatures and recipient-bound Pod commitments.
//! See SECURITY_PROTOCOL.md for the security changes to the historical specification.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env,
};

mod envoy;
mod fade;
mod pod;
mod trigger;

#[cfg(test)]
mod test;

/// TTL extension thresholds for persistent records (~1 day threshold, ~10 day
/// target; assumes 5s/ledger).
///
/// NOTE (honesty, mirrors LIMITATIONS): records expected to live longer than
/// TTL_EXTEND = 172_800 ledgers (~10 days) may be archived before their
/// deadlines. The contract has no restore flow; an archived record can only be
/// brought back via a chain-side restore preamble (Soroban restore-footprint).
/// That is why TTL is extended on both write and read paths, and instance
/// storage (counters) is extended as well. Still, for lifetimes beyond ~10
/// days the restore obligation belongs to the operator.
pub(crate) const TTL_THRESHOLD: u32 = 17_280;
pub(crate) const TTL_EXTEND: u32 = 172_800;

/// On-chain meaning is generic (CANON rule 7): T1=1, T2=2, T3=3, T4=4.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Template {
    Fade = 1,
    Pod = 2,
    Trigger = 3,
    Envoy = 4,
}

/// Fade listing (SPEC_V2 — field names and types are sacred).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Fade {
    pub seller: Address,
    pub asset: Address,
    pub pot: i128,
    pub start_price: i128, // stroop-like minor unit
    pub floor_price: i128, // may be negative (lower bound)
    pub start_ledger: u32,
    pub deadline_ledger: u32,
    pub handoff_window: u32,
    pub slope_num: i128,
    pub slope_den: i128, // decline per ledger (rational)
    pub venue_pubkey: BytesN<32>,
    pub state: u32, // 0=open 1=claimed 2=handoff confirmed 3=refunded
    pub claimant: Option<Address>,
    pub claimed_at: Option<u32>,
}

/// Pod: time capsule (SPEC_V2).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Pod {
    pub funder: Address,
    pub asset: Address,
    pub amount: i128,
    pub unlock_ledger: u32,
    pub key_hash: BytesN<32>, // sha256(preimage)
    pub state: u32,           // 0=buried 1=opened
}

/// A hidden Pod claim intent, bound to the recipient and deployment.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PodClaimCommitment {
    pub commitment: BytesN<32>,
    pub committed_at: u32,
}

/// Trigger: event escrow (SPEC_V2). Funder locks funds for a beneficiary; an
/// independent attester's ed25519 signature executes the payout; after the
/// deadline a rule-based refund returns funds to the funder.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Trigger {
    pub funder: Address,
    pub asset: Address,
    pub amount: i128,
    pub beneficiary: Address,
    pub attester_pubkey: BytesN<32>,
    pub deadline_ledger: u32,
    pub state: u32, // 0=pending 1=executed 2=refunded
}

/// Mandate: on-chain limited grant (SPEC_V2). The owner authorizes an agent
/// key (ed25519) to claim Fade listings FOR the owner; recipient is fixed to
/// the owner.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Mandate {
    pub owner: Address,
    pub agent_pubkey: BytesN<32>,
    pub max_per_tx: i128,
    pub daily_cap: i128,
    pub valid_until: u32,  // last ledger the mandate is usable
    pub daily_used: i128,  // spend accumulated in the current window
    pub window_start: u32, // ledger where the current daily window began
    pub revoked: bool,
    /// Successful envoy_claim count (audit v2 finding 2). Under the Envoy
    /// price<=0 restriction the monetary caps (max_per_tx/daily_cap) are
    /// effectively dead — daily_used always accumulates 0 — so the active
    /// bound on agent activity is this counter, capped at
    /// `envoy::MAX_CLAIMS_PER_MANDATE`. Shown on the mandate card in the UI.
    pub claims_used: u32,
}

/// Defined error codes instead of panics (SPEC §3.3 / SPEC_V2 rules).
///
/// Numbering: the 8 v1 errors keep their discriminants; the new v2 variants
/// continue from 9. Discriminant 8 is reserved (v1's signature-format error
/// was merged into `BadSignature` = 7: a preimage/key mismatch and an
/// unverifiable pubkey/signature are both credential failures).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,       // fade/pod/trigger/mandate record missing
    InvalidState = 2,   // state machine does not allow this transition
    InvalidAmount = 3,  // pot/amount/price parameter invalid
    InvalidCurve = 4,   // slope_den=0, slope_num<0, duration=0 or handoff_window=0
    DeadlinePassed = 5, // rule-based refund condition not met / attestation window closed
    Locked = 6,         // pod unlock_ledger not reached yet
    BadSignature = 7,   // zero/empty pubkey, bad sig format, or sha256(preimage) != key_hash
    // 8 reserved (v1 ImzaGecersiz merged into BadSignature)
    CapExceeded = 9,     // per-tx or daily cap would be exceeded
    MandateExpired = 10, // ledger > valid_until
    Unauthorized = 11,   // mandate revoked, or caller is not the mandate owner
    InvalidInput = 12,   // parameter combination rejected (e.g. positive price via envoy)
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Fade(u64),
    Pod(u64),
    Trigger(u64),
    Mandate(u64),
    PodClaim(u64, Address),
    FadeCount,
    PodCount,
    TriggerCount,
    MandateCount,
}

/// Prefix every off-chain credential with its purpose, network and deployment.
pub(crate) fn credential_payload(env: &Env, purpose: &[u8]) -> Bytes {
    let mut payload = Bytes::from_slice(env, purpose);
    payload.append(&Bytes::from(env.ledger().network_id()));
    payload.append(&env.current_contract_address().to_xdr(env));
    payload
}

#[contract]
pub struct Agyion;

#[contractimpl]
impl Agyion {
    /// Clients must check this before using v2 signatures or Pod claims.
    pub fn protocol_version() -> u32 {
        2
    }

    // ---- Fade ----

    pub fn create_fade(
        env: Env,
        seller: Address,
        asset: Address,
        pot: i128,
        start_price: i128,
        floor_price: i128,
        slope_num: i128,
        slope_den: i128,
        duration_ledgers: u32,
        handoff_window: u32,
        venue_pubkey: BytesN<32>,
    ) -> Result<u64, Error> {
        fade::create_fade(
            &env,
            seller,
            asset,
            pot,
            start_price,
            floor_price,
            slope_num,
            slope_den,
            duration_ledgers,
            handoff_window,
            venue_pubkey,
        )
    }

    /// View: current declining price; stops at the floor.
    pub fn fade_price(env: Env, fade_id: u64) -> i128 {
        fade::fade_price(&env, fade_id)
    }

    /// open -> claimed; claimant authorization required.
    pub fn claim(env: Env, fade_id: u64, claimant: Address) -> Result<(), Error> {
        fade::claim(&env, fade_id, claimant)
    }

    /// Verifies the venue ed25519 signature
    /// (v2 handoff domain || fade_id(8B BE) || claimant XDR || ts(8B BE)); settles at the
    /// price frozen at `claimed_at`.
    pub fn confirm_handoff(env: Env, fade_id: u64, ts: u64, sig: BytesN<64>) -> Result<(), Error> {
        fade::confirm_handoff(&env, fade_id, ts, sig)
    }

    /// Rule-based refund: if the deadline passed (no claim) or the
    /// handoff_window elapsed (no handoff), the pot returns to the seller.
    /// No discretion; anyone may call.
    pub fn refund(env: Env, fade_id: u64) -> Result<(), Error> {
        fade::refund(&env, fade_id)
    }

    /// View: returns the fade record.
    pub fn get_fade(env: Env, fade_id: u64) -> Result<Fade, Error> {
        fade::get_fade(&env, fade_id)
    }

    // ---- Pod ----

    pub fn create_pod(
        env: Env,
        funder: Address,
        asset: Address,
        amount: i128,
        unlock_ledger: u32,
        key_hash: BytesN<32>,
    ) -> Result<u64, Error> {
        pod::create_pod(&env, funder, asset, amount, unlock_ledger, key_hash)
    }

    /// Record a hidden claim intent before revealing a Pod's bearer secret.
    pub fn commit_pod_claim(
        env: Env,
        pod_id: u64,
        recipient: Address,
        commitment: BytesN<32>,
    ) -> Result<(), Error> {
        pod::commit_pod_claim(&env, pod_id, recipient, commitment)
    }

    pub fn get_pod_claim_commitment(
        env: Env,
        pod_id: u64,
        recipient: Address,
    ) -> Option<PodClaimCommitment> {
        pod::get_pod_claim_commitment(&env, pod_id, recipient)
    }

    /// Open after the timelock and a matching commitment from an earlier ledger.
    /// Recipient authorization alone does not protect a public bearer preimage.
    pub fn claim_pod(
        env: Env,
        pod_id: u64,
        preimage: Bytes,
        recipient: Address,
    ) -> Result<(), Error> {
        pod::claim_pod(&env, pod_id, preimage, recipient)
    }

    /// View: returns the pod record.
    pub fn get_pod(env: Env, pod_id: u64) -> Result<Pod, Error> {
        pod::get_pod(&env, pod_id)
    }

    // ---- Trigger ----

    pub fn create_trigger(
        env: Env,
        funder: Address,
        asset: Address,
        amount: i128,
        beneficiary: Address,
        attester_pubkey: BytesN<32>,
        deadline_ledger: u32,
    ) -> Result<u64, Error> {
        trigger::create_trigger(
            &env,
            funder,
            asset,
            amount,
            beneficiary,
            attester_pubkey,
            deadline_ledger,
        )
    }

    /// Attester signature payload: v2 attest domain || trigger_id(8B BE) || beneficiary XDR ||
    /// ts(8B BE). Valid sig && ledger <= deadline -> pays the beneficiary.
    pub fn attest(env: Env, trigger_id: u64, ts: u64, sig: BytesN<64>) -> Result<(), Error> {
        trigger::attest(&env, trigger_id, ts, sig)
    }

    /// ledger > deadline && not attested -> funds return to the funder.
    /// Rule-based, no discretion; anyone may call.
    pub fn refund_trigger(env: Env, trigger_id: u64) -> Result<(), Error> {
        trigger::refund_trigger(&env, trigger_id)
    }

    /// View: returns the trigger record.
    pub fn get_trigger(env: Env, trigger_id: u64) -> Result<Trigger, Error> {
        trigger::get_trigger(&env, trigger_id)
    }

    // ---- Envoy ----

    /// Grants an agent key the right to claim Fade listings for the owner.
    /// Recipient is fixed to the owner.
    pub fn create_mandate(
        env: Env,
        owner: Address,
        agent_pubkey: BytesN<32>,
        max_per_tx: i128,
        daily_cap: i128,
        valid_until: u32,
    ) -> Result<u64, Error> {
        envoy::create_mandate(
            &env,
            owner,
            agent_pubkey,
            max_per_tx,
            daily_cap,
            valid_until,
        )
    }

    /// Agent signature payload: v2 envoy domain || mandate_id(8B BE) || fade_id(8B BE) ||
    /// ts(8B BE). Enforces: ledger <= valid_until, price <= max_per_tx,
    /// daily_used + price <= daily_cap, then claims the fade with
    /// claimant = owner.
    pub fn envoy_claim(
        env: Env,
        mandate_id: u64,
        fade_id: u64,
        ts: u64,
        agent_sig: BytesN<64>,
    ) -> Result<(), Error> {
        envoy::envoy_claim(&env, mandate_id, fade_id, ts, agent_sig)
    }

    /// Instant revocation, owner only.
    pub fn revoke_mandate(env: Env, owner: Address, mandate_id: u64) -> Result<(), Error> {
        envoy::revoke_mandate(&env, owner, mandate_id)
    }

    /// View: returns the mandate record.
    pub fn get_mandate(env: Env, mandate_id: u64) -> Result<Mandate, Error> {
        envoy::get_mandate(&env, mandate_id)
    }
}
