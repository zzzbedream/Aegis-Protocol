// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @notice Minimal subset of the Stork EVM interface used by Aegis.
/// @dev Mirrors @storknetwork/stork-evm-sdk 1.0.5 (IStork.sol / StorkStructs.sol, Apache-2.0).
///      Deployed at 0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62 on Horizen mainnet/testnet and
///      0x647DFd812BC1e116c6992CB2bC353b2112176fD6 on Base / Base Sepolia (Stork docs).
library StorkStructs {
    struct TemporalNumericValue {
        /// Nanosecond timestamp of the latest publisher update.
        uint64 timestampNs;
        int192 quantizedValue;
    }
}

interface IStorkTemporalNumericValue {
    /// Reverts with StaleValue if the value is older than Stork's configured threshold.
    function getTemporalNumericValueV1(bytes32 id)
        external
        view
        returns (StorkStructs.TemporalNumericValue memory value);
}
