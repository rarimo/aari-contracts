// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RarimoNullifierAccountMock {
    uint256 public nullifier;

    function setNullifier(uint256 nullifier_) external {
        nullifier = nullifier_;
    }
}
