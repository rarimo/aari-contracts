// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ISenderCreator} from "@account-abstraction/contracts/interfaces/ISenderCreator.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

import {Account} from "./Account.sol";

contract AccountFactory {
    Account public immutable accountImplementation;
    ISenderCreator public immutable senderCreator;

    constructor(IEntryPoint entryPoint_) {
        accountImplementation = new Account(entryPoint_);
        senderCreator = entryPoint_.senderCreator();
    }

    function createAccount(address owner_, uint256 salt_) public returns (Account account_) {
        require(
            msg.sender == address(senderCreator),
            "AccountFactory: only callable from SenderCreator"
        );

        address addr_ = getContractAddress(owner_, salt_);

        if (addr_.code.length > 0) {
            return Account(payable(addr_));
        }

        account_ = Account(
            payable(
                new ERC1967Proxy{salt: bytes32(salt_)}(
                    address(accountImplementation),
                    abi.encodeCall(Account.initialize, (owner_))
                )
            )
        );
    }

    function getContractAddress(address owner_, uint256 salt_) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(salt_),
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            address(accountImplementation),
                            abi.encodeCall(Account.initialize, (owner_))
                        )
                    )
                )
            );
    }
}
