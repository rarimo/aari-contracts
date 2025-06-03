// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccountRecovery} from "./interfaces/IAccountRecovery.sol";
import {IRecoveryProvider} from "./interfaces/IRecoveryProvider.sol";

abstract contract BaseAccountRecovery is IAccountRecovery {
    mapping(address => bool) internal _recoveryProviders;

    error ZeroAddress();
    error ProviderAlreadyAdded(address provider);
    error ProviderNotRegistered(address provider);

    function recoveryProviderExists(address provider_) public view returns (bool) {
        return _recoveryProviders[provider_];
    }

    function _addRecoveryProvider(address provider_, bytes memory recoveryData_) internal {
        if (provider_ == address(0)) revert ZeroAddress();
        if (_recoveryProviders[provider_]) revert ProviderAlreadyAdded(provider_);

        IRecoveryProvider(provider_).subscribe(recoveryData_);

        _recoveryProviders[provider_] = true;

        emit RecoveryProviderAdded(provider_);
    }

    function _removeRecoveryProvider(address provider_) internal {
        if (!_recoveryProviders[provider_]) revert ProviderNotRegistered(provider_);

        IRecoveryProvider(provider_).unsubscribe();

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

        IRecoveryProvider(provider_).recover(newOwner_, proof_);
    }
}
