pragma circom 2.1.6;

include "@solarity/circom-lib/blinders/Commitment.circom";

template RecoveryCommitment() {
    signal input secret;
    signal input newOwner;

    signal output recoveredTo;
    signal output commitment;

    component commitmentHash = Hash2();

    commitmentHash.a <== 1;
    commitmentHash.b <== secret;
    commitmentHash.dummy <== 0;

    commitment <== commitmentHash.out;
    recoveredTo <== newOwner;
}

component main = RecoveryCommitment();
