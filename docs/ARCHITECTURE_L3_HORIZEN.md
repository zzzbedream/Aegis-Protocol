# Horizen L3 Architecture & Aegis Protocol

## 1. Overview
Aegis Protocol is deployed on Horizen Chain, an EVM-compatible Layer 3 (L3) rollup built on top of Base using the OP Stack. Horizen's modular architecture separates public execution, privacy-preserving computation, and zero-knowledge verification across distinct layers.

## 2. Infrastructure Components

### 2.1 Base Layer (L2 - Base)
- **Settlement & Data Availability**: Anchors the Horizen L3 rollup state roots and dispute resolution.
- **Liquidity Bridge**: Facilitates asset transfers (including ZEN as a LayerZero Omnichain Fungible Token - OFT) between Base and Horizen L3.

### 2.2 Horizen Layer 3 Rollup
- **Execution Environment**: EVM-equivalent rollup optimized for institutional throughput and low gas latency.
- **Smart Contract Layer**:
  - `AegisEntrypoint`: Accepts deposits, enforces PureFi AML screening, and registers blind account commitments.
  - `AegisVault`: Multi-asset custody locking ZEN, ERC-20, and ERC-7943 compliant RWA tokens.
  - `AegisExitpoint`: Verifies cryptographic attestations from the TEE and state aggregation proofs from zkVerify to process blind liquidations and withdrawals.

### 2.3 Vela Coprocessor (AWS Nitro Enclaves & WASM)
- **Trusted Execution Environment (TEE)**:
  - Executes the Aegis confidential credit engine in a cryptographically isolated environment.
  - Generates signed hardware-rooted attestations and ECDSA signatures via V-Socket RPC.
  - Evaluates institutional health factors in-memory without exposing loan values, collateral ratios, or borrower identities to public RPC nodes or block explorers.

### 2.4 zkVerify Integration
- **Proof Aggregation & Merkle Verification**:
  - zkVerify aggregates zero-knowledge proofs off-chain, drastically reducing on-chain verification costs.
  - `AegisExitpoint` invokes `verifyProofAggregation` to validate Merkle state roots posted by the enclave before executing state transitions.

## 3. Blind Liquidation Mechanism
1. **Confidential Position Ingestion**: Institutional deposits create an on-chain commitment $C = H(\text{InstitutionalID}, \text{Salt})$ and emit an encrypted state payload accessible only by the enclave's public key.
2. **Off-Chain Health Evaluation**: The enclave monitors market prices from trusted oracle feeds. When $HF = \frac{\text{Collateral Value} \times \text{Liquidation Threshold}}{\text{Debt Value}} < 1.0$, the account is marked liquidatable.
3. **Blind Ticket Generation**: The TEE signs a liquidation authorization ticket:
   $$\sigma_{\text{enclave}} = \text{Sign}_{sk}(\text{Commitment}, \text{SeizableCollateral}, \text{RequiredDebtRepayment}, \text{Timestamp})$$
4. **Public Settlement Without Identity Leak**: Any institutional liquidator submits $\sigma_{\text{enclave}}$ to `AegisExitpoint.liquidateBlind()`. The contract transfers the seized collateral to the liquidator and burns the corresponding debt against the vault, without ever revealing the borrower's wallet address.
