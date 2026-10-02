//! Pod template: the funder buries funds in the contract; after unlock_ledger
//! has passed, the bearer signing key authorizes a specific recipient.

use soroban_sdk::{xdr::ToXdr, Address, Bytes, BytesN, Env};

use crate::{accounting, DataKey, Error, Pod, TTL_EXTEND, TTL_THRESHOLD};

pub(crate) fn next_id(env: &Env) -> u64 {
    let key = DataKey::PodCount;
    let id: u64 = env.storage().instance().get(&key).unwrap_or(0) + 1;
    env.storage().instance().set(&key, &id);
    // Instance storage (counter) is archivable too; extend on every touch.
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    id
}

pub(crate) fn read(env: &Env, pod_id: u64) -> Result<Pod, Error> {
    let key = DataKey::Pod(pod_id);
    let pod: Pod = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NotFound)?;
    // Keep the record and every shared custody dependency live through unlock.
    let target = crate::retention_ttl(env, u64::from(pod.unlock_ledger))?;
    env.storage().persistent().extend_ttl(&key, target, target);
    env.storage().instance().extend_ttl(target, target);
    accounting::retain(env, &pod.asset, target)?;
    Ok(pod)
}

fn write(env: &Env, pod_id: u64, pod: &Pod) -> Result<(), Error> {
    let key = DataKey::Pod(pod_id);
    let target = crate::retention_ttl(env, u64::from(pod.unlock_ledger))?;
    env.storage().persistent().set(&key, pod);
    env.storage().persistent().extend_ttl(&key, target, target);
    accounting::retain(env, &pod.asset, target)?;
    Ok(())
}

/// View: returns the pod record as-is.
pub fn get_pod(env: &Env, pod_id: u64) -> Result<Pod, Error> {
    read(env, pod_id)
}

pub fn create_pod(
    env: &Env,
    funder: Address,
    asset: Address,
    amount: i128,
    unlock_ledger: u32,
    claim_pubkey: BytesN<32>,
    key_proof: BytesN<64>,
) -> Result<u64, Error> {
    funder.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    if claim_pubkey == BytesN::from_array(env, &[0; 32]) {
        return Err(Error::BadSignature);
    }
    crate::retention_ttl(env, u64::from(unlock_ledger))?;
    // Require possession of a usable claim key before moving any funds. Bind the
    // proof to all creation terms so a proof from another Pod is not a substitute.
    let mut payload = crate::credential_payload(env, b"agyion:pod-create:v3\0");
    payload.append(&funder.clone().to_xdr(env));
    payload.append(&asset.clone().to_xdr(env));
    payload.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    payload.append(&Bytes::from_array(env, &unlock_ledger.to_be_bytes()));
    payload.append(&Bytes::from(claim_pubkey.clone()));
    env.crypto()
        .ed25519_verify(&claim_pubkey, &payload, &key_proof);

    // Non-custodial: funds are deposited into the contract; outside the rules
    // nobody can withdraw them.
    accounting::deposit(env, &asset, &funder, amount)?;

    let pod = Pod {
        funder,
        asset,
        amount,
        unlock_ledger,
        claim_pubkey,
        state: 0,
    };

    let id = next_id(env);
    write(env, id, &pod)?;
    Ok(id)
}

pub fn claim_pod(
    env: &Env,
    pod_id: u64,
    recipient: Address,
    signature: BytesN<64>,
) -> Result<(), Error> {
    // Both the destination wallet and the bearer claim key authorize this payout.
    // Observing a signature in simulation or submission grants no other recipient.
    recipient.require_auth();

    let mut pod = read(env, pod_id)?;
    if pod.state != 0 {
        return Err(Error::InvalidState);
    }
    if env.ledger().sequence() < pod.unlock_ledger {
        return Err(Error::Locked);
    }
    let mut payload = crate::credential_payload(env, b"agyion:pod-claim:v3\0");
    payload.append(&Bytes::from_array(env, &pod_id.to_be_bytes()));
    payload.append(&recipient.clone().to_xdr(env));
    env.crypto()
        .ed25519_verify(&pod.claim_pubkey, &payload, &signature);

    accounting::destination(env, &pod.asset, &recipient)?;
    accounting::release(env, &pod.asset, pod.amount)?;
    accounting::transfer(
        env,
        &pod.asset,
        &env.current_contract_address(),
        &recipient,
        pod.amount,
    )?;
    accounting::solvent(env, &pod.asset)?;

    pod.state = 1;
    write(env, pod_id, &pod)?;
    Ok(())
}
