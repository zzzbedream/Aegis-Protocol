// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAegisVault
 * @notice Multi-asset institutional custody vault for Aegis Protocol
 */
interface IAegisVault {
    event CollateralLocked(address indexed asset, address indexed depositor, uint256 amount);
    event CollateralReleased(address indexed asset, address indexed recipient, uint256 amount);
    event DebtMinted(address indexed asset, address indexed borrower, uint256 amount);
    event DebtBurned(address indexed asset, address indexed borrower, uint256 amount);

    function lockCollateral(address asset, address from, uint256 amount) external;
    function releaseCollateral(address asset, address to, uint256 amount) external;
    function lockCollateralPartition(address rwaToken, bytes32 partition, address from, uint256 amount) external;
    function releaseCollateralPartition(address rwaToken, bytes32 partition, address to, uint256 amount) external;
    function getTotalCollateral(address asset) external view returns (uint256);
}
