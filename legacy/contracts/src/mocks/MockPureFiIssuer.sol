// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IPureFiVerifier.sol";

/**
 * @title MockPureFiIssuer
 * @notice Helper for generating test PureFi packages and signatures in local tests
 */
contract MockPureFiIssuer {
    uint256 public issuerPrivateKey;
    address public issuerAddress;

    constructor(uint256 _privateKey) {
        issuerPrivateKey = _privateKey;
        // Derive address from private key in test environment
        // In Foundry / test setups, this can be set to vm.addr(issuerPrivateKey)
    }

    function createPackage(
        address account,
        uint256 ruleId,
        uint256 riskScore,
        uint256 validUntil,
        bytes memory payload,
        address verifierAddress,
        uint256 chainId,
        bytes memory signature
    ) external pure returns (IPureFiVerifier.PureFiPackage memory) {
        return IPureFiVerifier.PureFiPackage({
            signature: signature,
            ruleId: ruleId,
            riskScore: riskScore,
            validUntil: validUntil,
            payload: payload
        });
    }

    function computeMessageHash(
        address account,
        uint256 ruleId,
        uint256 riskScore,
        uint256 validUntil,
        bytes memory payload,
        uint256 chainId,
        address verifierAddress
    ) external pure returns (bytes32) {
        bytes32 rawHash = keccak256(
            abi.encodePacked(
                account,
                ruleId,
                riskScore,
                validUntil,
                payload,
                chainId,
                verifierAddress
            )
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", rawHash));
    }
}
