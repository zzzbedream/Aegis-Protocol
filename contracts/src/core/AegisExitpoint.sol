// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IAegisExitpoint.sol";
import "../interfaces/IAegisVault.sol";
import "../interfaces/IAegisEntrypoint.sol";
import "../interfaces/IPureFiVerifier.sol";
import "../interfaces/IzkVerifyBridge.sol";
import "../interfaces/IERC7943.sol";

interface IERC20Transferable {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title AegisExitpoint
 * @notice Exitpoint and Blind Liquidation Engine on Horizen L3
 * @dev Enforces TEE V-Socket attestations, zkVerify proof aggregation, and PureFi AML
 */
contract AegisExitpoint is IAegisExitpoint {
    address public owner;
    IAegisVault public vault;
    IAegisEntrypoint public entrypoint;
    IPureFiVerifier public pureFiVerifier;
    IzkVerifyBridge public zkVerifyBridge;
    address public teeEnclaveSigner;

    uint256 public maxAttestationAge = 3600; // 1 hour
    bytes32 public zkDomainId = keccak256("HORIZEN.AEGIS.L3.DOMAIN");

    mapping(uint256 => bool) public usedNonces;
    mapping(bytes32 => bool) public liquidatedCommitments;

    event TEEEnclaveSignerUpdated(address indexed newSigner);
    event MaxAttestationAgeUpdated(uint256 newAge);
    event ZkDomainIdUpdated(bytes32 newDomainId);

    modifier onlyOwner() {
        require(msg.sender == owner, "AegisExitpoint: caller is not owner");
        _;
    }

    constructor(
        address _vault,
        address _entrypoint,
        address _pureFiVerifier,
        address _zkVerifyBridge,
        address _teeEnclaveSigner
    ) {
        owner = msg.sender;
        require(_vault != address(0) && _entrypoint != address(0), "AegisExitpoint: zero address");
        require(_pureFiVerifier != address(0) && _zkVerifyBridge != address(0), "AegisExitpoint: zero address");
        require(_teeEnclaveSigner != address(0), "AegisExitpoint: zero enclave signer");

        vault = IAegisVault(_vault);
        entrypoint = IAegisEntrypoint(_entrypoint);
        pureFiVerifier = IPureFiVerifier(_pureFiVerifier);
        zkVerifyBridge = IzkVerifyBridge(_zkVerifyBridge);
        teeEnclaveSigner = _teeEnclaveSigner;
    }

    function setTEEEnclaveSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "AegisExitpoint: zero address");
        teeEnclaveSigner = _newSigner;
        emit TEEEnclaveSignerUpdated(_newSigner);
    }

    function setMaxAttestationAge(uint256 _newAge) external onlyOwner {
        maxAttestationAge = _newAge;
        emit MaxAttestationAgeUpdated(_newAge);
    }

    function setZkDomainId(bytes32 _newDomainId) external onlyOwner {
        zkDomainId = _newDomainId;
        emit ZkDomainIdUpdated(_newDomainId);
    }

    /**
     * @notice Execute a blind liquidation for a subcollateralized commitment
     * @dev Does NOT reveal the identity of the borrower. Verifies TEE attestation and zkVerify aggregation.
     */
    function liquidateBlind(
        bytes32 commitment,
        address collateralAsset,
        uint256 collateralToSeize,
        address debtAsset,
        uint256 debtToRepay,
        bytes calldata vSocketAttestation,
        bytes calldata zkProof,
        IPureFiVerifier.PureFiPackage calldata liquidatorAmlPackage
    ) external override {
        require(!liquidatedCommitments[commitment], "AegisExitpoint: commitment already liquidated");
        require(entrypoint.isCommitmentActive(commitment), "AegisExitpoint: commitment not active");

        // 1. Verify Liquidator PureFi AML
        bool amlValid = pureFiVerifier.verifyAML(msg.sender, liquidatorAmlPackage);
        require(amlValid, "AegisExitpoint: liquidator AML check failed");

        // 2. Decode and Validate TEE V-Socket Attestation
        (
            AttestationPayload memory payload,
            bytes memory signature
        ) = abi.decode(vSocketAttestation, (AttestationPayload, bytes));

        require(payload.commitment == commitment, "AegisExitpoint: commitment mismatch");
        require(payload.collateralAsset == collateralAsset, "AegisExitpoint: collateral asset mismatch");
        require(payload.collateralAmount >= collateralToSeize, "AegisExitpoint: excessive collateral seizure");
        require(payload.debtAsset == debtAsset, "AegisExitpoint: debt asset mismatch");
        require(payload.debtAmount <= debtToRepay, "AegisExitpoint: insufficient debt repayment");
        require(payload.healthFactor < 1e18, "AegisExitpoint: position not liquidatable (HF >= 1.0)");
        require(block.timestamp <= payload.timestamp + maxAttestationAge, "AegisExitpoint: attestation expired");
        require(!usedNonces[payload.nonce], "AegisExitpoint: nonce already used");

        usedNonces[payload.nonce] = true;

        // Verify TEE Hardware / Coprocessor Signature
        bytes32 messageHash = keccak256(
            abi.encode(
                payload.commitment,
                payload.collateralAsset,
                payload.collateralAmount,
                payload.debtAsset,
                payload.debtAmount,
                payload.healthFactor,
                payload.timestamp,
                payload.nonce,
                block.chainid,
                address(this)
            )
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = recoverSigner(ethSignedHash, signature);
        require(signer == teeEnclaveSigner, "AegisExitpoint: invalid TEE attestation signature");

        // 3. Verify zkVerify State Aggregation Proof
        bytes32 aggregationId = keccak256(abi.encodePacked(commitment, payload.nonce));
        bytes32 merkleRoot = keccak256(abi.encodePacked(commitment, payload.healthFactor));
        bool zkValid = zkVerifyBridge.verifyProofAggregation(
            zkDomainId,
            aggregationId,
            merkleRoot,
            zkProof
        );
        require(zkValid, "AegisExitpoint: zkVerify proof aggregation failed");

        // 4. Mark commitment as liquidated
        liquidatedCommitments[commitment] = true;

        // 5. Transfer debt from liquidator into vault
        bool debtTransferred = IERC20Transferable(debtAsset).transferFrom(
            msg.sender,
            address(vault),
            debtToRepay
        );
        require(debtTransferred, "AegisExitpoint: debt transfer failed");

        // 6. Release seizable collateral to liquidator
        vault.releaseCollateral(collateralAsset, msg.sender, collateralToSeize);

        // 7. Emit Blind Liquidation Event (No Borrower Address Emitted)
        emit BlindLiquidationExecuted(
            commitment,
            msg.sender,
            collateralAsset,
            collateralToSeize,
            debtAsset,
            debtToRepay
        );
    }

    /**
     * @notice Withdraw collateral upon confidential loan closure
     */
    function withdrawConfidential(
        bytes32 commitment,
        address asset,
        uint256 amount,
        address recipient,
        bytes calldata vSocketAttestation,
        IPureFiVerifier.PureFiPackage calldata recipientAmlPackage
    ) external override {
        require(!liquidatedCommitments[commitment], "AegisExitpoint: commitment already liquidated");
        require(recipient != address(0), "AegisExitpoint: zero recipient");

        // 1. Recipient AML verification
        bool amlValid = pureFiVerifier.verifyAML(recipient, recipientAmlPackage);
        require(amlValid, "AegisExitpoint: recipient AML check failed");

        // 2. Decode and Validate TEE Attestation
        (
            AttestationPayload memory payload,
            bytes memory signature
        ) = abi.decode(vSocketAttestation, (AttestationPayload, bytes));

        require(payload.commitment == commitment, "AegisExitpoint: commitment mismatch");
        require(payload.collateralAsset == asset, "AegisExitpoint: asset mismatch");
        require(payload.collateralAmount >= amount, "AegisExitpoint: insufficient collateral in attestation");
        require(payload.debtAmount == 0 || payload.healthFactor >= 1.2e18, "AegisExitpoint: position unsafe for withdrawal");
        require(block.timestamp <= payload.timestamp + maxAttestationAge, "AegisExitpoint: attestation expired");
        require(!usedNonces[payload.nonce], "AegisExitpoint: nonce already used");

        usedNonces[payload.nonce] = true;

        bytes32 messageHash = keccak256(
            abi.encode(
                payload.commitment,
                payload.collateralAsset,
                payload.collateralAmount,
                payload.debtAsset,
                payload.debtAmount,
                payload.healthFactor,
                payload.timestamp,
                payload.nonce,
                block.chainid,
                address(this)
            )
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = recoverSigner(ethSignedHash, signature);
        require(signer == teeEnclaveSigner, "AegisExitpoint: invalid TEE attestation signature");

        // 3. Release collateral from vault
        vault.releaseCollateral(asset, recipient, amount);

        emit ConfidentialWithdrawalExecuted(commitment, recipient, asset, amount);
    }

    function recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "AegisExitpoint: invalid signature length");

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

        require(v == 27 || v == 28, "AegisExitpoint: invalid signature 'v' value");
        return ecrecover(hash, v, r, s);
    }
}
