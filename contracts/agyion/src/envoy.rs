//! Envoy template: on-chain limited mandate. The owner grants an agent key
//! (ed25519) the right to claim Fade listings FOR the owner, under on-chain
//! enforced limits (per-tx cap, daily cap, per-mandate claim-count cap,
//! expiry, instant revocation). Note: under the price<=0 restriction below
//! the monetary caps are effectively dead (daily_used stays 0); the
//! claim-count cap (MAX_CLAIMS_PER_MANDATE) is the active bound: see
//! audit v2 finding 2.
//!
//! DESIGN DECISION (documented per spec review): `envoy_claim` never calls
//! `owner.require_auth()`. The mandate itself IS the authorization: the
//! owner pre-authorized the agent key at `create_mandate`. A consequence:
//! Fade settle at a positive price would pull funds from the claimant
//! (= owner) via SAC transfer, which needs owner auth and is impossible
//! inside an agent-submitted tx. Therefore Envoy claims are restricted to
//! fades whose current price is <= 0: the "campaign hunter" case, where the
//! pot compensates the claimant at settle and no owner funds move. A
//! positive-price claim attempt via Envoy is rejected with
//! `Error::InvalidInput`. The cap checks (max_per_tx, daily_cap) still run
//! before that rejection, in SPEC order, so an over-cap attempt reports
//! `CapExceeded` regardless of price sign.

use soroban_sdk::{Address, Bytes, BytesN, Env};

use crate::{fade, DataKey, Error, Mandate, TTL_EXTEND, TTL_THRESHOLD};

/// Ledgers per day: 86400s / 5s per ledger = 17_280. The daily window is a
/// simple rolling window: `window_start` ledger + `daily_used` accumulation;
/// when `now - window_start >= LEDGERS_PER_DAY` the window resets.
pub(crate) const LEDGERS_PER_DAY: u32 = 17_280;

/// Maximum number of successful claims a single mandate may perform
/// (audit v2 finding 2). Because Envoy claims are restricted to price <= 0
/// fades, the monetary caps (max_per_tx / daily_cap) can never be exhausted :
/// `daily_used` only ever accumulates `price.max(0)` = 0 and stays 0. This
/// claim-count cap is therefore the ACTIVE bound on agent activity: without
/// it a valid mandate could claim an unlimited number of fades until
/// valid_until (griefing vector). Exceeding it is rejected with CapExceeded.
pub(crate) const MAX_CLAIMS_PER_MANDATE: u32 = 50;

pub(crate) fn next_id(env: &Env) -> u64 {
    let key = DataKey::MandateCount;
    let id: u64 = env.storage().instance().get(&key).unwrap_or(0) + 1;
    env.storage().instance().set(&key, &id);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    id
}

pub(crate) fn read(env: &Env, mandate_id: u64) -> Result<Mandate, Error> {
    let key = DataKey::Mandate(mandate_id);
    let mandate: Mandate = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Ok(mandate)
}

fn write(env: &Env, mandate_id: u64, mandate: &Mandate) {
    let key = DataKey::Mandate(mandate_id);
    env.storage().persistent().set(&key, mandate);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

/// View: returns the mandate record as-is.
pub fn get_mandate(env: &Env, mandate_id: u64) -> Result<Mandate, Error> {
    read(env, mandate_id)
}

pub fn create_mandate(
    env: &Env,
    owner: Address,
    agent_pubkey: BytesN<32>,
    max_per_tx: i128,
    daily_cap: i128,
    valid_until: u32,
) -> Result<u64, Error> {
    owner.require_auth();

    if max_per_tx <= 0 || daily_cap < max_per_tx {
        return Err(Error::InvalidInput);
    }
    // A mandate that is already expired at creation is useless.
    if valid_until <= env.ledger().sequence() {
        return Err(Error::InvalidInput);
    }
    // Zero agent pubkey can never verify a signature: the mandate would be
    // dead on arrival.
    if agent_pubkey == BytesN::from_array(env, &[0u8; 32]) {
        return Err(Error::BadSignature);
    }

    let mandate = Mandate {
        owner,
        agent_pubkey,
        max_per_tx,
        daily_cap,
        valid_until,
        daily_used: 0,
        window_start: env.ledger().sequence(),
        revoked: false,
        claims_used: 0,
    };

    let id = next_id(env);
    write(env, id, &mandate);
    Ok(id)
}

/// Agent-submitted Fade claim on behalf of the owner.
/// Agent payload: v2 envoy domain || mandate_id(8B BE) || fade_id(8B BE) || ts(8B BE).
///
/// Enforcement order (SPEC_V2): not revoked -> not expired -> agent sig ->
/// price <= max_per_tx -> daily_used + price <= daily_cap ->
/// claims_used < MAX_CLAIMS_PER_MANDATE (audit v2 finding 2) -> price <= 0
/// (Envoy design restriction, see module docs) -> claim(fade, claimant=owner).
pub fn envoy_claim(
    env: &Env,
    mandate_id: u64,
    fade_id: u64,
    ts: u64,
    agent_sig: BytesN<64>,
) -> Result<(), Error> {
    let mut mandate = read(env, mandate_id)?;

    if mandate.revoked {
        return Err(Error::Unauthorized);
    }
    let now = env.ledger().sequence();
    if now > mandate.valid_until {
        return Err(Error::MandateExpired);
    }
    if agent_sig.len() != 64 {
        return Err(Error::BadSignature);
    }

    // Agent ed25519 signature over mandate_id || fade_id || ts. Same host-trap
    // caveat as confirm_handoff/attest: a bad signature traps the tx
    // atomically; it cannot be mapped to an in-contract Error code.
    // NOTE (ts freshness, audit v2 finding 3): `ts` is committed into the
    // payload but freshness is NOT enforced on-chain: an agent
    // signature stays valid until valid_until. Replay of the same claim is
    // closed by the fade state machine (a claimed fade rejects re-claim with
    // InvalidState). See docs/LIMITATIONS.md.
    let mut payload = crate::credential_payload(env, b"agyion:envoy:v2\0");
    payload.append(&Bytes::from_array(env, &mandate_id.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &fade_id.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &ts.to_be_bytes()));
    env.crypto()
        .ed25519_verify(&mandate.agent_pubkey, &payload, &agent_sig);

    // Current Fade price (missing fade -> fade_price returns 0; the
    // subsequent claim_internal will surface NotFound).
    let price = fade::fade_price(env, fade_id);

    // Per-tx cap.
    if price > mandate.max_per_tx {
        return Err(Error::CapExceeded);
    }
    // Daily cap with a rolling ledger window.
    if now.saturating_sub(mandate.window_start) >= LEDGERS_PER_DAY {
        mandate.window_start = now;
        mandate.daily_used = 0;
    }
    // Saturating add: a negative price can never push the sum above the cap,
    // and a pathological stored daily_used cannot overflow the check.
    if mandate.daily_used.saturating_add(price) > mandate.daily_cap {
        return Err(Error::CapExceeded);
    }
    // Claim-count cap (audit v2 finding 2): under the price<=0 restriction
    // below, the monetary caps above are effectively dead (daily_used only
    // ever accumulates 0), so this counter is the active bound on how many
    // fades one mandate can claim. Placed with the other cap checks so an
    // over-cap attempt reports CapExceeded regardless of the price sign.
    if mandate.claims_used >= MAX_CLAIMS_PER_MANDATE {
        return Err(Error::CapExceeded);
    }

    // Envoy restriction (see module-level DESIGN DECISION): only price <= 0
    // fades may be claimed through a mandate. Positive-price settle would
    // require the owner's auth for the claimant->seller payment, which an
    // agent-submitted tx cannot provide: and silently skipping owner auth
    // would let an agent spend owner funds. Rejected with InvalidInput.
    if price > 0 {
        return Err(Error::InvalidInput);
    }

    // Claim with claimant = owner: the mandate substitutes for owner auth
    // (fade::claim_internal performs no require_auth). Recipient binding is
    // structural: the agent cannot redirect the claim to any other address.
    fade::claim_internal(env, fade_id, mandate.owner.clone())?;

    // Accumulate spend. Only the non-negative part counts against the budget;
    // with the restriction above this is always 0 today, but the update keeps
    // SPEC semantics if positive-price Envoy claims are ever enabled.
    // (Audit v2 finding 2: the monetary cap is dead code under price<=0 :
    // daily_used stays 0: the claim-count cap below is the active limit.)
    mandate.daily_used = mandate.daily_used.saturating_add(price.max(0));
    mandate.claims_used = mandate.claims_used.saturating_add(1);
    write(env, mandate_id, &mandate);
    Ok(())
}

/// Instant revocation, owner only. The `owner` argument must match the
/// recorded mandate owner AND authorize the transaction.
pub fn revoke_mandate(env: &Env, owner: Address, mandate_id: u64) -> Result<(), Error> {
    owner.require_auth();

    let mut mandate = read(env, mandate_id)?;
    if mandate.owner != owner {
        return Err(Error::Unauthorized);
    }
    mandate.revoked = true;
    write(env, mandate_id, &mandate);
    Ok(())
}
