// SPDX-License-Identifier: CC0-1.0
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

    function initialize(
        address recoveryVerifier_,
        address commitmentVerifier_
    ) external initializer {
        __Ownable_init(msg.sender);

        recoveryVerifier = recoveryVerifier_;
        commitmentVerifier = commitmentVerifier_;
    }

    /**
     * @notice A function that subscribes an account to the provider. We decided to include
     * a ZK proof in the `recoveryData` for an additional sanity check that the `commitmentHash`
     * has been generated correctly. This check is optional and can be skipped.
     */
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

    /**
     * @notice A function that unsubscribes an account from the provider by deleting all the
     * related account data.
     */
    function unsubscribe() external {
        delete _accountsToCommitments[msg.sender];

        emit AccountUnsubscribed(msg.sender);
    }

    /**
     * @notice A function that checks an account recoverability via a ZK proof.
     * Both the commitment and the hash of the new owner are set as public outputs
     * to prevent frontrunning. The hash of the `proof` is used as nonce which may not
     * be 100% secure for a production application.
     */
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
