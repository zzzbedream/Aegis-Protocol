# ERC-7943 Standard Compliance for Institutional Real World Assets (RWA)

## 1. Abstract
The ERC-7943 standard establishes a unified, programmable interface for compliant Real World Asset (RWA) tokenization on EVM-compatible blockchains. Aegis Protocol implements ERC-7943 to support tokenized institutional credit lines, sovereign bonds, and private debt instruments as eligible collateral.

## 2. Core Specifications & Methods

### 2.1 Partitioned Token Architecture
ERC-7943 separates token supplies into deterministic partitions (e.g., restricted collateral, free liquidity, locked margin):
- `balanceOfByPartition(bytes32 partition, address tokenHolder) -> uint256`
- `partitionsOf(address tokenHolder) -> bytes32[]`
- `transferByPartition(bytes32 partition, address to, uint256 value, bytes data) -> bytes32`

### 2.2 Compliance & Identity Verification
Transfers must pass automated compliance rule engines before execution:
- `canTransfer(address to, uint256 value, bytes data) -> (bool, byte, bytes32)`
- `canTransferByPartition(bytes32 partition, address to, uint256 value, bytes data) -> (bool, byte, bytes32)`

### 2.3 Document & Regulatory Metadata
Institutional assets require cryptographically verifiable attachments:
- `setDocument(bytes32 name, string uri, bytes32 documentHash)`
- `getDocument(bytes32 name) -> (string, bytes32, uint256)`

## 3. Aegis Protocol Integration
1. **Collateral Partitioning**: When an institution deposits an ERC-7943 token into `AegisEntrypoint`, the tokens are transferred to `AegisVault` under the designated `COLLATERAL_PARTITION = keccak256("AEGIS.COLLATERAL.PARTITION")`.
2. **Transfer Authorization**: The vault verifies that `canTransferByPartition` returns success, ensuring that institutional regulatory holds, KYC validations, and jurisdiction limits are satisfied natively.
3. **Blind Liquidation Execution**: During a blind liquidation, `AegisExitpoint` invokes `transferByPartition` to deliver seized RWA tokens to the liquidator under an authorized `LIQUIDATED_PARTITION`.
