# Complete private key recovery

`src/vault.mjs` holds independently generated spending and viewing secrets in
memory. Optional Pod entries include their secret and a dedicated viewing key;
Envoy entries include their revocation Ed25519 seed and a dedicated viewing key.
Grant viewing keys are separate from the wallet viewing key. The helper creates
no hierarchical derivation scheme, wallet signature, network request or plaintext
storage entry. This experimental composition has not received an independent
security audit.

Before a real deposit or funding a new grant, the application must require a
complete encrypted key backup to be saved, then reselected from the saved file,
restored and compared with the current vault. `backupPrivacyVault` produces the
Argon2id/AES-GCM encrypted file contents. `checkPrivacyVaultBackup` performs the
actual full-key comparison on supplied contents. It does **not** establish that
a file was downloaded, kept safely, or that a deposit is enabled. There is no
fabricated user acknowledgement or funding switch in this helper.

`createPrivacyVault(scope, grantSpecs)` creates keys for a trusted scope containing
network ID, contract ID, disclosure epoch and profile ID. Grant specifications
are sorted distinct `{ id, kind }` records, with 32-byte hex IDs and `pod` or
`envoy` kinds. `addVaultGrant` returns a new handle preserving existing keys and
adding independent grant material. The new handle needs a new saved and checked
backup; the previous backup cannot recover the added keys.

Public handles contain derived authorization hashes, view points and grant
public information. They expose no private material when serialized. Only
`exportVaultKeys` reveals complete plaintext keys for local witness construction,
decryption or revocation operations. Never send that result to RPC, analytics,
logs or browser storage. `forgetPrivacyVault` removes access through a handle;
JavaScript cannot guarantee physical erasure of secrets from memory.

`restorePrivacyVault` requires the expected scope, authenticates the encrypted
backup and derives all public information again from canonical private keys.
An expected owner ID can additionally bind restoration to an existing wallet.
Wrong passwords, altered ciphertext and mismatched scope fail closed. There is
no password reset or recovery without the keys or a usable backup and password.

Note-opening backups and prepared-witness backups from `client.mjs` are useful
but are **not complete key recovery**. Keep the vault backup alongside encrypted
note/opening records. Restoring keys does not establish current note membership,
unspent status, archive authenticity or acceptance of any transaction; those
still require the separately verified pool state and records.
