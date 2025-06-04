// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {Groth16VerifierHelper} from "@solarity/solidity-lib/libs/zkp/Groth16VerifierHelper.sol";

import {PoseidonT2} from "poseidon-solidity/PoseidonT2.sol";

import {IRecoveryProvider} from "../interfaces/IRecoveryProvider.sol";

contract HashRecoveryProvider is IRecoveryProvider, OwnableUpgradeable, UUPSUpgradeable {
    using Groth16VerifierHelper for address;

    address public recoveryVerifier;
    address public commitmentVerifier;

    mapping(address => bytes32) internal _accountsToCommitments;

    mapping(bytes32 => bool) internal _proofHashesUsed;

    error ProofAlreadyUsed();
    error InvalidRecoveryProof();

    function __HashRecoveryProvider_init(
        address recoveryVerifier_,
        address commitmentVerifier_
    ) external initializer {
        __Ownable_init(_msgSender());

        recoveryVerifier = recoveryVerifier_;
        commitmentVerifier = commitmentVerifier_;
    }

    function subscribe(bytes memory recoveryData_) external {
        (bytes32 commitmentHash_, Groth16VerifierHelper.ProofPoints memory proofPoints_) = abi
            .decode(recoveryData_, (bytes32, Groth16VerifierHelper.ProofPoints));

        uint256[] memory publicSignals_ = new uint256[](1);
        publicSignals_[0] = uint256(commitmentHash_);

        bool isProofValid_ = commitmentVerifier.verifyProof(proofPoints_, publicSignals_);

        if (!isProofValid_) revert InvalidRecoveryProof();

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

        uint256[] memory publicSignals_ = new uint256[](2);

        publicSignals_[0] = uint256(_accountsToCommitments[msg.sender]);
        publicSignals_[1] = PoseidonT2.hash([uint256(uint160(newOwner_))]);

        bool isProofValid_ = recoveryVerifier.verifyProof(proofPoints_, publicSignals_);

        if (!isProofValid_) revert InvalidRecoveryProof();
    }

    function getRecoveryData(address account_) external view returns (bytes memory) {
        return abi.encode(_accountsToCommitments[account_]);
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
