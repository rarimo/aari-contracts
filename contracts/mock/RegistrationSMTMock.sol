// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoseidonSMT} from "@rarimo/passport-contracts/interfaces/state/IPoseidonSMT.sol";

/**
 * @dev A minimal mock for IPoseidonSMT.
 */
contract RegistrationSMTMock is IPoseidonSMT {
    bytes32 public validRoot;

    function isRootValid(bytes32 root) external view returns (bool) {
        return root == validRoot;
    }

    function setValidRoot(bytes32 root) external {
        validRoot = root;
    }

    function ROOT_VALIDITY() external pure returns (uint256) {
        return 86400;
    }
}
