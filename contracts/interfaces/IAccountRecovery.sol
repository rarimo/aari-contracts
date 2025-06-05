// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Defines a common account recovery interface for smart accounts to implement.
 */
interface IAccountRecovery {
    /**
     * MUST be emitted in the `recoverOwnership` function upon successful recovery.
     */
    event OwnershipRecovered(address indexed oldOwner, address indexed newOwner);

    /**
     * MUST be emitted in the `addRecoveryProvider` function.
     */
    event RecoveryProviderAdded(address indexed provider);

    /**
     * MUST be emitted in the `removeRecoveryProvider` function.
     */
    event RecoveryProviderRemoved(address indexed provider);

    /**
     * @notice An `onlyOwner` function to add a new recovery provider.
     * SHOULD be access controlled.
     * MUST check that `provider` is not `address(0)`.
     * MUST call `subscribe` on the `provider`.
     *
     * @param provider the address of a recovery provider (ZKP verifier) to add.
     * @param recoveryData custom data (commitment) for the recovery provider.
     */
    function addRecoveryProvider(address provider, bytes memory recoveryData) external;

    /**
     * @notice An `onlyOwner` function to remove an existing recovery provider.
     * SHOULD be access controlled.
     * MUST call `unsubscribe` on the `provider`.
     *
     * @param provider the address of a previously added recovery provider to remove.
     */
    function removeRecoveryProvider(address provider) external;

    /**
     * @notice A view function to check if a provider has been previously added.
     *
     * @param provider the provider to check.
     * @return true if the provider exists in the account, false otherwise.
     */
    function recoveryProviderExists(address provider) external view returns (bool);

    /**
     * @notice A non-view function to recover ownership of a smart account.
     * MUST check that `provider` exists in the account.
     * MUST call `recover` on the `provider`.
     * MUST update the account owner to `newOwner` if `proof` verification succeeds.
     * MUST return `true` if the ownership recovery is successful.
     *
     * @param newOwner the address of a new owner.
     * @param provider the address of a recovery provider.
     * @param proof an encoded proof of recovery (ZKP/ZKAI, signature, etc).
     * @return `true` if recovery is successful, `false` (or revert) otherwise.
     */
    function recoverOwnership(
        address newOwner,
        address provider,
        bytes memory proof
    ) external returns (bool);
}
