// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

// solhint-disable

import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

library PoseidonUnit3L {
    function poseidon(uint256[3] calldata inputs_) public pure returns (uint256) {
        return PoseidonT4.hash([inputs_[0], inputs_[1], inputs_[2]]);
    }
}
