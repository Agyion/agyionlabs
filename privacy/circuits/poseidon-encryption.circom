// SPDX-License-Identifier: GPL-3.0-or-later
// Uses circomlib 2.0.5 PoseidonEx (iden3/0KIMS, GPL-3.0-or-later).
// Cipher convention: @zk-kit/poseidon-cipher 0.3.2 (MIT), originally Weijie Koh.
// Source pins: zk-kit/zk-kit f5bfea817d4e3f08ce511c9d6738d31dbaf2ad1a;
// no code from its unchecked/broken-padding decrypt gadgets is incorporated.
pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Fixed complete 3-field blocks avoid ambiguous padding. The caller MUST bind
// msg to its actual note/value witness, key to checked ECDH, and every cipher
// output to the public transcript/digest. A free key or ciphertext hash alone
// does not prove encryption to the required recipient or disclosure committee.
// Field signals are Fr elements: canonical byte encodings are checked outside
// the circuit. Nonce is range-constrained here, never a witness-only assertion.
template PoseidonEncryptFields(N) {
    assert(N >= 3);
    assert(N <= 96);
    assert(N % 3 == 0);
    signal input msg[N];
    signal input key[2];
    signal input nonce;
    signal output cipher[N + 1];

    component nonceBits = Num2Bits(128);
    nonceBits.in <== nonce;

    var blocks = N \ 3;
    signal state[blocks + 1][4];
    component permutation[blocks + 1];
    state[0][0] <== 0;
    state[0][1] <== key[0];
    state[0][2] <== key[1];
    state[0][3] <== nonce + N * 340282366920938463463374607431768211456;

    for (var block = 0; block < blocks; block++) {
        permutation[block] = PoseidonEx(3, 4);
        permutation[block].initialState <== state[block][0];
        for (var j = 0; j < 3; j++) {
            permutation[block].inputs[j] <== state[block][j + 1];
        }
        state[block + 1][0] <== permutation[block].out[0];
        for (var j = 0; j < 3; j++) {
            cipher[block * 3 + j] <== permutation[block].out[j + 1] + msg[block * 3 + j];
            state[block + 1][j + 1] <== cipher[block * 3 + j];
        }
    }

    permutation[blocks] = PoseidonEx(3, 4);
    permutation[blocks].initialState <== state[blocks][0];
    for (var j = 0; j < 3; j++) {
        permutation[blocks].inputs[j] <== state[blocks][j + 1];
    }
    cipher[N] <== permutation[blocks].out[1];
}
