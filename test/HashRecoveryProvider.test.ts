import { bigIntToBytes32, formatProof, getPayload, stringToBigInt } from "@/test/utils/utils";
import { HashRecoveryProvider } from "@ethers-v6";
import { poseidon } from "@iden3/js-crypto";
import { Reverter } from "@test-helpers";
import { RecoveryCommitment } from "@zkit";

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
  let verifier: any;

  let recoveryCommitment: RecoveryCommitment;

  before(async () => {
    [OWNER, USER1, USER2] = await ethers.getSigners();

    recoveryCommitment = await zkit.getCircuit("RecoveryCommitment");

    recoveryProvider = await ethers.deployContract("HashRecoveryProvider");

    verifier = await ethers.deployContract("RecoveryCommitmentGroth16Verifier");

    await recoveryProvider.__HashRecoveryProvider_init(await verifier.getAddress());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initialize", () => {
    it("should initialize the contract correctly", async () => {
      expect(await recoveryProvider.owner()).to.be.equal(OWNER);
      expect(await recoveryProvider.verifier()).to.be.equal(await verifier.getAddress());
    });

    it("should not allow to re-initialize the contract", async () => {
      await expect(
        recoveryProvider.__HashRecoveryProvider_init(await verifier.getAddress()),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidInitialization");
    });
  });

  describe("subscribe & unsubscribe", () => {
    it("should subscribe corretly", async () => {
      const commitmentHash = ethers.keccak256(ethers.toUtf8Bytes(secret));

      const encodedCommitment = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [commitmentHash]);

      const tx = await recoveryProvider.connect(USER1).subscribe(encodedCommitment);

      await expect(tx).to.emit(recoveryProvider, "AccountSubscribed").withArgs(USER1.address);

      expect(await recoveryProvider.getCommitment(USER1.address)).to.be.equal(encodedCommitment);
      expect(await recoveryProvider.getCommitment(USER2.address)).to.be.equal(ZeroHash);
    });

    it("should unsubscribe correctly", async () => {
      const commitmentHash = ethers.keccak256(ethers.toUtf8Bytes(secret));

      const encodedCommitment = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [commitmentHash]);

      await recoveryProvider.connect(USER1).subscribe(encodedCommitment);
      await recoveryProvider.connect(USER2).subscribe(encodedCommitment);

      const tx = await recoveryProvider.connect(USER1).unsubscribe();

      await expect(tx).to.emit(recoveryProvider, "AccountUnsubscribed").withArgs(USER1.address);

      expect(await recoveryProvider.getCommitment(USER1.address)).to.be.equal(ZeroHash);
      expect(await recoveryProvider.getCommitment(USER2.address)).to.be.equal(encodedCommitment);
    });
  });

  describe("checkRecovery", () => {
    beforeEach(async () => {
      const commitmentHash = bigIntToBytes32(poseidon.hash([BigInt(1), stringToBigInt(secret)]));

      const encodedCommitment = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [commitmentHash]);

      await recoveryProvider.connect(USER1).subscribe(encodedCommitment);
    });

    it("should check recovery with valid proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: stringToBigInt(secret),
        newOwner: BigInt(USER2.address),
      });

      await recoveryProvider.connect(USER1).recover(USER2.address, getPayload(proof));
    });

    it("should check recovery with invalid proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: stringToBigInt(secret),
        newOwner: BigInt(USER2.address),
      });

      const formattedProof = formatProof(proof.proof);

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [formattedProof.a, formattedProof.b, formattedProof.a],
      );

      await expect(recoveryProvider.connect(USER1).recover(USER2.address, encodedProof)).to.be.revertedWithCustomError(
        recoveryProvider,
        "InvalidRecoveryProof",
      );
    });

    it("should check recovery with invalid hash pre-image correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: stringToBigInt("invalid pre-image"),
        newOwner: BigInt(USER2.address),
      });

      await expect(
        recoveryProvider.connect(USER1).recover(USER2.address, getPayload(proof)),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidRecoveryProof");
    });

    it("should check recovery with new owner different from the one in proof correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: stringToBigInt(secret),
        newOwner: BigInt(USER2.address),
      });

      await expect(
        recoveryProvider.connect(USER1).recover(OWNER.address, getPayload(proof)),
      ).to.be.revertedWithCustomError(recoveryProvider, "InvalidRecoveryProof");
    });
  });
});
