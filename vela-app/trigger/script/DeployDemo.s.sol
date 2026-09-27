// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AegisPriceTrigger} from "../src/AegisPriceTrigger.sol";
import {DemoPriceFeed} from "../src/demo/DemoPriceFeed.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";
import {IProcessorEndpoint} from "vela/interfaces/IProcessorEndpoint.sol";
import {TokenAllowlist} from "vela/TokenAllowlist.sol";

/// @notice TESTNET demo: deploys aUSDC/tZEN demo tokens, the keeper-written price feed and
///         AegisPriceTrigger against an existing (self-operated) Vela deployment, and allowlists
///         both tokens. The broadcaster must hold ADMIN on the TokenAllowlist.
///
/// Env: PROCESSOR_ENDPOINT, TEE_AUTHENTICATOR, TOKEN_ALLOWLIST, KEEPER (price publisher),
///      optional MAX_PRICE_AGE (s, default 3600), ZEN_PRICE_E18 (initial ZEN/USD, default 10e18).
/// Output: deployments/<chainId>.json
contract DeployDemo is Script {
    bytes32 constant USDC_FEED = keccak256("USDCUSD");
    bytes32 constant ZEN_FEED = keccak256("ZENUSD");

    struct Deployed {
        address endpoint;
        address teeAuthenticator;
        address allowlist;
        address keeper;
        address usdc;
        address zen;
        address feed;
        address trigger;
    }

    function run() external {
        Deployed memory d;
        d.endpoint = vm.envAddress("PROCESSOR_ENDPOINT");
        d.teeAuthenticator = vm.envAddress("TEE_AUTHENTICATOR");
        d.allowlist = vm.envAddress("TOKEN_ALLOWLIST");
        d.keeper = vm.envAddress("KEEPER");

        vm.startBroadcast();
        (d.usdc, d.zen) = _deployTokens(d.allowlist);
        d.feed = _deployFeed(d.keeper);
        d.trigger = _deployTrigger(d);
        vm.stopBroadcast();

        _write(d);
    }

    function _feedIds() internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](2);
        ids[0] = USDC_FEED;
        ids[1] = ZEN_FEED;
    }

    function _deployTokens(address allowlist) internal returns (address usdc, address zen) {
        usdc = address(new DemoToken("Aegis Test USDC", "aUSDC", 6, 10_000e6, msg.sender));
        zen = address(new DemoToken("Aegis Test ZEN", "tZEN", 18, 1_000e18, msg.sender));
        TokenAllowlist(allowlist).addAllowedToken(usdc);
        TokenAllowlist(allowlist).addAllowedToken(zen);
    }

    /// The deployer seeds the first prices, then hands the feed to the keeper.
    function _deployFeed(address keeper) internal returns (address) {
        DemoPriceFeed feed = new DemoPriceFeed(msg.sender, msg.sender);
        int192[] memory prices = new int192[](2);
        prices[0] = 1e18;
        prices[1] = int192(int256(vm.envOr("ZEN_PRICE_E18", uint256(10e18))));
        feed.setPrices(_feedIds(), prices);
        feed.setKeeper(keeper);
        return address(feed);
    }

    function _deployTrigger(Deployed memory d) internal returns (address) {
        address[] memory tokens = new address[](2);
        tokens[0] = d.usdc;
        tokens[1] = d.zen;
        uint8[] memory decimals = new uint8[](2);
        decimals[0] = 18;
        decimals[1] = 18;
        return address(
            new AegisPriceTrigger(
                IProcessorEndpoint(d.endpoint),
                DemoPriceFeed(d.feed),
                tokens,
                _feedIds(),
                decimals,
                vm.envOr("MAX_PRICE_AGE", uint256(3600))
            )
        );
    }

    function _write(Deployed memory d) internal {
        string memory key = "demo";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "processorEndpoint", d.endpoint);
        vm.serializeAddress(key, "teeAuthenticator", d.teeAuthenticator);
        vm.serializeAddress(key, "tokenAllowlist", d.allowlist);
        vm.serializeAddress(key, "usdc", d.usdc);
        vm.serializeAddress(key, "zen", d.zen);
        vm.serializeAddress(key, "priceFeed", d.feed);
        vm.serializeAddress(key, "keeper", d.keeper);
        string memory json = vm.serializeAddress(key, "trigger", d.trigger);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Demo addresses written to", path);
    }
}
