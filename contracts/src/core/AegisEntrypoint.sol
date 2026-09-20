// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IAegisEntrypoint.sol";
import "../interfaces/IAegisVault.sol";
import "../interfaces/IPureFiVerifier.sol";

/**
 * @title AegisEntrypoint
 * @notice Entrypoint contract for confidential institutional deposits on Horizen L3
 * @dev Enforces PureFi AML compliance and registers blind commitments
 */
contract AegisEntrypoint is IAegisEntrypoint {
    address public owner;
    IAegisVault public vault;
    IPureFiVerifier public pureFiVerifier;

    // Commitment state tracking
    mapping(bytes32 => bool) public override isCommitmentActive;
    mapping(bytes32 => address) public override getCommitmentAsset;
    mapping(bytes32 => uint256) public override getCommitmentAmount;
    mapping(bytes32 => bytes32) public commitmentPartition; // For RWA

    event VaultUpdated(address indexed newVault);
    event PureFiVerifierUpdated(address indexed newVerifier);

    modifier onlyOwner() {
        require(msg.sender == owner, "AegisEntrypoint: caller is not owner");
        _;
    }

    constructor(address _vault, address _pureFiVerifier) {
        owner = msg.sender;
        require(_vault != address(0) && _pureFiVerifier != address(0), "AegisEntrypoint: zero address");
        vault = IAegisVault(_vault);
        pureFiVerifier = IPureFiVerifier(_pureFiVerifier);
    }

    function setVault(address _newVault) external onlyOwner {
        require(_newVault != address(0), "AegisEntrypoint: zero address");
        vault = IAegisVault(_newVault);
        emit VaultUpdated(_newVault);
    }

    function setPureFiVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "AegisEntrypoint: zero address");
        pureFiVerifier = IPureFiVerifier(_newVerifier);
        emit PureFiVerifierUpdated(_newVerifier);
    }

    /**
     * @notice Deposit standard ERC-20 / OFT collateral (e.g. ZEN) with PureFi AML verification
     * @param asset Address of the collateral token (e.g., MockZEN)
     * @param amount Collateral amount to deposit
     * @param commitment Blind commitment H(InstitutionalID, salt)
     * @param encryptedPayload Payload encrypted with TEE enclave public key
     * @param amlPackage PureFi compliance certificate and signature
     */
    function depositConfidential(
        address asset,
        uint256 amount,
        bytes32 commitment,
        bytes calldata encryptedPayload,
        IPureFiVerifier.PureFiPackage calldata amlPackage
    ) external override {
        require(commitment != bytes32(0), "AegisEntrypoint: empty commitment");
        require(!isCommitmentActive[commitment], "AegisEntrypoint: commitment already exists");
        require(amount > 0, "AegisEntrypoint: zero amount");
        require(encryptedPayload.length > 0, "AegisEntrypoint: empty encrypted payload");

        // 1. Enforce PureFi AML verification off-chain proof on-chain
        bool amlValid = pureFiVerifier.verifyAML(msg.sender, amlPackage);
        require(amlValid, "AegisEntrypoint: PureFi AML verification failed");

        // 2. Lock collateral into AegisVault
        vault.lockCollateral(asset, msg.sender, amount);

        // 3. Register blind commitment
        isCommitmentActive[commitment] = true;
        getCommitmentAsset[commitment] = asset;
        getCommitmentAmount[commitment] = amount;

        // 4. Emit blind deposit event for TEE ingestion
        emit BlindDepositRegistered(commitment, asset, amount, encryptedPayload);
    }

    /**
     * @notice Deposit ERC-7943 compliant RWA token partition as collateral
     */
    function depositConfidentialRWA(
        address rwaToken,
        bytes32 partition,
        uint256 amount,
        bytes32 commitment,
        bytes calldata encryptedPayload,
        IPureFiVerifier.PureFiPackage calldata amlPackage
    ) external override {
        require(commitment != bytes32(0), "AegisEntrypoint: empty commitment");
        require(!isCommitmentActive[commitment], "AegisEntrypoint: commitment already exists");
        require(amount > 0, "AegisEntrypoint: zero amount");
        require(encryptedPayload.length > 0, "AegisEntrypoint: empty encrypted payload");

        // 1. Enforce PureFi AML verification
        bool amlValid = pureFiVerifier.verifyAML(msg.sender, amlPackage);
        require(amlValid, "AegisEntrypoint: PureFi AML verification failed");

        // 2. Lock collateral partition into AegisVault
        vault.lockCollateralPartition(rwaToken, partition, msg.sender, amount);

        // 3. Register blind commitment
        isCommitmentActive[commitment] = true;
        getCommitmentAsset[commitment] = rwaToken;
        getCommitmentAmount[commitment] = amount;
        commitmentPartition[commitment] = partition;

        // 4. Emit blind deposit event
        emit BlindDepositRegistered(commitment, rwaToken, amount, encryptedPayload);
    }
}
