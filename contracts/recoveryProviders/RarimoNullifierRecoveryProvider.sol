// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {Groth16VerifierHelper} from "@solarity/solidity-lib/libs/zkp/Groth16VerifierHelper.sol";

import {IPoseidonSMT} from "@rarimo/passport-contracts/interfaces/state/IPoseidonSMT.sol";
import {PublicSignalsBuilder} from "@rarimo/passport-contracts/sdk/lib/PublicSignalsBuilder.sol";

import {PoseidonUnit3L} from "./../libraries/Poseidon.sol";

import {IRecoveryProvider} from "./../interfaces/IRecoveryProvider.sol";
import {IRarimoNullifierAccount} from "./interfaces/IRarimoNullifierAccount.sol";

contract RarimoNullifierRecoveryProvider is
    IRecoveryProvider,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using PublicSignalsBuilder for uint256;
    using Groth16VerifierHelper for address;

    uint256 public constant SELECTOR = 0x1001;

    address public verifier;
    address public registrationSMT;

    function __RarimoNullifierRecoveryProvider_init(
        address verifier_,
        address registrationSMT_
    ) external initializer {
        __Ownable_init(_msgSender());

        verifier = verifier_;
        registrationSMT = registrationSMT_;
    }

    function checkRecovery(bytes memory proof_) external view returns (bool) {
        (
            bytes32 registrationRoot_,
            uint256 currentDate_,
            bytes memory userPayload_,
            Groth16VerifierHelper.ProofPoints memory proofPoints_
        ) = abi.decode(proof_, (bytes32, uint256, bytes, Groth16VerifierHelper.ProofPoints));

        uint256 builder_ = _buildPublicSignals(registrationRoot_, currentDate_, userPayload_);
        _withIdStateRoot(builder_, registrationRoot_);

        uint256[] memory publicSignals_ = PublicSignalsBuilder.buildAsUintArray(builder_);

        return verifier.verifyProof(proofPoints_, publicSignals_);
    }

    function getEventId(address account_) public view returns (uint256) {
        return
            PoseidonUnit3L.poseidon(
                [block.chainid, uint256(uint160(address(this))), uint256(uint160(account_))]
            );
    }

    function getEventData() public view returns (uint256) {
        return uint256(uint248(uint256(keccak256(abi.encodePacked(address(this))))));
    }

    function _buildPublicSignals(
        bytes32,
        uint256 currentDate_,
        bytes memory userPayload_
    ) internal view returns (uint256 dataPointer_) {
        address account_ = abi.decode(userPayload_, (address));

        dataPointer_ = PublicSignalsBuilder.newPublicSignalsBuilder(
            SELECTOR,
            IRarimoNullifierAccount(account_).nullifier()
        );
        dataPointer_.withEventIdAndData(getEventId(account_), getEventData());
        dataPointer_.withCurrentDate(currentDate_, 1 days);
        dataPointer_.withExpirationDateLowerboundAndUpperbound(
            currentDate_,
            PublicSignalsBuilder.ZERO_DATE
        );

        return dataPointer_;
    }

    function _withIdStateRoot(uint256 dataPointer_, bytes32 idStateRoot_) internal view {
        if (!IPoseidonSMT(registrationSMT).isRootValid(idStateRoot_)) {
            revert PublicSignalsBuilder.InvalidRegistrationRoot(registrationSMT, idStateRoot_);
        }

        assembly {
            mstore(add(dataPointer_, 384), idStateRoot_)
        }
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
