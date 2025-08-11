import { PackedUserOperationStruct } from "@/generated-types/ethers/contracts/account/Account";
import { getPayload, getSubscribePayload, packTwoUint128 } from "@/test/utils/utils";
import EntryPointArtifact from "@account-abstraction/contracts/artifacts/EntryPoint.json";
import { Account, AccountFactory, Account__factory, HashRecoveryProvider, IEntryPoint } from "@ethers-v6";
import { Reverter } from "@test-helpers";
import { HashCommitment, RecoveryCommitment } from "@zkit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { AddressLike, ContractTransactionResponse, ZeroAddress } from "ethers";
import { ethers, zkit } from "hardhat";

describe("Account", () => {
  const reverter = new Reverter();

  const callGasLimit = 800_000n;
  const verificationGasLimit = 800_000n;
  const maxFeePerGas = ethers.parseUnits("10", "gwei");
  const maxPriorityFeePerGas = ethers.parseUnits("5", "gwei");

  const secret = "secret recovery message";

  let OWNER: SignerWithAddress;
  let USER1: SignerWithAddress;
  let USER2: SignerWithAddress;

  let entryPoint: IEntryPoint;

  let accountAddress: AddressLike;

  let Account: Account__factory;
  let account: Account;
  let accountFactory: AccountFactory;

  let recoveryProvider: HashRecoveryProvider;
  let recoveryVerifier: any;
  let commitmentVerifier: any;

  let recoveryCommitment: RecoveryCommitment;
  let hashCommitment: HashCommitment;

  function encodeAddress(address: string): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(["address"], [address]);
  }

  async function getSignature(userOp: PackedUserOperationStruct, signer: SignerWithAddress = USER1) {
    const domain = {
      name: "ERC4337",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await entryPoint.getAddress(),
    };

    const types = {
      PackedUserOperation: [
        { name: "sender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "initCode", type: "bytes" },
        { name: "callData", type: "bytes" },
        { name: "accountGasLimits", type: "bytes32" },
        { name: "preVerificationGas", type: "uint256" },
        { name: "gasFees", type: "bytes32" },
        { name: "paymasterAndData", type: "bytes" },
      ],
    };

    return await signer.signTypedData(domain, types, userOp);
  }

  async function getUserOp(callData: string = "0x") {
    const accountGasLimits = packTwoUint128(callGasLimit, verificationGasLimit);
    const gasFees = packTwoUint128(maxFeePerGas, maxPriorityFeePerGas);

    const AccountFactory = await ethers.getContractFactory("AccountFactory");

    const initCode =
      (await ethers.provider.getCode(accountAddress)) === "0x"
        ? (await accountFactory.getAddress()) +
          AccountFactory.interface.encodeFunctionData("createAccount", [USER1.address, 0]).slice(2)
        : "0x";

    return {
      sender: accountAddress,
      nonce: await entryPoint.getNonce(accountAddress, 0),
      initCode: initCode,
      callData: callData,
      accountGasLimits: accountGasLimits,
      preVerificationGas: 50_000n,
      gasFees: gasFees,
      paymasterAndData: "0x",
      signature: "0x",
    };
  }

  async function checkUserOpError(
    userOp: PackedUserOperationStruct,
    tx: ContractTransactionResponse,
    errorSignature: string,
    errorArgsTypes: string[] = [],
    errorArgs: any[] = [],
  ) {
    const userOpHash = await entryPoint.getUserOpHash(userOp);

    const selector = ethers.id(errorSignature).slice(0, 10);

    const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(errorArgsTypes, errorArgs);

    const encodedError = ethers.concat([selector, encodedArgs]);

    await expect(tx)
      .to.emit(entryPoint, "UserOperationRevertReason")
      .withArgs(userOpHash, accountAddress, (await entryPoint.getNonce(accountAddress, 0)) - 1n, encodedError);
  }

  before(async () => {
    [OWNER, USER1, USER2] = await ethers.getSigners();

    recoveryCommitment = await zkit.getCircuit("RecoveryCommitment");
    hashCommitment = await zkit.getCircuit("HashCommitment");

    const EntryPointFactory = await ethers.getContractFactoryFromArtifact(EntryPointArtifact);
    entryPoint = (await EntryPointFactory.deploy()) as any;

    accountFactory = await ethers.deployContract("AccountFactory", [entryPoint]);

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

  beforeEach(async () => {
    accountAddress = await accountFactory.getContractAddress(USER1.address, 0);

    Account = await ethers.getContractFactory("Account");

    await entryPoint.depositTo(accountAddress, {
      value: ethers.parseEther("100"),
    });

    const userOp = await getUserOp();

    userOp.signature = await getSignature(userOp);

    await entryPoint.handleOps([userOp], USER1.address);

    account = await ethers.getContractAt("Account", accountAddress);

    const payload = await getSubscribePayload(secret, hashCommitment);

    await account.connect(USER1).addRecoveryProvider(recoveryProvider, payload);
  });

  afterEach(reverter.revert);

  describe("checkRecovery", () => {
    it("should change owner correctly", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);
      const subjectData = encodeAddress(USER2.address);

      const recoverAccessUserOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          subjectData,
          await recoveryProvider.getAddress(),
          getPayload(calldata.proofPoints),
        ]),
      );

      recoverAccessUserOp.signature = await getSignature(recoverAccessUserOp);

      const tx = await entryPoint.handleOps([recoverAccessUserOp], USER1.address);

      await expect(tx).to.emit(account, "AccessRecovered").withArgs(subjectData);

      expect(await account.owner()).to.be.equal(USER2.address);
    });

    it("should not change owner if the proof is incorrect", async () => {
      let proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      let calldata = await recoveryCommitment.generateCalldata(proof);

      const proofPoints = calldata.proofPoints;

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [proofPoints.a, proofPoints.b, proofPoints.a],
      );

      let userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          await recoveryProvider.getAddress(),
          encodedProof,
        ]),
      );

      userOp.signature = await getSignature(userOp);

      let tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "InvalidRecoveryProof()");

      expect(await account.owner()).to.be.equal(USER1.address);

      // invalid hash pre-image
      proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes("invalid pre-image")),
        newOwner: BigInt(USER2.address),
      });

      calldata = await recoveryCommitment.generateCalldata(proof);

      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          await recoveryProvider.getAddress(),
          getPayload(calldata.proofPoints),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "InvalidRecoveryProof()");

      expect(await account.owner()).to.be.equal(USER1.address);

      // invalid new owner
      proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(OWNER.address),
      });

      calldata = await recoveryCommitment.generateCalldata(proof);

      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          await recoveryProvider.getAddress(),
          getPayload(calldata.proofPoints),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "InvalidRecoveryProof()");

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the new owner is zero address", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(ZeroAddress),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      const userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(ZeroAddress),
          await recoveryProvider.getAddress(),
          getPayload(calldata.proofPoints),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      const tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "ZeroAddress()");

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the provider is not registered", async () => {
      const proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      const calldata = await recoveryCommitment.generateCalldata(proof);

      const userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          accountAddress,
          getPayload(calldata.proofPoints),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      const tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "ProviderNotRegistered(address)", ["address"], [accountAddress]);

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the proof is re-used", async () => {
      let proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(OWNER.address),
      });

      let calldata = await recoveryCommitment.generateCalldata(proof);

      let proofPayload = getPayload(calldata.proofPoints);

      let userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(OWNER.address),
          await recoveryProvider.getAddress(),
          proofPayload,
        ]),
      );

      userOp.signature = await getSignature(userOp);

      await entryPoint.handleOps([userOp], USER1.address);

      expect(await account.owner()).to.be.equal(OWNER.address);

      // re-using the same proof
      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          await recoveryProvider.getAddress(),
          proofPayload,
        ]),
      );

      userOp.signature = await getSignature(userOp, OWNER);

      const tx = await entryPoint.handleOps([userOp], OWNER.address);

      await checkUserOpError(userOp, tx, "ProofAlreadyUsed()");

      expect(await account.owner()).to.be.equal(OWNER.address);

      // generating a new proof
      proof = await recoveryCommitment.generateProof({
        secret: ethers.toBigInt(ethers.toUtf8Bytes(secret)),
        newOwner: BigInt(USER2.address),
      });

      calldata = await recoveryCommitment.generateCalldata(proof);

      proofPayload = getPayload(calldata.proofPoints);

      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverAccess", [
          encodeAddress(USER2.address),
          await recoveryProvider.getAddress(),
          proofPayload,
        ]),
      );

      userOp.signature = await getSignature(userOp, OWNER);

      await entryPoint.handleOps([userOp], OWNER.address);

      expect(await account.owner()).to.be.equal(USER2.address);
    });
  });

  describe("recovery provider management", () => {
    it("should add and remove recovery providers correctly", async () => {
      await account.connect(USER1).removeRecoveryProvider(await recoveryProvider.getAddress());

      const payload = await getSubscribePayload(secret, hashCommitment);

      let tx = await account.connect(USER1).addRecoveryProvider(await recoveryProvider.getAddress(), payload);

      await expect(tx)
        .to.emit(account, "RecoveryProviderAdded")
        .withArgs(await recoveryProvider.getAddress());

      expect(await account.recoveryProviderAdded(await recoveryProvider.getAddress())).to.be.true;

      tx = await account.connect(USER1).removeRecoveryProvider(await recoveryProvider.getAddress());

      await expect(tx)
        .to.emit(account, "RecoveryProviderRemoved")
        .withArgs(await recoveryProvider.getAddress());

      expect(await account.recoveryProviderAdded(await recoveryProvider.getAddress())).to.be.false;
    });

    it("should not allow to add and remove recovery providers if the caller is not the owner", async () => {
      await expect(account.connect(USER2).addRecoveryProvider(accountAddress, "0x")).to.be.rejectedWith("only owner");
      await expect(account.connect(USER2).removeRecoveryProvider(accountAddress)).to.be.rejectedWith("only owner");
    });

    it("should not allow to add zero address recovery provider", async () => {
      await expect(account.connect(USER1).addRecoveryProvider(ZeroAddress, "0x")).to.be.revertedWithCustomError(
        account,
        "ZeroAddress",
      );
    });

    it("should not allow to add recovery provider that is already registered", async () => {
      await expect(account.connect(USER1).addRecoveryProvider(await recoveryProvider.getAddress(), "0x"))
        .to.be.revertedWithCustomError(account, "ProviderAlreadyAdded")
        .withArgs(await recoveryProvider.getAddress());
    });

    it("should not allow to remove recovery provider that is not registered", async () => {
      await expect(account.connect(USER1).removeRecoveryProvider(accountAddress))
        .to.be.revertedWithCustomError(account, "ProviderNotRegistered")
        .withArgs(accountAddress);
    });
  });
});
