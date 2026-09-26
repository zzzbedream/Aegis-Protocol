// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IzkVerifyBridge
 * @notice Interface for zkVerify aggregation proof verification on Horizen L3
 */
interface IzkVerifyBridge {
    event ProofAggregationVerified(
        bytes32 indexed domainId,
        bytes32 indexed aggregationId,
        bytes32 merkleRoot
    );

    function verifyProofAggregation(
        bytes32 domainId,
        bytes32 aggregationId,
        bytes32 merkleRoot,
        bytes calldata proof
    ) external returns (bool);

    function isProofVerified(bytes32 aggregationId) external view returns (bool);
    function getDomainMerkleRoot(bytes32 domainId) external view returns (bytes32);
}
