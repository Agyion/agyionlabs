pragma circom 2.2.3;
include "primitives.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

// GPL-3.0-or-later circuit composition; see LICENSE-CIRCUITS.
// Full specification and development-only release boundary: PROTOCOL_V2.md.
template NoteFormat() {
    signal input note[24];
    signal output active;
    signal output kinds[4];
    var B[2]=[5299619240641551281634865583518297030282874472190772894086521144482721001553,16950150798460657717958625567821834550301663161624707787222815936182638968203];
    note[0]===2;
    component amount=Num2Bits(64); amount.in<==note[3];
    component cap=Num2Bits(64); cap.in<==note[14];
    component start=Num2Bits(32); start.in<==note[9];
    component deadline=Num2Bits(32); deadline.in<==note[10];
    component count=Num2Bits(32); count.in<==note[15];
    component empty=IsZero(); empty.in<==note[3]; active<==1-empty.out;
    component kind[4];
    for(var k=0;k<4;k++){kind[k]=IsEqual();kind[k].in[0]<==note[4];kind[k].in[1]<==k;kinds[k]<==kind[k].out;}
    kinds[0]+kinds[1]+kinds[2]+kinds[3]===1;
    // Canonical unused policy fields are zero. Keep version/domain/asset on
    // dummy notes, with the fixed Base8 view point and no spend authority.
    var allowed[4][18]=[
        [0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0],
        [0,0,1,1,0,1,0,0,0,0,0,0,1,1,1,1,0,0],
        [1,0,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0],
        [0,1,0,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1]
    ];
    for(var k=0;k<4;k++) { for(var j=6;j<24;j++) { if(allowed[k][j-6]==0) kinds[k]*note[j]===0; } }
    for(var j=4;j<24;j++){
        if(j==20||j==21)empty.out*(note[j]-B[j-20])===0;
        else empty.out*note[j]===0;
    }
    component owner=IsZero();owner.in<==note[5];active*owner.out===0;
    component rho=IsZero();rho.in<==note[18];active*rho.out===0;
    component blind=IsZero();blind.in<==note[19];active*blind.out===0;
    component pod=IsZero();pod.in<==note[8];kinds[1]*pod.out===0;
    component refund=IsZero();refund.in<==note[6];kinds[2]*refund.out===0;
    component finalTime=IsZero();finalTime.in<==note[10];kinds[2]*finalTime.out===0;
    var envoyFields[5]=[7,14,15,16,17];component required[5];
    for(var j=0;j<5;j++){required[j]=IsZero();required[j].in<==note[envoyFields[j]];kinds[3]*required[j].out===0;}
    component timeOrder=LessThan(32);timeOrder.in[0]<==note[9];timeOrder.in[1]<==note[10];kinds[3]*(1-timeOrder.out)===0;
}

template Transition() {
    signal input core[23]; signal input encrypted[134];
    signal input inNotes[2][24]; signal input outNotes[2][24];
    signal input inPaths[2][32]; signal input inIndices[2];
    signal input appendPaths[2][32];
    signal input assetPath[8]; signal input assetIndex;
    signal input authSecrets[2]; signal input podSecrets[2]; signal input modes[2];
    signal input attestSignatures[2][3];
    signal input revokePaths[2][128];
    signal input pointPreimages[11][2];
    signal input encSecrets[5]; signal input encNonces[5];
    var B[2]=[5299619240641551281634865583518297030282874472190772894086521144482721001553,16950150798460657717958625567821834550301663161624707787222815936182638968203];
    core[22]===2;
    component nonceZero[5];component repeatedEphemeral[5][5];component repeatedNonce[5][5];
    for(var i=0;i<5;i++){
        nonceZero[i]=IsZero();nonceZero[i].in<==encNonces[i];nonceZero[i].out===0;
        for(var j=0;j<i;j++){
            repeatedEphemeral[i][j]=IsEqual();repeatedEphemeral[i][j].in[0]<==encSecrets[i];repeatedEphemeral[i][j].in[1]<==encSecrets[j];repeatedEphemeral[i][j].out===0;
            repeatedNonce[i][j]=IsEqual();repeatedNonce[i][j].in[0]<==encNonces[i];repeatedNonce[i][j].in[1]<==encNonces[j];repeatedNonce[i][j].out===0;
        }
    }
    component fromBits=Num2Bits(32);fromBits.in<==core[6];
    component untilBits=Num2Bits(32);untilBits.in<==core[7];
    component interval=Num2Bits(7);interval.in<==core[7]-core[6];
    component intervalMax=LessEqThan(7);intervalMax.in[0]<==core[7]-core[6];intervalMax.in[1]<==120;intervalMax.out===1;
    component epoch=Num2Bits(32);epoch.in<==core[2];
    component epochZero=IsZero();epochZero.in<==core[2];epochZero.out===0;
    component indexBits=Num2Bits(33);indexBits.in<==core[11];
    component indexMax=LessEqThan(33);indexMax.in[0]<==core[11];indexMax.in[1]<==4294967296;indexMax.out===1;
    component bridgeAmount=Num2Bits(64);bridgeAmount.in<==core[18];
    component feeAmount=Num2Bits(64);feeAmount.in<==core[20];
    component bridge[3];
    for(var k=0;k<3;k++){bridge[k]=IsEqual();bridge[k].in[0]<==core[16];bridge[k].in[1]<==k;}
    bridge[0].out+bridge[1].out+bridge[2].out===1;
    bridge[0].out*core[18]===0;bridge[0].out*core[19]===0;
    component amountZero=IsZero();amountZero.in<==core[18];(1-bridge[0].out)*amountZero.out===0;
    component accountZero=IsZero();accountZero.in<==core[19];(1-bridge[0].out)*accountZero.out===0;
    component feeZero=IsZero();feeZero.in<==core[20];
    component feeAccountZero=IsZero();feeAccountZero.in<==core[21];feeZero.out===feeAccountZero.out;
    signal hiddenAsset;hiddenAsset<==bridge[0].out*feeZero.out;
    core[17]===(1-hiddenAsset)*inNotes[0][2];
    component assetZero=IsZero();assetZero.in<==inNotes[0][2];assetZero.out===0;
    component allow=MerklePath(8);allow.leaf<==inNotes[0][2];allow.index<==assetIndex;
    for(var j=0;j<8;j++)allow.path[j]<==assetPath[j];allow.root===core[1];

    component inf[2];component outf[2];component inh[2];component outh[2];
    component nullifier[2];component member[2];component nfZero[2];component cmZero[2];
    signal inCommit[2];signal outActive[2];
    for(var i=0;i<2;i++){
        inf[i]=NoteFormat();outf[i]=NoteFormat();inh[i]=HashChain(24,1001);outh[i]=HashChain(24,1001);
        for(var j=0;j<24;j++){
            inf[i].note[j]<==inNotes[i][j];outf[i].note[j]<==outNotes[i][j];
            inh[i].fields[j]<==inNotes[i][j];outh[i].fields[j]<==outNotes[i][j];
        }
        inNotes[i][1]===core[0];outNotes[i][1]===core[0];
        inNotes[i][2]===inNotes[0][2];outNotes[i][2]===inNotes[0][2];
        inCommit[i]<==inf[i].active*inh[i].out;
        outActive[i]<==outf[i].active;
        core[14+i]===outActive[i]*outh[i].out;
        nullifier[i]=Poseidon(4);nullifier[i].inputs[0]<==1002;nullifier[i].inputs[1]<==core[0];
        nullifier[i].inputs[2]<==inNotes[i][18];nullifier[i].inputs[3]<==inh[i].out;
        core[12+i]===inf[i].active*nullifier[i].out;
        nfZero[i]=IsZero();nfZero[i].in<==core[12+i];inf[i].active*nfZero[i].out===0;
        cmZero[i]=IsZero();cmZero[i].in<==core[14+i];outActive[i]*cmZero[i].out===0;
        member[i]=MerklePath(32);member[i].leaf<==inh[i].out;member[i].index<==inIndices[i];
        for(var j=0;j<32;j++)member[i].path[j]<==inPaths[i][j];
        inf[i].active*(member[i].root-core[8])===0;
        bridge[1].out*inf[i].active===0;
        bridge[2].out*inNotes[i][4]===0;
    }
    // Packed outputs permit a complete exit even at tree capacity.
    outActive[1]*(1-outActive[0])===0;
    component sameNF=IsEqual();sameNF.in[0]<==core[12];sameNF.in[1]<==core[13];
    signal bothInputs;bothInputs<==inf[0].active*inf[1].active;bothInputs*sameNF.out===0;
    signal realCount;realCount<==inf[0].active+inf[1].active+outActive[0]+outActive[1];
    component emptyTx=IsZero();emptyTx.in<==realCount;emptyTx.out===0;
    signal deposit;signal withdraw;
    deposit<==bridge[1].out*core[18];withdraw<==bridge[2].out*core[18];
    inNotes[0][3]+inNotes[1][3]+deposit===outNotes[0][3]+outNotes[1][3]+withdraw+core[20];
    // Fresh current-transition nullifier seeds prevent accidental reuse. The
    // nullifier also binds the complete note commitment, not only its seed.
    component fresh[2][2];signal freshEnabled[2][2];
    for(var o=0;o<2;o++){ for(var i=0;i<2;i++){
        fresh[o][i]=IsEqual();fresh[o][i].in[0]<==outNotes[o][18];fresh[o][i].in[1]<==inNotes[i][18];
        freshEnabled[o][i]<==outActive[o]*inf[i].active;freshEnabled[o][i]*fresh[o][i].out===0;
    } }
    component distinctOutput=IsEqual();distinctOutput.in[0]<==outNotes[0][18];distinctOutput.in[1]<==outNotes[1][18];
    signal bothOutputs;bothOutputs<==outActive[0]*outActive[1];bothOutputs*distinctOutput.out===0;

    signal appendRoot[3];signal appendIndex[2];
    appendRoot[0]<==core[9];
    component oldLeaf[2];component newLeaf[2];
    for(var i=0;i<2;i++){
        if(i==0)appendIndex[i]<==outActive[i]*core[11];
        else appendIndex[i]<==outActive[i]*(core[11]+outActive[0]);
        oldLeaf[i]=MerklePath(32);newLeaf[i]=MerklePath(32);
        oldLeaf[i].leaf<==0;newLeaf[i].leaf<==core[14+i];
        oldLeaf[i].index<==appendIndex[i];newLeaf[i].index<==appendIndex[i];
        for(var j=0;j<32;j++){oldLeaf[i].path[j]<==appendPaths[i][j];newLeaf[i].path[j]<==appendPaths[i][j];}
        outActive[i]*(oldLeaf[i].root-appendRoot[i])===0;
        appendRoot[i+1]<==appendRoot[i]+outActive[i]*(newLeaf[i].root-appendRoot[i]);
    }
    appendRoot[2]===core[10];

    component mode[2][6];component auth[2];component pod[2];component authZero[2];component podZero[2];component timeFrom[2];component timeUntil[2];component refundTime[2];
    component sigMessage[2];component signature[2];component aCert[2];component rCert[2];
    component revBits[2];component rev[2];signal revIndex[2];
    signal cashActive[2];signal conditional[2];signal ordinaryClaim[2];signal spendCost[2];
    component costBound[2];component remCountZero[2];component remAmountZero[2];
    signal successor[2];signal refundChange[2];signal stillActive[2];signal hasRefund[2];
    for(var i=0;i<2;i++){
        for(var k=0;k<6;k++){mode[i][k]=IsEqual();mode[i][k].in[0]<==modes[i];mode[i][k].in[1]<==k;}
        mode[i][0].out+mode[i][1].out+mode[i][2].out+mode[i][3].out+mode[i][4].out+mode[i][5].out===1;
        (1-inf[i].active)*modes[i]===0;
        inf[i].active*(inNotes[i][4]-mode[i][1].out-2*(mode[i][2].out+mode[i][3].out)-3*(mode[i][4].out+mode[i][5].out))===0;
        conditional[i]<==1-mode[i][0].out;
        conditional[i]*core[16]===0;conditional[i]*inf[1-i].active===0;
        conditional[i]*outNotes[0][4]===0;
        ordinaryClaim[i]<==mode[i][1].out+mode[i][2].out+mode[i][3].out+mode[i][5].out;
        ordinaryClaim[i]*outActive[1]===0;
        auth[i]=Poseidon(1);auth[i].inputs[0]<==authSecrets[i];
        authZero[i]=IsZero();authZero[i].in<==authSecrets[i];inf[i].active*authZero[i].out===0;
        (1-inf[i].active)*authSecrets[i]===0;
        cashActive[i]<==inf[i].active*mode[i][0].out;
        cashActive[i]*(auth[i].out-inNotes[i][5])===0;
        (mode[i][1].out+mode[i][2].out+mode[i][5].out)*(auth[i].out-inNotes[i][5])===0;
        mode[i][3].out*(auth[i].out-inNotes[i][6])===0;
        mode[i][4].out*(auth[i].out-inNotes[i][7])===0;
        (mode[i][1].out+mode[i][2].out+mode[i][5].out)*(outNotes[0][5]-inNotes[i][5])===0;
        mode[i][3].out*(outNotes[0][5]-inNotes[i][6])===0;
        pod[i]=Poseidon(2);pod[i].inputs[0]<==1004;pod[i].inputs[1]<==podSecrets[i];
        podZero[i]=IsZero();podZero[i].in<==podSecrets[i];mode[i][1].out*podZero[i].out===0;
        mode[i][1].out*(pod[i].out-inNotes[i][8])===0;
        (1-mode[i][1].out)*podSecrets[i]===0;
        timeFrom[i]=LessEqThan(32);timeFrom[i].in[0]<==inNotes[i][9];timeFrom[i].in[1]<==core[6];
        (mode[i][1].out+mode[i][4].out)*(1-timeFrom[i].out)===0;
        timeUntil[i]=LessEqThan(32);timeUntil[i].in[0]<==core[7];timeUntil[i].in[1]<==inNotes[i][10];
        (mode[i][2].out+mode[i][4].out)*(1-timeUntil[i].out)===0;
        refundTime[i]=LessThan(32);refundTime[i].in[0]<==inNotes[i][10];refundTime[i].in[1]<==core[6];
        mode[i][3].out*(1-refundTime[i].out)===0;

        sigMessage[i]=Poseidon(6);
        sigMessage[i].inputs[0]<==core[0];sigMessage[i].inputs[1]<==inh[i].out;sigMessage[i].inputs[2]<==inNotes[i][11];
        sigMessage[i].inputs[3]<==inNotes[i][5];sigMessage[i].inputs[4]<==inNotes[i][10];sigMessage[i].inputs[5]<==1;
        signature[i]=EdDSAPoseidonVerifier();signature[i].enabled<==mode[i][2].out;signature[i].M<==sigMessage[i].out;
        signature[i].S<==attestSignatures[i][2];
        signature[i].R8x<==attestSignatures[i][0];signature[i].R8y<==attestSignatures[i][1];
        aCert[i]=PrimeSubgroupPoint();rCert[i]=PrimeSubgroupPoint();
        for(var j=0;j<2;j++){
            aCert[i].point[j]<==B[j]+inf[i].kinds[2]*(inNotes[i][12+j]-B[j]);
            aCert[i].preimage[j]<==pointPreimages[3+i][j];
            rCert[i].point[j]<==B[j]+mode[i][2].out*(attestSignatures[i][j]-B[j]);
            rCert[i].preimage[j]<==pointPreimages[9+i][j];
            (1-mode[i][2].out)*(attestSignatures[i][j]-B[j])===0;
        }
        signature[i].Ax<==aCert[i].point[0];signature[i].Ay<==aCert[i].point[1];
        (1-mode[i][2].out)*attestSignatures[i][2]===0;

        revBits[i]=Num2Bits_strict();revBits[i].in<==inNotes[i][16];
        var ix=0;for(var j=0;j<128;j++)ix+=revBits[i].out[j]*(2**j);
        revIndex[i]<==ix;
        rev[i]=MerklePath(128);rev[i].leaf<==0;rev[i].index<==revIndex[i];
        for(var j=0;j<128;j++)rev[i].path[j]<==revokePaths[i][j];
        mode[i][4].out*(rev[i].root-core[5])===0;
        // A grant has no committed fee beneficiary/policy. Otherwise its agent
        // could divert cap-1 to itself as a fee and pay only 1 to the recipient.
        mode[i][4].out*core[20]===0;
        spendCost[i]<==outNotes[0][3]+core[20];
        costBound[i]=LessEqThan(65);costBound[i].in[0]<==spendCost[i];costBound[i].in[1]<==inNotes[i][14];
        mode[i][4].out*(1-costBound[i].out)===0;
        mode[i][4].out*(1-outActive[0])===0;
        mode[i][4].out*(outNotes[0][5]-inNotes[i][17])===0;
        for(var j=0;j<2;j++)mode[i][4].out*(outNotes[0][20+j]-inNotes[i][22+j])===0;
        remCountZero[i]=IsEqual();remCountZero[i].in[0]<==inNotes[i][15];remCountZero[i].in[1]<==1;
        remAmountZero[i]=IsZero();remAmountZero[i].in<==outNotes[1][3];
        stillActive[i]<==(1-remCountZero[i].out)*(1-remAmountZero[i].out);
        successor[i]<==mode[i][4].out*stillActive[i];
        refundChange[i]<==mode[i][4].out*remCountZero[i].out;
        successor[i]*(outNotes[1][4]-3)===0;
        successor[i]*(outNotes[1][15]-(inNotes[i][15]-1))===0;
        for(var j=0;j<24;j++){ if(j!=3&&j!=15&&j!=18&&j!=19)successor[i]*(outNotes[1][j]-inNotes[i][j])===0; }
        refundChange[i]*outNotes[1][4]===0;
        hasRefund[i]<==refundChange[i]*outActive[1];
        hasRefund[i]*(outNotes[1][5]-inNotes[i][5])===0;
        for(var j=0;j<2;j++)hasRefund[i]*(outNotes[1][20+j]-inNotes[i][20+j])===0;
    }

    component outAttest[2];component outTarget[2];
    for(var i=0;i<2;i++){
        outAttest[i]=PrimeSubgroupPoint();outTarget[i]=PrimeSubgroupPoint();
        for(var j=0;j<2;j++){
            outAttest[i].point[j]<==B[j]+outf[i].kinds[2]*(outNotes[i][12+j]-B[j]);
            outAttest[i].preimage[j]<==pointPreimages[5+i][j];
            outTarget[i].point[j]<==B[j]+outf[i].kinds[3]*(outNotes[i][22+j]-B[j]);
            outTarget[i].preimage[j]<==pointPreimages[7+i][j];
        }
    }
    component context=HashChain(23,1003);for(var j=0;j<23;j++)context.fields[j]<==core[j];
    component incoming[2];
    for(var i=0;i<2;i++){
        incoming[i]=PrivateEnvelope(24,i);incoming[i].secret<==encSecrets[i];incoming[i].nonce<==encNonces[i];incoming[i].context<==context.out;
        // Dummy view scalar is publicly known (1). Never encrypt the canonical
        // internal dummy's asset/domain fields under that publicly known key.
        for(var j=0;j<24;j++)incoming[i].message[j]<==outActive[i]*outNotes[i][j];
        for(var j=0;j<2;j++){incoming[i].point[j]<==outNotes[i][20+j];incoming[i].preimage[j]<==pointPreimages[i][j];}
        for(var j=0;j<28;j++)encrypted[i*28+j]===incoming[i].fields[j];
    }
    component auditAssets=PrivateEnvelope(9,2);component auditParties=PrivateEnvelope(12,3);component auditTerms=PrivateEnvelope(45,4);
    auditAssets.secret<==encSecrets[2];auditAssets.nonce<==encNonces[2];auditAssets.context<==context.out;
    auditParties.secret<==encSecrets[3];auditParties.nonce<==encNonces[3];auditParties.context<==context.out;
    auditTerms.secret<==encSecrets[4];auditTerms.nonce<==encNonces[4];auditTerms.context<==context.out;
    for(var j=0;j<2;j++){
        auditAssets.point[j]<==core[3+j];auditParties.point[j]<==core[3+j];auditTerms.point[j]<==core[3+j];
        auditAssets.preimage[j]<==pointPreimages[2][j];auditParties.preimage[j]<==pointPreimages[2][j];auditTerms.preimage[j]<==pointPreimages[2][j];
    }
    auditAssets.message[0]<==inNotes[0][2];auditAssets.message[1]<==inNotes[0][3];auditAssets.message[2]<==inNotes[1][3];
    auditAssets.message[3]<==outNotes[0][3];auditAssets.message[4]<==outNotes[1][3];
    auditAssets.message[5]<==inCommit[0];auditAssets.message[6]<==inCommit[1];auditAssets.message[7]<==core[18];auditAssets.message[8]<==core[20];
    var terms[11]=[4,8,9,10,11,12,13,14,15,16,17];
    for(var i=0;i<4;i++){
        for(var j=0;j<3;j++){
            if(i<2)auditParties.message[3*i+j]<==inNotes[i][5+j];
            else auditParties.message[3*i+j]<==outNotes[i-2][5+j];
        }
        for(var j=0;j<11;j++){
            if(i<2)auditTerms.message[11*i+j]<==inNotes[i][terms[j]];
            else auditTerms.message[11*i+j]<==outNotes[i-2][terms[j]];
        }
    }
    auditTerms.message[44]<==0;
    for(var j=0;j<13;j++)encrypted[56+j]===auditAssets.fields[j];
    for(var j=0;j<16;j++)encrypted[69+j]===auditParties.fields[j];
    for(var j=0;j<49;j++)encrypted[85+j]===auditTerms.fields[j];
}
component main {public [core,encrypted]} = Transition();
