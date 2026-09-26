use crate::crypto::attestation::EnclaveSigner;
use crate::crypto::decrypt::PayloadDecryptor;
use crate::engine::credit_state::{CreditPosition, CreditStateLedger};
use crate::engine::liquidation::BlindLiquidationEngine;
use crate::engine::oracle::PriceOracle;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "method", content = "params")]
pub enum VSocketRequest {
    GetEnclaveAddress,
    IngestDeposit {
        ciphertext: String,
        liquidation_threshold_bps: u64,
    },
    UpdateOracle {
        asset: String,
        price_usd_8_dec: u128,
    },
    EvaluateHealth {
        commitment: String,
    },
    RequestBlindLiquidation {
        commitment: String,
        chain_id: u64,
        exitpoint_address: String,
        timestamp: u64,
        nonce: u64,
    },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VSocketResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub error: Option<String>,
}

pub struct VSocketServer {
    signer: Arc<EnclaveSigner>,
    decryptor: Arc<PayloadDecryptor>,
    ledger: Arc<Mutex<CreditStateLedger>>,
    oracle: Arc<Mutex<PriceOracle>>,
}

impl VSocketServer {
    pub fn new(
        signer: EnclaveSigner,
        decryptor: PayloadDecryptor,
    ) -> Self {
        Self {
            signer: Arc::new(signer),
            decryptor: Arc::new(decryptor),
            ledger: Arc::new(Mutex::new(CreditStateLedger::new())),
            oracle: Arc::new(Mutex::new(PriceOracle::new())),
        }
    }

    pub fn handle_request(&self, request: VSocketRequest) -> VSocketResponse {
        match request {
            VSocketRequest::GetEnclaveAddress => {
                let addr = self.signer.ethereum_address();
                VSocketResponse {
                    success: true,
                    data: serde_json::json!({ "address": format!("0x{}", hex::encode(addr)) }),
                    error: None,
                }
            }
            VSocketRequest::IngestDeposit {
                ciphertext,
                liquidation_threshold_bps,
            } => {
                let raw_bytes = match hex::decode(ciphertext.trim_start_matches("0x")) {
                    Ok(b) => b,
                    Err(e) => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some(format!("Invalid hex ciphertext: {}", e)),
                        };
                    }
                };

                let decrypted = match self.decryptor.decrypt_payload(&raw_bytes) {
                    Ok(d) => d,
                    Err(e) => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some(format!("Decryption failed: {}", e)),
                        };
                    }
                };

                let commitment = crate::crypto::commitments::CommitmentScheme::compute_commitment(
                    &decrypted.institution_id,
                    &decrypted.salt,
                );

                let position = CreditPosition {
                    commitment,
                    institution_id: decrypted.institution_id,
                    collateral_asset: decrypted.collateral_asset,
                    collateral_amount: decrypted.collateral_amount,
                    debt_asset: decrypted.debt_asset,
                    debt_amount: decrypted.debt_amount,
                    liquidation_threshold_bps,
                    is_liquidated: false,
                };

                let mut ledger = self.ledger.lock().unwrap();
                ledger.insert_position(position);

                VSocketResponse {
                    success: true,
                    data: serde_json::json!({
                        "commitment": format!("0x{}", hex::encode(commitment)),
                        "status": "Position Ingested in Secure Enclave"
                    }),
                    error: None,
                }
            }
            VSocketRequest::UpdateOracle { asset, price_usd_8_dec } => {
                let mut oracle = self.oracle.lock().unwrap();
                oracle.set_price(&asset, price_usd_8_dec);
                VSocketResponse {
                    success: true,
                    data: serde_json::json!({ "status": "Price updated" }),
                    error: None,
                }
            }
            VSocketRequest::EvaluateHealth { commitment } => {
                let comm_bytes = match hex::decode(commitment.trim_start_matches("0x")) {
                    Ok(b) if b.len() == 32 => {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&b);
                        arr
                    }
                    _ => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some("Invalid commitment length".to_string()),
                        };
                    }
                };

                let ledger = self.ledger.lock().unwrap();
                let position = match ledger.get_position(&comm_bytes) {
                    Some(p) => p,
                    None => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some("Position not found in enclave".to_string()),
                        };
                    }
                };

                let oracle = self.oracle.lock().unwrap();
                match BlindLiquidationEngine::compute_health_factor(position, &oracle) {
                    Ok(hf) => VSocketResponse {
                        success: true,
                        data: serde_json::json!({
                            "commitment": commitment,
                            "health_factor": hf.to_string(),
                            "is_liquidatable": hf < 1_000_000_000_000_000_000u128
                        }),
                        error: None,
                    },
                    Err(e) => VSocketResponse {
                        success: false,
                        data: serde_json::Value::Null,
                        error: Some(e.to_string()),
                    },
                }
            }
            VSocketRequest::RequestBlindLiquidation {
                commitment,
                chain_id,
                exitpoint_address,
                timestamp,
                nonce,
            } => {
                let comm_bytes = match hex::decode(commitment.trim_start_matches("0x")) {
                    Ok(b) if b.len() == 32 => {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&b);
                        arr
                    }
                    _ => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some("Invalid commitment length".to_string()),
                        };
                    }
                };

                let exit_bytes = match hex::decode(exitpoint_address.trim_start_matches("0x")) {
                    Ok(b) if b.len() == 20 => {
                        let mut arr = [0u8; 20];
                        arr.copy_from_slice(&b);
                        arr
                    }
                    _ => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some("Invalid exitpoint address length".to_string()),
                        };
                    }
                };

                let mut ledger = self.ledger.lock().unwrap();
                let position = match ledger.get_position_mut(&comm_bytes) {
                    Some(p) => p,
                    None => {
                        return VSocketResponse {
                            success: false,
                            data: serde_json::Value::Null,
                            error: Some("Position not found in enclave".to_string()),
                        };
                    }
                };

                let oracle = self.oracle.lock().unwrap();
                match BlindLiquidationEngine::evaluate_and_generate_ticket(
                    position,
                    &oracle,
                    &self.signer,
                    chain_id,
                    &exit_bytes,
                    timestamp,
                    nonce,
                ) {
                    Ok(ticket) => {
                        position.is_liquidated = true;
                        VSocketResponse {
                            success: true,
                            data: serde_json::to_value(ticket).unwrap(),
                            error: None,
                        }
                    }
                    Err(e) => VSocketResponse {
                        success: false,
                        data: serde_json::Value::Null,
                        error: Some(e.to_string()),
                    },
                }
            }
        }
    }
}
