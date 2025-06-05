pragma circom 2.1.6;

include "@solarity/circom-lib/blinders/Commitment.circom";

template RecoveryCommitment() {
    signal input secret;
    signal input newOwner;

    signal output commitment;
    signal output recoveredTo;

    component commitmentHash = Hash1();

    commitmentHash.a <== secret;
    commitmentHash.dummy <== 0;

    commitment <== commitmentHash.out;

    component recoveredToHash = Hash1();

    recoveredToHash.a <== newOwner;
    recoveredToHash.dummy <== 0;

    recoveredTo <== recoveredToHash.out;
}

component main = RecoveryCommitment();
