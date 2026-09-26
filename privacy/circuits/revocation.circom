pragma circom 2.2.3;
include "primitives.circom";

// Domain-specific nonzero leaves bind the domain to the resulting public root.
// Owner authorization and tag derivation are separately verified by the host.
template Revocation() {
    signal input core[4];
    signal input path[128];
    component tagBits=Num2Bits_strict();tagBits.in<==core[3];
    component tagZero=IsZero();tagZero.in<==core[3];tagZero.out===0;
    component domainZero=IsZero();domainZero.in<==core[0];domainZero.out===0;
    var index=0;for(var i=0;i<128;i++)index+=tagBits.out[i]*(2**i);
    component leaf=Poseidon(2);leaf.inputs[0]<==1005;leaf.inputs[1]<==core[0];
    component leafZero=IsZero();leafZero.in<==leaf.out;leafZero.out===0;
    component before=MerklePath(128);component after=MerklePath(128);
    before.leaf<==0;after.leaf<==leaf.out;
    before.index<==index;after.index<==index;
    for(var i=0;i<128;i++){before.path[i]<==path[i];after.path[i]<==path[i];}
    before.root===core[1];after.root===core[2];
}
component main {public [core]}=Revocation();
