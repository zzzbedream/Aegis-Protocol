// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IzkVerifyBridge.sol";

/**
 * @title MockZkVerify
 * @notice Mock implementation of zkVerify proof aggregation bridge for testing
 */
contract MockZkVerify is IzkVerifyBridge {
    mapping(bytes32 => bool) public verifiedProofs;
    mapping(bytes32 => bytes32) public domainRoots;

    function verifyProofAggregation(
        bytes32 domainId,
        bytes32 aggregationId,
        bytes32 merkleRoot,
        bytes calldata proof
    ) external override returns (bool) {
        // Enforce non-empty proof for valid mock execution
        require(proof.length > 0, "MockZkVerify: empty proof");
        verifiedProofs[aggregationId] = true;
        domainRoots[domainId] = merkleRoot;

        emit ProofAggregationVerified(domainId, aggregationId, merkleRoot);
        return true;
    }

    function isProofVerified(bytes32 aggregationId) external view override returns (bool) {
        return verifiedProofs[aggregationId];
    }

    function getDomainMerkleRoot(bytes32 domainId) external view override returns (bytes32) {
        return domainRoots[domainId];
    }
}
