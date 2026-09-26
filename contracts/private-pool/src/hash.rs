use crate::{tree_zeros, verifier::FR_MODULUS};
use soroban_sdk::{xdr::ToXdr, Address, Bytes, BytesN, Env, Symbol, Vec, U256};
pub type Field = BytesN<32>;
pub fn canonical(x: &Field) -> bool {
    x.to_array() < FR_MODULUS
}
pub fn zero(e: &Env) -> Field {
    BytesN::from_array(e, &[0; 32])
}
pub fn is_zero(x: &Field) -> bool {
    x.to_array() == [0; 32]
}
pub fn u64_field(e: &Env, value: u64) -> Field {
    let mut a = [0; 32];
    a[24..].copy_from_slice(&value.to_be_bytes());
    BytesN::from_array(e, &a)
}
pub fn ciphertext_digest(e: &Env, fields: &Vec<Field>) -> Field {
    let mut bytes = Bytes::new(e);
    for f in fields.iter() {
        bytes.append(&f.into());
    }
    e.crypto().sha256(&bytes).to_bytes()
}
// poseidon-lite0.3.0 (MIT) t3 parameters, RC followed by row-major MDS.
// Byte-for-byte cross-checked with circomlib2.0.5 reference parameters.
// SHA256 d580f0ebf5aec8825a0212c9db8fd20135155e1352e68809e2d7f2bc5440b86f.
const PARAMETERS: &[u8] = include_bytes!("poseidon_t3.bin");
pub struct Poseidon {
    env: Env,
    mds: Vec<Vec<U256>>,
    rc: Vec<Vec<U256>>,
}
impl Poseidon {
    pub fn new(e: &Env) -> Self {
        let mut offset = 0;
        let mut rc = Vec::new(e);
        let mut mds = Vec::new(e);
        for _ in 0..65 {
            let mut row = Vec::new(e);
            for _ in 0..3 {
                row.push_back(U256::from_be_bytes(
                    e,
                    &Bytes::from_slice(e, &PARAMETERS[offset..offset + 32]),
                ));
                offset += 32;
            }
            rc.push_back(row);
        }
        for _ in 0..3 {
            let mut row = Vec::new(e);
            for _ in 0..3 {
                row.push_back(U256::from_be_bytes(
                    e,
                    &Bytes::from_slice(e, &PARAMETERS[offset..offset + 32]),
                ));
                offset += 32;
            }
            mds.push_back(row);
        }
        Self {
            env: e.clone(),
            mds,
            rc,
        }
    }
    pub fn pair(&mut self, a: &Field, b: &Field) -> Field {
        assert!(canonical(a) && canonical(b));
        let e = &self.env;
        let state = soroban_sdk::vec![
            e,
            U256::from_u32(e, 0),
            U256::from_be_bytes(e, &a.clone().into()),
            U256::from_be_bytes(e, &b.clone().into())
        ];
        e.crypto_hazmat()
            .poseidon_permutation(
                &state,
                Symbol::new(e, "BN254"),
                3,
                5,
                8,
                57,
                &self.mds,
                &self.rc,
            )
            .get(0)
            .unwrap()
            .to_be_bytes()
            .try_into()
            .unwrap()
    }
    pub fn digest_id(&mut self, digest: &BytesN<32>) -> Field {
        let bytes = digest.to_array();
        let mut hi = [0; 32];
        let mut lo = [0; 32];
        hi[16..].copy_from_slice(&bytes[..16]);
        lo[16..].copy_from_slice(&bytes[16..]);
        self.pair(
            &BytesN::from_array(&self.env, &hi),
            &BytesN::from_array(&self.env, &lo),
        )
    }
    pub fn tagged_address(&mut self, tag: &[u8], address: &Address) -> Field {
        let mut bytes = Bytes::from_slice(&self.env, tag);
        bytes.append(&address.to_xdr(&self.env));
        let digest = self.env.crypto().sha256(&bytes).to_bytes();
        self.digest_id(&digest)
    }
    pub fn domain(&mut self) -> Field {
        let mut bytes = Bytes::from_slice(&self.env, b"AGYION_DOMAIN_V2\0");
        bytes.append(&self.env.ledger().network_id().into());
        bytes.append(&self.env.current_contract_address().to_xdr(&self.env));
        let digest = self.env.crypto().sha256(&bytes).to_bytes();
        self.digest_id(&digest)
    }
    pub fn revocation_tag(&mut self, domain: &Field, public_key: &BytesN<32>) -> Field {
        let mut bytes = Bytes::from_slice(&self.env, b"AGYION_REVOKE_KEY_V2\0");
        bytes.append(&domain.clone().into());
        bytes.append(&public_key.clone().into());
        let digest = self.env.crypto().sha256(&bytes).to_bytes();
        self.digest_id(&digest)
    }
    pub fn policy_root(&mut self, ids: &Vec<Field>) -> Field {
        assert!(!ids.is_empty() && ids.len() <= 8);
        let e = self.env.clone();
        let mut nodes = ids.clone();
        let zeros = [
            tree_zeros::EMPTY_0,
            tree_zeros::EMPTY_1,
            tree_zeros::EMPTY_2,
            tree_zeros::EMPTY_3,
            tree_zeros::EMPTY_4,
            tree_zeros::EMPTY_5,
            tree_zeros::EMPTY_6,
            tree_zeros::EMPTY_7,
        ];
        for empty in &zeros {
            let mut next = Vec::new(&e);
            let mut i = 0;
            while i < nodes.len() {
                let left = nodes.get(i).unwrap();
                let right = nodes.get(i + 1).unwrap_or(BytesN::from_array(&e, empty));
                next.push_back(self.pair(&left, &right));
                i += 2;
            }
            nodes = next;
        }
        nodes.get(0).unwrap()
    }
}
