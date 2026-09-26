pragma circom 2.2.3;
include "../node_modules/circomlib/circuits/babyjub.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "poseidon-encryption.circom";

// The full BabyJub group has order 8q. Proving P=[8]Q for a curve point Q
// proves P is in the prime subgroup, without relying on variable-base
// multiplication's special x=0 path. The identity is rejected separately.
template PrimeSubgroupPoint() {
    signal input point[2];
    signal input preimage[2];
    component q = BabyCheck();
    q.x <== preimage[0]; q.y <== preimage[1];
    component p = BabyCheck();
    p.x <== point[0]; p.y <== point[1];
    component dbl[3];
    for (var i=0; i<3; i++) {
        dbl[i] = BabyDbl();
        if (i==0) { dbl[i].x <== preimage[0]; dbl[i].y <== preimage[1]; }
        else { dbl[i].x <== dbl[i-1].xout; dbl[i].y <== dbl[i-1].yout; }
    }
    dbl[2].xout === point[0]; dbl[2].yout === point[1];
    component zero = IsZero(); zero.in <== point[0]; zero.out === 0;
}

template HashChain(N, TAG) {
    signal input fields[N];
    signal output out;
    component h[N];
    for (var i=0; i<N; i++) {
        h[i] = Poseidon(2);
        if (i==0) h[i].inputs[0] <== TAG;
        else h[i].inputs[0] <== h[i-1].out;
        h[i].inputs[1] <== fields[i];
    }
    out <== h[N-1].out;
}

template MerklePath(D) {
    signal input leaf;
    signal input index;
    signal input path[D];
    signal output root;
    component bits = Num2Bits(D); bits.in <== index;
    component h[D];
    signal current[D+1]; signal swap[D];
    current[0] <== leaf;
    for (var i=0; i<D; i++) {
        swap[i] <== bits.out[i] * (path[i]-current[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== current[i] + swap[i];
        h[i].inputs[1] <== path[i] - swap[i];
        current[i+1] <== h[i].out;
    }
    root <== current[D];
}

template Ecdh() {
    signal input point[2]; signal input preimage[2]; signal input secret;
    signal output shared[2]; signal output ephemeral[2];
    var Q=2736030358979909402780800718157159386076813972158567259200215660948447373041;
    var B[2]=[5299619240641551281634865583518297030282874472190772894086521144482721001553,16950150798460657717958625567821834550301663161624707787222815936182638968203];
    component cert=PrimeSubgroupPoint();
    for(var j=0;j<2;j++){ cert.point[j]<==point[j]; cert.preimage[j]<==preimage[j]; }
    component bits=Num2Bits(252); bits.in<==secret;
    component bound=LessThan(252); bound.in[0]<==secret; bound.in[1]<==Q; bound.out===1;
    component zero=IsZero(); zero.in<==secret; zero.out===0;
    component fixed=EscalarMulFix(252,B);
    component any=EscalarMulAny(252);
    for(var i=0;i<252;i++){ fixed.e[i]<==bits.out[i]; any.e[i]<==bits.out[i]; }
    for(var j=0;j<2;j++) any.p[j]<==point[j];
    for(var j=0;j<2;j++){ ephemeral[j]<==fixed.out[j]; shared[j]<==any.out[j]; }
}

template PrivateEnvelope(N,SLOT) {
    signal input message[N]; signal input point[2]; signal input preimage[2];
    signal input secret; signal input nonce; signal input context;
    signal output fields[N+4];
    component dh=Ecdh(); dh.secret<==secret;
    component k[2];
    component enc=PoseidonEncryptFields(N); enc.nonce<==nonce;
    for(var j=0;j<2;j++){ dh.point[j]<==point[j]; dh.preimage[j]<==preimage[j]; }
    for(var j=0;j<2;j++) {
        k[j]=Poseidon(3); k[j].inputs[0]<==dh.shared[j];
        k[j].inputs[1]<==context; k[j].inputs[2]<==SLOT+1;
        enc.key[j]<==k[j].out; fields[j]<==dh.ephemeral[j];
    }
    fields[2]<==nonce;
    for(var i=0;i<N;i++) enc.msg[i]<==message[i];
    for(var i=0;i<N+1;i++) fields[i+3]<==enc.cipher[i];
}
