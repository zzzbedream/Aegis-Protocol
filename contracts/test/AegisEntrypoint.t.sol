// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../src/core/AegisVault.sol";
import "../src/core/AegisEntrypoint.sol";
import "../src/compliance/PureFiVerifier.sol";
import "../src/compliance/ERC7943Token.sol";
import "../src/mocks/MockZEN.sol";

contract AegisEntrypointTest is TestBase {
    AegisVault internal vault;
    AegisEntrypoint internal entrypoint;
    PureFiVerifier internal verifier;
    MockZEN internal zen;
    ERC7943Token internal rwaToken;

    uint256 internal issuerPrivateKey = 0xA11CE;
    address internal issuerAddress;

    address internal institution = address(0x1001);
    uint256 internal institutionKey = 0x1001;

    function setUp() public {
        issuerAddress = vm.addr(issuerPrivateKey);

        // Deploy tokens
        zen = new MockZEN();
        rwaToken = new ERC7943Token("US Treasury RWA", "USTB", 18);

        // Deploy verifier
        verifier = new PureFiVerifier(issuerAddress, 25); // max risk score 25

        // Deploy vault and entrypoint
        vault = new AegisVault();
        entrypoint = new AegisEntrypoint(address(vault), address(verifier));
        vault.setControllers(address(entrypoint), address(this));

        // Fund institution
        zen.mint(institution, 10_000 * 10**18);
        rwaToken.mint(institution, 50_000 * 10**18, rwaToken.COLLATERAL_PARTITION());

        vm.startPrank(institution);
        zen.approve(address(vault), type(uint256).max);
        rwaToken.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function _createPureFiPackage(
        address account,
        uint256 ruleId,
        uint256 riskScore,
        uint256 validUntil,
        bytes memory payload
    ) internal returns (IPureFiVerifier.PureFiPackage memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                account,
                ruleId,
                riskScore,
                validUntil,
                payload,
                block.chainid,
                address(verifier)
            )
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerPrivateKey, ethSignedHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        return IPureFiVerifier.PureFiPackage({
            signature: sig,
            ruleId: ruleId,
            riskScore: riskScore,
            validUntil: validUntil,
            payload: payload
        });
    }

    function test_DepositConfidential_ZEN_Success() public {
        bytes32 commitment = keccak256(abi.encodePacked(institution, "salt_1234"));
        bytes memory encryptedPayload = hex"c0ffee0102030405";
        uint256 depositAmount = 1_000 * 10**18;

        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            10, // risk score 10 <= 25
            block.timestamp + 3600,
            ""
        );

        vm.prank(institution);
        entrypoint.depositConfidential(
            address(zen),
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );

        assertTrue(entrypoint.isCommitmentActive(commitment));
        assertEq(entrypoint.getCommitmentAsset(commitment), address(zen));
        assertEq(entrypoint.getCommitmentAmount(commitment), depositAmount);
        assertEq(vault.getTotalCollateral(address(zen)), depositAmount);
    }

    function test_DepositConfidential_RWA_Success() public {
        bytes32 commitment = keccak256(abi.encodePacked(institution, "rwa_salt_5678"));
        bytes memory encryptedPayload = hex"aabbccddeeff";
        uint256 depositAmount = 5_000 * 10**18;
        bytes32 partition = rwaToken.COLLATERAL_PARTITION();

        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            5,
            block.timestamp + 3600,
            ""
        );

        vm.prank(institution);
        entrypoint.depositConfidentialRWA(
            address(rwaToken),
            partition,
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );

        assertTrue(entrypoint.isCommitmentActive(commitment));
        assertEq(entrypoint.getCommitmentAsset(commitment), address(rwaToken));
        assertEq(entrypoint.getCommitmentAmount(commitment), depositAmount);
        assertEq(vault.getTotalCollateral(address(rwaToken)), depositAmount);
    }

    function test_RevertIf_AML_RiskScoreTooHigh() public {
        bytes32 commitment = keccak256(abi.encodePacked(institution, "salt_risk"));
        bytes memory encryptedPayload = hex"010203";
        uint256 depositAmount = 500 * 10**18;

        // Risk score 75 > 25 max allowed
        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            75,
            block.timestamp + 3600,
            ""
        );

        vm.prank(institution);
        vm.expectRevert();
        entrypoint.depositConfidential(
            address(zen),
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );
    }

    function test_RevertIf_AML_CertificateExpired() public {
        bytes32 commitment = keccak256(abi.encodePacked(institution, "salt_expired"));
        bytes memory encryptedPayload = hex"010203";
        uint256 depositAmount = 500 * 10**18;

        // Expired timestamp
        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            10,
            block.timestamp - 1,
            ""
        );

        vm.prank(institution);
        vm.expectRevert();
        entrypoint.depositConfidential(
            address(zen),
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );
    }

    function test_RevertIf_DuplicateCommitment() public {
        bytes32 commitment = keccak256(abi.encodePacked(institution, "same_salt"));
        bytes memory encryptedPayload = hex"010203";
        uint256 depositAmount = 500 * 10**18;

        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            10,
            block.timestamp + 3600,
            ""
        );

        vm.startPrank(institution);
        entrypoint.depositConfidential(
            address(zen),
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );

        // Second deposit with same commitment must revert
        vm.expectRevert();
        entrypoint.depositConfidential(
            address(zen),
            depositAmount,
            commitment,
            encryptedPayload,
            amlPkg
        );
        vm.stopPrank();
    }
}
