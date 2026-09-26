// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {AegisPriceTrigger} from "../src/AegisPriceTrigger.sol";
import {IStorkTemporalNumericValue, StorkStructs} from "../src/IStorkTemporalNumericValue.sol";
import {MockTriggerEndpoint} from "vela/mocks/MockTriggerEndpoint.sol";
import {TokenAllowlist} from "vela/TokenAllowlist.sol";
import {ITokenAllowlist} from "vela/interfaces/ITokenAllowlist.sol";
import {IProcessorEndpoint} from "vela/interfaces/IProcessorEndpoint.sol";
import {ITrigger} from "vela/interfaces/ITrigger.sol";
import {Structs} from "vela/Structs.sol";

contract MockStork is IStorkTemporalNumericValue {
    mapping(bytes32 => StorkStructs.TemporalNumericValue) public values;

    error NotFound();

    function set(bytes32 id, uint64 tsSeconds, int192 value) external {
        values[id] = StorkStructs.TemporalNumericValue(tsSeconds * 1e9, value);
    }

    function getTemporalNumericValueV1(bytes32 id) external view returns (StorkStructs.TemporalNumericValue memory) {
        StorkStructs.TemporalNumericValue memory v = values[id];
        if (v.timestampNs == 0) revert NotFound();
        return v;
    }
}

contract AegisPriceTriggerTest is Test {
    address constant USDC = address(0xC1);
    address constant ZEN = address(0xA1);
    bytes32 constant USDC_FEED = keccak256("USDCUSD");
    bytes32 constant ZEN_FEED = keccak256("ZENUSD");

    MockStork stork;
    MockTriggerEndpoint endpoint;
    AegisPriceTrigger trigger;

    function setUp() public {
        vm.warp(1_700_000_000);
        stork = new MockStork();
        endpoint = new MockTriggerEndpoint(ITokenAllowlist(address(new TokenAllowlist(address(this)))));
        trigger = _deploy(_u8s(18, 18), 600);
        stork.set(USDC_FEED, uint64(block.timestamp - 10), 1e18); // $1.00
        stork.set(ZEN_FEED, uint64(block.timestamp - 5), 10.5e18); // $10.50
    }

    function _deploy(uint8[] memory decimals, uint256 maxAge) internal returns (AegisPriceTrigger) {
        address[] memory tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = ZEN;
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = USDC_FEED;
        ids[1] = ZEN_FEED;
        return new AegisPriceTrigger(IProcessorEndpoint(address(endpoint)), stork, tokens, ids, decimals, maxAge);
    }

    function _u8s(uint8 a, uint8 b) internal pure returns (uint8[] memory r) {
        r = new uint8[](2);
        r[0] = a;
        r[1] = b;
    }

    function _events(bytes32 subType) internal pure returns (Structs.EventData memory d) {
        d.events = new bytes[](1);
        d.subTypes = new bytes32[](1);
        d.subTypes[0] = subType;
    }

    function _call(AegisPriceTrigger t, Structs.EventData memory d) internal returns (bytes memory) {
        Structs.TokenAndAmount[] memory none = new Structs.TokenAndAmount[](0);
        return endpoint.callGetTrustProcessPayload(ITrigger(address(t)), d, true, true, none, none);
    }

    function test_PriceRequestProducesPayloadForGuest() public {
        bytes memory payload = _call(trigger, _events(bytes32("AEGIS.PRICE_REQUEST")));
        (uint256 ts, address[] memory tokens, uint256[] memory prices) =
            abi.decode(payload, (uint256, address[], uint256[]));
        assertEq(ts, block.timestamp);
        assertEq(tokens.length, 2);
        assertEq(tokens[0], USDC);
        assertEq(tokens[1], ZEN);
        assertEq(prices[0], 1e18);
        assertEq(prices[1], 10.5e18);
        // Cross-language vector: decoded by vela-app/lending (TestDecodeTriggerVector).
        console2.logBytes(payload);
    }

    function test_NoPriceRequestReturnsEmpty() public {
        assertEq(_call(trigger, _events(bytes32("AEGIS.SOLVENCY"))).length, 0);
        // A TRUSTPROCESS emits no AppEvents: the trigger must return "" so the loop terminates.
        Structs.EventData memory empty;
        assertEq(_call(trigger, empty).length, 0);
    }

    function test_DecimalsNormalization() public {
        AegisPriceTrigger t = _deploy(_u8s(8, 24), 600);
        stork.set(USDC_FEED, uint64(block.timestamp), 1e8); // 8 decimals
        stork.set(ZEN_FEED, uint64(block.timestamp), 10.5e24); // 24 decimals
        (,, uint256[] memory prices) = abi.decode(t.buildPricePayload(), (uint256, address[], uint256[]));
        assertEq(prices[0], 1e18);
        assertEq(prices[1], 10.5e18);
    }

    function test_RevertOnStalePrice() public {
        stork.set(ZEN_FEED, uint64(block.timestamp - 601), 10e18);
        vm.expectRevert(abi.encodeWithSelector(AegisPriceTrigger.StalePrice.selector, ZEN_FEED));
        trigger.buildPricePayload();
    }

    function test_RevertOnNonPositivePrice() public {
        stork.set(ZEN_FEED, uint64(block.timestamp), 0);
        vm.expectRevert(abi.encodeWithSelector(AegisPriceTrigger.NonPositivePrice.selector, ZEN_FEED));
        trigger.buildPricePayload();
        stork.set(ZEN_FEED, uint64(block.timestamp), -1);
        vm.expectRevert(abi.encodeWithSelector(AegisPriceTrigger.NonPositivePrice.selector, ZEN_FEED));
        trigger.buildPricePayload();
    }

    function test_RevertOnFuturePrice() public {
        stork.set(ZEN_FEED, uint64(block.timestamp + 1), 10e18);
        vm.expectRevert(abi.encodeWithSelector(AegisPriceTrigger.FuturePrice.selector, ZEN_FEED));
        trigger.buildPricePayload();
    }

    function test_OnlyProcessorEndpoint() public {
        Structs.TokenAndAmount[] memory none = new Structs.TokenAndAmount[](0);
        vm.expectRevert(ITrigger.NotProcessorEndpoint.selector);
        trigger.getTrustProcessPayload(_events(bytes32("AEGIS.PRICE_REQUEST")), true, true, none, none);
        vm.expectRevert(ITrigger.NotProcessorEndpoint.selector);
        trigger.execute(_events(bytes32("AEGIS.PRICE_REQUEST")));
    }

    function test_ConstructorValidation() public {
        address[] memory tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = USDC; // duplicate
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = USDC_FEED;
        ids[1] = ZEN_FEED;
        IProcessorEndpoint ep = IProcessorEndpoint(address(endpoint));
        vm.expectRevert(AegisPriceTrigger.InvalidConfig.selector);
        new AegisPriceTrigger(ep, stork, tokens, ids, _u8s(18, 18), 600);
        tokens[1] = ZEN;
        vm.expectRevert(AegisPriceTrigger.InvalidConfig.selector);
        new AegisPriceTrigger(ep, stork, tokens, ids, _u8s(18, 37), 600);
        vm.expectRevert(AegisPriceTrigger.InvalidConfig.selector);
        new AegisPriceTrigger(ep, stork, tokens, ids, _u8s(18, 18), 0);
        vm.expectRevert(AegisPriceTrigger.InvalidConfig.selector);
        new AegisPriceTrigger(ep, IStorkTemporalNumericValue(address(0)), tokens, ids, _u8s(18, 18), 600);
    }

    function testFuzz_NormalizationNeverZeroForPositive(int192 value, uint8 decimals) public {
        decimals = uint8(bound(decimals, 0, 36));
        value = int192(bound(value, 1, int256(1e40)));
        AegisPriceTrigger t = _deploy(_u8s(decimals, 18), 600);
        stork.set(USDC_FEED, uint64(block.timestamp), value);
        uint256 raw = uint256(int256(value));
        if (decimals > 18 && raw < 10 ** (decimals - 18)) {
            vm.expectRevert(abi.encodeWithSelector(AegisPriceTrigger.NonPositivePrice.selector, USDC_FEED));
            t.buildPricePayload();
            return;
        }
        (,, uint256[] memory prices) = abi.decode(t.buildPricePayload(), (uint256, address[], uint256[]));
        assertGt(prices[0], 0);
    }
}
