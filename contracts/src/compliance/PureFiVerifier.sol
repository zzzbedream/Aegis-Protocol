// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IPureFiVerifier.sol";

/**
 * @title PureFiVerifier
 * @notice Verifies PureFi AML certificates and risk scores on-chain
 */
contract PureFiVerifier is IPureFiVerifier {
    address public owner;
    uint256 public override maxAllowedRiskScore;
    mapping(address => bool) public override isIssuerAuthorized;

    modifier onlyOwner() {
        require(msg.sender == owner, "PureFiVerifier: caller is not owner");
        _;
    }

    constructor(address _initialIssuer, uint256 _maxRiskScore) {
        owner = msg.sender;
        maxAllowedRiskScore = _maxRiskScore;
        if (_initialIssuer != address(0)) {
            isIssuerAuthorized[_initialIssuer] = true;
            emit IssuerStatusUpdated(_initialIssuer, true);
        }
    }

    function setIssuerStatus(address issuer, bool active) external onlyOwner {
        require(issuer != address(0), "PureFiVerifier: zero address");
        isIssuerAuthorized[issuer] = active;
        emit IssuerStatusUpdated(issuer, active);
    }

    function setMaxAllowedRiskScore(uint256 newScore) external onlyOwner {
        require(newScore <= 100, "PureFiVerifier: score exceeds 100");
        maxAllowedRiskScore = newScore;
    }

    function verifyAML(address account, PureFiPackage calldata pkg) external override returns (bool) {
        require(account != address(0), "PureFiVerifier: zero account");
        require(pkg.validUntil >= block.timestamp, "PureFiVerifier: certificate expired");
        require(pkg.riskScore <= maxAllowedRiskScore, "PureFiVerifier: risk score too high");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                account,
                pkg.ruleId,
                pkg.riskScore,
                pkg.validUntil,
                pkg.payload,
                block.chainid,
                address(this)
            )
        );

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address recoveredSigner = recoverSigner(ethSignedMessageHash, pkg.signature);
        require(isIssuerAuthorized[recoveredSigner], "PureFiVerifier: unauthorized issuer signature");

        emit AMLVerified(account, pkg.ruleId, pkg.riskScore);
        return true;
    }

    function recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "PureFiVerifier: invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "PureFiVerifier: invalid signature 'v' value");
        return ecrecover(hash, v, r, s);
    }
}
