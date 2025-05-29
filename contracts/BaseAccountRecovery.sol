// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccountRecovery} from "./interfaces/IAccountRecovery.sol";
import {IRecoveryProvider} from "./interfaces/IRecoveryProvider.sol";

abstract contract BaseAccountRecovery is IAccountRecovery {
    // bytes4(keccak256("recoverOwnership(address,address,bytes)"))
    bytes4 public constant MAGIC = 0x3cfb167d;

    mapping(address => bool) internal _recoveryProviders;

    function recoveryProviderExists(address provider_) external view returns (bool) {
        return _recoveryProviders[provider_];
    }

    function _addRecoveryProvider(address provider_) internal {
        require(provider_ != address(0), "BaseAccountRecovery: provider address cannot be zero");
        require(!_recoveryProviders[provider_], "BaseAccountRecovery: provider already added");

        _recoveryProviders[provider_] = true;

        emit RecoveryProviderAdded(provider_);
    }

    function _removeRecoveryProvider(address provider_) internal {
        require(_recoveryProviders[provider_], "BaseAccountRecovery: provider not registered");

        delete _recoveryProviders[provider_];

        emit RecoveryProviderRemoved(provider_);
    }

    function _validateRecovery(
        address newOwner_,
        address provider_,
        bytes memory proof_
    ) internal view {
        require(
            newOwner_ != address(0),
            "BaseAccountRecovery: new owner cannot be the zero address"
        );
        require(_recoveryProviders[provider_], "BaseAccountRecovery: unknown recovery provider");

        require(
            IRecoveryProvider(provider_).checkRecovery(proof_),
            "BaseAccountRecovery: Invalid recovery proof"
        );
    }
}
