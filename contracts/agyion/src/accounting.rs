//! Aggregate custody accounting for a fresh V4 deployment. Only the host's
//! built-in Stellar Asset Contract is trusted, never arbitrary token responses.
use soroban_sdk::{token, Address, Env, Executable, Vec};

use crate::{DataKey, Error, TTL_EXTEND, TTL_THRESHOLD};

pub(crate) const VERSION: u32 = 4;
pub(crate) const MAX_ASSETS: u32 = 8;

pub(crate) fn initialize(env: &Env, assets: Vec<Address>) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::AccountingVersion)
        || assets.is_empty()
        || assets.len() > MAX_ASSETS
    {
        return Err(Error::InvalidConfig);
    }
    let mut seen = Vec::new(env);
    for asset in assets.iter() {
        if seen.contains(&asset) || asset.executable() != Some(Executable::StellarAsset) {
            return Err(Error::UnsupportedAsset);
        }
        seen.push_back(asset);
    }
    env.storage()
        .instance()
        .set(&DataKey::AccountingVersion, &VERSION);
    env.storage().instance().set(&DataKey::Assets, &assets);
    for asset in assets.iter() {
        store(env, &asset, 0);
    }
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Ok(())
}

pub(crate) fn assets(env: &Env) -> Result<Vec<Address>, Error> {
    let version: u32 = env
        .storage()
        .instance()
        .get(&DataKey::AccountingVersion)
        .ok_or(Error::ArchiveUnavailable)?;
    if version != VERSION {
        return Err(Error::InvalidConfig);
    }
    let assets: Vec<Address> = env
        .storage()
        .instance()
        .get(&DataKey::Assets)
        .ok_or(Error::ArchiveUnavailable)?;
    if assets.is_empty() || assets.len() > MAX_ASSETS {
        return Err(Error::InvalidConfig);
    }
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Ok(assets)
}

/// A missing initialized counter is unavailable, including after archival.
/// There is no zero fallback or registration method that can recreate it.
pub(crate) fn liability(env: &Env, asset: &Address) -> Result<i128, Error> {
    if !assets(env)?.contains(asset) {
        return Err(Error::UnsupportedAsset);
    }
    let key = DataKey::Liability(asset.clone());
    let amount: i128 = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ArchiveUnavailable)?;
    if amount < 0 {
        return Err(Error::Accounting);
    }
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(amount)
}

fn store(env: &Env, asset: &Address, amount: i128) {
    let key = DataKey::Liability(asset.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

pub(crate) fn solvent(env: &Env, asset: &Address) -> Result<i128, Error> {
    let amount = liability(env, asset)?;
    if token::Client::new(env, asset).balance(&env.current_contract_address()) < amount {
        return Err(Error::Accounting);
    }
    Ok(amount)
}

pub(crate) fn destination(env: &Env, asset: &Address, address: &Address) -> Result<(), Error> {
    if address == &env.current_contract_address() || address == asset {
        return Err(Error::InvalidInput);
    }
    Ok(())
}

/// Only canonical SAC code can reach this call. Verify its exact custody delta;
/// issuer mint/burn may keep the issuer's account balance unchanged. Ordinary
/// claimant-to-seller self-payments retain SAC auth/balance checks and cannot
/// discharge custody debt. Kernel and asset self-transfers are never allowed.
pub(crate) fn transfer(
    env: &Env,
    asset: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), Error> {
    let contract = env.current_contract_address();
    if amount <= 0 || from == asset || to == asset || (from == to && from == &contract) {
        return Err(Error::InvalidInput);
    }
    let token = token::Client::new(env, asset);
    let before = token.balance(&contract);
    let after = if from == &contract {
        before.checked_sub(amount)
    } else if to == &contract {
        before.checked_add(amount)
    } else {
        Some(before)
    }
    .ok_or(Error::Accounting)?;
    token.transfer(from, to, &amount);
    if token.balance(&contract) != after {
        return Err(Error::Accounting);
    }
    Ok(())
}

pub(crate) fn deposit(
    env: &Env,
    asset: &Address,
    from: &Address,
    amount: i128,
) -> Result<(), Error> {
    destination(env, asset, from)?;
    let before = solvent(env, asset)?;
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let after = before.checked_add(amount).ok_or(Error::Accounting)?;
    transfer(env, asset, from, &env.current_contract_address(), amount)?;
    store(env, asset, after);
    solvent(env, asset)?;
    Ok(())
}

/// Start one terminal transition. Every caller must complete its exact payouts
/// and call solvent before returning. A failed transfer rolls this write back.
pub(crate) fn release(env: &Env, asset: &Address, amount: i128) -> Result<(), Error> {
    let before = solvent(env, asset)?;
    if amount <= 0 || amount > before {
        return Err(Error::Accounting);
    }
    store(
        env,
        asset,
        before.checked_sub(amount).ok_or(Error::Accounting)?,
    );
    Ok(())
}
