// SPDX-License-Identifier: CC0-1.0
pragma circom 2.1.6;

include "@solarity/circom-lib/blinders/Commitment.circom";

template HashCommitment() {
    signal input secret;

    signal output commitment;

    component commitmentHash = Hash1();

    commitmentHash.a <== secret;
    commitmentHash.dummy <== 0;

    commitment <== commitmentHash.out;
}

component main = HashCommitment();
