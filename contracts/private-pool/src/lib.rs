#![no_std]
//! Experimental testnet-only private pool. Real, immutable Groth16 keys are
//! mandatory; missing artifacts fail closed. No public Agyion funds are migrated.
mod backing;
mod hash;
mod pins;
mod tree_zeros;
mod verifier;
use hash::{canonical, is_zero, u64_field, zero, Poseidon};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, Vec,
};
pub use verifier::VerifyingKey;
const PUBLIC_INPUTS: u32 = 157;
const TREE_CAPACITY: u64 = 1u64 << 32;
const TESTNET: &[u8] = b"Test SDF Network ; September 2015";
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    WrongNetwork = 1,
    ArtifactsUnavailable = 2,
    WrongKey = 3,
    InvalidConfig = 4,
    InvalidField = 5,
    InvalidWindow = 6,
    StaleRoot = 7,
    InvalidShape = 8,
    Spent = 9,
    InvalidBridge = 10,
    InvalidFee = 11,
    UnknownAsset = 12,
    TreeFull = 13,
    InvalidProof = 14,
    DuplicateRecord = 15,
    InvalidRevocation = 16,
    DuplicateCommitment = 17,
    ArchiveUnavailable = 18,
    ArchiveFull = 19,
    LiabilityUnavailable = 20,
    InsufficientBacking = 21,
    InvalidAccounting = 22,
    UnexpectedBalance = 23,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    pub assets: Vec<Address>,
    pub disclosure_epoch: u32,
    pub auditor_x: BytesN<32>,
    pub auditor_y: BytesN<32>,
    pub dkg_transcript_hash: BytesN<32>,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolConfig {
    pub config: Config,
    pub domain: BytesN<32>,
    pub asset_ids: Vec<BytesN<32>>,
    pub asset_policy_root: BytesN<32>,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolState {
    pub root: BytesN<32>,
    pub next_index: u64,
    pub revocation_root: BytesN<32>,
    pub roots: Vec<BytesN<32>>,
    pub record_count: u64,
    pub revocation_count: u64,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Transition {
    pub valid_from: u32,
    pub valid_until: u32,
    pub input_root: BytesN<32>,
    pub append_old_root: BytesN<32>,
    pub append_new_root: BytesN<32>,
    pub next_index: u64,
    pub nullifiers: Vec<BytesN<32>>,
    pub commitments: Vec<BytesN<32>>,
    pub bridge_kind: u32,
    pub asset: Option<Address>,
    pub bridge_amount: u64,
    pub bridge_account: Option<Address>,
    pub fee_amount: u64,
    pub fee_account: Option<Address>,
    pub ciphertext: Vec<BytesN<32>>,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct StoredRecord {
    pub ledger: u32,
    pub public_inputs: Vec<BytesN<32>>,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct StoredRevocation {
    pub ledger: u32,
    pub tag: BytesN<32>,
    pub old_root: BytesN<32>,
    pub new_root: BytesN<32>,
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    State,
    Vk,
    RevocationVk,
    Nullifier(BytesN<32>),
    Commitment(BytesN<32>),
    Record(BytesN<32>),
    RecordIndex(u64),
    RevocationIndex(u64),
    Liability(Address),
}
#[contractevent]
#[derive(Clone)]
pub struct RecordAdded {
    #[topic]
    pub record_id: BytesN<32>,
    pub nullifiers: Vec<BytesN<32>>,
    pub commitments: Vec<BytesN<32>>,
    pub root: BytesN<32>,
    pub next_index: u64,
}
#[contractevent]
#[derive(Clone)]
pub struct TagRevoked {
    #[topic]
    pub tag: BytesN<32>,
    pub root: BytesN<32>,
}
#[contract]
pub struct PrivatePool;
fn network(e: &Env) -> Result<(), Error> {
    if e.ledger().network_id() != e.crypto().sha256(&Bytes::from_slice(e, TESTNET)).to_bytes() {
        Err(Error::WrongNetwork)
    } else {
        Ok(())
    }
}
fn bump(e: &Env) {
    let max = e.storage().max_ttl();
    e.storage().instance().extend_ttl(max / 2, max);
}
fn persist<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(e: &Env, key: &Key, value: &T) {
    e.storage().persistent().set(key, value);
    let max = e.storage().max_ttl();
    e.storage().persistent().extend_ttl(key, max / 2, max);
}
fn fields(values: &Vec<BytesN<32>>) -> Result<(), Error> {
    if values.iter().all(|v| canonical(&v)) {
        Ok(())
    } else {
        Err(Error::InvalidField)
    }
}
fn config(e: &Env) -> PoolConfig {
    e.storage().instance().get(&Key::Config).unwrap()
}
fn state(e: &Env) -> PoolState {
    e.storage().instance().get(&Key::State).unwrap()
}
fn state_checks(e: &Env, s: &PoolState, t: &Transition) -> Result<u64, Error> {
    if t.valid_until < t.valid_from
        || t.valid_until - t.valid_from > 120
        || e.ledger().sequence() < t.valid_from
        || e.ledger().sequence() > t.valid_until
    {
        return Err(Error::InvalidWindow);
    }
    if !canonical(&t.input_root) || !canonical(&t.append_old_root) || !canonical(&t.append_new_root)
    {
        return Err(Error::InvalidField);
    }
    if !s.roots.iter().any(|r| r == t.input_root)
        || t.append_old_root != s.root
        || t.next_index != s.next_index
    {
        return Err(Error::StaleRoot);
    }
    if t.nullifiers.len() != 2 || t.commitments.len() != 2 || t.ciphertext.len() != 134 {
        return Err(Error::InvalidShape);
    }
    fields(&t.nullifiers)?;
    fields(&t.commitments)?;
    fields(&t.ciphertext)?;
    let n0 = t.nullifiers.get(0).unwrap();
    let n1 = t.nullifiers.get(1).unwrap();
    if !is_zero(&n0) && n0 == n1 {
        return Err(Error::InvalidShape);
    }
    for n in t.nullifiers.iter() {
        if !is_zero(&n) && e.storage().persistent().has(&Key::Nullifier(n)) {
            return Err(Error::Spent);
        }
    }
    let c0 = t.commitments.get(0).unwrap();
    let c1 = t.commitments.get(1).unwrap();
    if (is_zero(&c0) && !is_zero(&c1)) || (!is_zero(&c0) && c0 == c1) {
        return Err(Error::InvalidShape);
    }
    for commitment in t.commitments.iter() {
        if !is_zero(&commitment) && e.storage().persistent().has(&Key::Commitment(commitment)) {
            return Err(Error::DuplicateCommitment);
        }
    }
    let count = t.commitments.iter().filter(|c| !is_zero(c)).count() as u64;
    if t.next_index > TREE_CAPACITY || count > TREE_CAPACITY - t.next_index {
        return Err(Error::TreeFull);
    }
    if (count == 0) != (t.append_new_root == t.append_old_root) {
        return Err(Error::InvalidShape);
    }
    let inputs = t.nullifiers.iter().filter(|n| !is_zero(n)).count();
    if t.bridge_kind > 2
        || (t.bridge_kind == 1 && (inputs != 0 || count == 0))
        || (t.bridge_kind != 1 && inputs == 0)
    {
        return Err(Error::InvalidBridge);
    }
    // A SAC self-transfer leaves the reserve unchanged. Consuming private
    // notes for such a withdrawal/fee would strand that value in the pool.
    let pool = e.current_contract_address();
    if t.bridge_account.as_ref() == Some(&pool)
        || (t.bridge_account.is_some() && t.bridge_account == t.asset)
    {
        return Err(Error::InvalidBridge);
    }
    if t.fee_account.as_ref() == Some(&pool)
        || (t.fee_account.is_some() && t.fee_account == t.asset)
    {
        return Err(Error::InvalidFee);
    }
    // Nonces are exact unsigned128bit values. Other field checks are delegated
    // to the proof, including valid nonidentity subgroup ephemerals.
    for offset in [0u32, 28, 56, 69, 85] {
        let nonce = t.ciphertext.get(offset + 2).unwrap();
        if is_zero(&nonce) || nonce.to_array()[..16].iter().any(|b| *b != 0) {
            return Err(Error::InvalidField);
        }
    }
    Ok(count)
}
fn public_inputs(
    e: &Env,
    c: &PoolConfig,
    s: &PoolState,
    t: &Transition,
) -> Result<Vec<BytesN<32>>, Error> {
    let mut hash = Poseidon::new(e);
    let exposed = t.bridge_kind != 0 || t.fee_amount != 0;
    let asset = if exposed {
        let actual = t.asset.as_ref().ok_or(Error::UnknownAsset)?;
        let index = c
            .config
            .assets
            .iter()
            .position(|a| a == *actual)
            .ok_or(Error::UnknownAsset)?;
        c.asset_ids.get(index as u32).unwrap()
    } else {
        if t.asset.is_some() {
            return Err(Error::InvalidBridge);
        }
        zero(e)
    };
    let account = if t.bridge_kind == 0 {
        if t.bridge_amount != 0 || t.bridge_account.is_some() {
            return Err(Error::InvalidBridge);
        }
        zero(e)
    } else {
        if t.bridge_amount == 0 {
            return Err(Error::InvalidBridge);
        }
        hash.tagged_address(
            b"AGYION_ACCOUNT_V2\0",
            t.bridge_account.as_ref().ok_or(Error::InvalidBridge)?,
        )
    };
    let fee = if t.fee_amount == 0 {
        if t.fee_account.is_some() {
            return Err(Error::InvalidFee);
        }
        zero(e)
    } else {
        hash.tagged_address(
            b"AGYION_ACCOUNT_V2\0",
            t.fee_account.as_ref().ok_or(Error::InvalidFee)?,
        )
    };
    let mut input = soroban_sdk::vec![
        e,
        c.domain.clone(),
        c.asset_policy_root.clone(),
        u64_field(e, c.config.disclosure_epoch.into()),
        c.config.auditor_x.clone(),
        c.config.auditor_y.clone(),
        s.revocation_root.clone(),
        u64_field(e, t.valid_from.into()),
        u64_field(e, t.valid_until.into()),
        t.input_root.clone(),
        t.append_old_root.clone(),
        t.append_new_root.clone(),
        u64_field(e, t.next_index),
        t.nullifiers.get(0).unwrap(),
        t.nullifiers.get(1).unwrap(),
        t.commitments.get(0).unwrap(),
        t.commitments.get(1).unwrap(),
        u64_field(e, t.bridge_kind.into()),
        asset,
        u64_field(e, t.bridge_amount),
        account,
        u64_field(e, t.fee_amount),
        fee,
        u64_field(e, 2)
    ];
    input.append(&t.ciphertext);
    Ok(input)
}
#[contractimpl]
impl PrivatePool {
    pub fn __constructor(
        e: Env,
        initial: Config,
        vk: VerifyingKey,
        revocation_vk: VerifyingKey,
    ) -> Result<(), Error> {
        network(&e)?;
        if pins::MAIN_VK_HASH == [0; 32] || pins::REVOCATION_VK_HASH == [0; 32] {
            return Err(Error::ArtifactsUnavailable);
        }
        if !verifier::key_matches(&e, &vk, PUBLIC_INPUTS, &pins::MAIN_VK_HASH)
            || !verifier::key_matches(&e, &revocation_vk, 4, &pins::REVOCATION_VK_HASH)
        {
            return Err(Error::WrongKey);
        }
        if initial.assets.is_empty()
            || initial.assets.len() > 8
            || initial.disclosure_epoch == 0
            || !canonical(&initial.auditor_x)
            || !canonical(&initial.auditor_y)
            || is_zero(&initial.auditor_x)
            || is_zero(&initial.dkg_transcript_hash)
        {
            return Err(Error::InvalidConfig);
        }
        let mut hash = Poseidon::new(&e);
        let mut ids = Vec::new(&e);
        for (i, a) in initial.assets.iter().enumerate() {
            if initial.assets.iter().take(i).any(|b| b == a) {
                return Err(Error::InvalidConfig);
            }
            backing::stellar_asset(&a)?;
            ids.push_back(hash.tagged_address(b"AGYION_ASSET_V2\0", &a));
        }
        let root = BytesN::from_array(&e, &tree_zeros::EMPTY_32);
        let config = PoolConfig {
            domain: hash.domain(),
            asset_policy_root: hash.policy_root(&ids),
            config: initial,
            asset_ids: ids,
        };
        let state = PoolState {
            root: root.clone(),
            next_index: 0,
            revocation_root: BytesN::from_array(&e, &tree_zeros::EMPTY_128),
            roots: soroban_sdk::vec![&e, root],
            record_count: 0,
            revocation_count: 0,
        };
        e.storage().instance().set(&Key::Config, &config);
        e.storage().instance().set(&Key::State, &state);
        e.storage().instance().set(&Key::Vk, &vk);
        e.storage()
            .instance()
            .set(&Key::RevocationVk, &revocation_vk);
        for asset in config.config.assets.iter() {
            persist(&e, &Key::Liability(asset), &0i128);
        }
        bump(&e);
        Ok(())
    }
    pub fn submit(e: Env, transition: Transition, proof: Bytes) -> Result<BytesN<32>, Error> {
        network(&e)?;
        let c = config(&e);
        let mut s = state(&e);
        let t = &transition;
        let next_record_count = s.record_count.checked_add(1).ok_or(Error::ArchiveFull)?;
        let output_count = state_checks(&e, &s, t)?;
        let inputs = public_inputs(&e, &c, &s, t)?;
        let id = hash::ciphertext_digest(&e, &t.ciphertext);
        if e.storage().persistent().has(&Key::Record(id.clone())) {
            return Err(Error::DuplicateRecord);
        }
        let vk = e.storage().instance().get(&Key::Vk).unwrap();
        if !verifier::verify(&e, &vk, &proof, &inputs) {
            return Err(Error::InvalidProof);
        }
        if t.bridge_kind == 1 {
            t.bridge_account.as_ref().unwrap().require_auth();
        }
        let mut backing = backing::prepare(&e, t)?;
        // Effects before token transfers; any failure rolls all effects and
        // earlier transfers back atomically. No admin bypass or upgrade entrypoint.
        if let Some(value) = &backing {
            value.persist_liability(&e);
        }
        for n in t.nullifiers.iter() {
            if !is_zero(&n) {
                persist(&e, &Key::Nullifier(n), &true);
            }
        }
        for commitment in t.commitments.iter() {
            if !is_zero(&commitment) {
                persist(&e, &Key::Commitment(commitment), &true);
            }
        }
        if output_count != 0 {
            s.root = t.append_new_root.clone();
            s.next_index += output_count;
            s.roots.push_back(s.root.clone());
            if s.roots.len() > 64 {
                s.roots.pop_front();
            }
        }
        persist(&e, &Key::RecordIndex(s.record_count), &id);
        s.record_count = next_record_count;
        e.storage().instance().set(&Key::State, &s);
        persist(
            &e,
            &Key::Record(id.clone()),
            &StoredRecord {
                ledger: e.ledger().sequence(),
                public_inputs: inputs,
            },
        );
        if t.bridge_kind == 1 {
            let funder = t.bridge_account.as_ref().unwrap();
            backing.as_mut().unwrap().transfer(
                &e,
                funder,
                &e.current_contract_address(),
                t.bridge_amount,
                true,
            )?;
        }
        if t.bridge_kind == 2 {
            backing.as_mut().unwrap().transfer(
                &e,
                &e.current_contract_address(),
                t.bridge_account.as_ref().unwrap(),
                t.bridge_amount,
                false,
            )?;
        }
        if t.fee_amount != 0 {
            backing.as_mut().unwrap().transfer(
                &e,
                &e.current_contract_address(),
                t.fee_account.as_ref().unwrap(),
                t.fee_amount,
                false,
            )?;
        }
        RecordAdded {
            record_id: id.clone(),
            nullifiers: t.nullifiers.clone(),
            commitments: t.commitments.clone(),
            root: s.root,
            next_index: s.next_index,
        }
        .publish(&e);
        bump(&e);
        Ok(id)
    }
    pub fn revoke(
        e: Env,
        tag: BytesN<32>,
        old_root: BytesN<32>,
        new_root: BytesN<32>,
        owner_key: BytesN<32>,
        signature: BytesN<64>,
        proof: Bytes,
    ) -> Result<(), Error> {
        network(&e)?;
        let c = config(&e);
        let mut s = state(&e);
        let next_revocation_count = s
            .revocation_count
            .checked_add(1)
            .ok_or(Error::ArchiveFull)?;
        if !canonical(&tag)
            || is_zero(&tag)
            || !canonical(&old_root)
            || !canonical(&new_root)
            || old_root != s.revocation_root
            || new_root == old_root
        {
            return Err(Error::InvalidRevocation);
        }
        if Poseidon::new(&e).revocation_tag(&c.domain, &owner_key) != tag {
            return Err(Error::InvalidRevocation);
        }
        let mut message = Bytes::from_slice(&e, b"AGYION_REVOKE_V2\0");
        for part in [
            c.domain.clone(),
            old_root.clone(),
            new_root.clone(),
            tag.clone(),
        ] {
            message.append(&part.into());
        }
        e.crypto().ed25519_verify(&owner_key, &message, &signature);
        let vk = e.storage().instance().get(&Key::RevocationVk).unwrap();
        if !verifier::verify(
            &e,
            &vk,
            &proof,
            &soroban_sdk::vec![
                &e,
                c.domain,
                old_root.clone(),
                new_root.clone(),
                tag.clone()
            ],
        ) {
            return Err(Error::InvalidProof);
        }
        s.revocation_root = new_root.clone();
        persist(
            &e,
            &Key::RevocationIndex(s.revocation_count),
            &StoredRevocation {
                ledger: e.ledger().sequence(),
                tag: tag.clone(),
                old_root,
                new_root: new_root.clone(),
            },
        );
        s.revocation_count = next_revocation_count;
        e.storage().instance().set(&Key::State, &s);
        TagRevoked {
            tag,
            root: new_root,
        }
        .publish(&e);
        bump(&e);
        Ok(())
    }
    pub fn config(e: Env) -> PoolConfig {
        config(&e)
    }
    /// Aggregate obligations from already-public bridge and fee amounts.
    /// Missing/archived accounting must be restored, never inferred as zero.
    pub fn liability(e: Env, asset: Address) -> Result<i128, Error> {
        network(&e)?;
        let amount = backing::liability(&e, &asset)?;
        bump(&e);
        Ok(amount)
    }
    pub fn state(e: Env) -> PoolState {
        state(&e)
    }
    pub fn record(e: Env, id: BytesN<32>) -> Option<StoredRecord> {
        e.storage().persistent().get(&Key::Record(id))
    }
    /// Only out-of-range indices mean absent. A missing indexed entry is an
    /// unavailable/corrupt archive and must never be interpreted as end-of-data.
    pub fn record_id_at(e: Env, index: u64) -> Result<Option<BytesN<32>>, Error> {
        if index >= state(&e).record_count {
            return Ok(None);
        }
        e.storage()
            .persistent()
            .get(&Key::RecordIndex(index))
            .map(Some)
            .ok_or(Error::ArchiveUnavailable)
    }
    pub fn revocation_at(e: Env, index: u64) -> Result<Option<StoredRevocation>, Error> {
        if index >= state(&e).revocation_count {
            return Ok(None);
        }
        e.storage()
            .persistent()
            .get(&Key::RevocationIndex(index))
            .map(Some)
            .ok_or(Error::ArchiveUnavailable)
    }
    pub fn spent(e: Env, nullifier: BytesN<32>) -> Result<bool, Error> {
        if !canonical(&nullifier) || is_zero(&nullifier) {
            return Err(Error::InvalidField);
        }
        Ok(e.storage().persistent().has(&Key::Nullifier(nullifier)))
    }
}
#[cfg(test)]
mod test;
