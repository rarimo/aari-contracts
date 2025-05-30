import { getPayload, getQueryInputs } from "@/test/utils/utils";
import { RarimoNullifierRecoveryProviderMock, RegistrationSMTMock } from "@ethers-v6";
import { Reverter } from "@test-helpers";
import { ProofqueryIdentityGroth16, queryIdentity } from "@zkit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers, zkit } from "hardhat";

describe("RarimoNullifierRecoveryProvider", () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let USER1: SignerWithAddress;
  let USER2: SignerWithAddress;

  let recoveryProvider: RarimoNullifierRecoveryProviderMock;
  let verifier: any;
  let registrationSMT: RegistrationSMTMock;

  let query: queryIdentity;

  let proof: ProofqueryIdentityGroth16;
  let registrationRoot: string;
  let nullifier: bigint;

  before(async () => {
    await time.increaseTo(1733739711);

    [OWNER, USER1, USER2] = await ethers.getSigners();

    query = await zkit.getCircuit("queryIdentity");

    recoveryProvider = await ethers.deployContract("RarimoNullifierRecoveryProviderMock", {
      libraries: {
        PoseidonUnit3L: await ethers.deployContract("PoseidonUnit3L", {
          libraries: {
            PoseidonT4: await ethers.deployContract("PoseidonT4"),
          },
        }),
      },
    });

    verifier = await ethers.deployContract("QueryIdentityProofVerifier");

    registrationSMT = await ethers.deployContract("RegistrationSMTMock");

    await recoveryProvider.__RarimoNullifierRecoveryProvider_init(
      await verifier.getAddress(),
      await registrationSMT.getAddress(),
    );

    await reverter.snapshot();
  });

  beforeEach(async () => {
    const eventId = await recoveryProvider.getEventId(USER1.address);
    const eventData = await recoveryProvider.getEventData();

    const inputs = getQueryInputs(eventId, eventData);

    proof = await query.generateProof(inputs);

    registrationRoot = ethers.toBeHex(proof.publicSignals.idStateRoot, 32);

    nullifier = proof.publicSignals.nullifier;

    await recoveryProvider.connect(OWNER).setNullifier(USER1.address, nullifier);

    await registrationSMT.setValidRoot(registrationRoot);
  });

  afterEach(reverter.revert);

  describe("initialize", () => {
    it("should initialize the contract correctly", async () => {
      expect(await recoveryProvider.owner()).to.be.equal(OWNER);
      expect(await recoveryProvider.verifier()).to.be.equal(await verifier.getAddress());
      expect(await recoveryProvider.registrationSMT()).to.be.equal(await registrationSMT.getAddress());
    });

    it("should not allow to re-initialize the contract", async () => {
      await expect(
        recoveryProvider.__RarimoNullifierRecoveryProvider_init(await verifier.getAddress(), USER1.address),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidInitialization");
    });
  });

  describe("checkRecovery", () => {
    it("should check recovery correctly", async () => {
      let proofPayload = getPayload(USER1.address, proof, registrationRoot);

      expect(await recoveryProvider.checkRecovery(proofPayload)).to.be.true;

      // unregistered user
      proofPayload = getPayload(USER2.address, proof, registrationRoot);

      expect(await recoveryProvider.checkRecovery(proofPayload)).to.be.false;

      // modified witness
      const eventId = await recoveryProvider.getEventId(USER1.address);
      const eventData = await recoveryProvider.getEventData();

      const inputs = getQueryInputs(eventId, eventData);
      proof = await query.generateProof(inputs, { "main.selector": 100n });

      proofPayload = getPayload(USER1.address, proof, registrationRoot);
      expect(await recoveryProvider.checkRecovery(proofPayload)).to.be.false;
    });

    it("should not allow to check  recovery for the incorrect SMT root", async () => {
      const proofPayload = getPayload(USER1.address, proof, ethers.toBeHex(proof.publicSignals.idStateRoot + 2, 32));

      await expect(recoveryProvider.checkRecovery(proofPayload)).to.be.revertedWithCustomError(
        recoveryProvider,
        "InvalidRegistrationRoot",
      );
    });
  });

  describe("setNullifier", () => {
    it("should set nullifier correctly", async () => {
      await recoveryProvider.connect(OWNER).setNullifier(USER2.address, 100);

      expect(await recoveryProvider.getNullifier(USER2.address)).to.be.equal(100);
    });

    it("should not allow to set the nullifier for the zero address", async () => {
      await expect(recoveryProvider.connect(OWNER).setNullifier(ZeroAddress, 100)).to.be.revertedWithCustomError(
        recoveryProvider,
        "AccountZeroAddress",
      );
    });

    it("should not allow to set the nullifier if the caller is not the owner", async () => {
      await expect(recoveryProvider.connect(USER2).setNullifier(USER2.address, 50))
        .to.be.revertedWithCustomError(recoveryProvider, "OwnableUnauthorizedAccount")
        .withArgs(USER2.address);
    });
  });
});
