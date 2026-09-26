// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPureFiVerifier.sol";

/**
 * @title IAegisEntrypoint
 * @notice Interface for confidential deposits and blind commitment registration
 */
interface IAegisEntrypoint {
    event BlindDepositRegistered(
        bytes32 indexed commitment,
        address indexed asset,
        uint256 amount,
        bytes encryptedPayload
    );

    event BlindBorrowRequested(
        bytes32 indexed commitment,
        address indexed borrowAsset,
        uint256 amount,
        bytes encryptedPayload
    );

    function depositConfidential(
        address asset,
        uint256 amount,
        bytes32 commitment,
        bytes calldata encryptedPayload,
        IPureFiVerifier.PureFiPackage calldata amlPackage
    ) external;

    function depositConfidentialRWA(
        address rwaToken,
        bytes32 partition,
        uint256 amount,
        bytes32 commitment,
        bytes calldata encryptedPayload,
        IPureFiVerifier.PureFiPackage calldata amlPackage
    ) external;

    function isCommitmentActive(bytes32 commitment) external view returns (bool);
    function getCommitmentAsset(bytes32 commitment) external view returns (address);
    function getCommitmentAmount(bytes32 commitment) external view returns (uint256);
}
