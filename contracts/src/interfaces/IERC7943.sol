// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC7943
 * @notice Standard Interface for Compliant Real World Asset (RWA) Tokens with Partitions
 */
interface IERC7943 {
    event TransferByPartition(
        bytes32 indexed fromPartition,
        address operator,
        address indexed from,
        address indexed to,
        uint256 value,
        bytes data,
        bytes operatorData
    );

    event DocumentUpdated(bytes32 indexed name, string uri, bytes32 documentHash);

    // Partition Queries
    function balanceOfByPartition(bytes32 partition, address tokenHolder) external view returns (uint256);
    function partitionsOf(address tokenHolder) external view returns (bytes32[] memory);
    function totalPartitionSupply(bytes32 partition) external view returns (uint256);

    // Compliance Checks
    function canTransfer(address to, uint256 value, bytes calldata data) external view returns (bool, bytes1, bytes32);
    function canTransferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes calldata data
    ) external view returns (bool, bytes1, bytes32);

    // Transfers by Partition
    function transferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32);

    function transferFromByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32);

    // Document Management
    function setDocument(bytes32 name, string calldata uri, bytes32 documentHash) external;
    function getDocument(bytes32 name) external view returns (string memory, bytes32, uint256);
}
