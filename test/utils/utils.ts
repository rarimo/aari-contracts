import { Poseidon, babyJub } from "@iden3/js-crypto";
import { PrivatequeryIdentityGroth16, ProofqueryIdentityGroth16 } from "@zkit";

import { Groth16Proof } from "@solarity/zkit";

import { AddressLike } from "ethers";
import { ethers } from "hardhat";

export const CURRENT_DATE = encodeDate("241209");

const CHUNK_SIZE = 186;
const SELECTOR = 0x1001;
const ZERO_DATE = BigInt(ethers.toBeHex("0x303030303030"));

type DG1Fields = {
  citizenship: string; // 3 chars
  name: string; // 31 chars
  nameResidual: string; // 8 chars
  documentNumber: string; // 9 chars
  nationality: string; // 3 chars
  birthDate: string; // 6 chars (i.g., YYMMDD)
  sex: string; // 1 char ('M'/'F'/'O')
  expirationDate: string; // 6 chars (i.g., YYMMDD)
};

const dg1 = createDG1Data({
  citizenship: "ABW",
  name: "Somebody",
  nameResidual: "",
  documentNumber: "",
  expirationDate: "261210",
  birthDate: "040319",
  sex: "M",
  nationality: "ABW",
});

export function getQueryInputs(
  eventId: bigint,
  eventData: bigint,
  skIdentity: bigint = 123n,
  dg1Data = dg1,
): PrivatequeryIdentityGroth16 {
  const pkPassportHash = 0n;

  const timestamp = 0n;
  const identityCounter = 0n;

  const dg1Commitment = getDG1Commitment(dg1Data, skIdentity);

  const treePosition = getTreePosition(skIdentity, pkPassportHash);
  const treeValue = getTreeValue(dg1Commitment, identityCounter, timestamp);

  return {
    eventID: eventId,
    eventData,
    idStateRoot: Poseidon.hash([treePosition, treeValue, 1n]),
    selector: SELECTOR,
    currentDate: CURRENT_DATE,
    timestampLowerbound: 0n,
    timestampUpperbound: 0n,
    identityCounterLowerbound: 0n,
    identityCounterUpperbound: 0n,
    birthDateLowerbound: ZERO_DATE,
    birthDateUpperbound: ZERO_DATE,
    expirationDateLowerbound: CURRENT_DATE,
    expirationDateUpperbound: ZERO_DATE,
    citizenshipMask: 0n,
    skIdentity,
    pkPassportHash,
    dg1: dg1Data,
    idStateSiblings: Array(80).fill(0n),
    timestamp,
    identityCounter,
  };
}

export function getPayload(address: AddressLike, proof: ProofqueryIdentityGroth16, registrationRoot: string) {
  const formattedProof = formatProof(proof.proof);
  const tupleProof = [formattedProof.a, formattedProof.b, formattedProof.c];

  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "bytes", "tuple(uint256[2], uint256[2][2], uint256[2])"],
    [registrationRoot, CURRENT_DATE, ethers.AbiCoder.defaultAbiCoder().encode(["address"], [address]), tupleProof],
  );
}

export function packTwoUint128(a, b) {
  const maxUint128 = (1n << 128n) - 1n;

  if (a > maxUint128 || b > maxUint128) {
    throw new Error("Value exceeds uint128");
  }

  const packed = (a << 128n) + b;

  return "0x" + packed.toString(16).padStart(64, "0");
}

function getDG1Commitment(dg1: bigint[], skIdentity: bigint): bigint {
  const chunks: bigint[] = Array(4).fill(0);

  for (let i = 0; i < 4; i++) {
    chunks[i] = BigInt(
      "0b" +
        dg1
          .slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          .reverse()
          .join(""),
    );
  }

  return Poseidon.hash([...chunks, Poseidon.hash([skIdentity])]);
}

function getPublicFromPrivateKey(privateKey: bigint) {
  return babyJub.mulPointEScalar(babyJub.Base8, privateKey);
}

function getTreePosition(skIdentity: bigint, pkPassHash: bigint) {
  const babyPbk = getPublicFromPrivateKey(skIdentity);

  return Poseidon.hash([pkPassHash, Poseidon.hash([babyPbk[0], babyPbk[1]])]);
}

function getTreeValue(dgCommit: bigint, identityCounter: bigint, timestamp: bigint) {
  return Poseidon.hash([dgCommit, identityCounter, timestamp]);
}

function encodeDate(dateStr?: string): bigint {
  // If no date is given, return the zero-date encoding:
  // "0x303030303030" corresponds to the ASCII string "000000".
  if (!dateStr) {
    return BigInt("0x303030303030");
  }

  // Ensure the provided date string is 6 characters long (e.g. "YYMMDD").
  if (dateStr.length !== 6) {
    throw new Error("Date string must be exactly 6 characters long (e.g., 'YYMMDD' or '000000').");
  }

  // Convert each character to its ASCII hex representation.
  let hexValue = "0x";
  for (let i = 0; i < dateStr.length; i++) {
    const charCode = dateStr.charCodeAt(i);
    hexValue += charCode.toString(16).padStart(2, "0");
  }

  return BigInt(hexValue);
}

function createDG1Data(fields: DG1Fields): bigint[] {
  const dg1 = Array<bigint>(744).fill(0n);

  // Ensure lengths
  fields.citizenship = ensureLength(fields.citizenship, 3, "0");
  fields.name = ensureLength(fields.name, 31, " ");
  fields.nameResidual = ensureLength(fields.nameResidual, 8, " ");
  fields.documentNumber = ensureLength(fields.documentNumber, 9, "0");
  fields.nationality = ensureLength(fields.nationality, 3, "0");
  fields.birthDate = ensureLength(fields.birthDate, 6, "0");
  fields.sex = ensureLength(fields.sex, 1, "X");
  fields.expirationDate = ensureLength(fields.expirationDate, 6, "0");

  // Offsets and sizes in bits
  const CITIZENSHIP_FIELD_SHIFT = 56;

  const NAME_FIELD_SHIFT = 80;
  const NAME_FIELD_SIZE = 248; // 31 * 8

  const NAME_FIELD_RESIDUAL_SHIFT = NAME_FIELD_SHIFT + NAME_FIELD_SIZE; // 80 + 248 = 328

  const DOCUMENT_NUMBER_SHIFT = 392;

  const NATIONALITY_FIELD_SHIFT = 472;

  const BIRTH_DATE_SHIFT = 496;

  const SEX_POSITION = 69; // As given
  const SEX_FIELD_SHIFT = SEX_POSITION * 8; // 552

  const EXPIRATION_DATE_SHIFT = 560;

  // Write fields
  writeASCIIString(dg1, fields.citizenship, CITIZENSHIP_FIELD_SHIFT);
  writeASCIIString(dg1, fields.name, NAME_FIELD_SHIFT);
  writeASCIIString(dg1, fields.nameResidual, NAME_FIELD_RESIDUAL_SHIFT);
  writeASCIIString(dg1, fields.documentNumber, DOCUMENT_NUMBER_SHIFT);
  writeASCIIString(dg1, fields.nationality, NATIONALITY_FIELD_SHIFT);
  writeASCIIString(dg1, fields.birthDate, BIRTH_DATE_SHIFT);
  writeASCIIString(dg1, fields.sex, SEX_FIELD_SHIFT);
  writeASCIIString(dg1, fields.expirationDate, EXPIRATION_DATE_SHIFT);

  return dg1;
}

function ensureLength(str: string, requiredLength: number, padChar = "\0") {
  if (str.length === requiredLength) return str;
  if (str.length < requiredLength) {
    return str.padEnd(requiredLength, padChar);
  }
  throw new Error(`String too long. Required length: ${requiredLength}, got: ${str.length}`);
}

function writeASCIIString(dg1: bigint[], str: string, offset: number) {
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    // Write 8 bits, MSB first
    for (let b = 0; b < 8; b++) {
      // Extract bit (7-b)th bit from charCode
      const bit = (charCode >> (7 - b)) & 1;
      dg1[offset + i * 8 + b] = BigInt(bit);
    }
  }
}

function formatProof(data: Groth16Proof) {
  return {
    a: [data.pi_a[0], data.pi_a[1]],
    b: [
      [data.pi_b[0][1], data.pi_b[0][0]],
      [data.pi_b[1][1], data.pi_b[1][0]],
    ],
    c: [data.pi_c[0], data.pi_c[1]],
  };
}
