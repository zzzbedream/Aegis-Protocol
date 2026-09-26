// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IAegisVault.sol";
import "../interfaces/IERC7943.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title AegisVault
 * @notice Multi-asset institutional custody vault for Aegis Protocol
 * @dev Controlled exclusively by authorized Entrypoint and Exitpoint contracts
 */
contract AegisVault is IAegisVault {
    address public owner;
    address public entrypoint;
    address public exitpoint;

    // Asset balances: asset => total collateral locked
    mapping(address => uint256) public totalCollateral;

    // RWA Partition balances: rwaToken => partition => total locked
    mapping(address => mapping(bytes32 => uint256)) public partitionCollateral;

    // Reentrancy guard
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "AegisVault: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == entrypoint || msg.sender == exitpoint || msg.sender == owner,
            "AegisVault: caller unauthorized"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "AegisVault: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _status = _NOT_ENTERED;
    }

    function setControllers(address _entrypoint, address _exitpoint) external onlyOwner {
        require(_entrypoint != address(0) && _exitpoint != address(0), "AegisVault: zero address");
        entrypoint = _entrypoint;
        exitpoint = _exitpoint;
    }

    function lockCollateral(
        address asset,
        address from,
        uint256 amount
    ) external override onlyAuthorized nonReentrant {
        require(asset != address(0), "AegisVault: zero asset");
        require(amount > 0, "AegisVault: zero amount");

        uint256 balanceBefore = IERC20Minimal(asset).balanceOf(address(this));
        bool success = IERC20Minimal(asset).transferFrom(from, address(this), amount);
        require(success, "AegisVault: transferFrom failed");
        uint256 balanceAfter = IERC20Minimal(asset).balanceOf(address(this));
        require(balanceAfter - balanceBefore == amount, "AegisVault: fee-on-transfer unsupported");

        totalCollateral[asset] += amount;
        emit CollateralLocked(asset, from, amount);
    }

    function releaseCollateral(
        address asset,
        address to,
        uint256 amount
    ) external override onlyAuthorized nonReentrant {
        require(asset != address(0), "AegisVault: zero asset");
        require(to != address(0), "AegisVault: zero recipient");
        require(amount > 0, "AegisVault: zero amount");
        require(totalCollateral[asset] >= amount, "AegisVault: insufficient collateral");

        totalCollateral[asset] -= amount;
        bool success = IERC20Minimal(asset).transfer(to, amount);
        require(success, "AegisVault: transfer failed");

        emit CollateralReleased(asset, to, amount);
    }

    function lockCollateralPartition(
        address rwaToken,
        bytes32 partition,
        address from,
        uint256 amount
    ) external override onlyAuthorized nonReentrant {
        require(rwaToken != address(0), "AegisVault: zero token");
        require(amount > 0, "AegisVault: zero amount");

        bytes32 returnedPartition = IERC7943(rwaToken).transferFromByPartition(
            partition,
            from,
            address(this),
            amount,
            ""
        );
        require(returnedPartition == partition, "AegisVault: partition transfer failed");

        partitionCollateral[rwaToken][partition] += amount;
        totalCollateral[rwaToken] += amount;
        emit CollateralLocked(rwaToken, from, amount);
    }

    function releaseCollateralPartition(
        address rwaToken,
        bytes32 partition,
        address to,
        uint256 amount
    ) external override onlyAuthorized nonReentrant {
        require(rwaToken != address(0), "AegisVault: zero token");
        require(to != address(0), "AegisVault: zero recipient");
        require(amount > 0, "AegisVault: zero amount");
        require(partitionCollateral[rwaToken][partition] >= amount, "AegisVault: insufficient partition collateral");

        partitionCollateral[rwaToken][partition] -= amount;
        totalCollateral[rwaToken] -= amount;

        bytes32 returnedPartition = IERC7943(rwaToken).transferByPartition(
            partition,
            to,
            amount,
            ""
        );
        require(returnedPartition == partition, "AegisVault: partition transfer failed");

        emit CollateralReleased(rwaToken, to, amount);
    }

    function getTotalCollateral(address asset) external view override returns (uint256) {
        return totalCollateral[asset];
    }
}
