# ERC-7947 Reference Implementation

Introduce a universal account abstraction recovery mechanism `recoverOwnership(newOwner, provider, proof)` along with recovery provider management functions for smart accounts to securely update their owner.

Link to [ERC-7947](https://ethereum-magicians.org/t/eip-7947-account-abstraction-recovery-interface-aari/24080).

> [!WARNING]
> Should not be used in production. This implementation serves only as an example.
 
## Overview

This repository hosts a set of smart contracts and circuits that showcase a minimal ERC-7947 account abstraction recovery mechanics.

- The account used is an ERC-4337 [SimpleAccount](https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/accounts/SimpleAccount.sol) by eth-infinitism.
- The recovery provider is a bare minimal "hash preimage" verifier via a Groth16 ZK proof.
- The circuits are written in Circom leveraging [hardhat-zkit](https://github.com/dl-solarity/hardhat-zkit) plugin.

## Usage

You will find Solidity smart contracts implementation in the `contracts` directory and Circom circuits in the `circuits` directory.

Install all the required dependencies:

```bash
npm install
```

To run the all the tests, execute:

```bash
npm run test-all
```

## Disclaimer

GLHF!
