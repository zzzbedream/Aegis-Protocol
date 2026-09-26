// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DemoPriceFeed} from "../src/demo/DemoPriceFeed.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";
import {AegisPriceTrigger} from "../src/AegisPriceTrigger.sol";
import {StorkStructs} from "../src/IStorkTemporalNumericValue.sol";
import {MockTriggerEndpoint} from "vela/mocks/MockTriggerEndpoint.sol";
import {TokenAllowlist} from "vela/TokenAllowlist.sol";
import {ITokenAllowlist} from "vela/interfaces/ITokenAllowlist.sol";
import {IProcessorEndpoint} from "vela/interfaces/IProcessorEndpoint.sol";
import {ITrigger} from "vela/interfaces/ITrigger.sol";
import {Structs} from "vela/Structs.sol";

contract DemoPriceFeedTest is Test {
    bytes32 constant ZEN_FEED = keccak256("ZENUSD");
    bytes32 constant USDC_FEED = keccak256("USDCUSD");
    address keeper = address(0xBEEF);
    DemoPriceFeed feed;

    function setUp() public {
        vm.warp(1_700_000_000);
        feed = new DemoPriceFeed(address(this), keeper);
    }

    function _pair(int192 usdc, int192 zen) internal pure returns (bytes32[] memory ids, int192[] memory values) {
        ids = new bytes32[](2);
        ids[0] = USDC_FEED;
        ids[1] = ZEN_FEED;
        values = new int192[](2);
        values[0] = usdc;
        values[1] = zen;
    }

    function test_KeeperPublishesPricesStampedWithBlockTime() public {
        (bytes32[] memory ids, int192[] memory values) = _pair(1e18, 10.5e18);
        vm.prank(keeper);
        feed.setPrices(ids, values);

        StorkStructs.TemporalNumericValue memory v = feed.getTemporalNumericValueV1(ZEN_FEED);
        assertEq(v.quantizedValue, 10.5e18);
        assertEq(v.timestampNs, uint64(block.timestamp) * 1e9);
    }

    function test_RevertWhen_NotKeeper() public {
        (bytes32[] memory ids, int192[] memory values) = _pair(1e18, 10e18);
        vm.prank(address(0xBAD));
        vm.expectRevert(DemoPriceFeed.NotKeeper.selector);
        feed.setPrices(ids, values);
    }

    function test_RevertWhen_NonPositiveOrMismatched() public {
        (bytes32[] memory ids, int192[] memory values) = _pair(1e18, 0);
        vm.startPrank(keeper);
        vm.expectRevert(DemoPriceFeed.InvalidPrice.selector);
        feed.setPrices(ids, values);

        int192[] memory one = new int192[](1);
        one[0] = 1e18;
        vm.expectRevert(DemoPriceFeed.LengthMismatch.selector);
        feed.setPrices(ids, one);
        vm.stopPrank();
    }

    function test_RevertWhen_UnknownFeed() public {
        vm.expectRevert(DemoPriceFeed.NotFound.selector);
        feed.getTemporalNumericValueV1(ZEN_FEED);
    }

    function test_OnlyOwnerRotatesKeeper() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        feed.setKeeper(address(1));

        feed.setKeeper(address(0xCAFE));
        assertEq(feed.keeper(), address(0xCAFE));
    }

    /// The demo feed is a drop-in replacement for Stork: the real trigger consumes it unchanged.
    function test_AegisTriggerReadsDemoFeed() public {
        MockTriggerEndpoint endpoint =
            new MockTriggerEndpoint(ITokenAllowlist(address(new TokenAllowlist(address(this)))));
        address[] memory tokens = new address[](2);
        tokens[0] = address(0xC1);
        tokens[1] = address(0xA1);
        (bytes32[] memory ids, int192[] memory values) = _pair(1e18, 10e18);
        uint8[] memory decimals = new uint8[](2);
        decimals[0] = 18;
        decimals[1] = 18;
        AegisPriceTrigger trigger =
            new AegisPriceTrigger(IProcessorEndpoint(address(endpoint)), feed, tokens, ids, decimals, 3600);
        vm.prank(keeper);
        feed.setPrices(ids, values);

        Structs.EventData memory d;
        d.events = new bytes[](1);
        d.subTypes = new bytes32[](1);
        d.subTypes[0] = trigger.PRICE_REQUEST();
        Structs.TokenAndAmount[] memory none = new Structs.TokenAndAmount[](0);
        bytes memory payload = endpoint.callGetTrustProcessPayload(ITrigger(address(trigger)), d, true, true, none, none);

        (uint256 ts,, uint256[] memory prices) = abi.decode(payload, (uint256, address[], uint256[]));
        assertEq(ts, block.timestamp);
        assertEq(prices[1], 10e18);
    }
}

contract DemoTokenTest is Test {
    DemoToken token;
    address alice = address(0xA11CE);

    function setUp() public {
        vm.warp(1_700_000_000);
        token = new DemoToken("Aegis Test USDC", "aUSDC", 6, 10_000e6, address(this));
    }

    function test_FaucetMintsFixedAmountWithCooldown() public {
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 10_000e6);
        assertEq(token.decimals(), 6);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DemoToken.FaucetCooldown.selector, block.timestamp + 1 days));
        token.faucet();

        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 20_000e6);
    }

    function test_OnlyOwnerMintsArbitraryAmounts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1);

        token.mint(alice, 5e6);
        assertEq(token.balanceOf(alice), 5e6);
    }
}
