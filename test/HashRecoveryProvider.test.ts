import { getPayload, getSubscribePayload } from "@/test/utils/utils";
import { HashRecoveryProvider } from "@ethers-v6";
import { poseidon } from "@iden3/js-crypto";
import { Reverter } from "@test-helpers";
import { HashCommitment, RecoveryCommitment } from "@zkit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { ZeroHash } from "ethers";
import { ethers, zkit } from "hardhat";

describe("HashRecoveryProvider", () => {
  const reverter = new Reverter();

  const secret = "secret recovery message";

  let OWNER: SignerWithAddress;
  let USER1: SignerWithAddress;
  let USER2: SignerWithAddress;

  let recoveryProvider: HashRecoveryProvider;
  let recoveryVerifier: any;
  let commitmentVerifier: any;

  let recoveryCommitment: RecoveryCommitment;
  let hashCommitment: HashCommitment;

  before(async () => {
    [OWNER, USER1, USER2] = await ethers.getSigners();

    recoveryCommitment = await zkit.getCircuit("RecoveryCommitment");
    hashCommitment = await zkit.getCircuit("HashCommitment");

    recoveryProvider = await ethers.deployContract("HashRecoveryProvider", {
      libraries: {
        PoseidonT2: await ethers.deployContract("PoseidonT2"),
      },
    });

    recoveryVerifier = await ethers.deployContract("RecoveryCommitmentGroth16Verifier");
    commitmentVerifier = await ethers.deployContract("HashCommitmentGroth16Verifier");

    await recoveryProvider.initialize(await recoveryVerifier.getAddress(), await commitmentVerifier.getAddress());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initialize", () => {
    it("should initialize the contract correctly", async () => {
      expect(await recoveryProvider.owner()).to.be.equal(OWNER);
      expect(await recoveryProvider.recoveryVerifier()).to.be.equal(await recoveryVerifier.getAddress());
      expect(await recoveryProvider.commitmentVerifier()).to.be.equal(await commitmentVerifier.getAddress());
    });

    it("should not allow to re-initialize the contract", async () => {
      await expect(
        recoveryProvider.initialize(await commitmentVerifier.getAddress(), await recoveryVerifier.getAddress()),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidInitialization");
    });
  });

  describe("subscribe & unsubscribe", () => {
    it("should subscribe correctly", async () => {
      const bigIntSecret = ethers.toBigInt(ethers.toUtf8Bytes(secret));
      const commitmentHash = ethers.toBeHex(poseidon.hash([bigIntSecret]));

      const encodedCommitment = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [commitmentHash]);

      const payload = await getSubscribePayload(secret, hashCommitment);
      const tx = await recoveryProvider.connect(USER1).subscribe(payload);

      await expect(tx).to.emit(recoveryProvider, "AccountSubscribed").withArgs(USER1.address);

      expect(await recoveryProvider.getRecoveryData(USER1.address)).to.be.equal(encodedCommitment);
      expect(await recoveryProvider.getRecoveryData(USER2.address)).to.be.equal(ZeroHash);
    });

    it("should not allow to subscribe with incorrect commitment proof", async () => {
      const invalidPayload = await getSubscribePayload(secret, hashCommitment, false);

      await expect(recoveryProvider.connect(USER1).subscribe(invalidPayload)).to.be.revertedWithCustomError(
        recoveryProvider,
        "InvalidRecoveryProof",
      );

      expect(await recoveryProvider.getRecoveryData(USER1.address)).to.be.equal(ZeroHash);
    });

    it("should unsubscribe correctly", async () => {
      const bigIntSecret = ethers.toBigInt(ethers.toUtf8Bytes(secret));
      const commitmentHash = ethers.toBeHex(poseidon.hash([bigIntSecret]));

      const encodedCommitment = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [commitmentHash]);

      const payload = await getSubscribePayload(secret, hashCommitment);

      await recoveryProvider.connect(USER1).subscribe(payload);
      await recoveryProvider.connect(USER2).subscribe(payload);

      const tx = await recoveryProvider.connect(USER1).unsubscribe();

      await expect(tx).to.emit(recoveryProvider, "AccountUnsubscribed").withArgs(USER1.address);

      expect(await recoveryProvider.getRecoveryData(USER1.address)).to.be.equal(ZeroHash);
      expect(await recoveryProvider.getRecoveryData(USER2.address)).to.be.equal(encodedCommitment);
    });
  });

  describe("checkRecovery", () => {
    beforeEach(async () => {
      const payload = await getSubscribePayload(secret, hashCommitment);

      await recoveryProvider.connect(USER1).subscribe(payload);
    });

    it("should check recovery with valid proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      await recoveryProvider.connect(USER1).recover(USER2.address, getPayload(calldata.proofPoints));
    });

    it("should check recovery with invalid proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      const proofPoints = calldata.proofPoints;

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [proofPoints.a, proofPoints.b, proofPoints.a],
      );

      await expect(recoveryProvider.connect(USER1).recover(USER2.address, encodedProof)).to.be.revertedWithCustomError(
        recoveryProvider,
        "InvalidRecoveryProof",
      );
    });

    it("should check recovery with invalid hash pre-image correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes("invalid pre-image")),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      await expect(
        recoveryProvider.connect(USER1).recover(USER2.address, getPayload(calldata.proofPoints)),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidRecoveryProof");
    });

    it("should check recovery with new owner different from the one in proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      await expect(
        recoveryProvider.connect(USER1).recover(OWNER.address, getPayload(calldata.proofPoints)),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidRecoveryProof");
    });
  });
});
