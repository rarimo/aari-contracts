pragma circom 2.1.6;

template queryIdentity(idTreeDepth) {
    signal output nullifier;    // Poseidon3(sk_i, Poseidon1(sk_i), eventID)

    signal output birthDate;       // *(PT - passport timestamp)
    signal output expirationDate;  // *(PT - passport timestamp)
    signal output name;            // 31 bytes | TD3 has 39 = 31 + 8 bytes for name
    signal output nameResidual;    // 8 bytes
    signal output nationality;     // UTF-8 encoded | "USA" -> 0x555341 -> 5591873
    signal output citizenship;     // UTF-8 encoded | "USA" -> 0x555341 -> 5591873
    signal output sex;             // UTF-8 encoded | "F" -> 0x46 -> 70
    signal output documentNumber;  // UTF-8 encoded

    // public signals
    signal input eventID;       // challenge | for single eventID -> single nullifier for one identity
    signal input eventData;     // event data binded to the proof; not involved in comp
    signal input idStateRoot;   // identity state Merkle root
    signal input selector;      // blinds personal data | 0 is not used
    signal input currentDate;   // used to differ 19 and 20th centuries in passport encoded dates *(PT)

    // query parameters (set 0 if not used)
    signal input timestampLowerbound;  // identity is issued in this time range  *(UT)
    signal input timestampUpperbound;  // timestamp E [timestampLowerbound, timestampUpperbound)   *(UT)

    signal input identityCounterLowerbound; // Number of identities connected to the specific passport
    signal input identityCounterUpperbound; // identityCounter E [timestampLowerbound, timestampUpperbound)

    signal input birthDateLowerbound;  // birthDateLowerbound < birthDate | 0x303030303030 if not used   *(PT)
    signal input birthDateUpperbound;  // birthDate < birthDateUpperbound | 0x303030303030 if not used   *(PT)

    signal input expirationDateLowerbound; // expirationDateLowerbound < expirationDate | 0x303030303030 if not used   *(PT)
    signal input expirationDateUpperbound; // expirationDate < expirationDateUpperbound | 0x303030303030 if not used   *(PT)

    signal input citizenshipMask;      // binary mask to whitelist | blacklist citizenships

    // private signals
    signal input skIdentity;          // identity secret (private) key
    signal input pkPassportHash;      // passport public key (DG15) hash
    signal input dg1[744];            // 744 bits | DG1 in binary
    signal input idStateSiblings[80]; // identity tree inclusion proof
    signal input timestamp;           // identity creation timestamp   *(UT)
    signal input identityCounter;     // number of times identities were reissuied for the same passport
}

component main { public [eventID,
                        eventData,
                        idStateRoot,
                        selector,
                        currentDate,
                        timestampLowerbound,
                        timestampUpperbound,
                        identityCounterLowerbound,
                        identityCounterUpperbound,
                        birthDateLowerbound,
                        birthDateUpperbound,
                        expirationDateLowerbound,
                        expirationDateUpperbound,
                        citizenshipMask
                        ] } = queryIdentity(80);
