// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {SimpleAccount} from "@account-abstraction/contracts/accounts/SimpleAccount.sol";

import {BaseAccountRecovery} from "./BaseAccountRecovery.sol";

contract Account is SimpleAccount, BaseAccountRecovery {
    uint256 public nullifier;

    constructor(IEntryPoint entryPoint_) SimpleAccount(entryPoint_) {}

    function initialize(address owner_) public override initializer {
        super.initialize(owner_);
    }

    function setNullifier(uint256 nullifier_) external onlyOwner {
        nullifier = nullifier_;
    }

    function addRecoveryProvider(address provider_, bytes memory) external onlyOwner {
        _addRecoveryProvider(provider_);
    }

    function removeRecoveryProvider(address provider_, bytes memory) external onlyOwner {
        _removeRecoveryProvider(provider_);
    }

    function recoverOwnership(
        address newOwner_,
        address provider_,
        bytes memory proof_
    ) external returns (bytes4) {
        _validateRecovery(newOwner_, provider_, proof_);

        address oldOwner_ = owner;
        owner = newOwner_;

        emit OwnershipRecovered(oldOwner_, newOwner_);

        return MAGIC;
    }
}
