// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStorkTemporalNumericValue, StorkStructs} from "../IStorkTemporalNumericValue.sol";

/// @title DemoPriceFeed
/// @notice TESTNET ONLY. Stork-compatible price feed written by a single keeper, used while Stork has
///         no ZEN feed. `AegisPriceTrigger` reads it unchanged; switching to Stork is a constructor
///         argument. Values are USD with 18 decimals, stamped with the block time of the update.
contract DemoPriceFeed is IStorkTemporalNumericValue, Ownable {
    mapping(bytes32 => StorkStructs.TemporalNumericValue) private values;
    address public keeper;

    event KeeperChanged(address indexed keeper);
    event PricesUpdated(bytes32[] ids, int192[] values);

    error NotKeeper();
    error NotFound();
    error InvalidPrice();
    error LengthMismatch();

    constructor(address owner_, address keeper_) Ownable(owner_) {
        keeper = keeper_;
        emit KeeperChanged(keeper_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperChanged(keeper_);
    }

    /// @notice Updates every given feed atomically (the trigger requires all market tokens to be fresh).
    function setPrices(bytes32[] calldata ids, int192[] calldata newValues) external {
        if (msg.sender != keeper) revert NotKeeper();
        if (ids.length != newValues.length) revert LengthMismatch();
        uint64 tsNs = uint64(block.timestamp) * 1e9;
        for (uint256 i; i < ids.length; ++i) {
            if (newValues[i] <= 0) revert InvalidPrice();
            values[ids[i]] = StorkStructs.TemporalNumericValue(tsNs, newValues[i]);
        }
        emit PricesUpdated(ids, newValues);
    }

    function getTemporalNumericValueV1(bytes32 id) external view returns (StorkStructs.TemporalNumericValue memory v) {
        v = values[id];
        if (v.timestampNs == 0) revert NotFound();
    }
}
