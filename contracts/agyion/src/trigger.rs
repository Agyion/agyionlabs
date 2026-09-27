//! Trigger template: event escrow. The funder locks funds for a beneficiary;
//! an independent attester's ed25519 signature executes the payout; after the
//! deadline a rule-based refund returns the funds to the funder. No
//! discretion on either path.

use soroban_sdk::{xdr::ToXdr, Address, Bytes, BytesN, Env};

use crate::{accounting, DataKey, Error, Trigger, TTL_EXTEND, TTL_THRESHOLD};

pub(crate) fn next_id(env: &Env) -> u64 {
    let key = DataKey::TriggerCount;
    let id: u64 = env.storage().instance().get(&key).unwrap_or(0) + 1;
    env.storage().instance().set(&key, &id);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    id
}

pub(crate) fn read(env: &Env, trigger_id: u64) -> Result<Trigger, Error> {
    let key = DataKey::Trigger(trigger_id);
    let trigger: Trigger = env
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
    accounting::liability(env, &trigger.asset)?;
    Ok(trigger)
}

fn write(env: &Env, trigger_id: u64, trigger: &Trigger) {
    let key = DataKey::Trigger(trigger_id);
    env.storage().persistent().set(&key, trigger);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

/// View: returns the trigger record as-is.
pub fn get_trigger(env: &Env, trigger_id: u64) -> Result<Trigger, Error> {
    read(env, trigger_id)
}

pub fn create_trigger(
    env: &Env,
    funder: Address,
    asset: Address,
    amount: i128,
    beneficiary: Address,
    attester_pubkey: BytesN<32>,
    deadline_ledger: u32,
) -> Result<u64, Error> {
    funder.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    // A token self-transfer leaves the reserve in this contract while attest
    // marks the escrow executed. There is no beneficiary withdrawal entrypoint,
    // so reject this destination before the funder deposits anything.
    if beneficiary == env.current_contract_address() || beneficiary == asset {
        return Err(Error::InvalidInput);
    }
    // A deadline in the past (or the current ledger) would birth a
    // refund-only escrow; rejected at create time, consistent with
    // create_mandate's valid_until check (audit v2 finding 4).
    if deadline_ledger <= env.ledger().sequence() || deadline_ledger == u32::MAX {
        return Err(Error::InvalidInput);
    }
    // Zero attester pubkey can never verify a signature: the escrow would be
    // refund-only. Rejected at create time (same rule as Fade's venue key).
    if attester_pubkey == BytesN::from_array(env, &[0u8; 32]) {
        return Err(Error::BadSignature);
    }

    // Non-custodial: funds are deposited into the contract; only the
    // attest/refund rules can move them.
    accounting::deposit(env, &asset, &funder, amount)?;

    let trigger = Trigger {
        funder,
        asset,
        amount,
        beneficiary,
        attester_pubkey,
        deadline_ledger,
        state: 0,
    };

    let id = next_id(env);
    write(env, id, &trigger);
    Ok(id)
}

/// Executes the escrow: valid attester signature && ledger <= deadline ->
/// pays the beneficiary. Anyone may submit the attestation (the signature is
/// the authorization, and the beneficiary is bound inside the signed
/// payload), which keeps the flow non-custodial and front-running safe.
pub fn attest(env: &Env, trigger_id: u64, ts: u64, sig: BytesN<64>) -> Result<(), Error> {
    let mut trigger = read(env, trigger_id)?;
    if trigger.state != 0 {
        return Err(Error::InvalidState); // first valid transition wins
    }
    if env.ledger().sequence() > trigger.deadline_ledger {
        // Attestation window closed; the trigger falls to refund.
        return Err(Error::DeadlinePassed);
    }
    if sig.len() != 64 {
        return Err(Error::BadSignature);
    }

    // Attester ed25519 signature:
    // payload = v2 attest domain || trigger_id || beneficiary(XDR) || ts.
    // NOTE (ts freshness, audit v2 finding 3): `ts` is payload-bound but its
    // freshness is NOT enforced on-chain; a signature remains valid
    // until the deadline. Replay is closed by the state machine (0 -> 1 is
    // single-direction) and funds can only ever flow to the beneficiary.
    // See docs/LIMITATIONS.md.
    // NOTE: like confirm_handoff, `ed25519_verify` host-traps on failure
    // instead of returning a Result; that branch cannot become an in-contract
    // Error. The tx rolls back atomically, funds stay locked, and after the
    // deadline the rule-based refund remains available.
    let mut payload = crate::credential_payload(env, b"agyion:attest:v2\0");
    payload.append(&Bytes::from_array(env, &trigger_id.to_be_bytes()));
    payload.append(&trigger.beneficiary.clone().to_xdr(env));
    payload.append(&Bytes::from_array(env, &ts.to_be_bytes()));
    env.crypto()
        .ed25519_verify(&trigger.attester_pubkey, &payload, &sig);

    accounting::destination(env, &trigger.asset, &trigger.beneficiary)?;
    accounting::release(env, &trigger.asset, trigger.amount)?;
    accounting::transfer(
        env,
        &trigger.asset,
        &env.current_contract_address(),
        &trigger.beneficiary,
        trigger.amount,
    )?;
    accounting::solvent(env, &trigger.asset)?;

    trigger.state = 1;
    write(env, trigger_id, &trigger);
    Ok(())
}

/// Rule-based refund: ledger > deadline && not attested -> funds return to
/// the funder. No discretion; anyone may call.
pub fn refund_trigger(env: &Env, trigger_id: u64) -> Result<(), Error> {
    let mut trigger = read(env, trigger_id)?;
    if trigger.state != 0 {
        return Err(Error::InvalidState);
    }
    if env.ledger().sequence() <= trigger.deadline_ledger {
        // Deadline not passed yet: the beneficiary's attestation path is
        // still open, refund must wait.
        return Err(Error::DeadlinePassed);
    }

    accounting::destination(env, &trigger.asset, &trigger.funder)?;
    accounting::release(env, &trigger.asset, trigger.amount)?;
    accounting::transfer(
        env,
        &trigger.asset,
        &env.current_contract_address(),
        &trigger.funder,
        trigger.amount,
    )?;
    accounting::solvent(env, &trigger.asset)?;

    trigger.state = 2;
    write(env, trigger_id, &trigger);
    Ok(())
}
