// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Defines a common recovery provider interface.
 */
interface IRecoveryProvider {
    /**
     * MUST be emitted in the `subscribe` function.
     */
    event AccountSubscribed(address indexed account);

    /**
     * MUST be emitted in the `unsubscribe` function.
     */
    event AccountUnsubscribed(address indexed account);

    /**
     * @notice A function that "subscribes" a smart account (msg.sender) to a recovery provider.
     * SHOULD process and assign the `recoveryData` to the `msg.sender`.
     *
     * @param recoveryData a recovery commitment (hash/ZKP public output) to be used
     * in the `recover` function to check a recovery proof validity.
     */
    function subscribe(bytes memory recoveryData) external;

    /**
     * @notice A function that revokes a smart account subscription.
     * MUST delete all the recovery data associated with the `msg.sender`.
     */
    function unsubscribe() external;

    /**
     * @notice A function to get a recovery data (commitment) of an account.
     *
     * @param account the account to get the recovery data of.
     * @return the associated recovery data.
     */
    function getRecoveryData(address account) external view returns (bytes memory);

    /**
     * @notice A function that checks if a recovery of a smart account (msg.sender)
     * to the `newOwner` is possible.
     * SHOULD use `msg.sender`'s `recoveryData` to check the `proof` validity.
     * MUST ensure that the `proof` can't be reused, e.g. update nonce.
     *
     * @param newOwner the new owner to recover the `msg.sender` ownership to.
     * @param proof the recovery proof.
     */
    function recover(address newOwner, bytes memory proof) external;
}
