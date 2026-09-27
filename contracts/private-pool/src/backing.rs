//! Public bridge accounting only. Hidden fee-free transitions reveal no asset
//! and deliberately do not inspect balances or counters across the allowlist.
use crate::{config, persist, Error, Key, Transition};
use soroban_sdk::{token, Address, Env, Executable};

pub(crate) fn stellar_asset(asset: &Address) -> Result<(), Error> {
    if asset.executable() != Some(Executable::StellarAsset) {
        return Err(Error::UnknownAsset);
    }
    Ok(())
}

pub(crate) fn liability(e: &Env, asset: &Address) -> Result<i128, Error> {
    if !config(e).config.assets.contains(asset) {
        return Err(Error::UnknownAsset);
    }
    stellar_asset(asset)?;
    let key = Key::Liability(asset.clone());
    let amount: i128 = e
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::LiabilityUnavailable)?;
    if amount < 0 {
        return Err(Error::InvalidAccounting);
    }
    let max = e.storage().max_ttl();
    e.storage().persistent().extend_ttl(&key, max / 2, max);
    Ok(amount)
}

fn add(value: i128, amount: u64) -> Result<i128, Error> {
    value
        .checked_add(i128::from(amount))
        .ok_or(Error::InvalidAccounting)
}
fn subtract(value: i128, amount: u64) -> Result<i128, Error> {
    value
        .checked_sub(i128::from(amount))
        .filter(|n| *n >= 0)
        .ok_or(Error::InvalidAccounting)
}

pub(crate) struct Backing {
    asset: Address,
    balance: i128,
    next_liability: i128,
}

pub(crate) fn prepare(e: &Env, t: &Transition) -> Result<Option<Backing>, Error> {
    if t.bridge_kind == 0 && t.fee_amount == 0 {
        return Ok(None);
    }
    let asset = t.asset.as_ref().ok_or(Error::UnknownAsset)?;
    let old = liability(e, asset)?;
    let balance = token::Client::new(e, asset).balance(&e.current_contract_address());
    // Test BEFORE adding any deposit: new users may not subsidize an old deficit.
    if balance < old {
        return Err(Error::InsufficientBacking);
    }
    let after_bridge = match t.bridge_kind {
        0 => old,
        1 => add(old, t.bridge_amount)?,
        2 => subtract(old, t.bridge_amount)?,
        _ => return Err(Error::InvalidBridge),
    };
    let next_liability = subtract(after_bridge, t.fee_amount)?;
    Ok(Some(Backing {
        asset: asset.clone(),
        balance,
        next_liability,
    }))
}

impl Backing {
    pub(crate) fn persist_liability(&self, e: &Env) {
        persist(e, &Key::Liability(self.asset.clone()), &self.next_liability);
    }

    pub(crate) fn transfer(
        &mut self,
        e: &Env,
        from: &Address,
        to: &Address,
        amount: u64,
        inbound: bool,
    ) -> Result<(), Error> {
        let expected = if inbound {
            add(self.balance, amount)?
        } else {
            subtract(self.balance, amount)?
        };
        let client = token::Client::new(e, &self.asset);
        client.transfer(from, to, &i128::from(amount));
        let actual = client.balance(&e.current_contract_address());
        if actual != expected {
            return Err(Error::UnexpectedBalance);
        }
        self.balance = actual;
        Ok(())
    }
}
