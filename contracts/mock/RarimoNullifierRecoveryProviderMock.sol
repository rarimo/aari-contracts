// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RarimoNullifierRecoveryProvider} from "../recoveryProviders/RarimoNullifierRecoveryProvider.sol";

contract RarimoNullifierRecoveryProviderMock is RarimoNullifierRecoveryProvider {
    function getNullifier(address account_) external view returns (uint256) {
        return _accountsToNullifiers[account_];
    }
}
