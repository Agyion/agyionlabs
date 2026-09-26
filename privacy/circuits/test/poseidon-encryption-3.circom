// SPDX-License-Identifier: GPL-3.0-or-later
pragma circom 2.1.5;
include "../poseidon-encryption.circom";

// Only the complete ciphertext is public; witness/key/nonce stay private in
// this arithmetic fixture. Protocol-level nonce/domain binding is separate.
template EncryptionFixture() {
    signal input msg[3];
    signal input key[2];
    signal input nonce;
    signal input cipher[4];
    component enc = PoseidonEncryptFields(3);
    enc.nonce <== nonce;
    for (var i = 0; i < 2; i++) enc.key[i] <== key[i];
    for (var i = 0; i < 3; i++) enc.msg[i] <== msg[i];
    for (var i = 0; i < 4; i++) enc.cipher[i] === cipher[i];
}
component main { public [cipher] } = EncryptionFixture();
