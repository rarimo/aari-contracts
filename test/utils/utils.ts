import { poseidon } from "@iden3/js-crypto";
import { HashCommitment } from "@zkit";

import { Groth16ProofPoints } from "@solarity/zkit";

import { ethers } from "ethers";

export function packTwoUint128(a, b) {
  const maxUint128 = (1n << 128n) - 1n;

  if (a > maxUint128 || b > maxUint128) {
    throw new Error("Value exceeds uint128");
  }

  const packed = (a << 128n) + b;

  return "0x" + packed.toString(16).padStart(64, "0");
}

export async function getSubscribePayload(secret: string, circuit: HashCommitment, isValid: boolean = true) {
  const bigIntSecret = ethers.toBigInt(ethers.toUtf8Bytes(secret));

  const commitmentHash = ethers.toBeHex(
    poseidon.hash([isValid ? bigIntSecret : ethers.toBigInt(ethers.toUtf8Bytes("invalid"))]),
  );

  const proof = await circuit.generateProof({
    secret: bigIntSecret,
  });

  const calldata = await circuit.generateCalldata(proof);

  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "tuple(uint256[2] a, uint256[2][2] b, uint256[2] c)"],
    [commitmentHash, calldata.proofPoints],
  );
}

export function getPayload(proofPoints: Groth16ProofPoints) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256[2] a, uint256[2][2] b, uint256[2] c)"],
    [proofPoints],
  );
}
