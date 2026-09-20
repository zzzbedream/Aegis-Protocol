// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPureFiVerifier
 * @notice Interface for PureFi AML verification on Horizen L3 / Base
 */
interface IPureFiVerifier {
    struct PureFiPackage {
        bytes signature;    // ECDSA signature from authorized PureFi Issuer
        uint256 ruleId;     // Rule ID (e.g., 43 for Institutional AML)
        uint256 riskScore;  // Risk score 0-100 (lower is safer)
        uint256 validUntil; // Expiration timestamp
        bytes payload;      // Additional compliance metadata
    }

    event AMLVerified(address indexed account, uint256 ruleId, uint256 riskScore);
    event IssuerStatusUpdated(address indexed issuer, bool active);

    function verifyAML(address account, PureFiPackage calldata pkg) external returns (bool);
    function isIssuerAuthorized(address issuer) external view returns (bool);
    function maxAllowedRiskScore() external view returns (uint256);
}
