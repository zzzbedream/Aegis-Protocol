// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../src/core/AegisVault.sol";
import "../src/core/AegisEntrypoint.sol";
import "../src/core/AegisExitpoint.sol";
import "../src/compliance/PureFiVerifier.sol";
import "../src/mocks/MockZEN.sol";
import "../src/mocks/MockZkVerify.sol";

contract BlindLiquidationTest is TestBase {
    AegisVault internal vault;
    AegisEntrypoint internal entrypoint;
    AegisExitpoint internal exitpoint;
    PureFiVerifier internal verifier;
    MockZkVerify internal zkBridge;
    MockZEN internal zen;
    MockZEN internal usdcDebt;

    uint256 internal issuerPrivateKey = 0xA11CE;
    address internal issuerAddress;

    uint256 internal teePrivateKey = 0xB0B;
    address internal teeAddress;

    address internal institution = address(0x1001);
    address internal liquidator = address(0x2002);

    bytes32 internal commitment;

    function setUp() public {
        issuerAddress = vm.addr(issuerPrivateKey);
        teeAddress = vm.addr(teePrivateKey);

        zen = new MockZEN();
        usdcDebt = new MockZEN(); // Using MockZEN as debt asset for simplicity

        verifier = new PureFiVerifier(issuerAddress, 25);
        zkBridge = new MockZkVerify();
        vault = new AegisVault();

        entrypoint = new AegisEntrypoint(address(vault), address(verifier));
        exitpoint = new AegisExitpoint(
            address(vault),
            address(entrypoint),
            address(verifier),
            address(zkBridge),
            teeAddress
        );

        vault.setControllers(address(entrypoint), address(exitpoint));

        // Fund institution and liquidator
        zen.mint(institution, 10_000 * 10**18);
        usdcDebt.mint(liquidator, 50_000 * 10**18);

        vm.prank(institution);
        zen.approve(address(vault), type(uint256).max);

        vm.prank(liquidator);
        usdcDebt.approve(address(exitpoint), type(uint256).max);

        // Initial deposit
        commitment = keccak256(abi.encodePacked(institution, "secret_salt_999"));
        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            43,
            10,
            block.timestamp + 3600
        );

        vm.prank(institution);
        entrypoint.depositConfidential(
            address(zen),
            1_000 * 10**18, // 1000 ZEN collateral
            commitment,
            hex"12345678",
            amlPkg
        );
    }

    function _createPureFiPackage(
        address account,
        uint256 ruleId,
        uint256 riskScore,
        uint256 validUntil
    ) internal returns (IPureFiVerifier.PureFiPackage memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                account,
                ruleId,
                riskScore,
                validUntil,
                bytes(""),
                block.chainid,
                address(verifier)
            )
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerPrivateKey, ethSignedHash);

        return IPureFiVerifier.PureFiPackage({
            signature: abi.encodePacked(r, s, v),
            ruleId: ruleId,
            riskScore: riskScore,
            validUntil: validUntil,
            payload: ""
        });
    }

    function _createTEEAttestation(
        bytes32 _commitment,
        address _collatAsset,
        uint256 _collatAmount,
        address _debtAsset,
        uint256 _debtAmount,
        uint256 _healthFactor,
        uint256 _timestamp,
        uint256 _nonce
    ) internal returns (bytes memory) {
        IAegisExitpoint.AttestationPayload memory payload = IAegisExitpoint.AttestationPayload({
            commitment: _commitment,
            collateralAsset: _collatAsset,
            collateralAmount: _collatAmount,
            debtAsset: _debtAsset,
            debtAmount: _debtAmount,
            healthFactor: _healthFactor,
            timestamp: _timestamp,
            nonce: _nonce
        });

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
                address(exitpoint)
            )
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, ethSignedHash);

        return abi.encode(payload, abi.encodePacked(r, s, v));
    }

    function test_BlindLiquidation_Success() public {
        uint256 collateralToSeize = 1_000 * 10**18;
        uint256 debtToRepay = 8_000 * 10**18;
        uint256 subcollateralizedHF = 0.85 * 1e18; // HF < 1.0 (liquidatable)
        uint256 nonce = 1001;

        bytes memory vSocketAttestation = _createTEEAttestation(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            subcollateralizedHF,
            block.timestamp,
            nonce
        );

        bytes memory zkProof = hex"deadbeef01020304"; // zkVerify aggregation proof
        IPureFiVerifier.PureFiPackage memory liquidatorAml = _createPureFiPackage(
            liquidator,
            43,
            5,
            block.timestamp + 3600
        );

        uint256 liquidatorZenBefore = zen.balanceOf(liquidator);

        // Execute blind liquidation as liquidator
        vm.prank(liquidator);
        exitpoint.liquidateBlind(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            vSocketAttestation,
            zkProof,
            liquidatorAml
        );

        // Assertions:
        // 1. Liquidator received collateral
        assertEq(zen.balanceOf(liquidator) - liquidatorZenBefore, collateralToSeize);
        // 2. Commitment is marked liquidated
        assertTrue(exitpoint.liquidatedCommitments(commitment));
        // 3. Vault collateral updated
        assertEq(vault.getTotalCollateral(address(zen)), 0);
        // 4. Nonce is used
        assertTrue(exitpoint.usedNonces(nonce));
    }

    function test_RevertIf_HealthyPosition_CannotLiquidate() public {
        uint256 collateralToSeize = 1_000 * 10**18;
        uint256 debtToRepay = 5_000 * 10**18;
        uint256 healthyHF = 1.45 * 1e18; // HF >= 1.0 (healthy position)

        bytes memory vSocketAttestation = _createTEEAttestation(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            healthyHF,
            block.timestamp,
            1002
        );

        bytes memory zkProof = hex"deadbeef";
        IPureFiVerifier.PureFiPackage memory liquidatorAml = _createPureFiPackage(
            liquidator,
            43,
            5,
            block.timestamp + 3600
        );

        vm.prank(liquidator);
        vm.expectRevert();
        exitpoint.liquidateBlind(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            vSocketAttestation,
            zkProof,
            liquidatorAml
        );
    }

    function test_RevertIf_NonceReplayed() public {
        uint256 collateralToSeize = 1_000 * 10**18;
        uint256 debtToRepay = 8_000 * 10**18;
        uint256 subcollateralizedHF = 0.85 * 1e18;
        uint256 nonce = 1003;

        bytes memory vSocketAttestation = _createTEEAttestation(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            subcollateralizedHF,
            block.timestamp,
            nonce
        );

        bytes memory zkProof = hex"deadbeef";
        IPureFiVerifier.PureFiPackage memory liquidatorAml = _createPureFiPackage(
            liquidator,
            43,
            5,
            block.timestamp + 3600
        );

        vm.startPrank(liquidator);
        exitpoint.liquidateBlind(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            vSocketAttestation,
            zkProof,
            liquidatorAml
        );

        // Replay same liquidation must revert
        vm.expectRevert();
        exitpoint.liquidateBlind(
            commitment,
            address(zen),
            collateralToSeize,
            address(usdcDebt),
            debtToRepay,
            vSocketAttestation,
            zkProof,
            liquidatorAml
        );
        vm.stopPrank();
    }
}
