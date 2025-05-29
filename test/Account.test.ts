import { PackedUserOperationStruct } from "@/generated-types/ethers/contracts/Account";
import { getPayload, getQueryInputs, packTwoUint128 } from "@/test/utils/utils";
import EntryPointArtifact from "@account-abstraction/contracts/artifacts/EntryPoint.json";
import {
  Account,
  AccountFactory,
  Account__factory,
  IEntryPoint,
  RarimoNullifierRecoveryProvider,
  RegistrationSMTMock,
} from "@ethers-v6";
import { Reverter } from "@test-helpers";
import { ProofqueryIdentityGroth16, queryIdentity } from "@zkit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { expect } from "chai";
import { AddressLike, ContractTransactionResponse, ZeroAddress } from "ethers";
import { ethers, zkit } from "hardhat";

describe("Account", () => {
  const reverter = new Reverter();

  const callGasLimit = 800_000n;
  const verificationGasLimit = 800_000n;
  const maxFeePerGas = ethers.parseUnits("10", "gwei");
  const maxPriorityFeePerGas = ethers.parseUnits("5", "gwei");

  let OWNER: SignerWithAddress;
  let USER1: SignerWithAddress;
  let USER2: SignerWithAddress;

  let entryPoint: IEntryPoint;

  let accountAddress: AddressLike;

  let Account: Account__factory;
  let account: Account;
  let accountFactory: AccountFactory;

  let recoveryProvider: RarimoNullifierRecoveryProvider;
  let verifier: any;
  let registrationSMT: RegistrationSMTMock;

  let query: queryIdentity;

  let proof: ProofqueryIdentityGroth16;
  let registrationRoot: string;
  let nullifier: bigint;

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
    await time.increaseTo(1733738711);

    [OWNER, USER1, USER2] = await ethers.getSigners();

    query = await zkit.getCircuit("queryIdentity");

    const EntryPointFactory = await ethers.getContractFactoryFromArtifact(EntryPointArtifact);
    entryPoint = await EntryPointFactory.deploy();

    accountFactory = await ethers.deployContract("AccountFactory", [entryPoint]);

    recoveryProvider = await ethers.deployContract("RarimoNullifierRecoveryProvider", {
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
    accountAddress = await accountFactory.getContractAddress(USER1.address, 0);

    const eventId = await recoveryProvider.getEventId(accountAddress);
    const eventData = await recoveryProvider.getEventData();

    const inputs = getQueryInputs(eventId, eventData);

    proof = await query.generateProof(inputs);

    registrationRoot = ethers.toBeHex(proof.publicSignals.idStateRoot, 32);

    nullifier = proof.publicSignals.nullifier;

    await registrationSMT.setValidRoot(registrationRoot);

    Account = await ethers.getContractFactory("Account");

    await entryPoint.depositTo(accountAddress, {
      value: ethers.parseEther("100"),
    });

    const userOp = await getUserOp();

    userOp.signature = await getSignature(userOp);

    await entryPoint.handleOps([userOp], USER1.address);

    account = await ethers.getContractAt("Account", accountAddress);

    await recoveryProvider.connect(OWNER).setNullifier(accountAddress, nullifier);

    await account.connect(USER1).addRecoveryProvider(recoveryProvider, "0x");
  });

  afterEach(reverter.revert);

  describe("checkRecovery", () => {
    it("should change owner correctly", async () => {
      const recoverOwnershipUserOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          USER2.address,
          await recoveryProvider.getAddress(),
          getPayload(accountAddress, proof, registrationRoot),
        ]),
      );

      recoverOwnershipUserOp.signature = await getSignature(recoverOwnershipUserOp);

      const tx = await entryPoint.handleOps([recoverOwnershipUserOp], USER1.address);

      await expect(tx).to.emit(account, "OwnershipRecovered").withArgs(USER1.address, USER2.address);

      expect(await account.owner()).to.be.equal(USER2.address);
    });

    it("should not change owner if the proof is incorrect", async () => {
      const eventId = await recoveryProvider.getEventId(accountAddress);
      const eventData = await recoveryProvider.getEventData();

      const inputs = getQueryInputs(eventId, eventData);

      proof = await query.generateProof(inputs, { "main.selector": 50n });

      const userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          USER2.address,
          await recoveryProvider.getAddress(),
          getPayload(accountAddress, proof, registrationRoot),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      const tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "InvalidRecoveryProof()");

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the new owner is zero address", async () => {
      const userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          ZeroAddress,
          await recoveryProvider.getAddress(),
          getPayload(accountAddress, proof, registrationRoot),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      const tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "ZeroAddress()");

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the provider is not registered", async () => {
      const userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          USER2.address,
          accountAddress,
          getPayload(accountAddress, proof, registrationRoot),
        ]),
      );

      userOp.signature = await getSignature(userOp);

      const tx = await entryPoint.handleOps([userOp], USER1.address);

      await checkUserOpError(userOp, tx, "ProviderNotRegistered(address)", ["address"], [accountAddress]);

      expect(await account.owner()).to.be.equal(USER1.address);
    });

    it("should not change owner if the proof is re-used", async () => {
      let proofPayload = getPayload(accountAddress, proof, registrationRoot);

      let userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          OWNER.address,
          await recoveryProvider.getAddress(),
          proofPayload,
        ]),
      );

      userOp.signature = await getSignature(userOp);

      await entryPoint.handleOps([userOp], USER1.address);

      expect(await account.owner()).to.be.equal(OWNER.address);

      // re-using the same proof
      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          USER2.address,
          await recoveryProvider.getAddress(),
          proofPayload,
        ]),
      );

      userOp.signature = await getSignature(userOp, OWNER);

      const tx = await entryPoint.handleOps([userOp], OWNER.address);

      await checkUserOpError(userOp, tx, "ProofAlreadyUsed()");

      expect(await account.owner()).to.be.equal(OWNER.address);

      // generating a new proof
      const eventId = await recoveryProvider.getEventId(accountAddress);
      const eventData = await recoveryProvider.getEventData();

      const inputs = getQueryInputs(eventId, eventData);

      proof = await query.generateProof(inputs);

      proofPayload = getPayload(accountAddress, proof, registrationRoot);

      userOp = await getUserOp(
        Account.interface.encodeFunctionData("recoverOwnership", [
          USER2.address,
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
      let tx = await account.connect(USER1).addRecoveryProvider(await accountFactory.getAddress(), "0x");

      await expect(tx)
        .to.emit(account, "RecoveryProviderAdded")
        .withArgs(await accountFactory.getAddress());

      expect(await account.recoveryProviderExists(await accountFactory.getAddress())).to.be.true;
      expect(await account.recoveryProviderExists(await recoveryProvider.getAddress())).to.be.true;

      tx = await account.connect(USER1).removeRecoveryProvider(await accountFactory.getAddress(), "0x");

      await expect(tx)
        .to.emit(account, "RecoveryProviderRemoved")
        .withArgs(await accountFactory.getAddress());

      expect(await account.recoveryProviderExists(await accountFactory.getAddress())).to.be.false;
      expect(await account.recoveryProviderExists(await recoveryProvider.getAddress())).to.be.true;
    });

    it("should not allow to add and remove recovery providers if the caller is not the owner", async () => {
      await expect(account.connect(USER2).addRecoveryProvider(accountAddress, "0x")).to.be.rejectedWith("only owner");
      await expect(account.connect(USER2).removeRecoveryProvider(accountAddress, "0x")).to.be.rejectedWith(
        "only owner",
      );
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
      await expect(account.connect(USER1).removeRecoveryProvider(accountAddress, "0x"))
        .to.be.revertedWithCustomError(account, "ProviderNotRegistered")
        .withArgs(accountAddress);
    });
  });
});
