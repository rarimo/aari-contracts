// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRecoveryProvider {
    /**
     * This function MUST be called from the `recoverOwnership` function on a smart account.
     */
    function checkRecovery(bytes memory proof) external view returns (bool);
}
