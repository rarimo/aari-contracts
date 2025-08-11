// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {SimpleAccount} from "@account-abstraction/contracts/accounts/SimpleAccount.sol";

import {AAccountRecovery} from "@solarity/solidity-lib/account-abstraction/AAccountRecovery.sol";

contract Account is SimpleAccount, AAccountRecovery {
    constructor(IEntryPoint entryPoint_) SimpleAccount(entryPoint_) {}

    function initialize(address owner_) public override initializer {
        super.initialize(owner_);
    }

    /**
     * @inheritdoc AAccountRecovery
     */
    function addRecoveryProvider(
        address provider_,
        bytes memory recoveryData_
    ) external payable override onlyOwner {
        _addRecoveryProvider(provider_, recoveryData_);
    }

    /**
     * @inheritdoc AAccountRecovery
     */
    function removeRecoveryProvider(address provider_) external payable override onlyOwner {
        _removeRecoveryProvider(provider_);
    }

    /**
     * @inheritdoc AAccountRecovery
     */
    function recoverAccess(
        bytes memory subject_,
        address provider_,
        bytes memory proof_
    ) external override returns (bool) {
        address newOwner_ = abi.decode(subject_, (address));
        require(newOwner_ != address(0), ZeroAddress());

        _validateRecovery(subject_, provider_, proof_);

        owner = newOwner_;

        emit AccessRecovered(subject_);

        return true;
    }
}
