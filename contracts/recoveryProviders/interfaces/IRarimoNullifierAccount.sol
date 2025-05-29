// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRarimoNullifierAccount {
    function nullifier() external view returns (uint256);
}
