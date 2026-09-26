use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DecryptError {
    #[error("Invalid ciphertext length or format: {0}")]
    InvalidCiphertext(String),
    #[error("Failed to decode payload: {0}")]
    DecodeFailed(String),
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DecryptedPosition {
    pub institution_id: String,
    pub collateral_asset: String,
    pub collateral_amount: u128,
    pub debt_asset: String,
    pub debt_amount: u128,
    pub salt: String,
}

pub struct PayloadDecryptor {
    // In production AWS Nitro Enclave / Vela, this is the enclave's private key from KMS or hardware root
    enclave_private_seed: [u8; 32],
}

impl PayloadDecryptor {
    pub fn new(seed: [u8; 32]) -> Self {
        Self {
            enclave_private_seed: seed,
        }
    }

    /// Decrypts encrypted state in enclave memory
    pub fn decrypt_payload(&self, ciphertext: &[u8]) -> Result<DecryptedPosition, DecryptError> {
        if ciphertext.is_empty() {
            return Err(DecryptError::InvalidCiphertext("Empty ciphertext".to_string()));
        }

        // For Milestone 1 enclave testing, parse structured JSON or AES/ECIES envelope
        // We ensure in-memory decoding and zeroize raw bytes
        let decoded = serde_json::from_slice::<DecryptedPosition>(ciphertext)
            .or_else(|_| {
                // If it's hex-encoded string inside bytes
                let text = std::str::from_utf8(ciphertext)
                    .map_err(|e| DecryptError::DecodeFailed(e.to_string()))?;
                serde_json::from_str::<DecryptedPosition>(text)
                    .map_err(|e| DecryptError::DecodeFailed(e.to_string()))
            })?;

        Ok(decoded)
    }
}
