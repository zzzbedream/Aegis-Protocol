// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../src/core/AegisVault.sol";
import "../src/core/AegisEntrypoint.sol";
import "../src/core/AegisExitpoint.sol";
import "../src/compliance/PureFiVerifier.sol";
import "../src/mocks/MockZEN.sol";
import "../src/mocks/MockZkVerify.sol";

contract InvariantsTest is TestBase {
    AegisVault internal vault;
    AegisEntrypoint internal entrypoint;
    AegisExitpoint internal exitpoint;
    PureFiVerifier internal verifier;
    MockZkVerify internal zkBridge;
    MockZEN internal zen;

    uint256 internal issuerPrivateKey = 0xA11CE;
    address internal issuerAddress;

    uint256 internal teePrivateKey = 0xB0B;
    address internal teeAddress;

    address internal institution = address(0x1001);

    function setUp() public {
        issuerAddress = vm.addr(issuerPrivateKey);
        teeAddress = vm.addr(teePrivateKey);

        zen = new MockZEN();
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

        zen.mint(institution, 10_000_000 * 10**18);
        vm.prank(institution);
        zen.approve(address(vault), type(uint256).max);
    }

    function _createPureFiPackage(
        address account,
        uint256 validUntil
    ) internal returns (IPureFiVerifier.PureFiPackage memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                account,
                uint256(43),
                uint256(10),
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
            ruleId: 43,
            riskScore: 10,
            validUntil: validUntil,
            payload: ""
        });
    }

    // Fuzz test deposit amount
    function testFuzz_DepositCollateral(uint256 amount, uint256 salt) public {
        // Bound deposit amount between 1 token and 1,000,000 tokens
        amount = 10**18 + (amount % (1_000_000 * 10**18));
        bytes32 commitment = keccak256(abi.encodePacked(institution, salt));

        IPureFiVerifier.PureFiPackage memory amlPkg = _createPureFiPackage(
            institution,
            block.timestamp + 3600
        );

        uint256 vaultBefore = vault.getTotalCollateral(address(zen));

        vm.prank(institution);
        entrypoint.depositConfidential(
            address(zen),
            amount,
            commitment,
            hex"cafe",
            amlPkg
        );

        uint256 vaultAfter = vault.getTotalCollateral(address(zen));

        // Invariant: Vault collateral increases by exact deposited amount
        assertEq(vaultAfter - vaultBefore, amount);
        assertTrue(entrypoint.isCommitmentActive(commitment));
    }
}
