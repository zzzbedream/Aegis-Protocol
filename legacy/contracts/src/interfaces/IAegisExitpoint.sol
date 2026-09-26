// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPureFiVerifier.sol";

/**
 * @title IAegisExitpoint
 * @notice Interface for blind liquidations and confidential withdrawals
 */
interface IAegisExitpoint {
    event BlindLiquidationExecuted(
        bytes32 indexed commitment,
        address indexed liquidator,
        address collateralAsset,
        uint256 collateralSeized,
        address debtAsset,
        uint256 debtRepaid
    );

    event ConfidentialWithdrawalExecuted(
        bytes32 indexed commitment,
        address indexed recipient,
        address asset,
        uint256 amount
    );

    struct AttestationPayload {
        bytes32 commitment;
        address collateralAsset;
        uint256 collateralAmount;
        address debtAsset;
        uint256 debtAmount;
        uint256 healthFactor; // Scaled by 1e18 (< 1e18 is liquidatable)
        uint256 timestamp;
        uint256 nonce;
    }

    function liquidateBlind(
        bytes32 commitment,
        address collateralAsset,
        uint256 collateralToSeize,
        address debtAsset,
        uint256 debtToRepay,
        bytes calldata vSocketAttestation,
        bytes calldata zkProof,
        IPureFiVerifier.PureFiPackage calldata liquidatorAmlPackage
    ) external;

    function withdrawConfidential(
        bytes32 commitment,
        address asset,
        uint256 amount,
        address recipient,
        bytes calldata vSocketAttestation,
        IPureFiVerifier.PureFiPackage calldata recipientAmlPackage
    ) external;
}
