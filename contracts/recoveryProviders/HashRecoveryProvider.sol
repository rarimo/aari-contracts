// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {TypeCaster} from "@solarity/solidity-lib/libs/utils/TypeCaster.sol";
import {Groth16VerifierHelper} from "@solarity/solidity-lib/libs/zkp/Groth16VerifierHelper.sol";

import {IRecoveryProvider} from "../interfaces/IRecoveryProvider.sol";

contract HashRecoveryProvider is IRecoveryProvider, OwnableUpgradeable, UUPSUpgradeable {
    using TypeCaster for *;
    using Groth16VerifierHelper for address;

    address public verifier;

    mapping(address => bytes32) internal _accountsToCommitments;

    mapping(bytes32 => bool) internal _proofHashesUsed;

    error ProofAlreadyUsed();
    error InvalidRecoveryProof();

    function __HashRecoveryProvider_init(address verifier_) external initializer {
        __Ownable_init(_msgSender());

        verifier = verifier_;
    }

    function subscribe(bytes memory recoveryData_) external {
        bytes32 commitmentHash_ = abi.decode(recoveryData_, (bytes32));

        _accountsToCommitments[msg.sender] = commitmentHash_;

        emit AccountSubscribed(msg.sender);
    }

    function unsubscribe() external {
        delete _accountsToCommitments[msg.sender];

        emit AccountUnsubscribed(msg.sender);
    }

    function recover(address newOwner_, bytes memory proof_) external {
        bytes32 proofHash_ = keccak256(proof_);

        if (_proofHashesUsed[proofHash_]) revert ProofAlreadyUsed();

        _proofHashesUsed[proofHash_] = true;

        Groth16VerifierHelper.ProofPoints memory proofPoints_ = abi.decode(
            proof_,
            (Groth16VerifierHelper.ProofPoints)
        );

        uint256[2] memory publicSignals_ = [
            uint256(uint160(newOwner_)),
            uint256(_accountsToCommitments[msg.sender])
        ];

        bool isProofValid_ = verifier.verifyProof(proofPoints_, publicSignals_.asDynamic());

        if (!isProofValid_) revert InvalidRecoveryProof();
    }

    function getCommitment(address account_) external view returns (bytes32) {
        return _accountsToCommitments[account_];
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
