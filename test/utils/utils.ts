import { ProofRecoveryCommitmentGroth16 } from "@zkit";

import { Groth16Proof } from "@solarity/zkit";

import { ethers } from "ethers";

export function bigIntToBytes32(bigintValue: bigint): string {
  return "0x" + bigintValue.toString(16).padStart(64, "0");
}

export function stringToBigInt(stringValue: string): bigint {
  return BigInt("0x" + Buffer.from(stringValue, "utf8").toString("hex"));
}

export function formatProof(data: Groth16Proof) {
  return {
    a: [data.pi_a[0], data.pi_a[1]],
    b: [
      [data.pi_b[0][1], data.pi_b[0][0]],
      [data.pi_b[1][1], data.pi_b[1][0]],
    ],
    c: [data.pi_c[0], data.pi_c[1]],
  };
}

export function packTwoUint128(a, b) {
  const maxUint128 = (1n << 128n) - 1n;

  if (a > maxUint128 || b > maxUint128) {
    throw new Error("Value exceeds uint128");
  }

  const packed = (a << 128n) + b;

  return "0x" + packed.toString(16).padStart(64, "0");
}

export function getPayload(proof: ProofRecoveryCommitmentGroth16) {
  const formattedProof = formatProof(proof.proof);

  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256[2]", "uint256[2][2]", "uint256[2]"],
    [formattedProof.a, formattedProof.b, formattedProof.c],
  );
}
