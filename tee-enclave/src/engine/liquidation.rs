use crate::crypto::attestation::EnclaveSigner;
use crate::engine::credit_state::CreditPosition;
use crate::engine::oracle::PriceOracle;
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LiquidationError {
    #[error("Oracle price missing for asset: {0}")]
    OracleMissing(String),
    #[error("Position is healthy (Health Factor >= 1.0)")]
    PositionHealthy,
    #[error("Position is already liquidated")]
    AlreadyLiquidated,
    #[error("Signing failed: {0}")]
    SigningFailed(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LiquidationTicket {
    pub commitment: String,
    pub collateral_asset: String,
    pub collateral_amount: String,
    pub debt_asset: String,
    pub debt_amount: String,
    pub health_factor: String,
    pub timestamp: u64,
    pub nonce: u64,
    pub signature_hex: String,
    pub zk_aggregation_id: String,
}

pub struct BlindLiquidationEngine;

impl BlindLiquidationEngine {
    /// Computes Health Factor scaled by 1e18:
    /// HF = (Collateral Value * Threshold) / Debt Value
    /// An HF < 1e18 is liquidatable.
    pub fn compute_health_factor(
        position: &CreditPosition,
        oracle: &PriceOracle,
    ) -> Result<u128, LiquidationError> {
        if position.debt_amount == 0 {
            return Ok(u128::MAX); // Infinite health if no debt
        }

        let collateral_val = oracle
            .compute_value_usd(&position.collateral_asset, position.collateral_amount)
            .ok_or_else(|| LiquidationError::OracleMissing(position.collateral_asset.clone()))?;

        let debt_val = oracle
            .compute_value_usd(&position.debt_asset, position.debt_amount)
            .ok_or_else(|| LiquidationError::OracleMissing(position.debt_asset.clone()))?;

        if debt_val == 0 {
            return Ok(u128::MAX);
        }

        // Adjusted collateral = collateral_val * threshold_bps / 10000
        let adjusted_collateral = (collateral_val.saturating_mul(position.liquidation_threshold_bps as u128)) / 10000;

        // HF = (adjusted_collateral * 1e18) / debt_val
        let hf = (adjusted_collateral.saturating_mul(1_000_000_000_000_000_000)) / debt_val;
        Ok(hf)
    }

    /// Evaluates if a position is liquidatable and generates a blind ticket signed by the TEE
    pub fn evaluate_and_generate_ticket(
        position: &CreditPosition,
        oracle: &PriceOracle,
        signer: &EnclaveSigner,
        chain_id: u64,
        exitpoint_addr_bytes: &[u8; 20],
        timestamp: u64,
        nonce: u64,
    ) -> Result<LiquidationTicket, LiquidationError> {
        if position.is_liquidated {
            return Err(LiquidationError::AlreadyLiquidated);
        }

        let hf = Self::compute_health_factor(position, oracle)?;
        let wad = 1_000_000_000_000_000_000u128; // 1.0 in 18 decimals

        if hf >= wad {
            return Err(LiquidationError::PositionHealthy);
        }

        // Parse hex addresses for collateral and debt
        let collat_addr = hex::decode(position.collateral_asset.trim_start_matches("0x"))
            .unwrap_or_else(|_| vec![0u8; 20]);
        let debt_addr = hex::decode(position.debt_asset.trim_start_matches("0x"))
            .unwrap_or_else(|_| vec![0u8; 20]);

        // Construct exact ABI encoding matching AegisExitpoint.sol:
        // abi.encode(commitment, collateralAsset, collateralAmount, debtAsset, debtAmount, healthFactor, timestamp, nonce, chainId, exitpoint)
        let mut encoded = Vec::with_capacity(320);
        // commitment (32 bytes)
        encoded.extend_from_slice(&position.commitment);
        // collateralAsset (address left-padded to 32 bytes)
        let mut collat_pad = [0u8; 32];
        if collat_addr.len() == 20 {
            collat_pad[12..32].copy_from_slice(&collat_addr);
        }
        encoded.extend_from_slice(&collat_pad);
        // collateralAmount (uint256)
        let mut collat_amt_pad = [0u8; 32];
        collat_amt_pad[16..32].copy_from_slice(&position.collateral_amount.to_be_bytes());
        encoded.extend_from_slice(&collat_amt_pad);
        // debtAsset (address left-padded to 32 bytes)
        let mut debt_pad = [0u8; 32];
        if debt_addr.len() == 20 {
            debt_pad[12..32].copy_from_slice(&debt_addr);
        }
        encoded.extend_from_slice(&debt_pad);
        // debtAmount (uint256)
        let mut debt_amt_pad = [0u8; 32];
        debt_amt_pad[16..32].copy_from_slice(&position.debt_amount.to_be_bytes());
        encoded.extend_from_slice(&debt_amt_pad);
        // healthFactor (uint256)
        let mut hf_pad = [0u8; 32];
        hf_pad[16..32].copy_from_slice(&hf.to_be_bytes());
        encoded.extend_from_slice(&hf_pad);
        // timestamp (uint256)
        let mut ts_pad = [0u8; 32];
        ts_pad[24..32].copy_from_slice(&timestamp.to_be_bytes());
        encoded.extend_from_slice(&ts_pad);
        // nonce (uint256)
        let mut nonce_pad = [0u8; 32];
        nonce_pad[24..32].copy_from_slice(&nonce.to_be_bytes());
        encoded.extend_from_slice(&nonce_pad);
        // chainId (uint256)
        let mut chain_pad = [0u8; 32];
        chain_pad[24..32].copy_from_slice(&chain_id.to_be_bytes());
        encoded.extend_from_slice(&chain_pad);
        // exitpoint (address left-padded to 32 bytes)
        let mut exit_pad = [0u8; 32];
        exit_pad[12..32].copy_from_slice(exitpoint_addr_bytes);
        encoded.extend_from_slice(&exit_pad);

        let mut hasher = Keccak256::new();
        hasher.update(&encoded);
        let message_hash: [u8; 32] = hasher.finalize().into();

        let sig = signer
            .sign_ethereum_message(&message_hash)
            .map_err(|e| LiquidationError::SigningFailed(e.to_string()))?;

        // Compute zk aggregation ID
        let mut agg_hasher = Keccak256::new();
        agg_hasher.update(&position.commitment);
        agg_hasher.update(&nonce.to_be_bytes());
        let agg_id: [u8; 32] = agg_hasher.finalize().into();

        Ok(LiquidationTicket {
            commitment: format!("0x{}", hex::encode(position.commitment)),
            collateral_asset: position.collateral_asset.clone(),
            collateral_amount: position.collateral_amount.to_string(),
            debt_asset: position.debt_asset.clone(),
            debt_amount: position.debt_amount.to_string(),
            health_factor: hf.to_string(),
            timestamp,
            nonce,
            signature_hex: format!("0x{}", hex::encode(sig)),
            zk_aggregation_id: format!("0x{}", hex::encode(agg_id)),
        })
    }
}
