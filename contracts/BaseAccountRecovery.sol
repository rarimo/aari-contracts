// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccountRecovery} from "./interfaces/IAccountRecovery.sol";
import {IRecoveryProvider} from "./interfaces/IRecoveryProvider.sol";

abstract contract BaseAccountRecovery is IAccountRecovery {
    // bytes4(keccak256("recoverOwnership(address,address,bytes)"))
    bytes4 public constant MAGIC = 0x3cfb167d;

    mapping(address => bool) internal _recoveryProviders;

    mapping(bytes32 => bool) internal _proofHashesUsed;

    error ZeroAddress();
    error ProviderAlreadyAdded(address provider);
    error ProviderNotRegistered(address provider);
    error InvalidRecoveryProof();
    error ProofAlreadyUsed();

    function recoveryProviderExists(address provider_) public view returns (bool) {
        return _recoveryProviders[provider_];
    }

    function _addRecoveryProvider(address provider_) internal {
        if (provider_ == address(0)) revert ZeroAddress();
        if (_recoveryProviders[provider_]) revert ProviderAlreadyAdded(provider_);

        _recoveryProviders[provider_] = true;

        emit RecoveryProviderAdded(provider_);
    }

    function _removeRecoveryProvider(address provider_) internal {
        if (!_recoveryProviders[provider_]) revert ProviderNotRegistered(provider_);

        delete _recoveryProviders[provider_];

        emit RecoveryProviderRemoved(provider_);
    }

    function _validateRecovery(
        address newOwner_,
        address provider_,
        bytes memory proof_
    ) internal {
        if (newOwner_ == address(0)) revert ZeroAddress();
        if (!_recoveryProviders[provider_]) revert ProviderNotRegistered(provider_);
        if (!IRecoveryProvider(provider_).checkRecovery(proof_)) revert InvalidRecoveryProof();

        bytes32 proofHash_ = keccak256(proof_);

        if (_proofHashesUsed[proofHash_]) revert ProofAlreadyUsed();

        _proofHashesUsed[proofHash_] = true;
    }
}
