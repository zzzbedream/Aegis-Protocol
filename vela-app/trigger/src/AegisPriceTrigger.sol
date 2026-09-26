// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AbstractTrigger} from "vela/trigger/AbstractTrigger.sol";
import {IProcessorEndpoint} from "vela/interfaces/IProcessorEndpoint.sol";
import {Structs} from "vela/Structs.sol";
import {IStorkTemporalNumericValue, StorkStructs} from "./IStorkTemporalNumericValue.sol";

/// @title AegisPriceTrigger
/// @notice Vela trigger that feeds Stork prices into the Aegis lending guest.
/// @dev Flow: the guest's `poke` request emits an AppEvent with subtype
///      bytes32("AEGIS.PRICE_REQUEST"). When the ProcessorEndpoint finalizes that request it calls
///      getTrustProcessPayload on this trigger, which reads Stork and returns
///          abi.encode(uint256 timestamp, address[] tokens, uint256[] prices)
///      (USD, 18 decimals per whole token). The endpoint enqueues it as a TRUSTPROCESS request,
///      decoded by vela-app/lending/abi.go. The guest's trusted path emits no AppEvents, so the
///      trigger then returns "" and the loop terminates (vela-starterkit docs/4_trigger-contract-app.md).
///
///      Every configured token is priced in every payload (the guest rejects partial updates).
///      Any stale, non-positive or unreadable price makes this call revert; the endpoint runs it in
///      an isolated try/catch, so a failure only means "no price update", never a stuck request.
///      The payload timestamp is block.timestamp: it is the guest's clock for interest accrual and
///      AML freshness, while price freshness is enforced here through maxPriceAge.
contract AegisPriceTrigger is AbstractTrigger {
    bytes32 public constant PRICE_REQUEST = bytes32("AEGIS.PRICE_REQUEST");
    uint256 public constant MAX_FEEDS = 32; // matches lending.MaxPriceUpdates

    IStorkTemporalNumericValue public immutable stork;
    uint256 public immutable maxPriceAge;

    address[] private _tokens;
    bytes32[] private _feedIds;
    uint8[] private _feedDecimals;

    error InvalidConfig();
    error StalePrice(bytes32 feedId);
    error NonPositivePrice(bytes32 feedId);
    error FuturePrice(bytes32 feedId);

    /// @param endpoint Vela ProcessorEndpoint the app is deployed on.
    /// @param stork_ Stork contract on the same chain.
    /// @param tokens Debt token and every collateral token of the market (order is irrelevant).
    /// @param feedIds Stork encoded asset ids, e.g. keccak256("ETHUSD"), one per token.
    /// @param feedDecimals Decimals of each feed's quantizedValue (normalized to 18).
    /// @param maxPriceAge_ Maximum accepted age of a Stork value, in seconds.
    constructor(
        IProcessorEndpoint endpoint,
        IStorkTemporalNumericValue stork_,
        address[] memory tokens,
        bytes32[] memory feedIds,
        uint8[] memory feedDecimals,
        uint256 maxPriceAge_
    ) AbstractTrigger(endpoint) {
        uint256 n = tokens.length;
        if (
            address(stork_) == address(0) || n == 0 || n > MAX_FEEDS || feedIds.length != n
                || feedDecimals.length != n || maxPriceAge_ == 0
        ) revert InvalidConfig();
        for (uint256 i; i < n; ++i) {
            if (tokens[i] == address(0) || feedIds[i] == bytes32(0) || feedDecimals[i] > 36) revert InvalidConfig();
            for (uint256 j; j < i; ++j) {
                if (tokens[j] == tokens[i]) revert InvalidConfig();
            }
        }
        stork = stork_;
        maxPriceAge = maxPriceAge_;
        _tokens = tokens;
        _feedIds = feedIds;
        _feedDecimals = feedDecimals;
    }

    function feeds() external view returns (address[] memory, bytes32[] memory, uint8[] memory) {
        return (_tokens, _feedIds, _feedDecimals);
    }

    /// @dev The trigger never moves funds: the guest does not route withdrawals to it.
    function _execute(Structs.EventData calldata) internal override {}

    function _getTrustProcessPayload(
        Structs.EventData calldata appEventData,
        bool,
        bool,
        Structs.TokenAndAmount[] calldata,
        Structs.TokenAndAmount[] calldata
    ) internal view override returns (bytes memory) {
        if (!_requestsPrices(appEventData)) return "";
        return buildPricePayload();
    }

    /// @notice Current price payload, exactly as it would be sent to the guest.
    function buildPricePayload() public view returns (bytes memory) {
        uint256 n = _tokens.length;
        uint256[] memory prices = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            prices[i] = _readPrice(_feedIds[i], _feedDecimals[i]);
        }
        return abi.encode(block.timestamp, _tokens, prices);
    }

    function _requestsPrices(Structs.EventData calldata appEventData) private pure returns (bool) {
        bytes32[] calldata subTypes = appEventData.subTypes;
        for (uint256 i; i < subTypes.length; ++i) {
            if (subTypes[i] == PRICE_REQUEST) return true;
        }
        return false;
    }

    function _readPrice(bytes32 feedId, uint8 decimals) private view returns (uint256) {
        StorkStructs.TemporalNumericValue memory v = stork.getTemporalNumericValueV1(feedId);
        if (v.quantizedValue <= 0) revert NonPositivePrice(feedId);
        uint256 ts = uint256(v.timestampNs) / 1e9;
        if (ts > block.timestamp) revert FuturePrice(feedId);
        if (block.timestamp - ts > maxPriceAge) revert StalePrice(feedId);
        uint256 raw = uint256(int256(v.quantizedValue));
        if (decimals == 18) return raw;
        if (decimals < 18) return raw * 10 ** (18 - decimals);
        uint256 scaled = raw / 10 ** (decimals - 18);
        if (scaled == 0) revert NonPositivePrice(feedId);
        return scaled;
    }
}
